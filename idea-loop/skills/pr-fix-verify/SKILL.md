---
name: pr-fix-verify
description: Start one agreed round of fixes for selected GitHub review findings, independently repeat their verification paths, and update the original threads plus PR explanation. Use after the findings and the fix direction have been chosen.
---

# Fix and verify GitHub findings

Start on an explicit request — the user invoking `/idea-loop:pr-fix-verify`, or a caller that
names the findings and the fix direction. A new review comment or a push is not by itself a
trigger; do not install a hook that fires on them. **One invocation is one round**: when this
round finishes, stop and report. The round budget belongs to whoever called you — never start
the next round on your own.

Read [review-entry.md](../../references/review-entry.md),
[github-review.md](../../references/github-review.md), and the target REVIEW.md/AGENTS.md.
Resolve the actual worktree and PR, then read the GitHub snapshot, original finding threads
and human replies. GitHub is the source of truth; never read a local HTML artifact to decide
what is open or which round this is.

Which findings, and how to fix them, must already be settled before this runs. Select exactly
the IDs named in the request or unambiguously discussed in the immediately preceding turns.
"Go ahead" does not mean all open findings, and never widen the selection on your own. If the
selection or the direction is unclear, **stop and say what is missing** — ask the user when one
is present, otherwise hand the question back to the caller; do not guess and proceed. Existing
authorization does not need reconfirmation. Missing legacy history follows github-review.md's
migration guidance; do not invent IDs.

```javascript
Workflow({
  scriptPath: "${CLAUDE_PLUGIN_ROOT}/workflows/pr-fix-verify.mjs",
  args: {
    cwd: "<actual worktree>",
    prNumber: 123,
    findingIds: ["F-1", "F-3"],
    feedback: "<agreed fix direction, including accepted scope changes>",
    pluginRoot: "${CLAUDE_PLUGIN_ROOT}",
    codexCompanion: "<existing sibling companion path>",
    botTokenCommand: "<optional machine identity; see pr-open-review>",
  },
})
```

The workflow rereads selected records from GitHub, fixes/tests, independently repeats original
failure paths, then performs one normal correctness review of the fix delta and affected paths
(full PR only if coverage/scope requires it). It replies to original threads and updates the PR
description with examples/Mermaid and one round summary. With no commit, it does not restart
discovery and can reuse only recorded checks for the same head/base.

After completion report per-finding verification/disposition, PR and summary URLs, reviewed SHA,
openBlockingCount and mergeReady. A changed file is not a verified fix; an incomplete check is
not a pass; a zero blocker count alone is not merge readiness. Stop on new product decisions
or publication failure and report actual partial results. Do not approve or merge.
