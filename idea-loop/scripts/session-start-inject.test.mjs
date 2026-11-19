/**
 * The SessionStart hook injects three sections at the start of every main session: the body of
 * `idea-loop:decision-rules`, the body of `idea-loop:runtime`, and the whole reference of the current runtime.
 * The tests run the commands registered in hooks.json through a shell, exactly as the host does, and read stdout.
 *
 * Spec session-start-inject-rules, ticket 01.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dynaBinary } from './dyna-test-bin.mjs';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const hooks = JSON.parse(readFileSync(join(pluginRoot, 'hooks', 'hooks.json'), 'utf8')).hooks;
const entries = hooks.SessionStart;
const allCommands = entries.flatMap((e) => e.hooks).filter((h) => h.type === 'command').map((h) => h.command);
// the three `dyna runtime inject` sections; the project map is a fourth command of its own (project-map.test.mjs)
const commands = allCommands.filter((c) => c.includes('bin/dyna" runtime inject '));

/** The limit Claude Code puts on one hook's output; past it the session keeps only a 2,000-character preview. */
const HOOK_OUTPUT_LIMIT = 10000;

// The child gets exactly the env given here, so the machine running the test (maybe a magi session) cannot leak in.
// The plugin's launcher hands the call to a dyna built from this repository, not to the one installed in ~/.idea-loop/bin/.
const runAll = (env) =>
  commands.map((command) =>
    spawnSync('sh', ['-c', command], { env: { PATH: process.env.PATH, CLAUDE_PLUGIN_ROOT: pluginRoot, IDEA_LOOP_DYNA_BIN: dynaBinary(), ...env }, encoding: 'utf8' }));

const skillBody = (rel) => readFileSync(join(pluginRoot, rel), 'utf8').replace(/^---\n[\s\S]*?\n---\n/, '');
// `dyna runtime inject reference` prints the data file of the current runtime, the plugin's runtime/ directory
const REFERENCE = { 'claude-desktop': 'runtime/claude-desktop.md', magi: 'runtime/magi.md' };

test('SessionStart has no matcher, so startup, resume, clear, compact and fork all inject', () => {
  assert.ok(Array.isArray(entries) && entries.length > 0, 'SessionStart is registered');
  for (const e of entries) assert.ok(!('matcher' in e), `a matcher would limit the sources: ${JSON.stringify(e)}`);
});

test('three `dyna runtime inject` SessionStart commands, each its own output, and the project map is a separate command beside them', () => {
  assert.equal(commands.length, 3);
  assert.equal(allCommands.length, 4);
  assert.deepEqual(allCommands.slice(0, 3), commands);
  assert.deepEqual(commands.map((c) => c.split('runtime inject ')[1]), ['decision-rules --hook', 'runtime --hook', 'reference --hook']);
  assert.equal(allCommands[3], '"${CLAUDE_PLUGIN_ROOT}/bin/dyna" home map --hook');
});

for (const [label, env, name] of [['MAGI_SESSION_ID not set', {}, 'claude-desktop'], ['MAGI_SESSION_ID set', { MAGI_SESSION_ID: 'abc' }, 'magi']]) {
  test(`${label}: three sections, each under the hook output limit, in order decision-rules, runtime, reference`, () => {
    const [rules, runtime, reference] = runAll(env);
    for (const r of [rules, runtime, reference]) {
      assert.equal(r.status, 0, r.stderr);
      assert.ok(r.stdout.length > 0 && r.stdout.length < HOOK_OUTPUT_LIMIT, `section length ${r.stdout.length}`);
      assert.ok(!r.stdout.includes('${CLAUDE_PLUGIN_ROOT}'), 'the placeholder is expanded to the real plugin path');
    }

    // decision-rules: header with the scope sentence, the body without frontmatter
    assert.match(rules.stdout, /^以下是 `idea-loop:decision-rules` 的正文，开场注入，不必再调它/);
    assert.match(rules.stdout.split('\n')[0], /「核心」一节针对有 spec 的工作/);
    assert.match(rules.stdout.split('\n')[0], /把「spec」读作人这次交代的事/);
    assert.ok(rules.stdout.includes('## 护栏'));
    assert.doesNotMatch(rules.stdout, /^name: /m);
    assert.doesNotMatch(rules.stdout, /^description: /m);
    assert.ok(rules.stdout.includes(skillBody('skills/productivity/decision-rules/SKILL.md').trim()));

    // runtime: first line is the runtime, then the header, then the body
    assert.equal(runtime.stdout.split('\n')[0], `当前运行环境：${name}`);
    assert.match(runtime.stdout.split('\n')[1], /^以下是 `idea-loop:runtime` 的正文，开场注入，不必再调它/);
    assert.ok(runtime.stdout.includes('## 能力清单'));
    assert.doesNotMatch(runtime.stdout, /^name: /m);

    // reference: the whole file of this runtime, and not the other one's
    assert.match(reference.stdout.split('\n')[0], /^以下是 `idea-loop:runtime` 的 reference/);
    assert.ok(reference.stdout.includes(name));
    assert.ok(reference.stdout.includes(readFileSync(join(pluginRoot, REFERENCE[name]), 'utf8').replaceAll('${CLAUDE_PLUGIN_ROOT}', pluginRoot).trim()));
    const other = name === 'magi' ? 'claude-desktop' : 'magi';
    assert.ok(!reference.stdout.includes(readFileSync(join(pluginRoot, REFERENCE[other]), 'utf8').trim()));
  });
}

test('the plugin path in the injected text is the real one: the runtime body names the detect script with it', () => {
  const [, runtime] = runAll({});
  assert.ok(runtime.stdout.includes(`${pluginRoot}/scripts/runtime-detect.mjs`));
});

test('IDEA_LOOP_RUNTIME=foo: decision-rules still injects, both runtime sections exit non-zero with empty stdout', () => {
  const [rules, runtime, reference] = runAll({ IDEA_LOOP_RUNTIME: 'foo' });
  assert.equal(rules.status, 0);
  assert.ok(rules.stdout.includes('## 护栏'));
  for (const r of [runtime, reference]) {
    assert.notEqual(r.status, 0);
    assert.equal(r.stdout, '');
    assert.match(r.stderr, /foo/);
  }
});

test('IDEA_LOOP_RUNTIME forces the reference too', () => {
  const [, runtime, reference] = runAll({ IDEA_LOOP_RUNTIME: 'magi' });
  assert.equal(runtime.stdout.split('\n')[0], '当前运行环境：magi');
  assert.ok(reference.stdout.includes('magi sessions'));
});

test('the plugin reached through a symlinked path (macOS /var → /private/var) still injects: the script must not mistake itself for an import', () => {
  const dir = mkdtempSync(join(tmpdir(), 'inject-link-'));
  symlinkSync(pluginRoot, join(dir, 'idea-loop'));
  const link = join(dir, 'idea-loop');
  for (const section of ['decision-rules', 'runtime', 'reference']) {
    const r = spawnSync(process.execPath, [join(link, 'scripts', 'runtime-detect.mjs'), '--inject', section], { env: { PATH: process.env.PATH }, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.ok(r.stdout.includes('开场注入'), `${section}: empty output through a symlinked path`);
  }
});
