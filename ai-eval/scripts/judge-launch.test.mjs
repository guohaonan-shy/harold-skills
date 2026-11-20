/**
 * judge-launch 的行为：一次判官会话是怎么起的。跑：
 *   `node --test ai-eval/scripts/judge-launch.test.mjs`
 *
 * 不真起 codex：`runCodex` 起的是一个假的可执行文件，它把收到的参数、环境和 stdin 记下来。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EFFORT, MODEL, WITHHELD_ENV, appendRecord, launchArgs, runCodex, scrubbedEnv, tokensUsedIn } from './judge-launch.mjs'

const flagValue = (args, flag) => args[args.indexOf(flag) + 1]

test('启动参数：模型 gpt-6-luna、思考强度 high、一次性会话、提示走 stdin', () => {
  const args = launchArgs({ cwd: '/work/dir', lastMessage: '/work/last.txt' })

  assert.equal(MODEL, 'gpt-6-luna')
  assert.equal(EFFORT, 'high')
  assert.equal(args[0], 'exec')
  assert.equal(flagValue(args, '-m'), 'gpt-6-luna')
  assert.ok(args.includes('model_reasoning_effort="high"'))
  assert.equal(flagValue(args, '-C'), '/work/dir')
  assert.equal(flagValue(args, '-o'), '/work/last.txt')
  assert.equal(flagValue(args, '-s'), 'workspace-write')
  assert.ok(args.includes('--ephemeral'), '一次性：不留会话，下一个样本不会看到这一个')
  assert.equal(args.at(-1), '-', '提示从 stdin 读')
})

test('启动参数：不用 resume，不派 subagent，不放开沙箱', () => {
  const args = launchArgs({ cwd: '/w', lastMessage: '/l' })

  assert.ok(!args.includes('resume'))
  assert.ok(!args.some((arg) => /spawn_agent|subagent|danger|bypass/i.test(arg)))
})

test('模型和思考强度可以换，参数跟着变', () => {
  const args = launchArgs({ model: 'other-model', effort: 'low', cwd: '/w', lastMessage: '/l' })

  assert.equal(flagValue(args, '-m'), 'other-model')
  assert.ok(args.includes('model_reasoning_effort="low"'))
})

test('环境：扣留 OPENAI_API_KEY 和 CODEX_API_KEY，其余原样', () => {
  const env = scrubbedEnv({ OPENAI_API_KEY: 'a', CODEX_API_KEY: 'b', PATH: '/bin', HOME: '/h' })

  assert.deepEqual(WITHHELD_ENV, ['OPENAI_API_KEY', 'CODEX_API_KEY'])
  assert.deepEqual(env, { PATH: '/bin', HOME: '/h' })
})

test('token 数从 codex 的输出里取；没有就是 null', () => {
  assert.equal(tokensUsedIn('...\ntokens used\n12,345\nwrote it'), 12345)
  assert.equal(tokensUsedIn('tokens used: 987'), 987)
  assert.equal(tokensUsedIn('nothing here'), null)
})

function fakeCodex(dir, body) {
  const path = join(dir, 'fake-codex.mjs')
  writeFileSync(path, `#!/usr/bin/env node\n${body}\n`)
  chmodSync(path, 0o755)
  return path
}

test('起会话：真起一个进程，参数、被扣留的环境、stdin 的提示都对，并交回耗时和 token 数', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'judge-launch-'))
  const seen = join(dir, 'seen.json')
  const bin = fakeCodex(dir, `
import { readFileSync, writeFileSync } from 'node:fs'
const prompt = readFileSync(0, 'utf8')
writeFileSync(${JSON.stringify(seen)}, JSON.stringify({ args: process.argv.slice(2), env: process.env, prompt, cwd: process.cwd() }))
console.error('tokens used\\n4,321')
`)
  const cwd = join(dir, 'session')
  const started = []

  const ran = await runCodex({
    codexBin: bin, cwd, prompt: '整份提示', log: join(dir, 'codex.log'), lastMessage: join(dir, 'last.txt'),
    env: { PATH: process.env.PATH, OPENAI_API_KEY: 'secret', CODEX_API_KEY: 'secret2', KEEP: 'yes' },
    onStart: (info) => started.push(info),
  })

  assert.equal(ran.exitCode, 0)
  assert.equal(ran.tokensUsed, 4321)
  assert.ok(ran.durationMs >= 0)
  assert.equal(started.length, 1)
  assert.ok(Number.isInteger(started[0].pid))
  const record = JSON.parse(readFileSync(seen, 'utf8'))
  assert.equal(record.prompt, '整份提示')
  assert.equal(record.args[0], 'exec')
  assert.equal(flagValue(record.args, '-m'), 'gpt-6-luna')
  assert.equal(flagValue(record.args, '-C'), cwd)
  assert.equal(record.env.OPENAI_API_KEY, undefined)
  assert.equal(record.env.CODEX_API_KEY, undefined)
  assert.equal(record.env.KEEP, 'yes')
})

test('起会话：codex 起不来、被信号结束，各自交回 error / signal', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'judge-launch-'))
  const common = { cwd: join(dir, 's'), prompt: 'p', log: join(dir, 'l.log'), lastMessage: join(dir, 'm.txt'), env: { PATH: process.env.PATH } }

  const missing = await runCodex({ ...common, codexBin: join(dir, 'no-such-codex') })
  assert.match(missing.error, /cannot start/)

  const killed = await runCodex({ ...common, codexBin: fakeCodex(dir, "process.kill(process.pid, 'SIGTERM')") })
  assert.equal(killed.signal, 'SIGTERM')
})

test('会话记录：追加进 judge-sessions.json，项目的 stop 命令读它', () => {
  const dir = mkdtempSync(join(tmpdir(), 'judge-launch-'))
  const file = join(dir, 'judge-sessions.json')

  appendRecord(file, { pid: 1, pgid: 1, started: 'Sun Oct 25 12:00:01 2026', label: 'a/1' })
  appendRecord(file, { pid: 2, pgid: 2, started: null, label: 'a/2' })

  const record = JSON.parse(readFileSync(file, 'utf8'))
  assert.equal(record.format, 1)
  assert.deepEqual(record.sessions.map((session) => session.pid), [1, 2])
})
