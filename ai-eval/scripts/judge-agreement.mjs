#!/usr/bin/env node
/**
 * judge-agreement：两个判官对同一批报告打的分，逐指标比一致性（判官指标审核的第 6 项）。
 *
 *   node judge-agreement.mjs --a <判官 A 的评分> --b <判官 B 的评分> [--max-gap 0.5] [--max-mean-gap 0.2]
 *
 * 脚本不认识任何项目。评分文件 { format: 1, judge, scores }，scores 是 { <报告>: { <指标 id>: 分数 | null } }：
 * 分数在 0 到 1，null 是判官写了「无法判断」。从 judge-settle 的 `--agreement` 得到这个形状
 * （skill `eval-metrics-review` 的步骤 4 写了怎么整理）。
 *
 * 规则，对每个指标：
 *   - 两边都给了分的报告成一对，差 = 两个分数差的绝对值；null 不当 0，不进差；
 *   - 一边给了分、另一边写「无法判断」的报告记进 oneSided：评分标准没把该判的东西说清，或判官读到的字段不够；
 *   - 判为 inconsistent：任何一对的差 >= --max-gap（默认 0.5，等于评分档位 1.0 与 0.5 之间的一整档），
 *     或平均差 > --max-mean-gap（默认 0.2，一个判官整体比另一个松或严），或有 oneSided；
 *   - 没有任何一对、也没有 oneSided（两边全写「无法判断」）：no_data，不当作一致；
 *   - 其余 consistent。
 * 两份评分的报告集合不同、某个报告缺指标、分数不在 0 到 1、format 不对，都是输入有误：报错，不比。
 *
 * 输出（stdout，JSON）：{ ok, judges: [A, B], thresholds, metrics: [{ id, pairs, meanGap, maxGap, gaps, oneSided, verdict }] }
 *   gaps: [{ report, a, b, gap }]（按差从大到小）；oneSided: [{ report, judge }]（写了「无法判断」的是哪个判官）
 * 退出码：0 每个指标都 consistent，1 有 inconsistent 或 no_data（stdout 仍是完整 JSON），2 用法或输入有误（原因在 stderr）。
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const JUDGE_SCORES_FORMAT = 1
export const DEFAULT_MAX_GAP = 0.5
export const DEFAULT_MAX_MEAN_GAP = 0.2
const EPSILON = 1e-9

function checkJudge(judge, side) {
  if (!judge || judge.format !== JUDGE_SCORES_FORMAT) {
    throw new Error(`${side}: format must be ${JUDGE_SCORES_FORMAT}, got ${JSON.stringify(judge?.format)}`)
  }
  if (!judge.scores || typeof judge.scores !== 'object' || Object.keys(judge.scores).length === 0) {
    throw new Error(`${side}: 'scores' must be an object with at least one report`)
  }
  for (const [report, byMetric] of Object.entries(judge.scores)) {
    for (const [metric, score] of Object.entries(byMetric ?? {})) {
      if (score !== null && !(typeof score === 'number' && score >= 0 && score <= 1)) {
        throw new Error(`${side}: the score for metric '${metric}' on ${report} is ${JSON.stringify(score)}; a score is a number from 0 to 1, or null for "cannot tell"`)
      }
    }
  }
}

const round = (value) => Math.round(value * 1e6) / 1e6

export function compareJudges(a, b, { maxGap = DEFAULT_MAX_GAP, maxMeanGap = DEFAULT_MAX_MEAN_GAP } = {}) {
  checkJudge(a, 'A')
  checkJudge(b, 'B')
  const reports = Object.keys(a.scores).sort()
  const reportsB = Object.keys(b.scores).sort()
  if (reports.join('\n') !== reportsB.join('\n')) {
    throw new Error(`the two judges must score the same reports; A has [${reports.join(', ')}], B has [${reportsB.join(', ')}]`)
  }
  const metricIds = Object.keys(a.scores[reports[0]]).sort()
  for (const report of reports) {
    for (const [side, judge] of [['A', a], ['B', b]]) {
      const have = Object.keys(judge.scores[report]).sort()
      if (have.join('\n') !== metricIds.join('\n')) {
        const missing = metricIds.filter((id) => !have.includes(id))
        const extra = have.filter((id) => !metricIds.includes(id))
        const detail = missing.length ? `is missing metric '${missing[0]}'` : `has an extra metric '${extra[0]}'`
        throw new Error(`${side}: the scores for ${report} ${detail}; both judges need the same metrics on every report`)
      }
    }
  }

  const metrics = metricIds.map((id) => {
    const gaps = []
    const oneSided = []
    for (const report of reports) {
      const left = a.scores[report][id]
      const right = b.scores[report][id]
      if (left === null && right === null) continue
      if (left === null) oneSided.push({ report, judge: a.judge })
      else if (right === null) oneSided.push({ report, judge: b.judge })
      else gaps.push({ report, a: left, b: right, gap: round(Math.abs(left - right)) })
    }
    gaps.sort((x, y) => y.gap - x.gap || x.report.localeCompare(y.report))
    const pairs = gaps.length
    const largest = pairs ? gaps[0].gap : 0
    const meanGap = pairs ? round(gaps.reduce((sum, g) => sum + g.gap, 0) / pairs) : 0
    let verdict = 'consistent'
    if (pairs === 0 && oneSided.length === 0) verdict = 'no_data'
    else if (largest >= maxGap - EPSILON || meanGap > maxMeanGap + EPSILON || oneSided.length > 0) verdict = 'inconsistent'
    return { id, pairs, meanGap, maxGap: largest, gaps, oneSided, verdict }
  })

  return {
    ok: metrics.every((metric) => metric.verdict === 'consistent'),
    judges: [a.judge, b.judge],
    thresholds: { maxGap, maxMeanGap },
    metrics,
  }
}

function parseArgs(argv) {
  const options = {}
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i]
    const value = argv[i + 1]
    if (!['--a', '--b', '--max-gap', '--max-mean-gap'].includes(flag) || value === undefined) {
      throw new Error('usage: judge-agreement.mjs --a <scores.json> --b <scores.json> [--max-gap 0.5] [--max-mean-gap 0.2]')
    }
    options[flag.slice(2)] = value
  }
  if (!options.a || !options.b) {
    throw new Error('usage: judge-agreement.mjs --a <scores.json> --b <scores.json> [--max-gap 0.5] [--max-mean-gap 0.2]')
  }
  return options
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2))
    const thresholds = {}
    if (options['max-gap'] !== undefined) thresholds.maxGap = Number(options['max-gap'])
    if (options['max-mean-gap'] !== undefined) thresholds.maxMeanGap = Number(options['max-mean-gap'])
    const result = compareJudges(
      JSON.parse(readFileSync(options.a, 'utf8')),
      JSON.parse(readFileSync(options.b, 'utf8')),
      thresholds,
    )
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    process.exit(result.ok ? 0 : 1)
  } catch (error) {
    process.stderr.write(`${error.message}\n`)
    process.exit(2)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
