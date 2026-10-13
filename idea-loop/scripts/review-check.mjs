#!/usr/bin/env node
/**
 * Admission check for one pr-review round's candidates — quotes must exist, code must be in the diff.
 *
 * A review that is free to assert things finds something every time, and some of it is invented: a
 * rule the repository never wrote, a spec line nobody said, code that is not in this PR. So every
 * candidate the two Codex reviewers return carries what it stands on, and this script checks that
 * ground mechanically before anything reaches Harold:
 *
 *   spec      — quote.text appears in quote.file (the spec or a ticket); a behavioural finding
 *               (behavior: true) carries its reproduction as evidence — a figure in the round's
 *               evidence dir named rN-…, or an inline table / worked example — because a behaviour
 *               that was not reproduced is not a finding. Which form is the reviewer's call: whatever
 *               lets the reader see it fastest. A non-behavioural one (an extra file, a path that
 *               differs from the spec) needs no evidence beyond the diff.
 *   standards — rule.text appears in rule.file; every non-blank line of code.snippet is an added line
 *               of code.path in `git diff <base>...HEAD`
 *
 * Whitespace is normalized; nothing else is fuzzy. A failed candidate is discarded with its reason;
 * the round's report lists discards in one folded line each.
 *
 * Admitted candidates are then checked for the shape the round's report is written in, because it
 * is read by the person who decides, not by the person who fixes: a Spec finding has a title that
 * states the consequence, the problem, the user impact, and a decision (one line of context, options,
 * a recommendation); a Standards finding has now / impact / suggestion; and none of that reader-facing text may carry a
 * code-level reference — backticks, file:line, a path, a snake_case name, a commit hash, a section
 * number like §4.7. Those belong in `locations`, which only the fixer sees. Shape problems are not
 * discards: the finding stands, its wording has to be redone (`rewrite`). Rules:
 * references/review-standards.md, references/pr-description.md §5.
 *
 * Deterministic core (normalize, contains, snippetInDiff, codeRefs, shapeProblems, admit) is pure
 * and unit-tested.
 *
 * Usage:  node review-check.mjs <candidates.json> <base-ref> <evidence-dir> <round>
 * Output: JSON { spec: [...], standards: [...], discarded: [{ id, title, reason }],
 *                rewrite: [{ id, problems: [...] }] }
 * Exit:   0 = checked and every admitted finding is in shape, 1 = usage / io error,
 *         2 = checked, but `rewrite` is not empty — fix the wording and run again before posting.
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

/** Code-level references a decider cannot read. Each hit is returned as the matched text. */
const CODE_REFS = [
  ['反引号', /`[^`\n]+`/g],
  ['文件:行号', /[\w./-]+\.\w{1,5}:\d+/g],
  ['路径', /\b[\w-]+(?:\/[\w-]+){2,}(?:\.\w+)?\b|\b[\w-]+\/[\w-]+\.\w{1,5}\b/g],
  ['代码文件名', /\b[\w-]+\.(?:ts|tsx|js|jsx|mjs|cjs|py|go|rs|rb|java|kt|swift|sql|css|scss|html|vue|json|ya?ml|toml|sh)\b/g],
  ['章节编号', /§\s*\d+(?:\.\d+)*/g],
  ['提交号', /\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}\b/g],
  ['下划线命名', /\b[A-Za-z][A-Za-z0-9]*_[A-Za-z0-9_]+\b/g],
  ['函数调用', /\b[A-Za-z_][\w.]*\(\)/g],
];

export function codeRefs(text) {
  const hits = [];
  const seen = new Set();
  for (const [kind, re] of CODE_REFS) {
    for (const m of String(text ?? '').matchAll(re)) {
      if ([...seen].some((s) => s.includes(m[0]))) continue; // already reported inside a wider hit
      seen.add(m[0]);
      hits.push(`${kind}「${m[0]}」`);
    }
  }
  return hits;
}

const filled = (v) => typeof v === 'string' && normalize(v).length > 0;

/** What is wrong with the wording of one admitted finding; empty when it can be posted as is. */
export function shapeProblems(c, axis) {
  const problems = [];
  const fields = axis === 'spec'
    ? { title: '标题', problem: '问题', user_impact: '对用户的影响', example: '例子' }
    : { title: '标题', now: '现状', impact: '影响', suggestion: '建议' };
  for (const [key, label] of Object.entries(fields)) {
    if (key === 'example' && !filled(c[key])) continue; // optional: a figure may carry the evidence instead
    if (!filled(c[key])) problems.push(`缺「${label}」`);
    else for (const hit of codeRefs(c[key])) problems.push(`「${label}」里有代码层面的指称：${hit}——说行为和后果，位置放进 locations`);
  }
  if (axis === 'spec') {
    if (typeof c.behavior !== 'boolean') problems.push('没标 behavior（是不是行为问题决定要不要配图）');
    else if (!c.behavior && c.figure) problems.push('不是行为问题（多了 / 少了文件、路径不一致这类）不配图，去掉 figure');
    if (!filled(c.decide?.context)) problems.push('「要你决定」缺一句前提（和 spec 或工单哪条规定对不上）');
    const options = c.decide?.options;
    if (!Array.isArray(options) || options.filter(filled).length < 2) problems.push('「要你决定」至少要列两个选项');
    if (!filled(c.decide?.recommend)) problems.push('「要你决定」没给建议');
    for (const t of [c.decide?.context, ...(Array.isArray(options) ? options : []), c.decide?.recommend]) {
      for (const hit of codeRefs(t)) problems.push(`「要你决定」里有代码层面的指称：${hit}`);
    }
  }
  return problems;
}

/**
 * @param candidates  { spec: [], standards: [] } as the reviewers returned them
 * @param io          { read(path) → string|null, exists(path) → bool, added(path) → string[] }
 */
export function admit(candidates, io, { round }) {
  const result = { spec: [], standards: [], discarded: [], rewrite: [] };
  const drop = (c, reason) => result.discarded.push({ id: c.id, title: c.title, reason });
  for (const c of candidates.spec ?? []) {
    const file = c.quote?.file && io.read(c.quote.file);
    if (!file) drop(c, `引用的文件不存在：${c.quote?.file ?? '（没给）'}`);
    else if (!contains(file, c.quote.text)) drop(c, `${c.quote.file} 里找不到引用的原文`);
    else if (c.behavior !== false && !c.figure && !filled(c.example)) drop(c, '行为问题没有复现证据（图、表格或例子都没有）：没复现的不算问题');
    else if (c.figure && !new RegExp(`^r${round}-`).test(c.figure)) drop(c, `配图 ${c.figure} 不以 r${round}- 开头`);
    else if (c.figure && !io.exists(c.figure)) drop(c, `配图 ${c.figure} 不在证据目录里`);
    else result.spec.push(c);
  }
  for (const c of candidates.standards ?? []) {
    const rule = c.rule?.file && io.read(c.rule.file);
    if (!rule) drop(c, `规则文件不存在：${c.rule?.file ?? '（没给）'}`);
    else if (!contains(rule, c.rule.text)) drop(c, `${c.rule.file} 里找不到引用的规则原文`);
    else if (!c.code?.path || !snippetInDiff(c.code.snippet, io.added(c.code.path))) drop(c, `代码片段不在这次 diff 新增的行里（${c.code?.path ?? '没给路径'}）`);
    else result.standards.push(c);
  }
  for (const [axis, list] of [['spec', result.spec], ['standards', result.standards]]) {
    for (const c of list) {
      const problems = shapeProblems(c, axis);
      if (problems.length) result.rewrite.push({ id: c.id, problems });
    }
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
    const result = admit(JSON.parse(readFileSync(file, 'utf8')), io, { round: Number(round) });
    console.log(JSON.stringify(result, null, 2));
    if (result.rewrite.length) process.exitCode = 2;
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
