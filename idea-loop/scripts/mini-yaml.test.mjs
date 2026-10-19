import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseYaml, splitFrontmatter } from './mini-yaml.mjs';

test('scalars, flow lists and flow maps', () => {
  const v = parseYaml(`type: design-state
tags: [idea, "a, b"]
n: 12
ok: true
nothing:
loc: { role: button, name: 重新加载 }`);
  assert.deepEqual(v, {
    type: 'design-state',
    tags: ['idea', 'a, b'],
    n: 12,
    ok: true,
    nothing: null,
    loc: { role: 'button', name: '重新加载' },
  });
});

test('block lists of maps continue the mapping on following lines', () => {
  const v = parseYaml(`edges:
  - id: retry
    to: "[[a]]"
    blocked: { missing: 一份数据, tried: [拦接口返回 500, 历史报告] }
  - id: done # trailing comment
    kind: system
list:
- x
- y: 1
  z: 2`);
  assert.deepEqual(v.edges, [
    { id: 'retry', to: '[[a]]', blocked: { missing: '一份数据', tried: ['拦接口返回 500', '历史报告'] } },
    { id: 'done', kind: 'system' },
  ]);
  assert.deepEqual(v.list, ['x', { y: 1, z: 2 }]);
});

test('nested block mappings and block scalars', () => {
  const v = parseYaml(`entry:
  url: /report/<id>
  preconditions:
    account: 已登录
    note: |
      line one
      line two
after: z`);
  assert.equal(v.entry.url, '/report/<id>');
  assert.deepEqual(v.entry.preconditions, { account: '已登录', note: 'line one\nline two' });
  assert.equal(v.after, 'z');
});

test('unquoted [[link]] and {token} stay strings', () => {
  const v = parseYaml(`page: [[report]]
duration: {motion.duration.base}
refs: [[[a]], "[[b]]"]`);
  assert.equal(v.page, '[[report]]');
  assert.equal(v.duration, '{motion.duration.base}');
  assert.deepEqual(v.refs, ['[[a]]', '[[b]]']);
});

test('a flow list may span lines', () => {
  const v = parseYaml(`code: [src/a.tsx,
  src/b.tsx]
x: 1`);
  assert.deepEqual(v.code, ['src/a.tsx', 'src/b.tsx']);
  assert.equal(v.x, 1);
});

test('splitFrontmatter separates body, and reports a bad block instead of throwing', () => {
  const ok = splitFrontmatter('---\ntype: x\n---\n\n# Body\n');
  assert.deepEqual(ok.fm, { type: 'x' });
  assert.match(ok.body, /# Body/);
  assert.equal(splitFrontmatter('no frontmatter').fm, null);
  const bad = splitFrontmatter('---\nfoo: [unclosed\n---\nbody');
  assert.equal(bad.fm, null);
  assert.ok(bad.error);
});
