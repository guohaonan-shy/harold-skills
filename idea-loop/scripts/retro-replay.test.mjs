/**
 * The replay runner's decisions (idea-loop/evals/retro/): given what a replay saw, what is the verdict?
 *
 * The runner starts `claude -p` sessions (pre-change plugin, post-change plugin, a judging session).
 * Those are slow and cost money, so everything it decides is a pure function tested here; the sessions
 * themselves are covered by the end-to-end tests below, which swap in a fake `claude`, and by one real
 * smoke run when the runner is first built.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  decideOutcome, parseVerdict, relabelLarge, buildArtifact, buildWorkerPrompt, buildJudgePrompt,
  estimateCostUsd, fileBody, parseOverrides, settleVerdicts,
} from '../evals/retro/replay.mjs';

const smallCase = () => ({
  commit: 'a1b2c3d',
  prompt: '/idea-loop:some-skill 把这件事摆给我',
  stop_at: '摆出决定题、等人回答的那一刻',
  question: '摆出的题里，有没有用一句话讲清其中一个机制？',
  quote: '二者的区别能跟我讲一下吗？',
  size: 'small',
  size_basis: '只驱动 some-skill 一个 skill',
});

test('before "no" and after "yes": the rule change took effect, pass', () => {
  assert.equal(decideOutcome({ before: 'no', after: 'yes' }).outcome, 'pass');
});

test('before already "yes": the case did not catch the problem, even if after is yes too', () => {
  const r = decideOutcome({ before: 'yes', after: 'yes' });
  assert.equal(r.outcome, 'case-missed');
  assert.match(r.reason, /用例没抓住问题/);
});

test('before "yes" and after "no" is still a broken case first, not a regression verdict', () => {
  assert.equal(decideOutcome({ before: 'yes', after: 'no' }).outcome, 'case-missed');
});

test('after "no": the change did not fix it, fail', () => {
  assert.equal(decideOutcome({ before: 'no', after: 'no' }).outcome, 'fail');
});

test('an answer that is neither yes nor no is inconclusive, never a pass', () => {
  assert.equal(decideOutcome({ before: 'no', after: undefined }).outcome, 'inconclusive');
  assert.equal(decideOutcome({ before: 'maybe', after: 'yes' }).outcome, 'inconclusive');
});

test('parseVerdict reads the judge JSON, whether in a code fence or after some prose, in Chinese or English', () => {
  const body = '{"A":{"answer":"否","cite":"产物 A 里没有出现解释"},"B":{"answer":"yes","cite":"产物 B 第 3 段"}}';
  for (const text of [body, `\`\`\`json\n${body}\n\`\`\``, `我的判断如下。\n${body}\n以上。`]) {
    assert.deepEqual(parseVerdict(text), {
      A: { answer: 'no', cite: '产物 A 里没有出现解释' },
      B: { answer: 'yes', cite: '产物 B 第 3 段' },
    });
  }
});

test('parseVerdict gives null when the judge did not answer both sides', () => {
  assert.equal(parseVerdict('我觉得都可以'), null);
  assert.equal(parseVerdict('{"A":{"answer":"是","cite":"x"}}'), null);
  assert.equal(parseVerdict('{"A":{"answer":"也许","cite":"x"},"B":{"answer":"是","cite":"y"}}'), null);
});

test('a small case that started an agent is relabelled large, with the reason written into its basis', () => {
  const c = relabelLarge(smallCase(), { kind: 'agent', tool: 'Agent' });
  assert.equal(c.size, 'large');
  assert.match(c.size_basis, /起了 agent/);
  assert.match(c.size_basis, /Agent/);
  assert.match(c.size_basis, /只驱动 some-skill 一个 skill/, 'keeps the old basis for the reader');
  assert.equal(c.commit, smallCase().commit, 'touches nothing else');
});

test('a small case that opened a browser is relabelled large too', () => {
  const c = relabelLarge(smallCase(), { kind: 'browser', tool: 'mcp__playwright__browser_navigate' });
  assert.equal(c.size, 'large');
  assert.match(c.size_basis, /开了浏览器/);
});

test('the worker prompt keeps the human words and tells the run to stop at the hand-over', () => {
  const c = smallCase();
  const p = buildWorkerPrompt(c);
  assert.ok(p.startsWith(c.prompt));
  assert.ok(p.includes(c.stop_at));
  assert.match(p, /无人值守/);
});

test('the judge prompt carries the question and both products, and does not say which one is the new one', () => {
  const p = buildJudgePrompt(smallCase(), 'BEFORE-BODY', 'AFTER-BODY');
  assert.ok(p.includes(smallCase().question));
  assert.ok(p.includes('BEFORE-BODY') && p.includes('AFTER-BODY'));
  assert.ok(!/改前|改后|before|after/i.test(p.replace('BEFORE-BODY', '').replace('AFTER-BODY', '')), 'no hint which side is the changed plugin');
  assert.match(p, /出处/);
});

test('buildArtifact lists the final reply and each file the run left behind, and trims long ones', () => {
  const a = buildArtifact({ resultText: '最后一句', files: [{ path: 'docs/a.md', content: 'x'.repeat(50) }, { path: 'docs/b.md', content: 'y'.repeat(30_000) }] }, { perFile: 100 });
  assert.match(a, /最后一句/);
  assert.match(a, /docs\/a\.md/);
  assert.match(a, /docs\/b\.md/);
  assert.match(a, /已截断/);
  assert.ok(a.length < 2_000);
});

test('buildArtifact says so when the run left no files', () => {
  assert.match(buildArtifact({ resultText: 'r', files: [] }), /没有新增或改动的文件/);
});

test('the cost estimate is a range, scales with cases, and is stated in dollars', () => {
  const one = estimateCostUsd(1);
  assert.ok(one.low > 0 && one.high > one.low);
  assert.equal(estimateCostUsd(3).high, one.high * 3);
});

test('overrides: the human reverses one side of one run, in the annotations file', () => {
  const text = [
    '# case', '', '## 标注', '',
    '- 推翻 20261022T101500 改前=是 ｜ 产物里其实没有讲机制，判定会话看错了',
    '- 推翻 20261022T101500 改后：否 ｜ 讲的是别的东西',
    '- 推翻 20261023T090000 改后=是',
  ].join('\n');
  assert.deepEqual(parseOverrides(text), {
    '20261022T101500': { before: 'yes', after: 'no' },
    '20261023T090000': { after: 'yes' },
  });
});

test('settleVerdicts applies the human override for that run only, then decides', () => {
  const judged = { before: 'yes', after: 'yes' };
  const overrides = { r1: { before: 'no' }, r2: { after: 'no' } };
  assert.deepEqual(settleVerdicts(judged, overrides, 'r1'), { before: 'no', after: 'yes' });
  assert.deepEqual(settleVerdicts(judged, overrides, 'r3'), judged);
  assert.equal(decideOutcome(settleVerdicts(judged, overrides, 'r1')).outcome, 'pass');
});

// ---------------------------------------------------------------------------------------------
// End to end with a fake `claude`: the runner's flow, without paying for a session.
//
// The fake reads `<plugin-dir>/MARK` to decide what its worker session does:
//   a line "reply: X"   final text X, and a file docs/out.md containing X
//   a line "agent"      the session starts an Agent tool call, then goes on running (must be killed)
// With no --plugin-dir it is the judge: it answers yes for a product containing FIXED, else no.
// ---------------------------------------------------------------------------------------------

const RUNNER = join(dirname(fileURLToPath(import.meta.url)), '..', 'evals', 'retro', 'retro-replay.mjs');

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
  if (/^agent$/m.test(mark)) {
    emit({ type: 'assistant', parent_tool_use_id: null, message: { content: [{ type: 'tool_use', id: 't1', name: 'Agent', input: {} }] } });
    setInterval(() => {}, 1000);
  } else {
    const m = /^reply: (.*)$/m.exec(mark);
    const text = m ? m[1] : 'nothing';
    fs.mkdirSync('docs', { recursive: true });
    fs.writeFileSync('docs/out.md', text);
    emit({ type: 'assistant', parent_tool_use_id: null, message: { content: [{ type: 'tool_use', id: 't1', name: 'Write', input: {} }] } });
    result(text);
  }
} else {
  const a = /产物 A[\\s\\S]*?(?=产物 B)/.exec(prompt)?.[0] ?? '';
  const b = /产物 B[\\s\\S]*/.exec(prompt)?.[0] ?? '';
  const ans = (s) => (s.includes('FIXED') ? '是' : '否');
  result(JSON.stringify({ A: { answer: ans(a), cite: 'fake cite A' }, B: { answer: ans(b), cite: 'fake cite B' } }));
}
`;

function setup({ before, after, size = 'small', caseName = 'demo-case' }) {
  const root = mkdtempSync(join(tmpdir(), 'retro-e2e-'));
  const repo = join(root, 'repo');
  mkdirSync(repo);
  writeFileSync(join(repo, 'README.md'), 'project at the decision commit\n');
  const g = (...a) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', ...a], { cwd: repo, encoding: 'utf8' });
  g('init', '-q');
  g('add', '-A');
  g('commit', '-q', '-m', 'decision state');
  const commit = g('rev-parse', 'HEAD').stdout.trim();
  for (const [name, mark] of [['before', before], ['after', after]]) {
    mkdirSync(join(root, name), { recursive: true });
    writeFileSync(join(root, name, 'MARK'), mark);
  }
  const casesRoot = join(root, 'evals');
  const caseDir = join(casesRoot, 'cases', caseName);
  mkdirSync(caseDir, { recursive: true });
  writeFileSync(join(caseDir, 'case.json'), JSON.stringify({ ...smallCase(), commit, size }, null, 2));
  writeFileSync(join(caseDir, 'annotations.md'), '# demo\n');
  const bin = join(root, 'fake-claude');
  writeFileSync(bin, FAKE);
  chmodSync(bin, 0o755);
  const log = join(root, 'calls.log');
  writeFileSync(log, '');
  return { root, repo, casesRoot, caseDir, bin, log };
}

function run(env, extra = []) {
  const r = spawnSync(process.execPath, [
    RUNNER, '--case', 'demo-case', '--repo', env.repo, '--cases-root', env.casesRoot,
    '--before-plugin', join(env.root, 'before'), '--after-plugin', join(env.root, 'after'),
    '--out', join(env.root, 'out'), '--timeout-min', '1', ...extra,
  ], { encoding: 'utf8', env: { ...process.env, RETRO_CLAUDE_BIN: env.bin, FAKE_LOG: env.log }, timeout: 60_000 });
  const calls = readFileSync(env.log, 'utf8').split('\n').filter(Boolean);
  return { ...r, calls };
}

const resultJson = (env, stdout) => {
  const dir = /run dir: (.+)/.exec(stdout)?.[1].trim();
  return JSON.parse(readFileSync(join(dir, 'result.json'), 'utf8'));
};

test('e2e: pre-change run misses it, post-change run has it -> pass, exit 0, three sessions', () => {
  const env = setup({ before: 'reply: plain', after: 'reply: FIXED' });
  const r = run(env);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(r.calls.sort(), ['judge', 'worker', 'worker']);
  const res = resultJson(env, r.stdout);
  assert.equal(res.outcome, 'pass');
  assert.deepEqual(res.verdicts.map((v) => v.answer), ['no', 'yes']);
  assert.ok(res.cost > 0, 'cost is read from the event streams');
  assert.match(r.stdout, /预计花费/, 'says what it expects to spend before it starts');
});

test('e2e: the pre-change run already has it -> "用例没抓住问题", exit 1', () => {
  const env = setup({ before: 'reply: FIXED', after: 'reply: FIXED' });
  const r = run(env);
  assert.equal(r.status, 1);
  assert.equal(resultJson(env, r.stdout).outcome, 'case-missed');
  assert.match(r.stdout, /用例没抓住问题/);
});

test('e2e: the post-change run still lacks it -> fail, exit 1', () => {
  const env = setup({ before: 'reply: plain', after: 'reply: plain' });
  const r = run(env);
  assert.equal(r.status, 1);
  assert.equal(resultJson(env, r.stdout).outcome, 'fail');
});

test('e2e: the worker sees the project as of the case commit and what it wrote is judged', () => {
  const env = setup({ before: 'reply: plain', after: 'reply: FIXED' });
  const r = run(env);
  const dir = /run dir: (.+)/.exec(r.stdout)[1].trim();
  assert.equal(readFileSync(join(dir, 'after', 'project', 'README.md'), 'utf8'), 'project at the decision commit\n');
  assert.match(readFileSync(join(dir, 'after', 'artifact.md'), 'utf8'), /docs\/out\.md/);
});

test('e2e: a small case whose run starts an agent is stopped, relabelled large, and sent to the nightly queue', () => {
  const env = setup({ before: 'agent', after: 'reply: FIXED' });
  const started = Date.now();
  const r = run(env);
  assert.equal(r.status, 3, r.stdout + r.stderr);
  assert.ok(Date.now() - started < 30_000, 'the run was killed, not waited out');
  assert.match(r.stdout, /要进夜间队列/);
  const c = JSON.parse(readFileSync(join(env.caseDir, 'case.json'), 'utf8'));
  assert.equal(c.size, 'large');
  assert.match(c.size_basis, /起了 agent/);
  assert.ok(!r.calls.includes('judge'), 'no judge for an aborted replay');
});

test('e2e: a case already marked large is not run at all, it goes to the nightly queue', () => {
  const env = setup({ before: 'reply: plain', after: 'reply: FIXED', size: 'large' });
  const r = run(env);
  assert.equal(r.status, 3);
  assert.deepEqual(r.calls, [], 'no claude session was started');
  assert.match(r.stdout, /要进夜间队列/);
  assert.ok(!existsSync(join(env.root, 'out')), 'nothing was set up either');
});

test('e2e: --settle applies the human override recorded next to the case and re-decides', () => {
  const env = setup({ before: 'reply: FIXED', after: 'reply: FIXED' });
  const r = run(env);
  const dir = /run dir: (.+)/.exec(r.stdout)[1].trim();
  const runId = resultJson(env, r.stdout).runId;
  assert.equal(resultJson(env, r.stdout).outcome, 'case-missed');
  writeFileSync(join(env.caseDir, 'annotations.md'), `# demo\n\n- 推翻 ${runId} 改前=否 ｜ 判定会话看错了，产物里并没有\n`);
  const s = spawnSync(process.execPath, [RUNNER, '--settle', 'demo-case', '--run', dir, '--cases-root', env.casesRoot], { encoding: 'utf8' });
  assert.equal(s.status, 0, s.stdout + s.stderr);
  assert.match(s.stdout, /pass/);
  assert.equal(JSON.parse(readFileSync(join(dir, 'result.json'), 'utf8')).outcome, 'pass');
});

test('e2e: a case with a broken format is refused before any session starts', () => {
  const env = setup({ before: 'reply: plain', after: 'reply: FIXED' });
  const c = JSON.parse(readFileSync(join(env.caseDir, 'case.json'), 'utf8'));
  delete c.question;
  writeFileSync(join(env.caseDir, 'case.json'), JSON.stringify(c));
  const r = run(env);
  assert.equal(r.status, 2);
  assert.match(r.stderr + r.stdout, /question/);
  assert.deepEqual(r.calls, []);
});

test('fileBody gives the text of a text file and a one-line note for a binary one (no NUL byte reaches the judge prompt)', () => {
  assert.equal(fileBody(Buffer.from('# 标题\n正文', 'utf8')), '# 标题\n正文');
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
  const note = fileBody(png);
  assert.ok(!note.includes('\0'));
  assert.match(note, /二进制文件，12 字节/);
  // the judge prompt is passed to spawn as an argument; a NUL byte there throws
  assert.ok(!buildJudgePrompt(smallCase(), buildArtifact({ resultText: 'r', files: [{ path: 'a.png', content: note }] }), 'B').includes('\0'));
});
