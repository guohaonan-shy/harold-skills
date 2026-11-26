/**
 * The annotated samples of the `pr` skill (idea-loop/evals/pr/cases/<name>/).
 *
 * Same shape as the evidence group (see evidence-samples.test.mjs): each sample is a retro replay case (case.json, checked by the retro
 * runner's own format check) plus a `sample.md` the human reads and an `annotations.md` where the human overrules a judgement. Nothing
 * here judges whether the samples are good ones: the runner does that (and the human annotates). This only makes sure the group is
 * complete, no sample loses a part, and the pictures a sample.md shows are in its folder.
 * The repository AGENTS.md's exception for annotated samples is checked at the repo root: scripts/root-agents-annotated-samples.test.mjs.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkCasesDir, loadCases } from '../evals/retro/cases.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', 'evals', 'pr');

const GROUP = [
  'harold-skills-387-decision-risk',
  'harold-skills-432-length',
  'tofelair-1072-frequency',
  'tofelair-1136-reproduce',
  'tofelair-1137-ui',
];

test('the pr group lists exactly the five scenes and passes the replay case format check', () => {
  assert.deepEqual(loadCases(root).map((c) => c.name), GROUP);
  assert.deepEqual(checkCasesDir(root), []);
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

test("a sample's annotations.md carries the human's quote and the question, and a place to overrule", () => {
  for (const c of loadCases(root)) {
    const text = readFileSync(join(root, 'cases', c.name, 'annotations.md'), 'utf8');
    assert.ok(text.includes(c.quote), `${c.name}: annotations.md does not carry the quote`);
    assert.ok(text.includes(c.question), `${c.name}: annotations.md does not carry the question`);
    assert.ok(text.includes('## 标注'), `${c.name}: annotations.md has no 标注 section`);
  }
});

test("every picture a sample.md shows is in the sample's own img/ folder", () => {
  for (const name of GROUP) {
    const dir = join(root, 'cases', name);
    const text = readFileSync(join(dir, 'sample.md'), 'utf8');
    for (const m of text.matchAll(/!\[[^\]]*\]\((img\/[^)]+)\)/g)) {
      assert.ok(existsSync(join(dir, m[1])), `${name}/sample.md shows ${m[1]}, which is not in the folder`);
    }
  }
});

test('the replay prompts are the human-sized ask: each names the PR and carries the old description it rewrites from', () => {
  for (const c of loadCases(root)) {
    assert.match(c.prompt, /^\/idea-loop:pr /, `${c.name}: the prompt does not start by calling the pr skill`);
    assert.match(c.prompt, /## PR 上已有的那版描述/, `${c.name}: the prompt carries no old description`);
    assert.match(c.prompt, /## review 的归档评论/, `${c.name}: the prompt carries no review archive`);
    assert.equal(c.size, 'large', `${c.name}: writing the two evidence sections can draw figures, so it is a large case`);
  }
});
