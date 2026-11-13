/**
 * Doc test — a large replay case goes into the night queue by default; when the human says 「现在就跑」 the issue session runs
 * it at once with `retro-replay.mjs --run-large`.
 *
 * Spec replay-run-large-now, ticket 01. The runner's behaviour is covered end to end in retro-queue-run.test.mjs; this
 * test reads the two documents and catches the sentence being dropped: issue-session's SKILL.md names 「现在就跑」 and points
 * at replay-result.md's 「当场跑」, and that section carries what the session must do (the flag, what to tell the human
 * before, run it in the background, reinstall an old runner). It cannot tell whether a session then does it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => readFileSync(join(pluginRoot, ...p), 'utf8');

function section(doc, title) {
  const lines = doc.split('\n');
  const start = lines.findIndex((l) => l.startsWith(`## ${title}`));
  assert.ok(start >= 0, `no "## ${title}" section`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith('## '));
  return rest.slice(0, end < 0 ? undefined : end).join('\n');
}

const skill = read('skills', 'engineering', 'issue-session', 'SKILL.md');
const result = read('skills', 'engineering', 'issue-session', 'references', 'replay-result.md');

test('issue-session SKILL.md says a large case goes to the night queue by default and 「现在就跑」 goes to replay-result.md 「当场跑」', () => {
  const line = skill.split('\n').find((l) => l.includes('现在就跑'));
  assert.ok(line, 'SKILL.md never names 「现在就跑」');
  assert.match(line, /夜间队列/, 'the sentence must say the default is the night queue');
  assert.match(line, /references\/replay-result\.md/, 'the sentence must point at replay-result.md');
  assert.match(line, /当场跑/, 'the sentence must name the section 「当场跑」');
});

test('replay-result.md has a 「当场跑」 section that carries the command, what to tell the human, the background run and the reinstall', () => {
  const s = section(result, '当场跑');
  assert.match(s, /--run-large/, 'the command with --run-large');
  assert.match(s, /--pr <PR 号>/, 'the command must carry the PR number');
  assert.match(s, /--worktree/, 'the command must say which worktree');
  assert.match(s, /几个用例|个用例/, 'tell the human how many cases');
  assert.match(s, /3×45 分钟/, 'tell the human the longest a case takes');
  assert.match(s, /预计花费/, 'tell the human the cost, from the estimate the runner prints');
  assert.match(s, /起 agent.*(高|多)/, 'the estimate is lower than what a case that starts agents costs');
  assert.match(s, /run_in_background|后台/, 'run it in the background');
  assert.match(s, /10 分钟/, 'say why: a foreground Bash call is cut at 10 minutes');
  assert.match(s, /retro-install\.mjs/, 'reinstall the fixed-path runner when it does not know --run-large');
  assert.match(s, /规则回放/, 'read the new 规则回放 entry in the review loop file when it exits');
});

test('「当场跑」 is only for when the human said so', () => {
  assert.match(section(result, '当场跑'), /人(明)?说/, '「当场跑」 must open with the condition: the human said to run it now');
});

test('issue-session SKILL.md body is under 5000 characters', () => {
  const m = skill.match(/^---\n[\s\S]*?\n---\n/);
  const n = [...(m ? skill.slice(m[0].length) : skill)].length;
  assert.ok(n < 5000, `SKILL.md body is ${n} characters; the limit is 5000`);
});
