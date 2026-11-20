/**
 * paired-stats 的行为。跑：
 *   `node --test ai-eval/scripts/paired-stats.test.mjs`
 *
 * 输入是 judge-settle 的输出（还原成基线 / 候选的评分）和项目写的样本描述，脚本里没有任何项目内容：
 * 下面的指标、样本、case 名都是造出来的。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { judgeRegression, pairedStats } from './paired-stats.mjs'

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'paired-stats.mjs')

const scored = (score) => ({ status: 'scored', score, reason: '「原文」' })
const cells = (scores) =>
  Object.fromEntries(
    Object.entries(scores).map(([metric, value]) => [
      metric,
      typeof value === 'number' ? scored(value) : { status: value },
    ]),
  )

/** 一个评完的样本。baseline / candidate：每遍一个 { 指标: 分数 | 'unable' | 'not_applicable' }。 */
const judged = (baseline, candidate) => ({
  status: 'judged',
  attempt: 1,
  baseline: baseline.map((scores, index) => ({ run: index + 1, label: index + 1, scores: cells(scores) })),
  candidate: candidate.map((scores, index) => ({ run: index + 1, label: index + 4, scores: cells(scores) })),
})

const settleOf = (samples, unevaluated = []) => ({
  ok: unevaluated.length === 0,
  samples: {
    ...samples,
    ...Object.fromEntries(unevaluated.map((name) => [name, { status: 'unevaluated', errors: ['第 1 次：没有评分文件'] }])),
  },
  retry: [],
  unevaluated,
  core_issues: { new_in_candidate: [], fixed_in_candidate: [], both: [] },
})

/** 一个样本三遍都是同一个分数。 */
const flat = (metrics, runs = 3) => Array.from({ length: runs }, () => ({ ...metrics }))

/** n 个样本，基线都是 0.9，候选的差值依次取 drops 里的数（循环使用）。 */
const withDrops = (drops, count) =>
  Object.fromEntries(
    Array.from({ length: count }, (_, index) => {
      const drop = drops[index % drops.length]
      return [`s${index + 1}`, judged(flat({ tone: 0.9 }), flat({ tone: 0.9 - drop }))]
    }),
  )

test('退步：−D > 0.10 且 −D > 2 × SE', () => {
  assert.equal(judgeRegression(-0.12, 0.015), true)
})

test('−D > 0.10 但没超过 2 × SE（噪声太大），不算退步', () => {
  assert.equal(judgeRegression(-0.11, 0.06), false)
})

test('−D 没超过 0.10，不算退步（标准误再小也不算）', () => {
  assert.equal(judgeRegression(-0.08, 0.01), false)
  assert.equal(judgeRegression(-0.1, 0.001), false)
})

test('候选比基线好（D 为正），不算退步', () => {
  assert.equal(judgeRegression(0.2, 0.01), false)
})

test('标准误算不出来（只有一个样本），不拿它判退步', () => {
  assert.equal(judgeRegression(-0.5, null), false)
})

test('每个样本的 d = 候选几遍的平均 − 基线几遍的平均', () => {
  const settle = settleOf({ A: judged(flat({ tone: 0.9 }), [{ tone: 0.8 }, { tone: 0.8 }, { tone: 0.7 }]) })

  const result = pairedStats(settle)

  assert.ok(Math.abs(result.metrics.tone.perSample.A - (0.7666666667 - 0.9)) < 1e-9)
  assert.equal(result.metrics.tone.n, 1)
})

test('一批样本的差值使 D = −0.12、SE 很小：判退步', () => {
  // 差值 −0.15、−0.12、−0.12、−0.09 循环，平均 −0.12
  const result = pairedStats(settleOf(withDrops([0.15, 0.12, 0.12, 0.09], 8)))

  assert.ok(Math.abs(result.metrics.tone.D - -0.12) < 1e-9)
  assert.ok(result.metrics.tone.SE < 0.02)
  assert.equal(result.metrics.tone.regressed, true)
  assert.deepEqual(result.regressed, ['tone'])
  assert.equal(result.verdict, 'regressed')
})

test('D = −0.11 但样本之间差得很远（SE = 0.06 量级）：不退步', () => {
  // 差值 0.01 与 0.21 交替：平均 −0.11，标准误约 0.1/√n·…
  const result = pairedStats(settleOf(withDrops([0.01, 0.21], 4)))

  assert.ok(Math.abs(result.metrics.tone.D - -0.11) < 1e-9)
  assert.ok(result.metrics.tone.SE > 0.04)
  assert.equal(result.metrics.tone.regressed, false)
})

test('D = −0.08：不退步', () => {
  const result = pairedStats(settleOf(withDrops([0.08], 6)))

  assert.ok(Math.abs(result.metrics.tone.D - -0.08) < 1e-9)
  assert.equal(result.metrics.tone.regressed, false)
  assert.equal(result.verdict, 'pass')
})

test('4 个样本 × 3 遍 = 12 < 15：样本不足，说明至少要加到 15', () => {
  const result = pairedStats(settleOf(withDrops([0], 4)))

  assert.equal(result.sampleRuns.have, 12)
  assert.equal(result.sampleRuns.need, 15)
  assert.equal(result.sampleRuns.enough, false)
  assert.equal(result.sampleRuns.addSamples, 1)
  assert.equal(result.verdict, 'insufficient')
})

test('5 个样本 × 3 遍 = 15：够了', () => {
  const result = pairedStats(settleOf(withDrops([0], 5)))

  assert.equal(result.sampleRuns.have, 15)
  assert.equal(result.sampleRuns.enough, true)
  assert.equal(result.verdict, 'pass')
})

/** 基线每个样本 3 份（分数各不相同，平均 0.9），候选 3 份（平均 0.9 − drop）：基线自己在每个样本上就在波动。 */
const spreadBaselineSamples = (drops, count) =>
  Object.fromEntries(
    Array.from({ length: count }, (_, index) => {
      const drop = drops[index % drops.length]
      const baseline = [{ tone: 0.7 }, { tone: 0.9 }, { tone: 1.1 }]
      const candidate = [{ tone: 0.6 - drop }, { tone: 0.9 - drop }, { tone: 1.2 - drop }]
      return [`s${index + 1}`, judged(baseline, candidate)]
    }),
  )

test('基线 3 份、候选 3 份：d = 候选 3 份的平均 − 基线 3 份的平均，不是某一份', () => {
  const settle = settleOf({ A: judged([{ tone: 0.5 }, { tone: 0.9 }, { tone: 0.7 }], [{ tone: 0.8 }, { tone: 0.8 }, { tone: 0.5 }]) })

  const result = pairedStats(settle)

  // 候选平均 0.7，基线平均 0.7：差 0。拿基线第 1 份（0.5）减会得 +0.2，拿第 2 份（0.9）减会得 −0.2。
  assert.ok(Math.abs(result.metrics.tone.perSample.A) < 1e-9)
  assert.ok(Math.abs(result.metrics.tone.baseline - 0.7) < 1e-9)
})

test('基线 3 份、候选 3 份：退步 / 不退步 / 噪声大不退步 三个例子', () => {
  const regressed = pairedStats(settleOf(spreadBaselineSamples([0.15, 0.12, 0.12, 0.09], 8)))
  assert.equal(regressed.metrics.tone.regressed, true)
  assert.equal(regressed.verdict, 'regressed')

  const fine = pairedStats(settleOf(spreadBaselineSamples([0.08], 6)))
  assert.equal(fine.metrics.tone.regressed, false)
  assert.equal(fine.verdict, 'pass')

  const noisy = pairedStats(settleOf(spreadBaselineSamples([0.01, 0.21], 4)))
  assert.ok(Math.abs(noisy.metrics.tone.D - -0.11) < 1e-9)
  assert.equal(noisy.metrics.tone.regressed, false)
})

test('未评测的样本不进配对，不记 0 分；样本数从剩下的算', () => {
  // 5 个样本里 1 个未评测：剩 4 × 3 = 12
  const evaluated = withDrops([0], 4)
  const result = pairedStats(settleOf(evaluated, ['s5']))

  assert.deepEqual(result.unevaluated, ['s5'])
  assert.equal(result.metrics.tone.n, 4)
  assert.equal(result.metrics.tone.D, 0)
  assert.equal(result.sampleRuns.have, 12)
  assert.equal(result.verdict, 'insufficient')
})

test('全部样本都没评出来：未评测', () => {
  const result = pairedStats(settleOf({}, ['a', 'b']))

  assert.equal(result.verdict, 'unevaluated')
  assert.deepEqual(result.unevaluated, ['a', 'b'])
  assert.deepEqual(result.metrics, {})
})

test('无法判断和不适用的格子不进平均，不当 0 分', () => {
  const settle = settleOf({
    A: judged(
      [{ tone: 0.9, tail: 'not_applicable' }, { tone: 0.5, tail: 'not_applicable' }, { tone: 'unable', tail: 'not_applicable' }],
      [{ tone: 0.9, tail: 'not_applicable' }, { tone: 0.9, tail: 'not_applicable' }, { tone: 0.9, tail: 'not_applicable' }],
    ),
    B: judged(flat({ tone: 0.5, tail: 0.5 }), flat({ tone: 0.5, tail: 0.3 })),
  })

  const result = pairedStats(settle)

  // A 的基线只有两遍有分：平均 0.7；候选 0.9
  assert.ok(Math.abs(result.metrics.tone.perSample.A - 0.2) < 1e-9)
  // tail 在 A 上整个不适用：只有 B 进配对
  assert.deepEqual(Object.keys(result.metrics.tail.perSample), ['B'])
  assert.equal(result.metrics.tail.n, 1)
  assert.ok(Math.abs(result.metrics.tail.D - -0.2) < 1e-9)
})

test('基线分与候选分是各自进配对的样本上的平均', () => {
  const result = pairedStats(settleOf({ A: judged(flat({ tone: 0.8 }), flat({ tone: 0.6 })), B: judged(flat({ tone: 0.6 }), flat({ tone: 0.6 })) }))

  assert.ok(Math.abs(result.metrics.tone.baseline - 0.7) < 1e-9)
  assert.ok(Math.abs(result.metrics.tone.candidate - 0.6) < 1e-9)
})

test('按 case 的诊断表：每个 case 里评出来的样本的配对差值，覆盖了哪些样本', () => {
  const settle = settleOf(
    {
      A: judged(flat({ tone: 0.9 }), flat({ tone: 0.5 })),
      B: judged(flat({ tone: 0.9 }), flat({ tone: 0.9 })),
      C: judged(flat({ tone: 0.9 }), flat({ tone: 0.9 })),
    },
    ['D'],
  )
  const describe = {
    format: 1,
    userTasks: { report: ['x'] },
    samples: {
      report: {
        A: { reaches: ['x'], covers: ['听力'] },
        B: { reaches: ['x'], covers: ['听力', '发音'] },
        C: { reaches: ['x'], covers: ['发音'] },
        D: { reaches: ['x'], covers: ['发音'] },
      },
    },
  }

  const result = pairedStats(settle, { describe, userTask: 'report' })

  const byCase = Object.fromEntries(result.byCase.map((row) => [row.case, row]))
  assert.deepEqual(byCase['听力'].samples, ['A', 'B'])
  assert.ok(Math.abs(byCase['听力'].metrics.tone.D - -0.2) < 1e-9)
  assert.equal(byCase['听力'].metrics.tone.n, 2)
  assert.deepEqual(byCase['发音'].samples, ['B', 'C', 'D'])
  assert.deepEqual(byCase['发音'].unevaluated, ['D'])
  assert.equal(byCase['发音'].metrics.tone.n, 2)
  assert.equal(result.diagnosticOnly, true)
})

test('按 case 的结果不进判定：某个 case 里掉得很厉害，整体判定不受影响', () => {
  const settle = settleOf({
    ...withDrops([0], 5),
    s6: judged(flat({ tone: 0.9 }), flat({ tone: 0.2 })),
  })
  const describe = {
    format: 1,
    userTasks: { report: ['x'] },
    samples: { report: { s6: { reaches: ['x'], covers: ['听力'] } } },
  }

  const result = pairedStats(settle, { describe, userTask: 'report' })

  assert.equal(result.byCase[0].metrics.tone.D < -0.6, true)
  assert.equal(result.metrics.tone.regressed, false)
  assert.equal(result.verdict, 'pass')
})

test('还有要重判的样本：输入没走完判官这一步，报错', () => {
  const settle = { ...settleOf(withDrops([0], 5)), retry: ['s9'] }

  assert.throws(() => pairedStats(settle), /s9/)
})

test('选了的样本在评分里既没评完也没标未评测：报错，不悄悄少算', () => {
  assert.throws(() => pairedStats(settleOf(withDrops([0], 5)), { expected: ['s1', 'gone'] }), /gone/)
})

test('一边的遍数是空的：报错', () => {
  const settle = settleOf({ A: { status: 'judged', baseline: [], candidate: [{ run: 1, label: 1, scores: cells({ tone: 1 }) }] } })

  assert.throws(() => pairedStats(settle), /A/)
})

test('样本量下限可以改', () => {
  const result = pairedStats(settleOf(withDrops([0], 4)), { minSampleRuns: 12 })

  assert.equal(result.sampleRuns.enough, true)
})

function runCli(args, files) {
  const dir = mkdtempSync(join(tmpdir(), 'paired-stats-'))
  const paths = {}
  for (const [name, content] of Object.entries(files)) {
    paths[name] = join(dir, `${name}.json`)
    writeFileSync(paths[name], JSON.stringify(content))
  }
  const resolved = args.map((arg) => (arg.startsWith('@') ? paths[arg.slice(1)] : arg))
  return spawnSync('node', [SCRIPT, ...resolved], { encoding: 'utf8' })
}

test('命令行：不退步且样本够，退出码 0，stdout 是 JSON', () => {
  const run = runCli(['--settle', '@settle'], { settle: settleOf(withDrops([0.02], 6)) })

  assert.equal(run.status, 0, run.stderr)
  assert.equal(JSON.parse(run.stdout).verdict, 'pass')
})

test('命令行：退步，退出码 1，stdout 仍是完整 JSON', () => {
  const run = runCli(['--settle', '@settle'], { settle: settleOf(withDrops([0.15, 0.12, 0.12, 0.09], 8)) })

  assert.equal(run.status, 1)
  assert.deepEqual(JSON.parse(run.stdout).regressed, ['tone'])
})

test('命令行：样本不足，退出码 1', () => {
  const run = runCli(['--settle', '@settle'], { settle: settleOf(withDrops([0], 4)) })

  assert.equal(run.status, 1)
  assert.equal(JSON.parse(run.stdout).verdict, 'insufficient')
})

test('命令行：用法或输入有误，退出码 2，原因在 stderr', () => {
  const noArgs = spawnSync('node', [SCRIPT], { encoding: 'utf8' })
  assert.equal(noArgs.status, 2)
  assert.match(noArgs.stderr, /--settle/)

  const retry = runCli(['--settle', '@settle'], { settle: { ...settleOf(withDrops([0], 5)), retry: ['s9'] } })
  assert.equal(retry.status, 2)
  assert.match(retry.stderr, /s9/)
})

test('命令行：--describe 和 --user-task 要一起给', () => {
  const run = runCli(['--settle', '@settle', '--describe', '@describe'], {
    settle: settleOf(withDrops([0], 5)),
    describe: { format: 1, userTasks: {}, samples: {} },
  })

  assert.equal(run.status, 2)
  assert.match(run.stderr, /--user-task/)
})
