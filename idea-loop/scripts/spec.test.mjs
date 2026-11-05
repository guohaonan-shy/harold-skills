import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { allAbsent, forHuman, frontmatter, issuesOf, renderIndex, scan, touchesUi, verdicts } from './spec.mjs';

const SCRIPT = fileURLToPath(new URL('./spec.mjs', import.meta.url));

// The current template: verdicts are quoted lines right under the title; the front-end interaction is a
// sub-section of 方案 and is left out when the spec touches no UI. `legacy: true` writes the older shape
// instead: a 「验证」 table, and the sub-sections under 技术方案总览 (with 「不涉及」 spelled out).
const spec = ({ status, ui, freeze = false, grill = false, fork = false, issues, verdict, legacy = false } = {}) => {
  const rows = Object.entries(verdict ?? {});
  const opening = legacy ? '' : rows.map(([n, v]) => `> #${n} ${v}：${v === '存在' ? '重试一次就扣一次配额' : '上周 #9 已修，对着 main 核过'}`).join('\n');
  const table = `## 验证

| issue | 结论 | 证据 |
|---|---|---|
${rows.map(([n, v]) => `| #${n} | ${v} | 复现 |`).join('\n')}

`;
  const plan = `## 问题陈述

重试会多扣一次配额。

## 方案

重试不再扣配额。
${ui === undefined ? '' : `\n### 前端交互\n${ui}\n`}
`;
  const overview = `
## 技术方案总览

### 后端
不涉及。

### 前端交互
${ui ?? '不涉及。'}
`;
  return `---
type: spec${status ? `\nstatus: ${status}` : ''}
tags: [retry]
summary: 重试不消耗配额
related: []${issues ? `\nissues: ${issues}` : ''}
---

# 重试不消耗配额
${grill ? '\n> 需要 grill：要不要给重试单独的配额，条目里没定。\n' : ''}${opening ? `\n${opening}\n` : ''}
${legacy ? table : plan}## 实现决策
${freeze ? '\n### 冻结摘要\n- 画布指针：docs/design/tmp/practice-retry/canvas/v3.html\n' : '\n无分歧。\n'}${fork ? '\n### 待定：重试要不要单独计配额\n- 选项 A：…\n' : ''}${legacy ? overview : ''}
## 测试决策
`;
};

const UI = '> 待补图：`uiux-refine` 冻结时按冻结画布补交互图，替换本节文字\n\n- 点重试 → 只重跑这一题';

test('frontmatter reads summary and issues, ignoring a trailing comment', () => {
  assert.equal(frontmatter(spec()).summary, '重试不消耗配额');
  assert.equal(frontmatter('---\nsummary: 重试   # 起草 routine\n---\n').summary, '重试');
  assert.deepEqual(issuesOf(spec({ issues: '[12, 15]' })), [12, 15]);
  assert.deepEqual(issuesOf(spec({ issues: '[FA-577, 12]' })), ['FA-577', 12]);
  assert.deepEqual(issuesOf(spec({ issues: '[FA-577]' })), ['FA-577']);
  assert.deepEqual(issuesOf(spec()), []);
});

test('touchesUi: a 前端交互 sub-section under 方案 means UI; no such sub-section means none', () => {
  assert.equal(touchesUi(spec()), false);
  assert.equal(touchesUi(spec({ ui: UI })), true);
});

test('touchesUi still reads an older spec: 不涉及 under 技术方案总览 means no UI', () => {
  assert.equal(touchesUi(spec({ legacy: true })), false);
  assert.equal(touchesUi(spec({ legacy: true, ui: UI })), true);
});

test('verdicts read the quoted lines under the title; allAbsent needs every listed issue marked 不存在', () => {
  const md = spec({ issues: '[1, 2]', verdict: { 1: '存在', 2: '不存在' } });
  assert.deepEqual([...verdicts(md)], [[1, '存在'], [2, '不存在']]);
  assert.equal(allAbsent(md), false);
  assert.equal(allAbsent(spec({ issues: '[1, 2]', verdict: { 1: '不存在', 2: '不存在' } })), true);
  assert.equal(allAbsent(spec()), false);
});

test('verdicts still read the older 验证 table', () => {
  const md = spec({ legacy: true, issues: '[1, 2]', verdict: { 1: '存在', 2: '不存在' } });
  assert.deepEqual([...verdicts(md)], [[1, '存在'], [2, '不存在']]);
  assert.equal(allAbsent(spec({ legacy: true, issues: '[1, 2]', verdict: { 1: '不存在', 2: '不存在' } })), true);
});

test('a quoted line counts only up to the first section; the 需要 grill line and prose are not verdicts', () => {
  const md = spec({ issues: '[1]', verdict: { 1: '存在' }, grill: true }).replace('## 方案', '## 方案\n\n> #1 不存在：这是方案里的引用，不算结论');
  assert.deepEqual([...verdicts(md)], [[1, '存在']]);
  // an ASCII colon works too, and an issue with no verdict stays unknown
  const two = spec({ issues: '[1, 2]' }).replace('# 重试不消耗配额', '# 重试不消耗配额\n\n> #1 不存在: 试过了');
  assert.deepEqual([...verdicts(two)], [[1, '不存在']]);
  assert.equal(allAbsent(two), false);
});

test('forHuman lists what waits for a human', () => {
  assert.deepEqual(forHuman(spec()), []);
  assert.equal(forHuman(spec({ grill: true, fork: true })).length, 2);
});

test('renderIndex replaces the table without a status column, keeping the text around it', () => {
  const old = '# spec\n> 契约：x\n\n| 文件 | status | summary |\n|---|---|---|\n| [[gone]] | 在飞 | 旧的 |\n\n> 当前为空。\n';
  const out = renderIndex(old, [{ slug: 'b', summary: 'B' }, { slug: 'a', summary: 'A' }]);
  assert.equal(out, '# spec\n> 契约：x\n\n| 文件 | summary |\n|---|---|\n| [[a]] | A |\n| [[b]] | B |\n\n> 当前为空。\n');
  assert.equal(renderIndex(out, [{ slug: 'a', summary: 'A' }]), '# spec\n> 契约：x\n\n| 文件 | summary |\n|---|---|\n| [[a]] | A |\n\n> 当前为空。\n');
  assert.match(renderIndex('', []), /\| 文件 \| summary \|/);
});

function project(md = spec()) {
  const docs = join(mkdtempSync(join(tmpdir(), 'spec-')), 'docs');
  mkdirSync(join(docs, 'spec', 'practice-retry', 'tickets'), { recursive: true });
  writeFileSync(join(docs, 'spec', 'index.md'), '# spec\n> 契约：x\n\n| 文件 | summary |\n|---|---|\n');
  writeFileSync(join(docs, 'spec', 'practice-retry', 'practice-retry.md'), md);
  return docs;
}

const run = (...args) => execFileSync('node', [SCRIPT, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

test('index writes the table from the specs on disk', () => {
  const docs = project();
  run('index', docs);
  assert.match(readFileSync(join(docs, 'spec', 'index.md'), 'utf8'), /\| \[\[practice-retry\]\] \| 重试不消耗配额 \|/);
});

test('the state machine is gone: set, route and migrate are refused', () => {
  const docs = project();
  for (const cmd of [['set', docs, 'practice-retry', '正式'], ['route', docs, 'practice-retry'], ['migrate', docs]]) {
    assert.throws(() => run(...cmd), /usage: spec\.mjs index/);
  }
});

test('check reports a status line left over from the old state machine', () => {
  const { specs, problems } = scan(project(spec({ status: '实现中', issues: '[3]' })));
  assert.deepEqual(specs.map((s) => [s.slug, s.issues]), [['practice-retry', [3]]]);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /还有 status 行/);
  assert.deepEqual(scan(project()).problems, []);
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
