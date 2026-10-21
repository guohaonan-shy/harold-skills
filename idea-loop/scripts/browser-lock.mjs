#!/usr/bin/env node
/**
 * One lock for the session's MCP browser, so parallel implementers take turns on it.
 *
 * A session has one MCP browser process, and its "current tab" is shared by everyone who calls it:
 * two implementers driving it at once click on each other's pages. Scripts that launch their own
 * chromium (ui-measure, flow-compose, evidence recording) do not need this — only the MCP browser does.
 *
 * The lock is a directory: mkdir is atomic, so whoever creates it holds it. owner.json inside records
 * who and since when. A holder that died leaves the directory behind, so a lock older than the stale
 * limit is taken over; the orchestrator also force-releases it whenever an implementer hands back.
 *
 * Usage:
 *   node browser-lock.mjs acquire <lock-dir> --owner <id> [--wait-min 30] [--stale-min 45]
 *   node browser-lock.mjs release <lock-dir> --owner <id> | --force
 *   node browser-lock.mjs status  <lock-dir>                      → JSON: { held, owner, since, stale }
 * Exit: 0 = acquired / released / status printed, 1 = timed out / not the owner / usage error.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const OWNER_FILE = 'owner.json';

export function readOwner(dir) {
  try {
    return JSON.parse(readFileSync(join(dir, OWNER_FILE), 'utf8'));
  } catch {
    return null;
  }
}

export function status(dir, { staleMin = 45, now = Date.now() } = {}) {
  if (!existsSync(dir)) return { held: false };
  const info = readOwner(dir);
  if (!info) {
    // The directory is there but owner.json is not: either a holder between its mkdir and its write
    // (give it a few seconds), or one that died there.
    let age = Infinity;
    try {
      age = now - statSync(dir).mtimeMs;
    } catch {}
    return { held: true, owner: null, since: null, stale: age > 10_000 };
  }
  return { held: true, owner: info.owner, since: info.since, stale: now - Date.parse(info.since) > staleMin * 60_000 };
}

/** One attempt. Returns true if this call now holds the lock. */
export function tryAcquire(dir, owner, { staleMin = 45, now = Date.now() } = {}) {
  // The parents (e.g. a dated .tmp/dreaming/<date>/) may not exist yet; only the lock itself must be
  // a single atomic mkdir.
  mkdirSync(dirname(dir), { recursive: true });
  try {
    mkdirSync(dir);
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
    const s = status(dir, { staleMin, now });
    if (s.held && s.owner === owner) return true;
    if (!s.stale) return false;
    rmSync(dir, { recursive: true, force: true });
    try {
      mkdirSync(dir);
    } catch {
      return false;
    }
  }
  writeFileSync(join(dir, OWNER_FILE), JSON.stringify({ owner, since: new Date(now).toISOString() }) + '\n');
  return true;
}

export function release(dir, { owner, force = false } = {}) {
  const info = readOwner(dir);
  if (!force && info && info.owner !== owner) return false;
  rmSync(dir, { recursive: true, force: true });
  return true;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main(argv) {
  const [cmd, dir, ...rest] = argv;
  const opt = (name, fallback) => {
    const i = rest.indexOf(`--${name}`);
    return i >= 0 ? rest[i + 1] : fallback;
  };
  const usage = () => {
    console.error('usage: browser-lock.mjs acquire|release|status <lock-dir> [--owner <id>] [--wait-min N] [--stale-min N] [--force]');
    return 1;
  };
  if (!dir) return usage();
  const staleMin = Number(opt('stale-min', 45));

  if (cmd === 'status') {
    console.log(JSON.stringify(status(dir, { staleMin })));
    return 0;
  }
  if (cmd === 'release') {
    const force = rest.includes('--force');
    const owner = opt('owner');
    if (!force && !owner) return usage();
    if (release(dir, { owner, force })) return 0;
    console.error(`browser-lock: held by ${readOwner(dir)?.owner}, not ${owner} — not released`);
    return 1;
  }
  if (cmd === 'acquire') {
    const owner = opt('owner');
    if (!owner) return usage();
    const deadline = Date.now() + Number(opt('wait-min', 30)) * 60_000;
    for (;;) {
      if (tryAcquire(dir, owner, { staleMin })) {
        console.error(`browser-lock: acquired by ${owner}`);
        return 0;
      }
      if (Date.now() >= deadline) {
        console.error(`browser-lock: still held by ${readOwner(dir)?.owner} — gave up waiting`);
        return 1;
      }
      await sleep(3000);
    }
  }
  return usage();
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await main(process.argv.slice(2)));
}
