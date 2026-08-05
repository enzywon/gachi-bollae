#!/usr/bin/env node
// 통합 코멘트에 이미 반영된 원본 코멘트를 "outdated"로 접는다.
// 삭제가 아니라 접는 것이라 필요하면 GitHub UI에서 다시 펼칠 수 있다.
//
// 사용법:
//   node scripts/ai-review/hide-comments.mjs ai-review-out/codex-node-ids.txt

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

const MUTATION = `
  mutation($id: ID!) {
    minimizeComment(input: { subjectId: $id, classifier: OUTDATED }) {
      minimizedComment { isMinimized }
    }
  }
`;

function main() {
  const path = process.argv[2];
  if (!path || !existsSync(path)) {
    console.log('접을 코멘트 목록이 없습니다.');
    return;
  }

  const ids = readFileSync(path, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) {
    console.log('접을 코멘트가 없습니다.');
    return;
  }

  let hidden = 0;
  for (const id of ids) {
    try {
      execFileSync('gh', ['api', 'graphql', '-f', `query=${MUTATION}`, '-F', `id=${id}`], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      hidden += 1;
    } catch (error) {
      // 이미 접혀 있거나 권한이 없는 경우가 있다. 통합 코멘트는 이미 올라갔으므로 치명적이지 않다.
      console.warn(`코멘트를 접지 못했습니다 (${id}): ${error.stderr?.toString().trim() ?? error.message}`);
    }
  }
  console.log(`원본 코멘트 ${hidden}/${ids.length}건을 접었습니다.`);
}

main();
