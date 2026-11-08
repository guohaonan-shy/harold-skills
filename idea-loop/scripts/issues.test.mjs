import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  COMMANDS, KINDS, NEXT, STATES, backlog, bodyErrors, candidates, checkState, ensureLabels, issuesOf, keptLabels, linearRefusal, migrate, migratePlan, newIssue, noteIssue, parseRepos, parseTypes, platformOf,
  prState, priorityOf, queueOf, queues, readTypes, reconcile, reconcilePlan, refsIssue, refsLinear, run, setPriority, setState, setTypes, show, skipsTriage, stateOf, transitionError, typeSet, withoutStatus,
} from './issues.mjs';

const SCRIPT = fileURLToPath(new URL('./issues.mjs', import.meta.url));
const UI = '- 点重试 → 只重跑这一题';

const spec = ({ issues, ui, freeze = false, grill = false, fork = false, status } = {}) => `---
type: spec${status ? `\nstatus: ${status}` : ''}
summary: 重试不消耗配额
related: []${issues ? `\nissues: ${issues}` : ''}
---

# 重试不消耗配额
${grill ? '\n> 需要 grill：要不要单独计配额。\n' : ''}
## 方案

重试不再扣配额。
${ui ? `\n### 前端交互\n${ui}\n` : ''}
## 实现决策
${freeze ? '\n### 冻结摘要\n- 画布\n' : '\n无分歧。\n'}${fork ? '\n### 待定：要不要单独计配额\n- A\n' : ''}
`;

/** A project root with docs/ (and the given specs), plus an ISSUE_TRACKER.md when `tracker` is given. Returns docs/. */
function docsWith(specs = {}, tracker = null) {
  const root = mkdtempSync(join(tmpdir(), 'issues-'));
  const docs = join(root, 'docs');
  mkdirSync(docs);
  for (const [slug, md] of Object.entries(specs)) {
    mkdirSync(join(docs, 'spec', slug), { recursive: true });
    writeFileSync(join(docs, 'spec', slug, `${slug}.md`), md);
  }
  if (tracker !== null) writeFileSync(join(root, 'ISSUE_TRACKER.md'), tracker);
  return docs;
}

const TRACKER_TWO_REPOS = `# Issue tracker：GitHub

## 仓库

| 仓库 | 本地路径 | 主分支 | 管什么 |
|---|---|---|---|
| o/r | ~/code/r | main | 知识库、worker |
| o/api | ~/code/api | main | 接口 |
`;

/**
 * A fake gh over an in-memory set of issues and PRs, answering the reads the script makes and recording every
 * write. An issue: { number, title, state: 'OPEN' | 'CLOSED', labels, reason?, subOf?, blockedBy?: [n], pull? }.
 * `prs` maps a repo to its PRs: { number, body, state: 'OPEN' | 'MERGED' | 'CLOSED', isDraft }.
 * With `strictLabels`, an edit behaves as GitHub did on a repo missing the label: the removals go through,
 * then adding a label the repo does not have throws; `label create` adds to the repo's labels.
 */
function fakeGh(issues, labels = [], prs = {}, { strictLabels = false, login = 'me' } = {}) {
  const calls = [];
  const rest = (i) => ({
    number: i.number,
    id: 1000 + i.number,
    title: i.title,
    body: i.body ?? '',
    state: i.state === 'OPEN' ? 'open' : 'closed',
    state_reason: i.state === 'OPEN' ? null : i.reason ?? 'completed',
    labels: i.labels.map((name) => ({ name })),
    assignees: (i.assignees ?? []).map((l) => ({ login: l })),
    created_at: i.createdAt ?? '2026-01-01T00:00:00Z',
    updated_at: i.updatedAt ?? i.createdAt ?? '2026-01-01T00:00:00Z',
    repository_url: 'https://api.github.com/repos/o/r',
    sub_issues_summary: { total: Object.values(issues).filter((c) => c.subOf === i.number).length },
    issue_dependencies_summary: { blocked_by: (i.blockedBy ?? []).filter((b) => issues[b]?.state === 'OPEN').length, total_blocked_by: (i.blockedBy ?? []).length },
    ...(i.pull ? { pull_request: {} } : {}),
  });
  const gh = (args) => {
    const [noun, verb, n] = args;
    if (noun === 'label' && verb === 'list') return JSON.stringify(labels.map((name) => ({ name })));
    if (noun === 'issue' && verb === 'view') return JSON.stringify({ labels: issues[n].labels.map((name) => ({ name })) });
    if (noun === 'pr' && verb === 'list') return JSON.stringify(prs[args[args.indexOf('--repo') + 1]] ?? []);
    if (noun === 'repo' && verb === 'view') return JSON.stringify({ nameWithOwner: 'o/r' });
    if (noun === 'api' && verb !== '-X') {
      const url = new URL(`http://gh/${verb}`);
      const path = url.pathname.replace('/repos/%7Bowner%7D/%7Brepo%7D/', '').replace('/repos/{owner}/{repo}/', '');
      if (path === 'issues') {
        assert.equal(url.searchParams.get('state'), 'open');
        const perPage = Number(url.searchParams.get('per_page'));
        const page = Number(url.searchParams.get('page') ?? 1);
        const list = Object.values(issues).filter((i) => i.state === 'OPEN');
        return JSON.stringify(list.slice((page - 1) * perPage, page * perPage).map(rest));
      }
      if (path === '/user') return JSON.stringify({ login });
      let m = path.match(/^issues\/(\d+)\/events$/);
      if (m) {
        const perPage = Number(url.searchParams.get('per_page'));
        const page = Number(url.searchParams.get('page') ?? 1);
        return JSON.stringify((issues[m[1]].events ?? []).slice((page - 1) * perPage, page * perPage));
      }
      m = path.match(/^issues\/(\d+)\/comments$/);
      if (m) {
        const perPage = Number(url.searchParams.get('per_page'));
        const page = Number(url.searchParams.get('page') ?? 1);
        return JSON.stringify((issues[m[1]].comments ?? []).slice((page - 1) * perPage, page * perPage));
      }
      m = path.match(/^issues\/(\d+)$/);
      if (m) {
        if (!issues[m[1]]) throw Object.assign(new Error('not found'), { stderr: `no issue ${m[1]}` });
        return JSON.stringify(rest(issues[m[1]]));
      }
      m = path.match(/^issues\/(\d+)\/sub_issues$/);
      if (m) return JSON.stringify(Object.values(issues).filter((c) => c.subOf === Number(m[1])).map(rest));
      throw new Error(`fake gh: no route for ${path}`);
    }
    calls.push(args);
    if (noun === 'api') {
      const m = args[3].match(/issues\/(\d+)\/sub_issue$/);
      if (m && args[2] === 'DELETE') {
        const child = Object.values(issues).find((i) => 1000 + i.number === Number(args[5].split('=')[1]));
        delete child.subOf;
      }
      return '{}';
    }
    if (noun === 'label' && verb === 'create') labels.push(n);
    if (noun === 'issue' && verb === 'edit') {
      for (let k = 3; k < args.length; k += 2) {
        if (args[k] === '--remove-label') issues[n].labels = issues[n].labels.filter((l) => l !== args[k + 1]);
      }
      for (let k = 3; k < args.length; k += 2) {
        if (args[k] !== '--add-label') continue;
        if (strictLabels && !labels.includes(args[k + 1])) throw Object.assign(new Error('failed'), { stderr: `'${args[k + 1]}' not found` });
        issues[n].labels.push(args[k + 1]);
      }
    }
    if (noun === 'issue' && verb === 'close') {
      issues[n].state = 'CLOSED';
      issues[n].reason = args[args.indexOf('--reason') + 1] === 'not planned' ? 'not_planned' : 'completed';
    }
    if (noun === 'issue' && verb === 'create') {
      const number = Math.max(0, ...Object.keys(issues).map(Number)) + 1;
      const all = (flag) => args.flatMap((a, k) => (a === flag ? [args[k + 1]] : []));
      issues[number] = { number, title: all('--title')[0], body: all('--body')[0], state: 'OPEN', labels: all('--label') };
      return `https://github.com/o/r/issues/${number}\n`;
    }
    if (noun === 'issue' && verb === 'comment') return `https://github.com/o/r/issues/${n}#issuecomment-${calls.length}\n`;
    return '';
  };
  return { gh, calls };
}

const open = (number, labels = [], extra = {}) => ({ number, title: `issue ${number}`, state: 'OPEN', labels, ...extra });
const closed = (number, extra = {}) => ({ number, title: `issue ${number}`, state: 'CLOSED', labels: [], ...extra });
const comments = (calls, n) => calls.filter((c) => (c[1] === 'comment' && c[2] === String(n)) || (c[1] === 'close' && c[2] === String(n))).map((c) => c[c.length - 1]);
/** Makes gh throw (a dropped connection, say) on the calls `fails` picks out; everything else goes through. */
const failing = (gh, fails) => (args) => {
  if (fails(args)) throw Object.assign(new Error('gh failed'), { stderr: 'Post "https://api.github.com/graphql": EOF' });
  return gh(args);
};
/** Runs a command line through `run` with the fake gh; the lines it printed. */
const cli = (gh, argv, extra = {}) => {
  const out = [];
  run(argv, { gh, log: (l) => out.push(l), ...extra });
  return out;
};
const writes = (calls) => calls.filter((c) => c[0] === 'issue' || c[0] === 'label' || c[0] === 'api');
const pr = (number, body, state = 'OPEN', isDraft = false) => ({ number, body, state, isDraft, url: `https://github.com/pr/${number}` });

test('issuesOf reads the issues line, numbers as numbers and Linear keys as strings', () => {
  assert.deepEqual(issuesOf(spec({ issues: '[12, 15]' })), [12, 15]);
  assert.deepEqual(issuesOf(spec({ issues: '[FA-577, 12]' })), ['FA-577', 12]);
  assert.deepEqual(issuesOf(spec()), []);
});

test('seven states; no status label is backlog; a closed issue is done or canceled by its reason; two labels are reported as such', () => {
  assert.deepEqual(STATES, ['backlog', 'triage', 'todo', 'in-progress', 'in-review', 'done', 'canceled']);
  assert.equal(stateOf(['bug']), 'backlog');
  assert.equal(stateOf(['bug', 'status:in-review']), 'in-review');
  assert.equal(stateOf(['status:triage', 'status:todo']), 'triage + todo');
  assert.equal(stateOf(['status:实现中']), '实现中');
  assert.equal(stateOf([], { open: false, reason: 'completed' }), 'done');
  assert.equal(stateOf(['status:todo'], { open: false, reason: 'not_planned' }), 'canceled');
  assert.deepEqual(NEXT.done, []);
  assert.deepEqual(NEXT.canceled, []);
});

test('the flip table is the spec\'s second table, no more', () => {
  assert.deepEqual(NEXT, {
    backlog: ['triage', 'todo', 'canceled'],
    triage: ['todo', 'backlog', 'canceled'],
    todo: ['in-progress', 'backlog', 'canceled'],
    'in-progress': ['in-review', 'triage', 'backlog', 'canceled'],
    'in-review': ['in-progress', 'done', 'backlog', 'canceled'],
    done: [],
    canceled: [],
  });
});

test('flips in the table pass; others are refused with the choices; done and canceled cannot be flipped again', () => {
  const prs = [{ repo: 'o/r', number: 1, state: 'merged' }];
  const ok = [['backlog', 'triage'], ['backlog', 'todo'], ['todo', 'in-progress'], ['in-progress', 'in-review'], ['in-review', 'in-progress'], ['in-review', 'done'], ['in-progress', 'canceled'], ['triage', 'canceled']];
  for (const [from, to] of ok) assert.equal(transitionError(from, to, { prs, comment: 'x', spec: spec() }), null, `${from} → ${to}`);
  assert.match(transitionError('backlog', 'in-progress'), /能翻成：triage \/ todo \/ canceled/);
  assert.match(transitionError('in-progress', 'done', { prs }), /能翻成：in-review \/ triage \/ backlog \/ canceled/);
  assert.match(transitionError('todo', 'triage'), /能翻成：in-progress \/ backlog \/ canceled/);
  assert.match(transitionError('done', 'todo'), /能翻成：无/);
  assert.match(transitionError('canceled', 'backlog', { comment: 'x' }), /能翻成：无/);
  assert.match(transitionError('todo', '待验证'), /不是 issue 的状态/);
  assert.match(transitionError('实现中', 'in-review'), /先跑 issues.mjs migrate/);
  assert.match(transitionError('todo', 'todo'), /已经是/);
});

test('putting an issue back in backlog needs a comment saying where the work stopped', () => {
  assert.match(transitionError('in-progress', 'backlog'), /--comment.*停在哪个阶段、分支/);
  assert.match(transitionError('triage', 'backlog', { comment: '   ' }), /--comment/);
  assert.equal(transitionError('in-progress', 'backlog', { comment: '停在 in-progress，分支 issue/12-retry' }), null);
});

test('triage → todo needs a spec with nothing left for a human, and the design frozen when it touches UI', () => {
  assert.match(transitionError('triage', 'todo'), /没有 spec/);
  assert.match(transitionError('triage', 'todo', { spec: spec({ grill: true }) }), /需要 grill/);
  assert.match(transitionError('triage', 'todo', { spec: spec({ fork: true }) }), /待定/);
  assert.match(transitionError('triage', 'todo', { spec: spec({ ui: UI }) }), /冻结摘要.*--skip-design/);
  assert.equal(transitionError('triage', 'todo', { spec: spec({ ui: UI }), skipDesign: true }), null);
  assert.equal(transitionError('triage', 'todo', { spec: spec({ ui: UI, freeze: true }) }), null);
  assert.equal(transitionError('triage', 'todo', { spec: spec() }), null);
  // backlog goes straight to todo for what needs no human assessment: no spec yet
  assert.equal(transitionError('backlog', 'todo'), null);
});

test('done needs every PR merged; closed-unmerged PRs do not count; no PR at all is refused', () => {
  const merged = { repo: 'o/r', number: 1, state: 'merged' };
  assert.equal(transitionError('in-review', 'done', { prs: [merged, { repo: 'o/api', number: 4, state: 'closed' }] }), null);
  assert.match(transitionError('in-review', 'done', { prs: [merged, { repo: 'o/api', number: 7, state: 'ready' }] }), /o\/api#7（ready）/);
  assert.match(transitionError('in-review', 'done', { prs: [] }), /没有 PR 挂在/);
  assert.match(transitionError('in-review', 'done', { prs: [{ repo: 'o/r', number: 2, state: 'closed' }] }), /没有 PR 挂在/);
});

test('a project that skips triage cannot set triage; the choices leave it out', () => {
  assert.match(transitionError('backlog', 'triage', { skipTriage: true }), /跳过 triage.*能翻成：todo \/ canceled/);
  assert.match(transitionError('backlog', 'in-review', { skipTriage: true }), /能翻成：todo \/ canceled/);
  assert.equal(transitionError('backlog', 'todo', { skipTriage: true }), null);
});

test('skipsTriage reads 「triage：跳过」 in the project document, not the template\'s own choice', () => {
  assert.equal(skipsTriage('# x\n\ntriage：跳过\n'), true);
  assert.equal(skipsTriage('- triage: 跳过（团队没开 Triage）\n'), true);
  assert.equal(skipsTriage('| triage | 跳过 |\n'), true);
  assert.equal(skipsTriage('**triage**：跳过'), true);
  assert.equal(skipsTriage('triage：用\n'), false);
  assert.equal(skipsTriage('triage：用 / 跳过\n'), false);
  assert.equal(skipsTriage(''), false);
});

test('parseRepos reads the first column of the 仓库 section; a name without an owner takes the issue\'s', () => {
  assert.deepEqual(parseRepos(TRACKER_TWO_REPOS), ['o/r', 'o/api']);
  assert.deepEqual(parseRepos('## 仓库\n\n- `api`：接口\n- `web`：前端\n\n## 别的\n- `x/y`\n', 'o'), ['o/api', 'o/web']);
  assert.deepEqual(parseRepos('## 仓库\n\n| 仓库 | 路径 |\n|---|---|\n| `fish-agent` | ~/a |\n', 'fishaudio'), ['fishaudio/fish-agent']);
  assert.equal(parseRepos('# 只有一个仓库\n'), null);
});

test('refsIssue: Refs owner/repo#n, or a bare Refs #n in the issue\'s own repo; not a longer number, not another repo\'s', () => {
  assert.equal(refsIssue('Refs o/r#242', 242, 'o/r', 'o/api'), true);
  assert.equal(refsIssue('说明\n\nrefs O/R#242。', 242, 'o/r', 'o/api'), true);
  assert.equal(refsIssue('Refs #242', 242, 'o/r', 'o/r'), true);
  assert.equal(refsIssue('Refs #242', 242, 'o/r', 'o/api'), false);
  assert.equal(refsIssue('Refs o/r#2420', 242, 'o/r', 'o/api'), false);
  assert.equal(refsIssue('Refs o/other#242', 242, 'o/r', 'o/api'), false);
  assert.equal(refsIssue('Closes o/r#242', 242, 'o/r', 'o/r'), false);
  assert.equal(refsIssue(null, 242, 'o/r', 'o/r'), false);
  assert.equal(prState({ state: 'OPEN', isDraft: true }), 'draft');
  assert.equal(prState({ state: 'OPEN', isDraft: false }), 'ready');
  assert.equal(prState({ state: 'MERGED' }), 'merged');
  assert.equal(prState({ state: 'CLOSED' }), 'closed');
});

test('set relabels, comments with the AI prefix, and closes done and canceled with their reason, dropping the label', () => {
  const docs = docsWith({ retry: spec({ issues: '[1]' }) });
  const issues = { 1: open(1, ['status:triage', 'type:bug']), 2: open(2, ['status:in-review']), 3: open(3, ['status:in-progress']), 4: open(4, ['status:todo']) };
  const { gh, calls } = fakeGh(issues, [], { 'o/r': [pr(5, 'Refs o/r#2', 'MERGED')] });
  assert.deepEqual(setState(gh, docs, 'todo', [1]), ['#1: triage → todo']);
  assert.deepEqual(issues[1].labels.sort(), ['status:todo', 'type:bug']);
  assert.deepEqual(setState(gh, docs, 'done', [2]), ['#2: in-review → done（关闭，completed）']);
  assert.equal(issues[2].state, 'CLOSED');
  assert.equal(issues[2].reason, 'completed');
  assert.deepEqual(issues[2].labels, []);
  assert.deepEqual(comments(calls, 2), ['🤖 idea-loop：合并的 PR：o/r#5。']);
  setState(gh, docs, 'backlog', [3], { comment: '先放着：等 0.2.x' });
  assert.deepEqual(issues[3].labels, []);
  assert.deepEqual(comments(calls, 3), ['🤖 idea-loop：先放着：等 0.2.x']);
  setState(gh, docs, 'canceled', [4], { comment: '不做了' });
  assert.equal(issues[4].reason, 'not_planned');
  assert.deepEqual(issues[4].labels, []);
  assert.deepEqual(comments(calls, 4), ['🤖 idea-loop：不做了']);
});

test('set checks every flip before making any', () => {
  const docs = docsWith();
  const issues = { 1: open(1, ['status:todo']), 2: open(2, []) };
  const { gh, calls } = fakeGh(issues);
  assert.throws(() => setState(gh, docs, 'in-progress', [1, 2]), /#2：「backlog」不能翻成「in-progress」/);
  assert.deepEqual(writes(calls), []);
});

test('set refuses a closed issue, whichever way it was closed', () => {
  const { gh } = fakeGh({ 1: closed(1), 2: closed(2, { reason: 'not_planned' }) });
  assert.throws(() => setState(gh, docsWith(), 'todo', [1]), /已关闭（done）/);
  assert.throws(() => setState(gh, docsWith(), 'backlog', [2], { comment: 'x' }), /已关闭（canceled）/);
});

test('set todo from triage refuses while the spec still has 需要 grill, naming the line; check says the same and writes nothing', () => {
  const docs = docsWith({ retry: spec({ issues: '[1]', grill: true }) });
  const issues = { 1: open(1, ['status:triage']) };
  const { gh, calls } = fakeGh(issues);
  assert.throws(() => setState(gh, docs, 'todo', [1]), /#1：spec 里还有等人定的：开头标着「需要 grill」/);
  const r = checkState(gh, docs, 'todo', 1);
  assert.equal(r.ok, false);
  assert.match(r.reason, /开头标着「需要 grill」/);
  assert.deepEqual(writes(calls), []);
  // once the spec is settled, check says yes and still writes nothing
  writeFileSync(join(docs, 'spec', 'retry', 'retry.md'), spec({ issues: '[1]' }));
  assert.equal(checkState(gh, docs, 'todo', 1).ok, true);
  assert.deepEqual(writes(calls), []);
  assert.equal(issues[1].labels[0], 'status:triage');
});

test('a project that skips triage: set triage is refused, backlog goes straight to todo', () => {
  const docs = docsWith({}, '# Issue tracker\n\ntriage：跳过\n');
  const issues = { 1: open(1, []) };
  const { gh, calls } = fakeGh(issues);
  assert.throws(() => setState(gh, docs, 'triage', [1]), /跳过 triage/);
  assert.deepEqual(writes(calls), []);
  assert.deepEqual(setState(gh, docs, 'todo', [1]), ['#1: backlog → todo']);
  assert.deepEqual(issues[1].labels, ['status:todo']);
});

test('an issue with PRs in two repos: set done lists the one not merged; after both merge, reconcile closes it as completed', () => {
  const docs = docsWith({}, TRACKER_TWO_REPOS);
  const issues = { 242: open(242, ['status:in-review']) };
  const prs = { 'o/r': [pr(10, '改知识库\n\nRefs o/r#242', 'MERGED'), pr(11, '别的 Refs o/r#9', 'MERGED')], 'o/api': [pr(20, 'Refs o/r#242', 'OPEN')] };
  const { gh, calls } = fakeGh(issues, [], prs);
  assert.throws(() => setState(gh, docs, 'done', [242]), /#242：还有 PR 没合并：o\/api#20（ready）/);
  assert.deepEqual(writes(calls), []);
  assert.deepEqual(reconcile(gh, docs), { done: [], problems: [] });
  prs['o/api'][0].state = 'MERGED';
  const { done } = reconcile(gh, docs);
  assert.deepEqual(done, ['#242: in-review → done（PR o/r#10、o/api#20 都已合并）']);
  assert.equal(issues[242].state, 'CLOSED');
  assert.equal(issues[242].reason, 'completed');
  assert.deepEqual(issues[242].labels, []);
  assert.match(comments(calls, 242)[0], /^🤖 idea-loop：PR o\/r#10、o\/api#20 都已合并/);
});

test('without a 仓库 section only the issue\'s own repo is searched', () => {
  const docs = docsWith({});
  const issues = { 5: open(5, ['status:in-review']) };
  const { gh } = fakeGh(issues, [], { 'o/r': [pr(1, 'Refs #5', 'MERGED')], 'o/api': [pr(2, 'Refs o/r#5', 'OPEN')] });
  assert.deepEqual(setState(gh, docs, 'done', [5]), ['#5: in-review → done（关闭，completed）']);
});

test('reconcilePlan: all merged → done; in-progress with every PR ready → in-review; drafts keep it in-progress', () => {
  const issues = [open(1, ['status:in-review']), open(2, ['status:in-progress']), open(3, ['status:in-progress']), open(4, ['status:in-progress']), open(5, ['status:todo']), open(6, ['status:in-progress'])];
  const p = (state) => ({ repo: 'o/r', number: 9, state });
  const prs = new Map([[1, [p('merged')]], [2, [p('ready'), p('merged')]], [3, [p('ready'), p('draft')]], [4, [p('merged'), p('closed')]], [5, [p('merged')]], [6, []]]);
  const { actions } = reconcilePlan(issues, prs);
  assert.deepEqual(actions.map((a) => [a.n, a.from, a.to]), [[1, 'in-review', 'done'], [2, 'in-progress', 'in-review'], [4, 'in-progress', 'done']]);
});

test('reconcilePlan reports old Chinese labels and two status labels as problems, and leaves them alone', () => {
  const issues = [open(30, ['status:实现中']), open(31, ['status:todo', 'status:in-review']), open(32, [])];
  const { actions, problems } = reconcilePlan(issues, new Map());
  assert.deepEqual(actions, []);
  assert.equal(problems.length, 2);
  assert.match(problems[0], /#30 的 label「实现中」不是 issue 的状态.*migrate/);
  assert.match(problems[1], /#31 有两个 status:\* label/);
});

test('reconcile flips an in-progress issue whose PRs all turned ready to in-review, with a comment saying why', () => {
  const docs = docsWith({});
  const issues = { 7: open(7, ['status:in-progress']) };
  const { gh, calls } = fakeGh(issues, [], { 'o/r': [pr(1, 'Refs #7')] });
  assert.deepEqual(reconcile(gh, docs).done, ['#7: in-progress → in-review（PR o/r#1 都已 ready）']);
  assert.deepEqual(issues[7].labels, ['status:in-review']);
  assert.match(comments(calls, 7)[0], /^🤖 idea-loop：PR o\/r#1 都已 ready/);
});

test('migratePlan maps the old labels; 实现中 is in-review only with a ready PR; 搁置 gets a comment; mixed labels are problems', () => {
  const issues = [
    open(1, ['status:验证中']), open(2, ['status:审核中']), open(3, ['status:待设计']), open(4, ['status:设计中']), open(5, ['status:待实现']),
    open(6, ['status:实现中']), open(7, ['status:实现中']), open(8, ['status:搁置']), open(9, ['status:todo']), open(10, []),
    open(11, ['status:实现中', 'status:搁置']), open(12, ['status:wat']),
  ];
  const prs = new Map([[6, [{ state: 'ready' }]], [7, [{ state: 'draft' }]]]);
  const { relabels, problems } = migratePlan(issues, prs);
  assert.deepEqual(relabels.map((r) => [r.n, r.to]), [[1, 'triage'], [2, 'triage'], [3, 'triage'], [4, 'triage'], [5, 'todo'], [6, 'in-review'], [7, 'in-progress'], [8, 'backlog']]);
  assert.deepEqual(relabels.find((r) => r.n === 8).add, []);
  assert.deepEqual(relabels.find((r) => r.n === 5), { n: 5, from: '待实现', to: 'todo', remove: ['status:待实现'], add: ['status:todo'], comment: '' });
  assert.match(relabels.find((r) => r.n === 8).comment, /从搁置迁回/);
  assert.equal(problems.length, 2);
});

test('migrate lists by default and calls no gh write; --apply swaps the labels, comments on 搁置, drops spec status lines', () => {
  const docs = docsWith({ retry: spec({ issues: '[1]', status: '实现中' }) });
  const issues = {
    1: open(1, ['status:实现中', 'type:bug']),
    2: open(2, ['status:搁置']),
    3: open(3, ['status:待实现']),
    10: open(10, ['status:验证中']),
  };
  const { gh, calls } = fakeGh(issues, [], { 'o/r': [pr(50, 'Refs #1')] });
  const dry = migrate(gh, docs);
  assert.equal(dry.applied, false);
  assert.deepEqual(writes(calls), []);
  assert.deepEqual(dry.lines, [
    '#1: status:实现中 → status:in-review',
    '#2: status:搁置 → 回 backlog（去掉 status:*），补评论',
    '#3: status:待实现 → status:todo',
    '#10: status:验证中 → status:triage',
    'spec retry: 删掉 frontmatter 的 status 行',
  ]);
  assert.match(readFileSync(join(docs, 'spec', 'retry', 'retry.md'), 'utf8'), /^status: 实现中$/m);
  const done = migrate(gh, docs, { apply: true });
  assert.equal(done.applied, true);
  assert.deepEqual(issues[1].labels.sort(), ['status:in-review', 'type:bug']);
  assert.deepEqual(issues[2].labels, []);
  assert.deepEqual(comments(calls, 2).length, 1);
  assert.match(comments(calls, 2)[0], /^🤖 idea-loop：从搁置迁回/);
  assert.deepEqual(issues[3].labels, ['status:todo']);
  assert.doesNotMatch(readFileSync(join(docs, 'spec', 'retry', 'retry.md'), 'utf8'), /^status:/m);
  assert.deepEqual(issuesOf(readFileSync(join(docs, 'spec', 'retry', 'retry.md'), 'utf8')), [1]);
  assert.ok(issues[1].state === 'OPEN');
});

test('migrate --apply creates the new status labels first, so a repo that never ran `issues labels` keeps every issue labelled', () => {
  const docs = docsWith({});
  const issues = { 1: open(1, ['status:设计中']), 2: open(2, ['status:实现中']) };
  const labels = ['status:设计中', 'status:实现中'];
  const { gh } = fakeGh(issues, labels, {}, { strictLabels: true });
  migrate(gh, docs, { apply: true });
  assert.deepEqual(issues[1].labels, ['status:triage']);
  assert.deepEqual(issues[2].labels, ['status:in-progress']);
});

test('a label swap adds before it removes: when the add fails the issue keeps its old label instead of reading as backlog', () => {
  const issues = { 1: open(1, ['status:设计中']), 2: open(2, ['status:todo']) };
  const labels = ['status:设计中', 'status:todo', 'status:triage', 'status:in-progress'];
  const { gh } = fakeGh(issues, labels, {}, { strictLabels: true });
  // the connection drops on the call that adds a label, after any removal sent with it went through
  const dropping = (args) => {
    if (args[0] === 'issue' && args[1] === 'edit' && args.includes('--add-label')) {
      for (let k = 3; k < args.length; k += 2) if (args[k] === '--remove-label') issues[args[2]].labels = issues[args[2]].labels.filter((l) => l !== args[k + 1]);
      throw Object.assign(new Error('failed'), { stderr: 'unexpected EOF' });
    }
    return gh(args);
  };
  assert.throws(() => migrate(dropping, docsWith({}), { apply: true }));
  assert.deepEqual(issues[1].labels, ['status:设计中']);
  assert.throws(() => setState(dropping, docsWith({}), 'in-progress', [2], { skipDesign: true }));
  assert.deepEqual(issues[2].labels, ['status:todo']);
});

test('migrate only unlinks and closes roots the consolidation task opened (body line 1); parent-child links a human made stay', () => {
  const docs = docsWith({});
  const issues = {
    // opened by the consolidation task: sub-issues unlinked, the root closed as not planned with a comment
    10: open(10, [], { body: '由整合定时任务开出\n\n改的是设计档案页面' }),
    11: open(11, [], { subOf: 10 }),
    12: open(12, [], { subOf: 10 }),
    // a human split this one: links stay, issue stays open
    20: open(20, ['status:验证中'], { body: '把重试拆开做\n\n由整合定时任务开出 只是正文里提到' }),
    21: open(21, [], { subOf: 20 }),
    // a consolidation root somebody has since taken into verification: unlinked, but not closed
    30: open(30, ['status:设计中'], { body: '由整合定时任务开出' }),
    31: open(31, [], { subOf: 30 }),
  };
  const { gh, calls } = fakeGh(issues);
  const dry = migrate(gh, docs);
  assert.deepEqual(writes(calls), []);
  assert.deepEqual(dry.lines.filter((l) => /子 issue|not planned|关/.test(l)), [
    '#11: 解除 #10 的子 issue 关系',
    '#12: 解除 #10 的子 issue 关系',
    '#31: 解除 #30 的子 issue 关系',
    '#10: 整合开出的根，解除后关成 not planned（补评论）',
    '#30: 整合开出的根，但已有 status:* label（有人在做），解除关系后不关',
  ]);
  assert.ok(!dry.lines.some((l) => /#21|#20: 解除/.test(l)), 'the human-made link is not listed');
  migrate(gh, docs, { apply: true });
  assert.equal(issues[11].subOf, undefined);
  assert.equal(issues[12].subOf, undefined);
  assert.equal(issues[31].subOf, undefined);
  assert.equal(issues[21].subOf, 20);
  assert.equal(issues[10].state, 'CLOSED');
  assert.equal(issues[10].reason, 'not_planned');
  assert.match(comments(calls, 10)[0], /^🤖 idea-loop：/);
  assert.equal(issues[20].state, 'OPEN');
  assert.equal(issues[30].state, 'OPEN');
});

test('withoutStatus drops only the frontmatter status line', () => {
  const md = spec({ status: '完成' }) + '\nstatus: 正文里的\n';
  const out = withoutStatus(md);
  assert.doesNotMatch(out.split('\n---')[0], /status:/);
  assert.match(out, /status: 正文里的/);
  assert.equal(withoutStatus(spec()), spec());
});

test('candidates are todo issues no open issue blocks, oldest first', () => {
  const issues = {
    5: open(5, ['status:todo']),
    2: open(2, ['status:todo']),
    3: open(3, ['status:todo'], { blockedBy: [4] }),
    4: open(4, ['status:in-progress']),
    6: open(6, ['status:todo'], { blockedBy: [7] }),
    7: closed(7),
    8: open(8),
    9: open(9, ['status:triage']),
  };
  const { gh } = fakeGh(issues);
  assert.deepEqual(candidates(gh).map((i) => i.number), [2, 5, 6]);
  assert.deepEqual(candidates(gh, 1).map((i) => i.number), [2]);
});

test('candidates: the ones assigned to me hand out P0 first, then P1, P2, none; the lower number first within a priority', () => {
  const mine = { assignees: ['me'] };
  const { gh } = fakeGh({
    3: open(3, ['status:todo'], mine),
    5: open(5, ['status:todo', 'priority:P2'], mine),
    9: open(9, ['status:todo', 'priority:P0'], mine),
    4: open(4, ['status:todo', 'priority:P1'], mine),
    2: open(2, ['status:todo', 'priority:P1'], mine),
    11: open(11, ['status:triage', 'priority:P0'], mine),
    12: open(12, ['status:todo', 'priority:P0'], { ...mine, blockedBy: [3] }),
  });
  assert.deepEqual(candidates(gh).map((i) => i.number), [9, 2, 4, 5, 3]);
  assert.deepEqual(candidates(gh, 2).map((i) => [i.number, i.priority, i.assignee]), [[9, 'P0', 'me'], [2, 'P1', 'me']]);
  assert.equal(priorityOf(['priority:P2', 'priority:P0']), 'P0');
  assert.equal(priorityOf(['priority:high', 'bug']), null);
});

/** An event line of the issue's timeline: the label `name` added at `at`. */
const labeled = (name, at) => ({ event: 'labeled', label: { name }, created_at: at });
/** A fake gh that also remembers every read it was asked for. */
const readSpy = (gh) => {
  const seen = [];
  return { gh: (args) => { seen.push(args.join(' ')); return gh(args); }, seen };
};

test('candidates: what is assigned to me goes first and alone; unassigned ones wait until none of mine can be handed out; someone else\'s never', () => {
  const t = ['status:todo'];
  const { gh } = fakeGh({
    1: open(1, [...t, 'priority:P0']),
    2: open(2, [...t, 'priority:P2'], { assignees: ['me'] }),
    3: open(3, [...t, 'priority:P0'], { assignees: ['other'] }),
    4: open(4, [...t, 'priority:P1'], { assignees: ['other', 'me'] }),
    5: open(5, t, { assignees: ['other'], blockedBy: [2] }),
  });
  assert.deepEqual(candidates(gh).map((i) => [i.number, i.assignee]), [[4, 'me'], [2, 'me']], 'P1 before P2; the unassigned P0 and the other\'s P0 are not handed out');
  const noneOfMine = fakeGh({ 1: open(1, t), 3: open(3, t, { assignees: ['other'] }), 4: open(4, t, { assignees: ['other'], blockedBy: [3] }), 6: open(6, ['status:triage'], { assignees: ['me'] }) }).gh;
  assert.deepEqual(candidates(noneOfMine).map((i) => [i.number, i.assignee]), [[1, null]], 'mine is blocked or not todo: the unassigned goes');
  const onlyOthers = fakeGh({ 3: open(3, t, { assignees: ['other'] }) }).gh;
  assert.deepEqual(candidates(onlyOthers), []);
});

test('candidates: unassigned ones, when none is mine, go by how long they have been in todo, the longest first', () => {
  const t = ['status:todo'];
  const { gh } = fakeGh({
    1: open(1, [...t, 'priority:P0'], { createdAt: '2026-01-01T00:00:00Z', events: [labeled('status:todo', '2026-03-01T00:00:00Z')] }),
    2: open(2, [...t, 'priority:P2'], { createdAt: '2026-02-01T00:00:00Z', events: [labeled('status:todo', '2026-02-02T00:00:00Z')] }),
    3: open(3, t, { createdAt: '2026-01-05T00:00:00Z', events: [labeled('status:todo', '2026-01-06T00:00:00Z'), labeled('status:in-progress', '2026-01-07T00:00:00Z'), labeled('status:todo', '2026-02-20T00:00:00Z')] }),
    4: open(4, t, { createdAt: '2026-01-10T00:00:00Z', events: [labeled('priority:P0', '2026-01-11T00:00:00Z'), labeled('status:todo', '2026-01-12T00:00:00Z'), labeled('priority:P1', '2026-04-01T00:00:00Z')] }),
    5: open(5, t, { createdAt: '2026-01-20T00:00:00Z' }),
  });
  // 4 since Jan 12 (the later label that is not status:todo does not count), 5 has no event: created Jan 20, 2 since Feb 2, 3 re-entered Feb 20 (the last time counts), 1 since Mar 1
  assert.deepEqual(candidates(gh).map((i) => i.number), [4, 5, 2, 3, 1]);
  assert.deepEqual(candidates(gh, 2).map((i) => [i.number, i.assignee]), [[4, null], [5, null]]);
});

test('candidates: reads only what the order needs, the user once, and an issue\'s events only while unassigned ones have to be sorted', () => {
  const t = ['status:todo'];
  const ev = { events: [labeled('status:todo', '2026-02-01T00:00:00Z')] };
  const reads = (issues) => { const s = readSpy(fakeGh(issues).gh); candidates(s.gh); return s.seen.filter((c) => /^api user$|\/events/.test(c)); };
  assert.deepEqual(reads({ 1: open(1, t, ev), 2: open(2, t, ev) }).map((c) => c.replace(/\?.*/, '')), ['api repos/{owner}/{repo}/issues/1/events', 'api repos/{owner}/{repo}/issues/2/events'], 'nobody is assigned: no user read, events of the two to sort');
  assert.deepEqual(reads({ 1: open(1, t, ev) }), [], 'a single unassigned one needs no order');
  assert.deepEqual(reads({ 1: open(1, t, ev), 2: open(2, t, { assignees: ['me'] }), 3: open(3, t, ev) }), ['api user'], 'one of mine: the user is read, no events');
  assert.deepEqual(reads({ 1: open(1, t, { ...ev, assignees: ['x'] }) }), ['api user'], 'an assignee: the user is read to tell whether it is me');
  assert.deepEqual(reads({ 1: open(1, ['status:triage'], { assignees: ['me'] }), 2: open(2, t, ev) }), [], 'issues that are not candidates cost nothing');
});

test('candidates: an issue with more events than a page is read page by page', () => {
  const t = ['status:todo'];
  const noise = Array.from({ length: 120 }, (_, k) => labeled('priority:P1', `2026-01-${String((k % 28) + 1).padStart(2, '0')}T00:00:00Z`));
  const { gh } = fakeGh({
    1: open(1, t, { createdAt: '2026-01-01T00:00:00Z', events: [...noise, labeled('status:todo', '2026-05-01T00:00:00Z')] }),
    2: open(2, t, { createdAt: '2026-01-01T00:00:00Z', events: [labeled('status:todo', '2026-04-01T00:00:00Z')] }),
  });
  assert.deepEqual(candidates(gh).map((i) => i.number), [2, 1]);
});

test('show: state, title, categories, kind, each PR with its repo and draft / ready / merged, the covering spec, the branch', () => {
  const docs = docsWith({ retry: spec({ issues: '[10]' }) }, TRACKER_TWO_REPOS);
  const issues = { 10: open(10, ['status:in-progress', 'type:seo', 'type:seo/blog', 'kind:bug']), 13: open(13) };
  const { gh } = fakeGh(issues, [], { 'o/r': [pr(1, 'Refs o/r#10', 'OPEN', true), pr(2, 'Refs o/r#99')], 'o/api': [pr(3, 'Refs o/r#10', 'MERGED'), pr(4, 'Refs o/r#10', 'CLOSED')] });
  const git = () => 'main\norigin/main\nissue/10-retry\norigin/issue/10-retry\nissue/100-other\n';
  const v = show(gh, docs, 10, { git });
  assert.equal(v.state, 'in-progress');
  assert.equal(v.title, 'issue 10');
  assert.deepEqual(v.categories, ['type:seo', 'type:seo/blog']);
  assert.equal(v.kind, 'bug');
  assert.deepEqual(v.prs.map((p) => [p.repo, p.number, p.state]), [['o/r', 1, 'draft'], ['o/api', 3, 'merged'], ['o/api', 4, 'closed']]);
  assert.equal(v.spec, 'retry');
  assert.equal(v.branch, 'issue/10-retry');
  const none = show(gh, docs, 13, { git: () => '' });
  assert.equal(none.state, 'backlog');
  assert.deepEqual(none.prs, []);
  assert.equal(none.spec, null);
  assert.equal(none.branch, null);
});

test('reading open issues pages through the repo list and skips pull requests', () => {
  const issues = {};
  for (let n = 1; n <= 230; n += 1) issues[n] = open(n, ['status:todo']);
  issues[231] = open(231, ['status:todo'], { pull: true });
  const { gh } = fakeGh(issues);
  assert.equal(candidates(gh, 1000).length, 230);
});

const TYPES = `# AGENTS.md

## issue 分类

GitHub 上打成 \`type:<父类>\`。

- \`billing\`：计费
- \`seo\`：搜索流量
  - \`backlink\`：外链
  - \`blog\`
- \`uiux\`：界面与交互

保留的 label：\`Idea\`、\`test infra\`

## 别的
- \`not-a-type\`
`;

test('parseTypes reads parents, children and the keep-list from the section only', () => {
  const types = parseTypes(TYPES);
  assert.deepEqual(types.parents.map((p) => p.name), ['billing', 'seo', 'uiux']);
  assert.deepEqual(types.parents[1].children, [{ name: 'backlink', about: '外链' }, { name: 'blog', about: '' }]);
  assert.deepEqual(types.keep, ['Idea', 'test infra']);
  assert.equal(parseTypes('# x\n'), null);
  assert.throws(() => parseTypes('## issue 分类\n- `UI/UX`\n'), /「\/」/);
});

test('readTypes finds the section in AGENTS.md, then CLAUDE.md, next to docs/', () => {
  const root = mkdtempSync(join(tmpdir(), 'issues-root-'));
  const docs = join(root, 'docs');
  mkdirSync(docs);
  assert.equal(readTypes(docs), null);
  writeFileSync(join(root, 'AGENTS.md'), '# AGENTS.md\n');
  writeFileSync(join(root, 'CLAUDE.md'), TYPES);
  assert.deepEqual(readTypes(docs).keep, ['Idea', 'test infra']);
});

test('typeSet: a child brings its parent; unknown names are refused with the choices', () => {
  const types = parseTypes(TYPES);
  assert.deepEqual(typeSet(types, ['seo/blog', 'billing']), ['type:seo', 'type:seo/blog', 'type:billing']);
  assert.throws(() => typeSet(types, ['ai']), /type:seo\/backlink|seo\/backlink/);
  assert.throws(() => typeSet(types, ['seo/ads']), /没有子类「ads」/);
});

test('ensureLabels creates the four status labels, the three kinds and the type labels; the rest is listed with its use', () => {
  const types = parseTypes(TYPES);
  const { gh, calls } = fakeGh({ 1: open(1, ['bug', 'Idea']), 2: open(2, ['bug']) }, ['status:todo', 'bug', 'Idea', 'status:实现中', 'type:seo']);
  const { made, surplus, deleted } = ensureLabels(gh, types);
  assert.deepEqual(made.filter((l) => l.startsWith('status:')), ['status:triage', 'status:in-progress', 'status:in-review']);
  assert.deepEqual(made.filter((l) => l.startsWith('kind:')), KINDS.map((k) => `kind:${k}`));
  assert.deepEqual(made.filter((l) => l.startsWith('type:')), ['type:billing', 'type:seo/backlink', 'type:seo/blog', 'type:uiux']);
  assert.deepEqual(surplus, [{ name: 'bug', openIssues: 2 }, { name: 'status:实现中', openIssues: 0 }]);
  assert.deepEqual(deleted, []);
  assert.ok(calls.every((c) => c[1] === 'create'));
  assert.ok(keptLabels(types).has('kind:improvement'));
  assert.ok(!keptLabels(types).has('status:done'));
});

test('ensureLabels --prune deletes the surplus, and refuses without categories', () => {
  const { gh, calls } = fakeGh({}, ['bug', 'Idea']);
  assert.deepEqual(ensureLabels(gh, parseTypes(TYPES), { prune: true }).deleted, ['bug']);
  assert.ok(calls.some((c) => c.join(' ') === 'label delete bug --yes'));
  assert.throws(() => ensureLabels(gh, null, { prune: true }), /不清理/);
  assert.deepEqual(ensureLabels(gh, null).surplus, []);
});

test('setTypes replaces the issue\'s type labels and leaves the rest', () => {
  const issues = { 1: open(1, ['status:triage', 'type:billing', 'Idea', 'kind:bug']) };
  const { gh } = fakeGh(issues);
  setTypes(gh, parseTypes(TYPES), 1, ['seo/blog']);
  assert.deepEqual(issues[1].labels.sort(), ['Idea', 'kind:bug', 'status:triage', 'type:seo', 'type:seo/blog']);
});

test('a category marked 独立队列 gets its own queue, cap and sections; its note stays out of the label text', () => {
  const types = parseTypes('## issue 分类\n\n- `bug`：缺陷\n- `seo`：搜索可见性（独立队列，上限 5）\n  - `technical`：技术\n');
  assert.equal(types.parents[1].about, '搜索可见性');
  assert.deepEqual(queues(types), [
    { name: null, cap: 10, sections: ['triage', 'in-progress', 'in-review'] },
    { name: 'seo', cap: 5, sections: ['seo triage', 'seo in-progress', 'seo in-review'] },
  ]);
  assert.equal(queueOf(types, ['type:seo', 'type:seo/technical']).name, 'seo');
  assert.equal(queueOf(types, ['type:bug']).name, null);
  assert.deepEqual(queues(null).map((q) => q.name), [null]);
});

test('candidates of the main queue skip own-queue issues; --queue takes only those', () => {
  const types = parseTypes('## issue 分类\n\n- `bug`：缺陷\n- `seo`：搜索（独立队列，上限 5）\n');
  const t = ['status:todo'];
  const { gh } = fakeGh({ 1: open(1, [...t, 'type:seo', 'type:seo/pages']), 2: open(2, [...t, 'type:bug']), 3: open(3, t), 4: open(4, [...t, 'type:seo']) });
  assert.deepEqual(candidates(gh, 100, { types }).map((i) => i.number), [2, 3]);
  assert.deepEqual(candidates(gh, 100, { types, queue: 'seo' }).map((i) => i.number), [1, 4]);
  assert.deepEqual(candidates(gh, 1, { types, queue: 'seo' }).map((i) => i.number), [1]);
  assert.throws(() => candidates(gh, 100, { types, queue: 'bug' }), /不是独立队列/);
});

test('the command line refuses the commands of the old model', () => {
  const docs = docsWith();
  for (const cmd of ['advance', 'resume', 'handoff', 'unhandoff', 'drop', 'queue', 'group', 'split', 'block']) {
    assert.throws(() => execFileSync('node', [SCRIPT, cmd, docs, '1'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }), /不认识的命令/, cmd);
  }
});

// ---------- issue body, new, body, priority, backlog, note (spec issue-triage) ----------

const GOOD_BODY = '## 问题\n\n重试会重复扣配额\n\n## 证据\n\n无，待验证\n\n## 影响范围\n\n所有点过重试的用户\n\n## 从哪发现\n\n#242 的复现\n\n## 背景\n\n可选的一节\n';
const withoutSection = (name) => GOOD_BODY.replace(new RegExp(`## ${name}\\n\\n[^#]*`), '');

/** A file with `text` in a fresh temp directory; its path. */
function fileWith(text) {
  const f = join(mkdtempSync(join(tmpdir(), 'issues-body-')), 'body.md');
  writeFileSync(f, text);
  return f;
}

/** The fake gh, with every call it gets (reads too) recorded in `seen`. */
function spied(issues, labels = [], prs = {}) {
  const fake = fakeGh(issues, labels, prs);
  const seen = [];
  return { ...fake, gh: (args) => { seen.push(args); return fake.gh(args); }, seen };
}

test('bodyErrors: the four sections must be there and not blank; optional sections and other headings are left alone', () => {
  assert.deepEqual(bodyErrors(GOOD_BODY), []);
  assert.deepEqual(bodyErrors(withoutSection('从哪发现')), ['缺「从哪发现」一节（## 从哪发现）']);
  assert.deepEqual(bodyErrors('## 问题\n\nx\n'), ['缺「证据」一节（## 证据）', '缺「影响范围」一节（## 影响范围）', '缺「从哪发现」一节（## 从哪发现）']);
  assert.deepEqual(bodyErrors(GOOD_BODY.replace('所有点过重试的用户', ' \n\t')), ['「影响范围」一节是空的']);
  assert.deepEqual(bodyErrors('## 问题\n\n## 证据\n\nx\n## 影响范围\nx\n## 从哪发现\nx'), ['「问题」一节是空的']);
  assert.deepEqual(bodyErrors(GOOD_BODY.replace('## 背景\n\n可选的一节\n', '')), []);
  // text under a sub-heading is content; a 三级 heading with a required name does not start a section
  assert.deepEqual(bodyErrors('## 问题\n\n### 细节\n\nx\n\n## 证据\n\n### 影响范围\n\n## 影响范围\n\nx\n## 从哪发现\nx'), []);
  assert.equal(bodyErrors('').length, 4);
  assert.equal(bodyErrors(undefined).length, 4);
});

test('new refuses a body that misses a section without calling gh issue create, and says which', () => {
  const { gh, calls } = fakeGh({});
  assert.throws(() => newIssue(gh, null, { title: '重试重复扣配额', body: withoutSection('从哪发现') }), /从哪发现/);
  assert.deepEqual(writes(calls), []);
});

test('new refuses a title an open issue already has, naming its number', () => {
  const issues = { 5: open(5, ['status:todo']) };
  const { gh, calls } = fakeGh(issues);
  assert.throws(() => newIssue(gh, null, { title: 'issue 5', body: GOOD_BODY }), /#5/);
  assert.deepEqual(writes(calls), []);
  // a closed issue with the same title does not count
  const { gh: gh2, calls: calls2 } = fakeGh({ 6: closed(6) });
  assert.equal(newIssue(gh2, null, { title: 'issue 6', body: GOOD_BODY }), 7);
  assert.equal(calls2.length, 1);
});

test('new --state=todo needs a priority; unknown state, priority, kind and category are refused before anything is created', () => {
  const { gh, calls } = fakeGh({});
  const types = parseTypes(TYPES);
  assert.throws(() => newIssue(gh, types, { title: 't', body: GOOD_BODY, state: 'todo' }), /--priority/);
  assert.throws(() => newIssue(gh, types, { title: 't', body: GOOD_BODY, state: 'in-progress' }), /backlog 或 todo/);
  assert.throws(() => newIssue(gh, types, { title: 't', body: GOOD_BODY, priority: 'P3' }), /P0 \/ P1 \/ P2/);
  assert.throws(() => newIssue(gh, types, { title: 't', body: GOOD_BODY, kind: 'chore' }), /bug \/ feature \/ improvement/);
  assert.throws(() => newIssue(gh, types, { title: 't', body: GOOD_BODY, typeValues: ['ai'] }), /不是这个项目的分类/);
  assert.throws(() => newIssue(gh, types, { title: '  ', body: GOOD_BODY }), /标题/);
  assert.deepEqual(writes(calls), []);
});

test('new: todo carries status:todo, backlog carries no status:*; priority, kind and type labels follow the arguments; returns the number', () => {
  const issues = { 3: open(3, []) };
  const { gh } = fakeGh(issues);
  const types = parseTypes(TYPES);
  const todo = newIssue(gh, types, { title: '新的一条', body: GOOD_BODY, state: 'todo', priority: 'P1', kind: 'bug', typeValues: ['seo/blog'] });
  assert.equal(todo, 4);
  assert.deepEqual(issues[4].labels.sort(), ['kind:bug', 'priority:P1', 'status:todo', 'type:seo', 'type:seo/blog']);
  assert.equal(issues[4].body, GOOD_BODY);
  const second = newIssue(gh, types, { title: '另一条', body: GOOD_BODY });
  assert.deepEqual(issues[second].labels, []);
  const urgent = newIssue(gh, types, { title: '第三条', body: GOOD_BODY, priority: 'P0' });
  assert.deepEqual(issues[urgent].labels, ['priority:P0']);
});

test('the command line: new opens the issue and prints its number; body only checks', () => {
  const docs = docsWith();
  writeFileSync(join(docs, '..', 'AGENTS.md'), TYPES);
  const { gh, calls } = fakeGh({});
  const out = cli(gh, ['new', docs, '重试重复扣配额', fileWith(GOOD_BODY), '--state=todo', '--priority=P0', '--kind=bug', '--type=billing', '--type=seo/blog']);
  assert.deepEqual(out, ['1']);
  assert.deepEqual(calls[0].filter((a, i) => calls[0][i - 1] === '--label').sort(), ['kind:bug', 'priority:P0', 'status:todo', 'type:billing', 'type:seo', 'type:seo/blog']);
  assert.deepEqual(cli(gh, ['body', docs, fileWith(GOOD_BODY)]), ['正文齐了']);
  assert.throws(() => cli(gh, ['body', docs, fileWith(withoutSection('证据'))]), /缺「证据」/);
  assert.throws(() => cli(gh, ['body', docs, join(docs, 'no-such.md')]), /没有正文文件/);
  assert.throws(() => cli(gh, ['new', docs, 'x', fileWith(GOOD_BODY), '--state']), /--state 要带值/);
  assert.equal(calls.length, 1, 'body wrote nothing');
});

test('new --repo opens the issue in that repository and checks for a duplicate there; without it nothing changes', () => {
  // a gh that knows two repos: the current one (o/r) has an open issue titled 同名, plugin/repo has none
  const calls = [];
  const gh = (args) => {
    calls.push(args);
    if (args[0] === 'api') return JSON.stringify(args[1].startsWith('repos/plugin/repo/') ? [] : [{ number: 5, title: '同名', state: 'open', labels: [] }]);
    if (args[0] === 'issue' && args[1] === 'create') return 'https://github.com/plugin/repo/issues/9\n';
    return '';
  };
  assert.equal(newIssue(gh, null, { title: '同名', body: GOOD_BODY, repo: 'plugin/repo' }), 9);
  assert.ok(calls.some((c) => c[0] === 'api' && c[1].startsWith('repos/plugin/repo/issues?')), 'duplicate check reads the named repo');
  assert.ok(!calls.some((c) => c[0] === 'api' && c[1].startsWith('repos/{owner}/{repo}/')), 'not the current repo');
  const create = calls.find((c) => c[0] === 'issue');
  assert.deepEqual(create.slice(0, 4), ['issue', 'create', '-R', 'plugin/repo']);
  // the same title already open in the named repo is still refused
  const taken = (args) => (args[0] === 'api' ? JSON.stringify([{ number: 3, title: '同名', state: 'open', labels: [] }]) : '');
  assert.throws(() => newIssue(taken, null, { title: '同名', body: GOOD_BODY, repo: 'plugin/repo' }), /#3/);
  // without --repo: the current repo, no -R
  calls.length = 0;
  assert.throws(() => newIssue(gh, null, { title: '同名', body: GOOD_BODY }), /#5/);
  assert.ok(calls.every((c) => !c.includes('-R')));
  assert.throws(() => newIssue(gh, null, { title: 'x', body: GOOD_BODY, repo: 'plugin' }), /owner\/name/);
});

test('in a Linear project new is refused, except with --repo, which names a GitHub repository itself', () => {
  const docs = docsWith({}, '# Issue tracker：Linear\n');
  const calls = [];
  const gh = (args) => {
    calls.push(args);
    return args[0] === 'api' ? '[]' : 'https://github.com/plugin/repo/issues/4\n';
  };
  assert.throws(() => cli(gh, ['new', docs, '标题', fileWith(GOOD_BODY)]), /Linear/);
  assert.equal(calls.length, 0);
  assert.deepEqual(cli(gh, ['new', docs, '标题', fileWith(GOOD_BODY), '--repo=plugin/repo']), ['4']);
});

test('the command line: new --repo passes the repository on', () => {
  const docs = docsWith();
  const calls = [];
  const gh = (args) => {
    calls.push(args);
    return args[0] === 'api' ? '[]' : 'https://github.com/plugin/repo/issues/4\n';
  };
  assert.deepEqual(cli(gh, ['new', docs, '插件里的问题', fileWith(GOOD_BODY), '--repo=plugin/repo']), ['4']);
  assert.deepEqual(calls.at(-1).slice(0, 4), ['issue', 'create', '-R', 'plugin/repo']);
});

test('priority replaces the issue\'s priority:* label; none only removes it; nothing to change means no gh edit', () => {
  const issues = { 1: open(1, ['status:todo', 'priority:P2', 'bug']), 2: open(2, ['priority:P0']), 3: open(3, []) };
  const { gh, calls } = fakeGh(issues);
  assert.deepEqual(setPriority(gh, 1, 'P0'), ['priority:P0']);
  assert.deepEqual(issues[1].labels.sort(), ['bug', 'priority:P0', 'status:todo']);
  setPriority(gh, 2, 'none');
  assert.deepEqual(issues[2].labels, []);
  const before = calls.length;
  setPriority(gh, 3, 'none');
  setPriority(gh, 1, 'P0');
  assert.equal(calls.length, before);
  assert.throws(() => setPriority(gh, 1, 'P3'), /P0 \/ P1 \/ P2 \/ none/);
  assert.deepEqual(cli(gh, ['priority', docsWith(), 'P1', '1', '3']), ['#1: priority:P1', '#3: priority:P1']);
  assert.deepEqual(issues[3].labels, ['priority:P1']);
});

test('backlog: open issues without status:*, oldest first, up to the limit; one whose latest comment is triage\'s 还要你补 and that nobody touched since is left out', () => {
  const ask = { body: '🤖 idea-loop：查过了，还要你补：复现步骤', created_at: '2026-10-20T00:00:00Z' };
  const issues = {
    7: open(7, [], { updatedAt: '2026-10-20T00:00:30Z', comments: [ask] }),
    8: open(8, [], { updatedAt: '2026-10-25T00:00:00Z', comments: [ask] }),
    9: open(9, ['type:seo'], { comments: [] }),
    10: open(10, ['status:todo']),
    11: open(11, [], { comments: [{ body: '🤖 idea-loop：已查清：重复了 #3', created_at: '2026-10-20T00:00:00Z' }], updatedAt: '2026-10-20T00:00:00Z' }),
    12: open(12, [], { comments: [{ body: '人写的：还要你补一句也不算', created_at: '2026-10-20T00:00:00Z' }], updatedAt: '2026-10-20T00:00:00Z' }),
    13: open(13, [], { updatedAt: '2026-10-20T00:01:01Z', comments: [ask] }),
    14: open(14, [], { updatedAt: '2026-10-20T00:01:00Z', comments: [ask] }),
    15: open(15, ['status:triage']),
    16: closed(16),
  };
  const { gh, seen } = spied(issues);
  assert.deepEqual(backlog(gh).map((i) => i.number), [8, 9, 11, 12, 13]);
  assert.deepEqual(backlog(gh)[1], { number: 9, title: 'issue 9', labels: ['type:seo'], createdAt: '2026-01-01T00:00:00Z' });
  assert.deepEqual(backlog(gh, 1).map((i) => i.number), [8], 'the skipped #7 does not use up the limit');
  seen.length = 0;
  assert.deepEqual(backlog(gh, 2).map((i) => i.number), [8, 9]);
  const read = seen.filter((a) => /\/comments/.test(a[1] ?? '')).map((a) => a[1].match(/issues\/(\d+)\//)[1]);
  assert.deepEqual([...new Set(read)], ['7', '8', '9'], 'comments are read only for the issues that are candidates');
  assert.deepEqual(JSON.parse(cli(gh, ['backlog', docsWith(), '1']).join('\n')).map((i) => i.number), [8]);
});

test('backlog reads the newest comment even past the first page', () => {
  const many = Array.from({ length: 101 }, (_, k) => ({ body: `c${k}`, created_at: '2026-10-01T00:00:00Z' }));
  many[100] = { body: '🤖 idea-loop：还要你补', created_at: '2026-10-02T00:00:00Z' };
  const { gh } = fakeGh({ 1: open(1, [], { updatedAt: '2026-10-02T00:00:10Z', comments: many }) });
  assert.deepEqual(backlog(gh), []);
});

test('note comments with the AI prefix, once', () => {
  const { gh, calls } = fakeGh({ 4: open(4) });
  noteIssue(gh, 4, '已查清：重复了 #3\n');
  noteIssue(gh, 4, '🤖 idea-loop：还要你补：复现步骤');
  assert.deepEqual(comments(calls, 4), ['🤖 idea-loop：已查清：重复了 #3', '🤖 idea-loop：还要你补：复现步骤']);
  assert.throws(() => noteIssue(gh, 4, '  \n'), /空的/);
  assert.equal(cli(gh, ['note', docsWith(), '4', fileWith('行')]).length, 1);
  assert.equal(comments(calls, 4).at(-1), '🤖 idea-loop：行');
});

test('note returns the comment URL gh prints and shows it, so the triager can hand it back', () => {
  const { gh } = fakeGh({ 4: open(4) });
  const url = noteIssue(gh, 4, '已查清');
  assert.match(url, /^https:\/\/github\.com\/o\/r\/issues\/4#issuecomment-\d+$/);
  const [line] = cli(gh, ['note', docsWith(), '4', fileWith('行')]);
  assert.match(line, /^#4: 已评论 https:\/\/github\.com\/o\/r\/issues\/4#issuecomment-\d+$/);
  // a gh that prints nothing: no URL, still commented
  assert.equal(noteIssue(() => '', 4, 'x'), null);
});

test('labels creates priority:P0 / P1 / P2 and keeps them', () => {
  const { gh, calls } = fakeGh({}, ['priority:P0']);
  const { made, surplus } = ensureLabels(gh, parseTypes(TYPES));
  assert.deepEqual(made.filter((l) => l.startsWith('priority:')), ['priority:P1', 'priority:P2']);
  assert.ok(calls.some((c) => c.includes('priority:P1')));
  assert.ok(!surplus.some((s) => s.name.startsWith('priority:')));
  for (const p of ['P0', 'P1', 'P2']) assert.ok(keptLabels(parseTypes(TYPES)).has(`priority:${p}`));
});

// ---------- closing: close first, label after ----------

test('done and canceled close first and drop the label after; a close that fails leaves the issue as it was, with its label', () => {
  const docs = docsWith();
  const issues = { 2: open(2, ['status:in-review']), 3: open(3, ['status:todo']) };
  const { gh, calls } = fakeGh(issues, [], { 'o/r': [pr(5, 'Refs o/r#2', 'MERGED')] });
  const broken = failing(gh, (a) => a[0] === 'issue' && a[1] === 'close');
  assert.throws(() => setState(broken, docs, 'done', [2]), /gh failed/);
  assert.throws(() => setState(broken, docs, 'canceled', [3], { comment: '不做了' }), /gh failed/);
  assert.ok(!calls.some((c) => c[0] === 'issue' && c[1] === 'edit'), 'gh issue edit was not called');
  assert.equal(issues[2].state, 'OPEN');
  assert.deepEqual(issues[2].labels, ['status:in-review']);
  assert.deepEqual(issues[3].labels, ['status:todo']);
  // the retry works, and closes before it relabels
  setState(gh, docs, 'done', [2]);
  const verbs = calls.map((c) => c[1]);
  assert.ok(verbs.indexOf('close') < verbs.indexOf('edit'));
  assert.deepEqual(issues[2].labels, []);
  assert.equal(issues[2].state, 'CLOSED');
});

test('reconcile closes before it relabels too', () => {
  const issues = { 8: open(8, ['status:in-review']) };
  const { gh, calls } = fakeGh(issues, [], { 'o/r': [pr(1, 'Refs #8', 'MERGED')] });
  assert.throws(() => reconcile(failing(gh, (a) => a[1] === 'close'), docsWith()), /gh failed/);
  assert.deepEqual(issues[8].labels, ['status:in-review']);
  assert.deepEqual(calls, []);
});

test('set done opens its comment with the merged PRs; a --comment follows; closed-unmerged PRs are not listed', () => {
  const docs = docsWith({}, TRACKER_TWO_REPOS);
  const issues = { 4: open(4, ['status:in-review']), 5: open(5, ['status:in-review']) };
  const prs = { 'o/r': [pr(10, 'Refs o/r#4\nRefs o/r#5', 'MERGED'), pr(12, 'Refs o/r#4', 'CLOSED')], 'o/api': [pr(20, 'Refs o/r#4', 'MERGED')] };
  const { gh, calls } = fakeGh(issues, [], prs);
  setState(gh, docs, 'done', [4]);
  assert.deepEqual(comments(calls, 4), ['🤖 idea-loop：合并的 PR：o/r#10、o/api#20。']);
  setState(gh, docs, 'done', [5], { comment: '另见 #9' });
  assert.deepEqual(comments(calls, 5), ['🤖 idea-loop：合并的 PR：o/r#10。另见 #9']);
});

// ---------- Linear projects (spec issue-linear) ----------

const LINEAR_TRACKER = `# Issue tracker：Linear

## 团队

Fish（key \`FA\`），issue 号形如 \`FA-123\`

## 仓库

| 仓库 | 本地路径 | 主分支 | 管什么 |
|---|---|---|---|
| o/r | ~/code/r | main | 知识库、worker |
| o/api | ~/code/api | main | 接口 |
`;

const linearPr = (number, title, body, state = 'OPEN', isDraft = false) => ({ number, title, body, state, isDraft, url: `https://github.com/pr/${number}` });

test('platformOf: a first level-1 heading that names Linear is linear; anything else, and no file, is github', () => {
  assert.equal(platformOf('# Issue tracker：Linear\n\n## 团队\n'), 'linear');
  assert.equal(platformOf('\n# Issue tracker：Linear\n'), 'linear');
  assert.equal(platformOf('# Issue tracker：GitHub\n\n## 仓库\n用 Linear 的人\n'), 'github');
  assert.equal(platformOf('## Linear 小节\n'), 'github');
  assert.equal(platformOf(''), 'github');
  assert.equal(platformOf(TRACKER_TWO_REPOS), 'github');
});

test('in a Linear project the commands that write GitHub are refused, naming Linear and references/linear.md, and gh is never called', () => {
  const docs = docsWith({}, LINEAR_TRACKER);
  const gh = () => assert.fail('gh was called');
  const body = fileWith(GOOD_BODY);
  const lines = {
    labels: ['labels', docs], type: ['type', docs, '1', 'seo'], set: ['set', docs, 'todo', '1'], candidates: ['candidates', docs],
    reconcile: ['reconcile', docs], migrate: ['migrate', docs], new: ['new', docs, '标题', body], priority: ['priority', docs, 'P0', '1'],
    backlog: ['backlog', docs], note: ['note', docs, '1', body],
  };
  for (const [cmd, argv] of Object.entries(lines)) assert.throws(() => run(argv, { gh, log() {} }), (e) => /Linear/.test(e.message) && /references\/linear\.md/.test(e.message) && e.message.includes(`「${cmd}」`), cmd);
  assert.throws(() => run(['queues', docs, '5'], { gh, log() {} }), /Linear/);
  assert.equal(linearRefusal('set').includes('references/linear.md'), true);
  // what does not touch GitHub issues still works
  assert.deepEqual(cli(gh, ['body', docs, body]), ['正文齐了']);
  assert.deepEqual(JSON.parse(cli(gh, ['queues', docs]).join('\n')).map((q) => q.name), [null]);
});

test('check --from does not read the issue, takes a Linear key, and reads the spec: a 待定 still waits', () => {
  const docs = docsWith({ retry: spec({ issues: '[FA-577]', fork: true }) }, LINEAR_TRACKER);
  const { gh, seen } = spied({});
  assert.throws(() => cli(gh, ['check', docs, 'todo', 'FA-577', '--from=triage']), /FA-577：spec 里还有等人定的.*待定/);
  assert.deepEqual(seen, [], 'no gh call at all');
  writeFileSync(join(docs, 'spec', 'retry', 'retry.md'), spec({ issues: '[FA-577]' }));
  assert.deepEqual(cli(gh, ['check', docs, 'todo', 'FA-577', '--from=triage']), ['FA-577: triage → todo 可以翻']);
  assert.ok(!seen.some((a) => a[0] === 'api'), 'the issue API was not called');
  // a flip the table does not allow, and a state that is not in the machine, are still refused
  assert.throws(() => cli(gh, ['check', docs, 'done', 'FA-577', '--from=todo']), /能翻成/);
  assert.throws(() => cli(gh, ['check', docs, 'todo', 'FA-577', '--from=实现中']), /不在状态机里/);
  assert.throws(() => cli(gh, ['check', docs, 'todo', 'nope', '--from=triage']), /不是 GitHub 的号/);
});

test('check done --from in a Linear project finds the PRs by title [KEY] or a Linear: line in the 仓库 repos, and refuses while one is not merged', () => {
  const docs = docsWith({}, LINEAR_TRACKER);
  const prs = {
    'o/r': [linearPr(1, '[FA-577] 改 worker', '', 'MERGED'), linearPr(2, '[FA-5770] 别的', '', 'OPEN'), linearPr(3, '提到 FA-577 但不是前缀', '没有那一行', 'OPEN')],
    'o/api': [linearPr(4, '接口', '说明\nLinear: FA-577\n', 'OPEN', true), linearPr(5, '接口', 'Linear: FA-57', 'OPEN')],
  };
  const { gh, seen } = spied({}, [], prs);
  assert.throws(() => cli(gh, ['check', docs, 'done', 'FA-577', '--from=in-review']), /还有 PR 没合并：o\/api#4（draft）/);
  prs['o/api'][0].isDraft = false;
  assert.throws(() => cli(gh, ['check', docs, 'done', 'FA-577', '--from=in-review']), /o\/api#4（ready）/);
  prs['o/api'][0].state = 'MERGED';
  assert.deepEqual(cli(gh, ['check', docs, 'done', 'FA-577', '--from=in-review']), ['FA-577: in-review → done 可以翻']);
  assert.ok(seen.every((a) => a[0] === 'pr'), 'only PRs were searched');
  assert.ok(seen.some((a) => a.includes('FA-577 in:title')) && seen.some((a) => a.includes('FA-577 in:body')));
  // no PR at all
  assert.throws(() => cli(gh, ['check', docs, 'done', 'FA-999', '--from=in-review']), /没有 PR 挂在/);
});

test('check in a Linear project without --from is refused, saying --from is needed', () => {
  const docs = docsWith({}, LINEAR_TRACKER);
  const { gh, seen } = spied({});
  assert.throws(() => cli(gh, ['check', docs, 'todo', 'FA-577']), /--from/);
  assert.deepEqual(seen, []);
});

test('a Linear project whose ISSUE_TRACKER.md has no 仓库 section looks for PRs in the repo gh runs in, as the GitHub side does', () => {
  const docs = docsWith({}, '# Issue tracker：Linear\n\n## 团队\n\nFish（key `FA`）\n');
  const prs = { 'o/r': [linearPr(1, '[FA-577] x', '', 'MERGED'), linearPr(2, '[FA-1] y', '', 'OPEN')] };
  const { gh, seen } = spied({}, [], prs);
  assert.deepEqual(cli(gh, ['check', docs, 'done', 'FA-577', '--from=in-review']), ['FA-577: in-review → done 可以翻']);
  assert.ok(seen.some((a) => a[0] === 'repo' && a[1] === 'view'));
  const v = JSON.parse(cli(spied({}, [], prs).gh, ['show', docs, 'FA-577'], { git: () => '' }).join('\n'));
  assert.deepEqual(v.prs.map((p) => [p.repo, p.number, p.state]), [['o/r', 1, 'merged']]);
});

test('check --from in a GitHub project reads no issue either: the PRs are found by Refs in the repo gh runs in', () => {
  const docs = docsWith({});
  const { gh, seen } = spied({}, [], { 'o/r': [pr(1, 'Refs #5', 'MERGED')] });
  assert.deepEqual(cli(gh, ['check', docs, 'done', '5', '--from=in-review']), ['#5: in-review → done 可以翻']);
  assert.ok(!seen.some((a) => a[0] === 'api'));
  // without --from the issue is read, as before
  const { gh: gh2, seen: seen2 } = spied({ 5: open(5, ['status:in-review']) }, [], { 'o/r': [pr(1, 'Refs #5', 'MERGED')] });
  assert.deepEqual(cli(gh2, ['check', docs, 'done', '5']), ['#5: in-review → done 可以翻']);
  assert.ok(seen2.some((a) => a[0] === 'api'));
});

test('refsLinear: a [KEY] title prefix or a whole line Linear: KEY, not a longer key, not a mention', () => {
  assert.equal(refsLinear('[FA-577] x', '', 'FA-577'), true);
  assert.equal(refsLinear(' [fa-577] x', '', 'FA-577'), true);
  assert.equal(refsLinear('x', 'a\nLinear: FA-577\nb', 'FA-577'), true);
  assert.equal(refsLinear('x', 'Linear: FA-577', 'FA-577'), true);
  assert.equal(refsLinear('[FA-5770] x', 'Linear: FA-5771', 'FA-577'), false);
  assert.equal(refsLinear('see [FA-577]', 'also Linear: FA-577 here', 'FA-577'), false);
  assert.equal(refsLinear(null, null, 'FA-577'), false);
});

test('show in a Linear project: state null, the spec, the PRs and the branch of the key', () => {
  const docs = docsWith({ retry: spec({ issues: '[FA-577, 12]' }) }, LINEAR_TRACKER);
  const { gh, seen } = spied({}, [], { 'o/r': [linearPr(1, '[FA-577] x', '', 'OPEN', true)], 'o/api': [linearPr(2, 'y', 'Linear: FA-577', 'MERGED')] });
  const v = JSON.parse(cli(gh, ['show', docs, 'FA-577'], { git: () => 'main\nissue/FA-577-retry\norigin/issue/FA-577-retry\n' }).join('\n'));
  assert.equal(v.state, null);
  assert.equal(v.number, 'FA-577');
  assert.equal(v.spec, 'retry');
  assert.equal(v.branch, 'issue/FA-577-retry');
  assert.deepEqual(v.prs.map((p) => [p.repo, p.number, p.state]), [['o/r', 1, 'draft'], ['o/api', 2, 'merged']]);
  assert.ok(!seen.some((a) => a[0] === 'api'));
});

test('the usage in the header lists exactly the commands the script has; open is gone', () => {
  const head = readFileSync(SCRIPT, 'utf8').split('*/')[0];
  const listed = [...head.matchAll(/node issues\.mjs (\w+)\s/g)].map((m) => m[1]);
  assert.deepEqual([...listed].sort(), [...COMMANDS].sort());
  assert.ok(!COMMANDS.includes('open'));
  assert.throws(() => execFileSync('node', [SCRIPT, 'open', docsWith(), 'retry'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }), /不认识的命令/);
});
