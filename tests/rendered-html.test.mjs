import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const nextBin = fileURLToPath(
  new URL("../node_modules/next/dist/bin/next", import.meta.url),
);
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
      throw new Error(
        `next start exited early with code ${server.exitCode}:\n${readOutput()}`,
      );
    }

    try {
      const response = await fetch(baseUrl, { headers: { accept: "text/html" } });
      if (response.status < 500) return;
    } catch {
      // Not accepting connections yet.
    }

    await delay(250);
  }

  throw new Error(
    `next start was not ready within ${startupTimeoutMs}ms:\n${readOutput()}`,
  );
}

test("홈 화면을 서버에서 HTML로 렌더링한다", async () => {
  const port = Number(process.env.TEST_PORT ?? (await findFreePort()));
  const baseUrl = `http://127.0.0.1:${port}`;

  const chunks = [];
  const server = spawn(
    process.execPath,
    [nextBin, "start", "--hostname", "127.0.0.1", "--port", String(port)],
    { cwd: projectRoot, stdio: ["ignore", "pipe", "pipe"] },
  );
  server.stdout.on("data", (chunk) => chunks.push(chunk));
  server.stderr.on("data", (chunk) => chunks.push(chunk));
  const readOutput = () => Buffer.concat(chunks).toString();

  try {
    await waitForReady(server, baseUrl, readOutput);

    const response = await fetch(baseUrl, { headers: { accept: "text/html" } });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

    const html = await response.text();
    assert.match(html, /<html[^>]*\blang=["']ko["']/i);
    assert.ok(html.includes("같이볼래"), "문서 제목이 렌더링되지 않았습니다.");
    assert.ok(
      html.includes("누구와 볼까요?"),
      "첫 화면의 모드 선택 카드가 렌더링되지 않았습니다.",
    );
  } finally {
    // The server may already be gone — waitForReady throws on early exit. Awaiting
    // "exit" after it fired would hang, so only wait while it is still running.
    // `exitCode` stays null when a child dies from a signal, hence both checks.
    if (server.exitCode === null && server.signalCode === null) {
      const exited = once(server, "exit");
      server.kill("SIGTERM");
      await exited;
    }
  }
});
