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
 * Where the plugin under test and the cases are: `--worktree <dir>` says "this worktree" and stands for
 * `--repo <dir> --after-plugin <dir>/idea-loop --cases-root <dir>/idea-loop/evals/retro`; each can still be given
 * on its own. Run from the plugin's own copy, with none of them given, it tests that copy. Run from the installed
 * copy (`~/.idea-loop/bin/`, see scripts/retro-install.mjs) it has no copy of its own to test and asks for one.
 *
 * Only small cases run by `--case`. A case marked large is not run: the runner says "要进夜间队列" and exits 3.
 * A case marked small whose run starts an agent or opens a browser is stopped on the spot, relabelled large
 * in its case.json, and also exits 3.
 *
 * The nightly queue (`~/.idea-loop/replay-queue/`, one file per PR waiting for its replays; format in queue.mjs):
 *
 *   node ~/.idea-loop/bin/retro-replay.mjs --enqueue --slug <owner/name> --pr <N> --worktree <dir> --cases a,b [--base main]
 *   node ~/.idea-loop/bin/retro-replay.mjs --queue
 *
 * `--queue` checks the machine's clock first: outside 00:00–07:00 it starts nothing and leaves the queue as it is;
 * with an empty queue it exits at once. Otherwise each PR's cases are run the way `--case` runs them (large ones
 * too, nothing is stopped for starting an agent), the result is appended to that PR's review loop file
 * (`<worktree>/.tmp/review-loop/<PR>.md`), a push is sent, and the PR's queue file is deleted. A case that did not
 * pass is not rerun: the result is the human's to rule on. When the clock passes 07:00 in the middle of the queue
 * the PRs not yet started stay queued. `--queue-dir` and `--now <local time>` exist for the tests.
 *
 * Exit codes: 0 pass (queue: ran, or had nothing to do) · 1 not a pass (the change did not fix it / the case missed
 *             the problem; queue: some queue file was not a valid entry and was left in place) ·
 *             2 bad arguments or a malformed case · 3 needs the nightly queue · 4 judge gave no usable answer ·
 *             5 a session produced no result.
 *
 * `RETRO_CLAUDE_BIN` replaces the `claude` command, `RETRO_NOTIFY_BIN` the push command (the tests use fakes).
 */

import { createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { digestStream, escalationOfEvent, fileLines, parseEvent } from '../../scripts/claude-stream.mjs';
import { checkCasesDir, loadCases, validateCase } from './cases.mjs';
import {
  appendReplayResults, decideQueueRun, makeQueueEntry, pushMessage, queueFileName, reviewLoopPath, summarizeResults, validateQueueEntry,
} from './queue.mjs';
import {
  buildArtifact, buildJudgePrompt, buildWorkerPrompt, decideOutcome, estimateCostUsd, parseOverrides, parseVerdict,
  relabelLarge, settleVerdicts,
} from './replay.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(HERE, '..', '..');
const DEFAULT_OUT = '/tmp/idea-loop-retro';
const DEFAULT_QUEUE_DIR = join(homedir(), '.idea-loop', 'replay-queue');
const CLAUDE = process.env.RETRO_CLAUDE_BIN || 'claude';

function parseArgs(argv) {
  const o = {
    list: false, case: null, settle: null, run: null, base: null, repo: null, out: DEFAULT_OUT, model: null, timeoutMin: 20,
    casesRoot: null, beforePlugin: null, afterPlugin: null, worktree: null,
    queue: false, enqueue: false, queueDir: DEFAULT_QUEUE_DIR, now: null, slug: null, pr: null, cases: null,
  };
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
    else if (a === '--worktree') o.worktree = resolve(val(++i));
    else if (a === '--queue') o.queue = true;
    else if (a === '--enqueue') o.enqueue = true;
    else if (a === '--queue-dir') o.queueDir = resolve(val(++i));
    else if (a === '--now') {
      o.now = new Date(val(++i));
      if (Number.isNaN(o.now.getTime())) throw new Error('--now needs a local time such as 2026-10-23T01:07:00');
    } else if (a === '--slug') o.slug = val(++i);
    else if (a === '--pr') o.pr = Number(val(++i));
    else if (a === '--cases') o.cases = val(++i).split(',').map((x) => x.trim()).filter(Boolean);
    else throw new Error(`unknown argument: ${a}`);
  }
  return o;
}

/**
 * Where the repo to copy the project from, the plugin under test and the cases are. `--worktree` fills in whatever was
 * not given on its own; with neither, the runner's own copy is the one under test, if it has one.
 */
function resolveTargets(o, { needPlugin = true, needCases = true } = {}) {
  const t = { repo: o.repo, afterPlugin: o.afterPlugin, casesRoot: o.casesRoot };
  if (o.worktree) {
    t.repo ??= o.worktree;
    t.afterPlugin ??= join(o.worktree, 'idea-loop');
    t.casesRoot ??= join(o.worktree, 'idea-loop', 'evals', 'retro');
  }
  if (!t.afterPlugin && needPlugin) {
    if (!existsSync(join(PLUGIN_ROOT, '.claude-plugin'))) throw new Error('这份 runner 是装在固定位置的拷贝，没有自己的插件可测：用 --worktree <dir>（或 --after-plugin 加 --cases-root）指明要测的那份');
    t.afterPlugin = PLUGIN_ROOT;
  }
  if (!t.casesRoot && needCases) {
    if (!existsSync(join(HERE, 'cases'))) throw new Error('这份 runner 旁边没有 cases/：用 --worktree <dir>（或 --cases-root）指明用例在哪');
    t.casesRoot = HERE;
  }
  return t;
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

/**
 * Run one case's two sides and the judge, print what happened, and hand back `{code, result?, runDir, message?}`.
 * `queue`: a night run. Nothing is stopped for starting an agent or opening a browser, so large cases run.
 */
async function executeReplay(opts, t, c, { queue = false } = {}) {
  const est = estimateCostUsd(1);
  console.log(`${c.name}: 小用例，当场跑。预计花费约 ${usd(est.low)}–${usd(est.high)}（改前、改后各一次 claude -p，加一次判定；空跑一次约 $0.3–0.5，完整跑一个 skill 约 $1.5）`);

  const runId = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*$/, '');
  const runDir = join(opts.out, c.name, runId);
  rmSync(runDir, { recursive: true, force: true });
  mkdirSync(runDir, { recursive: true });
  console.log(`run dir: ${runDir}`);

  const afterPlugin = t.afterPlugin;
  let beforePlugin = opts.beforePlugin;
  if (!beforePlugin) {
    const pluginRepo = git(afterPlugin, 'rev-parse', '--show-toplevel').toString('utf8').trim();
    const prefix = git(afterPlugin, 'rev-parse', '--show-prefix').toString('utf8').trim();
    beforePlugin = join(runDir, 'before-plugin');
    extractArchive(pluginRepo, `${opts.base ?? 'main'}:${prefix}`.replace(/:$/, ''), beforePlugin);
  }

  const sides = [{ side: 'before', plugin: beforePlugin }, { side: 'after', plugin: afterPlugin }];
  const products = {};
  const costs = {};
  for (const s of sides) {
    const dir = join(runDir, s.side);
    const project = join(dir, 'project');
    mkdirSync(dir, { recursive: true });
    prepareProject(t.repo, c.commit, project);
    const args = ['-p', buildWorkerPrompt(c), '--plugin-dir', s.plugin, '--dangerously-skip-permissions', '--output-format', 'stream-json', '--verbose'];
    if (opts.model) args.push('--model', opts.model);
    const streamPath = join(dir, 'run.stream.jsonl');
    process.stdout.write(`— ${s.side}: ${s.plugin} …`);
    const r = await runClaude({ args, cwd: project, streamPath, timeoutMs: opts.timeoutMin * 60_000, watch: !queue });
    if (r.escalation) {
      console.log(` 中止：${r.escalation.kind === 'agent' ? '起了 agent' : '开了浏览器'}（${r.escalation.tool}）`);
      const file = join(t.casesRoot, 'cases', c.name, 'case.json');
      writeFileSync(file, `${JSON.stringify(relabelLarge(c, r.escalation), null, 2)}\n`);
      writeFileSync(join(runDir, 'aborted.json'), JSON.stringify({ side: s.side, ...r.escalation }, null, 2));
      console.log(`要进夜间队列：${c.name} 原标成小，跑到一半发现不是；已把 ${file} 改标成大。`);
      return { code: 3, runDir };
    }
    const digest = digestStream(fileLines(streamPath));
    if (r.stderr) writeFileSync(join(dir, 'run.stderr.log'), r.stderr);
    if (!digest.result) {
      const why = r.timedOut ? '超时' : `退出码 ${r.status}`;
      console.log(` 没有产出 result（${why}），见 ${dir}`);
      return { code: 5, runDir, message: `${s.side === 'before' ? '改前' : '改后'}那一遍没有产出 result（${why}），现场在 ${dir}` };
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
    return { code: 5, runDir, message: `判定会话没有产出 result（退出码 ${j.status}），现场在 ${judgeDir}` };
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
  return { code: report(result, runDir, c.name, t.casesRoot), result, runDir };
}


async function replay(opts, t) {
  const cases = loadCases(t.casesRoot);
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
  const repo = t.repo ?? git(process.cwd(), 'rev-parse', '--show-toplevel').toString('utf8').trim();
  return (await executeReplay(opts, { ...t, repo }, c)).code;
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

function settle(opts, t) {
  const file = join(opts.run, 'result.json');
  if (!existsSync(file)) {
    console.error(`no result.json in ${opts.run}`);
    return 2;
  }
  const result = JSON.parse(readFileSync(file, 'utf8'));
  const notes = join(t.casesRoot, 'cases', opts.settle, 'annotations.md');
  const overrides = existsSync(notes) ? parseOverrides(readFileSync(notes, 'utf8')) : {};
  const judged = settleVerdicts(result.judged, overrides, result.runId);
  const decision = decideOutcome(judged);
  const next = { ...result, judged, ...decision, settled: Boolean(overrides[result.runId]), overridden: overrides[result.runId] ?? null };
  writeFileSync(file, JSON.stringify(next, null, 2));
  return report(next, opts.run, opts.settle, t.casesRoot);
}

// ---------- the nightly queue ----------

/** A push to the human. `RETRO_NOTIFY_BIN` replaces the command (it gets the message as its one argument); by default a macOS notification. */
function notify(message) {
  console.log(`推送：${message}`);
  const bin = process.env.RETRO_NOTIFY_BIN;
  const r = bin
    ? spawnSync(bin, [message], { stdio: 'ignore' })
    : process.platform === 'darwin'
      ? spawnSync('osascript', ['-e', 'on run argv', '-e', 'display notification (item 1 of argv) with title "idea-loop 规则回放"', '-e', 'end run', message], { stdio: 'ignore' })
      : null;
  if (r && (r.error || r.status !== 0)) console.error('（推送没发出去，结果仍然写进了 review loop 文件）');
}

/** One queued case of one PR, run as a night run. Always ends in a result record, never throws. */
async function replayForQueue(entry, name, opts) {
  const t = { repo: entry.worktree, afterPlugin: join(entry.worktree, 'idea-loop'), casesRoot: join(entry.worktree, 'idea-loop', 'evals', 'retro') };
  let c;
  try {
    c = loadCases(t.casesRoot).find((x) => x.name === name);
  } catch (e) {
    return { case: name, outcome: 'bad-case', reason: `读不了用例：${e.message}` };
  }
  if (!c) return { case: name, outcome: 'bad-case', reason: `${t.casesRoot}/cases/ 下没有用例 ${name}` };
  const problems = validateCase(c);
  if (problems.length) return { case: name, outcome: 'bad-case', reason: `用例格式不对：${problems.map((p) => `${p.field}: ${p.message}`).join('；')}` };
  try {
    const r = await executeReplay({ ...opts, base: entry.base ?? 'main', beforePlugin: null }, t, c, { queue: true });
    if (r.result) {
      return { case: name, outcome: r.result.outcome, reason: r.result.reason, verdicts: r.result.verdicts ?? undefined, cost: r.result.cost, runDir: r.runDir };
    }
    return { case: name, outcome: 'no-result', reason: r.message ?? '没有产出结果', runDir: r.runDir };
  } catch (e) {
    return { case: name, outcome: 'no-result', reason: `跑的时候出错：${e.message}` };
  }
}

async function runQueue(opts) {
  const start = opts.now ?? new Date();
  const t0 = Date.now();
  const clockNow = () => new Date(start.getTime() + (Date.now() - t0));
  const files = existsSync(opts.queueDir) ? readdirSync(opts.queueDir) : [];
  const first = decideQueueRun({ now: clockNow(), files });
  console.log(first.reason);
  if (first.action !== 'run') return 0;

  let skipped = 0;
  for (let i = 0; i < first.files.length; i++) {
    const file = first.files[i];
    const gate = decideQueueRun({ now: clockNow(), files: [file] });
    if (gate.action === 'wait') {
      console.log(`${gate.reason}；还没开始的 ${first.files.length - i} 个 PR 留在队列里：${first.files.slice(i).join('、')}`);
      break;
    }
    const path = join(opts.queueDir, file);
    let entry;
    try {
      entry = JSON.parse(readFileSync(path, 'utf8'));
    } catch (e) {
      console.error(`${file}: 不是合法的 JSON，跳过，留在队列里（${e.message}）`);
      skipped++;
      continue;
    }
    const problems = validateQueueEntry(entry);
    if (problems.length) {
      console.error(`${file}: 不是合法的队列条目，跳过，留在队列里：${problems.map((p) => `${p.field}: ${p.message}`).join('；')}`);
      skipped++;
      continue;
    }

    console.log(`\n== ${entry.repo} #${entry.pr}：${entry.cases.length} 个用例 ==`);
    const results = [];
    for (const name of entry.cases) results.push(await replayForQueue(entry, name, opts));

    const loopFile = reviewLoopPath(entry.worktree, entry.pr);
    try {
      const { text, round } = appendReplayResults(existsSync(loopFile) ? readFileSync(loopFile, 'utf8') : '', { pr: entry.pr, ranAt: clockNow(), results });
      mkdirSync(dirname(loopFile), { recursive: true });
      writeFileSync(loopFile, text);
      console.log(`结果写进 ${loopFile}（规则回放第 ${round} 次）`);
    } catch (e) {
      console.error(`${file}: 结果没能写进 ${loopFile}（${e.message}），留在队列里，等下一晚`);
      skipped++;
      continue;
    }
    unlinkSync(path);
    const s = summarizeResults(results);
    console.log(`${entry.repo} #${entry.pr}：${s.passed}/${s.total} 过，已从队列删掉`);
    notify(pushMessage({ repo: entry.repo, pr: entry.pr, results }));
  }
  return skipped ? 1 : 0;
}

/** Put a PR's cases into the queue (or add them to the file the PR already has). */
function enqueue(opts) {
  const bad = (m) => {
    console.error(m);
    return 2;
  };
  if (!opts.slug || !/^[\w.-]+\/[\w.-]+$/.test(opts.slug)) return bad('--slug 要写成 owner/name');
  if (!Number.isSafeInteger(opts.pr) || opts.pr < 1) return bad('--pr 要是 PR 号');
  if (!opts.worktree) return bad('--worktree 要指向这个 PR 的 worktree');
  if (!opts.cases?.length) return bad('--cases 要列出用例名（逗号分隔）');
  const t = resolveTargets(opts, { needPlugin: false });
  const known = new Map(loadCases(t.casesRoot).map((c) => [c.name, c]));
  for (const name of opts.cases) {
    const c = known.get(name);
    if (!c) return bad(`${t.casesRoot}/cases/ 下没有用例 ${name}`);
    const problems = validateCase(c);
    if (problems.length) return bad(`${name}: ${problems.map((p) => `${p.field}: ${p.message}`).join('；')}`);
  }
  const base = git(opts.worktree, 'merge-base', opts.base ?? 'main', 'HEAD').toString('utf8').trim();
  const file = join(opts.queueDir, queueFileName({ repo: opts.slug, pr: opts.pr }));
  const existing = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : undefined;
  const entry = makeQueueEntry({ repo: opts.slug, pr: opts.pr, worktree: opts.worktree, cases: opts.cases, base, queuedAt: new Date().toISOString(), existing });
  mkdirSync(opts.queueDir, { recursive: true });
  writeFileSync(file, `${JSON.stringify(entry, null, 2)}\n`);
  console.log(`回放在队列里：${file}\n  用例：${entry.cases.join('、')}；每晚 00:00–07:00 之间由夜间任务跑，结果写进 ${reviewLoopPath(entry.worktree, entry.pr)}`);
  return 0;
}

export async function main(argv = process.argv.slice(2)) {
  let opts;
  let t;
  try {
    opts = parseArgs(argv);
    t = resolveTargets(opts, { needPlugin: Boolean(opts.case), needCases: !opts.queue });
  } catch (e) {
    console.error(e.message);
    return 2;
  }
  if (opts.list) {
    for (const c of loadCases(t.casesRoot)) console.log(`${c.name}  [${c.size}]\n  ${c.prompt}\n  题：${c.question}\n`);
    const bad = checkCasesDir(t.casesRoot);
    for (const p of bad) console.log(`格式问题 ${p.case}: ${p.field}: ${p.message}`);
    return 0;
  }
  if (opts.queue) return runQueue(opts);
  if (opts.enqueue) return enqueue(opts);
  if (opts.settle) return settle(opts, t);
  if (opts.case) return replay(opts, t);
  console.error('usage: retro-replay.mjs --list | --case <name> | --settle <name> --run <dir> | --enqueue … | --queue');
  return 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
