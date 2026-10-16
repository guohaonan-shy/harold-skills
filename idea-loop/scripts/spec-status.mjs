#!/usr/bin/env node
/**
 * The one way a spec's status changes, and the one way a backlog entry is marked as handed over.
 *
 * A spec walks 草稿 → 审核中 → 设计中 → 在飞 (references/spec-status.md). Each step has one writer and
 * a precondition that can be read off the files: 设计中 only for a spec that touches UI, 在飞 only once
 * the design is frozen (a 冻结摘要 under §4) and the tickets are cut. Skills used to flip the
 * frontmatter by hand and refresh docs/spec/index.md by hand; a flip that skipped its precondition,
 * or an index that kept the old status, went unnoticed until a later stage refused to start. Here the
 * transition is checked, written and indexed in one call, and anything illegal is refused with the
 * reason.
 *
 * Backlog entries covered by a spec carry 「已移交 → [[<spec-slug>]]」 so the drafting routine does
 * not draft them again. The backlog has two shapes — a table with a status column, a checklist —
 * and the mark is written and removed here for both, so the routine can filter on one literal.
 *
 * Layout (references/wiki-conventions.md §2): docs/spec/<slug>/<slug>.md, tickets in
 * docs/spec/<slug>/tickets/NN-<slug>.md, the index at docs/spec/index.md.
 *
 * Usage:
 *   node spec-status.mjs set       <docs-dir> <spec-slug> <status>            → checks, writes, re-indexes
 *   node spec-status.mjs index     <docs-dir>                                 → regenerates docs/spec/index.md
 *   node spec-status.mjs check     <docs-dir>                                 → JSON: specs, problems (old flat layout, bad status)
 *   node spec-status.mjs handoff   <backlog-file> <spec-slug> <entry>         → marks one entry
 *   node spec-status.mjs unhandoff <backlog-file> <spec-slug> <entry> [<status>] → removes the mark (table rows get <status>, default 待办)
 * <entry> is `#<n>` for the table row whose first cell is n, or a piece of text found on exactly one entry line.
 * A spec that lists GitHub issues in its frontmatter (`issues: [12, 15]`) has their status labels
 * synced after `set` (issues.mjs, references/spec-status.md §3); a failed sync leaves the status written
 * and says how to retry.
 * Exit: 0 = done, 1 = refused / usage / io error (the reason on stderr).
 */

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { defaultGh, issuesOf, syncIssues } from './issues.mjs';

export const STATUSES = ['草稿', '审核中', '设计中', '在飞', '已拍板未排期', 'parked'];

/** Legal next statuses. Preconditions on top of these live in transitionError. */
export const NEXT = {
  草稿: ['审核中', 'parked'],
  审核中: ['设计中', '在飞', '已拍板未排期', 'parked'],
  设计中: ['在飞', '审核中', '已拍板未排期', 'parked'],
  在飞: ['parked'],
  已拍板未排期: ['审核中', 'parked'],
  parked: ['审核中', '已拍板未排期'],
};

export const MARK = (slug) => `已移交 → [[${slug}]]`;
const ANY_MARK = /已移交 → \[\[([^\]]+)\]\]/;

// ---------- spec text ----------

export function frontmatter(md = '') {
  const m = String(md).match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  const out = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^(\w+):\s*(.*?)\s*(#.*)?$/);
    if (kv) out[kv[1]] = kv[2];
  }
  return out;
}

export function withStatus(md, status) {
  if (!/^---\n[\s\S]*?\n---/.test(md)) throw new Error('spec has no frontmatter');
  const [, head, rest] = md.match(/^(---\n[\s\S]*?\n---)([\s\S]*)$/);
  if (!/^status:/m.test(head)) throw new Error('spec frontmatter has no status line');
  return head.replace(/^status:.*$/m, `status: ${status}`) + rest;
}

/** Body of the first heading whose text includes `title`, up to the next heading of the same or higher level. */
export function section(md, title) {
  const lines = String(md).split('\n');
  const start = lines.findIndex((l) => /^#{1,6}\s/.test(l) && l.includes(title));
  if (start < 0) return null;
  const level = lines[start].match(/^#+/)[0].length;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => {
    const h = l.match(/^(#+)\s/);
    return h && h[1].length <= level;
  });
  return (end < 0 ? rest : rest.slice(0, end)).join('\n');
}

/** §5.3 前端交互 says 不涉及 → the spec does not touch UI. A missing section counts as touching nothing. */
export function touchesUi(md) {
  const ui = section(md, '前端交互');
  return ui !== null && !/^\s*(>\s*)?不涉及/.test(ui.trim());
}

export const needsGrill = (md) => /^>\s*需要 grill/m.test(String(md));
export const hasFreezeSummary = (md) => section(section(md, '实现决策') ?? '', '冻结摘要') !== null;

/** Why `from → to` is refused, or null when it is allowed. */
export function transitionError(from, to, md, ticketCount) {
  if (!STATUSES.includes(to)) return `「${to}」不是合法状态（${STATUSES.join(' / ')}）`;
  if (!STATUSES.includes(from)) return `spec 现在的状态「${from || '没写'}」不在状态机里，先按 wiki-conventions §2.2 迁移`;
  if (from === to) return `spec 已经是「${to}」`;
  if (!NEXT[from].includes(to)) return `「${from}」不能直接翻成「${to}」（能翻成：${NEXT[from].join(' / ')}）`;
  if ((to === '设计中' || to === '在飞') && needsGrill(md)) return 'spec 开头标着「需要 grill」，先 grill 再往下走';
  if (to === '设计中' && !touchesUi(md)) return 'spec 的 §5.3 前端交互写的是「不涉及」——不碰 UI 的 spec 不进设计';
  if (to === '在飞') {
    if (from === '审核中' && touchesUi(md)) return 'spec 碰 UI（§5.3 不是「不涉及」）——先走设计，冻结后再切票';
    if (from === '设计中' && !hasFreezeSummary(md)) return 'spec 的 §4 里还没有「冻结摘要」——设计没冻结';
    if (!ticketCount) return 'spec 目录下的 tickets/ 里一张工单都没有——切完工单才翻在飞';
  }
  return null;
}

// ---------- index ----------

const DEFAULT_INDEX = `# spec
> 契约：还没了结的规格，一份一个目录（\`<slug>/<slug>.md\`，工单在 \`<slug>/tickets/\`）——做完整个目录删（删前必须先写 ADR）。

| 文件 | status | summary |
|---|---|---|
`;

/** Replaces the rows of the index table, keeping everything above and below it. */
export function renderIndex(existing, specs) {
  const lines = String(existing || DEFAULT_INDEX).split('\n');
  let header = lines.findIndex((l) => /^\|\s*文件\s*\|/.test(l));
  if (header < 0) return renderIndex(DEFAULT_INDEX + '\n' + String(existing || '').trim() + '\n', specs);
  let end = header + 2;
  while (end < lines.length && lines[end].startsWith('|')) end++;
  const rows = [...specs]
    .sort((a, b) => a.slug.localeCompare(b.slug))
    .map((s) => `| [[${s.slug}]] | ${s.status ?? ''} | ${s.summary ?? ''} |`);
  return [...lines.slice(0, header + 2), ...rows, ...lines.slice(end)].join('\n');
}

// ---------- backlog marks ----------

const cells = (row) => row.split(/(?<!\\)\|/).slice(1, -1);
const isRow = (l) => /^\|/.test(l) && !/^\|[\s:|-]+\|\s*$/.test(l);
const isItem = (l) => /^\s*- \[[ xX]\]/.test(l);

function findEntry(lines, entry) {
  const num = String(entry).match(/^#(\d+)$/);
  const hits = lines
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => (num ? isRow(l) && cells(l)[0]?.trim() === num[1] : (isRow(l) || isItem(l)) && l.includes(entry)));
  if (hits.length !== 1) throw new Error(`「${entry}」对上了 ${hits.length} 个条目，要恰好一个`);
  return hits[0].i;
}

function setLastCell(row, value) {
  const parts = row.split(/(?<!\\)\|/);
  parts[parts.length - 2] = ` ${value} `;
  return parts.join('|');
}

export function handoff(text, slug, entry) {
  const lines = String(text).split('\n');
  const i = findEntry(lines, entry);
  const other = lines[i].match(ANY_MARK);
  if (other) {
    if (other[1] === slug) return text;
    throw new Error(`这个条目已经移交给 [[${other[1]}]]`);
  }
  lines[i] = isRow(lines[i]) ? setLastCell(lines[i], MARK(slug)) : `${lines[i].replace(/\s+$/, '')} ${MARK(slug)}`;
  return lines.join('\n');
}

export function unhandoff(text, slug, entry, restore = '待办') {
  const lines = String(text).split('\n');
  const i = findEntry(lines, entry);
  const mark = lines[i].match(ANY_MARK);
  if (!mark) return text;
  if (mark[1] !== slug) throw new Error(`这个条目移交给的是 [[${mark[1]}]]，不是 [[${slug}]]`);
  lines[i] = isRow(lines[i]) ? setLastCell(lines[i], restore) : lines[i].replace(` ${MARK(slug)}`, '').replace(MARK(slug), '');
  return lines.join('\n');
}

// ---------- io boundary ----------

const read = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : '');
const isDir = (p) => existsSync(p) && statSync(p).isDirectory();

export function scan(docs) {
  const root = join(docs, 'spec');
  const specs = [];
  const problems = [];
  if (!isDir(root)) return { specs, problems };
  for (const name of readdirSync(root)) {
    const p = join(root, name);
    if (name === 'tickets' && isDir(p)) problems.push(`docs/spec/tickets/ 是旧的平铺布局，按 wiki-conventions §2.2 迁移`);
    else if (name.endsWith('.md') && name !== 'index.md') problems.push(`docs/spec/${name} 是旧的平铺布局，按 wiki-conventions §2.2 迁移`);
    else if (isDir(p)) {
      const file = join(p, `${name}.md`);
      if (!existsSync(file)) { problems.push(`docs/spec/${name}/ 里没有 ${name}.md`); continue; }
      const fm = frontmatter(read(file));
      const tickets = isDir(join(p, 'tickets')) ? readdirSync(join(p, 'tickets')).filter((f) => f.endsWith('.md')).length : 0;
      if (!STATUSES.includes(fm.status)) problems.push(`docs/spec/${name}/${name}.md 的 status「${fm.status ?? '没写'}」不在状态机里`);
      specs.push({ slug: name, file, status: fm.status, summary: fm.summary, tickets });
    }
  }
  return { specs, problems };
}

function reindex(docs) {
  const file = join(docs, 'spec', 'index.md');
  writeFileSync(file, renderIndex(read(file), scan(docs).specs));
}

function main() {
  const [cmd, a, b, c, d] = process.argv.slice(2);
  if (cmd === 'set' && a && b && c) {
    const file = join(a, 'spec', b, `${b}.md`);
    if (!existsSync(file)) throw new Error(`没有 ${file}`);
    const md = read(file);
    const ticketDir = join(a, 'spec', b, 'tickets');
    const tickets = isDir(ticketDir) ? readdirSync(ticketDir).filter((f) => f.endsWith('.md')).length : 0;
    const why = transitionError(frontmatter(md).status, c, md, tickets);
    if (why) throw new Error(`拒绝：${why}`);
    writeFileSync(file, withStatus(md, c));
    reindex(a);
    console.log(`${b}: ${frontmatter(md).status} → ${c}`);
    if (issuesOf(md).length) {
      try {
        syncIssues(defaultGh(a), a, b).forEach((l) => console.log(l));
      } catch (error) {
        console.error(`状态已写入，issue 标签没同步：${String(error.stderr ?? '').trim() || error.message}——修好后跑 issues.mjs sync ${a} ${b}`);
      }
    }
    return;
  }
  if (cmd === 'index' && a) return reindex(a);
  if (cmd === 'check' && a) return console.log(JSON.stringify(scan(a), null, 2));
  if ((cmd === 'handoff' || cmd === 'unhandoff') && a && b && c) {
    if (!existsSync(a)) throw new Error(`没有 ${a}`);
    const text = read(a);
    writeFileSync(a, cmd === 'handoff' ? handoff(text, b, c) : unhandoff(text, b, c, d));
    return;
  }
  throw new Error('usage: spec-status.mjs set <docs-dir> <spec-slug> <status> | index <docs-dir> | check <docs-dir> | handoff <backlog-file> <spec-slug> <entry> | unhandoff <backlog-file> <spec-slug> <entry> [<status>]');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
