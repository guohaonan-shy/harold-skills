/**
 * judge-settle 的行为：评分按打乱时留下的对应关系还原，一批结果折成统计脚本读的形状。跑：
 *   `node --test ai-eval/scripts/judge-settle.test.mjs`
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { agreementInput, foldResults, metricId, readResults, restoreScores } from './judge-settle.mjs'
import { compareJudges } from './judge-agreement.mjs'
import { packJob } from './judge-pack.mjs'
import { pairedStats } from './paired-stats.mjs'

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'judge-settle.mjs')

const MAPPING = {
  labels: [
    { label: 1, side: 'candidate', run: 2 },
    { label: 2, side: 'baseline', run: 1 },
    { label: 3, side: 'candidate', run: 1 },
    { label: 4, side: 'baseline', run: 3 },
    { label: 5, side: 'candidate', run: 3 },
    { label: 6, side: 'baseline', run: 2 },
  ],
}
const cell = (label, score) => ({ label, status: 'scored', score, reason: `「报告 ${label}」` })

test('还原：每个分对回正确的一边和第几份，基线在前、候选按遍数排', () => {
  const scores = { format: 2, reports: [cell(1, 0.25), cell(2, 1), cell(3, 0.5), cell(4, 0.8), cell(5, 0.75), cell(6, 0.9)] }

  const restored = restoreScores(scores, MAPPING)

  assert.deepEqual(
    restored.map(({ side, run, label, score }) => [side, run, label, score]),
    [['baseline', 1, 2, 1], ['baseline', 2, 6, 0.9], ['baseline', 3, 4, 0.8], ['candidate', 1, 3, 0.5], ['candidate', 2, 1, 0.25], ['candidate', 3, 5, 0.75]],
  )
  assert.equal(restored[0].reason, '「报告 2」')
})

test('还原：无法判断和不适用跟着走，仍然没有分数', () => {
  const scores = { format: 2, reports: [cell(1, 0.5), { label: 2, status: 'unable', reason: '缺原文' }, cell(3, 0.5), cell(4, 0.5), cell(5, 0.5), cell(6, 0.5)] }

  const restored = restoreScores(scores, MAPPING)

  assert.equal(restored[0].status, 'unable')
  assert.ok(!('score' in restored[0]))
})

test('打包 → 还原：用 judge-pack 真打乱出的映射还原，分数落在对的报告上', () => {
  const documents = ['A', 'B', 'C', 'D', 'E', 'F'].map((tag) => ({ report: { tag } }))
  const job = {
    format: 2, user_task: 't', scorer: 't/s', sample: '1', description: 'd', reads: [{ path: 'report.tag', name: '标记' }], compare_with: [], expected: null,
    reports: [
      { side: 'baseline', run: 1, document: documents[0] },
      { side: 'baseline', run: 2, document: documents[1] },
      { side: 'baseline', run: 3, document: documents[2] },
      { side: 'candidate', run: 1, document: documents[3] },
      { side: 'candidate', run: 2, document: documents[4] },
      { side: 'candidate', run: 3, document: documents[5] },
    ],
  }
  // 判官按标签打分：A 得 0.1，B 得 0.2……；换几个种子，打乱成不同的顺序都要对回去
  const scoreOf = { A: 0.1, B: 0.2, C: 0.3, D: 0.4, E: 0.5, F: 0.6 }
  for (const seed of [99, 100, 101, 102, 103]) {
    const { blind, mapping } = packJob(job, { seed })
    const scores = { format: 2, reports: blind.reports.map((report) => cell(report.label, scoreOf[report.fragments[0].value])) }

    const restored = restoreScores(scores, mapping)

    assert.deepEqual(
      restored.map(({ side, run, score }) => [side, run, score]),
      [['baseline', 1, 0.1], ['baseline', 2, 0.2], ['baseline', 3, 0.3], ['candidate', 1, 0.4], ['candidate', 2, 0.5], ['candidate', 3, 0.6]],
    )
  }
})

const result = (scorer, sample, scoresByReport, extra = {}) => ({
  format: 2,
  scorer,
  sample,
  unevaluated: false,
  reports: scoresByReport.map(([side, run, score], index) => ({ side, run, label: index + 1, status: 'scored', score, reason: 'r' })),
  errors: [],
  ...extra,
})

test('指标 id 取 scorer 名的最后一段', () => {
  assert.equal(metricId('review_report/annotations_correct'), 'annotations_correct')
})

test('折叠：一个样本的各个 scorer 合成一份，指标 id 当键，paired-stats 能直接读', () => {
  const rows = [
    result('r/tone', '1', [['baseline', 1, 0.8], ['baseline', 2, 0.8], ['baseline', 3, 0.7], ['candidate', 1, 0.6], ['candidate', 2, 0.6], ['candidate', 3, 0.6]]),
    result('r/clarity', '1', [['baseline', 1, 0.5], ['baseline', 2, 0.5], ['baseline', 3, 0.5], ['candidate', 1, 0.5], ['candidate', 2, 0.5], ['candidate', 3, 0.5]]),
  ]

  const folded = foldResults(rows)

  assert.equal(folded.ok, true)
  assert.deepEqual(folded.unevaluated, [])
  const sample = folded.samples['1']
  assert.equal(sample.status, 'judged')
  assert.deepEqual(sample.baseline.map((run) => run.run), [1, 2, 3])
  assert.deepEqual(sample.candidate.map((run) => run.run), [1, 2, 3])
  assert.deepEqual(Object.keys(sample.baseline[0].scores).sort(), ['clarity', 'tone'])
  assert.equal(sample.candidate[0].scores.tone.score, 0.6)
  assert.doesNotThrow(() => pairedStats(folded, { threshold: 0.1 }))
})

test('折叠：任何一个 scorer 在这个样本上未评测，样本就是未评测，没有任何分数', () => {
  const rows = [
    result('r/tone', '2', [['baseline', 1, 0.8], ['candidate', 1, 0.6]]),
    { format: 2, scorer: 'r/clarity', sample: '2', unevaluated: true, reports: [], errors: ['第 1 次：没有评分文件', '第 2 次：没有评分文件'] },
    result('r/tone', '3', [['baseline', 1, 0.8], ['candidate', 1, 0.6]]),
  ]

  const folded = foldResults(rows)

  assert.equal(folded.ok, false)
  assert.deepEqual(folded.unevaluated, ['2'])
  assert.equal(folded.samples['2'].status, 'unevaluated')
  assert.ok(!('baseline' in folded.samples['2']))
  assert.match(folded.samples['2'].errors.join('\n'), /r\/clarity.*没有评分文件/s)
  assert.equal(folded.samples['3'].status, 'judged')
})

test('命令行：读结果目录（跳过 .work 和不是结果的文件），未评测退出 1', () => {
  const dir = mkdtempSync(join(tmpdir(), 'judge-settle-'))
  mkdirSync(join(dir, 'r', 'tone'), { recursive: true })
  mkdirSync(join(dir, '.work', 'x'), { recursive: true })
  writeFileSync(join(dir, 'r', 'tone', '1.json'), JSON.stringify(result('r/tone', '1', [['baseline', 1, 0.8], ['candidate', 1, 0.6]])))
  writeFileSync(join(dir, 'r', 'tone', '1.input.md'), '# 提示')
  writeFileSync(join(dir, '.work', 'x', 'scores.json'), JSON.stringify({ format: 2, reports: [] }))

  const ok = spawnSync('node', [SCRIPT, '--results-dir', dir], { encoding: 'utf8' })

  assert.equal(ok.status, 0, ok.stderr)
  assert.deepEqual(Object.keys(JSON.parse(ok.stdout).samples), ['1'])
  assert.equal(readResults(dir).length, 1)

  writeFileSync(join(dir, 'r', 'tone', '2.json'), JSON.stringify({ format: 2, scorer: 'r/tone', sample: '2', unevaluated: true, reports: [], errors: [] }))
  assert.equal(spawnSync('node', [SCRIPT, '--results-dir', dir], { encoding: 'utf8' }).status, 1)
  assert.equal(spawnSync('node', [SCRIPT], { encoding: 'utf8' }).status, 2)
})

test('一致性输入：每份报告一个键，无法判断和未评测是 null，可以直接喂 judge-agreement', () => {
  const unable = { ...result('r/tone', '1', [['baseline', 1, 0.8], ['candidate', 1, 0.6]]) }
  unable.reports[1] = { ...unable.reports[1], status: 'unable', reason: '缺原文' }
  delete unable.reports[1].score
  const a = agreementInput([unable, result('r/clarity', '1', [['baseline', 1, 0.5], ['candidate', 1, 0.5]])], 'A')
  const b = agreementInput([result('r/tone', '1', [['baseline', 1, 0.7], ['candidate', 1, 0.6]]), result('r/clarity', '1', [['baseline', 1, 0.5], ['candidate', 1, 0.5]])], 'B')

  assert.deepEqual(a.scores['1/baseline-1'], { tone: 0.8, clarity: 0.5 })
  assert.deepEqual(a.scores['1/candidate-1'], { tone: null, clarity: 0.5 })
  const compared = compareJudges(a, b)
  assert.equal(compared.metrics.find((metric) => metric.id === 'clarity').verdict, 'consistent')
  assert.equal(compared.metrics.find((metric) => metric.id === 'tone').oneSided.length, 1)
})

test('命令行：--agreement 输出一致性输入', () => {
  const dir = mkdtempSync(join(tmpdir(), 'judge-settle-'))
  mkdirSync(join(dir, 'r', 'tone'), { recursive: true })
  writeFileSync(join(dir, 'r', 'tone', '1.json'), JSON.stringify(result('r/tone', '1', [['baseline', 1, 0.8]])))

  const run = spawnSync('node', [SCRIPT, '--results-dir', dir, '--agreement', 'A'], { encoding: 'utf8' })

  assert.equal(run.status, 0, run.stderr)
  assert.deepEqual(JSON.parse(run.stdout), { format: 1, judge: 'A', scores: { '1/baseline-1': { tone: 0.8 } } })
})
