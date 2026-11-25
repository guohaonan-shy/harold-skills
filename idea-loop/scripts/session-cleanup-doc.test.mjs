// #450: an issue session makes its own worktree and, before it archives itself, takes back what it made
// (processes in the worktree, the worktree with its .tmp/, the local branch). The dispatcher only opens sessions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const section = (md, title) => {
  const start = md.indexOf(`\n## ${title}`);
  assert.ok(start >= 0, `没有「${title}」一节`);
  const end = md.indexOf('\n## ', start + 1);
  return md.slice(start, end < 0 ? undefined : end);
};

test('issue-session 收尾：先 dyna worktree remove 收回资源，再「会话收尾」归档', () => {
  const close = section(read('skills/engineering/issue-session/SKILL.md'), '收尾');
  const remove = close.indexOf('dyna worktree remove');
  const archive = close.indexOf('「会话收尾」');
  assert.ok(remove >= 0, '收尾里要有 dyna worktree remove');
  assert.ok(archive > remove, '归档在收回资源之后');
});

test('issue-session 开场：开在 clone 里就自己建 worktree 并进去', () => {
  const open = section(read('skills/engineering/issue-session/SKILL.md'), '开场');
  assert.match(open, /dyna worktree add <号>-<slug> --repo <clone>/);
  assert.match(open, /「进自己的 worktree」/);
});

test('issue-dispatch 不再建 worktree，会话开在 clone 里', () => {
  const md = read('skills/engineering/issue-dispatch/SKILL.md');
  assert.doesNotMatch(md, /和建 worktree/);
  assert.match(md, /不建 worktree/);
});

test('能力模板的会话管理有「进自己的 worktree」，开会话传的是 clone', () => {
  const md = read('runtime/capabilities.md');
  assert.match(md, /- \*\*进自己的 worktree\*\*：传入：/);
  assert.match(md, /- \*\*开一个 issue 会话\*\*：传入：项目的 clone/);
});
