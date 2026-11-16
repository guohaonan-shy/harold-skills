/**
 * Doc test — what the replay documents say about who judges and what a case's prompt may hold.
 *
 * Spec replay-run-large-now, ticket 04. The runner's behaviour (Codex as judge, the A/B order, the fall back to Claude, the
 * plugin path) is tested end to end in retro-replay.test.mjs; this reads the documents around it and catches a sentence being
 * dropped. It cannot tell whether an implementer then writes the case the way the text says.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => readFileSync(join(pluginRoot, ...p), 'utf8');

test('implementer.md: a replay case\'s prompt is only the human\'s words, and where it stops is for the judge alone', () => {
  const line = read('agents', 'implementer.md').split('\n').find((l) => l.includes('写一个回放用例'));
  const detail = read('agents', 'implementer.md').split('\n').find((l) => l.includes('「停在哪」'));
  assert.ok(line && detail, 'the line that teaches how to write a case');
  assert.match(detail, /prompt 只放人当时[^；]*原话/, 'the prompt holds only the human\'s own words');
  assert.match(detail, /不加「这是回放」「人不在场」之类/, 'no note that this is a replay or that nobody is there');
  assert.match(detail, /回放、eval、judge/, 'says the validation refuses these words');
  assert.match(detail, /「停在哪」[^；]*只给评委看/, 'the stop point is only for the judge');
});

test('README: the judge is Codex, in a random A/B order, with a fall back to Claude that is said out loud', () => {
  const readme = read('README.md');
  assert.match(readme, /Codex/);
  assert.match(readme, /random order/);
  assert.match(readme, /没找到 Codex，评委用 Claude/);
  assert.match(readme, /judge: codex|`judge`/);
});

test('retro-replay.mjs: the runner header says who judges and how the order is turned back', () => {
  const header = read('evals', 'retro', 'retro-replay.mjs').split('*/')[0];
  assert.match(header, /Codex/);
  assert.match(header, /afterIs/);
  assert.match(header, /--plugin-dir/);
  assert.match(header, /RETRO_CODEX_COMPANION/);
});
