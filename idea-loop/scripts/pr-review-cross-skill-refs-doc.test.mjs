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
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(pluginRoot, 'skills', 'engineering', 'pr-review');
const skill = readFileSync(join(dir, 'SKILL.md'), 'utf8');
const deliver = readFileSync(join(dir, 'references', 'deliver.md'), 'utf8');

test('deliver.md reaches the PR description format only through the pr skill section 「PR 描述」', () => {
  assert.doesNotMatch(deliver, /description\.md/, 'names a file inside the pr skill');
  assert.doesNotMatch(deliver, /review-round\.md/, 'names a file inside the pr skill');
  assert.match(deliver, /用 Skill 工具调 `idea-loop:pr`[^\n]*「PR 描述」/);
});

test('the 开 issue row of the action table says to call spec-status with the Skill tool and names the section', () => {
  const row = skill.split('\n').find((l) => /^\| \*\*开 issue/.test(l));
  assert.ok(row, 'no 开 issue row');
  assert.match(row, /用 Skill 工具调 `idea-loop:spec-status`/);
  assert.match(row, /「开一个待验证的 issue」/);
  assert.doesNotMatch(row, /照 `idea-loop:spec-status`/);
});

test('every 「…」 that follows `idea-loop:pr` in a skill or agent doc is a heading that exists in the pr skill', () => {
  const prDir = join(pluginRoot, 'skills', 'engineering', 'pr');
  const prSkill = readFileSync(join(prDir, 'SKILL.md'), 'utf8');
  const headings = new Set([...prSkill.matchAll(/^#{2,} (.+)$/gm)].map((m) => m[1].trim()));
  const files = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.md')) files.push(p);
    }
  };
  walk(join(pluginRoot, 'skills'));
  walk(join(pluginRoot, 'agents'));
  const stale = [];
  for (const f of files) {
    if (f.startsWith(prDir + '/')) continue;
    for (const m of readFileSync(f, 'utf8').matchAll(/`idea-loop:pr`(?:\s*的|[，,]\s*看它的|[（(][^）)\n]{0,20}看它的)「([^」]+)」/g)) {
      if (!headings.has(m[1])) stale.push(`${f}: 「${m[1]}」`);
    }
  }
  assert.deepEqual(stale, [], 'refers to a pr section that does not exist');
});
