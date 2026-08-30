import assert from "node:assert/strict";
import test from "node:test";
import { startServer } from "./helpers/server.mjs";

test("TMDB 토큰이 없으면 데모 카탈로그로 정상 저하한다", async () => {
  const { baseUrl, stop } = await startServer({ env: { TMDB_API_TOKEN: "" } });
  try {
    const response = await fetch(`${baseUrl}/api/catalog`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.source, "demo");
    assert.equal(body.contents.length, 6);
    assert.ok(body.contents.every((content) => content.source === "demo"));
  } finally {
    await stop();
  }
});
