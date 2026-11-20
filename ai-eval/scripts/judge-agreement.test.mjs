/**
 * judge-agreement 的行为。跑：
 *   `node --test ai-eval/scripts/judge-agreement.test.mjs`
 *
 * 点这个文件，不要点目录。输入是两个判官对同一批报告的评分，脚本里没有任何项目内容：下面的指标、报告名都是造出来的。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compareJudges } from './judge-agreement.mjs'

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'judge-agreement.mjs')

/** 一份判官评分：scores 是 { 报告: { 指标: 分数 | null } }，null 是判官写了「无法判断」。 */
const judgeOf = (judge, scores) => ({ format: 1, judge, scores })

const metricOf = (result, id) => result.metrics.find((metric) => metric.id === id)

test('two judges within less than a level step on every report are consistent', () => {
  const a = judgeOf('A', { r1: { tone: 1.0 }, r2: { tone: 0.5 } })
  const b = judgeOf('B', { r1: { tone: 0.75 }, r2: { tone: 0.5 } })
  const result = compareJudges(a, b)
  assert.equal(metricOf(result, 'tone').verdict, 'consistent')
  assert.equal(result.ok, true)
})

test('a whole-level gap on one report marks the metric inconsistent and names the report', () => {
  // 2026-10-23 冒烟里的实际情形：同一个「建议能不能落地」指标，一个判官扣到 0.5、另一个给 1.0
  const a = judgeOf('A', { r1: { actionable: 0.5 }, r2: { actionable: 1.0 } })
  const b = judgeOf('B', { r1: { actionable: 1.0 }, r2: { actionable: 1.0 } })
  const result = compareJudges(a, b)
  const metric = metricOf(result, 'actionable')
  assert.equal(metric.verdict, 'inconsistent')
  assert.equal(metric.maxGap, 0.5)
  assert.deepEqual(metric.gaps.filter((g) => g.gap >= 0.5).map((g) => g.report), ['r1'])
  assert.equal(result.ok, false)
})

test('small gaps that all lean the same way mark the metric inconsistent once the mean gap passes the threshold', () => {
  const a = judgeOf('A', { r1: { m: 0.75 }, r2: { m: 0.75 }, r3: { m: 0.75 } })
  const b = judgeOf('B', { r1: { m: 1.0 }, r2: { m: 1.0 }, r3: { m: 1.0 } })
  assert.equal(metricOf(compareJudges(a, b, { maxMeanGap: 0.3 }), 'm').verdict, 'consistent') // 平均差 0.25
  assert.equal(metricOf(compareJudges(a, b, { maxMeanGap: 0.2 }), 'm').verdict, 'inconsistent')
})

test('the mean gap is the mean of absolute gaps, so opposite-direction gaps do not cancel', () => {
  const a = judgeOf('A', { r1: { m: 1.0 }, r2: { m: 0.5 } })
  const b = judgeOf('B', { r1: { m: 0.75 }, r2: { m: 0.75 } })
  assert.equal(metricOf(compareJudges(a, b), 'm').meanGap, 0.25)
})

test('one judge writing "cannot tell" (null) while the other scores is inconsistent, not a zero', () => {
  const a = judgeOf('A', { r1: { m: null }, r2: { m: 1.0 } })
  const b = judgeOf('B', { r1: { m: 0.5 }, r2: { m: 1.0 } })
  const metric = metricOf(compareJudges(a, b), 'm')
  assert.equal(metric.verdict, 'inconsistent')
  assert.deepEqual(metric.oneSided, [{ report: 'r1', judge: 'A' }])
  assert.equal(metric.pairs, 1) // 只有 r2 进了差值，r1 不被当成 0 分
  assert.equal(metric.maxGap, 0)
})

test('both judges writing "cannot tell" on every report leaves the metric with no data, not consistent', () => {
  const a = judgeOf('A', { r1: { m: null } })
  const b = judgeOf('B', { r1: { m: null } })
  assert.equal(metricOf(compareJudges(a, b), 'm').verdict, 'no_data')
  assert.equal(compareJudges(a, b).ok, false)
})

test('a metric missing from one judge, a score outside 0..1, or different report sets are input errors', () => {
  const ok = judgeOf('A', { r1: { m: 1.0 } })
  assert.throws(() => compareJudges(ok, judgeOf('B', { r1: {} })), /r1.*metric 'm'/)
  assert.throws(() => compareJudges(ok, judgeOf('B', { r1: { m: 1.3 } })), /1\.3/)
  assert.throws(() => compareJudges(ok, judgeOf('B', { r2: { m: 1.0 } })), /same reports/)
  assert.throws(() => compareJudges({ format: 2, judge: 'A', scores: {} }, ok), /format/)
})

const run = (a, b, extra = []) => {
  const dir = mkdtempSync(join(tmpdir(), 'judge-agreement-'))
  writeFileSync(join(dir, 'a.json'), JSON.stringify(a))
  writeFileSync(join(dir, 'b.json'), JSON.stringify(b))
  return spawnSync('node', [SCRIPT, '--a', join(dir, 'a.json'), '--b', join(dir, 'b.json'), ...extra], { encoding: 'utf8' })
}

test('command line: exit 0 when consistent, 1 when not (stdout stays the full JSON), 2 on bad input', () => {
  const good = run(judgeOf('A', { r1: { m: 1.0 } }), judgeOf('B', { r1: { m: 1.0 } }))
  assert.equal(good.status, 0)
  assert.equal(JSON.parse(good.stdout).ok, true)

  const bad = run(judgeOf('A', { r1: { m: 0.5 } }), judgeOf('B', { r1: { m: 1.0 } }))
  assert.equal(bad.status, 1)
  assert.equal(JSON.parse(bad.stdout).metrics[0].verdict, 'inconsistent')

  const broken = run(judgeOf('A', { r1: { m: 1.0 } }), judgeOf('B', { r1: { m: 7 } }))
  assert.equal(broken.status, 2)
  assert.match(broken.stderr, /7/)
})

test('command line: --max-gap and --max-mean-gap change what counts as a disagreement', () => {
  const a = judgeOf('A', { r1: { m: 0.5 } })
  const b = judgeOf('B', { r1: { m: 1.0 } })
  assert.equal(run(a, b, ['--max-gap', '0.6', '--max-mean-gap', '0.6']).status, 0)
})
