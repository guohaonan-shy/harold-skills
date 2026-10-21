#!/usr/bin/env node
/**
 * The one way a GitHub issue's loop status changes (skills/engineering/to-spec/references/spec-status.md §3).
 *
 * An issue the loop has not touched carries no status label: it is 待办. Once a spec covers it, the
 * issue carries exactly one `status:<spec status>` label that follows the spec — 草稿 when drafted,
 * 审核中 when its review session opens, and so on — and it is closed when the spec's PR merges. The
 * human can put `status:parked` on an untouched issue to keep the loop away from it. The link from a
 * spec to its issues lives in the spec's frontmatter (`issues: [12, 15]`), so the spec is the source of
 * truth and the labels are a projection of it: spec-status.mjs calls `sync` after every status flip.
 *
 * Usage (<docs> is the target project's docs/ directory; gh runs there, so it acts on that repo):
 *   node issues.mjs labels     <docs>                      → creates the status:* labels that are missing
 *   node issues.mjs candidates <docs> [<limit>]            → JSON: open issues with no status:* label that no spec lists, oldest first
 *   node issues.mjs handoff    <docs> <spec-slug> <n>      → adds #n to the spec's frontmatter (GitHub untouched)
 *   node issues.mjs sync       <docs> <spec-slug>          → sets each listed issue's label to the spec's status
 *   node issues.mjs unhandoff  <docs> <spec-slug> <n>      → takes #n off the spec and its status label off → 待办
 *   node issues.mjs drop       <docs> <spec-slug> <n>      → takes #n off the spec and closes it as not planned
 *   node issues.mjs resolve    <docs> <spec-slug> <pr>     → the spec's PR merged: closes every listed issue
 * Exit: 0 = done, 1 = refused / usage / gh error (the reason on stderr).
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { STATUSES, frontmatter, scan } from './spec-status.mjs';

export const PREFIX = 'status:';
export const label = (status) => `${PREFIX}${status}`;
const COLORS = { 草稿: 'fbca04', 审核中: '1d76db', 设计中: '5319e7', 在飞: '0e8a16', 已拍板未排期: 'c5def5', parked: 'bfbfbf' };

// ---------- spec frontmatter: issues: [12, 15] ----------

export function issuesOf(md) {
  const raw = frontmatter(md).issues;
  if (!raw) return [];
  return [...raw.matchAll(/\d+/g)].map((m) => Number(m[0]));
}

export function withIssues(md, list) {
  const m = String(md).match(/^(---\n[\s\S]*?)(\n---)([\s\S]*)$/);
  if (!m) throw new Error('spec has no frontmatter');
  const line = `issues: [${[...new Set(list)].sort((a, b) => a - b).join(', ')}]`;
  const head = /^issues:/m.test(m[1]) ? m[1].replace(/^issues:.*$/m, line) : `${m[1]}\n${line}`;
  return head + m[2] + m[3];
}

/** What to do to an issue's labels so it carries exactly `status:<status>`. */
export function labelPlan(current, status) {
  const want = label(status);
  const stale = current.filter((l) => l.startsWith(PREFIX) && l !== want);
  return { add: current.includes(want) ? [] : [want], remove: stale, first: !current.some((l) => l.startsWith(PREFIX)) };
}

// ---------- gh boundary ----------

export const defaultGh = (cwd) => (args) => execFileSync('gh', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

function issue(gh, n) {
  const v = JSON.parse(gh(['issue', 'view', String(n), '--json', 'number,state,title,labels']));
  return { number: v.number, state: v.state, title: v.title, labels: v.labels.map((l) => l.name) };
}

function edit(gh, n, { add = [], remove = [] }) {
  if (!add.length && !remove.length) return;
  gh(['issue', 'edit', String(n), ...add.flatMap((l) => ['--add-label', l]), ...remove.flatMap((l) => ['--remove-label', l])]);
}

const specFile = (docs, slug) => join(docs, 'spec', slug, `${slug}.md`);

function readSpec(docs, slug) {
  const file = specFile(docs, slug);
  if (!existsSync(file)) throw new Error(`没有 ${file}`);
  return { file, md: readFileSync(file, 'utf8') };
}

export function ensureLabels(gh) {
  const have = new Set(JSON.parse(gh(['label', 'list', '--limit', '200', '--json', 'name'])).map((l) => l.name));
  const made = [];
  for (const s of STATUSES) {
    if (have.has(label(s))) continue;
    gh(['label', 'create', label(s), '--color', COLORS[s], '--description', s === 'parked' ? 'idea-loop 不接手 / spec 搁置' : `idea-loop：spec ${s}`]);
    made.push(label(s));
  }
  return made;
}

/** Issue numbers some spec under <docs> still lists — e.g. one taken off on a review branch that has not merged yet. */
export function listedIssues(docs) {
  return new Set(scan(docs).specs.flatMap((s) => issuesOf(readFileSync(s.file, 'utf8'))));
}

export function candidates(gh, limit = 100, listed = new Set()) {
  const all = JSON.parse(gh(['issue', 'list', '--state', 'open', '--limit', '500', '--json', 'number,title,labels']));
  return all
    .filter((i) => !i.labels.some((l) => l.name.startsWith(PREFIX)) && !listed.has(i.number))
    .sort((a, b) => a.number - b.number)
    .slice(0, limit)
    .map(({ number, title }) => ({ number, title }));
}

export function handoffIssue(gh, docs, slug, n) {
  const { file, md } = readSpec(docs, slug);
  const other = scan(docs).specs.find((s) => s.slug !== slug && issuesOf(readFileSync(s.file, 'utf8')).includes(n));
  if (other) throw new Error(`#${n} 已经在 [[${other.slug}]] 里`);
  if (issuesOf(md).includes(n)) return;
  const it = issue(gh, n);
  if (it.state !== 'OPEN') throw new Error(`#${n} 是 ${it.state}，不移交`);
  const taken = it.labels.find((l) => l.startsWith(PREFIX));
  if (taken) throw new Error(`#${n} 已经是 ${taken}，不移交`);
  writeFileSync(file, withIssues(md, [...issuesOf(md), n]));
}

export function syncIssues(gh, docs, slug) {
  const { md } = readSpec(docs, slug);
  const status = frontmatter(md).status;
  if (!STATUSES.includes(status)) throw new Error(`spec 的 status「${status ?? '没写'}」不在状态机里`);
  const done = [];
  for (const n of issuesOf(md)) {
    const plan = labelPlan(issue(gh, n).labels, status);
    edit(gh, n, plan);
    if (plan.first) gh(['issue', 'comment', String(n), '--body', `已移交给 spec \`${slug}\`（\`docs/spec/${slug}/${slug}.md\`）。`]);
    done.push(`#${n} → ${label(status)}`);
  }
  return done;
}

function takeOff(gh, docs, slug, n) {
  const { file, md } = readSpec(docs, slug);
  const list = issuesOf(md);
  if (!list.includes(n)) throw new Error(`#${n} 不在 [[${slug}]] 的 issues 里`);
  writeFileSync(file, withIssues(md, list.filter((x) => x !== n)));
  edit(gh, n, { remove: issue(gh, n).labels.filter((l) => l.startsWith(PREFIX)) });
}

export function unhandoffIssue(gh, docs, slug, n) {
  takeOff(gh, docs, slug, n);
  gh(['issue', 'comment', String(n), '--body', `从 spec \`${slug}\` 里移出，回到待办。`]);
}

export function dropIssue(gh, docs, slug, n) {
  takeOff(gh, docs, slug, n);
  gh(['issue', 'close', String(n), '--reason', 'not planned', '--comment', `审核 spec \`${slug}\` 时决定不做。`]);
}

export function resolveIssues(gh, docs, slug, pr) {
  const { md } = readSpec(docs, slug);
  const done = [];
  for (const n of issuesOf(md)) {
    const it = issue(gh, n);
    edit(gh, n, { remove: it.labels.filter((l) => l.startsWith(PREFIX)) });
    if (it.state === 'OPEN') gh(['issue', 'close', String(n), '--reason', 'completed', '--comment', `已由 #${pr} 解决（spec \`${slug}\`）。`]);
    done.push(`#${n}`);
  }
  return done;
}

// ---------- cli ----------

const num = (v, what) => {
  if (!/^\d+$/.test(String(v ?? ''))) throw new Error(`${what}「${v ?? ''}」不是数字`);
  return Number(v);
};

function main() {
  const [cmd, docs, a, b] = process.argv.slice(2);
  if (!docs || !existsSync(docs)) throw new Error(`usage: issues.mjs <labels|candidates|handoff|sync|unhandoff|drop|resolve> <docs> …（${docs ?? '没给 docs'} 不存在）`);
  if (!['labels', 'candidates', 'handoff', 'sync', 'unhandoff', 'drop', 'resolve'].includes(cmd)) throw new Error(`不认识的命令「${cmd}」`);
  const gh = defaultGh(docs);
  if (cmd === 'labels') return ensureLabels(gh).forEach((l) => console.log(`created ${l}`));
  if (cmd === 'candidates') return console.log(JSON.stringify(candidates(gh, a ? num(a, 'limit') : undefined, listedIssues(docs)), null, 2));
  if (!a) throw new Error(`usage: issues.mjs ${cmd} <docs> <spec-slug> …`);
  if (cmd === 'handoff') return handoffIssue(gh, docs, a, num(b, 'issue'));
  if (cmd === 'sync') return syncIssues(gh, docs, a).forEach((l) => console.log(l));
  if (cmd === 'unhandoff') return unhandoffIssue(gh, docs, a, num(b, 'issue'));
  if (cmd === 'drop') return dropIssue(gh, docs, a, num(b, 'issue'));
  if (cmd === 'resolve') return resolveIssues(gh, docs, a, num(b, 'PR')).forEach((l) => console.log(`closed ${l}`));
  throw new Error(`不认识的命令「${cmd}」`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch (error) {
    console.error(error.stderr ? String(error.stderr).trim() || error.message : error.message);
    process.exitCode = 1;
  }
}
