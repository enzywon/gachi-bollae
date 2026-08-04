import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDiffContext,
  findExistingBotComment,
  sanitizeReview,
  shouldSkipFile,
  validatePullRequestNumber,
  validateRepository,
} from "../scripts/ai-review.mjs";

test("저장소와 PR 번호 형식을 검증한다", () => {
  assert.equal(validateRepository("enzywon/gachi-bollae"), "enzywon/gachi-bollae");
  assert.equal(validatePullRequestNumber("42"), 42);
  assert.throws(() => validateRepository("https://example.com/repo"));
  assert.throws(() => validatePullRequestNumber("0"));
});

test("생성물과 vendored skill 파일을 리뷰에서 제외한다", () => {
  assert.equal(shouldSkipFile("package-lock.json"), true);
  assert.equal(shouldSkipFile(".agents/skills/example/SKILL.md"), true);
  assert.equal(shouldSkipFile("app/page.tsx"), false);
});

test("diff 크기를 제한하고 잘림 여부를 표시한다", () => {
  const files = [
    {
      filename: "app/page.tsx",
      status: "modified",
      additions: 1,
      deletions: 0,
      patch: "+const value = '길이가 긴 변경';",
    },
  ];
  const context = buildDiffContext(files, 25);

  assert.equal(context.truncated, true);
  assert.match(context.text, /diff truncated/);
  assert.ok(context.text.length <= 25);
});

test("자신의 marker를 가진 봇 댓글만 갱신 대상으로 선택한다", () => {
  const comments = [
    { id: 1, user: { type: "User" }, body: "<!-- gachi-ai-review -->" },
    { id: 2, user: { type: "Bot" }, body: "일반 봇 댓글" },
    { id: 3, user: { type: "Bot" }, body: "<!-- gachi-ai-review -->\n리뷰" },
  ];

  assert.equal(findExistingBotComment(comments)?.id, 3);
});

test("AI 출력이 사용자를 멘션하지 못하게 한다", () => {
  assert.equal(sanitizeReview("@everyone과 @octocat 확인"), "@​everyone과 @​octocat 확인");
});
