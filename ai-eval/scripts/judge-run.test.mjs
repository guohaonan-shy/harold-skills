/**
 * judge-run 的行为：一个 scorer × 一个样本一次会话；评分文件不合格重判一次，还不行记未评测；结果还原并存下完整提示。跑：
 *   `node --test ai-eval/scripts/judge-run.test.mjs`
 *
 * 不真起 codex：单个任务的测试注入假的 `run`；命令行的测试起一个假的 codex 可执行文件。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { judgeJob, pool } from './judge-run.mjs'

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'judge-run.mjs')
const TAG_SCORES = { B1: 1, B2: 0.9, B3: 0.8, C1: 0.25, C2: 0.5, C3: 0.75 }

const job = (sample = '1', scorer = 'report/tone') => ({
  format: 2,
  user_task: 'report',
  scorer,
  sample,
  description: '你是一位教师。给语气打分。\n\n### 读什么',
  reads: [{ path: 'report.tag', name: '标记' }],
  compare_with: [],
  expected: null,
  reports: [
    { side: 'baseline', run: 1, document: { report: { tag: 'B1' } } },
    { side: 'baseline', run: 2, document: { report: { tag: 'B2' } } },
    { side: 'baseline', run: 3, document: { report: { tag: 'B3' } } },
    { side: 'candidate', run: 1, document: { report: { tag: 'C1' } } },
    { side: 'candidate', run: 2, document: { report: { tag: 'C2' } } },
    { side: 'candidate', run: 3, document: { report: { tag: 'C3' } } },
  ],
})

/** 假会话：读提示里「报告 N」下面的标记，按标记打分，写进 cwd 的 scores.json。`mode` 可以破坏这一次。 */
function fakeRun(modes = []) {
  const calls = []
  const run = async ({ cwd, prompt }) => {
    const mode = modes[calls.length] ?? 'good'
    calls.push({ cwd, prompt })
    if (mode === 'signal') return { signal: 'SIGTERM', durationMs: 5 }
    if (mode === 'start-error') return { error: 'cannot start codex: ENOENT' }
    const labels = [...prompt.matchAll(/## 报告 (\d+)\n[\s\S]*?"(B1|B2|B3|C1|C2|C3)"/g)].map((m) => ({ label: Number(m[1]), tag: m[2] }))
    const cells = (mode === 'short' ? labels.slice(0, 4) : labels).map(({ label, tag }) => ({ label, status: 'scored', score: mode === 'bad-score' ? 1.3 : TAG_SCORES[tag], reason: '「引文」' }))
    if (mode !== 'no-file') writeFileSync(join(cwd, 'scores.json'), JSON.stringify({ format: 2, reports: cells }))
    return { exitCode: 0, durationMs: 100, tokensUsed: 1000 }
  }
  return { run, calls }
}

const options = (extra) => ({ fixedPrompt: '固定提示', workDir: mkdtempSync(join(tmpdir(), 'judge-run-')), seed: 5, version: 'codex-cli 0.0.0', ...extra })

test('一次会话判完：分数还原到基线 / 候选的第几份，记下模型、思考强度、版本、耗时、token', async () => {
  const { run, calls } = fakeRun()

  const { result, input } = await judgeJob(job(), options({ run }))

  assert.equal(calls.length, 1)
  assert.equal(result.unevaluated, false)
  assert.equal(result.retries, 0)
  assert.deepEqual(
    result.reports.map(({ side, run: n, score }) => [side, n, score]),
    [['baseline', 1, 1], ['baseline', 2, 0.9], ['baseline', 3, 0.8], ['candidate', 1, 0.25], ['candidate', 2, 0.5], ['candidate', 3, 0.75]],
  )
  assert.equal(result.model, 'gpt-6-luna')
  assert.equal(result.effort, 'high')
  assert.equal(result.codex_version, 'codex-cli 0.0.0')
  assert.equal(result.duration_ms, 100)
  assert.equal(result.tokens_used, 1000)
  assert.equal(input, calls[0].prompt, '存下来的提示就是交给会话的那份')
})

test('存下来的提示里没有哪份是基线的痕迹，每份报告恰好出现一次', async () => {
  const { run } = fakeRun()

  const { input } = await judgeJob(job(), options({ run }))

  assert.doesNotMatch(input, /baseline|candidate|基线|候选/i)
  for (const tag of Object.keys(TAG_SCORES)) assert.equal(input.split(`"${tag}"`).length - 1, 1)
})

test('评分文件没交回：重判一次（重新打乱），用第二次的；错误和重判次数都记下', async () => {
  const { run, calls } = fakeRun(['no-file', 'good'])

  const { result, input } = await judgeJob(job(), options({ run }))

  assert.equal(calls.length, 2)
  assert.equal(result.unevaluated, false)
  assert.equal(result.retries, 1)
  assert.match(result.errors.join('\n'), /第 1 次：没有评分文件/)
  assert.equal(input, calls[1].prompt, '存下来的是被采用那次的提示')
  assert.equal(result.duration_ms, 200)
  assert.equal(result.tokens_used, 2000)
  assert.deepEqual(result.reports.map((r) => r.score), [1, 0.9, 0.8, 0.25, 0.5, 0.75])
})

test('格式不合格（分数 1.3）按没交回处理：触发一次重判', async () => {
  const { run, calls } = fakeRun(['bad-score', 'good'])

  const { result } = await judgeJob(job(), options({ run }))

  assert.equal(calls.length, 2)
  assert.equal(result.retries, 1)
  assert.match(result.errors[0], /第 1 次：评分文件格式不合格.*分数/s)
})

test('判官只给了 4 份报告的分（6 份里漏 2 份）：评分文件不合格，重判一次', async () => {
  const { run, calls } = fakeRun(['short', 'good'])

  const { result } = await judgeJob(job(), options({ run }))

  assert.equal(calls.length, 2)
  assert.equal(result.retries, 1)
  assert.match(result.errors[0], /第 1 次：评分文件格式不合格.*缺报告/s)
  assert.equal(result.reports.length, 6)
})

test('每次尝试重新打乱：第二次的编号和第一次不同（同一个种子下可重放）', async () => {
  const seen = []
  const run = async ({ cwd, prompt }) => {
    seen.push(prompt)
    return { exitCode: 0, durationMs: 1 }
  }
  await judgeJob(job(), options({ run, seed: 1 }))
  const orderOf = (prompt) => [...prompt.matchAll(/"(B1|B2|B3|C1|C2|C3)"/g)].map((m) => m[1]).join(',')

  assert.equal(seen.length, 2)
  const again = []
  await judgeJob(job(), options({ run: async ({ prompt }) => (again.push(prompt), { exitCode: 0, durationMs: 1 }), seed: 1 }))
  assert.deepEqual(seen.map(orderOf), again.map(orderOf))
  assert.notEqual(orderOf(seen[0]), orderOf(seen[1]))
})

test('两次都不合格：未评测，没有任何分数（不是 0 分），错误点名两次各自哪里不对', async () => {
  const { run, calls } = fakeRun(['no-file', 'bad-score'])

  const { result } = await judgeJob(job(), options({ run }))

  assert.equal(calls.length, 2)
  assert.equal(result.unevaluated, true)
  assert.deepEqual(result.reports, [])
  assert.equal(result.retries, 1)
  assert.equal(result.errors.length, 2)
  assert.match(result.errors[0], /第 1 次/)
  assert.match(result.errors[1], /第 2 次/)
})

test('codex 起不来也走重判，仍起不来记未评测', async () => {
  const { run } = fakeRun(['start-error', 'start-error'])

  const { result } = await judgeJob(job(), options({ run }))

  assert.equal(result.unevaluated, true)
  assert.match(result.errors.join('\n'), /cannot start codex/)
})

test('会话被信号结束：当作被叫停，不重判', async () => {
  const { run, calls } = fakeRun(['signal'])

  const outcome = await judgeJob(job(), options({ run }))

  assert.equal(outcome.stopped, true)
  assert.equal(calls.length, 1)
})

test('同时跑几个由并发数控制', async () => {
  let active = 0
  let peak = 0
  await pool([1, 2, 3, 4, 5, 6, 7], 3, async () => {
    active += 1
    peak = Math.max(peak, active)
    await new Promise((resolve) => setTimeout(resolve, 10))
    active -= 1
  })

  assert.equal(peak, 3)
})

// ── 命令行：假的 codex 可执行文件 ──────────────────────────────────────────

const FAKE_CODEX = `#!/usr/bin/env node
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs'
const prompt = readFileSync(0, 'utf8')
if (process.argv[2] === '--version') { console.log('codex-cli 9.9.9'); process.exit(0) }
if (process.env.OPENAI_API_KEY || process.env.CODEX_API_KEY) { console.error('leaked key'); process.exit(3) }
const mode = process.env.FAKE_MODE ?? 'good'
if (mode === 'kill') process.kill(process.pid, 'SIGTERM')
if (process.env.FAKE_LOG) appendFileSync(process.env.FAKE_LOG, process.argv.slice(2).join(' ') + '\\n')
await new Promise((resolve) => setTimeout(resolve, 30))
const labels = [...prompt.matchAll(/## 报告 (\\d+)\\n[\\s\\S]*?"(B1|B2|B3|C1|C2|C3)"/g)].map((m) => ({ label: Number(m[1]), tag: m[2] }))
const scores = { B1: 1, B2: 0.9, B3: 0.8, C1: 0.25, C2: 0.5, C3: 0.75 }
if (mode !== 'none') writeFileSync('scores.json', JSON.stringify({ format: 2, reports: labels.map(({ label, tag }) => ({ label, status: 'scored', score: scores[tag], reason: '「引文」' })) }))
console.error('tokens used\\n2,500')
`

function setup(jobs) {
  const dir = mkdtempSync(join(tmpdir(), 'judge-run-cli-'))
  const bin = join(dir, 'fake-codex.mjs')
  writeFileSync(bin, FAKE_CODEX)
  chmodSync(bin, 0o755)
  for (const item of jobs) {
    const place = join(dir, 'jobs', ...item.scorer.split('/'))
    mkdirSync(place, { recursive: true })
    writeFileSync(join(place, `${item.sample}.job.json`), JSON.stringify(item))
  }
  return { dir, bin }
}

const cli = (dir, bin, extra = [], env = {}) =>
  spawnSync('node', [SCRIPT, '--jobs-dir', join(dir, 'jobs'), '--out-dir', join(dir, 'out'), '--codex-bin', bin, ...extra], {
    encoding: 'utf8',
    env: { ...process.env, OPENAI_API_KEY: 'must-not-reach-codex', CODEX_API_KEY: 'nor-this', ...env },
  })

test('命令行：每个 scorer × 样本一个 .json 和一个 .input.md，放在 <scorer>/<样本> 下；扣留的 key 没传给会话', () => {
  const { dir, bin } = setup([job('1'), job('2'), job('1', 'report/clarity')])

  const run = cli(dir, bin, ['--seed', '4'])

  assert.equal(run.status, 0, run.stderr)
  const summary = JSON.parse(run.stdout)
  assert.equal(summary.judged, 3)
  assert.equal(summary.unevaluated, 0)
  assert.equal(summary.tokensUsed, 7500)
  for (const [scorer, sample] of [['report/tone', '1'], ['report/tone', '2'], ['report/clarity', '1']]) {
    const base = join(dir, 'out', ...scorer.split('/'), sample)
    const result = JSON.parse(readFileSync(`${base}.json`, 'utf8'))
    assert.equal(result.scorer, scorer)
    assert.equal(result.sample, sample)
    assert.equal(result.codex_version, 'codex-cli 9.9.9')
    assert.deepEqual(result.reports.map((r) => r.score), [1, 0.9, 0.8, 0.25, 0.5, 0.75])
    assert.match(readFileSync(`${base}.input.md`, 'utf8'), /# 评分标准/)
  }
  const sessions = JSON.parse(readFileSync(join(dir, 'out', '.work', 'judge-sessions.json'), 'utf8'))
  assert.equal(sessions.sessions.length, 3)
  assert.ok(sessions.sessions.every((s) => Number.isInteger(s.pid) && s.pgid === s.pid))
})

test('命令行：--scorers 和 --samples 限定要判的；--skip-done 不重判已经评出的', () => {
  const { dir, bin } = setup([job('1'), job('2'), job('1', 'report/clarity')])
  const log = join(dir, 'calls.log')

  assert.equal(cli(dir, bin, ['--scorers', 'report/tone', '--samples', '2'], { FAKE_LOG: log }).status, 0)
  assert.equal(readFileSync(log, 'utf8').trim().split('\n').length, 1)
  assert.ok(existsSync(join(dir, 'out', 'report', 'tone', '2.json')))
  assert.ok(!existsSync(join(dir, 'out', 'report', 'tone', '1.json')))

  const again = cli(dir, bin, ['--skip-done'], { FAKE_LOG: log })
  assert.equal(again.status, 0, again.stderr)
  assert.equal(readFileSync(log, 'utf8').trim().split('\n').length, 3, '只补判了没评出的两个')
})

test('命令行：会话一直不交评分文件：重判后记未评测，退出码 1，结果文件里没有分数', () => {
  const { dir, bin } = setup([job('1')])

  const run = cli(dir, bin, [], { FAKE_MODE: 'none' })

  assert.equal(run.status, 1)
  const result = JSON.parse(readFileSync(join(dir, 'out', 'report', 'tone', '1.json'), 'utf8'))
  assert.equal(result.unevaluated, true)
  assert.deepEqual(result.reports, [])
  assert.equal(result.retries, 1)
})

test('命令行：会话被信号结束：整批叫停，退出码 130，不写结果', () => {
  const { dir, bin } = setup([job('1'), job('2')])

  const run = cli(dir, bin, ['--concurrency', '1'], { FAKE_MODE: 'kill' })

  assert.equal(run.status, 130)
  assert.ok(!existsSync(join(dir, 'out', 'report', 'tone', '1.json')))
  assert.ok(!existsSync(join(dir, 'out', 'report', 'tone', '2.json')))
})

test('命令行：任务写错（位置和内容对不上、没有任务、缺参数）退出 2', () => {
  const { dir, bin } = setup([job('1')])
  mkdirSync(join(dir, 'jobs', 'wrong'), { recursive: true })
  writeFileSync(join(dir, 'jobs', 'wrong', '9.job.json'), JSON.stringify(job('1')))

  assert.equal(cli(dir, bin).status, 2)
  assert.equal(cli(dir, bin, ['--scorers', 'nobody/none']).status, 2)
  assert.equal(spawnSync('node', [SCRIPT], { encoding: 'utf8' }).status, 2)
})
