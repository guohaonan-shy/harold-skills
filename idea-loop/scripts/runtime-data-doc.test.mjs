/**
 * Tripwire — the runtime data is the one place capabilities are listed: a closed set in runtime/capabilities.md,
 * and one file per runtime in runtime/ with one `##` section per capability, named the same. Missing or extra on
 * either side goes red. The claude-desktop data must still carry every desktop tool the 0.1.10 skill bodies named;
 * the magi data carries the commands of the spec's capability table.
 *
 * It used to guard the runtime skill (`skills/productivity/runtime/`, with `references/`); the skill is gone and
 * the same files are the plugin's `runtime/` directory, read by `dyna runtime`. What went with the skill, and why:
 *   - "description only routes", "body stays under 5000 characters", "the skill is findable: SKILL.md and
 *     references/ only": they were about SKILL.md, which no longer exists; `runtime/` has no size limit of its own
 *     (the injected data is held under the hook's 10,000 characters by dyna/internal/runtime's tests).
 *   - "the body states the detection rule ... and the fallback": the detection rule and how to add a runtime moved
 *     into `dyna runtime --help` (dyna/internal/runtime tests); the fallback and its two exceptions are still
 *     asserted here, on capabilities.md.
 *   - "every runtime the detector knows has a reference": dyna/internal/runtime's tests check the known names
 *     against the files; here the files must be exactly the two runtimes the plugin ships.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(pluginRoot, 'runtime');
const read = (name) => readFileSync(join(dir, name), 'utf8');
const capabilitiesMd = read('capabilities.md');
const RUNTIMES = ['claude-desktop', 'magi'];

const CAPABILITIES = ['定时任务', '会话内循环', '会话管理', '浏览器', '人的浏览器', '向人提问', '发布审阅页', '推送', '发文件给人', '调用 MCP', '装与设置'];

/** The capability names in the first column of the table under 「能力清单」. */
export function capabilitiesOf(text) {
  const start = text.indexOf('## 能力清单');
  assert.ok(start >= 0, 'no 能力清单 section');
  const rest = text.slice(start + 1);
  const end = rest.search(/\n## /);
  const section = rest.slice(0, end < 0 ? undefined : end);
  return section.split('\n').filter((l) => l.startsWith('|')).slice(2).map((l) => l.split('|')[1].trim());
}

/** The `##` section names of a runtime's data. */
export const sectionsOf = (text) => [...text.matchAll(/^## (.+)$/gm)].map((m) => m[1].trim());

/** What a runtime's data lacks (missing) or adds (extra) compared with the capability list. */
export function diff(capabilities, sections) {
  return {
    missing: capabilities.filter((c) => !sections.includes(c)),
    extra: sections.filter((s) => !capabilities.includes(s)),
  };
}

test('the capability list is the closed set of eleven', () => {
  assert.deepEqual(capabilitiesOf(capabilitiesMd), CAPABILITIES);
});

/** The text of one `##` section of a runtime's data. */
const sectionText = (text, name) => {
  const start = text.indexOf(`\n## ${name}\n`);
  assert.ok(start >= 0, `no ${name} section`);
  const rest = text.slice(start + 1);
  const end = rest.slice(3).search(/\n## /);
  return end < 0 ? rest : rest.slice(0, end + 3);
};

test('人的浏览器: the table row says it carries the human\'s own login, and the fallback is the shared one', () => {
  const row = capabilitiesMd.split('\n').find((l) => l.startsWith('| 人的浏览器 |'));
  assert.ok(row, 'no 人的浏览器 row');
  assert.match(row, /人自己的浏览器/);
  assert.match(row, /登录态/);
  assert.match(row, /退路\s*\|$/);
});

test('人的浏览器: claude-desktop uses Claude in Chrome and works in a new tab; magi says there is none and points to the fallback', () => {
  const desktop = sectionText(read('claude-desktop.md'), '人的浏览器');
  assert.match(desktop, /Claude in Chrome/);
  assert.match(desktop, /mcp__claude-in-chrome__/);
  assert.match(desktop, /新标签页/);
  assert.match(desktop, /登录页|验证码/);
  const magi = sectionText(read('magi.md'), '人的浏览器');
  assert.match(magi, /没有/);
  assert.match(magi, /退路/);
});

test('capabilities.md states the fallback with its two exceptions and asking in the conversation, and nothing about the removed skill', () => {
  const fallback = capabilitiesMd.slice(capabilitiesMd.indexOf('## 退路'));
  assert.match(fallback, /未做：运行环境/);
  assert.match(fallback, /例外一[\s\S]*issue-dispatch[\s\S]*停下/);
  assert.match(fallback, /例外二[\s\S]*分组/);
  assert.match(fallback, /向人提问[\s\S]*对话里问/);
  for (const gone of ['## 怎么用', '## 检测规则', '## 加一种运行环境', 'runtime-detect.mjs', 'idea-loop:runtime']) assert.ok(!capabilitiesMd.includes(gone), gone);
});

test('the runtime directory holds capabilities.md and one data file per runtime the plugin ships, and nothing else', () => {
  assert.deepEqual(readdirSync(dir).sort(), ['capabilities.md', ...RUNTIMES.map((n) => `${n}.md`)].sort());
});

for (const name of RUNTIMES) {
  test(`${name} data: sections match the capability list one to one, in order`, () => {
    const sections = sectionsOf(read(`${name}.md`));
    assert.deepEqual(diff(CAPABILITIES, sections), { missing: [], extra: [] });
    assert.deepEqual(sections, CAPABILITIES);
  });
}

test('the section check goes red when a capability is missing or one is added', () => {
  const sections = sectionsOf(read('magi.md'));
  assert.deepEqual(diff(CAPABILITIES, sections.slice(1)).missing, ['定时任务']);
  assert.deepEqual(diff(CAPABILITIES, [...sections, '新能力']).extra, ['新能力']);
  const cut = capabilitiesMd.replace(/^\| 推送 \|.*\n/m, '');
  assert.notDeepEqual(capabilitiesOf(cut), CAPABILITIES);
});

// Every desktop tool or interface the 0.1.10 skill and agent bodies named, found by grepping them.
const DESKTOP_NAMES = [
  'mcp__scheduled-tasks__list_scheduled_tasks', 'create_scheduled_task', 'update_scheduled_task', 'mcp__scheduled-tasks__list_task_runs',
  'CronCreate', 'CronList', 'CronDelete',
  'mcp__ccd_session_mgmt__list_sessions', 'mcp__ccd_session_mgmt__send_message', 'mcp__ccd_session_mgmt__export_transcript',
  'start_session', 'list_sections', 'create_section', 'detach_session', 'move_sessions', 'set_session_title', 'archive_session', 'get_session',
  'ToolSearch', 'SendMessage',
  'mcp__playwright__browser_*', 'browser_navigate', 'browser_evaluate', 'browser_run_code', 'browser_run_code_unsafe', 'browser_close', 'browser_take_screenshot',
  '--headless --isolated', 'dyna ui lock acquire', 'dyna ui lock release', 'dyna runtime handoff', 'mcp__Claude_Browser__*', 'preview_start', 'navigate', 'read_page', 'get_page_text',
  'AskUserQuestion', 'Artifact', 'PushNotification', '发送文件的工具',
  'Connectors', 'claude mcp add', 'claude mcp get', '~/.claude/settings.json',
];

test('the claude-desktop data carries every desktop tool name the 0.1.10 bodies used, and calls the lock and the hand-over by their dyna commands', () => {
  const text = read('claude-desktop.md');
  assert.deepEqual(DESKTOP_NAMES.filter((n) => !text.includes(n)), []);
  assert.ok(!text.includes('browser-lock.mjs') && !text.includes('desktop-handoff.mjs'), 'the old scripts are not named');
});

test('the magi data carries the spec table\'s commands and the dispatch shape', () => {
  const text = read('magi.md');
  const needs = [
    'magi cron create', '--action create_session', '--cwd', '--expr', '人在 magi 设的时区', 'magi cron list', 'magi cron show',
    'magi wake every', 'magi wake list', 'magi wake cancel',
    'magi sessions list', 'magi sessions start', 'magi sessions send', 'magi sessions show', '-o', 'magi sessions stop', '分组：没有',
    'magi browser', 'window new', '--tab', '不能执行任意 JS', '元素盒子',
    '编号选项', 'magi artifact push', 'magi.reply', 'PushNotification', '把一页摆给人看：没有', '截一张图',
    'magi mcp list', 'magi mcp call', 'key=value', 'Integrations → MCP servers', '/plugin', '$CLAUDE_CONFIG_DIR/settings.json',
    'dispatch-<仓库名>', '--slug <仓库名>-<号>', '用 Skill 工具调 idea-loop:',
  ];
  assert.deepEqual(needs.filter((n) => !text.includes(n)), []);
  // measured 2026-11-06: magi cron reads the expression in the human's timezone, not UTC
  assert.ok(!text.includes('UTC'), 'magi cron expressions are not UTC');
  const dispatch = text.slice(text.indexOf('### 调度'));
  // a session cannot archive itself (measured 2026-11-06); it stops itself instead
  assert.ok(!dispatch.includes('归档自己'), 'magi sessions cannot archive themselves');
  for (const word of ['每轮新开', '停掉自己', '前缀', 'stopped / exited / dead', '最近 2 小时有活动', '每轮最多开 3']) assert.ok(dispatch.includes(word), word);
});

test('no data file points at a deleted skill, SKILL.md or an old script', () => {
  for (const file of readdirSync(dir)) {
    const text = read(file);
    for (const gone of ['idea-loop:runtime', 'idea-loop:browser', 'SKILL.md', '.mjs', '${CLAUDE_PLUGIN_ROOT}/scripts']) assert.ok(!text.includes(gone), `${file}: ${gone}`);
  }
});
