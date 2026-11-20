#!/usr/bin/env node
/**
 * judge-launch：起一次 `codex exec`，判一个 scorer × 一个样本。
 *
 * 这个文件导出启动的几块（judge-run 调用）：
 *   launchArgs      `codex exec` 的参数：模型、思考强度、一次性模式、工作目录、最后一条消息的落点
 *   scrubbedEnv     起会话的环境，扣留 OPENAI_API_KEY 和 CODEX_API_KEY：判官走 Codex 订阅，不走付费 API
 *   codexVersion    `codex --version` 的输出，随结果存下来
 *   runCodex        起一次会话：提示从 stdin 给，会话领一个进程组，输出写进日志，结束时交回耗时和 token 数
 *
 * 每次判都是一次全新的 `codex exec`（--ephemeral：不留会话，也不用 `exec resume`，前几批不会留在上下文里）。
 * 没有管理会话，也不派 subagent。模型和思考强度是命令行参数，所以「判官跑在约定的模型上」由 launchArgs 的测试守，
 * 不靠事后翻会话日志。
 *
 * 命令行（调试用）：
 *   node judge-launch.mjs --cwd <目录> --prompt-file <提示文件> [--model gpt-6-luna] [--effort high] [--codex-bin codex]
 * 在 <目录> 起一次会话并等它结束，输出（stdout，JSON）：{ exitCode, signal, durationMs, tokensUsed }。
 * 退出码：0 会话正常结束，1 codex 起不来或会话异常结束，2 用法有误。
 */
import { spawn, spawnSync } from 'node:child_process'
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const MODEL = 'gpt-6-luna'
export const EFFORT = 'high'
/** 判官调用环境里扣留的变量（EVAL.md「判官配置」：防判官走付费 API）。 */
export const WITHHELD_ENV = ['OPENAI_API_KEY', 'CODEX_API_KEY']
export const RECORD_FORMAT = 1
export const RECORD_FILE = 'judge-sessions.json'

export function launchArgs({ model = MODEL, effort = EFFORT, cwd, lastMessage }) {
  return [
    'exec',
    '-m', model,
    '-c', `model_reasoning_effort="${effort}"`,
    '-s', 'workspace-write',
    '--ephemeral',
    '--skip-git-repo-check',
    '-C', cwd,
    '-o', lastMessage,
    '-',
  ]
}

export function scrubbedEnv(env) {
  return Object.fromEntries(Object.entries(env).filter(([key]) => !WITHHELD_ENV.includes(key)))
}

export function codexVersion(codexBin = 'codex') {
  const result = spawnSync(codexBin, ['--version'], { encoding: 'utf8', env: scrubbedEnv(process.env) })
  return result.status === 0 ? result.stdout.trim() : null
}

/** codex 在会话结束时打印 `tokens used` 和一个数；取不到是 null。 */
export function tokensUsedIn(logText) {
  const match = /tokens used[:\s]+([\d,]+)/i.exec(logText)
  return match ? Number(match[1].replaceAll(',', '')) : null
}

function startTimeOf(pid) {
  const result = spawnSync('ps', ['-o', 'lstart=', '-p', String(pid)], { encoding: 'utf8' })
  const text = result.stdout.trim()
  return text === '' ? null : text
}

/**
 * 在 <work-dir>/judge-sessions.json 里追加一条记录（进程号、进程组、进程启动时间……）。
 * 项目的 stop 命令读这份记录，把还活着的判官会话整组结束；启动时间防止进程号被复用后误杀别的进程。
 */
export function appendRecord(recordPath, session) {
  let record = { format: RECORD_FORMAT, sessions: [] }
  if (existsSync(recordPath)) record = JSON.parse(readFileSync(recordPath, 'utf8'))
  record.sessions.push(session)
  const temporary = `${recordPath}.tmp`
  writeFileSync(temporary, `${JSON.stringify(record, null, 2)}\n`)
  renameSync(temporary, recordPath)
}

/**
 * 起一次会话，等它结束。`prompt` 从 stdin 给；`cwd` 是会话的工作根目录（评分文件写在里面）；`log` 是输出的落点；
 * `onStart({ pid, started })` 在进程起来之后立刻调用（judge-run 用它写会话记录）。
 * 返回 { exitCode, signal, durationMs, tokensUsed }，codex 起不来时是 { error }。
 */
export function runCodex({ codexBin = 'codex', model = MODEL, effort = EFFORT, cwd, prompt, log, lastMessage, env = process.env, onStart }) {
  mkdirSync(cwd, { recursive: true })
  const logFd = openSync(log, 'w')
  const startedAt = Date.now()
  const child = spawn(codexBin, launchArgs({ model, effort, cwd, lastMessage }), {
    cwd,
    env: scrubbedEnv(env),
    detached: true,
    stdio: ['pipe', logFd, logFd],
  })
  return new Promise((resolveRun) => {
    let failedToStart = false
    child.on('error', (error) => {
      failedToStart = true
      closeSync(logFd)
      resolveRun({ error: `cannot start ${codexBin}: ${error.message}` })
    })
    child.on('close', (exitCode, signal) => {
      if (failedToStart) return // 'error' 已经交回了结果，日志也关了
      closeSync(logFd)
      let text = ''
      try {
        text = readFileSync(log, 'utf8')
      } catch {
        // 日志读不了只影响 token 数
      }
      resolveRun({ exitCode, signal, durationMs: Date.now() - startedAt, tokensUsed: tokensUsedIn(text) })
    })
    if (child.pid === undefined) return // 'error' 事件会给出结果
    child.stdin.on('error', () => {}) // 子进程没读完就退出了，由退出码说话
    child.stdin.end(prompt)
    onStart?.({ pid: child.pid, started: startTimeOf(child.pid) })
  })
}

function parseArgs(argv) {
  const args = { model: MODEL, effort: EFFORT, codexBin: 'codex' }
  const flags = { '--cwd': 'cwd', '--prompt-file': 'promptFile', '--model': 'model', '--effort': 'effort', '--codex-bin': 'codexBin' }
  for (let i = 0; i < argv.length; i += 1) {
    const key = flags[argv[i]]
    if (!key) throw new Error(`unknown argument ${argv[i]}`)
    args[key] = argv[++i]
  }
  for (const flag of ['--cwd', '--prompt-file']) {
    if (!args[flags[flag]]) throw new Error(`${flag} is required`)
  }
  return args
}

async function main(argv) {
  let args
  try {
    args = parseArgs(argv)
  } catch (error) {
    process.stderr.write(`judge-launch: ${error.message}\n`)
    return 2
  }
  const cwd = resolve(args.cwd)
  mkdirSync(cwd, { recursive: true })
  const result = await runCodex({
    codexBin: args.codexBin, model: args.model, effort: args.effort, cwd,
    prompt: readFileSync(args.promptFile, 'utf8'), log: join(cwd, 'codex.log'), lastMessage: join(cwd, 'last.txt'),
  })
  process.stdout.write(`${JSON.stringify(result)}\n`)
  return result.error || result.exitCode !== 0 ? 1 : 0
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => process.exit(code))
}
