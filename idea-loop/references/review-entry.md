# Review dispatcher setup

Resolve cwd from the work actually edited in the conversation, not blindly from shell cwd.
Read the repository's applicable AGENTS.md and REVIEW.md explicitly. Check tracked cleanliness
with git status --short --untracked-files=no. Do not reset/stash someone else's edits.
Unrelated untracked scratch is allowed; intended new files must already be committed.

Resolve the installed openai-codex companion from the sibling plugin, not this plugin root.
Walk up from CLAUDE_PLUGIN_ROOT to the directory named plugins; inspect existing files under
cache/openai-codex and marketplaces/openai-codex/plugins/codex/scripts. Prefer the installed
versioned cache. Verify codex-companion.mjs exists and supports normal review with --scope branch.
No hardcoded username, guessed path, or adversarial fallback. If unavailable, report the missing
dependency before pushing/starting a workflow. Do not silently install or change Codex config.

The dispatchers pass pluginRoot and codexCompanion explicitly: Workflow .mjs scripts have no
filesystem/env API; their agents execute tool operations. Preserve this host-compatible design.
They require the host Workflow tool and authenticated gh (including review thread GraphQL access).
If Workflow is unavailable, report it; do not pretend node can directly execute these host scripts.

These workflows run in the background. Announce start, then wait for the completion notification;
never fabricate a successful review early. A failure should identify the step and partial results.
Success returns prUrl, summaryUrl, headSha, round, openBlockingCount and mergeReady. Always report
required check gaps alongside counts. No automatic merge or approval. No artifact output.
