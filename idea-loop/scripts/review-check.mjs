#!/usr/bin/env node
/**
 * Admission check for one pr-review round's candidates — quotes must exist, code must be in the diff.
 *
 * A review that is free to assert things finds something every time, and some of it is invented: a
 * rule the repository never wrote, a spec line nobody said, code that is not in this PR. So every
 * candidate the two Codex reviewers return carries what it stands on, and this script checks that
 * ground mechanically before anything reaches Harold:
 *
 *   spec      — quote.text appears in quote.file (the spec or a ticket); figure exists in the
 *               round's evidence dir and is named rN-… (a Spec finding that cannot be drawn is not one)
 *   standards — rule.text appears in rule.file; every non-blank line of code.snippet is an added line
 *               of code.path in `git diff <base>...HEAD`
 *
 * Whitespace is normalized; nothing else is fuzzy. A failed candidate is discarded with its reason;
 * the review thread lists discards in one folded line each. Rules: references/review-standards.md.
 *
 * Deterministic core (normalize, contains, snippetInDiff, admit) is pure and unit-tested.
 *
 * Usage:  node review-check.mjs <candidates.json> <base-ref> <evidence-dir> <round>
 * Output: JSON { spec: [...], standards: [...], discarded: [{ id, title, reason }] }
 * Exit:   0 = checked, 1 = usage / io error.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { changedLines } from './changed-lines.mjs';

export const normalize = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
export const contains = (haystack, needle) => normalize(needle).length > 0 && normalize(haystack).includes(normalize(needle));

/** Added lines of one file in a unified diff, as normalized strings. */
export function addedLines(diff, path) {
  const out = [];
  let current = null;
  for (const raw of diff.split('\n')) {
    if (raw.startsWith('+++ ')) current = raw.slice(4).replace(/^b\//, '');
    else if (current === path && raw.startsWith('+')) out.push(normalize(raw.slice(1)));
  }
  return out;
}

export function snippetInDiff(snippet, added) {
  const lines = String(snippet ?? '').split('\n').map(normalize).filter(Boolean);
  const pool = new Set(added);
  return lines.length > 0 && lines.every((l) => pool.has(l));
}

/**
 * @param candidates  { spec: [], standards: [] } as the reviewers returned them
 * @param io          { read(path) → string|null, exists(path) → bool, added(path) → string[] }
 */
export function admit(candidates, io, { round }) {
  const result = { spec: [], standards: [], discarded: [] };
  const drop = (c, reason) => result.discarded.push({ id: c.id, title: c.title, reason });
  for (const c of candidates.spec ?? []) {
    const file = c.quote?.file && io.read(c.quote.file);
    if (!file) drop(c, `引用的文件不存在：${c.quote?.file ?? '（没给）'}`);
    else if (!contains(file, c.quote.text)) drop(c, `${c.quote.file} 里找不到引用的原文`);
    else if (!c.figure || !new RegExp(`^r${round}-`).test(c.figure)) drop(c, `没有配图，或图名不以 r${round}- 开头`);
    else if (!io.exists(c.figure)) drop(c, `配图 ${c.figure} 不在证据目录里`);
    else result.spec.push(c);
  }
  for (const c of candidates.standards ?? []) {
    const rule = c.rule?.file && io.read(c.rule.file);
    if (!rule) drop(c, `规则文件不存在：${c.rule?.file ?? '（没给）'}`);
    else if (!contains(rule, c.rule.text)) drop(c, `${c.rule.file} 里找不到引用的规则原文`);
    else if (!c.code?.path || !snippetInDiff(c.code.snippet, io.added(c.code.path))) drop(c, `代码片段不在这次 diff 新增的行里（${c.code?.path ?? '没给路径'}）`);
    else result.standards.push(c);
  }
  return result;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [file, base, evidenceDir, round] = process.argv.slice(2);
  if (!file || !base || !evidenceDir || !/^\d+$/.test(round ?? '')) {
    console.error('usage: node review-check.mjs <candidates.json> <base-ref> <evidence-dir> <round>');
    process.exit(1);
  }
  try {
    const diff = execFileSync('git', ['diff', '--no-color', `${base}...HEAD`], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
    changedLines(diff); // fail early on an unreadable diff
    const io = {
      read: (p) => (existsSync(p) ? readFileSync(p, 'utf8') : null),
      exists: (name) => existsSync(join(evidenceDir, name)),
      added: (p) => addedLines(diff, p),
    };
    console.log(JSON.stringify(admit(JSON.parse(readFileSync(file, 'utf8')), io, { round: Number(round) }), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
