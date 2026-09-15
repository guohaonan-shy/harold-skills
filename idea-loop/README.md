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
| `/idea-loop:implement` | Build | One ticket → one commit, in a context holding nothing but that ticket, TDD at the seams the spec already agreed |
| `/idea-loop:pr-open-review` | Review · round 1 | Pushes committed work, explains it with examples/Mermaid, reviews and publishes GitHub threads. |
| `/idea-loop:pr-fix-verify` | Review · round N+1 | Fixes selected GitHub findings, repeats original verification, updates threads and PR explanation. |
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
| `to-spec`, `to-ticket`, `implement`, `pr-open-review`, `pr-fix-verify` | `grill`, `dreaming` |

`grill` is an interview — it only means something when a human starts it. `dreaming`
proposes destructive disposals.

The execution three were human-only until the caller-dispatch model landed: `implement`
requires a context holding nothing but the one ticket, and `/clear` is a human action.
Dispatching a fresh agent satisfies that precondition too — more strictly, in fact — so the
lock came off. What the lock was protecting did not: the ticket must still be self-contained
(no file paths, no code snippets, behaviour not procedure), and `implement` must still **stop
and report** when a precondition turns out not to hold rather than guessing its way onward.
See `to-ticket` §6 for where each of the original two reasons now lives.

### The review loop

Start each round in Claude Code:

```text
/idea-loop:pr-open-review
/idea-loop:pr-fix-verify F-1 <agreed fix direction>
```

These commands launch local host `Workflow` scripts, not GitHub Actions. Running `gh pr create`
alone only opens a PR; it does not start a review. `pr-open-review` can reuse that existing PR.
A caller may start either round instead of you, but the trigger is always an explicit request:
no PR/push hook is wired, and neither skill starts the next round by itself — the round budget
belongs to whoever called it. One command still runs its complete
review/fix/verification/publication sequence once started.

Both dispatchers call `pr-review-round`: pin base/head and accepted scope, investigate
three axes, independently verify and deduplicate findings, then publish on GitHub.

| Axis | Asks | Blocks a merge? |
|---|---|---|
| **Correctness** | Did this introduce/activate a supported-path defect? Normal Codex review. | By proven impact |
| **Spec** | Does this satisfy the actual acceptance agreement and amendments? | By requirement/impact |
| **Standards** | Does this violate an applicable written project rule? No generic smells. | By explicit rule/impact |

Axes retain coverage status but the same defect gets one stable finding ID and thread.
Tool diagnostics require baseline attribution; CI failures appear in checks rather than
duplicate comments. Missing acceptance or required verification remains incomplete, not green.

The PR title/body explains the final behavior with examples and native Mermaid where useful.
Each round has a short summary linking original problem threads; fixes reply there with
independently reproduced before/after evidence before resolution. No HTML artifacts or required
local history. Later rounds focus on fix deltas and affected callers; no automatic adversarial
review. See `references/github-review.md` for the JSON publication contract and recovery behavior.

`scripts/github-review.mjs` uses authenticated `gh api` (official GitHub REST/GraphQL). It
paginates history, preserves IDs, detects changed base/head and description conflicts, and
resumes partial publication without duplicating completed comments. It never approves/merges.
Run `node --test idea-loop/scripts/*.test.mjs` manually from the repository root for the mocked
GitHub and host-workflow tests. No GitHub Actions job is required or shipped for this loop.
Real model quality and host Workflow execution require a live CC run.

## Portability

Project rules and verification tools come from the current repository's REVIEW.md,
AGENTS.md and applicable documents/configuration. There is no inherited Toeflair/Fowler
baseline. Cross-plugin paths are threaded through as `pluginRoot`
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
├── scripts/
│   ├── github-review.mjs             # official GitHub API publication and recovery
│   ├── github-review.test.mjs        # state, threads, retries, stale-head tests
│   └── review-workflows.test.mjs     # mocked host orchestration tests
└── references/
    ├── wiki-conventions.md           # the docs/ contract — directories, frontmatter, status enums
    ├── tdd.md                        # red→green loop, seams, mock boundary
    ├── review-standards.md           # project-rule admission, evidence and severity
    ├── review-entry.md               # dispatcher prerequisites and result handling
    └── github-review.md              # native Markdown, publication schema and threads
```
