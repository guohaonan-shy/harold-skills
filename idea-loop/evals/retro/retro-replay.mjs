#!/usr/bin/env node
/**
 * retro replay runner: did a rule change make the skill behave differently, on the input where it once went wrong?
 *
 * For one replay case (cases/<case>/case.json) it
 *   1. copies the project as it was at the case's commit into /tmp, twice (one copy per side);
 *   2. runs `claude -p` in each copy with the case's prompt, once with the PRE-change plugin (the base
 *      branch's idea-loop/) and once with the POST-change plugin (this working tree's idea-loop/);
 *   3. starts a judge that reads both products (anonymised as A and B, in a random order each time) and answers the
 *      case's yes/no question, quoting where in the product it found the answer; only the judge is told
 *      where the skill hands the thing to the human (the case's `stop_at`). The judge is Codex (a different model family
 *      from the two runs): the companion's `task`, read-only, with the prompt in a file. When no Codex is found the runner says
 *      so before it starts ("没找到 Codex，评委用 Claude") and judges with `claude -p` as before; a Codex judge that gives
 *      nothing also falls back to Claude. `result.json` records `judge` (`codex` / `claude`) and `afterIs` (the letter the
 *      post-change product had), which is how the answers are turned back into pre-change / post-change.
 *
 * Before the judge, the runner checks that the post-change run used the change: the change set is the files added or modified
 * under the plugin's `skills/` and `agents/` between the pre-change and the post-change plugin; the run used it when its event
 * stream (main session and sub-agents) reads one of them (a Read, or a Bash command naming its full path), calls a skill one of them
 * belongs to (Skill tool, or a prompt that starts with that skill's slash command), or starts an agent one of them defines (Agent
 * tool). Used: the judge's answer decides as before, and `result.json` records what was hit (`exercised`). Not used: the judge still
 * runs (its answers stay in the result for the human) but the outcome is `not-exercised` ("用例没测到改动"), exit 1, not a pass.
 * An empty change set (only scripts changed) is recorded as "不适用" and the judge decides.
 *
 * The input is only the human's words: the two runs get exactly the case's `prompt` (a case whose prompt says it is a
 * test is refused), and each runs in `<tmp dir>/<random>/<project name>`, a path with nothing about retro, replay, before
 * or after in it. The plugin it loads is copied to `<tmp dir>/<random>/<plugin dir name>` first (`--plugin-dir` points there,
 * so a skill's "Base directory" shows no such word either) and the copy is deleted when the run is over. What the runs leave behind (the project copy, event streams, products, results) is under the run dir,
 * where the agent does not look. No run is told where to stop: an agent that hands its work to the human ends its turn,
 * and the timeout is the backstop.
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
 * Only small cases run by `--case`. A case marked large is not run: the runner says how the orchestrator runs it once the PR
 * is open (`--run-large --pr <N>`) and exits 3.
 * A case marked small whose run starts an agent or opens a browser is stopped on the spot, relabelled large
 * in its case.json, and also exits 3.
 *
 * Large cases, run on the spot after the PR is open (the orchestrator of idea-loop:implement does it, in the background, and waits for it to exit):
 *
 *   node ~/.idea-loop/bin/retro-replay.mjs --run-large --pr <N> --worktree <dir> (--case <name> | --cases a,b) [--base main] [--timeout-min 45]
 *
 * It runs the named cases (large or small) one after the other, at any hour; nothing is stopped for starting an agent or
 * opening a browser and no case.json is relabelled; `--timeout-min` defaults to 45 here (20 everywhere else). `--pr` is
 * required: the result is appended to that PR's review loop file (`<worktree>/.tmp/review-loop/<N>.md`) as one `规则回放`
 * entry (the directory is `--worktree`, else `--repo`, else the repository root of the current directory) and the output
 * says which file. It sends no session message and no notification: whoever started it reads its output and the file.
 * Exit codes: 0 all passed · 1 some did not · 2 no `--pr`, no case, or a case that does not exist or is
 * malformed (no session is started) · 4 / 5 when a judge or a session gave nothing (5 wins over 4, 4 over 1).
 *
 * Exit codes of the other modes: 0 pass · 1 not a pass (the change did not fix it / the case missed the problem / the run did not use the change) ·
 *             2 bad arguments or a malformed case · 3 a large case, left to `--run-large` · 4 judge gave no usable answer ·
 *             5 a session produced no result.
 *
 * `RETRO_CLAUDE_BIN` replaces the `claude` command, `RETRO_CODEX_COMPANION` the Codex companion script (a path that does
 * not exist means "no Codex"; with `RETRO_CLAUDE_BIN` set and this one not, the runner does not look for a real Codex either: a stand-in
 * `claude` means a test, and the stand-in judges), and `RETRO_JUDGE_ORDER` (`after-first` / `before-first`) fixes the A/B order: the tests use these.
 */

import { cpSync, createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { randomBytes, randomInt } from 'node:crypto';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { digestStream, escalationOfEvent, fileLines, parseEvent } from '../../scripts/claude-stream.mjs';
import { findCompanion } from '../../scripts/codex-companion.mjs';
import { checkCasesDir, loadCases, revealingWordsIn, validateCase } from './cases.mjs';
import { appendReplayResults, describeExercised, reviewLoopPath, summarizeResults } from './queue.mjs';
import {
  applyExercised, buildArtifact, buildJudgePrompt, buildWorkerPrompt, decideOutcome, estimateCostUsd, exercisedBy, fileBody, parseOverrides, parseVerdict,
  productsInOrder, relabelLarge, settleVerdicts, verdictsBySide,
} from './replay.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(HERE, '..', '..');
const DEFAULT_OUT = '/tmp/idea-loop-retro';
const CLAUDE = process.env.RETRO_CLAUDE_BIN || 'claude';
/** The model and effort the Codex judge runs with: the same the pr-reviewer's Codex processes use. */
const CODEX_ARGS = ['--model', 'gpt-5.6-sol', '--effort', 'high'];
/** A session's timeout in minutes: 20 for a small case, 45 for `--run-large` (large cases take longer). */
const DEFAULT_TIMEOUT_MIN = 20;
const RUN_LARGE_TIMEOUT_MIN = 45;

function parseArgs(argv) {
  const o = {
    list: false, case: null, settle: null, run: null, base: null, repo: null, out: DEFAULT_OUT, model: null, timeoutMin: null,
    casesRoot: null, beforePlugin: null, afterPlugin: null, worktree: null, runLarge: false, pr: null, cases: null,
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
    else if (a === '--run-large') o.runLarge = true;
    else if (a === '--pr') o.pr = Number(val(++i));
    else if (a === '--cases') o.cases = val(++i).split(',').map((x) => x.trim()).filter(Boolean);
    else throw new Error(`unknown argument: ${a}`);
  }
  o.timeoutMin ??= o.runLarge ? RUN_LARGE_TIMEOUT_MIN : DEFAULT_TIMEOUT_MIN;
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

/**
 * What the project a run works in is called: the repository's own name (its `origin` remote, else its directory), or `project`
 * when there is none or the name would tell the run it is a test.
 */
export function projectName(repo) {
  const candidates = [];
  const r = spawnSync('git', ['remote', 'get-url', 'origin'], { cwd: repo, encoding: 'utf8' });
  if (r.status === 0) candidates.push(r.stdout.trim().replace(/\/+$/, '').replace(/\.git$/, '').split(/[/:]/).pop());
  candidates.push(basename(repo));
  return candidates.find(isPlainName) ?? 'project';
}

/** A name that does not tell a run it is being tested (nothing about retro, replay, before, after, eval and the like in it). */
const isPlainName = (n) => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(n ?? '') && !revealingWordsIn(n).length && !/retro|replay|before|after/i.test(n);

/** A fresh `<tmp dir>/<random>/<name>` for a run to work in; the random part keeps the two runs of a case apart. */
function workDirFor(name) {
  const dir = join(tmpdir(), randomBytes(8).toString('hex'), name);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * A copy of a plugin at `<tmp dir>/<random>/<plugin dir name>`, which is what a run is given as `--plugin-dir` and what a skill's
 * "Base directory" shows it. Both sides get the same dir name (the plugin's own, `project`-style fallback when it would give the
 * test away) under their own random dir, so nothing in the path says retro, replay, before, after or eval. `remove()` deletes the copy.
 */
function stagePlugin(src, afterPlugin) {
  const own = basename(afterPlugin);
  const dir = workDirFor(isPlainName(own) ? own : 'plugin');
  cpSync(src, dir, { recursive: true });
  return { dir, remove: () => rmSync(dirname(dir), { recursive: true, force: true }) };
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
    files.push({ path, content: fileBody(readFileSync(full)) });
  }
  return files;
}

/** Every file under `dir`, as paths relative to it with `/` (none when `dir` is not there); dot-files are skipped. */
function filesUnder(dir, prefix = '') {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    if (e.isDirectory()) out.push(...filesUnder(join(dir, e.name), `${prefix}${e.name}/`));
    else if (e.isFile()) out.push(`${prefix}${e.name}`);
  }
  return out.sort();
}

/** The name a plugin goes by in `<plugin>:<skill>`: its manifest's `name`, else `fallback`, else its directory's name. */
function pluginNameOf(dir, fallback) {
  try {
    const name = JSON.parse(readFileSync(join(dir, '.claude-plugin', 'plugin.json'), 'utf8')).name;
    if (typeof name === 'string' && name) return name;
  } catch {
    /* no manifest: named after its directory */
  }
  return fallback ?? basename(dir);
}

/**
 * What the change touched, for the exercised check: the files added or modified under `skills/` and `agents/` between the
 * pre-change plugin dir and the post-change one (a deleted file is not "used"), the skills those files belong to
 * (`<plugin>:<dir holding the nearest SKILL.md above the file>`) and the agents among them (`<plugin>:<file name without .md>`).
 * Sorted, so the result reads the same every time.
 */
export function changeSetOf(beforeDir, afterDir, pluginName) {
  const plugin = pluginNameOf(afterDir, pluginName);
  const files = ['skills', 'agents'].flatMap((top) => filesUnder(join(afterDir, top), `${top}/`)).filter((rel) => {
    const old = join(beforeDir, rel);
    return !existsSync(old) || !readFileSync(old).equals(readFileSync(join(afterDir, rel)));
  }).sort();
  const skills = new Set();
  const agents = new Set();
  for (const rel of files) {
    const parts = rel.split('/');
    if (parts[0] === 'agents' && parts.length === 2 && parts[1].endsWith('.md')) agents.add(`${plugin}:${parts[1].slice(0, -3)}`);
    if (parts[0] !== 'skills') continue;
    for (let n = parts.length - 1; n >= 2; n--) {
      if (existsSync(join(afterDir, ...parts.slice(0, n), 'SKILL.md'))) {
        skills.add(`${plugin}:${parts[n - 1]}`);
        break;
      }
    }
  }
  return { files, skills: [...skills].sort(), agents: [...agents].sort() };
}

/** The parsed events of a stream file, one at a time. */
function* eventsOf(path) {
  for (const line of fileLines(path)) {
    const ev = parseEvent(line);
    if (ev) yield ev;
  }
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

/**
 * The Codex companion script that can run the judge, or null. `RETRO_CODEX_COMPANION` replaces the search (the tests point it at
 * a fake, or at a path that does not exist); otherwise it is looked for the way pr-review does: from this plugin, then from the
 * plugins directory of the Claude config (an installed copy of the runner has no plugins directory above it).
 */
export function locateCodex() {
  const override = process.env.RETRO_CODEX_COMPANION;
  if (override !== undefined) return override && existsSync(override) ? override : null;
  if (process.env.RETRO_CLAUDE_BIN) return null; // a stand-in claude means a test: it must not reach the real Codex
  const starts = [PLUGIN_ROOT, join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), 'plugins')];
  for (const start of starts) {
    const { path } = findCompanion(start);
    if (path) return path;
  }
  return null;
}

/** The letter ("A" or "B") the post-change product gets this time: random, unless `RETRO_JUDGE_ORDER` fixes it (the tests do). */
function pickAfterLetter() {
  const fixed = { 'after-first': 'A', 'before-first': 'B' }[process.env.RETRO_JUDGE_ORDER ?? ''];
  return fixed ?? (randomInt(2) === 0 ? 'A' : 'B');
}

/**
 * The judging session on Codex: `task` with the prompt in a file, never `--write` (the companion's default is read-only).
 * Resolves `{text}` with what it printed, or `{text: null, why}` when it could not start, exited non-zero or printed nothing.
 */
function runCodexJudge({ companion, promptFile, cwd, outPath, timeoutMs }) {
  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, [companion, 'task', ...CODEX_ARGS, '--prompt-file', promptFile, '--cwd', cwd], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', (e) => { stderr += String(e); });
    child.on('close', (status) => {
      clearTimeout(timer);
      writeFileSync(outPath, stdout);
      if (stderr) writeFileSync(`${outPath}.stderr.log`, stderr);
      const why = timedOut ? '超时' : status !== 0 ? `退出码 ${status}` : !stdout.trim() ? '没有输出' : null;
      resolvePromise(why ? { text: null, why } : { text: stdout });
    });
  });
}

const usd = (n) => (n == null ? '?' : `$${n.toFixed(2)}`);

/**
 * Run one case's two sides and the judge, print what happened, and hand back `{code, result?, runDir, message?}`.
 * `runLarge`: `--run-large`. Nothing is stopped for starting an agent or opening a browser, so large cases run.
 */
async function executeReplay(opts, t, c, { runLarge = false } = {}) {
  const est = estimateCostUsd(1);
  const companion = locateCodex();
  console.log(`${c.name}: ${c.size === 'large' ? '大' : '小'}用例，当场跑。预计花费约 ${usd(est.low)}–${usd(est.high)}（改前、改后各一次 claude -p，加一次判定；空跑一次约 $0.3–0.5，完整跑一个 skill 约 $1.5；评委走 Codex 时判定不占 Claude 额度，估计仍按这个算）`);
  console.log(companion ? `评委：Codex（${companion}）` : '没找到 Codex，评委用 Claude');

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
  const change = changeSetOf(beforePlugin, afterPlugin);
  let exercised = null;
  const products = {};
  const costs = {};
  for (const s of sides) {
    const dir = join(runDir, s.side);
    const project = workDirFor(projectName(t.repo));
    const staged = stagePlugin(s.plugin, afterPlugin);
    try {
      mkdirSync(dir, { recursive: true });
      prepareProject(t.repo, c.commit, project);
      const args = ['-p', buildWorkerPrompt(c), '--plugin-dir', staged.dir, '--dangerously-skip-permissions', '--output-format', 'stream-json', '--verbose'];
      if (opts.model) args.push('--model', opts.model);
      const streamPath = join(dir, 'run.stream.jsonl');
      process.stdout.write(`— ${s.side}: ${s.plugin} …`);
      const r = await runClaude({ args, cwd: project, streamPath, timeoutMs: opts.timeoutMin * 60_000, watch: !runLarge });
      // the run is over: what it left is kept under the run dir for a human to look at (the work dir itself goes in `finally`)
      const keepProject = () => cpSync(project, join(dir, 'project'), { recursive: true });
      if (r.escalation) {
        keepProject();
        console.log(` 中止：${r.escalation.kind === 'agent' ? '起了 agent' : '开了浏览器'}（${r.escalation.tool}）`);
        const file = join(t.casesRoot, 'cases', c.name, 'case.json');
        writeFileSync(file, `${JSON.stringify(relabelLarge(c, r.escalation), null, 2)}\n`);
        writeFileSync(join(runDir, 'aborted.json'), JSON.stringify({ side: s.side, ...r.escalation }, null, 2));
        console.log(`大用例由编排者在 PR 开出后用 --run-large --pr <N> 跑：${c.name} 原标成小，跑到一半发现不是；已把 ${file} 改标成大。`);
        return { code: 3, runDir };
      }
      const digest = digestStream(fileLines(streamPath));
      if (r.stderr) writeFileSync(join(dir, 'run.stderr.log'), r.stderr);
      products[s.side] = digest.result ? buildArtifact({ resultText: digest.result.text, files: changedFiles(project) }) : null;
      keepProject();
      if (!digest.result) {
        const why = r.timedOut ? '超时' : `退出码 ${r.status}`;
        console.log(` 没有产出 result（${why}），见 ${dir}`);
        return { code: 5, runDir, message: `${s.side === 'before' ? '改前' : '改后'}那一遍没有产出 result（${why}），现场在 ${dir}` };
      }
      costs[s.side] = digest.result.cost;
      writeFileSync(join(dir, 'result.txt'), digest.result.text);
      writeFileSync(join(dir, 'digest.json'), JSON.stringify({ session: digest.session, subagents: digest.subagents, result: { ...digest.result, text: undefined } }, null, 2));
      writeFileSync(join(dir, 'artifact.md'), products[s.side]);
      console.log(` 完成，${usd(digest.result.cost)}`);
      if (s.side === 'after') {
        // before the judge: did this run use what the change touched? (the paths in its stream are the staged copy's)
        const roots = [...new Set([staged.dir, realpathSync(staged.dir)])];
        exercised = exercisedBy(eventsOf(streamPath), change, { roots, prompt: buildWorkerPrompt(c) });
        console.log(`改动核对：${describeExercised(exercised)}`);
      }
    } finally {
      // the plugin copy and the work dir are only for the run: nothing of them stays in the temp dir
      staged.remove();
      rmSync(dirname(project), { recursive: true, force: true });
    }
  }

  const judgeDir = join(runDir, 'judge');
  mkdirSync(judgeDir, { recursive: true });
  // the products are lettered A and B in a random order, so the judge learns nothing from the position; `afterIs` turns the answers back
  const afterIs = pickAfterLetter();
  const { A, B } = productsInOrder(products, afterIs);
  const judgePrompt = buildJudgePrompt(c, A, B);
  let judge = companion ? 'codex' : 'claude';
  let judgeText = null;
  if (judge === 'codex') {
    const promptFile = join(judgeDir, 'prompt.md');
    writeFileSync(promptFile, judgePrompt);
    process.stdout.write('— 判定（Codex）…');
    const cx = await runCodexJudge({ companion, promptFile, cwd: judgeDir, outPath: join(judgeDir, 'codex.stdout.txt'), timeoutMs: opts.timeoutMin * 60_000 });
    if (cx.text) {
      judgeText = cx.text;
      console.log(' 完成（不占 Claude 额度）');
    } else {
      console.log(` Codex 没给出判定（${cx.why}），评委退回 Claude`);
      judge = 'claude';
    }
  }
  if (judge === 'claude') {
    const jArgs = ['-p', judgePrompt, '--output-format', 'stream-json', '--verbose'];
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
    judgeText = jDigest.result.text;
  }
  writeFileSync(join(judgeDir, 'result.txt'), judgeText);

  const verdict = parseVerdict(judgeText);
  const verdicts = verdictsBySide(verdict, afterIs);
  const judged = { before: verdicts?.[0].answer, after: verdicts?.[1].answer };
  const decision = applyExercised(decideOutcome(judged), exercised);
  const cost = Object.values(costs).reduce((a, b) => a + (b ?? 0), 0);
  const result = { case: c.name, runId, commit: c.commit, question: c.question, judge, afterIs, verdicts, judged, exercised, ...decision, costs, cost, settled: false };
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
    console.log(`${c.name} 标成大（${c.size_basis}），这里不跑。大用例由编排者在 PR 开出后用 --run-large --pr <N> 跑。`);
    return 3;
  }
  const repo = t.repo ?? git(process.cwd(), 'rev-parse', '--show-toplevel').toString('utf8').trim();
  return (await executeReplay(opts, { ...t, repo }, c)).code;
}

function report(result, runDir, name, casesRoot) {
  const label = { pass: '过', fail: '不过', 'case-missed': '用例没抓住问题', inconclusive: '没有结论', 'not-exercised': '用例没测到改动' }[result.outcome];
  console.log(`\n${name}: ${label}（${result.outcome}）\n  ${result.reason}`);
  if (result.judge) console.log(`  评委：${result.judge === 'codex' ? 'Codex' : 'Claude'}`);
  if (result.exercised) console.log(`  改动核对：${describeExercised(result.exercised)}`);
  for (const v of result.verdicts ?? []) console.log(`  ${v.side === 'before' ? '改前' : '改后'}：${v.answer === 'yes' ? '是' : '否'}  出处：${v.cite}`);
  const judgeCost = result.judge === 'codex' ? 'Codex，不占 Claude 额度' : usd(result.costs.judge);
  console.log(`  实际花费：${usd(result.cost)}（改前 ${usd(result.costs.before)}，改后 ${usd(result.costs.after)}，判定 ${judgeCost}）`);
  console.log(`  产物：${runDir}/{before,after}/artifact.md`);
  console.log(`  不同意判定？在 ${join(casesRoot, 'cases', name, 'annotations.md')} 里记一行「- 推翻 ${result.runId} 改前=是|否 ｜ 理由」，再跑 --settle ${name} --run ${runDir}`);
  return { pass: 0, fail: 1, 'case-missed': 1, 'not-exercised': 1, inconclusive: 4 }[result.outcome];
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
  const decision = applyExercised(decideOutcome(judged), result.exercised);
  const next = { ...result, judged, ...decision, settled: Boolean(overrides[result.runId]), overridden: overrides[result.runId] ?? null };
  writeFileSync(file, JSON.stringify(next, null, 2));
  return report(next, opts.run, opts.settle, t.casesRoot);
}

// ---------- --run-large ----------

/**
 * One named case, run for `--run-large` (nothing is stopped for starting an agent or opening a browser). Always ends in a
 * result record, never throws.
 */
async function replayLarge(t, name, opts) {
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
    const r = await executeReplay(opts, t, c, { runLarge: true });
    if (r.result) {
      return { case: name, outcome: r.result.outcome, reason: r.result.reason, judge: r.result.judge, exercised: r.result.exercised, verdicts: r.result.verdicts ?? undefined, cost: r.result.cost, runDir: r.runDir };
    }
    return { case: name, outcome: 'no-result', reason: r.message ?? '没有产出结果', runDir: r.runDir };
  } catch (e) {
    return { case: name, outcome: 'no-result', reason: `跑的时候出错：${e.message}` };
  }
}

/** Append one `规则回放` entry for a PR to its review loop file, creating the file when it is not there yet. Returns the entry's round. */
function writeReplayEntry({ worktree, pr, ranAt, results }) {
  const loopFile = reviewLoopPath(worktree, pr);
  const { text, round } = appendReplayResults(existsSync(loopFile) ? readFileSync(loopFile, 'utf8') : '', { pr, ranAt, results });
  mkdirSync(dirname(loopFile), { recursive: true });
  writeFileSync(loopFile, text);
  return round;
}

/**
 * `--run-large`: the named cases (large or small) run one after the other, at any hour; the result goes into the PR's review
 * loop file as one `规则回放` entry. Nothing is sent anywhere: the session that called the runner reads this output and the file.
 */
async function runLarge(opts, t) {
  const bad = (m) => {
    console.error(m);
    return 2;
  };
  if (!Number.isSafeInteger(opts.pr) || opts.pr < 1) return bad('--run-large 必带 --pr <PR 号>：结果要写进这个 PR 的 review loop 文件，没有 PR 号写不进去');
  const names = [...new Set([...(opts.case ? [opts.case] : []), ...(opts.cases ?? [])])];
  if (!names.length) return bad('--run-large 要用 --case <名字> 或 --cases a,b 说明跑哪些用例');
  let known;
  let repo = t.repo;
  try {
    known = new Map(loadCases(t.casesRoot).map((c) => [c.name, c]));
    repo ??= git(process.cwd(), 'rev-parse', '--show-toplevel').toString('utf8').trim();
  } catch (e) {
    return bad(e.message);
  }
  // every case is checked before any session starts
  const found = [];
  for (const name of names) {
    const c = known.get(name);
    if (!c) return bad(`no case "${name}"; cases: ${[...known.keys()].join(', ') || '(none)'}`);
    const problems = validateCase(c);
    if (problems.length) return bad(problems.map((p) => `${name}: ${p.field}: ${p.message}`).join('\n'));
    found.push(c);
  }
  const worktree = opts.worktree ?? opts.repo ?? repo;
  const est = estimateCostUsd(names.length);
  console.log(`--run-large：${names.length} 个用例（${names.join('、')}），大的也跑，起 agent、开浏览器都不中止。每个用例改前、改后、判定各一个会话，每个会话超时 ${opts.timeoutMin} 分钟，一个用例最长约 3×${opts.timeoutMin} 分钟；预计花费约 ${usd(est.low)}–${usd(est.high)}（起 agent 的会比这高；评委走 Codex 时判定不占 Claude 额度，估计仍按这个算）。`);

  const results = [];
  for (const c of found) results.push(await replayLarge({ ...t, repo }, c.name, { ...opts, base: opts.base ?? 'main' }));

  const loopFile = reviewLoopPath(worktree, opts.pr);
  let round;
  try {
    round = writeReplayEntry({ worktree, pr: opts.pr, ranAt: new Date(), results });
  } catch (e) {
    console.error(`结果没能写进 ${loopFile}：${e.message}`);
    return 1;
  }
  console.log(`\n结果写进 ${loopFile}（规则回放第 ${round} 次）`);
  const s = summarizeResults(results);
  console.log(`${s.passed}/${s.total} 个用例过，花费 ${usd(s.cost)}`);
  if (s.allPassed) return 0;
  if (results.some((r) => r.outcome === 'no-result')) return 5;
  if (results.some((r) => r.outcome === 'inconclusive')) return 4;
  return 1;
}

export async function main(argv = process.argv.slice(2)) {
  let opts;
  let t;
  try {
    opts = parseArgs(argv);
    t = resolveTargets(opts, { needPlugin: Boolean(opts.case) || opts.runLarge });
  } catch (e) {
    console.error(e.message);
    return 2;
  }
  if (opts.runLarge && (opts.settle || opts.list)) {
    console.error('--run-large 不跟 --list、--settle 一起用');
    return 2;
  }
  if (opts.list) {
    for (const c of loadCases(t.casesRoot)) console.log(`${c.name}  [${c.size}]\n  ${c.prompt}\n  题：${c.question}\n`);
    const bad = checkCasesDir(t.casesRoot);
    for (const p of bad) console.log(`格式问题 ${p.case}: ${p.field}: ${p.message}`);
    return 0;
  }
  if (opts.runLarge) return runLarge(opts, t);
  if (opts.settle) return settle(opts, t);
  if (opts.case) return replay(opts, t);
  console.error('usage: retro-replay.mjs --list | --case <name> | --settle <name> --run <dir> | --run-large --pr <N> (--case <name> | --cases a,b)');
  return 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
