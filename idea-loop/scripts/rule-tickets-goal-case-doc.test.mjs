/**
 * Doc test — the reference an implementer reads for a rule ticket (implement/references/rule-tickets.md) says how to write a goal case,
 * next to the replay case (the one written from the human's words), in the same bullet and without a flow of its own.
 *
 * Spec skill-change-verify, ticket 01. It reads the document and catches a sentence being dropped; it cannot tell whether
 * an implementer then writes a good goal case.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const doc = readFileSync(join(root, 'skills', 'engineering', 'implement', 'references', 'rule-tickets.md'), 'utf8');

/** The bullet that starts with `**要判断的**` (its sub-bullets included): up to the next top-level bullet. */
const judgedBullet = () => {
  const lines = doc.split('\n');
  const start = lines.findIndex((l) => l.startsWith('- **要判断的**'));
  assert.ok(start >= 0, 'no 「要判断的」 bullet');
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^- /.test(l));
  return lines.slice(start, end < 0 ? undefined : start + 1 + end).join('\n');
};

test('the 「要判断的」 bullet has the goal case beside the replay case: the source field, the question from the story, the commit, the prompt words', () => {
  const b = judgedBullet();
  assert.match(b, /目标用例/);
  assert.match(b, /goal_from/, 'the source field');
  assert.match(b, /quote/, 'the replay case source is still there');
  assert.match(b, /二选一/, 'one of the two, not both');
  assert.match(b, /User Story|期望行为/, 'the question is written from that story / expected behaviour');
  assert.match(b, /spec 路径/, 'what goal_from points at');
  assert.match(b, /基准分支/, 'the commit: the one on the base branch where the input holds');
  assert.match(b, /回放、eval、judge/, 'the prompt may not show what is under test');
});

test('the goal case runs the way a replay case does: both sides, same judge, and what happens when the pre-change side already says yes', () => {
  const b = judgedBullet();
  assert.match(b, /改前.*否.*改后.*是|改前「否」/s);
  assert.match(b, /不过：改前就做得到/);
  assert.match(b, /不自己改成|人判断|换用例/, 'the implementer does not decide that the rule is unneeded');
});

test('no second flow: the goal case is not a section of its own', () => {
  assert.doesNotMatch(doc, /^#{1,3} .*目标用例/m);
});
