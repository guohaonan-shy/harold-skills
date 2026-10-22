/**
 * The fixed-path install of the replay runner (scripts/retro-install.mjs): what it puts where, what it prints, and
 * that the installed copy works from there — it is the file the nightly job and the permission rule point at.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { allowRule, displayPath, install, taskCommand, taskPrompt } from './retro-install.mjs';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'retro-install.mjs');
const fresh = () => join(mkdtempSync(join(tmpdir(), 'retro-install-')), 'bin');
const run = (entry, args) => spawnSync(process.execPath, [entry, ...args], { encoding: 'utf8' });

test('the permission rule and the scheduled command begin with the same runner path, written with ~ under the home directory', () => {
  const home = '/Users/someone';
  const dest = '/Users/someone/.idea-loop/bin';
  assert.equal(allowRule(dest, home), 'Bash(node ~/.idea-loop/bin/retro-replay.mjs:*)');
  assert.equal(taskCommand(dest, home), 'node ~/.idea-loop/bin/retro-replay.mjs --queue');
  assert.ok(taskCommand(dest, home).startsWith(allowRule(dest, home).slice('Bash('.length, -':*)'.length)), 'the rule covers the command');
  assert.equal(displayPath('/elsewhere/bin/x.mjs', home), '/elsewhere/bin/x.mjs');
});

test('installed runner: an empty queue at night exits at once; in the daytime it does not run; both from the fixed place', () => {
  const dest = fresh();
  const { entry } = install(dest);
  const queueDir = join(dest, '..', 'replay-queue');
  const night = run(entry, ['--queue', '--queue-dir', queueDir, '--now', '2026-10-23T01:07:00']);
  assert.equal(night.status, 0, night.stdout + night.stderr);
  assert.match(night.stdout, /队列是空的/);
  const day = run(entry, ['--queue', '--queue-dir', queueDir, '--now', '2026-10-23T09:12:00']);
  assert.equal(day.status, 0, day.stdout + day.stderr);
  assert.match(day.stdout, /09:12/);
});

test('installed runner has no plugin of its own to test, and says which flag to give', () => {
  const { entry } = install(fresh());
  const r = run(entry, ['--case', 'whatever']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--worktree/);
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

test('the command line prints the rule and the command, and writes nothing outside the destination', () => {
  const dest = fresh();
  const r = spawnSync(process.execPath, [SCRIPT, '--dest', dest], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stdout.includes(allowRule(dest)));
  assert.ok(r.stdout.includes(taskCommand(dest)));
  assert.match(r.stdout, /不改权限设置/);
  assert.equal(spawnSync(process.execPath, [SCRIPT, '--bogus'], { encoding: 'utf8' }).status, 2);
});

test('the scheduled task prompt runs the one command, forwards each result line to its session with SendMessage, and falls back to the notification', () => {
  const home = '/Users/someone';
  const dest = '/Users/someone/.idea-loop/bin';
  const prompt = taskPrompt(dest, home);
  assert.ok(prompt.includes(taskCommand(dest, home)));
  assert.match(prompt, /SendMessage/);
  assert.match(prompt, /回放结果/);
  assert.match(prompt, /session/);
  assert.ok(prompt.includes('node ~/.idea-loop/bin/retro-replay.mjs --notify'), 'the fallback is the same runner, so one permission rule covers it');
  // every command in it begins with the text the permission rule covers
  for (const m of prompt.matchAll(/node \S*retro-replay\.mjs/g)) assert.equal(m[0], 'node ~/.idea-loop/bin/retro-replay.mjs');
});
