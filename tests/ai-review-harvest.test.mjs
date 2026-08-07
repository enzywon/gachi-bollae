import assert from "node:assert/strict";
import test from "node:test";
import { SOURCES, selectRoundComments } from "../scripts/ai-review/harvest.mjs";

/**
 * 수확기가 이번 라운드의 지적만 골라내는지 확인한다.
 *
 * 본문은 PR #17에서 두 앱이 실제로 남긴 코멘트에서 가져왔다. 형식이 바뀌면
 * 통합 코멘트에 엉뚱한 항목이 실리므로 원문 그대로 두는 편이 낫다.
 */

const SHA = "0d28459d814e904b8f793bd9851d1c47100ca2ee";
const SINCE = "2026-08-07T13:00:00Z";

/** CodeRabbit이 다른 봇의 인라인 코멘트마다 붙이는 회신. 지적이 아니다. */
const SKIPPED_REPLY = [
  "> Skipped: comment is from another GitHub bot.",
  "",
  "<!-- This is an auto-generated reply by CodeRabbit -->",
].join("\n");

/** CodeRabbit의 진짜 지적. 머리글에 카테고리와 심각도가 붙는다. */
const REAL_FINDING = [
  "_🗄️ Data Integrity & Integration_ | _🟠 Major_ | _⚡ Quick win_",
  "",
  "**생성된 요청 코멘트만 삭제하도록 제한하세요.**",
  "",
  "본문이 `@codex review`와 일치하는 모든 PR 코멘트를 삭제합니다.",
].join("\n");

function comment(overrides) {
  return {
    node_id: "node-1",
    created_at: "2026-08-07T13:30:00Z",
    pull_request_review_id: 100,
    commit_id: SHA,
    path: ".github/workflows/ai-review.yml",
    line: 108,
    ...overrides,
  };
}

test("내용 없는 회신은 지적으로 세지 않는다", () => {
  const comments = [
    comment({ node_id: "skip-1", body: SKIPPED_REPLY }),
    comment({ node_id: "real-1", body: REAL_FINDING }),
  ];

  const selected = selectRoundComments(
    comments,
    SOURCES.coderabbit,
    SHA,
    SINCE,
    new Set([100]),
  );

  assert.deepEqual(
    selected.map((c) => c.node_id),
    ["real-1"],
  );
});

test("Codex는 걸러낼 회신 패턴이 없어 그대로 통과시킨다", () => {
  const body = "**![P1 Badge](https://img.shields.io/badge/P1-orange) 커밋 상태 읽기 권한을 추가하세요**";
  const comments = [comment({ node_id: "codex-1", body })];

  const selected = selectRoundComments(
    comments,
    SOURCES.codex,
    SHA,
    SINCE,
    new Set([100]),
  );

  assert.deepEqual(
    selected.map((c) => c.node_id),
    ["codex-1"],
  );
});

test("지난 라운드의 리뷰에 속한 코멘트는 제외한다", () => {
  const comments = [
    comment({ node_id: "old-1", pull_request_review_id: 99, body: REAL_FINDING }),
    comment({ node_id: "new-1", pull_request_review_id: 100, body: REAL_FINDING }),
  ];

  const selected = selectRoundComments(
    comments,
    SOURCES.coderabbit,
    SHA,
    SINCE,
    new Set([100]),
  );

  assert.deepEqual(
    selected.map((c) => c.node_id),
    ["new-1"],
  );
});

test("리뷰에 속하지 않은 단독 코멘트는 시각과 SHA로 거른다", () => {
  const comments = [
    // 요청 이전에 달렸다.
    comment({
      node_id: "stale-1",
      pull_request_review_id: null,
      created_at: "2026-08-07T12:00:00Z",
      body: REAL_FINDING,
    }),
    // 다른 커밋에 달렸다.
    comment({
      node_id: "other-sha",
      pull_request_review_id: null,
      commit_id: "1111111111111111111111111111111111111111",
      body: REAL_FINDING,
    }),
    comment({ node_id: "solo-1", pull_request_review_id: null, body: REAL_FINDING }),
  ];

  const selected = selectRoundComments(
    comments,
    SOURCES.coderabbit,
    SHA,
    SINCE,
    new Set([100]),
  );

  assert.deepEqual(
    selected.map((c) => c.node_id),
    ["solo-1"],
  );
});
