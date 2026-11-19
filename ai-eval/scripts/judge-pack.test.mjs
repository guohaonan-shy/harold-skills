/**
 * judge-pack 的行为：把一个判官任务（一个 scorer × 一个样本）打乱成判官看的内容，并写出完整提示。跑：
 *   `node --test ai-eval/scripts/judge-pack.test.mjs`
 *
 * 脚本里没有任何项目内容：下面的 scorer、字段、样本名都是造出来的。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PROMPT_FILE, extractPath, packJob, renderInput } from './judge-pack.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const PACK = join(here, 'judge-pack.mjs')

const DESCRIPTION = [
  '你是一位资深审稿人。给每份报告的批注打一个 0 到 1 的分。',
  '',
  '### 读什么',
  '',
  '#### 报告片段（打分对象）',
  '',
  '| 字段 | 中文名 | 是什么 |',
  '|---|---|---|',
  '| `report.notes[].text` | 批注文字 | 每条批注的文字 |',
  '| `report.notes[].kind` | 批注种类 | issue 或 good |',
  '',
  '#### 参照（不打分）',
  '',
  '| 字段 | 中文名 | 是什么 |',
  '|---|---|---|',
  '| `report.user_text` | 用户的原文 | 用户写的原文 |',
  '',
  '#### 样本期望',
  '',
  '用 expected_output 的 main_issues。',
].join('\n')

const document = (tag) => ({
  report: {
    user_text: '用户的原文',
    notes: [
      { text: `${tag} 批注一`, kind: 'issue', internal_trace: `${tag}-中间稿` },
      { text: `${tag} 批注二`, kind: 'good', internal_trace: `${tag}-中间稿` },
    ],
    hidden_summary: `${tag}-没被点名`,
  },
  commentary: { analysis: `${tag}-推理稿` },
})

const reports = () => [
  { side: 'baseline', run: 1, document: document('BASE1') },
  { side: 'baseline', run: 2, document: document('BASE2') },
  { side: 'baseline', run: 3, document: document('BASE3') },
  { side: 'candidate', run: 1, document: document('CAND1') },
  { side: 'candidate', run: 2, document: document('CAND2') },
  { side: 'candidate', run: 3, document: document('CAND3') },
]

const job = (overrides = {}) => ({
  format: 2,
  user_task: 'report',
  scorer: 'report/notes_correct',
  sample: '3',
  description: DESCRIPTION,
  reads: [{ path: 'report.notes[].text', name: '批注文字' }, { path: 'report.notes[].kind', name: '批注种类' }],
  compare_with: [{ path: 'report.user_text', name: '用户的原文' }],
  expected: { main_issues: ['语气太直'] },
  reports: reports(),
  ...overrides,
})

test('取字段：[] 展开列表，缺的位置留 null，嵌套的列表保持嵌套', () => {
  const doc = { report: { a: [{ x: 1, y: [{ z: 'p' }, { z: 'q' }] }, { y: [] }], flat: 'f' } }

  assert.equal(extractPath(doc, 'report.flat'), 'f')
  assert.deepEqual(extractPath(doc, 'report.a[].x'), [1, null])
  assert.deepEqual(extractPath(doc, 'report.a[].y[].z'), [['p', 'q'], []])
  assert.equal(extractPath(doc, 'report.nothing'), null)
  assert.equal(extractPath(doc, 'report.flat[].x'), null)
})

test('打包：判官看到的文件只含 scorer 点名的字段，用表里的中文名标名；没点名的字段和推理稿一个字也不给', () => {
  const { blind } = packJob(job(), { seed: 7 })

  assert.equal(blind.reports.length, 6)
  for (const report of blind.reports) {
    assert.deepEqual(report.fragments.map((fragment) => fragment.name), ['批注文字', '批注种类', '用户的原文'])
  }
  const text = JSON.stringify(blind.reports) // description 里的表写着路径，报告片段里只有中文名
  assert.doesNotMatch(text, /internal_trace|-中间稿|-没被点名|-推理稿|report\./)
  assert.deepEqual(blind.expected, { main_issues: ['语气太直'] })
})

test('打包：报告打乱、只标 1–N，看不出哪份是基线，也没有遍数、边和样本编号的痕迹', () => {
  const { blind, mapping } = packJob(job(), { seed: 7 })

  assert.deepEqual(blind.reports.map((report) => report.label), [1, 2, 3, 4, 5, 6])
  const text = JSON.stringify(blind)
  assert.doesNotMatch(text, /baseline|candidate|"run"|"side"|"sample"|"seed"/)
  assert.equal(mapping.seed, 7)
  assert.deepEqual(mapping.expect, { reports: 6 })
})

test('打乱 → 还原：编号对应的基线 / 候选一份都不丢、不串', () => {
  const { blind, mapping } = packJob(job(), { seed: 11 })

  const tagOf = (side, run) => (side === 'baseline' ? `BASE${run}` : `CAND${run}`)
  assert.equal(mapping.labels.length, 6)
  for (const { label, side, run } of mapping.labels) {
    const shown = blind.reports[label - 1].fragments[0].value
    assert.deepEqual(shown, [`${tagOf(side, run)} 批注一`, `${tagOf(side, run)} 批注二`])
  }
  assert.deepEqual(
    mapping.labels.map(({ side, run }) => `${side}-${run}`).sort(),
    ['baseline-1', 'baseline-2', 'baseline-3', 'candidate-1', 'candidate-2', 'candidate-3'],
  )
})

test('同一个种子打乱得一样；换种子会换顺序；不给种子也能打包并把种子记下来', () => {
  const orders = (seed) => packJob(job(), { seed })
  const key = (packed) => packed.mapping.labels.map(({ side, run }) => `${side}${run}`).join(',')

  assert.equal(key(orders(5)), key(orders(5)))
  const seen = new Set([...Array(20).keys()].map((seed) => key(orders(seed))))
  assert.ok(seen.size > 1, '二十个种子应当打乱出不止一种顺序')
  assert.ok(Number.isInteger(packJob(job()).mapping.seed))
})

test('只判基线：基线 3 份打乱成报告 1–3，各自还原到第几份', () => {
  const { blind, mapping } = packJob(job({ reports: reports().slice(0, 3) }), { seed: 1 })

  assert.equal(blind.reports.length, 3)
  assert.deepEqual(mapping.expect, { reports: 3 })
  for (const { label, side, run } of mapping.labels) {
    assert.equal(side, 'baseline')
    assert.deepEqual(blind.reports[label - 1].fragments[0].value, [`BASE${run} 批注一`, `BASE${run} 批注二`])
  }
  assert.deepEqual(mapping.labels.map(({ run }) => run).sort(), [1, 2, 3])
})

test('冒烟用法：只有一份报告也能打包', () => {
  const { blind, mapping } = packJob(job({ reports: [reports()[0]] }), { seed: 1 })

  assert.equal(blind.reports.length, 1)
  assert.deepEqual(mapping.labels, [{ label: 1, side: 'baseline', run: 1 }])
})

test('6 份报告里 6 个内容各出现一次，不管打乱成什么顺序：候选 3 份和基线 3 份一份不丢、不串', () => {
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const { blind, mapping } = packJob(job(), { seed })
    const shown = blind.reports.map((report) => report.fragments[0].value[0].split(' ')[0]).sort()
    assert.deepEqual(shown, ['BASE1', 'BASE2', 'BASE3', 'CAND1', 'CAND2', 'CAND3'])
    for (const { label, side, run } of mapping.labels) {
      const tag = `${side === 'baseline' ? 'BASE' : 'CAND'}${run}`
      assert.equal(blind.reports[label - 1].fragments[0].value[0], `${tag} 批注一`)
    }
  }
})

test('任务写错：没有报告、reads 为空、description 缺失、边不认识 → 抛错，不悄悄少给', () => {
  assert.throws(() => packJob(job({ reports: [] })), /没有报告/)
  assert.throws(() => packJob(job({ reads: [] })), /reads/)
  assert.throws(() => packJob(job({ reads: ['report.notes[].text'] })), /reads/) // 只有路径、没有中文名
  assert.throws(() => packJob(job({ compare_with: [{ path: 'report.user_text', name: '批注文字' }] })), /name 批注文字 出现了不止一次/)
  assert.throws(() => packJob(job({ compare_with: [{ path: 'report.notes[].kind', name: '别名' }] })), /path report.notes\[\]\.kind 出现了不止一次/)
  assert.throws(() => packJob(job({ description: '' })), /description/)
  assert.throws(() => packJob(job({ reports: [{ side: 'other', run: 1, document: {} }] })), /side/)
  // 同一边的同一份出现两次：还原时分不清分数归谁
  assert.throws(() => packJob(job({ reports: [reports()[0], reports()[0]] })), /baseline 第 1 份出现了 2 次/)
  assert.throws(() => packJob(job({ format: 1 })), /format/)
  assert.throws(() => packJob(job({ expected: [] })), /expected/)
})

test('完整提示：固定提示、description 原文、期望、编号过的报告片段，看不出哪份是基线', () => {
  const { blind } = packJob(job(), { seed: 7 })
  const fixed = readFileSync(PROMPT_FILE, 'utf8')

  const input = renderInput(blind, fixed)

  assert.ok(input.startsWith(fixed.trim()))
  assert.ok(input.includes(DESCRIPTION), 'description 原文整段在里面')
  assert.match(input, /"main_issues"/)
  for (const label of [1, 2, 3, 4, 5, 6]) assert.match(input, new RegExp(`## 报告 ${label}\\n`))
  assert.match(input, /### 批注文字\n/)
  assert.match(input, /### 用户的原文\n/)
  assert.doesNotMatch(input.split('# 报告')[1], /report\./) // 片段只写中文名，不露路径
  // 报告内容里的 BASE / CAND 是这个测试造数据时的标记，用来对映射；版面和固定提示里不能有边的字样
  assert.doesNotMatch(input, /baseline|candidate|基线|候选/i)
  assert.doesNotMatch(input, /internal_trace|-中间稿|-推理稿/)
})

test('完整提示：不读期望的 scorer 写明「不读样本期望」，不放空期望', () => {
  const { blind } = packJob(job({ expected: null }), { seed: 7 })

  const input = renderInput(blind, '固定提示')

  assert.match(input, /这个评分标准不读样本期望/)
  assert.doesNotMatch(input, /"main_issues"/)
})

test('命令行：写 input.md 和私有的 mapping.json；缺参数退出 2', () => {
  const dir = mkdtempSync(join(tmpdir(), 'judge-pack-'))
  const jobFile = join(dir, 'job.json')
  writeFileSync(jobFile, JSON.stringify(job()))

  const ok = spawnSync('node', [PACK, '--job', jobFile, '--out-dir', join(dir, 'out'), '--seed', '3'], { encoding: 'utf8' })

  assert.equal(ok.status, 0, ok.stderr)
  const mapping = JSON.parse(readFileSync(join(dir, 'out', 'mapping.json'), 'utf8'))
  assert.equal(mapping.labels.length, 6)
  assert.match(readFileSync(join(dir, 'out', 'input.md'), 'utf8'), /## 报告 6/)
  assert.equal(spawnSync('node', [PACK, '--job', jobFile], { encoding: 'utf8' }).status, 2)
})
