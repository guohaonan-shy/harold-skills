# idea-loop plugin

> The domain glossary (`GLOSSARY.md`, `references/glossary.md`) adapts the `domain-modeling` design from
> [mattpocock/skills](https://github.com/mattpocock/skills) (MIT). What changed and why is listed at the end of that reference.

Closed loop from idea to shipped engineering, backed by the `docs/` Obsidian
vault as its knowledge base. No state machine — a file's existence IS its
status (see `references/wiki-conventions.md`).

## Skills

| Skill | Stage | Coverage |
|---|---|---|
| `/idea-loop:grill` | Idea | Design-tree interview in frontier rounds — facts are the agent's job, decisions are the human's |
| `/idea-loop:prototype` | Idea | Throwaway code that answers ONE question — a clickable single-file HTML state model, or structurally distinct gray-box variants; the artifact and the verdict both land in the raw bucket |
| `/idea-loop:to-spec` | Spec | Lands the conversation as a raw transcript + one spec readable by humans as well as agents: problems shown with the reproduction evidence `grill` captured, user stories as one tree per scenario, implementation decisions, a technical overview (backend and front-end-internal sequence diagrams, interaction flows), testing decisions and agreed seams. Figure rules: `references/spec-figures.md` |
| `/idea-loop:uiux-imagine` | Design · diverge | Opens only the altitude that is still undecided, renders every round straight into a clickable comparison page with real motion in the built-in browser, at the lowest fidelity that tells the variants apart, and hands ONE direction note (with a composition list per chosen variant) to `uiux-refine` via the worktree's `.tmp/` — no critic, no scoring, no fidelity bump |
| `/idea-loop:uiux-refine` | Design · converge | The skill is only the calling mechanism; the design work lives in two plugin agents. `idea-loop:designer` (latest Opus via the `opus` alias, effort high) rebuilds the canvas from the direction note alone and converges it through a critic/executor loop, judged each round by a fresh `idea-loop:ui-master` (latest Fable via the `fable` alias, effort high, Read-only — it never sees the canvas code), then a subtraction pass and an AI-tells pass; the calling session only orchestrates — shows each result in the built-in browser and relays the human's notes to the same designer. Freezes (fully or partly) on the human's signature and writes interaction flows back into the spec |
| `/idea-loop:design-modeling` | Design · law | The only writer of the project's `DESIGN.md`: creates it (measured from live UI, or from the language `uiux-imagine` chose), distills the candidates freeze records leave behind through a five-layer admission table, and reconciles it against code — every write waits on the human, every write is linted by the official `@google/design.md` CLI |
| `/idea-loop:to-ticket` | Plan | Slices a spec into tracer-bullet vertical cuts with blocking edges; holds the design-freeze gate for UI work |
| `/idea-loop:implement` | Build | Runs a whole spec: the calling session orchestrates, dispatching a fresh `idea-loop:implementer` per ticket along the `Blocked by` graph (one ticket → one commit on the integration branch, TDD at the agreed seams, human-verify flows and GIFs recorded from the implementation). Stops only for the human — a new bot thread on the draft PR per stop — and turns the PR ready once everything has landed |
| `/idea-loop:pr-review` | Review | One round per call on the open PR: an `idea-loop:pr-reviewer` runs the repo's own checks (changed lines only) and two read-only Codex processes — Spec and Standards — reproduces and draws every Spec finding, checks every quote mechanically, and opens the round's bot thread. The human rules in the thread; fixes go back through the tickets and the implementer. Never merges |
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
| `prototype`, `to-spec`, `design-modeling`, `to-ticket`, `implement`, `pr-review` | `grill`, `uiux-imagine`, `uiux-refine`, `dreaming` |

`prototype` is model-invocable on purpose: `grill` calls it mid-interview, without
leaving the session, the moment a frontier question cannot be settled in prose.
`grill` itself is an interview — it only means something when a human starts it.
`uiux-imagine` is the same shape one stage later: it steers on a human's directional
reaction each round, and a human is the one who declares the direction done.
`uiux-refine` stops on a human at every exit it has — a direction-level finding, a
plateau, the sign-off — and wants a fresh window so it rebuilds from the direction
note instead of continuing the diverge session it cannot see. `dreaming` proposes
destructive disposals.

`design-modeling` is model-invocable for the same reason `prototype` is: `uiux-imagine`
hands it the language it just chose without leaving the session, while the chosen roles and the
measured contrast are still in context. Being callable is not being unattended — it stops for
the human before every write to `DESIGN.md`.

The execution two were human-only until the caller-dispatch model landed: a ticket needs a
context holding nothing but itself, and `/clear` is a human action. Dispatching a fresh agent
satisfies that precondition too — more strictly, in fact — so `implement` became an orchestrator
that dispatches one `idea-loop:implementer` per ticket. What the lock was protecting did not come
off: the ticket must still be self-contained (no file paths, no code snippets, behaviour not
procedure), and the implementer must still **stop and report** when a behaviour is undecided
rather than guessing its way onward. See `to-ticket` §6 for where each of the original reasons
now lives.

### Delivery: implement → draft PR → review

```text
/idea-loop:implement <spec-slug>
```

One spec, one integration branch, one PR. The PR is written for one reader — the person deciding
whether it merges — and every time they open it they should see at once what they must decide and
what they must look at. Layout: `references/pr-description.md`.

| Phase | PR | Who talks | Where the human answers |
|---|---|---|---|
| Implementing | draft | `implement`'s orchestrator, as the project's bot | A **new review thread per stop**: decisions (two options + a recommendation) and delivery evidence (flows and GIFs recorded from the implementation, one checkbox each) |
| Review | open | `pr-review`'s reviewer, as the project's bot | A **new review thread per round**: Spec findings, each with a figure; Standards findings, each with the rule's text and the diff lines |

- **Ticket done = every acceptance box has evidence or names who takes it over** (a later ticket,
  or the PR's delivery check), the selected regressions and the full suite are green — then one
  commit carrying a `Ticket: <NN>-<slug>` trailer. Git is the ledger; nothing else counts tickets.
- **Stop vs defer.** A behaviour nobody decided stops that ticket (and what depends on it);
  everything else keeps going. A behaviour that is decided but cannot be proven inside this ticket
  is deferred to a named receiver; no receiver means it was undecided after all.
- **Bot identity.** With `~/.idea-loop/github-apps.json` configured, Claude's threads and replies
  come from the repository's GitHub App (Pull requests write, Contents read). Without it they come
  from the gh login and say up front that Claude posted them. The human answers as themselves;
  **resolving a thread is the human's sign-off**, never the bot's.
- **Delivery evidence never enters git.** It lives in one draft release per PR
  (`scripts/evidence.mjs`), visible to collaborators only, deleted when the PR merges
  (`references/evidence.md`). Knowledge-base images — spec figures, frozen canvases — stay in `docs/`.
- **Two axes, reported apart** (`references/review-standards.md`). The reviewer runs the repo's
  declared checks and keeps only diagnostics on changed lines (`scripts/changed-lines.mjs`); each
  Codex process sees only its own question. A Spec finding that cannot be reproduced and drawn,
  or a Standards finding whose rule text or code is not where it claims, is discarded by
  `scripts/review-check.mjs` and listed in one folded line.
- **Fixes go back through the tickets.** A finding the human marks "fix" becomes a new acceptance
  box on the ticket that introduced it (found by the quote, or by `git blame` → `Ticket:` trailer),
  and a fresh implementer does it. The next round is the human's call; merging is the human's order.

The old loop (up to two automatic rounds of three-axis review → fix → re-verify, one round post per
round, a mergeReady verdict) and its design record [`docs/pr-review-loop.md`](./docs/pr-review-loop.md)
are superseded; the record stays as history.

## Tests

Node unit tests across this whole repo (every plugin's `scripts/`) run under **one
command**, from the repo root:

```
node --test '*/scripts/*.test.mjs'
```

Node's own test runner, no test framework and no `package.json` — the glob is
what keeps the command stable as plugins add suites, and the leading `*` is what
keeps it out of `.claude/` worktrees. Today it covers the design-lint rules,
the two UI-loop comparators, the critic score check, the direction
note's seven-section shape, the glossary lint, the DESIGN.md lint hook (against a fake CLI, no
network), and a tripwire that keeps `skills/` and `references/` free of the source project's
names and examples, all living in this plugin's `scripts/`; new
deterministic scripts get picked up by putting their tests next to them as
`<name>.test.mjs`.

Only the deterministic cores are unit-tested. The playwright shell
(`scripts/ui-measure.mjs`) is the browser boundary and has no unit tests on
purpose — mocking a browser would test the mock. The CLI tails on
`critic-score.mjs`, `direction-note-check.mjs` and `glossary-check.mjs` are the same kind of thin
shell — argv, a file read, an exit code — and are verified by being run, not
by a spawned-process test. The lint **hooks**
(`scripts/design-lint-hook.mjs`, `scripts/glossary-check-hook.mjs`) have no unit tests either — they are verified by
actually writing an HTML file into a `docs/design/<spec-slug>/` directory (or a broken
`GLOSSARY.md` anywhere) and confirming it reports; that is the falsifiable signal, not a mocked stdin payload.
`scripts/design-md-hook.mjs` is the exception: its whole job is shelling out to an external CLI, so
its tests swap in a fake CLI to pin the exit-code contract (error blocks, warning passes, an
unreachable CLI never blocks), and one real run against the official CLI was the falsifiable check.

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
`等设计冻结`, an unfrozen UI ticket getting ⛔, the freeze landing canvas + ledger in
`docs/design/<spec-slug>/` and flipping the spec to `在飞`, and no cross-plugin skill invocation
anywhere in the repo. A dry run's conclusion dies with its session; an assertion
goes red three weeks later.

## Portability

Project rules and verification tools come from the current repository's REVIEW.md,
AGENTS.md and applicable documents/configuration. There is no inherited Toeflair/Fowler
baseline. Plugin paths go through `${CLAUDE_PLUGIN_ROOT}` rather than being hardcoded,
so this plugin should survive being copied to another project or machine as-is. The
`openai-codex` companion script is found the same way: walk up from `${CLAUDE_PLUGIN_ROOT}`
to the plugins root and look under either the marketplace clone or the versioned cache.
There is no fallback for it on purpose — a hardcoded default is what made this unportable,
and a review that silently points at a nonexistent script is worse than one that refuses
to start.

## Architecture

```
idea-loop/
├── .claude-plugin/plugin.json
├── .mcp.json                         # headless Playwright MCP — the design canvas's browser
├── hooks/hooks.json                  # PostToolUse → design-lint-hook.mjs + design-md-hook.mjs + glossary-check-hook.mjs
├── agents/
│   ├── designer.md                   # uiux-refine's executor (idea-loop:designer) — `opus` alias, effort high, one per refine run
│   ├── ui-master.md                  # its critic (idea-loop:ui-master) — `fable` alias, effort high, Read-only, a fresh one per round
│   ├── implementer.md                # implement's executor (idea-loop:implementer) — `opus` alias, effort high, one per ticket
│   └── pr-reviewer.md                # pr-review's reviewer (idea-loop:pr-reviewer) — `sonnet` alias, effort xhigh, one per round
├── README.md (this file)
├── skills/
│   ├── grill/SKILL.md
│   ├── prototype/SKILL.md
│   ├── to-spec/SKILL.md
│   ├── uiux-imagine/SKILL.md         # the divergent half — variants in, one direction note out
│   ├── uiux-refine/SKILL.md          # the convergent half — only the calling mechanism; the work is in agents/
│   ├── design-modeling/SKILL.md      # the only writer of the project's DESIGN.md — create / distill / reconcile
│   ├── to-ticket/SKILL.md
│   ├── implement/SKILL.md            # orchestrates a spec's tickets — the work is in agents/implementer.md
│   ├── pr-review/SKILL.md            # one two-axis round per call — the work is in agents/pr-reviewer.md
│   └── dreaming/SKILL.md
├── docs/
│   ├── pr-review-loop.md             # design record of the previous review loop — superseded, kept as history
│   └── design-modeling.md            # design record of design-modeling
├── scripts/
│   ├── ui-compare.mjs                # the two deterministic comparators (measurement + pixel)
│   ├── ui-compare.test.mjs           # their unit tests — the red/green of visual correctness
│   ├── ui-measure.mjs                # playwright shell: one browser, two tabs, walks the matrix
│   ├── critic-score.mjs              # finding schema + the critic's score-vs-findings audit (+ the CLI uiux-refine calls each round)
│   ├── critic-score.test.mjs         # its unit tests — the score bands, row for row
│   ├── direction-note-check.mjs      # uiux-imagine's exit gate: the seven fixed sections + each chosen variant's composition list
│   ├── direction-note-check.test.mjs # its unit tests — one per droppable section / composition item
│   ├── flow-compose.mjs              # interaction flow figures: screenshots + arrows + red rings → one PNG (spec §1 / §5.3)
│   ├── flow-compose.test.mjs         # its unit tests — the flow schema and the layout
│   ├── design-lint.mjs               # the deterministic anti-slop/brand rules
│   ├── design-lint.test.mjs          # their unit tests
│   ├── design-lint-hook.mjs          # PostToolUse entry: lints canvas HTML (docs/design/<spec-slug>/), exit 2 on P0/P1
│   ├── design-md-hook.mjs            # PostToolUse entry: official @google/design.md lint on any DESIGN.md, exit 2 on an error
│   ├── design-md-hook.test.mjs       # its tests, against a fake CLI
│   ├── no-project-leak.test.mjs      # tripwire: skills/ and references/ carry no source-project names or examples
│   ├── glossary-check.mjs            # GLOSSARY.md format lint — single-file, zero-dep, so target-repo CI can curl it pinned
│   ├── glossary-check.test.mjs       # its unit tests — one per rule, plus a well-formed baseline
│   ├── glossary-check-hook.mjs       # PostToolUse entry: lints any file named GLOSSARY.md, exit 2 on a violation
│   ├── github-app.mjs                # the bot's identity: GitHub App installation token, else the gh login
│   ├── github-app.test.mjs           # config lookup, signed JWT, token exchange
│   ├── pr-thread.mjs                 # Claude's threads on a PR: one per stop / per review round; read, reply, list
│   ├── pr-thread.test.mjs            # marker, anchor choice, bot-vs-human, grouping
│   ├── pr-body.mjs                   # PR description by section: header / review / ledger, each writer owns its own
│   ├── pr-body.test.mjs              # fixed order, untouched neighbours, size limit
│   ├── evidence.mjs                  # delivery evidence: one draft release per PR, upload → URLs, cleanup on merge
│   ├── evidence.test.mjs             # owner-prefixed names, image types, size cap
│   ├── changed-lines.mjs             # keep only tool diagnostics on lines this PR changed
│   ├── changed-lines.test.mjs        # diff parsing, diagnostic formats, filtering
│   ├── review-check.mjs              # admission: quotes must exist, Standards code must be in the diff, Spec needs a figure
│   └── review-check.test.mjs         # one per discard reason
├── evals/                            # the pinned baseline (see evals/README.md)
│   ├── evals.json                    # six cells: the three skills, the two seams around them, one static repo check
│   ├── assert.mjs                    # the assertions — shape only, no model, no taste
│   ├── run-baseline.mjs              # runs each cell in a clean copy of the case, then grades
│   ├── case/                         # Toeflair's practice-history surface + its staged starting states
│   └── baseline/                     # the archived run: benchmark.json + per-cell grading
└── references/
    ├── wiki-conventions.md           # the docs/ contract — directories, frontmatter, status enums
    ├── glossary.md                   # GLOSSARY.md: what goes in, format, who writes (grill; dreaming corrects with approval), who reads, CI snippet
    ├── tdd.md                        # red→green loop, seams, mock boundary
    ├── ui-implementation-standard.md # UI tickets: canvas → component tree, per-stack notes, the verification loop
    ├── review-standards.md           # the two review axes: inputs, what counts, reproduce-and-draw, mechanical admission
    ├── pr-description.md             # the PR page: description sections, bot threads per stop / per round, who writes what
    ├── evidence.md                   # delivery evidence: flows, GIFs, side-by-sides from the implementation; never in git
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
| The `DESIGN.md` spec | Format: the official `@google/design.md` spec, read at run time (`npx -y @google/design.md@latest spec`). What may enter, content rules, candidate format: `skills/design-modeling/SKILL.md` |
| The lint hook + rules + their unit tests | `hooks/hooks.json`, `scripts/design-lint*.mjs` |
| The browser | `.mcp.json` (headless, isolated Playwright) |

One file there did not come across — `references/design/critic-rubric.md` is new. It is
what the design critic reads each round: the severity ladder anchored to an AD's action,
the score bands the worst finding caps, and the stop threshold, stated openly rather than
hidden. It holds because `scripts/critic-score.mjs` recomputes the allowed band from the
findings the critic just wrote and invalidates the round when the number does not follow.

Nothing in `references/design/` is an entry point. They are loaded on demand by whichever
step is running; the hooks are the only pieces that fire on their own. One fires only on a
`Write`/`Edit` whose path lands in a canvas HTML — `docs/design/<spec-slug>/*.html`, or the legacy
`design-preview/` / `design-motion-preview/` scratch dirs; the other only on a write to a file named
`DESIGN.md`, where it runs the official `@google/design.md` lint at `@latest` and hands any error
back to the model.

What retired outright, because its content was already relocated: the `design` entry skill,
the DESIGN.md-writing skill (its job is now `design-modeling`'s), the port-verification skill
(→ `references/ui-implementation-standard.md`, which generalized it past React), and the
`wireframe-candidates` workflow (→ the structural-divergence audit `prototype` now runs).
