#!/usr/bin/env node
/**
 * judge-validate：判官写的评分文件合不合格式（格式见 references/judge-format.md）。
 *
 *   node judge-validate.mjs --scores <评分文件> --expect <期望文件>
 *
 * 脚本不认识任何项目，也不判分数对不对，只查形状：报告编号缺 / 重 / 越界、分数越界、理由是空的……
 * 一个评分文件不合格，这一次就当没交回（judge-run 重判一次，还不行记「未评测」）。
 *
 * 期望文件（judge-pack 写在映射文件里，`expect` 键）：{ reports: <报告份数> }
 *
 * 输出（stdout，JSON）：{ ok, errors: [{ message }] }。
 * 退出码：0 合格，1 不合格（stdout 仍是完整 JSON；读不了、不是 JSON 也算不合格），2 用法有误（原因在 stderr）。
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const FORMAT = 2
export const SCORE_STATUSES = ['scored', 'unable', 'not_applicable']

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const nonEmptyText = (value) => typeof value === 'string' && value.trim() !== ''

function unknownKeys(object, allowed) {
  return Object.keys(object).filter((key) => !allowed.includes(key))
}

/** 评分文件合不合格。`expect`：{ reports }。 */
export function validateScores(file, expect) {
  const errors = []
  const fail = (message) => errors.push({ message })

  if (!isObject(file)) {
    fail('评分文件不是一个 JSON 对象')
    return { ok: false, errors }
  }
  for (const key of unknownKeys(file, ['format', 'reports'])) fail(`文件里多出键 ${key}`)
  if (file.format !== FORMAT) fail(`format 必须是 ${FORMAT}，写的是 ${JSON.stringify(file.format)}`)
  if (!Array.isArray(file.reports)) {
    fail('reports 必须是一个数组')
    return { ok: false, errors }
  }

  const seen = new Map()
  let notApplicable = 0
  let counted = 0
  for (const cell of file.reports) {
    if (!isObject(cell)) {
      fail('reports 里有一项不是对象')
      continue
    }
    const label = cell.label
    if (!Number.isInteger(label) || label < 1 || label > expect.reports) {
      fail(`报告 ${JSON.stringify(label)} 不在 1 到 ${expect.reports} 之内`)
      continue
    }
    seen.set(label, (seen.get(label) ?? 0) + 1)
    counted += 1
    const where = `报告 ${label}`
    for (const key of unknownKeys(cell, ['label', 'status', 'score', 'reason'])) fail(`${where}：多出键 ${key}`)
    if (!SCORE_STATUSES.includes(cell.status)) {
      fail(`${where}：status 必须是 ${SCORE_STATUSES.join(' / ')}，写的是 ${JSON.stringify(cell.status)}`)
      continue
    }
    if (!nonEmptyText(cell.reason)) fail(`${where}：没有理由`)
    if (cell.status === 'scored') {
      const score = cell.score
      if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 1) {
        fail(`${where}：分数 ${JSON.stringify(score)} 不在 0 到 1 之内`)
      }
    } else {
      if ('score' in cell) fail(`${where}：${cell.status === 'unable' ? '无法判断' : '不适用'}不能带分数`)
      if (cell.status === 'not_applicable') notApplicable += 1
    }
  }
  for (let label = 1; label <= expect.reports; label += 1) {
    const times = seen.get(label) ?? 0
    if (times === 0) fail(`缺报告 ${label}`)
    else if (times > 1) fail(`报告 ${label} 出现了 ${times} 次`)
  }
  // 适用与否是样本的性质，不是某一份报告的性质
  if (notApplicable > 0 && notApplicable < counted) {
    fail(`${counted} 份报告里有 ${notApplicable} 份写了不适用、${counted - notApplicable} 份打了分或无法判断；适用与否是样本的性质，要么都不适用，要么都适用`)
  }
  return { ok: errors.length === 0, errors }
}

function readJson(path) {
  let text
  try {
    text = readFileSync(path, 'utf8')
  } catch (error) {
    return { error: `读不了 ${path}：${error.message}` }
  }
  try {
    return { value: JSON.parse(text) }
  } catch (error) {
    return { error: `${path} 不是合法的 JSON：${error.message}` }
  }
}

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--scores') args.scores = argv[++i]
    else if (argv[i] === '--expect') args.expect = argv[++i]
    else throw new Error(`unknown argument ${argv[i]}`)
  }
  if (!args.scores) throw new Error('--scores <file> is required')
  if (!args.expect) throw new Error('--expect <file> is required')
  return args
}

function main(argv) {
  let args
  try {
    args = parseArgs(argv)
  } catch (error) {
    process.stderr.write(`judge-validate: ${error.message}\n`)
    return 2
  }
  const expect = readJson(args.expect)
  if (expect.error) {
    process.stderr.write(`judge-validate: ${expect.error}\n`)
    return 2
  }
  const file = readJson(args.scores)
  const result = file.error ? { ok: false, errors: [{ message: file.error }] } : validateScores(file.value, expect.value.expect ?? expect.value)
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  return result.ok ? 0 : 1
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2))
}
