# idea-loop plugin

> The domain glossary (`GLOSSARY.md`, `skills/productivity/glossary/SKILL.md`) adapts the `domain-modeling` design from
> [mattpocock/skills](https://github.com/mattpocock/skills) (MIT).

Closed loop from idea to shipped engineering, backed by the `docs/` Obsidian
vault as its knowledge base. Each spec lives in its own directory,
`docs/spec/<slug>/<slug>.md`, with its tickets under `docs/spec/<slug>/tickets/`;
the directory's existence says the spec is not settled yet, and its frontmatter
`status` says how far it got (see `skills/productivity/wiki-conventions/SKILL.md`).

## Skills

| Skill | Stage | Coverage |
|---|---|---|
| `/idea-loop:setup` | Setup | Run once per target repo, by hand. Checks `gh`, `origin/HEAD`, Codex and Refero read-only, asks only what the repo does not already say, and writes the project files the other skills read: `DEVELOPMENT.md` (base branch, merge method, worktree preparation, dev server), `REVIEW.md` (verification commands), `CODING_STANDARDS.md` (skeleton; the rules are the project's), an `## idea-loop` block in `CLAUDE.md` / `AGENTS.md`, the `docs/` skeleton, local excludes and the `status:*` labels. A skill or agent that needs one of these files and finds none stops and asks for `/idea-loop:setup` |
| `/idea-loop:issue-dispatch` | Intake | One dispatch round, run by a fixed session under `/loop` with the issue states it owns as its argument (e.g. `/loop 1h /idea-loop:issue-dispatch 待验证 待设计 待实现`). Every round starts with `issues.mjs reconcile`, which reads the specs on main and moves issues into `待设计` / `待实现` or closes them (verified as not existing, or implemented). Then per state: `待验证` claims the oldest open issues with no label and opens a verification session (cap 3); `待设计` opens a design session per waiting spec (cap 2); `待实现` opens an implementation session (cap 5). The loop reads only the issue label; a `待` label is set only by reconcile, so main already holds what the next session needs. Each session archives itself when its PR has merged (`idea-loop:spec-status`, section issue 的状态) |
| `idea-loop:issue-verify` | Verify | The verification session's work: reproduces each issue (output kept in `.tmp/`, only the conclusion read back), records 存在 / 不存在 with evidence in the spec's 「验证」 table, groups issues by the change they share and drafts one spec per group through `to-spec`. Specs with nothing left for a human land on main through a docs-only PR at once; a spec with a 「需要 grill」 line or a 「待定」 fork turns its issues 审核中 and waits for the human to grill in the same session |
| `/idea-loop:grill` | Idea | Design-tree interview, one round of open questions at a time — facts are the agent's job, decisions are the human's |
| `/idea-loop:to-spec` | Spec | Turns the current context (a `grill` conversation, or a batch of issues `issue-verify` has already reproduced and grouped) into one spec readable by humans as well as agents: problems shown with their reproduction evidence, user stories as one tree per scenario (one expected behaviour per problem for pure fixes), implementation decisions, a technical overview (backend and front-end-internal sequence diagrams, interaction flows), testing decisions and agreed seams, and a 「验证」 table recording whether each covered issue exists. A conversation also lands as a raw transcript. Settles what the written rules can settle, gives every statement about the present state a source (`idea-loop:decision-rules`). A new spec is 草稿; `spec-status.mjs route` makes it 完成 (every issue absent), 审核中 (something waits for a human) or 正式; the spec then lands on main through a docs-only PR and the dispatcher's reconcile labels its issues (a spec that covers none gets an unlabelled spec issue from `issues.mjs open` first), as `ISSUE_TRACKER.md` says. Figure rules: `idea-loop:evidence` |
| `/idea-loop:uiux-imagine` | Design · diverge | The skill runs the process; `idea-loop:uiux-imaginer` (latest Opus via the `opus` alias, effort high) does the work, one task at a time. It opens only the altitude that is still undecided and renders every round straight into a clickable comparison board with real motion, at the lowest fidelity that tells the variants apart. The skill shows each round in the built-in browser, sorts the human's reply into a task (steer / apply to the picked variant / park for refine / reopen the language), and proposes wrapping up once nothing directional is left; the human declares it. Wrap-up hands ONE direction note (seven sections, a composition list per chosen variant, each item marked human-chosen or model-filled) plus a handoff canvas to `uiux-refine` via `docs/design/tmp/<spec-slug>/imagine/` (local, not in git) — no critic, no scoring. The imaginer does not research: a UX question it can only guess at goes back as a suggested research question with its recommended answer; the human decides whether to run `uiux-research`. When the project has no `DESIGN.md`, the imaginer drafts the first one and the skill writes it only after the human confirms the wording |
| `/idea-loop:uiux-refine` | Design · converge | The skill runs the process; two plugin agents do the work. Each round `idea-loop:designer` (latest Opus via the `opus` alias, effort high) delivers the next canvas version (`v1`, `v2`, …) from the handoff canvas `uiux-imagine` leaves behind (or from the direction note alone when there is none), and the session has a fresh `idea-loop:ui-master` (latest Fable via the `fable` alias, effort high, Read-only — it never sees the canvas code) score it, holds back any finding that touches an item the human chose and asks the human instead, scores the round with `critic-score.mjs` and either sends the rest back to the designer or stops at a bottleneck (`瓶颈`), a direction problem or a pass; after the pass come motion and assets when the brief calls for them, a subtraction round, an AI-tells round and the pre-sign-off checks. Every stop is shown in the built-in browser. The designer does not research: a `pattern` finding it cannot settle becomes a "suggested research question", worked from its recommendation. Freezes (fully or partly) on the human's signature and writes interaction flows back into the spec |
| `/idea-loop:uiux-research` | Design · research | Run by the **human**, whenever they want to see how other products do something (no spec needed; model-invocable, so "look up how others do the leave-confirmation dialog" in plain conversation starts it). The skill turns the ask into one named question, picks the drop directory, and starts a fresh `idea-loop:uiux-researcher` (latest Opus via the `opus` alias, effort medium; tools: Refero's screens/flows, `curl`, writing files in the drop directory). The researcher downloads the reference screenshots and writes one `index.html` (relative paths only, opened through a static server in the built-in browser) — at the top the named question, a 「研究问题」 block with the human's own words and the context handed to the researcher, and what these products agree on; then per source a flow of screenshots (click to enlarge) with scene and design logic only; and last, after the final source, the questions the human must decide once all of that is read against our needs — checked by `scripts/research-check.mjs`; the caller only receives the page's path and one sentence, never Refero calls or whole screenshots. Files go to `docs/design/tmp/<spec-slug>/research/<question>/` (with a spec) or `docs/design/tmp/research/<question>/` (without), local and never in git. UX patterns, flows, usual page structure and copy tone only — never visual style. The orchestrator of `uiux-imagine` / `uiux-refine` calls it only when the human says to, and forwards conclusions to the executor only when the human says which, as text (never the pictures) |
| `/idea-loop:to-ticket` | Plan | Slices a `正式` spec (design frozen if it touches UI) into tracer-bullet vertical cuts with blocking edges, then flips it to `实现中` |
| `/idea-loop:implement` | Build | Runs a whole spec: the calling session orchestrates, dispatching fresh `idea-loop:implementer`s in parallel along the `Blocked by` frontier (up to three at once by default, each in its own worktree; an `idea-loop:explorer` writes shared pointer-only notes first; one ticket → one commit the orchestrator fast-forwards onto the integration branch, then reclaims the worktree; TDD at the agreed seams, human-verify flows and GIFs recorded from the implementation). Stops only for the human — a stop report shown in the session and kept in the PR's local review-loop file: what the implementers already settled by the existing way of the product or by fixing a legacy problem that spoiled the ticket (listed first, the human overturns any with one sentence), then the decisions that really need a human — and turns the PR ready once everything has landed |
| `/idea-loop:pr-review` | Review | One round per call on the open PR: an `idea-loop:pr-reviewer` runs the repo's own checks (changed lines only) and two read-only Codex processes — Spec and Standards — reproduces every behavioural Spec finding and shows it in whatever form is fastest to grasp, checks every quote and the wording mechanically, marks every finding with a disposition (by rule / the human decides, `skills/productivity/decision-rules/SKILL.md`), and writes the round's report, which the session shows the human and keeps in the review-loop file. Findings the written rules already settle are handled before the report is shown and listed first under "handled by rule"; the human can overturn any of them with one sentence. The rest the human rules on in the session; fixes go back through the tickets and the implementer; when a round had fixes, they have landed and fewer than two rounds have run, the session starts the next round itself. When the local `docs/design/tmp/` holds design output for this spec (the `research/` folder `uiux-research` drops never counts as design output), an `idea-loop:ui-reviewer` first walks the implementation against the frozen design each round and its findings are merged into the Spec section. On the human's word to merge, a leftover `tmp/` with design output goes through the pre-merge archive (UI review of the delta → the human reads the draft → the archive script → commit and push), then the review loop is archived to the PR as comments, then the PR merges |
| `/idea-loop:dreaming` | Maintain | Two passes with the human between them. The **proposal pass** (nothing is written) reconciles every doc against `origin/<base branch>` (from `DEVELOPMENT.md`) — including `CLAUDE.md` — re-drives every state of the design archive (`docs/design/prod/`) in a dev environment through `idea-loop:ui-reviewer`'s reconcile mode (each state is judged consistent / archive stale / entry stale / product broken / unreachable; within tolerance nothing is re-shot; an empty archive gets a first draft from a whole-site initial scan, approved page by page), and also distills design-law candidates into `DESIGN.md` and audits `DESIGN.md` itself against the code, then stops at one proposal table (one row per object; closed set of dispositions per row type, checked by `scripts/proposal-table-check.mjs`; an empty table is a one-line push, not an Artifact). The `DESIGN.md` rows are put to the human as a review page, one card per row (`references/review-page.md`): a candidate card shows a screenshot of the UI the rule is about (from the design archive, else from the implementation), the exact rule text and the `DESIGN.md` section it lands in, and choices with their consequences and one recommendation; a maintenance card shows before → after and names the standard it rests on (a section of `skills/design/design-modeling/SKILL.md`, the official spec, or a lint rule name). The **execution pass** runs only the rows the human approved, and its result is one PR that touches only `docs/`, `DESIGN.md` and `GLOSSARY.md`. Writing `DESIGN.md` always waits for the human; a broken product is never written into the archive and, like a rule the code disobeys, becomes a drafted GitHub issue, opened only on approval. Manual runs may do just one part, or distill a single rule on the spot |

### The forward loop is not the maintenance sweep

`grill → to-spec → [uiux-imagine → uiux-refine] → to-ticket → implement →
pr-review` runs once per piece of work, and every stage lands on the main branch through its own PR
(a docs-only spec PR, a design PR, the implementation PR), so the next stage always starts from main.
Two state machines, each for one thing (`skills/engineering/spec-status/SKILL.md`). **The issue label
is the queue** and the only thing the loop reads: 待验证 (no label) → 验证中 → (审核中 →) 待设计 →
设计中 → 待实现 → 实现中 → closed, plus 搁置 to keep the loop away. **The spec status is the document's
maturity**, used inside idea-loop only: 草稿 → (审核中 →) 正式 → 实现中 → 完成. A spec is not held for a
human read-through: once nothing in it waits for a human (a `需要 grill` line, a `待定` fork) it is
正式 and goes straight on. The `待` labels are set only by `issues.mjs reconcile`, from the specs on
main, so a loop never opens a session on work main does not yet hold; the `中` labels are set when a
session opens. Every flip goes through `scripts/issues.mjs` or `scripts/spec-status.mjs`, which check
the precondition before writing. **The bracket is the whole design side, and it is conditional**: a spec
that touches UI waits in 待设计 until a design PR lands its freeze on main.
`dreaming` is a **batch reconciliation** over the whole vault: the docs, the design archive and
`DESIGN.md`. The human runs it by hand; when and whether to schedule it is up to them. It is not the
next step after `implement`.

**No stage in the forward loop writes an ADR.** ADRs are produced only in Maintain,
which is also where a finished spec is deleted (the contract's invariant: never delete
a spec before its ADR exists). So a spec sitting in `docs/spec/` with its work already
merged is a **normal state**, not an oversight — it is waiting for the next sweep.

Which skills the model may invoke itself:

| Model-invocable | Human-invoked only (`disable-model-invocation`) |
|---|---|
| `grill`, `issue-verify`, `to-spec`, `to-ticket`, `implement`, `pr-review`, `uiux-research`, `writing-for-agents` | `uiux-imagine`, `uiux-refine`, `dreaming`, `setup`, `agent-builder` |

`grill` is model-invocable so that "grill this idea" in an ordinary conversation starts it; it is still an
interview, so it only means something with a human answering. `uiux-imagine` is human-invoked: it steers on a human's directional
reaction each round, and a human is the one who declares the direction done.
`uiux-research` is model-invocable because looking up "how do others do this" is an ordinary thing to ask for in any conversation — but the *decision* to research stays with the human: inside imagine / refine the orchestrator calls it only when the human says to. `uiux-refine` stops on a human at every exit it has — a direction-level finding, a
a bottleneck (瓶颈), the sign-off — and wants a fresh window so it starts from the handoff canvas and
direction note instead of continuing the diverge session it cannot see. `dreaming` proposes
destructive disposals.

The project's `DESIGN.md` is written from exactly two places, `uiux-imagine` (only when the
project has none at the start) and `dreaming`; both read `skills/design/design-modeling/SKILL.md` and wait for the
human to confirm the wording before every write. Everything else on the design side — `designer`'s
motion sign-off, the Distill-back at the end of a freeze, an implementer meeting a value `DESIGN.md`
lacks — only writes a *design-law candidate* for `dreaming` to process.

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
carries review. Layout: `skills/engineering/pr/SKILL.md`.

**The review loop lives in the session, not on GitHub** (`skills/engineering/pr/SKILL.md`, section "review loop"). Only one
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
| Implementing | draft | `implement`'s orchestrator, in the session | A **stop report per stop**: first what was **handled by rule** (details the spec left open that the product already answers, legacy problems fixed because they spoiled the ticket's input or turned CI red, and unrelated legacy problems the implementer noticed, for which the orchestrator already opened an issue (no status label) — one line each with its basis; overturn any with one sentence, which the orchestrator writes into the ticket as the human's decision), then decisions (two options + a recommendation, written by `skills/productivity/decision-rules/SKILL.md` 的「交给人时」) and delivery evidence (flows and GIFs recorded from the implementation, one checkbox each) |
| Review | open | `pr-review`'s orchestrator, in the session | A **report per round**, written for the person who decides: a one-line verdict, then **handled by rule** (what was done, on what basis, with a commit or issue link — overturn any with one sentence), then each Spec finding titled by its consequence, with the problem, the user impact, whatever evidence makes it fastest to grasp (screenshots, an annotated flow, a GIF, a sequence diagram, a small table, a worked example) and a decision with options and a recommendation; each Standards finding as rule / now / impact / suggestion; no variable names, file:line, commit hashes or section numbers in the body — code locations go in a folded block for the fixer |

- **Ticket done = every acceptance box has evidence or names who takes it over** (a later ticket,
  or the PR's delivery check), the selected regressions and the full suite are green — then one
  commit carrying a `Ticket: <NN>-<slug>` trailer. Git is the ledger; nothing else counts tickets.
- **Stop vs defer.** A behaviour nobody decided stops that ticket (and what depends on it) — unless the
  product already has one way of doing it (name an existing instance): then the implementer follows it
  and says so in its hand-back; a legacy problem that spoils the ticket's input or turns CI red is
  fixed in this ticket and reported as such, while an unrelated one becomes an issue the orchestrator opens (the reviewer does not hunt for legacy problems) (`skills/productivity/decision-rules/SKILL.md` 的「自己定的四条」). Everything else keeps going. A behaviour that is decided but cannot be proven inside this ticket
  is deferred to a named receiver; no receiver means it was undecided after all.
- **Bot identity.** The archive comments posted at merge come from the repository's GitHub App
  when `~/.idea-loop/github-apps.json` configures one (Pull requests write, Contents read); otherwise
  from the gh login, saying up front that Claude posted them. Claude never speaks as the human.
- **Delivery evidence never enters the code branch or `docs/`.** It lives on one orphan branch per
  PR (`scripts/evidence.mjs`), never merged, deleted when the PR merges, and is embedded as
  `blob/<branch>/<file>?raw=true` so clicking an image opens it full size instead of downloading it
  (`skills/productivity/evidence/SKILL.md`). Knowledge-base images — spec figures, frozen canvases — stay in `docs/`.
- **Two axes, reported apart** (`skills/engineering/pr-review/references/review-standards.md`). The reviewer runs the repo's
  declared checks and keeps only diagnostics on changed lines (`scripts/changed-lines.mjs`); each
  Codex process sees only its own question. A behavioural Spec finding that cannot be reproduced
  and drawn, or a Standards finding whose rule text or code is not where it claims, is discarded by
  `scripts/review-check.mjs` and listed in one folded line; a finding that stands but is missing a
  part or speaks in code terms is sent back for rewording before the report is shown.
- **What the agents settle themselves, and what they ask** (`skills/productivity/decision-rules/SKILL.md`). A
  finding is settled by rule when it stands on one of three things — the text of a written rule, the
  human's own words already given in this spec or PR, an existing practice with a named instance
  — and `review-check.mjs` finds that text where it says it is. Standards violations under an
  unambiguous written rule are always "by rule · fix"; an existing problem outside the changed lines
  is reported only when it spoils this change's input or conclusion or turns CI red. The orchestrator
  acts before showing the report (fix through the tickets, sync a document, accept and note, restore,
  open an issue) and lists it first; an overturn is one more ruling, recorded verbatim, and the next
  round stops using that basis. Edge cases that lose nothing stay with the human in a PR (the cost
  rule only picks the recommendation there); naming, human-verification material, taxonomies,
  publishing, production data and merging a PR that changes code are never automatic (a docs-only
  spec or design PR is merged once its checks pass). "Into the backlog" now means opening
  an issue in the target repository. The same file's second half is what a question must have
  before it reaches the human, and it is what `to-spec` and `issue-verify`
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
network), and a tripwire that keeps `skills/` free of the source project's
names and examples, all living in this plugin's `scripts/`; new
deterministic scripts get picked up by putting their tests next to them as
`<name>.test.mjs`.

Only the deterministic cores are unit-tested. The playwright shell
(`scripts/ui-measure.mjs`) is the browser boundary and has no unit tests on
purpose — mocking a browser would test the mock. The CLI tails on
`critic-score.mjs` and `glossary-check.mjs` are the same kind of thin
shell — argv, a file read, an exit code — and are verified by being run, not
by a spawned-process test. (`direction-note-check.mjs` and `flow-compose.mjs` also have spawned-process
tests for the paths they are called on and the state-id file contract.) The glossary **hook**
(`scripts/glossary-check-hook.mjs`) has no unit test either — it is verified by
actually writing a broken `GLOSSARY.md` anywhere and confirming it reports; that is the falsifiable signal, not a mocked stdin payload.
`scripts/design-lint-hook.mjs` is tested by spawning it with a real payload on real files, because what it must get
right is *which paths it watches* (only HTML directly in `docs/design/tmp/<spec-slug>/canvas/`).
`scripts/design-md-hook.mjs` is the exception: its whole job is shelling out to an external CLI, so
its tests swap in a fake CLI to pin the exit-code contract (error blocks, warning passes, an
unreachable CLI never blocks), and one real run against the official CLI was the falsifiable check.

## Baseline: `uiux-research`

`evals/uiux-research/` is the plugin's only baseline, and it is deliberately not a pass/fail eval.
What the researcher's page should contain is still being settled with the human, so it asserts no content and gives no
score. It pins **six default prompts taken from real design sessions** (leave confirmation, resuming after a
pause, failure card or not, error-title tone, where a failed list item goes, pausing under a modal), each with one line
on what that research actually helped or did not help with last time, plus a minimal product context
(`DESIGN.md`, `PRODUCT.md`). One command runs all or some of them; each page is left at a fixed place and each case has its
own `annotations.md` where the human records what is wrong with it. Annotations are kept, and they are what the page's
shape converges on over time.

```
node idea-loop/evals/uiux-research/run.mjs --list                  # cases and prompts
node idea-loop/evals/uiux-research/run.mjs --only leave-confirm    # one case
node idea-loop/evals/uiux-research/run.mjs                         # all six (calls Refero for real — run it at night)
```

Output lands in `/tmp/idea-loop-uiux-research/<case>/output/index.html`. Details: `evals/uiux-research/README.md`.

## Portability

Project rules and verification tools come from the current repository's root files written by
`setup` — DEVELOPMENT.md, REVIEW.md, CODING_STANDARDS.md — plus AGENTS.md / CLAUDE.md and what they link to. There is no inherited Toeflair/Fowler
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
├── .mcp.json                         # one MCP server: design-archive (read-only lookups of the design archive). Playwright (headless, isolated) and Refero are configured at user level by the human; `setup` only checks them
├── hooks/hooks.json                  # PreToolUse(Bash) → merge-gate-hook.mjs; PostToolUse → design-lint-hook.mjs + design-md-hook.mjs + glossary-check-hook.mjs
├── agents/
│   ├── uiux-imaginer.md              # uiux-imagine's executor (idea-loop:uiux-imaginer) — `opus` alias, effort high, one per imagine run
│   ├── designer.md                   # uiux-refine's executor (idea-loop:designer) — `opus` alias, effort high, one per refine run
│   ├── uiux-researcher.md            # uiux-research's executor (idea-loop:uiux-researcher) — `opus` alias, effort medium, one per research, Refero screens/flows + curl + file writes only
│   ├── ui-master.md                  # uiux-refine's critic (idea-loop:ui-master) — `fable` alias, effort high, Read-only, a fresh one per round, started by the refine session
│   ├── implementer.md                # implement's executor (idea-loop:implementer) — `sonnet` alias, effort high, one per ticket, its own worktree
│   ├── ui-reviewer.md                # the design archive's UI reviewer (idea-loop:ui-reviewer) — `sonnet` alias, effort high; pr-review starts it once per round when tmp/ holds design output for this spec (`research/` never counts) and once more before merge to check the archive draft, dreaming starts it in reconcile mode to re-drive a group of prod/ states
│   ├── explorer.md                   # implement's scout (idea-loop:explorer) — `haiku` alias, effort high, pointer-only shared notes before a parallel dispatch
│   └── pr-reviewer.md                # pr-review's reviewer (idea-loop:pr-reviewer) — `sonnet` alias, effort xhigh, one per round
├── README.md (this file)
├── skills/                          # three categories, each listed in plugin.json — rules in AGENTS.md
│   ├── engineering/
│   │   ├── tdd/SKILL.md              # shared, model-invoked — red→green loop, seams, mock boundary
│   │   ├── spec-status/SKILL.md      # shared, model-invoked — the issue state machine (the loop's queue) and the spec state machine (document maturity)
│   │   ├── browser/SKILL.md          # shared, model-invoked — headless Playwright for your own capture and measuring, the built-in browser for showing the human; static serving, logging in, measuring from the real DOM
│   │   ├── ui-measure/SKILL.md       # shared, model-invoked — implementation vs frozen canvas, cell by cell: the three environment rules, default tolerances, the matrix, when to stop
│   │   ├── pr/SKILL.md               # shared, model-invoked — what the human reads on a PR: the description's four sections, stop reports and review rounds, the review loop file (+ references/)
│   │   ├── setup/SKILL.md            # human-invoked; + references/ — templates for DEVELOPMENT.md, REVIEW.md, CODING_STANDARDS.md, ISSUE_TRACKER.md, PRODUCT.md and the CLAUDE.md / AGENTS.md block
│   │   ├── issue-dispatch/SKILL.md   # one dispatch round over GitHub issues — run by a fixed session under /loop, per issue state
│   │   │   references/session-prompts.md  # the three child-session prompts (verify, design, implement)
│   │   ├── issue-verify/SKILL.md     # the verification session: reproduce, record 存在 / 不存在, group, draft specs, grill what needs the human
│   │   ├── to-spec/SKILL.md          # spec template inline; routes the spec, lands it on main, labels its issues
│   │   ├── to-ticket/SKILL.md
│   │   ├── implement/SKILL.md        # orchestrates a spec's tickets — the work is in agents/implementer.md
│   │   │   references/ui-tickets.md, react-port.md  # UI tickets: canvas → the project's component tree, per-stack notes, the dev-only state harness
│   │   └── pr-review/SKILL.md        # one two-axis round per call — the work is in agents/pr-reviewer.md
│   │       references/review-standards.md    # the two review axes: inputs, what counts, reproduce-and-draw, per-finding disposition, mechanical admission
│   │       references/codex-spec.md, codex-standards.md  # the fixed Codex prompts per axis, filled by scripts/codex-prompt.mjs
│   │       references/merge.md       # merge, the pre-merge design archive, the post-merge cleanup
│   ├── design/
│   │   ├── design-modeling/SKILL.md  # shared, model-invoked — the DESIGN.md write standard: what each chapter holds, the admission table, one write's path, the candidate format, who writes
│   │   │   references/chapters.md, new.md, distill.md, reconcile.md  # each chapter; creating, distilling, reconciling DESIGN.md
│   │   ├── uiux-imagine/SKILL.md     # the divergent half — the process; the work is in agents/uiux-imaginer.md
│   │   │   references/imagine-canvas.md  # the board, cloning variants from a shipped UI, the handoff canvas, cleanup
│   │   │   references/direction-note.md  # the letter to refine: seven sections, composition list, provenance markers
│   │   ├── uiux-refine/SKILL.md      # the convergent half — the process; the work is in agents/
│   │   │   references/design/                # the design side (see below)
│   │   │   references/refine-canvas.md   # where the refine canvas lives and how its versions (v1, v2, …) advance
│   │   │   references/freeze.md, motion-stage.md, asset-stage.md, pinned-findings.md  # read only on their branch: sign-off, motion, marketing assets, a pinned finding
│   │   ├── uiux-research/SKILL.md    # human-run design research — only the calling mechanism; the work is in agents/uiux-researcher.md
│   │   │   references/research-backend.md
│   │   └── design-archive/SKILL.md   # shared, model-invoked — the design archive (docs/design/prod): the graph model, directories and tmp/prod split, frontmatter shapes, body sections, the six validation rules, the six query entries
│   │       references/query.md, archive-script.md  # query return shapes; the archive script's steps
│   └── productivity/
│       ├── grill/SKILL.md
│       ├── writing-for-agents/       # shared, model-invoked; SKILL.md + SKILL-MECHANICS.md translated into Chinese from mattpocock/skills (MIT, see its LICENSE)
│       ├── glossary/SKILL.md         # shared, model-invoked — GLOSSARY.md: what goes in, format, who writes (grill; dreaming corrects with approval), who reads; references/target-repo-setup.md for the AGENTS.md block and CI snippet
│       ├── wiki-conventions/SKILL.md # shared, model-invoked — the docs/ contract — directories, frontmatter, status enums; references/migrate-flat-layout.md
│       ├── evidence/SKILL.md         # shared, model-invoked — figures a human judges at a glance: spec figures (references/spec-figures.md, in docs/) and delivery evidence (references/delivery.md, flows, GIFs, side-by-sides from the implementation; never in git)
│       ├── decision-rules/SKILL.md   # shared, model-invoked — what an agent settles by rule, and what a question needs before it goes to the human (references/handing-to-human.md)
│       └── dreaming/SKILL.md         # + references/ — proposal-table (shape and execution pass), review-page (the cards a human approves DESIGN.md changes on), archive-reconcile (two waves, five verdicts), initial-scan, candidate-distillation, design-md-reconcile
├── evals/uiux-research/              # the one baseline: default prompts from real sessions + a minimal product context; `run.mjs` runs them, the human annotates the pages (see below)
├── docs/
│   ├── pr-review-loop.md             # design record of the previous review loop — superseded, kept as history
│   └── design-modeling.md            # design record of the first design-modeling skill — its rules were folded into dreaming, then split back out as skills/design/design-modeling/SKILL.md; kept as history
└── scripts/
    ├── ui-compare.mjs                # the two deterministic comparators (measurement + pixel)
    ├── ui-compare.test.mjs           # their unit tests — the red/green of visual correctness
    ├── ui-measure.mjs                # playwright shell: one browser, two tabs, walks the matrix
    ├── critic-score.mjs              # finding schema + the critic's score-vs-findings audit (+ the CLI uiux-refine calls each round)
    ├── critic-score.test.mjs         # its unit tests — the score bands, row for row
    ├── design-archive.mjs            # the design archive parsed: every object, edge and reference under docs/design/prod/ (optionally with a requirement's delta/ laid over it) — the layer queries, MCP and archiving reuse
    ├── design-archive-check.mjs      # the archive's six validation rules (reachability, async, references, journeys, decisions/candidates, motions/usedBy), file and field named; exit 0/1
    ├── design-archive-check.test.mjs # one red fixture per rule + the delta overlay + the old-layout note
    ├── archive-check-flag.test.mjs  # tripwire: every doc line that runs design-archive-check over a --delta also passes --no-used-by
    ├── design-archive-query.mjs      # the archive's six read entries (page, state, journey, requirement diff, reverse lookup, keyword) + the way-in derivation, as a module and a JSON command line; reads prod/ or prod/ with a requirement's delta/ laid over it
    ├── design-archive-query.test.mjs # their unit tests on the shared fixture + a requirement's delta/, and the command line's exit codes
    ├── design-archive-mcp.mjs        # the archive's MCP server (stdio, hand-written JSON-RPC, zero deps): the six query entries as six read-only tools, repo root = git top level of the session's cwd; started by .mcp.json
    ├── design-archive-mcp.test.mjs   # spawns it over stdio: initialize / tools/list, tools/call equals the command line on the shared fixture, error results, .mcp.json
    ├── design-archive-fixture.mjs    # a fictional two-page archive shared by the archive tests (not a test file)
    ├── design-archive-write.mjs      # the archive script — the only writer of docs/design/prod/: validate, fold delta/ in, drop removed.md, regenerate usedBy + index.md, move interaction figures and re-point the spec's links, say what LFS / .gitignore lack, empty tmp/<spec-slug>/; --dry-run writes nothing
    ├── design-archive-write.test.mjs # one requirement end to end, refuse-writes-nothing, dry-run, hints, and the pieces
    ├── merge-gate-hook.mjs           # PreToolUse(Bash) entry: blocks a code-changing `gh pr merge` while docs/design/tmp/ still holds design output for a requirement the branch touches (`research/` never counts; docs-only branches pass), exit 2 naming it
    ├── merge-gate-hook.test.mjs      # block / pass / scoping by the branch diff / non-merge / no tmp / not a git repo, and the hook registration
    ├── mini-yaml.mjs                 # the dependency-free YAML subset the archive's frontmatter uses
    ├── mini-yaml.test.mjs
    ├── research-check.mjs            # uiux-research's gate: the page's head (question / 研究问题 = human's words / context / conclusion = general), every source's flow + scene / logic, the decisions block after the last source, every screenshot clickable and a relative path that exists, the chapters in the fixed order with nothing after the decisions block (what a chapter holds is the contract's prose, not a check)
    ├── research-check.test.mjs       # one per rule, plus the CLI exit codes
    ├── research-baseline.test.mjs    # keeps the uiux-research baseline well-formed: six cases, each with a prompt, a comparison line and an annotation file; the runner's stream digest
    ├── direction-note-check.mjs      # uiux-imagine's exit gate: the seven fixed sections + each chosen variant's composition list
    ├── direction-note-check.test.mjs # its unit tests — one per droppable section / composition item
    ├── proposal-table-check.mjs      # dreaming's exit gate: row types, per-type disposition sets, two pictures on archive rows, a delete-object row names its referrers, an unreachable-state row says what was missing and tried, "product broken" never replaces the archive, a candidate row carries a picture, DESIGN.md-bound rows carry old → new and a DESIGN.md row names its basis, empty-table test
    ├── proposal-table-check.test.mjs # its unit tests, through the command line — the red/green of each rule
    ├── ui-png-compare.mjs            # two screenshots of one state under the pixel layer's own tolerance (archive picture vs fresh picture) — the reconcile mode's "within tolerance, do not re-shoot" test
    ├── ui-png-compare.test.mjs       # its unit tests, through the command line, on PNGs built in the test with every scanline filter
    ├── flow-compose.mjs              # interaction flow figures: screenshots + arrows + red rings → one PNG (spec §1 / §5.3); a step can name its archive state (`state`), kept in the PNG's tag, the HTML and a `.states.json` beside it
    ├── flow-compose.test.mjs         # its unit tests — the flow schema, the layout, state ids and the `flow-<n>-<page>--<state>.png` name
    ├── design-lint.mjs               # the deterministic anti-slop/brand rules
    ├── design-lint.test.mjs          # their unit tests
    ├── design-lint-hook.mjs          # PostToolUse entry: lints canvas HTML (docs/design/tmp/<spec-slug>/canvas/), exit 2 on P0/P1
    ├── design-lint-hook.test.mjs     # its tests — which paths it watches, spawned with a real payload
    ├── design-md-hook.mjs            # PostToolUse entry: official @google/design.md lint on any DESIGN.md, exit 2 on an error
    ├── design-md-hook.test.mjs       # its tests, against a fake CLI
    ├── no-project-leak.test.mjs      # tripwire: skills/ and references/ carry no source-project names or examples
    ├── glossary-check.mjs            # GLOSSARY.md format lint — single-file, zero-dep, so target-repo CI can curl it pinned
    ├── glossary-check.test.mjs       # its unit tests — one per rule, plus a well-formed baseline
    ├── glossary-check-hook.mjs       # PostToolUse entry: lints any file named GLOSSARY.md, exit 2 on a violation
    ├── github-app.mjs                # the bot's identity: GitHub App installation token, else the gh login
    ├── github-app.test.mjs           # config lookup, signed JWT, token exchange
    ├── review-loop.mjs               # the PR's local review loop: next round, unsettled entries, archive to PR comments at merge (figures uploaded)
    ├── review-loop.test.mjs          # entries and rulings, settled vs not, round numbering, archive once, figure links
    ├── spec-status.mjs               # the only writer of a spec's status — checks each step, re-indexes
    ├── spec-status.test.mjs          # its unit tests — legal steps, refused steps, the index
    ├── issues.mjs                    # the only writer of an issue's status:* label — hand-over into spec frontmatter, sync, resolve
    ├── issues.test.mjs               # its unit tests against a fake gh
    ├── pr-body.mjs                   # PR description, four fixed sections (one sentence / what changed / your to-do / reference); no review, no code references outside reference
    ├── pr-body.test.mjs              # fixed order, untouched neighbours, size limit
    ├── evidence.mjs                  # delivery evidence: one orphan branch per PR, upload → image URLs that open full size, cleanup on merge
    ├── evidence.test.mjs             # owner-prefixed names, image types, size cap
    ├── browser-lock.mjs              # one lock for the session's MCP browser, so parallel implementers take turns
    ├── browser-lock.test.mjs         # acquire / refuse / stale take-over / owner-only release
    ├── changed-lines.mjs             # keep only tool diagnostics on lines this PR changed
    ├── changed-lines.test.mjs        # diff parsing, diagnostic formats, filtering
    ├── codex-prompt.mjs              # fills pr-review's fixed Codex prompt templates; refuses a placeholder left empty
    ├── codex-prompt.test.mjs
    ├── codex-companion.mjs           # finds the Codex plugin's companion script (newest cached version first)
    ├── codex-companion.test.mjs
    ├── review-check.mjs              # admission: quotes must exist, Standards code must be in the diff, behavioural Spec needs evidence (figure, table or example); shape: fixed parts, no code references
    └── review-check.test.mjs         # one per discard reason
```

## The design side

Design used to be its own installable plugin. It isn't any more — every stage of it
consumed or produced an `idea-loop` artifact (a spec, the freeze a ticket
reads, the instrument `implement` runs), so keeping it addressable across a plugin
boundary only bought two version numbers that could drift apart. It now lives here,
with **no alias, no compatibility shim, and no transitional double install**.

**Why the refine models are pinned in the agent definitions.** Once the executor was swapped for a
weaker model and the same baseline went from freezing to three rounds in a row stuck at a bottleneck (瓶颈) — splitting
the roles fixed the structure, not the model. The critic (`ui-master`, `fable`) and the executor
(`designer`, `opus`) run on different models so they don't share one blind spot. The definitions use
aliases, so a new model arrives with a Claude Code upgrade; to pin a version for a while, override the
alias mapping with an environment variable (e.g. `ANTHROPIC_DEFAULT_OPUS_MODEL`) instead of editing the
definition.

What came across:

| Piece | Where it lives now |
|---|---|
| The taste/craft references | `skills/design/uiux-refine/references/design/` |
| The two former design skills | `skills/design/uiux-refine/references/design/static-ui-protocol.md`, `skills/design/uiux-refine/references/design/motion-protocol.md` — demoted to on-demand protocols, same shape as the surface / module / component ones next to them |
| The `DESIGN.md` spec | Format: the official `@google/design.md` spec, read at run time (`npx -y @google/design.md@latest spec`). What may enter, how to write it, how a write goes, the candidate format, who may write: `skills/design/design-modeling/SKILL.md` |
| The lint hook + rules + their unit tests | `hooks/hooks.json`, `scripts/design-lint*.mjs` |
| The browser | user-level `playwright` MCP (headless, isolated), checked by `setup`; how to use it: `skills/engineering/browser/SKILL.md` |
| The design archive's lookups | `.mcp.json` (`design-archive`, `scripts/design-archive-mcp.mjs`) |
| Design research | user-level `refero` MCP (the human adds it with their own token), checked by `setup` |

One file there did not come across — `skills/design/uiux-refine/references/design/critic-rubric.md` is new. It is
what the design critic reads each round: the severity ladder anchored to an AD's action,
the score bands the worst finding caps, and the stop threshold, stated openly rather than
hidden. It holds because `scripts/critic-score.mjs` recomputes the allowed band from the
findings the critic just wrote and invalidates the round when the number does not follow.

Nothing in `skills/design/uiux-refine/references/design/` is an entry point. They are loaded on demand by whichever
step is running; the hooks are the only pieces that fire on their own. One fires only on a
`Write`/`Edit` whose path lands in a canvas HTML — `docs/design/tmp/<spec-slug>/canvas/*.html`, or the legacy
`design-preview/` / `design-motion-preview/` scratch dirs; the other only on a write to a file named
`DESIGN.md`, where it runs the official `@google/design.md` lint at `@latest` and hands any error
back to the model. A fourth, `merge-gate-hook.mjs`, fires on `Bash` before the command runs: a `gh pr merge`
that changes code while `docs/design/tmp/` still holds design output for a requirement the branch touches is stopped, with the requirement named and the archive
command to run (`scripts/design-archive-write.mjs`); a branch that only changes `docs/` (a spec or design PR) passes, and another spec's frozen design sitting on main does not count; the `research/` folder `uiux-research` drops never counts as design output, so a requirement that only holds research passes; every other command passes.

What retired outright, because its content was already relocated: the `design` entry skill,
the port-verification skill
(→ `skills/engineering/implement/references/ui-tickets.md` and the `ui-measure` skill, which generalized it past React), and the
`wireframe-candidates` workflow (its structural-divergence audit moved into `prototype`, which was later removed too).
