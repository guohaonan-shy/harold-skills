/**
 * Tripwire — everyone who points at one of its sections points at
 * one that exists. The checks are the command line's own (`dyna test skill-doc`), shared with the wiki-conventions skill.
 *
 * Other skills and agents call the skill by name plus a section title (idea-loop:design-archive 的「X」, written without backticks here so this note is not itself scanned),
 *    never by file path. Every title quoted that way must be a heading of the SKILL.md or of one of its
 *    `references/` files.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runDyna } from './dyna-test-bin.mjs';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const skillDir = join(pluginRoot, 'skills', 'design', 'design-archive');

// One call: exit 1 when a quoted section does not exist;
// --min-pointers makes a wrong skill name (a check of nothing) red too.
const check = () => runDyna(['test', 'skill-doc', skillDir, '--plugin', pluginRoot, '--min-pointers', '1']);


test('every section of design-archive that a skill or agent quotes exists as a heading of its SKILL.md or references/', () => {
  const r = check();
  assert.equal(r.status, 0, `these design-archive sections do not exist (renamed or moved?), or none are quoted:\n${r.stdout}${r.stderr}`);
});

test('the 按需读 table routes each ui-reviewer branch to a reference that exists, and the walkthrough and no-canvas branches are not in the agent definition', () => {
  const skill = readFileSync(join(skillDir, 'SKILL.md'), 'utf8');
  for (const f of ['review-walkthrough.md', 'review-no-canvas.md', 'review-archive.md', 'review-reconcile.md']) {
    assert.ok(skill.includes(`references/${f}`), `SKILL.md does not route to references/${f}`);
    assert.ok(existsSync(join(skillDir, 'references', f)), `references/${f} is missing`);
  }
  const walkthrough = readFileSync(join(skillDir, 'references', 'review-walkthrough.md'), 'utf8');
  assert.match(walkthrough, /ui-findings\.json/);
  assert.match(walkthrough, /"coverage"/, 'the findings shape moved with the mode');
  const agent = readFileSync(join(pluginRoot, 'agents', 'ui-reviewer.md'), 'utf8');
  assert.doesNotMatch(agent, /"coverage"/, 'the findings JSON lives in the walkthrough reference now, not in the agent definition');
});
