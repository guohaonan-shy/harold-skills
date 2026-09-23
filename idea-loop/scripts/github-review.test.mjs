import test from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync, verify } from 'node:crypto'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { appConfig, appJwt, appToken, marker, parseMarker, publish, readiness, snapshot, validatePlan } from './github-review.mjs'

const reviewed = 'a'.repeat(40)
const base = 'b'.repeat(40)
const fixed = 'c'.repeat(40)
const mergeBase = 'd'.repeat(40)
const clone = value => structuredClone(value)

function checks(overrides = {}) {
  return ['correctness', 'standards', 'spec', 'verification'].map(name => ({ name, required: true, status: 'passed',
    evidence: 'Executed at the reviewed SHA', ...(overrides[name] || {}) }))
}
function finding(overrides = {}) {
  return { key: 'recording|duplicate-request', title: '重复提交会生成两条录音记录', priority: 'P1',
    axes: ['correctness'], blocksMerge: true, introduced: true, status: 'resolved',
    impact: '学生重复点提交时，历史页出现两条相同的录音。',
    repro: ['连续两次提交同一段录音', '打开历史页，看到两条记录'],
    fix: '提交接口按 request_id 去重', evidence: 'pytest tests/test_retry.py::test_duplicate -> 2 rows',
    instrument: 'unit-test', reproducer: 'uv run pytest tests/test_retry.py -k duplicate',
    location: { path: 'app/retry.py', line: 12 },
    verification: { result: 'passed', instrument: 'unit-test', beforeSha: reviewed, headSha: fixed,
      procedure: 'uv run pytest tests/test_retry.py -k duplicate', before: '2 rows, test failed', after: '1 row, test passed',
      testRef: 'tests/test_retry.py::test_duplicate', regressions: 'tests/test_retry.py 全部通过' }, ...overrides }
}
function plan(overrides = {}) {
  return { repo: 'owner/repo', pr: 7, round: 1, reviewedSha: reviewed, headSha: fixed, baseSha: base, mergeBaseSha: mergeBase,
    summary: '本轮发现 1 条本次引入的问题，已修复并验证。', checks: checks(), findings: [finding()], ...overrides }
}
// Stateful fake of the two REST endpoints the publisher uses.
function github(head = fixed) {
  const state = { pull: { head: { sha: head, ref: 'fix/retry' }, base: { sha: base, ref: 'main' }, state: 'open',
    body: 'Human description', title: 'Fix retries', html_url: 'https://github.com/owner/repo/pull/7' },
  conversation: [], inline: [], calls: [], nextId: 1 }
  const api = async (method, endpoint, data, paginate) => {
    state.calls.push({ method, endpoint, data: clone(data), paginate })
    if (method === 'GET' && endpoint === 'repos/owner/repo/pulls/7') return clone(state.pull)
    if (method === 'GET' && endpoint.includes('/issues/7/comments?')) return [clone(state.conversation.slice(0, 1)), clone(state.conversation.slice(1))]
    if (method === 'GET' && endpoint.includes('/pulls/7/comments?')) return [clone(state.inline)]
    if (method === 'POST' && endpoint === 'repos/owner/repo/issues/7/comments') {
      const id = state.nextId++
      const comment = { ...data, id, html_url: `https://github.com/owner/repo/pull/7#issuecomment-${id}`, created_at: new Date(id * 1000).toISOString() }
      state.conversation.push(comment)
      return clone(comment)
    }
    const edit = endpoint.match(/issues\/comments\/(\d+)$/)
    if (method === 'PATCH' && edit) {
      const target = state.conversation.find(c => c.id === Number(edit[1]))
      Object.assign(target, data)
      return clone(target)
    }
    throw new Error(`Unexpected API operation: ${method} ${endpoint}`)
  }
  api.identity = 'app'
  return { state, api }
}
const writes = state => state.calls.filter(c => c.method !== 'GET')

test('publishes one round post with the fixed finding template and a recoverable marker', async () => {
  const { state, api } = github()
  const result = await publish(plan(), api)
  assert.equal(writes(state).length, 1)
  const body = state.conversation[0].body
  assert.match(body, /^<!-- idea-loop-review /)
  assert.match(body, /## Review 第 1 轮 · 审 aaaaaaa → 修复后 ccccccc/)
  const order = ['**影响**', '**复现**', '**修法（已做）**', '**验证**', '<details><summary>证据']
  assert.deepEqual(order.map(s => body.indexOf(s)).toSorted((a, b) => a - b), order.map(s => body.indexOf(s)))
  assert.match(body, /1\. 连续两次提交同一段录音\n2\. 打开历史页/)
  assert.match(body, /修复前 aaaaaaa：2 rows, test failed/)
  assert.match(body, /blob\/c{40}\/app\/retry\.py#L12/)
  assert.equal(result.mergeReady, true)
  assert.equal(result.ids['recording|duplicate-request'], 'F-1')
  const record = parseMarker(body)
  assert.equal(record.kind, 'round-post')
  assert.equal(record.findings[0].evidence, undefined, 'marker stays compact')
})

test('retrying the same round edits the same post instead of duplicating it', async () => {
  const { state, api } = github()
  await publish(plan(), api)
  await publish(plan({ summary: '重试：补充了回归范围。' }), api)
  assert.equal(state.conversation.length, 1)
  assert.deepEqual(writes(state).map(c => c.method), ['POST', 'PATCH'])
  assert.match(state.conversation[0].body, /重试：补充了回归范围/)
})

test('round 2 reuses finding IDs by key, continues numbering and must follow round 1', async () => {
  const { state, api } = github()
  await publish(plan(), api)
  await assert.rejects(publish(plan({ round: 3 }), api), /Expected round 2/)
  await assert.rejects(publish(plan({ reviewedSha: 'e'.repeat(40), findings: [] }), api), /different reviewed SHA/)
  const second = { ...finding({ key: 'history|empty-state', title: '历史页空状态闪一下', priority: 'P2', blocksMerge: false,
    status: 'confirmed', verification: undefined }) }
  const result = await publish(plan({ round: 2, reviewedSha: fixed, findings: [second, finding({ status: 'resolved', verification: { ...finding().verification, beforeSha: fixed, headSha: fixed } })] }), api)
    .catch(error => error)
  assert.match(String(result), /later fix head/, 'a round without a fix commit cannot resolve anything')
  const ok = await publish(plan({ round: 2, reviewedSha: fixed, findings: [second] }), api)
  assert.equal(ok.ids['history|empty-state'], 'F-2')
  const snap = await snapshot('owner/repo', 7, api)
  assert.equal(snap.nextRound, 3)
  assert.equal(snap.findings.find(f => f.key === 'recording|duplicate-request').status, 'resolved', 'earlier rounds keep their outcome')
  assert.equal(state.conversation.length, 2)
})

test('the finding shape is enforced mechanically before any write', () => {
  const cases = [
    [{ title: '重复提交 app/retry.py:12 出错' }, /title/],
    [{ impact: '这是一句远远超过六十个字的影响描述，它把机制、调用链、文件位置和修法全部塞进了影响这一栏里，读者读完还是看不出到底谁受了影响。' }, /at most 60/],
    [{ impact: '在 app/retry.py:12 重复写入' }, /impact/],
    [{ repro: ['只有一步'] }, /two steps/],
    [{ instrument: 'vibes' }, /instrument/],
    [{ status: 'confirmed', verification: undefined, fix: '' }, /one fix/],
    [{ status: 'needs-decision', options: ['只有一个选项'] }, /two options/],
    [{ introduced: false }, /pre-existing problem cannot block/],
    [{ status: 'backlogged', introduced: false, blocksMerge: false }, /backlog path/],
    [{ verification: { ...finding().verification, instrument: 'static' } }, /cannot downgrade/],
    [{ verification: { ...finding().verification, testRef: '' } }, /regression test/],
    [{ verification: { ...finding().verification, beforeSha: base } }, /reviewed SHA/],
    [{ status: 'dismissed' }, /disposition/],
  ]
  for (const [override, message] of cases) assert.throws(() => validatePlan(plan({ findings: [finding(override)] })), message)
  assert.throws(() => validatePlan(plan({ checks: checks().filter(c => c.name !== 'spec') })), /required spec/)
  assert.throws(() => validatePlan(plan({ checks: checks({ correctness: { status: 'not-applicable' } }) })), /Correctness must run/)
  validatePlan(plan({ findings: [finding({ status: 'backlogged', introduced: false, blocksMerge: false, verification: undefined,
    backlog: { path: 'docs/quality-backlog.md', entry: '- [ ] **重复提交生成两条录音** —— …' } })] }))
  validatePlan(plan({ findings: [finding({ instrument: 'browser', verification: { ...finding().verification, instrument: 'browser', testRef: undefined } })] }))
})

test('readiness: backlog items never block; decisions, open blockers and check gaps do', () => {
  const backlogged = { key: 'a', status: 'backlogged', blocksMerge: false }
  const decision = { key: 'b', status: 'needs-decision', blocksMerge: true }
  const open = { key: 'c', status: 'confirmed', blocksMerge: true }
  assert.equal(readiness([backlogged], checks()).mergeReady, true)
  assert.deepEqual(readiness([backlogged, decision], checks()), { openBlockingCount: 0, needsHuman: ['b'], mergeReady: false })
  assert.equal(readiness([open], checks()).openBlockingCount, 1)
  assert.equal(readiness([], checks({ spec: { status: 'incomplete' } })).mergeReady, false)
})

test('stale head or closed PR stops publication before any write', async () => {
  const { state, api } = github('e'.repeat(40))
  await assert.rejects(publish(plan(), api), /base\/head changed/)
  assert.equal(writes(state).length, 0)
})

test('legacy per-finding comments stay readable and numbering continues after them', async () => {
  const { state, api } = github()
  state.inline.push({ id: 90, html_url: 'x', created_at: new Date(0).toISOString(),
    body: `${marker({ kind: 'finding', id: 'F-4', key: 'old', round: 1 })}\nold inline thread` })
  const snap = await snapshot('owner/repo', 7, api)
  assert.equal(snap.legacyCount, 1)
  assert.equal(snap.nextRound, 2)
  const result = await publish(plan({ round: 2 }), api)
  assert.equal(result.ids['recording|duplicate-request'], 'F-5')
})

test('marker safely round-trips HTML terminators and literal shell syntax', () => {
  const record = { kind: 'round-post', text: 'x --> <!-- $(rm -rf /) `id`' }
  assert.equal(marker(record).includes('-->', 20), true)
  assert.deepEqual(parseMarker(marker(record)), record)
})

test('GitHub App identity: config lookup, signed JWT, installation token, no config means gh login', async () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const dir = mkdtempSync(join(tmpdir(), 'idea-loop-app-'))
  const pem = join(dir, 'app.pem')
  writeFileSync(pem, privateKey.export({ type: 'pkcs8', format: 'pem' }))
  const configPath = join(dir, 'github-apps.json')
  writeFileSync(configPath, JSON.stringify({ 'owner/repo': { appId: 4948428, privateKeyPath: pem } }))
  assert.equal(appConfig('other/repo', configPath), null)
  assert.equal(appConfig('owner/repo', join(dir, 'missing.json')), null)
  const config = appConfig('owner/repo', configPath)

  const jwt = appJwt(config.appId, privateKey.export({ type: 'pkcs8', format: 'pem' }), 1_000_000)
  const [header, payload, signature] = jwt.split('.')
  assert.ok(verify('RSA-SHA256', Buffer.from(`${header}.${payload}`), publicKey, Buffer.from(signature, 'base64url')))
  assert.deepEqual(JSON.parse(Buffer.from(payload, 'base64url')), { iat: 999_940, exp: 1_000_540, iss: '4948428' })

  const requests = []
  const fetchImpl = async (url, options) => {
    requests.push({ url, method: options.method || 'GET', auth: options.headers.Authorization })
    if (url.endsWith('/repos/owner/repo/installation')) return { ok: true, json: async () => ({ id: 55 }) }
    if (url.endsWith('/app/installations/55/access_tokens')) return { ok: true, json: async () => ({ token: 'ghs_test' }) }
    return { ok: false, status: 404 }
  }
  assert.equal(await appToken('owner/repo', { config, fetchImpl, nowSeconds: 1_000_000 }), 'ghs_test')
  assert.deepEqual(requests.map(r => r.method), ['GET', 'POST'])
  assert.ok(requests.every(r => r.auth.startsWith('Bearer ')))
  assert.equal(await appToken('owner/repo', { config: null, fetchImpl }), null)
  await assert.rejects(appToken('owner/repo', { config, fetchImpl: async () => ({ ok: false, status: 404 }) }), /not installed/)
})
