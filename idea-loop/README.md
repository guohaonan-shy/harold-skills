# idea-loop plugin

Closed loop from idea to shipped engineering, backed by the `docs/` Obsidian
vault as its knowledge base. No state machine — a file's existence IS its
status (see `references/wiki-conventions.md`).

## Skills

| Skill | Stage | Coverage |
|---|---|---|
| `/idea-loop:grill` | Idea | Design-tree interview in frontier rounds — facts are the agent's job, decisions are the human's |
| `/idea-loop:to-spec` | Spec | Lands the conversation as a raw transcript + one spec (problem, user stories, implementation + testing decisions, agreed seams) |
| `/idea-loop:to-ticket` | Plan | Slices a spec into tracer-bullet vertical cuts with blocking edges; holds the design-freeze gate for UI work |
| `/idea-loop:implement` | Build | One ticket → one commit, in a fresh session, TDD at the seams the spec already agreed |
| `/idea-loop:pr-open-review` | Review · round 1 | Pushes the branch, opens the PR, runs the three-axis round. **No browser.** |
| `/idea-loop:pr-fix-verify` | Review · round N+1 | Lands an agreed round of fixes as one commit, then re-reviews. **No browser.** |
| `/idea-loop:dreaming` | Maintain | Reconciles every doc against `origin/main` — including `CLAUDE.md` — and proposes disposals the human approves before anything moves |

### The forward loop is not the maintenance sweep

`grill → to-spec → to-ticket → implement → pr-open-review → pr-fix-verify` runs once
per piece of work. `dreaming` is a **periodic batch reconciliation** over the whole
vault — weekly, or when specs pile up, or by hand. It is not the next step after
`implement`.

**No stage in the forward loop writes an ADR.** ADRs are produced only in Maintain,
which is also where a finished spec is deleted (the contract's invariant: never delete
a spec before its ADR exists). So a spec sitting in `docs/spec/` with its work already
merged is a **normal state**, not an oversight — it is waiting for the next sweep.

Which skills the model may invoke itself:

| Model-invocable | Human-invoked only (`disable-model-invocation`) |
|---|---|
| `to-spec`, `to-ticket`, `pr-open-review`, `pr-fix-verify` | `grill`, `implement`, `dreaming` |

`grill` is an interview — it only means something when a human starts it. `dreaming`
proposes destructive disposals. `implement` requires a fresh context window, and
clearing context is something only the human can do, so a self-invoking `implement`
would break its own first precondition.

### The review loop

Both dispatchers call the shared `pr-review-round` workflow (`workflows/`),
which reviews on three axes **in parallel and never merges or reranks
them** — a change can pass one and fail another:

| Axis | Asks | Blocks a merge? |
|---|---|---|
| **Correctness** | did this introduce a bug (codex adversarial) | ✅ yes |
| **Spec** | is this what the ticket/spec actually asked for | ✅ yes |
| **Standards** | does this follow this repo's documented conventions | ❌ **never** |

Standards discovers whatever lint/typecheck this repo already has configured
and runs it first (diff-scoped) — CI-enforced checks aren't re-reported, only
what nothing else catches — and only then reviews what tooling cannot check —
capped at 5 findings and at `medium` severity, so style never holds up a PR
that works and does what was asked.

Output is one HTML triage page per PR, updated in place each round: the open
correctness/spec blockers up top, everything else collapsed.

## Portability

This plugin was built inside one project (Toeflair) and generalized out of
it for reuse — `references/review-standards.md`'s 8-principle table is that
origin project's own `CLAUDE.md` principles, kept as a working default; the
axis is instructed to read *the current repo's own* `CLAUDE.md` first and
only fall back to this table (then to Fowler's smell baseline) where the
current repo hasn't documented something. Lint/typecheck tooling and any
domain-specific standards docs are discovered from the current repo, not
hardcoded. Cross-plugin file paths are threaded through as `pluginRoot`
(via `${CLAUDE_PLUGIN_ROOT}`, resolved in each dispatcher's own SKILL.md —
Workflow scripts have no filesystem/env API of their own) rather than
hardcoded, so this plugin should survive being copied to another project or
machine as-is. The `openai-codex` companion script travels the same route: the
dispatcher walks up from `${CLAUDE_PLUGIN_ROOT}` to the plugins root, finds the
companion under either the marketplace clone or the versioned cache, and passes
it in as `codexCompanion`. The workflows have no fallback for it on purpose — a
hardcoded default is what made this unportable, and a review that silently
points at a nonexistent script is worse than one that refuses to start.

## Architecture

```
idea-loop/
├── .claude-plugin/plugin.json
├── README.md (this file)
├── skills/
│   ├── grill/SKILL.md
│   ├── to-spec/SKILL.md
│   ├── to-ticket/SKILL.md
│   ├── implement/SKILL.md
│   ├── pr-open-review/SKILL.md       # → workflows/pr-open-review.mjs
│   ├── pr-fix-verify/SKILL.md        # → workflows/pr-fix-verify.mjs
│   └── dreaming/SKILL.md
├── workflows/
│   ├── pr-open-review.mjs            # round 1: push, open PR, call pr-review-round
│   ├── pr-fix-verify.mjs             # round N+1: fix, commit, call pr-review-round
│   └── pr-review-round.mjs           # shared tail: the three-axis review itself
└── references/
    ├── wiki-conventions.md           # the docs/ contract — directories, frontmatter, status enums
    ├── tdd.md                        # red→green loop, seams, mock boundary
    ├── review-standards.md           # Standards axis: this repo's own principles + Fowler baseline
    └── review-artifact-template.html # the PR triage page's approved shape
```
