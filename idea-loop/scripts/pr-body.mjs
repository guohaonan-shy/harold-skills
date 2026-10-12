#!/usr/bin/env node
/**
 * PR description, section by section — four fixed sections, nothing about review.
 *
 * The reader is the person who decides the merge, opening the PR with no context: the work was
 * delegated, and they may only half remember the spec. So the description reads top-down from
 * "what is this" to "what do I have to do", and everything that is only for looking things up sits
 * folded at the bottom. Review findings never go here: every round has its own thread
 * (pr-thread.mjs). Sections live between hidden markers, always appear in this order whatever order
 * they were written in, and each carries a fixed heading the script writes itself:
 *
 *   summary    一句话        who can now do what, or what got fixed
 *   changes    改了什么      one block per page (end to end) or per backend flow: before → after shown,
 *                            the backend flow change, the decisions made on the human's behalf, how it
 *                            was verified and at which points
 *   your-todo  要你做的事    what to review, what to decide, what to prepare before going live
 *   reference  参考          folded: change map by module, spec & tickets, ledger, cleanup
 *
 * Everything outside `reference` is for a person, not for whoever fixes the code: a section carrying
 * a code-level reference (backticks, file:line, a path, a snake_case name, a commit hash, a section
 * number) is refused before it is written. Link and image addresses are not checked.
 *
 * Each writer rewrites only its own sections, so none clobbers another. The legacy `review` section
 * and the 0.0.16 drafts' sections are dropped on the next write;
 * legacy `header` / `ledger` blocks are left as text.
 * Layout and who writes what: references/pr-description.md.
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
  changes: '改了什么',
  'your-todo': '要你做的事',
  reference: '参考',
};
export const SECTIONS = Object.keys(TITLES);
const LEGACY = ['review', 'links', 'before-merge', 'after-merge', 'before-after', 'decisions', 'verification'];
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
  return (t.startsWith(heading(name)) ? t.slice(heading(name).length) : t).trim();
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
  let rest = body ?? '';
  for (const n of [...Object.keys(sections), ...Object.keys(parse(body, LEGACY))]) {
    rest = rest.slice(0, rest.indexOf(open(n))) + rest.slice(rest.indexOf(close(n)) + close(n).length);
  }
  rest = rest.trim();
  for (const n of Object.keys(sections)) sections[n] = strip(n, sections[n]);
  if (content && strip(name, content)) sections[name] = strip(name, content);
  else delete sections[name];
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
