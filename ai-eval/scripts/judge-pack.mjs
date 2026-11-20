#!/usr/bin/env node
/**
 * judge-pack：把一个判官任务（一个 scorer × 一个样本）打乱成判官看的内容，和只有调用方留着的对应关系。
 *
 *   node judge-pack.mjs --job <任务文件> --out-dir <目录> [--seed N]
 *
 * 读 `<任务文件>`（格式见 references/judge-format.md「判官任务」，项目写），在 <目录> 写两个文件：
 *   input.md       这次交给 Codex 的完整提示：固定提示、scorer 的 description、样本期望、打乱后的报告片段
 *   mapping.json   编号对应哪一边的第几份，以及评分文件应有的形状（只有调用方留着，不写进提示）
 * 命令行是调试用的；判官批量跑时 judge-run 直接调用这里导出的 packJob 和 renderInput。
 *
 * 脚本不认识任何项目：任务里已经写明这个 scorer 读哪些字段（路径加 description「读什么」两张表里的中文名）、
 * 拿哪些期望。判官只拿到被 description 点名的字段（reads 和 compare_with），没被点名的（比如用户读不到的中间稿）
 * 一个字也不给；每个片段用表里的中文名标名，不露路径；报告随机打乱、只标「报告 1–N」，不带边、遍数、样本编号的任何痕迹。
 *
 * 退出码：0 成功，2 用法有误或任务写错（原因在 stderr）。
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { randomInt } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const FORMAT = 2
export const PROMPT_FILE = join(dirname(fileURLToPath(import.meta.url)), '..', 'references', 'judge-prompt.md')

/**
 * 取字段。路径从报告文件的根写起（`report.question_scores[].feedback`）；`[]` 表示列表里的每一项，
 * 取到一个同样长的列表，缺的位置是 null（保持各个字段按位置对得上），嵌套的 `[]` 得到嵌套的列表。
 * 取不到返回 null。
 */
export function extractPath(document, path) {
  const walk = (value, segments) => {
    if (segments.length === 0) return value === undefined ? null : value
    const [segment, ...rest] = segments
    const each = segment.endsWith('[]')
    const key = each ? segment.slice(0, -2) : segment
    const next = key === '' ? value : value !== null && typeof value === 'object' && !Array.isArray(value) ? value[key] : undefined
    if (!each) return walk(next, rest)
    if (!Array.isArray(next)) return null
    return next.map((item) => walk(item, rest))
  }
  return walk(document, path.split('.'))
}

/** 带种子的伪随机（mulberry32），同一个种子打乱得一样，测试和重放用。 */
function random(seed) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffled(items, seed) {
  const next = random(seed)
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

const isText = (value) => typeof value === 'string' && value.trim() !== ''

const isField = (field) => field !== null && typeof field === 'object' && isText(field.path) && isText(field.name)

export function checkJob(job) {
  if (!job || job.format !== FORMAT) throw new Error(`判官任务：format 必须是 ${FORMAT}`)
  for (const key of ['user_task', 'scorer', 'sample', 'description']) {
    if (!isText(job[key])) throw new Error(`判官任务：缺 ${key}`)
  }
  const where = `判官任务 ${job.scorer} / 样本 ${job.sample}`
  for (const key of ['reads', 'compare_with']) {
    if (!Array.isArray(job[key]) || !job[key].every(isField)) throw new Error(`${where}：${key} 必须是 {path, name} 的数组（路径和中文名）`)
  }
  if (job.reads.length === 0) throw new Error(`${where}：reads 是空的，判官没有可打分的字段`)
  const fields = [...job.reads, ...job.compare_with]
  for (const key of ['path', 'name']) {
    const seen = new Set()
    for (const field of fields) {
      if (seen.has(field[key])) throw new Error(`${where}：${key} ${field[key]} 出现了不止一次，判官分不清是哪个片段`)
      seen.add(field[key])
    }
  }
  if (job.expected !== null && (typeof job.expected !== 'object' || Array.isArray(job.expected))) {
    throw new Error(`${where}：expected 必须是对象，或 null（这个 scorer 不读期望）`)
  }
  if (!Array.isArray(job.reports) || job.reports.length === 0) throw new Error(`${where}：没有报告`)
  for (const report of job.reports) {
    if (!['baseline', 'candidate'].includes(report.side) || !Number.isInteger(report.run)) {
      throw new Error(`${where}：每份报告要写 side（baseline / candidate）和 run（第几份）`)
    }
  }
  // 还原靠 (边, 第几份) 找回来路：同一边的同一份出现两次，分数就不知道该记给谁
  const seen = new Map()
  for (const { side, run } of job.reports) seen.set(`${side} 第 ${run} 份`, (seen.get(`${side} 第 ${run} 份`) ?? 0) + 1)
  for (const [which, times] of seen) {
    if (times > 1) throw new Error(`${where}：${which}出现了 ${times} 次，判完分数还原不回来`)
  }
}

/**
 * 打包一个判官任务。返回 { blind, mapping }：blind 是判官看的，mapping 调用方留着。
 * `seed` 不给就随机取一个（记在映射里）；每次判（包括重判）重新打乱，所以每次有自己的映射。
 */
export function packJob(job, { seed } = {}) {
  checkJob(job)
  const effectiveSeed = Number.isInteger(seed) ? seed : randomInt(0, 2 ** 31)
  const fields = [...job.reads, ...job.compare_with]
  const order = shuffled(job.reports, effectiveSeed)
  const blind = {
    format: FORMAT,
    description: job.description,
    expected: job.expected,
    reports: order.map((report, index) => ({
      label: index + 1,
      fragments: fields.map(({ path, name }) => ({ name, value: extractPath(report.document, path) })),
    })),
  }
  const mapping = {
    format: FORMAT,
    scorer: job.scorer,
    sample: job.sample,
    seed: effectiveSeed,
    labels: order.map((report, index) => ({ label: index + 1, side: report.side, run: report.run })),
    expect: { reports: order.length },
  }
  return { blind, mapping }
}

const json = (value) => JSON.stringify(value, null, 2)

/**
 * 交给 Codex 的完整提示：固定提示（references/judge-prompt.md）、scorer 的 description 原文、样本期望、报告片段
 * （每个片段的标题是「读什么」表里的中文名）。
 * 这个文本整个存下来（`<样本>.input.md`），所以不放任何只有调用方知道的东西。
 */
export function renderInput(blind, fixedPrompt) {
  const sections = [fixedPrompt.trim(), `# 评分标准\n\n${blind.description.trim()}`]
  sections.push(
    blind.expected === null
      ? '# 样本期望\n\n这个评分标准不读样本期望。'
      : `# 样本期望\n\n\`\`\`json\n${json(blind.expected)}\n\`\`\``,
  )
  const reports = blind.reports.map((report) => {
    const fragments = report.fragments.map(({ name, value }) => `### ${name}\n\n\`\`\`json\n${json(value)}\n\`\`\``)
    return [`## 报告 ${report.label}`, ...fragments].join('\n\n')
  })
  sections.push(['# 报告', ...reports].join('\n\n'))
  return `${sections.join('\n\n')}\n`
}

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--job') args.job = argv[++i]
    else if (argv[i] === '--out-dir') args.outDir = argv[++i]
    else if (argv[i] === '--seed') args.seed = Number(argv[++i])
    else throw new Error(`unknown argument ${argv[i]}`)
  }
  for (const [flag, key] of [['--job', 'job'], ['--out-dir', 'outDir']]) {
    if (!args[key]) throw new Error(`${flag} <路径> is required`)
  }
  if (args.seed !== undefined && !Number.isInteger(args.seed)) throw new Error('--seed must be an integer')
  return args
}

function main(argv) {
  try {
    const args = parseArgs(argv)
    const job = JSON.parse(readFileSync(args.job, 'utf8'))
    const { blind, mapping } = packJob(job, { seed: args.seed })
    mkdirSync(args.outDir, { recursive: true })
    writeFileSync(join(args.outDir, 'input.md'), renderInput(blind, readFileSync(PROMPT_FILE, 'utf8')))
    writeFileSync(join(args.outDir, 'mapping.json'), `${json(mapping)}\n`)
    process.stdout.write(`${JSON.stringify({ packed: job.scorer, sample: job.sample, reports: mapping.expect.reports })}\n`)
    return 0
  } catch (error) {
    process.stderr.write(`judge-pack: ${error.message}\n`)
    return 2
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2))
}
