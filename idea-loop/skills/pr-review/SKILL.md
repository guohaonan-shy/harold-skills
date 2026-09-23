---
name: pr-review
description: Start the PR review loop — open or reuse the PR for already-committed work, then run up to two automatic rounds of Codex review (gpt-6-sol, three axes), verification, fixing with regression tests and independent re-verification, publishing one GitHub post per round. Pre-existing problems go to the backlog instead of being fixed. Stops at mergeReady and waits for an explicit merge order. Use when committed work is ready for review, or to continue reviewing a PR after a human decision.
---

# PR review loop

Start on an explicit request: the user invoking `/idea-loop:pr-review`, or a caller that hands you a
worktree whose work is already committed. Completing implementation, a push or `gh pr create` is not
by itself a trigger; do not install a hook that fires on them.

Read [review-entry.md](../../references/review-entry.md) once. It covers companion discovery,
the round budget and how to report.

## Before calling the workflow

1. **cwd** is the worktree the work was actually done in. Tracked files must be committed; this
   command does not implement or commit unfinished work.
2. **Agreement.** Collect the accepted task from this conversation, or from the request a caller
   handed you: ticket/spec links, acceptance criteria, accepted scope changes and exclusions. Never
   guess it from the branch name. If none of it is available, stop and say what is missing.
   Workflow agents cannot see this conversation; the first round writes the agreement into the PR
   description's `## 验收契约` section and later rounds read it from there.
3. **Codex companion path**, per review-entry.md. The three axes run on `gpt-6-sol`.
4. **Continuing a PR.** When the PR already exists, run `node "${CLAUDE_PLUGIN_ROOT}/scripts/github-review.mjs"
   snapshot OWNER/REPO PR`; if its `nextRound` is above 1 (earlier round posts, or legacy review threads),
   pass `prNumber` and `startRound: nextRound`. The human decision that
   unblocked it belongs in `agreement`.

```javascript
Workflow({
  scriptPath: "${CLAUDE_PLUGIN_ROOT}/workflows/pr-review-loop.mjs",
  args: {
    cwd: "<actual worktree>",
    baseRefName: "<requested base, main by default>",
    agreement: "<accepted task, acceptance criteria, source links, amendments>",
    pluginRoot: "${CLAUDE_PLUGIN_ROOT}",
    codexCompanion: "<existing sibling companion path>",
    // prNumber: 123, startRound: 3   — only when continuing a PR
  },
})
```

## What one invocation does

Up to two rounds. Each round: open or reuse the PR and build the review contract → Codex reviews
correctness, written standards and spec, and the project's own check commands run → every candidate
is reproduced, deduplicated and tested at the merge-base to decide whether this PR introduced it →
introduced findings get fixed with a regression test, pre-existing ones get a backlog entry →
a separate agent verifies each fix red-to-green → one round post on the PR.

It stops early when a round finds nothing introduced, when something needs a human decision, or on
any failure. It never approves or merges.

## Reporting

Await the completion notification; never report a result early. Then give, in words:

- each round post URL, how many findings were fixed, backlogged or left for a decision;
- `stopReason` and `mergeReady`, plus any incomplete check. An incomplete check is not a pass, and a
  zero blocker count alone is not merge readiness;
- the `note` when the last round's fixes had no further review after them;
- what exactly needs Harold, for `needs-human`.

Merge only when Harold says so, in this conversation.
