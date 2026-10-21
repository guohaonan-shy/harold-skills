import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { forHuman, frontmatter, renderIndex, scan, touchesUi, transitionError, withStatus } from './spec-status.mjs';

const SCRIPT = fileURLToPath(new URL('./spec-status.mjs', import.meta.url));

const spec = ({ status = '审核中', ui = '不涉及。', freeze = false, grill = false, fork = false, close = false } = {}) => `---
type: spec
status: ${status}
tags: [retry]
summary: 重试不消耗配额
related: []
---

# 重试不消耗配额
${grill ? '\n> 需要 grill：要不要给重试单独的配额，条目里没定。\n' : ''}
## 4 实现决策
${freeze ? '\n### 冻结摘要\n- 画布指针：[[practice-retry-design]]\n' : '\n无分歧。\n'}${fork ? '\n### 待定：重试要不要单独计配额\n- 选项 A：…\n' : ''}
## 5 技术方案总览

### 5.1 后端
不涉及。

### 5.3 前端交互
${ui}

## 6 测试决策
${close ? '\n## 建议关闭\n\n- #12 已经做掉了\n' : ''}`;

const UI = '> 待补图：`uiux-refine` 冻结时按冻结画布补交互图，替换本节文字\n\n- 点重试 → 只重跑这一题';

test('frontmatter reads status and summary, ignoring a trailing comment', () => {
  assert.equal(frontmatter(spec()).status, '审核中');
  assert.equal(frontmatter('---\nstatus: 审核中   # 起草 routine\n---\n').status, '审核中');
});

test('withStatus rewrites only the status line', () => {
  const out = withStatus(spec(), '在飞');
  assert.equal(frontmatter(out).status, '在飞');
  assert.equal(out.replace('status: 在飞', 'status: 审核中'), spec());
});

test('touchesUi reads 前端交互: 不涉及 means no UI', () => {
  assert.equal(touchesUi(spec()), false);
  assert.equal(touchesUi(spec({ ui: UI })), true);
});

test('legal steps pass', () => {
  assert.equal(transitionError('审核中', '待设计', spec({ ui: UI }), 0), null);
  assert.equal(transitionError('待设计', '设计中', spec({ ui: UI }), 0), null);
  assert.equal(transitionError('设计中', '待实现', spec({ ui: UI, freeze: true }), 0), null);
  assert.equal(transitionError('审核中', '待实现', spec(), 0), null);
  assert.equal(transitionError('待实现', '在飞', spec(), 2), null);
  assert.equal(transitionError('待实现', '在飞', spec({ ui: UI, freeze: true }), 3), null);
  assert.equal(transitionError('在飞', '搁置', spec(), 3), null);
});

test('skipping a step is refused', () => {
  assert.match(transitionError('待设计', '在飞', spec({ ui: UI }), 2), /不能直接翻/);
  assert.match(transitionError('审核中', '在飞', spec(), 2), /不能直接翻/);
  assert.match(transitionError('审核中', '设计中', spec({ ui: UI }), 0), /不能直接翻/);
  assert.match(transitionError('在飞', '审核中', spec(), 2), /不能直接翻/);
});

test('待设计 and 设计中 are only for a spec that touches UI', () => {
  assert.match(transitionError('审核中', '待设计', spec(), 0), /不涉及/);
  assert.match(transitionError('待设计', '设计中', spec(), 0), /不涉及/);
});

test('待实现 needs the design frozen when the spec touches UI', () => {
  assert.match(transitionError('审核中', '待实现', spec({ ui: UI }), 0), /先走设计/);
  assert.match(transitionError('设计中', '待实现', spec({ ui: UI }), 0), /冻结摘要/);
});

test('在飞 needs the tickets cut, and the design still frozen', () => {
  assert.match(transitionError('待实现', '在飞', spec(), 0), /一张工单都没有/);
  assert.match(transitionError('待实现', '在飞', spec({ ui: UI }), 2), /冻结摘要/);
});

test('a spec marked 需要 grill does not move on', () => {
  assert.match(transitionError('审核中', '待实现', spec({ grill: true }), 0), /需要 grill/);
  assert.match(transitionError('审核中', '待设计', spec({ grill: true, ui: UI }), 0), /需要 grill/);
});

test('a spec leaves 审核中 only once nothing waits for a human', () => {
  assert.deepEqual(forHuman(spec()), []);
  assert.equal(forHuman(spec({ grill: true, fork: true, close: true })).length, 3);
  assert.match(transitionError('审核中', '待实现', spec({ fork: true }), 0), /1 条「待定」/);
  assert.match(transitionError('审核中', '待设计', spec({ ui: UI, close: true }), 0), /建议关闭/);
  assert.equal(transitionError('审核中', '搁置', spec({ fork: true }), 0), null);
});

test('old and unknown statuses are refused with the reason', () => {
  assert.match(transitionError('等设计冻结', '设计中', spec({ ui: UI }), 0), /迁移/);
  assert.match(transitionError('草稿', '审核中', spec(), 0), /迁移/);
  assert.match(transitionError('审核中', '完成', spec(), 0), /不是合法状态/);
  assert.match(transitionError('审核中', '审核中', spec(), 0), /已经是/);
});

test('renderIndex replaces the table without a status column, keeping the text around it', () => {
  const old = '# spec\n> 契约：x\n\n| 文件 | status | summary |\n|---|---|---|\n| [[gone]] | 在飞 | 旧的 |\n\n> 当前为空。\n';
  const out = renderIndex(old, [{ slug: 'b', status: '审核中', summary: 'B' }, { slug: 'a', status: '待实现', summary: 'A' }]);
  assert.equal(out, '# spec\n> 契约：x\n\n| 文件 | summary |\n|---|---|\n| [[a]] | A |\n| [[b]] | B |\n\n> 当前为空。\n');
  assert.equal(renderIndex(out, [{ slug: 'a', summary: 'A' }]), '# spec\n> 契约：x\n\n| 文件 | summary |\n|---|---|\n| [[a]] | A |\n\n> 当前为空。\n');
  assert.match(renderIndex('', []), /\| 文件 \| summary \|/);
});

function project() {
  const docs = join(mkdtempSync(join(tmpdir(), 'spec-status-')), 'docs');
  mkdirSync(join(docs, 'spec', 'practice-retry', 'tickets'), { recursive: true });
  writeFileSync(join(docs, 'spec', 'index.md'), '# spec\n> 契约：x\n\n| 文件 | summary |\n|---|---|\n');
  writeFileSync(join(docs, 'spec', 'practice-retry', 'practice-retry.md'), spec({ status: '待实现' }));
  return docs;
}

const run = (...args) => execFileSync('node', [SCRIPT, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

test('set writes the status and the index together', () => {
  const docs = project();
  writeFileSync(join(docs, 'spec', 'practice-retry', 'tickets', '01-retry.md'), '# 01 — 重试\n');
  run('set', docs, 'practice-retry', '在飞');
  assert.equal(frontmatter(readFileSync(join(docs, 'spec', 'practice-retry', 'practice-retry.md'), 'utf8')).status, '在飞');
  assert.match(readFileSync(join(docs, 'spec', 'index.md'), 'utf8'), /\| \[\[practice-retry\]\] \| 重试不消耗配额 \|/);
});

test('set refuses an illegal step and leaves the file alone', () => {
  const docs = project();
  assert.throws(() => run('set', docs, 'practice-retry', '在飞'), /一张工单都没有/);
  assert.equal(frontmatter(readFileSync(join(docs, 'spec', 'practice-retry', 'practice-retry.md'), 'utf8')).status, '待实现');
});

test('route moves a new spec on by whether it touches UI, or leaves it in 审核中 with the reason', () => {
  const docs = project();
  const file = join(docs, 'spec', 'practice-retry', 'practice-retry.md');
  writeFileSync(file, spec({ ui: UI }));
  assert.match(run('route', docs, 'practice-retry'), /审核中 → 待设计/);
  assert.equal(frontmatter(readFileSync(file, 'utf8')).status, '待设计');
  writeFileSync(file, spec({ fork: true }));
  assert.match(run('route', docs, 'practice-retry'), /留在审核中——「实现决策」里还有 1 条「待定」/);
  assert.equal(frontmatter(readFileSync(file, 'utf8')).status, '审核中');
  writeFileSync(file, spec());
  assert.match(run('route', docs, 'practice-retry'), /审核中 → 待实现/);
  assert.throws(() => run('route', docs, 'practice-retry'), /只用于刚写好的/);
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
