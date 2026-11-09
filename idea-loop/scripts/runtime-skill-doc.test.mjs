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

const CAPABILITIES = ['定时任务', '会话内循环', '会话管理', '浏览器', '向人提问', '发布审阅页', '推送', '发文件给人', '调用 MCP', '装与设置'];

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

test('the capability list is the closed set of ten', () => {
  assert.deepEqual(capabilitiesOf(skill), CAPABILITIES);
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
  const files = readdirSync(join(dir, 'references')).map((f) => f.replace(/\.md$/, '')).sort();
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
  'CronCreate', 'CronList', 'CronDelete', '调度 loop 已到期', 'recurring: false',
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
  for (const word of ['每轮新开', '停掉自己', '没有 7 天到期', '前缀', 'stopped / exited / dead', 'triageCap', '每轮最多开 3']) assert.ok(dispatch.includes(word), word);
});

test('the skill is findable: lives under productivity, with the two references and no stray files', () => {
  assert.ok(existsSync(join(dir, 'SKILL.md')));
  assert.deepEqual(readdirSync(dir).sort(), ['SKILL.md', 'references']);
});
