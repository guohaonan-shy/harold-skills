---
name: pr-open-review
description: Manually start one PR review workflow — push already-committed work, create or reuse a GitHub PR with examples and Mermaid, then run normal Codex correctness review and project-rule/spec checks. Publish verified findings in GitHub comments and threads. Does not implement or commit code.
disable-model-invocation: true
---

# Open and review a PR

Run only when the user invokes `/idea-loop:pr-open-review`. Completing implementation,
pushing a branch or running `gh pr create` is not a trigger. Do not install a hook or call
this workflow automatically from another skill. An already-open PR is reused.

Read [review-entry.md](../../references/review-entry.md) for context, companion discovery and
result handling, and [github-review.md](../../references/github-review.md) for publication.
Read the target repository's REVIEW.md and applicable AGENTS.md before dispatching.

Use the actual worktree edited in this conversation as cwd. Require implementation to be
committed; this command does not implement or commit unfinished work. Capture the accepted
task, explicit ticket/spec links, acceptance checks, scope amendments and exclusions from the
conversation as agreement. Do not replace them with a guess from the branch title.

Call the workflow by scriptPath (it is not in the named registry):

```javascript
Workflow({
  scriptPath: "${CLAUDE_PLUGIN_ROOT}/workflows/pr-open-review.mjs",
  args: {
    cwd: "<actual worktree>",
    baseRefName: "<requested base, main by default>",
    agreement: "<accepted task and source links>",
    pluginRoot: "${CLAUDE_PLUGIN_ROOT}",
    codexCompanion: "<existing sibling companion path>",
  },
})
```

The workflow pushes, creates/reuses the PR, prepares a pinned review, verifies findings and
publishes the current explanation and review threads on GitHub. Await its completion
notification before reporting results. Return PR URL, round summary URL, reviewed SHA,
openBlockingCount and mergeReady plus any incomplete checks. No artifact link, automatic
approval, merge or unbounded re-review loop.
