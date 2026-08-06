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

// Codex는 심각도를 P0~P3 뱃지 이미지로 표시한다. P0가 가장 긴급하다.
const PRIORITY_SEVERITY = {
  P0: 'critical', P1: 'critical', P2: 'major', P3: 'minor',
};

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
  const priority = body.match(/!\[(P[0123])\s+Badge\]/i);
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
  codex: {
    bot: 'chatgpt-codex-connector[bot]',
    parse: parseCodex,
    // 리뷰를 못 하겠다고 알려오는 안내문. 이게 오면 더 기다려도 소용없다.
    blocked: /create a Codex account|connect to github/i,
    // 리뷰 내용이 없는 접수 회신. 통합 코멘트에 이미 반영됐으므로 접는다.
    noise: null,
    // 커밋 상태를 남기지 않는다.
    status: null,
  },
  coderabbit: {
    bot: 'coderabbitai[bot]',
    parse: parseCodeRabbit,
    // 할당량이 차면 리뷰를 아예 시작하지 않는다. 이걸 못 알아보면 오지 않을 리뷰를
    // 타임아웃까지 기다리게 된다.
    blocked: /Review skipped|Review limit reached|Review rate limited|rate limited by coderabbit/i,
    // 접수 회신과 walkthrough 요약. 설정으로 walkthrough 항목을 다 꺼도 앱은 기존
    // 요약 코멘트를 지우지 않고 갱신만 하므로, 이미 달린 것은 접어서 치워야 한다.
    noise: /auto-generated reply by CodeRabbit|summarize by coderabbit\.ai|walkthrough_start/i,
    // 커밋 상태에 진행 결과를 남긴다. 리뷰 객체보다 빠르고, 무엇보다 지적이 0건이면
    // 리뷰 객체를 아예 만들지 않으므로 이것 말고는 완료를 알 방법이 없다.
    status: {
      context: 'CodeRabbit',
      done: /Review completed/i,
      // 자동 리뷰를 끈 것은 우리 설정이다. 실패가 아니라 예상된 상태이고, 그 뒤에 우리가
      // 명시적으로 요청한 리뷰가 따로 진행된다. 이걸 실패로 읽으면 정작 요청한 리뷰를
      // 기다리지 않고 끝낸다. 실제로 이 상태는 요청 5초 전에 찍혀 시각 조건만으로는
      // 아슬아슬하게 걸러진다. 문구로도 걸러 둔다.
      ignore: /automatic reviews are disabled|Review queued|Review in progress/i,
      blocked: /Review skipped|rate limited|Review failed|Review error/i,
    },
  },
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
    '--jq', '.[] | {id, login: .user.login, commit_id, submitted_at}',
  ]);
}

function fetchReviewComments(repo, pr) {
  return ghJsonLines([
    'api', '--paginate', `repos/${repo}/pulls/${pr}/comments`,
    '--jq', '.[] | {node_id, login: .user.login, created_at, pull_request_review_id, commit_id, original_commit_id, path, line, start_line, original_line, body}',
  ]);
}

// 이번 요청에 대한 리뷰들의 id. SHA만 보면 안 된다. 같은 SHA로 workflow를 재실행하거나
// PR을 다시 열면 이전 리뷰가 그대로 남아 있어, 요청하자마자 그걸 완료 신호로 오인한다.
// 리뷰의 commit_id 는 코멘트의 것과 달리 나중에 바뀌지 않아 라운드 판별에 쓸 수 있다.
function freshReviewIds(repo, pr, source, sha, sinceIso) {
  return new Set(
    fetchReviews(repo, pr)
      .filter((r) => r.login === source.bot
        && r.commit_id === sha
        && (!sinceIso || (r.submitted_at && r.submitted_at >= sinceIso)))
      .map((r) => r.id)
      .filter((id) => id !== undefined && id !== null),
  );
}

// 커밋 상태에 남는 리뷰 진행 결과. 요청 이후에 갱신된 것만 이번 요청에 대한 응답으로
// 본다. push 직후 앱이 "자동 리뷰 꺼짐"을 적어 두는데, 그건 우리 요청과 무관하므로
// 그걸 실패로 읽으면 정작 요청에 대한 리뷰를 기다리지 않고 끝내 버린다.
function fetchFreshStatus(repo, sha, source, sinceIso) {
  if (!source.status) return null;
  let latest;
  try {
    latest = ghJsonLines([
      'api', `repos/${repo}/commits/${sha}/status`,
      '--jq', `.statuses[] | select(.context == "${source.status.context}") | {description, updated_at}`,
    ]).at(-1);
  } catch {
    return null;
  }
  if (!latest) return null;
  if (sinceIso && !(latest.updated_at && latest.updated_at >= sinceIso)) return null;
  return latest;
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

function fetchBotIssueComments(repo, pr, bot, sinceIso) {
  try {
    return ghJsonLines([
      'api', '--paginate', `repos/${repo}/issues/${pr}/comments`,
      '--jq', '.[] | {node_id, login: .user.login, created_at, body}',
    ]).filter((c) => c.login === bot && (!sinceIso || c.created_at >= sinceIso));
  } catch {
    return [];
  }
}

// 리뷰 요청을 올린 시각. 앱의 응답인지 이전 실행의 잔재인지 가르는 기준이 된다.
// 수확 스텝이 시작한 시각을 쓰면 안 된다. 리뷰어별로 수확이 순차 실행되어
// 뒤 순서의 수확은 자기 요청보다 한참 뒤에 시작하기 때문이다.
function fetchTriggerTime(repo, commentId) {
  if (!commentId) return new Date().toISOString();
  try {
    const [comment] = ghJsonLines([
      'api', `repos/${repo}/issues/comments/${commentId}`, '--jq', '{created_at}',
    ]);
    return comment?.created_at ?? new Date().toISOString();
  } catch {
    return new Date().toISOString();
  }
}

// 안내문 본문에서 사람이 읽을 한 줄을 뽑는다. 통합 코멘트에 사유로 싣는 값이라
// 마크업(주석, 태그, 인용, 알림 블록)은 걷어낸다.
function summarizeReply(body) {
  const text = (body ?? '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\/?[a-z][^>]*>/gi, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/\[!\w+\]/g, '')
    .replace(/^\s*#+\s*/gm, '');
  const line = text.split('\n').map((l) => l.trim()).find(Boolean) ?? '';
  return line.slice(0, 160);
}

// 앱이 리뷰 대신 "리뷰할 수 없다"는 안내문을 남기는 경우가 있다(계정 연결 필요, 할당량 초과 등).
// 그때만 종료 신호로 본다. 접수 회신 같은 일반 코멘트까지 실패로 처리하면
// 리뷰가 도착하기도 전에 폴링을 멈춰 결과를 통째로 놓친다.
// 안내문이 여러 개면 마지막 것이 가장 구체적이다(접수 회신 뒤에 사유가 따라온다).
function findBlockingReply(repo, pr, source, sinceIso) {
  if (!source.blocked) return null;
  return fetchBotIssueComments(repo, pr, source.bot, sinceIso)
    .filter((c) => source.blocked.test(c.body ?? '')).at(-1) ?? null;
}

// 접수 회신은 내용이 없고 "리뷰 불가" 안내문은 사유가 통합 코멘트에 실리므로 둘 다 접는다.
// 지난 실행에서 쌓인 것까지 함께 접어야 PR에 코멘트가 하나만 남는다.
function findNoiseCommentIds(repo, pr, source) {
  return fetchBotIssueComments(repo, pr, source.bot, '')
    .filter((c) => {
      const body = c.body ?? '';
      return Boolean(source.noise?.test(body) || source.blocked?.test(body));
    })
    .map((c) => c.node_id)
    .filter(Boolean);
}

function harvest(repo, pr, sha, source, sinceIso, reviewIds) {
  const mine = fetchReviewComments(repo, pr).filter((c) => c.login === source.bot);

  // 코멘트의 commit_id 는 믿을 수 없다. GitHub은 코멘트가 붙은 줄이 살아 있으면 그 값을
  // 최신 커밋으로 옮겨 주기 때문에, 지난 커밋에서 이미 해결한 지적이 이번 라운드 결과인
  // 척 계속 다시 실린다. 취소된 실행이 뒤늦게 남긴 코멘트도 같은 경로로 섞여 든다.
  // 그래서 소속 리뷰(pull_request_review_id)로 라운드를 가른다. 리뷰의 commit_id 는
  // 고정이라 나중에 바뀌지 않는다.
  // 리뷰에 속하지 않은 단독 코멘트만 예전처럼 시각과 SHA로 거른다.
  const comments = mine.filter((c) => (c.pull_request_review_id
    ? reviewIds.has(c.pull_request_review_id)
    : (!sinceIso || c.created_at >= sinceIso) && (c.commit_id === sha || c.original_commit_id === sha)));

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

  // 접는 것은 이번 라운드 것만이 아니라 봇이 남긴 모든 리뷰 코멘트다. 취소된 실행이
  // 뒤늦게 남긴 이전 커밋 코멘트는 어느 라운드의 수확에도 안 잡혀 영영 펼쳐진 채로
  // 남는다. 통합 코멘트가 현재 지적을 모두 담고 있으므로 원본은 접어도 된다.
  return { findings, nodeIds: mine.map((c) => c.node_id).filter(Boolean) };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const source = SOURCES[opts.source];
  if (!source || !opts.repo || !opts.pr || !opts.sha) {
    console.error(`--source(${Object.keys(SOURCES).join('|')}), --repo, --pr, --sha 는 필수입니다.`);
    process.exit(64);
  }

  const startedAt = fetchTriggerTime(opts.repo, opts['trigger-comment-id']);
  // 요청 코멘트가 없으면(요청이 실패한 경우) 라운드를 시각으로 가를 근거가 없다.
  // 앱이 스스로 남긴 리뷰까지 놓치지 않도록 그때는 시각 조건 없이 SHA만 본다.
  const roundStart = opts['trigger-comment-id'] ? startedAt : '';
  const deadline = Date.now() + Number(opts.timeout) * 1000;
  let reason = '';
  let blockedNote = '';
  // 커밋 상태로 완료를 알았을 때만 쓴다. 상태가 코멘트보다 먼저 보일 수 있어
  // 곧장 수확하면 0건으로 단정할 수 있다.
  let graceMs = 0;

  while (Date.now() < deadline && !reason) {
    // 커밋 상태를 남기는 리뷰어는 그것만 완료 신호로 본다. CodeRabbit 은 진짜 리뷰를
    // 올리기 전에 다른 용도의 리뷰 객체를 하나 더 만든다(예: 봇 코멘트에 대한 회신).
    // 리뷰 객체가 보인다고 끝내면 그 중간 객체에 걸려 빈손으로 92초 일찍 끝난다.
    // 지적이 0건이면 리뷰 객체 자체가 생기지 않으므로 어차피 상태를 봐야 한다.
    const status = fetchFreshStatus(opts.repo, opts.sha, source, roundStart);
    const description = status?.description ?? '';
    const settled = status && !source.status.ignore.test(description);
    if (settled && source.status.done.test(description)) {
      reason = `커밋 상태(${description})`;
      graceMs = POLL_INTERVAL_MS;
      break;
    }
    if (settled && source.status.blocked.test(description)) {
      blockedNote = description;
      console.error(`${opts.source} 커밋 상태가 리뷰 불가를 알려왔습니다: ${blockedNote}`);
      break;
    }

    if (!source.status
      && freshReviewIds(opts.repo, opts.pr, source, opts.sha, roundStart).size > 0) {
      reason = '리뷰 게시됨';
      break;
    }
    if (hasThumbsUp(opts.repo, opts['trigger-comment-id'], source.bot)) {
      reason = '지적 없음(👍 반응)';
      break;
    }

    // 리뷰 대신 "리뷰할 수 없다"는 안내문을 남겼다면 더 기다려도 소용없다.
    const blocked = findBlockingReply(opts.repo, opts.pr, source, startedAt);
    if (blocked) {
      blockedNote = summarizeReply(blocked.body);
      console.error(`${opts.source} 가 리뷰할 수 없다고 알려왔습니다: ${blockedNote}`);
      break;
    }

    console.log(`${opts.source} 리뷰 대기 중... (남은 시간 ${Math.round((deadline - Date.now()) / 1000)}초)`);
    await new Promise((resolve) => { setTimeout(resolve, POLL_INTERVAL_MS); });
  }

  if (graceMs) {
    console.log(`상태로 완료를 확인했습니다. 코멘트가 도착할 시간을 ${graceMs / 1000}초 줍니다.`);
    await new Promise((resolve) => { setTimeout(resolve, graceMs); });
  }

  if (!reason) {
    const note = blockedNote || '리뷰를 기다리다 시간이 초과됐습니다.';
    if (!blockedNote) console.error(`${opts.source} ${note}`);
    console.error(`${opts.source}: 이번 실행에서는 건너뜁니다.`);
    // 실패해도 안내 코멘트는 접는다. 사유는 note 로 통합 코멘트에 실리므로
    // PR 대화에 원본을 남겨둘 이유가 없다.
    const noiseIds = findNoiseCommentIds(opts.repo, opts.pr, source);
    if (opts.out) writeFileSync(opts.out, JSON.stringify({ summary: '', findings: [], note }), 'utf8');
    if (opts['ids-out']) writeFileSync(opts['ids-out'], noiseIds.join('\n'), 'utf8');
    process.exit(1);
  }

  // 수확 직전에 다시 읽는다. 상태로 완료를 안 경우 리뷰 id 를 아직 모르고,
  // grace 를 기다리는 사이에 리뷰가 올라왔을 수도 있다.
  const reviewIds = freshReviewIds(opts.repo, opts.pr, source, opts.sha, roundStart);
  const { findings, nodeIds } = harvest(opts.repo, opts.pr, opts.sha, source, roundStart, reviewIds);
  const noiseIds = findNoiseCommentIds(opts.repo, opts.pr, source);
  console.log(`${opts.source} 수확 완료 (${reason}): ${findings.length}건, 접을 코멘트 ${nodeIds.length + noiseIds.length}건`);

  if (opts.out) writeFileSync(opts.out, JSON.stringify({ summary: '', findings }, null, 2), 'utf8');
  if (opts['ids-out']) writeFileSync(opts['ids-out'], [...nodeIds, ...noiseIds].join('\n'), 'utf8');
}

main();
