# idea-loop plugin

Closed loop from idea to shipped engineering, backed by the `docs/` Obsidian
vault as its knowledge base. No state machine — a file's existence IS its
status (see `references/wiki-conventions.md`).

## Skills

| Skill | Stage | Coverage |
|---|---|---|
| `/idea-loop:grill` | Idea | Design-tree interview in frontier rounds — facts are the agent's job, decisions are the human's |
| `/idea-loop:prototype` | Idea | Throwaway code that answers ONE question — a clickable single-file HTML state model, or structurally distinct gray-box variants; the artifact and the verdict both land in the raw bucket |
| `/idea-loop:to-spec` | Spec | Lands the conversation as a raw transcript + one spec (problem, user stories, implementation + testing decisions, agreed seams) |
| `/idea-loop:uiux-imagine` | Design · diverge | Opens only the altitude that is still undecided, renders variants at the lowest fidelity that tells them apart, and ships ONE direction note back into the spec — no critic, no scoring, no fidelity bump |
| `/idea-loop:to-ticket` | Plan | Slices a spec into tracer-bullet vertical cuts with blocking edges; holds the design-freeze gate for UI work |
| `/idea-loop:implement` | Build | One ticket → one commit, in a fresh session, TDD at the seams the spec already agreed |
| `/idea-loop:pr-open-review` | Review · round 1 | Pushes the branch, opens the PR, runs the three-axis round. **No browser.** |
| `/idea-loop:pr-fix-verify` | Review · round N+1 | Lands an agreed round of fixes as one commit, then re-reviews. **No browser.** |
| `/idea-loop:dreaming` | Maintain | Reconciles every doc against `origin/main` — including `CLAUDE.md` — and proposes disposals the human approves before anything moves |

### The forward loop is not the maintenance sweep

`grill → to-spec → uiux-imagine → to-ticket → implement → pr-open-review →
pr-fix-verify` runs once per piece of work (`uiux-imagine` only when the spec
stopped at `等设计冻结`). `dreaming` is a **periodic batch reconciliation** over the whole
vault — weekly, or when specs pile up, or by hand. It is not the next step after
`implement`.

**No stage in the forward loop writes an ADR.** ADRs are produced only in Maintain,
which is also where a finished spec is deleted (the contract's invariant: never delete
a spec before its ADR exists). So a spec sitting in `docs/spec/` with its work already
merged is a **normal state**, not an oversight — it is waiting for the next sweep.

Which skills the model may invoke itself:

| Model-invocable | Human-invoked only (`disable-model-invocation`) |
|---|---|
| `prototype`, `to-spec`, `to-ticket`, `pr-open-review`, `pr-fix-verify` | `grill`, `uiux-imagine`, `implement`, `dreaming` |

`prototype` is model-invocable on purpose: `grill` calls it mid-interview, without
leaving the session, the moment a frontier question cannot be settled in prose.
`grill` itself is an interview — it only means something when a human starts it.
`uiux-imagine` is the same shape one stage later: it steers on a human's directional
reaction each round, and a human is the one who declares the direction done. `dreaming`
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

## Tests

Node unit tests across this whole repo (every plugin's `scripts/`) run under **one
command**, from the repo root:

```
node --test '*/scripts/*.test.mjs'
```

Node's own test runner, no test framework and no `package.json` — the glob is
what keeps the command stable as plugins add suites, and the leading `*` is what
keeps it out of `.claude/` worktrees. Today it covers the design-lint rules,
the two UI-loop comparators, the critic score check, and the direction
note's seven-section shape, all living in this plugin's `scripts/`; new
deterministic scripts get picked up by putting their tests next to them as
`<name>.test.mjs`.

Only the deterministic cores are unit-tested. The playwright shell
(`scripts/ui-measure.mjs`) is the browser boundary and has no unit tests on
purpose — mocking a browser would test the mock. The lint **hook**
(`scripts/design-lint-hook.mjs`) has no unit test either — it is verified by
actually writing an HTML file into a `design-preview/` directory and confirming
it reports; that is the falsifiable signal, not a mocked stdin payload.

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
├── .mcp.json                         # headless Playwright MCP — the design canvas's browser
├── hooks/hooks.json                  # PostToolUse → design-lint-hook.mjs
├── README.md (this file)
├── skills/
│   ├── grill/SKILL.md
│   ├── prototype/SKILL.md
│   ├── to-spec/SKILL.md
│   ├── uiux-imagine/SKILL.md         # the divergent half — variants in, one direction note out
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
│   ├── ui-compare.mjs                # the two deterministic comparators (measurement + pixel)
│   ├── ui-compare.test.mjs           # their unit tests — the red/green of visual correctness
│   ├── ui-measure.mjs                # playwright shell: one browser, two tabs, walks the matrix
│   ├── critic-score.mjs              # finding schema + the critic's score-vs-findings audit
│   ├── critic-score.test.mjs         # its unit tests — the score bands, row for row
│   ├── direction-note-check.mjs      # uiux-imagine's exit gate: the seven fixed sections
│   ├── direction-note-check.test.mjs # its unit tests — one per droppable section
│   ├── design-lint.mjs               # the deterministic anti-slop/brand rules
│   ├── design-lint.test.mjs          # their unit tests
│   └── design-lint-hook.mjs          # PostToolUse entry: lints design-preview/ HTML, exit 2 on P0/P1
└── references/
    ├── wiki-conventions.md           # the docs/ contract — directories, frontmatter, status enums
    ├── tdd.md                        # red→green loop, seams, mock boundary
    ├── ui-implementation-standard.md # UI tickets: canvas → component tree, per-stack notes, the verification loop
    ├── review-standards.md           # Standards axis: this repo's own principles + Fowler baseline
    ├── review-artifact-template.html # the PR triage page's approved shape
    └── design/                       # the design side (see below)
```

## The design side

Design used to be its own installable plugin. It isn't any more — every stage of it
consumed or produced an `idea-loop` artifact (a spec, a prototype, the freeze a ticket
reads, the instrument `implement` runs), so keeping it addressable across a plugin
boundary only bought two version numbers that could drift apart. It now lives here,
with **no alias, no compatibility shim, and no transitional double install**.

What came across:

| Piece | Where it lives now |
|---|---|
| The taste/craft references | `references/design/` |
| The two former design skills | `references/design/static-ui-protocol.md`, `references/design/motion-protocol.md` — demoted to on-demand protocols, same shape as the surface / module / component ones next to them |
| The `DESIGN.md` spec (fixed eight sections, three-tier law, "T1 is five to eight floors") | `references/design/design-md-format.md` |
| The lint hook + rules + their unit tests | `hooks/hooks.json`, `scripts/design-lint*.mjs` |
| The browser | `.mcp.json` (headless, isolated Playwright) |

One file there did not come across — `references/design/critic-rubric.md` is new. It is
what the design critic reads each round: the severity ladder anchored to an AD's action,
the score bands the worst finding caps, and the stop threshold, stated openly rather than
hidden. It holds because `scripts/critic-score.mjs` recomputes the allowed band from the
findings the critic just wrote and invalidates the round when the number does not follow.

Nothing in `references/design/` is an entry point. They are loaded on demand by whichever
step is running; the hook is the one piece that fires on its own, and only on a `Write`/`Edit`
whose path lands in `design-preview/` or `design-motion-preview/` HTML.

What retired outright, because its content was already relocated: the `design` entry skill,
the DESIGN.md-writing skill (→ the reference above), the port-verification skill
(→ `references/ui-implementation-standard.md`, which generalized it past React), and the
`wireframe-candidates` workflow (→ the structural-divergence audit `prototype` now runs).
