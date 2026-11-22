/**
 * Tripwire — dreaming tidies the device's one memory, and setup creates one device-level dreaming task.
 *
 * The behaviour lives in skill text, so these checks pin what a reader has to be able to follow:
 * - dreaming's SKILL.md points at the memory reference, names 「只跑记忆」, and stays under 5000 characters;
 * - the memory reference carries the closed set of dispositions (the same one `dyna dreaming table submit` accepts),
 *   adds only the paths it changed, commits once in home, and says how to roll back with `git revert`;
 * - setup's 「每周对账」 (the SKILL.md section and its reference) creates `dreaming-home`, never a per-repository
 *   `dreaming-<仓库名>`; the incremental-scope reference looks the task's run history up under the same id;
 * - setup's home reference writes `.tmp/` into the `.gitignore` it creates;
 * - the README names the device-level task, the memory pass and `dyna home memory check`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
// The dispositions a 记忆 row may carry, as `dyna dreaming table submit` accepts them (`RowTypes` in dyna/internal/dreaming/table.go).
const MEMORY_DISPOSITIONS = ['挪进项目', '合并', '订正', '毕业', '删除', '缩短索引行', '问人'];
const read = (...p) => readFileSync(join(pluginRoot, ...p), 'utf8');
const body = (md) => md.split(/^---\s*$/m).slice(2).join('---');
const section = (md, title) => {
  const m = md.match(new RegExp(`^## ${title}\\s*$([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, 'm'));
  assert.ok(m, `no 「## ${title}」 section`);
  return m[1];
};

const dreamingDir = ['skills', 'productivity', 'dreaming'];
const dreaming = body(read(...dreamingDir, 'SKILL.md'));
const memory = read(...dreamingDir, 'references', 'memory-tidy.md');
const scope = read(...dreamingDir, 'references', 'incremental-scope.md');
const setupSkill = body(read('skills', 'engineering', 'setup', 'SKILL.md'));
const weekly = read('skills', 'engineering', 'setup', 'references', 'weekly-dreaming.md');
const homeRef = read('skills', 'engineering', 'setup', 'references', 'home.md');
const readme = read('README.md');

test('dreaming SKILL.md points at the memory reference in one line, names 「只跑记忆」, and the body stays under 5000 characters', () => {
  assert.match(dreaming, /\[references\/memory-tidy\.md\]\(references\/memory-tidy\.md\)/);
  assert.match(dreaming, /只跑记忆/);
  assert.match(dreaming, /不需要 `DEVELOPMENT\.md`/);
  assert.match(dreaming, /home 或它的 `memory\/` 不存在就跳过/);
  assert.ok([...dreaming].length < 5000, `body is ${[...dreaming].length} characters`);
  // the steps live in the reference, not in the body
  assert.doesNotMatch(dreaming, /memory-check/);
});

test('the memory reference writes the steps in order: measure, judge, execute, ask', () => {
  const at = ['## 1. 量', '## 2. 判每一条', '## 3. 执行', '## 4. 问人'].map((h) => memory.indexOf(h));
  assert.ok(at.every((i) => i >= 0), `a step heading is missing: ${at}`);
  assert.deepEqual([...at].sort((a, b) => a - b), at);
  assert.match(memory, /dyna home memory check/);
  assert.match(memory, /originSessionId/);
  assert.match(memory, /先看出处，再看内容/);
  assert.match(memory, /判不准留在根里/);
});

test('judging reads a body only to merge, to correct, or to place an entry that has a project origin; an entry without one stays in the root unread', () => {
  const judge = section(memory, '2\\. 判每一条');
  assert.doesNotMatch(memory, /只在要合并、要订正时读正文/, 'the old rule contradicts reading content to judge ownership');
  assert.match(judge, /正文只在三种情形读/);
  assert.match(judge, /要合并/);
  assert.match(judge, /要订正/);
  assert.match(judge, /要判一条有项目出处（项目前缀、`originSessionId` 对得上某个项目）的条目归不归那个项目/);
  assert.match(judge, /没有项目出处的条目不为判归属读正文，留在根里/);
});

test('the memory reference lists exactly the dispositions `dyna dreaming table submit` accepts, each with what to do', () => {
  const table = memory.split('## 建议处置，和执行时做什么')[1].split('\n## ')[0];
  const listed = [...table.matchAll(/^\| (\S+) \|/gm)].map((m) => m[1]).filter((d) => d !== '建议处置');
  assert.deepEqual(listed, MEMORY_DISPOSITIONS);
  assert.match(memory, /保留内容更全的那份的路径/);
  assert.match(memory, /相对时间改成绝对日期/);
  assert.match(memory, /≤150 字/);
});

test('the three practices taken from consolidate-memory are written once, in the disposition table; the section on why it is not called points back at the table', () => {
  assert.equal([...memory.matchAll(/≤150 字/g)].length, 1, 'the hook length limit is stated more than once');
  assert.equal([...memory.matchAll(/保留内容更全/g)].length, 1, 'the merge practice is stated more than once');
  assert.equal([...memory.matchAll(/绝对日期/g)].length, 1, 'the absolute-date practice is stated more than once');
  const why = section(memory, '为什么不调 `consolidate-memory`');
  assert.match(why, /处置表/);
  assert.doesNotMatch(why, /^\s*-\s/m, 'the section lists the practices again');
});

test('execution commits only the paths it changed, commits once in home, pushes when there is an origin, and rolls back by a new commit', () => {
  const exec = section(memory, '3\\. 执行');
  assert.match(exec, /只提交自己改的路径/);
  assert.match(exec, /不全量 add/);
  assert.match(exec, /dyna git commit <路径…>/);
  assert.match(exec, /`memory\/` 和 `projects\/\*\/memory\/`/);
  assert.match(exec, /在 home 里提交一次/);
  assert.match(exec, /dreaming <日期>：记忆整理/);
  assert.match(exec, /`origin`/);
  assert.match(exec, /先毕业、再挪进项目、再合并、最后缩短索引行/);
  assert.match(exec, /退出码 0/);
  assert.match(memory, /回滚[^\n]*还原[^\n]*不改写历史/);
});

test('the memory pass opens no worktree and no PR, keeps its intermediates in home, says why it does not call consolidate-memory, and states the known limit', () => {
  assert.match(memory, /不开 worktree、不开 PR/);
  assert.match(memory, /`~\/home\/\.tmp\/dreaming\/<YYYY-MM-DD>\/`/);
  assert.match(memory, /`consolidate-memory`/);
  assert.match(memory, /已知限制/);
  assert.match(memory, /有会话在写记忆/);
});

test('the proposal-table reference lists the 记忆 row type and says the memory pass executes its own rows', () => {
  const ref = read(...dreamingDir, 'references', 'proposal-table.md');
  assert.match(ref, /^\| `记忆` \|/m);
  assert.match(ref, /\[memory-tidy\.md\]\(memory-tidy\.md\)/);
});

test('setup 「每周对账」 creates the device-level task dreaming-home, never a per-repository dreaming-<仓库名>', () => {
  const s = section(setupSkill, '每周对账');
  assert.match(s, /dreaming-home/);
  assert.match(s, /references\/weekly-dreaming\.md/);
  assert.match(s, /^完成条件：/m);
  assert.doesNotMatch(s, /dreaming-<仓库名>/);
  assert.match(setupSkill, /##\s*交回[\s\S]*每周对账[^\n]*dreaming-home/);
  assert.doesNotMatch(weekly, /dreaming-<仓库名>/);
  assert.doesNotMatch(weekly, /git-common-dir/);
  assert.match(weekly, /任务 id：`dreaming-home`/);
  assert.match(weekly, /目录：home/);
  assert.match(weekly, /home 那一步之后/);
  assert.match(weekly, /已有 id 为 `dreaming-home` 的任务：报给人/);
  assert.match(weekly, /第二个项目[^\n]*已有/);
});

test('the incremental-scope reference finds the run history under dreaming-home, not under a name derived from the repository', () => {
  assert.match(scope, /`dreaming-home`/);
  assert.doesNotMatch(scope, /dreaming-<仓库名>/);
  assert.doesNotMatch(scope, /git-common-dir/);
});

test('setup\'s home reference writes both .backup/ and .tmp/ into the .gitignore it creates', () => {
  const gitignore = homeRef.split('\n').find((l) => l.trimStart().startsWith('- `.gitignore`'));
  assert.ok(gitignore, 'home.md has no .gitignore line');
  assert.ok(gitignore.includes('.backup/'), gitignore);
  assert.ok(gitignore.includes('.tmp/'), gitignore);
});

test('the README names the device-level task, the memory pass and `dyna home memory check`', () => {
  assert.match(readme, /`dreaming-home`/);
  assert.doesNotMatch(readme, /`dreaming-<repo name>`/);
  assert.match(readme, /`dyna home memory check`/);
  assert.match(readme, /memory-tidy/);
  assert.match(readme, /only memory|memory only/i);
});
