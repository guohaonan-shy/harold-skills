#!/usr/bin/env node
/**
 * PR description = the review report, section by section.
 *
 * The reader is the person who decides the merge, opening the PR with no context: the work was
 * delegated, and they may only half remember the spec. The description is the report written for
 * that reader, one document start to finish: what the problem was, how it was fixed, how that was
 * verified, what else got filed, what is left for them. Everything that is only for looking things up
 * sits folded at the bottom. Round-by-round review reports live in the PR's review loop (the session
 * and its local file, review-loop.mjs), archived to the PR as comments when it merges; their
 * conclusion is folded into the report. Sections live between hidden markers, always appear in this
 * order whatever order they were written in, and each carries a fixed heading the script writes itself:
 *
 *   summary       一句话          who can now do what, or what got fixed
 *   problem       问题            what was wrong (reproduced behaviour + the numbers), for a reader who never followed it
 *   changes       怎么修          how it was fixed: the rules applied and their grounds, the slicing (each ticket's
 *                                 title, what blocks it, its end-to-end behaviour); before → after shown for pages
 *   verification  怎么验证        one behaviour per line: how checked and the result, what was left unverified
 *                                 and why, what the review rounds concluded
 *   rollback      能否回滚        if this turns out wrong after merging: can it be undone, how, what it touches; what to
 *                                 prepare before going live; the pre-existing problems found on the way and filed
 *   your-todo     要你做的事      what to review, what to decide
 *   reference     参考            folded: change map by module, spec & tickets, ledger, cleanup
 *
 * Everything outside `reference` is for a person, not for whoever fixes the code: a section carrying
 * a code-level reference (backticks, file:line, a path, a snake_case name, a commit hash, a section
 * number) is refused before it is written. Link and image addresses are not checked.
 *
 * Each writer rewrites only its own sections, so none clobbers another. The legacy `review` section
 * and the 0.0.16 drafts' sections are dropped on the next write; legacy `header` / `ledger` blocks are
 * left as text. A description opened when 顺带开的 issue was a section of its own still has it: the next
 * write folds its list into 能否回滚, under the label ISSUES_LABEL, and that list survives later writes of
 * 能否回滚 unless the new text brings its own.
 * Layout and who writes what: skills/engineering/pr/SKILL.md.
 *
 * Deterministic core (getSection, setSection, readerProblems) is pure and unit-tested. The CLI is the gh boundary;
 * content arrives as a file, never interpolated into a shell command.
 *
 * Usage:
 *   node pr-body.mjs get <owner/repo> <pr> <section>
 *   node pr-body.mjs set <owner/repo> <pr> <section> <content.md>
 * Exit: 0 = done, 1 = usage / gh error.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { codeRefs } from './review-check.mjs';

export const TITLES = {
  summary: '一句话',
  problem: '问题',
  changes: '怎么修',
  verification: '怎么验证',
  rollback: '能否回滚',
  'your-todo': '要你做的事',
  reference: '参考',
};
// Headings a section used to carry: a description written before the report shape still has them
// inside the markers, and they must not survive next to the new heading.
const OLD_TITLES = { changes: ['改了什么'] };
export const SECTIONS = Object.keys(TITLES);
const LEGACY = ['review', 'links', 'before-merge', 'after-merge', 'before-after', 'decisions'];
// The section that became part of 能否回滚; its list is folded in rather than dropped.
const FOLDED = { name: 'issues', heading: '## 顺带开的 issue' };
export const ISSUES_LABEL = '**顺带开的 issue**';
const LOOKUP_ONLY = ['reference'];

/** Code-level references in a section a person reads; link and image addresses are not text. */
export function readerProblems(name, content) {
  if (LOOKUP_ONLY.includes(name)) return [];
  const text = String(content ?? '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\]\([^)]*\)/g, ']')
    .replace(/<https?:[^>]*>/g, '')
    .replace(/https?:\/\/\S+/g, '');
  return codeRefs(text);
}
const MAX_BODY = 65000;

const open = (name) => `<!-- idea-loop:section ${name} -->`;
const close = (name) => `<!-- /idea-loop:section ${name} -->`;

const heading = (name) => `## ${TITLES[name]}`;

/** The list of an old 顺带开的 issue section, without its heading; null when it was empty or said "无". */
function issuesToFold(body) {
  const text = parse(body, [FOLDED.name])[FOLDED.name];
  if (text == null) return null;
  const list = (text.startsWith(FOLDED.heading) ? text.slice(FOLDED.heading.length) : text).trim();
  return list && !/^[（(]?无[）)]?$/.test(list) ? list : null;
}

/** The labelled issue list at the end of a 能否回滚 section, if it has one. */
function issuesBlock(text) {
  const i = text?.indexOf(ISSUES_LABEL) ?? -1;
  return i === -1 ? null : text.slice(i).trim();
}

function parse(body = '', names = SECTIONS) {
  const found = {};
  for (const name of names) {
    const start = body.indexOf(open(name));
    const end = body.indexOf(close(name));
    if (start !== -1 && end > start) found[name] = body.slice(start + open(name).length, end).trim();
  }
  return found;
}

/** Section content without the heading the script adds; a writer that included it anyway is forgiven. */
const strip = (name, text) => {
  const t = text.trim();
  for (const h of [heading(name), ...(OLD_TITLES[name] ?? []).map((title) => `## ${title}`)]) {
    if (t.startsWith(h)) return t.slice(h.length).trim();
  }
  return t;
};

export function getSection(body, name) {
  if (!SECTIONS.includes(name)) throw new Error(`unknown section ${name}; one of ${SECTIONS.join(', ')}`);
  const found = parse(body)[name];
  return found == null ? null : strip(name, found);
}

/**
 * Replace one section and re-emit every section in the fixed order. Text outside the markers (a
 * human-written description, the attribution line) is kept, below the sections.
 * Empty content removes the section.
 */
export function setSection(body, name, content) {
  if (!SECTIONS.includes(name)) throw new Error(`unknown section ${name}; one of ${SECTIONS.join(', ')}`);
  const problems = readerProblems(name, content);
  if (problems.length) {
    throw new Error(`section ${name} is read by a person; say it in words, put code locations in reference:\n${problems.join('\n')}`);
  }
  const sections = parse(body);
  const folded = issuesToFold(body);
  let rest = body ?? '';
  for (const n of new Set([...Object.keys(sections), ...Object.keys(parse(body, [...LEGACY, FOLDED.name]))])) {
    const start = rest.indexOf(open(n));
    const end = rest.indexOf(close(n));
    if (start === -1 || end < start) continue;
    rest = rest.slice(0, start) + rest.slice(end + close(n).length);
  }
  rest = rest.trim();
  for (const n of Object.keys(sections)) sections[n] = strip(n, sections[n]);
  const before = sections.rollback;
  if (content && strip(name, content)) sections[name] = strip(name, content);
  else delete sections[name];
  // the issue list outlives a rewrite of 能否回滚 that does not mention issues itself
  const carried = name === 'rollback' ? issuesBlock(before) : null;
  if (name === 'rollback' && sections.rollback && carried && !sections.rollback.includes(ISSUES_LABEL)) {
    sections.rollback = `${sections.rollback}\n\n${carried}`;
  }
  if (folded) {
    const own = sections.rollback ?? '';
    if (!own.includes(ISSUES_LABEL)) sections.rollback = own ? `${own}\n\n${ISSUES_LABEL}\n\n${folded}` : `${ISSUES_LABEL}\n\n${folded}`;
  }
  const out = SECTIONS.filter((n) => sections[n]).map((n) => `${open(n)}\n${heading(n)}\n\n${sections[n]}\n${close(n)}`);
  if (rest) out.push(rest);
  const next = out.join('\n\n') + '\n';
  if (next.length > MAX_BODY) {
    throw new Error(`PR description would be ${next.length} characters (limit ${MAX_BODY}); fold or shorten section ${name}`);
  }
  return next;
}

// ---------- gh boundary ----------

const gh = (args, input) => execFileSync('gh', args, { encoding: 'utf8', input, maxBuffer: 32 * 1024 * 1024 });

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    const [cmd, repo, pr, name, file] = process.argv.slice(2);
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo ?? '') || !/^\d+$/.test(pr ?? '') || !SECTIONS.includes(name)) {
      throw new Error(`usage: pr-body.mjs get|set <owner/repo> <pr> <${SECTIONS.join('|')}> [content.md]`);
    }
    const body = JSON.parse(gh(['api', `repos/${repo}/pulls/${pr}`])).body ?? '';
    if (cmd === 'get') {
      console.log(getSection(body, name) ?? '');
    } else if (cmd === 'set' && file) {
      const next = setSection(body, name, readFileSync(file, 'utf8'));
      gh(['api', `repos/${repo}/pulls/${pr}`, '--method', 'PATCH', '--input', '-'], JSON.stringify({ body: next }));
      console.log(`section ${name} written (${next.length} characters)`);
    } else {
      throw new Error('usage: pr-body.mjs set needs a content file');
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
