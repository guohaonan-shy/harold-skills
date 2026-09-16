import test from 'node:test'
import assert from 'node:assert/strict'
import { marker, parseMarker, publish, readiness, snapshot } from './github-review.mjs'

const head = 'a'.repeat(40)
const base = 'b'.repeat(40)
const next = 'c'.repeat(40)
const clone = value => structuredClone(value)
function checks() {
  return ['correctness', 'standards', 'spec', 'verification'].map(name => ({ name, required: true, status: 'passed', evidence: 'Executed the relevant check at the reviewed SHA' }))
}
function finding(overrides = {}) {
  return { key: 'recording|idempotency|duplicate-request', title: 'Repeated request creates duplicate recording',
    priority: 'P1', axes: ['correctness', 'spec'], blocksMerge: true, status: 'confirmed',
    body: 'Input: repeat request 42. Expected one row; observed two. Reproducer: pytest tests/test_retry.py.',
    location: { path: 'app/retry.py', line: 12, side: 'RIGHT' }, ...overrides }
}
function plan(overrides = {}) {
  return { repo: 'owner/repo', pr: 7, headSha: head, baseSha: base,
    expectedBody: 'Original human context', expectedTitle: 'Original title',
    body: 'Current change with examples\n\n```mermaid\nflowchart LR\nA-->B\n```', title: 'Current title',
    summary: '本轮核对了重复请求的数据库结果。', checks: checks(), updates: [finding()], ...overrides }
}
// Stateful API fake exercises the real publisher and recovery, not generated prompt wording.
function github() {
  const state = { pull: { head: { sha: head, ref: 'fix/retry' }, base: { sha: base, ref: 'main' },
    state: 'open', body: 'Original human context', title: 'Original title', html_url: 'https://github.com/owner/repo/pull/7' },
  conversation: [], inline: [], threads: [], calls: [], nextId: 1, fail: null }
  const add = (list, data) => {
    const id = state.nextId++
    const value = { ...data, id, html_url: `https://github.com/owner/repo/pull/7#comment-${id}`,
      created_at: new Date(id * 1000).toISOString() }
    list.push(value)
    return clone(value)
  }
  const api = async (method, endpoint, data, paginate) => {
    state.calls.push({ method, endpoint, data: clone(data), paginate })
    if (state.fail?.(method, endpoint, data)) throw new Error('Simulated API failure')
    if (method === 'GET' && endpoint === 'repos/owner/repo/pulls/7') return clone(state.pull)
    if (method === 'GET' && endpoint.includes('/issues/7/comments?')) return [clone(state.conversation.slice(0, 1)), clone(state.conversation.slice(1))]
    if (method === 'GET' && endpoint.includes('/pulls/7/comments?')) return [clone(state.inline.slice(0, 1)), clone(state.inline.slice(1))]
    if (endpoint === 'graphql' && data.query.startsWith('query')) {
      const page = data.variables.cursor ? state.threads.slice(1) : state.threads.slice(0, 1)
      return { data: { repository: { pullRequest: { reviewThreads: { nodes: clone(page),
        pageInfo: { hasNextPage: !data.variables.cursor && state.threads.length > 1, endCursor: 'page2' } } } } } }
    }
    if (endpoint === 'graphql' && data.query.startsWith('mutation')) {
      const thread = state.threads.find(t => t.id === data.variables.id)
      assert.ok(thread, 'Must use GraphQL thread ID')
      thread.isResolved = !data.query.includes('unresolveReviewThread')
      return { data: { mutation: { thread: clone(thread) } } }
    }
    if (method === 'POST' && endpoint === 'repos/owner/repo/pulls/7/comments') {
      const comment = add(state.inline, data)
      state.threads.push({ id: `THREAD_${comment.id}`, isResolved: false, isOutdated: false,
        comments: { nodes: [{ databaseId: comment.id }] } })
      return comment
    }
    const reply = endpoint.match(/pulls\/7\/comments\/(\d+)\/replies$/)
    if (method === 'POST' && reply) {
      assert.ok(state.inline.some(c => c.id === Number(reply[1]) && !c.in_reply_to_id), 'Must reply to root')
      return add(state.inline, { ...data, in_reply_to_id: Number(reply[1]) })
    }
    if (method === 'POST' && endpoint === 'repos/owner/repo/issues/7/comments') return add(state.conversation, data)
    if (method === 'PATCH' && endpoint === 'repos/owner/repo/pulls/7') {
      Object.assign(state.pull, data)
      return clone(state.pull)
    }
    const comment = endpoint.match(/issues\/comments\/(\d+)$/)
    if (method === 'PATCH' && comment) {
      const target = state.conversation.find(c => c.id === Number(comment[1]))
      Object.assign(target, data)
      return clone(target)
    }
    throw new Error(`Unexpected API operation: ${method} ${endpoint}`)
  }
  return { state, api }
}

test('publishes inline findings and one retry-safe round, with Markdown intact', async () => {
  const { state, api } = github()
  const p = plan({ summary: 'Literal `$(secret)` and "quotes"\n中文段落' })
  const first = await publish(p, api)
  const second = await publish(p, api)
  assert.equal(first.mergeReady, false)
  assert.equal(first.openBlockingCount, 1)
  assert.equal(second.round, 1)
  assert.equal(state.inline.length, 1)
  assert.equal(state.conversation.length, 1)
  assert.equal(state.pull.body, p.body)
  assert.ok(state.conversation[0].body.includes(p.summary))
  assert.deepEqual(parseMarker(state.conversation[0].body).checks, p.checks)
})

test('new head replies to original thread and resolves only with verification', async () => {
  const { state, api } = github()
  await publish(plan(), api)
  state.pull.head.sha = next
  const p = plan({ headSha: next, expectedBody: state.pull.body, expectedTitle: state.pull.title,
    updates: [finding({ status: 'resolved', body: '独立复验：重复请求现在只有一行，正常请求仍成功。',
      verification: { headSha: next, result: 'passed', procedure: 'pytest tests/test_retry.py', before: '2 rows', after: '1 row' } })] })
  const result = await publish(p, api)
  await publish(p, api)
  assert.equal(result.round, 2)
  assert.equal(result.mergeReady, true)
  assert.equal(state.inline.length, 2)
  assert.equal(state.inline[1].in_reply_to_id, state.inline[0].id)
  assert.equal(state.threads[0].isResolved, true)
  const recovered = await snapshot('owner/repo', 7, api)
  assert.equal(recovered.findings[0].id, 'F-1')
  assert.equal(recovered.findings[0].status, 'resolved')
})

test('rejects unverified or stale verification before any write', async () => {
  const { state, api } = github()
  for (const verification of [undefined, { headSha: next, result: 'passed', procedure: 'test', before: 'bad', after: 'good' }]) {
    await assert.rejects(publish(plan({ updates: [finding({ status: 'resolved', verification })] }), api), /Resolution requires/)
  }
  assert.equal(state.calls.length, 0)
})

test('retains omitted findings and prevents incomplete/no-spec from appearing green', async () => {
  const { api } = github()
  await publish(plan(), api)
  const p = plan({ updates: [], checks: checks().map(c => c.name === 'spec' ? { ...c, status: 'incomplete', evidence: 'Missing acceptance agreement' } : c) })
  const result = await publish(p, api)
  assert.equal(result.openBlockingCount, 1)
  assert.equal(result.mergeReady, false)
  assert.equal(readiness([], p.checks).mergeReady, false)
})

test('rejects stale base/head and concurrent human description edits', async () => {
  for (const change of [s => { s.pull.head.sha = next }, s => { s.pull.base.sha = next }, s => { s.pull.body = 'Human amendment' }]) {
    const { state, api } = github()
    change(state)
    await assert.rejects(publish(plan(), api), /changed|edited/)
    assert.equal(state.inline.length, 0)
    assert.equal(state.conversation.length, 0)
  }
})

test('recovers after reply succeeds but thread resolution fails', async () => {
  const { state, api } = github()
  await publish(plan(), api)
  state.pull.head.sha = next
  const p = plan({ headSha: next, updates: [finding({ status: 'dismissed', body: '完整调用链证明已有幂等保护。', dispositionEvidence: 'app/guard.py:24 checks the same key' })] })
  state.fail = (method, endpoint, data) => endpoint === 'graphql' && data.query.startsWith('mutation')
  await assert.rejects(publish(p, api), /Simulated/)
  assert.equal(state.inline.length, 2)
  state.fail = null
  await publish(p, api)
  assert.equal(state.inline.length, 2, 'Retry must not duplicate the posted reply')
  assert.equal(state.threads[0].isResolved, true)
})

test('unanchored questions remain linked Conversation comments, not fake threads', async () => {
  const { state, api } = github()
  await publish(plan({ updates: [finding({ location: undefined, status: 'needs-decision' })] }), api)
  state.pull.head.sha = next
  await publish(plan({ headSha: next, updates: [finding({ location: undefined, status: 'accepted-risk', body: 'Maintainer accepted the limitation.', dispositionEvidence: 'https://github.com/owner/repo/pull/7#issuecomment-9' })] }), api)
  assert.equal(state.inline.length, 0)
  assert.equal(state.threads.length, 0)
  assert.ok(state.conversation.some(c => c.body.includes('[原问题 F-1]')))
  assert.equal((await snapshot('owner/repo', 7, api)).findings.length, 1)
})

test('paginates comment and GraphQL history and preserves later-page findings', async () => {
  const { state, api } = github()
  await publish(plan({ updates: [finding(), finding({ key: 'second', location: { path: 'other.py', line: 2, side: 'RIGHT' } })] }), api)
  const result = await snapshot('owner/repo', 7, api)
  assert.equal(result.findings.length, 2)
  assert.ok(result.findings.every(f => f.threadId))
  assert.ok(state.calls.some(c => c.data?.variables?.cursor === 'page2'))
})

test('head changes during publication stop remaining writes and readiness', async () => {
  const { state, api } = github()
  const wrapped = async (...args) => {
    const result = await api(...args)
    if (args[0] === 'POST' && args[1] === 'repos/owner/repo/pulls/7/comments') state.pull.head.sha = next
    return result
  }
  await assert.rejects(publish(plan(), wrapped), /base\/head changed/)
  assert.equal(state.inline.length, 1, 'Partial write remains recoverable and pinned to old commit')
  assert.equal(state.conversation.length, 0, 'No false green summary')
})

test('marker safely round-trips HTML terminators and literal shell syntax', () => {
  const value = { kind: 'finding', body: '--> <script> $(printenv) `id` 中文' }
  assert.deepEqual(parseMarker(marker(value)), value)
  assert.equal((marker(value).match(/-->/g) || []).length, 1)
})

test('a changed base starts a new round even if head did not move', async () => {
  const { state, api } = github()
  await publish(plan(), api)
  state.pull.base.sha = next
  const result = await publish(plan({ baseSha: next, updates: [] }), api)
  assert.equal(result.round, 2)
  assert.equal(state.conversation.length, 2)
})

test('requires all mandatory checks and fails on invalid anchors without silent fallback', async () => {
  const { state, api } = github()
  await assert.rejects(publish(plan({ checks: checks().slice(1) }), api), /Missing required correctness/)
  state.fail = (method, endpoint) => method === 'POST' && endpoint === 'repos/owner/repo/pulls/7/comments'
  await assert.rejects(publish(plan(), api), /Simulated/)
  assert.equal(state.conversation.length, 0)
})
