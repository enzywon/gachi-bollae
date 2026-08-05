#!/usr/bin/env node
// Codex App이 PR에 남긴 리뷰를 기다렸다가 걷어와 정규화한다.
//
// Codex는 CI가 아니라 OpenAI 서버에서 돌기 때문에 결과를 직접 받을 수 없다.
// 대신 App이 GitHub API에 남긴 리뷰 코멘트를 읽어 우리 형식으로 옮긴다.
// 그래야 API 크레딧을 쓰지 않고도 결과를 하나의 코멘트에 합칠 수 있다.
//
// 사용법:
//   node scripts/ai-review/harvest-codex.mjs \
//     --repo owner/name --pr 12 --sha <head-sha> \
//     --trigger-comment-id 123 --timeout 600 \
//     --out ai-review-out/codex.json --ids-out ai-review-out/codex-node-ids.txt

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const BOT_LOGIN = 'chatgpt-codex-connector[bot]';
const POLL_INTERVAL_MS = 15000;

// Codex는 심각도를 P1~P3 뱃지 이미지로 표시한다.
const PRIORITY_SEVERITY = { P1: 'critical', P2: 'major', P3: 'minor' };

function parseArgs(argv) {
  const opts = {
    repo: '', pr: '', sha: '', 'trigger-comment-id': '', timeout: '600',
    out: 'ai-review-out/codex.json', 'ids-out': 'ai-review-out/codex-node-ids.txt',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i].replace(/^--/, '');
    if (key in opts) {
      opts[key] = argv[i + 1] ?? '';
      i += 1;
    }
  }
  return opts;
}

function gh(args) {
  return execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
}

function ghJsonLines(args) {
  const out = [];
  for (const line of gh(args).split('\n')) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      // 페이지 경계의 부분 출력은 버린다.
    }
  }
  return out;
}

function fetchReviews(repo, pr) {
  return ghJsonLines([
    'api', '--paginate', `repos/${repo}/pulls/${pr}/reviews`,
    '--jq', '.[] | {node_id, login: .user.login, commit_id, body}',
  ]);
}

function fetchReviewComments(repo, pr) {
  return ghJsonLines([
    'api', '--paginate', `repos/${repo}/pulls/${pr}/comments`,
    '--jq', '.[] | {node_id, login: .user.login, commit_id, original_commit_id, path, line, start_line, original_line, body}',
  ]);
}

function fetchReactionLogins(repo, commentId) {
  if (!commentId) return [];
  try {
    return ghJsonLines([
      'api', '--paginate', `repos/${repo}/issues/comments/${commentId}/reactions`,
      '--jq', '.[] | {login: .user.login}',
    ]).map((r) => r.login);
  } catch {
    return [];
  }
}

// "**<sub><sub>![P2 Badge](...)</sub></sub>  제목**\n\n본문..." 형태를 뜯는다.
function parseCommentBody(body) {
  const priority = body.match(/!\[(P[123])\s+Badge\]/i);
  const severity = PRIORITY_SEVERITY[priority?.[1]?.toUpperCase()] ?? 'major';

  const lines = body.split('\n');
  const headingIndex = lines.findIndex((line) => line.trim().startsWith('**'));
  let title = '';
  let rest = body;

  if (headingIndex !== -1) {
    title = lines[headingIndex]
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')  // 뱃지 이미지 제거
      .replace(/<\/?sub>/g, '')
      .replace(/\*\*/g, '')
      .trim();
    rest = lines.slice(headingIndex + 1).join('\n');
  }

  const detail = rest
    .replace(/^\s*Useful\?\s*React with.*$/gim, '')  // 앱이 붙이는 피드백 안내 제거
    .trim();

  return { severity, title, detail };
}

function harvest(repo, pr, sha) {
  const comments = fetchReviewComments(repo, pr).filter(
    (c) => c.login === BOT_LOGIN && (c.commit_id === sha || c.original_commit_id === sha),
  );

  const findings = comments.map((c) => {
    const { severity, title, detail } = parseCommentBody(c.body ?? '');
    return {
      severity,
      file: c.path ?? '',
      line: c.line ?? c.original_line ?? c.start_line ?? 0,
      title: title || (detail.split('\n')[0] ?? '').slice(0, 100),
      detail: title ? detail : '',
      suggestion: '',
    };
  });

  const nodeIds = comments.map((c) => c.node_id).filter(Boolean);
  return { findings, nodeIds };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.repo || !opts.pr || !opts.sha) {
    console.error('--repo, --pr, --sha 는 필수입니다.');
    process.exit(64);
  }

  const deadline = Date.now() + Number(opts.timeout) * 1000;
  let done = false;
  let reason = '';

  while (Date.now() < deadline) {
    const reviewed = fetchReviews(opts.repo, opts.pr)
      .some((r) => r.login === BOT_LOGIN && r.commit_id === opts.sha);
    if (reviewed) {
      done = true;
      reason = '리뷰 게시됨';
      break;
    }

    // 지적할 게 없으면 Codex는 코멘트 대신 요청 코멘트에 👍 로 반응한다.
    if (fetchReactionLogins(opts.repo, opts['trigger-comment-id']).includes(BOT_LOGIN)) {
      done = true;
      reason = '지적 없음(반응만 남김)';
      break;
    }

    console.log(`Codex 리뷰 대기 중... (남은 시간 ${Math.round((deadline - Date.now()) / 1000)}초)`);
    await new Promise((resolve) => { setTimeout(resolve, POLL_INTERVAL_MS); });
  }

  if (!done) {
    console.error('Codex 리뷰를 기다리다 시간이 초과됐습니다. 이번 실행에서는 건너뜁니다.');
    writeFileSync(opts.out, JSON.stringify({ summary: '', findings: [] }), 'utf8');
    writeFileSync(opts['ids-out'], '', 'utf8');
    process.exit(1);
  }

  const { findings, nodeIds } = harvest(opts.repo, opts.pr, opts.sha);
  console.log(`Codex 수확 완료 (${reason}): ${findings.length}건`);

  writeFileSync(opts.out, JSON.stringify({ summary: '', findings }, null, 2), 'utf8');
  writeFileSync(opts['ids-out'], nodeIds.join('\n'), 'utf8');
}

main();
