#!/usr/bin/env node
/**
 * coverage：每个 case 有几个样本，哪些 case 覆盖不足，covers 有没有写错名字。
 *
 *   node coverage.mjs --describe <描述 JSON> [--eval-md <EVAL.md，默认从当前目录往上找到的第一份>] [--markdown]
 *
 * 脚本不认识任何项目。两份输入：
 *   - 描述（项目写）：samples[用户任务][样本].covers 是这个样本覆盖的 case 名。
 *   - 项目的 EVAL.md：「样本的问题类型」一节里，表头为「covers 可用的名字」的那一列，每个名字写在反引号里，
 *     就是全部合法的 case 名；同一行的「适用的用户任务」列（用户任务名写在反引号里）说这些名字适用于哪几个
 *     用户任务，一个名字可以适用于几个；同一节里「覆盖下限：每个 case 至少 N 个样本」给出下限 N。
 *
 * EVAL.md 的位置：不给 --eval-md 时，从当前目录往上找，到有 .git 的那一层（仓库根）为止，用找到的第一份。
 * 项目的命令常在子目录里跑，EVAL.md 在仓库根；找不到时说明找了哪些目录。
 *
 * 规则：
 *   - 只统计至少有一个样本的用户任务。一个用户任务里，只有适用于它的名字出一行：数覆盖它的样本
 *     （同一个样本把一个 case 写两遍算一个），少于下限的标「覆盖不足」，数 0 的也标。不适用于它的名字
 *     既不出行，也不拉低它的覆盖。
 *   - covers 里出现 EVAL.md 没列的名字，或者列了、但不适用于这个样本所在的用户任务，记一条违规，点名
 *     用户任务、样本和那个名字，`reason` 是 unknown 或 not_applicable。
 *   - 「适用的用户任务」里写了描述里没有的用户任务名，报错（防拼错），退出码 2。
 *
 * 输出（stdout）：默认 JSON { floor, caseNames, appliesTo, userTasks: { <用户任务>: { samples, cases, insufficient } }, violations }；
 * --markdown 输出同样内容的 Markdown 表。
 * 退出码：0 无违规（覆盖不足不算失败，它是给人看的统计）；1 有违规（stdout 仍完整）；2 用法或输入有误（原因在 stderr）。
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SECTION_TITLE = '样本的问题类型'
const COVERS_COLUMN = 'covers 可用的名字'
const APPLIES_COLUMN = '适用的用户任务'

const splitRow = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim())

export function parseEvalMd(text) {
  const start = text.search(new RegExp(`^## ${SECTION_TITLE}\\s*$`, 'm'))
  if (start < 0) throw new Error(`EVAL.md has no section '## ${SECTION_TITLE}'`)
  const rest = text.slice(start).replace(/^## [^\n]*\n/, '')
  const next = rest.search(/^## /m)
  const section = next < 0 ? rest : rest.slice(0, next)

  const rows = section.split('\n').filter((line) => line.trim().startsWith('|'))
  const header = rows.find((row) => splitRow(row).includes(COVERS_COLUMN))
  if (!header) throw new Error(`section '${SECTION_TITLE}' has no table column '${COVERS_COLUMN}'`)
  const headerCells = splitRow(header)
  const column = headerCells.indexOf(COVERS_COLUMN)
  const appliesColumn = headerCells.indexOf(APPLIES_COLUMN)
  if (appliesColumn < 0) throw new Error(`section '${SECTION_TITLE}' has no table column '${APPLIES_COLUMN}' (which user tasks each case name applies to)`)

  const caseNames = []
  const appliesTo = {}
  for (const row of rows) {
    if (row === header || /^\|?[\s:|-]+\|?$/.test(row)) continue
    const cells = splitRow(row)
    const names = [...(cells[column] ?? '').matchAll(/`([^`]+)`/g)].map((match) => match[1])
    const userTasks = [...(cells[appliesColumn] ?? '').matchAll(/`([^`]+)`/g)].map((match) => match[1])
    for (const name of names) {
      if (userTasks.length === 0) throw new Error(`case name 「${name}」 has no user task in the column '${APPLIES_COLUMN}' (user tasks go in backticks)`)
      if (!caseNames.includes(name)) caseNames.push(name)
      appliesTo[name] = [...new Set([...(appliesTo[name] ?? []), ...userTasks])]
    }
  }
  if (caseNames.length === 0) throw new Error(`column '${COVERS_COLUMN}' lists no case name (names go in backticks)`)

  const floorMatch = section.match(/覆盖下限[：:][^\n]*?至少\s*(\d+)\s*个样本/)
  if (!floorMatch) throw new Error(`section '${SECTION_TITLE}' states no 覆盖下限 ("覆盖下限：每个 case 至少 N 个样本")`)
  return { caseNames, appliesTo, floor: Number(floorMatch[1]) }
}

function checkDescribe(describe) {
  if (!describe || typeof describe.samples !== 'object' || describe.samples === null) {
    throw new Error("describe: 'samples' must be an object")
  }
}

/** EVAL.md 的「适用的用户任务」里每个用户任务名，描述里都得有；写错了的名字在这里报出来。 */
export function checkAppliesTo(describe, appliesTo) {
  checkDescribe(describe)
  const known = new Set(Object.keys(describe.samples))
  for (const [name, userTasks] of Object.entries(appliesTo)) {
    for (const userTask of userTasks) {
      if (!known.has(userTask)) {
        throw new Error(`case name 「${name}」 applies to the user task '${userTask}', which the project's describe does not have (known: ${[...known].join(', ')})`)
      }
    }
  }
}

export function checkCovers(describe, caseNames, appliesTo) {
  checkDescribe(describe)
  const known = new Set(caseNames)
  const violations = []
  for (const [userTask, samples] of Object.entries(describe.samples)) {
    for (const [sample, { covers = [] }] of Object.entries(samples)) {
      for (const word of new Set(covers)) {
        if (!known.has(word)) violations.push({ userTask, sample, word, reason: 'unknown' })
        else if (!(appliesTo[word] ?? []).includes(userTask)) violations.push({ userTask, sample, word, reason: 'not_applicable' })
      }
    }
  }
  return violations
}

export function coverageReport(describe, caseNames, floor, appliesTo) {
  checkDescribe(describe)
  const userTasks = {}
  for (const [userTask, samples] of Object.entries(describe.samples)) {
    const names = Object.keys(samples)
    if (names.length === 0) continue
    const applicable = caseNames.filter((caseName) => (appliesTo[caseName] ?? []).includes(userTask))
    const cases = {}
    for (const caseName of applicable) {
      const covering = names.filter((name) => (samples[name].covers ?? []).includes(caseName))
      cases[caseName] = { count: covering.length, samples: covering, insufficient: covering.length < floor }
    }
    userTasks[userTask] = {
      samples: names.length,
      cases,
      insufficient: applicable.filter((caseName) => cases[caseName].insufficient),
    }
  }
  return { floor, caseNames, appliesTo, userTasks }
}

export function renderMarkdown(report, violations) {
  const lines = []
  for (const [userTask, { samples, cases, insufficient }] of Object.entries(report.userTasks)) {
    lines.push(
      `### ${userTask}（${samples} 个样本，每个 case 至少 ${report.floor} 个，覆盖不足 ${insufficient.length} 个）`,
      '',
      '| case | 样本数 | 状态 |',
      '|---|---|---|',
    )
    for (const [caseName, { count, insufficient: low }] of Object.entries(cases)) {
      lines.push(`| ${caseName} | ${count} | ${low ? '覆盖不足' : '够'} |`)
    }
    lines.push('')
  }
  if (violations.length > 0) {
    lines.push('### covers 里不在 EVAL.md 清单、或不适用于这个用户任务的名字', '')
    for (const { userTask, sample, word, reason } of violations) {
      lines.push(`- ${userTask} / ${sample}：「${word}」${reason === 'not_applicable' ? '（不适用于这个用户任务）' : ''}`)
    }
    lines.push('')
  }
  return lines.join('\n')
}

function parseArgs(argv) {
  const args = { evalMd: undefined, markdown: false }
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--describe') args.describe = argv[++i]
    else if (argv[i] === '--eval-md') args.evalMd = argv[++i]
    else if (argv[i] === '--markdown') args.markdown = true
    else throw new Error(`unknown argument ${argv[i]}`)
  }
  if (!args.describe) throw new Error('--describe <file> is required (the project writes it)')
  return args
}

const readFile = (kind, path) => {
  try {
    return readFileSync(path, 'utf8')
  } catch (error) {
    throw new Error(`cannot read ${kind} file ${path}: ${error.message}`)
  }
}

/** 从 start 往上找 EVAL.md，到有 .git 的目录（含）或文件系统根为止。返回 { found, searched }。 */
export function findEvalMd(start) {
  const searched = []
  let dir = resolve(start)
  for (;;) {
    searched.push(dir)
    const candidate = join(dir, 'EVAL.md')
    if (existsSync(candidate)) return { found: candidate, searched }
    const parent = dirname(dir)
    if (existsSync(join(dir, '.git')) || parent === dir) return { found: null, searched }
    dir = parent
  }
}

function locateEvalMd(explicit) {
  if (explicit) return explicit
  const { found, searched } = findEvalMd(process.cwd())
  if (!found) {
    throw new Error(`no EVAL.md found (looked in ${searched.join(', ')}, up to the repository root); run from inside the project or pass --eval-md <file>`)
  }
  return found
}

function main(argv) {
  let report
  let violations
  let markdown
  try {
    const args = parseArgs(argv)
    markdown = args.markdown
    const describe = JSON.parse(readFile('describe', args.describe))
    const { caseNames, appliesTo, floor } = parseEvalMd(readFile('EVAL.md', locateEvalMd(args.evalMd)))
    checkAppliesTo(describe, appliesTo)
    report = coverageReport(describe, caseNames, floor, appliesTo)
    violations = checkCovers(describe, caseNames, appliesTo)
  } catch (error) {
    process.stderr.write(`coverage: ${error.message}\n`)
    return 2
  }
  process.stdout.write(markdown ? `${renderMarkdown(report, violations)}\n` : `${JSON.stringify({ ...report, violations }, null, 2)}\n`)
  return violations.length === 0 ? 0 : 1
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2))
}
