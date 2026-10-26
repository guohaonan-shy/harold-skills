import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  advance, advancePlan, candidates, dropIssue, ensureLabels, handoffIssue, issuesOf, openSpecIssue, parseTypes, queue, queueOf, queues, readTypes, reconcile,
  reconcilePlan, resume, retroBatch, setState, setTypes, stateOf, targetOf, typeSet, unhandoffIssue, withIssues,
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
  const { gh, calls } = fakeGh({ 1: open(1, ['bug', 'Idea']), 2: open(2, ['bug']) }, ['status:验证中', 'bug', 'Idea', 'status:在飞', 'type:seo']);
  const { made, surplus, deleted } = ensureLabels(gh, types);
  assert.equal(made.filter((l) => l.startsWith('status:')).length, 6);
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

test('candidates are 待验证 issues, oldest first, skipping spec issues and issues a spec already lists', () => {
  const docs = docsWith({ a: spec({ issues: '[4]' }) });
  const { gh } = fakeGh({ 5: open(5), 2: open(2), 3: open(3, ['status:验证中']), 4: open(4), 6: { ...open(6), title: 'spec：重试' } });
  assert.deepEqual(candidates(gh, 100, new Set([4])).map((i) => i.number), [2, 5]);
  assert.ok(docs);
});

test('a category marked 独立队列 gets its own queue, cap and sections; its note stays out of the label text', () => {
  const types = parseTypes('## issue 分类\n\n- `bug`：缺陷\n- `seo`：搜索可见性（独立队列，上限 5）\n  - `technical`：技术\n');
  assert.equal(types.parents[1].about, '搜索可见性');
  assert.deepEqual(queues(types), [
    { name: null, cap: 10, sections: ['审核中', '设计中', '实现中'] },
    { name: 'seo', cap: 5, sections: ['seo 审核中', 'seo 设计中', 'seo 实现中'] },
  ]);
  assert.equal(queueOf(types, ['type:seo', 'type:seo/technical']).name, 'seo');
  assert.equal(queueOf(types, ['type:bug']).name, null);
  assert.deepEqual(queues(null).map((q) => q.name), [null]);
});

test('candidates of the main queue skip own-queue issues; --queue takes only those', () => {
  const types = parseTypes('## issue 分类\n\n- `bug`：缺陷\n- `seo`：搜索（独立队列，上限 5）\n');
  const { gh } = fakeGh({ 1: open(1, ['type:seo', 'type:seo/pages']), 2: open(2, ['type:bug']), 3: open(3), 4: open(4, ['type:seo']) });
  assert.deepEqual(candidates(gh, 100, new Set(), { types }).map((i) => i.number), [2, 3]);
  assert.deepEqual(candidates(gh, 100, new Set(), { types, queue: 'seo' }).map((i) => i.number), [1, 4]);
  assert.deepEqual(candidates(gh, 1, new Set(), { types, queue: 'seo' }).map((i) => i.number), [1]);
  assert.throws(() => candidates(gh, 100, new Set(), { types, queue: 'bug' }), /不是独立队列/);
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

test('advancePlan claims the next phase for the session, closes what main settled, and waits for main', () => {
  assert.deepEqual(advancePlan(spec({ issues: '[1]', ui: UI }), [open(1, ['status:审核中'])]), { actions: [{ n: 1, from: '审核中', to: '设计中' }], phase: '设计中' });
  assert.deepEqual(advancePlan(spec({ issues: '[1]', ui: UI, freeze: true }), [open(1, ['status:设计中'])]), { actions: [{ n: 1, from: '设计中', to: '实现中' }], phase: '实现中' });
  assert.deepEqual(advancePlan(spec({ issues: '[1]' }), [open(1, ['status:待实现'])]), { actions: [{ n: 1, from: '待实现', to: '实现中' }], phase: '实现中' });
  assert.deepEqual(advancePlan(spec({ status: '实现中', issues: '[1]' }), [open(1, ['status:实现中'])]), { actions: [], phase: '实现中' });
  assert.deepEqual(advancePlan(spec({ status: '完成', issues: '[1]' }), [open(1, ['status:实现中'])]), { actions: [{ n: 1, from: '实现中', close: 'completed' }], phase: '关闭' });
  assert.deepEqual(advancePlan(spec({ issues: '[1]', verdict: { 1: '不存在' } }), [open(1, ['status:验证中'])]).phase, '关闭');
  assert.throws(() => advancePlan(spec({ status: '审核中', issues: '[1]' }), [open(1, ['status:审核中'])]), /还没有下一段/);
  assert.throws(() => advancePlan(spec({ issues: '[1]' }), [open(1, ['status:搁置'])]), /resume/);
  assert.throws(() => advancePlan(spec({ issues: '[1]', ui: UI }), [open(1, ['status:实现中'])]), /还要设计/);
});

test('advance relabels and closes, and says the next phase', () => {
  const docs = docsWith({ a: spec({ issues: '[1]', ui: UI }), b: spec({ status: '完成', issues: '[2]' }) });
  const issues = { 1: open(1, ['status:验证中', 'type:seo']), 2: open(2, ['status:实现中']) };
  const { gh } = fakeGh(issues);
  assert.deepEqual(advance(gh, docs, 'a'), { done: ['#1: 验证中 → 设计中'], phase: '设计中' });
  assert.deepEqual(issues[1].labels, ['type:seo', 'status:设计中']);
  assert.deepEqual(advance(gh, docs, 'b'), { done: ['#2: 实现中 → 关闭（completed）'], phase: '关闭' });
  assert.equal(issues[2].reason, 'completed');
});

test('candidates skip issues labelled retro, in the main queue and in an own queue', () => {
  const types = parseTypes('## issue 分类\n\n- `bug`：缺陷\n- `seo`：搜索（独立队列，上限 5）\n');
  const { gh } = fakeGh({ 1: open(1, ['retro', 'type:bug']), 2: open(2, ['type:bug']), 3: open(3, ['retro']), 4: open(4), 5: open(5, ['retro', 'type:seo']), 6: open(6, ['type:seo']) });
  assert.deepEqual(candidates(gh, 100, new Set(), { types }).map((i) => i.number), [2, 4]);
  assert.deepEqual(candidates(gh, 100, new Set(), { types, queue: 'seo' }).map((i) => i.number), [6]);
});

const retroIssues = (specs) => Object.fromEntries(specs.map(([n, labels]) => [n, open(n, labels)]));

test('retroBatch takes the parent of the oldest retro issue and its oldest five', () => {
  const ideaLoop = [2, 4, 6, 8, 10, 12, 14].map((n) => [n, ['retro', 'type:idea-loop', 'type:idea-loop/engineering']]);
  const { gh } = fakeGh(retroIssues([[1, ['type:idea-loop']], ...ideaLoop, [5, ['retro', 'type:excalidrawer']], [11, ['retro', 'type:excalidrawer']]]));
  const out = retroBatch(gh);
  assert.equal(out.parent, 'idea-loop');
  assert.deepEqual(out.issues, [2, 4, 6, 8, 10].map((n) => ({ number: n, title: `issue ${n}` })));
  assert.deepEqual(out.unclassified, []);
});

test('retroBatch returns fewer than five when that is all the parent has', () => {
  const { gh } = fakeGh(retroIssues([[7, ['retro', 'type:excalidrawer']], [9, ['retro', 'type:excalidrawer']], [8, ['type:idea-loop']]]));
  const out = retroBatch(gh);
  assert.equal(out.parent, 'excalidrawer');
  assert.deepEqual(out.issues.map((i) => i.number), [7, 9]);
});

test('retroBatch ignores retro issues that already carry a status:* label', () => {
  const { gh } = fakeGh(retroIssues([[1, ['retro', 'type:idea-loop', 'status:实现中']], [2, ['retro', 'type:excalidrawer']], [3, ['retro', 'type:idea-loop']]]));
  const out = retroBatch(gh);
  assert.equal(out.parent, 'excalidrawer');
  assert.deepEqual(out.issues.map((i) => i.number), [2]);
});

test('retroBatch lists retro issues without a parent category apart, and returns no batch when only those are left', () => {
  const { gh } = fakeGh(retroIssues([[1, ['retro']], [4, ['retro', 'type:idea-loop']], [2, ['retro']]]));
  const out = retroBatch(gh);
  assert.deepEqual(out.issues.map((i) => i.number), [4]);
  assert.deepEqual(out.unclassified.map((i) => i.number), [1, 2]);
  const none = retroBatch(fakeGh(retroIssues([[1, ['retro']]])).gh);
  assert.deepEqual(none, { parent: null, issues: [], unclassified: [{ number: 1, title: 'issue 1' }] });
  assert.deepEqual(retroBatch(fakeGh({}).gh), { parent: null, issues: [], unclassified: [] });
});

test('ensureLabels creates retro and does not list it as surplus, whatever the keep-list says', () => {
  const { gh, calls } = fakeGh({ 1: open(1, ['retro']) }, ['retro']);
  assert.ok(!ensureLabels(gh, parseTypes(TYPES)).surplus.some((s) => s.name === 'retro'));
  const fresh = fakeGh({}, []);
  const { made } = ensureLabels(fresh.gh, parseTypes(TYPES));
  assert.ok(made.includes('retro'));
  assert.ok(fresh.calls.some((c) => c.slice(0, 3).join(' ') === 'label create retro'));
  assert.ok(!calls.some((c) => c[2] === 'retro'));
  assert.ok(ensureLabels(fakeGh({}, []).gh, null).made.includes('retro'));
});
