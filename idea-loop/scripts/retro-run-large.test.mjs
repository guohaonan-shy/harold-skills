/**
 * The replay runner's `--run-large` end to end (large cases run on the spot, at any hour, once the PR is open), against a
 * fake `claude`: no real session, no real clock. How a result reads in the review loop file is unit-tested in
 * retro-queue.test.mjs.
 *
 * The fake reads `<plugin-dir>/MARK` to decide what a worker session does:
 *   "reply: X"        final text X, and a file docs/out.md containing X
 *   "agentreply: X"   the same, but the session starts an Agent tool call first (a large case)
 * With no --plugin-dir it is the judge: yes for a product containing FIXED, else no.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { reviewLoopPath } from '../evals/retro/queue.mjs';

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
 * A PR worktree: a git repo whose `idea-loop/` plugin was "plain" at the base (branch base-point) and is `after` now,
 * with replay cases under idea-loop/evals/retro/cases. Also the fake `claude` and its log.
 */
function setup({ after = 'reply: FIXED', cases = { 'demo-case': {} } } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'retro-run-large-'));
  const wt = join(root, 'wt');
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
  const bin = join(root, 'fake-claude');
  writeFileSync(bin, FAKE);
  chmodSync(bin, 0o755);
  const log = join(root, 'calls.log');
  writeFileSync(log, '');
  return { root, wt, bin, log, out: join(root, 'out') };
}

function runner(env, args) {
  const r = spawnSync(process.execPath, [RUNNER, ...args], {
    encoding: 'utf8',
    env: { ...process.env, RETRO_CLAUDE_BIN: env.bin, FAKE_LOG: env.log },
    timeout: 120_000,
  });
  const calls = readFileSync(env.log, 'utf8').split('\n').filter(Boolean);
  return { ...r, calls };
}

const loopCheck = (wt, pr) => JSON.parse(spawnSync(process.execPath, [REVIEW_LOOP, 'check', reviewLoopPath(wt, pr)], { encoding: 'utf8' }).stdout);

const runLargeArgs = (env, pr, extra = []) => [
  '--worktree', env.wt, '--base', 'base-point', '--out', env.out, '--timeout-min', '1', ...(pr === null ? [] : ['--pr', String(pr)]), ...extra,
];
const bigCase = { 'big-case': { size: 'large', size_basis: '起插件 agent' } };
const caseJson = (env, name) => JSON.parse(readFileSync(join(env.wt, 'idea-loop', 'evals', 'retro', 'cases', name, 'case.json'), 'utf8'));

test('--run-large runs a large case in the daytime: three sessions, exit 0, a settled replay entry, no push, no result line', () => {
  const env = setup({ after: 'agentreply: FIXED', cases: bigCase });
  const r = runner(env, ['--case', 'big-case', '--run-large', ...runLargeArgs(env, 12)]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(r.calls.sort(), ['judge', 'worker', 'worker']);
  const check = loopCheck(env.wt, 12);
  assert.deepEqual(check.entries.map((e) => [e.kind, e.round, e.settled]), [['replay', 1, true]]);
  assert.deepEqual(check.unsettled, []);
  const entry = readFileSync(reviewLoopPath(env.wt, 12), 'utf8');
  assert.match(entry, /big-case/);
  assert.match(entry, /当场跑完/);
  assert.doesNotMatch(entry, /夜间|队列/, 'the entry does not mention a night or a queue');
  assert.ok(r.stdout.includes(reviewLoopPath(env.wt, 12)), 'says which file the result went into');
  assert.doesNotMatch(r.stdout, /回放结果|推送/, 'the calling session reads the output itself: no result line, no push');
  assert.equal(caseJson(env, 'big-case').size, 'large');
});

test('--run-large with --cases a,b runs both and writes one entry for the PR', () => {
  const env = setup({ cases: { 'demo-case': {}, 'other-case': {} } });
  const r = runner(env, ['--cases', 'demo-case,other-case', '--run-large', ...runLargeArgs(env, 12)]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.calls.length, 6);
  const text = readFileSync(reviewLoopPath(env.wt, 12), 'utf8');
  assert.match(text, /`demo-case`：过/);
  assert.match(text, /`other-case`：过/);
  assert.deepEqual(loopCheck(env.wt, 12).entries.map((e) => [e.kind, e.round]), [['replay', 1]]);
});

test('results go after what the review loop file already holds, which is left as it was', () => {
  const env = setup();
  const file = reviewLoopPath(env.wt, 12);
  mkdirSync(dirname(file), { recursive: true });
  const existing = '# PR #12 的 review loop\n\n<!-- idea-loop-entry {"kind":"pause","round":1} -->\n## 第 1 次停下 · 落地 1 张\n…\n';
  writeFileSync(file, existing);
  const r = runner(env, ['--case', 'demo-case', '--run-large', ...runLargeArgs(env, 12)]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(readFileSync(file, 'utf8').startsWith(existing.trimEnd()));
  assert.deepEqual(loopCheck(env.wt, 12).entries.map((e) => [e.kind, e.round]), [['pause', 1], ['replay', 1]]);
});

test('--run-large where the change did not fix it: exit 1, the entry is left unsettled for the human', () => {
  const env = setup({ after: 'reply: plain' });
  const r = runner(env, ['--case', 'demo-case', '--run-large', ...runLargeArgs(env, 12)]);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.deepEqual(loopCheck(env.wt, 12).unsettled, [{ kind: 'replay', round: 1 }]);
  const text = readFileSync(reviewLoopPath(env.wt, 12), 'utf8');
  assert.match(text, /仍然答「否」/);
  assert.doesNotMatch(text, /夜间|队列/);
});

test('--run-large: no --pr, no case name, a case that is missing or malformed: exit 2 before any session starts', () => {
  const env = setup();
  const noPr = runner(env, ['--case', 'demo-case', '--run-large', ...runLargeArgs(env, null)]);
  assert.equal(noPr.status, 2);
  assert.match(noPr.stderr, /--pr/);
  const noCase = runner(env, ['--run-large', ...runLargeArgs(env, 12)]);
  assert.equal(noCase.status, 2);
  const missing = runner(env, ['--cases', 'demo-case,nope-case', '--run-large', ...runLargeArgs(env, 12)]);
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /nope-case/);
  const file = join(env.wt, 'idea-loop', 'evals', 'retro', 'cases', 'demo-case', 'case.json');
  const c = JSON.parse(readFileSync(file, 'utf8'));
  delete c.question;
  writeFileSync(file, JSON.stringify(c));
  const bad = runner(env, ['--case', 'demo-case', '--run-large', ...runLargeArgs(env, 12)]);
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /question/);
  assert.deepEqual(bad.calls, [], 'not one claude session in any of the four');
  assert.equal(existsSync(reviewLoopPath(env.wt, 12)), false);
});

test('a large case without --run-large exits 3, starts nothing, and says the orchestrator runs it with --run-large --pr once the PR is open', () => {
  const env = setup({ cases: bigCase });
  const r = runner(env, ['--case', 'big-case', '--worktree', env.wt, '--base', 'base-point', '--out', env.out]);
  assert.equal(r.status, 3, r.stdout + r.stderr);
  assert.deepEqual(r.calls, []);
  assert.match(r.stdout, /编排者在 PR 开出后用 --run-large --pr/);
  assert.doesNotMatch(r.stdout, /夜间|队列/);
});

test('--run-large runs a small case that starts an agent to the end: not stopped, not relabelled', () => {
  const env = setup({ after: 'agentreply: FIXED' });
  const r = runner(env, ['--case', 'demo-case', '--run-large', ...runLargeArgs(env, 12)]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.calls.length, 3);
  const c = caseJson(env, 'demo-case');
  assert.equal(c.size, 'small');
  assert.equal(c.size_basis, '只驱动 some-skill 一个 skill');
});

test('--run-large times out after 45 minutes unless --timeout-min says otherwise; the plain --case keeps 20', () => {
  const env = setup();
  const base = ['--case', 'demo-case', '--worktree', env.wt, '--base', 'base-point', '--out', env.out];
  assert.match(runner(env, [...base, '--run-large', '--pr', '12']).stdout, /超时 45 分钟/);
  assert.match(runner(env, [...base, '--run-large', '--pr', '12', '--timeout-min', '7']).stdout, /超时 7 分钟/);
  assert.doesNotMatch(runner(env, base).stdout, /超时 45 分钟/);
});

test('--run-large says up front how many cases, how long at most and what it expects to spend', () => {
  const env = setup({ cases: { 'demo-case': {}, 'other-case': {} } });
  const r = runner(env, ['--cases', 'demo-case,other-case', '--run-large', ...runLargeArgs(env, 12)]);
  assert.match(r.stdout, /2 个用例/);
  assert.match(r.stdout, /预计花费约 \$\d+\.\d\d–\$\d+\.\d\d/);
});

test('--run-large takes the review loop file\'s worktree from --repo when --worktree is not given', () => {
  const env = setup();
  const wt = env.wt;
  const r = runner(env, [
    '--case', 'demo-case', '--run-large', '--pr', '12', '--repo', wt, '--after-plugin', join(wt, 'idea-loop'),
    '--cases-root', join(wt, 'idea-loop', 'evals', 'retro'), '--base', 'base-point', '--out', env.out, '--timeout-min', '1',
  ]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(existsSync(reviewLoopPath(wt, 12)));
});

test('--queue, --enqueue, --notify and the options that went with them are unknown arguments: exit 2, no session, nothing written', () => {
  const env = setup();
  for (const args of [
    ['--queue'], ['--enqueue', '--pr', '12', '--cases', 'demo-case'], ['--notify', 'x'], ['--now', '2026-10-23T01:07:00'],
    ['--queue-dir', '/tmp/x'], ['--session', 'local_x'], ['--slug', 'owner/proj'],
    ['--case', 'demo-case', '--run-large', '--queue', ...runLargeArgs(env, 12)],
  ]) {
    const r = runner(env, args);
    assert.equal(r.status, 2, args.join(' '));
    assert.match(r.stderr, /unknown argument/, args.join(' '));
  }
  assert.deepEqual(readFileSync(env.log, 'utf8'), '', 'no claude session started');
  assert.equal(existsSync(reviewLoopPath(env.wt, 12)), false);
});

test('single-case use from the fixed path: --worktree stands for repo, plugin and cases root together', () => {
  const env = setup();
  const r = runner(env, ['--case', 'demo-case', '--worktree', env.wt, '--base', 'base-point', '--out', env.out, '--timeout-min', '1']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /过/);
});
