#!/usr/bin/env node
/**
 * baseline runner —— 把 `evals.json` 里那几格真的跑一遍，然后用 `assert.mjs` 判形状。
 *
 * 每一格都从 `case/project` 的**一份干净副本**起步，按 `seed` 补上这一格该有的起始状态，
 * 然后在那个副本里跑一次 `claude -p`。跑完的项目目录整个留着——断言只判形状，
 * 内容好不好要人自己去看那些产物，那是这一层不该替他做的判断。
 *
 * **`--plugin-dir` 指向工作树里的 `idea-loop/`，不是装好的那份。** 这不是细节：
 * 装好的那份是上一次发布的版本，对着它跑出来的分数说明不了这次改动是好是坏。
 *
 * 用法：
 *   node idea-loop/evals/run-baseline.mjs                     # 全跑
 *   node idea-loop/evals/run-baseline.mjs --only refine-freeze
 *   node idea-loop/evals/run-baseline.mjs --out <dir> --grade-only   # 不重跑，只重判
 *   node idea-loop/evals/run-baseline.mjs --archive idea-loop/evals/baseline
 */

import { closeSync, cpSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { grade, walk } from './assert.mjs';
import { digestStream, loadSession } from './session.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(HERE, '..');
const REPO_ROOT = resolve(PLUGIN_ROOT, '..');
const CASE = join(HERE, 'case');

/** seed 名 → 从 stages/ 的哪里搬到项目的哪里。加一格起始状态就在这里加一行。 */
const SEEDS = {
  raw: ['stages/raw', 'docs/raw'],
  'raw-index': ['stages/raw-index.md', 'docs/raw/index.md'],
  'spec-index': ['stages/spec-index.md', 'docs/spec/index.md'],
  'spec-awaiting-freeze': ['stages/spec-awaiting-freeze.md', 'docs/spec/practice-history-surface/practice-history-surface.md'],
  // 方向说明是发散交给收敛的中间产物，住在项目根的 .tmp/ 而不在 spec 里（wiki-conventions §2.1）。
  'direction-note': ['stages/direction-note.md', '.tmp/uiux-imagine/practice-history-surface/direction-note.md'],
  // 交接画布是 imagine 交给 refine 的另一半准出，住在同一个工作目录的 handoff/ 里。
  handoff: ['stages/handoff', '.tmp/uiux-imagine/practice-history-surface/handoff'],
  // 「uiux-imaginer 直跑」那一格的起始状态：前两轮留下的变种板与每轮记录，整个搬进工作目录。
  'imagine-resume': ['stages/imaginer-resume', '.tmp/uiux-imagine/practice-history-surface'],
};

function parseArgs(argv) {
  // 120 分钟是按最慢那一格定的：`refine-freeze` 要跑完整条评委环、五格矩阵截图、减法与 AI tells 两轮。
  // 其余每一格都在 5–10 分钟量级。拿 45 分钟跑它，只会在第六轮评委那里被墙钟砍断。
  const out = { only: null, out: null, gradeOnly: false, archive: null, timeoutMin: 120, model: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--only') out.only = argv[++i].split(',').map((s) => s.trim());
    else if (a === '--out') out.out = resolve(argv[++i]);
    else if (a === '--grade-only') out.gradeOnly = true;
    else if (a === '--archive') out.archive = resolve(argv[++i]);
    else if (a === '--timeout-min') out.timeoutMin = Number(argv[++i]);
    else if (a === '--model') out.model = argv[++i];
    else throw new Error(`不认识的参数：${a}`);
  }
  return out;
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function buildProject(evalDef, projectDir) {
  rmSync(projectDir, { recursive: true, force: true });
  cpSync(join(CASE, 'project'), projectDir, { recursive: true });
  for (const seed of evalDef.seed ?? []) {
    const mapping = SEEDS[seed];
    if (!mapping) throw new Error(`evals.json 里的 seed「${seed}」在 run-baseline.mjs 的 SEEDS 表里没有`);
    const [from, to] = mapping;
    const target = join(projectDir, to);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(join(CASE, from), target, { recursive: true });
  }
  for (const f of evalDef.files ?? []) cpSync(join(CASE, 'stages', f), join(projectDir, f));
}

function runClaude(evalDef, projectDir, runDir, opts) {
  // stream-json 而不是 json：断言要读「调用会话自己做了什么」（会话只编排、不写变种板），
  // 只有事件流里每条消息带 parent_tool_use_id，分得出会话与子代理。--verbose 是 stream-json 的前提。
  const args = [
    '-p', evalDef.prompt,
    '--plugin-dir', PLUGIN_ROOT,
    '--dangerously-skip-permissions',
    '--output-format', 'stream-json',
    '--verbose',
  ];
  if (opts.model) args.push('--model', opts.model);

  const streamPath = join(runDir, 'run.stream.jsonl');
  // 流里有截图的 base64，一跑几百兆：让 claude 直接写文件，不经过 spawnSync 的内存缓冲。
  const out = openSync(streamPath, 'w');
  const started = Date.now();
  let r;
  try {
    r = spawnSync('claude', args, {
      cwd: projectDir,
      encoding: 'utf8',
      timeout: opts.timeoutMin * 60_000,
      stdio: ['ignore', out, 'pipe'],
    });
  } finally {
    closeSync(out);
  }
  const elapsedSec = Math.round((Date.now() - started) / 1000);

  if (r.stderr) writeFileSync(join(runDir, 'run.stderr.log'), r.stderr);

  let usage = null;
  try {
    const session = digestStream(streamPath);
    writeFileSync(join(runDir, 'session.json'), JSON.stringify(session));
    const parsed = session.result;
    if (parsed) {
      // agent 定义里写的是别名（opus / fable），解析到哪个模型取决于跑的那份 Claude Code。
      // 把这一跑实际调用过的模型（含 subagent）记下来——两次 baseline 对不上时，先看是不是模型换了。
      usage = {
        total_cost_usd: parsed.total_cost_usd, num_turns: parsed.num_turns, duration_ms: parsed.duration_ms, is_error: parsed.is_error,
        models: Object.keys(parsed.modelUsage ?? {}),
      };
      writeFileSync(join(runDir, 'result.txt'), String(parsed.result ?? ''));
    }
  } catch {
    /* 没吐出可解析的流也照样往下判形状——产物在不在跟它会不会说话是两件事 */
  }

  return { elapsedSec, exitCode: r.status, timedOut: r.error?.code === 'ETIMEDOUT', usage };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const { evals } = JSON.parse(readFileSync(join(HERE, 'evals.json'), 'utf8'));
  const selected = opts.only ? evals.filter((e) => opts.only.includes(e.eval_name)) : evals;
  if (!selected.length) throw new Error(`--only 没匹配到任何一格；有的是：${evals.map((e) => e.eval_name).join(', ')}`);
  // 存档是「这一次完整跑成什么样」。用一格的结果盖掉它，会留下一份看起来只有一条断言的 baseline。
  if (opts.archive && opts.only) throw new Error('--archive 不跟 --only 一起用：存档必须是完整的一跑，否则 benchmark.json 会被一格的结果盖掉');

  const outDir = opts.out ?? join('/tmp/idea-loop-eval', stamp());
  mkdirSync(outDir, { recursive: true });
  console.log(`baseline → ${outDir}\n`);

  const results = [];
  for (const e of selected) {
    const runDir = join(outDir, e.eval_name);
    const projectDir = join(runDir, 'project');
    mkdirSync(runDir, { recursive: true });

    let run = null;
    let before = [];
    if (e.prompt === null) {
      console.log(`— ${e.eval_name}：仓库静态检查，不跑 claude`);
    } else if (opts.gradeOnly) {
      if (!existsSync(projectDir)) throw new Error(`--grade-only 但 ${projectDir} 不在`);
      console.log(`— ${e.eval_name}：只重判，不重跑`);
      before = JSON.parse(readFileSync(join(runDir, 'before.json'), 'utf8'));
      // 那一跑的耗时与花费属于那一跑，重判不该把它抹成 null。
      if (existsSync(join(runDir, 'run.meta.json'))) run = JSON.parse(readFileSync(join(runDir, 'run.meta.json'), 'utf8'));
    } else {
      buildProject(e, projectDir);
      before = walk(projectDir);
      writeFileSync(join(runDir, 'before.json'), JSON.stringify(before, null, 2));
      process.stdout.write(`— ${e.eval_name}：跑 ${e.skill} …`);
      run = runClaude(e, projectDir, runDir, opts);
      console.log(` ${run.timedOut ? '超时' : `退出码 ${run.exitCode}`}，${run.elapsedSec}s`);
      writeFileSync(join(runDir, 'run.meta.json'), JSON.stringify(run, null, 2));
    }

    const expectations = grade(e.assertions, {
      project: projectDir,
      repoRoot: REPO_ROOT,
      pluginRoot: PLUGIN_ROOT,
      before,
      runDir,
      // 会话摘要：谁（会话还是子代理）调了什么、子代理交回了什么。没有它的断言会明说「没有会话记录」。
      session: e.prompt === null ? null : loadSession(runDir),
    });
    writeFileSync(join(runDir, 'grading.json'), JSON.stringify({ eval_name: e.eval_name, expectations }, null, 2));

    for (const x of expectations) console.log(`   ${x.passed ? '✓' : '✗'} ${x.text}\n      ${x.evidence}`);
    console.log('');

    results.push({
      eval_id: e.eval_id,
      eval_name: e.eval_name,
      skill: e.skill,
      run,
      passed: expectations.filter((x) => x.passed).length,
      total: expectations.length,
      expectations,
    });
  }

  const passed = results.reduce((n, r) => n + r.passed, 0);
  const total = results.reduce((n, r) => n + r.total, 0);
  const claudeVersion = spawnSync('claude', ['--version'], { encoding: 'utf8' }).stdout?.trim() ?? null;
  const benchmark = { baseline: 'toeflair-practice-history', ran_at: new Date().toISOString(), claude_version: claudeVersion, out_dir: outDir, passed, total, results };
  writeFileSync(join(outDir, 'benchmark.json'), JSON.stringify(benchmark, null, 2));
  console.log(`断言：${passed}/${total} 过\n${join(outDir, 'benchmark.json')}`);

  if (opts.archive) {
    mkdirSync(opts.archive, { recursive: true });
    cpSync(join(outDir, 'benchmark.json'), join(opts.archive, 'benchmark.json'));
    for (const r of results) {
      const from = join(outDir, r.eval_name);
      const to = join(opts.archive, r.eval_name);
      mkdirSync(to, { recursive: true });
      for (const f of ['grading.json', 'result.txt', 'run.meta.json']) {
        if (existsSync(join(from, f))) cpSync(join(from, f), join(to, f));
      }
    }
    console.log(`存档 → ${opts.archive}`);
  }
}

main();
