#!/usr/bin/env node
/**
 * Keep only the tool diagnostics that sit on lines this PR changed.
 *
 * pr-review's Standards axis folds the repository's own checks (lint, typecheck, declared check
 * commands) into its answer, but only for code this PR wrote: a whole-repo lint dumps the existing
 * debt into the review, and that debt is not this PR's to fix. So the reviewer runs the checks, pipes
 * their output through here, and only diagnostics on added or changed lines of `git diff
 * <base>...HEAD` become candidates. Rules: references/review-standards.md §3.
 *
 * Tools must print one diagnostic per line with its location: `path:line[:col]` (ruff, mypy,
 * eslint -f unix, most compilers) or `path(line,col)` (tsc). Paths may be absolute or relative to a
 * sub-project; they are matched against the diff by path suffix.
 *
 * Deterministic core (changedLines, locate, filterDiagnostics) is pure and unit-tested.
 *
 * Usage:  <tool> 2>&1 | node changed-lines.mjs <base-ref>
 * Output: JSON { onChanged: [lines], elsewhere: n, unlocated: n }
 * Exit:   0 = done (whether or not anything matched), 1 = usage / git error.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** Unified diff (any -U) → Map(path → Set of new-side line numbers that were added or changed). */
export function changedLines(diff) {
  const out = new Map();
  let path = null;
  let line = 0;
  for (const raw of diff.split('\n')) {
    if (raw.startsWith('+++ ')) {
      path = raw === '+++ /dev/null' ? null : raw.slice(4).replace(/^b\//, '');
      if (path && !out.has(path)) out.set(path, new Set());
    } else if (raw.startsWith('@@')) {
      line = Number(raw.match(/\+(\d+)/)?.[1] ?? 0);
    } else if (path && raw.startsWith('+')) {
      out.get(path).add(line++);
    } else if (path && raw.startsWith(' ')) {
      line++;
    }
  }
  return out;
}

/** A diagnostic line → { path, line } or null. */
export function locate(text) {
  const m = text.match(/^\s*([^\s:()]+?\.[A-Za-z0-9]+)(?::(\d+)(?::\d+)?|\((\d+),\d+\))/);
  return m ? { path: m[1].replace(/^\.\//, ''), line: Number(m[2] ?? m[3]) } : null;
}

const sameFile = (a, b) => a === b || a.endsWith(`/${b}`) || b.endsWith(`/${a}`);

export function filterDiagnostics(output, changed) {
  const result = { onChanged: [], elsewhere: 0, unlocated: 0 };
  for (const text of output.split('\n')) {
    if (!text.trim()) continue;
    const loc = locate(text);
    if (!loc) {
      result.unlocated++;
      continue;
    }
    const file = [...changed.keys()].find((p) => sameFile(p, loc.path));
    if (file && changed.get(file).has(loc.line)) result.onChanged.push(text.trim());
    else result.elsewhere++;
  }
  return result;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const base = process.argv[2];
  if (!base) {
    console.error('usage: <tool> 2>&1 | node changed-lines.mjs <base-ref>');
    process.exit(1);
  }
  try {
    const diff = execFileSync('git', ['diff', '-U0', '--no-color', `${base}...HEAD`], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
    console.log(JSON.stringify(filterDiagnostics(readFileSync(0, 'utf8'), changedLines(diff)), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
