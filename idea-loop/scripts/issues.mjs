#!/usr/bin/env node
/**
 * The one way an issue's status changes (skills/engineering/issues/SKILL.md). The issue's status is the
 * only record of how far a piece of work has got: a spec is a document without a status of its own, and
 * is done once every issue its frontmatter lists (`issues: [12]`) is closed.
 *
 * Nine states, each a `status:<name>` label: backlog (new, not yet verified; an open issue without a
 * status:* label counts as backlog), todo (verified, waiting for dispatch), spec, design, implement,
 * review (the PR waits for the human), blocked, and the two closings, done (closed as completed) and
 * canceled (closed as not planned), which keep their label too. `set` checks every flip against NEXT and,
 * where the flip depends on the spec, against the spec's text (spec.mjs): leaving spec needs nothing left
 * for a human, design needs a spec that touches UI, implement on a UI spec needs the freeze or an
 * explicit --skip-design. Parking (back to backlog) and blocked need a comment saying where the work
 * stopped or what it waits for, since the next session picks up from it.
 *
 * Sub-issues are GitHub's native sub-issues and mean one thing: a part split from a parent issue that
 * ships as its own PR. `split` opens one in todo, carrying the parent's categories, priority and
 * milestone. A sub-issue's session starts at implement, from the parent's spec. Order between issues is
 * GitHub's native "blocked by" relation (`block`): `candidates` leaves out a todo that an open issue
 * still blocks, and `reconcile` puts a blocked issue back in todo once all its blockers are closed. It
 * also closes a parent whose sub-issues are all closed. Versions are milestones, modules are categories.
 *
 * Besides its status an issue carries category labels, `type:<parent>` and optionally
 * `type:<parent>/<child>`. The project lists them in the「issue 分类」section of its AGENTS.md (or
 * CLAUDE.md), together with the other labels it keeps; `labels --prune` deletes every label outside the
 * status states, the categories and that keep-list.
 *
 * The dispatch loop hands out sessions from queues, each with its own cap on open sessions. Every issue
 * is in the main queue (cap 10) unless its parent category is marked「（独立队列，上限 N）」in that
 * section: then it waits in that category's own queue. A queue's sessions sit in its own sidebar
 * sections, one per working state, prefixed with the category (`seo spec`).
 *
 * Usage (<docs> is the docs/ directory; gh runs there, so it acts on that repo):
 *   node issues.mjs labels     <docs> [--prune]                       → creates the missing status:* and type:* labels; lists the rest, --prune deletes them
 *   node issues.mjs type       <docs> <n> <parent[/child]>...         → sets #n's type:* labels from the project's categories
 *   node issues.mjs show       <docs> <n>                             → JSON: #n's state, parent, sub-issues, blockers, milestone, and the spec that covers it
 *   node issues.mjs set        <docs> <state> <n>... [--comment=<text>] [--skip-design] → checked flip; done / canceled also close the issue
 *   node issues.mjs split      <docs> <parent> <title> <body-file>    → opens a sub-issue of <parent> in todo; prints its number
 *   node issues.mjs block      <docs> <n> <blocker>...                → records "#n is blocked by" each blocker, moves #n to blocked
 *   node issues.mjs candidates <docs> [<limit>] [--queue=<c>]         → JSON: todo issues no open issue blocks, oldest first; main queue, or category c's own
 *   node issues.mjs reconcile  <docs>                                 → blocked with every blocker closed → todo; a parent with every sub-issue closed → done
 *   node issues.mjs queues     <docs> [<n>]                           → JSON: every queue (cap, sidebar sections), or the one issue #n is in
 *   node issues.mjs open       <docs> <spec-slug>                     → the spec covers no issue: opens a spec issue in status:spec, writes its number into the spec
 * Exit: 0 = done, 1 = refused / usage / gh error (the reason on stderr).
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { forHuman, frontmatter, hasFreezeSummary, issuesOf, scan, touchesUi } from './spec.mjs';

export { issuesOf };

export const PREFIX = 'status:';
export const label = (state) => `${PREFIX}${state}`;
/** Every state, in the order work goes through them. An open issue without a status:* label is backlog. */
export const STATES = ['backlog', 'todo', 'spec', 'design', 'implement', 'review', 'blocked', 'done', 'canceled'];
export const CLOSED = { done: 'completed', canceled: 'not planned' };
/** The states a session works in: each has a session open, and a sidebar section of that name. */
export const WORKING = ['spec', 'design', 'implement', 'review'];
const ABOUT = {
  backlog: '新进来、还没验证；调度不派',
  todo: '验证过、等调度派成会话',
  spec: '在写 spec、grill',
  design: '在设计',
  implement: '在实现（父 issue：子 issue 在做）',
  review: 'PR 等人看',
  blocked: '被别的 issue 或等人给的条件挡着；不占会话',
  done: '做完了（关闭为 completed）',
  canceled: '不做了（关闭为 not planned）',
};
const COLORS = { backlog: 'ededed', todo: '0e8a16', spec: '1d76db', design: '5319e7', implement: 'fbca04', review: 'd93f0b', blocked: 'b60205', done: '0e8a16', canceled: 'bfbfbf' };

/** The flips `set` allows. done and canceled are final: reopening is the human's call. */
export const NEXT = {
  backlog: ['todo', 'blocked', 'canceled'],
  todo: ['spec', 'design', 'implement', 'review', 'backlog', 'blocked', 'canceled'],
  spec: ['design', 'implement', 'backlog', 'blocked', 'canceled'],
  design: ['implement', 'backlog', 'blocked', 'canceled'],
  implement: ['review', 'done', 'backlog', 'blocked', 'canceled'],
  review: ['done', 'implement', 'backlog', 'blocked', 'canceled'],
  blocked: ['todo', 'backlog', 'canceled'],
  done: [],
  canceled: [],
};

/** Flips that must say, in a comment on the issue, where the work stopped or what it waits for. */
export const NEEDS_COMMENT = new Set(['backlog', 'blocked']);
/** Prefix of every comment idea-loop writes on an issue. */
export const AI_PREFIX = '🤖 idea-loop：';

/** An issue's state from its labels: the status:* label, backlog when there is none. */
export function stateOf(labels) {
  const own = labels.filter((l) => l.startsWith(PREFIX)).map((l) => l.slice(PREFIX.length));
  if (!own.length) return 'backlog';
  return own.length === 1 ? own[0] : own.join(' + ');
}

/**
 * Why flipping an issue from `from` to `to` is refused, or null. `spec` is the text of the spec that
 * covers the issue (its own, or its parent's for a sub-issue), or null when there is none.
 */
export function transitionError(from, to, spec, { comment = '', skipDesign = false } = {}) {
  if (!STATES.includes(to)) return `「${to}」不是 issue 的状态（${STATES.join(' / ')}）`;
  if (!STATES.includes(from)) return `issue 现在的状态「${from}」不在状态机里（旧状态机留下的就先迁移）`;
  if (from === to) return `issue 已经是「${to}」`;
  if (!NEXT[from].includes(to)) return `「${from}」不能翻成「${to}」（能翻成：${NEXT[from].join(' / ') || '无'}）`;
  if (NEEDS_COMMENT.has(to) && !String(comment).trim()) return `翻「${to}」要带 --comment：写清${to === 'blocked' ? '等什么' : '停在哪个阶段、分支叫什么'}，下一个会话靠它接上`;
  if (from === 'spec' && ['design', 'implement'].includes(to)) {
    if (!spec) return '没有 spec 的 issues: 列着这个 issue（子 issue 看父 issue）——spec 写好才离开 spec';
    if (forHuman(spec).length) return `spec 里还有等人定的：${forHuman(spec).join('；')}`;
  }
  if (to === 'design' && spec && !touchesUi(spec)) return 'spec 不碰 UI（没有「前端交互」）——直接翻 implement';
  if (to === 'implement' && ['spec', 'design', 'todo'].includes(from) && spec && touchesUi(spec) && !hasFreezeSummary(spec) && !skipDesign) {
    return 'spec 碰 UI，「实现决策」里还没有「冻结摘要」——先设计；没装 design 插件时带 --skip-design，并在汇报里写明跳过了设计';
  }
  return null;
}

export const TYPE_PREFIX = 'type:';
export const TYPES_HEADING = 'issue 分类';
const QUEUE_NOTE = /\s*[（(]独立队列[，,]\s*上限\s*(\d+)\s*[)）]/;
const TYPE_COLORS = { parent: '0052cc', child: 'c5def5' };

/**
 * The project's categories from its「issue 分类」section: a bullet per parent (`` - `seo`：搜索流量 ``),
 * indented bullets for its children, and a line starting「保留的 label」that names, in backticks, the
 * other labels to keep. A parent whose line carries「（独立队列，上限 N）」gets `queue: N` (the note is
 * not part of its label description). Null when the section is missing.
 */
export function parseTypes(md) {
  const lines = String(md).split('\n');
  const start = lines.findIndex((l) => l.trim() === `## ${TYPES_HEADING}`);
  if (start < 0) return null;
  const parents = [];
  const keep = [];
  for (const line of lines.slice(start + 1)) {
    if (/^#{1,2} /.test(line)) break;
    const item = line.match(/^(\s*)- `([^`]+)`(?:[：:]\s*(.*))?$/);
    if (item) {
      const [, indent, name, about = ''] = item;
      if (name.includes('/')) throw new Error(`分类「${name}」里有「/」：它留给子类分隔，换个名字`);
      const own = about.match(QUEUE_NOTE);
      if (!indent) parents.push({ name, about: about.replace(QUEUE_NOTE, '').trim(), children: [], ...(own ? { queue: Number(own[1]) } : {}) });
      else if (parents.length) parents.at(-1).children.push({ name, about });
      continue;
    }
    if (/^保留的 label/.test(line.trim())) keep.push(...[...line.matchAll(/`([^`]+)`/g)].map((m) => m[1]));
  }
  return { parents, keep };
}

/** The categories of the project <docs> belongs to: AGENTS.md first, then CLAUDE.md. */
export function readTypes(docs) {
  const root = dirname(resolve(docs));
  for (const f of ['AGENTS.md', 'CLAUDE.md']) {
    const file = join(root, f);
    if (!existsSync(file)) continue;
    const types = parseTypes(readFileSync(file, 'utf8'));
    if (types) return types;
  }
  return null;
}

/** Every type:* label the categories define, with its color and description. */
export function typeLabels(types) {
  return (types?.parents ?? []).flatMap((p) => [
    { name: `${TYPE_PREFIX}${p.name}`, color: TYPE_COLORS.parent, about: p.about },
    ...p.children.map((c) => ({ name: `${TYPE_PREFIX}${p.name}/${c.name}`, color: TYPE_COLORS.child, about: c.about })),
  ]);
}

export const MAIN_CAP = 10;
export const STAGE_SECTIONS = [...WORKING];

/** The dispatch queues: the main one (`name: null`) first, then one per category marked 独立队列. */
export function queues(types) {
  const own = (types?.parents ?? []).filter((p) => p.queue).map((p) => ({ name: p.name, cap: p.queue, sections: STAGE_SECTIONS.map((s) => `${p.name} ${s}`) }));
  return [{ name: null, cap: MAIN_CAP, sections: [...STAGE_SECTIONS] }, ...own];
}

/** The queue an issue with these labels waits in: the first own queue whose `type:<parent>` it carries, else main. */
export function queueOf(types, labels) {
  const [main, ...own] = queues(types);
  return own.find((q) => labels.includes(`${TYPE_PREFIX}${q.name}`)) ?? main;
}

/** The labels a project keeps: the status states, its categories, and its keep-list. */
export function keptLabels(types) {
  return new Set([...STATES.map(label), ...typeLabels(types).map((t) => t.name), ...(types?.keep ?? [])]);
}

/** The type:* labels an issue should carry for the given values (`seo`, `seo/blog`); a child brings its parent. */
export function typeSet(types, values) {
  const out = new Set();
  for (const v of values) {
    const [p, c, extra] = String(v).split('/');
    const parent = types?.parents.find((x) => x.name === p);
    if (!parent || extra !== undefined) throw new Error(`「${v}」不是这个项目的分类（${typeLabels(types).map((t) => t.name.slice(TYPE_PREFIX.length)).join(' / ') || '没有定义分类'}）`);
    out.add(`${TYPE_PREFIX}${p}`);
    if (c === undefined) continue;
    if (!parent.children.some((x) => x.name === c)) throw new Error(`「${p}」下没有子类「${c}」（${parent.children.map((x) => x.name).join(' / ') || '没有子类'}）`);
    out.add(`${TYPE_PREFIX}${p}/${c}`);
  }
  return [...out];
}

export const SPEC_ISSUE = 'spec：';

export function withIssues(md, list) {
  const m = String(md).match(/^(---\n[\s\S]*?)(\n---)([\s\S]*)$/);
  if (!m) throw new Error('spec has no frontmatter');
  const line = `issues: [${[...new Set(list)].sort((a, b) => a - b).join(', ')}]`;
  const head = /^issues:/m.test(m[1]) ? m[1].replace(/^issues:.*$/m, line) : `${m[1]}\n${line}`;
  return head + m[2] + m[3];
}

/**
 * The flips that need no one's judgement. `issues` are the open issues ({ number, labels, blockedBy, subTotal });
 * `blockers` maps a blocked issue's number to its blockers ({ number, open }); `children` maps a parent's
 * number to its sub-issues ({ number, open }). A blocked issue with at least one blocker, all closed, goes
 * back to todo; one without a recorded blocker waits for the human (it waits on a condition, not an issue).
 * A parent with sub-issues, all closed, is closed as done. An issue with a label outside the states, or two
 * status:* labels, is a problem.
 */
export function reconcilePlan(issues, blockers = new Map(), children = new Map()) {
  const actions = [];
  const problems = [];
  for (const it of issues) {
    const cur = stateOf(it.labels);
    if (!STATES.includes(cur)) {
      problems.push(`#${it.number} 的 label「${cur}」不是 issue 的状态（旧状态机留下的就先迁移）`);
      continue;
    }
    if (cur === 'blocked') {
      const by = blockers.get(it.number) ?? [];
      if (by.length && by.every((b) => !b.open)) actions.push({ n: it.number, from: cur, to: 'todo', why: `挡着它的 ${by.map((b) => `#${b.number}`).join('、')} 都已关闭` });
      continue;
    }
    const kids = children.get(it.number) ?? [];
    if (kids.length && kids.every((k) => !k.open) && !['done', 'canceled'].includes(cur)) {
      actions.push({ n: it.number, from: cur, to: 'done', why: `子 issue ${kids.map((k) => `#${k.number}`).join('、')} 都已关闭` });
    }
  }
  return { actions, problems };
}

// ---------- gh boundary ----------

export const defaultGh = (cwd) => (args) => execFileSync('gh', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

function issue(gh, n) {
  const v = JSON.parse(gh(['api', `repos/{owner}/{repo}/issues/${n}`]));
  return row(v);
}

const row = (i) => ({
  number: i.number,
  id: i.id,
  title: i.title,
  open: i.state === 'open' || i.state === 'OPEN',
  labels: (i.labels ?? []).map((l) => (typeof l === 'string' ? l : l.name)),
  milestone: i.milestone?.number ?? null,
  parent: Number(String(i.parent_issue_url ?? '').match(/\/issues\/(\d+)$/)?.[1]) || null,
  subTotal: i.sub_issues_summary?.total ?? 0,
  blockedBy: i.issue_dependencies_summary?.blocked_by ?? 0,
  totalBlockedBy: i.issue_dependencies_summary?.total_blocked_by ?? 0,
});

const PAGE = 100;

/** Every open issue (pull requests left out) from the repo-wide REST list, page by page. */
function openIssues(gh) {
  const out = [];
  for (let page = 1; ; page += 1) {
    const rows = JSON.parse(gh(['api', `repos/{owner}/{repo}/issues?state=open&per_page=${PAGE}&page=${page}`]));
    for (const i of rows) if (!i.pull_request) out.push(row(i));
    if (rows.length < PAGE) return out;
  }
}

const subIssues = (gh, n) => JSON.parse(gh(['api', `repos/{owner}/{repo}/issues/${n}/sub_issues?per_page=100`])).map(row);
const blockersOf = (gh, n) => JSON.parse(gh(['api', `repos/{owner}/{repo}/issues/${n}/dependencies/blocked_by?per_page=100`])).map(row);

/** Leaves the issue carrying exactly the label of `state`. */
function relabel(gh, n, labels, state) {
  const want = [label(state)];
  const add = want.filter((l) => !labels.includes(l));
  const remove = labels.filter((l) => l.startsWith(PREFIX) && !want.includes(l));
  if (!add.length && !remove.length) return;
  gh(['issue', 'edit', String(n), ...add.flatMap((l) => ['--add-label', l]), ...remove.flatMap((l) => ['--remove-label', l])]);
}

/** Moves #n to `state`: relabels, comments when there is something to say, closes for done / canceled. */
function move(gh, it, state, comment = '') {
  relabel(gh, it.number, it.labels, state);
  const body = comment ? `${AI_PREFIX}${comment}` : '';
  if (CLOSED[state]) gh(['issue', 'close', String(it.number), '--reason', CLOSED[state], ...(body ? ['--comment', body] : [])]);
  else if (body) gh(['issue', 'comment', String(it.number), '--body', body]);
}

/** The spec under <docs> whose `issues:` lists #n, or else #n's parent; null when none does. */
export function specFor(docs, n, parent = null) {
  const specs = scan(docs).specs.map((s) => ({ slug: s.slug, md: readFileSync(s.file, 'utf8') }));
  return specs.find((s) => issuesOf(s.md).includes(n)) ?? (parent ? specs.find((s) => issuesOf(s.md).includes(parent)) : null) ?? null;
}

/**
 * Creates the missing status:* and type:* labels, and returns the labels outside the kept set with how
 * many open issues carry each; with `prune` they are deleted. Without categories nothing is pruned: the
 * keep-list lives in the same section, so every project label would look surplus.
 */
export function ensureLabels(gh, types = null, { prune = false } = {}) {
  const have = new Set(JSON.parse(gh(['label', 'list', '--limit', '500', '--json', 'name'])).map((l) => l.name));
  const want = [
    ...STATES.map((s) => ({ name: label(s), color: COLORS[s], about: `idea-loop：${ABOUT[s]}` })),
    ...typeLabels(types),
  ];
  const made = [];
  for (const l of want) {
    if (have.has(l.name)) continue;
    gh(['label', 'create', l.name, '--color', l.color, '--description', l.about || 'idea-loop：分类']);
    made.push(l.name);
  }
  if (!types) {
    if (prune) throw new Error(`没有「${TYPES_HEADING}」一节，不知道该留哪些 label，不清理`);
    return { made, surplus: [], deleted: [] };
  }
  const kept = keptLabels(types);
  const uses = new Map();
  for (const i of openIssues(gh)) for (const l of i.labels) uses.set(l, (uses.get(l) ?? 0) + 1);
  const surplus = [...have].filter((l) => !kept.has(l)).sort().map((name) => ({ name, openIssues: uses.get(name) ?? 0 }));
  const deleted = [];
  if (prune) {
    for (const { name } of surplus) {
      gh(['label', 'delete', name, '--yes']);
      deleted.push(name);
    }
  }
  return { made, surplus, deleted };
}

/** Leaves #n carrying exactly the type:* labels of `values`. */
export function setTypes(gh, types, n, values) {
  const want = typeSet(types, values);
  const it = issue(gh, n);
  const add = want.filter((l) => !it.labels.includes(l));
  const remove = it.labels.filter((l) => l.startsWith(TYPE_PREFIX) && !want.includes(l));
  if (add.length || remove.length) gh(['issue', 'edit', String(n), ...add.flatMap((l) => ['--add-label', l]), ...remove.flatMap((l) => ['--remove-label', l])]);
  return want;
}

/** The todo issues a dispatch round may hand out: none an open issue still blocks, oldest first. */
export function candidates(gh, limit = 100, { types = null, queue = null } = {}) {
  if (queue !== null && !queues(types).some((q) => q.name === queue)) throw new Error(`「${queue}」不是独立队列（${queues(types).slice(1).map((q) => q.name).join(' / ') || '这个项目没有独立队列'}）`);
  return openIssues(gh)
    .filter((i) => stateOf(i.labels) === 'todo' && !(i.blockedBy > 0))
    .filter((i) => queueOf(types, i.labels).name === queue)
    .sort((a, b) => a.number - b.number)
    .slice(0, limit)
    .map(({ number, title, parent }) => ({ number, title, parent }));
}

/** #n with what a session needs to know where it is: state, parent, sub-issues, blockers, milestone, spec. */
export function show(gh, docs, n) {
  const it = issue(gh, n);
  const kids = it.subTotal ? subIssues(gh, n) : [];
  const by = it.totalBlockedBy ? blockersOf(gh, n) : [];
  const spec = specFor(docs, n, it.parent);
  return {
    number: it.number,
    title: it.title,
    state: stateOf(it.labels),
    open: it.open,
    kind: it.parent ? 'sub-issue' : kids.length ? 'parent' : 'single',
    parent: it.parent,
    subIssues: kids.map((k) => ({ number: k.number, title: k.title, state: stateOf(k.labels), open: k.open })),
    blockedBy: by.map((b) => ({ number: b.number, title: b.title, open: b.open })),
    milestone: it.milestone,
    spec: spec?.slug ?? null,
  };
}

/** Checked flips: every one is checked before any is made, so one refusal leaves them all where they were. */
export function setState(gh, docs, state, numbers, { comment = '', skipDesign = false } = {}) {
  const flips = [];
  for (const n of numbers) {
    const it = issue(gh, n);
    const cur = stateOf(it.labels);
    if (!it.open && !CLOSED[cur]) throw new Error(`#${n} 已关闭`);
    const spec = specFor(docs, n, it.parent)?.md ?? null;
    const why = transitionError(cur, state, spec, { comment, skipDesign });
    if (why) throw new Error(`#${n}：${why}`);
    flips.push({ it, cur });
  }
  return flips.map(({ it, cur }) => {
    move(gh, it, state, comment);
    return `#${it.number}: ${cur} → ${state}${CLOSED[state] ? `（关闭，${CLOSED[state]}）` : ''}`;
  });
}

/** Opens a sub-issue of #parent in todo, with the parent's type:*, priority:* and milestone; returns its number. */
export function split(gh, parentN, title, body) {
  const parent = issue(gh, parentN);
  if (!parent.open) throw new Error(`#${parentN} 已关闭，不拆`);
  if (parent.parent) throw new Error(`#${parentN} 自己是 #${parent.parent} 的子 issue：子 issue 不再拆`);
  const inherited = parent.labels.filter((l) => l.startsWith(TYPE_PREFIX) || l.startsWith('priority:'));
  const args = ['issue', 'create', '--title', title, '--body', body, '--label', label('todo'), ...inherited.flatMap((l) => ['--label', l])];
  if (parent.milestone) {
    const m = JSON.parse(gh(['api', `repos/{owner}/{repo}/milestones/${parent.milestone}`]));
    args.push('--milestone', m.title);
  }
  const out = String(gh(args)).trim();
  const n = Number(out.match(/\/issues\/(\d+)$/)?.[1]);
  if (!n) throw new Error(`gh issue create 没返回 issue 地址：${out}`);
  const child = issue(gh, n);
  gh(['api', '-X', 'POST', `repos/{owner}/{repo}/issues/${parentN}/sub_issues`, '-F', `sub_issue_id=${child.id}`]);
  return n;
}

/** Records "#n is blocked by" each blocker and moves #n to blocked. */
export function block(gh, docs, n, blockerNs) {
  const it = issue(gh, n);
  const why = transitionError(stateOf(it.labels), 'blocked', null, { comment: 'x' });
  if (why) throw new Error(`#${n}：${why}`);
  const blockers = blockerNs.map((b) => issue(gh, b));
  for (const b of blockers) gh(['api', '-X', 'POST', `repos/{owner}/{repo}/issues/${n}/dependencies/blocked_by`, '-F', `issue_id=${b.id}`]);
  move(gh, it, 'blocked', `被 ${blockers.map((b) => `#${b.number}`).join('、')} 挡着；它们都关闭后，调度的对账把这个 issue 翻回 todo。`);
  return `#${n}: ${stateOf(it.labels)} → blocked（被 ${blockers.map((b) => `#${b.number}`).join('、')} 挡着）`;
}

export function reconcile(gh) {
  const open = openIssues(gh);
  const blockers = new Map(open.filter((i) => stateOf(i.labels) === 'blocked' && i.totalBlockedBy > 0).map((i) => [i.number, blockersOf(gh, i.number)]));
  const children = new Map(open.filter((i) => i.subTotal > 0).map((i) => [i.number, subIssues(gh, i.number)]));
  const { actions, problems } = reconcilePlan(open, blockers, children);
  const byNumber = new Map(open.map((i) => [i.number, i]));
  const done = actions.map((a) => {
    move(gh, byNumber.get(a.n), a.to, `${a.why}，翻成 ${a.to}。`);
    return `#${a.n}: ${a.from} → ${a.to}（${a.why}）`;
  });
  return { done, problems };
}

/** Opens a spec issue for a spec that covers none, in status:spec; returns its number, or null when the spec already lists issues. */
export function openSpecIssue(gh, docs, slug) {
  const file = join(docs, 'spec', slug, `${slug}.md`);
  if (!existsSync(file)) throw new Error(`没有 ${file}`);
  const md = readFileSync(file, 'utf8');
  if (issuesOf(md).length) return null;
  const title = String(md).match(/^# (.+)$/m)?.[1].trim() || slug;
  const body = [frontmatter(md).summary ?? '', '', `spec：\`docs/spec/${slug}/${slug}.md\`。这个 issue 是它在 tracker 上的入口，状态看这里的 label。`].join('\n');
  const out = String(gh(['issue', 'create', '--title', `${SPEC_ISSUE}${title}`, '--body', body, '--label', label('spec')])).trim();
  const n = Number(out.match(/\/issues\/(\d+)$/)?.[1]);
  if (!n) throw new Error(`gh issue create 没返回 issue 地址：${out}`);
  writeFileSync(file, withIssues(md, [n]));
  return n;
}

// ---------- cli ----------

const num = (v, what) => {
  if (!/^\d+$/.test(String(v ?? ''))) throw new Error(`${what}「${v ?? ''}」不是数字`);
  return Number(v);
};

const COMMANDS = ['labels', 'type', 'show', 'set', 'split', 'block', 'candidates', 'reconcile', 'queues', 'open'];

function main() {
  const argv = process.argv.slice(2);
  const flags = Object.fromEntries(argv.filter((x) => x.startsWith('--')).map((x) => { const [k, ...v] = x.slice(2).split('='); return [k, v.length ? v.join('=') : true]; }));
  const [cmd, docs, a, b, ...rest] = argv.filter((x) => !x.startsWith('--'));
  if (!docs || !existsSync(docs)) throw new Error(`usage: issues.mjs <${COMMANDS.join('|')}> <docs> …（${docs ?? '没给 docs'} 不存在）`);
  if (!COMMANDS.includes(cmd)) throw new Error(`不认识的命令「${cmd}」（${COMMANDS.join(' / ')}）`);
  const gh = defaultGh(docs);
  const print = (lines) => lines.forEach((l) => console.log(l));
  const json = (v) => console.log(JSON.stringify(v, null, 2));
  if (cmd === 'labels') {
    const { made, surplus, deleted } = ensureLabels(gh, readTypes(docs), { prune: !!flags.prune });
    print(made.map((l) => `created ${l}`));
    if (flags.prune) return print(deleted.map((l) => `deleted ${l}`));
    if (surplus.length) print([`不在状态、分类和保留清单里的 label（--prune 删掉它们，issue 上的也一起去掉）：`, ...surplus.map((s) => `  ${s.name}（${s.openIssues} 个 open issue 在用）`)]);
    return;
  }
  if (cmd === 'candidates') return json(candidates(gh, a ? num(a, 'limit') : undefined, { types: readTypes(docs), queue: typeof flags.queue === 'string' ? flags.queue : null }));
  if (cmd === 'queues') {
    const types = readTypes(docs);
    return json(a ? queueOf(types, issue(gh, num(a, 'issue')).labels) : queues(types));
  }
  if (cmd === 'reconcile') {
    const { done, problems } = reconcile(gh);
    print(done);
    return print(problems.map((p) => `问题：${p}`));
  }
  if (!a) throw new Error(`usage: issues.mjs ${cmd} <docs> …`);
  if (cmd === 'show') return json(show(gh, docs, num(a, 'issue')));
  if (cmd === 'type') {
    if (b === undefined) throw new Error('usage: issues.mjs type <docs> <issue 号> <父类[/子类]>...');
    return console.log(`#${num(a, 'issue')}: ${setTypes(gh, readTypes(docs), num(a, 'issue'), [b, ...rest]).join(' ')}`);
  }
  if (cmd === 'set') {
    if (b === undefined) throw new Error('usage: issues.mjs set <docs> <状态> <issue 号>... [--comment=<文字>] [--skip-design]');
    return print(setState(gh, docs, a, [b, ...rest].map((x) => num(x, 'issue')), { comment: typeof flags.comment === 'string' ? flags.comment : '', skipDesign: !!flags['skip-design'] }));
  }
  if (cmd === 'split') {
    const [title, bodyFile] = [b, rest[0]];
    if (!title || !bodyFile || !existsSync(bodyFile)) throw new Error('usage: issues.mjs split <docs> <父号> <标题> <正文文件>');
    return console.log(`#${split(gh, num(a, 'issue'), title, readFileSync(bodyFile, 'utf8'))}`);
  }
  if (cmd === 'block') {
    if (b === undefined) throw new Error('usage: issues.mjs block <docs> <issue 号> <挡路的号>...');
    return console.log(block(gh, docs, num(a, 'issue'), [b, ...rest].map((x) => num(x, 'issue'))));
  }
  if (cmd === 'open') {
    const n = openSpecIssue(gh, docs, a);
    return console.log(n ? `#${n} ← spec ${a}` : `spec ${a} 已经列了 issue，不另开`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch (error) {
    console.error(error.stderr ? String(error.stderr).trim() || error.message : error.message);
    process.exitCode = 1;
  }
}
