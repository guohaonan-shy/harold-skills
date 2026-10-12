import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getSection, setSection, readerProblems, SECTIONS } from './pr-body.mjs';

test('the description has exactly the four sections, and none of them is review', () => {
  assert.deepEqual(SECTIONS, ['summary', 'changes', 'your-todo', 'reference']);
  assert.throws(() => setSection('', 'review', '第 1 轮'), /unknown section/);
});

test('sections come out in the fixed order whatever order they were written in', () => {
  let body = '';
  body = setSection(body, 'your-todo', 'T');
  body = setSection(body, 'summary', 'S');
  body = setSection(body, 'changes', 'C');
  const order = ['summary', 'changes', 'your-todo'].map((n) => body.indexOf(`section ${n} -->`));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
});

test('the script writes each heading itself; a writer that included it is not doubled', () => {
  const body = setSection(setSection('', 'summary', '学生重试失败的题不再扣次数'), 'your-todo', '## 要你做的事\n\n- [ ] Harold：改 Railway 根目录');
  assert.match(body, /## 一句话\n\n学生重试/);
  assert.equal(body.match(/## 要你做的事/g).length, 1);
  assert.equal(getSection(body, 'your-todo'), '- [ ] Harold：改 Railway 根目录');
});

test('rewriting one section leaves the others untouched', () => {
  let body = setSection(setSection('', 'reference', 'L1'), 'changes', 'V1');
  body = setSection(body, 'changes', 'V2');
  assert.equal(getSection(body, 'reference'), 'L1');
  assert.equal(getSection(body, 'changes'), 'V2');
  assert.equal(body.match(/section changes -->/g).length, 2); // one open, one close
});

test('legacy review and 0.0.16-draft sections are dropped on the next write', () => {
  const legacy = '<!-- idea-loop:section review -->\n## Review · 第 1 轮\n<!-- /idea-loop:section review -->\n\n<!-- idea-loop:section links -->\nL\n<!-- /idea-loop:section links -->\n\n人写的说明';
  const body = setSection(legacy, 'summary', 'S');
  assert.doesNotMatch(body, /Review · 第 1 轮|section review|section links/);
  assert.match(body, /人写的说明/);
});

test('text outside the markers survives, below the sections', () => {
  const body = setSection('人写的说明\n\n🤖 Generated with Claude Code', 'summary', 'S');
  assert.match(body, /人写的说明/);
  assert.ok(body.indexOf('人写的说明') > body.indexOf('section summary'));
});

test('empty content removes a section', () => {
  const body = setSection(setSection('', 'changes', 'CI 绿'), 'changes', '');
  assert.equal(getSection(body, 'changes'), null);
});

test('a body over the GitHub limit is refused before it is sent', () => {
  assert.throws(() => setSection('', 'reference', 'x'.repeat(70000)), /limit/);
});

test('sections a person reads refuse code-level references; image and link addresses do not count', () => {
  assert.throws(() => setSection('', 'changes', '重试时不再调 `retryAnalysis`'), /say it in words/);
  assert.throws(() => setSection('', 'your-todo', '- [ ] 看 src/report/player.tsx:42'), /say it in words/);
  assert.deepEqual(readerProblems('changes', '![重试流程](https://github.com/a/b/blob/idea-loop-evidence-pr-1/pr-retry_flow.png?raw=true) 见 [停下汇报](https://github.com/a/b/pull/1#discussion_r1)'), []);
  assert.deepEqual(readerProblems('reference', '01 · 缓存 | a1b2c3d | src/cache.ts'), []); // lookup only
});
