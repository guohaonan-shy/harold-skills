/**
 * Pins the sentences that make "带连接器的 agent 只写禁用清单，连接器被别处配置改了名也拿得到工具" true in
 * the docs: the seven agents that use the OpenSEO or Mobbin connector have no `tools:` whitelist and
 * carry `disallowedTools`; no agent whitelists a plugin-named connector tool; seo-scan's opening step
 * recognises OpenSEO by the short names `whoami` + `get_project_context` and stops only when there is
 * none; seo-setup and the references no longer have the 「被顶替」 branch; agent-builder's template
 * and the plugin README say the same.
 *
 * SEO_DOCS_ROOT points the test at another copy of the plugin (e.g. the text before the change), to
 * see it fail there first.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.env.SEO_DOCS_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '..');
// A file that does not exist reads as '' so a missing file fails on its assertions, not on a throw.
const read = (...p) => (existsSync(join(root, ...p)) ? readFileSync(join(root, ...p), 'utf8') : '');
const body = (doc) => doc.split(/^---\s*$/m).slice(2).join('---');
const frontmatter = (doc) => doc.split(/^---\s*$/m)[1] ?? '';
const field = (doc, name) => frontmatter(doc).match(new RegExp(`^${name}:\\s*(.*)$`, 'm'))?.[1]?.trim();

/** Every file under `dir` (relative to the plugin root), recursively. */
function walk(dir) {
  const abs = join(root, dir);
  if (!existsSync(abs)) return [];
  return readdirSync(abs).flatMap((name) => {
    const p = join(abs, name);
    return statSync(p).isDirectory() ? walk(relative(root, p)) : [relative(root, p)];
  });
}

/** The body of `## <title>` (up to the next `## ` heading), or '' when the heading is missing. */
function section(doc, title) {
  const m = doc.match(new RegExp(`^## ${title}\\s*$([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm'));
  return m ? m[1] : '';
}

const CONNECTOR_AGENTS = ['technical-auditor', 'page-optimizer', 'keyword-miner', 'backlink-analyst', 'geo-analyst', 'results-analyst', 'uiux-researcher'];
const UNTOUCHED = { 'adr-reconciler': 'Read, Grep, Glob, Bash, Write, Skill, Agent', explorer: 'Read, Grep, Glob, Bash, Write, WebFetch', 'ui-master': 'Read' };

const SCAN_DOC = read('skills', 'seo', 'seo-scan', 'SKILL.md');
const SCAN = body(SCAN_DOC);
const SETUP = body(read('skills', 'seo', 'seo-setup', 'SKILL.md'));
const README = read('README.md');

test('the connector agents have no tools: line and disallow Edit, NotebookEdit and Agent', () => {
  for (const name of CONNECTOR_AGENTS) {
    const doc = read('agents', `${name}.md`);
    assert.ok(doc, `${name}: agents/${name}.md exists`);
    assert.equal(field(doc, 'tools'), undefined, `${name}: no tools: whitelist`);
    assert.equal(field(doc, 'disallowedTools'), 'Edit, NotebookEdit, Agent', `${name}: disallowedTools`);
  }
});

test('no agent whitelists a plugin-named connector tool, and no agent body spells a plugin-named tool', () => {
  const agents = walk('agents').filter((f) => f.endsWith('.md'));
  assert.ok(agents.length > 10, 'found the agent definitions');
  for (const f of agents) {
    const doc = read(f);
    assert.doesNotMatch(field(doc, 'tools') ?? '', /mcp__plugin_/, `${f}: tools line`);
    assert.doesNotMatch(body(doc), /mcp__plugin_/, `${f}: body`);
  }
});

test('the agents that use no connector keep their tools whitelist', () => {
  for (const [name, tools] of Object.entries(UNTOUCHED)) {
    assert.equal(field(read('agents', `${name}.md`), 'tools'), tools, name);
  }
});

test('only seo-scan\'s allowed-tools spells a plugin-named connector tool in skills/', () => {
  for (const f of walk('skills').filter((x) => x.endsWith('.md'))) {
    const doc = read(f);
    const text = f === join('skills', 'seo', 'seo-scan', 'SKILL.md') ? body(doc) : doc;
    assert.doesNotMatch(text, /mcp__plugin_idea-loop_/, f);
  }
  assert.match(field(SCAN_DOC, 'allowed-tools') ?? '', /mcp__plugin_idea-loop_openseo__whoami/, 'allowed-tools keeps the plugin full names');
});

test('seo-scan 开场: 认 OpenSEO sits before the project context and judges by the short names', () => {
  // 0.2.0: the opening steps live in references/opening.md; the SKILL.md 开场 section points at it.
  assert.match(section(SCAN, '开场'), /references\/opening\.md/);
  const open = read('skills', 'seo', 'seo-scan', 'references', 'opening.md');
  const at = open.search(/认 OpenSEO/);
  assert.ok(at >= 0, 'no 认 OpenSEO step in 开场');
  assert.ok(open.search(/get_project_context`（`projectId`）/) > at, '认 OpenSEO comes before reading the project context');
  const step = open.slice(at, open.search(/\n4\. /) > at ? open.search(/\n4\. /) : undefined);
  assert.match(step, /同时带 `whoami` 和 `get_project_context`/);
  assert.match(step, /往下/);
  assert.match(step, /一个都没有/);
  assert.match(step, /不派 agent/);
  assert.match(step, /stops\.md/);
});

test('seo-scan has no 被顶替 branch anywhere, and stops in four cases (three at the opening)', () => {
  for (const f of walk(join('skills', 'seo', 'seo-scan')).filter((x) => x.endsWith('.md'))) {
    assert.doesNotMatch(read(f), /顶替/, f);
  }
  assert.match(SCAN, /只有四种情形停下：开场的三种/);
  assert.ok(!/只有五种情形停下/.test(SCAN));
});

test('seo-scan: the one OpenSEO stop shape says OpenSEO is not connected and to connect it at /mcp', () => {
  const stops = SCAN + read('skills', 'seo', 'seo-scan', 'references', 'stops.md');
  assert.match(stops, /停下：OpenSEO 没连上/);
  assert.match(stops, /\/mcp/);
});

test('seo-setup step 1 has no 被顶替 check, its reference is gone, and nothing points at it', () => {
  assert.doesNotMatch(SETUP, /顶替/);
  assert.doesNotMatch(SETUP, /认 OpenSEO/);
  assert.ok(!existsSync(join(root, 'skills', 'seo', 'seo-setup', 'references', 'openseo-superseded.md')), 'openseo-superseded.md is deleted');
  for (const f of [...walk('skills'), ...walk('agents'), 'README.md']) {
    if (!f.endsWith('.md')) continue;
    assert.doesNotMatch(read(f), /openseo-superseded/, `${f} still points at the deleted reference`);
  }
  const s1 = section(SETUP, '1\\. 连上 OpenSEO，定下项目');
  assert.match(s1, /告诉人在 `\/mcp` 里连上 `openseo`/);
  assert.match(s1, /记「未做：OpenSEO 没连上」/);
});

test('uiux-research and the runtime reference: Mobbin tools by short name, a hand-configured Mobbin works', () => {
  const backend = read('skills', 'design', 'uiux-research', 'references', 'research-backend.md');
  assert.doesNotMatch(backend, /mcp__plugin_/);
  for (const t of ['search_screens', 'search_flows', 'search_sections']) assert.ok(backend.includes(`\`${t}\``), t);
  const desktop = read('runtime', 'claude-desktop.md');
  const mobbin = desktop.split('\n').find((l) => l.startsWith('- **Mobbin MCP**')) ?? '';
  assert.ok(mobbin, 'the Mobbin MCP line exists');
  assert.doesNotMatch(mobbin, /重复项|删掉那份手动配的|拿不到/);
  assert.match(mobbin, /手动配的/);
  assert.match(mobbin, /登录/);
});

test('agent-builder: a connector-using agent writes disallowedTools, not tools', () => {
  const doc = read('skills', 'productivity', 'agent-builder', 'SKILL.md');
  assert.doesNotMatch(doc, /mcp__<server>__\*/);
  assert.doesNotMatch(doc, /权限用 `tools` 表达/);
  assert.match(doc, /disallowedTools/);
  assert.match(doc, /用到连接器的 agent[^\n]*不写 `tools:`/);
  assert.match(doc, /不用连接器的 agent[^\n]*`tools`/);
});

test('README: seo-setup and seo-scan rows drop the superseded stop, agents say connector agents write a deny list only', () => {
  for (const cmd of ['`/idea-loop:seo-setup`', '`/idea-loop:seo-scan`']) {
    const row = README.split('\n').find((l) => l.startsWith(`| ${cmd} |`)) ?? '';
    assert.ok(row, `${cmd} row exists`);
    assert.doesNotMatch(row, /only the OpenSEO the plugin bundles|supersed|openseo-superseded/, cmd);
  }
  const scanRow = README.split('\n').find((l) => l.startsWith('| `/idea-loop:seo-scan` |')) ?? '';
  assert.match(scanRow, /`whoami` and `get_project_context`/);
  assert.match(README, /`disallowedTools`/);
  assert.match(README, /seo-connector-tools-doc\.test\.mjs/);
  assert.ok(!/seo-openseo-superseded-doc/.test(README), 'the old test is not listed any more');
});

test('the two SKILL.md bodies stay under 5000 characters', () => {
  assert.ok([...SCAN].length < 5000, `seo-scan ${[...SCAN].length}`);
  assert.ok([...SETUP].length < 5000, `seo-setup ${[...SETUP].length}`);
});
