/**
 * The annotated samples of the `to-spec` skill (idea-loop/evals/to-spec/cases/<name>/).
 *
 * Same shape as the evidence group (idea-loop/scripts/evidence-samples.test.mjs): each sample is a retro replay case (case.json, checked by
 * the retro runner's own format check) plus a `sample.md` the human reads and an `annotations.md` where the human overrules a judgement.
 * Two groups of samples: the style group (does a freshly drafted spec fit the definition: seven sections, no figures or verdicts for the
 * human, a 杠杆诊断 where agent documents change; the question comes from a spec User Story, `goal_from`) and the usefulness group
 * (does the new spec still make the downstream agent redo work; the question comes from what the human said in the PR review, `quote`).
 * Nothing here judges whether the samples are good ones: the runner does that (and the human annotates). This only makes sure the group is
 * complete and no sample loses a part. The repository AGENTS.md's exception for annotated samples is checked at the repo root:
 * scripts/root-agents-annotated-samples.test.mjs.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkCasesDir, loadCases } from '../evals/retro/cases.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', 'evals', 'to-spec');

const STYLE_GROUP = ['skill-change-has-diagnosis', 'ui-spec-shape', 'bugfix-spec-shape'];
const USEFUL_GROUP = ['one-stop-point'];
const GROUP = [...STYLE_GROUP, ...USEFUL_GROUP].sort();

test('the to-spec group lists exactly the five scenes and passes the replay case format check', () => {
  assert.deepEqual(loadCases(root).map((c) => c.name), GROUP);
  assert.deepEqual(checkCasesDir(root), []);
});

test('the style group asks from a spec User Story, the usefulness group from what the human said', () => {
  const byName = Object.fromEntries(loadCases(root).map((c) => [c.name, c]));
  for (const name of STYLE_GROUP) {
    assert.ok(byName[name].goal_from, `${name} has no goal_from`);
    assert.equal(byName[name].quote, undefined, `${name} has both quote and goal_from`);
  }
  for (const name of USEFUL_GROUP) {
    assert.ok(byName[name].quote, `${name} has no quote`);
    assert.equal(byName[name].goal_from, undefined, `${name} has both quote and goal_from`);
  }
});

test('each sample has a sample.md with what the human reads: the original text, what was pointed at, what good looks like', () => {
  for (const name of GROUP) {
    const file = join(root, 'cases', name, 'sample.md');
    assert.ok(existsSync(file), `${name} has no sample.md`);
    const text = readFileSync(file, 'utf8');
    for (const heading of ['## 出处', '## 当时产出的原文', '## 人指出的问题', '## 好的长什么样', '## 回放这一格怎么跑']) {
      assert.ok(text.includes(`\n${heading}\n`), `${name}/sample.md has no "${heading}"`);
    }
  }
});

test("a sample's annotations.md carries where the question came from and the question, and a place to overrule", () => {
  for (const c of loadCases(root)) {
    const text = readFileSync(join(root, 'cases', c.name, 'annotations.md'), 'utf8');
    const origin = c.quote ?? c.goal_from;
    assert.ok(text.includes(origin), `${c.name}: annotations.md does not carry the ${c.quote ? 'quote' : 'goal_from'}`);
    assert.ok(text.includes(c.question), `${c.name}: annotations.md does not carry the question`);
    assert.ok(text.includes('## 标注'), `${c.name}: annotations.md has no 标注 section`);
  }
});
