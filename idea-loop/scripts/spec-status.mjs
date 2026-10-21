#!/usr/bin/env node
/**
 * The one way a spec's status changes.
 *
 * A spec walks 审核中 → (待设计 → 设计中 →) 待实现 → 在飞 (skills/engineering/spec-status/SKILL.md). Each
 * step has one writer and a precondition that can be read off the files: a spec leaves 审核中 only once nothing
 * in it waits for a human (no 需要 grill, no 待定 fork under 实现决策, no 建议关闭 entry), the design states only
 * for a spec that touches UI, 待实现 only once its design is frozen (a 冻结摘要 under 实现决策), 在飞 only once
 * the tickets are cut. A new spec is written as 审核中 and `route` moves it straight on when nothing waits for
 * a human. 待设计 and 待实现 are queue states: the dispatcher loops pick specs up from them. Skills used to flip the
 * frontmatter by hand and refresh docs/spec/index.md by hand; a flip that skipped its precondition,
 * or an index that kept the old status, went unnoticed until a later stage refused to start. Here the
 * transition is checked, written and indexed in one call, and anything illegal is refused with the
 * reason.
 *
 * Layout (skills/productivity/wiki-conventions/SKILL.md §2): docs/spec/<slug>/<slug>.md, tickets in
 * docs/spec/<slug>/tickets/NN-<slug>.md, the index at docs/spec/index.md.
 *
 * Usage:
 *   node spec-status.mjs set       <docs-dir> <spec-slug> <status>            → checks, writes, re-indexes
 *   node spec-status.mjs route     <docs-dir> <spec-slug>                     → a new 审核中 spec: on to 待设计 / 待实现 unless something waits for a human (no label sync)
 *   node spec-status.mjs index     <docs-dir>                                 → regenerates docs/spec/index.md
 *   node spec-status.mjs check     <docs-dir>                                 → JSON: specs, problems (old flat layout, bad status)
 * A spec that lists GitHub issues in its frontmatter (`issues: [12, 15]`) has their status labels
 * synced after `set` (issues.mjs, skills/engineering/spec-status/SKILL.md, section issue 的 label); a failed sync leaves the status written
 * and says how to retry.
 * Exit: 0 = done, 1 = refused / usage / io error (the reason on stderr).
 */

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { defaultGh, issuesOf, syncIssues } from './issues.mjs';

export const STATUSES = ['审核中', '待设计', '设计中', '待实现', '在飞', '已拍板未排期', '搁置'];

/** Legal next statuses. Preconditions on top of these live in transitionError. */
export const NEXT = {
  审核中: ['待设计', '待实现', '已拍板未排期', '搁置'],
  待设计: ['设计中', '审核中', '已拍板未排期', '搁置'],
  设计中: ['待实现', '审核中', '已拍板未排期', '搁置'],
  待实现: ['在飞', '设计中', '审核中', '已拍板未排期', '搁置'],
  在飞: ['搁置'],
  已拍板未排期: ['审核中', '搁置'],
  搁置: ['审核中', '已拍板未排期'],
};


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

/** 「前端交互」 says 不涉及 → the spec does not touch UI. A missing section counts as touching nothing. */
export function touchesUi(md) {
  const ui = section(md, '前端交互');
  return ui !== null && !/^\s*(>\s*)?不涉及/.test(ui.trim());
}

export const needsGrill = (md) => /^>\s*需要 grill/m.test(String(md));
/** What in the spec still waits for a human; empty when it can leave 审核中. */
export function forHuman(md) {
  const out = [];
  if (needsGrill(md)) out.push('开头标着「需要 grill」');
  const forks = (section(md, '实现决策') ?? '').split('\n').filter((l) => /^#{2,6}\s+待定/.test(l)).length;
  if (forks) out.push(`「实现决策」里还有 ${forks} 条「待定」`);
  const close = section(md, '建议关闭');
  if (close !== null && close.trim()) out.push('「建议关闭」里还有 issue 等人处置');
  return out;
}

export const hasFreezeSummary = (md) => section(section(md, '实现决策') ?? '', '冻结摘要') !== null;

/** Why `from → to` is refused, or null when it is allowed. */
export function transitionError(from, to, md, ticketCount) {
  if (!STATUSES.includes(to)) return `「${to}」不是合法状态（${STATUSES.join(' / ')}）`;
  if (!STATUSES.includes(from)) return `spec 现在的状态「${from || '没写'}」不在状态机里，先按 wiki-conventions 的「从平铺布局迁移」迁移`;
  if (from === to) return `spec 已经是「${to}」`;
  if (!NEXT[from].includes(to)) return `「${from}」不能直接翻成「${to}」（能翻成：${NEXT[from].join(' / ')}）`;
  if (from === '审核中' && (to === '待设计' || to === '待实现') && forHuman(md).length) return `spec 里还有等人定的：${forHuman(md).join('；')}`;
  if (['待设计', '设计中', '待实现', '在飞'].includes(to) && needsGrill(md)) return 'spec 开头标着「需要 grill」，先 grill 再往下走';
  if ((to === '待设计' || to === '设计中') && !touchesUi(md)) return 'spec 的「前端交互」写的是「不涉及」——不碰 UI 的 spec 不进设计';
  if (to === '待实现') {
    if (from === '审核中' && touchesUi(md)) return 'spec 碰 UI（「前端交互」不是「不涉及」）——先走设计，冻结后再进待实现';
    if (from === '设计中' && !hasFreezeSummary(md)) return 'spec 的「实现决策」里还没有「冻结摘要」——设计没冻结';
  }
  if (to === '在飞') {
    if (touchesUi(md) && !hasFreezeSummary(md)) return 'spec 的「实现决策」里还没有「冻结摘要」——设计没冻结';
    if (!ticketCount) return 'spec 目录下的 tickets/ 里一张工单都没有——切完工单才翻在飞';
  }
  return null;
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
  if (cmd === 'route' && a && b) {
    const file = join(a, 'spec', b, `${b}.md`);
    if (!existsSync(file)) throw new Error(`没有 ${file}`);
    const md = read(file);
    if (frontmatter(md).status !== '审核中') throw new Error(`拒绝：route 只用于刚写好的「审核中」spec，${b} 现在是「${frontmatter(md).status ?? '没写'}」`);
    const wait = forHuman(md);
    if (wait.length) return console.log(`${b}: 留在审核中——${wait.join('；')}`);
    const to = touchesUi(md) ? '待设计' : '待实现';
    writeFileSync(file, withStatus(md, to));
    reindex(a);
    return console.log(`${b}: 审核中 → ${to}（issue 的 label 在发布时同步）`);
  }
  if (cmd === 'index' && a) return reindex(a);
  if (cmd === 'check' && a) return console.log(JSON.stringify(scan(a), null, 2));
  throw new Error('usage: spec-status.mjs set <docs-dir> <spec-slug> <status> | route <docs-dir> <spec-slug> | index <docs-dir> | check <docs-dir>');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
