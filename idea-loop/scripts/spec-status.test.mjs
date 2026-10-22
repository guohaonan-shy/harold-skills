import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { allAbsent, forHuman, frontmatter, renderIndex, routeOf, scan, touchesUi, transitionError, verdicts, withStatus } from './spec-status.mjs';

const SCRIPT = fileURLToPath(new URL('./spec-status.mjs', import.meta.url));

const spec = ({ status = '草稿', ui = '不涉及。', freeze = false, grill = false, fork = false, issues, verdict } = {}) => `---
type: spec
status: ${status}
tags: [retry]
summary: 重试不消耗配额
related: []${issues ? `\nissues: ${issues}` : ''}
---

# 重试不消耗配额
${grill ? '\n> 需要 grill：要不要给重试单独的配额，条目里没定。\n' : ''}
## 验证

| issue | 结论 | 证据 |
|---|---|---|
${Object.entries(verdict ?? {}).map(([n, v]) => `| #${n} | ${v} | 复现 |`).join('\n')}

## 实现决策
${freeze ? '\n### 冻结摘要\n- 画布指针：docs/design/tmp/practice-retry/canvas/v3.html\n' : '\n无分歧。\n'}${fork ? '\n### 待定：重试要不要单独计配额\n- 选项 A：…\n' : ''}
## 技术方案总览

### 后端
不涉及。

### 前端交互
${ui}

## 测试决策
`;

const UI = '> 待补图：`uiux-refine` 冻结时按冻结画布补交互图，替换本节文字\n\n- 点重试 → 只重跑这一题';

test('frontmatter reads status and summary, ignoring a trailing comment', () => {
  assert.equal(frontmatter(spec()).status, '草稿');
  assert.equal(frontmatter('---\nstatus: 正式   # 起草 routine\n---\n').status, '正式');
});

test('withStatus rewrites only the status line', () => {
  const out = withStatus(spec(), '正式');
  assert.equal(frontmatter(out).status, '正式');
  assert.equal(out.replace('status: 正式', 'status: 草稿'), spec());
});

test('touchesUi reads 前端交互: 不涉及 means no UI', () => {
  assert.equal(touchesUi(spec()), false);
  assert.equal(touchesUi(spec({ ui: UI })), true);
});

test('verdicts read the 验证 table; allAbsent needs every listed issue marked 不存在', () => {
  const md = spec({ issues: '[1, 2]', verdict: { 1: '存在', 2: '不存在' } });
  assert.deepEqual([...verdicts(md)], [[1, '存在'], [2, '不存在']]);
  assert.equal(allAbsent(md), false);
  assert.equal(allAbsent(spec({ issues: '[1, 2]', verdict: { 1: '不存在', 2: '不存在' } })), true);
  assert.equal(allAbsent(spec()), false);
});

test('forHuman lists what waits for a human', () => {
  assert.deepEqual(forHuman(spec()), []);
  assert.equal(forHuman(spec({ grill: true, fork: true })).length, 2);
});

test('legal steps pass', () => {
  assert.equal(transitionError('草稿', '正式', spec(), 0), null);
  assert.equal(transitionError('草稿', '审核中', spec({ fork: true }), 0), null);
  assert.equal(transitionError('审核中', '正式', spec(), 0), null);
  assert.equal(transitionError('草稿', '完成', spec({ issues: '[1]', verdict: { 1: '不存在' } }), 0), null);
  assert.equal(transitionError('正式', '实现中', spec(), 2), null);
  assert.equal(transitionError('正式', '实现中', spec({ ui: UI, freeze: true }), 2), null);
  assert.equal(transitionError('实现中', '完成', spec(), 2), null);
});

test('正式 needs nothing left for a human and at least one issue that exists', () => {
  assert.match(transitionError('审核中', '正式', spec({ fork: true }), 0), /1 条「待定」/);
  assert.match(transitionError('草稿', '正式', spec({ grill: true }), 0), /需要 grill/);
  assert.match(transitionError('草稿', '正式', spec({ issues: '[1]', verdict: { 1: '不存在' } }), 0), /翻「完成」/);
});

test('完成 straight from a draft only when every issue is absent', () => {
  assert.match(transitionError('草稿', '完成', spec({ issues: '[1, 2]', verdict: { 1: '不存在', 2: '存在' } }), 0), /全都不存在/);
  assert.match(transitionError('正式', '完成', spec(), 0), /不能直接翻/);
});

test('实现中 needs the tickets cut, and the design frozen when the spec touches UI', () => {
  assert.match(transitionError('正式', '实现中', spec(), 0), /一张工单都没有/);
  assert.match(transitionError('正式', '实现中', spec({ ui: UI }), 2), /冻结摘要/);
});

test('routeOf: absent → 完成, something for a human → 审核中, else 正式', () => {
  assert.equal(routeOf(spec({ issues: '[1]', verdict: { 1: '不存在' } })), '完成');
  assert.equal(routeOf(spec({ fork: true })), '审核中');
  assert.equal(routeOf(spec({ ui: UI })), '正式');
});

test('old and unknown statuses are refused with the reason', () => {
  assert.match(transitionError('在飞', '完成', spec(), 0), /migrate/);
  assert.match(transitionError('正式', '在飞', spec(), 0), /不是合法状态/);
  assert.match(transitionError('正式', '正式', spec(), 0), /已经是/);
});

test('renderIndex replaces the table without a status column, keeping the text around it', () => {
  const old = '# spec\n> 契约：x\n\n| 文件 | status | summary |\n|---|---|---|\n| [[gone]] | 在飞 | 旧的 |\n\n> 当前为空。\n';
  const out = renderIndex(old, [{ slug: 'b', status: '审核中', summary: 'B' }, { slug: 'a', status: '待实现', summary: 'A' }]);
  assert.equal(out, '# spec\n> 契约：x\n\n| 文件 | summary |\n|---|---|\n| [[a]] | A |\n| [[b]] | B |\n\n> 当前为空。\n');
  assert.equal(renderIndex(out, [{ slug: 'a', summary: 'A' }]), '# spec\n> 契约：x\n\n| 文件 | summary |\n|---|---|\n| [[a]] | A |\n\n> 当前为空。\n');
  assert.match(renderIndex('', []), /\| 文件 \| summary \|/);
});

function project(status = '正式') {
  const docs = join(mkdtempSync(join(tmpdir(), 'spec-status-')), 'docs');
  mkdirSync(join(docs, 'spec', 'practice-retry', 'tickets'), { recursive: true });
  writeFileSync(join(docs, 'spec', 'index.md'), '# spec\n> 契约：x\n\n| 文件 | summary |\n|---|---|\n');
  writeFileSync(join(docs, 'spec', 'practice-retry', 'practice-retry.md'), spec({ status }));
  return docs;
}

const run = (...args) => execFileSync('node', [SCRIPT, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const statusIn = (docs) => frontmatter(readFileSync(join(docs, 'spec', 'practice-retry', 'practice-retry.md'), 'utf8')).status;

test('set writes the status and the index together', () => {
  const docs = project();
  writeFileSync(join(docs, 'spec', 'practice-retry', 'tickets', '01-retry.md'), '# 01 — 重试\n');
  run('set', docs, 'practice-retry', '实现中');
  assert.equal(statusIn(docs), '实现中');
  assert.match(readFileSync(join(docs, 'spec', 'index.md'), 'utf8'), /\| \[\[practice-retry\]\] \| 重试不消耗配额 \|/);
});

test('set refuses an illegal step and leaves the file alone', () => {
  const docs = project();
  assert.throws(() => run('set', docs, 'practice-retry', '实现中'), /一张工单都没有/);
  assert.equal(statusIn(docs), '正式');
});

test('route moves a draft on and says why', () => {
  const docs = project('草稿');
  const file = join(docs, 'spec', 'practice-retry', 'practice-retry.md');
  writeFileSync(file, spec({ fork: true }));
  assert.match(run('route', docs, 'practice-retry'), /草稿 → 审核中——「实现决策」里还有 1 条「待定」/);
  writeFileSync(file, spec());
  assert.match(run('route', docs, 'practice-retry'), /草稿 → 正式/);
  assert.throws(() => run('route', docs, 'practice-retry'), /只用于「草稿」/);
});

test('migrate rewrites the old statuses and says which issues to park', () => {
  const docs = project('在飞');
  mkdirSync(join(docs, 'spec', 'parked'));
  writeFileSync(join(docs, 'spec', 'parked', 'parked.md'), spec({ status: '已拍板未排期' }));
  mkdirSync(join(docs, 'spec', 'parked-en'));
  writeFileSync(join(docs, 'spec', 'parked-en', 'parked-en.md'), spec({ status: 'parked' }));
  const out = run('migrate', docs);
  assert.match(out, /parked-en: parked → 正式（它覆盖的 issue 挂 status:搁置）/);
  assert.match(out, /practice-retry: 在飞 → 实现中/);
  assert.match(out, /parked: 已拍板未排期 → 正式（它覆盖的 issue 挂 status:搁置）/);
  assert.deepEqual(scan(docs).problems, []);
});

test('check reports the old flat layout', () => {
  const docs = project();
  writeFileSync(join(docs, 'spec', 'old-spec.md'), spec());
  mkdirSync(join(docs, 'spec', 'tickets'));
  const { specs, problems } = scan(docs);
  assert.deepEqual(specs.map((s) => s.slug), ['practice-retry']);
  assert.equal(problems.length, 2);
  assert.ok(problems.every((p) => /从平铺布局迁移/.test(p)));
});
