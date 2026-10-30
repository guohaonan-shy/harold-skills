/**
 * Tripwire — dreaming runs weekly from a desktop scheduled task and its screenshot pass is incremental.
 *
 * Spec canvas-truth-dreaming-agents, implementation decision 7. The behaviour lives in skill text, so
 * these checks pin the steps a reader has to be able to follow: setup creates the task the way
 * seo-setup creates seo-scan's, dreaming derives the baseline from the task's run history (and a
 * hand-typed run does not move it), only the picked states go to the live wave while the source wave
 * stays full, and the proposal table's opening line and trailing note are written down.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => readFileSync(join(pluginRoot, ...p), 'utf8');

function section(doc, title) {
  const lines = doc.split('\n');
  const start = lines.findIndex((l) => l.startsWith(`## ${title}`));
  assert.ok(start >= 0, `no "## ${title}" section`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith('## '));
  return rest.slice(0, end < 0 ? undefined : end).join('\n');
}

const setup = read('skills', 'engineering', 'setup', 'SKILL.md');
const weeklySteps = read('skills', 'engineering', 'setup', 'references', 'weekly-dreaming.md');
const seoSetup = read('skills', 'seo', 'seo-setup', 'SKILL.md');
const dreaming = read('skills', 'productivity', 'dreaming', 'SKILL.md');
const scope = read('skills', 'productivity', 'dreaming', 'references', 'incremental-scope.md');
const proposal = read('skills', 'productivity', 'dreaming', 'references', 'proposal-table.md');
const reconcile = read('skills', 'productivity', 'dreaming', 'references', 'archive-reconcile.md');

test('setup creates the weekly dreaming task the way seo-setup creates the seo-scan one', () => {
  // the steps live in setup's own reference (SKILL.md keeps its body short); the SKILL.md section must point at it
  assert.ok(section(setup, '每周对账').includes('references/weekly-dreaming.md'));
  const mine = weeklySteps;
  const theirs = section(seoSetup, '8. 每周扫描');
  // the same moving parts, in the same order: look, (not in the desktop app → hand the prompt over), ask, create, tell
  for (const part of ['list_scheduled_tasks', '不在桌面 app', 'AskUserQuestion', 'create_scheduled_task', '分钟避开 0 和 30', '补跑']) {
    assert.ok(theirs.includes(part), `seo-setup no longer says "${part}"; update this test with it`);
    assert.ok(mine.includes(part), `setup's weekly dreaming step does not say "${part}"`);
  }
  assert.ok(mine.indexOf('list_scheduled_tasks') < mine.indexOf('AskUserQuestion'));
  assert.ok(mine.indexOf('AskUserQuestion') < mine.indexOf('create_scheduled_task'));
  // the prompt is the slash command, and the app being closed is told to the human
  assert.match(mine, /`prompt`：`\/idea-loop:dreaming`/);
  assert.match(mine, /app 关着时到点不跑/);
  // a refusal and a missing desktop app are both recorded, not silently skipped
  assert.match(mine, /人拒绝/);
  assert.match(mine, /未做：不在桌面 app/);
  assert.match(setup, /##\s*交回[\s\S]*每周对账/);
});

test('dreaming stays human-or-task invoked and points at the scope reference', () => {
  assert.match(dreaming, /^disable-model-invocation: true$/m);
  assert.match(dreaming, /references\/incremental-scope\.md/);
});

test('the baseline comes from the scheduled task\'s last succeeded run; no task or no success means a full pass; a hand-typed run does not move it', () => {
  assert.match(scope, /list_task_runs/);
  assert.match(scope, /`succeeded`/);
  assert.match(scope, /started_at/);
  assert.match(scope, /git rev-list -1 --first-parent --before=/);
  assert.match(scope, /origin\/<基准分支>/);
  assert.match(scope, /没有定时任务/);
  assert.match(scope, /没有一次状态为 `succeeded` 的执行/);
  assert.match(scope, /手敲的那次用同一个基准，不推进基准/);
  // the human can force a full pass
  assert.match(scope, /人调用时明确说了「全量」/);
});

test('only the picked states go to the live wave; the source wave stays full; an empty pick still runs the source wave', () => {
  assert.match(scope, /design-archive-query\.mjs" <worktree 根> affected <基准提交>/);
  assert.match(scope, /只用来定实时波/);
  assert.match(scope, /源码波每次全量/);
  assert.match(scope, /清单为空/);
  assert.match(reconcile, /增量时就是 `query affected <基准提交>` 交回的 `states`/);
  assert.match(reconcile, /增量时它也每次全量/);
});

test('the proposal table opens with the scope line, flags an unprocessed earlier table, and ends a failed batch with the full-run hint', () => {
  assert.match(proposal, /对账范围：增量——/);
  assert.match(proposal, /三样都要写：全量还是增量、为什么、对了几个状态/);
  assert.match(proposal, /上一次（<日期>）的提议表还没处理/);
  assert.match(proposal, /两张表不合并/);
  assert.match(proposal, /下次可说全量补上/);
  assert.match(scope, /上一次（<日期>）的提议表还没处理/);
  assert.match(scope, /下次可说全量补上/);
  assert.match(reconcile, /下次可说全量补上/);
});
