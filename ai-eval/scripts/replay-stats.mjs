#!/usr/bin/env node
/**
 * replay-stats：回放结果文件的统计。每个变体的 pass¹ / pass³，每个非基线变体对 baseline 的差、
 * 按 group 重抽的 95% 区间、「变好 / 变差 / 持平」。
 *
 *   node replay-stats.mjs --results <结果文件> [--resamples 2000] [--seed 20240229]
 *
 * 脚本不认识任何项目：输入是回放脚本逐条追加的结果文件（JSONL，一行一个 JSON），数字都由脚本算，Claude 不临场算。
 *
 * 结果文件的行：
 *   { case, group, variant, run, status: "ok" | "platform_error", pass: true | false | null, score: number | null }
 *   group 是重抽的分组键（如会话 id）；基线变体固定叫 baseline；没法判的行 pass、score 写 null。
 *   同一个键（case × variant × run）出现多行时取最后一行：重跑平台报错就是往文件后面追加这一格的新行。
 *
 * 规则：
 *   - 取完每个键的最后一行，还有 platform_error：拒绝出数，退出码 1，列出还剩哪几行，不给通过率和任何差值。
 *   - pass¹ = 过了的次数 / 有判定的次数（pass 为 null 的不进分母）。
 *   - pass³ = 三次全过的 case 数 / case 数。一个 case 取它最小的三个 run，三次都判了且都过才算过
 *     （三次里有没法判的，算没全过）。这个变体有任何 case 不足三次，不报 pass³（pass3 是 null，pass3Note 写原因）。
 *   - 差 = 变体的 pass¹ 减 baseline 的 pass¹；有 score 时另给 score 均值的差。区间：按 group 有放回重抽
 *     （默认 2000 次，组数不变，两个变体用同一批抽到的组），取差的 2.5% 和 97.5% 分位。
 *   - 判定看 pass¹ 的差：区间整个在 0 以上「变好」（better），整个在 0 以下「变差」（worse），跨 0 「持平」（flat）。
 *     没有任何 pass 判定、只有 score 时，改看 score 的差，verdictBy 写 score。
 *   - 随机种子固定（默认值写在 DEFAULT_SEED），同一份输入两次跑出同样的区间。
 *
 * 输出（stdout，JSON）：
 *   { rows, groups, variants: { <变体>: { rows, judged, passes, pass1, cases, pass3: { passed, rate } | null,
 *       pass3Note, meanScore } },
 *     comparisons: { <变体>: { pass1: { delta, interval: [lo, hi], groups, resamples } | null,
 *       score: { ... } | null, verdict, label, verdictBy } } }
 *   拒绝出数时：{ verdict: 'platform_error', remaining, rows: [{ case, variant, run }], message }
 * 退出码：0 出了数（不论变好变差），1 还有平台报错，2 用法或输入有误（原因在 stderr，stdout 为空）。
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const DEFAULT_RESAMPLES = 2000
export const DEFAULT_SEED = 20240229
const BASELINE = 'baseline'
const LABELS = { better: '变好', worse: '变差', flat: '持平' }

/** mulberry32：同一个种子出同一串数。 */
function random(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 解析结果文件的文本；任何一行不合格都抛错，带行号。 */
export function parseResults(text) {
  const latest = new Map()
  text.split('\n').forEach((line, index) => {
    if (!line.trim()) return
    const where = `第 ${index + 1} 行`
    let row
    try {
      row = JSON.parse(line)
    } catch {
      throw new Error(`${where}不是 JSON`)
    }
    if (row === null || typeof row !== 'object' || Array.isArray(row)) throw new Error(`${where}不是 JSON 对象`)
    for (const key of ['case', 'group', 'variant']) {
      if (typeof row[key] !== 'string' || row[key] === '') throw new Error(`${where}的 ${key} 要是非空字符串`)
    }
    if (!Number.isInteger(row.run) || row.run < 1) throw new Error(`${where}的 run 要是从 1 起的整数`)
    if (row.status !== 'ok' && row.status !== 'platform_error') throw new Error(`${where}的 status 要是 ok 或 platform_error`)
    if (row.pass !== true && row.pass !== false && row.pass !== null) throw new Error(`${where}的 pass 要是 true、false 或 null`)
    if (row.score !== null && !(typeof row.score === 'number' && Number.isFinite(row.score))) {
      throw new Error(`${where}的 score 要是数字或 null`)
    }
    latest.set(JSON.stringify([row.case, row.variant, row.run]), row)
  })
  const rows = [...latest.values()]
  if (rows.length === 0) throw new Error('结果文件里没有一行结果')
  return rows
}

function pass3Of(rows) {
  const byCase = new Map()
  for (const row of rows) {
    if (!byCase.has(row.case)) byCase.set(row.case, [])
    byCase.get(row.case).push(row)
  }
  const cases = byCase.size
  const short = [...byCase.entries()].filter(([, runs]) => runs.length < 3).map(([name]) => name)
  if (short.length > 0) {
    return { pass3: null, pass3Note: `有 ${short.length} 个 case 没跑满三次（${short.slice(0, 3).join('、')}${short.length > 3 ? ' 等' : ''}），不报 pass³` }
  }
  let passed = 0
  for (const runs of byCase.values()) {
    const three = runs.sort((a, b) => a.run - b.run).slice(0, 3)
    if (three.every((r) => r.pass === true)) passed += 1
  }
  return { pass3: { passed, rate: passed / cases }, pass3Note: null }
}

function summarizeVariant(rows) {
  const judged = rows.filter((r) => r.pass !== null)
  const passes = judged.filter((r) => r.pass === true).length
  const scores = rows.filter((r) => r.score !== null).map((r) => r.score)
  return {
    rows: rows.length,
    judged: judged.length,
    passes,
    pass1: judged.length > 0 ? passes / judged.length : null,
    cases: new Set(rows.map((r) => r.case)).size,
    ...pass3Of(rows),
    meanScore: scores.length > 0 ? scores.reduce((s, x) => s + x, 0) / scores.length : null,
  }
}

/** 一个度量在每个 group 里的 { 和, 个数 }：pass 记 1 / 0，score 记分数，没有值的行不进。 */
function perGroup(rows, valueOf) {
  const sums = new Map()
  for (const row of rows) {
    const value = valueOf(row)
    if (value === null) continue
    const cell = sums.get(row.group) ?? { sum: 0, count: 0 }
    cell.sum += value
    cell.count += 1
    sums.set(row.group, cell)
  }
  return sums
}

/** 按 group 重抽，算 (变体 − baseline) 的差和 95% 区间；任何一边一个值都没有就是 null。 */
function bootstrapDelta(baselineRows, variantRows, valueOf, groups, resamples, rng) {
  const base = perGroup(baselineRows, valueOf)
  const cand = perGroup(variantRows, valueOf)
  const total = (cells) => [...cells.values()].reduce((acc, c) => ({ sum: acc.sum + c.sum, count: acc.count + c.count }), { sum: 0, count: 0 })
  const b = total(base)
  const c = total(cand)
  if (b.count === 0 || c.count === 0) return null
  const delta = c.sum / c.count - b.sum / b.count

  const diffs = []
  for (let i = 0; i < resamples; i += 1) {
    let bs = 0, bn = 0, cs = 0, cn = 0
    for (let k = 0; k < groups.length; k += 1) {
      const g = groups[Math.floor(rng() * groups.length)]
      const bc = base.get(g)
      const cc = cand.get(g)
      if (bc) { bs += bc.sum; bn += bc.count }
      if (cc) { cs += cc.sum; cn += cc.count }
    }
    if (bn > 0 && cn > 0) diffs.push(cs / cn - bs / bn)
  }
  if (diffs.length === 0) return null
  diffs.sort((x, y) => x - y)
  const lo = diffs[Math.floor(0.025 * diffs.length)]
  const hi = diffs[Math.ceil(0.975 * diffs.length) - 1]
  return { delta, interval: [lo, hi], groups: groups.length, resamples: diffs.length }
}

const verdictOf = (interval) => (interval[0] > 0 ? 'better' : interval[1] < 0 ? 'worse' : 'flat')

export function replayStats(rows, { resamples = DEFAULT_RESAMPLES, seed = DEFAULT_SEED } = {}) {
  const pending = rows.filter((r) => r.status === 'platform_error')
  if (pending.length > 0) {
    return {
      verdict: 'platform_error',
      remaining: pending.length,
      rows: pending.map((r) => ({ case: r.case, variant: r.variant, run: r.run })),
      message: `还有 ${pending.length} 行平台报错，先重跑到零再算数；这次不给通过率，也不给任何差值`,
    }
  }
  const byVariant = new Map()
  for (const row of rows) {
    if (!byVariant.has(row.variant)) byVariant.set(row.variant, [])
    byVariant.get(row.variant).push(row)
  }
  if (!byVariant.has(BASELINE)) throw new Error(`结果文件里没有变体 ${BASELINE}，没有可比的基线`)

  const groups = [...new Set(rows.map((r) => r.group))].sort()
  const variants = {}
  for (const [name, list] of byVariant) variants[name] = summarizeVariant(list)

  const passValue = (r) => (r.pass === null ? null : r.pass ? 1 : 0)
  const scoreValue = (r) => r.score
  const comparisons = {}
  for (const [name, list] of byVariant) {
    if (name === BASELINE) continue
    const pass1 = bootstrapDelta(byVariant.get(BASELINE), list, passValue, groups, resamples, random(seed))
    const score = bootstrapDelta(byVariant.get(BASELINE), list, scoreValue, groups, resamples, random(seed))
    const by = pass1 ? 'pass1' : score ? 'score' : null
    const chosen = pass1 ?? score
    const verdict = chosen ? verdictOf(chosen.interval) : null
    comparisons[name] = { pass1, score, verdict, label: verdict ? LABELS[verdict] : null, verdictBy: by }
  }
  return { rows: rows.length, groups: groups.length, variants, comparisons }
}

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i]
    if (!['--results', '--resamples', '--seed'].includes(flag)) throw new Error(`不认识的参数 ${flag}`)
    if (argv[i + 1] === undefined) throw new Error(`${flag} 后面要跟一个值`)
    args[flag.slice(2)] = argv[i + 1]
  }
  if (!args.results) throw new Error('--results <结果文件> 必填')
  return args
}

function positiveInteger(name, text) {
  const value = Number(text)
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} 要是正整数，拿到 ${text}`)
  return value
}

function main(argv) {
  let result
  try {
    const args = parseArgs(argv)
    const options = {}
    if (args.resamples !== undefined) options.resamples = positiveInteger('--resamples', args.resamples)
    if (args.seed !== undefined) options.seed = positiveInteger('--seed', args.seed)
    let text
    try {
      text = readFileSync(args.results, 'utf8')
    } catch (error) {
      throw new Error(`读不了 ${args.results}：${error.code ?? error.message}`)
    }
    result = replayStats(parseResults(text), options)
  } catch (error) {
    process.stderr.write(`replay-stats: ${error.message}\n`)
    return 2
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  return result.verdict === 'platform_error' ? 1 : 0
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2))
}
