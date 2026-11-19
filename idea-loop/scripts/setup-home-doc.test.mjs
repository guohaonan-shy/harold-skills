/**
 * Tripwire — setup's home step: the SKILL.md body only points at it, the steps live in references/home.md,
 * the three user-level changes are put to the human once, and the two map templates carry the lines the
 * rest of the design relies on.
 *
 * - SKILL.md 「home」: a pointer to references/home.md plus a completion condition, nothing of the steps.
 * - references/home.md: the three steps; step 3 shows the three changes together, asks once, does all that
 *   are still to do, and does not ask about the ones already in place; no second copy of the completion condition.
 * - the two map templates live in the wiki-conventions skill's references/home-maps.md (setup and dreaming both use
 *   them, so neither owns them): 设备地图模板 says to look the map up before answering about past decisions or project
 *   facts (≤ 2000 characters); 项目地图模板 has a line pointing at the project's own memory index (≤ 2000 characters).
 *   setup's home.md points at them by skill name.
 *
 * `SETUP_DOCS_ROOT` points the test at another copy of skills/engineering/setup (the text before the change),
 * to see that these checks fail on it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runDyna } from './dyna-test-bin.mjs';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const setupDir = process.env.SETUP_DOCS_ROOT || join(pluginRoot, 'skills', 'engineering', 'setup');
const readIn = (...p) => readFileSync(join(setupDir, ...p), 'utf8');
const skill = readIn('SKILL.md');
const body = skill.split(/^---\s*$/m).slice(2).join('---');
const home = (() => { try { return readIn('references', 'home.md'); } catch { return ''; } })();
const maps = readFileSync(join(pluginRoot, 'skills', 'productivity', 'wiki-conventions', 'references', 'home-maps.md'), 'utf8');

function section(text, title) {
  const m = text.match(new RegExp(`^## ${title}\\s*$([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, 'm'));
  return m ? m[1] : null;
}

/** The text of the first fenced block after a heading (the block holds `## ` lines of its own, so it is not cut by section()). */
function fenced(text, title) {
  const at = text.search(new RegExp(`^## ${title}\\s*$`, 'm'));
  assert.ok(at >= 0, `the reference has no 「${title}」 section`);
  const m = text.slice(at).match(/```markdown\n([\s\S]*?)\n```/);
  assert.ok(m, `「${title}」 has no fenced template`);
  return m[1];
}

test('SKILL.md 「home」 is a pointer and a completion condition, not the steps', () => {
  const s = section(body, 'home');
  assert.ok(s, 'SKILL.md body has no 「home」 section');
  assert.ok(s.includes('references/home.md'));
  assert.match(s, /^完成条件：/m);
  assert.ok([...s].length < 400, `「home」 section is ${[...s].length} characters: it is growing past a pointer`);
  for (const detail of ['git init', 'gh repo create', 'home config', 'autoMemoryDirectory', '.backup', 'plan', 'apply']) {
    assert.ok(!s.includes(detail), `body 「home」 summarises the reference (${detail})`);
  }
});

test('home.md writes the three steps, and the completion condition only once, in the SKILL.md body', () => {
  for (const title of ['1\\. 建 home', '2\\. 登记当前项目', '3\\. 改三处用户级配置']) {
    assert.ok(section(home, title), `home.md has no step 「${title.replace('\\', '')}」`);
  }
  assert.doesNotMatch(home, /完成条件/);
});

test('step 3 shows the three changes together, asks once, does them all, and does not ask about those already in place', () => {
  const s = section(home, '3\\. 改三处用户级配置');
  assert.match(s, /dyna home config plan/);
  assert.match(s, /dyna home config apply/);
  assert.match(s, /三项一起/);
  assert.match(s, /问一次/);
  assert.match(s, /「已是」的项[^\n]*不再问/);
  assert.match(s, /待改的项全做/);
  assert.doesNotMatch(s, /逐项/);
  assert.match(s, /备份/);
});

test('step 2 writes the project line in the shape the SessionStart hook reads', () => {
  const s = section(home, '2\\. 登记当前项目');
  assert.ok(s.includes('<名字>（<是什么>）: <本地路径>. Clone from <远端> if missing.'));
  assert.match(s, /转小写/);
});

test('the example project line in step 2 is read by `dyna home`, which finds the project and the repository it registers', () => {
  const line = section(home, '2\\. 登记当前项目').match(/`(example-app（[^`]*)`/)?.[1];
  assert.ok(line, 'step 2 has no example line');
  const dir = mkdtempSync(join(tmpdir(), 'setup-home-line-'));
  mkdirSync(join(dir, 'projects', 'example-app', 'docs'), { recursive: true });
  writeFileSync(join(dir, 'AGENTS.md'), `## 项目\n${line}\n`);
  const r = runDyna(['home', 'where', '--project', 'example-app'], { cwd: dir, env: { IDEA_LOOP_HOME: dir, HOME: dir } });
  assert.equal(r.status, 0, r.stderr);
  const found = JSON.parse(r.stdout);
  assert.equal(found.project, 'example-app');
  assert.equal(found.repo, 'acme/example-app');
});

test('the device map template says to look the map up before answering, within 2000 characters', () => {
  const t = fenced(maps, '设备地图模板');
  assert.ok(t.includes('回答关于过去决定或项目事实的问题前，先按地图去查'));
  assert.match(t, /docs\/raw\/[^\n]*不每轮读[^\n]*才 grep/);
  assert.ok([...t].length <= 2000, `device map template is ${[...t].length} characters`);
});

test('the project map template points at the project\'s own memory index, within 2000 characters', () => {
  const t = fenced(maps, '项目地图模板');
  assert.match(t, /^- 记忆索引：`~\/home\/projects\/<名字>\/memory\/MEMORY\.md`/m);
  assert.ok([...t].length <= 2000, `project map template is ${[...t].length} characters`);
});

test('setup\'s home.md has no map template of its own and points at the shared one by skill name', () => {
  assert.doesNotMatch(home, /^## (设备|项目)地图模板/m);
  assert.match(section(home, '1\\. 建 home'), /`idea-loop:wiki-conventions` 的「home 里的两份地图」/);
  assert.match(section(home, '2\\. 登记当前项目'), /`idea-loop:wiki-conventions` 的「home 里的两份地图」/);
});

test('the README names the home step', () => {
  const readme = readFileSync(join(pluginRoot, 'README.md'), 'utf8');
  assert.match(readme, /`~\/home`[^\n]*`references\/home\.md`/);
});
