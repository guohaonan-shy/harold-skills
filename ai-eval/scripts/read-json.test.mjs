/**
 * 读上游脚本写下的 JSON 文件：读不出来时，说出真正的原因。跑：
 *   `node --test ai-eval/scripts/read-json.test.mjs`
 *
 * 起因：eval-run 把上游脚本的 stdout 重定向成文件再交给下一个脚本。上游失败时文件是空的，
 * 下游只报「Unexpected end of JSON input」，看不出是哪个脚本没跑成。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readJson } from './read-json.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const tmp = () => mkdtempSync(join(tmpdir(), 'read-json-'))

test('合法的 JSON 照读', () => {
  const file = join(tmp(), 'a.json')
  writeFileSync(file, '{"a": 1}')

  assert.deepEqual(readJson(file), { a: 1 })
})

test('空文件：说是空的，指出这是上游脚本的输出、该回去看它的 stderr，不报 Unexpected end of JSON input', () => {
  const file = join(tmp(), 'cover.json')
  writeFileSync(file, '')

  assert.throws(
    () => readJson(file),
    (error) => {
      assert.match(error.message, /cover\.json/)
      assert.match(error.message, /empty/)
      assert.match(error.message, /stderr/)
      assert.doesNotMatch(error.message, /Unexpected end/)
      return true
    },
  )
})

test('只有空白也算空', () => {
  const file = join(tmp(), 'a.json')
  writeFileSync(file, '\n  \n')

  assert.throws(() => readJson(file), /empty/)
})

test('不是 JSON 的内容、不存在的文件：各自带文件名和原因', () => {
  const dir = tmp()
  writeFileSync(join(dir, 'bad.json'), 'coverage: cannot read EVAL.md')

  assert.throws(() => readJson(join(dir, 'bad.json')), /bad\.json.*not valid JSON/s)
  assert.throws(() => readJson(join(dir, 'nope.json')), /nope\.json.*ENOENT/s)
})

test('下游脚本读到上游留下的空文件：paired-stats 报出空文件，退出码 2', () => {
  const dir = tmp()
  const empty = join(dir, 'cover.json')
  writeFileSync(empty, '')

  const pairedStats = spawnSync('node', [join(here, 'paired-stats.mjs'), '--settle', empty], { encoding: 'utf8' })
  assert.equal(pairedStats.status, 2, pairedStats.stderr)
  assert.match(pairedStats.stderr, /empty/)
})
