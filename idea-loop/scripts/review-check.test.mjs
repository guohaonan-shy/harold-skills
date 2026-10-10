import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addedLines, admit, contains, snippetInDiff } from './review-check.mjs';

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

test('grounded candidates are admitted on both axes', () => {
  const r = admit({
    spec: [{ id: 'S1', title: '重试扣了配额', quote: { file: 'docs/spec/tickets/03-retry.md', text: '只重新分析这一题， 不消耗配额' }, figure: 'r1-retry-quota.png' }],
    standards: [{ id: 'C1', title: '路由直连数据库', rule: { file: 'docs/reference/code-layering.md', text: '路由层不直接访问数据库' }, code: { path: 'src/api/handler.ts', snippet: "import { db } from '../db/client';" } }],
  }, io, { round: 1 });
  assert.deepEqual([r.spec.length, r.standards.length, r.discarded.length], [1, 1, 0]);
});

test('each ungrounded candidate is discarded with its reason', () => {
  const r = admit({
    spec: [
      { id: 'S1', title: '编的原文', quote: { file: 'docs/spec/tickets/03-retry.md', text: '重试最多三次' }, figure: 'r1-retry-quota.png' },
      { id: 'S2', title: '没图', quote: { file: 'docs/spec/tickets/03-retry.md', text: '不消耗配额' } },
      { id: 'S3', title: '图名是上一轮的', quote: { file: 'docs/spec/tickets/03-retry.md', text: '不消耗配额' }, figure: 'r0-x.png' },
      { id: 'S4', title: '图不存在', quote: { file: 'docs/spec/tickets/03-retry.md', text: '不消耗配额' }, figure: 'r1-missing.png' },
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
