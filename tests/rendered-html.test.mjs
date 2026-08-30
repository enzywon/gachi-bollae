import assert from "node:assert/strict";
import test from "node:test";
import { startServer } from "./helpers/server.mjs";

test("홈 화면을 서버에서 HTML로 렌더링한다", async () => {
  const { baseUrl, stop } = await startServer();

  try {
    const response = await fetch(baseUrl, { headers: { accept: "text/html" } });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

    const html = await response.text();
    assert.match(html, /<html[^>]*\blang=["']ko["']/i);
    assert.ok(html.includes("같이볼래"), "문서 제목이 렌더링되지 않았습니다.");
    assert.ok(html.includes("각자 고르고"), "상호 매칭 시작 화면이 렌더링되지 않았습니다.");
    assert.ok(html.includes("각자의 응답은 선택이 겹쳤을 때만 공개됩니다"));
  } finally {
    await stop();
  }
});
