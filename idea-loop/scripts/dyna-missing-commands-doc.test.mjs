/**
 * Tripwire: the five steps that used to leave `gh` / `git` to the agent each name their dyna command.
 *
 * Spec dyna-missing-commands, ticket 01. The commands themselves are tested in dyna/ (`go test ./...`); what
 * `scripts/dyna-scan.test.mjs` checks is that every command a skill writes exists in the registry. This file checks
 * the other direction: that the five places say the command, and that the hand-written forms they replaced are gone.
 * `DYNA_DOC_TEST_ROOT` points the test at another copy of the plugin (to see it fail on the version before the change).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = process.env.DYNA_DOC_TEST_ROOT || join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => readFileSync(join(pluginRoot, ...p), 'utf8');
const eng = (...p) => read('skills', 'engineering', ...p);

function* markdown(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* markdown(p);
    else if (name.endsWith('.md')) yield p;
  }
}
const everything = [...markdown(join(pluginRoot, 'skills')), ...markdown(join(pluginRoot, 'agents'))]
  .map((p) => [p.slice(pluginRoot.length + 1), readFileSync(p, 'utf8')]);

test('an empty commit is `dyna git commit --empty`, and no skill or agent says --allow-empty', () => {
  assert.match(eng('issue-session', 'SKILL.md'), /`dyna git commit --empty -m "chore: 开工 #<号>"`/);
  for (const [name, text] of everything) assert.doesNotMatch(text, /--allow-empty/, `${name} still spells the git flag`);
});

test('the live check checks the merge commit out with `dyna worktree add … --detach --at <合并提交>`', () => {
  assert.match(eng('pr-review', 'references', 'merge.md'), /`dyna worktree add build --detach --at <合并提交> --path \.tmp\/live-check\/<PR 号>\/build`/);
});

test('the kind of an issue is changed with `dyna issues kind` in triage and in the GitHub reference, not with gh', () => {
  assert.match(read('agents', 'issue-triager.md'), /`dyna issues kind <docs> <号> <bug\|feature\|improvement>`/);
  const row = eng('issues', 'references', 'github.md').split('\n').find((l) => /^\| 类型 \|/.test(l));
  assert.ok(row, 'the GitHub reference has no 类型 row');
  assert.match(row, /`dyna issues kind`/);
  assert.doesNotMatch(row, /gh issue edit/);
});

test('the dispatcher lists issues that have no session with `dyna issues list --state`', () => {
  const line = eng('issue-dispatch', 'SKILL.md').split('\n').find((l) => l.includes('没有会话的 issue'));
  assert.ok(line, 'issue-dispatch has no 「没有会话的 issue」 step');
  assert.match(line, /`dyna issues list <docs> --state in-progress`/);
  assert.match(line, /`--state in-review`/);
});

test('every wait for CI is `dyna pr checks`, with a way to go for each of green, red, none and timeout where the wait is handled', () => {
  const wait = eng('implement', 'references', 'stop-and-resume.md');
  const body = wait.slice(wait.lastIndexOf('**等 CI**：'));
  assert.match(body, /`dyna pr checks <owner\/repo> <PR 号>`/);
  for (const verdict of ['green', 'red', 'timeout', 'none']) assert.match(body, new RegExp(`\\b${verdict}\\b`), `等 CI says nothing about ${verdict}`);
  assert.match(eng('pr-review', 'SKILL.md'), /`dyna pr checks <owner\/repo> <PR 号>`/);
  assert.match(eng('pr-review', 'references', 'deliver.md'), /`dyna pr checks <owner\/repo> <PR 号>`/);
  for (const [name, text] of everything) assert.doesNotMatch(text, /gh pr checks/, `${name} still hand-writes gh pr checks`);
});
