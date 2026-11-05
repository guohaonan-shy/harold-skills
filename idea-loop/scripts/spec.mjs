#!/usr/bin/env node
/**
 * Reads what a spec says. A spec is a document and has no status of its own: how far the work has got
 * is the status:* label of the issues it lists (skills/engineering/issues/SKILL.md), written only by
 * issues.mjs, which uses the readers here for the checks a flip depends on (still waiting for a human,
 * touches UI, design frozen). This script never touches GitHub.
 *
 * Layout (skills/productivity/wiki-conventions/SKILL.md): docs/spec/<slug>/<slug>.md, tickets in
 * docs/spec/<slug>/tickets/, the index at docs/spec/index.md.
 *
 * Usage:
 *   node spec.mjs index <docs-dir>   → regenerates docs/spec/index.md
 *   node spec.mjs check <docs-dir>   → JSON: specs, problems (old flat layout, a status line left over from the old state machine)
 * Exit: 0 = done, 1 = usage / io error (the reason on stderr).
 */

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

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

// ---------- index ----------

const DEFAULT_INDEX = `# spec
> 契约：还没了结的规格，一份一个目录（\`<slug>/<slug>.md\`，工单在 \`<slug>/tickets/\`）——做完整个目录删（删前必须先写 ADR）。

| 文件 | summary |
|---|---|
`;

/**
 * Replaces the index table, keeping everything above and below it. No status column: a spec has no
 * status, and its issues' labels change on every stage, so a column here would make branches running
 * side by side conflict on this file. An old table with a status column is rewritten.
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
      if (fm.status !== undefined) problems.push(`docs/spec/${name}/${name}.md 的 frontmatter 还有 status 行（spec 没有状态了，删掉这一行；进度看 issue 的 label）`);
      specs.push({ slug: name, file, issues: issuesOf(read(file)), summary: fm.summary, tickets });
    }
  }
  return { specs, problems };
}

function reindex(docs) {
  const file = join(docs, 'spec', 'index.md');
  writeFileSync(file, renderIndex(read(file), scan(docs).specs));
}

function main() {
  const [cmd, a] = process.argv.slice(2);
  if (cmd === 'index' && a) return reindex(a);
  if (cmd === 'check' && a) return console.log(JSON.stringify(scan(a), null, 2));
  throw new Error('usage: spec.mjs index <docs-dir> | check <docs-dir>');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
