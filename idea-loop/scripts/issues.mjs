#!/usr/bin/env node
/**
 * The one way a GitHub issue's status changes (skills/engineering/spec-status/SKILL.md, section issue 的状态).
 *
 * The issue label is where the work is queued, and the dispatch loops read nothing else. An open issue
 * with no `status:*` label is 待验证. The loop claims a batch (验证中) and opens a verification session,
 * which turns 审核中 when something needs the human. Every 待 state is set only by `reconcile`, from
 * what the main branch already has: a 正式 spec puts its issues in 待设计 (touches UI, no freeze yet) or
 * 待实现; a freeze on main moves 设计中 on to 待实现; an issue the spec's 「验证」 table marks 不存在 is
 * closed as not planned; a 完成 spec closes the rest as completed. So whenever a loop sees a 待 label,
 * main has everything the next session needs. The 中 states are set when a session opens. 搁置 keeps
 * the loop away from an issue; `resume` puts it back where main says it belongs.
 *
 * The link from a spec to its issues lives in the spec's frontmatter (`issues: [12, 15]`). A spec that
 * covers no issue (one written from a conversation) gets a spec issue from `open` before its PR, so the
 * number travels with the PR; it has no label until `reconcile` sees the spec on main, and `candidates`
 * never offers it.
 *
 * Usage (<docs> is the target project's docs/ directory; gh runs there, so it acts on that repo; a
 * target is an issue number or a spec slug, which stands for every issue the spec lists):
 *   node issues.mjs labels     <docs>                          → creates the status:* labels that are missing
 *   node issues.mjs candidates <docs> [<limit>]                → JSON: 待验证 issues no spec lists, oldest first
 *   node issues.mjs queue      <docs> <待设计|待实现>           → JSON: specs whose issues wait in that state, and the mismatches
 *   node issues.mjs set        <docs> <state> <target>...      → checked flip: claim, a session opening or giving up, 搁置
 *   node issues.mjs reconcile  <docs>                          → the flips main already decides: 待设计 / 待实现, closing
 *   node issues.mjs resume     <docs> <target>...              → 搁置 → where main says the issue belongs
 *   node issues.mjs handoff    <docs> <spec-slug> <n>          → adds #n to the spec's frontmatter (GitHub untouched)
 *   node issues.mjs open       <docs> <spec-slug>              → the spec covers no issue: opens a spec issue, writes its number into the spec
 *   node issues.mjs unhandoff  <docs> <spec-slug> <n>          → takes #n off the spec and its label off → 待验证
 *   node issues.mjs drop       <docs> <spec-slug> <n>          → takes #n off the spec and closes it as not planned (the human decided)
 * Exit: 0 = done, 1 = refused / usage / gh error (the reason on stderr).
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { frontmatter, hasFreezeSummary, issuesOf, scan, touchesUi, verdicts } from './spec-status.mjs';

export { issuesOf };

export const PREFIX = 'status:';
export const label = (state) => `${PREFIX}${state}`;
export const UNLABELLED = '待验证';
/** The states an open issue can carry as a label; 待验证 is the absence of one. */
export const STATES = ['验证中', '审核中', '待设计', '设计中', '待实现', '实现中', '搁置'];
const COLORS = { 验证中: 'fbca04', 审核中: '1d76db', 待设计: 'd4c5f9', 设计中: '5319e7', 待实现: 'c2e0c6', 实现中: '0e8a16', 搁置: 'bfbfbf' };

/**
 * The flips `set` allows. The 待 states are missing on purpose: only `reconcile` sets them, from main.
 * 搁置 leaves through `resume`.
 */
export const NEXT = {
  待验证: ['验证中', '搁置'],
  验证中: ['审核中', '待验证', '搁置'],
  审核中: ['待验证', '搁置'],
  待设计: ['设计中', '搁置'],
  设计中: ['待设计', '搁置'],
  待实现: ['实现中', '搁置'],
  实现中: ['待实现', '搁置'],
  搁置: [],
};

/** An issue's state from its labels: the status:* label, 待验证 when there is none. */
export function stateOf(labels) {
  const own = labels.filter((l) => l.startsWith(PREFIX)).map((l) => l.slice(PREFIX.length));
  if (!own.length) return UNLABELLED;
  return own.length === 1 ? own[0] : own.join(' + ');
}

export const SPEC_ISSUE = 'spec：';
const isSpecIssue = (title) => String(title ?? '').startsWith(SPEC_ISSUE);

export function withIssues(md, list) {
  const m = String(md).match(/^(---\n[\s\S]*?)(\n---)([\s\S]*)$/);
  if (!m) throw new Error('spec has no frontmatter');
  const line = `issues: [${[...new Set(list)].sort((a, b) => a - b).join(', ')}]`;
  const head = /^issues:/m.test(m[1]) ? m[1].replace(/^issues:.*$/m, line) : `${m[1]}\n${line}`;
  return head + m[2] + m[3];
}

/** Where main says an issue of this spec belongs: a state, a closing, or null for nothing main decides. */
export function targetOf(md, n) {
  const status = frontmatter(md).status;
  if (!['正式', '实现中', '完成'].includes(status)) return null;
  if (verdicts(md).get(n) === '不存在') return { close: 'not planned' };
  if (status === '完成') return { close: 'completed' };
  if (status === '实现中') return { state: '待实现' };
  return { state: touchesUi(md) && !hasFreezeSummary(md) ? '待设计' : '待实现' };
}

/**
 * The flips main already decides. `specs` are the specs on main ({ slug, md }), `issues` the open issues
 * ({ number, title, labels }). An issue moves only out of a state whose work is done or never started:
 * 待验证 / 验证中 / 审核中 into its 待 state, 待设计 / 设计中 on to 待实现 once the freeze is on main; it is
 * closed from any state but 搁置. An issue carrying a 待 / 中 state that no spec on main lists is a problem.
 */
export function reconcilePlan(specs, issues) {
  const open = new Map(issues.map((i) => [i.number, i]));
  const listed = new Set();
  const actions = [];
  const problems = [];
  for (const { slug, md } of specs) {
    for (const n of issuesOf(md)) {
      listed.add(n);
      const it = open.get(n);
      if (!it) continue;
      const cur = stateOf(it.labels);
      if (cur === '搁置') continue;
      if (![UNLABELLED, ...STATES].includes(cur)) {
        problems.push(`#${n} 的 label「${cur}」不是 issue 的状态（旧状态机留下的就先迁移）`);
        continue;
      }
      const t = targetOf(md, n);
      if (!t) continue;
      if (t.close) actions.push({ n, slug, close: t.close, from: cur });
      else if ([UNLABELLED, '验证中', '审核中'].includes(cur) || (t.state === '待实现' && ['待设计', '设计中'].includes(cur))) {
        if (cur !== t.state) actions.push({ n, slug, from: cur, to: t.state });
      }
    }
  }
  for (const it of issues) {
    const cur = stateOf(it.labels);
    if (['待设计', '设计中', '待实现', '实现中'].includes(cur) && !listed.has(it.number)) problems.push(`#${it.number} 是「${cur}」，但主分支上没有 spec 列着它`);
  }
  return { actions, problems };
}

// ---------- gh boundary ----------

export const defaultGh = (cwd) => (args) => execFileSync('gh', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

function issue(gh, n) {
  const v = JSON.parse(gh(['issue', 'view', String(n), '--json', 'number,state,title,labels']));
  return { number: v.number, state: v.state, title: v.title, labels: v.labels.map((l) => l.name) };
}

function openIssues(gh) {
  return JSON.parse(gh(['issue', 'list', '--state', 'open', '--limit', '500', '--json', 'number,title,labels'])).map((i) => ({ ...i, labels: i.labels.map((l) => l.name) }));
}

/** Leaves the issue carrying exactly the label of `state` (none for 待验证). */
function relabel(gh, n, labels, state) {
  const want = state === UNLABELLED ? [] : [label(state)];
  const add = want.filter((l) => !labels.includes(l));
  const remove = labels.filter((l) => l.startsWith(PREFIX) && !want.includes(l));
  if (!add.length && !remove.length) return;
  gh(['issue', 'edit', String(n), ...add.flatMap((l) => ['--add-label', l]), ...remove.flatMap((l) => ['--remove-label', l])]);
}

function close(gh, n, labels, reason, comment) {
  relabel(gh, n, labels, UNLABELLED);
  gh(['issue', 'close', String(n), '--reason', reason, '--comment', comment]);
}

const specFile = (docs, slug) => join(docs, 'spec', slug, `${slug}.md`);

function readSpec(docs, slug) {
  const file = specFile(docs, slug);
  if (!existsSync(file)) throw new Error(`没有 ${file}`);
  return { file, md: readFileSync(file, 'utf8') };
}

const specsOn = (docs) => scan(docs).specs.map((s) => ({ slug: s.slug, md: readFileSync(s.file, 'utf8') }));

/** Issue numbers named by targets: a number stands for itself, a spec slug for every issue it lists. */
function expand(docs, targets) {
  return [...new Set(targets.flatMap((t) => (/^\d+$/.test(String(t)) ? [Number(t)] : issuesOf(readSpec(docs, t).md))))];
}

export function ensureLabels(gh) {
  const have = new Set(JSON.parse(gh(['label', 'list', '--limit', '200', '--json', 'name'])).map((l) => l.name));
  const made = [];
  for (const s of STATES) {
    if (have.has(label(s))) continue;
    gh(['label', 'create', label(s), '--color', COLORS[s], '--description', s === '搁置' ? 'idea-loop 不接手' : `idea-loop：${s}`]);
    made.push(label(s));
  }
  return made;
}

/** Issue numbers some spec under <docs> lists. */
export function listedIssues(docs) {
  return new Set(specsOn(docs).flatMap((s) => issuesOf(s.md)));
}

export function candidates(gh, limit = 100, listed = new Set()) {
  return openIssues(gh)
    .filter((i) => stateOf(i.labels) === UNLABELLED && !listed.has(i.number) && !isSpecIssue(i.title))
    .sort((a, b) => a.number - b.number)
    .slice(0, limit)
    .map(({ number, title }) => ({ number, title }));
}

/** The specs a loop picks up for 待设计 or 待实现: those whose open issues carry it, oldest issue first. */
export function queue(gh, docs, state) {
  if (!['待设计', '待实现'].includes(state)) throw new Error(`queue 只给「待设计」「待实现」（待验证用 candidates），不是「${state}」`);
  const specs = specsOn(docs);
  const picked = new Map();
  const problems = [];
  for (const it of openIssues(gh).filter((i) => stateOf(i.labels) === state).sort((a, b) => a.number - b.number)) {
    const spec = specs.find((s) => issuesOf(s.md).includes(it.number));
    if (!spec) problems.push(`#${it.number} 是「${state}」，但主分支上没有 spec 列着它`);
    else if (frontmatter(spec.md).status !== '正式') problems.push(`#${it.number} 是「${state}」，主分支上的 [[${spec.slug}]] 却是「${frontmatter(spec.md).status}」`);
    else if (!picked.has(spec.slug)) picked.set(spec.slug, { slug: spec.slug, issues: issuesOf(spec.md) });
  }
  return { specs: [...picked.values()], problems: [...new Set(problems)] };
}

export function setState(gh, docs, state, targets) {
  if (![UNLABELLED, ...STATES].includes(state)) throw new Error(`「${state}」不是 issue 的状态（${[UNLABELLED, ...STATES].join(' / ')}）`);
  const done = [];
  for (const n of expand(docs, targets)) {
    const it = issue(gh, n);
    if (it.state !== 'OPEN') continue;
    const cur = stateOf(it.labels);
    if (cur === state) continue;
    if (!(NEXT[cur] ?? []).includes(state)) {
      const hint = ['待设计', '待实现'].includes(state) ? '——待设计 / 待实现只由 reconcile 按主分支挂' : '';
      throw new Error(`#${n} 是「${cur}」，不能翻成「${state}」（能翻成：${(NEXT[cur] ?? []).join(' / ') || '无'}）${hint}`);
    }
    relabel(gh, n, it.labels, state);
    done.push(`#${n}: ${cur} → ${state}`);
  }
  return done;
}

export function reconcile(gh, docs) {
  const { actions, problems } = reconcilePlan(specsOn(docs), openIssues(gh));
  const byNumber = new Map(openIssues(gh).map((i) => [i.number, i]));
  const done = [];
  for (const a of actions) {
    const labels = byNumber.get(a.n)?.labels ?? [];
    if (a.close === 'not planned') close(gh, a.n, labels, 'not planned', `验证为不存在，证据见 spec \`${a.slug}\`（\`docs/spec/${a.slug}/${a.slug}.md\` 的「验证」）。`);
    else if (a.close === 'completed') close(gh, a.n, labels, 'completed', `spec \`${a.slug}\` 已实现并合并。`);
    else relabel(gh, a.n, labels, a.to);
    done.push(a.close ? `#${a.n}: ${a.from} → 关闭（${a.close}）` : `#${a.n}: ${a.from} → ${a.to}`);
  }
  return { done, problems };
}

export function resume(gh, docs, targets) {
  const specs = specsOn(docs);
  const done = [];
  for (const n of expand(docs, targets)) {
    const it = issue(gh, n);
    if (it.state !== 'OPEN' || stateOf(it.labels) !== '搁置') throw new Error(`#${n} 不是「搁置」`);
    const spec = specs.find((s) => issuesOf(s.md).includes(n));
    const t = spec ? targetOf(spec.md, n) : null;
    if (t?.close) close(gh, n, it.labels, t.close, `从搁置恢复：spec \`${spec.slug}\` 已经${t.close === 'completed' ? '实现' : '验证为不存在'}。`);
    else relabel(gh, n, it.labels, t?.state ?? UNLABELLED);
    done.push(`#${n}: 搁置 → ${t?.close ? `关闭（${t.close}）` : t?.state ?? UNLABELLED}`);
  }
  return done;
}

export function handoffIssue(gh, docs, slug, n) {
  const { file, md } = readSpec(docs, slug);
  const other = specsOn(docs).find((s) => s.slug !== slug && issuesOf(s.md).includes(n));
  if (other) throw new Error(`#${n} 已经在 [[${other.slug}]] 里`);
  if (issuesOf(md).includes(n)) return;
  const it = issue(gh, n);
  if (it.state !== 'OPEN') throw new Error(`#${n} 是 ${it.state}，不移交`);
  const cur = stateOf(it.labels);
  if (![UNLABELLED, '验证中'].includes(cur)) throw new Error(`#${n} 已经是「${cur}」，不移交`);
  writeFileSync(file, withIssues(md, [...issuesOf(md), n]));
}

/** Opens a spec issue for a spec that covers none, without a label; returns its number, or null when the spec already lists issues. */
export function openSpecIssue(gh, docs, slug) {
  const { file, md } = readSpec(docs, slug);
  if (issuesOf(md).length) return null;
  const title = String(md).match(/^# (.+)$/m)?.[1].trim() || slug;
  const body = [
    frontmatter(md).summary ?? '',
    '',
    `spec：\`docs/spec/${slug}/${slug}.md\`。spec 文件是真相，这个 issue 是它在 tracker 上的入口：spec 合进主分支后挂上状态 label，实现合并后关闭。`,
  ].join('\n');
  const out = String(gh(['issue', 'create', '--title', `${SPEC_ISSUE}${title}`, '--body', body])).trim();
  const n = Number(out.match(/\/issues\/(\d+)$/)?.[1]);
  if (!n) throw new Error(`gh issue create 没返回 issue 地址：${out}`);
  writeFileSync(file, withIssues(md, [n]));
  return n;
}

function takeOff(gh, docs, slug, n) {
  const { file, md } = readSpec(docs, slug);
  const list = issuesOf(md);
  if (!list.includes(n)) throw new Error(`#${n} 不在 [[${slug}]] 的 issues 里`);
  writeFileSync(file, withIssues(md, list.filter((x) => x !== n)));
  return issue(gh, n);
}

export function unhandoffIssue(gh, docs, slug, n) {
  const it = takeOff(gh, docs, slug, n);
  relabel(gh, n, it.labels, UNLABELLED);
  gh(['issue', 'comment', String(n), '--body', `从 spec \`${slug}\` 里移出，回到待验证。`]);
}

export function dropIssue(gh, docs, slug, n) {
  const it = takeOff(gh, docs, slug, n);
  close(gh, n, it.labels, 'not planned', `审核 spec \`${slug}\` 时决定不做。`);
}

// ---------- cli ----------

const num = (v, what) => {
  if (!/^\d+$/.test(String(v ?? ''))) throw new Error(`${what}「${v ?? ''}」不是数字`);
  return Number(v);
};

const COMMANDS = ['labels', 'candidates', 'queue', 'set', 'reconcile', 'resume', 'handoff', 'open', 'unhandoff', 'drop'];

function main() {
  const [cmd, docs, a, b, ...rest] = process.argv.slice(2);
  if (!docs || !existsSync(docs)) throw new Error(`usage: issues.mjs <${COMMANDS.join('|')}> <docs> …（${docs ?? '没给 docs'} 不存在）`);
  if (!COMMANDS.includes(cmd)) throw new Error(`不认识的命令「${cmd}」`);
  const gh = defaultGh(docs);
  const print = (lines) => lines.forEach((l) => console.log(l));
  if (cmd === 'labels') return print(ensureLabels(gh).map((l) => `created ${l}`));
  if (cmd === 'candidates') return console.log(JSON.stringify(candidates(gh, a ? num(a, 'limit') : undefined, listedIssues(docs)), null, 2));
  if (cmd === 'reconcile') {
    const { done, problems } = reconcile(gh, docs);
    print(done);
    return print(problems.map((p) => `问题：${p}`));
  }
  if (!a) throw new Error(`usage: issues.mjs ${cmd} <docs> …`);
  if (cmd === 'queue') return console.log(JSON.stringify(queue(gh, docs, a), null, 2));
  if (cmd === 'set') {
    if (b === undefined) throw new Error('usage: issues.mjs set <docs> <state> <issue 号 | spec-slug>...');
    return print(setState(gh, docs, a, [b, ...rest]));
  }
  if (cmd === 'resume') return print(resume(gh, docs, [a, b, ...rest].filter((x) => x !== undefined)));
  if (cmd === 'handoff') return handoffIssue(gh, docs, a, num(b, 'issue'));
  if (cmd === 'open') {
    const n = openSpecIssue(gh, docs, a);
    return console.log(n ? `#${n} ← spec ${a}` : `spec ${a} 已经列了 issue，不另开`);
  }
  if (cmd === 'unhandoff') return unhandoffIssue(gh, docs, a, num(b, 'issue'));
  if (cmd === 'drop') return dropIssue(gh, docs, a, num(b, 'issue'));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch (error) {
    console.error(error.stderr ? String(error.stderr).trim() || error.message : error.message);
    process.exitCode = 1;
  }
}
