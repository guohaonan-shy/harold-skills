/**
 * Tripwire — ui-tickets.md says one thing about where the frozen canvas is: committed, so it is in the
 * implementer's worktree too; `delta/` is not committed, so it is only in the integration worktree; both are
 * read and written through the tmp absolute path the dispatcher hands over.
 *
 * Spec ui-ticket-canvas-in-worktree, ticket 01 (issue #375). Before: 「输入」 said the canvas is committed on the
 * working branch ("worktree 里就有") while 「设计档案与最小差异」 said `tmp/` is not in version control and "你自己的
 * worktree 里没有它" — the implementer read two contradicting sentences. These checks pin the sentences that carry
 * the fix; they read the text and cannot see whether an executor follows it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const doc = readFileSync(join(pluginRoot, 'skills', 'engineering', 'implement', 'references', 'ui-tickets.md'), 'utf8');

function section(title) {
  const lines = doc.split('\n');
  const start = lines.findIndex((l) => l.startsWith(`## ${title}`));
  assert.ok(start >= 0, `no "## ${title}" section`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith('## '));
  return rest.slice(0, end < 0 ? undefined : end).join('\n');
}

test('no sentence says the implementer\'s worktree lacks the canvas', () => {
  const hits = doc.split('\n').filter((l) => /worktree 里没有/.test(l));
  assert.deepEqual(hits, [], `仍说执行方 worktree 里没有: ${hits.join(' | ')}`);
});

test('「设计档案与最小差异」 says the canvas is committed and also in the implementer\'s worktree', () => {
  const s = section('设计档案与最小差异');
  assert.match(s, /画布[^。]*已提交/, '缺：画布冻结时已提交');
  assert.match(s, /你的 worktree 里也有/, '缺：执行方 worktree 里也有一份');
});

test('「设计档案与最小差异」 says delta/ (and the rest of tmp/) exists only in the integration worktree', () => {
  const s = section('设计档案与最小差异');
  assert.match(s, /`delta\/`[^。]*只在集成 worktree/, '缺：delta/ 只在集成 worktree');
});

test('「设计档案与最小差异」 keeps canvas and delta read/written through the tmp absolute path, with the reason', () => {
  const s = section('设计档案与最小差异');
  assert.match(s, /画布和最小差异都用[^。]*绝对路径读写/, '缺：画布和最小差异都用绝对路径读写');
  assert.match(s, /同一处/, '缺理由：两样在同一处');
  assert.match(s, /集成分支上最新/, '缺理由：读到集成分支上最新的画布');
  assert.match(s, /不会自动进/, '缺：冻结后推上集成分支的新版本不会自动进执行方已开好的 worktree');
});

test('「输入」 keeps "worktree 里就有" and points at the tmp absolute path for reads and writes', () => {
  const s = section('输入');
  assert.match(s, /worktree 里就有/, '「输入」丢了「worktree 里就有」');
  const line = s.split('\n').find((l) => l.includes('worktree 里就有'));
  assert.match(line, /tmp 绝对路径/, '「worktree 里就有」那一条要指明读写仍用 tmp 绝对路径');
  assert.match(line, /设计档案与最小差异/, '要指向「设计档案与最小差异」');
});
