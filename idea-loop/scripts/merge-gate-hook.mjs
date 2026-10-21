#!/usr/bin/env node
/**
 * PreToolUse hook on Bash: no `gh pr merge` while a requirement's design is still unarchived.
 *
 * `docs/design/tmp/<spec-slug>/` holds a requirement's design while it is in flight. The process files
 * stay local; at freeze the frozen canvas, the freeze record and `delta/` are force-added and reach the
 * main branch through the design PR, so the implementation starts from main with them. Before the
 * implementation PR merges, pr-review folds `delta/` into `docs/design/prod/` and clears the folder; if a
 * merge is about to run while the folder still holds design output (anything outside its `research/`
 * subfolder — the pages `uiux-research` drops are scratch the human read), that fold never happened and
 * the merge would leave `prod/` behind the product. This hook stops the command and names the
 * requirements, and points at the flow that clears them (pr-review's pre-merge archive).
 *
 * Which requirements a merge answers for comes from what the branch changes against the main branch:
 * a branch that changes only `docs/` (a spec PR, a design PR) passes; otherwise only the requirements
 * whose spec or design folder the branch touches count, so another spec's frozen design sitting on main
 * does not block it. When that cannot be read (no `origin/HEAD`, an empty diff) every requirement with
 * design output counts.
 *
 * Everything else passes: other commands, a missing or empty `tmp/`, a working directory that is not
 * inside a git repository. The hook only runs git — no agent, no network.
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

const hasFile = (dir, skip = () => false) =>
  readdirSync(dir).some((name) => {
    if (name === '.DS_Store' || skip(name)) return false;
    const p = join(dir, name);
    return statSync(p).isDirectory() ? hasFile(p) : true;
  });

/**
 * `research/` is where `uiux-research` drops its pages and screenshots — `tmp/research/` when there is
 * no spec, `tmp/<spec-slug>/research/` when there is. It is scratch the human read, not a design that
 * has to be folded into `prod/`, so it never counts as an unarchived requirement (it goes with `tmp/`).
 */
const RESEARCH = 'research';

/** Spec slugs under `<root>/docs/design/tmp/` whose folder holds at least one file (outside `research/`), sorted. */
export function pendingRequirements(root) {
  const tmp = join(root, TMP);
  if (!existsSync(tmp)) return [];
  return readdirSync(tmp)
    .filter((name) => name !== RESEARCH && statSync(join(tmp, name)).isDirectory() && hasFile(join(tmp, name), (n) => n === RESEARCH))
    .sort();
}

/** Files the branch at HEAD changes against the main branch, or null when that cannot be read. */
export function branchChanges(root) {
  const git = (args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  const base = git(['merge-base', 'HEAD', 'origin/HEAD']);
  if (base.status !== 0) return null;
  const diff = git(['diff', '--name-only', base.stdout.trim(), 'HEAD']);
  if (diff.status !== 0) return null;
  const files = diff.stdout.split('\n').filter(Boolean);
  return files.length ? files : null;
}

/** The pending requirements this merge must archive first, given what the branch changes (null: unknown). */
export function blocking(pending, changed) {
  if (!changed) return pending;
  if (changed.every((f) => f.startsWith('docs/'))) return [];
  const touched = new Set(changed.map((f) => f.match(/^docs\/(?:spec|design\/tmp)\/([^/]+)\//)?.[1]).filter(Boolean));
  return pending.filter((s) => touched.has(s));
}

/** The message that goes back when a merge is blocked. */
export function blockMessage(root, slugs, script = join(dirname(fileURLToPath(import.meta.url)), 'design-archive-write.mjs')) {
  return [
    `gh pr merge 被拦下：${TMP}/ 下还有没归档的设计差异，合并会把它们丢掉。`,
    ...slugs.map((s) => `  - ${s}`),
    '先走 pr-review 的合并前归档（idea-loop:pr-review 的「合并前归档」），再重新合并：',
    '  1 起 UI 审查（归档模式），对着实现核一遍；核不过就不归档，回 review loop',
    '  2 在会话里把草稿给人看，人要改就转回同一个 UI 审查，改到人通过',
    '  3 人通过后才跑归档脚本（不要在人看过之前跑）：',
    ...slugs.map((s) => `       node "${script}" "${root}" ${s}`),
    '  4 提交 docs/design/prod、被清掉的 tmp/<spec>（和被改写的 spec）并推送到 PR 分支，然后重新执行合并',
    '（脚本加 --dry-run 只校验、不写。）',
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
  const slugs = blocking(pendingRequirements(root), branchChanges(root));
  if (!slugs.length) return 0;
  console.error(blockMessage(root, slugs));
  return 2;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(main());
