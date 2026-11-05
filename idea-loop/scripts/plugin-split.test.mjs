/**
 * Tripwire for the split of idea-loop into idea-loop, design and seo (spec plugin-split).
 *
 * What it catches: a call that still says `idea-loop:<a skill or agent that moved>`, a manifest whose
 * skills directory or dependencies drifted, a plugin that ships the other's MCP server or hook, and
 * the two copied modules (mini-yaml.mjs, plugin-root.mjs) drifting apart. What it misses: whether the
 * "design 没装就跳过" sentences say the right thing — that is read by a person.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pluginRoot } from './plugin-root.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const json = (...p) => JSON.parse(readFileSync(join(repoRoot, ...p), 'utf8'));
const names = (plugin, dir) => {
  const root = join(repoRoot, plugin, dir);
  return readdirSync(root).filter((n) => (dir === 'agents' ? n.endsWith('.md') : existsSync(join(root, n, 'SKILL.md')))).map((n) => n.replace(/\.md$/, ''));
};

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === 'node_modules' ? [] : files(p);
    return /\.(md|mjs|json)$/.test(name) ? [p] : [];
  });
}

test('manifests: design and seo depend on idea-loop, idea-loop on excalidrawer; each skills dir exists', () => {
  const manifest = (p) => json(p, '.claude-plugin', 'plugin.json');
  assert.deepEqual(manifest('idea-loop').dependencies, ['excalidrawer']);
  assert.deepEqual(manifest('design').dependencies, ['idea-loop']);
  assert.deepEqual(manifest('seo').dependencies, ['idea-loop']);
  for (const p of ['idea-loop', 'design', 'seo']) {
    assert.equal(manifest(p).name, p);
    for (const dir of manifest(p).skills) assert.ok(existsSync(join(repoRoot, p, dir)), `${p}: ${dir} missing`);
  }
  const listed = json('.claude-plugin', 'marketplace.json').plugins.map((x) => [x.name, x.source]);
  assert.deepEqual(listed.filter(([n]) => ['design', 'seo'].includes(n)), [['design', './design'], ['seo', './seo']]);
  assert.ok(listed.some(([n]) => n === 'excalidrawer'), 'excalidrawer must stay in the marketplace: idea-loop depends on it');
});

test('MCP servers and hooks sit with the plugin that uses them', () => {
  assert.equal(existsSync(join(repoRoot, 'idea-loop', '.mcp.json')), false);
  assert.deepEqual(Object.keys(json('design', '.mcp.json').mcpServers), ['design-archive']);
  assert.deepEqual(Object.keys(json('seo', '.mcp.json').mcpServers), ['openseo']);
  const hookScripts = (p) => JSON.stringify(json(p, 'hooks', 'hooks.json')).match(/[a-z-]+-hook\.mjs/g).sort();
  assert.deepEqual([...new Set(hookScripts('idea-loop'))], ['glossary-check-hook.mjs']);
  assert.deepEqual([...new Set(hookScripts('design'))], ['design-lint-hook.mjs', 'design-md-hook.mjs']);
  assert.deepEqual([...new Set(hookScripts('seo'))], ['seo-check-hook.mjs']);
  for (const p of ['idea-loop', 'design', 'seo']) {
    for (const s of hookScripts(p)) assert.ok(existsSync(join(repoRoot, p, 'scripts', s)), `${p} hook ${s} missing`);
  }
});

test('nothing calls a moved skill or agent by its old idea-loop: name', () => {
  const moved = [...names('design', 'skills'), ...names('design', 'agents'), ...names('seo', 'skills'), ...names('seo', 'agents')];
  assert.ok(moved.length >= 30, `expected the moved skills and agents, found ${moved.length}`);
  const old = new RegExp(`idea-loop:(${moved.join('|')})(?![a-z0-9-])`);
  const hits = [];
  for (const top of ['idea-loop', 'design', 'seo', 'README.md', 'README.zh-CN.md', 'AGENTS.md']) {
    const p = join(repoRoot, top);
    for (const file of statSync(p).isDirectory() ? files(p) : [p]) {
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        const m = line.match(old);
        if (m) hits.push(`${relative(repoRoot, file)}:${i + 1}  ${m[0]}`);
      });
    }
  }
  assert.deepEqual(hits, []);
});

test('the copied modules stay identical', () => {
  const read = (...p) => readFileSync(join(repoRoot, ...p), 'utf8');
  assert.equal(read('design', 'scripts', 'mini-yaml.mjs'), read('idea-loop', 'scripts', 'mini-yaml.mjs'));
  assert.equal(read('seo', 'scripts', 'plugin-root.mjs'), read('idea-loop', 'scripts', 'plugin-root.mjs'));
});

const plugin = (dir, name) => {
  mkdirSync(join(dir, '.claude-plugin'), { recursive: true });
  writeFileSync(join(dir, '.claude-plugin', 'plugin.json'), JSON.stringify({ name }));
};

test('pluginRoot: env var first, then the sibling directory, then the highest cached version', () => {
  const t = mkdtempSync(join(tmpdir(), 'plugin-root-'));
  // repository / --plugin-dir layout: <t>/repo/{seo,idea-loop}
  plugin(join(t, 'repo', 'seo'), 'seo');
  plugin(join(t, 'repo', 'idea-loop'), 'idea-loop');
  assert.equal(pluginRoot('idea-loop', { from: join(t, 'repo', 'seo'), env: {} }), join(t, 'repo', 'idea-loop'));
  // cache layout: <t>/cache/<marketplace>/<plugin>/<version>
  plugin(join(t, 'cache', 'm', 'seo', '0.2.0'), 'seo');
  for (const v of ['0.2.0', '0.10.1', '0.9.3']) plugin(join(t, 'cache', 'm', 'idea-loop', v), 'idea-loop');
  mkdirSync(join(t, 'cache', 'm', 'idea-loop', 'not-a-plugin'));
  assert.equal(pluginRoot('idea-loop', { from: join(t, 'cache', 'm', 'seo', '0.2.0'), env: {} }), join(t, 'cache', 'm', 'idea-loop', '0.10.1'));
  // the env var wins, but only when it points at that plugin
  plugin(join(t, 'elsewhere'), 'idea-loop');
  assert.equal(pluginRoot('idea-loop', { from: join(t, 'repo', 'seo'), env: { IDEA_LOOP_PLUGIN_ROOT: join(t, 'elsewhere') } }), join(t, 'elsewhere'));
  assert.equal(pluginRoot('idea-loop', { from: join(t, 'repo', 'seo'), env: { IDEA_LOOP_PLUGIN_ROOT: join(t, 'repo', 'seo') } }), join(t, 'repo', 'idea-loop'));
  // a directory with the right name but another manifest does not count; nothing found is null
  plugin(join(t, 'lonely', 'design'), 'not-design');
  assert.equal(pluginRoot('design', { from: join(t, 'lonely', 'seo'), env: {} }), null);
});

test('pluginRoot: from this repository, idea-loop finds design and seo finds idea-loop', () => {
  assert.equal(pluginRoot('design', { env: {} }), join(repoRoot, 'design'));
  assert.equal(pluginRoot('idea-loop', { from: join(repoRoot, 'seo'), env: {} }), join(repoRoot, 'idea-loop'));
});
