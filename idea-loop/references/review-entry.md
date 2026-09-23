# Review loop setup

`/idea-loop:pr-review` starts an explicitly requested Claude Code Workflow run, not a GitHub Actions
job. Require an explicit request: the user's slash command, or a caller that asked for this run.
A hook, a push/PR event or an upstream skill merely finishing is not one.

## Round budget

One invocation runs **at most two rounds** and then stops, so Harold reads what the loop did before
anything else happens. The budget belongs to the caller: the workflow never starts a third round on
its own. Continuing a PR is a new invocation with `prNumber` and `startRound` set to the helper
snapshot's `nextRound`; round numbers keep counting across invocations.

## Who runs what

| Step | Runs on |
|---|---|
| Open/reuse PR + prepare the review contract | Claude Sonnet 5, effort xhigh |
| Correctness axis | Codex `review --model gpt-6-sol --scope branch --base <sha>` |
| Written-standards axis, spec axis | Codex `task --model gpt-6-sol`, read-only (never `--write`) |
| Wrappers around Codex, project check commands | Claude Sonnet 5, effort low |
| Verify + dedup, fix, independent re-verification | Claude Sonnet 5, effort xhigh; fixer and verifier are separate agents |
| Publish | the helper renders and posts; the agent that runs it uses Sonnet 5, effort low |

## Preconditions

Resolve cwd from the work actually edited, not blindly from shell cwd. Check tracked cleanliness with
`git status --short --untracked-files=no`. Never reset, stash or checkout in the reviewed worktree;
older states (reviewed head, merge-base) are extracted with `git archive <sha> | tar -x -C <scratch>`.
Unrelated untracked scratch is allowed; intended new files must already be committed.

Resolve the installed openai-codex companion from the sibling plugin, not this plugin root. Walk up
from CLAUDE_PLUGIN_ROOT to the directory named plugins; inspect existing files under
cache/openai-codex and marketplaces/openai-codex/plugins/codex/scripts. Prefer the installed versioned
cache. Verify codex-companion.mjs exists and supports `review --scope branch` and `task`. No hardcoded
username, guessed path or adversarial-review fallback. If it is unavailable, report the missing
dependency before pushing or starting the workflow. Do not silently install or change Codex config.

The workflow receives pluginRoot and codexCompanion explicitly: Workflow scripts have no
filesystem/env API, so agents execute every tool operation. It requires the host Workflow tool and
authenticated gh. The GitHub App identity is optional (github-review.md); without it the round posts
come from the gh login and say so.

## Reporting

The workflow runs in the background. Announce the start, then wait for the completion notification;
never report success early. A failure names the step and the partial results. Success returns
`rounds` (post URL, fixed/backlogged counts, mergeReady per round), `stopReason`, `mergeReady` and an
optional `note`. Always report incomplete checks alongside counts. No automatic approval or merge.
