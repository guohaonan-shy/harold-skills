import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
const head = 'a'.repeat(40)
const base = 'b'.repeat(40)
const next = 'c'.repeat(40)
const input = { cwd: '/tmp/repo', pluginRoot: '/tmp/plugin', codexCompanion: '/tmp/codex-companion.mjs', prNumber: 7, agreement: 'Only fix duplicate submissions; no API redesign.' }
const state = { repo: 'owner/repo', headSha: head, baseSha: base, url: 'https://github.com/owner/repo/pull/7', findings: [], rounds: [] }
function context(overrides = {}) {
  return { ready: true, reason: '', snapshot: structuredClone(state), reviewBaseSha: base,
    instructionText: 'Read REVIEW.md. Acceptance: one Recording per duplicate request.', specAvailable: true, ...overrides }
}
function agentResults(overrides = {}) {
  return {
    'review:prepare': context(),
    'review:correctness': { status: 'passed', rawOutput: 'No findings.', evidence: 'Codex completed' },
    'review:standards': { status: 'not-applicable', rawOutput: '', evidence: 'No applicable written rules' },
    'review:spec': { status: 'passed', rawOutput: '', evidence: 'Acceptance verified' },
    'review:verify': { updates: [], verificationComplete: true, verificationEvidence: 'pytest executed', summary: '验证完成', additionalChecks: [] },
    'review:publish': { published: true, result: { prUrl: state.url, summaryUrl: `${state.url}#comment-1`, headSha: head, round: 1, mergeReady: true, openBlockingCount: 0 } },
    ...overrides,
  }
}
async function run(name, args, results) {
  const source = await readFile(new URL(`../workflows/${name}.mjs`, import.meta.url), 'utf8')
  // Workflow host owns args/agent/pipeline/workflow/phase and permits top-level return.
  const script = new AsyncFunction('args', 'agent', 'pipeline', 'workflow', 'phase', source.replace('export const meta', 'const meta'))
  const calls = [], children = []
  const agent = async (prompt, options) => {
    calls.push({ prompt, ...options })
    const result = results[options.label]
    if (result instanceof Error) throw result
    if (typeof result === 'function') return result(prompt)
    return structuredClone(result)
  }
  const pipeline = async (values, first, second) => Promise.all(values.map(async value => second(await first(value), value)))
  const workflow = async (target, childArgs) => { children.push({ target, args: childArgs }); return { mergeReady: false, summaryUrl: 'https://github.com/summary' } }
  return { result: await script(args, agent, pipeline, workflow, () => {}), calls, children }
}

test('open validates prerequisites before PR mutations and carries accepted scope/head to review', async () => {
  const empty = await run('pr-open-review', { cwd: '/tmp/repo' }, {})
  assert.equal(empty.calls.length, 0)
  const opened = await run('pr-open-review', JSON.stringify(input), {
    'pr:open': { prNumber: 7, prUrl: state.url, headSha: head },
  })
  assert.equal(opened.children.length, 1)
  assert.equal(opened.children[0].args.expectedHead, head)
  assert.equal(opened.children[0].args.agreement, input.agreement)
})

test('preparation failure or wrong head prevents reviewers and publishing', async () => {
  for (const prepared of [context({ ready: false, reason: 'Dirty worktree' }), context()]) {
    const result = await run('pr-review-round', { ...input, expectedHead: next }, agentResults({ 'review:prepare': prepared }))
    assert.equal(result.result.mergeReady, false)
    assert.equal(result.calls.length, 1)
  }
})

test('normal Codex command targets pinned delta and does not run a second generic fix review', async () => {
  const result = await run('pr-review-round', input, agentResults())
  const codex = result.calls.find(c => c.label === 'review:correctness')
  assert.ok(codex.prompt.includes(`review --wait --scope branch --base "${base}"`))
  assert.equal(result.calls.filter(c => c.label === 'review:correctness').length, 1)
  assert.ok(result.calls.find(c => c.label === 'review:verify').prompt.includes('Acceptance: one Recording'))
  assert.ok(result.calls.find(c => c.label === 'review:publish').prompt.includes('Acceptance: one Recording'))
})

test('a crashed axis survives into publication as incomplete, while other evidence is retained', async () => {
  const result = await run('pr-review-round', input, agentResults({ 'review:correctness': new Error('Codex unavailable') }))
  const check = result.result.axes.find(c => c.name === 'correctness')
  assert.equal(check.status, 'incomplete')
  assert.equal(result.result.mergeReady, false, 'Publisher cannot override a known required check gap')
  const publication = result.calls.find(c => c.label === 'review:publish')
  assert.ok(publication.prompt.includes('Codex unavailable'))
  assert.ok(publication.prompt.includes('Acceptance verified'))
})

test('no-change fixes reuse only same-head/base coverage and skip all discovery agents', async () => {
  const priorChecks = ['correctness', 'standards', 'spec'].map(name => ({ name, status: 'passed', evidence: 'Prior completed check' }))
  const prepared = context({ snapshot: { ...state, rounds: [{ record: { headSha: head, baseSha: base, checks: priorChecks } }] } })
  const result = await run('pr-review-round', { ...input, previousHead: head }, agentResults({ 'review:prepare': prepared }))
  assert.equal(result.calls.filter(c => ['review:correctness', 'review:standards', 'review:spec'].includes(c.label)).length, 0)
  assert.ok(result.result.axes.filter(c => c.name !== 'verification').every(c => c.status === 'passed'))
  prepared.snapshot.rounds[0].record.baseSha = next
  const stale = await run('pr-review-round', { ...input, previousHead: head }, agentResults({ 'review:prepare': prepared }))
  assert.ok(stale.result.axes.filter(c => c.name !== 'verification').every(c => c.status === 'incomplete'))
})

test('publication failure is not presented as successful merge readiness', async () => {
  const result = await run('pr-review-round', input, agentResults({ 'review:publish': { published: false, error: 'GitHub access denied; no summary posted' } }))
  assert.equal(result.result.mergeReady, false)
  assert.match(result.result.error, /access denied/)
})

test('missing acceptance cannot be turned into a not-applicable green spec review', async () => {
  const result = await run('pr-review-round', input, agentResults({
    'review:prepare': context({ specAvailable: false }),
    'review:spec': { status: 'not-applicable', rawOutput: '', evidence: 'No spec found' },
  }))
  assert.equal(result.result.axes.find(c => c.name === 'spec').status, 'incomplete')
  assert.equal(result.result.mergeReady, false)
})

test('fix requires exact selected GitHub IDs and independent results for every finding', async () => {
  const selected = { id: 'F-1', key: 'duplicate', priority: 'P1', axes: ['correctness'], blocksMerge: true }
  const results = {
    'fix:prepare': { ready: true, reason: '', snapshot: state, findings: [selected], instructionText: 'Agreed contract' },
    'fix:implement': { headSha: next, results: [{ key: 'duplicate', status: 'changed' }] },
    'fix:verify': { updates: [] },
  }
  const omitted = await run('pr-fix-verify', { ...input, findingIds: ['F-1'], feedback: 'Fix only F-1' }, results)
  assert.match(omitted.result.error, /omitted/)
  assert.equal(omitted.children.length, 0)
  results['fix:verify'].updates = [{ ...selected, status: 'needs-verification', body: 'DB unavailable' }]
  const verified = await run('pr-fix-verify', { ...input, findingIds: ['F-1'], feedback: 'Fix only F-1' }, results)
  assert.equal(verified.children.length, 1)
  assert.equal(verified.children[0].args.previousHead, head)
  assert.equal(verified.children[0].args.expectedHead, next)
  assert.equal(verified.children[0].args.fixUpdates[0].status, 'needs-verification')
  assert.equal(verified.calls.some(c => c.prompt.includes('review --wait')), false)
})

test('failed fix/push cannot reach verifier or publication', async () => {
  const result = await run('pr-fix-verify', { ...input, findingIds: ['F-1'], feedback: 'Fix F-1' }, {
    'fix:prepare': { ready: true, reason: '', snapshot: state, instructionText: 'Contract', findings: [{ id: 'F-1', key: 'duplicate' }] },
    'fix:implement': { headSha: head, results: [], error: 'Push failed' },
  })
  assert.equal(result.result.mergeReady, false)
  assert.equal(result.calls.length, 2)
  assert.equal(result.children.length, 0)
})
