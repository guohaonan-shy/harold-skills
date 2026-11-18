/**
 * Tripwire — the design-archive skill stays short, and everyone who points at one of its sections points at
 * one that exists. The checks are shared with the wiki-conventions skill (`skill-doc-check.mjs`).
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
import { MAX_BODY_CHARS, bodyChars, danglingSectionPointers } from './skill-doc-check.mjs';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const skillDir = join(pluginRoot, 'skills', 'design', 'design-archive');

test('design-archive SKILL.md body is under 5000 characters', () => {
  const n = bodyChars(skillDir);
  assert.ok(n < MAX_BODY_CHARS, `SKILL.md body is ${n} characters; the limit is ${MAX_BODY_CHARS}. Move long material into references/.`);
});

test('every section of design-archive that a skill or agent quotes exists as a heading of its SKILL.md or references/', () => {
  const { seen, bad } = danglingSectionPointers({ pluginRoot, skillDir, skillName: 'design-archive' });
  assert.ok(seen > 0, 'expected the skills and agents to quote at least one design-archive section');
  assert.deepEqual(bad, [], `these design-archive sections do not exist (renamed or moved?):\n${bad.join('\n')}`);
});
