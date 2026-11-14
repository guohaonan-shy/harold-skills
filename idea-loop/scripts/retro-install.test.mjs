/**
 * The fixed-path install of the replay runner (scripts/retro-install.mjs): what it puts where, what it prints, and
 * that the installed copy works from there — it is the file the permission rule points at.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import * as installer from './retro-install.mjs';

const { allowRule, displayPath, install } = installer;
const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'retro-install.mjs');
const fresh = () => join(mkdtempSync(join(tmpdir(), 'retro-install-')), 'bin');
const run = (entry, args) => spawnSync(process.execPath, [entry, ...args], { encoding: 'utf8' });

test('the permission rule begins with the runner path, written with ~ under the home directory', () => {
  const home = '/Users/someone';
  const dest = '/Users/someone/.idea-loop/bin';
  assert.equal(allowRule(dest, home), 'Bash(node ~/.idea-loop/bin/retro-replay.mjs:*)');
  assert.equal(displayPath('/elsewhere/bin/x.mjs', home), '/elsewhere/bin/x.mjs');
});

test('installed runner has no plugin of its own to test, and says which flag to give', () => {
  const { entry } = install(fresh());
  const r = run(entry, ['--case', 'whatever']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--worktree/);
});

test('the installed copy carries the Codex companion finder the judge needs, and starts with it', () => {
  const dest = fresh();
  const { entry } = install(dest);
  assert.ok(existsSync(join(dest, 'runtime', 'scripts', 'codex-companion.mjs')));
  const r = run(entry, ['--bogus']);
  assert.equal(r.status, 2, 'it starts (every import resolves) and rejects the argument itself');
  assert.match(r.stderr, /unknown argument/);
});

test('installed runner does not know the queue flags any more', () => {
  const { entry } = install(fresh());
  for (const flag of ['--queue', '--enqueue', '--notify']) {
    const r = run(entry, [flag]);
    assert.equal(r.status, 2, flag);
    assert.match(r.stderr, /unknown argument/, flag);
  }
});

test('installing again replaces the copy; a stray old file does not survive', () => {
  const dest = fresh();
  install(dest);
  const stray = join(dest, 'runtime', 'evals', 'retro', 'old-file.mjs');
  writeFileSync(stray, '// from an older version');
  install(dest);
  assert.equal(existsSync(stray), false);
  assert.match(readFileSync(join(dest, 'retro-replay.mjs'), 'utf8'), /main\(process\.argv\.slice\(2\)\)/);
});

test('the command line installs the runner, prints the permission rule and nothing about a scheduled task, and writes nothing outside the destination', () => {
  const dest = fresh();
  const r = spawnSync(process.execPath, [SCRIPT, '--dest', dest], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stdout.includes(join(dest, 'retro-replay.mjs')), 'says where the runner went');
  assert.ok(r.stdout.includes(allowRule(dest)));
  assert.match(r.stdout, /不改权限设置/);
  assert.doesNotMatch(r.stdout, /计划任务|定时任务|回放结果|--queue|--notify|run_in_background/, 'no scheduled task prompt');
  assert.deepEqual(readdirSync(dest).sort(), ['retro-replay.mjs', 'runtime']);
  assert.equal(spawnSync(process.execPath, [SCRIPT, '--bogus'], { encoding: 'utf8' }).status, 2);
});

test('the installer has no scheduled task command or prompt to hand out', () => {
  for (const name of ['taskCommand', 'taskPrompt', 'notifyCommand']) assert.equal(name in installer, false, name);
});
