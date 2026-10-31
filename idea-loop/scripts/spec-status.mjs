#!/usr/bin/env node
/**
 * The one way a spec's status changes.
 *
 * A spec is a document, and its status says how far the document has got — not where the work is
 * queued: that is the issue label's job (issues.mjs). 草稿 while it is being written; 审核中 while
 * something in it waits for a human (a 「需要 grill」 line, a 「待定」 fork under 实现决策) and the
 * human settles it in the session; 正式 once nothing waits, and design and implementation work from
 * it; 实现中 once its tickets are cut; 完成 once the implementation PR merges, or straight from the
 * draft when every issue it covers turned out not to exist (the quoted lines under its title say so; older specs say it in a 「验证」 table). Each step has
 * a precondition that can be read off the files, checked here before the status is written; the
 * index is refreshed in the same call. This script never touches GitHub.
 *
 * Layout (skills/productivity/wiki-conventions/SKILL.md): docs/spec/<slug>/<slug>.md, tickets in
 * docs/spec/<slug>/tickets/NN-<slug>.md, the index at docs/spec/index.md.
 *
 * Usage:
 *   node spec-status.mjs set       <docs-dir> <spec-slug> <status>   → checks, writes, re-indexes
 *   node spec-status.mjs route     <docs-dir> <spec-slug>            → a 草稿: on to 完成 / 审核中 / 正式 by what is in it
 *   node spec-status.mjs index     <docs-dir>                        → regenerates docs/spec/index.md
 *   node spec-status.mjs check     <docs-dir>                        → JSON: specs, problems (old flat layout, bad status)
 *   node spec-status.mjs migrate   <docs-dir>                        → rewrites statuses of the old state machine
 * Exit: 0 = done, 1 = refused / usage / io error (the reason on stderr).
 */

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const STATUSES = ['草稿', '审核中', '正式', '实现中', '完成'];

/** Legal next statuses. Preconditions on top of these live in transitionError. */
export const NEXT = {
  草稿: ['审核中', '正式', '完成'],
  审核中: ['正式', '完成'],
  正式: ['实现中', '审核中'],
  实现中: ['完成'],
  完成: [],
};

/** The old state machine's statuses, and what each becomes. A parked spec becomes 正式; the parking moves to its issues' label. */
export const MIGRATE = { 待设计: '正式', 设计中: '正式', 待实现: '正式', 在飞: '实现中', 已拍板未排期: '正式', 搁置: '正式', parked: '正式' };

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

/** The issues a spec covers: frontmatter `issues: [12, 15]`. */
export function issuesOf(md) {
  const raw = frontmatter(md).issues;
  if (!raw) return [];
  return [...raw.matchAll(/\d+/g)].map((m) => Number(m[0]));
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

/** 「前端交互」 says 不涉及 → the spec does not touch UI. A missing section counts as touching nothing. */
export function touchesUi(md) {
  const ui = section(md, '前端交互');
  return ui !== null && !/^\s*(>\s*)?不涉及/.test(ui.trim());
}

export const needsGrill = (md) => /^>\s*需要 grill/m.test(String(md));
export const hasFreezeSummary = (md) => section(section(md, '实现决策') ?? '', '冻结摘要') !== null;

/** What in the spec still waits for a human; empty when it can be 正式. */
export function forHuman(md) {
  const out = [];
  if (needsGrill(md)) out.push('开头标着「需要 grill」');
  const forks = (section(md, '实现决策') ?? '').split('\n').filter((l) => /^#{2,6}\s+待定/.test(l)).length;
  if (forks) out.push(`「实现决策」里还有 ${forks} 条「待定」`);
  return out;
}

/**
 * Whether each covered issue exists. Current specs open with one quoted line per issue, straight under
 * the title: `> #12 存在：…` or `> #12 不存在：…`. Specs written before that carry a 「验证」 table with
 * a row per issue, `| #12 | 存在 | … |`; it is still read, and the opening lines win when both say something.
 */
export function verdicts(md) {
  const out = new Map();
  const opening = [];
  for (const line of String(md).replace(/^---\n[\s\S]*?\n---\n?/, '').split('\n')) {
    if (/^##\s/.test(line)) break;
    opening.push(line);
  }
  for (const line of opening) {
    const m = line.match(/^>\s*#(\d+)\s*(不存在|存在)\s*[：:]/);
    if (m) out.set(Number(m[1]), m[2]);
  }
  for (const line of (section(md, '验证') ?? '').split('\n')) {
    const m = line.match(/^\|\s*#(\d+)\s*\|\s*(存在|不存在)\s*\|/);
    if (m && !out.has(Number(m[1]))) out.set(Number(m[1]), m[2]);
  }
  return out;
}

/** Every issue the spec covers was verified as not existing. */
export function allAbsent(md) {
  const list = issuesOf(md);
  const v = verdicts(md);
  return list.length > 0 && list.every((n) => v.get(n) === '不存在');
}

/** Why `from → to` is refused, or null when it is allowed. */
export function transitionError(from, to, md, ticketCount) {
  if (!STATUSES.includes(to)) return `「${to}」不是合法状态（${STATUSES.join(' / ')}）`;
  if (!STATUSES.includes(from)) return `spec 现在的状态「${from || '没写'}」不在状态机里，先跑 spec-status.mjs migrate`;
  if (from === to) return `spec 已经是「${to}」`;
  if (!NEXT[from].includes(to)) return `「${from}」不能直接翻成「${to}」（能翻成：${NEXT[from].join(' / ') || '无'}）`;
  if (to === '正式') {
    if (forHuman(md).length) return `spec 里还有等人定的：${forHuman(md).join('；')}`;
    if (allAbsent(md)) return '开头的结论里它覆盖的 issue 全都不存在——翻「完成」';
  }
  if (to === '完成' && from !== '实现中' && !allAbsent(md)) return '只有开头的结论里它覆盖的 issue 全都不存在，才能不经实现直接翻「完成」';
  if (to === '实现中') {
    if (!ticketCount) return 'spec 目录下的 tickets/ 里一张工单都没有——切完工单才翻实现中';
    if (touchesUi(md) && !hasFreezeSummary(md)) return 'spec 碰 UI，「实现决策」里还没有「冻结摘要」——设计没冻结';
  }
  return null;
}

/** Where a 草稿 goes once written: 完成 when every issue is absent, 审核中 when something waits for a human, else 正式. */
export function routeOf(md) {
  if (allAbsent(md)) return '完成';
  return forHuman(md).length ? '审核中' : '正式';
}

// ---------- index ----------

const DEFAULT_INDEX = `# spec
> 契约：还没了结的规格，一份一个目录（\`<slug>/<slug>.md\`，工单在 \`<slug>/tickets/\`）——做完整个目录删（删前必须先写 ADR）。

| 文件 | summary |
|---|---|
`;

/**
 * Replaces the index table, keeping everything above and below it. No status column: the status
 * lives in each spec's frontmatter and changes on every stage's PR, so a column here would make
 * PRs running side by side conflict on this file. An old table with a status column is rewritten.
 */
export function renderIndex(existing, specs) {
  const lines = String(existing || DEFAULT_INDEX).split('\n');
  let header = lines.findIndex((l) => /^\|\s*文件\s*\|/.test(l));
  if (header < 0) return renderIndex(DEFAULT_INDEX + '\n' + String(existing || '').trim() + '\n', specs);
  let end = header + 2;
  while (end < lines.length && lines[end].startsWith('|')) end++;
  const rows = [...specs]
    .sort((a, b) => a.slug.localeCompare(b.slug))
    .map((s) => `| [[${s.slug}]] | ${s.summary ?? ''} |`);
  return [...lines.slice(0, header), '| 文件 | summary |', '|---|---|', ...rows, ...lines.slice(end)].join('\n');
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
    if (name === 'tickets' && isDir(p)) problems.push(`docs/spec/tickets/ 是旧的平铺布局，按 wiki-conventions 的「从平铺布局迁移」迁移`);
    else if (name.endsWith('.md') && name !== 'index.md') problems.push(`docs/spec/${name} 是旧的平铺布局，按 wiki-conventions 的「从平铺布局迁移」迁移`);
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
  const [cmd, a, b, c] = process.argv.slice(2);
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
    return console.log(`${b}: ${frontmatter(md).status} → ${c}`);
  }
  if (cmd === 'route' && a && b) {
    const file = join(a, 'spec', b, `${b}.md`);
    if (!existsSync(file)) throw new Error(`没有 ${file}`);
    const md = read(file);
    if (frontmatter(md).status !== '草稿') throw new Error(`拒绝：route 只用于「草稿」，${b} 现在是「${frontmatter(md).status ?? '没写'}」`);
    const to = routeOf(md);
    writeFileSync(file, withStatus(md, to));
    reindex(a);
    const why = to === '审核中' ? `——${forHuman(md).join('；')}` : to === '完成' ? '——覆盖的 issue 全都验证为不存在' : '';
    return console.log(`${b}: 草稿 → ${to}${why}`);
  }
  if (cmd === 'migrate' && a) {
    for (const s of scan(a).specs) {
      const to = MIGRATE[s.status];
      if (!to) continue;
      writeFileSync(s.file, withStatus(read(s.file), to));
      console.log(`${s.slug}: ${s.status} → ${to}${['已拍板未排期', '搁置', 'parked'].includes(s.status) ? '（它覆盖的 issue 挂 status:搁置）' : ''}`);
    }
    return reindex(a);
  }
  if (cmd === 'index' && a) return reindex(a);
  if (cmd === 'check' && a) return console.log(JSON.stringify(scan(a), null, 2));
  throw new Error('usage: spec-status.mjs set <docs-dir> <spec-slug> <status> | route <docs-dir> <spec-slug> | index <docs-dir> | check <docs-dir> | migrate <docs-dir>');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
