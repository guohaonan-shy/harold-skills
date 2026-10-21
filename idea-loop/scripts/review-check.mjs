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
 *               A behavioural finding also says whether it shows on screen (on_screen). One that does
 *               must carry a screenshot taken from the implementation (before / after, a screenshot
 *               flow, a gif) — a table or a timeline in words leaves the decider guessing what the
 *               student saw — unless no_screenshot says why it could not be shot; that is a shape
 *               problem (rewrite), not a discard.
 *   standards — rule.text appears in rule.file; every non-blank line of code.snippet is an added line
 *               of code.path in `git diff <base>...HEAD`
 *
 * Every candidate also carries a disposition. Absent or 要你决定 is the old shape — the human decides.
 * 照规则 is a finding whose handling the written rules already settle (skills/engineering/decision-rules/SKILL.md):
 * it carries a basis ({ kind, file, text, summary } — kind is one of the three things a decision may
 * stand on: the text of a written rule, the human's own words from this spec or PR, an existing
 * practice with an instance; text must be found in file, else the candidate is discarded like any
 * ungrounded quote) and an action (修 / 同步改 / 接受并补记 / 恢复 / 开 issue), and has no decide block —
 * no options, no recommendation. A Standards finding stands on its own rule, so its basis is optional.
 * A Standards finding about code that was not added in this diff (existing: true) is admitted only as a
 * ruled fix with a `pollutes` sentence — a stock problem that spoils this change's input or conclusion
 * or turns CI red; its snippet is then looked up in the file as it is now, not in the diff.
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
 * skills/engineering/pr-review/references/review-standards.md, skills/engineering/pr/references/review-round.md.
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

export const ACTIONS = ['修', '同步改', '接受并补记', '恢复', '开 issue'];
export const BASIS_KINDS = ['规则原文', '人的决定', '现有做法'];
export const DISPOSITIONS = ['照规则', '要你决定'];
export const isRuled = (c) => c.disposition === '照规则';

/** What is wrong with the shape of a 照规则 finding: its basis, its action, and that it asks nothing of the human. */
function ruledProblems(c, axis) {
  const problems = [];
  if (!ACTIONS.includes(c.action)) problems.push(c.action === undefined || c.action === '' ? `缺动作（${ACTIONS.join(' / ')} 之一）` : `动作只能是 ${ACTIONS.join(' / ')} 之一，不是「${c.action}」`);
  if (c.decide !== undefined) problems.push('照规则的条目不写「要你决定」：没有选项、没有建议，依据不成立就改成「要你决定」');
  if (c.basis === undefined) {
    if (axis === 'spec') problems.push('缺依据（规则原文 / 人的决定 / 现有做法，三选一，带原文和出处）');
  } else {
    const b = c.basis;
    if (!BASIS_KINDS.includes(b?.kind)) problems.push(`依据只认三种：${BASIS_KINDS.join(' / ')}`);
    if (!filled(b?.file) || !filled(b?.text)) problems.push('依据缺出处或原文（file 和 text 都要给）');
    if (!filled(b?.summary)) problems.push('缺一句依据（给人读的一句话，说清依据是什么）');
    else for (const hit of codeRefs(b.summary)) problems.push(`「依据」里有代码层面的指称：${hit}`);
  }
  if (c.existing) {
    if (c.action !== '修') problems.push('存量问题照规则处理时，动作只能是「修」');
    if (!filled(c.pollutes)) problems.push('缺一句它怎么影响这次的输入、结论或 CI（pollutes）：说不出，就是与这次无关的存量，不报');
    else for (const hit of codeRefs(c.pollutes)) problems.push(`「它怎么影响这次」里有代码层面的指称：${hit}`);
  }
  return problems;
}

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
  if (c.disposition !== undefined && !DISPOSITIONS.includes(c.disposition)) problems.push(`处置只能是「${DISPOSITIONS.join('」或「')}」，不是「${c.disposition}」`);
  if (isRuled(c)) problems.push(...ruledProblems(c, axis));
  else if (c.existing) problems.push('改动行以外的存量问题只在它污染了这次改动、或让 CI 变红时才报，处置必须是「照规则」（动作：修）');
  if (axis === 'spec') {
    if (typeof c.behavior !== 'boolean') problems.push('没标 behavior（是不是行为问题决定要不要配图）');
    else if (!c.behavior && c.figure) problems.push('不是行为问题（多了 / 少了文件、路径不一致这类）不配图，去掉 figure');
    else if (c.behavior && typeof c.on_screen !== 'boolean') problems.push('没标 on_screen（这个问题在界面上看不看得到，决定证据要不要用截图）');
    else if (c.behavior && c.on_screen && !c.figure && !filled(c.no_screenshot)) {
      problems.push('界面上看得到的问题要配取自实现的截图：单点差别用之前 / 之后截图，多步流程用截图拼的流程，动起来的用动图；表格、时序图、例子只能补充。确实拍不到（比如只有真机能复现），在 no_screenshot 里写一句为什么');
    }
    if (filled(c.no_screenshot)) for (const hit of codeRefs(c.no_screenshot)) problems.push(`「为什么没有截图」里有代码层面的指称：${hit}`);
    if (!isRuled(c)) {
      if (!filled(c.decide?.context)) problems.push('「要你决定」缺一句前提（和 spec 或工单哪条规定对不上）');
      const options = c.decide?.options;
      if (!Array.isArray(options) || options.filter(filled).length < 2) problems.push('「要你决定」至少要列两个选项');
      if (!filled(c.decide?.recommend)) problems.push('「要你决定」没给建议');
      for (const t of [c.decide?.context, ...(Array.isArray(options) ? options : []), c.decide?.recommend]) {
        for (const hit of codeRefs(t)) problems.push(`「要你决定」里有代码层面的指称：${hit}`);
      }
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
  /** A basis that names a file and a text must be telling the truth; one that names neither is a shape problem. */
  const basisProblem = (c) => {
    const b = c.basis;
    if (!isRuled(c) || !b || !filled(b.file) || !filled(b.text)) return null;
    const file = io.read(b.file);
    if (!file) return `依据（${b.kind ?? '没标种类'}）引用的文件不存在：${b.file}`;
    if (!contains(file, b.text)) return `依据（${b.kind ?? '没标种类'}）：${b.file} 里找不到引用的原文`;
    return null;
  };
  for (const c of candidates.spec ?? []) {
    const file = c.quote?.file && io.read(c.quote.file);
    if (!file) drop(c, `引用的文件不存在：${c.quote?.file ?? '（没给）'}`);
    else if (!contains(file, c.quote.text)) drop(c, `${c.quote.file} 里找不到引用的原文`);
    else if (basisProblem(c)) drop(c, basisProblem(c));
    else if (c.behavior !== false && !c.figure && !filled(c.example)) drop(c, '行为问题没有复现证据（图、表格或例子都没有）：没复现的不算问题');
    else if (c.figure && !new RegExp(`^r${round}-`).test(c.figure)) drop(c, `配图 ${c.figure} 不以 r${round}- 开头`);
    else if (c.figure && !io.exists(c.figure)) drop(c, `配图 ${c.figure} 不在证据目录里`);
    else result.spec.push(c);
  }
  for (const c of candidates.standards ?? []) {
    const rule = c.rule?.file && io.read(c.rule.file);
    if (!rule) drop(c, `规则文件不存在：${c.rule?.file ?? '（没给）'}`);
    else if (!contains(rule, c.rule.text)) drop(c, `${c.rule.file} 里找不到引用的规则原文`);
    else if (basisProblem(c)) drop(c, basisProblem(c));
    else if (c.existing === true) {
      const now = c.code?.path && io.read(c.code.path);
      if (!now || !snippetInDiff(c.code.snippet, now.split('\n').map(normalize))) drop(c, `存量代码片段在现在的文件里找不到（${c.code?.path ?? '没给路径'}）`);
      else result.standards.push(c);
    }
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
