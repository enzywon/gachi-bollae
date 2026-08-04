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

function looksLikeFinding(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const hasLocation = firstString(value, ['file', 'path', 'file_path', 'filePath', 'filename']);
  const hasMessage = firstString(value, [
    'detail', 'description', 'message', 'body', 'comment', 'title', 'summary',
  ]);
  return Boolean(hasLocation && hasMessage);
}

function toFinding(raw, source) {
  const detail = firstString(raw, ['detail', 'description', 'message', 'body', 'comment', 'rationale']);
  // 제목 필드가 없는 리뷰어는 본문 첫 줄을 제목으로 쓴다. 그 경우 본문을 또 보여주지 않는다.
  const title = firstString(raw, ['title', 'summary', 'headline', 'name']) || detail.split('\n')[0].slice(0, 80);
  return {
    source,
    severity: normalizeSeverity(firstString(raw, ['severity', 'level', 'priority', 'category', 'type'])),
    file: firstString(raw, ['file', 'path', 'file_path', 'filePath', 'filename']),
    line: firstNumber(raw, ['line', 'line_number', 'lineNumber', 'start_line', 'startLine', 'start']),
    title,
    detail: detail && detail !== title ? detail : '',
    suggestion: firstString(raw, ['suggestion', 'fix', 'patch', 'replacement', 'suggested_fix']),
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
  for (const finding of findings) {
    const key = `${finding.file}:${finding.line}:${finding.title.toLowerCase()}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...finding, sources: [finding.source] });
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

function locationMarkdown(finding, repo, sha) {
  if (!finding.file) return '';
  const anchor = finding.line > 0 ? `#L${finding.line}` : '';
  const label = finding.line > 0 ? `${finding.file}:${finding.line}` : finding.file;
  if (!repo || !sha) return `\`${label}\``;
  return `[\`${label}\`](https://github.com/${repo}/blob/${sha}/${finding.file}${anchor})`;
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
  const head = [location, `**${finding.title}**`].filter(Boolean).join(' — ');

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
  return `${body.slice(0, COMMENT_LIMIT - notice.length)}${notice}`;
}

function gh(args, input) {
  return execFileSync('gh', args, {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    input,
  });
}

function findStickyComment(repo, pr) {
  const raw = gh(['api', '--paginate', `repos/${repo}/issues/${pr}/comments`]);
  let comments;
  try {
    comments = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(comments)) return null;
  return comments.find((c) => typeof c?.body === 'string' && c.body.includes(MARKER)) ?? null;
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
