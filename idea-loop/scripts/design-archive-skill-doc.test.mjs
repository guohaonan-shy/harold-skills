/**
 * Tripwire — the design-archive skill stays short, and everyone who points at one of its sections points at
 * one that exists. The checks are the command line's own (`dyna test skill-doc`), shared with the wiki-conventions skill.
 *
 * 1. The SKILL.md body (frontmatter stripped, counted in UTF-8 characters) is under 5000.
 * 2. Other skills and agents call the skill by name plus a section title (idea-loop:design-archive 的「X」, written without backticks here so this note is not itself scanned),
 *    never by file path. Every title quoted that way must be a heading of the SKILL.md or of one of its
 *    `references/` files.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runDyna } from './dyna-test-bin.mjs';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const skillDir = join(pluginRoot, 'skills', 'design', 'design-archive');

// One call answers both questions: exit 1 when the body is 5000 characters or more, or a quoted section does not exist;
// --min-pointers makes a wrong skill name (a check of nothing) red too.
const check = () => runDyna(['test', 'skill-doc', skillDir, '--plugin', pluginRoot, '--min-pointers', '1']);

test('design-archive SKILL.md body is under 5000 characters', () => {
  const r = check();
  assert.doesNotMatch(r.stdout + r.stderr, /主体 \d+ 字，上限/, `SKILL.md body is too long. Move long material into references/.\n${r.stdout}${r.stderr}`);
  assert.match(r.stdout, /SKILL\.md 主体 \d+ 字（上限 5000）/);
});

test('every section of design-archive that a skill or agent quotes exists as a heading of its SKILL.md or references/', () => {
  const r = check();
  assert.equal(r.status, 0, `these design-archive sections do not exist (renamed or moved?), or none are quoted:\n${r.stdout}${r.stderr}`);
});
