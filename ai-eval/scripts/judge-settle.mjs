#!/usr/bin/env node
/**
 * judge-settle：把判官的评分按打乱时留下的对应关系还原成基线 / 候选，并把一批结果折成统计脚本读的形状。
 *
 *   node judge-settle.mjs --results-dir <judge-run 的输出目录>
 *
 * 导出三件事：
 *   restoreScores    一个评分文件 + 那一次的映射 → 每份报告的分，已对回「基线 / 候选 + 第几份」（judge-run 调用）
 *   foldResults      一批 `<scorer>/<样本>.json` 结果 → { samples, unevaluated, … }，paired-stats 的输入形状
 *   agreementInput   一批结果 → judge-agreement 的一份输入（两个判官判同一批报告、比一致性时用）
 * 命令行读 judge-run 写的结果目录（跳过 .work），输出 foldResults 的 JSON；加 `--agreement <判官名>` 输出 agreementInput。
 *
 * 一个样本的所有 scorer 都评出来才算 `judged`；任何一个 scorer 在这个样本上是未评测，样本就是 `unevaluated`：
 * 没有任何分数，不记 0 分，不进配对。平均分与标准误不在这里算（统计脚本的事）。
 * 核心问题不在这里整理（Claude 读各 scorer 的理由、写报告时做），所以三类核心问题恒为空。
 *
 * 输出（stdout，JSON）：{ ok, samples, retry, unevaluated, summary_unevaluated, core_issues }。
 * 退出码：0 全评完，1 有未评测的样本（stdout 仍是完整 JSON），2 用法有误。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const FORMAT = 2
const SIDE_ORDER = { baseline: 0, candidate: 1 }

/** 评分文件按映射还原：[{ side, run, label, status, score?, reason }]，基线在前，同一边按第几份排。 */
export function restoreScores(scores, mapping) {
  const byLabel = new Map(scores.reports.map((cell) => [cell.label, cell]))
  return mapping.labels
    .map(({ label, side, run }) => {
      const { label: _label, ...cell } = byLabel.get(label)
      return { side, run, label, ...cell }
    })
    .sort((a, b) => SIDE_ORDER[a.side] - SIDE_ORDER[b.side] || a.run - b.run)
}

/** scorer 名 `review_report/annotations_correct` 的指标 id 是最后一段。 */
export const metricId = (scorer) => scorer.split('/').at(-1)

export function foldResults(results) {
  const bySample = new Map()
  for (const result of results) {
    if (!bySample.has(result.sample)) bySample.set(result.sample, [])
    bySample.get(result.sample).push(result)
  }
  const samples = {}
  for (const [sample, entries] of [...bySample].sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))) {
    const missing = entries.filter((entry) => entry.unevaluated)
    if (missing.length > 0) {
      samples[sample] = {
        status: 'unevaluated',
        errors: missing.map((entry) => `${entry.scorer}：${(entry.errors ?? []).join('；') || '未评测'}`),
      }
      continue
    }
    const runs = { baseline: new Map(), candidate: new Map() }
    for (const entry of entries) {
      for (const cell of entry.reports) {
        const { side, run, label, ...score } = cell
        const found = runs[side].get(run) ?? { run, label, scores: {} }
        found.scores[metricId(entry.scorer)] = score
        runs[side].set(run, found)
      }
    }
    const sorted = (side) => [...runs[side].values()].sort((a, b) => a.run - b.run)
    samples[sample] = { status: 'judged', baseline: sorted('baseline'), candidate: sorted('candidate') }
  }
  const unevaluated = Object.keys(samples).filter((sample) => samples[sample].status === 'unevaluated')
  return {
    ok: unevaluated.length === 0,
    samples,
    retry: [],
    unevaluated,
    summary_unevaluated: [],
    core_issues: { new_in_candidate: [], fixed_in_candidate: [], both: [] },
  }
}

/**
 * 一批结果整理成 judge-agreement 的输入：{ format: 1, judge, scores: { "<样本>/<边>-<第几份>": { <指标 id>: 分数 | null } } }。
 * 无法判断、不适用、未评测的格子是 null（它们没有分数）。
 */
export function agreementInput(results, judge) {
  const scores = {}
  for (const result of results) {
    for (const cell of result.reports) {
      const key = `${result.sample}/${cell.side}-${cell.run}`
      scores[key] ??= {}
      scores[key][metricId(result.scorer)] = cell.status === 'scored' ? cell.score : null
    }
  }
  return { format: 1, judge, scores }
}

function resultFiles(directory) {
  const found = []
  for (const name of readdirSync(directory).sort()) {
    if (name.startsWith('.')) continue
    const path = join(directory, name)
    if (statSync(path).isDirectory()) found.push(...resultFiles(path))
    else if (name.endsWith('.json')) found.push(path)
  }
  return found
}

export function readResults(directory) {
  return resultFiles(directory)
    .map((path) => JSON.parse(readFileSync(path, 'utf8')))
    .filter((document) => document.format === FORMAT && typeof document.scorer === 'string')
}

function main(argv) {
  try {
    const usage = 'usage: judge-settle.mjs --results-dir <目录> [--agreement <判官名>]'
    if (argv[0] !== '--results-dir' || !argv[1] || ![2, 4].includes(argv.length) || (argv.length === 4 && argv[2] !== '--agreement')) {
      throw new Error(usage)
    }
    const results = readResults(argv[1])
    if (argv.length === 4) {
      process.stdout.write(`${JSON.stringify(agreementInput(results, argv[3]), null, 2)}\n`)
      return 0
    }
    const folded = foldResults(results)
    process.stdout.write(`${JSON.stringify(folded, null, 2)}\n`)
    return folded.ok ? 0 : 1
  } catch (error) {
    process.stderr.write(`judge-settle: ${error.message}\n`)
    return 2
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2))
}
