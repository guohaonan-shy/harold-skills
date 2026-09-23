import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { validatePlan } from './github-review.mjs'

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
const A = 'a'.repeat(40) // round-1 reviewed head
const B = 'b'.repeat(40) // base
const C = 'c'.repeat(40) // round-1 fix head
const D = 'd'.repeat(40) // merge-base
const E = 'e'.repeat(40) // round-2 fix head
const input = { cwd: '/tmp/repo', pluginRoot: '/tmp/plugin', codexCompanion: '/tmp/codex-companion.mjs',
  agreement: 'Only fix duplicate submissions; no API redesign.' }

function prep(round, overrides = {}) {
  return { ready: true, reason: '', repo: 'owner/repo', prNumber: 7, prUrl: 'https://github.com/owner/repo/pull/7',
    reviewedSha: round === 1 ? A : C, baseSha: B, mergeBaseSha: D, reviewBaseSha: round === 1 ? D : A,
    contract: 'Rules: REVIEW.md §2. Acceptance: one Recording per duplicate request.', specAvailable: true,
    backlogPath: 'docs/quality-backlog.md', checkCommands: ['npm test'], priorFindings: [], ...overrides }
}
const axisPass = { status: 'passed', rawOutput: 'no findings', evidence: 'Codex completed' }
const passCheck = { name: 'verification', required: true, status: 'passed', evidence: 'reproduced' }
function bug(overrides = {}) {
  return { key: 'recording|duplicate', title: '重复提交生成两条录音', priority: 'P1', axes: ['correctness'],
    status: 'confirmed', blocksMerge: true, introduced: true, impact: '重复点提交时历史页出现两条录音。',
    repro: ['连续提交两次', '打开历史页'], fix: '按 request_id 去重', evidence: '2 rows', instrument: 'unit-test',
    reproducer: 'uv run pytest -k duplicate', ...overrides }
}
const published = (overrides = {}) => ({ published: true, result: { url: 'https://github.com/owner/repo/pull/7#issuecomment-1',
  prUrl: 'https://github.com/owner/repo/pull/7', mergeReady: true, openBlockingCount: 0, needsHuman: [], ...overrides } })
function results(overrides = {}) {
  const base = {}
  for (const round of [1, 2]) {
    Object.assign(base, {
      [`r${round}:prepare`]: prep(round),
      [`r${round}:correctness`]: axisPass, [`r${round}:standards`]: axisPass,
      [`r${round}:spec`]: axisPass, [`r${round}:project-checks`]: axisPass,
      [`r${round}:verify`]: { findings: [], verification: passCheck, summary: '本轮没有问题' },
      [`r${round}:publish`]: published(),
    })
  }
  return { ...base, ...overrides }
}
const fixOk = (headSha = C) => ({ headSha, results: [{ key: 'recording|duplicate', outcome: 'changed', fixDone: '加了去重', testRef: 'tests/test_retry.py::test_duplicate' }], backlog: [] })
const reverifyOk = (before = A, after = C) => ({ updates: [{ key: 'recording|duplicate', status: 'resolved', fix: '提交接口按 request_id 去重',
  verification: { result: 'passed', instrument: 'unit-test', beforeSha: before, headSha: after, procedure: 'pytest', before: 'fail', after: 'pass', testRef: 't' } }],
  check: { name: 'verification', required: true, status: 'passed', evidence: 'red→green' } })

async function run(args, table) {
  const source = await readFile(new URL('../workflows/pr-review-loop.mjs', import.meta.url), 'utf8')
  // The Workflow host owns args/agent/parallel/phase/log and permits top-level return.
  const script = new AsyncFunction('args', 'agent', 'parallel', 'phase', 'log', source.replace('export const meta', 'const meta'))
  const calls = []
  const agent = async (prompt, options) => {
    calls.push({ prompt, ...options })
    const result = table[options.label]
    if (result instanceof Error) throw result
    if (typeof result === 'function') return result(prompt)
    return structuredClone(result ?? null)
  }
  const parallel = async thunks => Promise.all(thunks.map(t => t().catch(() => null)))
  const result = await script(args, agent, parallel, () => {}, () => {})
  const plans = calls.filter(c => c.label.endsWith(':publish')).map(c => JSON.parse(c.prompt.trim().split('\n').at(-1)))
  for (const plan of plans) validatePlan(plan) // every plan the loop builds must pass the helper's own gate
  return { result, calls, plans, labels: calls.map(c => c.label) }
}

test('missing prerequisites or an unready preparation start nothing downstream', async () => {
  assert.equal((await run({ ...input, agreement: '' }, results())).calls.length, 0)
  const { result, labels } = await run(input, results({ 'r1:prepare': prep(1, { ready: false, reason: 'Dirty worktree' }) }))
  assert.deepEqual(labels, ['r1:prepare'])
  assert.equal(result.stopReason, 'error')
  assert.match(result.error, /Dirty worktree/)
})

test('a clean first round publishes once and stops ready; models and Codex flags are as designed', async () => {
  const { result, calls, plans, labels } = await run(input, results())
  assert.equal(result.stopReason, 'ready')
  assert.equal(result.mergeReady, true)
  assert.equal(labels.filter(l => l.endsWith(':prepare')).length, 1)
  assert.equal(labels.some(l => l.endsWith(':fix')), false)
  const byLabel = label => calls.find(c => c.label === label)
  for (const label of ['r1:prepare', 'r1:verify']) assert.deepEqual([byLabel(label).model, byLabel(label).effort], ['sonnet', 'xhigh'])
  for (const label of ['r1:correctness', 'r1:standards', 'r1:spec', 'r1:publish']) assert.deepEqual([byLabel(label).model, byLabel(label).effort], ['sonnet', 'low'])
  assert.match(byLabel('r1:correctness').prompt, new RegExp(`review --wait --model gpt-6-sol --scope branch --base "${D}"`))
  for (const label of ['r1:standards', 'r1:spec']) {
    assert.match(byLabel(label).prompt, /task --model gpt-6-sol/)
    assert.doesNotMatch(byLabel(label).prompt, /task[^\n]*--write/)
  }
  assert.match(byLabel('r1:prepare').prompt, /## 验收契约[\s\S]*Only fix duplicate submissions/)
  assert.equal(plans[0].reviewedSha, A)
  assert.equal(plans[0].headSha, A, 'no fix commit means the head did not move')
})

test('an introduced finding is fixed, re-verified independently, published, then round 2 reviews the fix delta', async () => {
  const { result, calls, plans, labels } = await run(input, results({
    'r1:verify': { findings: [bug()], verification: passCheck, summary: '发现 1 条' },
    'r1:fix': fixOk(), 'r1:reverify': reverifyOk(),
  }))
  assert.deepEqual(labels.filter(l => l.startsWith('r1:') && !['r1:correctness', 'r1:standards', 'r1:spec', 'r1:project-checks'].includes(l)),
    ['r1:prepare', 'r1:verify', 'r1:fix', 'r1:reverify', 'r1:publish'])
  assert.notEqual(calls.find(c => c.label === 'r1:fix').prompt, calls.find(c => c.label === 'r1:reverify').prompt)
  assert.equal(plans[0].headSha, C)
  assert.equal(plans[0].findings[0].status, 'resolved')
  assert.equal(plans[0].findings[0].verification.beforeSha, A)
  const r2 = calls.find(c => c.label === 'r2:prepare').prompt
  assert.match(r2, /Reuse PR #7/)
  assert.match(r2, new RegExp(`equal ${C}`))
  assert.match(calls.find(c => c.label === 'r2:correctness').prompt, new RegExp(`--base "${A}"`))
  assert.equal(result.stopReason, 'ready')
  assert.equal(result.rounds.length, 2)
})

test('two rounds with fixes stop after round 2 and say the last fix had no further review', async () => {
  const { result, labels } = await run(input, results({
    'r1:verify': { findings: [bug()], verification: passCheck, summary: '1' }, 'r1:fix': fixOk(), 'r1:reverify': reverifyOk(),
    'r2:verify': { findings: [bug()], verification: passCheck, summary: '1' }, 'r2:fix': fixOk(E), 'r2:reverify': reverifyOk(C, E),
    'r2:publish': published({ mergeReady: false, openBlockingCount: 1 }),
  }))
  assert.equal(labels.filter(l => l.endsWith(':prepare')).length, 2)
  assert.equal(result.stopReason, 'rounds-exhausted')
  assert.equal(result.mergeReady, false)
  assert.match(result.note, /没有再跑一次 review/)
})

test('pre-existing findings are backlogged, never fixed or re-verified, and do not block', async () => {
  const old = bug({ key: 'history|stale', introduced: false, blocksMerge: false })
  const { result, plans, labels, calls } = await run(input, results({
    'r1:verify': { findings: [old], verification: passCheck, summary: '1 条存量' },
    'r1:fix': { headSha: C, results: [], backlog: [{ key: 'history|stale', path: 'docs/quality-backlog.md', entry: '- [ ] **…**', commit: 'c1' }] },
  }))
  assert.match(calls.find(c => c.label === 'r1:fix').prompt, /docs\(backlog\)/)
  assert.equal(labels.includes('r1:reverify'), false)
  assert.deepEqual([plans[0].findings[0].status, plans[0].findings[0].blocksMerge], ['backlogged', false])
  assert.equal(result.stopReason, 'ready')
})

test('a finding that needs Harold stops the loop after that round is published', async () => {
  const decision = bug({ status: 'needs-decision', options: ['A 方案', 'B 方案'] })
  const { result, labels } = await run(input, results({
    'r1:verify': { findings: [decision], verification: passCheck, summary: '1 条待决定' },
    'r1:publish': published({ mergeReady: false, needsHuman: ['recording|duplicate'] }),
  }))
  assert.equal(labels.includes('r1:fix'), false)
  assert.equal(labels.includes('r2:prepare'), false)
  assert.equal(result.stopReason, 'needs-human')
})

test('a crashed Codex axis and a missing spec surface as incomplete checks, never as passes', async () => {
  const { plans, labels } = await run(input, results({
    'r1:prepare': prep(1, { specAvailable: false }), 'r1:correctness': new Error('Codex unavailable'),
  }))
  assert.equal(labels.includes('r1:spec'), false)
  const check = name => plans[0].checks.find(c => c.name === name)
  assert.equal(check('correctness').status, 'incomplete')
  assert.match(check('correctness').evidence, /Codex unavailable/)
  assert.equal(check('spec').status, 'incomplete')
  assert.equal(check('standards').status, 'passed')
})

test('a failed fix or an omitted re-verification never reaches publication', async () => {
  const failing = await run(input, results({
    'r1:verify': { findings: [bug()], verification: passCheck, summary: '1' }, 'r1:fix': { headSha: A, results: [], backlog: [], error: 'Push failed' },
  }))
  assert.equal(failing.labels.some(l => l.endsWith(':reverify') || l.endsWith(':publish')), false)
  assert.match(failing.result.error, /Push failed/)
  const omitted = await run(input, results({
    'r1:verify': { findings: [bug()], verification: passCheck, summary: '1' }, 'r1:fix': fixOk(),
    'r1:reverify': { updates: [], check: passCheck },
  }))
  assert.equal(omitted.labels.includes('r1:publish'), false)
  assert.match(omitted.result.error, /omitted a fixed finding/)
})

test('round 2 refuses to review a head that is not the one round 1 pushed', async () => {
  const { result, labels } = await run(input, results({
    'r1:verify': { findings: [bug()], verification: passCheck, summary: '1' }, 'r1:fix': fixOk(), 'r1:reverify': reverifyOk(),
    'r2:prepare': prep(2, { reviewedSha: E }),
  }))
  assert.equal(labels.includes('r2:correctness'), false)
  assert.match(result.error, /expected c{40}/)
})

test('a continued PR starts at the snapshot round and keeps counting', async () => {
  const table = results({ 'r3:prepare': prep(3, { reviewedSha: A }), 'r3:correctness': axisPass, 'r3:standards': axisPass,
    'r3:spec': axisPass, 'r3:project-checks': axisPass, 'r3:verify': { findings: [], verification: passCheck, summary: '无' },
    'r3:publish': published() })
  const { labels, calls, plans } = await run({ ...input, prNumber: 7, startRound: 3 }, table)
  assert.equal(labels[0], 'r3:prepare')
  assert.match(calls[0].prompt, /nextRound must be 3/)
  assert.match(calls[0].prompt, /Reuse PR #7/)
  assert.equal(plans[0].round, 3)
})
