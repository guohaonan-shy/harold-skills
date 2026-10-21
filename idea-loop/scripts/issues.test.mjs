import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  candidates, dropIssue, publishSpec, listedIssues, ensureLabels, handoffIssue, issuesOf, labelPlan, resolveIssues, syncIssues, unhandoffIssue, withIssues,
} from './issues.mjs';

const spec = ({ status = '草稿', issues } = {}) => `---
type: spec
status: ${status}
summary: 重试不消耗配额
related: []${issues ? `\nissues: ${issues}` : ''}
---

# 重试不消耗配额
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
    if (noun === 'issue' && verb === 'list') return JSON.stringify(Object.values(issues).map((i) => ({ ...i, labels: i.labels.map((name) => ({ name })) })));
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
    if (noun === 'issue' && verb === 'close') issues[n].state = 'CLOSED';
    if (noun === 'issue' && verb === 'create') {
      const number = Math.max(0, ...Object.keys(issues).map(Number)) + 1;
      const at = (flag) => args[args.indexOf(flag) + 1];
      issues[number] = { number, title: at('--title'), body: at('--body'), state: 'OPEN', labels: [at('--label')] };
      return `https://github.com/o/r/issues/${number}\n`;
    }
    return '';
  };
  return { gh, calls };
}

const open = (number, labels = []) => ({ number, title: `issue ${number}`, state: 'OPEN', labels });

test('issuesOf / withIssues round-trip, adding the line when it is missing', () => {
  assert.deepEqual(issuesOf(spec()), []);
  assert.deepEqual(issuesOf(spec({ issues: '[12, 15]' })), [12, 15]);
  const md = withIssues(spec(), [15, 12, 12]);
  assert.match(md, /^issues: \[12, 15\]$/m);
  assert.deepEqual(issuesOf(withIssues(md, [3])), [3]);
  assert.match(withIssues(md, [3]), /^---\n[\s\S]*\n---\n\n# 重试/);
});

test('labelPlan keeps exactly one status label and notices the first handoff', () => {
  assert.deepEqual(labelPlan(['bug'], '草稿'), { add: ['status:草稿'], remove: [], first: true });
  assert.deepEqual(labelPlan(['status:草稿', 'bug'], '审核中'), { add: ['status:审核中'], remove: ['status:草稿'], first: false });
  assert.deepEqual(labelPlan(['status:在飞'], '在飞'), { add: [], remove: [], first: false });
});

test('ensureLabels creates only the missing status labels', () => {
  const { gh, calls } = fakeGh({}, ['status:草稿', 'bug']);
  const made = ensureLabels(gh);
  assert.ok(!made.includes('status:草稿'));
  assert.ok(made.includes('status:搁置'));
  assert.equal(calls.length, made.length);
});

test('candidates are open issues with no status label, oldest first', () => {
  const { gh } = fakeGh({ 9: open(9), 3: open(3, ['bug']), 5: open(5, ['status:搁置']), 7: open(7, ['status:审核中']) });
  assert.deepEqual(candidates(gh).map((i) => i.number), [3, 9]);
  assert.deepEqual(candidates(gh, 1).map((i) => i.number), [3]);
});

test('candidates skip issues a spec still lists, e.g. taken off on a review branch not merged yet', () => {
  const docs = docsWith({ a: spec({ issues: '[3]' }), b: spec() });
  const { gh } = fakeGh({ 3: open(3), 9: open(9) });
  assert.deepEqual([...listedIssues(docs)], [3]);
  assert.deepEqual(candidates(gh, 100, listedIssues(docs)).map((i) => i.number), [9]);
});

test('handoff writes the frontmatter only, and refuses taken, closed or double-listed issues', () => {
  const docs = docsWith({ a: spec(), b: spec({ issues: '[4]' }) });
  const { gh, calls } = fakeGh({ 1: open(1), 2: open(2, ['status:搁置']), 3: { ...open(3), state: 'CLOSED' }, 4: open(4) });
  handoffIssue(gh, docs, 'a', 1);
  handoffIssue(gh, docs, 'a', 1);
  assert.deepEqual(issuesOf(readFileSync(join(docs, 'spec/a/a.md'), 'utf8')), [1]);
  assert.equal(calls.length, 0);
  assert.throws(() => handoffIssue(gh, docs, 'a', 2), /status:搁置/);
  assert.throws(() => handoffIssue(gh, docs, 'a', 3), /CLOSED/);
  assert.throws(() => handoffIssue(gh, docs, 'a', 4), /\[\[b\]\]/);
});

test('publish opens an issue for a spec that lists none, labelled with its status, and writes the number back', () => {
  const docs = docsWith({ a: spec({ status: '审核中' }) });
  const issues = { 1: open(1) };
  const { gh } = fakeGh(issues, ['status:审核中']);
  assert.deepEqual(publishSpec(gh, docs, 'a', 'feat/retry'), ['#2 ← spec a（status:审核中）']);
  assert.equal(issues[2].title, 'spec：重试不消耗配额');
  assert.deepEqual(issues[2].labels, ['status:审核中']);
  assert.match(issues[2].body, /docs\/spec\/a\/a\.md`，分支 `feat\/retry`/);
  assert.deepEqual(issuesOf(readFileSync(join(docs, 'spec/a/a.md'), 'utf8')), [2]);
});

test('publish syncs the issues a spec already lists instead of opening one', () => {
  const docs = docsWith({ a: spec({ status: '草稿', issues: '[1]' }) });
  const issues = { 1: open(1) };
  const { gh, calls } = fakeGh(issues, ['status:草稿']);
  assert.deepEqual(publishSpec(gh, docs, 'a', 'main'), ['#1 → status:草稿']);
  assert.deepEqual(issues[1].labels, ['status:草稿']);
  assert.equal(calls.filter((c) => c[1] === 'create').length, 0);
  assert.deepEqual(publishSpec(gh, docs, 'a', 'main'), ['#1 → status:草稿']);
  assert.equal(calls.filter((c) => c[1] === 'comment').length, 1);
});

test('sync projects the spec status onto every listed issue, commenting only the first time', () => {
  const docs = docsWith({ a: spec({ status: '审核中', issues: '[1, 2]' }) });
  const issues = { 1: open(1), 2: open(2, ['status:草稿']) };
  const { gh, calls } = fakeGh(issues);
  assert.deepEqual(syncIssues(gh, docs, 'a'), ['#1 → status:审核中', '#2 → status:审核中']);
  assert.deepEqual(issues[1].labels, ['status:审核中']);
  assert.deepEqual(issues[2].labels, ['status:审核中']);
  assert.equal(calls.filter((c) => c[1] === 'comment').length, 1);
});

test('unhandoff returns the issue to 待办; drop closes it as not planned', () => {
  const docs = docsWith({ a: spec({ status: '审核中', issues: '[1, 2]' }) });
  const issues = { 1: open(1, ['status:审核中']), 2: open(2, ['status:审核中']) };
  const { gh, calls } = fakeGh(issues);
  unhandoffIssue(gh, docs, 'a', 1);
  assert.deepEqual(issues[1].labels, []);
  assert.equal(issues[1].state, 'OPEN');
  dropIssue(gh, docs, 'a', 2);
  assert.equal(issues[2].state, 'CLOSED');
  assert.ok(calls.some((c) => c[1] === 'close' && c.includes('not planned')));
  assert.deepEqual(issuesOf(readFileSync(join(docs, 'spec/a/a.md'), 'utf8')), []);
  assert.throws(() => unhandoffIssue(gh, docs, 'a', 1), /不在/);
});

test('resolve closes every listed issue as completed and clears its label, skipping ones already closed', () => {
  const docs = docsWith({ a: spec({ status: '在飞', issues: '[1, 2]' }) });
  const issues = { 1: open(1, ['status:在飞']), 2: { ...open(2, ['status:在飞']), state: 'CLOSED' } };
  const { gh, calls } = fakeGh(issues);
  assert.deepEqual(resolveIssues(gh, docs, 'a', 77), ['#1', '#2']);
  assert.equal(issues[1].state, 'CLOSED');
  assert.deepEqual(issues[1].labels, []);
  assert.deepEqual(issues[2].labels, []);
  assert.equal(calls.filter((c) => c[1] === 'close').length, 1);
  assert.ok(calls.some((c) => c[1] === 'close' && c.includes('completed')));
});
