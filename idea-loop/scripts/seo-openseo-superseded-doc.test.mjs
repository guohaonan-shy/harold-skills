/**
 * Pins the sentences that make "OpenSEO 只认插件自带的那份；别处的配置顶替了它就在开场停下、说清删哪份" true
 * in the docs: seo-scan's 开场 step 「认 OpenSEO」 and its stop shapes, seo-setup's step 1, the six direction
 * agents still whitelisting only the plugin-named OpenSEO, and the plugin README rows.
 *
 * SEO_DOCS_ROOT points the test at another copy of the plugin (e.g. the text before the change), to
 * see it fail there first.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.env.SEO_DOCS_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '..');
// A file that does not exist reads as '' so a missing reference fails on its assertions, not on a throw.
const read = (...p) => (existsSync(join(root, ...p)) ? readFileSync(join(root, ...p), 'utf8') : '');
const body = (doc) => doc.split(/^---\s*$/m).slice(2).join('---');

const SCAN = body(read('skills', 'seo', 'seo-scan', 'SKILL.md'));
const SETUP = body(read('skills', 'seo', 'seo-setup', 'SKILL.md'));
const SCAN_REF = read('skills', 'seo', 'seo-scan', 'references', 'stops.md');
const SETUP_REF = read('skills', 'seo', 'seo-setup', 'references', 'openseo-superseded.md');
const README = read('README.md');

const PLUGIN_WHOAMI = 'mcp__plugin_idea-loop_openseo__whoami';
const AGENTS = ['technical-auditor', 'page-optimizer', 'keyword-miner', 'backlink-analyst', 'geo-analyst', 'results-analyst'];

/** The body of `## <title>` (up to the next `## ` heading), or '' when the heading is missing. */
function section(doc, title) {
  const m = doc.match(new RegExp(`^## ${title}\\s*$([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm'));
  return m ? m[1] : '';
}

/** The list item that starts with `<n>. ` inside a section, with its continuation lines. */
function item(sec, n) {
  const m = sec.match(new RegExp(`^${n}\\. [\\s\\S]*?(?=^\\d+\\. |(?![\\s\\S]))`, 'm'));
  return m ? m[0] : '';
}

const bothRemovals = (doc, label) => {
  assert.match(doc, /claude mcp remove <名字>/, `${label}: the user / local removal`);
  assert.match(doc, /\.mcp\.json/, `${label}: the project removal`);
  assert.match(doc, /重开会话/, `${label}: reopen the session`);
};

test('seo-scan 开场: a 「认 OpenSEO」 step sits before the project context is read', () => {
  const open = section(SCAN, '开场');
  const at = open.search(/认 OpenSEO/);
  assert.ok(at >= 0, 'no 认 OpenSEO step in 开场');
  const ctx = open.search(/get_project_context/);
  assert.ok(ctx > at, '认 OpenSEO must come before get_project_context');
});

test('seo-scan 开场: the step names the plugin whoami, and a superseded or missing OpenSEO stops before any agent or credits', () => {
  const step = item(section(SCAN, '开场'), 3) || section(SCAN, '开场');
  const s = step.slice(step.search(/认 OpenSEO/));
  assert.match(s, /插件名下的 `whoami`/, 'names the plugin-named whoami');
  assert.match(s, /顶替/);
  assert.match(s, /没连上/);
  assert.match(s, /不派 agent/);
  assert.match(s, /不花 credits/);
  assert.match(s, /references\/stops\.md/);
});

test('seo-scan: the gap gate stop shape moved into stops.md and the gate points at it', () => {
  assert.match(section(SCAN, '缺口关卡'), /references\/stops\.md/);
  assert.match(SCAN_REF, /停下等确认：<方向\.\.\.>/);
});

test('seo-scan: the stop sentence counts the two new opening stops', () => {
  assert.match(SCAN, /只有五种情形停下：开场的四种/);
  assert.ok(!/只有三种情形停下/.test(SCAN));
});

test('stops.md: three cases, each with where it goes', () => {
  assert.ok(SCAN_REF.includes(PLUGIN_WHOAMI), 'plugin name case');
  assert.match(SCAN_REF, /__whoami/);
  assert.match(SCAN_REF, /__get_project_context/);
  assert.match(SCAN_REF, /前缀下同时有/);
  assert.match(SCAN_REF, /往下走/);
  assert.match(SCAN_REF, /一个 OpenSEO 工具都没有|一个都没有/);
  assert.match(SCAN_REF, /\/mcp/);
});

test('stops.md: the superseded stop shape names the superseder and both removals', () => {
  assert.match(SCAN_REF, /`<名字>` 顶替了 idea-loop 插件自带的 OpenSEO/);
  bothRemovals(SCAN_REF, 'stops.md');
  assert.match(SCAN_REF, /不派[^\n]*agent|没派 agent/);
  assert.match(SCAN_REF, /推送/, 'a scheduled run has nobody there: push');
  assert.match(SCAN_REF, /研究日志/, 'says the research log is not written');
});

test('stops.md: the not-connected stop shape points at /mcp and the plugin openseo', () => {
  assert.match(SCAN_REF, /OpenSEO 没连上[^\n]*\/mcp|\/mcp[^\n]*idea-loop 插件的 openseo/);
});

test('seo-setup step 1: 认 OpenSEO comes before whoami, points at its reference, and keeps the /mcp clause', () => {
  const s1 = section(SETUP, '1\\. 连上 OpenSEO，定下项目');
  const at = s1.search(/认 OpenSEO/);
  assert.ok(at >= 0, 'no 认 OpenSEO in step 1');
  assert.ok(s1.search(/`whoami`。调不通/) > at, '认 OpenSEO precedes the whoami call');
  assert.match(s1, /references\/openseo-superseded\.md/);
  assert.match(s1, /顶替/);
  assert.match(s1, /告诉人在 `\/mcp` 里连上 `openseo`/, 'the old 连不上 sentence stays');
  assert.match(s1, /记「未做：OpenSEO 没连上」/, 'the old 连不上 follow-up stays');
});

test('openseo-superseded.md: tells the human which name, both removals, reopen, and what the later steps do meanwhile', () => {
  assert.match(SETUP_REF, /<名字>/);
  assert.match(SETUP_REF, /顶替/);
  bothRemovals(SETUP_REF, 'openseo-superseded.md');
  assert.match(SETUP_REF, /连不上/, 'later steps follow the 连不上 route until the human has removed it');
  assert.match(SETUP_REF, /未做/);
});

test('the six direction agents still whitelist only the plugin-named OpenSEO', () => {
  for (const name of AGENTS) {
    const doc = read('agents', `${name}.md`);
    const tools = doc.match(/^tools:\s*(.+)$/m)?.[1] ?? '';
    const openseo = tools.split(',').map((t) => t.trim()).filter((t) => /openseo/i.test(t));
    assert.deepEqual(openseo, ['mcp__plugin_idea-loop_openseo__*'], `${name}: tools line`);
  }
});

test('README: the seo-setup and seo-scan rows say OpenSEO is the plugin-bundled one only and what happens when another config supersedes it', () => {
  for (const cmd of ['`/idea-loop:seo-setup`', '`/idea-loop:seo-scan`']) {
    const row = README.split('\n').find((l) => l.startsWith(`| ${cmd} |`)) ?? '';
    assert.ok(row, `${cmd} row exists`);
    assert.match(row, /only the OpenSEO the plugin bundles/, `${cmd}: only the bundled one is recognised`);
    assert.match(row, /supersed/, `${cmd}: says another config superseding it`);
  }
});

test('the two SKILL.md bodies stay under 5000 characters', () => {
  assert.ok([...SCAN].length < 5000, `seo-scan ${[...SCAN].length}`);
  assert.ok([...SETUP].length < 5000, `seo-setup ${[...SETUP].length}`);
});
