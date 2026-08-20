export const meta = {
  name: 'pr-open-review',
  description: 'Push an already-committed branch, open its PR, and run round-1 codex adversarial review with triage + a published artifact',
  whenToUse: 'Trigger by hand once a feature/fix is fully implemented, committed, and ready to open for review. This does NOT implement anything — implementation stays in the interactive session, same as always. It only opens the PR and reviews it.',
  phases: [
    { title: 'Open PR' },
    { title: 'Round 1 review (via pr-review-round)' },
  ],
}

// `args` arrives JSON-stringified rather than pre-parsed for a scriptPath
// invocation (confirmed via a zero-agent echo probe) — destructuring it
// directly silently yields undefined for every field. Parse defensively so
// this still works if a future runtime build fixes the stringification.
const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args
const { cwd, baseRefName, prTitle, prBody, pluginRoot, codexCompanion } = parsedArgs
const base = baseRefName || 'main'

phase('Open PR')
const opened = await agent(
  `Open a PR for the branch checked out at ${cwd}, base ${base}.

1. \`git -C "${cwd}" status --short --untracked-files=no\` — if this shows uncommitted changes to TRACKED files, STOP and return prNumber:null with error explaining the branch isn't ready. This workflow opens PRs for already-committed work; it does not commit anything itself. (Untracked files are deliberately excluded from this check — a repo can carry unrelated scratch/WIP files that have nothing to do with this branch's own readiness; \`git push\` never touches them anyway. Trade-off: a genuinely new file that was never \`git add\`-ed is invisible to this check too — \`implement\`'s own commit discipline is what's relied on to catch that upstream, not this gate.)
2. Push the branch: \`git -C "${cwd}" push -u origin HEAD\` (plain \`push\` if it already tracks a remote).
3. Check for an existing open PR on this branch: \`gh pr view --json number,url,headRefName,baseRefName\` run in ${cwd}. If one exists, use it as-is (don't create a duplicate).
4. Otherwise create one from ${cwd}: \`gh pr create --base "${base}"\`${prTitle ? ` with title "${prTitle}"` : " with a concise title drafted from the branch's commit log"}${prBody ? ` and this body:\n${prBody}` : ' and a body summarizing the commits (Summary + Test plan sections, matching this repo\'s PR convention)'}.

Return the PR number, url, headRefName, and baseRefName.`,
  {
    phase: 'Open PR',
    schema: {
      type: 'object',
      properties: {
        prNumber: { type: ['number', 'null'] },
        prUrl: { type: 'string' },
        headRefName: { type: 'string' },
        baseRefName: { type: 'string' },
        error: { type: 'string' },
      },
      required: ['prNumber'],
    },
  },
)

if (!opened.prNumber) {
  return { error: opened.error || 'PR was not opened — see the Open PR agent above for why.' }
}

const round1 = await workflow({ scriptPath: `${pluginRoot}/workflows/pr-review-round.mjs` }, {
  cwd,
  prNumber: opened.prNumber,
  prUrl: opened.prUrl,
  headRefName: opened.headRefName || 'HEAD',
  baseRefName: opened.baseRefName || base,
  roundHint: 1,
  pluginRoot,
  // Not used here — this workflow never shells out to codex. Threaded through
  // for pr-review-round, which does.
  codexCompanion,
})

return { ...opened, ...round1 }
