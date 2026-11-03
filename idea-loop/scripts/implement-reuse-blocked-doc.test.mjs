/**
 * Tripwire — a ticket that stopped (`blocked` / `failed`) goes back to its original implementer once the
 * human has decided; a ticket that already landed is still redone by a fresh one.
 *
 * Spec implementer-reuse-and-compact, ticket 02. Before: after a stop the orchestrator always started a
 * new implementer from the half-finished branch, so everything the first one had read and why it stopped
 * had to be rediscovered. These checks pin the sentences that carry the change: the pending ledger
 * records the original implementer's agent id; "人回复后" calls it back with SendMessage first and starts
 * a new one only when that fails or no id was recorded; landed tickets keep the old path; the opening no
 * longer says every implementer "is" a new context; the implementer's definition says it may be the one
 * called back and what to do first; the README says the same.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => readFileSync(join(pluginRoot, ...p), 'utf8');

const implement = read('skills', 'engineering', 'implement', 'SKILL.md');
const implementer = read('agents', 'implementer.md');
const readme = read('README.md');

/** From a marker line's start to the next `## ` heading (or the end). */
function from(doc, marker, label) {
  const start = doc.indexOf(marker);
  assert.ok(start >= 0, `${label} has no "${marker}"`);
  const rest = doc.slice(start);
  const end = rest.indexOf('\n## ');
  return end < 0 ? rest : rest.slice(0, end);
}

test('the pending ledger records the original implementer\'s agent id', () => {
  const line = implement.split('\n').find((l) => l.includes('pending.md') && l.startsWith('- **等决定**'));
  assert.ok(line, '账本缺「等决定」那一条');
  assert.match(line, /agent id/, '「等决定」每条要多记原执行方的 agent id');
  assert.match(line, /Agent 工具/, '要写明 agent id 是起它时 Agent 工具返回的那个');
});

test('a stopped ticket\'s agent id is written into pending when it stops', () => {
  const stuck = from(implement, '## 卡住一张，别的接着做', 'implement/SKILL.md');
  assert.match(stuck, /agent id/, '「卡住一张」记进 pending 时要带上它的 agent id');
});

test('人回复后 calls the original implementer back first, and starts a new one only as the fallback', () => {
  const after = from(implement, '**人回复后**', 'implement/SKILL.md');
  const call = after.indexOf('SendMessage');
  assert.ok(call >= 0, '「人回复后」缺：先用 SendMessage 叫回原执行方');
  assert.match(after, /agent id/, '「人回复后」要说明靠 pending 里的 agent id 找回它');
  assert.match(after, /worktree 还在/, '叫回的前提：它的 worktree 还在');
  assert.match(after, /人的决定已写进工单[^。\n]*提交/, '消息只给指针：决定已写进工单 <路径>，提交 <SHA>');
  assert.match(after, /集成分支最新提交|集成分支的最新提交/, '消息里要带集成分支最新提交，让它先合进来');
  const fallback = after.search(/新起/);
  assert.ok(fallback > call, '新起是兜底，要写在 SendMessage 叫回之后');
  assert.match(after, /报错|没记 id|没有 id/, '兜底的条件：SendMessage 报错，或没记 id');
});

test('a landed ticket is still redone by a new implementer', () => {
  const after = from(implement, '**人回复后**', 'implement/SKILL.md');
  assert.match(after, /已经落地的工单[^。\n]*(照旧)?新起|落地[^。\n]*照旧新起/, '「人回复后」缺：已经落地的工单照旧新起');
  assert.match(after, /人验反馈/, '要点名人验反馈属于落地后的返工');
});

test('the opening no longer says every ticket\'s implementer is a new context', () => {
  const opening = from(implement, '## 前提', 'implement/SKILL.md');
  assert.doesNotMatch(opening, /每张工单的执行方都是新上下文/, '「前提」还写着每张工单的执行方「都是」新上下文');
  assert.match(opening, /第一次派出[^。\n]*新上下文/, '「前提」要改成：每张工单第一次派出时是新上下文');
  assert.match(opening, /叫回/, '「前提」要提到卡住后可能被叫回');
});

test('the implementer\'s definition says it may be called back, and to merge the integration branch first', () => {
  const start = implementer.indexOf('## 输入');
  const end = implementer.indexOf('\n## ', start + 1);
  const inputs = implementer.slice(start, end);
  const line = inputs.split('\n').find((l) => l.includes('不是第一次做'));
  assert.ok(line, '「输入」缺「这张工单不是第一次做」那一条');
  assert.match(line, /SendMessage 叫回来/, '要写明可能是同一个你被 SendMessage 叫回来');
  assert.match(line, /集成分支的最新提交合进来/, '被叫回时先把集成分支的最新提交合进来');
  assert.ok(line.indexOf('合进来') < line.indexOf('只做没勾'), '先合进来，再只做没勾的格');
});

test('README describes the redispatch the same way', () => {
  const row = readme.split('\n').find((l) => l.startsWith('| `/idea-loop:implement`'));
  assert.ok(row, 'README 缺 implement 那一行');
  assert.doesNotMatch(row, /dispatching fresh `idea-loop:implementer`s/, 'README 还写着只会派新的 implementer');
  assert.match(row, /SendMessage/, 'README 的 implement 行要说卡住的工单用 SendMessage 叫回原 implementer');
  assert.match(row, /agent id/, 'README 的 implement 行要说 pending 记 agent id');
  assert.match(row, /already landed[^.;|]*fresh|fresh[^.;|]*already landed|landed[^.;|]*new one/i, 'README 要说已落地的工单照旧新起');
});
