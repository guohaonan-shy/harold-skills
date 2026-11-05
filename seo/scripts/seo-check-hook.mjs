#!/usr/bin/env node
/**
 * Bash hooks that run seo-check after a command rebuilt the site. A project opts in by writing the
 * build output directory into SEO.md's「构建与检查」section; without SEO.md (or without that line)
 * every command passes untouched.
 *
 * Which command was "the build" is not read from the command text — build commands are spelled in
 * too many ways (`npm run build`, `cd site && npm run build`, a workspace flag), and a monorepo's
 * other builds share the same words. Instead the PreToolUse half records when the command started
 * (by tool_use_id), and the PostToolUse half checks whether any file under the output directory was
 * written after that. Another app's build never touches that directory, so it never triggers. The
 * docs list tool_use_id on both events but do not promise the two halves carry the same value, so
 * when no record is found the start is taken from PostToolUse's own `duration_ms` instead.
 *
 * The command has already run, so this cannot stop it: on errors the PostToolUse half exits 2 and the
 * error lines go back to the model as feedback. Warnings pass, the same bar CI uses without --strict.
 *
 * Input (stdin): the hook JSON — `hook_event_name`, `tool_use_id`, `cwd`, and on PostToolUse `duration_ms`.
 * Exit: 0 = pass, 2 = errors found (stderr goes back to the model).
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSeoMd } from './seo-md.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const stampDir = () => process.env.IDEA_LOOP_SEO_HOOK_DIR || join(tmpdir(), 'idea-loop-seo-check');
const stampFile = (id) => join(stampDir(), String(id).replace(/[^A-Za-z0-9_-]/g, '_'));

/** Whether any file under dir was modified after `since` (ms). Stops at the first one. */
export function touchedSince(dir, since) {
  if (!existsSync(dir)) return false;
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      const st = statSync(p);
      if (st.isDirectory()) stack.push(p);
      else if (st.mtimeMs > since) return true;
    }
  }
  return false;
}

function repoRoot(cwd) {
  const res = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8' });
  return res.status === 0 ? res.stdout.trim() : null;
}

/** The build output dir and check args SEO.md declares for the repo around cwd, or null. */
export function target(cwd) {
  if (!cwd || !existsSync(cwd)) return null;
  const root = repoRoot(cwd);
  if (!root || !existsSync(join(root, 'SEO.md'))) return null;
  let build;
  try {
    build = readSeoMd(join(root, 'SEO.md')).build;
  } catch {
    return null;
  }
  return build.distDir ? { root, dist: join(root, build.distDir), args: build.checkArgs } : null;
}

/** Only the error lines, each under its route, so the feedback stays short. */
export function errorsOnly(report) {
  const out = [];
  let route = null;
  for (const line of report.split('\n')) {
    if (/^ {2}\S/.test(line)) route = line.trim();
    else if (line.includes('[ERROR]')) {
      if (route) out.push(route), (route = null);
      out.push(line);
    } else if (line.startsWith('Summary:')) out.push(line);
  }
  return out.join('\n');
}

/** When the command started: the PreToolUse record, else now minus PostToolUse's duration_ms. */
export function startedAt(payload, now = Date.now()) {
  const file = stampFile(payload.tool_use_id);
  if (existsSync(file)) {
    const t = Number(readFileSync(file, 'utf8'));
    rmSync(file, { force: true });
    if (Number.isFinite(t)) return t;
  }
  const ms = Number(payload.duration_ms);
  return Number.isFinite(ms) && ms >= 0 ? now - ms - 1000 : null;
}

function main() {
  let payload;
  try {
    payload = JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    return 0;
  }
  const id = payload?.tool_use_id;
  if (!id) return 0;
  if (payload.hook_event_name === 'PreToolUse') {
    if (!target(payload.cwd)) return 0;
    mkdirSync(stampDir(), { recursive: true });
    writeFileSync(stampFile(id), String(Date.now()));
    return 0;
  }
  if (payload.hook_event_name !== 'PostToolUse') return 0;
  const since = startedAt(payload);
  if (since == null) return 0;
  const t = target(payload.cwd);
  if (!t || !touchedSince(t.dist, since)) return 0;
  const res = spawnSync(process.execPath, [join(here, 'seo-check.mjs'), t.dist, ...t.args], { encoding: 'utf8' });
  if (res.status === 0) return 0;
  if (res.status !== 1) {
    console.error(`seo-check 没跑起来（退出码 ${res.status}）：${(res.stderr || res.stdout).trim()}`);
    return 2;
  }
  console.error(
    [
      `构建产物 ${t.dist} 有 SEO error（idea-loop:seo-check）：`,
      errorsOnly(res.stdout),
      '改完重新构建；每条规则的理由见 idea-loop:seo-check。',
    ].join('\n'),
  );
  return 2;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(main());
