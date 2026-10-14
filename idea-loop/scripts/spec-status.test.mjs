import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { frontmatter, handoff, renderIndex, scan, touchesUi, transitionError, unhandoff, withStatus } from './spec-status.mjs';

const SCRIPT = fileURLToPath(new URL('./spec-status.mjs', import.meta.url));

const spec = ({ status = '审核中', ui = '不涉及。', freeze = false, grill = false } = {}) => `---
type: spec
status: ${status}
tags: [retry]
summary: 重试不消耗配额
related: []
---

# 重试不消耗配额
${grill ? '\n> 需要 grill：要不要给重试单独的配额，条目里没定。\n' : ''}
## 4 实现决策
${freeze ? '\n### 冻结摘要\n- 画布指针：[[practice-retry-design]]\n' : '\n无分歧。\n'}
## 5 技术方案总览

### 5.1 后端
不涉及。

### 5.3 前端交互
${ui}

## 6 测试决策
`;

const UI = '> 待补图：`uiux-refine` 冻结时按冻结画布补交互图，替换本节文字\n\n- 点重试 → 只重跑这一题';

test('frontmatter reads status and summary, ignoring a trailing comment', () => {
  assert.equal(frontmatter(spec()).status, '审核中');
  assert.equal(frontmatter('---\nstatus: 草稿   # 起草 routine\n---\n').status, '草稿');
});

test('withStatus rewrites only the status line', () => {
  const out = withStatus(spec(), '在飞');
  assert.equal(frontmatter(out).status, '在飞');
  assert.equal(out.replace('status: 在飞', 'status: 审核中'), spec());
});

test('touchesUi reads §5.3: 不涉及 means no UI', () => {
  assert.equal(touchesUi(spec()), false);
  assert.equal(touchesUi(spec({ ui: UI })), true);
});

test('legal steps pass', () => {
  assert.equal(transitionError('草稿', '审核中', spec(), 0), null);
  assert.equal(transitionError('审核中', '设计中', spec({ ui: UI }), 0), null);
  assert.equal(transitionError('审核中', '在飞', spec(), 2), null);
  assert.equal(transitionError('设计中', '在飞', spec({ status: '设计中', ui: UI, freeze: true }), 3), null);
  assert.equal(transitionError('在飞', 'parked', spec(), 3), null);
});

test('skipping a step is refused', () => {
  assert.match(transitionError('草稿', '在飞', spec(), 2), /不能直接翻/);
  assert.match(transitionError('草稿', '设计中', spec({ ui: UI }), 0), /不能直接翻/);
  assert.match(transitionError('在飞', '审核中', spec(), 2), /不能直接翻/);
});

test('设计中 is only for a spec that touches UI', () => {
  assert.match(transitionError('审核中', '设计中', spec(), 0), /不涉及/);
});

test('在飞 needs the design frozen and the tickets cut', () => {
  assert.match(transitionError('审核中', '在飞', spec({ ui: UI }), 2), /先走设计/);
  assert.match(transitionError('设计中', '在飞', spec({ status: '设计中', ui: UI }), 2), /冻结摘要/);
  assert.match(transitionError('审核中', '在飞', spec(), 0), /一张工单都没有/);
});

test('a spec marked 需要 grill does not move on', () => {
  assert.match(transitionError('审核中', '在飞', spec({ grill: true }), 2), /需要 grill/);
});

test('old and unknown statuses are refused with the reason', () => {
  assert.match(transitionError('等设计冻结', '设计中', spec({ ui: UI }), 0), /迁移/);
  assert.match(transitionError('审核中', '完成', spec(), 0), /不是合法状态/);
  assert.match(transitionError('审核中', '审核中', spec(), 0), /已经是/);
});

test('renderIndex replaces the rows and keeps the text around the table', () => {
  const old = '# spec\n> 契约：x\n\n| 文件 | status | summary |\n|---|---|---|\n| [[gone]] | 在飞 | 旧的 |\n\n> 当前为空。\n';
  const out = renderIndex(old, [{ slug: 'b', status: '审核中', summary: 'B' }, { slug: 'a', status: '草稿', summary: 'A' }]);
  assert.equal(out, '# spec\n> 契约：x\n\n| 文件 | status | summary |\n|---|---|---|\n| [[a]] | 草稿 | A |\n| [[b]] | 审核中 | B |\n\n> 当前为空。\n');
  assert.match(renderIndex('', []), /\| 文件 \| status \| summary \|/);
});

const BACKLOG = `## 待办

| # | 区域 | 打磨点 | P | 状态 |
|---|------|--------|---|------|
| 7 | 报告 | 切题滞后 | P1 | 待办 |
| 17 | 报告 | 重试 \\| 回放慢 | P2 | 待办 |

## 线上问题

- [ ] **重试判分听不到发音** —— 证据在日志里
- [ ] **processing 行永久卡死** —— 没有清扫任务
`;

test('handoff marks a table row by number, and only that row', () => {
  const out = handoff(BACKLOG, 'report-speed', '#7');
  assert.match(out, /\| 7 \| 报告 \| 切题滞后 \| P1 \| 已移交 → \[\[report-speed\]\] \|/);
  assert.match(out, /\| 17 \| 报告 \| 重试 \\\| 回放慢 \| P2 \| 待办 \|/);
});

test('handoff appends the mark to a checklist item, leaving the checkbox', () => {
  const out = handoff(BACKLOG, 'retry-scoring', '重试判分听不到发音');
  assert.match(out, /^- \[ \] \*\*重试判分听不到发音\*\* —— 证据在日志里 已移交 → \[\[retry-scoring\]\]$/m);
});

test('handoff is idempotent for the same spec and refuses another one', () => {
  const once = handoff(BACKLOG, 'report-speed', '#7');
  assert.equal(handoff(once, 'report-speed', '#7'), once);
  assert.throws(() => handoff(once, 'other-spec', '#7'), /已经移交给 \[\[report-speed\]\]/);
});

test('an entry must match exactly one line', () => {
  assert.throws(() => handoff(BACKLOG, 's', '报告'), /对上了 2 个条目/);
  assert.throws(() => handoff(BACKLOG, 's', '#99'), /对上了 0 个条目/);
});

test('unhandoff undoes handoff in both shapes', () => {
  const marked = handoff(handoff(BACKLOG, 'report-speed', '#7'), 'retry-scoring', '重试判分');
  const back = unhandoff(unhandoff(marked, 'report-speed', '#7'), 'retry-scoring', '重试判分');
  assert.equal(back, BACKLOG);
  assert.throws(() => unhandoff(marked, 'retry-scoring', '#7'), /不是 \[\[retry-scoring\]\]/);
});

function project() {
  const docs = join(mkdtempSync(join(tmpdir(), 'spec-status-')), 'docs');
  mkdirSync(join(docs, 'spec', 'practice-retry', 'tickets'), { recursive: true });
  writeFileSync(join(docs, 'spec', 'index.md'), '# spec\n> 契约：x\n\n| 文件 | status | summary |\n|---|---|---|\n');
  writeFileSync(join(docs, 'spec', 'practice-retry', 'practice-retry.md'), spec());
  return docs;
}

const run = (...args) => execFileSync('node', [SCRIPT, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

test('set writes the status and the index together', () => {
  const docs = project();
  writeFileSync(join(docs, 'spec', 'practice-retry', 'tickets', '01-retry.md'), '# 01 — 重试\n');
  run('set', docs, 'practice-retry', '在飞');
  assert.equal(frontmatter(readFileSync(join(docs, 'spec', 'practice-retry', 'practice-retry.md'), 'utf8')).status, '在飞');
  assert.match(readFileSync(join(docs, 'spec', 'index.md'), 'utf8'), /\| \[\[practice-retry\]\] \| 在飞 \| 重试不消耗配额 \|/);
});

test('set refuses an illegal step and leaves the file alone', () => {
  const docs = project();
  assert.throws(() => run('set', docs, 'practice-retry', '在飞'), /一张工单都没有/);
  assert.equal(frontmatter(readFileSync(join(docs, 'spec', 'practice-retry', 'practice-retry.md'), 'utf8')).status, '审核中');
});

test('check reports the old flat layout', () => {
  const docs = project();
  writeFileSync(join(docs, 'spec', 'old-spec.md'), spec());
  mkdirSync(join(docs, 'spec', 'tickets'));
  const { specs, problems } = scan(docs);
  assert.deepEqual(specs.map((s) => s.slug), ['practice-retry']);
  assert.equal(problems.length, 2);
  assert.ok(problems.every((p) => /§2\.2/.test(p)));
});
