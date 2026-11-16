/**
 * Doc test — what the replay documents say about the check "did the post-change run use the change" and about updating the
 * installed runner.
 *
 * Spec replay-run-large-now, ticket 05. The check itself (Read / Skill / Agent / sub-agent hits, n/a, not-exercised) is tested in
 * retro-replay.test.mjs and retro-run-large.test.mjs; this reads the documents around it and catches a sentence being dropped.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => readFileSync(join(pluginRoot, ...p), 'utf8');

test('retro-replay.mjs: the runner header says what the check counts as used, what a miss is, and that an empty change set is n/a', () => {
  const header = read('evals', 'retro', 'retro-replay.mjs').split('*/')[0];
  assert.match(header, /skills\/` and `agents\//);
  assert.match(header, /not-exercised/);
  assert.match(header, /用例没测到改动/);
  assert.match(header, /不适用/);
  assert.match(header, /Skill tool/);
  assert.match(header, /Agent\s+\*?\s*tool/);
  assert.match(header, /stand-in\s+\*?\s*`claude`/);
});

test('README: the check, its outcome and the exit code are written down', () => {
  const readme = read('README.md');
  assert.match(readme, /checks that the post-change run used\s+the change/);
  assert.match(readme, /`not-exercised`/);
  assert.match(readme, /用例没测到改动/);
});

test('README: the installed runner only changes when setup is run again, and the Codex lookup script goes in with it', () => {
  const readme = read('README.md');
  const sentence = readme.split('\n\n').find((p) => p.includes('A runner copy at `~/.idea-loop/bin/`'));
  assert.ok(sentence, 'the paragraph that tells to install the runner again');
  assert.match(sentence, /\/idea-loop:setup/);
  assert.match(sentence, /scripts\/codex-companion\.mjs/);
  assert.match(sentence, /no Codex lookup/);
  assert.match(sentence, /cannot use the Codex judge/);
});

test('setup\'s runner step says the Codex lookup script is installed with the runner and needs setup run again', () => {
  const step = read('skills', 'engineering', 'setup', 'references', 'replay-runner.md');
  assert.match(step, /Codex 查找脚本也随 runner 装进去，不重跑就用不上 Codex 评委/);
});

test('implement\'s replay-result.md and the implementer both treat 「用例没测到改动」 as not a pass', () => {
  assert.match(read('skills', 'engineering', 'implement', 'references', 'replay-result.md'), /用例没测到改动/);
  assert.match(read('agents', 'implementer.md'), /「用例没测到改动」[^。]*也不算过/);
});
