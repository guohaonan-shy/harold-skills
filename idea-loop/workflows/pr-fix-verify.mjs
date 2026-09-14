export const meta = {
  name: 'pr-fix-verify',
  description: 'Fix agreed GitHub findings, independently repeat their verification, then update original threads and PR explanation',
  whenToUse: 'Only after the user invokes /idea-loop:pr-fix-verify with agreed findings and direction; never triggered by comments, pushes or another round finishing.',
  phases: [{ title: 'Read GitHub' }, { title: 'Fix and test' }, { title: 'Verify original failures' }, { title: 'Review and publish' }],
}

const input = typeof args === 'string' ? JSON.parse(args) : args
const { cwd, prNumber, findingIds, feedback, pluginRoot, codexCompanion } = input
if (!cwd || !prNumber || !Array.isArray(findingIds) || !findingIds.length || !feedback || !pluginRoot || !codexCompanion) {
  return { error: 'Missing PR, selected GitHub finding IDs, or agreed fix direction', mergeReady: false }
}
phase('Read GitHub')
const prepared = await agent(`Read ${pluginRoot}/references/github-review.md and review-standards.md
in that references directory, then target AGENTS.md/REVIEW.md and applicable nested rules.
Resolve repo for PR #${prNumber} in ${cwd}; run node "${pluginRoot}/scripts/github-review.mjs"
snapshot OWNER/REPO ${prNumber}. Read original finding bodies, verification procedures and human
replies. Select exactly ${JSON.stringify(findingIds)}; do not select every open finding.
Require clean tracked files and local HEAD equal remote head. No stashing/resetting live work.
The agreement is: ${feedback}
Return ready:false if IDs/history are missing, findings already closed, verification context cannot
be recovered, or directions remain ambiguous. Do not guess from an unavailable artifact.
Return full selected records (stable key, priority, axes, blocksMerge, body, original evidence),
snapshot and instructionText containing applicable contract, original acceptance and these amendments.
No writes yet.`, {
  label: 'fix:prepare', schema: { type: 'object', properties: {
    ready: { type: 'boolean' }, reason: { type: 'string' }, snapshot: { type: 'object' },
    findings: { type: 'array', items: { type: 'object' } }, instructionText: { type: 'string' },
  }, required: ['ready', 'reason'] },
})
if (!prepared?.ready || !prepared.snapshot || !prepared.findings?.length || !prepared.instructionText) {
  return { error: prepared?.reason || 'Cannot recover agreed findings from GitHub', mergeReady: false }
}
if (prepared.findings.length !== findingIds.length || prepared.findings.some(f => !findingIds.includes(f.id))) {
  return { error: 'Selected findings do not match the authorized IDs', mergeReady: false }
}
const before = prepared.snapshot
phase('Fix and test')
const fixed = await agent(`Implement the agreed fixes in ${cwd}, PR #${prNumber}, starting HEAD ${before.headSha}.
${prepared.instructionText}
Selected original findings: ${JSON.stringify(prepared.findings)}
Agreed direction: ${feedback}
Check HEAD/cleanliness before editing. Reproduce original failures using their recorded tools,
inputs and paths. Implement only the agreed fixes. Run the original checks and relevant regressions
using the actual configured tools/local environment. If a finding needs a new product decision,
leave it untouched and mark blocked with reason while continuing independent agreed fixes.
If a fix cannot be verified, keep its status unverified; never report it fixed because code changed.
Record procedure/environment and real before/after results, including required unavailable checks.
Stage only your scoped files; commit one fix commit when changes and relevant checks are complete.
Push explicitly to ${before.headRefName}, no force, after confirming the remote still equals the
starting head. Do not hide a failed test/push; return error and stop on such failure.
If nothing changed do not make an empty commit; headSha remains ${before.headSha}.
Return one result per selected key: changed/blocked with diffSummary, procedure, before, after,
regressions and limitations. These are author claims; the next step independently verifies them.`, {
  label: 'fix:implement', schema: { type: 'object', properties: {
    headSha: { type: 'string' }, results: { type: 'array', items: { type: 'object' } }, error: { type: 'string' },
  }, required: ['headSha', 'results'] },
})
if (fixed?.error || !/^[a-f0-9]{40}$/.test(fixed?.headSha || '')) {
  return { error: fixed?.error || 'Fix/push did not complete', mergeReady: false, prUrl: before.url }
}
phase('Verify original failures')
const verified = await agent(`Independently verify selected fixes for PR #${prNumber} at ${fixed.headSha} in ${cwd}.
Read ${pluginRoot}/references/review-standards.md and github-review.md, plus:
${prepared.instructionText}
ORIGINAL findings and failure paths: ${JSON.stringify(prepared.findings)}
Author claims (not proof): ${JSON.stringify(fixed.results)}
Check local/remote HEAD against the fix SHA before and after. Do not change code, commit or push.
For every selected finding repeat the original reproducer yourself, check expected state/DB/UI
effects and related regressions. Give exact command/actions, environment, before/after and limits.
Do NOT call generic Codex review as a proxy for resolution; correctness review runs once in the
shared next step. For static findings independently retrace and label the evidence static;
if runtime is required but unavailable, retain needs-verification and its blocking status.
Produce one update per original key. Preserve priority/axes/blocksMerge; resolved requires
verification {headSha: "${fixed.headSha}", result: "passed", procedure, before, after} and visible
evidence in body. A still-reproducible problem is confirmed; blocked decisions are needs-decision;
missing evidence is needs-verification. None of those is resolved. Do not invent accepted-risk.
Return updates in the github-review.md schema; do not post yet.`, {
  label: 'fix:verify', schema: { type: 'object', properties: {
    updates: { type: 'array', items: { type: 'object' } },
  }, required: ['updates'] },
})
const updates = verified?.updates || []
if (updates.length !== prepared.findings.length || prepared.findings.some(f => !updates.some(u => u.key === f.key))) {
  return { error: 'Independent verification omitted selected findings; none may be silently resolved', mergeReady: false, prUrl: before.url }
}
phase('Review and publish')
const review = await workflow({ scriptPath: `${pluginRoot}/workflows/pr-review-round.mjs` }, {
  cwd, prNumber, pluginRoot, codexCompanion, agreement: prepared.instructionText,
  expectedHead: fixed.headSha, previousHead: before.headSha, fixUpdates: updates,
})
return { fixResults: fixed.results, verification: updates, ...review }
