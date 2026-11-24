/**
 * The annotated samples of the `evidence` skill (idea-loop/evals/evidence/cases/<name>/).
 *
 * Each sample is a retro replay case (case.json, checked by the retro runner's own format check) plus a `sample.md` the human reads and an
 * `annotations.md` where the human overrules a judgement. Nothing here judges whether the samples are good ones: the runner does that
 * (and the human annotates). This only makes sure the group is complete and no sample loses a part.
 * The repository AGENTS.md's exception for annotated samples is checked at the repo root, not here:
 * scripts/root-agents-annotated-samples.test.mjs.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkCasesDir, loadCases } from '../evals/retro/cases.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', 'evals', 'evidence');

const FIRST_GROUP = [
  'example-from-real-material',
  'option-current-state-shown',
  'review-current-state-verified',
  'review-term-defined',
  'spec-option-goal-figure',
];

test('the evidence group lists exactly the five scenes and passes the replay case format check', () => {
  assert.deepEqual(loadCases(root).map((c) => c.name), FIRST_GROUP);
  assert.deepEqual(checkCasesDir(root), []);
});

test('each sample has a sample.md with what the human reads: the original text, what was pointed at, what good looks like', () => {
  for (const name of FIRST_GROUP) {
    const file = join(root, 'cases', name, 'sample.md');
    assert.ok(existsSync(file), `${name} has no sample.md`);
    const text = readFileSync(file, 'utf8');
    for (const heading of ['## 出处', '## 当时产出的原文', '## 人指出的问题', '## 好的长什么样', '## 回放这一格怎么跑']) {
      assert.ok(text.includes(`\n${heading}\n`), `${name}/sample.md has no "${heading}"`);
    }
  }
});

test("a sample's annotations.md carries the human's quote and the question, and a place to overrule", () => {
  for (const c of loadCases(root)) {
    const text = readFileSync(join(root, 'cases', c.name, 'annotations.md'), 'utf8');
    assert.ok(text.includes(c.quote), `${c.name}: annotations.md does not carry the quote`);
    assert.ok(text.includes(c.question), `${c.name}: annotations.md does not carry the question`);
    assert.ok(text.includes('## 标注'), `${c.name}: annotations.md has no 标注 section`);
  }
});
