/**
 * runtime-detect.mjs prints the runtime the session is in: IDEA_LOOP_RUNTIME forces one, MAGI_SESSION_ID
 * means magi, anything else is claude-desktop. An unknown forced name is an error, never a guess.
 * The SessionStart hook runs the same script and injects exactly one line.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const script = join(pluginRoot, 'scripts', 'runtime-detect.mjs');

// The child gets exactly the env given here, so the machine running the test (maybe a magi session) cannot leak in.
const run = (env, args = []) =>
  spawnSync(process.execPath, [script, ...args], { env: { PATH: process.env.PATH, ...env }, encoding: 'utf8' });

test('no variable set: claude-desktop', () => {
  const r = run({});
  assert.equal(r.status, 0);
  assert.equal(r.stdout, 'claude-desktop\n');
});

test('MAGI_SESSION_ID set: magi', () => {
  const r = run({ MAGI_SESSION_ID: 'abc' });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, 'magi\n');
});

test('IDEA_LOOP_RUNTIME forces a known name over what the environment says', () => {
  assert.equal(run({ IDEA_LOOP_RUNTIME: 'claude-desktop', MAGI_SESSION_ID: 'abc' }).stdout, 'claude-desktop\n');
  assert.equal(run({ IDEA_LOOP_RUNTIME: 'magi' }).stdout, 'magi\n');
});

test('an empty IDEA_LOOP_RUNTIME counts as unset', () => {
  assert.equal(run({ IDEA_LOOP_RUNTIME: '', MAGI_SESSION_ID: 'abc' }).stdout, 'magi\n');
});

test('an unknown IDEA_LOOP_RUNTIME exits non-zero, prints nothing on stdout and lists the known names', () => {
  const r = run({ IDEA_LOOP_RUNTIME: 'foo', MAGI_SESSION_ID: 'abc' });
  assert.notEqual(r.status, 0);
  assert.equal(r.stdout, '');
  assert.match(r.stderr, /foo/);
  assert.match(r.stderr, /claude-desktop/);
  assert.match(r.stderr, /magi/);
});

test('--line prints the one-line session note naming the runtime and idea-loop:runtime', () => {
  const r = run({ MAGI_SESSION_ID: 'abc' }, ['--line']);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '当前运行环境：magi，用到能力时照 idea-loop:runtime 做\n');
});

test('hooks.json registers SessionStart, and its command prints exactly one line', () => {
  const hooks = JSON.parse(readFileSync(join(pluginRoot, 'hooks', 'hooks.json'), 'utf8')).hooks;
  const entries = hooks.SessionStart;
  assert.ok(Array.isArray(entries) && entries.length > 0, 'SessionStart is registered');
  const commands = entries.flatMap((e) => e.hooks).filter((h) => h.type === 'command').map((h) => h.command);
  const ours = commands.filter((c) => c.includes('runtime-detect.mjs'));
  assert.equal(ours.length, 1, 'one SessionStart command runs runtime-detect.mjs');
  // CLAUDE_PLUGIN_ROOT is expanded by the shell, so run the command through one, as the host does.
  const r = spawnSync('sh', ['-c', ours[0]], {
    env: { PATH: process.env.PATH, CLAUDE_PLUGIN_ROOT: pluginRoot, MAGI_SESSION_ID: 'abc' },
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trimEnd().split('\n').length, 1, `one line, got: ${JSON.stringify(r.stdout)}`);
  assert.match(r.stdout, /当前运行环境：magi/);
});
