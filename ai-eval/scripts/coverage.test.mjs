/**
 * coverage 的行为。跑：
 *   `node --test ai-eval/scripts/coverage.test.mjs`
 *
 * 输入是项目交过来的描述（每个样本的 covers）和项目 EVAL.md 的文字，脚本里没有任何项目内容：
 * 下面的 case 名、用户任务、样本名都是造出来的，只为让统计和校验的规则可测。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseEvalMd, checkCovers, coverageReport, renderMarkdown } from './coverage.mjs'

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'coverage.mjs')

const EVAL_MD = `# EVAL

## 样本的问题类型

\`covers\` 可用的 case 名都在下表。覆盖下限：每个 case 至少 3 个样本，不够的标「覆盖不足」。

| 术语表词条 | covers 可用的名字 | 适用的用户任务 | 说明 |
|---|---|---|---|
| Layer | \`cause-a\`、\`cause-b\` | \`report\` | 两种原因 |
| Sound class | \`Word endings\`、\`Labiodental /f/-/v/\` | \`report\` | 带空格和斜杠的名字 |
| Empty slot | \`silent\` | \`report\`、\`retry\` | 一个名字适用于两个用户任务 |
| Retry only | \`flat\` | \`retry\` | 只适用于 retry |

## 指标与断言

| 列 | \`not-a-case\` |
|---|---|
`

const sample = (covers) => ({ reaches: ['x'], covers })

const describeFixture = () => ({
  format: 1,
  userTasks: { report: ['x'], retry: ['x'] },
  samples: {
    report: {
      a: sample(['cause-a', 'Word endings']),
      b: sample(['cause-a', 'Word endings']),
      c: sample(['cause-a', 'cause-b', 'Labiodental /f/-/v/']),
      d: sample(['Labiodental /f/-/v/', 'Labiodental /f/-/v/']),
    },
    retry: {},
  },
})

const withRetrySamples = () => {
  const describe = describeFixture()
  describe.samples.retry = { r1: sample(['silent', 'flat']), r2: sample(['silent']) }
  return describe
}

test('从 EVAL.md 读出 case 名和下限：只读「样本的问题类型」一节，名字带空格和斜杠也照原样', () => {
  const { caseNames, floor } = parseEvalMd(EVAL_MD)

  assert.deepEqual(caseNames, ['cause-a', 'cause-b', 'Word endings', 'Labiodental /f/-/v/', 'silent', 'flat'])
  assert.equal(floor, 3)
})

test('从 EVAL.md 读出每个名字适用的用户任务：一个名字可以适用于几个', () => {
  const { appliesTo } = parseEvalMd(EVAL_MD)

  assert.deepEqual(appliesTo['cause-a'], ['report'])
  assert.deepEqual(appliesTo.silent, ['report', 'retry'])
  assert.deepEqual(appliesTo.flat, ['retry'])
})

test('EVAL.md 没有「样本的问题类型」一节、没有 covers 那一列、没有下限：各自报错并说明缺什么', () => {
  assert.throws(() => parseEvalMd('# EVAL\n\n## 别的\n'), /样本的问题类型/)
  assert.throws(() => parseEvalMd('## 样本的问题类型\n\n覆盖下限：每个 case 至少 3 个样本。\n\n| a | b |\n|---|---|\n| x | `y` |\n'), /covers 可用的名字/)
  assert.throws(() => parseEvalMd('## 样本的问题类型\n\n| a | covers 可用的名字 | 适用的用户任务 |\n|---|---|---|\n| x | `y` | `t` |\n'), /覆盖下限/)
})

test('没有「适用的用户任务」那一列、或某一行列了名字却没写适用的用户任务：报错点名', () => {
  assert.throws(
    () => parseEvalMd('## 样本的问题类型\n\n覆盖下限：每个 case 至少 3 个样本。\n\n| a | covers 可用的名字 |\n|---|---|\n| x | `y` |\n'),
    /适用的用户任务/,
  )
  assert.throws(
    () => parseEvalMd('## 样本的问题类型\n\n覆盖下限：每个 case 至少 3 个样本。\n\n| a | covers 可用的名字 | 适用的用户任务 |\n|---|---|---|\n| x | `y` | — |\n'),
    /「y」.*适用的用户任务/,
  )
})

test('「Word endings」只有 2 个样本、下限 3：标覆盖不足', () => {
  const { caseNames, floor, appliesTo } = parseEvalMd(EVAL_MD)

  const report = coverageReport(describeFixture(), caseNames, floor, appliesTo)

  assert.equal(report.userTasks.report.cases['Word endings'].count, 2)
  assert.equal(report.userTasks.report.cases['Word endings'].insufficient, true)
  assert.ok(report.userTasks.report.insufficient.includes('Word endings'))
})

test('负例：刚好 3 个样本不算不足；同一个样本把一个 case 写两遍只算一个样本', () => {
  const { caseNames, floor, appliesTo } = parseEvalMd(EVAL_MD)

  const { cases } = coverageReport(describeFixture(), caseNames, floor, appliesTo).userTasks.report

  assert.equal(cases['cause-a'].count, 3)
  assert.equal(cases['cause-a'].insufficient, false)
  assert.deepEqual(cases['cause-a'].samples, ['a', 'b', 'c'])
  assert.equal(cases['Labiodental /f/-/v/'].count, 2)
})

test('没有样本走到的 case 也列出来，数 0，标覆盖不足', () => {
  const { caseNames, floor, appliesTo } = parseEvalMd(EVAL_MD)

  const { cases, insufficient } = coverageReport(describeFixture(), caseNames, floor, appliesTo).userTasks.report

  assert.equal(cases.silent.count, 0)
  assert.deepEqual(insufficient, ['cause-b', 'Word endings', 'Labiodental /f/-/v/', 'silent'])
})

test('每个用户任务只数适用于它的名字：retry 的表里没有 cause-a，report 的表里没有 flat', () => {
  const { caseNames, floor, appliesTo } = parseEvalMd(EVAL_MD)

  const { userTasks } = coverageReport(withRetrySamples(), caseNames, floor, appliesTo)

  assert.deepEqual(Object.keys(userTasks.retry.cases), ['silent', 'flat'])
  assert.equal(userTasks.retry.cases.silent.count, 2)
  assert.ok(!('flat' in userTasks.report.cases))
  assert.ok(!('cause-a' in userTasks.retry.cases))
  assert.deepEqual(userTasks.retry.insufficient, ['silent', 'flat'])
})

test('一个名字适用于两个用户任务时，在两张表里各数各的样本', () => {
  const { caseNames, floor, appliesTo } = parseEvalMd(EVAL_MD)
  const describe = withRetrySamples()
  describe.samples.report.a = sample(['cause-a', 'silent'])

  const { userTasks } = coverageReport(describe, caseNames, floor, appliesTo)

  assert.deepEqual(userTasks.report.cases.silent.samples, ['a'])
  assert.deepEqual(userTasks.retry.cases.silent.samples, ['r1', 'r2'])
})

test('还没有任何样本的用户任务不进统计表', () => {
  const { caseNames, floor, appliesTo } = parseEvalMd(EVAL_MD)

  const report = coverageReport(describeFixture(), caseNames, floor, appliesTo)

  assert.deepEqual(Object.keys(report.userTasks), ['report'])
})

test('covers 写了 EVAL.md 没列的名字：报错，点名用户任务、样本和那个名字', () => {
  const { caseNames, appliesTo } = parseEvalMd(EVAL_MD)
  const describe = describeFixture()
  describe.samples.report.b = sample(['cause-a', 'Word-endings'])

  assert.deepEqual(checkCovers(describe, caseNames, appliesTo), [
    { userTask: 'report', sample: 'b', word: 'Word-endings', reason: 'unknown' },
  ])
})

test('covers 写了 EVAL.md 列着、但不适用于这个用户任务的名字：也是违规，原因写「不适用」', () => {
  const { caseNames, appliesTo } = parseEvalMd(EVAL_MD)
  const describe = withRetrySamples()
  describe.samples.retry.r2 = sample(['silent', 'cause-a'])
  describe.samples.report.d = sample(['flat'])

  assert.deepEqual(checkCovers(describe, caseNames, appliesTo), [
    { userTask: 'report', sample: 'd', word: 'flat', reason: 'not_applicable' },
    { userTask: 'retry', sample: 'r2', word: 'cause-a', reason: 'not_applicable' },
  ])
})

test('负例：covers 都在清单里时没有违规', () => {
  const { caseNames, appliesTo } = parseEvalMd(EVAL_MD)

  assert.deepEqual(checkCovers(describeFixture(), caseNames, appliesTo), [])
  assert.deepEqual(checkCovers(withRetrySamples(), caseNames, appliesTo), [])
})

test('Markdown 表：每个 case 一行，不足的行写「覆盖不足」，违规单独列出', () => {
  const { caseNames, floor, appliesTo } = parseEvalMd(EVAL_MD)

  const text = renderMarkdown(coverageReport(describeFixture(), caseNames, floor, appliesTo), [])

  assert.match(text, /\| Word endings \| 2 \| 覆盖不足 \|/)
  assert.match(text, /\| cause-a \| 3 \| 够 \|/)
})

const run = (describe, extra = []) => {
  const dir = mkdtempSync(join(tmpdir(), 'coverage-'))
  writeFileSync(join(dir, 'describe.json'), JSON.stringify(describe))
  writeFileSync(join(dir, 'EVAL.md'), EVAL_MD)
  return spawnSync('node', [SCRIPT, '--describe', join(dir, 'describe.json'), '--eval-md', join(dir, 'EVAL.md'), ...extra], { encoding: 'utf8' })
}

test('命令行：覆盖不足不算失败，退出码 0，JSON 里有统计', () => {
  const result = run(describeFixture())

  assert.equal(result.status, 0)
  assert.equal(JSON.parse(result.stdout).userTasks.report.cases['Word endings'].insufficient, true)
})

test('命令行：covers 有不认识的名字时退出码 1，stdout 的 JSON 里有 violations', () => {
  const describe = describeFixture()
  describe.samples.report.a = sample(['bogus'])

  const result = run(describe)

  assert.equal(result.status, 1)
  assert.deepEqual(JSON.parse(result.stdout).violations, [{ userTask: 'report', sample: 'a', word: 'bogus', reason: 'unknown' }])
})

test('命令行：EVAL.md 写了描述里没有的用户任务名时退出码 2，点名那个名字（拼错的防线）', () => {
  const describe = describeFixture()
  delete describe.userTasks.retry
  delete describe.samples.retry

  const result = run(describe)

  assert.equal(result.status, 2)
  assert.match(result.stderr, /retry/)
})

test('命令行：缺 --describe 或 EVAL.md 读不到：退出码 2，说明原因', () => {
  assert.equal(spawnSync('node', [SCRIPT], { encoding: 'utf8' }).status, 2)
  const missing = spawnSync('node', [SCRIPT, '--describe', '/nonexistent/d.json', '--eval-md', '/nonexistent/EVAL.md'], { encoding: 'utf8' })
  assert.equal(missing.status, 2)
  assert.match(missing.stderr, /describe/)
})

test('命令行：--markdown 输出 Markdown 表', () => {
  const result = run(describeFixture(), ['--markdown'])

  assert.equal(result.status, 0)
  assert.match(result.stdout, /覆盖不足/)
})

// ── EVAL.md 从仓库根找，不从当前目录找 ──────────────────────────────────────────

/** 一个仓库：根上有 .git 和 EVAL.md，服务在 app/service 下（项目的命令都在那里跑）。 */
function repo({ withEvalMd = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'coverage-repo-'))
  mkdirSync(join(root, '.git'))
  mkdirSync(join(root, 'app', 'service'), { recursive: true })
  if (withEvalMd) writeFileSync(join(root, 'EVAL.md'), EVAL_MD)
  writeFileSync(join(root, 'app', 'service', 'd.json'), JSON.stringify(describeFixture()))
  return { root, backend: join(root, 'app', 'service') }
}

test('命令行：不给 --eval-md，在仓库子目录里跑，从仓库根读 EVAL.md（真实运行里这里是 ENOENT）', () => {
  const { backend } = repo()

  const result = spawnSync('node', [SCRIPT, '--describe', 'd.json'], { encoding: 'utf8', cwd: backend })

  assert.equal(result.status, 0, result.stderr)
  assert.equal(JSON.parse(result.stdout).floor, 3)
})

test('命令行：就近的 EVAL.md 优先，不越过它去找更上面的', () => {
  const { backend } = repo()
  writeFileSync(join(backend, 'EVAL.md'), EVAL_MD.replace('至少 3 个', '至少 5 个'))

  const result = spawnSync('node', [SCRIPT, '--describe', 'd.json'], { encoding: 'utf8', cwd: backend })

  assert.equal(JSON.parse(result.stdout).floor, 5)
})

test('命令行：一路找到仓库根都没有 EVAL.md：退出码 2，说明找了哪里', () => {
  const { backend } = repo({ withEvalMd: false })

  const result = spawnSync('node', [SCRIPT, '--describe', 'd.json'], { encoding: 'utf8', cwd: backend })

  assert.equal(result.status, 2)
  assert.match(result.stderr, /EVAL\.md/)
  assert.match(result.stderr, /app\/service/)
  assert.match(result.stderr, /--eval-md/)
})
