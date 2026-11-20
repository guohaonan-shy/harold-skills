/**
 * Tripwire — the runtime skill is the one place capabilities are listed: a closed set in SKILL.md, and one
 * reference per runtime with one `##` section per capability, named the same. Missing or extra on either
 * side goes red. The claude-desktop reference must still carry every desktop tool the 0.1.10 skill bodies
 * named (those bodies lose them in the next tickets); the magi reference carries the commands of the spec's
 * capability table.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RUNTIMES } from './runtime-detect.mjs';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(pluginRoot, 'skills', 'productivity', 'runtime');
const read = (...p) => readFileSync(join(dir, ...p), 'utf8');
const skill = read('SKILL.md');
const body = skill.replace(/^---\n[\s\S]*?\n---\n/, '');

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

/** The `##` section names of a reference. */
export const sectionsOf = (text) => [...text.matchAll(/^## (.+)$/gm)].map((m) => m[1].trim());

/** What a reference lacks (missing) or adds (extra) compared with the capability list. */
export function diff(capabilities, sections) {
  return {
    missing: capabilities.filter((c) => !sections.includes(c)),
    extra: sections.filter((s) => !capabilities.includes(s)),
  };
}

test('description only routes: one line, no steps or commands', () => {
  const description = skill.match(/^description: (.+)$/m)[1];
  assert.ok(description.length < 100, description);
  assert.doesNotMatch(description, /magi |node |runtime-detect/);
});

test('body stays under 5000 characters', () => {
  assert.ok(body.length < 5000, String(body.length));
});

test('the capability list is the closed set of eleven', () => {
  assert.deepEqual(capabilitiesOf(skill), CAPABILITIES);
});

/** The text of one `##` section of a reference. */
const sectionText = (text, name) => {
  const start = text.indexOf(`\n## ${name}\n`);
  assert.ok(start >= 0, `no ${name} section`);
  const rest = text.slice(start + 1);
  const end = rest.slice(3).search(/\n## /);
  return end < 0 ? rest : rest.slice(0, end + 3);
};

test('人的浏览器: the table row says it carries the human\'s own login, and the fallback is the shared one', () => {
  const row = skill.split('\n').find((l) => l.startsWith('| 人的浏览器 |'));
  assert.ok(row, 'no 人的浏览器 row');
  assert.match(row, /人自己的浏览器/);
  assert.match(row, /登录态/);
  assert.match(row, /退路\s*\|$/);
});

test('人的浏览器: claude-desktop uses Claude in Chrome and works in a new tab; magi says there is none and points to the fallback', () => {
  const desktop = sectionText(read('references', 'claude-desktop.md'), '人的浏览器');
  assert.match(desktop, /Claude in Chrome/);
  assert.match(desktop, /mcp__claude-in-chrome__/);
  assert.match(desktop, /新标签页/);
  assert.match(desktop, /登录页|验证码/);
  const magi = sectionText(read('references', 'magi.md'), '人的浏览器');
  assert.match(magi, /没有/);
  assert.match(magi, /退路/);
});

test('the body states the detection rule, the fallback with its two exceptions, and asking in the conversation', () => {
  for (const word of ['IDEA_LOOP_RUNTIME', 'MAGI_SESSION_ID', 'claude-desktop', 'runtime-detect.mjs']) assert.ok(body.includes(word), word);
  const fallback = body.slice(body.indexOf('## 退路'));
  assert.match(fallback, /未做：运行环境/);
  assert.match(fallback, /例外一[\s\S]*issue-dispatch[\s\S]*停下/);
  assert.match(fallback, /例外二[\s\S]*分组/);
  assert.match(fallback, /向人提问[\s\S]*对话里问/);
});

test('every runtime the detector knows has a reference, and no reference is left over', () => {
  // `<runtime>-<topic>.md` is a detail file one of that runtime's reference sections points at (the injected reference has a size cap)
  const files = readdirSync(join(dir, 'references')).map((f) => f.replace(/\.md$/, '')).filter((f) => !RUNTIMES.some((r) => f.startsWith(`${r}-`))).sort();
  assert.deepEqual(files, [...RUNTIMES].sort());
});

for (const name of RUNTIMES) {
  test(`${name} reference: sections match the capability list one to one, in order`, () => {
    const sections = sectionsOf(read('references', `${name}.md`));
    assert.deepEqual(diff(CAPABILITIES, sections), { missing: [], extra: [] });
    assert.deepEqual(sections, CAPABILITIES);
  });
}

test('the section check goes red when a capability is missing or one is added', () => {
  const sections = sectionsOf(read('references', 'magi.md'));
  assert.deepEqual(diff(CAPABILITIES, sections.slice(1)).missing, ['定时任务']);
  assert.deepEqual(diff(CAPABILITIES, [...sections, '新能力']).extra, ['新能力']);
  const cut = skill.replace(/^\| 推送 \|.*\n/m, '');
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
  '--headless --isolated', 'browser-lock.mjs', 'mcp__Claude_Browser__*', 'preview_start', 'navigate', 'read_page', 'get_page_text',
  'AskUserQuestion', 'Artifact', 'PushNotification', '发送文件的工具',
  'Connectors', 'claude mcp add', 'claude mcp get', '~/.claude/settings.json',
];

test('the claude-desktop reference carries every desktop tool name the 0.1.10 bodies used', () => {
  const text = read('references', 'claude-desktop.md');
  assert.deepEqual(DESKTOP_NAMES.filter((n) => !text.includes(n)), []);
});

// spec browser-fake-mic: the MCP browser cannot feed a fake microphone (sandbox on, real mic once granted), so the mic flow
// lives in a command-line session. The desktop 浏览器 section names it and points at the detail file (the injected reference has a
// size cap); deleting the subsection or the file, or turning it back into MCP steps, goes red here.
test('claude-desktop 浏览器 names the playwright-cli mic flow and points at a detail file that carries the procedure', () => {
  const section = sectionText(read('references', 'claude-desktop.md'), '浏览器');
  assert.ok(section.includes('@playwright/cli'), '浏览器 does not mention @playwright/cli');
  assert.ok(section.includes('### 要麦克风的流程'), '浏览器 has no 要麦克风的流程 subsection');
  const pointer = section.match(/references\/(claude-desktop-mic\.md)/);
  assert.ok(pointer, '要麦克风的流程 does not point at claude-desktop-mic.md');
  assert.ok(existsSync(join(dir, 'references', pointer[1])), 'the pointed file does not exist');
  const detail = read('references', pointer[1]);
  for (const word of ['--use-fake-device-for-media-stream', '--use-file-for-fake-audio-capture', '%noloop', 'chromiumSandbox', 'grantPermissions', 'clearPermissions', 'NotSupportedError']) assert.ok(detail.includes(word), word);
});

test('the magi reference has no mic-flow section (desktop only, decided)', () => {
  assert.ok(!read('references', 'magi.md').includes('playwright-cli'));
});

test('the magi reference carries the spec table\'s commands and the dispatch shape', () => {
  const text = read('references', 'magi.md');
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

test('the skill is findable: lives under productivity, with the two references and no stray files', () => {
  assert.ok(existsSync(join(dir, 'SKILL.md')));
  assert.deepEqual(readdirSync(dir).sort(), ['SKILL.md', 'references']);
});
