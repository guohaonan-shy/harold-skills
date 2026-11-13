/**
 * How a replay's result is written into the PR's review loop file (idea-loop/evals/retro/queue.mjs): what one entry says,
 * how its round is counted, and that it is settled only when nothing is waiting for the human.
 *
 * The runner's whole flow against a fake `claude` is in retro-run-large.test.mjs; this file is pure functions.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendReplayResults, buildReplayEntry, reviewLoopPath, summarizeResults } from '../evals/retro/queue.mjs';
import { nextRound, parseLoop, unsettled } from './review-loop.mjs';

const at = (h, m = 0, day = 23) => new Date(2026, 9, day, h, m, 0);

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

test('an entry says the replay was run on the spot, and never mentions a night or a queue', () => {
  const ok = buildReplayEntry({ round: 1, ...ENTRY_INPUT([pass('a')]) });
  assert.match(ok, /当场跑完，2026-10-23 01:07 出结果/);
  assert.doesNotMatch(ok, /夜间|队列/);
  const notOk = buildReplayEntry({ round: 2, ...ENTRY_INPUT([fail('b')]) });
  assert.doesNotMatch(notOk, /夜间|队列/);
  assert.match(notOk, /不会自动重跑/);
  assert.deepEqual(parseLoop(notOk).map((e) => [e.kind, e.settled]), [['replay', false]], 'still unsettled until the human rules');
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

test('each case says who judged it: Codex, or Claude when no Codex was found', () => {
  const viaCodex = buildReplayEntry({ round: 1, ...ENTRY_INPUT([{ ...pass('a'), judge: 'codex' }]) });
  assert.match(viaCodex, /评委：Codex/);
  const viaClaude = buildReplayEntry({ round: 1, ...ENTRY_INPUT([{ ...pass('a'), judge: 'claude' }]) });
  assert.match(viaClaude, /评委：Claude/);
  assert.doesNotMatch(buildReplayEntry({ round: 1, ...ENTRY_INPUT([pass('a')]) }), /评委：/, 'a result with no judge recorded says nothing about one');
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
  // a second replay's result is round 2
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
