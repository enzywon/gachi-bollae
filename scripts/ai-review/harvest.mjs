#!/usr/bin/env node
// 리뷰 앱이 PR에 남긴 인라인 코멘트를 기다렸다가 걷어와 정규화한다.
//
// Codex와 CodeRabbit 모두 자기네 서버에서 돌기 때문에 결과를 직접 받을 수 없다.
// 대신 앱이 GitHub API에 남긴 리뷰 코멘트를 읽어 우리 형식으로 옮긴다.
// 그래야 각자의 구독으로 리뷰하면서도 결과를 하나의 코멘트에 합칠 수 있다.
//
// 사용법:
//   node scripts/ai-review/harvest.mjs --source codex \
//     --repo owner/name --pr 12 --sha <head-sha> \
//     --trigger-comment-id 123 --timeout 600 \
//     --out ai-review-out/codex.json --ids-out ai-review-out/codex-node-ids.txt

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const POLL_INTERVAL_MS = 15000;

// Codex는 심각도를 P1~P3 뱃지 이미지로 표시한다.
const PRIORITY_SEVERITY = { P1: 'critical', P2: 'major', P3: 'minor' };

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

function extractSuggestion(body) {
  const match = body.match(/```suggestion\n([\s\S]*?)```/);
  return match ? match[1].trimEnd() : '';
}

// Codex: "**<sub><sub>![P2 Badge](...)</sub></sub>  제목**\n\n본문..."
function parseCodex(body) {
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

  return { severity, title, detail, suggestion: extractSuggestion(body) };
}

// CodeRabbit: "_🎯 카테고리_ | _🟡 Minor_ | _⚡ Quick win_\n\n**제목**\n\n본문...\n<details>..."
function parseCodeRabbit(body) {
  // 접힌 블록(분석 과정, 에이전트용 프롬프트 등)은 본문 앞뒤 어디에나 올 수 있다.
  // 앞에서 자르면 제목을 놓치므로 블록만 통째로 걷어낸다.
  const visible = body
    .replace(/<details>[\s\S]*?<\/details>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  const lines = visible.split('\n').filter((line, index) => index === 0 || line.trim() !== '');
  const markers = lines[0] ?? '';

  let severity = 'minor';
  if (/🔴|critical/i.test(markers)) severity = 'critical';
  else if (/🟠|major/i.test(markers)) severity = 'major';
  else if (/🟡|minor/i.test(markers)) severity = 'minor';
  if (/🧹|nitpick/i.test(markers)) severity = 'nit';  // CodeRabbit이 선택 사항으로 분류한 것

  // 제목은 굵은 글씨로 시작하는 첫 줄이다. 줄 전체가 굵은 경우도 있고
  // "**분류:** 설명" 처럼 앞부분만 굵은 경우도 있다.
  const headingIndex = lines.findIndex((line) => /^\s*\*\*/.test(line));
  let title = '';
  let rest = lines.slice(1).join('\n');

  if (headingIndex !== -1) {
    title = lines[headingIndex].replace(/\*\*/g, '').trim();
    rest = lines.slice(headingIndex + 1).join('\n');
  }

  return { severity, title, detail: rest.trim(), suggestion: extractSuggestion(body) };
}

const SOURCES = {
  codex: { bot: 'chatgpt-codex-connector[bot]', parse: parseCodex },
  coderabbit: { bot: 'coderabbitai[bot]', parse: parseCodeRabbit },
};

function parseArgs(argv) {
  const opts = {
    source: '', repo: '', pr: '', sha: '', 'trigger-comment-id': '', timeout: '600',
    out: '', 'ids-out': '',
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

function fetchReviews(repo, pr) {
  return ghJsonLines([
    'api', '--paginate', `repos/${repo}/pulls/${pr}/reviews`,
    '--jq', '.[] | {node_id, login: .user.login, commit_id}',
  ]);
}

function fetchReviewComments(repo, pr) {
  return ghJsonLines([
    'api', '--paginate', `repos/${repo}/pulls/${pr}/comments`,
    '--jq', '.[] | {node_id, login: .user.login, commit_id, original_commit_id, path, line, start_line, original_line, body}',
  ]);
}

// 앱은 지적이 없을 때만 👍 로 반응한다. 👀 같은 "접수했음" 반응까지 완료로 보면
// 리뷰가 오기도 전에 0건으로 단정하게 된다.
function hasThumbsUp(repo, commentId, bot) {
  if (!commentId) return false;
  try {
    return ghJsonLines([
      'api', '--paginate', `repos/${repo}/issues/comments/${commentId}/reactions`,
      '--jq', '.[] | {login: .user.login, content}',
    ]).some((r) => r.login === bot && r.content === '+1');
  } catch {
    return false;
  }
}

// 앱이 리뷰 대신 안내문을 코멘트로 남기는 경우가 있다(계정 연결 필요 등).
// 그대로 기다리면 타임아웃까지 시간을 버리므로 종료 신호로 취급한다.
function findBotReply(repo, pr, bot, sinceIso) {
  try {
    return ghJsonLines([
      'api', '--paginate', `repos/${repo}/issues/${pr}/comments`,
      '--jq', '.[] | {login: .user.login, created_at, body}',
    ]).find((c) => c.login === bot && c.created_at >= sinceIso) ?? null;
  } catch {
    return null;
  }
}

function harvest(repo, pr, sha, source) {
  const comments = fetchReviewComments(repo, pr).filter(
    (c) => c.login === source.bot && (c.commit_id === sha || c.original_commit_id === sha),
  );

  const findings = comments.map((c) => {
    const parsed = source.parse(c.body ?? '');
    // 제목을 못 뽑았으면 첫 줄을 제목으로 쓰되 나머지 줄은 본문에 남긴다.
    const [firstLine, ...restLines] = parsed.detail.split('\n');
    return {
      severity: parsed.severity,
      file: c.path ?? '',
      line: c.line ?? c.original_line ?? c.start_line ?? 0,
      title: parsed.title || (firstLine ?? '').slice(0, 100),
      detail: parsed.title ? parsed.detail : restLines.join('\n').trim(),
      suggestion: parsed.suggestion,
    };
  });

  return { findings, nodeIds: comments.map((c) => c.node_id).filter(Boolean) };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const source = SOURCES[opts.source];
  if (!source || !opts.repo || !opts.pr || !opts.sha) {
    console.error(`--source(${Object.keys(SOURCES).join('|')}), --repo, --pr, --sha 는 필수입니다.`);
    process.exit(64);
  }

  const startedAt = new Date().toISOString();
  const deadline = Date.now() + Number(opts.timeout) * 1000;
  let reason = '';
  let failed = false;

  while (Date.now() < deadline && !reason) {
    if (fetchReviews(opts.repo, opts.pr).some((r) => r.login === source.bot && r.commit_id === opts.sha)) {
      reason = '리뷰 게시됨';
      break;
    }
    if (hasThumbsUp(opts.repo, opts['trigger-comment-id'], source.bot)) {
      reason = '지적 없음(👍 반응)';
      break;
    }
    // 리뷰 대신 안내문을 남겼다면 더 기다려도 소용없다.
    const reply = findBotReply(opts.repo, opts.pr, source.bot, startedAt);
    if (reply) {
      console.error(`${opts.source} 가 리뷰 대신 안내문을 남겼습니다: ${reply.body.split('\n')[0].slice(0, 160)}`);
      failed = true;
      break;
    }

    console.log(`${opts.source} 리뷰 대기 중... (남은 시간 ${Math.round((deadline - Date.now()) / 1000)}초)`);
    await new Promise((resolve) => { setTimeout(resolve, POLL_INTERVAL_MS); });
  }

  if (!reason) {
    if (!failed) console.error(`${opts.source} 리뷰를 기다리다 시간이 초과됐습니다.`);
    console.error(`${opts.source}: 이번 실행에서는 건너뜁니다.`);
    if (opts.out) writeFileSync(opts.out, JSON.stringify({ summary: '', findings: [] }), 'utf8');
    if (opts['ids-out']) writeFileSync(opts['ids-out'], '', 'utf8');
    process.exit(1);
  }

  const { findings, nodeIds } = harvest(opts.repo, opts.pr, opts.sha, source);
  console.log(`${opts.source} 수확 완료 (${reason}): ${findings.length}건`);

  if (opts.out) writeFileSync(opts.out, JSON.stringify({ summary: '', findings }, null, 2), 'utf8');
  if (opts['ids-out']) writeFileSync(opts['ids-out'], nodeIds.join('\n'), 'utf8');
}

main();
