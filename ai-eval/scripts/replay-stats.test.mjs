/**
 * replay-stats 的行为。跑：
 *   `node --test ai-eval/scripts/replay-stats.test.mjs`
 *
 * 输入是回放脚本写的结果文件（每行一个 JSON），脚本里没有任何项目内容：下面的 case、group、
 * 变体名都是造出来的。数值断言都是手算的，不是把脚本的输出抄回来：
 *   - pass¹ 是 过了的次数 / 有判定的次数；pass³ 是三次全过的 case 数 / case 数；
 *   - 只有 2 个 group 时，重抽出来的差只可能是「两组各自的差」和「它们的平均」三个值，
 *     所以 95% 区间的两端等于最小和最大的那个组差，不依赖随机种子。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'replay-stats.mjs')

/** 一行结果。 */
const row = (caseId, group, variant, run, pass, extra = {}) => ({
  case: caseId, group, variant, run, status: 'ok', pass, score: null, ...extra,
})

/**
 * 按「T / F / ? 三个字符」造 3 次运行的行：T 过、F 没过、? 没法判（pass 是 null）。
 * spec：{ <变体>: { <case>: 'TTF', ... } }，groups：{ <case>: <group> }。
 */
function rowsOf(spec, groups) {
  return Object.entries(spec).flatMap(([variant, cases]) =>
    Object.entries(cases).flatMap(([caseId, runs]) =>
      [...runs].map((c, i) => row(caseId, groups[caseId], variant, i + 1, c === 'T' ? true : c === 'F' ? false : null)),
    ),
  )
}

const GROUPS = { c1: 'g1', c2: 'g1', c3: 'g1', c4: 'g2', c5: 'g2', c6: 'g2' }
// baseline：过 3+2+1+3+0+2 = 11 / 18，三次全过的 case 是 c1、c4，2 / 6
// new：过 3+3+2+3+2+3 = 16 / 18，三次全过的 case 是 c1、c2、c4、c6，4 / 6
const BASELINE = { c1: 'TTT', c2: 'TTF', c3: 'TFF', c4: 'TTT', c5: 'FFF', c6: 'TTF' }
const NEW = { c1: 'TTT', c2: 'TTT', c3: 'TTF', c4: 'TTT', c5: 'TTF', c6: 'TTT' }

/** 把行写成结果文件，返回路径。 */
function writeResults(rows, name = 'results.jsonl') {
  const dir = mkdtempSync(join(tmpdir(), 'replay-stats-'))
  const file = join(dir, name)
  writeFileSync(file, rows.map((r) => JSON.stringify(r)).join('\n') + '\n')
  return file
}

function run(args) {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' })
  let json = null
  try { json = JSON.parse(result.stdout) } catch { /* stdout 不是 JSON：用例自己断言 */ }
  return { status: result.status, json, stdout: result.stdout, stderr: result.stderr }
}

const approx = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-9, `${message ?? ''} ${actual} != ${expected}`)

test('还剩平台报错：退出码 1，点名剩几行，不给任何差值和通过率', () => {
  const rows = rowsOf({ baseline: BASELINE, new: NEW }, GROUPS)
  const bad = rows.find((r) => r.variant === 'new' && r.case === 'c5' && r.run === 3)
  Object.assign(bad, { status: 'platform_error', pass: null })
  const { status, json, stderr } = run(['--results', writeResults(rows)])
  assert.equal(status, 1, stderr)
  assert.equal(json.verdict, 'platform_error')
  assert.equal(json.remaining, 1)
  assert.deepEqual(json.rows, [{ case: 'c5', variant: 'new', run: 3 }])
  assert.equal(json.variants, undefined, '拒绝出数时不给通过率')
  assert.equal(json.comparisons, undefined, '拒绝出数时不给差值')
  assert.doesNotMatch(JSON.stringify(json), /interval|delta/i)
})

test('平台报错行重跑成功（后面追加同一个键的 ok 行）后，不再拒绝', () => {
  const rows = rowsOf({ baseline: BASELINE, new: NEW }, GROUPS)
  const bad = rows.find((r) => r.variant === 'new' && r.case === 'c5' && r.run === 3)
  Object.assign(bad, { status: 'platform_error', pass: null })
  const rerun = row('c5', 'g2', 'new', 3, false)
  const { status, json } = run(['--results', writeResults([...rows, rerun])])
  assert.equal(status, 0)
  assert.equal(json.variants.new.passes, 16)
})

test('全部 ok：pass¹ 和 pass³ 等于手算，对 baseline 的差带 95% 区间，两次运行区间相同', () => {
  const file = writeResults(rowsOf({ baseline: BASELINE, new: NEW }, GROUPS))
  const first = run(['--results', file])
  const second = run(['--results', file])
  assert.equal(first.status, 0, first.stderr)

  const { baseline, new: candidate } = first.json.variants
  assert.equal(baseline.judged, 18)
  assert.equal(baseline.passes, 11)
  approx(baseline.pass1, 11 / 18)
  assert.equal(baseline.cases, 6)
  assert.equal(baseline.pass3.passed, 2)
  approx(baseline.pass3.rate, 2 / 6)
  assert.equal(candidate.passes, 16)
  approx(candidate.pass1, 16 / 18)
  assert.equal(candidate.pass3.passed, 4)
  approx(candidate.pass3.rate, 4 / 6)

  // baseline 本身不和自己比
  assert.deepEqual(Object.keys(first.json.comparisons), ['new'])
  const cmp = first.json.comparisons.new.pass1
  approx(cmp.delta, 5 / 18)
  // g1 里 baseline 过 6/9、new 过 8/9，差 2/9；g2 里 5/9 对 8/9，差 3/9。重抽只可能得到 2/9、5/18、1/3
  approx(cmp.interval[0], 2 / 9)
  approx(cmp.interval[1], 1 / 3)
  assert.equal(cmp.groups, 2)
  assert.equal(cmp.resamples, 2000)
  assert.equal(first.json.comparisons.new.verdict, 'better')
  assert.equal(first.json.comparisons.new.label, '变好')

  assert.deepEqual(first.json.comparisons, second.json.comparisons)
})

test('差的区间整个在 0 以上判「变好」，整个在 0 以下判「变差」，跨 0 判「持平」', () => {
  // 每个 group 里 new 都比 baseline 多过一次 → 变好；都少过一次 → 变差；一个组多一个组少 → 持平
  const better = rowsOf({
    baseline: { c1: 'TFF', c2: 'TFF', c3: 'TFF', c4: 'TFF', c5: 'TFF', c6: 'TFF' },
    new: { c1: 'TTF', c2: 'TTF', c3: 'TTF', c4: 'TTF', c5: 'TTF', c6: 'TTF' },
  }, GROUPS)
  const worse = rowsOf({
    baseline: { c1: 'TTF', c2: 'TTF', c3: 'TTF', c4: 'TTF', c5: 'TTF', c6: 'TTF' },
    new: { c1: 'TFF', c2: 'TFF', c3: 'TFF', c4: 'TFF', c5: 'TFF', c6: 'TFF' },
  }, GROUPS)
  const flat = rowsOf({
    baseline: { c1: 'TFF', c2: 'TFF', c3: 'TFF', c4: 'TTF', c5: 'TTF', c6: 'TTF' },
    new: { c1: 'TTF', c2: 'TTF', c3: 'TTF', c4: 'TFF', c5: 'TFF', c6: 'TFF' },
  }, GROUPS)

  const verdicts = [better, worse, flat].map((rows) => run(['--results', writeResults(rows)]))
  for (const result of verdicts) assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(verdicts.map((r) => r.json.comparisons.new.verdict), ['better', 'worse', 'flat'])
  assert.deepEqual(verdicts.map((r) => r.json.comparisons.new.label), ['变好', '变差', '持平'])

  const [b, w, f] = verdicts.map((r) => r.json.comparisons.new.pass1)
  approx(b.delta, 1 / 3); assert.ok(b.interval[0] > 0)
  approx(w.delta, -1 / 3); assert.ok(w.interval[1] < 0)
  approx(f.delta, 0); assert.ok(f.interval[0] < 0 && f.interval[1] > 0)
})

/** 每个 case 三次都带同一个分数的结果行：pass 按 passes（T / F 三个字符）给，score 按变体给。 */
function scoredRows({ baseline, candidate }) {
  const out = []
  for (const [variant, { runs, score }] of Object.entries({ baseline, new: candidate })) {
    for (const [caseId, group] of Object.entries(GROUPS)) {
      ;[...runs].forEach((c, i) => out.push(row(caseId, group, variant, i + 1, c === 'T', { score })))
    }
  }
  return out
}

test('通过率和分数各自给判定；一个变好、一个变差，整体结论是「冲突」，交人判断', () => {
  // 通过率 0 → 1（变好），分数 0.9 → 0.2（变差）：两个组里方向都一样，区间不跨 0
  const conflict = run(['--results', writeResults(scoredRows({
    baseline: { runs: 'FFF', score: 0.9 }, candidate: { runs: 'TTT', score: 0.2 },
  }))])
  assert.equal(conflict.status, 0, conflict.stderr)
  const cmp = conflict.json.comparisons.new
  assert.equal(cmp.pass1.verdict, 'better')
  assert.equal(cmp.pass1.label, '变好')
  assert.equal(cmp.score.verdict, 'worse')
  assert.equal(cmp.score.label, '变差')
  approx(cmp.score.delta, -0.7)
  assert.equal(cmp.verdict, 'conflict')
  assert.equal(cmp.label, '冲突')

  // 反过来：通过率变差、分数变好，同样是冲突
  const reverse = run(['--results', writeResults(scoredRows({
    baseline: { runs: 'TTT', score: 0.2 }, candidate: { runs: 'FFF', score: 0.9 },
  }))])
  assert.equal(reverse.json.comparisons.new.pass1.verdict, 'worse')
  assert.equal(reverse.json.comparisons.new.score.verdict, 'better')
  assert.equal(reverse.json.comparisons.new.verdict, 'conflict')
})

test('两个指标不冲突时：同向取同向，一边持平一边变差取变差，一边持平一边变好取变好，都持平是持平', () => {
  const overall = (baseline, candidate) => run(['--results', writeResults(scoredRows({ baseline, candidate }))]).json.comparisons.new
  const both = overall({ runs: 'FFF', score: 0.2 }, { runs: 'TTT', score: 0.9 })
  assert.deepEqual([both.pass1.verdict, both.score.verdict, both.verdict, both.label], ['better', 'better', 'better', '变好'])

  // 通过率没动（持平），分数变差：不能被「持平」盖住
  const scoreWorse = overall({ runs: 'TTF', score: 0.9 }, { runs: 'TTF', score: 0.2 })
  assert.deepEqual([scoreWorse.pass1.verdict, scoreWorse.score.verdict, scoreWorse.verdict], ['flat', 'worse', 'worse'])

  const scoreBetter = overall({ runs: 'TTF', score: 0.2 }, { runs: 'TTF', score: 0.9 })
  assert.deepEqual([scoreBetter.pass1.verdict, scoreBetter.score.verdict, scoreBetter.verdict], ['flat', 'better', 'better'])

  const same = overall({ runs: 'TTF', score: 0.5 }, { runs: 'TTF', score: 0.5 })
  assert.deepEqual([same.pass1.verdict, same.score.verdict, same.verdict, same.label], ['flat', 'flat', 'flat', '持平'])
})

test('只有一个指标时，整体结论就是它的判定', () => {
  const passOnly = run(['--results', writeResults(rowsOf({ baseline: BASELINE, new: NEW }, GROUPS))]).json.comparisons.new
  assert.equal(passOnly.score, null)
  assert.equal(passOnly.verdict, passOnly.pass1.verdict)

  // 没有任何 pass 判定、只有分数
  const scoreOnly = ['baseline', 'new'].flatMap((variant, v) =>
    Object.entries(GROUPS).flatMap(([caseId, group]) =>
      [1, 2, 3].map((n) => row(caseId, group, variant, n, null, { score: v === 0 ? 0.2 : 0.9 }))))
  const cmp = run(['--results', writeResults(scoreOnly)]).json.comparisons.new
  assert.equal(cmp.pass1, null)
  assert.equal(cmp.score.verdict, 'better')
  assert.equal(cmp.verdict, 'better')
})

test('没法判的（pass 是 null）不进 pass¹ 的分母；三次里有没法判的，这个 case 算没全过', () => {
  const rows = rowsOf({ baseline: { c1: 'TTT', c2: 'T?T', c3: 'FFF' }, new: { c1: 'TTT', c2: 'TTT', c3: 'TTT' } },
    { c1: 'g1', c2: 'g1', c3: 'g2' })
  const { status, json } = run(['--results', writeResults(rows)])
  assert.equal(status, 0)
  assert.equal(json.variants.baseline.judged, 8)
  assert.equal(json.variants.baseline.passes, 5)
  approx(json.variants.baseline.pass1, 5 / 8)
  assert.equal(json.variants.baseline.pass3.passed, 1)
  approx(json.variants.baseline.pass3.rate, 1 / 3)
})

test('有一个 case 没跑满三次：这个变体不报 pass³，pass¹ 照报', () => {
  const rows = [
    ...rowsOf({ baseline: { c1: 'TTT' }, new: { c1: 'TTT' } }, { c1: 'g1' }),
    row('c2', 'g2', 'baseline', 1, true), row('c2', 'g2', 'new', 1, false),
  ]
  const { json } = run(['--results', writeResults(rows)])
  assert.equal(json.variants.baseline.pass3, null)
  assert.match(json.variants.baseline.pass3Note, /三次/)
  assert.equal(json.variants.baseline.judged, 4)
  approx(json.variants.new.pass1, 3 / 4)
})

test('有 score 时也给分数的差和区间；没有 score 就没有这一项', () => {
  const withScore = ['baseline', 'new'].flatMap((variant, v) =>
    ['c1', 'c2', 'c3', 'c4'].flatMap((caseId, i) =>
      [1, 2, 3].map((n) => row(caseId, i < 2 ? 'g1' : 'g2', variant, n, true, { score: v === 0 ? 0.5 : 0.75 }))))
  const scored = run(['--results', writeResults(withScore)])
  approx(scored.json.comparisons.new.score.delta, 0.25)
  assert.deepEqual(scored.json.comparisons.new.score.interval.map((x) => Math.round(x * 1e9) / 1e9), [0.25, 0.25])
  approx(scored.json.variants.new.meanScore, 0.75)

  const plain = run(['--results', writeResults(rowsOf({ baseline: BASELINE, new: NEW }, GROUPS))])
  assert.equal(plain.json.comparisons.new.score, null)
  assert.equal(plain.json.variants.new.meanScore, null)
})

test('同一个键（case × 变体 × 第几次）出现多行：取最后一行', () => {
  const rows = rowsOf({ baseline: BASELINE, new: NEW }, GROUPS)
  const flip = row('c1', 'g1', 'new', 1, false) // 追加在最后，覆盖前面那行
  const { json } = run(['--results', writeResults([...rows, flip])])
  assert.equal(json.variants.new.passes, 15)
  assert.equal(json.variants.new.judged, 18)
})

test('不止一个非基线变体：各自对 baseline 比', () => {
  const rows = [
    ...rowsOf({ baseline: BASELINE, new: NEW }, GROUPS),
    ...rowsOf({ other: BASELINE }, GROUPS),
  ]
  const { json } = run(['--results', writeResults(rows)])
  assert.deepEqual(Object.keys(json.comparisons).sort(), ['new', 'other'])
  approx(json.comparisons.other.pass1.delta, 0)
  assert.equal(json.comparisons.other.verdict, 'flat')
})

test('--seed 和 --resamples 可调；默认 2000 次，同一个种子两次相同', () => {
  const file = writeResults(rowsOf({ baseline: BASELINE, new: NEW }, GROUPS))
  const a = run(['--results', file, '--resamples', '500', '--seed', '7'])
  const b = run(['--results', file, '--resamples', '500', '--seed', '7'])
  assert.equal(a.json.comparisons.new.pass1.resamples, 500)
  assert.deepEqual(a.json, b.json)
})

test('参数缺失、文件不存在、行不是合法结果、没有 baseline：退出码 2，原因在 stderr，stdout 为空', () => {
  const missing = run([])
  const nofile = run(['--results', join(tmpdir(), 'replay-stats-no-such-file.jsonl')])
  const badFlag = run(['--results', writeResults(rowsOf({ baseline: BASELINE }, GROUPS)), '--resamples', 'abc'])
  const noBaseline = run(['--results', writeResults(rowsOf({ new: NEW }, GROUPS))])
  const badRow = run(['--results', writeResults([{ case: 'c1', variant: 'baseline' }])])
  const empty = run(['--results', writeResults([])])
  const dir = mkdtempSync(join(tmpdir(), 'replay-stats-'))
  writeFileSync(join(dir, 'broken.jsonl'), '{"case": "c1"\nnot json\n')
  const notJson = run(['--results', join(dir, 'broken.jsonl')])
  for (const [name, result] of Object.entries({ missing, nofile, badFlag, noBaseline, badRow, empty, notJson })) {
    assert.equal(result.status, 2, `${name}: ${result.stdout}`)
    assert.equal(result.stdout, '', name)
    assert.match(result.stderr, /replay-stats:/, name)
  }
  assert.match(noBaseline.stderr, /baseline/)
  assert.match(badRow.stderr, /第 1 行/)
  assert.match(notJson.stderr, /第 1 行/)
})
