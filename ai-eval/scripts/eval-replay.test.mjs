/**
 * Guard for the eval-replay skill's contract.
 *
 * eval-replay is text an agent follows, so there is no code to run; what can be checked mechanically is
 * that the pieces other files depend on are present and stay in one place: the skill's description routes
 * the right changes to it and away from eval-run, the eight-item completion checklist is all there, the
 * result-row shape and the stats command match what `replay-stats.mjs` accepts, the reporting rules are
 * pointed at (not restated), and the README documents it.
 *
 * Written before the skill and failing on a tree without it (no SKILL.md), which is the evidence that it
 * can tell the missing or half-written skill from the finished one. `reporting-rules.test.mjs` carries the
 * "does not restate the reporting rules" half.
 *
 * 跑：`node --test ai-eval/scripts/eval-replay.test.mjs`
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const SKILL_PATH = join(root, 'skills', 'eval-replay', 'SKILL.md')
const read = () => {
  assert.ok(existsSync(SKILL_PATH), 'skills/eval-replay/SKILL.md is missing')
  return readFileSync(SKILL_PATH, 'utf8')
}
const frontmatter = (text) => text.split('\n---\n')[0]
const body = (text) => text.split('\n---\n').slice(1).join('\n---\n')

/** Body of the section whose heading line matches `heading`, up to the next heading of the same or higher level. */
function section(text, heading) {
  const lines = text.split('\n')
  const start = lines.findIndex((l) => /^#{1,6} /.test(l) && heading.test(l))
  assert.notEqual(start, -1, `no section matching ${heading}`)
  const level = lines[start].match(/^#+/)[0].length
  const rest = lines.slice(start + 1)
  const end = rest.findIndex((l) => {
    const m = l.match(/^(#+) /)
    return m && m[1].length <= level
  })
  return rest.slice(0, end === -1 ? undefined : end).join('\n')
}

test('the description routes one-step-of-a-conversation changes here and pipeline changes to eval-run', () => {
  const head = frontmatter(read())
  assert.match(head, /^name: eval-replay$/m)
  const description = head.match(/^description: (.+)$/m)?.[1] ?? ''
  assert.match(description, /多轮对话/)
  assert.match(description, /线上写法/)
  assert.match(description, /eval-run/)
  assert.ok(!/disable-model-invocation/.test(head), 'eval-run points at it, so a model has to be able to call it')
})

test('the body stays under the 5000-character limit (AGENTS.md way of counting)', () => {
  assert.ok([...body(read()).replace(/^\n/, '')].length < 5000)
})

test('the completion list carries all eight items, each with its own anchor', () => {
  const list = section(read(), /完成条件/)
  const items = list.split('\n').filter((l) => /^\d\. /.test(l))
  assert.equal(items.length, 8, `expected 8 numbered items, got ${items.length}`)
  const anchors = [
    /只回放一步[\s\S]*系统提示词[\s\S]*历史[\s\S]*一个 case 一次请求/,
    /并发[\s\S]*12[\s\S]*先完成的先落盘/,
    /服务商钉选[\s\S]*推理参数[\s\S]*钉选 → 不钉选 → 去掉推理参数[\s\S]*退避/,
    /追加[\s\S]*case × 变体 × 第几次[\s\S]*续跑[\s\S]*按模型分批/,
    /代码判[\s\S]*judge[\s\S]*真的产出了文本[\s\S]*只重判/,
    /聚合只读结果文件[\s\S]*空跑/,
    /仓库外[\s\S]*\.gitignore[\s\S]*编造/,
    /首轮的写法[\s\S]*环境变量/,
  ]
  anchors.forEach((re, i) => assert.match(items[i], re, `item ${i + 1} lost its anchor: ${items[i]}`))
})

test('it gives the result-row shape and the stats command, and both match replay-stats', () => {
  const text = read()
  for (const field of ['case', 'group', 'variant', 'run', 'status', 'pass', 'score']) {
    assert.match(text, new RegExp(`\\b${field}\\b`))
  }
  assert.match(text, /"ok" \| "platform_error"/)
  assert.match(text, /baseline/)
  assert.match(text, /node <插件目录>\/scripts\/replay-stats\.mjs --results \S+/, 'no replay-stats command line')
  assert.match(text, /退出码 1/)
  assert.match(text, /同一个键[\s\S]*最后一行/)
  // 抽查：脚本真的接受 skill 里写的这个形状
  const file = join(mkdtempSync(join(tmpdir(), 'eval-replay-guard-')), 'results.jsonl')
  const row = { case: 'c', group: 'g', variant: 'baseline', run: 1, status: 'ok', pass: true, score: null }
  writeFileSync(file, `${JSON.stringify(row)}\n`)
  const run = spawnSync(process.execPath, [join(root, 'scripts', 'replay-stats.mjs'), '--results', file], { encoding: 'utf8' })
  assert.equal(run.status, 0, run.stderr)
})

test("the numbers are the script's: the skill points at the reporting rules and does not compute its own", () => {
  const text = read()
  assert.match(text, /<插件目录>\/references\/reporting-rules\.md/)
  assert.match(text, /数字全部出自/)
})

test('the README shows an eval-replay example and counts seven skills', () => {
  const readme = readFileSync(join(root, 'README.md'), 'utf8')
  assert.match(readme, /ai-eval:eval-replay/)
  assert.match(readme, /replay-stats/)
  assert.match(readme, /`skills\/`：7 个 skill/)
})
