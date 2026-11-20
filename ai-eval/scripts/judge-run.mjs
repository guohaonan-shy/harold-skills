#!/usr/bin/env node
/**
 * judge-run：把一批判官任务（每个 scorer × 样本一个）各交给一次全新的 `codex exec`，判完存结果。
 *
 *   node judge-run.mjs --jobs-dir <目录> --out-dir <目录> [--concurrency 6] [--model gpt-6-luna] [--effort high]
 *        [--max-attempts 2] [--scorers a,b] [--samples 1,2] [--skip-done] [--seed N] [--sessions-file <路径>]
 *        [--codex-bin codex]
 *
 * 输入：`<jobs-dir>/<scorer>/<样本>.job.json`（`<scorer>` 是带斜杠的 scorer 名，如 review_report/annotations_correct；
 * 格式见 references/judge-format.md「判官任务」，项目写）。
 * 输出：`<out-dir>/<scorer>/<样本>.json`（还原后的打分）和 `<样本>.input.md`（这次实际交给 Codex 的完整提示）；
 * 每次会话的日志和评分文件原件在 `<out-dir>/.work/` 里，不是交付物。
 *
 * 一个任务一次会话：打包（打乱，每次尝试重新打乱）→ `codex exec` → 验评分文件 → 还原。评分文件缺失或格式不合格，
 * 这个任务重判一次；还不行记「未评测」（没有分数，不记 0 分）。同时跑几个由 --concurrency 控制，任务之间互不相干。
 * 每个会话领一个进程组，并追加进 sessions 文件（默认 `<out-dir>/.work/judge-sessions.json`，项目的 stop 命令读它）；
 * 会话被信号结束就当作被叫停：不再起新的，整批退出。
 *
 * 输出（stdout，JSON）：{ judged, unevaluated, stopped, durationMs, tokensUsed, results }。
 * 退出码：0 全部评出，1 有未评测，2 用法有误或任务写错，130 被叫停。
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { EFFORT, MODEL, RECORD_FILE, appendRecord, codexVersion, runCodex } from './judge-launch.mjs'
import { PROMPT_FILE, checkJob, packJob, renderInput } from './judge-pack.mjs'
import { restoreScores } from './judge-settle.mjs'
import { validateScores } from './judge-validate.mjs'

export const FORMAT = 2
// 6：2026-11-16 在 Codex 订阅上试过，同时 6 个时单次耗时中位 79 秒，和同一批任务同时 3 个时（78 秒）一样，18 个全部评出、没有被限流。
export const DEFAULT_CONCURRENCY = 6
export const DEFAULT_MAX_ATTEMPTS = 2
const JOB_SUFFIX = '.job.json'

/** 同一个基础种子下，各任务、各次尝试打乱得不一样，但可重放。 */
function seedFor(base, ...parts) {
  let hash = base >>> 0
  for (const char of parts.join('|')) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0
  return hash >>> 0
}

function readScores(path) {
  if (!existsSync(path)) return { error: '没有评分文件 scores.json' }
  try {
    return { value: JSON.parse(readFileSync(path, 'utf8')) }
  } catch (error) {
    return { error: `scores.json 不是合法的 JSON：${error.message}` }
  }
}

/**
 * 判一个任务。`run` 是启动一次会话的函数（默认 runCodex，测试里换成假的）。
 * 返回 { result, input, stopped }：result 是要存的 `<样本>.json` 内容，input 是被采用那次（或最后一次）的完整提示。
 */
export async function judgeJob(job, { fixedPrompt, workDir, run = runCodex, model = MODEL, effort = EFFORT, codexBin = 'codex', maxAttempts = DEFAULT_MAX_ATTEMPTS, seed, version = null, onStart }) {
  checkJob(job)
  const errors = []
  let durationMs = 0
  let tokensUsed = null
  let input = ''
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const { blind, mapping } = packJob(job, { seed: Number.isInteger(seed) ? seedFor(seed, job.scorer, job.sample, attempt) : undefined })
    input = renderInput(blind, fixedPrompt)
    const cwd = join(workDir, `attempt-${attempt}`)
    rmSync(cwd, { recursive: true, force: true })
    mkdirSync(cwd, { recursive: true })
    const ran = await run({
      codexBin, model, effort, cwd, prompt: input, log: join(cwd, 'codex.log'), lastMessage: join(cwd, 'last.txt'), onStart,
    })
    durationMs += ran.durationMs ?? 0
    if (typeof ran.tokensUsed === 'number') tokensUsed = (tokensUsed ?? 0) + ran.tokensUsed
    if (ran.signal) return { stopped: true, input }
    const where = `第 ${attempt} 次`
    if (ran.error) {
      errors.push(`${where}：${ran.error}`)
      continue
    }
    const scores = readScores(join(cwd, 'scores.json'))
    if (scores.error) {
      errors.push(`${where}：${scores.error}（codex 退出码 ${ran.exitCode}）`)
      continue
    }
    const checked = validateScores(scores.value, mapping.expect)
    if (!checked.ok) {
      errors.push(`${where}：评分文件格式不合格（${checked.errors.map((e) => e.message).join('；')}）`)
      continue
    }
    return {
      input,
      result: {
        format: FORMAT, user_task: job.user_task, scorer: job.scorer, sample: job.sample, unevaluated: false,
        model, effort, codex_version: version, duration_ms: durationMs, tokens_used: tokensUsed, retries: attempt - 1,
        reports: restoreScores(scores.value, mapping), errors,
      },
    }
  }
  return {
    input,
    result: {
      format: FORMAT, user_task: job.user_task, scorer: job.scorer, sample: job.sample, unevaluated: true,
      model, effort, codex_version: version, duration_ms: durationMs, tokens_used: tokensUsed, retries: maxAttempts - 1,
      reports: [], errors,
    },
  }
}

/** 同时最多 `limit` 个任务在跑。 */
export async function pool(items, limit, work) {
  const queue = [...items]
  const workers = Array.from({ length: Math.max(1, Math.min(limit, queue.length)) }, async () => {
    while (queue.length > 0) await work(queue.shift())
  })
  await Promise.all(workers)
}

function jobFiles(directory) {
  const found = []
  for (const name of readdirSync(directory).sort()) {
    const path = join(directory, name)
    if (statSync(path).isDirectory()) found.push(...jobFiles(path))
    else if (name.endsWith(JOB_SUFFIX)) found.push(path)
  }
  return found
}

function parseArgs(argv) {
  const args = { concurrency: DEFAULT_CONCURRENCY, model: MODEL, effort: EFFORT, maxAttempts: DEFAULT_MAX_ATTEMPTS, codexBin: 'codex', skipDone: false }
  const flags = {
    '--jobs-dir': ['jobsDir', String], '--out-dir': ['outDir', String], '--concurrency': ['concurrency', Number],
    '--model': ['model', String], '--effort': ['effort', String], '--max-attempts': ['maxAttempts', Number],
    '--scorers': ['scorers', String], '--samples': ['samples', String], '--seed': ['seed', Number],
    '--sessions-file': ['sessionsFile', String], '--codex-bin': ['codexBin', String],
  }
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--skip-done') {
      args.skipDone = true
      continue
    }
    const flag = flags[argv[i]]
    if (!flag) throw new Error(`unknown argument ${argv[i]}`)
    args[flag[0]] = flag[1](argv[++i])
  }
  for (const [name, key] of [['--jobs-dir', 'jobsDir'], ['--out-dir', 'outDir']]) {
    if (!args[key]) throw new Error(`${name} <目录> is required`)
  }
  for (const key of ['concurrency', 'maxAttempts']) {
    if (!Number.isInteger(args[key]) || args[key] < 1) throw new Error(`--${key === 'maxAttempts' ? 'max-attempts' : 'concurrency'} must be a positive integer`)
  }
  if (args.seed !== undefined && !Number.isInteger(args.seed)) throw new Error('--seed must be an integer')
  const list = (text) => (text ? text.split(',').map((name) => name.trim()).filter(Boolean) : null)
  args.scorers = list(args.scorers)
  args.samples = list(args.samples)
  return args
}

async function main(argv) {
  let args
  let jobs
  try {
    args = parseArgs(argv)
    const fixedPrompt = readFileSync(PROMPT_FILE, 'utf8')
    jobs = jobFiles(args.jobsDir).map((path) => {
      const job = JSON.parse(readFileSync(path, 'utf8'))
      checkJob(job)
      if (path !== join(args.jobsDir, ...job.scorer.split('/'), `${job.sample}${JOB_SUFFIX}`)) {
        throw new Error(`${path} 里写的是 ${job.scorer} / 样本 ${job.sample}，位置不对`)
      }
      return job
    })
    jobs = jobs.filter((job) => (!args.scorers || args.scorers.includes(job.scorer)) && (!args.samples || args.samples.includes(job.sample)))
    if (jobs.length === 0) throw new Error(`${args.jobsDir} 里没有要判的任务`)
    args.fixedPrompt = fixedPrompt
  } catch (error) {
    process.stderr.write(`judge-run: ${error.message}\n`)
    return 2
  }

  const outDir = resolve(args.outDir)
  const sessionsFile = args.sessionsFile ? resolve(args.sessionsFile) : join(outDir, '.work', RECORD_FILE)
  mkdirSync(join(outDir, '.work'), { recursive: true })
  const version = codexVersion(args.codexBin)
  const summary = { judged: 0, unevaluated: 0, stopped: false, durationMs: 0, tokensUsed: 0, results: [] }
  const started = Date.now()

  await pool(jobs, args.concurrency, async (job) => {
    if (summary.stopped) return
    const base = join(outDir, ...job.scorer.split('/'), job.sample)
    if (args.skipDone && existsSync(`${base}.json`) && !JSON.parse(readFileSync(`${base}.json`, 'utf8')).unevaluated) {
      summary.judged += 1
      summary.results.push(relative(outDir, `${base}.json`))
      return
    }
    const outcome = await judgeJob(job, {
      fixedPrompt: args.fixedPrompt, workDir: join(outDir, '.work', ...job.scorer.split('/'), job.sample), model: args.model,
      effort: args.effort, codexBin: args.codexBin, maxAttempts: args.maxAttempts, seed: args.seed, version,
      onStart: ({ pid, started: startTime }) =>
        appendRecord(sessionsFile, {
          pid, pgid: pid, started: startTime, label: `${job.scorer}/${job.sample}`, model: args.model, effort: args.effort,
          cwd: outDir, launched_at: new Date().toISOString(),
        }),
    })
    if (outcome.stopped) {
      summary.stopped = true
      return
    }
    mkdirSync(join(outDir, ...job.scorer.split('/')), { recursive: true })
    writeFileSync(`${base}.json`, `${JSON.stringify(outcome.result, null, 2)}\n`)
    writeFileSync(`${base}.input.md`, outcome.input)
    summary[outcome.result.unevaluated ? 'unevaluated' : 'judged'] += 1
    summary.tokensUsed += outcome.result.tokens_used ?? 0
    summary.results.push(relative(outDir, `${base}.json`))
  })

  summary.durationMs = Date.now() - started
  process.stdout.write(`${JSON.stringify(summary)}\n`)
  if (summary.stopped) return 130
  return summary.unevaluated > 0 ? 1 : 0
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => process.exit(code))
}
