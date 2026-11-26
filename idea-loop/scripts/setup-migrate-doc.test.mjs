/**
 * Tripwire — setup's 「迁移」 section hands the steps to references/migrate.md (docs/spec/migrate-to-home, ticket 04).
 *
 * - SKILL.md 「迁移」: a pointer to references/migrate.md and a completion condition (the project is `inHome: true`,
 *   memories and user-level skills are 「已是」 or refused, the deleting PR is open); the steps are not in the body and
 *   no 「待补」 is left; the body stays under the 4500-character line.
 * - references/migrate.md: the steps in order, each one shaped 出表 → 人看 → 先备份 → 执行; the `memory` item
 *   is not switched at registration; the three memory steps are done in one run; the list of skills to delete is
 *   confirmed once more; the commands named are the ones the command line has.
 *
 * `SETUP_DOCS_ROOT` points the test at another copy of skills/engineering/setup (the text before the change), to
 * see that these checks fail on it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const setupDir = process.env.SETUP_DOCS_ROOT || join(pluginRoot, 'skills', 'engineering', 'setup');
const readIn = (...p) => readFileSync(join(setupDir, ...p), 'utf8');
const skill = readIn('SKILL.md');
const body = skill.split(/^---\s*$/m).slice(2).join('---');
const migrate = (() => { try { return readIn('references', 'migrate.md'); } catch { return ''; } })();

function section(text, title) {
  const m = text.match(new RegExp(`^## ${title}\\s*$([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, 'm'));
  return m ? m[1] : null;
}

test('SKILL.md 「迁移」 points at references/migrate.md with a completion condition and no 待补', () => {
  const s = section(body, '迁移');
  assert.ok(s, 'SKILL.md body has no 「迁移」 section');
  assert.ok(s.includes('references/migrate.md'));
  assert.doesNotMatch(s, /待补/);
  assert.match(s, /^完成条件：/m);
  assert.match(s, /`dyna home projects`/);
  assert.match(s, /`inHome: true`/);
  assert.match(s, /记忆、用户级 skill 两项「已是」或人拒绝/);
  assert.match(s, /删文件的 PR 已开/);
  assert.ok([...s].length < 500, `「迁移」 section is ${[...s].length} characters: it is growing past a pointer`);
  for (const detail of ['apply --only', 'autoMemoryDirectory', '.backup', 'dyna worktree']) {
    assert.ok(!s.includes(detail), `body 「迁移」 summarises the reference (${detail})`);
  }
  assert.ok(body.indexOf('## 迁移') < body.indexOf('## home'));
  // single source: the cycle 出表 → 人看 → 先备份 → 执行 is written in the reference only
  assert.ok(!s.includes('出表 → 人看'), 'body 「迁移」 repeats the 出表 → 人看 → 先备份 → 执行 cycle the reference owns');
});

test('the SKILL.md body stays under the 4500-character line', () => {
  assert.ok([...body].length <= 4500, `body is ${[...body].length} characters`);
});

test('migrate.md has the six steps, in order', () => {
  const titles = ['1\\. 登记', '2\\. 盘点并复制知识库', '3\\. 记忆', '4\\. 用户级 skill', '5\\. 代码仓库的 PR', '6\\. 收尾'];
  let last = -1;
  for (const title of titles) {
    assert.ok(section(migrate, title), `migrate.md has no step 「${title.replace('\\', '')}」`);
    const at = migrate.search(new RegExp(`^## ${title}\\s*$`, 'm'));
    assert.ok(at > last, `step 「${title.replace('\\', '')}」 is out of order`);
    last = at;
  }
  assert.match(migrate, /出表 → 人看 → 先备份 → 执行/);
});

test('step 1 registers the project and leaves the memory item for step 3', () => {
  const s = section(migrate, '1\\. 登记');
  assert.match(s, /home\.md/);
  assert.match(s, /home\.md 的第 3 步（四项用户级配置）这时不做/);
  assert.match(s, /`memory` 项[^\n]*第 3 步/);
  // every project to migrate on the device is registered before step 3, so each memory directory gets its prefix
  assert.match(s, /还有哪些 0\.1\.x 项目要迁，一并按本步登记/);
  assert.match(s, /所有要迁的项目都在第 3 步之前登记好/);
});

test('step 2 plans, fills the plan, applies, and handles the open PRs and a refused docs check', () => {
  const s = section(migrate, '2\\. 盘点并复制知识库');
  for (const want of ['dyna home config plan --only knowledge --project <名字>', 'dyna home config apply --only knowledge --project <名字> --plan', '.backup/<时间>/plan.json', '判不了', '开着且改了 `docs/` 的 PR', '先合', '搬进 home', '重名 slug', '死链']) {
    assert.ok(s.includes(want), `step 2 lacks ${want}`);
  }
});

test('step 3 does the three memory steps in one run, in order, and says what to do when the compression fails', () => {
  const s = section(migrate, '3\\. 记忆');
  assert.match(s, /同一次里做完，中间不开别的会话/);
  const a = s.indexOf('apply --only memories');
  const b = s.indexOf('apply --only memory`');
  const c = s.indexOf('idea-loop:dreaming');
  assert.ok(a >= 0 && b > a && c > b, 'memories, then memory, then the dreaming compression');
  assert.match(s, /`dyna home memory check`/);
  assert.match(s, /autoMemoryDirectory[^\n]*改回备份里/);
  assert.match(s, /旧目录不动/);
  // device-wide: done once; a later project's run is 「已是」 and skipped
  assert.match(s, /整台设备做一次/);
  assert.match(s, /整个跳过/);
  assert.match(migrate, /第 3 步的记忆整台设备只做一次，后面的项目走到它是「已是」，跳过/);
});

test('step 5 judges the hard-coded docs/ table row by row: only this repo\'s own tools change, shown to the human first', () => {
  const s = section(migrate, '5\\. 代码仓库的 PR');
  assert.match(s, /「写死 `docs\/` 的文件」逐条判，只改这个仓库自己的工具读写自己知识库的行/);
  for (const keep of ['写给装了插件的目标项目看的说明', '测试里当示例用的路径', '只是提到 `docs/` 的说明文字']) {
    assert.ok(s.includes(keep), `step 5 lacks the 「不改」 class ${keep}`);
  }
  assert.match(s, /判完把要改的行摆给人过目，人说了再改/);
});

test('step 4 confirms the list of skills to delete once more before it applies', () => {
  const s = section(migrate, '4\\. 用户级 skill');
  assert.match(s, /删的清单单独再确认一次/);
  assert.match(s, /人说「删」才继续/);
  assert.ok(s.indexOf('单独再确认一次') < s.indexOf('apply --only skills'), 'the second confirmation comes before apply');
  assert.match(s, /备份整个 `~\/\.claude\/skills\/`/);
});

test('step 5 opens the PR outside the main checkout and copies again before the merge; step 6 hands back the table and stops the dreaming task', () => {
  const s = section(migrate, '5\\. 代码仓库的 PR');
  assert.match(s, /主 checkout 之外/);
  assert.match(s, /dyna worktree add/);
  assert.match(s, /合并只由人做/);
  assert.match(s, /合之前[^\n]*再复制一次/);
  assert.match(s, /`## idea-loop` 一块/);
  const e = section(migrate, '6\\. 收尾');
  assert.match(e, /`dreaming-<仓库名>`/);
  assert.match(e, /只停用不删/);
  assert.match(e, /改前改后对照表/);
});

test('migrate.md names no project of the real world', () => {
  assert.doesNotMatch(migrate, /toeflair|tofelair|TOFEL|harold-skills/i);
});
