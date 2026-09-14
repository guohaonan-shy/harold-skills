---
name: pr-fix-verify
description: Implement an agreed round of fixes for selected GitHub review findings, independently repeat their verification paths, and update the original threads plus PR explanation. Use after the developer has chosen findings and fix direction.
---

# Fix and verify GitHub findings

Read [review-entry.md](../../references/review-entry.md),
[github-review.md](../../references/github-review.md), and the target REVIEW.md/AGENTS.md.
Resolve the actual worktree and PR, then read the GitHub snapshot, original finding threads
and human replies. GitHub is the source of truth; never read a local HTML artifact to decide
what is open or which round this is.

The developer must already have agreed which findings and how to fix them. Select exactly
the IDs named in the request or unambiguously discussed in the immediately preceding turns.
"Go ahead" does not mean all open findings. If ambiguous, ask which ones; if direction is
still exploratory, discuss it first. Existing authorization does not need reconfirmation.
Missing legacy history follows github-review.md's migration guidance; do not invent IDs.

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
