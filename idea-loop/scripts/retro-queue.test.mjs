/**
 * The nightly replay queue's decisions (idea-loop/evals/retro/queue.mjs): when does the runner run, what does a
 * queue file hold, and what does a night's result look like in the PR's review loop file.
 *
 * The runner's whole flow against a fake `claude` is in the second half of this file; the first half is pure
 * functions, which is where the time window, the queue contents and the result format get decided.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  RESULT_PREFIX, appendReplayResults, buildReplayEntry, decideQueueRun, inNightWindow, makeQueueEntry, parseResultLine, pushMessage,
  queueFileName, resultLine, reviewLoopPath, sessionMessage, summarizeResults, validateQueueEntry,
} from '../evals/retro/queue.mjs';
import { nextRound, parseLoop, unsettled } from './review-loop.mjs';

// Local-time constructors: the window is the machine's own clock, so the tests build times the same way.
const at = (h, m = 0, day = 23) => new Date(2026, 9, day, h, m, 0);

// ---------- the time window: 00:00 to 07:00, local time ----------

test('the window is 00:00 up to (not including) 07:00 on the machine\'s own clock', () => {
  assert.equal(inNightWindow(at(0, 0)), true);
  assert.equal(inNightWindow(at(1, 7)), true);
  assert.equal(inNightWindow(at(6, 59)), true);
  assert.equal(inNightWindow(at(7, 0)), false);
  assert.equal(inNightWindow(at(9, 12)), false);
  assert.equal(inNightWindow(at(23, 59)), false);
});

test('at 09:12 the runner does not run, and says it is the time, not the queue, that stopped it', () => {
  const d = decideQueueRun({ now: at(9, 12), files: ['a-1.json', 'b-2.json'] });
  assert.equal(d.action, 'wait');
  assert.match(d.reason, /09:12/);
  assert.match(d.reason, /00:00.*07:00/);
});

test('in the window with an empty queue it exits at once', () => {
  const d = decideQueueRun({ now: at(1, 7), files: [] });
  assert.equal(d.action, 'empty');
});

test('in the window with queue files it runs them in file-name order, ignoring files that are not queue entries', () => {
  const d = decideQueueRun({ now: at(1, 7), files: ['b__c-9.json', 'a__c-12.json', '.DS_Store', 'notes.txt'] });
  assert.equal(d.action, 'run');
  assert.deepEqual(d.files, ['a__c-12.json', 'b__c-9.json']);
});

test('outside the window the time check comes first, even with an empty queue', () => {
  assert.equal(decideQueueRun({ now: at(12, 0), files: [] }).action, 'wait');
});

// ---------- the queue file ----------

const entry = () => ({ repo: 'owner/proj', pr: 12, worktree: '/work/proj-impl', cases: ['retro-pool-choice'], base: 'abc1234', queued_at: '2026-10-22T20:00:00.000Z' });

test('a queue entry holds the repository, the PR number, the worktree path and the cases', () => {
  assert.deepEqual(validateQueueEntry(entry()), []);
  for (const [field, bad] of [['repo', 'no-slash'], ['pr', 0], ['pr', '12'], ['worktree', 'relative/dir'], ['cases', []], ['cases', ['Bad Name']]]) {
    const problems = validateQueueEntry({ ...entry(), [field]: bad });
    assert.ok(problems.some((p) => p.field === field), `${field}=${JSON.stringify(bad)} should be reported`);
  }
  assert.ok(validateQueueEntry(null).length > 0);
});

test('one file per PR: the name comes from the repository and the PR number', () => {
  assert.equal(queueFileName({ repo: 'owner/proj', pr: 12 }), 'owner__proj-12.json');
  assert.notEqual(queueFileName({ repo: 'owner/proj', pr: 12 }), queueFileName({ repo: 'owner/proj', pr: 13 }));
});

test('queueing more cases for a PR that is already queued adds to its file instead of replacing it', () => {
  const first = makeQueueEntry({ ...entry(), queuedAt: '2026-10-22T20:00:00.000Z' });
  const second = makeQueueEntry({ ...entry(), cases: ['retro-pool-choice', 'other-case'], queuedAt: '2026-10-23T08:00:00.000Z', existing: first });
  assert.deepEqual(second.cases, ['retro-pool-choice', 'other-case']);
  assert.equal(second.queued_at, '2026-10-22T20:00:00.000Z', 'the PR has been waiting since the first time');
  assert.deepEqual(validateQueueEntry(second), []);
});

test('a queue entry may name the issue session to send the result back to; without it the entry is still complete', () => {
  assert.deepEqual(validateQueueEntry({ ...entry(), session: 'local_3fa9c1d2' }), []);
  for (const bad of ['', '   ', 12, ['local_x'], 'two\nlines']) {
    assert.ok(validateQueueEntry({ ...entry(), session: bad }).some((p) => p.field === 'session'), `session=${JSON.stringify(bad)} should be reported`);
  }
});

test('the session id is kept in the file; queueing again without one keeps it, with one replaces it', () => {
  const first = makeQueueEntry({ ...entry(), session: 'local_aaa', queuedAt: '2026-10-22T20:00:00.000Z' });
  assert.equal(first.session, 'local_aaa');
  assert.equal(makeQueueEntry({ ...entry(), cases: ['other-case'], queuedAt: 'later', existing: first }).session, 'local_aaa');
  assert.equal(makeQueueEntry({ ...entry(), cases: ['other-case'], session: 'local_bbb', queuedAt: 'later', existing: first }).session, 'local_bbb');
  assert.equal('session' in makeQueueEntry({ ...entry(), queuedAt: 'x' }), false, 'no session, no field');
});

// ---------- the result in the review loop file ----------

const pass = (c) => ({ case: c, outcome: 'pass', reason: '过：改前答「否」（问题复现），改后答「是」', verdicts: [{ side: 'before', answer: 'no', cite: '没有讲机制' }, { side: 'after', answer: 'yes', cite: '第 2 段讲了' }], cost: 1.2, runDir: '/tmp/idea-loop-retro/c/20261023T010700' });
const fail = (c) => ({ case: c, outcome: 'fail', reason: '不过：改后的插件跑出来仍然答「否」，规则改动没有让问题消失', verdicts: [{ side: 'before', answer: 'no', cite: 'x' }, { side: 'after', answer: 'no', cite: 'y' }], cost: 1.4, runDir: '/tmp/idea-loop-retro/d/20261023T010900' });
const ENTRY_INPUT = (results) => ({ pr: 12, ranAt: at(1, 7), results });

test('summary counts: all passed only when every case passed', () => {
  assert.deepEqual(summarizeResults([pass('a'), pass('b')]), { total: 2, passed: 2, notPassed: 0, allPassed: true, cost: 2.4 });
  const s = summarizeResults([pass('a'), fail('b')]);
  assert.deepEqual([s.total, s.passed, s.notPassed, s.allPassed], [2, 1, 1, false]);
  assert.equal(summarizeResults([]).allPassed, false, 'nothing run is not "all passed"');
});

test('when everything passes, the entry is a replay record that says what was done, so it is settled', () => {
  const text = buildReplayEntry({ round: 1, ...ENTRY_INPUT([pass('a'), pass('b')]) });
  const [e] = parseLoop(text);
  assert.deepEqual([e.kind, e.round, e.settled], ['replay', 1, true]);
  assert.match(e.body, /2 个用例，2 个过/);
});

test('when a case does not pass, the entry hands the result to the human and stays unsettled until acted on', () => {
  const text = buildReplayEntry({ round: 2, ...ENTRY_INPUT([pass('a'), fail('b')]) });
  const [e] = parseLoop(text);
  assert.deepEqual([e.kind, e.round, e.settled], ['replay', 2, false]);
  assert.match(e.body, /\*\*要你决定\*\*/);
  assert.match(e.body, /b/);
  assert.match(e.body, /仍然答「否」/);
  assert.deepEqual(unsettled([e]), [{ kind: 'replay', round: 2 }]);
  // once the human rules and it has been acted on, it is settled like any other entry
  const [done] = parseLoop(`${text}\n### 你的批示（2026-10-23 09:30）\n> 再改一次规则\n\n### 做了什么\n- 改了（提交链接）\n`);
  assert.equal(done.settled, true);
});

test('every case is listed with the judge\'s answer on each side, the quote it found, and where the products are', () => {
  const text = buildReplayEntry({ round: 1, ...ENTRY_INPUT([pass('a')]) });
  assert.match(text, /`a`/);
  assert.match(text, /改前：否/);
  assert.match(text, /没有讲机制/);
  assert.match(text, /改后：是/);
  assert.match(text, /第 2 段讲了/);
  assert.match(text, /20261023T010700/);
  assert.match(text, /annotations\.md/, 'says where to overrule a judgement');
});

test('a case that produced no result, or could not be run, is a result too: not passed, with the reason', () => {
  const none = { case: 'c', outcome: 'no-result', reason: '改后那一遍没有产出 result（超时）' };
  const bad = { case: 'e', outcome: 'bad-case', reason: '用例 e 不存在' };
  const [e] = parseLoop(buildReplayEntry({ round: 1, ...ENTRY_INPUT([none, bad]) }));
  assert.equal(e.settled, false);
  assert.match(e.body, /超时/);
  assert.match(e.body, /不存在/);
});

test('appending to a loop file that has entries leaves them as they were and numbers the replay by replay count only', () => {
  const existing = `# PR #12 的 review loop

<!-- idea-loop-entry {"kind":"pause","round":1} -->
## 第 1 次停下 · 落地 3 张
…

### 你的批示（2026-10-13 09:10）
> 选 A

### 做了什么
- 做了

<!-- idea-loop-entry {"kind":"review","round":1} -->
## Review 第 1 轮
…
`;
  const before = parseLoop(existing);
  const { text, round } = appendReplayResults(existing, ENTRY_INPUT([pass('a')]));
  assert.equal(round, 1);
  assert.ok(text.startsWith(existing), 'the old text is untouched, the new entry only follows it');
  const after = parseLoop(text);
  assert.deepEqual(after.slice(0, 2), before);
  assert.deepEqual(after.map((x) => [x.kind, x.round]), [['pause', 1], ['review', 1], ['replay', 1]]);
  assert.equal(nextRound(after, 'review'), 2, 'review rounds are not renumbered by a replay');
  assert.equal(nextRound(after, 'replay'), 2);
  // a second night's result is round 2
  assert.equal(appendReplayResults(text, ENTRY_INPUT([fail('a')])).round, 2);
});

test('appending to no file at all starts one with the usual title', () => {
  const { text } = appendReplayResults('', ENTRY_INPUT([pass('a')]));
  assert.match(text, /^# PR #12 的 review loop\n/);
  assert.deepEqual(parseLoop(text).map((x) => x.kind), ['replay']);
});

test('the review loop file of a PR is .tmp/review-loop/<PR>.md under the worktree', () => {
  assert.equal(reviewLoopPath('/work/proj-impl', 12), '/work/proj-impl/.tmp/review-loop/12.md');
});

test('the push message says which PR, how many passed, and what is waiting for the human', () => {
  assert.match(pushMessage({ repo: 'owner/proj', pr: 12, results: [pass('a'), pass('b')] }), /#12.*2.*过/);
  const m = pushMessage({ repo: 'owner/proj', pr: 12, results: [pass('a'), fail('b')] });
  assert.match(m, /#12/);
  assert.match(m, /1.*不过/);
});

// ---------- the result line the scheduled task forwards to the issue session ----------

test('the result line is one line, carries the session id, and reads back the same', () => {
  const line = resultLine({ session: 'local_3fa9c1d2', repo: 'owner/proj', pr: 12, results: [pass('a'), fail('b')], worktree: '/work/proj-impl' });
  assert.ok(line.startsWith(RESULT_PREFIX));
  assert.equal(line.includes('\n'), false);
  const got = parseResultLine(line);
  assert.equal(got.session, 'local_3fa9c1d2');
  assert.equal(got.repo, 'owner/proj');
  assert.equal(got.pr, 12);
  assert.equal(got.allPassed, false);
  assert.equal(got.loop, '/work/proj-impl/.tmp/review-loop/12.md');
  assert.equal(got.message.split('\n')[0], pushMessage({ repo: 'owner/proj', pr: 12, results: [pass('a'), fail('b')] }));
});

test('an entry without a session id gives a line whose session is null: only the notification can carry it', () => {
  const line = resultLine({ session: undefined, repo: 'owner/proj', pr: 12, results: [pass('a')], worktree: '/w' });
  assert.equal(parseResultLine(line).session, null);
  assert.equal(parseResultLine(line).allPassed, true);
});

test('lines that are not result lines are not parsed as one', () => {
  assert.equal(parseResultLine('推送：owner/proj #12 的规则回放：1 个用例全过'), null);
  assert.equal(parseResultLine(`${RESULT_PREFIX}{not json`), null);
});

test('the message for the issue session says what came out and where, and what to do with it', () => {
  const ok = sessionMessage({ repo: 'owner/proj', pr: 12, results: [pass('a')], worktree: '/w' });
  assert.match(ok.split('\n')[0], /#12.*全过/);
  assert.match(ok, /\/w\/\.tmp\/review-loop\/12\.md/);
  assert.match(ok, /接着走/);
  const bad = sessionMessage({ repo: 'owner/proj', pr: 12, results: [pass('a'), fail('b')], worktree: '/w' });
  assert.match(bad.split('\n')[0], /1.*不过/);
  assert.match(bad, /停下/);
  assert.match(bad, /摆给人/);
});
