/**
 * Tripwire — pr-review points at other skills the way writing-for-agents says to: it names the skill
 * and the section, never a file inside another skill's references/, and an action that needs another
 * skill on the spot is written "用 Skill 工具调 <skill>，看它「<节>」".
 *
 * Spec no-decision-autopilot, ticket 03 (review round 2, C2 and C3). Before: deliver.md named
 * `idea-loop:pr`'s `references/description.md` directly, and the 开 issue row in pr-review's action
 * table only said "照 idea-loop:spec-status 的…".
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(pluginRoot, 'skills', 'engineering', 'pr-review');
const skill = readFileSync(join(dir, 'SKILL.md'), 'utf8');
const deliver = readFileSync(join(dir, 'references', 'deliver.md'), 'utf8');

test('deliver.md reaches the PR description format only through the pr skill section 「PR 描述的节」', () => {
  assert.doesNotMatch(deliver, /description\.md/, 'names a file inside the pr skill');
  assert.doesNotMatch(deliver, /review-round\.md/, 'names a file inside the pr skill');
  assert.match(deliver, /用 Skill 工具调 `idea-loop:pr`[^\n]*「PR 描述的节」/);
});

test('the 开 issue row of the action table says to call spec-status with the Skill tool and names the section', () => {
  const row = skill.split('\n').find((l) => /^\| \*\*开 issue/.test(l));
  assert.ok(row, 'no 开 issue row');
  assert.match(row, /用 Skill 工具调 `idea-loop:spec-status`/);
  assert.match(row, /「开一个待验证的 issue」/);
  assert.doesNotMatch(row, /照 `idea-loop:spec-status`/);
});
