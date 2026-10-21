import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readOwner, release, status, tryAcquire } from './browser-lock.mjs';

const SCRIPT = fileURLToPath(new URL('./browser-lock.mjs', import.meta.url));
const lockDir = () => join(mkdtempSync(join(tmpdir(), 'browser-lock-')), 'browser.lock');

test('the first caller holds the lock and a second one is refused', () => {
  const dir = lockDir();
  assert.equal(tryAcquire(dir, '03'), true);
  assert.equal(tryAcquire(dir, '05'), false);
  assert.equal(readOwner(dir).owner, '03');
});

test('a lock whose parent directories do not exist yet is still acquired', () => {
  const dir = join(mkdtempSync(join(tmpdir(), 'browser-lock-')), '.tmp', 'dreaming', '2026-10-21', 'browser.lock');
  assert.equal(tryAcquire(dir, 'dreaming'), true);
  assert.equal(readOwner(dir).owner, 'dreaming');
});

test('re-acquiring by the holder is a no-op success', () => {
  const dir = lockDir();
  tryAcquire(dir, '03');
  assert.equal(tryAcquire(dir, '03'), true);
});

test('a stale lock is taken over', () => {
  const dir = lockDir();
  tryAcquire(dir, '03', { now: Date.parse('2026-01-01T00:00:00Z') });
  assert.equal(tryAcquire(dir, '05', { staleMin: 45, now: Date.parse('2026-01-01T01:00:00Z') }), true);
  assert.equal(readOwner(dir).owner, '05');
});

test('a directory without owner.json is left alone briefly, then counts as stale', () => {
  const dir = lockDir();
  mkdirSync(dir);
  assert.equal(status(dir).stale, false);
  assert.equal(tryAcquire(dir, '05'), false);
  const later = Date.now() + 60_000;
  assert.equal(status(dir, { now: later }).stale, true);
  assert.equal(tryAcquire(dir, '05', { now: later }), true);
});

test('only the holder releases, unless forced', () => {
  const dir = lockDir();
  tryAcquire(dir, '03');
  assert.equal(release(dir, { owner: '05' }), false);
  assert.equal(existsSync(dir), true);
  assert.equal(release(dir, { force: true }), true);
  assert.equal(existsSync(dir), false);
});

test('status of a free lock leaves nothing behind', () => {
  const dir = lockDir();
  assert.deepEqual(status(dir), { held: false });
  assert.equal(existsSync(dir), false);
});

test('CLI: acquire with no wait fails while held, release frees it', () => {
  const dir = lockDir();
  execFileSync('node', [SCRIPT, 'acquire', dir, '--owner', '03'], { stdio: 'pipe' });
  assert.throws(() => execFileSync('node', [SCRIPT, 'acquire', dir, '--owner', '05', '--wait-min', '0'], { stdio: 'pipe' }));
  execFileSync('node', [SCRIPT, 'release', dir, '--owner', '03'], { stdio: 'pipe' });
  const out = execFileSync('node', [SCRIPT, 'status', dir], { encoding: 'utf8' });
  assert.equal(JSON.parse(out).held, false);
});
