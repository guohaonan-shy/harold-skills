import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  candidates, dropIssue, ensureLabels, handoffIssue, issuesOf, openSpecIssue, queue, reconcile, reconcilePlan, resume, setState, stateOf,
  targetOf, unhandoffIssue, withIssues,
} from './issues.mjs';

const UI = '- 点重试 → 只重跑这一题';

const spec = ({ status = '正式', issues, ui = '不涉及。', freeze = false, verdict } = {}) => `---
type: spec
status: ${status}
summary: 重试不消耗配额
related: []${issues ? `\nissues: ${issues}` : ''}
---

# 重试不消耗配额

## 验证

| issue | 结论 | 证据 |
|---|---|---|
${Object.entries(verdict ?? {}).map(([n, v]) => `| #${n} | ${v} | 复现 |`).join('\n')}

## 实现决策
${freeze ? '\n### 冻结摘要\n- 画布\n' : '\n无分歧。\n'}
### 前端交互
${ui}
`;

function docsWith(specs) {
  const docs = mkdtempSync(join(tmpdir(), 'issues-'));
  for (const [slug, md] of Object.entries(specs)) {
    mkdirSync(join(docs, 'spec', slug), { recursive: true });
    writeFileSync(join(docs, 'spec', slug, `${slug}.md`), md);
  }
  return docs;
}

/** A fake gh over an in-memory set of issues; records every write. */
function fakeGh(issues, labels = []) {
  const calls = [];
  const gh = (args) => {
    const [noun, verb, n] = args;
    if (noun === 'label' && verb === 'list') return JSON.stringify(labels.map((name) => ({ name })));
    if (noun === 'issue' && verb === 'list') {
      const list = Object.values(issues).filter((i) => i.state === 'OPEN');
      return JSON.stringify(list.map((i) => ({ ...i, labels: i.labels.map((name) => ({ name })) })));
    }
    if (noun === 'issue' && verb === 'view') {
      const i = issues[n];
      if (!i) throw Object.assign(new Error('not found'), { stderr: `no issue ${n}` });
      return JSON.stringify({ ...i, labels: i.labels.map((name) => ({ name })) });
    }
    calls.push(args);
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
      const at = (flag) => args[args.indexOf(flag) + 1];
      issues[number] = { number, title: at('--title'), body: at('--body'), state: 'OPEN', labels: [] };
      return `https://github.com/o/r/issues/${number}\n`;
    }
    return '';
  };
  return { gh, calls };
}

const open = (number, labels = []) => ({ number, title: `issue ${number}`, state: 'OPEN', labels });

test('issuesOf / withIssues round-trip, adding the line when it is missing', () => {
  const md = withIssues(spec(), [15, 12, 12]);
  assert.deepEqual(issuesOf(md), [12, 15]);
  assert.deepEqual(issuesOf(withIssues(md, [3])), [3]);
});

test('stateOf: no status label is 待验证', () => {
  assert.equal(stateOf(['bug']), '待验证');
  assert.equal(stateOf(['bug', 'status:设计中']), '设计中');
});

test('ensureLabels creates only the missing status labels', () => {
  const { gh, calls } = fakeGh({}, ['status:验证中', 'bug']);
  const made = ensureLabels(gh);
  assert.equal(made.length, 6);
  assert.ok(!made.includes('status:验证中'));
  assert.ok(!made.includes('status:待验证'));
  assert.equal(calls.length, 6);
});

test('candidates are 待验证 issues, oldest first, skipping spec issues and issues a spec already lists', () => {
  const docs = docsWith({ a: spec({ issues: '[4]' }) });
  const { gh } = fakeGh({ 5: open(5), 2: open(2), 3: open(3, ['status:验证中']), 4: open(4), 6: { ...open(6), title: 'spec：重试' } });
  assert.deepEqual(candidates(gh, 100, new Set([4])).map((i) => i.number), [2, 5]);
  assert.ok(docs);
});

test('set does the flips a session or a person makes, and refuses the 待 states reconcile owns', () => {
  const docs = docsWith({ a: spec({ issues: '[1, 2]' }) });
  const issues = { 1: open(1, ['status:待实现']), 2: open(2, ['status:待实现']), 3: open(3), 4: open(4, ['status:验证中']) };
  const { gh } = fakeGh(issues);
  assert.deepEqual(setState(gh, docs, '验证中', ['3']), ['#3: 待验证 → 验证中']);
  assert.deepEqual(issues[3].labels, ['status:验证中']);
  assert.deepEqual(setState(gh, docs, '实现中', ['a']), ['#1: 待实现 → 实现中', '#2: 待实现 → 实现中']);
  assert.deepEqual(setState(gh, docs, '待实现', ['a']), ['#1: 实现中 → 待实现', '#2: 实现中 → 待实现']);
  assert.throws(() => setState(gh, docs, '待设计', ['4']), /只由 reconcile/);
  assert.deepEqual(setState(gh, docs, '搁置', ['4']), ['#4: 验证中 → 搁置']);
  assert.throws(() => setState(gh, docs, '验证中', ['4']), /不能翻成/);
  assert.deepEqual(setState(gh, docs, '待验证', ['3']), ['#3: 验证中 → 待验证']);
  assert.deepEqual(issues[3].labels, []);
});

test('targetOf reads the spec on main: verdict, status, UI and freeze', () => {
  assert.equal(targetOf(spec({ status: '草稿' }), 1), null);
  assert.deepEqual(targetOf(spec({ verdict: { 1: '不存在' } }), 1), { close: 'not planned' });
  assert.deepEqual(targetOf(spec({ status: '完成' }), 1), { close: 'completed' });
  assert.deepEqual(targetOf(spec({ ui: UI }), 1), { state: '待设计' });
  assert.deepEqual(targetOf(spec({ ui: UI, freeze: true }), 1), { state: '待实现' });
  assert.deepEqual(targetOf(spec(), 1), { state: '待实现' });
});

test('reconcilePlan moves only finished or unstarted work, and leaves 搁置 and running sessions alone', () => {
  const specs = [
    { slug: 'a', md: spec({ issues: '[1, 2, 3]', ui: UI, verdict: { 1: '存在', 2: '存在', 3: '不存在' } }) },
    { slug: 'b', md: spec({ issues: '[4, 5]', ui: UI, freeze: true }) },
    { slug: 'c', md: spec({ status: '完成', issues: '[6]' }) },
    { slug: 'd', md: spec({ issues: '[7, 8]' }) },
  ];
  const issues = [
    open(1, ['status:验证中']), open(2, ['status:搁置']), open(3, ['status:审核中']),
    open(4, ['status:设计中']), open(5, ['status:实现中']),
    open(6, ['status:实现中']),
    open(7), open(8, ['status:在飞']),
    open(9, ['status:待实现']),
  ];
  const { actions, problems } = reconcilePlan(specs, issues);
  assert.deepEqual(actions, [
    { n: 1, slug: 'a', from: '验证中', to: '待设计' },
    { n: 3, slug: 'a', close: 'not planned', from: '审核中' },
    { n: 4, slug: 'b', from: '设计中', to: '待实现' },
    { n: 6, slug: 'c', close: 'completed', from: '实现中' },
    { n: 7, slug: 'd', from: '待验证', to: '待实现' },
  ]);
  assert.equal(problems.length, 2);
  assert.match(problems[0], /#8 的 label「在飞」/);
  assert.match(problems[1], /#9 是「待实现」，但主分支上没有 spec/);
});

test('reconcile relabels and closes with a comment pointing at the spec', () => {
  const docs = docsWith({
    a: spec({ issues: '[1, 2]', verdict: { 1: '存在', 2: '不存在' } }),
    b: spec({ status: '完成', issues: '[3]' }),
  });
  const issues = { 1: open(1, ['status:验证中']), 2: open(2, ['status:验证中']), 3: open(3, ['status:实现中']) };
  const { gh, calls } = fakeGh(issues);
  const { done, problems } = reconcile(gh, docs);
  assert.deepEqual(done, ['#1: 验证中 → 待实现', '#2: 验证中 → 关闭（not planned）', '#3: 实现中 → 关闭（completed）']);
  assert.deepEqual(problems, []);
  assert.deepEqual(issues[1].labels, ['status:待实现']);
  assert.equal(issues[2].reason, 'not planned');
  assert.deepEqual(issues[2].labels, []);
  assert.equal(issues[3].reason, 'completed');
  assert.ok(calls.some((c) => c[1] === 'close' && c.join(' ').includes('docs/spec/a/a.md')));
});

test('queue lists the specs waiting in a state, oldest issue first, and reports a label main does not back', () => {
  const docs = docsWith({ b: spec({ issues: '[5, 6]' }), a: spec({ issues: '[3]' }), c: spec({ status: '实现中', issues: '[8]' }) });
  const { gh } = fakeGh({ 6: open(6, ['status:待实现']), 3: open(3, ['status:待实现']), 5: open(5, ['status:待实现']), 8: open(8, ['status:待实现']), 9: open(9, ['status:待实现']) });
  const { specs, problems } = queue(gh, docs, '待实现');
  assert.deepEqual(specs, [{ slug: 'a', issues: [3] }, { slug: 'b', issues: [5, 6] }]);
  assert.equal(problems.length, 2);
  assert.throws(() => queue(gh, docs, '待验证'), /candidates/);
});

test('resume puts a parked issue where main says it belongs', () => {
  const docs = docsWith({ a: spec({ issues: '[1]', ui: UI }), b: spec({ status: '完成', issues: '[2]' }) });
  const issues = { 1: open(1, ['status:搁置']), 2: open(2, ['status:搁置']), 3: open(3, ['status:搁置']), 4: open(4) };
  const { gh } = fakeGh(issues);
  assert.deepEqual(resume(gh, docs, ['1', '2', '3']), ['#1: 搁置 → 待设计', '#2: 搁置 → 关闭（completed）', '#3: 搁置 → 待验证']);
  assert.deepEqual(issues[1].labels, ['status:待设计']);
  assert.equal(issues[2].state, 'CLOSED');
  assert.deepEqual(issues[3].labels, []);
  assert.throws(() => resume(gh, docs, ['4']), /不是「搁置」/);
});

test('handoff writes the frontmatter only, accepts a claimed issue, and refuses one further along, closed or double-listed', () => {
  const docs = docsWith({ a: spec({ status: '草稿' }), b: spec({ issues: '[4]' }) });
  const { gh, calls } = fakeGh({ 1: open(1, ['status:验证中']), 2: open(2, ['status:待实现']), 3: { ...open(3), state: 'CLOSED' }, 4: open(4) });
  handoffIssue(gh, docs, 'a', 1);
  assert.deepEqual(issuesOf(readFileSync(join(docs, 'spec/a/a.md'), 'utf8')), [1]);
  assert.equal(calls.length, 0);
  assert.throws(() => handoffIssue(gh, docs, 'a', 2), /待实现/);
  assert.throws(() => handoffIssue(gh, docs, 'a', 3), /CLOSED/);
  assert.throws(() => handoffIssue(gh, docs, 'a', 4), /\[\[b\]\]/);
});

test('open gives a spec that covers no issue an unlabelled spec issue', () => {
  const docs = docsWith({ a: spec({ status: '草稿' }), b: spec({ issues: '[1]' }) });
  const issues = { 1: open(1) };
  const { gh } = fakeGh(issues);
  assert.equal(openSpecIssue(gh, docs, 'a'), 2);
  assert.equal(openSpecIssue(gh, docs, 'b'), null);
  assert.equal(issues[2].title, 'spec：重试不消耗配额');
  assert.deepEqual(issues[2].labels, []);
  assert.match(issues[2].body, /docs\/spec\/a\/a\.md/);
  assert.deepEqual(issuesOf(readFileSync(join(docs, 'spec/a/a.md'), 'utf8')), [2]);
});

test('unhandoff returns the issue to 待验证; drop closes it as not planned', () => {
  const docs = docsWith({ a: spec({ status: '审核中', issues: '[1, 2]' }) });
  const issues = { 1: open(1, ['status:审核中']), 2: open(2, ['status:审核中']) };
  const { gh, calls } = fakeGh(issues);
  unhandoffIssue(gh, docs, 'a', 1);
  assert.deepEqual(issues[1].labels, []);
  assert.equal(issues[1].state, 'OPEN');
  dropIssue(gh, docs, 'a', 2);
  assert.equal(issues[2].reason, 'not planned');
  assert.ok(calls.some((c) => c[1] === 'comment'));
  assert.deepEqual(issuesOf(readFileSync(join(docs, 'spec/a/a.md'), 'utf8')), []);
  assert.throws(() => unhandoffIssue(gh, docs, 'a', 1), /不在/);
});
