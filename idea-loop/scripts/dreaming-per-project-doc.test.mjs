/**
 * Tripwire — dreaming-home goes through the project list after the memory pass (docs/spec/skills-read-home, ticket 07).
 *
 * The behaviour lives in skill text, so these checks pin what a reader has to be able to follow:
 * - SKILL.md has the 「逐个对账项目」 section between the memory pass and the flow, with the four steps, the skip rule, the
 *   "a project not finished means the run is not a success" rule and the hand-typed case; the memory pass is untouched;
 * - references/per-project.md carries the how (where --project, fetch, a worktree under home's .worktrees/, the two 2000
 *   character caps, only the device-map section rewritten) and points at setup's template instead of copying it;
 * - setup's home reference has the memory line in the project-map template, both 2000-character caps, and .worktrees/ in
 *   the .gitignore it creates;
 * - no dreaming reference reads the knowledge base through the code repository's base branch any more.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => readFileSync(join(pluginRoot, ...p), 'utf8');
const body = (md) => md.split(/^---\s*$/m).slice(2).join('---');
const section = (md, title) => {
  const m = md.match(new RegExp(`^## ${title}[^\\n]*$([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, 'm'));
  assert.ok(m, `no 「## ${title}」 section`);
  return m[1];
};

const dreamingDir = ['skills', 'productivity', 'dreaming'];
const skill = body(read(...dreamingDir, 'SKILL.md'));
const perProject = read(...dreamingDir, 'references', 'per-project.md');
const scope = read(...dreamingDir, 'references', 'incremental-scope.md');
const homeRef = read('skills', 'engineering', 'setup', 'references', 'home.md');

test('SKILL.md has 「逐个对账项目」 after the memory pass and before the flow, with the four steps', () => {
  const at = ['## 记忆一段', '## 逐个对账项目', '## 流程'].map((h) => skill.indexOf(h));
  assert.ok(at.every((i) => i >= 0), `a heading is missing: ${at}`);
  assert.deepEqual([...at].sort((a, b) => a - b), at);
  const s = section(skill, '逐个对账项目');
  assert.match(s, /项目清单[^\n]*顺序/);
  assert.match(s, /where --project <名字>/);
  assert.match(s, /git fetch/);
  assert.match(s, /origin\/<基准分支>/);
  assert.match(s, /`\.worktrees\/`/);
  assert.match(s, /DEVELOPMENT\.md` 的「分支」节/);
  assert.match(s, /项目地图[^\n]*2000 字/);
  assert.match(s, /commit/);
  assert.match(s, /「## 设备地图」一节[^\n]*2000 字/);
  assert.match(s, /「## 项目」一节由 setup 维护，不改/);
  assert.match(s, /references\/per-project\.md/);
});

test('a project that cannot run is skipped with one line; a project not finished makes the run not a success; the hand-typed run covers one project', () => {
  const s = section(skill, '逐个对账项目');
  assert.match(s, /本地 clone 不在、fetch 失败、`where` 报「还没搬」/);
  assert.match(s, /跳过，汇报里写一行原因，不挡后面的项目/);
  assert.match(s, /没对完，这次就不算成功/);
  assert.match(s, /人手敲[^\n]*只对这一个项目做 1–3 步/);
  assert.match(s, /hook[^\n]*`\.mcp\.json`[^\n]*`\.claude\/skills`[^\n]*不加载/);
});

test('the memory pass paragraph is the one #332 pinned', () => {
  const s = section(skill, '记忆一段');
  assert.equal(
    s.trim(),
    '设备上只有一份记忆（home 的 `memory/`）。全量调用时先整理它：量根索引、把项目事实挪进项目目录、直接提交到 home；步骤照 [references/memory-tidy.md](references/memory-tidy.md)。这一段开在 home 里也能跑，不需要 `DEVELOPMENT.md`；home 或它的 `memory/` 不存在就跳过。',
  );
});

test('per-project.md says how: where, fetch, a detached worktree under .worktrees/, delete it afterwards, skip reasons, the success rule', () => {
  assert.match(perProject, /project-map\.mjs" where --project <名字>/);
  assert.match(perProject, /git -C <cloneDir> fetch origin/);
  assert.match(perProject, /worktree add --detach <代码 worktree> origin\/<基准分支>/);
  assert.match(perProject, /<home>\/\.worktrees\/<名字>-<YYYY-MM-DD>\//);
  assert.match(perProject, /worktree remove --force <代码 worktree>/);
  assert.match(perProject, /<home>\/\.tmp\/dreaming\/<YYYY-MM-DD>\/<名字>\//);
  assert.match(perProject, /项目目录、代码 worktree、中间物目录三个绝对路径/);
  assert.match(perProject, /整次成功/);
  assert.match(perProject, /这次不算成功/);
  assert.match(perProject, /更早的一次成功执行/);
  assert.match(perProject, /设备地图照样重写/);
});

test('per-project.md rewrites the project map from setup\'s one template, not a copy, and the device map only inside its own section', () => {
  assert.match(perProject, /skills\/engineering\/setup\/references\/home\.md` 的「项目地图模板」/);
  assert.match(perProject, /「设备地图模板」/);
  assert.doesNotMatch(perProject, /# <名字> 项目地图|## 几层|## 什么问题去哪查/, 'no template of its own');
  assert.match(perProject, /不超过 2000 字/);
  assert.match(perProject, /从这一行起到下一个 `## ` 之前/);
  assert.match(perProject, /`## 项目` 和人写的跨项目规矩[^\n]*一个字节不动/);
  assert.match(perProject, /docs\/index\.md/);
});

test('setup\'s home reference: the project-map template points at the memory index and caps at 2000 characters like the device map; .gitignore has .worktrees/', () => {
  const projectMap = homeRef.slice(homeRef.indexOf('## 项目地图模板'));
  const deviceMap = homeRef.slice(homeRef.indexOf('## 设备地图模板'), homeRef.indexOf('## 项目地图模板'));
  assert.match(projectMap, /≤ 2000 字/);
  assert.match(deviceMap, /≤ 2000 字/);
  assert.match(projectMap, /记忆索引：`~\/home\/projects\/<名字>\/memory\/MEMORY\.md`/);
  const gitignore = homeRef.split('\n').find((l) => l.trimStart().startsWith('- `.gitignore`'));
  assert.ok(gitignore, 'home.md has no .gitignore line');
  for (const p of ['.backup/', '.tmp/', '.worktrees/']) assert.ok(gitignore.includes(p), `${p}: ${gitignore}`);
});

test('the base-point reference keeps one baseline for all projects and says an unfinished project pushes its next run back', () => {
  assert.match(scope, /基准点各项目共用/);
  assert.match(scope, /per-project\.md\]\(per-project\.md\) 的「整次成功」/);
  assert.match(scope, /\.tmp\/dreaming\/<日期>\/<名字>\/proposal\.md/);
  assert.doesNotMatch(scope, /git worktree list/);
});

test('no dreaming reference reads the knowledge base through the code repository\'s base branch, or opens a docs-only PR', () => {
  const dir = join(pluginRoot, ...dreamingDir, 'references');
  const banned = [
    /git ls-tree[^\n]*origin\//,
    /git show origin\/[^\n]*docs\//,
    /git rm/,
    /只改 `docs\/` 的 PR/,
    /同一个 PR/,
    /PR 正文/,
  ];
  const hits = [];
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.md'))) {
    const text = readFileSync(join(dir, f), 'utf8');
    for (const re of banned) if (re.test(text)) hits.push(`${f}: ${re}`);
  }
  assert.deepEqual(hits, []);
});

test('the reconcile steps give a subagent the project directory and the code worktree together', () => {
  assert.match(skill, /只给指针（项目目录和代码 worktree 的绝对路径/);
  assert.match(read(...dreamingDir, 'references', 'archive-reconcile.md'), /项目目录的绝对路径、代码 worktree（跑代码用）/);
  assert.match(read(...dreamingDir, 'references', 'missed-archive.md'), /项目目录的绝对路径、代码 worktree/);
});
