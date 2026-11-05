# idea-loop plugin

> The domain glossary (`GLOSSARY.md`, `skills/productivity/glossary/SKILL.md`) adapts the `domain-modeling` design from
> [mattpocock/skills](https://github.com/mattpocock/skills) (MIT).

Closed loop from idea to shipped engineering, backed by the `docs/` Obsidian
vault as its knowledge base. Each spec lives in its own directory,
`docs/spec/<slug>/<slug>.md`, with its tickets under `docs/spec/<slug>/tickets/`;
the directory's existence says the spec is not settled yet, and its frontmatter
`status` says how far it got (see `skills/productivity/wiki-conventions/SKILL.md`).

## Install

```
/plugin marketplace add guohaonan-shy/harold-skills
/plugin install idea-loop@harold-skills
```

Then run `/idea-loop:setup` in the target repo.

idea-loop depends on the [excalidrawer](https://github.com/guohaonan-shy/excalidrawer) plugin (installed with it) for spec figures;
without it the figures are written in mermaid. Two optional plugins in the same marketplace depend on idea-loop:

| Plugin | What it adds | Without it |
|---|---|---|
| [`design`](../design/README.md) | UI design from research to freeze, the design archive, `DESIGN.md`, the UI walkthrough and cell-by-cell measuring | the issue session skips the design stage; `implement`, `pr-review` and `dreaming` skip their design steps and say so |
| [`seo`](../seo/README.md) | OpenSEO-backed audits and research, a weekly scan that files issues, briefs, writing, outreach, a pre-publish check | nothing SEO-related is installed, no OpenSEO connection |

`setup` asks whether the project designs UI and does SEO, and which of these to install.

## Skills

| Skill | Stage | Coverage |
|---|---|---|
| `/idea-loop:setup` | Setup | Run once per target repo, by hand. Checks `gh`, `origin/HEAD`, Codex and Refero read-only, asks only what the repo does not already say, and writes the project files the other skills read: `DEVELOPMENT.md` (base branch, merge method, worktree preparation, dev server), `REVIEW.md` (verification commands), `CODING_STANDARDS.md` (skeleton; the rules are the project's), an `## idea-loop` block in `CLAUDE.md` / `AGENTS.md`, an `## issue 分类` section in `AGENTS.md` (the `type:*` categories and the other labels to keep), the `docs/` skeleton and local excludes. It creates the `status:*` and `type:*` labels, moves labels still in use onto categories, and prunes the rest once the human has seen the list. It also asks (AskUserQuestion) whether to install the weekly desktop scheduled task `dreaming-<repo name>` whose prompt is `/idea-loop:dreaming` (minute off 0 and 30; outside the desktop app it hands the prompt over to be created by hand; a closed app skips the run and catches up on the next launch), creating it only on a yes. It also sets up the **issue consolidation task**, a Claude cloud scheduled task (claude.ai/code/routines; each run is a session listed under Scheduled in the desktop sidebar) with cron `7 */6 * * *` (UTC): setup prints the Claude GitHub App install link (`https://github.com/apps/claude/installations/new`, installed on the target repo only — only the human can click it), waits for "installed", creates the task with `RemoteTrigger` using the prompt in `skills/engineering/setup/references/consolidation-prompt.md`, clears every connector the task inherits from claude.ai, and does one "Run now" smoke run. Each run looks at open issues with no `status:*` label and no parent, and hangs those that change the same file or the same page / module under one root issue (an existing root, or a new one whose body starts with 由整合定时任务开出) through repo-scoped REST only; it posts no comment and changes no label — the reasons for each merge are written in that run's session. Without `RemoteTrigger`, or if the human declines, setup hands the prompt and settings over and records "未做". A skill or agent that needs one of these files and finds none stops and asks for `/idea-loop:setup` |
| `/idea-loop:issue-dispatch` | Intake | The issue dispatcher, started once in a fixed session in the main checkout with an interval (`/idea-loop:issue-dispatch 30m`). It schedules its own recurring job (each fire is the next round) and a one-shot reminder that tells the human in that session when the 7-day job has expired. Every round runs `issues.mjs reconcile`, counts the unarchived issue sessions per queue — only sessions titled `<repo>#<number> …`, so the child sessions an issue session spawns (e.g. parallel imagine sessions) take no slot and are reported as a separate count (`issues.mjs queues`: the main queue's sidebar sections 审核中 / 设计中 / 实现中, cap 10, across projects; a category marked「（独立队列，上限 N）」in the AGENTS.md issue categories gets its own queue, cap N, in sections prefixed with its name, e.g. `seo 审核中`), reports issues in a working state with no session, and offers one session card per group for each queue's free slots — a group is a root issue plus its sub-issues (the card is titled with the root's number and its prompt lists the sub-issue numbers; sub-issues count as covered by their root's session, so they are never reported as having no session), or an unconsolidated issue on its own, taken from `issues.mjs candidates` oldest first (a scheduled turn cannot start sessions; the human clicks the card). The cards it has offered and not yet seen started count against the cap |
| `idea-loop:issue-session` | Intake → Merge | One group's session from verification to close — a root issue plus its sub-issues, or an unconsolidated issue as a group of one — the human's window for grilling and decisions. On start it finds the group (`issues.mjs group`), detaches from the dispatcher, moves itself into its queue's sidebar section 审核中, titles itself with the root's number and claims the whole group by flipping the root (a card whose group is already taken archives itself; a human call picks it up wherever it stands). It runs `issue-verify` once for the whole group — one spec covering every sub-issue, grilled in this one session — then design (`/design:uiux-imagine` → `uiux-refine`, started by the human) and implementation (`to-ticket` → `implement` → `pr-review`; tickets already cut are not cut again, so re-typing the command works), all in this same session. After each PR lands it branches from the latest main, runs `issues.mjs advance` to move the group on (the root and its sub-issues flip together and close together when the spec completes) and moves itself into the next section; once the group is closed or parked it archives itself, which removes its worktree |
| `idea-loop:issue-verify` | Verify | The review stage of an issue session: reproduces an issue (in a root's session it is called once for the whole group, reproduces each sub-issue, drafts one spec that covers them all, and does not claim again) (output kept in `.tmp/`, only the conclusion read back), sets its `type:*` category from the project's 「issue 分类」, records 存在 / 不存在 with evidence as quoted lines under the spec's title and drafts one spec through `to-spec`. A spec with a 「需要 grill」 line or a 「待定」 fork turns the issue 审核中 and waits for the human to grill in the same session; once settled it lands on main through a docs-only PR and the slug goes back to the session |
| `/idea-loop:grill` | Idea | Design-tree interview, one round of open questions at a time — facts are the agent's job, decisions are the human's |
| `idea-loop:retro` | Retro | Run at the end of an issue session (`issue-session`'s 「收尾」, before it archives itself) or by the human saying "retro". Reads this session's own transcript file — not its context, which compaction has already thinned — squeezed by `scripts/session-digest.mjs` into every human utterance plus the conclusion of the AI reply before it (no tool calls or output). Finds three signals: the human's corrections and follow-up questions (one occurrence is enough), the human's choices on posed questions (the same kind at least twice across issues, no counter-example, counted from `docs/raw/decisions/` in the target repo), and directions the human volunteers (one occurrence; the human is asked which layer). Each candidate is shown with the verbatim words, where it happened, the layer (plugin skill / the target repo's rule files / a mechanical check), old and new wording side by side, how to verify afterwards that the change fixed that moment (a replay case's three parts, a check's name, or "can't verify" with the reason), and — when the retro reads the candidate pool (`docs/records/retro-candidates/`, harold-skills' pool read remotely with `gh` when it runs elsewhere) and finds the same kind already there — "this is the N-th time, merged into <that file>". The human answers approve-into-the-pool / approve-and-open-an-issue / reject / change; the retro never recommends between the two homes. It edits no rule file: an issue-bound candidate becomes a to-be-verified issue (plugin problems to harold-skills, project ones to the target repo); a pool-bound one is written into the pool by landing (plugin skill / agent / reference / script candidates go to harold-skills' pool, the target repo's own rule-file candidates to its own; a new file, or one more line in an existing file's 出现 section), where `dreaming` counts it. The questions put to the human and each candidate's outcome (`批·进候选池（<link>，第 N 次）` / `批·开 issue（<link>）` / …) are recorded in the target repo's `docs/raw/decisions/<issue>.md` through a docs-only PR; a pool write into harold-skills from another repo is a second docs-only PR opened remotely with `gh` (no checkout), merged when checks pass |
| `/idea-loop:to-spec` | Spec | Turns the current context (a `grill` conversation, or an issue `issue-verify` has already reproduced) into one spec readable by humans as well as agents: one quoted line per covered issue saying whether it exists, the problem statement with its reproduction evidence, the plan (opening with an interaction sequence diagram; backend, front-end-internal and front-end-interaction sub-sections as needed), user stories as one tree per scenario (one expected behaviour per problem for pure fixes), implementation decisions, and testing decisions with agreed seams. Every section opens with one line saying what it gives the reader. A conversation also lands as a raw transcript. Settles what the written rules can settle (`idea-loop:decision-rules`), and gives every statement about the present state a source (the shared writing rules in `idea-loop:evidence`). When the issue is about a document an agent reads, it first diagnoses that document with `idea-loop:writing-for-agents` and lists its callers; the plan follows from both, each change naming the lever. A new spec is 草稿; `spec-status.mjs route` makes it 完成 (every issue absent), 审核中 (something waits for a human) or 正式; the spec then lands on main through a docs-only PR and the dispatcher's reconcile labels its issues (a spec that covers none gets an unlabelled spec issue from `issues.mjs open` first), as `ISSUE_TRACKER.md` says. Figure rules: `idea-loop:evidence` |
| `/idea-loop:to-ticket` | Plan | Slices a `正式` spec (design frozen if it touches UI) into tracer-bullet vertical cuts with blocking edges, writes the tickets, flips it to `实现中` and commits the tickets and the spec change onto the current branch (the implementers' worktrees are cut from it) without waiting for a nod. The cut (title / blocked by / end-to-end behaviour per ticket) goes into the final review report; it stops only when slicing surfaces a real decision question for the human |
| `/idea-loop:implement` | Build | Runs a whole spec: the calling session orchestrates, dispatching `idea-loop:implementer`s in parallel along the `Blocked by` frontier (up to three at once by default, each in its own worktree and a fresh context the first time; the pending ledger records each stopped ticket's implementer agent id, and once the human has decided, the orchestrator calls that same implementer back with `SendMessage` — pointers only, plus the integration branch's latest commit to merge first — and starts a new one from the half-finished branch only if that fails or no id was recorded; a ticket that has already landed is always redone by a fresh one, since its worktree is gone; an `idea-loop:explorer` writes shared pointer-only notes first; one ticket → one commit the orchestrator fast-forwards onto the integration branch, then reclaims the worktree; an implementer always calls `decision-rules` first, picks any other skill from what the ticket asks for, reads the whole spec as background (the ticket sets the scope) and, before writing, reads the target repo's written standards — `CODING_STANDARDS.md`, `REVIEW.md`, `AGENTS.md` / `CLAUDE.md` and what they link to — the same set the review's Standards axis judges by, picking the entry in `CODING_STANDARDS.md`'s links that governs the files the ticket changes and reading or calling it before writing, and listing which standards it read in the hand-back's `verified`; TDD at the agreed seams, human-verify flows and GIFs recorded from the implementation). Stops only for the human — a Review 汇报 (from implementation) shown in the session and kept in the PR's local review-loop file: what the implementers already settled by the existing way of the product or by fixing a legacy problem that spoiled the ticket (listed first, the human overturns any with one sentence), then the decisions that really need a human. When nothing waits for the human (no pending decision), the report is still written to the review-loop file with a closing "what was done", nobody is waited for, and the PR turns ready and goes into `pr-review` at once (queued rule replays still keep it draft). The PR turns ready once everything has landed. When the human accepts a design that differs from the frozen canvas at a stop, it runs the same design-change-sync route as above (designer edits the affected cells, a fresh `ui-master` scores them, commit and push to the integration branch, freeze-record row, implementer redispatched for any code that disagrees) |
| `/idea-loop:pr-review` | Review | One round per call on the open PR: an `idea-loop:pr-reviewer` runs the repo's own checks (changed lines only) and two read-only Codex processes — Spec and Standards — reproduces every behavioural Spec finding and shows it in whatever form is fastest to grasp, checks every quote and the wording mechanically, marks every finding with a disposition (by rule / the human decides, `skills/productivity/decision-rules/SKILL.md`), and writes the round's report, which the session shows the human and keeps in the review-loop file. Findings the written rules already settle are handled before the report is shown and listed first under "handled by rule"; the human can overturn any of them with one sentence. The rest the human rules on in the session; fixes go back through the tickets and the implementer; accepting the implementation where it differs from the canvas (or the human changing the design) goes through the design-change-sync route — a `designer` edits the affected cells of the canvas, a fresh `ui-master` scores only those cells, the session commits and pushes to the PR branch and records a freeze-record row, and nothing is hand-edited in `delta/`; when a round had fixes, they have landed and fewer than two rounds have run, the session starts the next round itself. When the local `docs/design/tmp/` holds design output for this spec (the `research/` folder `uiux-research` drops never counts as design output), an `design:ui-reviewer` walks the implementation against the frozen canvas each round (walkthrough mode: it only reports, never edits the canvas or `delta/`, and its two options are "change the implementation" or "accept it, via a design change"), started in the same message as the `pr-reviewer`; the pr-reviewer starts its Codex processes at once, waits for the findings file before writing the report inside the same 20-minute budget, and records the UI axis as incomplete if the file never shows up or the session wrote that the UI reviewer returned `incomplete`. Its findings are merged into the Spec section. On the human's word to merge, a leftover `tmp/` with design output goes through the pre-merge archive (the UI reviewer checks the implementation against the final canvas and writes the whole `delta/` → the human reads the draft → the archive script → commit and push), then the review loop is archived to the PR as comments, then the PR merges. The archive is a step of this merge flow, not a hook: merging on the web or from another session skips it, a known gap that the weekly `dreaming` backstops, so merges go through the issue session |
| `/idea-loop:dreaming` | Maintain | Two passes with the human between them. Dreaming itself only orchestrates: it cuts a worktree from `origin/<base branch>` (from `DEVELOPMENT.md`), dispatches, merges the rows into one table, runs the check script, builds the review page, waits for the human and runs the execution pass. Every reconciliation in the **proposal pass** (nothing is written) is done by a dedicated agent that is read-only there, with model and effort pinned in its definition; the three start in one message and depend on nothing but the worktree: `idea-loop:adr-reconciler` (`sonnet`, high — spec → ADR: is the spec shipped, drafts the ADR, marks superseded ADR sections, finds tickets a merged PR left behind; secondarily `docs/domain/`, reference manuals, `GLOSSARY.md` and `REVIEW.md` going stale; `CLAUDE.md` and `AGENTS.md` are out of scope), `design:design-steward` (`opus`, high — distills design-law candidates into `DESIGN.md`, audits `DESIGN.md` against the code and measures tokens; every proposed change to `DESIGN.md` comes from this one agent, so two sections never propose clashing edits), and `design:ui-reviewer` in reconcile mode (`sonnet`, high), which first checks the design archive (`docs/design/prod/`) against the source with no browser — the **source wave**: object code paths that no longer exist, components nothing references, routes the archive does not cover, entry URLs no route matches; it returns these as `档案对象` rows and only asks dreaming to scan a missing page (the whole-site initial scan stays in dreaming) — and then re-drives every state of the archive in a dev environment (each state is judged consistent / archive stale / entry stale / product broken / unreachable; within tolerance nothing is re-shot; a long page's entry state is shot section by section, each once its content has settled, and compared section by section; an empty archive gets a first draft from a whole-site initial scan, approved page by page). Dreaming does one check itself, mechanically, with no agent: **missed archive** — a need whose `docs/design/tmp/<spec-slug>/` still holds design output (apart from `research/`) on `origin/<base branch>` while its spec is 完成 or gone was merged around pr-review's archive step (`references/missed-archive.md`); its row offers 补归档 (the UI reviewer's archive mode in dreaming's worktree, then the archive script, in the same PR) or 丢弃. A second one it also does itself, with no agent: **retro candidates** — it runs `scripts/retro-pool-count.mjs` over the current repo's candidate pool (`docs/records/retro-candidates/`, skipped when the directory is absent) and puts every candidate still `在池里` that has come up 3 or more times (a rejected one only when `scripts/retro-pool-reopened.mjs` finds a new session since its latest rejection, read from git history) into a `retro 候选` section, one row per candidate with the verbatim words of each occurrence; on approval the execution pass opens an issue (to harold-skills for a plugin landing, to the target repo otherwise) and writes the candidate file's status back, and dreaming never edits a skill itself (`references/retro-candidates.md`). The result is one proposal table (one row per object; closed set of dispositions per row type, checked by `scripts/proposal-table-check.mjs`; an empty table is a one-line push, not an Artifact). The `DESIGN.md` rows are put to the human as a review page, one card per row (`references/review-page.md`): a candidate card shows a screenshot of the UI the rule is about (from the design archive, else from the implementation), the exact rule text and the `DESIGN.md` section it lands in, and choices with their consequences and one recommendation; a maintenance card shows before → after and names the standard it rests on (a section of `design:design-modeling`, the official spec, or a lint rule name). The **execution pass** runs only the rows the human approved, and its result is one PR that touches only `docs/`, `DESIGN.md` and `GLOSSARY.md`. Writing `DESIGN.md` always waits for the human; a broken product is never written into the archive and, like a rule the code disobeys, becomes a drafted GitHub issue, opened only on approval. Manual runs may start just one agent, or hand `design-steward` a single rule to distill on the spot. **Scheduled and incremental**: dreaming is meant to run weekly from the desktop scheduled task `/idea-loop:setup` creates (still `disable-model-invocation`: only the human or that task starts it). The screenshot pass of the archive reconcile is **incremental** — it re-drives only the states the code touched since the task's last `succeeded` run (the baseline is the `origin/<base branch>` commit at that run's `started_at`, read with `list_task_runs`; a hand-typed run uses the same baseline and never moves it; no task or no successful run means a full pass, and so does the human saying "全量"). The states come from one more archive lookup, `design-archive-query.mjs … affected <commit>` (MCP `design_affected`): a changed file that is a page's registered code puts in all of its states, a component's registered code puts in the states using it, and a file those code files import directly counts as them changing; the source wave stays full every time. The first line under the proposal table's title says full or incremental, why, and how many states; if the last table is still unprocessed a second line says so (the two tables are never merged), and a batch that did not run is noted at the end with "下次可说全量补上" (`references/incremental-scope.md`) |

### The forward loop is not the maintenance sweep

`grill → to-spec → [design:uiux-imagine → design:uiux-refine] → to-ticket → implement →
pr-review` runs once per piece of work, and every stage lands on the main branch through its own PR
(a docs-only spec PR, a design PR, the implementation PR), so the next stage always starts from main.
Two state machines, each for one thing (`skills/engineering/spec-status/SKILL.md`). **The issue label
is the queue**, read by the dispatcher and the issue sessions: 待验证 (no label) → 验证中 → (审核中 →) 待设计 →
设计中 → 待实现 → 实现中 → closed, plus 搁置 to keep the loop away. One group — a root issue with its sub-issues, or an unconsolidated issue on its own — gets one session, which
carries it through those states and through the sidebar sections 审核中 / 设计中 / 实现中. Besides its
status an issue carries `type:*` category labels, defined in the project's `AGENTS.md`. **The spec status is the document's
maturity**, used inside idea-loop only: 草稿 → (审核中 →) 正式 → 实现中 → 完成. A spec is not held for a
human read-through: once nothing in it waits for a human (a `需要 grill` line, a `待定` fork) it is
正式 and goes straight on. The `待` labels are set only by `issues.mjs reconcile`, from the specs on
main, so no session moves on to work main does not yet hold; the `中` labels are set by the issue
session, through `issues.mjs advance` after each of its PRs lands. Every flip goes through `scripts/issues.mjs` or `scripts/spec-status.mjs`, which check
the precondition before writing. Issues can hang under a **root issue** (GitHub sub-issues): the script offers the root as the candidate and never its sub-issues
(nor an issue opened under 6 hours ago), `set` on a root's number flips the root and its open sub-issues together, a group is one spec and one session (the spec's `issues:` lists every sub-issue, never the root), so when `reconcile` / `advance` flips the spec's sub-issues the root goes to the same state,
and when the spec closes them the root closes with them (a sub-issue outside the spec, or sub-issues headed for different states, leave the root put and are reported), and `issues.mjs group <docs> <n>` names a group. **The bracket is the whole design side, and it is conditional**: a spec
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
| `grill`, `retro`, `issue-verify`, `to-spec`, `to-ticket`, `implement`, `pr-review`, `writing-for-agents`; design's `uiux-research`; seo's method and solve skills | `dreaming`, `setup`, `agent-builder`; design's `uiux-imagine`, `uiux-refine`; seo's `seo-setup`, `seo-scan` |

`grill` is model-invocable so that "grill this idea" in an ordinary conversation starts it; it is still an
interview, so it only means something with a human answering. `uiux-imagine` is human-invoked: it steers on a human's directional
reaction each round, and a human is the one who declares the direction done.
`uiux-research` is model-invocable because looking up "how do others do this" is an ordinary thing to ask for in any conversation — but the *decision* to research stays with the human: inside imagine / refine the orchestrator calls it only when the human says to. `uiux-refine` stops on a human at every exit it has — a direction-level finding, a
a bottleneck (瓶颈), the sign-off — and wants a fresh window so it starts from the handoff canvas and
direction note instead of continuing the diverge session it cannot see. `dreaming` proposes
destructive disposals.

The project's `DESIGN.md` is written from exactly two places, `uiux-imagine` (only when the
project has none at the start) and `dreaming`; both read `design:design-modeling` and wait for the
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

One spec, one integration branch, one PR. The PR description is the **review
report**, written for a reader who never followed the work (it was delegated) and meant to be enough to
decide the merge: one sentence; the problem (what was seen, with numbers); how it was fixed (the
rules applied and their grounds, the slicing into tickets with what blocks what, each page or flow
end to end with its before → after shot); how it was verified (what was verified, what was not and
why, what the review rounds concluded); whether it can be rolled back (how, what it touches, what to
prepare before going live, the issues filed on the way); and what the human has to do (review the
human-verify material, decide, then say "merge"); plus a folded reference. No code lines,
variable names or paths outside that reference — `scripts/pr-body.mjs` refuses them. When a review round has
nothing for the human to decide and nothing left to fix, the orchestrator does not wait: it pushes the
docs-only "spec done, tickets deleted" commit, waits for its CI, writes the report and stops there; merging
afterwards needs no further CI wait. Layout: `skills/engineering/pr/SKILL.md`.

**The review loop lives in the session, not on GitHub** (`skills/engineering/pr/SKILL.md`, section "review loop 文件"). Only one
person reads the reports and decides, and they are already in the Claude session (desktop or
phone), so every Review 汇报 (implementation stops and review rounds are the same kind of report) is shown there, with figures sent as files and a push
notification; the human replies there; the orchestrator handles the batch and answers in one reply.
The same words — report, the human's rulings verbatim, what was done — go into one local file per PR
(`.tmp/review-loop/<PR>.md`, `scripts/review-loop.mjs`), the loop's memory across compaction or a new
session. When the human says merge, each report is posted to the PR as one plain comment
(figures uploaded and linked), then the PR merges and the file is deleted. No threads, no bot
waiting on GitHub. (Tried first: threads on the PR with a background watcher waking the session;
it worked, but carried one person's words from GitHub back into the session they were already in.)

| Phase | PR | Who talks | Where the human answers |
|---|---|---|---|
| Implementing | draft | `implement`'s orchestrator, in the session | A **Review 汇报 per stop** (the same report as a review round, "from implementation"; written for the record but not waited on when it has no decision): first what was **handled by rule** (details the spec left open that the product already answers, legacy problems fixed because they spoiled the ticket's input or turned CI red, and unrelated legacy problems the implementer noticed, for which the orchestrator already opened an issue (no status label) — one line each with its basis; overturn any with one sentence, which the orchestrator writes into the ticket as the human's decision), then what needs deciding, then whether what landed can be rolled back, then the human-verify material (flows and GIFs recorded from the implementation, one checkbox each) |
| Review | open | `pr-review`'s orchestrator, in the session | A **Review 汇报 per round**, written for the person who decides: a one-line verdict, then **handled by rule** (what was done, on what basis, with a commit or issue link — overturn any with one sentence), then each thing to decide in one format whichever axis it comes from — titled by its consequence, with the situation now (a Standards finding quotes the rule here), the user impact, whatever evidence makes it fastest to grasp (screenshots, an annotated flow, a GIF, a sequence diagram, a small table, a worked example), options that each say what they cost and whether they can be undone, and a recommendation — then whether the change can be rolled back; no variable names, file:line, commit hashes or section numbers in the body — code locations go in a folded block for the fixer |

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
keeps it out of `.claude/` worktrees. The design and seo plugins' tests are described in their own READMEs.
This plugin's cover the glossary lint, the issue and spec scripts against a fake `gh`, the review loop and PR
body, the replay runner, the flow figures, `plugin-root.mjs` and the plugin-split tripwire (no call left on an old
`idea-loop:` name, manifests and their dependencies, the copied modules identical), and a tripwire that keeps the
three plugins' `skills/` free of the source project's names and examples; new deterministic scripts get picked up by
putting their tests next to them as `<name>.test.mjs`.

Only the deterministic cores are unit-tested. The CLI tail on `glossary-check.mjs` is a thin shell — argv, a file
read, an exit code — verified by being run, not by a spawned-process test (`flow-compose.mjs` also has
spawned-process tests for the state-id file contract). The glossary **hook** (`scripts/glossary-check-hook.mjs`) has
no unit test either — it is verified by actually writing a broken `GLOSSARY.md` anywhere and confirming it reports;
that is the falsifiable signal, not a mocked stdin payload.

## Replay: proving a rule change took effect

A rule written into a skill, agent or reference is only a claim until the skill is seen behaving differently. A rule that can be
decided mechanically becomes a check (a script or a validator test) that is first seen **failing** on the input that reproduces
the old mistake. A rule that needs judgement gets a **replay case** in `evals/retro/cases/<case>/`: the commit the decision
happened at, the prompt that made the skill produce the thing, where it stops (the moment it hands the thing to the human), a
yes/no question written from what the human said back then (with the words quoted), and its size (small or large) with the basis.

```
node idea-loop/evals/retro/retro-replay.mjs --list                      # cases, sizes, format problems
node idea-loop/evals/retro/retro-replay.mjs --case <name> [--base main] # one small case: pre-change vs post-change plugin
node idea-loop/evals/retro/retro-replay.mjs --settle <name> --run <dir> # re-decide after the human overruled a judgement
```

The runner copies the project as of the case's commit into `/tmp`, runs `claude -p` with `--plugin-dir` pointing at the base
branch's plugin and again at this working tree's plugin (a sub-agent cannot do this: it loads the installed copy), then starts a
judging `claude -p` that reads both products anonymously and answers the question with a quote. Pre-change "no" and post-change
"yes" is a pass; pre-change "yes" is reported as "the case did not catch the problem". It does not score anything. A small case
that turns out to start a plugin agent or open a browser is stopped, relabelled large in its `case.json`, and reported as
needing the nightly queue (exit code 3). Details and the exit codes: the header of `evals/retro/retro-replay.mjs`.

### The nightly queue

A large case (it starts a plugin agent, opens a browser or calls a paid service) is not run in the daytime. Once the PR exists the
orchestrator queues it: `retro-replay.mjs --enqueue --slug <owner/name> --pr <N> --worktree <dir> --cases a,b` writes one file per PR
into `~/.idea-loop/replay-queue/` (repository, PR number, worktree, case list, the commit the pre-change plugin is taken from, and with
`--session <id>` the id of the issue session waiting for the result). The PR
is not reviewed until the result is in. `retro-replay.mjs --queue` is what the nightly job runs: it checks the machine's clock first
(outside 00:00–07:00 it starts nothing and leaves the queue as it is), exits at once on an empty queue, and otherwise runs each PR's
cases the way a single case runs, appends the result to that PR's review loop file as a `replay` entry (readable by
`review-loop.mjs check`; a case that did not pass leaves it unsettled), deletes the PR's queue file and prints one line
`回放结果 {json}` carrying the session id. The scheduled task's session sends that line's `message` back to the issue session with
the `send_message` session tool (`SendMessage` does not reach another session from a scheduled-task session) (the arrival wakes it: all passed, it carries on; not all passed, it stops and puts the result to the human) and runs
`retro-replay.mjs --notify` (a macOS notification) when the session cannot be reached; a PR queued without a session id gets the
notification from the runner itself. A case that did not pass is not rerun: the result is the human's to rule on.

`/idea-loop:setup` does the machine-level part once: `scripts/retro-install.mjs` copies the runner to `~/.idea-loop/bin/` (a fixed path,
the one small replays use too), a desktop-app scheduled task `idea-loop-retro-replay` runs `node ~/.idea-loop/bin/retro-replay.mjs --queue`
at 01:07 every night, and setup prints the permission rule `Bash(node ~/.idea-loop/bin/retro-replay.mjs:*)` for the human to add to
`~/.claude/settings.json` (setup never changes permission settings). The task's prompt is printed by `retro-install.mjs` as well, so setup and the task never drift apart. It starts the runner with Bash's `run_in_background` and waits for the exit wake-up, because a foreground Bash call is cut at 10 minutes and a PR's replay takes longer.

## Portability

Project rules and verification tools come from the current repository's root files written by
`setup` — DEVELOPMENT.md, REVIEW.md, CODING_STANDARDS.md — plus AGENTS.md / CLAUDE.md and what they link to. No rule is inherited from
any particular project. Plugin paths go through `${CLAUDE_PLUGIN_ROOT}` rather than being hardcoded,
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
├── hooks/hooks.json                  # PostToolUse(Write|Edit) → glossary-check-hook.mjs. Playwright (headless, isolated) is configured at user level by the human; `setup` only checks it
├── agents/
│   ├── implementer.md                # implement's executor (idea-loop:implementer) — `sonnet` alias, effort high, one per ticket, its own worktree
│   ├── adr-reconciler.md             # dreaming's spec → ADR reconciler (idea-loop:adr-reconciler) — `sonnet` alias, effort high, read-only, returns the `文档` rows
│   ├── explorer.md                   # implement's scout (idea-loop:explorer) — `haiku` alias, effort high, pointer-only shared notes before a parallel dispatch
│   └── pr-reviewer.md                # pr-review's reviewer (idea-loop:pr-reviewer) — `opus` alias, effort high, one per round, started together with the ui-reviewer; it waits for the UI findings file inside its 20-minute Codex budget
├── README.md (this file)
├── skills/                          # two categories, each listed in plugin.json — rules in AGENTS.md
│   ├── engineering/
│   │   ├── tdd/SKILL.md              # shared, model-invoked — red→green loop, seams, mock boundary
│   │   ├── spec-status/SKILL.md      # shared, model-invoked — the issue state machine (the loop's queue) and the spec state machine (document maturity)
│   │   ├── browser/SKILL.md          # shared, model-invoked — headless Playwright for your own capture and measuring, the built-in browser for showing the human; static serving, logging in, measuring from the real DOM
│   │   ├── pr/SKILL.md               # shared, model-invoked — what the human reads on a PR: the two deliverables, each with a table of sections and what each gives the reader: the description's seven sections (the review report: one sentence, problem, how it was fixed, how it was verified, whether it can be rolled back, your to-do, folded reference) and the Review 汇报 (stops during implementation and review rounds are one report); the review loop file keeps the latter (+ references/)
│   │   ├── setup/SKILL.md            # human-invoked; + references/ — templates for DEVELOPMENT.md, REVIEW.md, CODING_STANDARDS.md, ISSUE_TRACKER.md, PRODUCT.md, the CLAUDE.md / AGENTS.md block and the AGENTS.md issue-category section, plus the step-by-step material the SKILL.md keeps out of its body (preflight table, survey list, question list, nightly replay, weekly dreaming) and the cloud consolidation task's prompt
│   │   ├── issue-dispatch/SKILL.md   # the issue dispatcher — schedules its own loop, one session card per 待验证 group (a root, or an unconsolidated issue), a cap per queue
│   │   ├── issue-session/SKILL.md    # one group's session from verification to merge and close (a root with its sub-issues, or one issue) — one spec, no child sessions; moves itself through the sidebar sections
│   │   ├── issue-verify/SKILL.md     # an issue session's review stage, called once per group: reproduce each issue, set its category, record 存在 / 不存在, draft one spec, grill what needs the human
│   │   ├── to-spec/SKILL.md          # spec template inline (raw template and landing steps in references/); routes the spec, lands it on main, labels its issues
│   │   ├── to-ticket/SKILL.md
│   │   ├── implement/SKILL.md        # orchestrates a spec's tickets — the work is in agents/implementer.md
│   │   │   references/ui-tickets.md, react-port.md  # UI tickets: canvas → the project's component tree, per-stack notes, the dev-only state harness
│   │   └── pr-review/SKILL.md        # one two-axis round per call — the work is in agents/pr-reviewer.md
│   │       references/review-standards.md    # the two review axes: inputs, what counts, reproduce-and-draw, per-finding disposition, mechanical admission
│   │       references/codex-spec.md, codex-standards.md  # the fixed Codex prompts per axis, filled by scripts/codex-prompt.mjs
│   │       references/deliver.md     # a round with nothing for the human: push the spec-done docs commit, wait for CI, write the review report into the PR description, stop; and what to do when the human asks for changes after the report
│   │       references/merge.md       # merge (no spec-done step, no CI wait), the pre-merge design archive, the post-merge cleanup
│   │       references/ui-walkthrough.md  # read only when the PR has design output: starting the ui-reviewer next to the pr-reviewer, and what to do when it returns incomplete
│   └── productivity/
│       ├── grill/SKILL.md
│       ├── retro/SKILL.md            # model-invoked — end-of-session retro: rule candidates from the human's corrections, choices and directions; references/decision-record.md, references/candidate-pool.md (the pool file shape, judging the same kind, the human's replies, reading / writing harold-skills' pool remotely), references/session-digest.md (locating and compressing the transcript)
│       ├── writing-for-agents/       # shared, model-invoked; SKILL.md + SKILL-MECHANICS.md translated into Chinese from mattpocock/skills (MIT, see its LICENSE)
│       ├── glossary/SKILL.md         # shared, model-invoked — GLOSSARY.md: what goes in, format, who writes (grill; dreaming corrects with approval), who reads; references/target-repo-setup.md for the AGENTS.md block and CI snippet
│       ├── wiki-conventions/SKILL.md # shared, model-invoked — the docs/ contract — directories, frontmatter, status enums; references/migrate-flat-layout.md
│       ├── evidence/SKILL.md         # shared, model-invoked — how to write what a human reads (shared writing rules: conclusion first, smallest view, sourced facts, unfamiliar terms explained, one question with examples and a recommendation) and the figures a human judges at a glance: spec figures (references/spec-figures.md, in docs/) and delivery evidence (references/delivery.md, flows, GIFs, side-by-sides from the implementation; never in git)
│       ├── decision-rules/SKILL.md   # shared, model-invoked — what an agent settles by rule, and what it hands to the human
│       └── dreaming/SKILL.md         # + references/ — proposal-table (shape and execution pass), review-page (the cards a human approves DESIGN.md changes on), archive-reconcile (two waves, both run by the ui-reviewer; five verdicts), initial-scan, candidate-distillation, design-md-reconcile, docs-reconcile (the adr-reconciler's method), missed-archive, retro-candidates (the pool section of the table), incremental-scope (full vs incremental screenshot pass, the baseline from the scheduled task's runs)
├── evals/retro/                      # replay cases for rule changes: `retro-replay.mjs` runs one small case on the pre-change and post-change plugin and has a judging session answer its yes/no question; `--queue` runs the large ones at night (`queue.mjs` holds the window and queue decisions) (see below)
├── docs/
│   └── pr-review-loop.md             # design record of the previous review loop — superseded, kept as history
└── scripts/
    ├── skill-private-references.test.mjs # tripwire: no skill reads another skill's private `references/` ("`idea-loop:<other>` 的 `references/…`" or a path through its directory); a shared text is promoted to a skill or moved into the skill that really uses it; also scans `agents/`: every `skills/…/references/…` path an agent definition reads must exist and belong to a skill that starts that agent (a skill whose text names `idea-loop:<agent>`)
    ├── plugin-root.mjs               # finds another plugin of the marketplace (env var, sibling dir, highest cached version); seo/scripts/ has an identical copy
    ├── plugin-split.test.mjs         # tripwire for the split into idea-loop / design / seo: old names, manifests, MCP and hooks per plugin, the copied modules
    ├── mini-yaml.mjs                 # the dependency-free YAML subset retro-pool-count.mjs reads; design/scripts/ has an identical copy for the archive
    ├── mini-yaml.test.mjs
    ├── claude-stream.mjs             # reads a `claude -p` stream-json event stream — per-session tool counts, cost, and whether a plugin agent or a browser got involved; shared by both eval runners
    ├── claude-stream.test.mjs
    ├── retro-case.test.mjs           # the replay-case format: a missing commit / prompt / stop point / yes-no question / size / size basis is each reported by name; the shipped cases are well-formed
    ├── retro-queue.test.mjs          # the nightly queue's decisions: the 00:00–07:00 window (09:12 runs nothing, an empty queue exits at once), the queue file, and the result as a review-loop entry that `check` reads
    ├── retro-queue-run.test.mjs      # the runner's `--queue` / `--enqueue` end to end against a fake `claude`: pass and not-pass both clear the queue file, the clock passing 07:00 mid-queue, a bad queue file
    ├── retro-install.mjs             # copies the replay runner to the fixed path `~/.idea-loop/bin/` and prints the permission rule and the scheduled command; never touches settings
    ├── retro-install.test.mjs        # the installed copy works from there; installing again replaces it
    ├── retro-replay.test.mjs         # the replay runner's decisions (pass / case missed the problem / fail / abort a small case that started an agent / human override) and its flow end to end against a fake `claude`
    ├── proposal-table-check.mjs      # dreaming's exit gate: row types, per-type disposition sets, two pictures on archive rows, a delete-object row names its referrers, an unreachable-state row says what was missing and tried, "product broken" never replaces the archive, a candidate row carries a picture, a missed-archive row's disposition is 补归档 or 丢弃, a `retro 候选` row's is one of 开 issue：机械检查 / 开 issue：改 skill / 留在池里 / 驳回 with its 证据 filled, DESIGN.md-bound rows carry old → new and a DESIGN.md row names its basis, empty-table test
    ├── proposal-table-check.test.mjs # its unit tests, through the command line — the red/green of each rule
    ├── retro-pool-count.mjs          # counts the retro candidate pool (`docs/records/retro-candidates/`, one file per candidate): per file the title, landing, status and how many distinct sessions (`<repo>#<number>`) stand in its 出现 section, not counting lines marked 已推翻; passes at 3 or more (the human's "出现超过两次"); a file with no 出现 section or 状态 line, or a status outside 在池里 / 已开 issue（链接） / 驳回（理由）, is a problem and exits 2
    ├── retro-pool-count.test.mjs     # its unit tests, through the command line — 3 with 1 overturned is 2, 3 standing passes, one session counted once, the shape problems
    ├── retro-pool-reopened.mjs       # has a rejected candidate come up again since it was last rejected: reads git history, takes the latest commit that touched the `- 状态：驳回（` line (a second rejection with a new reason counts) and lists the sessions that stand now but were not named in the file as of that commit; order is commit order, never dates, so a same-day rejection and occurrence still resolve; a status that is not 驳回, or a rejection never committed, exits 2
    ├── retro-pool-reopened.test.mjs  # its unit tests, through the command line, on throwaway git repos — rejected once, a new session after, rejected again, a third session, same day / same second, overturned or repeated sessions, put back and rejected again
    ├── flow-compose.mjs              # interaction flow figures: screenshots + arrows + red rings → one PNG (spec §1 / §5.3); a step can name its archive state (`state`), kept in the PNG's tag, the HTML and a `.states.json` beside it
    ├── flow-compose.test.mjs         # its unit tests — the flow schema, the layout, state ids and the `flow-<n>-<page>--<state>.png` name
    ├── no-project-leak.test.mjs      # tripwire: skills/, agents/, docs/, README and AGENTS.md carry no source-project names or examples (evals/ replay cases and test fixtures are left out on purpose)
    ├── glossary-check.mjs            # GLOSSARY.md format lint — single-file, zero-dep, so target-repo CI can curl it pinned
    ├── glossary-check.test.mjs       # its unit tests — one per rule, plus a well-formed baseline
    ├── glossary-check-hook.mjs       # PostToolUse entry: lints any file named GLOSSARY.md, exit 2 on a violation
    ├── github-app.mjs                # the bot's identity: GitHub App installation token, else the gh login
    ├── github-app.test.mjs           # config lookup, signed JWT, token exchange
    ├── session-digest.mjs            # squeezes a session transcript to the human's utterances + the AI conclusion before each; locates this session's own transcript file (retro): by session id (`CLAUDE_CODE_SESSION_ID` / `--session`) across all project directories, else by a marker in the first human utterance; zero or several matches exit 2
    ├── session-digest.test.mjs       # compaction markers, what is dropped, the conclusion rule, locating the file (by id, by the first human utterance's marker, exit 2 on zero or several)
    ├── review-loop.mjs               # the PR's local review loop (entries: review, from implementation or from a review round — the older pause entries still read — and the nightly runner's replay): next round, unsettled entries, archive to PR comments at merge (figures uploaded)
    ├── review-loop.test.mjs          # entries and rulings, settled vs not, round numbering, archive once, figure links
    ├── spec-status.mjs               # the only writer of a spec's status — checks each step, re-indexes
    ├── spec-status.test.mjs          # its unit tests — legal steps, refused steps, the index
    ├── issues.mjs                    # the only writer of an issue's status:* and type:* labels — hand-over into spec frontmatter, reconcile, advance, label pruning
    ├── issues.test.mjs               # its unit tests against a fake gh
    ├── pr-body.mjs                   # PR description = the review report, seven fixed sections (one sentence / problem / how it was fixed / how it was verified / can it be rolled back / your to-do / reference; an old issues section is folded into the rollback one); no code references outside reference
    ├── pr-body.test.mjs              # fixed order, new sections, old headings, untouched neighbours, size limit
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
