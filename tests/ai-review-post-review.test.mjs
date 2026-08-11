import assert from "node:assert/strict";
import test from "node:test";
import { renderBody } from "../scripts/ai-review/post-review.mjs";

const SHA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const PREVIOUS_SHA = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function finding(overrides = {}) {
  return {
    severity: "minor",
    file: "scripts/ai-review/harvest.mjs",
    line: 330,
    title: "분류를 확인하세요.",
    detail: "",
    suggestion: "",
    source: "coderabbit",
    sources: ["coderabbit"],
    history: "",
    sha: "",
    ...overrides,
  };
}

test("현재 결과와 두 종류의 이전 결과를 각 템플릿으로 렌더링한다", () => {
  const fresh = finding({ title: "현재 지적" });
  const priorRound = finding({ title: "같은 SHA 지적", history: "prior-round", sha: SHA });
  const previousCommit = finding({
    title: "이전 SHA 지적",
    history: "previous-commit",
    sha: PREVIOUS_SHA,
  });
  const sources = [{
    name: "coderabbit",
    parsed: true,
    findings: [fresh, priorRound, previousCommit],
    summary: "",
    note: "",
  }];

  const body = renderBody({
    sources,
    statuses: { coderabbit: "success" },
    findings: [fresh, priorRound, previousCommit],
    repo: "enzywon/gachi-bollae",
    sha: SHA,
  });

  assert.match(body, /CodeRabbit ✅ 1건/);
  assert.match(body, /같은 커밋의 이전 리뷰에서 온 지적 \(1\)/);
  assert.match(body, /이전 커밋에서 온 지적 \(1\)/);
  assert.match(body, new RegExp(`/blob/${PREVIOUS_SHA}/scripts/ai-review/harvest\\.mjs#L330`));
});
