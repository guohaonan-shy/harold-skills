# design plugin

UI design for projects that run [idea-loop](../idea-loop/README.md): research how other products handle a UX
problem, diverge into directions, refine one canvas to a freeze, measure the implementation against the frozen
canvas cell by cell, and keep the design archive (`docs/design/prod/`) and the project's `DESIGN.md`.

It was split out of idea-loop in 0.2.0 because not every project designs UI: Claude Code can only switch a whole
plugin on or off, so a project without UI work carried seven skills, six agents, an MCP server and two hooks it never
used. design **depends on idea-loop** (`dependencies` in `plugin.json`): installing it installs idea-loop too.

## Install

```
/plugin marketplace add guohaonan-shy/harold-skills
/plugin install design@harold-skills
```

Run `/idea-loop:setup` in the target repo first; answer yes to "做不做 UI 设计" there so it adds the design archive's
ignore rule and LFS attributes.

## How idea-loop uses it

idea-loop calls this plugin only by name — `design:<skill>` through the Skill tool, `design:<agent>` through the
Agent tool. Every place in idea-loop that does (the issue session's design stage, `implement`'s UI tickets and design
changes, `pr-review`'s UI walkthrough and pre-merge archive, `dreaming`'s archive and `DESIGN.md` passes) first checks
that the call resolves; without this plugin it skips that step and says so in its report. A design agent that needs an
idea-loop file (the review standards, dreaming's proposal-table format) gets its absolute path from the idea-loop skill
that starts it, because `${CLAUDE_PLUGIN_ROOT}` only names this plugin.

## Skills

| Skill | Stage | Coverage |
|---|---|---|
| `/design:uiux-imagine` | Design · diverge | The skill runs the process; `design:uiux-imaginer` (latest Opus via the `opus` alias, effort high) does the work, one task at a time. It opens only the altitude that is still undecided and renders every round straight into a clickable comparison board with real motion, at the lowest fidelity that tells the variants apart. The skill shows each round in the built-in browser, sorts the human's reply into a task (steer / apply to the picked variant / park for refine / reopen the language), and proposes wrapping up once nothing directional is left; the human declares it. Wrap-up hands ONE direction note (seven sections, a composition list per chosen variant, each item marked human-chosen or model-filled) plus a handoff canvas to `uiux-refine` via `docs/design/tmp/<spec-slug>/imagine/` under the worktree root (`git rev-parse --show-toplevel`; local, not in git) — no critic, no scoring. The imaginer does not research: a UX question it can only guess at goes back as a suggested research question with its recommended answer; the human decides whether to run `uiux-research`. When the project has no `DESIGN.md`, the imaginer drafts the first one and the skill writes it only after the human confirms the wording |
| `/design:uiux-refine` | Design · converge | The skill runs the process; two plugin agents do the work. Each round `design:designer` (latest Opus via the `opus` alias, effort high) delivers the next canvas version (`v1`, `v2`, …) from the handoff canvas `uiux-imagine` leaves behind (or from the direction note alone when there is none), and the session has a fresh `design:ui-master` (latest Fable via the `fable` alias, effort high, Read-only — it never sees the canvas code) score it, holds back any finding that touches an item the human chose and asks the human instead, scores the round with `critic-score.mjs` and either sends the rest back to the designer or stops at a bottleneck (`瓶颈`), a direction problem or a pass; after the pass come motion and assets when the brief calls for them, a subtraction round, an AI-tells round and the pre-sign-off checks. Every stop is shown in the built-in browser. The designer does not research: a `pattern` finding it cannot settle becomes a "suggested research question", worked from its recommendation. Freezes (fully or partly) on the human's signature and writes interaction flows back into the spec; the design PR carries only the signed canvas, the freeze record and the flows, no `delta/`. After the freeze the canvas is the one design truth: when the human later accepts something that differs from it (accepting the implementation in review, accepting an implementer's way out of a stop, or changing their mind), the orchestrating session of that stage (`implement` before the PR opens, `pr-review` after) runs the shared `design-change-sync` skill (the steps are written once there, not in `uiux-refine`), which starts a `designer` on the task "design change" — it edits only the affected cells and hands back the next canvas version — and a fresh `ui-master` scores only those cells with the same `critic-score.mjs` and stop decision; once it passes, the session commits and pushes the canvas, adds one row to the freeze record's section "changes after the freeze", and sends an implementer after any ticket whose code now disagrees. The human does not review the redrawn cells separately |
| `/design:uiux-research` | Design · research | Run by the **human**, whenever they want to see how other products do something (no spec needed; model-invocable, so "look up how others do the leave-confirmation dialog" in plain conversation starts it). The skill turns the ask into one named question, picks the drop directory, and starts a fresh `design:uiux-researcher` (latest Opus via the `opus` alias, effort medium; tools: Refero's screens/flows, `curl`, writing files in the drop directory). The researcher downloads the reference screenshots and writes one `index.html` (relative paths only, opened through a static server in the built-in browser) — at the top the named question, a 「研究问题」 block with the human's own words and the context handed to the researcher, and what these products agree on; then per source a flow of screenshots (click to enlarge) with scene and design logic only; and last, after the final source, the questions the human must decide once all of that is read against our needs — checked by `scripts/research-check.mjs`; the caller only receives the page's path and one sentence, never Refero calls or whole screenshots. Files go to `docs/design/tmp/<spec-slug>/research/<question>/` (with a spec) or `docs/design/tmp/research/<question>/` (without), local and never in git. UX patterns, flows, usual page structure and copy tone only — never visual style. The orchestrator of `uiux-imagine` / `uiux-refine` calls it only when the human says to, and forwards conclusions to the executor only when the human says which, as text (never the pictures) |
| `design:design-archive`, `design:design-modeling`, `design:design-change-sync`, `design:ui-measure` | Shared | Model-invoked capabilities idea-loop's skills and agents call: the archive's structure, check, query and archive script; the `DESIGN.md` write standard; a design change after the freeze; implementation vs frozen canvas, cell by cell. |

## Baseline: `uiux-research`

`evals/uiux-research/` is this plugin's baseline, and it is deliberately not a pass/fail eval.
What the researcher's page should contain is still being settled with the human, so it asserts no content and gives no
score. It pins **six default prompts taken from real design sessions** (leave confirmation, resuming after a
pause, failure card or not, error-title tone, where a failed list item goes, pausing under a modal), each with one line
on what that research actually helped or did not help with last time, plus a minimal product context
(`DESIGN.md`, `PRODUCT.md`). One command runs all or some of them; each page is left at a fixed place and each case has its
own `annotations.md` where the human records what is wrong with it. Annotations are kept, and they are what the page's
shape converges on over time.

```
node design/evals/uiux-research/run.mjs --list                  # cases and prompts
node design/evals/uiux-research/run.mjs --only leave-confirm    # one case
node design/evals/uiux-research/run.mjs                         # all six (calls Refero for real — run it at night)
```

Output lands in `/tmp/idea-loop-uiux-research/<case>/output/index.html`. Details: `evals/uiux-research/README.md`.


## The design side

weaker model and the same baseline went from freezing to three rounds in a row stuck at a bottleneck (瓶颈) — splitting
the roles fixed the structure, not the model. The critic (`ui-master`, `fable`) and the executor
(`designer`, `opus`) run on different models so they don't share one blind spot. The definitions use
aliases, so a new model arrives with a Claude Code upgrade; to pin a version for a while, override the
alias mapping with an environment variable (e.g. `ANTHROPIC_DEFAULT_OPUS_MODEL`) instead of editing the
definition.

What came across:

| Piece | Where it lives now |
|---|---|
| The taste/craft references | `skills/uiux-refine/references/design/` |
| The two former design skills | `skills/uiux-refine/references/design/static-ui-protocol.md`, `skills/uiux-refine/references/design/motion-protocol.md` — demoted to on-demand protocols, same shape as the surface / module / component ones next to them |
| The `DESIGN.md` spec | Format: the official `@google/design.md` spec, read at run time (`npx -y @google/design.md@latest spec`). What may enter, how to write it, how a write goes, the candidate format, who may write: `skills/design-modeling/SKILL.md` |
| The lint hook + rules + their unit tests | `hooks/hooks.json`, `scripts/design-lint*.mjs` (and `design-md-hook.mjs` for `DESIGN.md`) |
| The browser | user-level `playwright` MCP (headless, isolated), checked by `setup`; how to use it: `../idea-loop/skills/engineering/browser/SKILL.md` |
| The design archive's lookups | `.mcp.json` (`design-archive`, `scripts/design-archive-mcp.mjs`) |
| Design research | user-level `refero` MCP (the human adds it with their own token), checked by `setup` |

The design critic (`agents/ui-master.md`) has no separate rubric: it judges the gap to what a top
studio would ship, lists the biggest gaps first (each routed by `kind`: direction / pattern / craft)
and scores 1–10, 9 and up meaning the studio would ship it as-is. `scripts/critic-score.mjs` checks
the shape and turns the round into a stop decision (direction, pass, a three-round plateau, or continue).

Nothing in `skills/uiux-refine/references/design/` is an entry point. They are loaded on demand by whichever
step is running; the hooks are the only pieces that fire on their own. One fires only on a
`Write`/`Edit` whose path lands in a canvas HTML — `docs/design/tmp/<spec-slug>/canvas/*.html`, or the legacy
`design-preview/` / `design-motion-preview/` scratch dirs; the other only on a write to a file named
`DESIGN.md`, where it runs the official `@google/design.md` lint at `@latest` and hands any error
back to the model. There is no pre-merge hook: the design archive is a step of `pr-review`'s merge flow
(`../idea-loop/skills/engineering/pr-review/references/merge.md`). The known gap is that clicking merge on the web, or merging from a session
other than the issue session, skips the archive; the weekly `dreaming` backstops it, so merges go through the issue session.

What retired outright, because its content was already relocated: the `design` entry skill,
the port-verification skill
(→ `../idea-loop/skills/engineering/implement/references/ui-tickets.md` and the `ui-measure` skill, which generalized it past React), and the
`wireframe-candidates` workflow (its structural-divergence audit moved into `prototype`, which was later removed too).

## Architecture

```
design/
├── .claude-plugin/plugin.json        # depends on idea-loop
├── .mcp.json                         # design-archive: read-only lookups of the design archive (scripts/design-archive-mcp.mjs)
├── hooks/hooks.json                  # PostToolUse(Write|Edit) → design-lint-hook.mjs, design-md-hook.mjs
├── agents/
│   ├── uiux-imaginer.md              # uiux-imagine's executor (design:uiux-imaginer) — `opus` alias, effort high, one per imagine run
│   ├── designer.md                   # uiux-refine's executor (design:designer) — `opus` alias, effort high, one per refine run; after the freeze one fresh per "design change" (the only editor of the frozen canvas)
│   ├── uiux-researcher.md            # uiux-research's executor (design:uiux-researcher) — `opus` alias, effort medium, one per research, Refero screens/flows + curl + file writes only
│   ├── ui-master.md                  # uiux-refine's critic (design:ui-master) — `fable` alias, effort high, Read-only, a fresh one per round, started by the refine session
│   ├── ui-reviewer.md                # the design archive's UI reviewer (design:ui-reviewer) — `sonnet` alias, effort high; pr-review starts it in walkthrough mode once per round, in the same message as the pr-reviewer, when tmp/ holds design output for this spec (`research/` never counts) — the state list and entry paths come from the frozen canvas and freeze record (plus the rows under "changes after freeze"; a need with only the implementer's minimal `delta/` keeps `delta/` as its list) — and once more in archive mode before merge to write the whole `delta/` and the archive draft, dreaming starts it in reconcile mode — a source-wave pass over the archive objects (no browser, first batch only) and then a re-drive of a group of prod/ states — and in archive mode for a 补归档 row
│   └── design-steward.md             # dreaming's keeper of DESIGN.md (design:design-steward) — `opus` alias, effort high, read-only, returns the `候选` and `DESIGN.md 条目` rows; the only source of proposed DESIGN.md changes
├── skills/
│   ├── design-modeling/SKILL.md  # shared, model-invoked — the DESIGN.md write standard: what each chapter holds, the admission table, one write's path, the candidate format, who writes
│   │   references/chapters.md, new.md, distill.md, reconcile.md  # each chapter; creating, distilling, reconciling DESIGN.md
│   ├── uiux-imagine/SKILL.md     # the divergent half — the process; the work is in agents/uiux-imaginer.md
│   │   references/imagine-canvas.md  # the board, cloning variants from a shipped UI, the handoff canvas, cleanup
│   │   references/direction-note.md  # the letter to refine: seven sections, composition list, provenance markers
│   ├── uiux-refine/SKILL.md      # the convergent half — the process; the work is in agents/
│   │   references/design/                # the design side (see below)
│   │   references/refine-canvas.md   # where the refine canvas lives and how its versions (v1, v2, …) advance
│   │   references/freeze.md, motion-stage.md, asset-stage.md, pinned-findings.md  # read only on their branch: sign-off, motion, marketing assets, a pinned finding
│   ├── uiux-research/SKILL.md    # human-run design research — only the calling mechanism; the work is in agents/uiux-researcher.md
│   │   references/research-backend.md
│   ├── design-archive/SKILL.md   # shared, model-invoked — the design archive (docs/design/prod): the graph's entities and how they relate (page, state, edge, section, component, motion, journey; sources vs derived), directories and naming, the way-in derivation, and a read-on-demand table pointing at the references
│   │   references/writing.md, check.md, query.md, archive-script.md, shooting.md  # writing an object file (frontmatter shapes and required fields, section ids and locating, body, modeling choices, screenshot matrix); the seven validation rules with command and exit codes; the seven query entries' command, exit codes and return shapes; the archive script; shooting the archive screenshots (single screen, long page by section, in-section states, scroll-driven sections)
│   ├── design-change-sync/SKILL.md    # shared, model-invoked — a design change after the freeze, called by `implement` and `pr-review` sessions: the designer edits only the affected cells of the canvas, a fresh ui-master scores only those cells (same `critic-score.mjs`), then commit, push and one row in the freeze record's "changes after the freeze"
│   └── ui-measure/SKILL.md       # shared, model-invoked — implementation vs frozen canvas, cell by cell: the three environment rules (for the UI implementation loop only — the design archive's shots stop the page time instead), default tolerances, the matrix, when to stop
├── evals/uiux-research/              # the baseline (above)
├── docs/design-modeling.md           # design record of the first design-modeling skill — history
└── scripts/
    ├── ui-compare.mjs                # the two deterministic comparators (measurement + pixel)
    ├── ui-compare.test.mjs           # their unit tests — the red/green of visual correctness
    ├── ui-measure.mjs                # playwright shell: one browser, two tabs, walks the matrix
    ├── critic-score.mjs              # the critic's output shape and the stop decision: direction / pass / plateau / continue (+ the CLI uiux-refine calls each round)
    ├── critic-score.test.mjs         # its unit tests
    ├── design-archive.mjs            # the design archive parsed: every object, edge and reference under docs/design/prod/ (optionally with a requirement's delta/ laid over it) — the layer queries, MCP and archiving reuse
    ├── design-archive-check.mjs      # the archive's seven validation rules (reachability, async, references, journeys, decisions/candidates, motions/usedBy, sections of a long entry state), file and field named; structure also covers an edge's `when`, a `{ text }` locate and the workspace prefixes of component names (`prod/index.md` `workspaces`, or `--workspaces`); hints for `content` / `position` sections; exit 0/1
    ├── design-archive-check.test.mjs # one red fixture per rule (rule 7 on the marketing fixture: nine bends, two hints) + `when` / text locate / workspace prefixes + the delta overlay + the old-layout note
    ├── archive-check-flag.test.mjs  # tripwire: every doc line that runs design-archive-check over a --delta also passes --no-used-by
    ├── design-archive-query.mjs      # the archive's seven read entries (page, state, journey, requirement diff, reverse lookup, keyword, affected states since a commit) + the way-in derivation, as a module and a JSON command line; reads prod/ or prod/ with a requirement's delta/ laid over it; page lists a long page's sections, reverse lookup takes `<page>#<section>` and `#<type>`; every edge view carries `fromSection` / `toSection` and `when`
    ├── design-archive-query.test.mjs # their unit tests on the shared fixture + a requirement's delta/, and the command line's exit codes
    ├── design-archive-mcp.mjs        # the archive's MCP server (stdio, hand-written JSON-RPC, zero deps): the seven query entries as seven read-only tools, repo root = git top level of the session's cwd; started by .mcp.json
    ├── design-archive-mcp.test.mjs   # spawns it over stdio: initialize / tools/list, tools/call equals the command line on the shared fixture, error results, .mcp.json
    ├── design-archive-fixture.mjs    # a fictional two-page archive shared by the archive tests, plus `marketingFiles()` (the same with a long page of five sections) (not a test file)
    ├── design-archive-sections.mjs   # a long entry state's shooting: `time` prints the code that starts the page's time (page clock and CSS animation timeline stopped at a fixed start, page reloaded, a fixed run of steps; run once after navigating to the entry, before any interaction), `step <ms>` prints the code that moves the page time on (the clock and every running animation together), `measure` prints the Playwright code (starts the page time itself if `time` was not run, find what scrolls — the document, or the biggest inner scroll container of an app shell —, scroll it through in fixed steps, locate sections by the accessibility tree, full accessible names), `attribute` turns a measurement into section ranges / which section each clickable belongs to / orphans / hidden / unlocated / overlapping sections / scroll-driven sections (a section that holds a pinned screen while the page scrolls under it, or a pinned column smaller than a screen whose text changes with the scroll; exit 1 on any of those, and on a scroll-driven one whose `scrollDriven: true` is not declared), `shoot` prints the code that shoots each section by itself (page time not moved, so the same picture however long the agent waits; each shot is taken twice 500 ms apart and flagged `uncontrolled` with the box that differs when something the page time cannot hold moves in it; a section inside an inner scroll container is shot a screen at a time and stitched; a declared scroll-driven section is shot as the one pinned screen at its top, after the page time is put back and the page reloaded) into `<state>@<section>.png`, `screen` prints the same code for a state with no sections (a page not taller than the main viewport — a login page whose first screen carries a carousel): one section, the main viewport, `<state>.png`, no `measure` / `attribute` first; `pinned` prints the code that shoots the viewport as it stands (no scrolling, no stepping) for the later steps of a scroll-driven section, into `<state>.png`
    ├── design-archive-sections.test.mjs # hand-written measurements: ranges, orphans, hidden and fixed elements, overlaps, unlocated sections, the shots asked for, the command line
    ├── design-archive-sections-browser.test.mjs # the generated code run for real in Chromium (skipped when no Playwright + Chromium is found)
    ├── design-archive-sections-doc.test.mjs # tripwire: every doc line that runs the sections script names a real subcommand and only its own options
    ├── design-archive-skill-doc.test.mjs # tripwire: design-archive's SKILL.md body stays under 5000 characters, and every section title other skills and agents quote after `design:design-archive` is a heading of its SKILL.md or references/
    ├── design-archive-write.mjs      # the archive script — the only writer of docs/design/prod/: validate, fold delta/ in, drop removed.md, regenerate usedBy + index.md, move interaction figures and re-point the spec's links, say what LFS / .gitignore lack, empty tmp/<spec-slug>/; --dry-run writes nothing
    ├── design-archive-write.test.mjs # one requirement end to end, refuse-writes-nothing, dry-run, hints, and the pieces
    ├── mini-yaml.mjs                 # the dependency-free YAML subset the archive's frontmatter uses — a copy of idea-loop's, kept identical by idea-loop/scripts/plugin-split.test.mjs
    ├── research-check.mjs            # uiux-research's gate: the page's head (question / 研究问题 = human's words / context / conclusion = general), every source's flow + scene / logic, the decisions block after the last source, every screenshot clickable and a relative path that exists, the chapters in the fixed order with nothing after the decisions block (what a chapter holds is the contract's prose, not a check)
    ├── research-check.test.mjs       # one per rule, plus the CLI exit codes
    ├── research-baseline.test.mjs    # keeps the uiux-research baseline well-formed: six cases, each with a prompt, a comparison line and an annotation file; the runner's stream digest
    ├── direction-note-check.mjs      # uiux-imagine's exit gate: the seven fixed sections + each chosen variant's composition list
    ├── direction-note-check.test.mjs # its unit tests — one per droppable section / composition item
    ├── ui-png-compare.mjs            # two screenshots of one state under the pixel layer's own tolerance (archive picture vs fresh picture) — the reconcile mode's "within tolerance, do not re-shoot" test
    ├── ui-png-compare.test.mjs       # its unit tests, through the command line, on PNGs built in the test with every scanline filter
    ├── design-lint.mjs               # the deterministic anti-slop/brand rules
    ├── design-lint.test.mjs          # their unit tests
    ├── design-lint-hook.mjs          # PostToolUse entry: lints canvas HTML (docs/design/tmp/<spec-slug>/canvas/), exit 2 on P0/P1
    ├── design-lint-hook.test.mjs     # its tests — which paths it watches, spawned with a real payload
    ├── design-md-hook.mjs            # PostToolUse entry: official @google/design.md lint on any DESIGN.md, exit 2 on an error
    ├── design-md-hook.test.mjs       # its tests, against a fake CLI
    └── design-tmp-worktree-root-doc.test.mjs, design-change-final-version-doc.test.mjs, ui-reviewer-archive-doc.test.mjs  # doc tripwires moved with the skills they pin
```

## Tests

They run with the rest of the repository: `node --test '*/scripts/*.test.mjs'` from the repo root. They cover the
design-lint rules, the two UI-loop comparators, the critic score check, the direction note's seven-section shape, the
design archive (check, query, MCP server, sections, archive script) and doc tripwires for the skills they pin.

Only the deterministic cores are unit-tested. The playwright shell (`scripts/ui-measure.mjs`) is the browser boundary
and has no unit tests on purpose — mocking a browser would test the mock. The CLI tail on `critic-score.mjs` is a thin
shell verified by being run (`direction-note-check.mjs` also has spawned-process tests for the paths it is called
on). `scripts/design-lint-hook.mjs` is tested by spawning it with a real payload on real files, because what it must
get right is *which paths it watches* (only HTML directly in `docs/design/tmp/<spec-slug>/canvas/`).
`scripts/design-md-hook.mjs` shells out to an external CLI, so its tests swap in a fake CLI to pin the exit-code
contract (error blocks, warning passes, an unreachable CLI never blocks), and one real run against the official CLI
was the falsifiable check.
