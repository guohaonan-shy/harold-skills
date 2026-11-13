/**
 * The replay runner's queue mode end to end (`retro-replay.mjs --queue`, `--enqueue`) and its `--run-large` (large cases run
 * now, at any hour, on the human's word), against a fake `claude`: no real session, no real clock. The decisions themselves (time window, queue contents, result format) are
 * unit-tested in retro-queue.test.mjs.
 *
 * The fake reads `<plugin-dir>/MARK` to decide what a worker session does:
 *   "reply: X"        final text X, and a file docs/out.md containing X
 *   "agentreply: X"   the same, but the session starts an Agent tool call first (a large case)
 * With no --plugin-dir it is the judge: yes for a product containing FIXED, else no.
 * FAKE_SLEEP_MS makes every session take that long, so the clock can run past 07:00 mid-queue.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parseResultLine, reviewLoopPath, validateQueueEntry } from '../evals/retro/queue.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const RUNNER = join(HERE, '..', 'evals', 'retro', 'retro-replay.mjs');
const REVIEW_LOOP = join(HERE, 'review-loop.mjs');

const FAKE = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const prompt = args[args.indexOf('-p') + 1];
const pd = args.includes('--plugin-dir') ? args[args.indexOf('--plugin-dir') + 1] : null;
fs.appendFileSync(process.env.FAKE_LOG, (pd ? 'worker' : 'judge') + '\\n');
const emit = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
const result = (text) => emit({ type: 'result', result: text, total_cost_usd: 0.25, num_turns: 1, duration_ms: 5, modelUsage: { fake: {} } });
const go = () => {
  if (pd) {
    const mark = fs.readFileSync(path.join(pd, 'MARK'), 'utf8');
    const m = /^(agent)?reply: (.*)$/m.exec(mark);
    const text = m ? m[2] : 'nothing';
    if (m && m[1]) emit({ type: 'assistant', parent_tool_use_id: null, message: { content: [{ type: 'tool_use', id: 't0', name: 'Agent', input: {} }] } });
    fs.mkdirSync('docs', { recursive: true });
    fs.writeFileSync('docs/out.md', text);
    result(text);
  } else {
    const a = /产物 A[\\s\\S]*?(?=产物 B)/.exec(prompt)?.[0] ?? '';
    const b = /产物 B[\\s\\S]*/.exec(prompt)?.[0] ?? '';
    const ans = (s) => (s.includes('FIXED') ? '是' : '否');
    result(JSON.stringify({ A: { answer: ans(a), cite: 'fake cite A' }, B: { answer: ans(b), cite: 'fake cite B' } }));
  }
};
setTimeout(go, Number(process.env.FAKE_SLEEP_MS || 0));
`;

const smallCase = (over = {}) => ({
  commit: 'a1b2c3d',
  prompt: '/idea-loop:some-skill 把这件事摆给我',
  stop_at: '摆出决定题、等人回答的那一刻',
  question: '摆出的题里，有没有用一句话讲清其中一个机制？',
  quote: '二者的区别能跟我讲一下吗？',
  size: 'small',
  size_basis: '只驱动 some-skill 一个 skill',
  ...over,
});

const gitIn = (cwd, ...a) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', ...a], { cwd, encoding: 'utf8' });

/**
 * PR worktrees: each a git repo whose `idea-loop/` plugin was "plain" at the base (branch base-point) and is `after`
 * now, with replay cases under idea-loop/evals/retro/cases. Also the queue directory and the fake commands.
 */
function nightSetup({ after = 'reply: FIXED', cases = { 'demo-case': {} }, prs = 1 } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'retro-queue-'));
  const mkWorktree = (n) => {
    const wt = join(root, `wt${n}`);
    mkdirSync(join(wt, 'idea-loop'), { recursive: true });
    writeFileSync(join(wt, 'README.md'), 'project at the decision commit\n');
    writeFileSync(join(wt, 'idea-loop', 'MARK'), 'reply: plain');
    gitIn(wt, 'init', '-q');
    gitIn(wt, 'add', '-A');
    gitIn(wt, 'commit', '-q', '-m', 'base');
    const commit = gitIn(wt, 'rev-parse', 'HEAD').stdout.trim();
    gitIn(wt, 'branch', 'base-point');
    for (const [name, over] of Object.entries(cases)) {
      const dir = join(wt, 'idea-loop', 'evals', 'retro', 'cases', name);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'case.json'), JSON.stringify(smallCase({ commit, ...over }), null, 2));
      writeFileSync(join(dir, 'annotations.md'), '# case\n');
    }
    writeFileSync(join(wt, 'idea-loop', 'MARK'), after);
    gitIn(wt, 'add', '-A');
    gitIn(wt, 'commit', '-q', '-m', 'the rule change');
    return wt;
  };
  const worktrees = Array.from({ length: prs }, (_, i) => mkWorktree(i + 1));
  const bin = join(root, 'fake-claude');
  writeFileSync(bin, FAKE);
  chmodSync(bin, 0o755);
  const notifyBin = join(root, 'fake-notify');
  writeFileSync(notifyBin, '#!/bin/sh\necho "$1" >> "$NOTIFY_LOG"\n');
  chmodSync(notifyBin, 0o755);
  const log = join(root, 'calls.log');
  const notifyLog = join(root, 'notify.log');
  writeFileSync(log, '');
  writeFileSync(notifyLog, '');
  return { root, worktrees, bin, notifyBin, log, notifyLog, queueDir: join(root, 'replay-queue'), out: join(root, 'out') };
}

function runner(env, args, extraEnv = {}) {
  const r = spawnSync(process.execPath, [RUNNER, ...args], {
    encoding: 'utf8',
    env: { ...process.env, RETRO_CLAUDE_BIN: env.bin, RETRO_NOTIFY_BIN: env.notifyBin, FAKE_LOG: env.log, NOTIFY_LOG: env.notifyLog, ...extraEnv },
    timeout: 120_000,
  });
  const lines = (f) => readFileSync(f, 'utf8').split('\n').filter(Boolean);
  return { ...r, calls: lines(env.log), pushes: lines(env.notifyLog) };
}

const queueArgs = (env, now) => ['--queue', '--queue-dir', env.queueDir, '--out', env.out, '--now', now];
const NIGHT = '2026-10-23T01:07:00';
const DAY = '2026-10-23T09:12:00';

function enqueue(env, n, cases = ['demo-case'], pr = 12, session = null) {
  return runner(env, [
    '--enqueue', '--slug', 'owner/proj', '--pr', String(pr), '--worktree', env.worktrees[n], '--cases', cases.join(','),
    '--base', 'base-point', '--queue-dir', env.queueDir, ...(session ? ['--session', session] : []),
  ]);
}

/** The result lines in a run's output, parsed. */
const resultLines = (stdout) => stdout.split('\n').map(parseResultLine).filter(Boolean);

const loopCheck = (wt, pr) => JSON.parse(spawnSync(process.execPath, [REVIEW_LOOP, 'check', reviewLoopPath(wt, pr)], { encoding: 'utf8' }).stdout);

test('at 09:12 no session is started and the queue is exactly as it was', () => {
  const env = nightSetup();
  assert.equal(enqueue(env, 0).status, 0);
  const file = join(env.queueDir, 'owner__proj-12.json');
  const before = readFileSync(file, 'utf8');
  const r = runner(env, queueArgs(env, DAY));
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(r.calls, [], 'no claude -p of any kind');
  assert.equal(readFileSync(file, 'utf8'), before);
  assert.equal(existsSync(reviewLoopPath(env.worktrees[0], 12)), false, 'no result written');
  assert.deepEqual(r.pushes, []);
  assert.match(r.stdout, /09:12/);
});

test('an empty queue, or no queue directory yet, exits at once without a session', () => {
  const env = nightSetup();
  const none = runner(env, queueArgs(env, NIGHT));
  assert.equal(none.status, 0);
  assert.deepEqual(none.calls, []);
  assert.match(none.stdout, /队列是空的/);
  mkdirSync(env.queueDir, { recursive: true });
  const empty = runner(env, queueArgs(env, NIGHT));
  assert.equal(empty.status, 0);
  assert.deepEqual(empty.calls, []);
});

test('all cases of a PR pass: a settled replay entry in its review loop file, the queue file gone, a push sent', () => {
  const env = nightSetup();
  enqueue(env, 0);
  const r = runner(env, queueArgs(env, NIGHT));
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(r.calls.sort(), ['judge', 'worker', 'worker']);
  assert.deepEqual(readdirSync(env.queueDir), [], 'the finished PR is taken out of the queue');
  const check = loopCheck(env.worktrees[0], 12);
  assert.deepEqual(check.entries.map((e) => [e.kind, e.round, e.settled]), [['replay', 1, true]]);
  assert.deepEqual(check.unsettled, []);
  assert.equal(r.pushes.length, 1);
  assert.match(r.pushes[0], /#12/);
  assert.match(readFileSync(reviewLoopPath(env.worktrees[0], 12), 'utf8'), /demo-case/);
});

test('a case that does not pass is written into the result, and the queue file is deleted all the same: no rerun', () => {
  const env = nightSetup({ after: 'reply: plain' });
  enqueue(env, 0);
  const r = runner(env, queueArgs(env, NIGHT));
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(readdirSync(env.queueDir), []);
  const check = loopCheck(env.worktrees[0], 12);
  assert.deepEqual(check.unsettled, [{ kind: 'replay', round: 1 }], 'left for the human to rule on');
  assert.match(readFileSync(reviewLoopPath(env.worktrees[0], 12), 'utf8'), /仍然答「否」/);
  assert.match(r.pushes[0], /不过/);
  const again = runner(env, queueArgs(env, '2026-10-24T01:07:00'));
  assert.equal(again.calls.length, 3, 'no new sessions on the second night');
});

test('results go after what the review loop file already holds, which is left as it was', () => {
  const env = nightSetup();
  const file = reviewLoopPath(env.worktrees[0], 12);
  mkdirSync(dirname(file), { recursive: true });
  const existing = '# PR #12 的 review loop\n\n<!-- idea-loop-entry {"kind":"pause","round":1} -->\n## 第 1 次停下 · 落地 1 张，回放在队列里\n…\n';
  writeFileSync(file, existing);
  enqueue(env, 0);
  const r = runner(env, queueArgs(env, NIGHT));
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(readFileSync(file, 'utf8').startsWith(existing.trimEnd()));
  assert.deepEqual(loopCheck(env.worktrees[0], 12).entries.map((e) => [e.kind, e.round]), [['pause', 1], ['replay', 1]]);
});

test('a large case runs at night too, however many agents it starts, and its case file is not relabelled', () => {
  const env = nightSetup({ after: 'agentreply: FIXED', cases: { 'big-case': { size: 'large', size_basis: '起插件 agent' } } });
  enqueue(env, 0, ['big-case']);
  const r = runner(env, queueArgs(env, NIGHT));
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(r.calls.sort(), ['judge', 'worker', 'worker']);
  assert.deepEqual(loopCheck(env.worktrees[0], 12).unsettled, []);
  const c = JSON.parse(readFileSync(join(env.worktrees[0], 'idea-loop', 'evals', 'retro', 'cases', 'big-case', 'case.json'), 'utf8'));
  assert.equal(c.size, 'large');
  assert.equal(c.size_basis, '起插件 agent');
});

test('a case that does not exist is a result too: reported, not passed, and the others still run', () => {
  const env = nightSetup();
  mkdirSync(env.queueDir, { recursive: true });
  writeFileSync(join(env.queueDir, 'owner__proj-12.json'), JSON.stringify({ repo: 'owner/proj', pr: 12, worktree: env.worktrees[0], cases: ['demo-case', 'missing-case'], base: 'base-point', queued_at: '2026-10-22T20:00:00.000Z' }));
  const r = runner(env, queueArgs(env, NIGHT));
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const text = readFileSync(reviewLoopPath(env.worktrees[0], 12), 'utf8');
  assert.match(text, /`demo-case`：过/);
  assert.match(text, /`missing-case`/);
  assert.deepEqual(loopCheck(env.worktrees[0], 12).unsettled, [{ kind: 'replay', round: 1 }]);
});

test('two PRs are run one after the other, each into its own review loop file', () => {
  const env = nightSetup({ prs: 2 });
  enqueue(env, 0, ['demo-case'], 12);
  enqueue(env, 1, ['demo-case'], 13);
  const r = runner(env, queueArgs(env, NIGHT));
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.calls.length, 6);
  assert.ok(existsSync(reviewLoopPath(env.worktrees[0], 12)) && existsSync(reviewLoopPath(env.worktrees[1], 13)));
  assert.deepEqual(readdirSync(env.queueDir), []);
  assert.equal(r.pushes.length, 2);
});

test('when the clock passes 07:00 mid-queue, the PRs not yet started stay queued, untouched', () => {
  const env = nightSetup({ prs: 2 });
  enqueue(env, 0, ['demo-case'], 12);
  enqueue(env, 1, ['demo-case'], 13);
  const second = join(env.queueDir, 'owner__proj-13.json');
  const before = readFileSync(second, 'utf8');
  // starts one second before 07:00 and every session takes 0.8 s: the first PR ends after the window closed
  const r = runner(env, queueArgs(env, '2026-10-23T06:59:59'), { FAKE_SLEEP_MS: '800' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(existsSync(reviewLoopPath(env.worktrees[0], 12)), 'the PR it had started is finished');
  assert.equal(existsSync(reviewLoopPath(env.worktrees[1], 13)), false);
  assert.equal(readFileSync(second, 'utf8'), before);
  assert.deepEqual(readdirSync(env.queueDir), ['owner__proj-13.json']);
});

test('a queue file that is not a valid entry is skipped, reported and left in place (exit 1); the good PR still runs', () => {
  const env = nightSetup();
  enqueue(env, 0);
  writeFileSync(join(env.queueDir, 'owner__broken-5.json'), '{"repo":"owner/broken","pr":5}');
  const r = runner(env, queueArgs(env, NIGHT));
  assert.equal(r.status, 1);
  assert.match(r.stdout + r.stderr, /owner__broken-5\.json/);
  assert.deepEqual(readdirSync(env.queueDir), ['owner__broken-5.json']);
  assert.deepEqual(loopCheck(env.worktrees[0], 12).unsettled, []);
});

test('queueing the same PR again adds its cases to its file; --enqueue refuses a case that is not in the worktree', () => {
  const env = nightSetup({ cases: { 'demo-case': {}, 'other-case': {} } });
  enqueue(env, 0, ['demo-case']);
  enqueue(env, 0, ['other-case']);
  const entry = JSON.parse(readFileSync(join(env.queueDir, 'owner__proj-12.json'), 'utf8'));
  assert.deepEqual(entry.cases, ['demo-case', 'other-case']);
  assert.deepEqual(validateQueueEntry(entry), []);
  assert.equal(entry.worktree, env.worktrees[0]);
  assert.match(entry.base, /^[0-9a-f]{40}$/, 'the base is pinned to the commit the PR forked from');
  const bad = enqueue(env, 0, ['nope-case']);
  assert.equal(bad.status, 2);
  assert.match(bad.stderr + bad.stdout, /nope-case/);
});

test('single-case use from the fixed path: --worktree stands for repo, plugin and cases root together', () => {
  const env = nightSetup();
  const r = runner(env, ['--case', 'demo-case', '--worktree', env.worktrees[0], '--base', 'base-point', '--out', env.out, '--timeout-min', '1']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /过/);
});

test('a PR queued with an issue session id: the run prints a result line carrying that id, and sends no notification of its own', () => {
  const env = nightSetup();
  assert.equal(enqueue(env, 0, ['demo-case'], 12, 'local_3fa9c1d2').status, 0);
  assert.equal(JSON.parse(readFileSync(join(env.queueDir, 'owner__proj-12.json'), 'utf8')).session, 'local_3fa9c1d2');
  const r = runner(env, queueArgs(env, NIGHT));
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const lines = resultLines(r.stdout);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].session, 'local_3fa9c1d2');
  assert.equal(lines[0].pr, 12);
  assert.equal(lines[0].allPassed, true);
  assert.equal(lines[0].loop, reviewLoopPath(env.worktrees[0], 12));
  assert.deepEqual(r.pushes, [], 'the scheduled task sends it to the session; the notification is its fallback');
  assert.ok(existsSync(reviewLoopPath(env.worktrees[0], 12)), 'the result is in the review loop file all the same');
});

test('a PR queued without a session id falls back to the notification, and its result line says there is no session', () => {
  const env = nightSetup();
  enqueue(env, 0);
  const r = runner(env, queueArgs(env, NIGHT));
  const lines = resultLines(r.stdout);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].session, null);
  assert.equal(r.pushes.length, 1);
  assert.match(r.pushes[0], /#12/);
});

test('one result line per PR, each with its own session id, a not-passed one marked as such', () => {
  const env = nightSetup({ prs: 2, after: 'reply: plain' });
  enqueue(env, 0, ['demo-case'], 12, 'local_one');
  enqueue(env, 1, ['demo-case'], 13, 'local_two');
  const lines = resultLines(runner(env, queueArgs(env, NIGHT)).stdout);
  assert.deepEqual(lines.map((l) => [l.pr, l.session, l.allPassed]), [[12, 'local_one', false], [13, 'local_two', false]]);
});

test('no result line before the result is in the review loop file: a PR that stays queued prints none', () => {
  const env = nightSetup();
  enqueue(env, 0, ['demo-case'], 12, 'local_x');
  assert.deepEqual(resultLines(runner(env, queueArgs(env, DAY)).stdout), []);
});

test('--notify sends the one-line notification and nothing else: the fallback when the session cannot be reached', () => {
  const env = nightSetup();
  const r = runner(env, ['--notify', 'owner/proj #12 的规则回放：1 个用例全过']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(r.pushes, ['owner/proj #12 的规则回放：1 个用例全过']);
  assert.deepEqual(r.calls, []);
});

// ---------- --run-large: the human said "run it now" ----------

const runLargeArgs = (env, n, pr, extra = []) => [
  '--worktree', env.worktrees[n], '--base', 'base-point', '--out', env.out, '--queue-dir', env.queueDir, '--timeout-min', '1',
  ...(pr === null ? [] : ['--pr', String(pr)]), ...extra,
];
const bigCase = { 'big-case': { size: 'large', size_basis: '起插件 agent' } };
const queueFiles = (env) => (existsSync(env.queueDir) ? readdirSync(env.queueDir).sort() : []);
const queueFile = (env, name, entry) => {
  mkdirSync(env.queueDir, { recursive: true });
  writeFileSync(join(env.queueDir, name), JSON.stringify({ queued_at: '2026-10-22T20:00:00.000Z', base: 'base-point', ...entry }));
};

test('--run-large runs a large case in the daytime: three sessions, exit 0, a settled replay entry, no result line, no push', () => {
  const env = nightSetup({ after: 'agentreply: FIXED', cases: bigCase });
  const r = runner(env, ['--case', 'big-case', '--run-large', ...runLargeArgs(env, 0, 12)]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(r.calls.sort(), ['judge', 'worker', 'worker']);
  const check = loopCheck(env.worktrees[0], 12);
  assert.deepEqual(check.entries.map((e) => [e.kind, e.round, e.settled]), [['replay', 1, true]]);
  assert.deepEqual(check.unsettled, []);
  assert.match(readFileSync(reviewLoopPath(env.worktrees[0], 12), 'utf8'), /big-case/);
  assert.ok(r.stdout.includes(reviewLoopPath(env.worktrees[0], 12)), 'says which file the result went into');
  assert.deepEqual(resultLines(r.stdout), [], 'the calling session reads the output itself: no 回放结果 line');
  assert.deepEqual(r.pushes, [], 'no notification either');
  const entry = readFileSync(reviewLoopPath(env.worktrees[0], 12), 'utf8');
  assert.match(entry, /当场跑（--run-large）在 .* 跑完/);
  assert.doesNotMatch(entry, /夜间队列|队列文件/, 'the entry does not say the night queue ran it');
  const c = JSON.parse(readFileSync(join(env.worktrees[0], 'idea-loop', 'evals', 'retro', 'cases', 'big-case', 'case.json'), 'utf8'));
  assert.equal(c.size, 'large');
});

test('--run-large with --cases a,b runs both and writes one entry for the PR', () => {
  const env = nightSetup({ cases: { 'demo-case': {}, 'other-case': {} } });
  const r = runner(env, ['--cases', 'demo-case,other-case', '--run-large', ...runLargeArgs(env, 0, 12)]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.calls.length, 6);
  const text = readFileSync(reviewLoopPath(env.worktrees[0], 12), 'utf8');
  assert.match(text, /`demo-case`：过/);
  assert.match(text, /`other-case`：过/);
  assert.deepEqual(loopCheck(env.worktrees[0], 12).entries.map((e) => [e.kind, e.round]), [['replay', 1]]);
});

test('--run-large takes what it ran out of the queue: the PR\'s file is gone and the night run starts nothing', () => {
  const env = nightSetup({ cases: bigCase, after: 'agentreply: FIXED' });
  assert.equal(enqueue(env, 0, ['big-case']).status, 0);
  assert.deepEqual(queueFiles(env), ['owner__proj-12.json']);
  const r = runner(env, ['--case', 'big-case', '--run-large', ...runLargeArgs(env, 0, 12)]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(queueFiles(env), []);
  assert.equal(runner(env, queueArgs(env, NIGHT)).calls.length, 3, 'no new sessions at night');
  assert.match(readFileSync(reviewLoopPath(env.worktrees[0], 12), 'utf8'), /夜间队列里这个 PR 的 `big-case` 已拿掉/, 'the entry says what it took out of the queue');
});

test('--run-large removes only the cases it ran; another PR\'s file, and the same PR number in another worktree, stay as they were', () => {
  const env = nightSetup({ prs: 2, cases: { 'demo-case': {}, 'other-case': {} } });
  enqueue(env, 0, ['demo-case', 'other-case'], 12);
  queueFile(env, 'owner__proj-13.json', { repo: 'owner/proj', pr: 13, worktree: env.worktrees[0], cases: ['demo-case'] });
  queueFile(env, 'owner__elsewhere-12.json', { repo: 'owner/elsewhere', pr: 12, worktree: env.worktrees[1], cases: ['demo-case'] });
  const others = ['owner__proj-13.json', 'owner__elsewhere-12.json'].map((f) => readFileSync(join(env.queueDir, f), 'utf8'));
  const r = runner(env, ['--case', 'demo-case', '--run-large', ...runLargeArgs(env, 0, 12)]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(JSON.parse(readFileSync(join(env.queueDir, 'owner__proj-12.json'), 'utf8')).cases, ['other-case']);
  assert.deepEqual(['owner__proj-13.json', 'owner__elsewhere-12.json'].map((f) => readFileSync(join(env.queueDir, f), 'utf8')), others);
});

test('--run-large where the change did not fix it: exit 1, the entry is left unsettled for the human', () => {
  const env = nightSetup({ after: 'reply: plain' });
  const r = runner(env, ['--case', 'demo-case', '--run-large', ...runLargeArgs(env, 0, 12)]);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.deepEqual(loopCheck(env.worktrees[0], 12).unsettled, [{ kind: 'replay', round: 1 }]);
  assert.match(readFileSync(reviewLoopPath(env.worktrees[0], 12), 'utf8'), /仍然答「否」/);
});

test('--run-large without --pr, without a case name, or with a case that is missing or malformed: exit 2 and no session', () => {
  const env = nightSetup();
  const noPr = runner(env, ['--case', 'demo-case', '--run-large', ...runLargeArgs(env, 0, null)]);
  assert.equal(noPr.status, 2);
  assert.match(noPr.stderr, /--pr/);
  const noCase = runner(env, ['--run-large', ...runLargeArgs(env, 0, 12)]);
  assert.equal(noCase.status, 2);
  const missing = runner(env, ['--cases', 'demo-case,nope-case', '--run-large', ...runLargeArgs(env, 0, 12)]);
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /nope-case/);
  const file = join(env.worktrees[0], 'idea-loop', 'evals', 'retro', 'cases', 'demo-case', 'case.json');
  const c = JSON.parse(readFileSync(file, 'utf8'));
  delete c.question;
  writeFileSync(file, JSON.stringify(c));
  const bad = runner(env, ['--case', 'demo-case', '--run-large', ...runLargeArgs(env, 0, 12)]);
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /question/);
  assert.deepEqual(bad.calls, [], 'not one claude session in any of the four');
  assert.equal(existsSync(reviewLoopPath(env.worktrees[0], 12)), false);
});

test('a large case with only --case still exits 3 and says how to run it now', () => {
  const env = nightSetup({ cases: bigCase });
  const r = runner(env, ['--case', 'big-case', '--worktree', env.worktrees[0], '--base', 'base-point', '--out', env.out]);
  assert.equal(r.status, 3, r.stdout + r.stderr);
  assert.deepEqual(r.calls, []);
  assert.match(r.stdout, /要进夜间队列/);
  assert.match(r.stdout, /--run-large --pr <N>/);
});

test('--run-large runs a small case that starts an agent to the end: not stopped, not relabelled', () => {
  const env = nightSetup({ after: 'agentreply: FIXED' });
  const r = runner(env, ['--case', 'demo-case', '--run-large', ...runLargeArgs(env, 0, 12)]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.calls.length, 3);
  const c = JSON.parse(readFileSync(join(env.worktrees[0], 'idea-loop', 'evals', 'retro', 'cases', 'demo-case', 'case.json'), 'utf8'));
  assert.equal(c.size, 'small');
  assert.equal(c.size_basis, '只驱动 some-skill 一个 skill');
});

test('--run-large times out after 45 minutes unless --timeout-min says otherwise; the plain --case keeps 20', () => {
  const env = nightSetup();
  const base = ['--case', 'demo-case', '--worktree', env.worktrees[0], '--base', 'base-point', '--out', env.out, '--queue-dir', env.queueDir];
  assert.match(runner(env, [...base, '--run-large', '--pr', '12']).stdout, /超时 45 分钟/);
  assert.match(runner(env, [...base, '--run-large', '--pr', '12', '--timeout-min', '7']).stdout, /超时 7 分钟/);
  assert.doesNotMatch(runner(env, base).stdout, /超时 45 分钟/);
});

test('--run-large says up front how many cases, how long at most and what it expects to spend', () => {
  const env = nightSetup({ cases: { 'demo-case': {}, 'other-case': {} } });
  const r = runner(env, ['--cases', 'demo-case,other-case', '--run-large', ...runLargeArgs(env, 0, 12)]);
  assert.match(r.stdout, /2 个用例/);
  assert.match(r.stdout, /预计花费约 \$\d+\.\d\d–\$\d+\.\d\d/);
});

test('--run-large takes the review loop file\'s worktree from --repo when --worktree is not given', () => {
  const env = nightSetup();
  const wt = env.worktrees[0];
  const r = runner(env, [
    '--case', 'demo-case', '--run-large', '--pr', '12', '--repo', wt, '--after-plugin', join(wt, 'idea-loop'),
    '--cases-root', join(wt, 'idea-loop', 'evals', 'retro'), '--base', 'base-point', '--out', env.out, '--queue-dir', env.queueDir, '--timeout-min', '1',
  ]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(existsSync(reviewLoopPath(wt, 12)));
});

test('--run-large does not combine with --queue, --enqueue or --settle', () => {
  const env = nightSetup();
  const r = runner(env, ['--case', 'demo-case', '--run-large', '--queue', ...runLargeArgs(env, 0, 12)]);
  assert.equal(r.status, 2);
  assert.deepEqual(r.calls, []);
});
