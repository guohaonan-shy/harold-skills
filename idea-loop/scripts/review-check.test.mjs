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
  'docs/spec/practice-retry/tickets/03-retry.md': '- [x] 失败后点「重试」，只重新分析这一题，  不消耗配额',
  'docs/reference/code-layering.md': '路由层不直接访问数据库，\n统一经过 service 层。',
  'docs/reference/wording.md': '界面文案里的按钮名称统一用两个字的动词。',
  'src/api/legacy.ts': "export const quota = readQuota();\nexport function readQuota() {\n  return db.query('select quota');\n}\n",
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
const S1 = { id: 'S1', title: '连续失败的学生会提前用完当天的练习次数', behavior: true, on_screen: true, quote: { file: 'docs/spec/practice-retry/tickets/03-retry.md', text: '只重新分析这一题， 不消耗配额' }, figure: 'r1-retry-quota.png', ...specWords };
const C1 = { id: 'C1', title: '接口直接查数据库', rule: { file: 'docs/reference/code-layering.md', text: '路由层不直接访问数据库' }, code: { path: 'src/api/handler.ts', snippet: "import { db } from '../db/client';" }, locations: ['src/api/handler.ts:2'], ...standardsWords };

test('grounded candidates in shape are admitted on both axes, with nothing to rewrite', () => {
  const r = admit({ spec: [S1], standards: [C1] }, io, { round: 1 });
  assert.deepEqual([r.spec.length, r.standards.length, r.discarded.length, r.rewrite.length], [1, 1, 0, 0]);
});

test('a behavioural finding that does not show on screen may carry its reproduction as an inline example', () => {
  const r = admit({ spec: [{ ...S1, on_screen: false, figure: undefined, example: '| 第几次重试 | main 剩余次数 | 本分支剩余次数 |\n|---|---|---|\n| 1 | 5 | 4 |' }] }, io, { round: 1 });
  assert.deepEqual([r.spec.length, r.rewrite.length], [1, 0]);
});

test('a finding that shows on screen needs a screenshot; a table alone goes to rewrite unless it says why none could be shot', () => {
  const tableOnly = { ...S1, figure: undefined, example: '| 第几步 | 麦克风 |\n|---|---|\n| 示范还在播 | 已打开 |' };
  const r = admit({ spec: [tableOnly] }, io, { round: 1 });
  assert.deepEqual([r.spec.length, r.discarded.length], [1, 0]);
  assert.match(r.rewrite[0].problems.join(), /截图/);
  assert.deepEqual(shapeProblems({ ...tableOnly, no_screenshot: '只有戴蓝牙耳机的真机才复现得出来' }, 'spec'), []);
  assert.match(shapeProblems({ ...S1, on_screen: undefined }, 'spec').join(), /没标 on_screen/);
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
      { id: 'S1', title: '编的原文', behavior: true, quote: { file: 'docs/spec/practice-retry/tickets/03-retry.md', text: '重试最多三次' }, figure: 'r1-retry-quota.png' },
      { id: 'S2', title: '行为问题没有复现证据', behavior: true, quote: { file: 'docs/spec/practice-retry/tickets/03-retry.md', text: '不消耗配额' } },
      { id: 'S3', title: '图名是上一轮的', behavior: true, quote: { file: 'docs/spec/practice-retry/tickets/03-retry.md', text: '不消耗配额' }, figure: 'r0-x.png' },
      { id: 'S4', title: '图不存在', behavior: true, quote: { file: 'docs/spec/practice-retry/tickets/03-retry.md', text: '不消耗配额' }, figure: 'r1-missing.png' },
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

// ---------- 处置：照规则 / 要你决定 ----------

const basisRule = { kind: '规则原文', file: 'docs/reference/wording.md', text: '按钮名称统一用两个字的动词', summary: '仓库的文案规定写明按钮名称统一用两个字的动词。' };
const S_RULED = { ...S1, id: 'S3', disposition: '照规则', basis: basisRule, action: '同步改', decide: undefined };
const C_RULED = { ...C1, disposition: '照规则', action: '修' };
const run = (c, axis = 'spec') => admit({ [axis]: [c] }, io, { round: 1 });

test('a ruled Spec finding with a basis and an action needs no options and no recommendation', () => {
  const r = run(S_RULED);
  assert.deepEqual([r.spec.length, r.discarded.length, r.rewrite.length], [1, 0, 0]);
});

test('a ruled finding missing its basis or its action goes to rewrite', () => {
  assert.match(run({ ...S_RULED, basis: undefined }).rewrite[0].problems.join(), /缺依据/);
  assert.match(run({ ...S_RULED, action: undefined }).rewrite[0].problems.join(), /缺动作/);
  assert.match(run({ ...S_RULED, action: '改一改' }).rewrite[0].problems.join(), /动作只能是/);
  assert.match(run({ ...S_RULED, basis: { ...basisRule, kind: '我觉得' } }).rewrite[0].problems.join(), /依据只认三种/);
  assert.match(run({ ...S_RULED, basis: { ...basisRule, summary: '' } }).rewrite[0].problems.join(), /缺一句依据/);
  assert.match(run({ ...S_RULED, basis: { kind: '规则原文', summary: '有规定。' } }).rewrite[0].problems.join(), /缺出处或原文/);
});

test('a ruled finding does not carry a decision for the human, and its basis sentence speaks in words, not code', () => {
  const withDecide = run({ ...S_RULED, decide: specWords.decide });
  assert.match(withDecide.rewrite[0].problems.join(), /照规则.*不写「要你决定」/);
  const codey = run({ ...S_RULED, basis: { ...basisRule, summary: '见 docs/reference/wording.md 的第三条' } });
  assert.match(codey.rewrite[0].problems.join(), /依据.*代码层面的指称/);
});

test('a ruled finding whose basis is not where it claims is discarded, whichever kind of basis it names', () => {
  const r = run({ ...S_RULED, basis: { ...basisRule, text: '按钮名称一律写英文' } });
  assert.deepEqual([r.spec.length, r.discarded.length], [0, 1]);
  assert.match(r.discarded[0].reason, /依据/);
  const gone = run({ ...S_RULED, basis: { ...basisRule, file: 'docs/reference/missing.md' } });
  assert.match(gone.discarded[0].reason, /依据/);
  const humanWords = { kind: '人的决定', file: 'docs/spec/practice-retry/tickets/03-retry.md', text: '重试最多三次', summary: '人在工单里定过。' };
  assert.match(run({ ...S_RULED, basis: humanWords }).discarded[0].reason, /依据/);
  const real = { ...humanWords, text: '不消耗配额', summary: '人在工单里定过重试不消耗配额。' };
  const ok = run({ ...S_RULED, basis: real });
  assert.deepEqual([ok.spec.length, ok.discarded.length], [1, 0]);
});

test('an unknown disposition goes to rewrite; no disposition keeps the old 要你决定 shape', () => {
  assert.match(run({ ...S1, disposition: '随便' }).rewrite[0].problems.join(), /处置只能是/);
  assert.deepEqual(run({ ...S1, disposition: '要你决定' }).rewrite, []);
  assert.ok(run({ ...S1, decide: undefined }).rewrite[0].problems.some((p) => /要你决定/.test(p)));
});

test('a ruled Standards finding stands on its rule, and still needs an action', () => {
  const r = run(C_RULED, 'standards');
  assert.deepEqual([r.standards.length, r.discarded.length, r.rewrite.length], [1, 0, 0]);
  assert.match(run({ ...C_RULED, action: undefined }, 'standards').rewrite[0].problems.join(), /缺动作/);
  assert.equal(run({ ...C_RULED, rule: { ...C1.rule, text: '禁止使用 any' } }, 'standards').discarded.length, 1);
});

test('an existing (not added) Standards problem is reported only as a ruled fix that says how it spoils this change', () => {
  const stock = { ...C_RULED, id: 'C2', code: { path: 'src/api/legacy.ts', snippet: 'export const quota = readQuota();' }, existing: true, pollutes: '这次的练习次数统计读的就是这个值，它错了，统计就跟着错。' };
  const ok = run(stock, 'standards');
  assert.deepEqual([ok.standards.length, ok.discarded.length, ok.rewrite.length], [1, 0, 0]);
  assert.match(run({ ...stock, pollutes: '' }, 'standards').rewrite[0].problems.join(), /缺一句.*怎么影响这次/);
  assert.match(run({ ...stock, disposition: undefined }, 'standards').rewrite[0].problems.join(), /存量.*照规则/);
  assert.equal(run({ ...stock, code: { path: 'src/api/legacy.ts', snippet: 'not there();' } }, 'standards').discarded.length, 1);
  // without the flag a snippet that is not an added line is still discarded
  assert.equal(run({ ...stock, existing: undefined }, 'standards').discarded.length, 1);
});
