import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../..", import.meta.url));
const nextBin = fileURLToPath(new URL("../../node_modules/next/dist/bin/next", import.meta.url));
const startupTimeoutMs = Number(process.env.TEST_STARTUP_TIMEOUT_MS ?? 60_000);

// A fixed port silently attaches the test to whatever else is already
// listening, so let the OS hand out an unused one.
async function findFreePort() {
  const probe = createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const { port } = probe.address();
  await new Promise((resolve, reject) => {
    probe.close((error) => (error ? reject(error) : resolve()));
  });
  return port;
}

// `next start` prints a ready line, but polling the port is version independent
// and also catches a server that starts and then fails the first request.
async function waitForReady(server, baseUrl, readOutput) {
  const deadline = Date.now() + startupTimeoutMs;

  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`next start exited early with code ${server.exitCode}:\n${readOutput()}`);
    }

    try {
      const response = await fetch(baseUrl, { headers: { accept: "text/html" } });
      if (response.status < 500) return;
    } catch {
      // Not accepting connections yet.
    }

    await delay(250);
  }

  throw new Error(`next start was not ready within ${startupTimeoutMs}ms:\n${readOutput()}`);
}

/**
 * Boots the production server and resolves once it answers requests.
 *
 * Returns `stop()` rather than killing on process exit so a failing test still
 * reports its assertion instead of a stray "server left running" error.
 */
export async function startServer() {
  const port = Number(process.env.TEST_PORT ?? (await findFreePort()));
  const baseUrl = `http://127.0.0.1:${port}`;

  const chunks = [];
  const server = spawn(
    process.execPath,
    [nextBin, "start", "--hostname", "127.0.0.1", "--port", String(port)],
    { cwd: projectRoot, stdio: ["ignore", "pipe", "pipe"] }
  );
  server.stdout.on("data", (chunk) => chunks.push(chunk));
  server.stderr.on("data", (chunk) => chunks.push(chunk));
  const readOutput = () => Buffer.concat(chunks).toString();

  async function stop() {
    // The server may already be gone — waitForReady throws on early exit. Awaiting
    // "exit" after it fired would hang, so only wait while it is still running.
    // `exitCode` stays null when a child dies from a signal, hence both checks.
    if (server.exitCode === null && server.signalCode === null) {
      const exited = once(server, "exit");
      server.kill("SIGTERM");
      await exited;
    }
  }

  try {
    await waitForReady(server, baseUrl, readOutput);
  } catch (error) {
    await stop();
    throw error;
  }

  return { baseUrl, stop, readOutput };
}
