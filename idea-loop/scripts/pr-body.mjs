#!/usr/bin/env node
/**
 * PR description, section by section.
 *
 * The PR description is the standing overview of a delivery. Two writers own different parts of it —
 * implement's orchestrator writes the header and the ledger, pr-review's reviewer writes the review
 * part — and each rewrites only its own sections, so neither clobbers the other. (What Harold must
 * decide or look at during the draft phase goes in pause threads instead: pr-thread.mjs.) Sections live
 * between hidden markers and always appear in a fixed order, whatever order they were written in.
 * Layout and what goes in each section: references/pr-description.md.
 *
 * Deterministic core (getSection, setSection) is pure and unit-tested. The CLI is the gh boundary;
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

export const SECTIONS = ['header', 'review', 'ledger'];
const MAX_BODY = 65000;

const open = (name) => `<!-- idea-loop:section ${name} -->`;
const close = (name) => `<!-- /idea-loop:section ${name} -->`;

function parse(body = '') {
  const found = {};
  for (const name of SECTIONS) {
    const start = body.indexOf(open(name));
    const end = body.indexOf(close(name));
    if (start !== -1 && end > start) found[name] = body.slice(start + open(name).length, end).trim();
  }
  return found;
}

export function getSection(body, name) {
  if (!SECTIONS.includes(name)) throw new Error(`unknown section ${name}; one of ${SECTIONS.join(', ')}`);
  return parse(body)[name] ?? null;
}

/**
 * Replace one section and re-emit every section in the fixed order. Text outside the markers (a
 * human-written description, the attribution line) is kept, below the sections.
 * Empty content removes the section.
 */
export function setSection(body, name, content) {
  if (!SECTIONS.includes(name)) throw new Error(`unknown section ${name}; one of ${SECTIONS.join(', ')}`);
  const sections = parse(body);
  let rest = body ?? '';
  for (const n of Object.keys(sections)) {
    rest = rest.slice(0, rest.indexOf(open(n))) + rest.slice(rest.indexOf(close(n)) + close(n).length);
  }
  rest = rest.trim();
  if (content && content.trim()) sections[name] = content.trim();
  else delete sections[name];
  const out = SECTIONS.filter((n) => sections[n]).map((n) => `${open(n)}\n${sections[n]}\n${close(n)}`);
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
