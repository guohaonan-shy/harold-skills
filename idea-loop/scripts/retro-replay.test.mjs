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
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { dynaBinary, runDyna } from './dyna-test-bin.mjs';
import { changeSetOf, homeProblem, pluginDiffOf, pluginRelDirOf, prepareHome, projectName, swapPluginFiles } from '../evals/retro/retro-replay.mjs';
import { normalizeRemote, parseProjects } from '../evals/retro/home-projects.mjs';
import {
  homeAgentsMd, homeCopyEntries, homeProjectName, homeRemote, homeSourceOf, projectListLine, registerProject, withHome,
  decideOutcome, parseVerdict, relabelLarge, buildArtifact, buildWorkerPrompt, buildJudgePrompt,
  estimateCostUsd, fileBody, parseOverrides, settleVerdicts, productsInOrder, verdictsBySide, exercisedBy, applyExercised, replayChildEnv,
} from '../evals/retro/replay.mjs';

/** Where `dyna home where` puts the project that `cwd` is in, given this home: `{ ok: true, projectDir, docs, … }`, or `{ ok: false }` when it finds none. */
function locate({ cwd, env }) {
  const r = runDyna(['home', 'where'], { cwd, env });
  return r.status === 0 ? { ok: true, ...JSON.parse(r.stdout) } : { ok: false, stderr: r.stderr };
}

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

test('the worker prompt is the human words and nothing else: no note that it is a test, no stop point', () => {
  const c = smallCase();
  assert.equal(buildWorkerPrompt(c), c.prompt);
});

test('the judge prompt is told where the thing is handed to the human (stop_at), so it looks at that moment', () => {
  const c = smallCase();
  assert.ok(buildJudgePrompt(c, 'A-BODY', 'B-BODY').includes(c.stop_at));
});

test('the judge prompt carries the question and both products, and does not say which one is the new one', () => {
  const p = buildJudgePrompt(smallCase(), 'BEFORE-BODY', 'AFTER-BODY');
  assert.ok(p.includes(smallCase().question));
  assert.ok(p.includes('BEFORE-BODY') && p.includes('AFTER-BODY'));
  assert.ok(!/改前|改后|before|after/i.test(p.replace('BEFORE-BODY', '').replace('AFTER-BODY', '')), 'no hint which side is the changed plugin');
  assert.match(p, /出处/);
});

test('the whole judge prompt, products included, has no 改前 / 改后 / 新 / 旧 in it', () => {
  const a = buildArtifact({ resultText: '最后一句', files: [{ path: 'docs/a.md', content: '正文' }] });
  const b = buildArtifact({ resultText: '另一句', files: [] });
  const p = buildJudgePrompt(smallCase(), a, b);
  assert.doesNotMatch(p, /改前|改后|新|旧/);
});

test('products are lettered by a recorded order and the verdict is turned back into pre-change / post-change', () => {
  const products = { before: 'BEFORE-BODY', after: 'AFTER-BODY' };
  assert.deepEqual(productsInOrder(products, 'A'), { A: 'AFTER-BODY', B: 'BEFORE-BODY' });
  assert.deepEqual(productsInOrder(products, 'B'), { A: 'BEFORE-BODY', B: 'AFTER-BODY' });
  const verdict = { A: { answer: 'yes', cite: 'ca' }, B: { answer: 'no', cite: 'cb' } };
  assert.deepEqual(verdictsBySide(verdict, 'A'), [{ side: 'before', answer: 'no', cite: 'cb' }, { side: 'after', answer: 'yes', cite: 'ca' }]);
  assert.deepEqual(verdictsBySide(verdict, 'B'), [{ side: 'before', answer: 'yes', cite: 'ca' }, { side: 'after', answer: 'no', cite: 'cb' }]);
  assert.equal(verdictsBySide(null, 'A'), null);
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
  assert.match(buildArtifact({ resultText: 'r', files: [] }), /没有写下或改动的文件/);
});

test('replayChildEnv: the four gh token variables are gone, GH_CONFIG_DIR is the given empty dir, everything else is passed on, the input is untouched', () => {
  const parent = {
    GH_TOKEN: 't1', GITHUB_TOKEN: 't2', GH_ENTERPRISE_TOKEN: 't3', GITHUB_ENTERPRISE_TOKEN: 't4',
    GH_CONFIG_DIR: '/home/me/.config/gh', PATH: '/usr/bin', HOME: '/home/me', CLAUDE_CONFIG_DIR: '/home/me/.claude',
    IDEA_LOOP_RUNTIME: 'desktop', RETRO_JUDGE_ORDER: 'after-first', FAKE_LOG: '/x/log', GH_HOST: 'github.com',
  };
  const snapshot = structuredClone(parent);
  const env = replayChildEnv(parent, '/run/dir/gh-config');
  for (const k of ['GH_TOKEN', 'GITHUB_TOKEN', 'GH_ENTERPRISE_TOKEN', 'GITHUB_ENTERPRISE_TOKEN']) assert.ok(!(k in env), `${k} is removed`);
  assert.equal(env.GH_CONFIG_DIR, '/run/dir/gh-config');
  const { GH_TOKEN, GITHUB_TOKEN, GH_ENTERPRISE_TOKEN, GITHUB_ENTERPRISE_TOKEN, GH_CONFIG_DIR, ...rest } = parent;
  assert.deepEqual({ ...env, GH_CONFIG_DIR: undefined }, { ...rest, GH_CONFIG_DIR: undefined }, 'every other variable passes through as it was');
  assert.deepEqual(parent, snapshot, 'the object passed in was not changed');
});

test('replayChildEnv: when the parent has no gh variables at all, GH_CONFIG_DIR is still set to the empty dir', () => {
  assert.deepEqual(replayChildEnv({ PATH: '/usr/bin' }, '/e'), { PATH: '/usr/bin', GH_CONFIG_DIR: '/e' });
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
//   a line "home-write: X"  X is written to <IDEA_LOOP_HOME>/projects/repo/docs/spec/out-home.md and committed in that home (as commit-to-home does)
//   a line "peek: P"    the session looks at P (relative to its work dir) and records what it found there (null when missing)
//   a line "bash: C"    the session issues a Bash tool call with command C (nothing is run)
//   a line "readproj: P" the session issues a Read of P under its work dir, as an absolute path
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
const dirIn = process.env.GH_CONFIG_DIR;
const walk = (d, rel = '') => (fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).filter((e) => e.name !== '.git').flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name), rel + e.name + '/') : [rel + e.name])) : []);
const hd = process.env.IDEA_LOOP_HOME;
const home = hd ? { dir: hd, exists: fs.existsSync(hd), files: walk(hd).sort(), agents: fs.existsSync(path.join(hd, 'AGENTS.md')) ? fs.readFileSync(path.join(hd, 'AGENTS.md'), 'utf8') : null } : null;
const sp = (cmd, a) => require('node:child_process').spawnSync(cmd, a, { cwd: process.cwd(), encoding: 'utf8' });
const where = () => {
  if (!process.env.IDEA_LOOP_DYNA_BIN || !hd) return {};
  const w = sp(process.env.IDEA_LOOP_DYNA_BIN, ['home', 'where']);
  const o = (a) => { const r = sp('git', a); return r.status === 0 ? r.stdout.trim() : null; };
  return { where: { status: w.status, stdout: w.stdout, stderr: w.stderr }, origin: { fetch: o(['remote', 'get-url', 'origin']), push: o(['remote', 'get-url', '--push', 'origin']) } };
};
const probe = { GH_TOKEN: process.env.GH_TOKEN ?? null, GITHUB_TOKEN: process.env.GITHUB_TOKEN ?? null, GH_CONFIG_DIR: dirIn ?? null, ghDirEntries: dirIn && fs.existsSync(dirIn) ? fs.readdirSync(dirIn) : null, UNRELATED: process.env.UNRELATED_VAR ?? null, home, ...where() };
fs.appendFileSync(process.env.FAKE_LOG + '.json', JSON.stringify({ kind: pd ? 'worker' : 'judge', prompt, cwd: process.cwd(), pluginDir: pd, probe }) + '\\n');
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
    for (const u of mark.matchAll(/^peek: (.*)$/gm)) {
      const file = path.join(process.cwd(), u[1]);
      const content = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
      fs.appendFileSync(process.env.FAKE_LOG + '.peek', JSON.stringify({ reply: m ? m[1] : null, rel: u[1], content }) + '\\n');
    }
    for (const u of mark.matchAll(/^bash: (.*)$/gm)) {
      emit({ type: 'assistant', parent_tool_use_id: null, message: { content: [{ type: 'tool_use', id: 'b1', name: 'Bash', input: { command: u[1] } }] } });
    }
    for (const u of mark.matchAll(/^readproj: (.*)$/gm)) {
      emit({ type: 'assistant', parent_tool_use_id: null, message: { content: [{ type: 'tool_use', id: 'r1', name: 'Read', input: { file_path: path.join(process.cwd(), u[1]) } }] } });
    }
    for (const u of mark.matchAll(/^(skill|read): (.*)$/gm)) {
      const input = u[1] === 'skill' ? { skill: u[2] } : { file_path: path.join(pd, u[2]) };
      emit({ type: 'assistant', parent_tool_use_id: null, message: { content: [{ type: 'tool_use', id: 'u1', name: u[1] === 'skill' ? 'Skill' : 'Read', input }] } });
    }
    fs.mkdirSync('docs', { recursive: true });
    fs.writeFileSync('docs/out.md', text);
    const hw = /^home-write: (.*)$/m.exec(mark);
    if (hw && hd) {
      fs.mkdirSync(path.join(hd, 'projects', 'repo', 'docs', 'spec'), { recursive: true });
      fs.writeFileSync(path.join(hd, 'projects', 'repo', 'docs', 'spec', 'out-home.md'), hw[1]);
      const g = (...a) => require('node:child_process').spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', ...a], { cwd: hd });
      g('add', '-A');
      g('commit', '-q', '-m', 'spec');
    }
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

// A fake `codex`, started by `dyna agent codex run` as `codex exec --sandbox read-only … -C D -m M -c … -o OUT PROMPT`. It answers like the
// fake judge does (yes for a product containing FIXED), with some prose around the JSON the way a real one talks, on stdout and
// in the -o file; FAKE_CODEX_FAIL makes it exit 2.
const FAKE_CODEX = `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const prompt = args[args.length - 1] === '-' ? fs.readFileSync(0, 'utf8') : args[args.length - 1];
const out = args[args.indexOf('-o') + 1];
fs.appendFileSync(process.env.FAKE_LOG, 'codex\\n');
const dirIn = process.env.GH_CONFIG_DIR;
const probe = { GH_TOKEN: process.env.GH_TOKEN ?? null, GITHUB_TOKEN: process.env.GITHUB_TOKEN ?? null, GH_CONFIG_DIR: dirIn ?? null, ghDirEntries: dirIn && fs.existsSync(dirIn) ? fs.readdirSync(dirIn) : null, UNRELATED: process.env.UNRELATED_VAR ?? null };
fs.appendFileSync(process.env.FAKE_LOG + '.json', JSON.stringify({ kind: 'codex', args, prompt, cwd: process.cwd(), probe }) + '\\n');
if (process.env.FAKE_CODEX_FAIL) process.exit(2);
const a = /产物 A[\\s\\S]*?(?=产物 B)/.exec(prompt)?.[0] ?? '';
const b = /产物 B[\\s\\S]*/.exec(prompt)?.[0] ?? '';
const ans = (s) => (s.includes('FIXED') ? '是' : '否');
const said = '我读完了两份产物。\\n' + JSON.stringify({ A: { answer: ans(a), cite: 'codex cite A' }, B: { answer: ans(b), cite: 'codex cite B' } }) + '\\n';
fs.writeFileSync(out, said);
process.stdout.write(said);
`;

function setup({ before, after, size = 'small', caseName = 'demo-case', pluginFiles = {}, repoFiles = {}, snapshot = {}, origin, caseExtra = {} }) {
  const root = mkdtempSync(join(tmpdir(), 'retro-e2e-'));
  const repo = join(root, 'repo');
  mkdirSync(repo);
  writeFileSync(join(repo, 'README.md'), 'project at the decision commit\n');
  for (const [rel, text] of Object.entries(repoFiles)) {
    mkdirSync(dirname(join(repo, rel)), { recursive: true });
    writeFileSync(join(repo, rel), text);
  }
  for (const [rel, text] of Object.entries(snapshot)) {
    mkdirSync(dirname(join(repo, rel)), { recursive: true });
    writeFileSync(join(repo, rel), text);
  }
  const g = (...a) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', ...a], { cwd: repo, encoding: 'utf8' });
  g('init', '-q');
  g('add', '-A');
  g('commit', '-q', '-m', 'decision state');
  const commit = g('rev-parse', 'HEAD').stdout.trim();
  if (origin) g('remote', 'add', 'origin', origin);
  // the plugins, each in a dir called idea-loop (as the real one is) under a side's own dir
  for (const [name, mark] of [['before', before], ['after', after]]) {
    mkdirSync(join(root, name, 'idea-loop'), { recursive: true });
    writeFileSync(join(root, name, 'idea-loop', 'MARK'), mark);
    for (const [rel, text] of Object.entries(pluginFiles[name] ?? {})) {
      mkdirSync(dirname(join(root, name, 'idea-loop', rel)), { recursive: true });
      writeFileSync(join(root, name, 'idea-loop', rel), text);
    }
  }
  const casesRoot = join(root, 'evals');
  const caseDir = join(casesRoot, 'cases', caseName);
  mkdirSync(caseDir, { recursive: true });
  writeFileSync(join(caseDir, 'case.json'), JSON.stringify({ ...smallCase(), commit, size, ...caseExtra }, null, 2));
  writeFileSync(join(caseDir, 'annotations.md'), '# demo\n');
  const bin = join(root, 'fake-claude');
  writeFileSync(bin, FAKE);
  chmodSync(bin, 0o755);
  const codex = join(root, 'fake-codex');
  writeFileSync(codex, FAKE_CODEX);
  chmodSync(codex, 0o755);
  const log = join(root, 'calls.log');
  writeFileSync(log, '');
  // where the runs work: a temp dir whose own path says nothing about a test
  const tmp = mkdtempSync(join(tmpdir(), 'sbx-'));
  return { root, repo, casesRoot, caseDir, bin, codex, log, tmp };
}

/** What the fake `claude` was started with, one entry per session. */
const sessions = (env) => (existsSync(`${env.log}.json`) ? readFileSync(`${env.log}.json`, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);

/** A directory with a `codex` on it, for PATH: the place the runner would look for the real one (a fake that logs "codex"). */
function realCodexLookalike(env) {
  const dir = join(env.root, 'path-with-codex');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'codex'), readFileSync(env.codex, 'utf8'));
  chmodSync(join(dir, 'codex'), 0o755);
  return dir;
}

/**
 * `codex`: 'fake' (the judge is the fake Codex), 'missing' (the codex path does not exist), 'fails' (it exits 2),
 * 'unset' (RETRO_CODEX_BIN is not set at all, while a codex that would be found sits on PATH).
 * `order`: 'after-first' / 'before-first' fixes which letter the post-change product gets; left out it is random.
 */
function run(env, extra = [], { codex = 'fake', order, parentEnv = {} } = {}) {
  const r = spawnSync(process.execPath, [
    RUNNER, '--case', 'demo-case', '--repo', env.repo, '--cases-root', env.casesRoot,
    '--before-plugin', join(env.root, 'before', 'idea-loop'), '--after-plugin', join(env.root, 'after', 'idea-loop'),
    '--out', join(env.root, 'out'), '--timeout-min', '1', ...extra,
  ], {
    encoding: 'utf8',
    env: {
      ...process.env, ...parentEnv, RETRO_CLAUDE_BIN: env.bin, FAKE_LOG: env.log, TMPDIR: env.tmp,
      IDEA_LOOP_DYNA_BIN: dynaBinary(),
      RETRO_CODEX_BIN: codex === 'missing' ? join(env.root, 'no-codex-here') : env.codex,
      ...(codex === 'unset' ? { RETRO_CODEX_BIN: undefined, PATH: `${realCodexLookalike(env)}:${process.env.PATH}` } : {}),
      ...(codex === 'fails' ? { FAKE_CODEX_FAIL: '1' } : {}),
      ...(order ? { RETRO_JUDGE_ORDER: order } : { RETRO_JUDGE_ORDER: '' }),
    },
    timeout: 60_000,
  });
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
  assert.deepEqual(r.calls.sort(), ['codex', 'worker', 'worker'], 'the judge is Codex: no third claude session');
  const res = resultJson(env, r.stdout);
  assert.equal(res.outcome, 'pass');
  assert.equal(res.judge, 'codex');
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

test('e2e: both runs get exactly the case prompt, in a work dir that does not say it is a test, a different one each', () => {
  const env = setup({ before: 'reply: plain', after: 'reply: FIXED' });
  const r = run(env);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const [w1, w2] = sessions(env).filter((x) => x.kind === 'worker');
  for (const w of [w1, w2]) {
    assert.equal(w.prompt, smallCase().prompt, 'the -p input is the case prompt, byte for byte');
    assert.doesNotMatch(w.cwd, /retro|replay|回放|before|after|eval/i, `work dir ${w.cwd}`);
    assert.equal(basename(w.cwd), 'repo', 'the project keeps the name of the repository it was copied from');
  }
  assert.notEqual(w1.cwd, w2.cwd);
  assert.notEqual(dirname(w1.cwd), dirname(w2.cwd), 'one random dir per run');
  // what the runs left behind stays under the run dir, where the agent does not look
  const dir = /run dir: (.+)/.exec(r.stdout)[1].trim();
  assert.ok(existsSync(join(dir, 'before', 'project', 'docs', 'out.md')));
  assert.ok(existsSync(join(dir, 'after', 'run.stream.jsonl')));
  assert.ok(!existsSync(dirname(w1.cwd)), 'the work dir is gone once the run is over');
});

test('e2e: every process the runner starts (both workers, the Codex judge, the Claude judge) has no gh login: no tokens, an existing empty config dir that is not the one passed in, the rest of the environment as it was', () => {
  const given = mkdtempSync(join(tmpdir(), 'gh-given-'));
  writeFileSync(join(given, 'hosts.yml'), 'github.com:\n  user: someone\n');
  const parentEnv = { GH_TOKEN: 'secret-1', GITHUB_TOKEN: 'secret-2', GH_CONFIG_DIR: given, UNRELATED_VAR: 'stays' };
  for (const codex of ['fake', 'missing']) {
    const env = setup({ before: 'reply: plain', after: 'reply: FIXED' });
    const r = run(env, [], { codex, parentEnv });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const all = sessions(env);
    const kinds = all.map((x) => x.kind).sort();
    assert.deepEqual(kinds, codex === 'fake' ? ['codex', 'worker', 'worker'] : ['judge', 'worker', 'worker']);
    const dirs = new Set();
    for (const s of all) {
      assert.equal(s.probe.GH_TOKEN, null, `${s.kind}: GH_TOKEN`);
      assert.equal(s.probe.GITHUB_TOKEN, null, `${s.kind}: GITHUB_TOKEN`);
      assert.notEqual(s.probe.GH_CONFIG_DIR, given, `${s.kind}: not the config dir that was passed in`);
      assert.deepEqual(s.probe.ghDirEntries, [], `${s.kind}: GH_CONFIG_DIR exists and is empty`);
      assert.equal(s.probe.UNRELATED, 'stays', `${s.kind}: other variables are passed on`);
      dirs.add(s.probe.GH_CONFIG_DIR);
    }
    const runDir = /run dir: (.+)/.exec(r.stdout)[1].trim();
    assert.ok([...dirs].every((d) => d.startsWith(`${runDir}/`)), 'the empty dir lives under the run dir, and is kept with it');
  }
});

test('e2e: the judge is told where the thing is handed to the human', () => {
  const env = setup({ before: 'reply: plain', after: 'reply: FIXED' });
  run(env);
  const judge = sessions(env).find((x) => x.kind === 'codex');
  assert.ok(judge.prompt.includes(smallCase().stop_at));
  const viaClaude = setup({ before: 'reply: plain', after: 'reply: FIXED' });
  run(viaClaude, [], { codex: 'missing' });
  assert.ok(sessions(viaClaude).find((x) => x.kind === 'judge').prompt.includes(smallCase().stop_at));
});

test('e2e: the judge is the fake Codex: its answer decides, the result and the report say judge codex, no claude judging session, nothing writable', () => {
  const env = setup({ before: 'reply: plain', after: 'reply: FIXED' });
  const r = run(env);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const res = resultJson(env, r.stdout);
  assert.equal(res.judge, 'codex');
  assert.deepEqual(res.verdicts.map((v) => [v.side, v.answer, v.cite.startsWith('codex cite')]), [['before', 'no', true], ['after', 'yes', true]]);
  assert.match(r.stdout, /评委：Codex/);
  assert.match(r.stdout, /不占 Claude 额度/);
  assert.ok(!sessions(env).some((x) => x.kind === 'judge'), 'no claude judging session');
  const [codex] = sessions(env).filter((x) => x.kind === 'codex');
  assert.equal(codex.args[0], 'exec');
  assert.equal(codex.args[codex.args.indexOf('--sandbox') + 1], 'read-only', 'Codex gets no write permission');
  assert.ok(!codex.args.includes('workspace-write') && !codex.args.includes('--write'), 'Codex gets no write permission');
  assert.ok(codex.args.includes('gpt-5.6-sol'), 'the judge runs with the model the reviewers use');
  // the answer of a Codex that finds the post-change product lacking is a fail, the other way round a case that missed the problem
  const failing = setup({ before: 'reply: plain', after: 'reply: plain' });
  const f = run(failing);
  assert.equal(f.status, 1);
  assert.equal(resultJson(failing, f.stdout).outcome, 'fail');
});

test('e2e: whichever letter the post-change product gets, the answers are turned back into the right side', () => {
  for (const [order, afterIs] of [['after-first', 'A'], ['before-first', 'B']]) {
    const env = setup({ before: 'reply: plain', after: 'reply: FIXED' });
    const r = run(env, [], { order });
    assert.equal(r.status, 0, `${order}: ${r.stdout}${r.stderr}`);
    const res = resultJson(env, r.stdout);
    assert.equal(res.afterIs, afterIs, 'the order is recorded');
    assert.deepEqual(res.judged, { before: 'no', after: 'yes' });
    assert.equal(res.outcome, 'pass');
    const prompt = sessions(env).find((x) => x.kind === 'codex').prompt;
    const sectionA = /产物 A[\s\S]*?(?=产物 B)/.exec(prompt)[0];
    assert.equal(sectionA.includes('FIXED'), afterIs === 'A', `the post-change product is ${afterIs} in the prompt`);
    // the other way: the problem shows in the post-change product only
    const bad = setup({ before: 'reply: FIXED', after: 'reply: plain' });
    const b = run(bad, [], { order });
    assert.deepEqual(resultJson(bad, b.stdout).judged, { before: 'yes', after: 'no' });
    assert.equal(resultJson(bad, b.stdout).outcome, 'case-missed');
  }
});

test('e2e: with no order given, the order is not always the same one', () => {
  const seen = new Set();
  for (let i = 0; i < 12 && seen.size < 2; i++) {
    const env = setup({ before: 'reply: plain', after: 'reply: FIXED' });
    const r = run(env);
    const res = resultJson(env, r.stdout);
    assert.equal(res.outcome, 'pass');
    seen.add(res.afterIs);
  }
  assert.deepEqual([...seen].sort(), ['A', 'B'], 'twelve replays in a row with the same order would happen once in two thousand');
});

test('e2e: no Codex: says so before any session starts, judges with the fake claude, the result says judge claude', () => {
  const env = setup({ before: 'reply: plain', after: 'reply: FIXED' });
  const r = run(env, [], { codex: 'missing' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const said = r.stdout.indexOf('没找到 Codex，评委用 Claude');
  assert.ok(said >= 0, r.stdout);
  assert.ok(said < r.stdout.indexOf('— before'), 'said before the first session starts');
  assert.deepEqual(r.calls.sort(), ['judge', 'worker', 'worker']);
  assert.equal(resultJson(env, r.stdout).judge, 'claude');
  assert.match(r.stdout, /评委：Claude/);
});

test('e2e: a Codex that gives nothing at judging time hands the judging to claude, said out loud, recorded as judge claude', () => {
  const env = setup({ before: 'reply: plain', after: 'reply: FIXED' });
  const r = run(env, [], { codex: 'fails' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /Codex 没给出判定（退出码 2），评委退回 Claude/);
  assert.deepEqual(r.calls.sort(), ['codex', 'judge', 'worker', 'worker']);
  const res = resultJson(env, r.stdout);
  assert.equal(res.judge, 'claude');
  assert.equal(res.outcome, 'pass');
});

test('e2e: the judging prompt, whichever judge reads it, has no 改前 / 改后 / 新 / 旧 and no before / after', () => {
  for (const codex of ['fake', 'missing']) {
    const env = setup({ before: 'reply: plain', after: 'reply: FIXED' });
    run(env, [], { codex });
    const p = sessions(env).find((x) => x.kind === (codex === 'fake' ? 'codex' : 'judge')).prompt;
    assert.match(p, /出处/);
    assert.doesNotMatch(p, /改前|改后|新|旧|before|after/i);
  }
});

test('e2e: the estimate before the run says the judge runs on Codex and does not use Claude quota', () => {
  const env = setup({ before: 'reply: plain', after: 'reply: FIXED' });
  const r = run(env);
  assert.match(r.stdout, /预计花费约 \$\d+\.\d\d–\$\d+\.\d\d.*评委走 Codex/);
  assert.match(r.stdout, /评委：Codex/);
});

test('e2e: both plugins are copied to <tmp>/<random>/<plugin dir name> for --plugin-dir, a path without retro, replay, before, after or eval, and removed afterwards', () => {
  const env = setup({ before: 'reply: plain', after: 'reply: FIXED' });
  const r = run(env);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const [w1, w2] = sessions(env).filter((x) => x.kind === 'worker');
  for (const w of [w1, w2]) {
    assert.equal(basename(w.pluginDir), 'idea-loop', 'the plugin keeps its own dir name');
    assert.ok(w.pluginDir.startsWith(env.tmp), 'under the temp dir');
    assert.doesNotMatch(w.pluginDir, /retro|replay|回放|before|after|eval/i, `--plugin-dir ${w.pluginDir}`);
    assert.ok(!existsSync(dirname(w.pluginDir)), 'the copy is gone once the run is over');
  }
  assert.notEqual(dirname(w1.pluginDir), dirname(w2.pluginDir), 'one random dir per side');
  assert.ok(!w1.pluginDir.includes(env.root) && !w2.pluginDir.includes(env.root), 'not the source paths');
});

test('e2e: the plugin copy and the work dir are removed even when a session was stopped', () => {
  const env = setup({ before: 'reply: plain', after: 'nothing-here' });
  writeFileSync(join(env.root, 'before', 'idea-loop', 'MARK'), 'agent');
  const r = run(env);
  assert.equal(r.status, 3);
  const [w] = sessions(env).filter((x) => x.kind === 'worker');
  assert.ok(!existsSync(dirname(w.pluginDir)));
  assert.ok(!existsSync(dirname(w.cwd)));
});

test('e2e: a case whose prompt says it is a test is refused with exit 2 before any session starts; --list names it', () => {
  const env = setup({ before: 'reply: plain', after: 'reply: FIXED' });
  const c = JSON.parse(readFileSync(join(env.caseDir, 'case.json'), 'utf8'));
  c.prompt = `${c.prompt}\n\n这是回放，人不在场`;
  writeFileSync(join(env.caseDir, 'case.json'), JSON.stringify(c));
  const r = run(env);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /prompt/);
  assert.match(r.stderr, /回放/);
  assert.deepEqual(r.calls, []);
  assert.deepEqual(sessions(env), []);
  assert.ok(!existsSync(join(env.root, 'out')), 'nothing was set up either');
  const l = spawnSync(process.execPath, [RUNNER, '--list', '--cases-root', env.casesRoot], { encoding: 'utf8' });
  assert.match(l.stdout, /格式问题 demo-case: prompt/);
});

test('projectName: the repository\'s own name, else its directory, else "project" when the name would give the test away', () => {
  const root = mkdtempSync(join(tmpdir(), 'name-'));
  const mk = (dir, remote) => {
    const d = join(root, dir);
    mkdirSync(d, { recursive: true });
    spawnSync('git', ['init', '-q'], { cwd: d });
    if (remote) spawnSync('git', ['remote', 'add', 'origin', remote], { cwd: d });
    return d;
  };
  assert.equal(projectName(mk('wt-1', 'git@github.com:acme/widgets.git')), 'widgets');
  assert.equal(projectName(mk('wt-2', 'https://github.com/acme/gadgets')), 'gadgets');
  assert.equal(projectName(mk('plain-dir')), 'plain-dir');
  assert.equal(projectName(mk('retro-before')), 'project');
  assert.equal(projectName(mk('my eval repo')), 'project');
  assert.equal(projectName(mk('wt-3', 'git@github.com:acme/replay-lab.git')), 'wt-3', 'a remote name that gives it away is skipped, the directory is next');
});

test('e2e: a small case whose run starts an agent is stopped, relabelled large, and left to --run-large', () => {
  const env = setup({ before: 'agent', after: 'reply: FIXED' });
  const started = Date.now();
  const r = run(env);
  assert.equal(r.status, 3, r.stdout + r.stderr);
  assert.ok(Date.now() - started < 30_000, 'the run was killed, not waited out');
  assert.match(r.stdout, /编排者在 PR 开出后用 --run-large --pr/);
  assert.doesNotMatch(r.stdout, /夜间|队列/);
  const c = JSON.parse(readFileSync(join(env.caseDir, 'case.json'), 'utf8'));
  assert.equal(c.size, 'large');
  assert.match(c.size_basis, /起了 agent/);
  assert.ok(!r.calls.includes('judge'), 'no judge for an aborted replay');
});

test('e2e: a case already marked large is not run at all, it is left to --run-large', () => {
  const env = setup({ before: 'reply: plain', after: 'reply: FIXED', size: 'large' });
  const r = run(env);
  assert.equal(r.status, 3);
  assert.deepEqual(r.calls, [], 'no claude session was started');
  assert.match(r.stdout, /编排者在 PR 开出后用 --run-large --pr/);
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

// ---------------------------------------------------------------------------------------------
// Spec replay-run-large-now, ticket 05: did the post-change run use what the change touched?
// ---------------------------------------------------------------------------------------------

const tool = (name, input, parent = null) => ({ type: 'assistant', parent_tool_use_id: parent, message: { content: [{ type: 'tool_use', id: 'x', name, input }] } });
const CHANGE = {
  files: ['skills/engineering/demo/SKILL.md', 'skills/engineering/demo/references/more.md', 'agents/helper.md'],
  skills: ['idea-loop:demo'],
  agents: ['idea-loop:helper'],
};
const ROOTS = ['/tmp/ab12/idea-loop', '/private/tmp/ab12/idea-loop'];

test('exercisedBy: a Read of a changed file under the post-change plugin dir counts, and says which file', () => {
  const r = exercisedBy([tool('Read', { file_path: '/tmp/ab12/idea-loop/skills/engineering/demo/references/more.md' })], CHANGE, { roots: ROOTS });
  assert.deepEqual(r, { status: 'hit', via: 'read', name: 'skills/engineering/demo/references/more.md', changed: 3 });
  const real = exercisedBy([tool('Read', { file_path: '/private/tmp/ab12/idea-loop/agents/helper.md' })], CHANGE, { roots: ROOTS });
  assert.equal(real.name, 'agents/helper.md', 'the other spelling of the same dir (/tmp vs /private/tmp) counts too');
});

test('exercisedBy: a Skill call for the skill a changed SKILL.md or reference belongs to counts', () => {
  const r = exercisedBy([tool('Skill', { skill: 'idea-loop:demo' })], CHANGE, { roots: ROOTS });
  assert.deepEqual(r, { status: 'hit', via: 'skill', name: 'idea-loop:demo', changed: 3 });
});

test('exercisedBy: an Agent call for the agent a changed definition is counts', () => {
  const r = exercisedBy([tool('Agent', { subagent_type: 'idea-loop:helper' })], CHANGE, { roots: ROOTS });
  assert.deepEqual(r, { status: 'hit', via: 'agent', name: 'idea-loop:helper', changed: 3 });
  assert.equal(exercisedBy([tool('Task', { subagent_type: 'idea-loop:helper' })], CHANGE, { roots: ROOTS }).status, 'hit', 'Task is the older name of the same tool');
});

test('exercisedBy: a hit inside a sub-agent counts like one in the main session', () => {
  const r = exercisedBy([tool('Skill', { skill: 'idea-loop:demo' }, 'toolu_parent')], CHANGE, { roots: ROOTS });
  assert.equal(r.status, 'hit');
});

test('exercisedBy: a Bash command that reads a changed file by its full path counts', () => {
  const r = exercisedBy([tool('Bash', { command: 'cat /tmp/ab12/idea-loop/skills/engineering/demo/SKILL.md | head' })], CHANGE, { roots: ROOTS });
  assert.deepEqual([r.status, r.via, r.name], ['hit', 'read', 'skills/engineering/demo/SKILL.md']);
});

test('exercisedBy: a prompt that starts with the changed skill\'s slash command counts: the harness loaded it, no tool call shows it', () => {
  const r = exercisedBy([], CHANGE, { roots: ROOTS, prompt: '/idea-loop:demo 做这件事' });
  assert.deepEqual([r.status, r.via, r.name], ['hit', 'skill', 'idea-loop:demo']);
  assert.equal(exercisedBy([], CHANGE, { roots: ROOTS, prompt: '/idea-loop:other 做这件事' }).status, 'miss');
});

test('exercisedBy: nothing used, or only things the change did not touch: not used', () => {
  const events = [
    tool('Read', { file_path: '/tmp/ab12/idea-loop/skills/engineering/other/SKILL.md' }),
    tool('Read', { file_path: '/elsewhere/idea-loop/skills/engineering/demo/SKILL.md' }),
    tool('Skill', { skill: 'idea-loop:other' }),
    tool('Skill', { skill: 'other-plugin:demo' }),
    tool('Agent', { subagent_type: 'idea-loop:other' }),
    tool('Bash', { command: 'ls /tmp/ab12/idea-loop/skills' }),
    { type: 'result', result: 'done' },
  ];
  assert.deepEqual(exercisedBy(events, CHANGE, { roots: ROOTS }), { status: 'miss', changed: 3 });
  assert.deepEqual(exercisedBy([], CHANGE, { roots: ROOTS }), { status: 'miss', changed: 3 });
});

// Spec session-start-inject-rules, ticket 01: the hook puts three kinds of file in the session at the start, so a run
// does not need to read or call them for the change to reach it.
const INJECTED_FILES = [
  'skills/productivity/decision-rules/SKILL.md',
  'runtime/capabilities.md',
  'runtime/claude-desktop.md',
  'runtime/magi.md',
];

test('exercisedBy: a change to an injected file counts as used with no read or call in the stream, via "injected"', () => {
  for (const [runtime, file] of [['claude-desktop', INJECTED_FILES[0]], ['claude-desktop', INJECTED_FILES[1]], ['claude-desktop', INJECTED_FILES[2]], ['magi', INJECTED_FILES[3]], ['magi', INJECTED_FILES[0]]]) {
    const change = { files: [file], skills: [], agents: [] };
    assert.deepEqual(exercisedBy([], change, { roots: ROOTS, runtime }), { status: 'hit', via: 'injected', name: file, changed: 1 }, `${runtime} ${file}`);
  }
  const decisionRules = { files: [INJECTED_FILES[0]], skills: ['idea-loop:decision-rules'], agents: [] };
  const events = [tool('Read', { file_path: '/tmp/ab12/idea-loop/skills/engineering/other/SKILL.md' }), { type: 'result', result: 'done' }];
  assert.deepEqual(exercisedBy(events, decisionRules, { roots: ROOTS, runtime: 'magi' }), { status: 'hit', via: 'injected', name: INJECTED_FILES[0], changed: 1 });
});

// Review round 1, S1: the hook injects only the reference of the session's own runtime.
test("exercisedBy: the other runtime's reference is not injected: a change only to it needs a read or a call", () => {
  const onlyMagi = { files: [INJECTED_FILES[3]], skills: [], agents: [] };
  assert.deepEqual(exercisedBy([], onlyMagi, { roots: ROOTS, runtime: 'claude-desktop' }), { status: 'miss', changed: 1 }, 'desktop session, only the magi reference changed, nothing read: not used');
  const onlyDesktop = { files: [INJECTED_FILES[2]], skills: [], agents: [] };
  assert.deepEqual(exercisedBy([], onlyDesktop, { roots: ROOTS, runtime: 'claude-desktop' }), { status: 'hit', via: 'injected', name: INJECTED_FILES[2], changed: 1 }, 'desktop session, the desktop reference changed: used, injected');
  assert.deepEqual(exercisedBy([], onlyDesktop, { roots: ROOTS, runtime: 'magi' }), { status: 'miss', changed: 1 }, 'and the other way round');
  // read or called, it counts again
  const read = tool('Read', { file_path: '/tmp/ab12/idea-loop/runtime/magi.md' });
  const r = exercisedBy([read], onlyMagi, { roots: ROOTS, runtime: 'claude-desktop' });
  assert.deepEqual([r.status, r.via], ['hit', 'read']);
  // the runtime skill is gone: its data is a file, never a Skill call, so a call to a skill of that name counts for nothing
  const s = exercisedBy([tool('Skill', { skill: 'idea-loop:runtime' })], onlyMagi, { roots: ROOTS, runtime: 'claude-desktop' });
  assert.equal(s.status, 'miss');
});

test('exercisedBy: without a known runtime (unknown forced name, or none given) only decision-rules is injected', () => {
  for (const file of [INJECTED_FILES[1], INJECTED_FILES[2], INJECTED_FILES[3]]) {
    const change = { files: [file], skills: [], agents: [] };
    assert.equal(exercisedBy([], change, { roots: ROOTS, runtime: null }).status, 'miss', file);
    assert.equal(exercisedBy([], change, { roots: ROOTS }).status, 'miss', `${file} (no runtime given)`);
  }
  assert.equal(exercisedBy([], { files: [INJECTED_FILES[0]], skills: [], agents: [] }, { roots: ROOTS, runtime: null }).via, 'injected');
});

test('exercisedBy: when the stream also shows a read or a call, that is what is reported, not the injection', () => {
  const change = { files: [INJECTED_FILES[0]], skills: ['idea-loop:decision-rules'], agents: [] };
  const r = exercisedBy([tool('Skill', { skill: 'idea-loop:decision-rules' })], change, { roots: ROOTS, runtime: 'claude-desktop' });
  assert.deepEqual([r.status, r.via], ['hit', 'skill']);
});

test('exercisedBy: a change only to other skills, or to other files under runtime/, is still not used', () => {
  assert.deepEqual(exercisedBy([], { files: ['skills/engineering/demo/SKILL.md'], skills: ['idea-loop:demo'], agents: [] }, { roots: ROOTS, runtime: 'claude-desktop' }), { status: 'miss', changed: 1 });
  const nearby = ['skills/productivity/decision-rules/references/more.md', 'runtime/notes.md', 'skills/productivity/runtime-extra/SKILL.md', 'agents/decision-rules.md'];
  for (const file of nearby) assert.equal(exercisedBy([], { files: [file], skills: [], agents: [] }, { roots: ROOTS, runtime: 'claude-desktop' }).status, 'miss', file);
  // a change set that has one injected file among others is used through the injected one
  const mixed = { files: ['skills/engineering/demo/SKILL.md', INJECTED_FILES[2]], skills: ['idea-loop:demo'], agents: [] };
  assert.deepEqual(exercisedBy([], mixed, { roots: ROOTS, runtime: 'claude-desktop' }), { status: 'hit', via: 'injected', name: INJECTED_FILES[2], changed: 2 });
});

test('exercisedBy: an empty change set (only scripts changed) is not applicable, whatever the run did', () => {
  assert.deepEqual(exercisedBy([tool('Skill', { skill: 'idea-loop:demo' })], { files: [], skills: [], agents: [] }, { roots: ROOTS }), { status: 'na', changed: 0 });
});

test('applyExercised: not used turns any judged outcome into "not-exercised" and keeps what the judge said; used or n/a leaves it', () => {
  const pass = decideOutcome({ before: 'no', after: 'yes' });
  const miss = applyExercised(pass, { status: 'miss', changed: 2 });
  assert.equal(miss.outcome, 'not-exercised');
  assert.match(miss.reason, /用例没测到改动/);
  assert.equal(miss.judgedOutcome, 'pass');
  assert.match(miss.reason, /改前答「否」/, 'the judge\'s own reason stays readable');
  assert.equal(applyExercised(decideOutcome({ before: 'no', after: 'no' }), { status: 'miss', changed: 2 }).outcome, 'not-exercised');
  assert.deepEqual(applyExercised(pass, { status: 'hit', via: 'read', name: 'a', changed: 1 }), pass);
  assert.deepEqual(applyExercised(pass, { status: 'na', changed: 0 }), pass);
  assert.deepEqual(applyExercised(pass, undefined), pass, 'a result written before this check existed');
});

test('changeSetOf: files added or modified under skills/, agents/ and runtime/, the skills and agents they belong to, nothing else', () => {
  const root = mkdtempSync(join(tmpdir(), 'changeset-'));
  const put = (dir, rel, text) => {
    mkdirSync(dirname(join(root, dir, rel)), { recursive: true });
    writeFileSync(join(root, dir, rel), text);
  };
  for (const dir of ['before', 'after']) {
    put(dir, 'skills/engineering/same/SKILL.md', 'same');
    put(dir, 'skills/engineering/edited/SKILL.md', dir === 'before' ? 'old' : 'new');
    put(dir, 'skills/engineering/refs/SKILL.md', 'same');
    put(dir, 'skills/engineering/refs/references/a.md', dir === 'before' ? 'old' : 'new');
    put(dir, 'agents/kept.md', 'same');
    put(dir, 'agents/edited.md', dir === 'before' ? 'old' : 'new');
    put(dir, 'scripts/tool.mjs', dir === 'before' ? 'old' : 'new');
    put(dir, 'runtime/magi.md', dir === 'before' ? 'old' : 'new');
    put(dir, 'runtime/claude-desktop.md', 'same');
  }
  put('after', 'skills/productivity/brand-new/SKILL.md', 'x');
  put('after', 'skills/productivity/brand-new/references/deep/b.md', 'x');
  put('after', 'agents/added.md', 'x');
  put('after', 'skills/engineering/same/.DS_Store', 'junk');
  put('before', 'skills/engineering/gone/SKILL.md', 'deleted in the change');
  put('after', '.claude-plugin/plugin.json', '{"name":"my-plugin"}');
  const c = changeSetOf(join(root, 'before'), join(root, 'after'));
  assert.deepEqual(c.files, [
    'agents/added.md', 'agents/edited.md', 'runtime/magi.md', 'skills/engineering/edited/SKILL.md', 'skills/engineering/refs/references/a.md',
    'skills/productivity/brand-new/SKILL.md', 'skills/productivity/brand-new/references/deep/b.md',
  ]);
  assert.deepEqual(c.skills, ['my-plugin:brand-new', 'my-plugin:edited', 'my-plugin:refs']);
  assert.deepEqual(c.agents, ['my-plugin:added', 'my-plugin:edited']);
  // a plugin with no manifest is named after its directory
  const noManifest = join(root, 'plain-plugin');
  mkdirSync(join(noManifest, 'skills', 'x', 'y'), { recursive: true });
  writeFileSync(join(noManifest, 'skills', 'x', 'y', 'SKILL.md'), 'x');
  assert.deepEqual(changeSetOf(join(root, 'empty-before'), noManifest).skills, ['plain-plugin:y']);
  // nothing changed under skills/ and agents/: an empty set
  const same = changeSetOf(join(root, 'before'), join(root, 'before'));
  assert.deepEqual([same.files, same.skills, same.agents], [[], [], []]);
});

const SKILL_FILE = { 'skills/engineering/demo/SKILL.md': '# demo\n' };

test('e2e: the post-change plugin changed a skill and the post-change run called it -> pass, the result and the report say what was hit', () => {
  const env = setup({ before: 'reply: plain', after: 'reply: FIXED\nskill: idea-loop:demo', pluginFiles: { after: SKILL_FILE } });
  const r = run(env);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const res = resultJson(env, r.stdout);
  assert.equal(res.outcome, 'pass');
  assert.deepEqual(res.exercised, { status: 'hit', via: 'skill', name: 'idea-loop:demo', changed: 1 });
  assert.match(r.stdout, /改动核对：用上了（调了 skill idea-loop:demo）/);
});

test('e2e: the post-change run read the changed file instead of calling the skill -> also used', () => {
  const env = setup({ before: 'reply: plain', after: 'reply: FIXED\nread: skills/engineering/demo/SKILL.md', pluginFiles: { after: SKILL_FILE } });
  const r = run(env);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(resultJson(env, r.stdout).exercised, { status: 'hit', via: 'read', name: 'skills/engineering/demo/SKILL.md', changed: 1 });
});

test('e2e: the changed skill was neither called nor read -> not-exercised, exit 1, not a pass, and the judge still ran', () => {
  const env = setup({ before: 'reply: plain', after: 'reply: FIXED', pluginFiles: { after: SKILL_FILE } });
  const r = run(env);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  const res = resultJson(env, r.stdout);
  assert.equal(res.outcome, 'not-exercised');
  assert.equal(res.judgedOutcome, 'pass', 'the judge\'s own verdict is kept for the human');
  assert.deepEqual(res.verdicts.map((v) => v.answer), ['no', 'yes']);
  assert.equal(res.exercised.status, 'miss');
  assert.ok(r.calls.includes('codex'), 'the judge ran although nothing was exercised');
  assert.match(r.stdout, /用例没测到改动（not-exercised）/);
  assert.match(r.stdout, /改动核对：没用上/);
});

test('e2e: the check comes before the judge: it is printed before the judging starts', () => {
  const env = setup({ before: 'reply: plain', after: 'reply: FIXED', pluginFiles: { after: SKILL_FILE } });
  const r = run(env);
  const said = r.stdout.indexOf('改动核对：');
  assert.ok(said >= 0 && said < r.stdout.indexOf('— 判定'), r.stdout);
});

test('e2e: only scripts changed (nothing under skills/ or agents/) -> the check is n/a and the judge decides', () => {
  const env = setup({ before: 'reply: plain', after: 'reply: FIXED' });
  const r = run(env);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(resultJson(env, r.stdout).exercised, { status: 'na', changed: 0 });
  assert.match(r.stdout, /改动核对：不适用/);
});

test('e2e: a prompt that starts with the changed skill\'s slash command loads it: used, without any tool call showing it', () => {
  const env = setup({ before: 'reply: plain', after: 'reply: FIXED', pluginFiles: { after: SKILL_FILE } });
  const c = JSON.parse(readFileSync(join(env.caseDir, 'case.json'), 'utf8'));
  c.prompt = '/idea-loop:demo 把这件事摆给我';
  writeFileSync(join(env.caseDir, 'case.json'), JSON.stringify(c));
  const r = run(env);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(resultJson(env, r.stdout).exercised.via, 'skill');
});

test('e2e: --settle keeps "not-exercised" even when the human overrules the judge', () => {
  const env = setup({ before: 'reply: FIXED', after: 'reply: FIXED', pluginFiles: { after: SKILL_FILE } });
  const r = run(env);
  const dir = /run dir: (.+)/.exec(r.stdout)[1].trim();
  const runId = resultJson(env, r.stdout).runId;
  assert.equal(resultJson(env, r.stdout).outcome, 'not-exercised');
  writeFileSync(join(env.caseDir, 'annotations.md'), `# demo\n\n- 推翻 ${runId} 改前=否 ｜ 判定会话看错了\n`);
  const s = spawnSync(process.execPath, [RUNNER, '--settle', 'demo-case', '--run', dir, '--cases-root', env.casesRoot], { encoding: 'utf8' });
  assert.equal(s.status, 1, s.stdout + s.stderr);
  const settled = JSON.parse(readFileSync(join(dir, 'result.json'), 'utf8'));
  assert.equal(settled.outcome, 'not-exercised');
  assert.equal(settled.judgedOutcome, 'pass', 'the override still reached the judged answers');
});

test('e2e: a stand-in claude without RETRO_CODEX_BIN: the runner does not go looking for the real Codex, the stand-in judges', () => {
  const env = setup({ before: 'reply: plain', after: 'reply: FIXED' });
  const r = run(env, [], { codex: 'unset' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(!r.calls.includes('codex'), `a Codex that would have been found was started: ${r.calls}`);
  assert.deepEqual(r.calls.sort(), ['judge', 'worker', 'worker'], 'the judging session is the fake claude');
  assert.equal(resultJson(env, r.stdout).judge, 'claude');
  assert.match(r.stdout, /没找到 Codex，评委用 Claude/);
});

// ---------------------------------------------------------------------------------------------
// The temporary home (工单 09): old cases get a home built out of the case commit, cases with `home_commit` get one cut from a home repository
// ---------------------------------------------------------------------------------------------

const TG = ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false'];
const tgit = (cwd, ...a) => {
  const r = spawnSync('git', [...TG, ...a], { cwd, encoding: 'utf8' });
  assert.equal(r.status, 0, `git ${a.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
};
/** A git repo at `dir` with these files in one commit; returns the commit. */
function commitFiles(dir, files) {
  mkdirSync(dir, { recursive: true });
  tgit(dir, 'init', '-q', '-b', 'main');
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), text);
  }
  tgit(dir, 'add', '-A');
  tgit(dir, 'commit', '-q', '-m', 'state');
  return tgit(dir, 'rev-parse', 'HEAD');
}
const walkFiles = (dir, rel = '') => (!existsSync(dir) ? [] : readdirSync(dir, { withFileTypes: true }).filter((e) => e.name !== '.git')
  .flatMap((e) => (e.isDirectory() ? walkFiles(join(dir, e.name), `${rel}${e.name}/`) : [`${rel}${e.name}`]))).sort();

const OLD_REPO_FILES = {
  'docs/index.md': '# 索引\n',
  'docs/spec/old/old.md': '一份旧 spec\n',
  'DEVELOPMENT.md': '# 开发\n',
  'REVIEW.md': '# review\n',
  'GLOSSARY.md': '# 术语\n',
  'AGENTS.md': '代码仓库自己的 AGENTS.md\n',
  'src/app.js': 'code\n',
};

test('home copy: docs/ and the bootstrap files that exist go in; code and the repository\'s own AGENTS.md / CLAUDE.md stay out', () => {
  assert.deepEqual(homeCopyEntries(['src', 'docs', 'REVIEW.md', 'AGENTS.md', 'CLAUDE.md', 'package.json', 'DEVELOPMENT.md']), ['docs', 'DEVELOPMENT.md', 'REVIEW.md']);
  assert.deepEqual(homeCopyEntries(['src', 'README.md']), []);
});

test('the project list line is read back as this project, with the path and remote it was given', () => {
  const entry = { name: 'demo-app', path: '/tmp/abc/demo-app', remote: 'git@github.com:acme/Demo-App.git' };
  assert.equal(projectListLine(entry), 'demo-app（项目）: /tmp/abc/demo-app. Clone from git@github.com:acme/Demo-App.git if missing.');
  assert.deepEqual(parseProjects(homeAgentsMd(entry)), [{ name: 'demo-app', path: '/tmp/abc/demo-app', remote: 'git@github.com:acme/Demo-App.git' }]);
  assert.equal(homeProjectName('Demo-App'), 'demo-app');
  assert.equal(homeRemote('https://github.com/acme/x.git\n', 'x'), 'https://github.com/acme/x.git');
  assert.ok(normalizeRemote(homeRemote(null, 'x')), 'a repository with no origin is registered under a made-up remote that still parses');
});

test('registering a project in a home that has it: the line is replaced (name kept, path now the run\'s checkout); a home without it: the line is added; nothing else changes', () => {
  const entry = { name: 'x', path: '/run/x', remote: 'https://github.com/acme/x' };
  const home = ['# home', '', '## 设备地图', '', '地图', '', '## 项目', '', 'other（别的）: ~/o. Clone from https://github.com/acme/o if missing.', 'app（真实）: ~/projects/app. Clone from git@github.com:acme/x.git if missing.', '', '## 后面', '', '别的段', ''].join('\n');
  const replaced = registerProject(home, entry);
  assert.deepEqual(parseProjects(replaced).map((p) => [p.name, p.path]), [['other', '~/o'], ['app', '/run/x']]);
  assert.ok(replaced.includes('## 后面\n\n别的段'), 'the other sections are as they were');
  const added = registerProject(home, { ...entry, remote: 'https://github.com/acme/new' });
  assert.deepEqual(parseProjects(added).map((p) => p.name), ['other', 'app', 'x']);
  assert.ok(added.indexOf('x（项目）') < added.indexOf('## 后面'), 'added inside the 项目 section, not after the next one');
  assert.deepEqual(parseProjects(registerProject('', entry)).map((p) => p.name), ['x']);
});

test('who is given what: an old case gives the post-change side a home built from the commit and the pre-change side an empty one; a case with home_commit gives both the home cut from it', () => {
  assert.deepEqual(['before', 'after'].map((s) => homeSourceOf({}, s)), ['empty', 'project-docs']);
  assert.deepEqual(['before', 'after'].map((s) => homeSourceOf({ home_commit: 'abc1234' }, s)), ['home-commit', 'home-commit']);
  const env = { PATH: '/bin', IDEA_LOOP_HOME: '/the/machines/own/home' };
  assert.equal(withHome(env, '/tmp/x/home').IDEA_LOOP_HOME, '/tmp/x/home', 'the session gets the temporary home, never the machine\'s');
  assert.equal(env.IDEA_LOOP_HOME, '/the/machines/own/home', 'the environment it was made from is not changed');
});

test('the artifact says where home is and lists what the run wrote there, apart from the workspace; without a home it is as before', () => {
  const a = buildArtifact({ resultText: '停在这', files: [], homeFiles: [{ path: 'projects/x/docs/spec/s/s.md', content: 'SPEC' }], homePath: '/tmp/r4nd/home' });
  assert.match(a, /## home（\/tmp\/r4nd\/home）里写下或改动的文件/);
  assert.match(a, /### projects\/x\/docs\/spec\/s\/s\.md\n\nSPEC/);
  assert.match(a, /## 工作区里写下或改动的文件\n\n（没有写下或改动的文件）/);
  assert.doesNotMatch(buildArtifact({ resultText: 'r', files: [] }), /home/);
});

test('prepareHome of an old case: the commit\'s docs/ and bootstrap files are in projects/<name>/, the list has the project, and where (01) finds it from the project and from a worktree of it', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'home-old-')));
  const repo = join(root, 'code');
  const commit = commitFiles(repo, OLD_REPO_FILES);
  tgit(repo, 'remote', 'add', 'origin', 'git@github.com:acme/Demo-App.git');
  // docs added after the case commit must not be in the home
  mkdirSync(join(repo, 'docs', 'later'), { recursive: true });
  writeFileSync(join(repo, 'docs', 'later', 'x.md'), 'after the commit\n');
  tgit(repo, 'add', '-A');
  tgit(repo, 'commit', '-q', '-m', 'later');
  // the checkout the run works in (what the runner makes with prepareProject)
  const project = join(root, 'run', 'Demo-App');
  commitFiles(project, OLD_REPO_FILES);
  tgit(project, 'remote', 'add', 'origin', 'git@github.com:acme/Demo-App.git');

  const home = prepareHome({ c: { name: 'c', commit }, side: 'after', t: { repo }, project, name: projectName(repo) });
  assert.equal(home.source, 'project-docs');
  const files = walkFiles(home.dir);
  for (const f of ['AGENTS.md', 'projects/demo-app/AGENTS.md', 'projects/demo-app/docs/index.md', 'projects/demo-app/docs/spec/old/old.md', 'projects/demo-app/DEVELOPMENT.md', 'projects/demo-app/REVIEW.md', 'projects/demo-app/GLOSSARY.md']) {
    assert.ok(files.includes(f), `${f} is in the temporary home: ${files}`);
  }
  assert.ok(!files.some((f) => f.includes('src/') || f.includes('later')), 'no code, and nothing from after the case commit');
  assert.doesNotMatch(readFileSync(join(home.dir, 'projects', 'demo-app', 'AGENTS.md'), 'utf8'), /代码仓库自己的/, 'the project map is written for the home, not the repository\'s own AGENTS.md');
  assert.deepEqual(parseProjects(readFileSync(join(home.dir, 'AGENTS.md'), 'utf8')), [{ name: 'demo-app', path: project, remote: 'git@github.com:acme/Demo-App.git' }]);
  assert.equal(tgit(home.dir, 'rev-parse', 'HEAD'), home.base, 'one commit, so what the run adds can be told from what was there');

  const env = { PATH: process.env.PATH, HOME: root, IDEA_LOOP_HOME: home.dir };
  const found = locate({ cwd: project, env });
  assert.equal(found.ok, true, JSON.stringify(found));
  assert.equal(found.projectDir, join(home.dir, 'projects', 'demo-app'));
  assert.equal(found.docs, join(home.dir, 'projects', 'demo-app', 'docs'));
  const wt = join(root, 'run', 'wt');
  tgit(project, 'worktree', 'add', '-q', wt, '-b', 'side');
  assert.equal(locate({ cwd: wt, env }).projectDir, found.projectDir, 'a worktree of the project is the same project');

  // the pre-change side: a home with nothing in it, so no project is found and nothing of the machine's own home is
  const empty = prepareHome({ c: { name: 'c', commit }, side: 'before', t: { repo }, project, name: projectName(repo) });
  assert.equal(empty.base, null);
  assert.deepEqual(walkFiles(empty.dir), []);
  assert.equal(locate({ cwd: project, env: { ...env, IDEA_LOOP_HOME: empty.dir } }).ok, false);
});

test('prepareHome of a case with home_commit: both sides are cut from that commit of the home repository, each its own copy, the project\'s line pointed at the run\'s checkout', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'home-new-')));
  const homeRepo = join(root, 'machine-home');
  const homeCommit = commitFiles(homeRepo, {
    'AGENTS.md': '# home\n\n## 项目\n\napp（真实）: ~/projects/app. Clone from git@github.com:acme/app.git if missing.\n',
    'projects/app/AGENTS.md': '地图\n',
    'projects/app/docs/spec/s/s.md': 'a spec in home\n',
  });
  // the home moves on after the commit: that must not reach the run
  writeFileSync(join(homeRepo, 'projects', 'app', 'docs', 'newer.md'), 'newer\n');
  tgit(homeRepo, 'add', '-A');
  tgit(homeRepo, 'commit', '-q', '-m', 'newer');
  const repo = join(root, 'code');
  const commit = commitFiles(repo, { 'src/app.js': 'code\n' });
  tgit(repo, 'remote', 'add', 'origin', 'https://github.com/acme/app');
  const project = join(root, 'run', 'app');
  commitFiles(project, { 'src/app.js': 'code\n' });
  tgit(project, 'remote', 'add', 'origin', 'https://github.com/acme/app');
  const c = { name: 'c', commit, home_commit: homeCommit };
  const t = { repo, homeRepo };

  const homes = ['before', 'after'].map((side) => prepareHome({ c, side, t, project, name: 'app' }));
  assert.notEqual(homes[0].dir, homes[1].dir);
  for (const h of homes) {
    assert.equal(h.source, 'home-commit');
    assert.deepEqual(walkFiles(h.dir), ['AGENTS.md', 'projects/app/AGENTS.md', 'projects/app/docs/spec/s/s.md']);
    assert.deepEqual(parseProjects(readFileSync(join(h.dir, 'AGENTS.md'), 'utf8')), [{ name: 'app', path: project, remote: 'git@github.com:acme/app.git' }]);
    assert.equal(locate({ cwd: project, env: { PATH: process.env.PATH, HOME: root, IDEA_LOOP_HOME: h.dir } }).projectDir, join(h.dir, 'projects', 'app'));
  }
  assert.equal(homeProblem(c, t), null);
  assert.match(homeProblem(c, { repo }), /--home-repo/, 'a case with home_commit and no home repository named cannot start');
  assert.match(homeProblem({ ...c, home_commit: 'deadbee' }, t), /没有提交 deadbee/);
  assert.equal(homeProblem({ name: 'c', commit }, { repo }), null, 'an old case never needs one');
});

const workers = (env) => sessions(env).filter((x) => x.kind === 'worker');

test('e2e old case: only the post-change run is given a home with the commit\'s docs/ in it, the pre-change run an empty one; where finds the project from the run\'s checkout; the checkout\'s origin cannot be pushed to', () => {
  const env = setup({ before: 'reply: plain', after: 'reply: FIXED', origin: 'git@github.com:acme/Demo.git', repoFiles: { 'docs/index.md': '# 知识库\n', 'DEVELOPMENT.md': '# 开发\n', 'src/a.js': 'x\n' } });
  const r = run(env);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const [before, after] = workers(env).map((s) => s.probe);
  assert.deepEqual(before.home.files, [], 'the pre-change run: a home with nothing in it');
  assert.equal(before.where.status, 1, 'and no project in it');
  assert.deepEqual(after.home.files.filter((f) => !f.endsWith('AGENTS.md')), ['projects/demo/DEVELOPMENT.md', 'projects/demo/docs/index.md']);
  assert.equal(after.where.status, 0, after.where.stderr);
  assert.match(after.where.stdout, /"project": "demo"/);
  assert.notEqual(before.home.dir, after.home.dir);
  for (const h of [before.home.dir, after.home.dir]) assert.doesNotMatch(h, /retro|replay|回放|before|after|eval/i, `the temporary home's path says nothing about a test: ${h}`);
  assert.equal(after.origin.fetch, 'git@github.com:acme/Demo.git', 'the project copy has the case repository\'s origin');
  assert.notEqual(after.origin.push, after.origin.fetch, 'and a run cannot push to it');
  // the homes are only for the run; a copy stays under the run dir
  const dir = /run dir: (.+)/.exec(r.stdout)[1].trim();
  assert.ok(!existsSync(after.home.dir));
  assert.ok(existsSync(join(dir, 'after', 'home', 'projects', 'demo', 'docs', 'index.md')));
});

test('e2e old case: what the post-change run writes in its home, and commits there, reaches the judge; the case passes on it alone', () => {
  const env = setup({ before: 'reply: plain', after: 'reply: plain\nhome-write: FIXED the spec', repoFiles: { 'docs/index.md': '# 知识库\n' } });
  const r = run(env);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const dir = /run dir: (.+)/.exec(r.stdout)[1].trim();
  const art = readFileSync(join(dir, 'after', 'artifact.md'), 'utf8');
  assert.match(art, /## home（.+）里写下或改动的文件/);
  assert.match(art, /### projects\/repo\/docs\/spec\/out-home\.md\n\nFIXED the spec/);
  assert.doesNotMatch(readFileSync(join(dir, 'before', 'artifact.md'), 'utf8'), /## home/, 'a side given only an empty home has no home section');
  assert.equal(resultJson(env, r.stdout).outcome, 'pass');
});

test('e2e case with home_commit: both runs get a home cut from it (their own copies, same content), --home-repo says where the home repository is, the list line points at the run\'s checkout', () => {
  const env = setup({ before: 'reply: plain', after: 'reply: FIXED', origin: 'https://github.com/acme/repo.git' });
  const homeRepo = join(env.root, 'machine-home');
  const homeCommit = commitFiles(homeRepo, {
    'AGENTS.md': '# home\n\n## 项目\n\nrepo（真实）: ~/projects/elsewhere. Clone from git@github.com:acme/repo.git if missing.\n',
    'projects/repo/AGENTS.md': '地图\n',
    'projects/repo/docs/spec/s/s.md': 'a spec in home\n',
  });
  const c = JSON.parse(readFileSync(join(env.caseDir, 'case.json'), 'utf8'));
  writeFileSync(join(env.caseDir, 'case.json'), JSON.stringify({ ...c, home_commit: homeCommit }));
  const r = run(env, ['--home-repo', homeRepo]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const [before, after] = workers(env).map((s) => s.probe);
  for (const p of [before, after]) {
    assert.deepEqual(p.home.files, ['AGENTS.md', 'projects/repo/AGENTS.md', 'projects/repo/docs/spec/s/s.md']);
    assert.equal(p.where.status, 0, p.where.stderr);
    assert.doesNotMatch(p.home.agents, /elsewhere/, 'the machine\'s own path of the project is not left in the list');
  }
  assert.notEqual(before.home.dir, after.home.dir, 'each run has its own copy: what one writes does not reach the other');
  assert.ok(readFileSync(join(homeRepo, 'AGENTS.md'), 'utf8').includes('elsewhere'), 'the home repository itself is not touched');
});

test('e2e case with home_commit but no --home-repo: refused before any session starts, and so is a home repository that lacks the commit', () => {
  const env = setup({ before: 'reply: plain', after: 'reply: FIXED' });
  const homeRepo = join(env.root, 'machine-home');
  commitFiles(homeRepo, { 'AGENTS.md': '# home\n' });
  const c = JSON.parse(readFileSync(join(env.caseDir, 'case.json'), 'utf8'));
  writeFileSync(join(env.caseDir, 'case.json'), JSON.stringify({ ...c, home_commit: 'deadbee' }));
  const none = run(env);
  assert.equal(none.status, 2);
  assert.match(none.stderr, /--home-repo/);
  const wrong = run(env, ['--home-repo', homeRepo]);
  assert.equal(wrong.status, 2);
  assert.match(wrong.stderr, /没有提交 deadbee/);
  assert.deepEqual(wrong.calls, [], 'no session was started');
});

// ---------------------------------------------------------------------------------------------
// The project's own copy of the plugin: the files the change touched are put there in each side's own version.
// ---------------------------------------------------------------------------------------------

const MANIFEST = (name) => JSON.stringify({ name });
const DEMO = 'skills/engineering/demo/SKILL.md';
const OTHER = 'skills/engineering/other/SKILL.md';
const FRESH = 'skills/engineering/fresh/SKILL.md';
const GONE = 'skills/engineering/gone/SKILL.md';
/** The plugin as the case's commit holds it (under idea-loop/, the dir the test plugins have): a skill the change edits, one it does not touch, one it deletes. */
const snapshotWith = (name = 'idea-loop') => ({
  'idea-loop/.claude-plugin/plugin.json': MANIFEST(name),
  [`idea-loop/${DEMO}`]: '旧', [`idea-loop/${OTHER}`]: '快照', [`idea-loop/${GONE}`]: '快照里还有',
});
/** Pre-change and post-change plugins: DEMO edited, OTHER untouched, FRESH only post-change, GONE only pre-change. */
const sidesWith = (name = 'idea-loop') => ({
  before: { '.claude-plugin/plugin.json': MANIFEST(name), [DEMO]: '改前', [OTHER]: '两边一样', [GONE]: '改前才有' },
  after: { '.claude-plugin/plugin.json': MANIFEST(name), [DEMO]: '改后', [OTHER]: '两边一样', [FRESH]: '改后新增' },
});
const PEEKS = [DEMO, OTHER, FRESH, GONE].map((f) => `peek: idea-loop/${f}`).join('\n');
/** What each run found at the peeked paths, keyed by the run's reply text ("plain" is the pre-change run, "FIXED" the post-change one). */
const peeks = (env) => {
  const out = { plain: {}, FIXED: {} };
  for (const l of readFileSync(`${env.log}.peek`, 'utf8').split('\n').filter(Boolean)) {
    const x = JSON.parse(l);
    out[x.reply][x.rel.replace('idea-loop/', '')] = x.content;
  }
  return out;
};
const swapSetup = (snapshot, pluginName) => setup({
  before: `reply: plain\n${PEEKS}`, after: `reply: FIXED\nskill: idea-loop:demo\n${PEEKS}`, snapshot, pluginFiles: sidesWith(pluginName),
});

test('e2e: the changed plugin files in the project are each side\'s own version; untouched plugin files stay as the commit had them; new files appear, deleted ones go', () => {
  const env = swapSetup(snapshotWith());
  const r = run(env);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const seen = peeks(env);
  assert.deepEqual(seen.plain, { [DEMO]: '改前', [OTHER]: '快照', [FRESH]: null, [GONE]: '改前才有' }, 'pre-change run');
  assert.deepEqual(seen.FIXED, { [DEMO]: '改后', [OTHER]: '快照', [FRESH]: '改后新增', [GONE]: null }, 'post-change run');
});

test('e2e: the swapped-in plugin files are not in what the run wrote: neither product lists them', () => {
  const env = swapSetup(snapshotWith());
  const r = run(env);
  const dir = /run dir: (.+)/.exec(r.stdout)[1].trim();
  for (const side of ['before', 'after']) {
    const artifact = readFileSync(join(dir, side, 'artifact.md'), 'utf8');
    assert.match(artifact, /docs\/out\.md/, 'what the run wrote is there');
    assert.doesNotMatch(artifact, /idea-loop\//, `${side}: no plugin file in the product`);
  }
});

test('e2e: the case commit has no copy of the plugin (a case from another repository): both projects are the commit as unpacked, no plugin file appears', () => {
  const env = swapSetup({});
  const r = run(env);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const seen = peeks(env);
  for (const side of ['plain', 'FIXED']) assert.deepEqual(seen[side], { [DEMO]: null, [OTHER]: null, [FRESH]: null, [GONE]: null });
  const dir = /run dir: (.+)/.exec(r.stdout)[1].trim();
  for (const side of ['before', 'after']) assert.ok(!existsSync(join(dir, side, 'project', 'idea-loop')), `${side}: nothing at the plugin's place`);
  assert.equal(readFileSync(join(dir, 'after', 'project', 'README.md'), 'utf8'), 'project at the decision commit\n');
});

test('e2e: the plugin dir in the commit is another plugin (a different manifest name): nothing is swapped, it is unpacked as it was', () => {
  const env = swapSetup(snapshotWith('some-other-plugin'));
  run(env);
  const seen = peeks(env);
  for (const side of ['plain', 'FIXED']) assert.deepEqual(seen[side], { [DEMO]: '旧', [OTHER]: '快照', [FRESH]: null, [GONE]: '快照里还有' });
});

test('e2e: files under the plugin\'s evals/ are never swapped in, even when the two sides differ: the post-change run does not see a case the change added, and both keep the snapshot\'s evals/; files outside evals/ are still swapped', () => {
  const NEWCASE = 'evals/retro/cases/new-case/case.json';
  const OLDCASE = 'evals/retro/cases/old-case/case.json';
  const sides = sidesWith();
  sides.before[OLDCASE] = '改前的用例';
  sides.after[OLDCASE] = '改后的用例';
  sides.after[NEWCASE] = '改后新增的用例';
  const snapshot = { ...snapshotWith(), [`idea-loop/${OLDCASE}`]: '快照里的用例' };
  const peekPaths = [DEMO, NEWCASE, OLDCASE].map((f) => `peek: idea-loop/${f}`).join('\n');
  const env = setup({ before: `reply: plain\n${peekPaths}`, after: `reply: FIXED\nskill: idea-loop:demo\n${peekPaths}`, snapshot, pluginFiles: sides });
  const r = run(env);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const seen = peeks(env);
  assert.deepEqual(seen.plain, { [DEMO]: '改前', [NEWCASE]: null, [OLDCASE]: '快照里的用例' }, 'pre-change run');
  assert.deepEqual(seen.FIXED, { [DEMO]: '改后', [NEWCASE]: null, [OLDCASE]: '快照里的用例' }, 'post-change run');
});

test('e2e: the post-change run reads a changed file in the project by a Bash path relative to the project, or by a Read of its absolute path: used, not not-exercised', () => {
  for (const reading of [`bash: cat idea-loop/${DEMO}`, `bash: cd /somewhere && cat ./idea-loop/${DEMO} | head`, `readproj: idea-loop/${DEMO}`]) {
    const env = setup({ before: 'reply: plain', after: `reply: FIXED\n${reading}`, snapshot: snapshotWith(), pluginFiles: sidesWith() });
    const r = run(env);
    assert.equal(r.status, 0, `${reading}\n${r.stdout}${r.stderr}`);
    const res = resultJson(env, r.stdout);
    assert.equal(res.exercised.status, 'hit', reading);
    assert.equal(res.exercised.via, 'read', reading);
    assert.equal(res.outcome, 'pass');
  }
});

test('e2e: the same read when nothing was swapped into the project (the commit has no such plugin) does not count: the project holds no post-change version', () => {
  const env = setup({ before: 'reply: plain', after: `reply: FIXED\nbash: cat idea-loop/${DEMO}`, pluginFiles: sidesWith() });
  const r = run(env);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.equal(resultJson(env, r.stdout).outcome, 'not-exercised');
});

test('pluginDiffOf: every file that differs between the two plugin dirs, added, edited or deleted, dot-files and files outside skills/ and agents/ included; same files, .DS_Store and the plugin\'s top-level evals/ are not', () => {
  const root = mkdtempSync(join(tmpdir(), 'plugindiff-'));
  const put = (dir, rel, text) => {
    mkdirSync(dirname(join(root, dir, rel)), { recursive: true });
    writeFileSync(join(root, dir, rel), text);
  };
  for (const dir of ['before', 'after']) {
    put(dir, 'skills/a/SKILL.md', 'same');
    put(dir, 'skills/b/SKILL.md', dir);
    put(dir, 'hooks/hooks.json', dir);
    put(dir, '.claude-plugin/plugin.json', dir);
  }
  put('before', 'agents/gone.md', 'x');
  put('after', 'scripts/new.mjs', 'x');
  put('after', '.mcp.json', '{}');
  put('after', 'skills/a/.DS_Store', 'junk');
  // evals/ holds replay cases and eval material: never part of the diff, whether edited, added or deleted
  put('before', 'evals/retro/cases/c/case.json', 'before');
  put('after', 'evals/retro/cases/c/case.json', 'after');
  put('after', 'evals/retro/cases/d/case.json', 'new');
  put('before', 'evals/retro/cases/e/annotations.md', 'gone');
  put('before', 'skills/b/evals/keep.md', 'before');
  put('after', 'skills/b/evals/keep.md', 'after');
  assert.deepEqual(pluginDiffOf(join(root, 'before'), join(root, 'after')), [
    '.claude-plugin/plugin.json', '.mcp.json', 'agents/gone.md', 'hooks/hooks.json', 'scripts/new.mjs', 'skills/b/SKILL.md', 'skills/b/evals/keep.md',
  ]);
  assert.deepEqual(pluginDiffOf(join(root, 'before'), join(root, 'before')), []);
});

test('swapPluginFiles: writes this side\'s version, removes what this side lacks, leaves the rest; does nothing without the same-named plugin at relDir', () => {
  const root = mkdtempSync(join(tmpdir(), 'swap-'));
  const put = (rel, text) => {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
  };
  put('side/.claude-plugin/plugin.json', MANIFEST('p'));
  put('side/skills/x/SKILL.md', 'side x');
  put('side/skills/new/deep/SKILL.md', 'side new');
  const project = () => {
    rmSync(join(root, 'project'), { recursive: true, force: true });
    put('project/tools/p/.claude-plugin/plugin.json', MANIFEST('p'));
    put('project/tools/p/skills/x/SKILL.md', 'old x');
    put('project/tools/p/skills/gone/SKILL.md', 'old gone');
    put('project/tools/p/skills/keep/SKILL.md', 'old keep');
    put('project/README.md', 'readme');
    return join(root, 'project');
  };
  const args = (p) => ({ project: p, relDir: 'tools/p', afterPlugin: join(root, 'side'), sidePlugin: join(root, 'side'), diff: ['skills/x/SKILL.md', 'skills/new/deep/SKILL.md', 'skills/gone/SKILL.md'] });
  let p = project();
  const at = (rel) => (existsSync(join(p, 'tools/p', rel)) ? readFileSync(join(p, 'tools/p', rel), 'utf8') : null);
  assert.equal(swapPluginFiles(args(p)), true);
  assert.deepEqual([at('skills/x/SKILL.md'), at('skills/new/deep/SKILL.md'), at('skills/gone/SKILL.md'), at('skills/keep/SKILL.md')], ['side x', 'side new', null, 'old keep']);
  assert.equal(readFileSync(join(p, 'README.md'), 'utf8'), 'readme');
  // no plugin at relDir, or a different name there: untouched
  p = project();
  assert.equal(swapPluginFiles({ ...args(p), relDir: 'elsewhere' }), false);
  put('project/tools/p/.claude-plugin/plugin.json', MANIFEST('not-p'));
  assert.equal(swapPluginFiles(args(p)), false);
  assert.equal(at('skills/x/SKILL.md'), 'old x');
});

test('pluginRelDirOf: the plugin\'s dir in its git repository (empty at the repo root); a dir outside any repo counts as <repo root>/<its own name>', () => {
  const root = mkdtempSync(join(tmpdir(), 'reldir-'));
  mkdirSync(join(root, 'nested', 'my-plugin'), { recursive: true });
  spawnSync('git', ['init', '-q'], { cwd: root });
  assert.equal(pluginRelDirOf(join(root, 'nested', 'my-plugin')), 'nested/my-plugin');
  assert.equal(pluginRelDirOf(root), '');
  const loose = mkdtempSync(join(tmpdir(), 'loose-'));
  mkdirSync(join(loose, 'my-plugin'));
  assert.equal(pluginRelDirOf(join(loose, 'my-plugin')), 'my-plugin');
});

test('exercisedBy: a Bash command naming a changed file by its path relative to the project counts when that project dir is given; not as the tail of a longer path or a different file', () => {
  const change = { files: ['skills/a/SKILL.md'], skills: ['p:a'], agents: [] };
  const bash = (command) => [{ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command } }] } }];
  const used = (command, projectRelDirs = ['tools/p']) => exercisedBy(bash(command), change, { projectRelDirs }).status;
  assert.equal(used('cat tools/p/skills/a/SKILL.md'), 'hit');
  assert.equal(used('cat ./tools/p/skills/a/SKILL.md'), 'hit');
  assert.equal(used('head -5 "tools/p/skills/a/SKILL.md" && ls'), 'hit');
  assert.equal(used('cat /elsewhere/tools/p/skills/a/SKILL.md'), 'miss');
  assert.equal(used('cat tools/p/skills/b/SKILL.md'), 'miss');
  assert.equal(used('cat tools/p/skills/a/SKILL.md', []), 'miss', 'no project copy of the plugin: not counted');
  assert.equal(used('cat skills/a/SKILL.md', ['']), 'hit', 'a plugin at the project root');
});
