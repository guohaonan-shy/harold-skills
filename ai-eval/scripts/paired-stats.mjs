#!/usr/bin/env node
/**
 * paired-stats：判官的分数，按样本配对算候选相对基线的差值、标准误，判退步和样本量。
 *
 *   node paired-stats.mjs --settle <judge-settle 的输出> [--describe <样本描述> --user-task <用户任务>]
 *                         [--expected a,b,...] [--threshold 0.10] [--se-factor 2] [--min-sample-runs 15]
 *
 * 脚本不认识任何项目：输入是 judge-settle 还原好的评分（基线 / 候选各若干遍），可选的样本描述（项目写，格式同
 * coverage 的描述，只用来拿每个样本的 covers），平均、标准误、退步都由脚本算，Claude 不临场算。
 *
 * 规则（准出标准第 1、3 条）：
 *   - 每个判官指标，每个样本：d = 候选几遍的平均 − 基线几遍的平均。只数有分数的格子（status scored）；
 *     「无法判断」「不适用」不进平均，也不当 0 分。一个样本某边在这个指标上一个分数都没有，这个样本不进这个指标的配对。
 *   - 对所有进配对的样本取平均 D 和标准误 SE（样本标准差 / √n）。−D > 0.10 且 −D > 2 × SE 才算退步；
 *     只有一个样本时 SE 算不出来，不拿它判退步（样本量那条会拦下）。
 *   - 未评测的样本（judge-settle 记为 unevaluated）不进任何配对。
 *   - 样本量：评出来的样本 × 遍数 < 15 判「样本不足」，给出要加几个样本。
 *   - 按 case 的诊断表：每个 case 里评出来的样本的 D；只用于诊断，不进判定（一个 case 的样本太少，标准误太大）。
 *
 * 输出（stdout，JSON）：
 *   { thresholds, evaluated, unevaluated, sampleRuns: { have, need, enough, addSamples },
 *     metrics: { <指标>: { baseline, candidate, D, SE, n, regressed, perSample } }, regressed: [<指标>],
 *     byCase: [{ case, samples, evaluated, unevaluated, metrics: { <指标>: { D, SE, n } } }], diagnosticOnly,
 *     verdict: 'unevaluated' | 'regressed' | 'insufficient' | 'pass' }
 *   verdict 的先后：没有一个样本评出来 → unevaluated；有指标退步 → regressed；样本不够 → insufficient；否则 pass。
 * 退出码：0 pass，1 其余三种（stdout 仍是完整 JSON），2 用法或输入有误（原因在 stderr）。
 */
import { fileURLToPath } from 'node:url'
import { readJson } from './read-json.mjs'

export const DEFAULTS = { threshold: 0.1, seFactor: 2, minSampleRuns: 15 }

const EPSILON = 1e-9

const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length

/** 样本标准差 / √n；不足两个样本时算不出来，是 null。 */
function standardError(values) {
  if (values.length < 2) return null
  const average = mean(values)
  const variance = values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1)
  return Math.sqrt(variance / values.length)
}

/** 退步：−D 超过阈值，并且超过 seFactor 个标准误。SE 算不出来（null）时不判退步。 */
export function judgeRegression(D, SE, { threshold = DEFAULTS.threshold, seFactor = DEFAULTS.seFactor } = {}) {
  if (D === null || SE === null) return false
  const drop = -D
  return drop > threshold + EPSILON && drop > seFactor * SE + EPSILON
}

function scoresOf(runs, metric) {
  return runs
    .map((run) => run.scores?.[metric])
    .filter((cell) => cell?.status === 'scored' && typeof cell.score === 'number')
    .map((cell) => cell.score)
}

function summarize(perSample) {
  const values = Object.values(perSample)
  if (values.length === 0) return { D: null, SE: null, n: 0 }
  return { D: mean(values), SE: standardError(values), n: values.length }
}

function checkSettle(settle, expected) {
  if (!settle || typeof settle.samples !== 'object' || settle.samples === null) {
    throw new Error("settle: not the output of judge-settle (no 'samples')")
  }
  if (Array.isArray(settle.retry) && settle.retry.length > 0) {
    throw new Error(`settle: sample(s) ${settle.retry.join(', ')} still wait for a second judging; settle them first`)
  }
  for (const [sample, entry] of Object.entries(settle.samples)) {
    if (entry.status === 'retry') throw new Error(`settle: sample ${sample} still waits for a second judging; settle it first`)
    if (entry.status === 'judged' && (!entry.baseline?.length || !entry.candidate?.length)) {
      throw new Error(`settle: sample ${sample} is judged but has no reports on ${entry.baseline?.length ? 'the candidate' : 'the baseline'} side`)
    }
  }
  const missing = (expected ?? []).filter((sample) => !settle.samples[sample])
  if (missing.length > 0) {
    throw new Error(`settle: sample(s) ${missing.join(', ')} were selected but are neither judged nor marked unevaluated`)
  }
}

export function pairedStats(settle, options = {}) {
  const { threshold, seFactor, minSampleRuns } = { ...DEFAULTS, ...options }
  checkSettle(settle, options.expected)

  const evaluated = Object.keys(settle.samples).filter((sample) => settle.samples[sample].status === 'judged')
  const unevaluated = Object.keys(settle.samples).filter((sample) => settle.samples[sample].status === 'unevaluated')

  const metricIds = []
  for (const sample of evaluated) {
    for (const run of [...settle.samples[sample].baseline, ...settle.samples[sample].candidate]) {
      for (const metric of Object.keys(run.scores ?? {})) if (!metricIds.includes(metric)) metricIds.push(metric)
    }
  }

  const perMetric = {}
  for (const metric of metricIds) {
    const perSample = {}
    const baselineMeans = []
    const candidateMeans = []
    for (const sample of evaluated) {
      const baseline = scoresOf(settle.samples[sample].baseline, metric)
      const candidate = scoresOf(settle.samples[sample].candidate, metric)
      if (baseline.length === 0 || candidate.length === 0) continue
      baselineMeans.push(mean(baseline))
      candidateMeans.push(mean(candidate))
      perSample[sample] = mean(candidate) - mean(baseline)
    }
    const { D, SE, n } = summarize(perSample)
    perMetric[metric] = {
      baseline: n ? mean(baselineMeans) : null,
      candidate: n ? mean(candidateMeans) : null,
      D,
      SE,
      n,
      regressed: judgeRegression(D, SE, { threshold, seFactor }),
      perSample,
    }
  }
  const regressed = metricIds.filter((metric) => perMetric[metric].regressed)

  const runsOf = (sample) => Math.min(settle.samples[sample].baseline.length, settle.samples[sample].candidate.length)
  const have = evaluated.reduce((sum, sample) => sum + runsOf(sample), 0)
  const perSampleRuns = evaluated.length ? Math.max(...evaluated.map(runsOf)) : 0
  const enough = have >= minSampleRuns
  const sampleRuns = {
    have,
    need: minSampleRuns,
    enough,
    addSamples: enough || perSampleRuns === 0 ? 0 : Math.ceil((minSampleRuns - have) / perSampleRuns),
  }

  let byCase = []
  if (options.describe) {
    const covered = options.describe.samples?.[options.userTask] ?? {}
    const cases = []
    for (const entry of Object.values(covered)) for (const name of entry.covers ?? []) if (!cases.includes(name)) cases.push(name)
    byCase = cases.map((name) => {
      const samples = Object.keys(covered).filter((sample) => covered[sample].covers?.includes(name))
      const metrics = {}
      for (const metric of metricIds) {
        const perSample = Object.fromEntries(samples.filter((sample) => sample in perMetric[metric].perSample).map((sample) => [sample, perMetric[metric].perSample[sample]]))
        metrics[metric] = summarize(perSample)
      }
      return {
        case: name,
        samples,
        evaluated: samples.filter((sample) => evaluated.includes(sample)),
        unevaluated: samples.filter((sample) => unevaluated.includes(sample)),
        metrics,
      }
    })
  }

  let verdict = 'pass'
  if (evaluated.length === 0) verdict = 'unevaluated'
  else if (regressed.length > 0) verdict = 'regressed'
  else if (!enough) verdict = 'insufficient'

  return {
    thresholds: { threshold, seFactor, minSampleRuns },
    evaluated,
    unevaluated,
    sampleRuns,
    metrics: perMetric,
    regressed,
    byCase,
    diagnosticOnly: true,
    verdict,
  }
}

function parseArgs(argv) {
  const args = {}
  const takes = {
    '--settle': 'settle',
    '--describe': 'describe',
    '--user-task': 'userTask',
    '--expected': 'expected',
    '--threshold': 'threshold',
    '--se-factor': 'seFactor',
    '--min-sample-runs': 'minSampleRuns',
  }
  for (let i = 0; i < argv.length; i += 1) {
    const key = takes[argv[i]]
    if (!key) throw new Error(`unknown argument ${argv[i]}`)
    args[key] = argv[++i]
  }
  if (!args.settle) throw new Error('--settle <file> is required (the output of judge-settle)')
  if (Boolean(args.describe) !== Boolean(args.userTask)) {
    throw new Error('--describe and --user-task go together (the by-case table needs both)')
  }
  return args
}

const number = (name, text) => {
  const value = Number(text)
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be a non-negative number, got ${text}`)
  return value
}

function main(argv) {
  let result
  try {
    const args = parseArgs(argv)
    const options = {}
    if (args.describe) Object.assign(options, { describe: readJson(args.describe), userTask: args.userTask })
    if (args.expected) options.expected = args.expected.split(',').map((name) => name.trim()).filter(Boolean)
    if (args.threshold !== undefined) options.threshold = number('--threshold', args.threshold)
    if (args.seFactor !== undefined) options.seFactor = number('--se-factor', args.seFactor)
    if (args.minSampleRuns !== undefined) options.minSampleRuns = number('--min-sample-runs', args.minSampleRuns)
    result = pairedStats(readJson(args.settle), options)
  } catch (error) {
    process.stderr.write(`paired-stats: ${error.message}\n`)
    return 2
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  return result.verdict === 'pass' ? 0 : 1
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2))
}
