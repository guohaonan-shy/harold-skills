# idea-loop plugin

> The domain glossary (`GLOSSARY.md`, `references/glossary.md`) adapts the `domain-modeling` design from
> [mattpocock/skills](https://github.com/mattpocock/skills) (MIT). What changed and why is listed at the end of that reference.

Closed loop from idea to shipped engineering, backed by the `docs/` Obsidian
vault as its knowledge base. Each spec lives in its own directory,
`docs/spec/<slug>/<slug>.md`, with its tickets under `docs/spec/<slug>/tickets/`;
the directory's existence says the spec is not settled yet, and its frontmatter
`status` says how far it got (see `references/wiki-conventions.md`).

## Skills

| Skill | Stage | Coverage |
|---|---|---|
| `/idea-loop:issue-dispatch` | Intake | One dispatch round over the project's GitHub issues, run hourly by a fixed dispatcher session under `/loop`: archives review sessions whose PR merged and closes the issues their spec covered, counts sessions in review (cap 5), opens a review session per draft spec, and only with a free slot hands the oldest open issues to `idea-loop:issue-explorer` to draft new specs. The one label it owns is the issue's `status:*`, which mirrors the covering spec's status (`references/spec-status.md` §3) |
| `/idea-loop:grill` | Idea | Design-tree interview in frontier rounds — facts are the agent's job, decisions are the human's |
| `/idea-loop:prototype` | Idea | Throwaway code that answers ONE question — a clickable single-file HTML state model, or structurally distinct gray-box variants; the artifact and the verdict both land in the raw bucket |
| `/idea-loop:to-spec` | Spec | Two modes. From a `grill`: lands the conversation as a raw transcript + one spec readable by humans as well as agents: problems shown with the reproduction evidence `grill` captured, user stories as one tree per scenario, implementation decisions, a technical overview (backend and front-end-internal sequence diagrams, interaction flows), testing decisions and agreed seams. From the backlog (`skills/to-spec/references/backlog-mode.md`): reproduces one module's backlog entries — or a batch of GitHub issues — first, splits them (design work, feature-sized work and groups over five each get their own spec), and lands drafts with one expected behaviour per problem. Both modes settle in the spec what the written rules can settle (section 4 keeps only the real forks, written with a concrete example per option), give every statement about the present state a source, list neighbouring in-flight specs and issues, and give every "suggest closing" entry a phenomenon, present-state evidence and how it was checked (`references/decision-rules.md`). Both modes mark the backlog entries they cover as handed over. Figure rules: `references/spec-figures.md` |
| `/idea-loop:uiux-imagine` | Design · diverge | Opens only the altitude that is still undecided, renders every round straight into a clickable comparison page with real motion in the built-in browser, at the lowest fidelity that tells the variants apart, and hands ONE direction note (with a composition list per chosen variant) to `uiux-refine` via the worktree's `.tmp/` — no critic, no scoring, no fidelity bump |
| `/idea-loop:uiux-refine` | Design · converge | The skill is only the calling mechanism; the design work lives in two plugin agents. `idea-loop:designer` (latest Opus via the `opus` alias, effort high) rebuilds the canvas from the direction note alone and converges it through a critic/executor loop, judged each round by a fresh `idea-loop:ui-master` (latest Fable via the `fable` alias, effort high, Read-only — it never sees the canvas code), then a subtraction pass and an AI-tells pass; the calling session only orchestrates — shows each result in the built-in browser and relays the human's notes to the same designer. Freezes (fully or partly) on the human's signature and writes interaction flows back into the spec |
| `/idea-loop:design-modeling` | Design · law | The only writer of the project's `DESIGN.md`: creates it (measured from live UI, or from the language `uiux-imagine` chose), distills the candidates freeze records leave behind through a five-layer admission table, and reconciles it against code — every write waits on the human, every write is linted by the official `@google/design.md` CLI |
| `/idea-loop:to-ticket` | Plan | Slices a reviewed spec (design frozen if it touches UI, the human's explicit agreement in the session) into tracer-bullet vertical cuts with blocking edges, then flips it to `在飞` |
| `/idea-loop:implement` | Build | Runs a whole spec: the calling session orchestrates, dispatching fresh `idea-loop:implementer`s in parallel along the `Blocked by` frontier (up to three at once by default, each in its own worktree; an `idea-loop:explorer` writes shared pointer-only notes first; one ticket → one commit the orchestrator fast-forwards onto the integration branch, then reclaims the worktree; TDD at the agreed seams, human-verify flows and GIFs recorded from the implementation). Stops only for the human — a stop report shown in the session and kept in the PR's local review-loop file — and turns the PR ready once everything has landed |
| `/idea-loop:pr-review` | Review | One round per call on the open PR: an `idea-loop:pr-reviewer` runs the repo's own checks (changed lines only) and two read-only Codex processes — Spec and Standards — reproduces every behavioural Spec finding and shows it in whatever form is fastest to grasp, checks every quote and the wording mechanically, marks every finding with a disposition (by rule / the human decides, `references/decision-rules.md`), and writes the round's report, which the session shows the human and keeps in the review-loop file. Findings the written rules already settle are handled before the report is shown and listed first under "handled by rule"; the human can overturn any of them with one sentence. The rest the human rules on in the session; fixes go back through the tickets and the implementer; when a round had fixes, they have landed and fewer than two rounds have run, the session starts the next round itself. On the human's word to merge, the review loop is archived to the PR as comments, then the PR merges |
| `/idea-loop:dreaming` | Maintain | Reconciles every doc against `origin/main` — including `CLAUDE.md` — and proposes disposals the human approves before anything moves |

### The forward loop is not the maintenance sweep

`grill → to-spec → (human review) → [uiux-imagine → uiux-refine] → to-ticket → implement →
pr-review` runs once per piece of work. A spec's status walks
`草稿 → 审核中 → 设计中 → 在飞`: `to-spec`'s backlog mode lands `草稿`, a `grill`
spec lands `审核中`, and either way a human reads the whole spec before anything is
cut. **The bracket is the whole design side, and it is conditional**: when the spec
touches UI the human runs `uiux-imagine` on it once the review is done, and imagine's
first step flips it to `设计中`; otherwise it goes straight to `to-ticket`. Every status
change and every backlog hand-over mark goes through `scripts/spec-status.mjs`, which
checks the step's precondition before writing (`references/spec-status.md`). When the
backlog is GitHub issues, a spec lists the issues it covers in its frontmatter and
every status flip re-labels them `status:<status>` through `scripts/issues.mjs`, so the
issue list on GitHub always shows where each issue stands in the loop. The freeze leaves the spec at `设计中`
with a freeze summary in it — `to-ticket` is the only thing that flips a spec to
`在飞`, once the design is frozen, the human has agreed and the tickets are cut.
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
what they must look at. The description is written for a reader with no context (the work was delegated)
and reads top-down: one sentence; what changed, one block per page end to end (plus the backend
flow behind it) or per backend flow, each block carrying its before → after shot specially before
the PR opens (screenshots, GIFs or annotated screen flows for the front end, sequence diagrams for
the back end), the decisions implementers made there on their own and how it was verified; what the
human has to review, decide and prepare before going live; and a folded reference. No code lines,
variable names or paths outside that reference — `scripts/pr-body.mjs` refuses them. It never
carries review. Layout: `references/pr-description.md`.

**The review loop lives in the session, not on GitHub** (`references/review-loop.md`). Only one
person reads the reports and decides, and they are already in the Claude session (desktop or
phone), so every stop and every review round is shown there, with figures sent as files and a push
notification; the human replies there; the orchestrator handles the batch and answers in one reply.
The same words — report, the human's rulings verbatim, what was done — go into one local file per PR
(`.tmp/review-loop/<PR>.md`, `scripts/review-loop.mjs`), the loop's memory across compaction or a new
session. When the human says merge, each stop and round is posted to the PR as one plain comment
(figures uploaded and linked), then the PR merges and the file is deleted. No threads, no bot
waiting on GitHub. (Tried first: threads on the PR with a background watcher waking the session;
it worked, but carried one person's words from GitHub back into the session they were already in.)

| Phase | PR | Who talks | Where the human answers |
|---|---|---|---|
| Implementing | draft | `implement`'s orchestrator, in the session | A **stop report per stop**: decisions (two options + a recommendation) and delivery evidence (flows and GIFs recorded from the implementation, one checkbox each) |
| Review | open | `pr-review`'s orchestrator, in the session | A **report per round**, written for the person who decides: a one-line verdict, then **handled by rule** (what was done, on what basis, with a commit or issue link — overturn any with one sentence), then each Spec finding titled by its consequence, with the problem, the user impact, whatever evidence makes it fastest to grasp (screenshots, an annotated flow, a GIF, a sequence diagram, a small table, a worked example) and a decision with options and a recommendation; each Standards finding as rule / now / impact / suggestion; no variable names, file:line, commit hashes or section numbers in the body — code locations go in a folded block for the fixer |

- **Ticket done = every acceptance box has evidence or names who takes it over** (a later ticket,
  or the PR's delivery check), the selected regressions and the full suite are green — then one
  commit carrying a `Ticket: <NN>-<slug>` trailer. Git is the ledger; nothing else counts tickets.
- **Stop vs defer.** A behaviour nobody decided stops that ticket (and what depends on it);
  everything else keeps going. A behaviour that is decided but cannot be proven inside this ticket
  is deferred to a named receiver; no receiver means it was undecided after all.
- **Bot identity.** The archive comments posted at merge come from the repository's GitHub App
  when `~/.idea-loop/github-apps.json` configures one (Pull requests write, Contents read); otherwise
  from the gh login, saying up front that Claude posted them. Claude never speaks as the human.
- **Delivery evidence never enters the code branch or `docs/`.** It lives on one orphan branch per
  PR (`scripts/evidence.mjs`), never merged, deleted when the PR merges, and is embedded as
  `blob/<branch>/<file>?raw=true` so clicking an image opens it full size instead of downloading it
  (`references/evidence.md`). Knowledge-base images — spec figures, frozen canvases — stay in `docs/`.
- **Two axes, reported apart** (`references/review-standards.md`). The reviewer runs the repo's
  declared checks and keeps only diagnostics on changed lines (`scripts/changed-lines.mjs`); each
  Codex process sees only its own question. A behavioural Spec finding that cannot be reproduced
  and drawn, or a Standards finding whose rule text or code is not where it claims, is discarded by
  `scripts/review-check.mjs` and listed in one folded line; a finding that stands but is missing a
  part or speaks in code terms is sent back for rewording before the report is shown.
- **What the agents settle themselves, and what they ask** (`references/decision-rules.md`). A
  finding is settled by rule when it stands on one of three things — the text of a written rule, the
  human's own words already given in this spec or PR, an existing practice with a named instance
  — and `review-check.mjs` finds that text where it says it is. Standards violations under an
  unambiguous written rule are always "by rule · fix"; an existing problem outside the changed lines
  is reported only when it spoils this change's input or conclusion or turns CI red. The orchestrator
  acts before showing the report (fix through the tickets, sync a document, accept and note, restore,
  open an issue) and lists it first; an overturn is one more ruling, recorded verbatim, and the next
  round stops using that basis. Edge cases that lose nothing stay with the human in a PR (the cost
  rule only picks the recommendation there); naming, human-verification material, taxonomies,
  publishing, production data and merging are never automatic. "Into the backlog" now means opening
  an issue in the target repository. The same file's second half is what a question must have
  before it reaches the human, and it is what `to-spec` (both modes) and `idea-loop:issue-explorer`
  follow when drafting: every statement about the present state has a source and a size, other
  entries to the same behaviour and neighbouring in-flight specs and issues have been checked
  (against the latest base branch), the deliverable is written before the ways of building it, and
  every question and option carries a concrete example. Section 4 of a drafted spec keeps what the
  rules can settle as decisions with their basis; only the choices whose basis does not hold are
  left as options, and every "suggest closing" entry says what was claimed, why it no longer holds,
  and how that was checked.
- **Fixes go back through the tickets.** A finding fixed — by rule or by the human's word — becomes a
  new acceptance box on the ticket that introduced it (found by the quote, or by `git blame` →
  `Ticket:` trailer), and a fresh implementer does it. **The next round starts itself** when
  this round had at least one fix, every item is handled and the fixes are pushed, and fewer than
  two rounds have run (it says so and sends a push notification first); with no fix it stops and
  waits for the word to merge, after two rounds it stops and says so. The cap binds only the
  automatic start — the human can ask for another round any time. Merging is the human's order.

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
than as a one-off dry run: prototype landing in raw, a `grill` spec landing at
`审核中`, `to-ticket` refusing a `设计中` spec whose design is not frozen, the freeze landing canvas + ledger in
`docs/design/<spec-slug>/` while leaving the spec at `设计中`, and no cross-plugin skill invocation
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
│   ├── implementer.md                # implement's executor (idea-loop:implementer) — `sonnet` alias, effort high, one per ticket, its own worktree
│   ├── issue-explorer.md             # issue-dispatch's drafter (idea-loop:issue-explorer) — `opus` alias, effort medium, at most one per round, reproduces and drafts a batch of issues
│   ├── explorer.md                   # implement's scout (idea-loop:explorer) — `haiku` alias, effort high, pointer-only shared notes before a parallel dispatch
│   └── pr-reviewer.md                # pr-review's reviewer (idea-loop:pr-reviewer) — `sonnet` alias, effort xhigh, one per round
├── README.md (this file)
├── skills/
│   ├── issue-dispatch/SKILL.md       # one dispatch round over GitHub issues — run by a fixed session under /loop
│   ├── grill/SKILL.md
│   ├── prototype/SKILL.md
│   ├── to-spec/SKILL.md              # + references/backlog-mode.md — drafting specs from backlog entries
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
│   ├── review-loop.mjs               # the PR's local review loop: next round, unsettled entries, archive to PR comments at merge (figures uploaded)
│   ├── review-loop.test.mjs          # entries and rulings, settled vs not, round numbering, archive once, figure links
│   ├── spec-status.mjs               # the only writer of a spec's status and the backlog hand-over marks — checks each step, re-indexes
│   ├── spec-status.test.mjs          # its unit tests — legal steps, refused steps, both backlog shapes
│   ├── issues.mjs                    # the only writer of an issue's status:* label — hand-over into spec frontmatter, sync, resolve
│   ├── issues.test.mjs               # its unit tests against a fake gh
│   ├── pr-body.mjs                   # PR description, four fixed sections (one sentence / what changed / your to-do / reference); no review, no code references outside reference
│   ├── pr-body.test.mjs              # fixed order, untouched neighbours, size limit
│   ├── evidence.mjs                  # delivery evidence: one orphan branch per PR, upload → image URLs that open full size, cleanup on merge
│   ├── evidence.test.mjs             # owner-prefixed names, image types, size cap
│   ├── browser-lock.mjs              # one lock for the session's MCP browser, so parallel implementers take turns
│   ├── browser-lock.test.mjs         # acquire / refuse / stale take-over / owner-only release
│   ├── changed-lines.mjs             # keep only tool diagnostics on lines this PR changed
│   ├── changed-lines.test.mjs        # diff parsing, diagnostic formats, filtering
│   ├── review-check.mjs              # admission: quotes must exist, Standards code must be in the diff, behavioural Spec needs evidence (figure, table or example); shape: fixed parts, no code references
│   └── review-check.test.mjs         # one per discard reason
├── evals/                            # the pinned baseline (see evals/README.md)
│   ├── evals.json                    # six cells: the three skills, the two seams around them, one static repo check
│   ├── assert.mjs                    # the assertions — shape only, no model, no taste
│   ├── run-baseline.mjs              # runs each cell in a clean copy of the case, then grades
│   ├── case/                         # Toeflair's practice-history surface + its staged starting states
│   └── baseline/                     # the archived run: benchmark.json + per-cell grading
└── references/
    ├── wiki-conventions.md           # the docs/ contract — directories, frontmatter, status enums
    ├── spec-status.md                # the spec state machine (who flips what, when), the backlog hand-over marks, and the issue status labels
    ├── glossary.md                   # GLOSSARY.md: what goes in, format, who writes (grill; dreaming corrects with approval), who reads, CI snippet
    ├── tdd.md                        # red→green loop, seams, mock boundary
    ├── ui-implementation-standard.md # UI tickets: canvas → component tree, per-stack notes, the verification loop
    ├── decision-rules.md             # what an agent settles by rule, and what a question needs before it goes to the human — read by the reviewer, pr-review's orchestrator, to-spec and issue-explorer
    ├── review-standards.md           # the two review axes: inputs, what counts, reproduce-and-draw, per-finding disposition, mechanical admission
    ├── pr-description.md             # the PR description's four sections, and how stop reports and review rounds are written
    ├── review-loop.md                # where reports live: the session + one local file per PR; replies; archive at merge
    ├── evidence.md                   # delivery evidence: flows, GIFs, side-by-sides from the implementation; never in git
    ├── worktree.md                   # an implementer's worktree: start point, preparation (the repo's command, else defaults), reclaim
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
