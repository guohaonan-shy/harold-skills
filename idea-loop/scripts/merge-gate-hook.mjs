#!/usr/bin/env node
/**
 * PreToolUse hook on Bash: no `gh pr merge` while a requirement's design is still unarchived.
 *
 * `docs/design/tmp/<spec-slug>/` is the local scratch area of a requirement in flight (never in git,
 * so no CI check can see it). If a merge command is about to run and that folder still holds anything,
 * the design side of the PR was never folded into `docs/design/prod/` — the merge would silently lose
 * it. This hook stops the command and names the requirements; the archive script
 * (design-archive-write.mjs) is how to clear them.
 *
 * Everything else passes: other commands, a missing or empty `tmp/`, a working directory that is not
 * inside a git repository. The hook only runs a script — no agent, no network.
 *
 * Input (stdin): the PreToolUse JSON — `tool_input.command`, `cwd`.
 * Exit: 0 = allow, 2 = block (the message on stderr goes back to the model).
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TMP = 'docs/design/tmp';

/** Whether a shell command line runs `gh pr merge` (flags may sit between `gh` and `pr`). */
export function isMergeCommand(command) {
  return /\bgh\b[^|;&\n]*?\bpr\s+merge\b/.test(String(command ?? ''));
}

const hasFile = (dir) =>
  readdirSync(dir).some((name) => {
    if (name === '.DS_Store') return false;
    const p = join(dir, name);
    return statSync(p).isDirectory() ? hasFile(p) : true;
  });

/** Spec slugs under `<root>/docs/design/tmp/` whose folder holds at least one file, sorted. */
export function pendingRequirements(root) {
  const tmp = join(root, TMP);
  if (!existsSync(tmp)) return [];
  return readdirSync(tmp)
    .filter((name) => statSync(join(tmp, name)).isDirectory() && hasFile(join(tmp, name)))
    .sort();
}

/** The message that goes back when a merge is blocked. */
export function blockMessage(root, slugs, script = join(dirname(fileURLToPath(import.meta.url)), 'design-archive-write.mjs')) {
  return [
    `gh pr merge 被拦下：${TMP}/ 下还有没归档的设计差异，合并会把它们丢掉。`,
    ...slugs.map((s) => `  - ${s}`),
    '先归档，再重新合并（归档前设计要先经人看过）：',
    ...slugs.map((s) => `  node "${script}" "${root}" ${s}`),
    '（加 --dry-run 只校验、不写。）',
  ].join('\n');
}

function repoRoot(cwd) {
  const res = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8' });
  return res.status === 0 ? res.stdout.trim() : null;
}

function main() {
  let payload = {};
  try {
    payload = JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    return 0;
  }
  if (!isMergeCommand(payload?.tool_input?.command)) return 0;
  const cwd = payload.cwd || process.cwd();
  if (!existsSync(cwd)) return 0;
  const root = repoRoot(cwd);
  if (!root) return 0;
  const slugs = pendingRequirements(root);
  if (!slugs.length) return 0;
  console.error(blockMessage(root, slugs));
  return 2;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(main());
