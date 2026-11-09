/**
 * Tripwire — the dispatcher hands out triage issues as session cards too, and every issue is in one queue.
 *
 * Spec dispatch-triage-cards, ticket 01. Before: issue-dispatch only handed out `todo` issues and told the
 * human to open triage sessions by hand, and a category marked 「（独立队列，上限 N）」 had a queue and sidebar
 * sections of its own. What stays: the dispatcher has a step that hands out triage (`issues candidates
 * --state=triage`, its own cap `triageCap`), one round gives out at most 3 cards in all with todo first, the
 * triage row of issue-triage's table says the dispatcher gives it a card, and no skill or README text speaks of
 * an independent queue (the script still strips the old note from a category line, `issues.test.mjs`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => readFileSync(join(pluginRoot, ...p), 'utf8');

const dispatch = read('skills', 'engineering', 'issue-dispatch', 'SKILL.md');
const triage = read('skills', 'engineering', 'issue-triage', 'SKILL.md');
const session = read('skills', 'engineering', 'issue-session', 'SKILL.md');
const desktop = read('skills', 'productivity', 'runtime', 'references', 'claude-desktop.md');
const magi = read('skills', 'productivity', 'runtime', 'references', 'magi.md');

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

test('issue-dispatch no longer leaves triage sessions to the human, and has a step that hands out triage', () => {
  assert.ok(!/由人自己开会话/.test(dispatch), 'issue-dispatch must not say triage sessions are opened by the human on their own');
  const step = dispatch.split('\n').find((l) => /^\d+\.\s+\*\*交出 triage\*\*/.test(l));
  assert.ok(step, 'issue-dispatch has no numbered step 「交出 triage」');
  assert.match(step, /issues candidates <docs> --state=triage/, 'the triage step must take its candidates with --state=triage');
  assert.match(step, /triageCap/, 'the triage step must count its free slots against triageCap');
  const todoAt = dispatch.indexOf('**交出 todo**');
  assert.ok(todoAt >= 0 && todoAt < dispatch.indexOf('**交出 triage**'), 'todo is handed out before triage');
  assert.match(dispatch, /合计最多交出 3 个，todo 先交/, 'issue-dispatch must say a round gives out 3 at most, todo first');
});

test('issue-dispatch step 4 no longer reports triage issues that have no session', () => {
  const step4 = dispatch.split('\n').find((l) => /^4\.\s/.test(l));
  assert.ok(step4, 'issue-dispatch has no step 4');
  assert.ok(!/triage/.test(step4), 'step 4 must only look at in-progress and in-review');
  assert.match(step4, /in-progress、in-review/);
});

test('issue-dispatch keeps the unopened cards by state', () => {
  assert.match(dispatch, /按 todo、triage 记/, 'the report must record the not-yet-started cards by state');
});

test('the triage row of issue-triage\'s table says the dispatcher gives the issue a card', () => {
  const row = triage.split('\n').find((l) => /^\s*\|\s*triage \+ P1 或 P2/.test(l));
  assert.ok(row, 'issue-triage has no 「triage + P1 或 P2」 row');
  assert.ok(!/人自己开 triage 会话/.test(row), 'the row must not tell the human to open the triage session on their own');
  assert.match(row, /调度会给它出会话卡片/);
});

test('issue-session\'s table: a triage session is opened by the human or a dispatcher card', () => {
  assert.match(session, /\|\s*triage 会话\s*\|\s*人或调度卡片\s*\|/);
});

test('the runtime references count two caps, and the desktop card says it is for todo or triage', () => {
  for (const [name, doc] of [['claude-desktop', desktop], ['magi', magi]]) {
    assert.match(doc, /triageCap/, `${name}: the dispatch part must use triageCap`);
    assert.ok(!/加了分类名|按队列/.test(doc), `${name}: no sections or counts per category queue`);
  }
  assert.match(desktop, /你派的是 todo 或 triage 的 issue/, 'claude-desktop: the card background must say it dispatches todo or triage issues');
  assert.match(magi, /按会话对应 issue 的状态分两份数/, 'magi: sessions are counted in two shares by the issue\'s state');
  assert.match(magi, /triage 也直接开/, 'magi: triage sessions are started directly');
});

test('no skill and no README speaks of an independent queue', () => {
  const files = [...walk(join(pluginRoot, 'skills')).filter((f) => f.endsWith('.md')), join(pluginRoot, 'README.md')];
  const hits = files.filter((f) => readFileSync(f, 'utf8').includes('独立队列'));
  assert.deepEqual(hits, [], '「独立队列」 is gone from the docs');
});

test('handing out triage skips issues that already have a session or an unopened card: a triage session leaves the issue in triage', () => {
  const step = dispatch.split('\n').find((l) => /^\d+\.\s+\*\*交出 triage\*\*/.test(l));
  assert.ok(/跳过.*同号会话/.test(step) && /还没开起来/.test(step), 'the triage step must skip same-number sessions and unopened cards');
  assert.ok(/triage 也直接开，跳过已有同号会话/.test(magi), 'magi must not start a second session for a triage issue');
});

test('handing out triage skips before it takes as many as there are free slots, so open sessions do not eat the slots', () => {
  const step = dispatch.split('\n').find((l) => /^\d+\.\s+\*\*交出 triage\*\*/.test(l));
  assert.ok(!/candidates <docs> <空位> --state=triage/.test(step), 'the triage candidates must not be cut to the free slots before skipping');
  assert.ok(/先跳过.*再.*取前 <空位> 个/.test(step), 'skip first, then take the free slots');
  assert.ok(/先跳过再取够空位个数/.test(magi), 'magi: skip first, then fill the slots');
});

test('magi reads a Linear issue\'s state with get_issue when it counts triage sessions', () => {
  assert.ok(/Linear 项目 `issues show` 不读状态.*get_issue/.test(magi), 'magi on Linear must not count by issues show, which has no state there');
});
