/**
 * Tripwire — ui-tickets.md says one thing about where the frozen canvas is. Since 0.2.0 (spec skills-read-home) the
 * canvas is committed to home, under <项目目录>/docs/design/tmp/, not on the code branch: neither it nor `delta/` is
 * in the implementer's worktree, and both are read and written through the tmp absolute path the dispatcher hands over.
 *
 * Spec ui-ticket-canvas-in-worktree, ticket 01 (issue #375). Before: 「输入」 said the canvas is committed on the
 * working branch ("worktree 里就有") while 「设计档案与最小差异」 said `tmp/` is not in version control and "你自己的
 * worktree 里没有它" — the implementer read two contradicting sentences. These checks pin the sentences that carry
 * the fix; they read the text and cannot see whether an executor follows it. The 0.1.x fix said "it is in your
 * worktree too"; on 0.2.0 the same intent (both sections agree) is pinned to the home location.
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

test('no sentence says the canvas is in the implementer\'s worktree (it lives in home since 0.2.0)', () => {
  const hits = doc.split('\n').filter((l) => /worktree 里就有|你的 worktree 里也有/.test(l));
  assert.deepEqual(hits, [], `仍说执行方 worktree 里有画布: ${hits.join(' | ')}`);
});

test('「设计档案与最小差异」 says the canvas is committed to home, with delta/ and the rest of tmp/, and not on the code branch', () => {
  const s = section('设计档案与最小差异');
  assert.match(s, /<项目目录>\/docs\/design\/tmp\/<spec-slug>\//, '缺：tmp 绝对路径在项目目录下');
  assert.match(s, /画布[^。]*已 `commit` 到 home/, '缺：画布冻结时已提交到 home');
  assert.match(s, /`delta\/`[^。]*也都在这里/, '缺：delta/ 和画布在同一处');
  assert.match(s, /不在代码分支上[^。]*worktree 里读不到/, '缺：执行方 worktree 里读不到');
});

test('「设计档案与最小差异」 keeps canvas and delta read/written through the tmp absolute path, with the reason', () => {
  const s = section('设计档案与最小差异');
  assert.match(s, /画布和最小差异都用[^。]*绝对路径读写/, '缺：画布和最小差异都用绝对路径读写');
  assert.match(s, /同一处/, '缺理由：两样在同一处');
  assert.match(s, /home 里最新/, '缺理由：读到 home 里最新的画布');
});

test('「输入」 says the same: canvas in home, not in the worktree, read through the tmp absolute path', () => {
  const s = section('输入');
  const line = s.split('\n').find((l) => l.includes('**HTML 画布**'));
  assert.ok(line, '「输入」没有 HTML 画布那一条');
  assert.match(line, /`commit` 到 home/, '「输入」要说画布提交到 home');
  assert.match(line, /worktree 读不到/, '「输入」要说执行方 worktree 读不到');
  assert.match(line, /tmp 绝对路径/, '要指明读写用 tmp 绝对路径');
  assert.match(line, /设计档案与最小差异/, '要指向「设计档案与最小差异」');
});
