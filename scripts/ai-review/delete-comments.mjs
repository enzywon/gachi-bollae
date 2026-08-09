#!/usr/bin/env node
// 통합 코멘트에 이미 반영된 원본 코멘트를 지운다.
//
// 접기(hide-comments.mjs)로는 부족하다. 접힌 인라인 코멘트도 Files changed 탭에는
// 줄마다 접힌 항목으로 남고 Conversation 탭에도 "N hidden items" 로 남아, 결국
// 같은 지적이 통합 코멘트와 파일 양쪽에서 보인다. 삭제해야 한 곳에만 남는다.
// 내용 없는 잡음 코멘트도 마찬가지다. 접으면 남길 것도 없이 회색 줄만 남는다.
//
// 지적 원문과 코드 위치 링크는 통합 코멘트가 들고 있으므로 정보 손실은 없다.
//
// 대상에 따라 엔드포인트가 다르다. --kind 로 고른다.
//   review — 인라인 리뷰 코멘트 (repos/{repo}/pulls/comments/{id})
//   issue  — 대화에 달린 일반 코멘트 (repos/{repo}/issues/comments/{id})
// 둘 다 REST 의 숫자 id 를 받는다. node_id 로는 지울 수 없다.
//
// 사용법:
//   node scripts/ai-review/delete-comments.mjs --repo owner/name --kind review \
//     ai-review-out/codex-delete-ids.txt

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

const ENDPOINTS = { review: 'pulls', issue: 'issues' };

// 봇이 단 코멘트를 지우려면 저장소 write 권한이 필요하다. Actions 토큰으로 충분하지만,
// 조직 설정에 따라 막힐 수 있어 사용자 토큰이 있으면 그걸로 한 번 더 시도한다.
function del(repo, kind, id, token) {
  execFileSync('gh', ['api', '--method', 'DELETE', `repos/${repo}/${ENDPOINTS[kind]}/comments/${id}`], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, GH_TOKEN: token },
  });
}

// --repo, --kind 와 그 값을 걷어낸 나머지 첫 인자가 목록 파일이다.
function takeOption(argv, name) {
  const index = argv.indexOf(name);
  if (index === -1) return { value: '', rest: argv };
  return {
    value: argv[index + 1] ?? '',
    rest: argv.filter((_, i) => i !== index && i !== index + 1),
  };
}

function main() {
  const argv = process.argv.slice(2);
  const { value: repo, rest: afterRepo } = takeOption(argv, '--repo');
  const { value: kind, rest } = takeOption(afterRepo, '--kind');
  const path = rest[0];

  if (!repo) {
    console.error('--repo 는 필수입니다.');
    process.exit(64);
  }
  if (!(kind in ENDPOINTS)) {
    console.error(`--kind 는 ${Object.keys(ENDPOINTS).join(' 또는 ')} 여야 합니다.`);
    process.exit(64);
  }
  if (!path || !existsSync(path)) {
    console.log('지울 코멘트 목록이 없습니다.');
    return;
  }

  const ids = readFileSync(path, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) {
    console.log('지울 코멘트가 없습니다.');
    return;
  }

  const primary = process.env.GH_TOKEN ?? '';
  const fallback = process.env.FALLBACK_TOKEN ?? '';

  let deleted = 0;
  for (const id of ids) {
    try {
      del(repo, kind, id, primary);
      deleted += 1;
    } catch (error) {
      // 이미 지워졌거나(404) 권한이 모자란 경우가 있다. 통합 코멘트는 이미 올라갔으므로
      // 치명적이지 않다. 남은 원본이 조금 지저분할 뿐이다.
      if (!fallback) {
        console.warn(`코멘트를 지우지 못했습니다 (${id}): ${error.stderr?.toString().trim() ?? error.message}`);
        continue;
      }
      try {
        del(repo, kind, id, fallback);
        deleted += 1;
      } catch (retryError) {
        console.warn(`코멘트를 지우지 못했습니다 (${id}): ${retryError.stderr?.toString().trim() ?? retryError.message}`);
      }
    }
  }
  console.log(`원본 코멘트(${kind}) ${deleted}/${ids.length}건을 지웠습니다.`);
}

main();
