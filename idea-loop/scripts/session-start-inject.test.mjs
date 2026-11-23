/**
 * The SessionStart hook injects two sections at the start of every main session: the capability list (runtime/capabilities.md), and the whole data of the current runtime (runtime/<name>.md).
 * The tests run the commands registered in hooks.json through a shell, exactly as the host does, and read stdout.
 *
 * Spec session-start-inject-rules, ticket 01.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dynaBinary } from './dyna-test-bin.mjs';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const hooks = JSON.parse(readFileSync(join(pluginRoot, 'hooks', 'hooks.json'), 'utf8')).hooks;
const entries = hooks.SessionStart;
const allCommands = entries.flatMap((e) => e.hooks).filter((h) => h.type === 'command').map((h) => h.command);
// the two `dyna runtime inject` sections; the project map is a fourth command of its own (home-map-hook.test.mjs)
const commands = allCommands.filter((c) => c.includes('bin/dyna" runtime inject '));

/** The limit Claude Code puts on one hook's output; past it the session keeps only a 2,000-character preview. */
const HOOK_OUTPUT_LIMIT = 10000;

// The child gets exactly the env given here, so the machine running the test (maybe a magi session) cannot leak in.
// The plugin's launcher hands the call to a dyna built from this repository, not to the one installed in ~/.idea-loop/bin/.
const runAll = (env) =>
  commands.map((command) =>
    spawnSync('sh', ['-c', command], { env: { PATH: process.env.PATH, CLAUDE_PLUGIN_ROOT: pluginRoot, IDEA_LOOP_DYNA_BIN: dynaBinary(), ...env }, encoding: 'utf8' }));

// `dyna runtime inject reference` prints the data file of the current runtime, the plugin's runtime/ directory
const REFERENCE = { 'claude-desktop': 'runtime/claude-desktop.md', magi: 'runtime/magi.md' };

test('SessionStart has no matcher, so startup, resume, clear, compact and fork all inject', () => {
  assert.ok(Array.isArray(entries) && entries.length > 0, 'SessionStart is registered');
  for (const e of entries) assert.ok(!('matcher' in e), `a matcher would limit the sources: ${JSON.stringify(e)}`);
});

test('two `dyna runtime inject` SessionStart commands, each its own output, and the project map is a separate command beside them', () => {
  assert.equal(commands.length, 2);
  assert.equal(allCommands.length, 3);
  assert.deepEqual(allCommands.slice(0, 2), commands);
  assert.deepEqual(commands.map((c) => c.split('runtime inject ')[1]), ['runtime --hook', 'reference --hook']);
  assert.equal(allCommands[2], '"${CLAUDE_PLUGIN_ROOT}/bin/dyna" home map --hook');
});

for (const [label, env, name] of [['MAGI_SESSION_ID not set', {}, 'claude-desktop'], ['MAGI_SESSION_ID set', { MAGI_SESSION_ID: 'abc' }, 'magi']]) {
  test(`${label}: two sections, each under the hook output limit, in order runtime, reference`, () => {
    const [runtime, reference] = runAll(env);
    for (const r of [runtime, reference]) {
      assert.equal(r.status, 0, r.stderr);
      assert.ok(r.stdout.length > 0 && r.stdout.length < HOOK_OUTPUT_LIMIT, `section length ${r.stdout.length}`);
      assert.ok(!r.stdout.includes('${CLAUDE_PLUGIN_ROOT}'), 'the placeholder is expanded to the real plugin path');
    }

    // runtime: first line is the runtime, then the header, then the body
    assert.equal(runtime.stdout.split('\n')[0], `当前运行环境：${name}`);
    assert.match(runtime.stdout.split('\n')[1], /^以下是运行环境的能力清单，开场注入，不必再取/);
    assert.ok(runtime.stdout.includes('## 能力清单'));
    assert.doesNotMatch(runtime.stdout, /^name: /m);

    // reference: the whole file of this runtime, and not the other one's
    assert.match(reference.stdout.split('\n')[0], /^以下是运行环境「/);
    assert.ok(reference.stdout.includes(name));
    assert.ok(reference.stdout.includes(readFileSync(join(pluginRoot, REFERENCE[name]), 'utf8').replaceAll('${CLAUDE_PLUGIN_ROOT}', pluginRoot).trim()));
    const other = name === 'magi' ? 'claude-desktop' : 'magi';
    assert.ok(!reference.stdout.includes(readFileSync(join(pluginRoot, REFERENCE[other]), 'utf8').trim()));
  });
}

test('the injected runtime body sends a sub-agent to `dyna runtime show`, and names neither the removed skill nor the old detect script', () => {
  const [runtime] = runAll({});
  assert.ok(runtime.stdout.includes('dyna runtime show'));
  for (const gone of ['idea-loop:runtime', 'runtime-detect.mjs']) assert.ok(!runtime.stdout.includes(gone), gone);
});

test('IDEA_LOOP_RUNTIME=foo: both runtime sections exit non-zero with empty stdout', () => {
  const [runtime, reference] = runAll({ IDEA_LOOP_RUNTIME: 'foo' });
  for (const r of [runtime, reference]) {
    assert.notEqual(r.status, 0);
    assert.equal(r.stdout, '');
    assert.match(r.stderr, /foo/);
  }
});

test('IDEA_LOOP_RUNTIME forces the reference too', () => {
  const [runtime, reference] = runAll({ IDEA_LOOP_RUNTIME: 'magi' });
  assert.equal(runtime.stdout.split('\n')[0], '当前运行环境：magi');
  assert.ok(reference.stdout.includes('magi sessions'));
});

test('a local override in home reaches the reference the hook injects: first line names the file, the replaced section is the local one, the rest is the plugin\'s', () => {
  const home = mkdtempSync(join(tmpdir(), 'inject-home-'));
  try {
    mkdirSync(join(home, 'runtime'));
    const file = join(home, 'runtime', 'claude-desktop.md');
    writeFileSync(file, '# 本机覆盖\n\n## 推送\n\n本机推送做法\n\n## 不存在的能力\n\n用不上\n');
    const [, reference] = runAll({ IDEA_LOOP_HOME: home });
    assert.equal(reference.status, 0, reference.stderr);
    assert.ok(reference.stdout.length < HOOK_OUTPUT_LIMIT);
    const [first, second] = reference.stdout.split('\n');
    assert.equal(first, `本机覆盖 ${file}：替换了「推送」；没对上、没用上：「不存在的能力」（插件里没有同级同名的一节）。`);
    assert.match(second, /^以下是运行环境「claude-desktop」/);
    assert.ok(reference.stdout.includes('## 推送\n\n本机推送做法\n'));
    assert.ok(!reference.stdout.includes('用不上'));
    const plain = readFileSync(join(pluginRoot, REFERENCE['claude-desktop']), 'utf8').replaceAll('${CLAUDE_PLUGIN_ROOT}', pluginRoot).trim();
    assert.ok(reference.stdout.includes(plain.split('## 推送')[0]), 'sections before the replaced one are the plugin\'s');
    // the other injected section does not change
    assert.equal(runAll({ IDEA_LOOP_HOME: home })[0].stdout, runAll({})[0].stdout);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
