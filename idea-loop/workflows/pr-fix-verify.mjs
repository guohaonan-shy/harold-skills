export const meta = {
  name: 'pr-fix-verify',
  description: 'Implement + test + verify one round of agreed review-finding fixes as a single commit, then run the next adversarial review round',
  whenToUse: 'Trigger once the fix direction for one or more open findings has been decided in conversation. Pass the findings to fix and the agreed instructions as args — this workflow does not make product/UX judgment calls on its own, it executes an already-decided direction.',
  phases: [
    { title: 'Fix + Test' },
    { title: 'Verify fix (non-adversarial)' },
  ],
}

// See pr-open-review.mjs for why this defensive parse exists — args has been
// observed arriving JSON-stringified rather than pre-parsed.
const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args
const { cwd, prNumber, headRefName, baseRefName, priorRound, findingsToFix, feedback, pluginRoot, codexCompanion } = parsedArgs
// Codex's companion script belongs to a *different* plugin, so
// ${CLAUDE_PLUGIN_ROOT} does not point at it. It travels the same route as
// pluginRoot: the dispatcher SKILL.md resolves it (only markdown expands that
// placeholder, and only the dispatcher can shell out to look) and threads it
// down as an argument. Deliberately no fallback — the hardcoded default this
// replaced named one machine's username and config directory, and silently
// pointed at a file that did not exist anywhere else.
const CODEX_COMPANION = codexCompanion
if (!CODEX_COMPANION) {
  return { error: 'codexCompanion was not passed in — the dispatcher SKILL.md has to resolve the openai-codex companion script and thread it through. See README, Portability.' }
}

phase('Fix + Test')
const fixed = await agent(
  `Implement fixes for the following codex-review findings on PR #${prNumber}, working directory ${cwd}.

Findings to address (from round ${priorRound} of the artifact):
${JSON.stringify(findingsToFix, null, 2)}

Instructions from the developer for how to fix them (this is the agreed direction — you're executing it, not re-deciding it):
"""
${feedback}
"""

Rules:
- Read the full context around each finding before editing — don't guess from the finding summary alone.
- If a finding's fix direction is genuinely ambiguous given the instructions above (something you'd need to ask about — not just a judgment call you're confident making), do NOT guess. Leave that finding's code untouched, mark it status:"blocked" with the specific open question in blockedReason, and continue with the others.
- For each finding you DO fix, verify it with a real, falsifiable signal that mirrors how the bug was originally proven (e.g. if it was proven with specific getBoundingClientRect() numbers, a specific repro script, or a specific test — re-run that exact check now and report the before/after in the verification field). "Looks fixed" / "should be resolved now" is not an acceptable verification value.
- Run whatever this repo's relevant automated tests/build are for the touched area.
- Once every non-blocked finding is fixed and verified, stage exactly the touched files and \`git -C "${cwd}" commit\` ONE commit for this whole round covering all of them, then \`git -C "${cwd}" push\`.
- If every finding ended up blocked (nothing to commit), skip the commit and say so — don't commit an empty/unrelated change.

Return the commit sha (or null if nothing was committed) and a per-finding result.`,
  {
    phase: 'Fix + Test',
    schema: {
      type: 'object',
      properties: {
        commitSha: { type: ['string', 'null'] },
        results: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              findingId: { type: 'string' },
              status: { type: 'string', enum: ['fixed', 'blocked'] },
              diffSummary: { type: 'string' },
              verification: { type: 'string', description: 'The real signal checked and its before/after value — not a proxy claim' },
              blockedReason: { type: 'string' },
            },
            required: ['findingId', 'status'],
          },
        },
      },
      required: ['commitSha', 'results'],
    },
  },
)

phase('Verify fix (non-adversarial)')
const fixedResults = fixed.results.filter((r) => r.status === 'fixed')
let secondOpinion = { confirmedResolved: [], contradicted: [] }

if (fixedResults.length && fixed.commitSha) {
  secondOpinion = await agent(
    `Commit ${fixed.commitSha} in ${cwd} claims to fix these findings:
${JSON.stringify(fixedResults, null, 2)}

Get a second, NON-adversarial opinion from codex — this is a sanity check on a claimed fix, not a bug hunt for new problems:
node "${CODEX_COMPANION}" review --wait --base "${baseRefName}" --cwd "${cwd}"

Read its output. For each finding above, cross-check codex's read against the fix-agent's own reported verification (the "verification" field) AND independently re-derive it yourself by reading the current code — does the failure mode from the original finding still reproduce? Don't just trust the fix-agent's self-report.

If codex's review or your own reading contradicts the claim that a finding is fixed, put its id in "contradicted" with the specific reason; otherwise put it in "confirmedResolved".`,
    {
      schema: {
        type: 'object',
        properties: {
          confirmedResolved: { type: 'array', items: { type: 'string' } },
          contradicted: {
            type: 'array',
            items: {
              type: 'object',
              properties: { findingId: { type: 'string' }, reason: { type: 'string' } },
              required: ['findingId', 'reason'],
            },
          },
        },
        required: ['confirmedResolved', 'contradicted'],
      },
    },
  )
}

const blockedResults = fixed.results.filter((r) => r.status === 'blocked')

const nextRound = await workflow({ scriptPath: `${pluginRoot}/workflows/pr-review-round.mjs` }, {
  cwd,
  prNumber,
  headRefName,
  baseRefName,
  roundHint: priorRound + 1,
  pluginRoot,
  codexCompanion,
  note: `本轮（commit ${fixed.commitSha || '(none committed)'}）尝试修复了 round ${priorRound} 的以下 finding。
已修复且非对抗二次核实通过（标记为已解决）：${JSON.stringify(secondOpinion.confirmedResolved)}。
声称修复但被二次核实反驳（保留为 open，附上原因）：${JSON.stringify(secondOpinion.contradicted)}。
本轮未处理/开发者反馈不够明确、跳过的（保留为 open，附上 blockedReason）：${JSON.stringify(blockedResults)}。
请在这轮 triage 时把上面「已解决」的 finding 对应的历史条目标记为已修复，其余保持 open。`,
  })

return { fixResults: fixed.results, secondOpinion, ...nextRound }
