#!/usr/bin/env node
/**
 * The one way an issue's status changes. The issue's status is the only record of how far a piece of work
 * has got: a spec is a document without a status of its own, and is done once every issue its frontmatter
 * lists (`issues: [12]`) is closed.
 *
 * Seven states. The four open ones each have a `status:<name>` label: triage (verified, a human is
 * assessing it: grill, design), todo (ready for dispatch), in-progress (a session is on it; once the spec is
 * committed it opens draft PRs), in-review (the PRs are ready, waiting for the human). backlog is open with no `status:*`
 * label: new, not yet verified, or put aside. done and canceled are the closed states and carry no label:
 * GitHub's close reason says which (completed / not planned). `set` checks every flip against NEXT and,
 * where the flip depends on something outside the issue, against that: triage → todo needs a spec with
 * nothing left for a human (and the design frozen when it touches UI, or an explicit --skip-design), done
 * needs every PR that references the issue merged, a project that skips triage (its ISSUE_TRACKER.md says
 * 「triage：跳过」) cannot `set triage`, and putting an issue back in backlog needs a comment saying where the
 * work stopped, since the next session picks up from it.
 *
 * A PR belongs to an issue when its body says `Refs <owner>/<repo>#<n>` (a bare `Refs #<n>` counts for a PR
 * in the issue's own repo). The repositories searched are the ones in the 「仓库」 section of ISSUE_TRACKER.md
 * (its first column; the issue's own repo is always searched), or only the issue's repo when there is none.
 *
 * Order between issues is GitHub's native "blocked by" relation: `candidates` leaves out a todo that an open
 * issue still blocks. Versions are milestones, modules are categories. There is no parent / child logic.
 * Among the todo issues that nothing blocks, `candidates` hands out the higher priority first: an issue carries at
 * most one `priority:P0|P1|P2` label (none = last), and within a priority the smaller number goes first.
 *
 * Issues are opened only through `new`, which refuses a body that lacks one of the four required sections
 * (问题 / 证据 / 影响范围 / 从哪发现) and an issue whose title an open issue already has. `backlog` lists the
 * backlog issues the weekly triage should look at; `note` posts a comment with the AI prefix. Closing comes
 * first: `set … done|canceled` closes the issue and only then drops its status label, so a failed close leaves
 * the issue where it was; a flip to done opens its comment with the PRs that were merged.
 *
 * A project whose issues are on Linear says so in the first heading of its ISSUE_TRACKER.md
 * (`# Issue tracker：Linear`, see `platformOf`). There the commands that write GitHub are refused (the work is
 * done with the Linear MCP, skills/engineering/issues/references/linear.md); `check <docs> <state> <n>
 * --from=<state>` takes the state from the caller instead of reading the issue, and `n` may be a Linear key
 * (`FA-577`); `show` gives the spec, the PRs and the branch with `state: null`. A Linear issue's PRs are the ones
 * in the 「仓库」 repositories whose title starts with `[<key>]` or whose body has a line `Linear: <key>`.
 *
 * Besides its status an issue carries category labels, `type:<parent>` and optionally `type:<parent>/<child>`,
 * and one kind label, `kind:bug|feature|improvement`. The project lists the categories in the「issue 分类」
 * section of its AGENTS.md (or CLAUDE.md), together with the other labels it keeps; `labels --prune` deletes
 * every label outside the status labels, the kinds, the categories and that keep-list.
 *
 * The dispatch loop hands out sessions from queues, each with its own cap on open sessions. Every issue
 * is in the main queue (cap 10) unless its parent category is marked「（独立队列，上限 N）」in that
 * section: then it waits in that category's own queue. A queue's sessions sit in its own sidebar
 * sections, one per working state, prefixed with the category (`seo in-progress`).
 *
 * Usage (<docs> is the docs/ directory; gh runs there, so it acts on that repo):
 *   node issues.mjs labels     <docs> [--prune]                       → creates the missing status:*, priority:*, kind:* and type:* labels; lists the rest, --prune deletes them
 *   node issues.mjs type       <docs> <n> <parent[/child]>...         → sets #n's type:* labels from the project's categories
 *   node issues.mjs show       <docs> <n>                             → JSON: #n's state, title, categories, its PRs (repo, draft / ready / merged), the spec that covers it, its branch
 *   node issues.mjs check      <docs> <state> <n> [--from=<state>] [--comment=<text>] [--skip-design] → only checks the flip's preconditions; writes nothing; --from: the issue is not read (n may be a Linear key)
 *   node issues.mjs set        <docs> <state> <n>... [--comment=<text>] [--skip-design] → checked flip; done / canceled close the issue first, then drop the label
 *   node issues.mjs new        <docs> <title> <body-file> [--state=backlog|todo] [--priority=P0|P1|P2] [--kind=<k>] [--type=<c>]... [--repo=<owner/repo>] → opens an issue after checking the body (in <owner/repo> when given, else the current repo); prints its number
 *   node issues.mjs body       <docs> <body-file>                     → only checks the body's four required sections
 *   node issues.mjs priority   <docs> <P0|P1|P2|none> <n>...          → replaces the issues' priority:* label (none: just removes it)
 *   node issues.mjs backlog    <docs> [<limit>]                       → JSON: open issues with no status:*, oldest first, left out when triage asked for more and nobody answered
 *   node issues.mjs note       <docs> <n> <body-file>                 → comments on #n, with the AI prefix
 *   node issues.mjs candidates <docs> [<limit>] [--queue=<c>]         → JSON: todo issues no open issue blocks, P0 → P1 → P2 → none, lower numbers first within a priority; main queue, or category c's own
 *   node issues.mjs reconcile  <docs>                                 → every PR merged → done; every PR ready → in-review; old labels, two status labels reported
 *   node issues.mjs queues     <docs> [<n>]                           → JSON: every queue (cap, sidebar sections), or the one issue #n is in
 *   node issues.mjs migrate    <docs> [--apply]                       → lists how the old Chinese status labels (and spec status lines, the sub-issue links and roots the consolidation task made) would change; --apply changes them
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
/** Every state, in the order work goes through them. */
export const STATES = ['backlog', 'triage', 'todo', 'in-progress', 'in-review', 'done', 'canceled'];
/** The four open states that carry a label; backlog is open without one, done and canceled are closed. */
export const LABELED = ['triage', 'todo', 'in-progress', 'in-review'];
export const CLOSED = { done: 'completed', canceled: 'not planned' };
/** The states a session works in: each has a sidebar section of that name. */
export const WORKING = ['triage', 'in-progress', 'in-review'];
const ABOUT = {
  triage: '验证过，要人评估（grill、设计）',
  todo: '可以被调度派成会话',
  'in-progress': '会话在做，spec 提交后开 draft PR',
  'in-review': 'PR 都转 ready，等人看',
};
const COLORS = { triage: '1d76db', todo: '0e8a16', 'in-progress': 'fbca04', 'in-review': 'd93f0b' };
export const KINDS = ['bug', 'feature', 'improvement'];
export const KIND_PREFIX = 'kind:';
const KIND_COLORS = { bug: 'd73a4a', feature: 'a2eeef', improvement: '7057ff' };
export const PRIORITIES = ['P0', 'P1', 'P2'];
export const PRIORITY_PREFIX = 'priority:';
const PRIORITY_COLORS = { P0: 'b60205', P1: 'd93f0b', P2: 'fbca04' };
/** The priority an issue carries (the highest when it wrongly has several), or null. */
export function priorityOf(labels) {
  const own = labels.filter((l) => l.startsWith(PRIORITY_PREFIX)).map((l) => l.slice(PRIORITY_PREFIX.length));
  return PRIORITIES.find((p) => own.includes(p)) ?? null;
}
const priorityRank = (labels) => {
  const p = priorityOf(labels);
  return p === null ? PRIORITIES.length : PRIORITIES.indexOf(p);
};

/** The flips `set` allows. done and canceled are final: reopening is the human's call. */
export const NEXT = {
  backlog: ['triage', 'todo', 'canceled'],
  triage: ['todo', 'backlog', 'canceled'],
  todo: ['in-progress', 'backlog', 'canceled'],
  'in-progress': ['in-review', 'triage', 'backlog', 'canceled'],
  'in-review': ['in-progress', 'done', 'backlog', 'canceled'],
  done: [],
  canceled: [],
};

/** Flips that must say, in a comment on the issue, where the work stopped. */
export const NEEDS_COMMENT = new Set(['backlog']);
/** Prefix of every comment idea-loop writes on an issue. */
export const AI_PREFIX = '🤖 idea-loop：';

/**
 * An issue's state: closed ones by their close reason (not planned = canceled, anything else = done), open
 * ones by the status:* label, backlog when there is none. A label that is not a state (the old Chinese
 * ones), or two status labels, come back as that text, so callers can tell the issue is outside the machine.
 */
export function stateOf(labels, { open = true, reason = null } = {}) {
  if (!open) return reason === 'not_planned' || reason === 'not planned' ? 'canceled' : 'done';
  const own = labels.filter((l) => l.startsWith(PREFIX)).map((l) => l.slice(PREFIX.length));
  if (!own.length) return 'backlog';
  return own.length === 1 ? own[0] : own.join(' + ');
}

/**
 * Why flipping an issue from `from` to `to` is refused, or null. `spec` is the text of the spec that covers
 * the issue, or null when there is none. `prs` are the issue's PRs ({ repo, number, state }), needed only
 * for → done. `skipTriage` is the project's choice not to use triage.
 */
export function transitionError(from, to, { spec = null, prs = null, comment = '', skipDesign = false, skipTriage = false } = {}) {
  if (!STATES.includes(to)) return `「${to}」不是 issue 的状态（${STATES.join(' / ')}）`;
  if (!STATES.includes(from)) return `issue 现在的状态「${from}」不在状态机里（旧状态机留下的先跑 issues.mjs migrate）`;
  if (from === to) return `issue 已经是「${to}」`;
  const choices = NEXT[from].filter((s) => !(skipTriage && s === 'triage'));
  if (to === 'triage' && skipTriage) return `项目文档（ISSUE_TRACKER.md）写了跳过 triage：不翻 triage，backlog 直接翻 todo（能翻成：${choices.join(' / ') || '无'}）`;
  if (!NEXT[from].includes(to)) return `「${from}」不能翻成「${to}」（能翻成：${choices.join(' / ') || '无'}）`;
  if (NEEDS_COMMENT.has(to) && !String(comment).trim()) return '翻「backlog」要带 --comment：写清停在哪个阶段、分支叫什么，下一个会话靠它接上';
  if (from === 'triage' && to === 'todo') {
    if (!spec) return '没有 spec 的 issues: 列着这个 issue——triage 的产出是 spec，写好才翻 todo';
    if (forHuman(spec).length) return `spec 里还有等人定的：${forHuman(spec).join('；')}`;
    if (touchesUi(spec) && !hasFreezeSummary(spec) && !skipDesign) {
      return 'spec 碰 UI，「实现决策」里还没有「冻结摘要」——先设计；没装 design 插件时带 --skip-design，并在汇报里写明跳过了设计';
    }
  }
  if (to === 'done') {
    const live = (prs ?? []).filter((p) => p.state !== 'closed');
    if (!live.length) return '没有 PR 挂在这个 issue 上（PR 正文要有 `Refs <owner>/<repo>#<号>`）——全部 PR 合并才能翻 done';
    const open = live.filter((p) => p.state !== 'merged');
    if (open.length) return `还有 PR 没合并：${open.map((p) => `${p.repo}#${p.number}（${p.state}）`).join('、')}`;
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

/** The labels a project keeps: the status labels, the priorities, the kinds, its categories, and its keep-list. */
export function keptLabels(types) {
  return new Set([...LABELED.map(label), ...PRIORITIES.map((p) => `${PRIORITY_PREFIX}${p}`), ...KINDS.map((k) => `${KIND_PREFIX}${k}`), ...typeLabels(types).map((t) => t.name), ...(types?.keep ?? [])]);
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

// ---------- issue body ----------

/** The sections every issue body must have, filled. */
export const REQUIRED_SECTIONS = ['问题', '证据', '影响范围', '从哪发现'];

/**
 * What is wrong with an issue body: one line per required section (`## 问题` …) that is missing or holds
 * only whitespace. Sections are cut at `## <name>` headings; optional ones and other headings are not
 * looked at. 「无，待验证」 under 证据 counts as filled. Empty when the body is fine.
 */
export function bodyErrors(md) {
  const sections = new Map();
  let current = null;
  for (const line of String(md ?? '').split('\n')) {
    const h = line.match(/^## +(.+?)\s*$/);
    if (h) {
      current = h[1];
      if (!sections.has(current)) sections.set(current, []);
    } else if (current !== null) sections.get(current).push(line);
  }
  return REQUIRED_SECTIONS.flatMap((name) => {
    if (!sections.has(name)) return [`缺「${name}」一节（## ${name}）`];
    return sections.get(name).join('\n').trim() ? [] : [`「${name}」一节是空的`];
  });
}

// ---------- project document (ISSUE_TRACKER.md) ----------

/** The project's issue tracker document: ISSUE_TRACKER.md next to docs/. Empty when there is none. */
export function readTracker(docs) {
  const file = join(dirname(resolve(docs)), 'ISSUE_TRACKER.md');
  return existsSync(file) ? readFileSync(file, 'utf8') : '';
}

/**
 * Where the project's issues live: `linear` when the first level-1 heading of its ISSUE_TRACKER.md names
 * Linear (`# Issue tracker：Linear`), otherwise `github` (a missing file counts).
 */
export function platformOf(md) {
  const title = String(md).match(/^# (.+)$/m)?.[1] ?? '';
  return /linear/i.test(title) ? 'linear' : 'github';
}

/** The refusal for a command that writes GitHub, run in a project whose issues are on Linear. */
export const linearRefusal = (cmd) => `「${cmd}」写的是 GitHub 上的 issue，而这个项目的 issue 在 Linear 上（ISSUE_TRACKER.md 第一个标题写了 Linear）：改用 Linear MCP，做法见 idea-loop:issues 的 references/linear.md`;

/** The commands that only make sense on GitHub. */
export const GITHUB_ONLY = new Set(['labels', 'type', 'set', 'candidates', 'reconcile', 'migrate', 'new', 'priority', 'backlog', 'note']);

/**
 * Whether the project does without the triage state: a line `triage：跳过` (a list item, a bold label or a
 * table row `| triage | 跳过 |` also do). The template's own `triage：用 / 跳过` is not a choice yet.
 */
export function skipsTriage(md) {
  return /^\s*(?:[-*]\s*)?(?:\|\s*)?(?:\*\*)?triage(?:\*\*)?\s*(?:[：:]|\|)\s*(?:\*\*)?跳过/im.test(String(md));
}

/**
 * The repositories the project's issues are worked in: the first cell (or first backticked name) of each row
 * or bullet under「## 仓库」. Null when the section is missing. A name without an owner takes `owner`'s.
 */
export function parseRepos(md, owner = null) {
  const lines = String(md).split('\n');
  const start = lines.findIndex((l) => l.trim() === '## 仓库');
  if (start < 0) return null;
  const out = [];
  for (const line of lines.slice(start + 1)) {
    if (/^#{1,2} /.test(line)) break;
    let name = null;
    if (/^\s*\|/.test(line)) {
      const cell = line.split('|')[1]?.trim().replace(/`/g, '') ?? '';
      if (cell && !/^[-: ]+$/.test(cell) && !/^仓库(名)?$/.test(cell)) name = cell;
    } else {
      name = line.match(/^\s*[-*]\s*`([^`]+)`/)?.[1] ?? null;
    }
    if (!name || !/^[\w.-]+(\/[\w.-]+)?$/.test(name)) continue;
    out.push(name.includes('/') || !owner ? name : `${owner}/${name}`);
  }
  return out;
}

// ---------- PRs ----------

/** Whether a PR body attaches the PR to issue #n of `issueRepo`: `Refs <owner>/<repo>#n`, or a bare `Refs #n` in the issue's own repo. */
export function refsIssue(body, n, issueRepo, prRepo) {
  const re = /\bRefs\s+(?:([\w.-]+\/[\w.-]+))?#(\d+)(?!\d)/gi;
  for (const m of String(body ?? '').matchAll(re)) {
    if (Number(m[2]) !== n) continue;
    if (m[1] ? m[1].toLowerCase() === issueRepo.toLowerCase() : prRepo.toLowerCase() === issueRepo.toLowerCase()) return true;
  }
  return false;
}

/** draft / ready / merged, or closed for a PR closed without merging. */
export const prState = (p) => (p.state === 'MERGED' ? 'merged' : p.state === 'CLOSED' ? 'closed' : p.isDraft ? 'draft' : 'ready');

/** The PRs that attach to issue #n (of `issueRepo`) in each of `repos`, each { repo, number, url, state }. */
export function prsOf(gh, n, issueRepo, repos) {
  const out = [];
  for (const repo of [...new Set([issueRepo, ...repos])]) {
    const rows = JSON.parse(gh(['pr', 'list', '--repo', repo, '--state', 'all', '--search', `${n} in:body`, '--json', 'number,body,state,isDraft,url', '--limit', '100']));
    for (const p of rows) if (refsIssue(p.body, n, issueRepo, repo)) out.push({ repo, number: p.number, url: p.url ?? null, state: prState(p) });
  }
  return out;
}

/** Whether a PR belongs to the Linear issue `key`: its title starts with `[<key>]`, or its body has a line `Linear: <key>`. */
export function refsLinear(title, body, key) {
  const k = String(key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^\\s*\\[${k}\\]`, 'i').test(String(title ?? '')) || new RegExp(`^\\s*Linear:\\s*${k}\\s*$`, 'im').test(String(body ?? ''));
}

/** The PRs of the Linear issue `key` in each of `repos`, each { repo, number, url, state }. */
export function prsOfLinear(gh, key, repos) {
  const out = [];
  for (const repo of [...new Set(repos)]) {
    const seen = new Set();
    for (const where of ['title', 'body']) {
      const rows = JSON.parse(gh(['pr', 'list', '--repo', repo, '--state', 'all', '--search', `${key} in:${where}`, '--json', 'number,title,body,state,isDraft,url', '--limit', '100']));
      for (const p of rows) {
        if (seen.has(p.number) || !refsLinear(p.title, p.body, key)) continue;
        seen.add(p.number);
        out.push({ repo, number: p.number, url: p.url ?? null, state: prState(p) });
      }
    }
  }
  return out;
}

/** The repositories to look for PRs in, for an issue of `issueRepo`. */
export function reposFor(docs, issueRepo) {
  const owner = issueRepo.split('/')[0];
  return parseRepos(readTracker(docs), owner) ?? [];
}

// ---------- plans ----------

/**
 * The flips that need no one's judgement. `issues` are the open issues ({ number, labels }); `prs` maps an
 * issue's number to its PRs ({ state }). An issue in in-progress or in-review whose PRs (closed ones aside)
 * are all merged goes to done; one in in-progress whose PRs are all ready or merged goes to in-review. An
 * issue with a label outside the states, or two status:* labels, is a problem.
 */
export function reconcilePlan(issues, prs = new Map()) {
  const actions = [];
  const problems = [];
  for (const it of issues) {
    const cur = stateOf(it.labels);
    if (!STATES.includes(cur)) {
      problems.push(it.labels.filter((l) => l.startsWith(PREFIX)).length > 1
        ? `#${it.number} 有两个 status:* label（${cur}）：留一个，其余去掉`
        : `#${it.number} 的 label「${cur}」不是 issue 的状态（旧状态机留下的先跑 issues.mjs migrate）`);
      continue;
    }
    if (cur !== 'in-progress' && cur !== 'in-review') continue;
    const live = (prs.get(it.number) ?? []).filter((p) => p.state !== 'closed');
    if (!live.length) continue;
    if (live.every((p) => p.state === 'merged')) actions.push({ n: it.number, from: cur, to: 'done', why: `PR ${live.map((p) => `${p.repo}#${p.number}`).join('、')} 都已合并` });
    else if (cur === 'in-progress' && live.every((p) => p.state !== 'draft')) actions.push({ n: it.number, from: cur, to: 'in-review', why: `PR ${live.map((p) => `${p.repo}#${p.number}`).join('、')} 都已 ready` });
  }
  return { actions, problems };
}

/** The old Chinese status labels and what each becomes (spec「已在用仓库的旧 label」). 实现中 is in-review when it has a ready PR. */
export const OLD_STATES = { 验证中: 'triage', 审核中: 'triage', 待设计: 'triage', 设计中: 'triage', 待实现: 'todo', 实现中: 'in-progress', 搁置: 'backlog' };

/**
 * How the old labels would change. `issues` are the open issues ({ number, labels, subTotal }); `prs` maps an
 * issue's number to its PRs; `children` maps a parent's number to its sub-issues ({ number, id }). Returns
 * `relabels` ({ n, from, to, remove, add, comment }), `unlinks` ({ parent, child }) for the sub-issue links
 * the grouping left behind, and `problems` (an issue mixing old and new labels, or an unknown status label).
 */
export function migratePlan(issues, prs = new Map(), children = new Map()) {
  const relabels = [];
  const problems = [];
  for (const it of issues) {
    const own = it.labels.filter((l) => l.startsWith(PREFIX)).map((l) => l.slice(PREFIX.length));
    const old = own.filter((s) => s in OLD_STATES);
    const unknown = own.filter((s) => !(s in OLD_STATES) && !LABELED.includes(s));
    if (unknown.length) problems.push(`#${it.number} 的 label「${unknown.join('、')}」既不是旧状态也不是新状态，不动`);
    if (!old.length) continue;
    if (own.length > 1) {
      problems.push(`#${it.number} 有多个 status:* label（${own.join('、')}），先留一个再迁移`);
      continue;
    }
    const from = old[0];
    let to = OLD_STATES[from];
    if (from === '实现中') {
      const live = (prs.get(it.number) ?? []).filter((p) => p.state !== 'closed');
      if (live.length && live.some((p) => p.state === 'ready') && live.every((p) => p.state !== 'draft')) to = 'in-review';
    }
    relabels.push({
      n: it.number,
      from,
      to,
      remove: [label(from)],
      add: to === 'backlog' ? [] : [label(to)],
      comment: from === '搁置' ? '从搁置迁回 backlog（issue 状态模型换了：先放着 = backlog，停在哪看这条之前的评论）。' : '',
    });
  }
  const unlinks = [...children].flatMap(([parent, kids]) => kids.map((k) => ({ parent, child: k.number, childId: k.id })));
  return { relabels, unlinks, problems };
}

/** `status:` lines left in the frontmatter of a spec: removed by migrate. */
export function withoutStatus(md) {
  const m = String(md).match(/^(---\n)([\s\S]*?)(\n---)([\s\S]*)$/);
  if (!m || !/^status:/m.test(m[2])) return md;
  return m[1] + m[2].split('\n').filter((l) => !/^status:/.test(l)).join('\n') + m[3] + m[4];
}

// ---------- gh boundary ----------

export const defaultGh = (cwd) => (args) => execFileSync('gh', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const defaultGit = (cwd) => (args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

function issue(gh, n) {
  const v = JSON.parse(gh(['api', `repos/{owner}/{repo}/issues/${n}`]));
  return row(v);
}

const row = (i) => {
  const open = i.state === 'open' || i.state === 'OPEN';
  const labels = (i.labels ?? []).map((l) => (typeof l === 'string' ? l : l.name));
  return {
    number: i.number,
    id: i.id,
    title: i.title,
    body: i.body ?? '',
    open,
    reason: i.state_reason ?? null,
    labels,
    state: stateOf(labels, { open, reason: i.state_reason ?? null }),
    repo: String(i.repository_url ?? '').match(/repos\/([^/]+\/[^/]+)$/)?.[1] ?? null,
    createdAt: i.created_at ?? null,
    updatedAt: i.updated_at ?? null,
    subTotal: i.sub_issues_summary?.total ?? 0,
    blockedBy: i.issue_dependencies_summary?.blocked_by ?? 0,
  };
};

const PAGE = 100;

/** Every open issue (pull requests left out) from the repo-wide REST list, page by page; of `repo` (owner/name) when given. */
function openIssues(gh, repo = null) {
  const out = [];
  for (let page = 1; ; page += 1) {
    const rows = JSON.parse(gh(['api', `repos/${repo ?? '{owner}/{repo}'}/issues?state=open&per_page=${PAGE}&page=${page}`]));
    for (const i of rows) if (!i.pull_request) out.push(row(i));
    if (rows.length < PAGE) return out;
  }
}

const subIssues = (gh, n) => JSON.parse(gh(['api', `repos/{owner}/{repo}/issues/${n}/sub_issues?per_page=100`])).map(row);

/** Leaves the issue carrying exactly the label of `state` (none for backlog, done and canceled). */
function relabel(gh, n, labels, state) {
  const want = LABELED.includes(state) ? [label(state)] : [];
  const add = want.filter((l) => !labels.includes(l));
  const remove = labels.filter((l) => l.startsWith(PREFIX) && !want.includes(l));
  if (!add.length && !remove.length) return;
  gh(['issue', 'edit', String(n), ...add.flatMap((l) => ['--add-label', l]), ...remove.flatMap((l) => ['--remove-label', l])]);
}

/**
 * Moves #n to `state`. done / canceled close first (the comment goes with the close) and drop the label only
 * once the close went through: a gh call that fails (a dropped connection) then leaves the issue as it was,
 * not open with no label, which reads as backlog. The open states relabel, then comment.
 */
function move(gh, it, state, comment = '') {
  const body = comment ? `${AI_PREFIX}${comment}` : '';
  if (CLOSED[state]) {
    gh(['issue', 'close', String(it.number), '--reason', CLOSED[state], ...(body ? ['--comment', body] : [])]);
    relabel(gh, it.number, it.labels, state);
    return;
  }
  relabel(gh, it.number, it.labels, state);
  if (body) gh(['issue', 'comment', String(it.number), '--body', body]);
}

/** The spec under <docs> whose `issues:` lists #n (a number, or a Linear key); null when none does. */
export function specFor(docs, n) {
  const specs = scan(docs).specs.map((s) => ({ slug: s.slug, md: readFileSync(s.file, 'utf8') }));
  return specs.find((s) => issuesOf(s.md).some((x) => String(x) === String(n))) ?? null;
}

/**
 * Creates the missing status:*, priority:*, kind:* and type:* labels, and returns the labels outside the kept set with
 * how many open issues carry each; with `prune` they are deleted. Without categories nothing is pruned: the
 * keep-list lives in the same section, so every project label would look surplus.
 */
export function ensureLabels(gh, types = null, { prune = false } = {}) {
  const have = new Set(JSON.parse(gh(['label', 'list', '--limit', '500', '--json', 'name'])).map((l) => l.name));
  const want = [
    ...LABELED.map((s) => ({ name: label(s), color: COLORS[s], about: `idea-loop：${ABOUT[s]}` })),
    ...PRIORITIES.map((p) => ({ name: `${PRIORITY_PREFIX}${p}`, color: PRIORITY_COLORS[p], about: `idea-loop：优先级 ${p}` })),
    ...KINDS.map((k) => ({ name: `${KIND_PREFIX}${k}`, color: KIND_COLORS[k], about: `idea-loop：类型 ${k}` })),
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
  const it = { labels: JSON.parse(gh(['issue', 'view', String(n), '--json', 'labels'])).labels.map((l) => l.name) };
  const add = want.filter((l) => !it.labels.includes(l));
  const remove = it.labels.filter((l) => l.startsWith(TYPE_PREFIX) && !want.includes(l));
  if (add.length || remove.length) gh(['issue', 'edit', String(n), ...add.flatMap((l) => ['--add-label', l]), ...remove.flatMap((l) => ['--remove-label', l])]);
  return want;
}

/** The todo issues a dispatch round may hand out: none an open issue still blocks; P0 → P1 → P2 → none, the lower number first within a priority. */
export function candidates(gh, limit = 100, { types = null, queue = null } = {}) {
  if (queue !== null && !queues(types).some((q) => q.name === queue)) throw new Error(`「${queue}」不是独立队列（${queues(types).slice(1).map((q) => q.name).join(' / ') || '这个项目没有独立队列'}）`);
  return openIssues(gh)
    .filter((i) => i.state === 'todo' && !(i.blockedBy > 0))
    .filter((i) => queueOf(types, i.labels).name === queue)
    .sort((a, b) => priorityRank(a.labels) - priorityRank(b.labels) || a.number - b.number)
    .slice(0, limit)
    .map(({ number, title, labels }) => ({ number, title, priority: priorityOf(labels) }));
}

const MINUTE = 60 * 1000;

/** The newest comment of #n, or null. */
function lastComment(gh, n) {
  let last = null;
  for (let page = 1; ; page += 1) {
    const rows = JSON.parse(gh(['api', `repos/{owner}/{repo}/issues/${n}/comments?per_page=${PAGE}&page=${page}`]));
    if (rows.length) last = rows.at(-1);
    if (rows.length < PAGE) return last;
  }
}

/** Triage's comment that asks the human for more. */
const asksForMore = (c) => String(c?.body ?? '').startsWith(AI_PREFIX) && String(c.body).includes('还要你补');

/**
 * The open issues with no status:* label (backlog), oldest first, at most `limit`. One whose newest comment
 * is triage's 「还要你补」 and that has not been updated since (up to a minute after the comment, which the
 * comment itself causes) is left out and does not use up the limit: nobody has answered, asking again is
 * noise. Comments are read only for the issues that would otherwise be listed.
 */
export function backlog(gh, limit = 100) {
  const out = [];
  const waiting = openIssues(gh).filter((i) => i.state === 'backlog').sort((a, b) => a.number - b.number);
  for (const it of waiting) {
    if (out.length >= limit) break;
    const last = lastComment(gh, it.number);
    if (asksForMore(last) && Date.parse(it.updatedAt) - Date.parse(last.created_at) <= MINUTE) continue;
    out.push({ number: it.number, title: it.title, labels: it.labels, createdAt: it.createdAt });
  }
  return out;
}

/**
 * Opens an issue after checking it: the body has its four sections (`bodyErrors`), the categories exist,
 * `todo` comes with a priority, and no open issue has the same title. Labels: `status:todo` for todo (backlog
 * has none), `priority:*`, `kind:*`, `type:*`. Returns the new number. Nothing is created unless every check passed.
 */
export function newIssue(gh, types, { title, body, state = 'backlog', priority = null, kind = null, typeValues = [], repo = null }) {
  if (!String(title ?? '').trim()) throw new Error('没给标题');
  if (!['backlog', 'todo'].includes(state)) throw new Error(`--state 只能是 backlog 或 todo（给的是「${state}」）`);
  if (priority !== null && !PRIORITIES.includes(priority)) throw new Error(`--priority 只能是 ${PRIORITIES.join(' / ')}（给的是「${priority}」）`);
  if (kind !== null && !KINDS.includes(kind)) throw new Error(`--kind 只能是 ${KINDS.join(' / ')}（给的是「${kind}」）`);
  if (state === 'todo' && !priority) throw new Error('开成 todo 要带 --priority（P0 / P1 / P2）');
  const errors = bodyErrors(body);
  if (errors.length) throw new Error(`正文不合格，没开：${errors.join('；')}`);
  const typeLabelsOf = typeSet(types, typeValues);
  if (repo !== null && !/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error(`--repo 要写成 owner/name（给的是「${repo}」）`);
  const same = openIssues(gh, repo).find((i) => i.title.trim() === String(title).trim());
  if (same) throw new Error(`已经有同标题的 open issue #${same.number}，没开`);
  const labels = [...(state === 'todo' ? [label('todo')] : []), ...(priority ? [`${PRIORITY_PREFIX}${priority}`] : []), ...(kind ? [`${KIND_PREFIX}${kind}`] : []), ...typeLabelsOf];
  const out = String(gh(['issue', 'create', ...(repo ? ['-R', repo] : []), '--title', String(title).trim(), '--body', body, ...labels.flatMap((l) => ['--label', l])])).trim();
  const n = Number(out.match(/\/issues\/(\d+)$/)?.[1]);
  if (!n) throw new Error(`gh issue create 没返回 issue 地址：${out}`);
  return n;
}

/** Leaves #n carrying `priority:<p>` (none: no priority label); returns the labels it ends with. */
export function setPriority(gh, n, p) {
  if (p !== 'none' && !PRIORITIES.includes(p)) throw new Error(`优先级只能是 ${PRIORITIES.join(' / ')} / none（给的是「${p}」）`);
  const have = JSON.parse(gh(['issue', 'view', String(n), '--json', 'labels'])).labels.map((l) => l.name);
  const want = p === 'none' ? [] : [`${PRIORITY_PREFIX}${p}`];
  const add = want.filter((l) => !have.includes(l));
  const remove = have.filter((l) => l.startsWith(PRIORITY_PREFIX) && !want.includes(l));
  if (add.length || remove.length) gh(['issue', 'edit', String(n), ...add.flatMap((l) => ['--add-label', l]), ...remove.flatMap((l) => ['--remove-label', l])]);
  return want;
}

/** Comments on #n with the AI prefix (not doubled when the text already starts with it). */
export function noteIssue(gh, n, text) {
  const t = String(text ?? '').trim();
  if (!t) throw new Error('评论是空的');
  gh(['issue', 'comment', String(n), '--body', t.startsWith(AI_PREFIX) ? t : `${AI_PREFIX}${t}`]);
}

/** The branches of #n: `issue/<n>-<slug>`, local or remote, in the repo <docs> is in. */
function branchesOf(git, n) {
  try {
    const names = String(git(['branch', '-a', '--format=%(refname:short)'])).split('\n').map((s) => s.trim()).filter(Boolean);
    return [...new Set(names.map((b) => b.replace(/^origin\//, '')).filter((b) => b.startsWith(`issue/${n}-`)))];
  } catch {
    return [];
  }
}

/** The repo `gh` runs in (owner/name), or null when it cannot tell. */
function currentRepo(gh) {
  try {
    return JSON.parse(gh(['repo', 'view', '--json', 'nameWithOwner'])).nameWithOwner ?? null;
  } catch {
    return null;
  }
}

/** The PRs of issue `n` (a number, or a Linear key): by `Refs` for a GitHub number, by title / `Linear:` line for a key, in the 「仓库」 repos. */
function prsFor(gh, docs, n, issueRepo) {
  if (typeof n === 'string') return prsOfLinear(gh, n, parseRepos(readTracker(docs)) ?? []);
  const repo = issueRepo ?? currentRepo(gh);
  if (!repo) throw new Error(`查不到 #${n} 所在的仓库（gh repo view 失败），没法核它的 PR`);
  return prsOf(gh, n, repo, reposFor(docs, repo));
}

/**
 * #n with what a session needs to know where it is: state, categories, PRs, the spec that covers it, its branch.
 * In a Linear project the issue is not read (`state: null`, no title or categories): `n` is its key.
 */
export function show(gh, docs, n, { git = defaultGit(docs) } = {}) {
  if (platformOf(readTracker(docs)) === 'linear' || typeof n === 'string') {
    return {
      number: n,
      title: null,
      state: null,
      open: null,
      categories: [],
      kind: null,
      prs: prsFor(gh, docs, n, null).map(({ repo, number, url, state }) => ({ repo, number, url, state })),
      spec: specFor(docs, n)?.slug ?? null,
      branch: branchesOf(git, n)[0] ?? null,
    };
  }
  const it = issue(gh, n);
  const spec = specFor(docs, n);
  const prs = it.repo ? prsOf(gh, n, it.repo, reposFor(docs, it.repo)) : [];
  return {
    number: it.number,
    title: it.title,
    state: it.state,
    open: it.open,
    categories: it.labels.filter((l) => l.startsWith(TYPE_PREFIX)),
    kind: it.labels.find((l) => l.startsWith(KIND_PREFIX))?.slice(KIND_PREFIX.length) ?? null,
    prs: prs.map(({ repo, number, url, state }) => ({ repo, number, url, state })),
    spec: spec?.slug ?? null,
    branch: branchesOf(git, n)[0] ?? null,
  };
}

/**
 * Everything that can refuse the flip of #n to `state`, nothing written. Returns { it, cur, prs } or throws.
 * With `from` the issue is not read: `from` is the state the caller says it is in (`it` is null), and `n` may
 * be a Linear key; the PRs are then looked for in the 「仓库」 repositories.
 */
function checkFlip(gh, docs, state, n, { comment = '', skipDesign = false, from = undefined } = {}) {
  let it = null;
  let cur = from;
  if (from === undefined) {
    it = issue(gh, n);
    cur = it.state;
    if (!it.open) throw new Error(`#${n} 已关闭（${cur}），done / canceled 之后不再翻；重开是人的事`);
  }
  const tracker = readTracker(docs);
  const prs = state === 'done' && (from !== undefined || it.repo) ? prsFor(gh, docs, n, it?.repo ?? null) : null;
  const why = transitionError(cur, state, { spec: specFor(docs, n)?.md ?? null, prs, comment, skipDesign, skipTriage: skipsTriage(tracker) });
  if (why) throw new Error(`${typeof n === 'string' ? n : `#${n}`}：${why}`);
  return { it, cur, prs };
}

/** Whether #n may flip to `state`: the reason when it may not, nothing written either way. */
export function checkState(gh, docs, state, n, opts = {}) {
  try {
    const { cur } = checkFlip(gh, docs, state, n, opts);
    return { ok: true, line: `${typeof n === 'string' ? n : `#${n}`}: ${cur} → ${state} 可以翻` };
  } catch (error) {
    return { ok: false, reason: error.message };
  }
}

/**
 * Checked flips: every one is checked before any is made, so one refusal leaves them all where they were.
 * A flip to done opens its comment with the PRs that were merged (「合并的 PR：o/r#10、o/api#20。」); a
 * `comment` the caller gave follows.
 */
export function setState(gh, docs, state, numbers, opts = {}) {
  const flips = numbers.map((n) => checkFlip(gh, docs, state, n, opts));
  return flips.map(({ it, cur, prs }) => {
    const merged = state === 'done' ? (prs ?? []).filter((p) => p.state === 'merged').map((p) => `${p.repo}#${p.number}`) : [];
    move(gh, it, state, `${merged.length ? `合并的 PR：${merged.join('、')}。` : ''}${opts.comment ?? ''}`);
    return `#${it.number}: ${cur} → ${state}${CLOSED[state] ? `（关闭，${CLOSED[state]}）` : ''}`;
  });
}

export function reconcile(gh, docs = null) {
  const open = openIssues(gh);
  const prs = new Map();
  for (const it of open) {
    if ((it.state === 'in-progress' || it.state === 'in-review') && it.repo) prs.set(it.number, prsOf(gh, it.number, it.repo, docs ? reposFor(docs, it.repo) : []));
  }
  const { actions, problems } = reconcilePlan(open, prs);
  const byNumber = new Map(open.map((i) => [i.number, i]));
  const done = actions.map((a) => {
    move(gh, byNumber.get(a.n), a.to, `${a.why}，翻成 ${a.to}。`);
    return `#${a.n}: ${a.from} → ${a.to}（${a.why}）`;
  });
  return { done, problems };
}

const CONSOLIDATION_MARK = '由整合定时任务开出';

/** True for a root the old consolidation task opened: it has sub-issues and line 1 of its body names that task. Roots a human split are not. */
export const isConsolidationRoot = (it) => it.subTotal > 0 && String(it.body ?? '').split('\n')[0].trim().startsWith(CONSOLIDATION_MARK);

/**
 * Plans, and with `apply` makes, the move off the old model: the old Chinese status labels become the new
 * ones (搁置 also gets a comment), `status:` lines leave the specs' frontmatter, and the sub-issue links under
 * the roots the consolidation task opened are removed; those roots, which existed only to group, are closed
 * as not planned with a comment (one already carrying a status:* label is being worked on: unlinked, not closed).
 * Parent-child links a human made are left alone. Without `apply` nothing is written.
 */
export function migrate(gh, docs, { apply = false } = {}) {
  const open = openIssues(gh);
  const prs = new Map();
  for (const it of open) {
    if (it.labels.includes(label('实现中')) && it.repo) prs.set(it.number, prsOf(gh, it.number, it.repo, reposFor(docs, it.repo)));
  }
  const roots = open.filter(isConsolidationRoot);
  const children = new Map(roots.map((i) => [i.number, subIssues(gh, i.number)]));
  const closing = roots.filter((r) => !r.labels.some((l) => l.startsWith(PREFIX)));
  const plan = migratePlan(open, prs, children);
  const specs = scan(docs).specs.filter((s) => frontmatter(readFileSync(s.file, 'utf8')).status !== undefined);
  const lines = [
    ...plan.relabels.map((r) => `#${r.n}: ${label(r.from)} → ${r.add[0] ?? '回 backlog（去掉 status:*）'}${r.comment ? '，补评论' : ''}`),
    ...specs.map((s) => `spec ${s.slug}: 删掉 frontmatter 的 status 行`),
    ...plan.unlinks.map((u) => `#${u.child}: 解除 #${u.parent} 的子 issue 关系`),
    ...roots.map((r) => (closing.includes(r) ? `#${r.number}: 整合开出的根，解除后关成 not planned（补评论）` : `#${r.number}: 整合开出的根，但已有 status:* label（有人在做），解除关系后不关`)),
    ...plan.problems.map((p) => `问题：${p}`),
  ];
  if (!apply) return { applied: false, lines };
  for (const r of plan.relabels) {
    gh(['issue', 'edit', String(r.n), ...r.add.flatMap((l) => ['--add-label', l]), ...r.remove.flatMap((l) => ['--remove-label', l])]);
    if (r.comment) gh(['issue', 'comment', String(r.n), '--body', `${AI_PREFIX}${r.comment}`]);
  }
  for (const s of specs) writeFileSync(s.file, withoutStatus(readFileSync(s.file, 'utf8')));
  for (const u of plan.unlinks) gh(['api', '-X', 'DELETE', `repos/{owner}/{repo}/issues/${u.parent}/sub_issue`, '-F', `sub_issue_id=${u.childId}`]);
  for (const r of closing) move(gh, r, 'canceled', '整合定时任务开出的归组 issue；issue 模型换了，不再用父子关系归组，子 issue 已解除关系，关成 not planned。');
  return { applied: true, lines };
}


// ---------- cli ----------

const num = (v, what) => {
  if (!/^\d+$/.test(String(v ?? ''))) throw new Error(`${what}「${v ?? ''}」不是数字`);
  return Number(v);
};

/** An issue reference: a GitHub number, or a Linear key such as `FA-577`. */
const ref = (v, what) => {
  if (/^\d+$/.test(String(v ?? ''))) return Number(v);
  if (/^[A-Za-z][A-Za-z0-9]*-\d+$/.test(String(v ?? ''))) return String(v);
  throw new Error(`${what}「${v ?? ''}」不是 GitHub 的号（12）也不是 Linear 的号（FA-577）`);
};

export const COMMANDS = ['labels', 'type', 'show', 'check', 'set', 'new', 'body', 'priority', 'backlog', 'note', 'candidates', 'reconcile', 'queues', 'migrate'];

/** argv split into `--flag[=value]`s (`--type` may repeat) and the plain words. */
function parseArgs(argv) {
  const flags = {};
  const types = [];
  const words = [];
  for (const x of argv) {
    if (!x.startsWith('--')) {
      words.push(x);
      continue;
    }
    const [k, ...v] = x.slice(2).split('=');
    const value = v.length ? v.join('=') : true;
    if (k === 'type') {
      if (value === true) throw new Error('--type 要带分类：--type=seo/blog');
      types.push(value);
    } else flags[k] = value;
  }
  return { flags, types, words };
}

/** A flag that takes text: the text, null when absent. */
const text = (flags, k) => {
  if (flags[k] === undefined) return null;
  if (flags[k] === true) throw new Error(`--${k} 要带值：--${k}=<…>`);
  return flags[k];
};

const bodyFile = (file) => {
  if (!file || !existsSync(file)) throw new Error(`没有正文文件「${file ?? ''}」`);
  return readFileSync(file, 'utf8');
};

/**
 * Runs one command line (without `node issues.mjs`). `gh` and `git` are injected in tests; output goes
 * through `log`. Throws the reason when it refuses.
 */
export function run(argv, { gh = null, git = null, log = console.log } = {}) {
  const { flags, types: typeFlags, words } = parseArgs(argv);
  const [cmd, docs, a, b, ...rest] = words;
  if (!docs || !existsSync(docs)) throw new Error(`usage: issues.mjs <${COMMANDS.join('|')}> <docs> …（${docs ?? '没给 docs'} 不存在）`);
  if (!COMMANDS.includes(cmd)) throw new Error(`不认识的命令「${cmd}」（${COMMANDS.join(' / ')}）`);
  const linear = platformOf(readTracker(docs)) === 'linear';
  // `new --repo=…` names a GitHub repository itself (retro opens plugin issues that way), so a Linear project may use it
  if (linear && ((GITHUB_ONLY.has(cmd) && !(cmd === 'new' && flags.repo)) || (cmd === 'queues' && a))) throw new Error(linearRefusal(cmd));
  gh ??= defaultGh(docs);
  const print = (lines) => lines.forEach((l) => log(l));
  const json = (v) => log(JSON.stringify(v, null, 2));
  const opts = { comment: typeof flags.comment === 'string' ? flags.comment : '', skipDesign: !!flags['skip-design'] };
  if (cmd === 'labels') {
    const { made, surplus, deleted } = ensureLabels(gh, readTypes(docs), { prune: !!flags.prune });
    print(made.map((l) => `created ${l}`));
    if (flags.prune) return print(deleted.map((l) => `deleted ${l}`));
    if (surplus.length) print([`不在状态、优先级、类型、分类和保留清单里的 label（--prune 删掉它们，issue 上的也一起去掉）：`, ...surplus.map((s) => `  ${s.name}（${s.openIssues} 个 open issue 在用）`)]);
    return;
  }
  if (cmd === 'candidates') return json(candidates(gh, a ? num(a, 'limit') : undefined, { types: readTypes(docs), queue: typeof flags.queue === 'string' ? flags.queue : null }));
  if (cmd === 'backlog') return json(backlog(gh, a ? num(a, 'limit') : undefined));
  if (cmd === 'queues') {
    const types = readTypes(docs);
    return json(a ? queueOf(types, issue(gh, num(a, 'issue')).labels) : queues(types));
  }
  if (cmd === 'reconcile') {
    const { done, problems } = reconcile(gh, docs);
    print(done);
    return print(problems.map((p) => `问题：${p}`));
  }
  if (cmd === 'migrate') return print(migrate(gh, docs, { apply: !!flags.apply }).lines);
  if (!a) throw new Error(`usage: issues.mjs ${cmd} <docs> …`);
  if (cmd === 'body') {
    const errors = bodyErrors(bodyFile(a));
    if (errors.length) throw new Error(`正文不合格：${errors.join('；')}`);
    return log('正文齐了');
  }
  if (cmd === 'new') {
    if (b === undefined) throw new Error('usage: issues.mjs new <docs> <标题> <正文文件> [--state=backlog|todo] [--priority=P0|P1|P2] [--kind=bug|feature|improvement] [--type=<分类>]... [--repo=<owner/repo>]');
    const n = newIssue(gh, readTypes(docs), { title: a, body: bodyFile(b), state: text(flags, 'state') ?? 'backlog', priority: text(flags, 'priority'), kind: text(flags, 'kind'), typeValues: typeFlags, repo: text(flags, 'repo') });
    return log(String(n));
  }
  if (cmd === 'priority') {
    if (b === undefined) throw new Error('usage: issues.mjs priority <docs> <P0|P1|P2|none> <issue 号>...');
    return print([b, ...rest].map((x) => {
      const n = num(x, 'issue');
      const labels = setPriority(gh, n, a);
      return `#${n}: ${labels.length ? labels.join(' ') : '没有优先级'}`;
    }));
  }
  if (cmd === 'note') {
    if (b === undefined) throw new Error('usage: issues.mjs note <docs> <issue 号> <正文文件>');
    noteIssue(gh, num(a, 'issue'), bodyFile(b));
    return log(`#${num(a, 'issue')}: 已评论`);
  }
  if (cmd === 'show') return json(show(gh, docs, linear ? ref(a, 'issue') : num(a, 'issue'), git ? { git } : {}));
  if (cmd === 'type') {
    if (b === undefined) throw new Error('usage: issues.mjs type <docs> <issue 号> <父类[/子类]>...');
    return log(`#${num(a, 'issue')}: ${setTypes(gh, readTypes(docs), num(a, 'issue'), [b, ...rest]).join(' ')}`);
  }
  if (cmd === 'check') {
    if (b === undefined) throw new Error('usage: issues.mjs check <docs> <状态> <issue 号> [--from=<现在的状态>] [--comment=<文字>] [--skip-design]');
    const from = text(flags, 'from');
    if (linear && from === null) throw new Error('这个项目的 issue 在 Linear 上，check 读不到它的状态：带 --from=<它现在的状态>（从 Linear 读），做法见 idea-loop:issues 的 references/linear.md');
    const r = checkState(gh, docs, a, from === null ? num(b, 'issue') : ref(b, 'issue'), { ...opts, ...(from === null ? {} : { from }) });
    if (!r.ok) throw new Error(r.reason);
    return log(r.line);
  }
  if (cmd === 'set') {
    if (b === undefined) throw new Error('usage: issues.mjs set <docs> <状态> <issue 号>... [--comment=<文字>] [--skip-design]');
    return print(setState(gh, docs, a, [b, ...rest].map((x) => num(x, 'issue')), opts));
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    run(process.argv.slice(2));
  } catch (error) {
    console.error(error.stderr ? String(error.stderr).trim() || error.message : error.message);
    process.exitCode = 1;
  }
}
