import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getSection, setSection, readerProblems, SECTIONS, TITLES } from './pr-body.mjs';

test('the description is the review report: one sentence, then its five parts, then the folded reference', () => {
  assert.deepEqual(SECTIONS, ['summary', 'problem', 'changes', 'verification', 'rollback', 'your-todo', 'reference']);
  assert.deepEqual(
    ['problem', 'changes', 'verification', 'rollback', 'your-todo'].map((n) => TITLES[n]),
    ['问题', '怎么修', '怎么验证', '能否回滚', '要你做的事'],
  );
  assert.equal(Object.values(TITLES).includes('顺带开的 issue'), false, 'issues filed on the way live inside 能否回滚 now');
  assert.throws(() => setSection('', 'review', '第 1 轮'), /unknown section/);
});

test('sections come out in the fixed order whatever order they were written in', () => {
  const written = ['reference', 'your-todo', 'rollback', 'verification', 'summary', 'changes', 'problem'];
  let body = '';
  for (const n of written) body = setSection(body, n, `内容 ${n}`);
  const order = SECTIONS.map((n) => body.indexOf(`<!-- idea-loop:section ${n} -->`));
  assert.ok(order.every((i) => i >= 0), 'every section is written');
  assert.deepEqual([...order].sort((a, b) => a - b), order);
});

test('the new sections write their own headings and are rewritten alone', () => {
  let body = setSection('', 'problem', '学生重试失败的题会被多扣一次');
  body = setSection(body, 'verification', '- 重试一次只扣一次：端到端，通过');
  body = setSection(body, 'rollback', '**能不能撤回**：能，撤销合并即可。');
  assert.match(body, /## 问题\n\n学生重试/);
  assert.match(body, /## 怎么验证\n\n- 重试一次/);
  assert.match(body, /## 能否回滚\n\n\*\*能不能撤回\*\*/);
  body = setSection(body, 'problem', '重试失败的题多扣两次');
  assert.equal(getSection(body, 'problem'), '重试失败的题多扣两次');
  assert.match(getSection(body, 'verification'), /端到端/);
  assert.equal(body.match(/## 问题/g).length, 1);
});

test('a description written before the report shape keeps its old 改了什么 heading out of the rewritten section', () => {
  const old = '<!-- idea-loop:section changes -->\n## 改了什么\n\n### 重试页\n\n之前 → 之后\n<!-- /idea-loop:section changes -->';
  assert.equal(getSection(old, 'changes'), '### 重试页\n\n之前 → 之后');
  const body = setSection(old, 'problem', '重试多扣次数');
  assert.doesNotMatch(body, /## 改了什么/);
  assert.match(body, /## 怎么修\n\n### 重试页/);
  assert.ok(body.indexOf('section problem -->') < body.indexOf('section changes -->'));
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
  // the report's new sections are read by a person too
  assert.throws(() => setSection('', 'problem', '`retryAnalysis` 多扣了次数'), /say it in words/);
  assert.throws(() => setSection('', 'verification', '- 单测 src/report/retry.test.ts 通过'), /say it in words/);
  assert.throws(() => setSection('', 'rollback', '- 见 a1b2c3d 的提交'), /say it in words/);
  assert.deepEqual(readerProblems('changes', '![重试流程](https://github.com/a/b/blob/idea-loop-evidence-pr-1/pr-retry_flow.png?raw=true) 见 [停下汇报](https://github.com/a/b/pull/1#discussion_r1)'), []);
  assert.deepEqual(readerProblems('reference', '01 · 缓存 | a1b2c3d | src/cache.ts'), []); // lookup only
});

test('writing 怎么验证 first, then the other sections, leaves hand-written text and the attribution line exactly as they were', () => {
  const human = '这个 PR 修复学生重试多扣一次的问题。';
  const sign = '🤖 Generated with [Claude Code](https://claude.com/claude-code)';
  let body = `${human}\n\n${sign}`;
  for (const n of ['verification', 'problem', 'changes', 'rollback', 'your-todo']) {
    body = setSection(body, n, `内容 ${n}`);
    assert.equal(body.split(sign).length - 1, 1, `after ${n}: attribution line appears once`);
    assert.equal(body.split(human).length - 1, 1, `after ${n}: hand-written text appears once`);
    assert.ok(body.endsWith(`${human}\n\n${sign}\n`), `after ${n}: text outside the sections is unchanged and last`);
  }
  body = setSection(body, 'verification', '更新后的验证');
  assert.ok(body.endsWith(`${human}\n\n${sign}\n`));
  assert.equal(getSection(body, 'verification'), '更新后的验证');
  assert.match(getSection(body, 'problem'), /内容 problem/);
});

// A description opened before 能否回滚 existed carries a 顺带开的 issue section. It is folded into 能否回滚 the
// next time anything is written, under the same label the new section uses, and never lost afterwards.
const legacyIssues = '<!-- idea-loop:section issues -->\n## 顺带开的 issue\n\n- [旧报告缓存不清](https://github.com/a/b/issues/12)：不是这次引入的\n<!-- /idea-loop:section issues -->';

test('an old 顺带开的 issue section is folded into 能否回滚 on the next write, and the old heading goes', () => {
  const body = setSection(`${legacyIssues}\n\n人写的说明`, 'summary', 'S');
  assert.doesNotMatch(body, /section issues|## 顺带开的 issue/);
  assert.match(body, /## 能否回滚\n\n\*\*顺带开的 issue\*\*\n\n- \[旧报告缓存不清\]/);
  assert.match(body, /人写的说明/);
  assert.ok(body.indexOf('section summary -->') < body.indexOf('section rollback -->'));
});

test('writing 能否回滚 on top of a folded-in issue list keeps the list unless the new text carries its own', () => {
  const folded = setSection(legacyIssues, 'summary', 'S');
  const kept = setSection(folded, 'rollback', '**能不能撤回**：能，撤销合并即可。');
  assert.match(getSection(kept, 'rollback'), /^\*\*能不能撤回\*\*[\s\S]*\*\*顺带开的 issue\*\*\n\n- \[旧报告缓存不清\]/);
  const own = setSection(folded, 'rollback', '**能不能撤回**：能。\n\n**顺带开的 issue**\n\n- [另一个](https://github.com/a/b/issues/13)');
  assert.doesNotMatch(getSection(own, 'rollback'), /旧报告缓存不清/);
  assert.match(getSection(own, 'rollback'), /另一个/);
  assert.equal(getSection(own, 'rollback').match(/顺带开的 issue/g).length, 1);
});

test('an old issues section that only said there were none is dropped, not folded in', () => {
  const none = '<!-- idea-loop:section issues -->\n## 顺带开的 issue\n\n无\n<!-- /idea-loop:section issues -->';
  const body = setSection(none, 'summary', 'S');
  assert.doesNotMatch(body, /section issues|顺带开的 issue|section rollback/);
});
