#!/usr/bin/env node
/**
 * uiux-research baseline runner.
 *
 * What it does: for each case, copies the minimal product context (`project/`) into a fresh git repo,
 * types the case's default prompt into `claude -p` with this working tree's plugin loaded, and leaves
 * the page the researcher wrote at a fixed place for a HUMAN to open and annotate. It does not judge
 * the page: the only numbers it prints are facts about the run (did the calling session touch Refero,
 * did the shape check pass, what it cost), never a score.
 *
 *   node idea-loop/evals/uiux-research/run.mjs --list
 *   node idea-loop/evals/uiux-research/run.mjs --only leave-confirm
 *   node idea-loop/evals/uiux-research/run.mjs                      # all six cases
 *   node idea-loop/evals/uiux-research/run.mjs --out <dir> --model <alias> --timeout-min 30
 *
 * Output (default `/tmp/idea-loop-uiux-research/<case>/`, overwritten by the next run of that case):
 *   output/index.html + output/shots/   the page and its screenshots (open index.html)
 *   project/                            the whole working copy the run happened in
 *   digest.json  result.txt             facts about the run / what the session said at the end
 *   run.stream.jsonl                    the raw event stream (large; screenshots are base64)
 * The human's annotations live in the repo, next to the case: cases/<case>/annotations.md.
 *
 * `--plugin-dir` points at the working tree's idea-loop/, not the installed copy: a run against the
 * installed plugin says nothing about the change in front of you.
 */

import { closeSync, cpSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(HERE, '..', '..');
const DEFAULT_OUT = '/tmp/idea-loop-uiux-research';

/** Appended to the human's words so an unattended run does not stop at a question nobody will answer. */
const UNATTENDED = '\n\n（这是一次无人值守的 baseline 跑，人不在场：不要提问，按你的拆法直接跑完；最后告诉我 index.html 的绝对路径和一句结论。）';

export function loadCases(root = HERE) {
  const dir = join(root, 'cases');
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => ({ name: d.name, ...JSON.parse(readFileSync(join(dir, d.name, 'case.json'), 'utf8')) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function buildPrompt(c) {
  return c.prompt + UNATTENDED;
}

/**
 * Condense a `stream-json` event stream into facts about who did what.
 * Every message carries `parent_tool_use_id`: null is the calling session, anything else is a sub-agent.
 * Accepts the stream as text, or any iterable of lines.
 */
export function digestStream(input) {
  const lines = typeof input === 'string' ? input.split('\n') : input;
  const bucket = () => ({ tools: {}, referoCalls: 0 });
  const session = bucket();
  const subagents = bucket();
  let result = null;
  for (const raw of lines) {
    if (!raw.trim()) continue;
    let ev;
    try {
      ev = JSON.parse(raw);
    } catch {
      continue; // last line cut off by the timeout
    }
    if (ev.type === 'result') {
      result = {
        text: String(ev.result ?? ''),
        cost: ev.total_cost_usd ?? null,
        turns: ev.num_turns ?? null,
        durationMs: ev.duration_ms ?? null,
        isError: ev.is_error ?? false,
        models: Object.keys(ev.modelUsage ?? {}),
      };
      continue;
    }
    if (ev.type !== 'assistant') continue;
    const b = ev.parent_tool_use_id ? subagents : session;
    for (const block of ev.message?.content ?? []) {
      if (block?.type !== 'tool_use') continue;
      b.tools[block.name] = (b.tools[block.name] ?? 0) + 1;
      if (/^mcp__.*refero/i.test(block.name)) b.referoCalls += 1;
    }
  }
  return { session, subagents, result };
}

/** Read a possibly huge stream file line by line, without holding it in memory. */
function* fileLines(path) {
  const fd = openSync(path, 'r');
  const chunk = Buffer.alloc(1 << 20);
  let pending = Buffer.alloc(0);
  try {
    for (;;) {
      const n = readSync(fd, chunk, 0, chunk.length, null);
      if (n === 0) break;
      pending = Buffer.concat([pending, chunk.subarray(0, n)]);
      let nl;
      while ((nl = pending.indexOf(10)) >= 0) {
        yield pending.subarray(0, nl).toString('utf8');
        pending = pending.subarray(nl + 1);
      }
    }
    if (pending.length) yield pending.toString('utf8');
  } finally {
    closeSync(fd);
  }
}

function parseArgs(argv) {
  const o = { only: null, out: DEFAULT_OUT, model: null, timeoutMin: 30, list: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--only') o.only = argv[++i].split(',').map((s) => s.trim());
    else if (a === '--out') o.out = resolve(argv[++i]);
    else if (a === '--model') o.model = argv[++i];
    else if (a === '--timeout-min') o.timeoutMin = Number(argv[++i]);
    else if (a === '--list') o.list = true;
    else throw new Error(`unknown argument: ${a}`);
  }
  return o;
}

function git(cwd, ...args) {
  const r = spawnSync('git', ['-c', 'user.name=baseline', '-c', 'user.email=baseline@example.invalid', ...args], { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
}

function findPage(projectDir) {
  const base = join(projectDir, 'docs', 'design', 'tmp');
  const hits = [];
  const walk = (dir) => {
    if (!existsSync(dir)) return;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === 'index.html' && p.includes('/research/')) hits.push(p);
    }
  };
  walk(base);
  return hits;
}

function runCase(c, opts) {
  const caseDir = join(opts.out, c.name);
  const projectDir = join(caseDir, 'project');
  const outputDir = join(caseDir, 'output');
  rmSync(caseDir, { recursive: true, force: true });
  mkdirSync(caseDir, { recursive: true });

  cpSync(join(HERE, 'project'), projectDir, { recursive: true });
  git(projectDir, 'init', '-q');
  git(projectDir, 'add', '-A');
  git(projectDir, 'commit', '-q', '-m', 'baseline project');

  const args = ['-p', buildPrompt(c), '--plugin-dir', PLUGIN_ROOT, '--dangerously-skip-permissions', '--output-format', 'stream-json', '--verbose'];
  if (opts.model) args.push('--model', opts.model);
  const streamPath = join(caseDir, 'run.stream.jsonl');
  const out = openSync(streamPath, 'w');
  const started = Date.now();
  let r;
  try {
    r = spawnSync('claude', args, { cwd: projectDir, encoding: 'utf8', timeout: opts.timeoutMin * 60_000, stdio: ['ignore', out, 'pipe'] });
  } finally {
    closeSync(out);
  }
  if (r.stderr) writeFileSync(join(caseDir, 'run.stderr.log'), r.stderr);

  const digest = digestStream(fileLines(streamPath));
  if (digest.result) writeFileSync(join(caseDir, 'result.txt'), digest.result.text);

  const pages = findPage(projectDir);
  let page = null;
  let check = null;
  if (pages.length) {
    page = pages[0];
    cpSync(dirname(page), outputDir, { recursive: true });
    const k = spawnSync('node', [join(PLUGIN_ROOT, 'scripts', 'research-check.mjs'), join(outputDir, 'index.html')], { encoding: 'utf8' });
    check = { ok: k.status === 0, output: `${k.stdout}${k.stderr}`.trim().slice(0, 2000) };
  }
  const facts = {
    case: c.name,
    elapsedSec: Math.round((Date.now() - started) / 1000),
    exitCode: r.status,
    timedOut: r.error?.code === 'ETIMEDOUT',
    pageWrittenAt: page ? page.replace(projectDir, '<project>') : null,
    shapeCheck: check,
    callingSessionReferoCalls: digest.session.referoCalls,
    researcherReferoCalls: digest.subagents.referoCalls,
    callingSessionTools: digest.session.tools,
    subagentTools: digest.subagents.tools,
    run: digest.result && { cost: digest.result.cost, turns: digest.result.turns, models: digest.result.models, isError: digest.result.isError },
  };
  writeFileSync(join(caseDir, 'digest.json'), JSON.stringify(facts, null, 2));
  return { facts, outputDir: page ? outputDir : null, caseDir };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const cases = loadCases();
  if (opts.list) {
    for (const c of cases) console.log(`${c.name}\n  ${c.prompt}\n  上次：${c.last_time}\n`);
    return;
  }
  const picked = opts.only ? cases.filter((c) => opts.only.includes(c.name)) : cases;
  if (!picked.length) throw new Error(`--only matched nothing; cases: ${cases.map((c) => c.name).join(', ')}`);

  console.log(`uiux-research baseline → ${opts.out}\n`);
  for (const c of picked) {
    process.stdout.write(`— ${c.name}: running …`);
    const { facts, outputDir, caseDir } = runCase(c, opts);
    console.log(` ${facts.timedOut ? 'timed out' : `exit ${facts.exitCode}`}, ${facts.elapsedSec}s`);
    if (outputDir) {
      console.log(`   page:       ${join(outputDir, 'index.html')}`);
      console.log(`   open:       ${pathToFileURL(join(outputDir, 'index.html')).href}`);
    } else {
      console.log(`   page:       (none written — see ${join(caseDir, 'result.txt')})`);
    }
    console.log(`   shape check: ${facts.shapeCheck ? (facts.shapeCheck.ok ? 'green' : 'RED') : 'n/a'}   calling-session Refero calls: ${facts.callingSessionReferoCalls}   researcher Refero calls: ${facts.researcherReferoCalls}`);
    console.log(`   last time:  ${c.last_time}`);
    console.log(`   annotate:   ${join(HERE, 'cases', c.name, 'annotations.md')}\n`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
