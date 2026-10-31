#!/usr/bin/env node
/**
 * How many times has each candidate in the retro pool come up — counted, not guessed.
 *
 * `idea-loop:retro` puts a rule candidate the human approved but did not yet send into a skill into a pool
 * (`docs/records/retro-candidates/`, one file per candidate). `dreaming` and `retro` need to know how many
 * times each one has occurred, and "is this the same kind" is a judgement the retro session makes and the
 * human checks when the line is written; what is left is arithmetic, so it lives here.
 *
 * A candidate file has the shape: frontmatter (type, captured, title, tags); bullets 信号 / 落点 / 旧文 /
 * 新文 / 归并 / 验证 / 例子 (归并 and 验证 are not checked, older files lack them); one bullet `- 状态：<在池里 | 已开 issue（<链接>） | 驳回（<理由>）>`; then a `## 出现` section,
 * one bullet per occurrence:
 *
 *   - <repo>#<number>（<date>）：「<verbatim words>」；决定记录：<link>
 *   - <repo>#<number>（<date>）：「<verbatim words>」；决定记录：<link>（已推翻：「<words that overturned it>」）
 *
 * The count is the number of distinct sessions (`<repo>#<number>`) among the occurrence lines that are not
 * marked 已推翻. Two lines from one session are one occurrence; an overturned line stays in the file but
 * does not count. A candidate passes when the count reaches THRESHOLD — the human's words in the grill
 * behind this ("出现超过两次") put it at 3.
 *
 * A file whose shape is wrong (no 出现 section or an empty one, an occurrence line naming no session, no
 * 状态 line or one outside the closed set, no 落点, no title) is reported as a problem and the exit is
 * non-zero: a count read off a broken file would be a quiet wrong number.
 *
 * Pure parsing; the CLI at the bottom is the only thing that reads the disk.
 *
 * Usage:  node retro-pool-count.mjs <pool-dir>
 * Output: JSON { threshold, candidates: [{ file, title, landing, status, statusDetail, count, passes }], problems: [{ file, message }] }
 * Exit:   0 = every file well-formed; 1 = usage / unreadable directory; 2 = at least one problem
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { splitFrontmatter } from './mini-yaml.mjs';

export const THRESHOLD = 3;

const STATUS_FORMS = [
  { kind: '在池里', re: /^在池里$/ },
  { kind: '已开 issue', re: /^已开 issue（(.+)）$/ },
  { kind: '驳回', re: /^驳回（(.+)）$/ },
];

const OVERTURNED = /[（(]已推翻[：:]/;
const SESSION = /^[-*]\s+([\w.\/-]+#\d+)/;

/** The text of the first `- <label>：…` bullet, or null. */
function bullet(body, label) {
  const m = body.match(new RegExp(`^[-*]\\s*${label}[：:]\\s*(.+?)\\s*$`, 'm'));
  return m ? m[1] : null;
}

/** The bullet lines under the `## 出现` heading, or null when there is no such heading. */
function occurrenceLines(body) {
  const lines = body.split('\n');
  const start = lines.findIndex((l) => /^##\s+出现\s*$/.test(l));
  if (start < 0) return null;
  const out = [];
  for (const l of lines.slice(start + 1)) {
    if (/^#{1,2}\s/.test(l)) break;
    if (/^[-*]\s/.test(l)) out.push(l);
  }
  return out;
}

/** One candidate file → what the pool needs to know about it. */
export function parseCandidate(md, file) {
  const problems = [];
  const { fm, body, error } = splitFrontmatter(md);
  if (error) problems.push(`frontmatter 读不了：${error}`);
  const title = fm && typeof fm.title === 'string' && fm.title.trim() ? fm.title.trim() : null;
  if (!title) problems.push('frontmatter 缺 title');

  const landing = bullet(body, '落点');
  if (!landing) problems.push('缺「落点」');

  let status = null;
  let statusDetail = null;
  const statusText = bullet(body, '状态');
  if (statusText === null) {
    problems.push('缺「状态」');
  } else {
    const form = STATUS_FORMS.map((f) => ({ kind: f.kind, m: statusText.match(f.re) })).find((f) => f.m);
    if (form) {
      status = form.kind;
      statusDetail = form.m[1] ?? null;
    } else {
      problems.push(`「状态」不在闭集里（在池里 / 已开 issue（链接） / 驳回（理由））：${statusText}`);
    }
  }

  let count = 0;
  const lines = occurrenceLines(body);
  if (lines === null) {
    problems.push('缺「出现」一节');
  } else if (lines.length === 0) {
    problems.push('「出现」一节里没有一行');
  } else {
    const standing = new Set();
    for (const l of lines) {
      const session = l.match(SESSION)?.[1];
      if (!session) {
        problems.push(`「出现」里有一行认不出会话（该以 <仓库>#<号> 开头）：${l.slice(0, 40)}`);
        continue;
      }
      if (!OVERTURNED.test(l)) standing.add(session);
    }
    count = standing.size;
  }

  const valid = problems.length === 0;
  return {
    candidate: { file, title, landing, status, statusDetail, count, passes: valid && count >= THRESHOLD },
    problems: problems.map((message) => ({ file, message })),
  };
}

/** [{ file, md }] → { threshold, candidates, problems } */
export function countPool(files) {
  const candidates = [];
  const problems = [];
  for (const { file, md } of files) {
    const r = parseCandidate(md, file);
    candidates.push(r.candidate);
    problems.push(...r.problems);
  }
  return { threshold: THRESHOLD, candidates, problems };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const dir = process.argv[2];
  if (!dir) {
    console.error('usage: node retro-pool-count.mjs <pool-dir>');
    process.exit(1);
  }
  let files;
  try {
    files = readdirSync(dir)
      .filter((n) => n.endsWith('.md') && n !== 'index.md')
      .sort()
      .map((file) => ({ file, md: readFileSync(join(dir, file), 'utf8') }));
  } catch (e) {
    console.error(`retro-pool-count: cannot read ${dir}: ${e.message}`);
    process.exit(1);
  }
  const result = countPool(files);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.problems.length ? 2 : 0);
}
