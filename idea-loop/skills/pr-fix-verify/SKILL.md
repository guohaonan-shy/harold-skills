---
name: pr-fix-verify
description: Slash-command trigger for the `pr-fix-verify` Workflow — implements + tests + verifies one round of agreed review-finding fixes as a single commit, then runs the next three-axis review round. Invoke once you and the developer have agreed IN CHAT how one or more open findings from the PR's codex-review artifact should be fixed; pass that agreed direction as the command's argument text.
---

# idea-loop: pr-fix-verify — trigger Workflow B

Thin dispatcher, same shape as `pr-open-review`. Your job is to resolve the
context Workflow B needs (which PR, which round, which findings, what direction
was agreed) and call it — the actual fix/test/verify/commit/re-review work
happens inside `workflows/pr-fix-verify.mjs`.

## When this is wrong to use

The fix *direction* must already be decided in conversation before you invoke
this — this skill does not make product/UX judgment calls, it executes an
already-agreed plan. If the developer's feedback is still exploratory ("what
should we do about F-2?"), have that discussion first; only invoke this once
they've told you to go implement it.

## Steps

1. **Resolve `cwd`.** Same as `pr-open-review` — the worktree this conversation
   has been working in, not a blind `pwd`.
2. **Resolve PR context**: `gh pr view --json number,url,headRefName,baseRefName`
   run in `cwd` → `prNumber`, `headRefName`, `baseRefName`.
3. **Resolve the artifact + current round + findings to fix**:
   - Read `<cwd>/.claude/.idea-loop-state/pr-reviews/pr-<prNumber>-review.html`.
   - `priorRound` = the highest round number in its "Round history" section.
   - `findingsToFix` = the open (not yet marked "✅ round N 已修复") CONFIRMED
     findings that `$ARGUMENTS` is actually about. If `$ARGUMENTS` names specific
     F-N ids, scope to exactly those. If it doesn't name any and reads as
     "fix what we just discussed" / "go ahead", scope to whichever open findings
     the immediately preceding conversation turns were actually discussing — not
     every open finding in the file. If that's ambiguous, ask which ones before
     calling the workflow; guessing wide (all open findings) risks the fix-agent
     "fixing" something whose direction was never actually agreed.
4. **Call the workflow.** Use `scriptPath`, not `name` — this workflow isn't in
   the named registry (confirmed: `Workflow({name:"pr-fix-verify",...})` fails
   with "not found; Available: deep-research, code-review"):
   ```
   Workflow({
     scriptPath: "${CLAUDE_PLUGIN_ROOT}/workflows/pr-fix-verify.mjs",
     args: {
       cwd: "<cwd>",
       prNumber: <prNumber>,
       headRefName: "<headRefName>",
       baseRefName: "<baseRefName>",
       priorRound: <priorRound>,
       findingsToFix: [...],
       feedback: "<$ARGUMENTS — the agreed fix direction, verbatim>",
       pluginRoot: "${CLAUDE_PLUGIN_ROOT}",
     },
   })
   ```
   `pluginRoot` is threaded through for the same reason as `pr-open-review` —
   `${CLAUDE_PLUGIN_ROOT}` only expands in this markdown, not inside the `.mjs`
   files this calls.
5. Runs in the background — tell the user it's running, you'll report per-finding
   results (fixed/blocked, with the real verification signal reported for each)
   plus the next round's artifact link + `openHighSeverityCount` once the
   completion notification arrives.
6. When it lands: report clearly which findings actually got fixed-and-confirmed,
   which were **blocked** (surface the `blockedReason` — that's the developer's
   cue to give more direction), and which were claimed-fixed but **contradicted**
   by the non-adversarial recheck (these need another look, not a retry with the
   same instructions). If `openHighSeverityCount` in the new round is 0, say so —
   that's the merge-readiness signal.

   **`openHighSeverityCount` 为 `null` ≠ 0。** `null` 表示 **Correctness 轴本轮没跑成**（返回值里的 `correctnessRan:false` / `correctnessFailure` 说明原因）——这一轮**没资格放行合并**，即便 Standards / Spec 都干净。照实报告未跑的原因，别把它说成通过。
