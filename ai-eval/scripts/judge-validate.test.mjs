/**
 * judge-validate 的行为：判官写的评分文件合不合格式。跑：
 *   `node --test ai-eval/scripts/judge-validate.test.mjs`
 *
 * 脚本不认识任何项目，只查形状，不判分数对不对。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateScores } from './judge-validate.mjs'

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'judge-validate.mjs')
const EXPECT = { reports: 4 }

const scored = (label, score = 0.5) => ({ label, status: 'scored', score, reason: '「原文」……' })
const good = () => ({ format: 2, reports: [1, 2, 3, 4].map((label) => scored(label)) })
const messages = (result) => result.errors.map((error) => error.message).join('\n')

test('一份合格的评分文件通过', () => {
  assert.deepEqual(validateScores(good(), EXPECT), { ok: true, errors: [] })
})

test('报告编号缺一个：不通过，点名缺哪份', () => {
  const file = good()
  file.reports.pop()

  const result = validateScores(file, EXPECT)

  assert.equal(result.ok, false)
  assert.match(messages(result), /缺报告 4/)
})

test('报告编号重复或越界：不通过', () => {
  const duplicate = good()
  duplicate.reports[3] = scored(1)
  const outside = good()
  outside.reports[3] = scored(5)

  assert.match(messages(validateScores(duplicate, EXPECT)), /报告 1 出现了 2 次/)
  assert.match(messages(validateScores(outside, EXPECT)), /报告 5 不在 1 到 4 之内/)
})

test('分数 1.3、负数、字符串、NaN：不通过', () => {
  for (const score of [1.3, -0.1, '0.5', Number.NaN, null]) {
    const file = good()
    file.reports[0] = scored(1, score)
    const result = validateScores(file, EXPECT)
    assert.equal(result.ok, false, `分数 ${score} 应当不通过`)
    assert.match(messages(result), /报告 1：分数/)
  }
})

test('理由是空的：不通过；无法判断也要写理由', () => {
  const file = good()
  file.reports[0] = { label: 1, status: 'scored', score: 0.5, reason: '  ' }
  file.reports[1] = { label: 2, status: 'unable', reason: '' }

  const result = validateScores(file, EXPECT)

  assert.equal(result.ok, false)
  assert.match(messages(result), /报告 1：没有理由/)
  assert.match(messages(result), /报告 2：没有理由/)
})

test('无法判断：没有分数，通过；带了分数就不通过（不硬给分）', () => {
  const file = good()
  file.reports[0] = { label: 1, status: 'unable', reason: '缺批注原文' }
  assert.equal(validateScores(file, EXPECT).ok, true)

  file.reports[0] = { label: 1, status: 'unable', score: 0.5, reason: '缺批注原文' }
  assert.match(messages(validateScores(file, EXPECT)), /无法判断不能带分数/)
})

test('不适用：整个样本一致才通过；带分数不通过；一部分不适用一部分打了分不通过', () => {
  const all = { format: 2, reports: [1, 2, 3, 4].map((label) => ({ label, status: 'not_applicable', reason: '期望没有主要问题' })) }
  assert.equal(validateScores(all, EXPECT).ok, true)

  const mixed = good()
  mixed.reports[0] = { label: 1, status: 'not_applicable', reason: '期望没有主要问题' }
  assert.match(messages(validateScores(mixed, EXPECT)), /要么都不适用，要么都适用/)

  all.reports[0].score = 0.5
  assert.match(messages(validateScores(all, EXPECT)), /不适用不能带分数/)
})

test('不认识的状态、多余的键：不通过', () => {
  const file = good()
  file.reports[0] = { label: 1, status: 'maybe', reason: 'r' }
  file.reports[1] = { ...scored(2), extra: 1 }
  file.note = 'x'

  const text = messages(validateScores(file, EXPECT))

  assert.match(text, /报告 1：status 必须是/)
  assert.match(text, /报告 2：多出键 extra/)
  assert.match(text, /文件里多出键 note/)
})

test('不是 JSON 对象、format 不对（旧的 1 也不行）：不通过，不抛异常', () => {
  for (const value of [null, 'text', [], 3]) assert.equal(validateScores(value, EXPECT).ok, false)
  assert.match(messages(validateScores({ ...good(), format: 1 }, EXPECT)), /format 必须是 2/)
  assert.match(messages(validateScores({ format: 2, reports: 'x' }, EXPECT)), /reports 必须是一个数组/)
})

test('命令行：合格退出 0，不合格退出 1 并在 stdout 列出错误，输入有误退出 2；期望文件可以是映射文件', () => {
  const dir = mkdtempSync(join(tmpdir(), 'judge-validate-'))
  const write = (name, content) => {
    writeFileSync(join(dir, name), typeof content === 'string' ? content : JSON.stringify(content))
    return join(dir, name)
  }
  const expect = write('expect.json', EXPECT)
  const mapping = write('mapping.json', { format: 2, expect: EXPECT })

  assert.equal(spawnSync('node', [SCRIPT, '--scores', write('ok.json', good()), '--expect', expect], { encoding: 'utf8' }).status, 0)
  assert.equal(spawnSync('node', [SCRIPT, '--scores', write('ok2.json', good()), '--expect', mapping], { encoding: 'utf8' }).status, 0)

  const bad = spawnSync('node', [SCRIPT, '--scores', write('bad.json', { ...good(), reports: [] }), '--expect', expect], { encoding: 'utf8' })
  assert.equal(bad.status, 1)
  assert.equal(JSON.parse(bad.stdout).ok, false)
  assert.equal(spawnSync('node', [SCRIPT, '--scores', write('broken.json', '{not json'), '--expect', expect], { encoding: 'utf8' }).status, 1)
  assert.equal(spawnSync('node', [SCRIPT, '--scores', join(dir, 'ok.json')], { encoding: 'utf8' }).status, 2)
})
