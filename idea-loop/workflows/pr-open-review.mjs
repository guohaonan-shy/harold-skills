export const meta = {
  name: 'pr-open-review',
  description: 'Push committed work, open its PR with examples/Mermaid, then review and publish findings on GitHub',
  whenToUse: 'On an explicit request with committed work — the user invoking /idea-loop:pr-open-review, or a caller handing over a worktree. A push or gh pr create is not by itself a trigger.',
  phases: [{ title: 'Open PR' }, { title: 'Review on GitHub' }],
}

const input = typeof args === 'string' ? JSON.parse(args) : args
const { cwd, baseRefName = 'main', pluginRoot, codexCompanion, agreement = '', prTitle = '', prBody = '',
  botTokenCommand = '' } = input
if (!cwd || !pluginRoot || !codexCompanion) return { error: 'Missing cwd/pluginRoot/codexCompanion', mergeReady: false }
phase('Open PR')
const opened = await agent(`Open/reuse a PR for committed work in ${cwd} targeting ${baseRefName}.
Read ${pluginRoot}/references/github-review.md plus the target AGENTS.md/REVIEW.md and applicable
nested rules. Check tracked cleanliness; do not commit, reset or stash. Unrelated untracked scratch
is not shipped, but explicitly identify any intended new files missing from the committed change.
Resolve the actual branch; never push main as a feature branch. Check authenticated gh access.
Push explicitly to the feature branch (no force). Reuse an existing open PR if present; its actual
base is authoritative, and an unexpected different target needs reconciliation before review.
Otherwise create a PR via GitHub plugin or gh pr create. Use structured arguments or --body-file,
never interpolate arbitrary text into shell commands. Creation/review are authorized by this workflow;
approval and merge are not.

Accepted task/requirement context:
${agreement}
Supplied title/body, if any (retain their meaning and human context):
${prTitle}
${prBody}
Read the diff, linked ticket/spec and accepted scope changes. Explain the final behavior, not the
commit chronology: why, each logical change with before/after example, native Mermaid when flows
or relationships need it, code links, actual verification and remaining limits. Preserve issue/spec
links. Reused PRs are reconciled by the publication step, not overwritten blindly here.
Read back PR metadata and require remote head to equal local HEAD. Return prNumber, prUrl and
headSha. On failure return prNumber:null with error; never claim a PR was created when it was not.`, {
  label: 'pr:open', schema: { type: 'object', properties: {
    prNumber: { type: ['number', 'null'] }, prUrl: { type: 'string' }, headSha: { type: 'string' }, error: { type: 'string' },
  }, required: ['prNumber'] },
})
if (!opened?.prNumber || !/^[a-f0-9]{40}$/.test(opened.headSha || '')) {
  return { error: opened?.error || 'PR or committed head not confirmed', mergeReady: false }
}
phase('Review on GitHub')
const review = await workflow({ scriptPath: `${pluginRoot}/workflows/pr-review-round.mjs` }, {
  cwd, prNumber: opened.prNumber, pluginRoot, codexCompanion, agreement, expectedHead: opened.headSha,
  botTokenCommand,
})
return { ...opened, ...review }
