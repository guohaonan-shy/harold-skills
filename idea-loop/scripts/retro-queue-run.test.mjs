/**
 * The replay runner's queue mode end to end (`retro-replay.mjs --queue`, `--enqueue`), against a fake `claude`:
 * no real session, no real clock. The decisions themselves (time window, queue contents, result format) are
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
import { reviewLoopPath, validateQueueEntry } from '../evals/retro/queue.mjs';

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

function enqueue(env, n, cases = ['demo-case'], pr = 12) {
  return runner(env, [
    '--enqueue', '--slug', 'owner/proj', '--pr', String(pr), '--worktree', env.worktrees[n], '--cases', cases.join(','),
    '--base', 'base-point', '--queue-dir', env.queueDir,
  ]);
}

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
