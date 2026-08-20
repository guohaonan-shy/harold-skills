---
name: pr-open-review
description: Slash-command trigger for the `pr-open-review` Workflow — pushes an already-committed branch, opens its PR, and kicks off round-1 three-axis review (correctness / standards / spec, run in parallel and reported separately). Invoke after implementation is done and committed in the current session, when you're ready to open the PR for review. Does not implement or commit anything itself.
---

# idea-loop: pr-open-review — trigger Workflow A

Thin dispatcher. Your job here is to resolve the context Workflow A needs and call
it — the actual push/PR-create/review/triage/artifact work all happens inside
`workflows/pr-open-review.mjs` (which itself calls `pr-review-round.mjs`
for the review). Don't reimplement any of that logic here.

## When this is wrong to use

If there are uncommitted changes in the target worktree, or the fix/feature hasn't
been discussed and implemented yet — stop and say so. This skill assumes
implementation already happened in the interactive session (same as the project's
normal dev workflow: discuss → implement → **then** open PR). It does not commit
code on your behalf.

## Steps

1. **Resolve `cwd`.** Use the worktree/directory this conversation has actually
   been editing (you already know this from context — don't blindly `pwd`, a
   session's shell cwd and the worktree being worked on can differ). If it's
   ambiguous, ask.
2. **Resolve `baseRefName`.** Default `main` unless `$ARGUMENTS` specifies
   otherwise.
3. **Sanity check before spending a workflow run**: `git -C "<cwd>" status --short --untracked-files=no`
   — if non-empty, stop and tell the user what's uncommitted; don't call the
   workflow against a dirty tree. Untracked files are excluded on purpose — a
   repo can carry unrelated scratch/WIP that has nothing to do with this
   branch's readiness (confirmed 2026-08-19: this repo has long-lived
   untracked design-preview/ scratch that isn't part of any branch's work).
4. **Resolve `codexCompanion`.** The review axes shell out to the `openai-codex`
   plugin's companion script. That file belongs to a *different* plugin, so
   `${CLAUDE_PLUGIN_ROOT}` does not point at it — but it does live under the same
   plugins root, so it can be found from here. Walk up to the directory named
   `plugins`, then take the first of these that exists:
   ```bash
   R="${CLAUDE_PLUGIN_ROOT}"
   while [ "$R" != "/" ] && [ "$(basename "$R")" != "plugins" ]; do R=$(dirname "$R"); done
   { find "$R/cache/openai-codex" -name codex-companion.mjs 2>/dev/null | sort -Vr
     ls "$R/marketplaces/openai-codex/plugins/codex/scripts/codex-companion.mjs" 2>/dev/null
   } | head -1
   ```
   Both layouts are checked because a plugin loads from either the versioned
   cache (preferred — it is what is actually installed) or the marketplace clone.
   No wildcard appears anywhere in that command on purpose: under zsh an
   unmatched glob aborts the whole pipeline instead of expanding to nothing, so a
   globbed version directory would report "codex not installed" whenever only the
   other layout was present.

   If nothing prints, **stop** — `openai-codex` isn't installed and there is no
   review to run; say that instead of calling the workflow. Never substitute a
   guessed path. A hardcoded one is exactly what made this unportable before: it
   named one machine's username and one config directory, and resolved to a file
   that existed nowhere else.
5. **Call the workflow.** Use `scriptPath`, not `name` — this workflow isn't in
   the named registry (confirmed: `Workflow({name:"pr-open-review",...})` fails
   with "not found; Available: deep-research, code-review"):
   ```
   Workflow({
     scriptPath: "${CLAUDE_PLUGIN_ROOT}/workflows/pr-open-review.mjs",
     args: {
       cwd: "<cwd>",
       baseRefName: "<base>",
       pluginRoot: "${CLAUDE_PLUGIN_ROOT}",
       codexCompanion: "<resolved above>",
     },
   })
   ```
   `pluginRoot` and `codexCompanion` are both passed through explicitly because
   Workflow scripts have no filesystem/env API — `${CLAUDE_PLUGIN_ROOT}` only
   expands here, in the skill's own markdown, and only this dispatcher can shell
   out to look for a sibling plugin's file. The `.mjs` files can do neither.
6. Workflow runs in the background — tell the user it's running and that you'll
   report the PR link + round-1 artifact link + open high-severity count once the
   completion notification arrives. Don't fabricate a result before it lands.
7. When the notification arrives, read the result and report: PR URL, artifact
   URL, and the `openHighSeverityCount`. If it's 0, say so explicitly — that's the
   signal nothing found is currently blocking. If the workflow returned an
   `error` (e.g. dirty tree, PR creation failed), report that instead — don't
   retry silently.

   **`openHighSeverityCount` 为 `null` ≠ 0。** `null` 表示 **Correctness 轴本轮没跑成**（返回值里的 `correctnessRan:false` / `correctnessFailure` 说明原因）——这一轮**没资格放行合并**，即便 Standards / Spec 都干净。照实报告未跑的原因，别把它说成通过。
