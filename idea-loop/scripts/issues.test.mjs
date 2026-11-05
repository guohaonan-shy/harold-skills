import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  KINDS, NEXT, STATES, candidates, checkState, ensureLabels, issuesOf, keptLabels, migrate, migratePlan, openSpecIssue, parseRepos, parseTypes, prState, queueOf, queues,
  readTypes, reconcile, reconcilePlan, refsIssue, setState, setTypes, show, skipsTriage, stateOf, transitionError, typeSet, withIssues, withoutStatus,
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
 */
function fakeGh(issues, labels = [], prs = {}) {
  const calls = [];
  const rest = (i) => ({
    number: i.number,
    id: 1000 + i.number,
    title: i.title,
    body: i.body ?? '',
    state: i.state === 'OPEN' ? 'open' : 'closed',
    state_reason: i.state === 'OPEN' ? null : i.reason ?? 'completed',
    labels: i.labels.map((name) => ({ name })),
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
      let m = path.match(/^issues\/(\d+)$/);
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
    if (noun === 'issue' && verb === 'edit') {
      for (let k = 3; k < args.length; k += 2) {
        if (args[k] === '--add-label') issues[n].labels.push(args[k + 1]);
        if (args[k] === '--remove-label') issues[n].labels = issues[n].labels.filter((l) => l !== args[k + 1]);
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
    return '';
  };
  return { gh, calls };
}

const open = (number, labels = [], extra = {}) => ({ number, title: `issue ${number}`, state: 'OPEN', labels, ...extra });
const closed = (number, extra = {}) => ({ number, title: `issue ${number}`, state: 'CLOSED', labels: [], ...extra });
const comments = (calls, n) => calls.filter((c) => (c[1] === 'comment' && c[2] === String(n)) || (c[1] === 'close' && c[2] === String(n))).map((c) => c[c.length - 1]);
const writes = (calls) => calls.filter((c) => c[0] === 'issue' || c[0] === 'label' || c[0] === 'api');
const pr = (number, body, state = 'OPEN', isDraft = false) => ({ number, body, state, isDraft, url: `https://github.com/pr/${number}` });

test('issuesOf / withIssues round-trip, adding the line when it is missing', () => {
  const md = withIssues(spec(), [15, 12, 12]);
  assert.deepEqual(issuesOf(md), [12, 15]);
  assert.deepEqual(issuesOf(withIssues(md, [3])), [3]);
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

test('open gives a spec that covers no issue a spec issue in status:todo', () => {
  const docs = docsWith({ retry: spec() });
  const issues = {};
  const { gh } = fakeGh(issues);
  assert.equal(openSpecIssue(gh, docs, 'retry'), 1);
  assert.deepEqual(issues[1].labels, ['status:todo']);
  assert.match(issues[1].title, /^spec：/);
  assert.deepEqual(issuesOf(readFileSync(join(docs, 'spec', 'retry', 'retry.md'), 'utf8')), [1]);
  assert.equal(openSpecIssue(gh, docs, 'retry'), null);
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
