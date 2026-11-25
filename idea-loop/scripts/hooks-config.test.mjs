/**
 * hooks/hooks.json and .mcp.json call the plugin's launcher, `bin/dyna`, and nothing else: no script path of the plugin.
 * These tests read the two files and run their commands the way the host does (through a shell, with
 * CLAUDE_PLUGIN_ROOT set), against a dyna built from this repository.
 *
 * What each command does is tested where it lives (the dyna module's Go tests, session-start-inject.test.mjs,
 * project-map.test.mjs); the scan in scripts/dyna-scan.test.mjs checks every name and flag against the stored registry.
 * Here: the shape of the two files, a hook that is never stopped by a missing or mismatched command line, and the two
 * PreToolUse guards reached through hooks.json.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dynaBinary } from './dyna-test-bin.mjs';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const hooksText = readFileSync(join(pluginRoot, 'hooks', 'hooks.json'), 'utf8');
const mcpText = readFileSync(join(pluginRoot, '.mcp.json'), 'utf8');
const hooks = JSON.parse(hooksText).hooks;

/** Every hook of the file: { event, matcher, command }. */
const all = Object.entries(hooks).flatMap(([event, entries]) =>
  entries.flatMap((e) => e.hooks.map((h) => ({ event, matcher: e.matcher ?? null, command: h.command, type: h.type }))));

const tmp = (what) => realpathSync(mkdtempSync(join(tmpdir(), `hooks-config-${what}-`)));

/** A plugin directory of its own with the real launcher and the version range written as given. */
function pluginWith(range) {
  const root = tmp('plugin');
  mkdirSync(join(root, 'bin'));
  copyFileSync(join(pluginRoot, 'bin', 'dyna'), join(root, 'bin', 'dyna'));
  chmodSync(join(root, 'bin', 'dyna'), 0o755);
  writeFileSync(join(root, 'dyna-version'), `${range}\n`);
  return root;
}

const run = (command, { root = pluginRoot, input = '', env = {} } = {}) =>
  spawnSync('sh', ['-c', command], { input, encoding: 'utf8', env: { PATH: process.env.PATH, CLAUDE_PLUGIN_ROOT: root, ...env } });

test('hooks.json and .mcp.json name no script of the plugin: every hook is the launcher with --hook, the archive server is `mcp design-archive`', () => {
  assert.ok(all.length >= 10);
  for (const h of all) {
    assert.equal(h.type, 'command');
    assert.match(h.command, /^"\$\{CLAUDE_PLUGIN_ROOT\}\/bin\/dyna"( [a-z][a-z-]*)+ --hook$/, h.command);
  }
  for (const text of [hooksText, mcpText]) {
    assert.doesNotMatch(text, /\.mjs|scripts\/|"node"|node "/, 'no old script path');
  }
  const servers = JSON.parse(mcpText).mcpServers;
  assert.deepEqual(servers['design-archive'], { command: '${CLAUDE_PLUGIN_ROOT}/bin/dyna', args: ['mcp', 'design-archive'] });
  // the plugin ships the archive server and OpenSEO; Playwright and Refero are user-level
  assert.deepEqual(servers.openseo, { type: 'http', url: 'https://app.openseo.so/mcp' });
  assert.deepEqual(servers.mobbin, { type: 'http', url: 'https://api.mobbin.com/mcp' });
  assert.deepEqual(Object.keys(servers), ['design-archive', 'openseo', 'mobbin']);
});

test('the events: SessionStart three commands, Bash PreToolUse two guards and the SEO check, the write hooks, Bash PostToolUse the SEO check', () => {
  const at = (event, matcher) => all.filter((h) => h.event === event && h.matcher === matcher).map((h) => h.command.replace('"${CLAUDE_PLUGIN_ROOT}/bin/dyna" ', ''));
  assert.deepEqual(at('SessionStart', null), ['runtime inject runtime --hook', 'runtime inject reference --hook', 'home map --hook']);
  assert.deepEqual(at('PreToolUse', 'Bash'), ['issues guard --hook', 'worktree guard --hook', 'seo check --hook']);
  assert.deepEqual(at('PostToolUse', 'Write|Edit'), ['design lint --hook', 'design md lint --hook', 'home glossary check --hook', 'spec skill-lint --hook']);
  assert.deepEqual(at('PostToolUse', 'Bash'), ['seo check --hook']);
  assert.deepEqual(Object.keys(hooks).sort(), ['PostToolUse', 'PreToolUse', 'SessionStart']);
});

test('a command line that is not installed: every hook exits 0 with nothing on stdout and one line on stderr', () => {
  const home = tmp('home'); // no ~/.idea-loop/bin/dyna in it
  for (const h of all) {
    const r = run(h.command, { env: { HOME: home } });
    assert.equal(r.status, 0, `${h.command}: ${r.stderr}`);
    assert.equal(r.stdout, '', h.command);
    assert.equal(r.stderr.trim().split('\n').length, 1, `${h.command}: ${r.stderr}`);
  }
});

test('a command line outside the plugin\'s version range: every hook exits 0 with nothing on stdout and one line on stderr, and does not read the event', () => {
  const root = pluginWith('>=9.0.0 <10.0.0');
  const bin = dynaBinary();
  for (const h of all) {
    const r = run(h.command, { root, env: { HOME: tmp('home'), IDEA_LOOP_DYNA_BIN: bin }, input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git worktree remove x' } }) });
    assert.equal(r.status, 0, `${h.command}: ${r.stderr}`);
    assert.equal(r.stdout, '', h.command);
    assert.equal(r.stderr.trim().split('\n').length, 1, `${h.command}: ${r.stderr}`);
    assert.match(r.stderr, /版本/, h.command);
  }
});

test('the version mismatch does not stop a session start, and the same mismatch stops a command called by hand', () => {
  const root = pluginWith('>=9.0.0 <10.0.0');
  const r = spawnSync(join(root, 'bin', 'dyna'), ['runtime', 'inject', 'runtime'], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: tmp('home'), IDEA_LOOP_DYNA_BIN: dynaBinary() } });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /版本/);
});

// the PreToolUse commands of hooks.json, as the host runs them: the tool call as JSON on stdin
const pre = all.filter((h) => h.event === 'PreToolUse').map((h) => h.command);
const preRun = (command, tool = 'Bash') => {
  const input = JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: tool, tool_use_id: 't1', cwd: tmp('cwd'), tool_input: { command } });
  return pre.map((c) => run(c, { input, env: { HOME: tmp('home'), IDEA_LOOP_DYNA_BIN: dynaBinary() } }));
};

test('hand-written `git worktree remove` is stopped by the worktree guard and by nothing else', () => {
  const [issues, worktree, seo] = preRun('git worktree remove ../x --force');
  assert.equal(worktree.status, 2, worktree.stderr);
  assert.match(worktree.stderr, /dyna worktree remove/);
  assert.equal(issues.status, 0, issues.stderr);
  assert.equal(seo.status, 0, seo.stderr);
});

test('hand-written `gh issue edit` of a status label is stopped by the issues guard and by nothing else', () => {
  const [issues, worktree, seo] = preRun('gh issue edit 12 --add-label status:todo');
  assert.equal(issues.status, 2, issues.stderr);
  assert.match(issues.stderr, /dyna issues set/);
  assert.equal(worktree.status, 0, worktree.stderr);
  assert.equal(seo.status, 0, seo.stderr);
});

test('an ordinary Bash command, a `git worktree list` and another label are let through by all three', () => {
  for (const command of ['ls -la', 'git worktree list', 'gh issue edit 12 --add-label type:seo']) {
    for (const r of preRun(command)) assert.equal(r.status, 0, `${command}: ${r.stderr}`);
  }
});
