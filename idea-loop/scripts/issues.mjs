#!/usr/bin/env node
/**
 * The one way a GitHub issue's status changes (skills/engineering/spec-status/SKILL.md, section issue 的状态).
 *
 * The issue label says which stage of its line an issue is in; the dispatch loop and the sidebar read it.
 * One session carries a group from its opening to the merge on one branch (the code branch, and the
 * knowledge base's branch of the same name): nothing lands on main in between. An open issue with no
 * `status:*` label is 待验证. The session claims it (讨论中) and reproduces, drafts the spec and grills;
 * once the spec is final (its own commit, `docs(spec): <slug> 定稿`) `advance` reads that spec on the
 * session's branch and moves the issue on to 设计中 (it touches UI and has no freeze yet) or 实现中. When
 * the report is handed over and the PRs turn ready the session sets 审核中: a PR is open, one review round
 * ran, the human reads. After the merge `advance` closes the issues (spec 完成, or 不存在 in its opening
 * lines or an older spec's 「验证」 table). 搁置 keeps the loop away from an issue; `resume` puts it back.
 *
 * `reconcile` only does what the knowledge base's main branch settles: it closes the issues of a 完成
 * spec or one that marks them 不存在, as a safety net for a session that did not. It sets no state: a
 * spec reaches main only with the merge, so a 中 issue with no spec on main is the normal case.
 *
 * The link from a spec to its issues lives in the spec's frontmatter (`issues: [12, 15]`). A spec that
 * covers no issue (one written from a conversation) gets a spec issue from `open`, claimed 讨论中 on the
 * spot: the conversation that wrote it is its session. `candidates` never offers a spec issue.
 *
 * Issues can be grouped under a root: GitHub's native sub-issues. A root is an issue that has sub-issues, a
 * sub-issue one that has a parent. A group is one session; in an application repository it is one spec
 * listing every sub-issue (never the root), in a repository released by version it is one version whose
 * features each have a spec. `candidates` offers the root and never its sub-issues, `set` on the root's
 * number flips the root and its open sub-issues together, and the root's own label is not worked on but
 * moves with its sub-issues: when `reconcile` or `advance` flips or closes them the root goes along, and
 * it is closed as completed once none is open. A root with an open sub-issue the one spec does not list,
 * or whose sub-issues would end up in different states, stays put and is reported as a problem; a root
 * whose sub-issues are split over several specs (a version's features) stays put silently. A root none of
 * whose sub-issues a spec lists yet is left alone. `group` names the root and the open sub-issues of any member.
 *
 * Besides its status an issue carries category labels, `type:<parent>` and optionally
 * `type:<parent>/<child>`. The project lists them in the「issue 分类」section of its AGENTS.md (or
 * CLAUDE.md), together with the other labels it keeps; `labels --prune` deletes every label outside the
 * status states, the categories and that keep-list.
 *
 * The dispatch loop hands out sessions from queues, each with its own cap on open sessions. Every issue
 * is in the main queue (cap 10) unless its parent category is marked「（独立队列，上限 N）」in that
 * section: then it waits in that category's own queue, so a category that files issues in bulk (seo-scan
 * has no cap) cannot crowd out the rest. A queue's sessions sit in its own sidebar sections, the stage
 * names prefixed with the category (`seo 讨论中`), which is how the loop counts them apart.
 *
 * Projects set up before the four stages carry the older labels (验证中, 审核中 meaning the spec was being
 * grilled, 待设计, 待实现); `migrate` lists how each open issue maps onto the new ones and, with --apply,
 * relabels them and deletes the old labels. Whether a repository still has them is read from its label
 * list, so a second run finds nothing and the new 审核中 is never mistaken for the old one.
 *
 * Usage (<docs> is the knowledge base's docs/ directory. gh runs with GH_REPO set to the `issues` of the
 * idea-loop.json one level up, so it acts on the business's issue repository, not on the knowledge base's own; a
 * target is an issue number or a spec slug, which stands for every issue the spec lists):
 *   node issues.mjs labels     <docs> [--prune]                → creates the missing status:* and type:* labels; lists the rest, --prune deletes them
 *   node issues.mjs type       <docs> <n> <parent[/child]>...  → sets #n's type:* labels from the project's categories
 *   node issues.mjs advance    <docs> <spec-slug>              → the spec in <docs> (the session's branch) moves its issues on to 设计中 / 实现中, or closes them after the merge
 *   node issues.mjs candidates <docs> [<limit>] [--queue=<c>]  → JSON: 待验证 issues no spec lists, oldest first; main queue, or category c's own;
 *                                                                 sub-issues and issues opened under 6 hours ago are skipped (a root is never held back)
 *   node issues.mjs group      <docs> <n>                      → JSON: the root of #n (the root's number or any sub-issue's) and its open sub-issues
 *   node issues.mjs queues     <docs> [<n>]                    → JSON: every queue (cap, sidebar sections), or the one issue #n is in
 *   node issues.mjs set        <docs> <state> <target>...      → checked flip: claim, 审核中, giving up, 搁置; a root's number flips its open sub-issues too
 *   node issues.mjs reconcile  <docs>                          → the closings main already decides
 *   node issues.mjs migrate    <docs> [--apply]                → older labels → the four stages: lists the flips, --apply makes them and deletes the old labels
 *   node issues.mjs resume     <docs> <target>...              → 搁置 → closed or back where main says, else 待验证
 *   node issues.mjs handoff    <docs> <spec-slug> <n>          → adds #n to the spec's frontmatter (GitHub untouched)
 *   node issues.mjs open       <docs> <spec-slug>              → the spec covers no issue: opens a spec issue claimed 讨论中, writes its number into the spec
 *   node issues.mjs unhandoff  <docs> <spec-slug> <n>          → takes #n off the spec and its label off → 待验证
 *   node issues.mjs drop       <docs> <spec-slug> <n>          → takes #n off the spec and closes it as not planned (the human decided)
 * Exit: 0 = done, 1 = refused / usage / gh error (the reason on stderr).
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CONFIG_FILE, readBusinessConfig } from './knowledge-base.mjs';
import { frontmatter, hasFreezeSummary, issuesOf, scan, touchesUi, verdicts } from './spec-status.mjs';

export { issuesOf };

export const PREFIX = 'status:';
export const label = (state) => `${PREFIX}${state}`;
export const UNLABELLED = '待验证';
/** The states an open issue can carry as a label, in the order of its line; 待验证 is the absence of one. */
export const STATES = ['讨论中', '设计中', '实现中', '审核中', '搁置'];
const COLORS = { 讨论中: 'fbca04', 设计中: '5319e7', 实现中: '0e8a16', 审核中: '1d76db', 搁置: 'bfbfbf' };
const ABOUT = {
  讨论中: 'idea-loop：讨论中（复现、写 spec、grill）',
  设计中: 'idea-loop：设计中',
  实现中: 'idea-loop：实现中（切工单、实现、review 第一轮）',
  审核中: 'idea-loop：审核中（PR 已开出、review 过一轮，等人读）',
  搁置: 'idea-loop 不接手',
};

/**
 * The flips `set` allows. 设计中 and 实现中 are reached through `advance`, which reads the spec; 搁置
 * leaves through `resume`.
 */
export const NEXT = {
  待验证: ['讨论中', '搁置'],
  讨论中: ['待验证', '搁置'],
  设计中: ['搁置'],
  实现中: ['审核中', '搁置'],
  审核中: ['实现中', '搁置'],
  搁置: [],
};

/** The older labels and the stage each maps onto; the first three exist only before `migrate`. */
export const OLD_STATES = { 验证中: '讨论中', 待设计: '设计中', 待实现: '实现中' };
const OLD_MAP = { ...OLD_STATES, 审核中: '讨论中' };

/** An issue opened less than this long ago waits: the consolidation task runs every 6 hours and should have seen it once. */
export const NEW_ISSUE_WAIT_MS = 6 * 3600_000;

/** An issue's state from its labels: the status:* label, 待验证 when there is none. */
export function stateOf(labels) {
  const own = labels.filter((l) => l.startsWith(PREFIX)).map((l) => l.slice(PREFIX.length));
  if (!own.length) return UNLABELLED;
  return own.length === 1 ? own[0] : own.join(' + ');
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
export const STAGE_SECTIONS = ['讨论中', '设计中', '实现中', '审核中'];

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
const isSpecIssue = (title) => String(title ?? '').startsWith(SPEC_ISSUE);

export function withIssues(md, list) {
  const m = String(md).match(/^(---\n[\s\S]*?)(\n---)([\s\S]*)$/);
  if (!m) throw new Error('spec has no frontmatter');
  const line = `issues: [${[...new Set(list)].sort((a, b) => a - b).join(', ')}]`;
  const head = /^issues:/m.test(m[1]) ? m[1].replace(/^issues:.*$/m, line) : `${m[1]}\n${line}`;
  return head + m[2] + m[3];
}

/** Where this spec says its issue belongs: a stage, a closing, or null while the spec is not final. */
export function targetOf(md, n) {
  const status = frontmatter(md).status;
  if (!['正式', '实现中', '完成'].includes(status)) return null;
  if (verdicts(md).get(n) === '不存在') return { close: 'not planned' };
  if (status === '完成') return { close: 'completed' };
  if (status === '实现中') return { state: '实现中' };
  return { state: touchesUi(md) && !hasFreezeSummary(md) ? '设计中' : '实现中' };
}

const MIGRATE_HINT = '（旧标签留下的就先跑 issues migrate）';

/**
 * The closings main already decides. `specs` are the specs on the knowledge base's main branch ({ slug, md }),
 * `issues` the open issues ({ number, title, labels }). An issue of a 完成 spec, or one the spec marks
 * 不存在, is closed from any state but 搁置; nothing else is touched. A label that is not a stage is a problem.
 */
export function reconcilePlan(specs, issues) {
  const open = new Map(issues.map((i) => [i.number, i]));
  const specOf = new Map();
  const actions = [];
  const problems = [];
  for (const { slug, md } of specs) {
    for (const n of issuesOf(md)) {
      specOf.set(n, [...(specOf.get(n) ?? []), slug]);
      const it = open.get(n);
      if (!it) continue;
      const cur = stateOf(it.labels);
      if (cur === '搁置') continue;
      if (![UNLABELLED, ...STATES].includes(cur)) {
        problems.push(`#${n} 的 label「${cur}」不是 issue 的状态${MIGRATE_HINT}`);
        continue;
      }
      const t = targetOf(md, n);
      if (t?.close) actions.push({ n, slug, close: t.close, from: cur });
    }
  }
  const roots = rootPlan(issues, changesOf(actions), specOf);
  actions.push(...roots.actions);
  problems.push(...roots.problems);
  return { actions, problems };
}

const ORDER = ['设计中', '实现中', '审核中'];

/**
 * What `advance` does for one spec, read from the <docs> it is given (the session's own branch while the
 * line is open, so nothing has to land on main first): each open issue goes to the stage the spec says, an
 * issue already in 审核中 stays there, and a 完成 spec or a 不存在 verdict closes it. `phase` is where the
 * session is next: 设计中, 实现中, 审核中, or 关闭 once every issue is closed.
 */
export function advancePlan(md, issues) {
  const open = new Map(issues.map((i) => [i.number, i]));
  const status = frontmatter(md).status;
  const actions = [];
  const phases = new Set();
  for (const n of issuesOf(md)) {
    const it = open.get(n);
    if (!it) continue;
    const cur = stateOf(it.labels);
    if (cur === '搁置') throw new Error(`#${n} 是「搁置」，先 resume`);
    if (![UNLABELLED, ...STATES].includes(cur)) throw new Error(`#${n} 的 label「${cur}」不是 issue 的状态${MIGRATE_HINT}`);
    const t = targetOf(md, n);
    if (!t) throw new Error(`spec 在这份 docs 里是「${status}」，还没定稿（advance 在 spec 翻「正式」、定稿提交之后跑）`);
    if (t.close) {
      actions.push({ n, from: cur, close: t.close });
      continue;
    }
    if (t.state === '设计中' && ['实现中', '审核中'].includes(cur)) throw new Error(`#${n} 已经是「${cur}」，spec 却还要设计`);
    const to = cur === '审核中' ? '审核中' : t.state;
    phases.add(to);
    if (cur !== to) actions.push({ n, from: cur, to });
  }
  const phase = ORDER.find((p) => phases.has(p)) ?? '关闭';
  return { actions, phase };
}

/**
 * What `migrate` does. `labels` are the repository's label names, `issues` its open issues. Nothing when
 * none of the older-only labels (验证中, 待设计, 待实现) exists: the repository is already on the four
 * stages, and its 审核中 is the new one. Otherwise each open issue in an older state goes to its stage
 * (验证中 and the older 审核中 → 讨论中, 待设计 → 设计中, 待实现 → 实现中) and the older labels are dropped.
 */
export function migratePlan(labels, issues) {
  const old = Object.keys(OLD_STATES).filter((s) => labels.includes(label(s)));
  if (!old.length) return { actions: [], drop: [] };
  const actions = [];
  for (const it of [...issues].sort((a, b) => a.number - b.number)) {
    const own = it.labels.filter((l) => l.startsWith(PREFIX)).map((l) => l.slice(PREFIX.length));
    const to = own.map((s) => OLD_MAP[s]).find(Boolean);
    if (to) actions.push({ n: it.number, from: own.join(' + '), to });
  }
  return { actions, drop: old.map(label) };
}

/**
 * What the roots do once `changes` (issue number → `{ to }` or `{ close: true }`) are applied. `specOf`
 * maps an issue number to the slugs of the specs listing it. When the specs close all the open sub-issues
 * the root is closed as completed. A root whose sub-issues are split over several specs (a version's
 * features) otherwise stays put. With one spec the root goes to the state its sub-issues end up in (parked
 * ones aside, and it stays put while all are parked); a root with an open sub-issue that spec does not
 * list, or whose sub-issues end up in different states, stays put and is reported. A root none of whose
 * sub-issues is listed by a spec is left alone; a root with no open sub-issue left is closed. A parked root is left alone.
 * `only` limits it to those root numbers; `quiet` leaves a root with sub-issues outside the spec put without a
 * problem (`advance` sees one spec, and a version's other features are on other branches). `issues` are the open issues ({ number, labels, parent?, subCount? }).
 * Returns `{ actions, problems }`.
 */
export function rootPlan(issues, changes = new Map(), specOf = new Map(), only = null, { quiet = false } = {}) {
  const kids = new Map();
  for (const i of issues) if (i.parent) kids.set(i.parent, [...(kids.get(i.parent) ?? []), i]);
  const actions = [];
  const problems = [];
  for (const root of issues) {
    if (!(root.subCount > 0) || (only && !only.has(root.number))) continue;
    if (changes.get(root.number)?.close) continue;
    const cur = stateOf(root.labels);
    if (cur === '搁置' || ![UNLABELLED, ...STATES].includes(cur)) continue;
    const open = kids.get(root.number) ?? [];
    if (!open.length) {
      actions.push({ n: root.number, close: 'completed', why: 'children', from: cur });
      continue;
    }
    const listed = open.filter((k) => specOf.has(k.number));
    if (!listed.length) continue;
    const slugs = [...new Set(listed.flatMap((k) => specOf.get(k.number)))];
    const alive = open.filter((k) => !changes.get(k.number)?.close);
    if (!alive.length) {
      actions.push({ n: root.number, close: 'completed', why: 'spec', slug: slugs.join('、'), from: cur });
      continue;
    }
    // a version's features: each has its own spec, the root stays with the version's session
    if (slugs.length > 1) continue;
    if (listed.length < open.length) {
      if (quiet) continue;
      const outside = open.filter((k) => !specOf.has(k.number)).map((k) => `#${k.number}`);
      problems.push(`#${root.number} 的子 issue 没有都在同一份 spec 里（${outside.join('、')} 不在 spec ${slugs[0]} 里），根没有动；分组和 spec 对不上`);
      continue;
    }
    const states = [...new Set(alive.map((k) => changes.get(k.number)?.to ?? stateOf(k.labels)).filter((st) => st !== '搁置'))];
    if (states.length > 1) {
      problems.push(`#${root.number} 的子 issue 要翻去的状态不一致（${states.join(' / ')}），根没有动；分组和 spec 对不上`);
      continue;
    }
    if (states.length && states[0] !== cur) actions.push({ n: root.number, from: cur, to: states[0], root: true });
  }
  return { actions, problems };
}

const changesOf = (actions) => new Map(actions.map((a) => [a.n, a.close ? { close: true } : { to: a.to }]));

// ---------- gh boundary ----------

/**
 * The environment `gh` runs in for the knowledge base whose `docs/` is <docs>: the knowledge base root (one level up)
 * names, in its `idea-loop.json`, the GitHub repository the business's issues live in (`issues`: "owner/name"), which
 * goes into GH_REPO. Without that file or that field, nothing is added and `gh` acts on the repository it runs in.
 */
export function ghEnv(docs, env = process.env) {
  const root = dirname(resolve(docs));
  if (!existsSync(join(root, CONFIG_FILE))) return env;
  const { issues } = readBusinessConfig(root);
  return issues ? { ...env, GH_REPO: issues } : env;
}

export const defaultGh = (docs) => {
  const env = ghEnv(docs);
  return (args) => execFileSync('gh', args, { cwd: docs, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
};

function issue(gh, n) {
  const v = JSON.parse(gh(['issue', 'view', String(n), '--json', 'number,state,title,labels']));
  return { number: v.number, state: v.state, title: v.title, labels: v.labels.map((l) => l.name) };
}

const PAGE = 100;

/**
 * Every open issue (pull requests left out) from the repo-wide REST list, page by page, with what the list
 * gives for free: when it was opened, its parent (the number, or null) and how many sub-issues it has (open
 * or closed; above 0 makes it a root).
 */
function openIssues(gh) {
  const out = [];
  for (let page = 1; ; page += 1) {
    const rows = JSON.parse(gh(['api', `repos/{owner}/{repo}/issues?state=open&per_page=${PAGE}&page=${page}`]));
    for (const i of rows) {
      if (i.pull_request) continue;
      out.push({
        number: i.number,
        title: i.title,
        labels: i.labels.map((l) => l.name),
        createdAt: Date.parse(i.created_at),
        parent: Number(String(i.parent_issue_url ?? '').match(/\/issues\/(\d+)$/)?.[1]) || null,
        subCount: i.sub_issues_summary?.total ?? 0,
      });
    }
    if (rows.length < PAGE) return out;
  }
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

/**
 * Creates the missing status:* and type:* labels, and returns the labels outside the kept set with how
 * many open issues carry each; with `prune` they are deleted. Without categories nothing is pruned: the
 * keep-list lives in the same section, so every project label would look surplus.
 */
export function ensureLabels(gh, types = null, { prune = false } = {}) {
  const have = new Set(JSON.parse(gh(['label', 'list', '--limit', '500', '--json', 'name'])).map((l) => l.name));
  const want = [
    ...STATES.map((s) => ({ name: label(s), color: COLORS[s], about: ABOUT[s] })),
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

/** Issue numbers some spec under <docs> lists. */
export function listedIssues(docs) {
  return new Set(specsOn(docs).flatMap((s) => issuesOf(s.md)));
}

export function candidates(gh, limit = 100, listed = new Set(), { types = null, queue = null, now = Date.now() } = {}) {
  if (queue !== null && !queues(types).some((q) => q.name === queue)) throw new Error(`「${queue}」不是独立队列（${queues(types).slice(1).map((q) => q.name).join(' / ') || '这个项目没有独立队列'}）`);
  return openIssues(gh)
    .filter((i) => stateOf(i.labels) === UNLABELLED && !listed.has(i.number) && !isSpecIssue(i.title))
    .filter((i) => !i.parent && (i.subCount > 0 || !(now - i.createdAt < NEW_ISSUE_WAIT_MS)))
    .filter((i) => queueOf(types, i.labels).name === queue)
    .sort((a, b) => a.number - b.number)
    .slice(0, limit)
    .map(({ number, title }) => ({ number, title }));
}

export function setState(gh, docs, state, targets) {
  if (![UNLABELLED, ...STATES].includes(state)) throw new Error(`「${state}」不是 issue 的状态（${[UNLABELLED, ...STATES].join(' / ')}）`);
  // A root's number stands for the root and its open sub-issues. Every flip is checked before any is made,
  // so a sub-issue that cannot move leaves the whole group where it was.
  const numeric = new Set(targets.filter((t) => /^\d+$/.test(String(t))).map(Number));
  const open = numeric.size ? openIssues(gh) : [];
  const numbers = [...new Set(expand(docs, targets).flatMap((n) => [n, ...(numeric.has(n) ? open.filter((i) => i.parent === n).map((i) => i.number) : [])]))];
  const flips = [];
  for (const n of numbers) {
    const it = issue(gh, n);
    if (it.state !== 'OPEN') continue;
    const cur = stateOf(it.labels);
    if (cur === state) continue;
    if (!(NEXT[cur] ?? []).includes(state)) {
      const hint = ['设计中', '实现中'].includes(state) ? '——进设计中 / 实现中走 advance，它读 spec' : '';
      throw new Error(`#${n} 是「${cur}」，不能翻成「${state}」（能翻成：${(NEXT[cur] ?? []).join(' / ') || '无'}）${hint}`);
    }
    flips.push({ n, cur, labels: it.labels });
  }
  return flips.map(({ n, cur, labels }) => {
    relabel(gh, n, labels, state);
    return `#${n}: ${cur} → ${state}`;
  });
}

const ROOT_CLOSED = '子 issue 都已关闭。';

/** Applies the actions of a plan: label flips and closings (a closing says why, in a comment on the issue). */
function apply(gh, actions, byNumber, slug = null) {
  const done = [];
  for (const a of actions) {
    const labels = byNumber.get(a.n)?.labels ?? [];
    if (a.why === 'children') close(gh, a.n, labels, 'completed', ROOT_CLOSED);
    else if (a.why === 'spec') close(gh, a.n, labels, 'completed', `子 issue 随 spec \`${a.slug}\` 关闭，根随着关闭。`);
    else if (a.close === 'not planned') close(gh, a.n, labels, 'not planned', `验证为不存在，证据见 spec \`${a.slug ?? slug}\`（知识库的 \`docs/spec/${a.slug ?? slug}/${a.slug ?? slug}.md\` 开头写的结论）。`);
    else if (a.close === 'completed') close(gh, a.n, labels, 'completed', `spec \`${a.slug ?? slug}\` 已实现并合并。`);
    else relabel(gh, a.n, labels, a.to);
    done.push(a.close ? `#${a.n}: ${a.from} → 关闭（${a.close}）` : `#${a.n}: ${a.from} → ${a.to}`);
  }
  return done;
}

export function reconcile(gh, docs) {
  const open = openIssues(gh);
  const { actions, problems } = reconcilePlan(specsOn(docs), open);
  return { done: apply(gh, actions, new Map(open.map((i) => [i.number, i]))), problems };
}

export function advance(gh, docs, slug) {
  const { md } = readSpec(docs, slug);
  const open = openIssues(gh);
  const { actions, phase } = advancePlan(md, open);
  // the roots of this spec's issues move with them: to the same state, or closed when the spec closes them
  const listed = new Set(issuesOf(md));
  const roots = new Set(open.filter((i) => listed.has(i.number) && i.parent).map((i) => i.parent));
  const plan = rootPlan(open, changesOf(actions), new Map([...listed].map((n) => [n, [slug]])), roots, { quiet: true });
  return { done: apply(gh, [...actions, ...plan.actions], new Map(open.map((i) => [i.number, i])), slug), phase, problems: plan.problems };
}

/** Older labels → the four stages (`migratePlan`); without `apply` only the plan, as lines. */
export function migrate(gh, { apply = false } = {}) {
  const labels = JSON.parse(gh(['label', 'list', '--limit', '500', '--json', 'name'])).map((l) => l.name);
  const open = openIssues(gh);
  const { actions, drop } = migratePlan(labels, open);
  if (!drop.length) return ['已经是新阶段名（讨论中 / 设计中 / 实现中 / 审核中），不用迁移'];
  const lines = [...actions.map((a) => `#${a.n}: ${a.from} → ${a.to}`), ...drop.map((l) => `删除 label ${l}`)];
  if (!apply) return [...lines, '（只列出；加 --apply 才改）'];
  for (const s of STATES) {
    if (labels.includes(label(s))) gh(['label', 'edit', label(s), '--color', COLORS[s], '--description', ABOUT[s]]);
    else gh(['label', 'create', label(s), '--color', COLORS[s], '--description', ABOUT[s]]);
  }
  const byNumber = new Map(open.map((i) => [i.number, i]));
  for (const a of actions) relabel(gh, a.n, byNumber.get(a.n).labels, a.to);
  for (const l of drop) gh(['label', 'delete', l, '--yes']);
  return lines;
}

/** The group #n belongs to: its root (a root's own number, or its sub-issue's parent) and the root's open sub-issues. */
export function group(gh, n) {
  const open = openIssues(gh);
  const rootN = open.find((i) => i.number === n)?.parent ?? n;
  const root = open.find((i) => i.number === rootN) ?? issue(gh, rootN);
  return {
    root: { number: root.number, title: root.title },
    children: open.filter((i) => i.parent === rootN).sort((a, b) => a.number - b.number).map((i) => ({ number: i.number, title: i.title, state: stateOf(i.labels) })),
  };
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
  if (![UNLABELLED, '讨论中'].includes(cur)) throw new Error(`#${n} 已经是「${cur}」，不移交`);
  writeFileSync(file, withIssues(md, [...issuesOf(md), n]));
}

/** Opens a spec issue for a spec that covers none, claimed 讨论中; returns its number, or null when the spec already lists issues. */
export function openSpecIssue(gh, docs, slug) {
  const { file, md } = readSpec(docs, slug);
  if (issuesOf(md).length) return null;
  const title = String(md).match(/^# (.+)$/m)?.[1].trim() || slug;
  const body = [
    frontmatter(md).summary ?? '',
    '',
    `spec：知识库的 \`docs/spec/${slug}/${slug}.md\`。spec 文件是真相，这个 issue 是它在 tracker 上的入口：写它的会话就是它的会话，label 跟着会话的阶段走，全部合并后关闭。`,
  ].join('\n');
  const out = String(gh(['issue', 'create', '--title', `${SPEC_ISSUE}${title}`, '--body', body, '--label', label('讨论中')])).trim();
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

const COMMANDS = ['labels', 'type', 'candidates', 'group', 'queues', 'set', 'reconcile', 'migrate', 'advance', 'resume', 'handoff', 'open', 'unhandoff', 'drop'];

function main() {
  const [cmd, docs, a, b, ...rest] = process.argv.slice(2);
  if (!docs || !existsSync(docs)) throw new Error(`usage: issues.mjs <${COMMANDS.join('|')}> <docs> …（${docs ?? '没给 docs'} 不存在）`);
  if (!COMMANDS.includes(cmd)) throw new Error(`不认识的命令「${cmd}」`);
  const gh = defaultGh(docs);
  const print = (lines) => lines.forEach((l) => console.log(l));
  if (cmd === 'labels') {
    if (a !== undefined && a !== '--prune') throw new Error('usage: issues.mjs labels <docs> [--prune]');
    const { made, surplus, deleted } = ensureLabels(gh, readTypes(docs), { prune: a === '--prune' });
    print(made.map((l) => `created ${l}`));
    if (a === '--prune') return print(deleted.map((l) => `deleted ${l}`));
    if (surplus.length) print([`不在状态、分类和保留清单里的 label（--prune 删掉它们，issue 上的也一起去掉）：`, ...surplus.map((s) => `  ${s.name}（${s.openIssues} 个 open issue 在用）`)]);
    return;
  }
  if (cmd === 'candidates') {
    const args = [a, b, ...rest].filter((x) => x !== undefined);
    const flag = args.find((x) => x.startsWith('--queue='));
    const limit = args.find((x) => !x.startsWith('--'));
    const opts = { types: readTypes(docs), queue: flag ? flag.slice('--queue='.length) : null };
    return console.log(JSON.stringify(candidates(gh, limit ? num(limit, 'limit') : undefined, listedIssues(docs), opts), null, 2));
  }
  if (cmd === 'queues') {
    const types = readTypes(docs);
    return console.log(JSON.stringify(a ? queueOf(types, issue(gh, num(a, 'issue')).labels) : queues(types), null, 2));
  }
  if (cmd === 'reconcile') {
    const { done, problems } = reconcile(gh, docs);
    print(done);
    return print(problems.map((p) => `问题：${p}`));
  }
  if (cmd === 'migrate') {
    if (a !== undefined && a !== '--apply') throw new Error('usage: issues.mjs migrate <docs> [--apply]');
    return print(migrate(gh, { apply: a === '--apply' }));
  }
  if (!a) throw new Error(`usage: issues.mjs ${cmd} <docs> …`);
  if (cmd === 'group') return console.log(JSON.stringify(group(gh, num(a, 'issue')), null, 2));
  if (cmd === 'type') {
    if (b === undefined) throw new Error('usage: issues.mjs type <docs> <issue 号> <父类[/子类]>...');
    return console.log(`#${num(a, 'issue')}: ${setTypes(gh, readTypes(docs), num(a, 'issue'), [b, ...rest]).join(' ')}`);
  }
  if (cmd === 'advance') {
    const { done, phase, problems } = advance(gh, docs, a);
    print(done);
    print(problems.map((p) => `问题：${p}`));
    return console.log(`下一段：${phase}`);
  }
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
