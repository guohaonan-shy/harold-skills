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

test('README: the installed runner only changes when setup is run again, and it needs the command line to start any session', () => {
  const readme = read('README.md');
  const sentence = readme.split('\n\n').find((p) => p.includes('A runner copy at `~/.idea-loop/bin/`'));
  assert.ok(sentence, 'the paragraph that tells to install the runner again');
  assert.match(sentence, /\/idea-loop:setup/);
  assert.match(sentence, /dyna agent claude run/);
  assert.match(sentence, /dyna agent codex run/);
  assert.match(sentence, /cannot run a replay at all/);
});

// the runner no longer ships a Codex lookup script: it starts its sessions and the judge through the command line (spec idea-loop-cli, ticket 12)
test('setup\'s runner step says the runner starts sessions and the Codex judge through dyna, so dyna has to be installed', () => {
  const step = read('skills', 'engineering', 'setup', 'references', 'replay-runner.md');
  assert.match(step, /runner 起会话和请 Codex 当评委都调命令行[^。\n]*`dyna agent claude run`[^。\n]*`dyna agent codex run`/);
  assert.match(step, /机器上要装 `dyna`/);
  assert.doesNotMatch(step, /Codex 查找脚本/);
});

// the rule-ticket steps moved out of agents/implementer.md into implement's references/rule-tickets.md
// (spec implementer-start-point-non-destructive, ticket 02); the implementer reads it behind a pointer.
test('implement\'s replay-result.md and the implementer\'s rule-tickets.md both treat 「用例没测到改动」 as not a pass', () => {
  assert.match(read('skills', 'engineering', 'implement', 'references', 'replay-result.md'), /用例没测到改动/);
  assert.match(read('skills', 'engineering', 'implement', 'references', 'rule-tickets.md'), /「用例没测到改动」[^。]*也不算过/);
});
