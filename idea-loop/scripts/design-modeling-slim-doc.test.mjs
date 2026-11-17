/**
 * Tripwire — `idea-loop:design-modeling`'s SKILL.md stays inside the body limit; the write path that only a run that
 * really writes `DESIGN.md` walks lives behind a pointer in `references/write.md`.
 *
 * Spec skill-body-limit-backlog, ticket 01. The body was 5485 characters (the limit in AGENTS.md「标准 plugin 目录结构」
 * is 5000: UTF-8 characters after the frontmatter, `awk 'f>=2; /^---$/{f++}' SKILL.md | LC_ALL=en_US.UTF-8 wc -m`).
 * Runs that only write a design-law candidate or judge admission do not walk 「一次写入怎么走」, so it moved whole into
 * references/write.md; the title stayed because design-steward, dreaming and uiux-imagine cite it by name. This test
 * catches the body growing back, the title or the pointer disappearing, the steps being written twice, and the
 * reference losing a step. It cannot tell whether an agent reads the reference when it should.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const skillDir = join(pluginRoot, 'skills', 'design', 'design-modeling');
const skill = readFileSync(join(skillDir, 'SKILL.md'), 'utf8');

/** What AGENTS.md's measure counts: everything after the closing `---` line of the frontmatter. */
function body(doc) {
  const lines = doc.split('\n');
  let seen = 0;
  const rest = [];
  for (const line of lines) {
    if (seen >= 2) rest.push(line);
    if (line === '---') seen++;
  }
  return rest.join('\n');
}

function section(doc, title) {
  const lines = doc.split('\n');
  const start = lines.findIndex((l) => l.startsWith(`## ${title}`));
  assert.ok(start >= 0, `no "## ${title}" section`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith('## '));
  return rest.slice(0, end < 0 ? undefined : end).join('\n');
}

test('design-modeling SKILL.md body is under 5000 characters (the limit in AGENTS.md)', () => {
  const n = [...body(skill)].length;
  assert.ok(n < 5000, `design-modeling body is ${n} characters`);
});

test('「一次写入怎么走」 keeps its title and is a one-sentence pointer to references/write.md that opens with the condition', () => {
  const text = section(skill, '一次写入怎么走').trim();
  assert.match(text, /references\/write\.md/, 'the section does not point at references/write.md');
  assert.match(text, /^真的写 `DESIGN\.md`/, 'the pointer should open with the condition for reading it');
  assert.ok(!text.includes('\n') && [...text].length <= 160, 'the section is one sentence; the steps live in the reference');
  assert.ok(existsSync(join(skillDir, 'references', 'write.md')), 'references/write.md is missing');
});

test('the steps are in the reference: find the file, backup, wait for the human, lint, diff', () => {
  const ref = readFileSync(join(skillDir, 'references', 'write.md'), 'utf8');
  assert.match(ref, /git ls-files \| grep -i 'DESIGN\.md\$'/, 'the find-the-file step is gone');
  assert.match(ref, /\/tmp\/design-md\/before\.md/, 'the backup step is gone');
  assert.match(ref, /停下等人确认/, 'the wait-for-the-human step is gone');
  assert.match(ref, /design\.md@latest lint/, 'the lint step is gone');
  assert.match(ref, /design\.md@latest diff/, 'the diff step is gone');
});

test('the steps are written once: SKILL.md does not keep a copy', () => {
  const b = body(skill);
  assert.doesNotMatch(b, /\/tmp\/design-md\/before\.md/);
  assert.doesNotMatch(b, /design\.md@latest (lint|diff)/);
});

test('every reference SKILL.md points at exists', () => {
  const pointed = [...skill.matchAll(/references\/([\w.-]+\.md)/g)].map((m) => m[1]);
  assert.ok(pointed.length > 0, 'SKILL.md points at no reference');
  for (const f of pointed) assert.ok(existsSync(join(skillDir, 'references', f)), `SKILL.md names references/${f}, which is not there`);
});
