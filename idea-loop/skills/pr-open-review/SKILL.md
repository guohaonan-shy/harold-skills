---
name: pr-open-review
description: Start one PR review workflow — push already-committed work, create or reuse a GitHub PR with examples and Mermaid, then run normal Codex correctness review and project-rule/spec checks. Publish verified findings in GitHub comments and threads. Does not implement or commit code.
---

# Open and review a PR

Start on an explicit request — the user invoking `/idea-loop:pr-open-review`, or a caller that
hands you a worktree whose work is already committed. Completing implementation, pushing a
branch or running `gh pr create` is not by itself a trigger; do not install a hook that fires
on them. An already-open PR is reused.

Read [review-entry.md](../../references/review-entry.md) for context, companion discovery and
result handling, and [github-review.md](../../references/github-review.md) for publication.
Read the target repository's REVIEW.md and applicable AGENTS.md before dispatching.

Use the actual worktree the work was done in as cwd. Require implementation to be committed;
this command does not implement or commit unfinished work. Capture the accepted task, explicit
ticket/spec links, acceptance checks, scope amendments and exclusions as agreement — from this
conversation, or from the request the caller handed you. Do not replace them with a guess from
the branch title; if none of that is available, stop and report what is missing.

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
    botTokenCommand: "<optional machine identity; see below>",
  },
})
```

`botTokenCommand` is optional and exists for an autonomous caller. Supply a shell command that
prints a short-lived token to stdout and the publication step runs as
`GH_TOKEN=$(<cmd>) node <helper> publish …`, so this round's findings and round summary carry a
machine identity a reader can tell apart from a human's own comments. It re-points **writes
only** — every read stays on the session's own gh auth — and the token is substituted per
command, never assigned, echoed or written to disk. Omit it and publication runs under the
caller's own identity, which stays the right default whenever a human is present. A caller that
supplies it owns that credential; this workflow never mints one, and it never falls back to the
session identity when the supplied command fails — a silent fallback would produce exactly the
comments the parameter exists to distinguish.

The workflow pushes, creates/reuses the PR, prepares a pinned review, verifies findings and
publishes the current explanation and review threads on GitHub. Await its completion
notification before reporting results. Return PR URL, round summary URL, reviewed SHA,
openBlockingCount and mergeReady plus any incomplete checks. No artifact link, automatic
approval, merge or unbounded re-review loop.
