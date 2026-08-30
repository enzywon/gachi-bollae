import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflow = await readFile(
  new URL("../.github/workflows/ai-review.yml", import.meta.url),
  "utf8",
);

test("AI 리뷰는 기본 브랜치 코드에서만 쓰기 토큰을 사용한다", () => {
  assert.match(workflow, /^\s{2}pull_request_target:\s*$/m);
  assert.doesNotMatch(workflow, /^\s{2}pull_request:\s*$/m);
  assert.match(
    workflow,
    /uses: actions\/checkout@v6[\s\S]*?ref: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/,
  );
  assert.doesNotMatch(
    workflow,
    /uses: actions\/checkout@v6[\s\S]*?ref: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/,
  );
});

test("PR head는 검증된 Git 객체로만 가져온다", () => {
  assert.match(workflow, /git fetch --no-tags origin "pull\/\$\{PR_NUMBER\}\/head"/);
  assert.match(workflow, /if \[ "\$fetched_head" != "\$HEAD_SHA" \]/);
  assert.match(workflow, /git diff --quiet "\$BASE_SHA" "\$HEAD_SHA"/);
});

test("같은 PR의 외부 리뷰 요청은 직렬화하고 오래된 head는 건너뛴다", () => {
  assert.match(workflow, /group: ai-review-\$\{\{ github\.event\.pull_request\.number \}\}/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /current_head=\$\(gh api .* --jq \.head\.sha\)/);
  assert.match(workflow, /if: needs\.preflight\.outputs\.current == 'true'/);
});
