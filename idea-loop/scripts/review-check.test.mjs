import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addedLines, admit, codeRefs, contains, shapeProblems, snippetInDiff } from './review-check.mjs';

const diff = `--- a/src/api/handler.ts
+++ b/src/api/handler.ts
@@ -1,0 +2,3 @@
+import { db } from '../db/client';
+export async function handler(req) {
+  return db.query('select 1');
`;

const files = {
  'docs/spec/tickets/03-retry.md': '- [x] 失败后点「重试」，只重新分析这一题，  不消耗配额',
  'docs/reference/code-layering.md': '路由层不直接访问数据库，\n统一经过 service 层。',
};
const io = {
  read: (p) => files[p] ?? null,
  exists: (name) => name === 'r1-retry-quota.png',
  added: (p) => addedLines(diff, p),
};

test('whitespace is normalized, nothing else is fuzzy', () => {
  assert.ok(contains('路由层不直接访问数据库，\n统一经过 service 层。', '路由层不直接访问数据库， 统一经过 service 层。'));
  assert.equal(contains('路由层不直接访问数据库', '路由层不访问数据库'), false);
  assert.equal(contains('anything', '  '), false);
});

test('a snippet counts only if every non-blank line was added in this diff', () => {
  const added = addedLines(diff, 'src/api/handler.ts');
  assert.ok(snippetInDiff("import { db } from '../db/client';\n\n  return db.query('select 1');", added));
  assert.equal(snippetInDiff("import { db } from '../db/client';\nconst old = 1;", added), false);
});

const specWords = {
  problem: '分析失败后点重试，每次都扣一次当天的练习次数；main 上重试不扣。',
  user_impact: '连续失败几次的学生会提前用完当天的练习次数，网络差的学生最容易碰到。',
  decide: { context: '工单要求重试不消耗次数，用来保证失败不变成学生的成本。', options: ['修：重试不扣次数', '不修：改工单'], recommend: '修，这是用户能感到的损失。' },
};
const standardsWords = {
  now: '分析接口在处理请求时直接查了数据库，没有经过业务层。',
  impact: '以后换存储或加缓存时，这一处会被漏掉。',
  suggestion: '把查询挪进业务层，接口只调它。',
};
const S1 = { id: 'S1', title: '连续失败的学生会提前用完当天的练习次数', behavior: true, quote: { file: 'docs/spec/tickets/03-retry.md', text: '只重新分析这一题， 不消耗配额' }, figure: 'r1-retry-quota.png', ...specWords };
const C1 = { id: 'C1', title: '接口直接查数据库', rule: { file: 'docs/reference/code-layering.md', text: '路由层不直接访问数据库' }, code: { path: 'src/api/handler.ts', snippet: "import { db } from '../db/client';" }, locations: ['src/api/handler.ts:2'], ...standardsWords };

test('grounded candidates in shape are admitted on both axes, with nothing to rewrite', () => {
  const r = admit({ spec: [S1], standards: [C1] }, io, { round: 1 });
  assert.deepEqual([r.spec.length, r.standards.length, r.discarded.length, r.rewrite.length], [1, 1, 0, 0]);
});

test('a behavioural finding may carry its reproduction as an inline example instead of a figure', () => {
  const r = admit({ spec: [{ ...S1, figure: undefined, example: '| 第几次重试 | main 剩余次数 | 本分支剩余次数 |\n|---|---|---|\n| 1 | 5 | 4 |' }] }, io, { round: 1 });
  assert.deepEqual([r.spec.length, r.rewrite.length], [1, 0]);
});

test('a non-behavioural Spec finding needs no figure, and must not carry one', () => {
  const extraFile = { ...S1, id: 'S2', title: '多了一个迁移文件', behavior: false, figure: undefined };
  assert.deepEqual(admit({ spec: [extraFile] }, io, { round: 1 }).spec.map((c) => c.id), ['S2']);
  const r = admit({ spec: [{ ...extraFile, figure: 'r1-retry-quota.png' }] }, io, { round: 1 });
  assert.match(r.rewrite[0].problems.join(), /不配图/);
});

test('code-level references in reader-facing text are found: backticks, file:line, paths, §, hashes, snake_case, calls', () => {
  const hits = codeRefs('提交 2daa0bae 在 routers/analysis/writing.py:42 调 `fail_text_analysis`，spec §4.1 说 submit_text_analysis() 不行');
  assert.equal(hits.length, 6);
  assert.deepEqual(codeRefs('L&R 和 Interview 两种报告的计时规则不一样，A/B 两个选项，iPhone 上最多等 5 秒'), []);
});

test('a finding missing a part, a decision, or written in code terms goes to rewrite, not to discard', () => {
  const bad = { ...S1, user_impact: '', problem: 'spec §4.7 写的是…', decide: { options: ['修'] } };
  const problems = shapeProblems(bad, 'spec');
  assert.ok(problems.some((p) => /缺「对用户的影响」/.test(p)));
  assert.ok(problems.some((p) => /缺一句前提/.test(p)));
  assert.ok(problems.some((p) => /章节编号「§4.7」/.test(p)));
  assert.ok(problems.some((p) => /两个选项/.test(p)));
  assert.ok(problems.some((p) => /没给建议/.test(p)));
  const r = admit({ spec: [bad], standards: [{ ...C1, now: '`handler` 里 import 了 db' }] }, io, { round: 1 });
  assert.deepEqual([r.spec.length, r.standards.length, r.discarded.length], [1, 1, 0]);
  assert.deepEqual(r.rewrite.map((x) => x.id), ['S1', 'C1']);
});

test('each ungrounded candidate is discarded with its reason', () => {
  const r = admit({
    spec: [
      { id: 'S1', title: '编的原文', behavior: true, quote: { file: 'docs/spec/tickets/03-retry.md', text: '重试最多三次' }, figure: 'r1-retry-quota.png' },
      { id: 'S2', title: '行为问题没有复现证据', behavior: true, quote: { file: 'docs/spec/tickets/03-retry.md', text: '不消耗配额' } },
      { id: 'S3', title: '图名是上一轮的', behavior: true, quote: { file: 'docs/spec/tickets/03-retry.md', text: '不消耗配额' }, figure: 'r0-x.png' },
      { id: 'S4', title: '图不存在', behavior: true, quote: { file: 'docs/spec/tickets/03-retry.md', text: '不消耗配额' }, figure: 'r1-missing.png' },
    ],
    standards: [
      { id: 'C1', title: '编的规则', rule: { file: 'docs/reference/code-layering.md', text: '禁止使用 any' }, code: { path: 'src/api/handler.ts', snippet: 'export async function handler(req) {' } },
      { id: 'C2', title: '存量代码', rule: { file: 'docs/reference/code-layering.md', text: '统一经过 service 层' }, code: { path: 'src/api/handler.ts', snippet: 'legacyCall();' } },
      { id: 'C3', title: '规则文件不存在', rule: { file: 'CODING.md', text: 'x' }, code: { path: 'src/api/handler.ts', snippet: 'x' } },
    ],
  }, io, { round: 1 });
  assert.deepEqual(r.discarded.map((d) => d.id), ['S1', 'S2', 'S3', 'S4', 'C1', 'C2', 'C3']);
  assert.ok(r.discarded.every((d) => d.reason.length > 0));
});
