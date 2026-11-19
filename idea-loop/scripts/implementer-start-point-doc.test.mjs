/**
 * Tripwire — the implementer aligns its fresh worktree to the start-point commit without a command
 * that throws changes away.
 *
 * Spec implementer-start-point-non-destructive, ticket 01 (issue #160). Before: 「开工前」 step 1 told
 * the executor to run a hard reset to the start-point SHA; auto mode's classifier refused it as a
 * destructive action (84 recorded refusals), and each executor spent several rounds finding a
 * spelling that passed. These checks pin the replacement: check the work tree is empty, fast-forward
 * to the start point, and only when that cannot fast-forward point the executor's own branch at the
 * start point; the finish line "HEAD equals the start point" stays; the other two places that said
 * "reset" / "不用再 reset" now say "对齐起点". The `reset --soft` that squashes the final commit stays.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const doc = readFileSync(join(pluginRoot, 'agents', 'implementer.md'), 'utf8');

function section(title) {
  const lines = doc.split('\n');
  const start = lines.findIndex((l) => l.startsWith(`## ${title}`));
  assert.ok(start >= 0, `implementer.md has no "## ${title}" section`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith('## '));
  return rest.slice(0, end < 0 ? undefined : end).join('\n');
}

test('the definition no longer contains a hard reset; the soft reset that squashes the final commit stays', () => {
  assert.doesNotMatch(doc, /reset --hard/, 'implementer.md 里还有 reset --hard');
  assert.match(doc, /git reset --soft \$T/, '落地前压成一个 commit 用的 reset --soft 不该被动');
});

test('开工前 step 1 aligns the start point in order: empty work tree, fast-forward, own branch to the start point, HEAD check', () => {
  const step = section('开工前').split('\n').find((l) => l.startsWith('1.'));
  assert.ok(step, '「开工前」缺第 1 步');
  const at = (re, what) => {
    const m = step.search(re);
    assert.ok(m >= 0, `第 1 步缺「${what}」`);
    return m;
  };
  const status = at(/git status --short/, '核工作区为空（git status --short）');
  const ff = at(/git merge --ff-only <起点 SHA>/, '快进到起点（git merge --ff-only <起点 SHA>）');
  const branch = at(/git checkout -B <[^>]*分支[^>]*> <起点 SHA>/, '快进不了时把自己的分支指到起点（git checkout -B <你的分支> <起点 SHA>）');
  const head = at(/git rev-parse HEAD/, '核 HEAD 等于起点');
  assert.ok(status < ff && ff < branch && branch < head, '第 1 步的顺序要是：核工作区 → 快进 → 快进不了时 checkout -B → 核 HEAD');
  assert.match(step, /快进不了/, '要写明 checkout -B 只在快进不了时用');
  assert.match(step, /等于(它|起点)/, '完成条件「HEAD 等于起点 SHA」要留着');
});

test('the two places that said "reset" now say "对齐起点", meaning unchanged', () => {
  const inputs = section('输入');
  const half = inputs.split('\n').find((l) => l.includes('上次卡住留下的半成品分支'));
  assert.ok(half, '「输入」缺半成品分支那条');
  assert.match(half, /对齐起点之后 `git merge --squash <分支>`/, '半成品那条要写「对齐起点之后 `git merge --squash <分支>`」');
  const again = inputs.split('\n').find((l) => l.includes('这张工单不是第一次做时的原因'));
  assert.ok(again, '「输入」缺不是第一次做那条');
  assert.match(again, /不用再对齐起点/, '不是第一次做那条要写「不用再对齐起点」');
  const step2 = section('开工前').split('\n').find((l) => l.startsWith('2.'));
  assert.match(step2, /对齐起点之后还不干净/, '第 2 步要写「对齐起点之后还不干净」');
  assert.doesNotMatch(doc, /reset 之后|不用再 reset/, '还有「reset 之后」「不用再 reset」的旧措辞');
});
