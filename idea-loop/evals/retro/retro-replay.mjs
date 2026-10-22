#!/usr/bin/env node
/**
 * retro replay runner: did a rule change make the skill behave differently, on the input where it once went wrong?
 *
 * For one replay case (cases/<case>/case.json) it
 *   1. copies the project as it was at the case's commit into /tmp, twice (one copy per side);
 *   2. runs `claude -p` in each copy with the case's prompt, once with the PRE-change plugin (the base
 *      branch's idea-loop/) and once with the POST-change plugin (this working tree's idea-loop/), each
 *      told to stop where the skill hands the thing to the human;
 *   3. starts a judging `claude -p` that reads both products (anonymised as A and B) and answers the
 *      case's yes/no question, quoting where in the product it found the answer.
 * Pre-change "no" and post-change "yes" is a pass. Pre-change "yes" means the case never showed the
 * problem ("用例没抓住问题"), which is not a pass. A human can overrule a judgement: see --settle.
 *
 * Why `claude -p` and not a sub-agent: a sub-agent loads the installed plugin, not the branch being checked;
 * `--plugin-dir` is what points a session at a branch.
 *
 *   node idea-loop/evals/retro/retro-replay.mjs --list
 *   node idea-loop/evals/retro/retro-replay.mjs --case <name> [--base main] [--repo <dir>] [--out <dir>] [--model <alias>]
 *   node idea-loop/evals/retro/retro-replay.mjs --settle <name> --run <run dir>
 *
 * Only small cases run here. A case marked large is not run: the runner says "要进夜间队列" and exits 3.
 * A case marked small whose run starts an agent or opens a browser is stopped on the spot, relabelled large
 * in its case.json, and also exits 3.
 *
 * Exit codes: 0 pass · 1 not a pass (the change did not fix it / the case missed the problem) ·
 *             2 bad arguments or a malformed case · 3 needs the nightly queue · 4 judge gave no usable answer ·
 *             5 a session produced no result.
 *
 * `RETRO_CLAUDE_BIN` replaces the `claude` command (the tests use a fake one).
 */

import { createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { digestStream, escalationOfEvent, fileLines, parseEvent } from '../../scripts/claude-stream.mjs';
import { checkCasesDir, loadCases, validateCase } from './cases.mjs';
import {
  buildArtifact, buildJudgePrompt, buildWorkerPrompt, decideOutcome, estimateCostUsd, parseOverrides, parseVerdict,
  relabelLarge, settleVerdicts,
} from './replay.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(HERE, '..', '..');
const DEFAULT_OUT = '/tmp/idea-loop-retro';
const CLAUDE = process.env.RETRO_CLAUDE_BIN || 'claude';

function parseArgs(argv) {
  const o = { list: false, case: null, settle: null, run: null, base: 'main', repo: null, out: DEFAULT_OUT, model: null, timeoutMin: 20, casesRoot: HERE, beforePlugin: null, afterPlugin: null };
  const val = (i) => {
    if (i >= argv.length) throw new Error(`${argv[i - 1]} needs a value`);
    return argv[i];
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--list') o.list = true;
    else if (a === '--case') o.case = val(++i);
    else if (a === '--settle') o.settle = val(++i);
    else if (a === '--run') o.run = resolve(val(++i));
    else if (a === '--base') o.base = val(++i);
    else if (a === '--repo') o.repo = resolve(val(++i));
    else if (a === '--out') o.out = resolve(val(++i));
    else if (a === '--model') o.model = val(++i);
    else if (a === '--timeout-min') o.timeoutMin = Number(val(++i));
    else if (a === '--cases-root') o.casesRoot = resolve(val(++i));
    else if (a === '--before-plugin') o.beforePlugin = resolve(val(++i));
    else if (a === '--after-plugin') o.afterPlugin = resolve(val(++i));
    else throw new Error(`unknown argument: ${a}`);
  }
  return o;
}

function sh(cwd, cmd, args, input) {
  const r = spawnSync(cmd, args, { cwd, input, maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed: ${r.stderr?.toString()}`);
  return r.stdout;
}

const git = (cwd, ...args) => sh(cwd, 'git', ['-c', 'user.name=retro', '-c', 'user.email=retro@example.invalid', ...args]);

/** Unpack `git archive <treeish>` of `repo` into a fresh `dest`. */
function extractArchive(repo, treeish, dest) {
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  sh(dest, 'tar', ['-x', '-C', dest], git(repo, 'archive', treeish));
}

/** The project as it was at the case's commit, as its own git repo so the files the run adds can be listed. */
function prepareProject(repo, commit, dest) {
  extractArchive(repo, commit, dest);
  git(dest, 'init', '-q');
  git(dest, 'add', '-A');
  git(dest, 'commit', '-q', '-m', `project at ${commit}`);
}

function changedFiles(projectDir) {
  const out = git(projectDir, 'status', '--porcelain', '--untracked-files=all', '-z').toString('utf8');
  const files = [];
  for (const entry of out.split('\0').filter(Boolean)) {
    const status = entry.slice(0, 2);
    const path = entry.slice(3);
    if (status.includes('D') || status.startsWith('R')) continue;
    const full = join(projectDir, path);
    if (!existsSync(full) || statSync(full).size > 200_000) continue;
    files.push({ path, content: readFileSync(full, 'utf8') });
  }
  return files;
}

/**
 * Run one `claude -p` to the end. With `watch`, the first plugin-agent or browser tool call in the event
 * stream kills the session at once and is returned as `escalation`.
 */
function runClaude({ args, cwd, streamPath, timeoutMs, watch }) {
  return new Promise((resolvePromise) => {
    const child = spawn(CLAUDE, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    const out = createWriteStream(streamPath);
    let stderr = '';
    let pending = '';
    let escalation = null;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);
    child.stderr.on('data', (d) => { stderr += d; });
    child.stdout.on('data', (chunk) => {
      out.write(chunk);
      if (!watch || escalation) return;
      pending += chunk.toString('utf8');
      let nl;
      while ((nl = pending.indexOf('\n')) >= 0) {
        const hit = escalationOfEvent(parseEvent(pending.slice(0, nl)));
        pending = pending.slice(nl + 1);
        if (hit) {
          escalation = hit;
          child.kill('SIGKILL');
          return;
        }
      }
    });
    child.on('error', (e) => { stderr += String(e); });
    child.on('close', (status) => {
      clearTimeout(timer);
      out.end(() => resolvePromise({ status, stderr, escalation, timedOut }));
    });
  });
}

const usd = (n) => (n == null ? '?' : `$${n.toFixed(2)}`);

async function replay(opts) {
  const cases = loadCases(opts.casesRoot);
  const c = cases.find((x) => x.name === opts.case);
  if (!c) {
    console.error(`no case "${opts.case}"; cases: ${cases.map((x) => x.name).join(', ') || '(none)'}`);
    return 2;
  }
  const problems = validateCase(c);
  if (problems.length) {
    for (const p of problems) console.error(`${c.name}: ${p.field}: ${p.message}`);
    return 2;
  }
  if (c.size === 'large') {
    console.log(`要进夜间队列：${c.name}（标成大：${c.size_basis}）。这里不跑。`);
    return 3;
  }

  const repo = opts.repo ?? git(process.cwd(), 'rev-parse', '--show-toplevel').toString('utf8').trim();
  const est = estimateCostUsd(1);
  console.log(`${c.name}: 小用例，当场跑。预计花费约 ${usd(est.low)}–${usd(est.high)}（改前、改后各一次 claude -p，加一次判定；空跑一次约 $0.3–0.5，完整跑一个 skill 约 $1.5）`);

  const runId = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*$/, '');
  const runDir = join(opts.out, c.name, runId);
  rmSync(runDir, { recursive: true, force: true });
  mkdirSync(runDir, { recursive: true });
  console.log(`run dir: ${runDir}`);

  const afterPlugin = opts.afterPlugin ?? PLUGIN_ROOT;
  let beforePlugin = opts.beforePlugin;
  if (!beforePlugin) {
    const pluginRepo = git(PLUGIN_ROOT, 'rev-parse', '--show-toplevel').toString('utf8').trim();
    const prefix = git(PLUGIN_ROOT, 'rev-parse', '--show-prefix').toString('utf8').trim();
    beforePlugin = join(runDir, 'before-plugin');
    extractArchive(pluginRepo, `${opts.base}:${prefix}`.replace(/:$/, ''), beforePlugin);
  }

  const sides = [{ side: 'before', plugin: beforePlugin }, { side: 'after', plugin: afterPlugin }];
  const products = {};
  const costs = {};
  for (const s of sides) {
    const dir = join(runDir, s.side);
    const project = join(dir, 'project');
    mkdirSync(dir, { recursive: true });
    prepareProject(repo, c.commit, project);
    const args = ['-p', buildWorkerPrompt(c), '--plugin-dir', s.plugin, '--dangerously-skip-permissions', '--output-format', 'stream-json', '--verbose'];
    if (opts.model) args.push('--model', opts.model);
    const streamPath = join(dir, 'run.stream.jsonl');
    process.stdout.write(`— ${s.side}: ${s.plugin} …`);
    const r = await runClaude({ args, cwd: project, streamPath, timeoutMs: opts.timeoutMin * 60_000, watch: true });
    if (r.escalation) {
      console.log(` 中止：${r.escalation.kind === 'agent' ? '起了 agent' : '开了浏览器'}（${r.escalation.tool}）`);
      const file = join(opts.casesRoot, 'cases', c.name, 'case.json');
      writeFileSync(file, `${JSON.stringify(relabelLarge(c, r.escalation), null, 2)}\n`);
      writeFileSync(join(runDir, 'aborted.json'), JSON.stringify({ side: s.side, ...r.escalation }, null, 2));
      console.log(`要进夜间队列：${c.name} 原标成小，跑到一半发现不是；已把 ${file} 改标成大。`);
      return 3;
    }
    const digest = digestStream(fileLines(streamPath));
    if (r.stderr) writeFileSync(join(dir, 'run.stderr.log'), r.stderr);
    if (!digest.result) {
      console.log(` 没有产出 result（${r.timedOut ? '超时' : `退出码 ${r.status}`}），见 ${dir}`);
      return 5;
    }
    costs[s.side] = digest.result.cost;
    writeFileSync(join(dir, 'result.txt'), digest.result.text);
    writeFileSync(join(dir, 'digest.json'), JSON.stringify({ session: digest.session, subagents: digest.subagents, result: { ...digest.result, text: undefined } }, null, 2));
    products[s.side] = buildArtifact({ resultText: digest.result.text, files: changedFiles(project) });
    writeFileSync(join(dir, 'artifact.md'), products[s.side]);
    console.log(` 完成，${usd(digest.result.cost)}`);
  }

  const judgeDir = join(runDir, 'judge');
  mkdirSync(judgeDir, { recursive: true });
  const jArgs = ['-p', buildJudgePrompt(c, products.before, products.after), '--output-format', 'stream-json', '--verbose'];
  if (opts.model) jArgs.push('--model', opts.model);
  const jStream = join(judgeDir, 'run.stream.jsonl');
  process.stdout.write('— 判定 …');
  const j = await runClaude({ args: jArgs, cwd: judgeDir, streamPath: jStream, timeoutMs: opts.timeoutMin * 60_000, watch: false });
  const jDigest = digestStream(fileLines(jStream));
  if (!jDigest.result) {
    console.log(` 没有产出 result（退出码 ${j.status}），见 ${judgeDir}`);
    return 5;
  }
  costs.judge = jDigest.result.cost;
  console.log(` 完成，${usd(jDigest.result.cost)}`);
  writeFileSync(join(judgeDir, 'result.txt'), jDigest.result.text);

  const verdict = parseVerdict(jDigest.result.text);
  const verdicts = verdict && [{ side: 'before', ...verdict.A }, { side: 'after', ...verdict.B }];
  const judged = { before: verdict?.A.answer, after: verdict?.B.answer };
  const decision = decideOutcome(judged);
  const cost = Object.values(costs).reduce((a, b) => a + (b ?? 0), 0);
  const result = { case: c.name, runId, commit: c.commit, question: c.question, verdicts, judged, ...decision, costs, cost, settled: false };
  writeFileSync(join(runDir, 'result.json'), JSON.stringify(result, null, 2));
  return report(result, runDir, c.name, opts.casesRoot);
}

function report(result, runDir, name, casesRoot) {
  const label = { pass: '过', fail: '不过', 'case-missed': '用例没抓住问题', inconclusive: '没有结论' }[result.outcome];
  console.log(`\n${name}: ${label}（${result.outcome}）\n  ${result.reason}`);
  for (const v of result.verdicts ?? []) console.log(`  ${v.side === 'before' ? '改前' : '改后'}：${v.answer === 'yes' ? '是' : '否'}  出处：${v.cite}`);
  console.log(`  实际花费：${usd(result.cost)}（改前 ${usd(result.costs.before)}，改后 ${usd(result.costs.after)}，判定 ${usd(result.costs.judge)}）`);
  console.log(`  产物：${runDir}/{before,after}/artifact.md`);
  console.log(`  不同意判定？在 ${join(casesRoot, 'cases', name, 'annotations.md')} 里记一行「- 推翻 ${result.runId} 改前=是|否 ｜ 理由」，再跑 --settle ${name} --run ${runDir}`);
  return { pass: 0, fail: 1, 'case-missed': 1, inconclusive: 4 }[result.outcome];
}

function settle(opts) {
  const file = join(opts.run, 'result.json');
  if (!existsSync(file)) {
    console.error(`no result.json in ${opts.run}`);
    return 2;
  }
  const result = JSON.parse(readFileSync(file, 'utf8'));
  const notes = join(opts.casesRoot, 'cases', opts.settle, 'annotations.md');
  const overrides = existsSync(notes) ? parseOverrides(readFileSync(notes, 'utf8')) : {};
  const judged = settleVerdicts(result.judged, overrides, result.runId);
  const decision = decideOutcome(judged);
  const next = { ...result, judged, ...decision, settled: Boolean(overrides[result.runId]), overridden: overrides[result.runId] ?? null };
  writeFileSync(file, JSON.stringify(next, null, 2));
  return report(next, opts.run, opts.settle, opts.casesRoot);
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(e.message);
    return 2;
  }
  if (opts.list) {
    for (const c of loadCases(opts.casesRoot)) console.log(`${c.name}  [${c.size}]\n  ${c.prompt}\n  题：${c.question}\n`);
    const bad = checkCasesDir(opts.casesRoot);
    for (const p of bad) console.log(`格式问题 ${p.case}: ${p.field}: ${p.message}`);
    return 0;
  }
  if (opts.settle) return settle(opts);
  if (opts.case) return replay(opts);
  console.error('usage: retro-replay.mjs --list | --case <name> | --settle <name> --run <dir>');
  return 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
