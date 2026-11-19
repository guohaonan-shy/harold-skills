/**
 * Pins the plugin-bundled MCP convention: every `mcp__` name in an agent's frontmatter `tools` or a
 * skill's frontmatter `allowed-tools` is a plugin-scoped name (`mcp__plugin_...`), and
 * `idea-loop/AGENTS.md` carries the 「插件自带的 MCP」 section a maintainer reads before writing one.
 *
 * Only frontmatter is read: the template line `mcp__<server>__*` in agent-builder's body is not a
 * whitelist entry. PLUGIN_MCP_DOCS_ROOT points the test at another copy of the plugin, to see it
 * fail there first.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.env.PLUGIN_MCP_DOCS_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '..');

/** The text between the opening and closing `---` of a file, or '' when there is none. */
function frontmatter(doc) {
  const m = doc.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return m ? m[1] : '';
}

/** The value of one frontmatter field, including the `- item` / indented lines that continue it. */
function field(fm, name) {
  const lines = fm.split('\n');
  const start = lines.findIndex((l) => l.startsWith(`${name}:`));
  if (start < 0) return '';
  const out = [lines[start].slice(name.length + 1)];
  for (const l of lines.slice(start + 1)) {
    if (!/^(\s|-)/.test(l)) break;
    out.push(l);
  }
  return out.join('\n');
}

/** Every `mcp__…` name in `tools` / `allowed-tools` of one file's text that is not plugin-scoped. */
export function strayMcpNames(doc) {
  const fm = frontmatter(doc);
  const listed = `${field(fm, 'tools')}\n${field(fm, 'allowed-tools')}`;
  return (listed.match(/mcp__[^\s,)]*/g) ?? []).filter((n) => !n.startsWith('mcp__plugin_'));
}

/** Absolute paths of every `.md` file under `dir` whose basename is `name` (any basename when null). */
function walk(dir, name) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return walk(p, name);
    return !name || e.name === name ? [p] : [];
  });
}

// ---------- the scan ----------

test('strayMcpNames: reports a name from another config, passes plugin-scoped names of any plugin', () => {
  const agent = '---\nname: x\ntools: Read, mcp__openseo__*, mcp__plugin_idea-loop_openseo__*\n---\nbody mcp__body__*';
  assert.deepEqual(strayMcpNames(agent), ['mcp__openseo__*']);
  const skill =
    '---\nname: y\nallowed-tools: Read, Bash(git add:*), mcp__plugin_excalidrawer_excalidrawer__*, mcp__plugin_posthog_posthog__*\n---\n';
  assert.deepEqual(strayMcpNames(skill), []);
});

test('strayMcpNames: reads the YAML list form, ignores description and body', () => {
  const doc =
    '---\nname: z\ndescription: 用 mcp__foo__bar 的流程\nallowed-tools:\n  - Read\n  - mcp__plugin_idea-loop_mobbin__*\n  - mcp__mobbin__*\n---\nmcp__body__*';
  assert.deepEqual(strayMcpNames(doc), ['mcp__mobbin__*']);
});

test('every agent `tools` and skill `allowed-tools` names MCP tools by the plugin-scoped name', () => {
  const files = [...walk(join(root, 'agents'), null), ...walk(join(root, 'skills'), 'SKILL.md')];
  assert.ok(files.length > 10, 'the scan found the agent and skill files');
  const stray = files.flatMap((f) =>
    strayMcpNames(readFileSync(f, 'utf8')).map((n) => `${relative(root, f)}: ${n}`),
  );
  assert.deepEqual(stray, [], `白名单里有不是 mcp__plugin_ 开头的 MCP 名字：\n${stray.join('\n')}`);
});

// ---------- the maintainer convention ----------

const AGENTS = readFileSync(join(root, 'AGENTS.md'), 'utf8');
const section = AGENTS.match(/^## 插件自带的 MCP\s*$([\s\S]*?)(?=^## |(?![\s\S]))/m)?.[1] ?? '';

test('AGENTS.md has the 「插件自带的 MCP」 section', () => {
  assert.ok(section.trim().length > 0, 'idea-loop/AGENTS.md 缺「## 插件自带的 MCP」一节');
});

test('the section gives the plugin-scoped name form for whitelists', () => {
  assert.match(section, /mcp__plugin_idea-loop_<服务>__\*/);
});

test('the section says to confirm at the start and stop when displaced, with both ways to remove the other copy', () => {
  assert.match(section, /开场确认/);
  assert.match(section, /顶替/);
  assert.match(section, /claude mcp remove/);
  assert.match(section, /\.mcp\.json/);
});

test('the section points at the Mobbin practice as the example to follow', () => {
  assert.match(section, /uiux-researcher/);
  assert.match(section, /装与设置/);
});

test('the section names design-archive as the exception that falls back to the command line', () => {
  assert.match(section, /design-archive[^\n]*命令行|命令行[^\n]*design-archive/);
});
