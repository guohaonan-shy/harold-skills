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
| `/idea-loop:uiux-refine` | Design · converge | Rebuilds the canvas from the direction note alone, converges it through a two-model critic/executor loop, then runs a subtraction pass and an AI-tells pass, and freezes on the human's signature |
| `/idea-loop:to-ticket` | Plan | Slices a spec into tracer-bullet vertical cuts with blocking edges; holds the design-freeze gate for UI work |
| `/idea-loop:implement` | Build | One ticket → one commit, in a context holding nothing but that ticket, TDD at the seams the spec already agreed |
| `/idea-loop:pr-review` | Review | Opens or reuses the PR, then runs up to two automatic rounds of Codex review → verify → fix → independent re-verify, one GitHub post per round; stops at mergeReady and waits for a merge order |
| `/idea-loop:dreaming` | Maintain | Reconciles every doc against `origin/main` — including `CLAUDE.md` — and proposes disposals the human approves before anything moves |

### The forward loop is not the maintenance sweep

`grill → to-spec → [uiux-imagine → uiux-refine] → to-ticket → implement →
pr-review` runs once per piece of work. **The bracket is the
whole design side, and it is conditional**: you walk those two stages only when
`to-spec` landed the spec at `等设计冻结` — i.e. the work touches UI. A spec that
landed at `在飞` goes straight from `to-spec` to `to-ticket`. `uiux-refine` is
what flips a bracketed spec back to `在飞`, which is the gate `to-ticket` reads.
`dreaming` is a **periodic batch reconciliation** over the whole
vault — weekly, or when specs pile up, or by hand. It is not the next step after
`implement`.

**No stage in the forward loop writes an ADR.** ADRs are produced only in Maintain,
which is also where a finished spec is deleted (the contract's invariant: never delete
a spec before its ADR exists). So a spec sitting in `docs/spec/` with its work already
merged is a **normal state**, not an oversight — it is waiting for the next sweep.

Which skills the model may invoke itself:

| Model-invocable | Human-invoked only (`disable-model-invocation`) |
|---|---|
| `prototype`, `to-spec`, `to-ticket`, `implement`, `pr-review` | `grill`, `uiux-imagine`, `uiux-refine`, `dreaming` |

`prototype` is model-invocable on purpose: `grill` calls it mid-interview, without
leaving the session, the moment a frontier question cannot be settled in prose.
`grill` itself is an interview — it only means something when a human starts it.
`uiux-imagine` is the same shape one stage later: it steers on a human's directional
reaction each round, and a human is the one who declares the direction done.
`uiux-refine` stops on a human at every exit it has — a direction-level finding, a
plateau, the sign-off — and wants a fresh window so it rebuilds from the direction
note instead of continuing the diverge session it cannot see. `dreaming` proposes
destructive disposals.

The execution three were human-only until the caller-dispatch model landed: `implement`
requires a context holding nothing but the one ticket, and `/clear` is a human action.
Dispatching a fresh agent satisfies that precondition too — more strictly, in fact — so the
lock came off. What the lock was protecting did not: the ticket must still be self-contained
(no file paths, no code snippets, behaviour not procedure), and `implement` must still **stop
and report** when a precondition turns out not to hold rather than guessing its way onward.
See `to-ticket` §6 for where each of the original two reasons now lives.

### The review loop

```text
/idea-loop:pr-review
```

It launches a local host `Workflow` script (`workflows/pr-review-loop.mjs`), not a GitHub Actions
job. Running `gh pr create` alone only opens a PR; it does not start a review. A caller may start it
instead of you, but the trigger is always an explicit request: no PR/push hook is wired.

One invocation runs **at most two rounds**, then stops so a human reads what happened. Each round:

| Step | Runs on |
|---|---|
| Open/reuse the PR, snapshot GitHub, build the review contract | Claude Sonnet 5 · xhigh |
| Correctness · written Standards · Spec, in parallel, plus the repo's own check commands | Codex `gpt-6-sol` (`review` / read-only `task`) |
| Reproduce, dedup, and decide *introduced or pre-existing* by rerunning at the merge-base | Claude Sonnet 5 · xhigh |
| Fix what this PR introduced, each with a regression test; backlog what it did not | Claude Sonnet 5 · xhigh |
| Independently verify each fix red → green with the finding's own instrument | Claude Sonnet 5 · xhigh, a separate agent |
| Publish one round post | `scripts/github-review.mjs`, run by a Sonnet 5 · low agent |

| Axis | Asks | Blocks a merge? |
|---|---|---|
| **Correctness** | Did this introduce/activate a supported-path defect? Codex's native review. | By proven impact |
| **Spec** | Does this satisfy the actual acceptance agreement and amendments? | By requirement/impact |
| **Standards** | Does this violate an applicable written project rule? No generic smells. | By explicit rule/impact |

Pre-existing problems never block: they get one line in the target repo's
`docs/quality-backlog.md` §线上问题 (a separate commit on the PR branch) and are listed in the round
post. The loop stops early when a round finds nothing introduced, when something needs a human
decision, or on any failure. It never approves or merges; mergeReady is a report, not an order.

Each finding is structured — consequence-first title, one-sentence impact (≤ 60 characters),
numbered repro steps, one fix, folded evidence, a closed-set instrument — and the helper refuses a
plan that breaks that shape or closes a fix without red → green evidence on the same instrument. The
round post is rendered from those fields in a fixed order. With `~/.idea-loop/github-apps.json`
configured, posts come from the repository's GitHub App instead of the gh login. See
`references/github-review.md` for the plan contract and `references/review-standards.md` for the
introduced-or-not rules and the verification standard. The design record is
[`docs/pr-review-loop.md`](./docs/pr-review-loop.md).

`scripts/github-review.mjs` uses authenticated `gh api` (official GitHub REST). It recovers every
round from the posts' markers, keeps finding IDs stable across rounds, detects a changed base/head,
and edits the same post on a retry instead of duplicating it. The mocked GitHub and host-workflow
tests run with the rest of the suite below. Real model quality and host Workflow execution require a
live CC run.

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
purpose — mocking a browser would test the mock. The CLI tails on
`critic-score.mjs` and `direction-note-check.mjs` are the same kind of thin
shell — argv, a file read, an exit code — and are verified by being run, not
by a spawned-process test. The lint **hook**
(`scripts/design-lint-hook.mjs`) has no unit test either — it is verified by
actually writing an HTML file into a `design-preview/` directory and confirming
it reports; that is the falsifiable signal, not a mocked stdin payload.

### Baseline eval

`prototype`, `uiux-imagine` and `uiux-refine` are the three skills whose rubric and
prompts are going to keep changing, so they get a pinned baseline — one real case
(Toeflair's practice-history surface, carrying a minimal `DESIGN.md` + `PRODUCT.md`),
run once and archived, re-run on every change to a rubric, a prompt, or a `SKILL.md`:

```
node idea-loop/evals/run-baseline.mjs
```

This is a **deliberate exception** to the repo-wide "subjective output skips
quantitative eval" convention — stated as such in the root `CLAUDE.md` §5 right next
to the convention itself, so the next reader doesn't take it for an oversight. The
reasoning, the case, and how to read a run live in
[`evals/README.md`](./evals/README.md).

The **whole loop's wiring check rides along as assertions in that baseline** rather
than as a one-off dry run: prototype landing in raw, a UI-touching spec landing at
`等设计冻结`, an unfrozen UI ticket getting ⛔, the freeze putting canvas + ledger in
the raw bucket and flipping the spec to `在飞`, and no cross-plugin skill invocation
anywhere in the repo. A dry run's conclusion dies with its session; an assertion
goes red three weeks later.

## Portability

Project rules and verification tools come from the current repository's REVIEW.md,
AGENTS.md and applicable documents/configuration. There is no inherited Toeflair/Fowler
baseline. Cross-plugin paths are threaded through as `pluginRoot`
(via `${CLAUDE_PLUGIN_ROOT}`, resolved in the dispatching SKILL.md —
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
│   ├── uiux-refine/SKILL.md          # the convergent half — direction note in, one frozen canvas out
│   ├── to-ticket/SKILL.md
│   ├── implement/SKILL.md
│   ├── pr-review/SKILL.md            # → workflows/pr-review-loop.mjs
│   └── dreaming/SKILL.md
├── workflows/
│   └── pr-review-loop.mjs            # open/reuse PR, then up to two review → fix → re-verify rounds
├── docs/
│   └── pr-review-loop.md             # design record of the review loop (+ its flowchart)
├── scripts/
│   ├── ui-compare.mjs                # the two deterministic comparators (measurement + pixel)
│   ├── ui-compare.test.mjs           # their unit tests — the red/green of visual correctness
│   ├── ui-measure.mjs                # playwright shell: one browser, two tabs, walks the matrix
│   ├── critic-score.mjs              # finding schema + the critic's score-vs-findings audit (+ the CLI uiux-refine calls each round)
│   ├── critic-score.test.mjs         # its unit tests — the score bands, row for row
│   ├── direction-note-check.mjs      # uiux-imagine's exit gate: the seven fixed sections
│   ├── direction-note-check.test.mjs # its unit tests — one per droppable section
│   ├── design-lint.mjs               # the deterministic anti-slop/brand rules
│   ├── design-lint.test.mjs          # their unit tests
│   ├── design-lint-hook.mjs          # PostToolUse entry: lints design-preview/ HTML, exit 2 on P0/P1
│   ├── github-review.mjs             # round posts: snapshot, finding-shape gate, rendering, GitHub App identity
│   ├── github-review.test.mjs        # shape gate, retries, round numbering, stale head, App token
│   └── review-workflows.test.mjs     # mocked host orchestration tests of the loop
├── evals/                            # the pinned baseline (see evals/README.md)
│   ├── evals.json                    # six cells: the three skills, the two seams around them, one static repo check
│   ├── assert.mjs                    # the assertions — shape only, no model, no taste
│   ├── run-baseline.mjs              # runs each cell in a clean copy of the case, then grades
│   ├── case/                         # Toeflair's practice-history surface + its staged starting states
│   └── baseline/                     # the archived run: benchmark.json + per-cell grading
└── references/
    ├── wiki-conventions.md           # the docs/ contract — directories, frontmatter, status enums
    ├── tdd.md                        # red→green loop, seams, mock boundary
    ├── ui-implementation-standard.md # UI tickets: canvas → component tree, per-stack notes, the verification loop
    ├── review-standards.md           # admission, introduced-or-pre-existing, verification standard, severity
    ├── review-entry.md               # round budget, who runs what, prerequisites, reporting
    ├── github-review.md              # round posts, finding fields, plan schema, App identity
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
