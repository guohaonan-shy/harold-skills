export const meta = {
  name: 'pr-review-loop',
  description: 'Open or reuse a PR, then run up to two automatic rounds of Codex review, verification, fixing and re-verification, one GitHub post per round',
  whenToUse: 'On an explicit /idea-loop:pr-review request with committed work. A push, gh pr create or a finished implement run is not by itself a trigger.',
  phases: [
    { title: 'Prepare', detail: 'open/reuse PR, snapshot, review contract (Sonnet xhigh)' },
    { title: 'Review', detail: 'Codex gpt-6-sol on three axes + project checks' },
    { title: 'Verify', detail: 'reproduce, dedup, introduced-or-not at merge-base (Sonnet xhigh)' },
    { title: 'Fix', detail: 'fix introduced findings with regression tests; backlog the rest (Sonnet xhigh)' },
    { title: 'Re-verify', detail: 'independent red-to-green verification (Sonnet xhigh)' },
    { title: 'Publish', detail: 'one round post through the helper (Sonnet low)' },
  ],
}

const input = typeof args === 'string' ? JSON.parse(args) : args
const { cwd, pluginRoot, codexCompanion, agreement = '', baseRefName = 'main', maxRounds = 2,
  startRound = 1, codexModel = 'gpt-6-sol' } = input || {}
if (!cwd || !pluginRoot || !codexCompanion || !agreement.trim()) {
  return { error: 'Missing cwd, pluginRoot, codexCompanion or the accepted task agreement', mergeReady: false }
}
const refs = `${pluginRoot}/references`
const helper = `${pluginRoot}/scripts/github-review.mjs`
const SHA = /^[a-f0-9]{40}$/
const DEEP = { model: 'sonnet', effort: 'xhigh' }
const LIGHT = { model: 'sonnet', effort: 'low' }
const AXIS = { type: 'object', properties: {
  status: { type: 'string', enum: ['passed', 'failed', 'incomplete', 'not-applicable'] },
  rawOutput: { type: 'string' }, evidence: { type: 'string' },
}, required: ['status', 'rawOutput', 'evidence'] }
const FINDING = { type: 'object', properties: {
  key: { type: 'string' }, title: { type: 'string' }, priority: { type: 'string', enum: ['P0', 'P1', 'P2'] },
  axes: { type: 'array', items: { type: 'string', enum: ['correctness', 'standards', 'spec'] } },
  status: { type: 'string', enum: ['confirmed', 'needs-decision', 'needs-verification', 'dismissed'] },
  blocksMerge: { type: 'boolean' }, introduced: { type: 'boolean' }, impact: { type: 'string' },
  repro: { type: 'array', items: { type: 'string' } }, fix: { type: 'string' },
  options: { type: 'array', items: { type: 'string' } }, evidence: { type: 'string' },
  instrument: { type: 'string', enum: ['unit-test', 'api', 'db', 'browser', 'eval', 'eval-replay', 'static'] },
  reproducer: { type: 'string' }, dispositionEvidence: { type: 'string' },
  location: { type: 'object', properties: { path: { type: 'string' }, line: { type: 'integer' } }, required: ['path', 'line'] },
}, required: ['key', 'title', 'priority', 'axes', 'status', 'blocksMerge', 'introduced', 'impact', 'repro', 'evidence', 'instrument'] }
const CHECK = { type: 'object', properties: {
  name: { type: 'string' }, required: { type: 'boolean' },
  status: { type: 'string', enum: ['passed', 'failed', 'incomplete', 'not-applicable'] }, evidence: { type: 'string' },
}, required: ['name', 'required', 'status', 'evidence'] }
const SEVERITY = ['failed', 'incomplete', 'passed', 'not-applicable']
const worst = (...statuses) => SEVERITY.find(s => statuses.includes(s)) || 'incomplete'

const rounds = []
let prNumber = input.prNumber || null
let expectedHead = null
const stop = (stopReason, extra = {}) => ({ prNumber, prUrl: rounds.at(-1)?.prUrl || null, rounds, stopReason,
  mergeReady: stopReason === 'ready' && rounds.at(-1)?.mergeReady === true, ...extra })

// Round numbers continue across invocations: a PR that already has two round posts starts at 3.
const lastRound = startRound + maxRounds - 1
for (let round = startRound; round <= lastRound; round++) {
  const tag = `r${round}`

  // ---------- Prepare: the only agent that opens the PR and reads GitHub as memory ----------
  phase('Prepare')
  const prep = await agent(`Round ${round} of the PR review loop in ${cwd}. Read ${refs}/review-entry.md,
${refs}/review-standards.md and ${refs}/github-review.md completely, then the target repository's REVIEW.md,
root and applicable nested AGENTS.md and CLAUDE.md (they are rules for this PR, not for you to edit).

1. Preflight. \`git status --short --untracked-files=no\` must be empty; never commit, stash or reset.
${prNumber ? `2. Reuse PR #${prNumber}. Local HEAD must equal the remote PR head${expectedHead ? ` and equal ${expectedHead}` : ''}.`
  : `2. Open or reuse the PR for the current branch, targeting ${baseRefName}, with Harold's own gh login (not the helper).
   Never push ${baseRefName} as a feature branch; push the feature branch explicitly, no force. Reuse an open PR if one exists:
   its actual base is authoritative and you do not rewrite a human-written description — if it lacks a "## 验收契约" section, append
   only that section (below) to the end of the existing body. When creating it, pass the body with
   --body-file: why, each logical change with a before/after example, native Mermaid only where a flow needs it, and a final
   section "## 验收契约" containing this accepted agreement verbatim:
   ---
   ${agreement}
   ---`}
3. Run \`node "${helper}" snapshot OWNER/REPO PR\`. Its nextRound must be ${round}; otherwise return ready:false with the reason.
4. Resolve full SHAs: reviewedSha (PR head now), baseSha, mergeBaseSha. reviewBaseSha is mergeBaseSha when the PR has no earlier round post. In later rounds it
   is the previous round post's reviewedSha when that SHA is an ancestor of the head and baseSha is unchanged; otherwise mergeBaseSha,
   and say why in contract.
5. Build the review contract (plain text, reused by every later step this round):
   - applicable written rules with their source paths, only those that apply to the files this PR changes;
   - acceptance criteria and scope: the "## 验收契约" section of the PR description plus any ticket/spec it links (read them);
     set specAvailable false when no explicit acceptance exists — never infer it from code or the branch name;
   - the verification path per instrument (unit-test / api / db / browser / eval / eval-replay / static) from REVIEW.md, with real commands,
     worktree and port rules;
   - backlogPath: REVIEW.md's override, else docs/quality-backlog.md if it exists (its §线上问题 section), else backlog.md;
   - checkCommands: the lint / typecheck / test commands REVIEW.md or CI declares for the changed paths.
6. priorFindings: every finding the snapshot recovered from earlier round posts (key, id, status, title, instrument, reproducer).
Return ready:false with the exact reason on any preflight failure, and change nothing after that.`, {
    label: `${tag}:prepare`, phase: 'Prepare', ...DEEP, schema: { type: 'object', properties: {
      ready: { type: 'boolean' }, reason: { type: 'string' }, repo: { type: 'string' }, prNumber: { type: 'integer' },
      prUrl: { type: 'string' }, reviewedSha: { type: 'string' }, baseSha: { type: 'string' }, mergeBaseSha: { type: 'string' },
      reviewBaseSha: { type: 'string' }, contract: { type: 'string' }, specAvailable: { type: 'boolean' },
      backlogPath: { type: 'string' }, checkCommands: { type: 'array', items: { type: 'string' } },
      priorFindings: { type: 'array', items: { type: 'object' } },
    }, required: ['ready', 'reason'] },
  })
  if (!prep?.ready || !prep.prNumber || !prep.contract || !['reviewedSha', 'baseSha', 'mergeBaseSha', 'reviewBaseSha'].every(k => SHA.test(prep[k] || ''))) {
    return stop('error', { error: prep?.reason || `Round ${round} preparation incomplete` })
  }
  if (expectedHead && prep.reviewedSha !== expectedHead) return stop('error', { error: `Round ${round} found head ${prep.reviewedSha}, expected ${expectedHead}` })
  prNumber = prep.prNumber
  const pinned = `Repository ${cwd}, PR #${prep.prNumber} (${prep.prUrl}), round ${round}.
Reviewed head ${prep.reviewedSha}; base ${prep.baseSha}; merge-base ${prep.mergeBaseSha}; review delta: git diff ${prep.reviewBaseSha}...${prep.reviewedSha}.
Review contract:
${prep.contract}`

  // ---------- Review: Codex on all three axes, plus the project's own check commands ----------
  phase('Review')
  const codexRun = command => `Run exactly this from ${cwd} with safe argument quoting:
${command}
Use the Bash tool with its maximum timeout. If it times out, poll \`node "${codexCompanion}" status --json\` and
\`node "${codexCompanion}" result --json\`; after 20 minutes in total, run \`cancel\` and return status incomplete.
Return Codex's final output verbatim in rawOutput. A startup failure, nonzero exit or missing result is incomplete;
an explicit completed run with no findings is passed. Do not review the code yourself and do not edit anything.`
  const taskPrompt = (focus) => `Write this prompt to a file in your scratchpad, then run Codex read-only on it (never --write):
node "${codexCompanion}" task --model ${codexModel} --effort high --prompt-file <that file> --cwd "${cwd}"
--- prompt ---
${pinned}
${focus}
Read-only review: do not modify files, install anything or run commands with side effects. For each problem give the rule or
acceptance item it breaks (quoted, with its source), the file and line, the concrete trigger and the consequence. Say "no findings"
explicitly when there are none.
--- end prompt ---
${codexRun('(the task command above)')}`
  const axes = [
    { key: 'correctness', prompt: codexRun(`node "${codexCompanion}" review --wait --model ${codexModel} --scope branch --base "${prep.reviewBaseSha}" --cwd "${cwd}"`) },
    { key: 'standards', prompt: taskPrompt('Check the diff only against the written rules listed in the contract. No generic smells, naming preferences or rules that are not written down. A missing rule means nothing to enforce.') },
    { key: 'spec', skip: !prep.specAvailable, prompt: taskPrompt('Check the diff against the acceptance criteria and scope in the contract. Distinguish missing functionality from missing verification, and respect the ticket slice boundaries.') },
    { key: 'project-checks', skip: !prep.checkCommands?.length, prompt: `${pinned}
Run each of these project check commands at the reviewed head, exactly as declared: ${JSON.stringify(prep.checkCommands || [])}.
For a failure, attribute it: extract the merge-base with \`git archive ${prep.mergeBaseSha} | tar -x -C <scratch dir>\` (never checkout or
stash in ${cwd}) and run the same command there. Failures on lines this PR changed, or absent at merge-base, are introduced; say which.
Return every command with its exit code and relevant output in rawOutput. Do not fix anything.` },
  ]
  const axisResults = await parallel(axes.map(axis => async () => {
    if (axis.skip) {
      return axis.key === 'spec'
        ? { axis: 'spec', status: 'incomplete', rawOutput: '', evidence: 'No explicit acceptance agreement; spec review needs Harold' }
        : { axis: axis.key, status: 'not-applicable', rawOutput: '', evidence: 'REVIEW.md and CI declare no check commands for these paths' }
    }
    try {
      const result = await agent(axis.prompt, { label: `${tag}:${axis.key}`, phase: 'Review', ...LIGHT, schema: AXIS })
      return { axis: axis.key, ...(result || { status: 'incomplete', rawOutput: '', evidence: 'Agent returned no result' }) }
    } catch (error) { return { axis: axis.key, status: 'incomplete', rawOutput: '', evidence: String(error) } }
  }))
  const axis = key => axisResults.find(r => r?.axis === key) || { status: 'incomplete', evidence: 'missing' }

  // ---------- Verify: reproduce, dedup, decide introduced-or-not ----------
  phase('Verify')
  const verified = await agent(`${pinned}
Candidates from this round's reviewers: ${JSON.stringify(axisResults)}
Findings from earlier rounds: ${JSON.stringify(prep.priorFindings || [])}
Read ${refs}/review-standards.md (admission, "introduced" rules and verification standard) and ${refs}/github-review.md (finding fields) fully.
For every candidate: reproduce it yourself with the instrument the contract maps it to; deduplicate by failure/invariant and remedy,
reusing an earlier round's key when it is the same failure; refute what does not reproduce (drop it and mention it in summary).
For each confirmed finding decide introduced by rerunning the same reproducer on the merge-base extract
(\`git archive ${prep.mergeBaseSha} | tar -x -C <scratch dir>\`; never checkout, stash or reset in ${cwd}). Spec findings are introduced by
definition. Mark status needs-decision (with exactly two options) when the fix needs a product choice, a public API, DB schema or migration
change, or when a spec finding has no single clear fix. needs-verification when the required runtime could not run.
In round 2 or later, also re-check that earlier resolved findings still hold on the reviewed head; a broken one comes back as confirmed
under its old key. Pre-existing findings are never blocking.
Write every field in concise Chinese: title states the consequence (no path:line), impact is one sentence of at most 60 characters,
repro is numbered steps from a user action or input, fix is ONE recommended remedy with a one-line reason, reproducer is the exact
rerunnable command or browser steps (required for confirmed), evidence holds the output and line references, location points at the
line on the reviewed head when there is one. A dismissed candidate is only returned when it needs a visible rebuttal (dispositionEvidence). Return verification as a check with your procedure as evidence, and a short Chinese summary of the round.`, {
    label: `${tag}:verify`, phase: 'Verify', ...DEEP, schema: { type: 'object', properties: {
      findings: { type: 'array', items: FINDING }, verification: CHECK, summary: { type: 'string' },
    }, required: ['findings', 'verification', 'summary'] },
  })
  if (!verified) return stop('error', { error: `Round ${round} verification did not complete` })
  const findings = new Map(verified.findings.map(f => [f.key, { ...f }]))
  const fixable = verified.findings.filter(f => f.status === 'confirmed' && f.introduced)
  const preexisting = verified.findings.filter(f => f.status === 'confirmed' && !f.introduced)

  // ---------- Fix: introduced findings get fixed, pre-existing ones get backlogged ----------
  let headSha = prep.reviewedSha
  let reverify = null
  if (fixable.length || preexisting.length) {
    phase('Fix')
    const fix = await agent(`${pinned}
Fix these findings, which were verified as introduced by this PR: ${JSON.stringify(fixable)}
Record these pre-existing findings in the backlog instead of fixing them: ${JSON.stringify(preexisting)}
Read ${refs}/review-standards.md (verification standard) and follow the repository's AGENTS.md/CLAUDE.md.
- Check that local HEAD equals ${prep.reviewedSha} and the tracked tree is clean before editing.
- Fix only what these findings describe. For instrument unit-test, api or db, add a regression test that fails before your change and
  passes after it. If a fix turns out to need a product decision or a public API / schema / migration change, leave it untouched and
  return it as blocked with exactly two options.
- Run the regression test, the relevant existing tests and the contract's check commands. Commit the fixes as one commit.
- Append each pre-existing finding to ${prep.backlogPath || 'docs/quality-backlog.md'} (§线上问题 when that section exists), following
  the file's existing format: "- [ ] **<title>** —— <impact>。复现：<repro in one sentence>。来源：PR #${prep.prNumber} 第 ${round} 轮 review。"
  Commit that separately as "docs(backlog): 登记 review 发现的存量问题".
- Confirm the remote head is still ${prep.reviewedSha}, then push the branch explicitly, no force.
Return headSha after the push, one result per fixed or blocked key, and one backlog entry per pre-existing key. On a failed test
or push, return error and stop — do not hide it.`, {
      label: `${tag}:fix`, phase: 'Fix', ...DEEP, schema: { type: 'object', properties: {
        headSha: { type: 'string' }, error: { type: 'string' },
        results: { type: 'array', items: { type: 'object', properties: {
          key: { type: 'string' }, outcome: { type: 'string', enum: ['changed', 'blocked'] }, fixDone: { type: 'string' },
          testRef: { type: 'string' }, options: { type: 'array', items: { type: 'string' } },
        }, required: ['key', 'outcome'] } },
        backlog: { type: 'array', items: { type: 'object', properties: {
          key: { type: 'string' }, path: { type: 'string' }, entry: { type: 'string' }, commit: { type: 'string' },
        }, required: ['key', 'path', 'entry'] } },
      }, required: ['headSha', 'results', 'backlog'] },
    })
    if (!fix || fix.error || !SHA.test(fix.headSha || '')) return stop('error', { error: fix?.error || `Round ${round} fix/push did not complete` })
    headSha = fix.headSha
    for (const entry of fix.backlog) {
      const f = findings.get(entry.key)
      if (f && !f.introduced) Object.assign(f, { status: 'backlogged', blocksMerge: false, backlog: entry })
    }
    for (const r of fix.results.filter(r => r.outcome === 'blocked')) {
      const f = findings.get(r.key)
      if (f) Object.assign(f, { status: 'needs-decision', options: r.options })
    }
    const changed = fix.results.filter(r => r.outcome === 'changed')

    // ---------- Re-verify: a different agent repeats the original failure path ----------
    if (changed.length) {
      phase('Re-verify')
      reverify = await agent(`${pinned}
Independently verify fixes at ${headSha}. Original findings: ${JSON.stringify(changed.map(r => findings.get(r.key)))}
Fixer's claims (not evidence): ${JSON.stringify(changed)}
Read ${refs}/review-standards.md (verification standard). Do not edit, commit or push. Never checkout, stash or reset in ${cwd}:
use \`git archive ${prep.reviewedSha} | tar -x -C <scratch dir>\` for the before state.
For each finding: run its regression test (or, without one, its original reproducer) with the SAME instrument on ${prep.reviewedSha}
(must fail) and on ${headSha} (must pass); then run the contract's check commands and the tests of the touched files as regressions.
Return one update per key: resolved with verification {result:"passed", instrument, beforeSha:"${prep.reviewedSha}", headSha:"${headSha}",
procedure, before, after, testRef, regressions} and fix rewritten as what was actually done; confirmed if it still fails;
needs-verification if the required runtime was unavailable. Also return this step as a verification check.`, {
        label: `${tag}:reverify`, phase: 'Re-verify', ...DEEP, schema: { type: 'object', properties: {
          updates: { type: 'array', items: { type: 'object', properties: {
            key: { type: 'string' }, status: { type: 'string', enum: ['resolved', 'confirmed', 'needs-verification'] },
            fix: { type: 'string' }, verification: { type: 'object' }, evidence: { type: 'string' },
          }, required: ['key', 'status'] } },
          check: CHECK,
        }, required: ['updates', 'check'] },
      })
      const updates = reverify?.updates || []
      if (changed.some(r => !updates.some(u => u.key === r.key))) {
        return stop('error', { error: `Round ${round} re-verification omitted a fixed finding; nothing may be resolved silently`, headSha })
      }
      for (const u of updates) {
        const f = findings.get(u.key)
        if (!f) continue
        f.status = u.status
        if (u.fix) f.fix = u.fix
        if (u.verification) f.verification = u.verification
        if (u.evidence) f.evidence = `${f.evidence}\n\n修复后复验：${u.evidence}`
      }
    }
  }

  // ---------- Publish: the plan is built here, the helper validates and renders it ----------
  phase('Publish')
  const checks = [
    { name: 'correctness', required: true, status: axis('correctness').status === 'not-applicable' ? 'incomplete' : axis('correctness').status, evidence: axis('correctness').evidence },
    { name: 'standards', required: true, status: axis('standards').status, evidence: axis('standards').evidence },
    { name: 'spec', required: true, status: axis('spec').status, evidence: axis('spec').evidence },
    { name: 'project-checks', required: true, status: axis('project-checks').status, evidence: axis('project-checks').evidence },
    { name: 'verification', required: true, status: worst(verified.verification.status, reverify ? reverify.check.status : 'passed'),
      evidence: [verified.verification.evidence, reverify?.check.evidence].filter(Boolean).join(' / ') },
  ]
  const plan = { repo: prep.repo, pr: prep.prNumber, round, reviewedSha: prep.reviewedSha, headSha, baseSha: prep.baseSha,
    mergeBaseSha: prep.mergeBaseSha, summary: verified.summary, checks,
    findings: [...findings.values()].filter(f => f.status !== 'dismissed' || f.dispositionEvidence) }
  const published = await agent(`Publish round ${round} of PR #${prep.prNumber} in ${cwd}. Do not edit, summarize or reformat anything.
Write the JSON below byte-for-byte to a new file in your scratchpad, then run: node "${helper}" publish <that file>
Return published:true and the command's JSON stdout parsed as result. On a nonzero exit return published:false and the exact stderr
as error; do not retry with a modified plan.
${JSON.stringify(plan)}`, {
    label: `${tag}:publish`, phase: 'Publish', ...LIGHT, schema: { type: 'object', properties: {
      published: { type: 'boolean' }, result: { type: 'object' }, error: { type: 'string' },
    }, required: ['published'] },
  })
  if (!published?.published || !published.result) return stop('error', { error: published?.error || `Round ${round} publication failed`, headSha })
  const result = published.result
  rounds.push({ round, url: result.url, prUrl: result.prUrl, reviewedSha: prep.reviewedSha, headSha,
    mergeReady: result.mergeReady === true, openBlockingCount: result.openBlockingCount, needsHuman: result.needsHuman || [],
    fixed: [...findings.values()].filter(f => f.status === 'resolved').length, backlogged: preexisting.length })
  log(`Round ${round}: ${result.url} — mergeReady ${result.mergeReady}`)

  if (result.needsHuman?.length) return stop('needs-human')
  if (!fixable.length) return stop(result.mergeReady ? 'ready' : 'blocked')
  if (round === lastRound) {
    return stop(result.mergeReady ? 'ready' : 'rounds-exhausted', {
      note: `第 ${round} 轮的修复只经过了本轮的独立修复验证，之后没有再跑一次 review。` })
  }
  expectedHead = headSha
}
return stop('rounds-exhausted')
