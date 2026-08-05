#!/usr/bin/env node
// 여러 AI 리뷰어의 출력을 하나로 합쳐 PR에 고정 코멘트로 남긴다.
// 같은 마커를 가진 코멘트가 이미 있으면 새로 달지 않고 그 코멘트를 수정한다.
//
// 사용법:
//   node scripts/ai-review/post-review.mjs \
//     --repo owner/name --pr 12 --sha <commit-sha> \
//     --status codex=success,coderabbit=failure \
//     codex=ai-review-out/codex.json \
//     coderabbit=ai-review-out/coderabbit.jsonl

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const MARKER = '<!-- ai-review:v1 -->';
const BOT_LOGIN = 'github-actions[bot]';
const COMMENT_LIMIT = 60000; // GitHub 코멘트 상한(65536)에 여유를 둔 값

const SEVERITIES = ['critical', 'major', 'minor', 'nit'];

const SEVERITY_LABEL = {
  critical: '🔴 반드시 수정',
  major: '🟠 수정 권장',
  minor: '🟡 개선 제안',
  nit: '⚪ 사소함',
};

const SEVERITY_ALIASES = {
  critical: 'critical',
  blocker: 'critical',
  high: 'critical',
  error: 'critical',
  major: 'major',
  medium: 'major',
  warning: 'major',
  warn: 'major',
  minor: 'minor',
  low: 'minor',
  info: 'minor',
  informational: 'minor',
  nit: 'nit',
  nitpick: 'nit',
  style: 'nit',
  suggestion: 'nit',
  refactor: 'nit',
};

const SOURCE_LABEL = {
  codex: 'Codex',
  coderabbit: 'CodeRabbit',
};

/** @typedef {{severity: string, file: string, line: number, title: string, detail: string, suggestion: string, source: string}} Finding */

function parseArgs(argv) {
  const opts = { repo: '', pr: '', sha: '', status: {}, sources: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--repo' || arg === '--pr' || arg === '--sha') {
      opts[arg.slice(2)] = argv[i + 1] ?? '';
      i += 1;
    } else if (arg === '--status') {
      const raw = argv[i + 1] ?? '';
      i += 1;
      for (const pair of raw.split(',')) {
        const [name, value] = pair.split('=');
        if (name) opts.status[name.trim()] = (value ?? '').trim();
      }
    } else if (arg.includes('=')) {
      const idx = arg.indexOf('=');
      opts.sources.push({ name: arg.slice(0, idx), path: arg.slice(idx + 1) });
    }
  }
  return opts;
}

function normalizeSeverity(value) {
  if (typeof value !== 'string') return 'minor';
  return SEVERITY_ALIASES[value.trim().toLowerCase()] ?? 'minor';
}

function firstString(obj, keys) {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function firstNumber(obj, keys) {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
    if (typeof value === 'string' && /^\d+$/.test(value.trim())) return Number(value.trim());
  }
  return 0;
}

// 키 이름은 리뷰어마다 제각각이라 후보를 넉넉히 둔다. 대소문자 표기도 서로 다르다.
const FILE_KEYS = ['file', 'path', 'file_path', 'filePath', 'filename', 'fileName'];
const DETAIL_KEYS = [
  'detail', 'description', 'message', 'body', 'comment', 'rationale', 'codegenInstructions',
];
const TITLE_KEYS = ['title', 'summary', 'headline', 'name'];
const LINE_KEYS = ['line', 'line_number', 'lineNumber', 'start_line', 'startLine', 'start'];
const SUGGESTION_KEYS = ['suggestion', 'fix', 'patch', 'replacement', 'suggested_fix'];

function looksLikeFinding(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Boolean(firstString(value, FILE_KEYS) && firstString(value, [...DETAIL_KEYS, ...TITLE_KEYS]));
}

// CodeRabbit의 `codegenInstructions` 는 에이전트용 지시문이라 사람이 읽을 코멘트에는
// 군더더기가 붙어 있다. 고정 서문과 위치 접두사를 떼어내고 줄 번호만 건져낸다.
function refineDetail(text) {
  let body = text;
  let line = 0;

  const paragraphs = body.split('\n\n');
  if (paragraphs.length > 1 && /^Verify each finding against current code/.test(paragraphs[0])) {
    body = paragraphs.slice(1).join('\n\n').trim();
  }

  const location = body.match(/^In @?\S+\s+around lines?\s+(\d+)(?:\s*[-–]\s*\d+)?\s*,\s*/i);
  if (location) {
    line = Number(location[1]);
    body = body.slice(location[0].length).trim();
  }

  return { body, line };
}

// 단어 중간에서 끊기지 않게 자른다.
function clip(text, limit) {
  if (text.length <= limit) return text;
  const head = text.slice(0, limit);
  const lastSpace = head.lastIndexOf(' ');
  return `${(lastSpace > limit * 0.6 ? head.slice(0, lastSpace) : head).trimEnd()}…`;
}

function readSuggestion(raw) {
  const direct = firstString(raw, SUGGESTION_KEYS);
  if (direct) return direct;
  // CodeRabbit은 `suggestions` 배열로 준다. 문자열일 수도, 객체일 수도 있다.
  const list = raw.suggestions;
  if (!Array.isArray(list) || list.length === 0) return '';
  return list
    .map((item) => (typeof item === 'string' ? item : firstString(item ?? {}, [...SUGGESTION_KEYS, 'code', 'text'])))
    .filter(Boolean)
    .join('\n');
}

function toFinding(raw, source) {
  const refined = refineDetail(firstString(raw, DETAIL_KEYS));
  const detail = refined.body;
  // 제목 필드가 없는 리뷰어는 본문 첫 문장을 제목으로 쓴다. 그 경우 본문을 또 보여주지 않는다.
  const title = firstString(raw, TITLE_KEYS)
    || clip(detail.split('\n')[0].split(/(?<=[.。])\s/)[0], 100);
  return {
    source,
    severity: normalizeSeverity(firstString(raw, ['severity', 'level', 'priority', 'category'])),
    file: firstString(raw, FILE_KEYS),
    line: firstNumber(raw, LINE_KEYS) || refined.line,
    title,
    detail: detail && detail !== title ? detail : '',
    suggestion: readSuggestion(raw),
  };
}

// 리뷰어마다 JSON 모양이 달라서, 스키마를 가정하지 않고 트리를 훑어 finding처럼 생긴
// 객체를 모두 걷어낸다. CodeRabbit `--agent` 처럼 스키마가 문서화되지 않은 출력도 이 경로로 처리된다.
function collectFindings(node, source, out = [], seen = new Set(), depth = 0) {
  if (depth > 12 || node === null || typeof node !== 'object') return out;
  if (seen.has(node)) return out;
  seen.add(node);

  if (Array.isArray(node)) {
    for (const item of node) collectFindings(item, source, out, seen, depth + 1);
    return out;
  }

  if (looksLikeFinding(node)) {
    out.push(toFinding(node, source));
    return out;
  }

  for (const value of Object.values(node)) {
    collectFindings(value, source, out, seen, depth + 1);
  }
  return out;
}

// 통짜 JSON이면 그대로, 아니면 NDJSON/로그 섞인 출력에서 줄 단위로 JSON을 건져낸다.
function parseLoosely(text) {
  const trimmed = text.trim();
  if (!trimmed) return [];
  try {
    return [JSON.parse(trimmed)];
  } catch {
    // 아래 줄 단위 파싱으로 넘어간다.
  }
  const parsed = [];
  for (const line of trimmed.split('\n')) {
    const candidate = line.trim();
    if (!candidate.startsWith('{') && !candidate.startsWith('[')) continue;
    try {
      parsed.push(JSON.parse(candidate));
    } catch {
      // JSON이 아닌 로그 줄은 버린다.
    }
  }
  return parsed;
}

function readSource({ name, path }) {
  if (!path || !existsSync(path)) {
    return { name, findings: [], summary: '', parsed: false };
  }
  const text = readFileSync(path, 'utf8');
  const documents = parseLoosely(text);
  if (documents.length === 0) {
    return { name, findings: [], summary: '', parsed: false };
  }

  const findings = [];
  let summary = '';
  for (const doc of documents) {
    if (!summary && doc && typeof doc === 'object' && !Array.isArray(doc)) {
      summary = firstString(doc, ['summary', 'overview', 'high_level_summary']);
    }
    collectFindings(doc, name, findings);
  }
  return { name, findings, summary, parsed: true };
}

function dedupe(findings) {
  const byKey = new Map();
  let serial = 0;

  for (const finding of findings) {
    const key = `${finding.file}:${finding.line}:${finding.title.toLowerCase()}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...finding, sources: [finding.source] });
      continue;
    }

    // 한 리뷰어가 같은 위치·제목으로 서로 다른 내용을 지적할 수 있다. 이걸 병합하면
    // 한쪽이 사라지므로, 같은 리뷰어의 다른 내용은 별개 항목으로 남긴다.
    if (existing.sources.includes(finding.source) && existing.detail !== finding.detail) {
      serial += 1;
      byKey.set(`${key}#${serial}`, { ...finding, sources: [finding.source] });
      continue;
    }

    // 두 리뷰어가 같은 곳을 지적하면 한 항목으로 묶고 더 높은 심각도를 채택한다.
    if (!existing.sources.includes(finding.source)) existing.sources.push(finding.source);
    if (SEVERITIES.indexOf(finding.severity) < SEVERITIES.indexOf(existing.severity)) {
      existing.severity = finding.severity;
    }
    if (finding.detail.length > existing.detail.length) existing.detail = finding.detail;
    if (!existing.suggestion && finding.suggestion) existing.suggestion = finding.suggestion;
  }
  return [...byKey.values()].sort((a, b) => {
    const bySeverity = SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity);
    if (bySeverity !== 0) return bySeverity;
    return a.file.localeCompare(b.file) || a.line - b.line;
  });
}

// 경로에 공백이나 #, ? 가 있으면 링크가 끊긴다. 다만 통째로 인코딩하면 구분자 `/` 까지
// %2F 가 되어 더 나빠지므로 세그먼트별로 인코딩한다.
function encodePath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

function locationMarkdown(finding, repo, sha) {
  if (!finding.file) return '';
  const anchor = finding.line > 0 ? `#L${finding.line}` : '';
  const label = finding.line > 0 ? `${finding.file}:${finding.line}` : finding.file;
  if (!repo || !sha) return `\`${label}\``;
  return `[\`${label}\`](https://github.com/${repo}/blob/${sha}/${encodePath(finding.file)}${anchor})`;
}

// 제안 코드 안에 백틱이 들어 있어도 깨지지 않도록 울타리 길이를 늘려 잡는다.
function codeBlock(code) {
  const longestRun = Math.max(0, ...[...code.matchAll(/`+/g)].map((m) => m[0].length));
  const fence = '`'.repeat(Math.max(3, longestRun + 1));
  return `${fence}\n${code}\n${fence}`;
}

function renderFinding(finding, repo, sha) {
  const badges = finding.sources.map((s) => SOURCE_LABEL[s] ?? s).join(' · ');
  const location = locationMarkdown(finding, repo, sha);
  // <summary> 는 한 줄이어야 한다. 제목에 개행이 섞여 들어오면 토글이 통째로 깨진다.
  const title = finding.title.replace(/\s*\n+\s*/g, ' ').trim();
  const head = [location, title && `**${title}**`].filter(Boolean).join(' — ');

  // 펼칠 내용이 없으면 빈 토글 대신 한 줄로 보여준다.
  if (!finding.detail && !finding.suggestion) return `- ${head} <sub>${badges}</sub>`;

  const lines = [`<details><summary>${head} <sub>${badges}</sub></summary>`, ''];
  if (finding.detail) lines.push(finding.detail, '');
  if (finding.suggestion) {
    lines.push(codeBlock(finding.suggestion), '');
  }
  lines.push('</details>');
  return lines.join('\n');
}

function renderStatusLine(sources, statuses) {
  return sources
    .map(({ name, findings, parsed }) => {
      const label = SOURCE_LABEL[name] ?? name;
      const outcome = statuses[name];
      if (outcome === 'skipped') return `${label} ⏭️ 건너뜀`;
      if (outcome && outcome !== 'success') return `${label} ⚠️ 실패`;
      if (!parsed) return `${label} ⚠️ 출력 없음`;
      return `${label} ✅ ${findings.length}건`;
    })
    .join(' · ');
}

function renderBody({ sources, statuses, findings, repo, sha }) {
  const parts = [MARKER, '## 🤖 AI 코드 리뷰', ''];

  const shaShort = sha ? sha.slice(0, 7) : '';
  const meta = [shaShort ? `커밋 \`${shaShort}\` 기준` : '', renderStatusLine(sources, statuses)]
    .filter(Boolean)
    .join(' · ');
  if (meta) parts.push(`> ${meta}`, '');

  const summaries = sources.filter((s) => s.summary);
  if (summaries.length > 0) {
    for (const source of summaries) {
      parts.push(`**${SOURCE_LABEL[source.name] ?? source.name}**: ${source.summary}`, '');
    }
  }

  if (findings.length === 0) {
    parts.push('지적 사항이 없습니다.');
    return parts.join('\n');
  }

  for (const severity of SEVERITIES) {
    const group = findings.filter((f) => f.severity === severity);
    if (group.length === 0) continue;
    parts.push(`### ${SEVERITY_LABEL[severity]} (${group.length})`, '');
    for (const finding of group) parts.push(renderFinding(finding, repo, sha), '');
  }

  return parts.join('\n');
}

function truncate(body) {
  if (body.length <= COMMENT_LIMIT) return body;
  const notice = '\n\n---\n\n_리뷰 내용이 너무 길어 일부를 잘랐습니다. 전체 내용은 Actions 로그를 확인해 주세요._';

  let cut = body.slice(0, COMMENT_LIMIT - notice.length);
  // <details> 한가운데를 자르면 닫는 태그가 사라져 이후 내용이 통째로 안 보인다.
  // 마지막으로 온전히 닫힌 지점까지 되돌린다.
  const opened = (cut.match(/<details>/g) ?? []).length;
  const closed = (cut.match(/<\/details>/g) ?? []).length;
  if (opened > closed) {
    const lastClose = cut.lastIndexOf('</details>');
    cut = lastClose === -1 ? cut.slice(0, cut.indexOf('<details>')) : cut.slice(0, lastClose + '</details>'.length);
  }
  return `${cut}${notice}`;
}

function gh(args, input) {
  return execFileSync('gh', args, {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    input,
  });
}

// `gh api --paginate` 는 페이지마다 JSON 문서를 따로 뱉기 때문에 통째로 JSON.parse 하면
// 코멘트가 한 페이지(30개)를 넘는 순간 깨진다. --jq 로 항목을 풀어 NDJSON으로 받는다.
// 마커만 보고 고르면 아무나 그 문자열이 든 코멘트를 먼저 달아 우리 리뷰가 남의 코멘트를
// 덮어쓰게 만들 수 있다. 작성자가 우리 봇인지도 함께 확인한다.
function findStickyComment(repo, pr) {
  const raw = gh([
    'api', '--paginate', `repos/${repo}/issues/${pr}/comments`,
    '--jq', '.[] | {id: .id, body: .body, login: .user.login}',
  ]);
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let comment;
    try {
      comment = JSON.parse(line);
    } catch {
      continue;
    }
    if (comment?.login !== BOT_LOGIN) continue;
    if (typeof comment?.body === 'string' && comment.body.includes(MARKER)) return comment;
  }
  return null;
}

function upsertComment(repo, pr, body) {
  const existing = findStickyComment(repo, pr);
  if (existing && existing.body.trim() === body.trim()) {
    console.log(`변경 사항이 없어 코멘트를 그대로 둡니다 (id=${existing.id}).`);
    return;
  }

  const bodyFile = join(mkdtempSync(join(tmpdir(), 'ai-review-')), 'body.md');
  writeFileSync(bodyFile, body, 'utf8');

  if (existing) {
    gh(['api', '-X', 'PATCH', `repos/${repo}/issues/comments/${existing.id}`, '-F', `body=@${bodyFile}`]);
    console.log(`기존 코멘트를 갱신했습니다 (id=${existing.id}).`);
  } else {
    gh(['api', '-X', 'POST', `repos/${repo}/issues/${pr}/comments`, '-F', `body=@${bodyFile}`]);
    console.log('리뷰 코멘트를 새로 작성했습니다.');
  }
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.repo || !opts.pr) {
    console.error('--repo 와 --pr 은 필수입니다.');
    process.exit(64);
  }

  const sources = opts.sources.map(readSource);
  const findings = dedupe(sources.flatMap((s) => s.findings));

  const body = truncate(
    renderBody({ sources, statuses: opts.status, findings, repo: opts.repo, sha: opts.sha }),
  );

  if (process.env.AI_REVIEW_DRY_RUN === '1') {
    process.stdout.write(`${body}\n`);
    return;
  }

  upsertComment(opts.repo, opts.pr, body);
}

main();
