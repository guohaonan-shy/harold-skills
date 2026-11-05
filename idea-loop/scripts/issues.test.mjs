import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  NEXT, STATES, block, candidates, ensureLabels, issuesOf, openSpecIssue, parseTypes, queueOf, queues, readTypes, reconcile, reconcilePlan,
  setState, setTypes, show, split, stateOf, transitionError, typeSet, withIssues,
} from './issues.mjs';

const UI = '- 点重试 → 只重跑这一题';

const spec = ({ issues, ui, freeze = false, grill = false, fork = false } = {}) => `---
type: spec
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

function docsWith(specs = {}) {
  const docs = mkdtempSync(join(tmpdir(), 'issues-'));
  for (const [slug, md] of Object.entries(specs)) {
    mkdirSync(join(docs, 'spec', slug), { recursive: true });
    writeFileSync(join(docs, 'spec', slug, `${slug}.md`), md);
  }
  return docs;
}

/**
 * A fake gh over an in-memory set of issues, answering the REST reads the script makes and recording every
 * write. An issue: { number, title, state: 'OPEN' | 'CLOSED', labels, parent?, blockedBy?: [n], milestone?, pull? }.
 */
function fakeGh(issues, labels = [], milestones = {}) {
  const calls = [];
  const rest = (i) => ({
    number: i.number,
    id: 1000 + i.number,
    title: i.title,
    state: i.state === 'OPEN' ? 'open' : 'closed',
    labels: i.labels.map((name) => ({ name })),
    milestone: i.milestone ? { number: i.milestone } : null,
    parent_issue_url: i.parent ? `https://api.github.com/repos/o/r/issues/${i.parent}` : null,
    sub_issues_summary: { total: Object.values(issues).filter((c) => c.parent === i.number).length, completed: 0, percent_completed: 0 },
    issue_dependencies_summary: {
      blocked_by: (i.blockedBy ?? []).filter((b) => issues[b]?.state === 'OPEN').length,
      total_blocked_by: (i.blockedBy ?? []).length,
      blocking: 0,
      total_blocking: 0,
    },
    ...(i.pull ? { pull_request: {} } : {}),
  });
  const byId = (id) => Object.values(issues).find((i) => 1000 + i.number === Number(id));
  const gh = (args) => {
    const [noun, verb, n] = args;
    if (noun === 'label' && verb === 'list') return JSON.stringify(labels.map((name) => ({ name })));
    if (noun === 'issue' && verb === 'view') return JSON.stringify({ labels: issues[n].labels.map((name) => ({ name })) });
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
      if (m) return JSON.stringify(Object.values(issues).filter((c) => c.parent === Number(m[1])).map(rest));
      m = path.match(/^issues\/(\d+)\/dependencies\/blocked_by$/);
      if (m) return JSON.stringify((issues[m[1]].blockedBy ?? []).map((b) => rest(issues[b])));
      m = path.match(/^milestones\/(\d+)$/);
      if (m) return JSON.stringify({ number: Number(m[1]), title: milestones[m[1]] });
      throw new Error(`fake gh: no route for ${path}`);
    }
    calls.push(args);
    if (noun === 'api') {
      const path = args[3];
      const field = args[5];
      let m = path.match(/issues\/(\d+)\/sub_issues$/);
      if (m) byId(field.split('=')[1]).parent = Number(m[1]);
      m = path.match(/issues\/(\d+)\/dependencies\/blocked_by$/);
      if (m) issues[m[1]].blockedBy = [...(issues[m[1]].blockedBy ?? []), byId(field.split('=')[1]).number];
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
      issues[n].reason = args[args.indexOf('--reason') + 1];
    }
    if (noun === 'issue' && verb === 'create') {
      const number = Math.max(0, ...Object.keys(issues).map(Number)) + 1;
      const all = (flag) => args.flatMap((a, k) => (a === flag ? [args[k + 1]] : []));
      issues[number] = { number, title: all('--title')[0], body: all('--body')[0], state: 'OPEN', labels: all('--label'), milestoneTitle: all('--milestone')[0] };
      return `https://github.com/o/r/issues/${number}\n`;
    }
    return '';
  };
  return { gh, calls };
}

const open = (number, labels = [], extra = {}) => ({ number, title: `issue ${number}`, state: 'OPEN', labels, ...extra });
const closed = (number, labels = [], extra = {}) => ({ ...open(number, labels, extra), state: 'CLOSED' });
const comments = (calls, n) => calls.filter((c) => (c[1] === 'comment' && c[2] === String(n)) || (c[1] === 'close' && c[2] === String(n))).map((c) => c[c.length - 1]);

test('issuesOf / withIssues round-trip, adding the line when it is missing', () => {
  const md = withIssues(spec(), [15, 12, 12]);
  assert.deepEqual(issuesOf(md), [12, 15]);
  assert.deepEqual(issuesOf(withIssues(md, [3])), [3]);
});

test('nine states; no status label is backlog; two labels are reported as such', () => {
  assert.deepEqual(STATES, ['backlog', 'todo', 'spec', 'design', 'implement', 'review', 'blocked', 'done', 'canceled']);
  assert.equal(stateOf(['bug']), 'backlog');
  assert.equal(stateOf(['bug', 'status:design']), 'design');
  assert.equal(stateOf(['status:spec', 'status:todo']), 'spec + todo');
  assert.deepEqual(NEXT.done, []);
  assert.deepEqual(NEXT.canceled, []);
});

test('the flips sessions make pass; skipping ahead or reopening is refused with the choices', () => {
  const ok = [['backlog', 'todo'], ['todo', 'spec'], ['todo', 'implement'], ['spec', 'implement'], ['implement', 'review'], ['review', 'done'], ['implement', 'done'], ['review', 'implement'], ['blocked', 'todo'], ['spec', 'canceled']];
  for (const [from, to] of ok) assert.equal(transitionError(from, to, spec()), null, `${from} → ${to}`);
  assert.match(transitionError('backlog', 'implement', spec()), /能翻成：todo \/ blocked \/ canceled/);
  assert.match(transitionError('done', 'todo', spec()), /能翻成：无/);
  assert.match(transitionError('todo', '待验证', spec()), /不是 issue 的状态/);
  assert.match(transitionError('实现中', 'review', spec()), /先迁移/);
  assert.match(transitionError('spec', 'spec', spec()), /已经是/);
});

test('parking and blocked need a comment saying where the work stopped or what it waits for', () => {
  assert.match(transitionError('implement', 'backlog', spec()), /停在哪个阶段、分支/);
  assert.match(transitionError('spec', 'blocked', spec()), /等什么/);
  assert.equal(transitionError('implement', 'backlog', spec(), { comment: '停在 implement，分支 impl/retry' }), null);
});

test('leaving spec needs a spec with nothing left for a human; design needs UI; implement on UI needs the freeze or --skip-design', () => {
  assert.match(transitionError('spec', 'implement', null), /没有 spec/);
  assert.match(transitionError('spec', 'implement', spec({ grill: true })), /需要 grill/);
  assert.match(transitionError('spec', 'design', spec({ fork: true })), /待定/);
  assert.match(transitionError('spec', 'design', spec()), /不碰 UI/);
  assert.equal(transitionError('spec', 'design', spec({ ui: UI })), null);
  assert.match(transitionError('spec', 'implement', spec({ ui: UI })), /冻结摘要.*--skip-design/);
  assert.equal(transitionError('spec', 'implement', spec({ ui: UI }), { skipDesign: true }), null);
  assert.equal(transitionError('design', 'implement', spec({ ui: UI, freeze: true })), null);
  assert.match(transitionError('todo', 'implement', spec({ ui: UI })), /冻结摘要/);
});

test('set relabels, comments with the AI prefix, and closes done and canceled with their reason', () => {
  const docs = docsWith({ retry: spec({ issues: '[1]' }) });
  const issues = { 1: open(1, ['status:spec', 'type:bug']), 2: open(2, ['status:review']), 3: open(3, ['status:todo']) };
  const { gh, calls } = fakeGh(issues);
  assert.deepEqual(setState(gh, docs, 'implement', [1]), ['#1: spec → implement']);
  assert.deepEqual(issues[1].labels.sort(), ['status:implement', 'type:bug']);
  setState(gh, docs, 'done', [2]);
  assert.equal(issues[2].state, 'CLOSED');
  assert.equal(issues[2].reason, 'completed');
  assert.ok(issues[2].labels.includes('status:done'));
  setState(gh, docs, 'backlog', [3], { comment: '先放着：等 0.2.x' });
  assert.deepEqual(comments(calls, 3), ['🤖 idea-loop：先放着：等 0.2.x']);
});

test('set checks every flip before making any', () => {
  const docs = docsWith();
  const issues = { 1: open(1, ['status:todo']), 2: open(2, ['status:backlog']) };
  const { gh, calls } = fakeGh(issues);
  assert.throws(() => setState(gh, docs, 'spec', [1, 2]), /#2：「backlog」不能翻成「spec」/);
  assert.equal(calls.length, 0);
});

test('a sub-issue is checked against its parent\'s spec', () => {
  const docs = docsWith({ retry: spec({ issues: '[10]', ui: UI }) });
  const issues = { 10: open(10, ['status:implement']), 11: open(11, ['status:todo'], { parent: 10 }) };
  const { gh } = fakeGh(issues);
  assert.throws(() => setState(gh, docs, 'implement', [11]), /冻结摘要/);
  writeFileSync(join(docs, 'spec', 'retry', 'retry.md'), spec({ issues: '[10]', ui: UI, freeze: true }));
  assert.deepEqual(setState(gh, docs, 'implement', [11]), ['#11: todo → implement']);
});

test('split opens a sub-issue in todo with the parent\'s categories, priority and milestone, linked to the parent', () => {
  const issues = { 10: open(10, ['status:spec', 'type:idea-loop', 'type:idea-loop/issues', 'priority:P1', 'Idea'], { milestone: 1 }) };
  const { gh } = fakeGh(issues, [], { 1: 'idea-loop 0.2.0' });
  const n = split(gh, 10, '知识库仓库那一半', '父 spec：issue-model');
  assert.equal(n, 11);
  assert.deepEqual(issues[11].labels.sort(), ['priority:P1', 'status:todo', 'type:idea-loop', 'type:idea-loop/issues']);
  assert.equal(issues[11].milestoneTitle, 'idea-loop 0.2.0');
  assert.equal(issues[11].parent, 10);
});

test('split refuses a sub-issue as parent (two levels only) and a closed parent', () => {
  const { gh } = fakeGh({ 10: open(10), 11: open(11, [], { parent: 10 }), 12: closed(12) });
  assert.throws(() => split(gh, 11, 't', 'b'), /子 issue 不再拆/);
  assert.throws(() => split(gh, 12, 't', 'b'), /已关闭/);
});

test('block records the native blocked-by relation, moves to blocked and says what it waits for', () => {
  const issues = { 1: open(1, ['status:todo']), 2: open(2, ['status:implement']) };
  const { gh, calls } = fakeGh(issues);
  assert.match(block(gh, docsWith(), 1, [2]), /todo → blocked（被 #2 挡着）/);
  assert.deepEqual(issues[1].blockedBy, [2]);
  assert.ok(issues[1].labels.includes('status:blocked'));
  assert.match(comments(calls, 1)[0], /^🤖 idea-loop：被 #2 挡着/);
  assert.throws(() => block(gh, docsWith(), 1, [2]), /不能翻成「blocked」|已经是/);
});

test('candidates are todo issues no open issue blocks, oldest first, sub-issues included', () => {
  const issues = {
    5: open(5, ['status:todo']),
    2: open(2, ['status:todo'], { parent: 9 }),
    3: open(3, ['status:todo'], { blockedBy: [4] }),
    4: open(4, ['status:implement']),
    6: open(6, ['status:todo'], { blockedBy: [7] }),
    7: closed(7, ['status:done']),
    8: open(8),
    9: open(9, ['status:implement']),
  };
  const { gh } = fakeGh(issues);
  assert.deepEqual(candidates(gh).map((i) => [i.number, i.parent]), [[2, 9], [5, null], [6, null]]);
  assert.deepEqual(candidates(gh, 1).map((i) => i.number), [2]);
});

test('reconcilePlan: blocked with every blocker closed → todo; a blocked one with no recorded blocker waits for the human', () => {
  const issues = [open(1, ['status:blocked']), open(2, ['status:blocked']), open(3, ['status:blocked'])].map((i) => ({ ...i, labels: i.labels }));
  const blockers = new Map([[1, [{ number: 8, open: false }, { number: 9, open: false }]], [2, [{ number: 8, open: false }, { number: 7, open: true }]]]);
  const { actions } = reconcilePlan(issues, blockers);
  assert.deepEqual(actions.map((a) => [a.n, a.to]), [[1, 'todo']]);
  assert.match(actions[0].why, /#8、#9 都已关闭/);
});

test('reconcilePlan: a parent whose sub-issues are all closed → done; old labels are problems', () => {
  const issues = [open(10, ['status:implement']), open(20, ['status:review']), open(30, ['status:实现中'])];
  const children = new Map([[10, [{ number: 11, open: false }, { number: 12, open: false }]], [20, [{ number: 21, open: true }]]]);
  const { actions, problems } = reconcilePlan(issues, new Map(), children);
  assert.deepEqual(actions.map((a) => [a.n, a.to]), [[10, 'done']]);
  assert.deepEqual(problems, ['#30 的 label「实现中」不是 issue 的状态（旧状态机留下的就先迁移）']);
});

test('reconcile applies the plan through gh, with a comment saying why', () => {
  const issues = {
    1: open(1, ['status:blocked'], { blockedBy: [2] }),
    2: closed(2, ['status:done']),
    10: open(10, ['status:implement']),
    11: closed(11, ['status:done'], { parent: 10 }),
  };
  const { gh, calls } = fakeGh(issues);
  const { done } = reconcile(gh);
  assert.deepEqual(done, ['#1: blocked → todo（挡着它的 #2 都已关闭）', '#10: implement → done（子 issue #11 都已关闭）']);
  assert.ok(issues[1].labels.includes('status:todo'));
  assert.equal(issues[10].state, 'CLOSED');
  assert.equal(issues[10].reason, 'completed');
  assert.match(comments(calls, 10)[0], /^🤖 idea-loop：子 issue #11 都已关闭/);
});

test('show says what kind of issue it is, where it is, and which spec covers it', () => {
  const docs = docsWith({ retry: spec({ issues: '[10]' }) });
  const issues = { 10: open(10, ['status:implement'], { milestone: 1 }), 11: open(11, ['status:review'], { parent: 10 }), 12: open(12, ['status:todo'], { parent: 10, blockedBy: [11] }), 13: open(13) };
  const { gh } = fakeGh(issues);
  const parent = show(gh, docs, 10);
  assert.equal(parent.kind, 'parent');
  assert.equal(parent.spec, 'retry');
  assert.equal(parent.milestone, 1);
  assert.deepEqual(parent.subIssues.map((s) => [s.number, s.state]), [[11, 'review'], [12, 'todo']]);
  const child = show(gh, docs, 12);
  assert.equal(child.kind, 'sub-issue');
  assert.equal(child.spec, 'retry');
  assert.deepEqual(child.blockedBy, [{ number: 11, title: 'issue 11', open: true }]);
  assert.equal(show(gh, docs, 13).kind, 'single');
  assert.equal(show(gh, docs, 13).state, 'backlog');
});

test('open gives a spec that covers no issue a spec issue in status:spec', () => {
  const docs = docsWith({ retry: spec() });
  const issues = {};
  const { gh } = fakeGh(issues);
  assert.equal(openSpecIssue(gh, docs, 'retry'), 1);
  assert.deepEqual(issues[1].labels, ['status:spec']);
  assert.match(issues[1].title, /^spec：/);
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

test('ensureLabels creates the missing status and type labels and lists the rest with their use', () => {
  const types = parseTypes(TYPES);
  const { gh, calls } = fakeGh({ 1: open(1, ['bug', 'Idea']), 2: open(2, ['bug']) }, ['status:todo', 'bug', 'Idea', 'status:在飞', 'type:seo']);
  const { made, surplus, deleted } = ensureLabels(gh, types);
  assert.equal(made.filter((l) => l.startsWith('status:')).length, 8);
  assert.deepEqual(made.filter((l) => l.startsWith('type:')), ['type:billing', 'type:seo/backlink', 'type:seo/blog', 'type:uiux']);
  assert.deepEqual(surplus, [{ name: 'bug', openIssues: 2 }, { name: 'status:在飞', openIssues: 0 }]);
  assert.deepEqual(deleted, []);
  assert.ok(calls.every((c) => c[1] === 'create'));
});

test('ensureLabels --prune deletes the surplus, and refuses without categories', () => {
  const { gh, calls } = fakeGh({}, ['bug', 'Idea']);
  assert.deepEqual(ensureLabels(gh, parseTypes(TYPES), { prune: true }).deleted, ['bug']);
  assert.ok(calls.some((c) => c.join(' ') === 'label delete bug --yes'));
  assert.throws(() => ensureLabels(gh, null, { prune: true }), /不清理/);
  assert.deepEqual(ensureLabels(gh, null).surplus, []);
});

test('setTypes replaces the issue\'s type labels and leaves the rest', () => {
  const issues = { 1: open(1, ['status:验证中', 'type:billing', 'Idea']) };
  const { gh } = fakeGh(issues);
  setTypes(gh, parseTypes(TYPES), 1, ['seo/blog']);
  assert.deepEqual(issues[1].labels.sort(), ['Idea', 'status:验证中', 'type:seo', 'type:seo/blog']);
});


test('a category marked 独立队列 gets its own queue, cap and sections; its note stays out of the label text', () => {
  const types = parseTypes('## issue 分类\n\n- `bug`：缺陷\n- `seo`：搜索可见性（独立队列，上限 5）\n  - `technical`：技术\n');
  assert.equal(types.parents[1].about, '搜索可见性');
  assert.deepEqual(queues(types), [
    { name: null, cap: 10, sections: ['spec', 'design', 'implement', 'review'] },
    { name: 'seo', cap: 5, sections: ['seo spec', 'seo design', 'seo implement', 'seo review'] },
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
