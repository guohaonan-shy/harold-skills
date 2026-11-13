# idea-loop plugin

> The domain glossary (`GLOSSARY.md`, `skills/productivity/glossary/SKILL.md`) adapts the `domain-modeling` design from
> [mattpocock/skills](https://github.com/mattpocock/skills) (MIT).

Closed loop from idea to shipped engineering, backed by the `docs/` Obsidian
vault as its knowledge base. Each spec lives in its own directory,
`docs/spec/<slug>/<slug>.md`, with its tickets under `docs/spec/<slug>/tickets/`;
the directory's existence says the spec is not settled yet, and its frontmatter
`issues:` lists the issues it covers: the spec is settled once they are all closed (see
`skills/productivity/wiki-conventions/SKILL.md`). A spec has no status of its own.

## Install

```
/plugin marketplace add guohaonan-shy/harold-skills
/plugin install idea-loop@harold-skills
```

Then run `/idea-loop:setup` in the target repo.

## Skills

| Skill | Stage | Coverage |
|---|---|---|
| `/idea-loop:setup` | Setup | Run once per target repo, by hand. Checks `gh`, `origin/HEAD`, Codex and Refero read-only, asks only what the repo does not already say, and writes the project files the other skills read: `DEVELOPMENT.md` (base branch, merge method, worktree preparation, dev server), `REVIEW.md` (verification commands), `CODING_STANDARDS.md` (skeleton; the rules are the project's), an `## idea-loop` block in `CLAUDE.md` / `AGENTS.md`, the `docs/` skeleton only when the human keeps the knowledge base in the repo (kept outside — a directory or repo of its own — it only records where, and the spec, design and dreaming flows are unavailable in that repo), an `## issue 分类` section in `AGENTS.md` (the `type:*` categories and the other labels to keep), the `docs/` skeleton and local excludes. It creates the `status:*`, `kind:*`, `type:*` and `priority:*` labels, moves labels still in use onto categories, and prunes the rest once the human has seen the list. It also asks (the "asking the human" capability) whether to install the weekly scheduled task `dreaming-<repo name>` that starts `idea-loop:dreaming` (minute off 0 and 30; a runtime without the "scheduled task" capability gets the prompt handed over to be created by hand; what a missed run does is the runtime's, in `idea-loop:runtime`), creating it only on a yes. The same way it offers the weekly `triage-<repo name>` task that starts `idea-loop:issue-triage`, and (`references/dispatch.md`) either tells the human how to start the dispatcher or, where each round is a new session, creates `dispatch-<repo name>`, and its label step also creates the `priority:P0` / `priority:P1` / `priority:P2` labels. It also asks where the issues live, GitHub or Linear: a Linear project gets connected through the Linear MCP (the "install and settings" capability tells the human how in the current runtime; the address is `https://mcp.linear.app/mcp`), the chosen team's states, Triage setting and label groups are laid out as a table for the human to confirm and written into a Linear-flavoured `ISSUE_TRACKER.md` (first heading `# Issue tracker：Linear`; template `references/issue-tracker-linear.md`), and the GitHub label steps are skipped. It also asks whether the team uses triage and writes the answer (`triage：用` or `triage：跳过`) into `ISSUE_TRACKER.md`; labels left over from the old Chinese state names are listed by `issues.mjs migrate` and changed only after the human confirms. A skill or agent that needs one of these files and finds none stops and asks for `/idea-loop:setup` |
| `/idea-loop:issue-dispatch` | Intake | The issue dispatcher, started once with an interval (`/idea-loop:issue-dispatch 30m`). The body holds what is the same everywhere: every round runs `issues.mjs reconcile`, counts the open issue sessions in two shares (the child sessions an issue session spawns, e.g. parallel imagine sessions, take no slot and are reported as a separate count; `issues.mjs queues` gives the caps and the three sidebar sections — in-progress and in-review sessions plus the todo cards not yet opened stay within 10, across projects; triage sessions plus the triage cards not yet opened within 3; every issue is in this one queue, whatever its category), reports issues in in-progress or in-review with no session of that number, and hands over one session per `todo` issue for the free slots of the first share, then one per `triage` issue (`issues.mjs candidates --state=triage`, same order) for the second, at most 3 a round in all, todo first. Candidates come from `issues.mjs candidates` (no open blocked-by), ordered by whose they are first: issues assigned to the current `gh` login alone (P0 → P1 → P2 → no priority, oldest first within a level), the unassigned ones only when none of those can go (also P0 → P1 → P2 → no priority first, then the longest in `todo` first within a priority, by when the state's label was last added), and issues assigned to someone else never; on Linear the same order through `assignee: "me"` / `"null"`, with `updatedAt` standing in for the time in Todo. Three things are the runtime's, in `idea-loop:runtime` ("session management", the dispatch part): how the rounds are run, how open sessions are counted, how an issue is handed over (in magi: first a worktree on `issue/<n>-<slug>` outside the main checkout, then a session started in it with `--cap` for `magi`, the issue platform's MCP server (Linear: `linear`) and `browser`). Both `todo` and `triage` issues are dispatched; the human opens a triage session by clicking its card (in magi, which has no cards, the session is started directly and stops at the first thing it needs the human for). Handed over but not yet started sessions count against the cap where the runtime has such a state |
| `idea-loop:issue-session` | Intake → Merge | One issue's session, one spec and one branch `issue/<n>-<slug>`, the human's window for grilling and decisions. Two routes, chosen by the issue's state when it claims it. A **triage session** (opened by the human, or from a dispatcher card; claims `triage`) reads the issue and the triage evidence comment, drafts the spec through `to-spec` and `references/draft-spec.md` (self-check, grilling what needs the human), then design (`/idea-loop:uiux-imagine` → `uiux-refine`, started by the human), pushes the branch, flips the issue to `todo` with a comment naming the branch, and closes itself out (the runtime's "session wrap-up"). A **todo session** (opened by the dispatcher; claims `in-progress`) picks up the branch (or drafts the spec itself with `to-spec`; if something needs the human it flips the issue back to `triage` with a comment and closes itself out), then cuts tickets (`to-ticket`; tickets already cut are not cut again, so re-typing the command works), implements (`implement`) and reviews (`pr-review`) in this same session, opening a worktree on the same-named branch in every other repository the issue touches (the ISSUE_TRACKER.md 「仓库」 section), until all PRs merge and the issue is `done`. On a Linear project it reads and flips the issue the Linear way (`idea-loop:issues`), not with `gh` and `issues set`. A worktree the dispatcher already cut on `issue/<n>-<slug>` (magi) is used as is. On start it places itself by its state where the runtime has such placement (the desktop sidebar sections triage / in-progress / in-review) and titles itself `<repo>#<n> <title>`. "Put aside" is `issues.mjs set … backlog --comment=<where it stopped, the branch>`; the next session reads that comment. It closes itself out at the end (desktop: archives itself, which removes its worktree; magi: stops itself, since a session cannot archive itself) |
| `idea-loop:issue-triage` | Intake | Sorts the backlog. Without arguments (the weekly scheduled task `triage-<repo name>`, installed by `setup`) it takes the oldest 15 backlog issues from `issues.mjs backlog` and starts one `idea-loop:issue-triager` per issue, at most 5 at a time; each checks for a duplicate, the `docs/records/out-of-scope/` list, whether it is already implemented, reproduces it (output in `.tmp/triage/<n>/`), sets its category and posts one evidence comment through `issues.mjs note`. The session does not wait for the human: it flips each issue straight to the route its triager suggested (`todo` or `triage` with P1/P2, `canceled`, or stay in backlog; a project that skips triage has no `triage` route). `canceled` only comes from a duplicate, an out-of-scope hit, already implemented or not reproducible; an issue it cannot judge worth doing goes to `triage`, never `canceled`. It pushes only when an issue stays in backlog waiting for the human to add information, or a suspected P0 is found, naming those numbers. The `out-of-scope` record is written in the triage session where the human decides not to do a request (`idea-loop:issue-session`), not here. `全部` runs the existing backlog in batches of 15, one batch after another with no table to approve; `P0 <n>` (called by 「开一个 issue」 for a suspected P0) starts a single triager, and on a reproduction flips the issue to `todo`, sets `priority:P0` and notifies the human |
| `/idea-loop:grill` | Idea | Design-tree interview, one round of open questions at a time — facts are the agent's job, decisions are the human's |
| `idea-loop:retro` | Retro | Run at the end of an issue session (`issue-session`'s 「收尾」, before it closes itself out) or by the human saying "retro". Reads this session's own transcript file — not its context, which compaction has already thinned — squeezed by `scripts/session-digest.mjs` into every human utterance plus the conclusion of the AI reply before it (no tool calls or output). Finds three signals: the human's corrections and follow-up questions (one occurrence is enough), the human's choices on posed questions (the same kind at least twice across issues, no counter-example, counted from `docs/raw/decisions/` in the target repo), and directions the human volunteers (one occurrence; the human is asked which layer). Each candidate is shown with the verbatim words, where it happened, the layer (plugin skill / the target repo's rule files / a mechanical check), old and new wording side by side, how to verify afterwards that the change fixed that moment (a replay case's three parts, a check's name, or "can't verify" with the reason), and — when the retro reads the candidate pool (`docs/records/retro-candidates/`, harold-skills' pool read remotely with `gh` when it runs elsewhere) and finds the same kind already there — "this is the N-th time, merged into <that file>". The human answers approve-into-the-pool / approve-and-open-an-issue / reject / change; the retro never recommends between the two homes. It edits no rule file: an issue-bound candidate becomes a to-be-verified issue (plugin problems to harold-skills, project ones to the target repo); a pool-bound one is written into the pool by landing (plugin skill / agent / reference / script candidates go to harold-skills' pool, the target repo's own rule-file candidates to its own; a new file, or one more line in an existing file's 出现 section), where `dreaming` counts it. The questions put to the human and each candidate's outcome (`批·进候选池（<link>，第 N 次）` / `批·开 issue（<link>）` / …) are recorded in the target repo's `docs/raw/decisions/<issue>.md`, committed on the issue's branch when its PR is still open, else through a docs-only PR; a pool write into harold-skills from another repo is a second docs-only PR opened remotely with `gh` (no checkout), merged when checks pass |
| `/idea-loop:to-spec` | Spec | Turns the current context (a `grill` conversation, or an issue `issue-triage` has already reproduced) into one spec readable by humans as well as agents: one quoted line per covered issue saying whether it exists, the problem statement with its reproduction evidence, the plan (opening with an interaction sequence diagram; backend, front-end-internal and front-end-interaction sub-sections as needed), user stories as one tree per scenario (one expected behaviour per problem for pure fixes), implementation decisions, and testing decisions with agreed seams. Every section opens with one line saying what it gives the reader. A conversation also lands as a raw transcript. Settles what the written rules can settle (`idea-loop:decision-rules`), and gives every statement about the present state a source (the shared writing rules in `idea-loop:evidence`). When the issue is about a document an agent reads, it first diagnoses that document with `idea-loop:writing-for-agents` and lists its callers; the plan follows from both, each change naming the lever. A spec has no status: its frontmatter lists the issues it covers (`issues:`), and a spec that still has a 「需要 grill」 line or a 「待定」 fork keeps its issue in `triage` until the human settles it. The spec is committed on the work's branch and reaches main with the code PR (a spec that covers no issue: with the human present it is opened as a `todo` issue through `issues.mjs new`, otherwise the skill stops and asks). Figure rules: `idea-loop:evidence` |
| `/idea-loop:uiux-imagine` | Design · diverge | The skill runs the process; `idea-loop:uiux-imaginer` (latest Opus via the `opus` alias, effort high) does the work, one task at a time. It opens only the altitude that is still undecided and renders every round straight into a clickable comparison board with real motion, at the lowest fidelity that tells the variants apart. The skill shows each round to the human (the "browser" capability's show-the-human section), sorts the human's reply into a task (steer / apply to the picked variant / park for refine / reopen the language), and proposes wrapping up once nothing directional is left; the human declares it. Wrap-up hands ONE direction note (seven sections, a composition list per chosen variant, each item marked human-chosen or model-filled) plus a handoff canvas to `uiux-refine` via `docs/design/tmp/<spec-slug>/imagine/` under the worktree root (`git rev-parse --show-toplevel`; local, not in git) — no critic, no scoring. The imaginer does not research: a UX question it can only guess at goes back as a suggested research question with its recommended answer; the human decides whether to run `uiux-research`. When the project has no `DESIGN.md`, the imaginer drafts the first one and the skill writes it only after the human confirms the wording |
| `/idea-loop:uiux-refine` | Design · converge | The skill runs the process; two plugin agents do the work. Each round `idea-loop:designer` (latest Opus via the `opus` alias, effort high) delivers the next canvas version (`v1`, `v2`, …) from the handoff canvas `uiux-imagine` leaves behind (or from the direction note alone when there is none), and the session has a fresh `idea-loop:ui-master` (latest Fable via the `fable` alias, effort high, Read-only — it never sees the canvas code) score it, holds back any finding that touches an item the human chose and asks the human instead, scores the round with `critic-score.mjs` and either sends the rest back to the designer or stops at a bottleneck (`瓶颈`), a direction problem or a pass; after the pass come motion and assets when the brief calls for them, a subtraction round, an AI-tells round and the pre-sign-off checks. Every stop is shown to the human the same way. The designer does not research: a `pattern` finding it cannot settle becomes a "suggested research question", worked from its recommendation. Freezes (fully or partly) on the human's signature and writes interaction flows back into the spec; the design PR carries only the signed canvas, the freeze record and the flows, no `delta/`. After the freeze the canvas is the one design truth: when the human later accepts something that differs from it (accepting the implementation in review, accepting an implementer's way out of a stop, or changing their mind), the orchestrating session of that stage (`implement` before the PR opens, `pr-review` after) runs the shared `design-change-sync` skill (the steps are written once there, not in `uiux-refine`), which starts a `designer` on the task "design change" — it edits only the affected cells and hands back the next canvas version — and a fresh `ui-master` scores only those cells with the same `critic-score.mjs` and stop decision; once it passes, the session commits and pushes the canvas, adds one row to the freeze record's section "changes after the freeze", and sends an implementer after any ticket whose code now disagrees. The human does not review the redrawn cells separately |
| `/idea-loop:uiux-research` | Design · research | Run by the **human**, whenever they want to see how other products do something (no spec needed; model-invocable, so "look up how others do the leave-confirmation dialog" in plain conversation starts it). The skill turns the ask into one named question, picks the drop directory, and starts a fresh `idea-loop:uiux-researcher` (latest Opus via the `opus` alias, effort medium; tools: Refero's screens/flows, `curl`, writing files in the drop directory). The researcher downloads the reference screenshots and writes one `index.html` (relative paths only, opened through a static server and shown to the human the way the "browser" capability's show-the-human section says) — at the top the named question, a 「研究问题」 block with the human's own words and the context handed to the researcher, and what these products agree on; then per source a flow of screenshots (click to enlarge) with scene and design logic only; and last, after the final source, the questions the human must decide once all of that is read against our needs — checked by `scripts/research-check.mjs`; the caller only receives the page's path and one sentence, never Refero calls or whole screenshots. Files go to `docs/design/tmp/<spec-slug>/research/<question>/` (with a spec) or `docs/design/tmp/research/<question>/` (without), local and never in git. UX patterns, flows, usual page structure and copy tone only — never visual style. The orchestrator of `uiux-imagine` / `uiux-refine` calls it only when the human says to, and forwards conclusions to the executor only when the human says which, as text (never the pictures) |
| `/idea-loop:to-ticket` | Plan | Slices a spec with nothing left for a human (no 「需要 grill」, no 「待定」; design frozen if it touches UI) into tracer-bullet vertical cuts with blocking edges, writes the tickets and commits them onto the current branch (the implementers' worktrees are cut from it) without waiting for a nod. The cut (title / blocked by / end-to-end behaviour per ticket) goes into the final review report; it stops only when slicing surfaces a real decision question for the human |
| `/idea-loop:implement` | Build | Runs a whole spec: the calling session orchestrates, dispatching `idea-loop:implementer`s in parallel along the `Blocked by` frontier (up to three at once by default, each in its own worktree and a fresh context the first time; the pending ledger records each stopped ticket's implementer agent id, and once the human has decided, the orchestrator calls that same implementer back with `SendMessage` — pointers only, plus the integration branch's latest commit to merge first — and starts a new one from the half-finished branch only if that fails or no id was recorded; a ticket that has already landed is always redone by a fresh one, since its worktree is gone; an `idea-loop:explorer` writes shared pointer-only notes first; one ticket → one commit the orchestrator fast-forwards onto the integration branch, then reclaims the worktree; an implementer always calls `decision-rules` first, picks any other skill from what the ticket asks for, reads the whole spec as background (the ticket sets the scope) and, before writing, reads the target repo's written standards — `CODING_STANDARDS.md`, `REVIEW.md`, `AGENTS.md` / `CLAUDE.md` and what they link to — the same set the review's Standards axis judges by, picking the entry in `CODING_STANDARDS.md`'s links that governs the files the ticket changes and reading or calling it before writing, and listing which standards it read in the hand-back's `verified`; TDD at the agreed seams, human-verify flows and GIFs recorded from the implementation). Stops only for the human — a Review 汇报 (from implementation) shown in the session and kept in the PR's local review-loop file: what the implementers already settled by the existing way of the product or by fixing a legacy problem that spoiled the ticket (listed first, the human overturns any with one sentence), then the decisions that really need a human. When nothing waits for the human (no pending decision), the report is still written to the review-loop file with a closing "what was done", nobody is waited for, and the PR turns ready and goes into `pr-review` at once (queued rule replays still keep it draft). The PR turns ready once everything has landed. When the human accepts a design that differs from the frozen canvas at a stop, it runs the same design-change-sync route as above (designer edits the affected cells, a fresh `ui-master` scores them, commit and push to the integration branch, freeze-record row, implementer redispatched for any code that disagrees) |
| `/idea-loop:pr-review` | Review | One round per call on the open PR: an `idea-loop:pr-reviewer` runs the repo's own checks (changed lines only) and two read-only Codex processes — Spec and Standards — reproduces every behavioural Spec finding and shows it in whatever form is fastest to grasp, checks every quote and the wording mechanically, marks every finding with a disposition (by rule / the human decides, `skills/productivity/decision-rules/SKILL.md`), and writes the round's report, which the session shows the human and keeps in the review-loop file. Findings the written rules already settle are handled before the report is shown and listed first under "handled by rule"; the human can overturn any of them with one sentence. The rest the human rules on in the session; fixes go back through the tickets and the implementer; accepting the implementation where it differs from the canvas (or the human changing the design) goes through the design-change-sync route — a `designer` edits the affected cells of the canvas, a fresh `ui-master` scores only those cells, the session commits and pushes to the PR branch and records a freeze-record row, and nothing is hand-edited in `delta/`; when a round had fixes, they have landed and fewer than two rounds have run, the session starts the next round itself. When the local `docs/design/tmp/` holds design output for this spec (the `research/` folder `uiux-research` drops never counts as design output), an `idea-loop:ui-reviewer` walks the implementation against the frozen canvas each round (walkthrough mode: it only reports, never edits the canvas or `delta/`, and its two options are "change the implementation" or "accept it, via a design change"), started in the same message as the `pr-reviewer`; the pr-reviewer starts its Codex processes at once, waits for the findings file before writing the report inside the same 20-minute budget, and records the UI axis as incomplete if the file never shows up or the session wrote that the UI reviewer returned `incomplete`. Its findings are merged into the Spec section. On the human's word to merge, a leftover `tmp/` with design output goes through the pre-merge archive (the UI reviewer checks the implementation against the final canvas and writes the whole `delta/` → the human reads the draft → the archive script → commit and push), then the review loop is archived to the PR as comments, then the PR merges. The archive is a step of this merge flow, not a hook: merging on the web or from another session skips it, a known gap that the weekly `dreaming` backstops, so merges go through the issue session |
| `/idea-loop:dreaming` | Maintain | Rows are split by risk: only the rows about `DESIGN.md`, document conflicts and `GLOSSARY.md` (plus all `候选` rows) go to the human; every other row is executed as its own suggested disposition and merged by dreaming itself. Dreaming itself only orchestrates: it cuts a worktree from `origin/<base branch>` (from `DEVELOPMENT.md`), dispatches, merges the rows into one full table (never shown to the human), runs the check script, splits out the small table of rows that need a human (`proposal-table-check.mjs --split-ask`), executes the rest in a docs-only PR and merges it once the target repo's `REVIEW.md` verification commands, `spec.mjs check`, the link sweep, the archive check (when a design archive exists) and CI are green, then builds the review page and pushes for the small table only. Every reconciliation in the **proposal pass** (nothing is written) is done by a dedicated agent that is read-only there, with model and effort pinned in its definition; the three start in one message and depend on nothing but the worktree: `idea-loop:adr-reconciler` (`sonnet`, high — spec → ADR: is the spec shipped, drafts the ADR, marks superseded ADR sections, finds tickets a merged PR left behind; secondarily `docs/domain/`, reference manuals, `GLOSSARY.md` and `REVIEW.md` going stale; `CLAUDE.md` and `AGENTS.md` are out of scope), `idea-loop:design-steward` (`opus`, high — distills design-law candidates into `DESIGN.md`, audits `DESIGN.md` against the code and measures tokens; every proposed change to `DESIGN.md` comes from this one agent, so two sections never propose clashing edits), and `idea-loop:ui-reviewer` in reconcile mode (`sonnet`, high), which first checks the design archive (`docs/design/prod/`) against the source with no browser — the **source wave**: object code paths that no longer exist, components nothing references, routes the archive does not cover, entry URLs no route matches; it returns these as `档案对象` rows and only asks dreaming to scan a missing page (the whole-site initial scan stays in dreaming) — and then re-drives every state of the archive in a dev environment (each state is judged consistent / archive stale / entry stale / product broken / unreachable; within tolerance nothing is re-shot; a long page's entry state is shot section by section, each once its content has settled, and compared section by section; an empty archive gets a first draft from a whole-site initial scan, one row per page, executed as a whole page). Dreaming does one check itself, mechanically, with no agent: **missed archive** — a need whose `docs/design/tmp/<spec-slug>/` still holds design output (apart from `research/`) on `origin/<base branch>` while its spec is 完成 or gone was merged around pr-review's archive step (`references/missed-archive.md`); its row offers 补归档 (the UI reviewer's archive mode in dreaming's worktree, then the archive script once the draft passes its checks, in the same PR, with no human review of the draft) or 丢弃. A second one it also does itself, with no agent: **retro candidates** — it runs `scripts/retro-pool-count.mjs` over the current repo's candidate pool (`docs/records/retro-candidates/`, skipped when the directory is absent) and puts every candidate still `在池里` that has come up 3 or more times (a rejected one only when `scripts/retro-pool-reopened.mjs` finds a new session since its latest rejection, read from git history) into a `retro 候选` section, one row per candidate with the verbatim words of each occurrence; the execution pass follows each row's suggestion, opening an issue (to harold-skills for a plugin landing, to the target repo otherwise) and writing the candidate file's status back, or rejecting only where the candidate file records the human saying so, and dreaming never edits a skill itself (`references/retro-candidates.md`). The result is one proposal table (one row per object; closed set of dispositions per row type, checked by `scripts/proposal-table-check.mjs`; no push is sent for an empty table or when nothing needs the human). The `DESIGN.md` rows are put to the human as a review page, one card per row (`references/review-page.md`): a candidate card shows a screenshot of the UI the rule is about (from the design archive, else from the implementation), the exact rule text and the `DESIGN.md` section it lands in, and choices with their consequences and one recommendation; a maintenance card shows before → after and names the standard it rests on (a section of `skills/design/design-modeling/SKILL.md`, the official spec, or a lint rule name). The **execution pass** runs the automatic rows at once and, later, the asked rows the human approved, each as one PR that touches only `docs/`, `DESIGN.md` and `GLOSSARY.md`. Writing `DESIGN.md` always waits for the human; a broken product is never written into the archive and, like a rule the code disobeys, is opened as a backlog GitHub issue (one already open is not opened again). Pushes happen in three cases only: rows need the human, a PR could not be merged, or a part did not run; if the human says to roll a run back, a revert PR is opened and merged by the same rules. The run's `.tmp/dreaming/<date>/` is deleted only once the asked rows are handled and the automatic PR is merged. Manual runs may start just one agent, or hand `design-steward` a single rule to distill on the spot. **Scheduled and incremental**: dreaming is meant to run weekly from the scheduled task `/idea-loop:setup` creates (the "scheduled task" capability; how it is done is the runtime's, in `idea-loop:runtime`) (it can also be invoked by the model when the human asks for a reconcile in an ordinary conversation; either way the flow above is the same). The screenshot pass of the archive reconcile is **incremental** — it re-drives only the states the code touched since the task's last successful run (the baseline is the `origin/<base branch>` commit at that run's start time, read with the "scheduled task" capability — on the desktop `list_task_runs`, in magi `magi cron show`; a hand-typed run uses the same baseline and never moves it; no task or no successful run means a full pass, and so does the human saying "全量"). The states come from one more archive lookup, `design-archive-query.mjs … affected <commit>` (MCP `design_affected`): a changed file that is a page's registered code puts in all of its states, a component's registered code puts in the states using it, and a file those code files import directly counts as them changing; the source wave stays full every time. The first line under the proposal table's title says full or incremental, why, and how many states; if the last table is still unprocessed a second line says so (the two tables are never merged), and a batch that did not run is noted at the end with "下次可说全量补上" (`references/incremental-scope.md`) |
| `idea-loop:runtime` | Runtime | The capability list the flows are written against: scheduled task, in-session loop, session management, browser, asking the human, review page, push, sending files, calling an MCP, install and settings. Flows name a capability; this skill says what it needs and how to back off when the runtime lacks it (hand the work to the human and note it, with two exceptions: dispatch stops without session management, a missing grouping is skipped; asking falls back to the conversation). One reference per runtime (`claude-desktop`, `magi`) gives the concrete way to do each capability, or says there is none. A script (`scripts/runtime-detect.mjs`) prints the current runtime — `IDEA_LOOP_RUNTIME` when set to a known name, else `magi` when `MAGI_SESSION_ID` is set, else `claude-desktop` — and a `SessionStart` hook injects that as one line into the main session; sub-agents run the script themselves |
| `/idea-loop:seo-setup` | SEO · setup | Run once per target repo, by hand, with OpenSEO connected (the plugin's `.mcp.json` declares it; uninstall the standalone OpenSEO plugin first). Writes the root `SEO.md` (seven sections: site, OpenSEO budgets, competitors, key pages, build & check, writing, brand — brand terms are what the pages direction and keyword clustering leave out when judging cannibalization; a human who answers "none" gets `无` written at that item's own store — in `SEO.md` for competitors and brand terms, in the matching project-context section for business overview, goal and positioning — which reads as empty but confirmed, so no later scan asks again; the same file states the convention that every project fact a skill needs is inferred by setup, confirmed by the human, written down, and only read afterwards, with the per-direction table of what each direction needs; format in `skills/seo/seo-setup/references/seo-md.md`), syncs competitors and key pages one-way into the OpenSEO project context, adds the `seo` parent (its own dispatch queue, cap 5) and its five direction children to the `AGENTS.md` issue categories, creates an AI-visibility tracker only after the human approves the estimate, and asks (the "asking the human" capability) whether to install the weekly scheduled task that starts `idea-loop:seo-scan` (steps in `references/weekly-scan.md`; seo-scan is model-invocable so every runtime's scheduled task can start it), creating it only on a yes |
| `/idea-loop:seo-scan` | SEO · discover | Started weekly by a scheduled task, without arguments: `seo-due.mjs` reads the earlier scans in the OpenSEO research log and picks the directions due (`technical`, `pages` every run; `keywords`, `backlinks`, `geo` every four weeks, counted from the last run that collected them). Given directions, it runs just those. Before any budget or agent, a gap gate (`seo-gaps.mjs`) checks that the facts these directions need are written (competitors and brand terms in `SEO.md`; business overview, goal and positioning in the project context): if not, it infers each one with its source, sends a push (the "push" capability), lists them in the session and stops without starting any direction; once the human confirms or adds, it writes them (`SEO.md` edited in the working tree, `无` for an explicit blank; the project context via `update_project_context`, the section written `无` when the human says it is not needed) and carries on (re-reading the project context before it rechecks). Plans the credits (`seo-budget.mjs`: never below the floor, at most 2,000 per run, counting what the gate spent guessing competitors; the balance is read again after the gate), syncs the context (`seo-context.mjs`), starts one direction agent per direction in parallel — `technical-auditor`, `page-optimizer`, `keyword-miner`, `backlink-analyst`, `geo-analyst` (all `sonnet`, read-only) — which call the distilled method skills unattended and write findings to `.tmp/seo-scan/<run>/`, then hands the merged findings to `seo-issues.mjs`: rejects findings without evidence, repro or acceptance (or a percentage without its ratio), merges one kind per issue, comments on the open issue that already carries the same marker, opens the rest unlabelled (so they are backlog) and sets `type:seo/<direction>`. No cap — the `seo` queue in issue-dispatch (cap 5) limits concurrency without crowding out other issues. A summary goes into the OpenSEO research log; nothing is committed (a gate answer may leave `SEO.md` edited in the working tree) |
| `idea-loop:seo-audit`, `keyword-research`, `keyword-clustering`, `competitor-analysis`, `link-prospecting`, `seo-geo`, `seo-coach` | SEO · methods | Distilled from OpenSEO (and claude-seo for `seo-geo`, see `skills/seo/README.md`). With a human they work as upstream (ask, save, report); called by a direction agent they never ask or write and return the findings list; project information they need (business, goal, positioning, competitors) that is missing is not inferred and used, the gap and the part left undone go into `assumptions`. `seo-coach` is human-only |
| `idea-loop:seo-brief`, `seo-writing`, `seo-outreach`, `seo-check` | SEO · solve | Used inside the issue session the SEO issue points at: `seo-brief` writes a content spec's 方案 in the triage session (the spec then waits for the human's angle); `seo-writing` writes from the brief, polishes or mirrors, generic rules plus the project's own voice files named in `SEO.md`, with one type reference per page type; `seo-outreach` drafts one email per target plus a tracker in a docs-only PR and never sends; `seo-check` holds the Google/Bing standards and `seo-check.mjs`, which a post-build hook runs whenever a command rewrote the build output `SEO.md` names (arguments only, so a CI can call the same script) |

### The forward loop is not the maintenance sweep

`grill → to-spec → [uiux-imagine → uiux-refine] → to-ticket → implement →
pr-review` runs once per piece of work, on one working branch: the spec, the frozen design and the
tickets are committed there next to the code, and one PR takes them all to main (no separate spec or
design PR; `skills/productivity/wiki-conventions/SKILL.md`, section 知识库落地). Only work with no code
to ride along — a parent issue once it is split, an issue found absent, a dreaming run — lands through
its own docs-only PR.
**One state, on the issue** (`skills/engineering/issues/SKILL.md`): backlog → triage → todo →
in-progress → in-review → done, plus canceled. backlog is an open issue with no `status:*` label;
triage is the human's evaluation (grill, design), and the dispatcher gives each triage issue a session card the human opens when ready; `todo` is dispatched as well; a todo session opens a
draft PR as soon as the spec is committed, one per repository the issue touches, turns them ready
for in-review, and the issue is done once every PR is merged. A team without triage says so in
`ISSUE_TRACKER.md` and goes backlog → todo. Besides its status an issue carries `type:*` category
labels, defined in the project's `AGENTS.md`. **A spec is a document, not a second state**: its
frontmatter only lists `issues:`, `scripts/spec.mjs` reads it, and `scripts/issues.mjs` is the only
writer of an issue's status and checks the precondition before writing (for triage → todo: nothing
in the spec waits for a human, and a spec that touches UI has its freeze committed on the working
branch). Issues are not grouped by parent and child: one issue, one session, one spec.
**Issues on Linear** are supported: the project's `ISSUE_TRACKER.md` says `# Issue tracker：Linear`, sessions, the dispatcher and triage read and write the issue through the Linear MCP as `skills/engineering/issues/references/linear.md` lays out (in-progress is flipped at claiming, in-review and done are pushed by the GitHub integration), the `issues.mjs` commands that write GitHub issues refuse there, `issues check --from=<current state>` still checks every flip's precondition, and a spec's `issues:` may list keys like `ENG-123` (`spec.mjs` reads them as strings; an opening verdict line reads `> ENG-123 存在：…`). `issues new` takes `--repo=<owner/repo>` to open the issue in another repository.
`dreaming` is a **batch reconciliation** over the whole vault: the docs, the design archive and
`DESIGN.md`. It runs weekly from the scheduled task `/idea-loop:setup` creates, or by hand. It is not the
next step after `implement`.

**No stage in the forward loop writes an ADR.** ADRs are produced only in Maintain,
which is also where a finished spec is deleted (the contract's invariant: never delete
a spec before its ADR exists). So a spec sitting in `docs/spec/` with its work already
merged is a **normal state**, not an oversight — it is waiting for the next sweep.

Which skills the model may invoke itself:

| Model-invocable | Human-invoked only (`disable-model-invocation`) |
|---|---|
| `grill`, `retro`, `issue-triage`, `to-spec`, `to-ticket`, `implement`, `pr-review`, `uiux-research`, `writing-for-agents`, `seo-scan`, the SEO method and solve skills | `uiux-imagine`, `uiux-refine`, `dreaming`, `setup`, `agent-builder`, `seo-setup` |

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
  fixed in this ticket and reported as such, while an unrelated one becomes an issue the orchestrator opens (the reviewer does not hunt for legacy problems) (`skills/productivity/decision-rules/SKILL.md` 的「核心」). Everything else keeps going. A behaviour that is decided but cannot be proven inside this ticket
  is deferred to a named receiver; no receiver means it was undecided after all.
- **Bot identity.** The archive comments posted at merge come from the repository's GitHub App
  when `~/.idea-loop/github-apps.json` configures one (Pull requests write, Contents read); otherwise
  from the gh login, saying up front that Claude posted them. Claude never speaks as the human.
- **Delivery evidence never enters the code branch or `docs/`.** It lives on one orphan branch per
  PR (`scripts/evidence.mjs`), never merged, deleted when the PR merges, and is embedded as
  `blob/<branch>/<file>?raw=true` so clicking an image opens it full size instead of downloading it
  (`skills/engineering/pr/references/delivery-evidence.md`). Knowledge-base images — spec figures, frozen canvases — stay in `docs/`.
- **Two axes, reported apart** (`skills/engineering/pr-review/references/review-standards.md`). The reviewer runs the repo's
  declared checks and keeps only diagnostics on changed lines (`scripts/changed-lines.mjs`); each
  Codex process sees only its own question. A behavioural Spec finding that cannot be reproduced
  and drawn, or a Standards finding whose rule text or code is not where it claims, is discarded by
  `scripts/review-check.mjs` and listed in one folded line; a finding that stands but is missing a
  part or speaks in code terms is sent back for rewording before the report is shown.
- **What the agents settle themselves, and what they ask** (`skills/productivity/decision-rules/SKILL.md`). The
  core is solving the spec's problem with the spec's plan. A basis is one of three things — the
  text of a written rule, the human's own words already given, an existing practice with a named
  instance; when the basis is clear and nothing conflicts, the agent follows it and lists it first
  under "handled by rule" (`review-check.mjs` finds that text where it says it is), and an overturn is
  one more ruling, recorded verbatim. When bases conflict or there is none, it stops and asks. The
  guardrails — naming, production data, real payments, publishing, merging a PR that changes code —
  are always the human's (spec and design ride in the code PR; a docs-only
  PR for work with no code is merged once its checks pass). The same
  file says how a question for the human is written: options that differ where the reader feels it,
  a real example each, a recommendation. How each flow disposes of findings (the reviewer's
  disposition table, the implementer's stop-or-defer table) lives with that flow. `skills/productivity/evidence/SKILL.md`
  says what counts as evidence (source, time, version, numbers, like-for-like comparisons) and the
  overall style (conclusion first, figure beside the sentence it supports); which figure to draw is
  left to the model, and where it goes is up to the caller (`to-spec`'s `references/figures.md`,
  `pr`'s `references/delivery-evidence.md`). Section 4 of a drafted spec keeps what the
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
note's seven-section shape, the glossary lint, the seo scripts (SEO.md parsing, the missing-facts check, budget, context sync, audit regressions, issue planning against a fake gh, the two-platform check and its post-build hook), the DESIGN.md lint hook (against a fake CLI, no
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

`evals/uiux-research/` is the plugin's baseline, and it is deliberately not a pass/fail eval.
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
the "session management" capability (written as a capability name in the prompt; how is in `idea-loop:runtime`) (the arrival wakes it: all passed, it carries on; not all passed, it stops and puts the result to the human) and runs
`retro-replay.mjs --notify` (a macOS notification) when the session cannot be reached; a PR queued without a session id gets the
notification from the runner itself. A case that did not pass is not rerun: the result is the human's to rule on.

`/idea-loop:setup` does the machine-level part once: `scripts/retro-install.mjs` copies the runner to `~/.idea-loop/bin/` (a fixed path,
the one small replays use too), a scheduled task (the "scheduled task" capability) `idea-loop-retro-replay` runs `node ~/.idea-loop/bin/retro-replay.mjs --queue`
at 01:07 every night, and setup prints the permission rule `Bash(node ~/.idea-loop/bin/retro-replay.mjs:*)` for the human to add to
`~/.claude/settings.json` (setup never changes permission settings). The task's prompt is printed by `retro-install.mjs` as well, so setup and the task never drift apart. It starts the runner with Bash's `run_in_background` and waits for the exit wake-up, because a foreground Bash call is cut at 10 minutes and a PR's replay takes longer.

## Runtimes

idea-loop runs in two runtimes: the Claude desktop app (`claude-desktop`) and a Claude Code session started by magi (`magi`). The Claude command line and IDE plugins are not separate runtimes: they are detected as `claude-desktop`, and the capabilities they lack take the fallback. The capability list and one reference per runtime live in `skills/productivity/runtime/`; adding a runtime means one more reference and one more known name in `scripts/runtime-detect.mjs`. Force a runtime with `IDEA_LOOP_RUNTIME=claude-desktop|magi`; any other value is an error.

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
├── .mcp.json                         # two MCP servers: design-archive (read-only lookups of the design archive) and openseo (remote, the seo category's data source). The browser (on the desktop a user-level Playwright, headless and isolated) and Refero are set up by the human; `setup` only checks them
├── hooks/hooks.json                  # SessionStart → runtime-detect.mjs --line (one line: the current runtime); PreToolUse(Bash) → seo-check-hook.mjs; PostToolUse(Write|Edit) → design-lint-hook.mjs + design-md-hook.mjs + glossary-check-hook.mjs; PostToolUse(Bash) → seo-check-hook.mjs
├── agents/
│   ├── uiux-imaginer.md              # uiux-imagine's executor (idea-loop:uiux-imaginer) — `opus` alias, effort high, one per imagine run
│   ├── designer.md                   # uiux-refine's executor (idea-loop:designer) — `opus` alias, effort high, one per refine run; after the freeze one fresh per "design change" (the only editor of the frozen canvas)
│   ├── uiux-researcher.md            # uiux-research's executor (idea-loop:uiux-researcher) — `opus` alias, effort medium, one per research, Refero screens/flows + curl + file writes only
│   ├── ui-master.md                  # uiux-refine's critic (idea-loop:ui-master) — `fable` alias, effort high, Read-only, a fresh one per round, started by the refine session
│   ├── implementer.md                # implement's executor (idea-loop:implementer) — `sonnet` alias, effort high, one per ticket, its own worktree
│   ├── ui-reviewer.md                # the design archive's UI reviewer (idea-loop:ui-reviewer) — `sonnet` alias, effort high; pr-review starts it in walkthrough mode once per round, in the same message as the pr-reviewer, when tmp/ holds design output for this spec (`research/` never counts) — the state list and entry paths come from the frozen canvas and freeze record (plus the rows under "changes after freeze"; a need with only the implementer's minimal `delta/` keeps `delta/` as its list) — and once more in archive mode before merge to write the whole `delta/` and the archive draft, dreaming starts it in reconcile mode — a source-wave pass over the archive objects (no browser, first batch only) and then a re-drive of a group of prod/ states — and in archive mode for a 补归档 row
│   ├── adr-reconciler.md             # dreaming's spec → ADR reconciler (idea-loop:adr-reconciler) — `sonnet` alias, effort high, read-only, returns the `文档` rows
│   ├── design-steward.md             # dreaming's keeper of DESIGN.md (idea-loop:design-steward) — `opus` alias, effort high, read-only, returns the `候选` and `DESIGN.md 条目` rows; the only source of proposed DESIGN.md changes
│   ├── issue-triager.md              # issue-triage's per-issue checker (idea-loop:issue-triager) — `sonnet` alias, effort medium, one per issue (at most 5 at a time), read-only: duplicate / out-of-scope / already-done / reproduce / categorise, posts one evidence comment, returns one JSON line
│   ├── explorer.md                   # implement's scout (idea-loop:explorer) — `haiku` alias, effort high, pointer-only shared notes before a parallel dispatch
│   ├── pr-reviewer.md                # pr-review's reviewer (idea-loop:pr-reviewer) — `opus` alias, effort high, one per round, started together with the ui-reviewer; it waits for the UI findings file inside its 20-minute Codex budget
│   └── technical-auditor.md, page-optimizer.md, keyword-miner.md, backlink-analyst.md, geo-analyst.md  # seo-scan's direction agents — `sonnet`, effort medium, read-only, one per direction per run
├── README.md (this file)
├── skills/                          # four categories, each listed in plugin.json — rules in AGENTS.md; seo/README.md lists the seo skills and their upstream sources
│   ├── engineering/
│   │   ├── tdd/SKILL.md              # shared, model-invoked — red→green loop, seams, mock boundary
│   │   ├── issues/SKILL.md           # shared, model-invoked — the issue entity: the seven states and who flips them, the body format, backlog / blocked by, the issues.mjs commands; + references/github.md (driven by the script) and linear.md (read and written through the Linear MCP, tool by tool; `issues check --from` still gates every state flip), one per platform
│   │   ├── browser/SKILL.md          # shared, model-invoked — the "browser" capability: headless for your own capture and measuring, and showing a page to the human (how each is done, and what is not available, is the runtime's); static serving, logging in, measuring from the real DOM
│   │   ├── ui-measure/SKILL.md       # shared, model-invoked — implementation vs frozen canvas, cell by cell: the three environment rules (for the UI implementation loop only — the design archive's shots stop the page time instead), default tolerances, the matrix, when to stop
│   │   ├── pr/SKILL.md               # shared, model-invoked — what the human reads on a PR: the two deliverables, each with a table of sections and what each gives the reader: the description's seven sections (the review report: one sentence, problem, how it was fixed, how it was verified, whether it can be rolled back, your to-do, folded reference) and the Review 汇报 (stops during implementation and review rounds are one report); the review loop file keeps the latter (+ references/)
│   │   ├── setup/SKILL.md            # human-invoked; + references/ — templates for DEVELOPMENT.md, REVIEW.md, CODING_STANDARDS.md, ISSUE_TRACKER.md, PRODUCT.md, the CLAUDE.md / AGENTS.md block and the AGENTS.md issue-category section, plus the step-by-step material the SKILL.md keeps out of its body (preflight table, survey list, question list, nightly replay, weekly dreaming)
│   │   ├── issue-dispatch/SKILL.md   # the issue dispatcher — rounds, the two caps, candidates (todo, then triage), at most 3 a round, the report; how rounds run, sessions are counted and issues handed over is in idea-loop:runtime
│   │   ├── issue-session/SKILL.md    # one issue's session — a triage route (spec, grill, design → todo) and a todo route (spec, tickets, implement, review, merge → done); one spec, no child sessions; places itself by state where the runtime has placement
│   │   ├── issue-triage/SKILL.md     # backlog triage — weekly top-15 (or `全部` in batches, or `P0 <n>`), one issue-triager per issue, one batch flipped straight to each triager's suggestion, no table to approve
│   │   ├── to-spec/SKILL.md          # spec template inline (raw template, landing steps and where spec figures go in references/); routes the spec, lands it on main, labels its issues
│   │   ├── to-ticket/SKILL.md
│   │   ├── implement/SKILL.md        # orchestrates a spec's tickets — the work is in agents/implementer.md
│   │   │   references/ui-tickets.md, react-port.md  # UI tickets: canvas → the project's component tree, per-stack notes, the dev-only state harness
│   │   └── pr-review/SKILL.md        # one two-axis round per call — the work is in agents/pr-reviewer.md
│   │       references/review-standards.md    # the two review axes: inputs, what counts, reproduce-and-draw, per-finding disposition, mechanical admission
│   │       references/codex-spec.md, codex-standards.md  # the fixed Codex prompts per axis, filled by scripts/codex-prompt.mjs
│   │       references/deliver.md     # a round with nothing for the human: push the spec-done docs commit, wait for CI, write the review report into the PR description, stop; and what to do when the human asks for changes after the report
│   │       references/merge.md       # merge (no spec-done step, no CI wait), the pre-merge design archive, the post-merge cleanup
│   │       references/ui-walkthrough.md  # read only when the PR has design output: starting the ui-reviewer next to the pr-reviewer, and what to do when it returns incomplete
│   ├── design/
│   │   ├── design-modeling/SKILL.md  # shared, model-invoked — the DESIGN.md write standard: what each chapter holds, the admission table, one write's path, the candidate format, who writes
│   │   │   references/chapters.md, new.md, distill.md, reconcile.md  # each chapter; creating, distilling, reconciling DESIGN.md
│   │   ├── uiux-imagine/SKILL.md     # the divergent half — the process; the work is in agents/uiux-imaginer.md
│   │   │   references/imagine-canvas.md  # the board, cloning variants from a shipped UI, the handoff canvas, cleanup
│   │   │   references/direction-note.md  # the letter to refine: seven sections, composition list, provenance markers
│   │   ├── uiux-refine/SKILL.md      # the convergent half — the process; the work is in agents/
│   │   │   references/design/                # the design side (see below)
│   │   │   references/refine-canvas.md   # where the refine canvas lives and how its versions (v1, v2, …) advance
│   │   │   references/freeze.md, asset-stage.md, pinned-findings.md, after-freeze.md  # read only on their branch: sign-off, marketing assets, a pinned finding, committing the freeze and what comes after
│   │   ├── uiux-research/SKILL.md    # human-run design research — only the calling mechanism; the work is in agents/uiux-researcher.md
│   │   │   references/research-backend.md
│   │   ├── design-archive/SKILL.md   # shared, model-invoked — the design archive (docs/design/prod): the graph's entities and how they relate (page, state, edge, section, component, motion, journey; sources vs derived), directories and naming, the way-in derivation, and a read-on-demand table pointing at the references
│   │   │   references/writing.md, check.md, query.md, archive-script.md, shooting.md, review-archive.md, review-reconcile.md  # the last two are the ui-reviewer's archive and reconcile modes, read only when it runs in that mode; the rest: writing an object file (frontmatter shapes and required fields, section ids and locating, body, modeling choices, screenshot matrix); the seven validation rules with command and exit codes; the seven query entries' command, exit codes and return shapes; the archive script; shooting the archive screenshots (single screen, long page by section, in-section states, scroll-driven sections)
│   │   └── design-change-sync/SKILL.md    # shared, model-invoked — a design change after the freeze, called by `implement` and `pr-review` sessions: the designer edits only the affected cells of the canvas, a fresh ui-master scores only those cells (same `critic-score.mjs`), then commit, push and one row in the freeze record's "changes after the freeze"
│   └── productivity/
│       ├── grill/SKILL.md
│       ├── retro/SKILL.md            # model-invoked — end-of-session retro: rule candidates from the human's corrections, choices and directions; references/decision-record.md, references/candidate-pool.md (the pool file shape, judging the same kind, the human's replies, reading / writing harold-skills' pool remotely), references/session-digest.md (locating and compressing the transcript)
│       ├── writing-for-agents/       # shared, model-invoked; SKILL.md + SKILL-MECHANICS.md translated into Chinese from mattpocock/skills (MIT, see its LICENSE)
│       ├── glossary/SKILL.md         # shared, model-invoked — GLOSSARY.md: what goes in, format, who writes (grill; dreaming corrects with approval), who reads; references/target-repo-setup.md for the AGENTS.md block and CI snippet
│       ├── wiki-conventions/SKILL.md # shared, model-invoked — the docs/ contract — directories, frontmatter, status enums; references/migrate-flat-layout.md
│       ├── evidence/SKILL.md         # shared, model-invoked — what counts as evidence and the overall style for what a human reads; the figure kinds and their tools (UI screenshot marks, UI flow via flow-compose — references/ui-flow.md, excalidrawer charts or mermaid, GIFs — references/gif.md); where figures go is the caller's
│       ├── runtime/SKILL.md          # shared, model-invoked — the capability list (closed set), runtime detection and the one fallback; references/claude-desktop.md and references/magi.md give each capability's concrete way
│       ├── decision-rules/SKILL.md   # shared, model-invoked — solve the spec's problem by its plan; three kinds of basis, follow and list when clear, stop and ask on conflict, guardrails, how a question is written
│       └── dreaming/SKILL.md         # + references/ — proposal-table (shape, the ask-or-auto split, execution and self-merge), review-page (the cards a human approves DESIGN.md changes on), archive-reconcile (two waves, both run by the ui-reviewer; five verdicts), initial-scan, candidate-distillation, design-md-reconcile, docs-reconcile (the adr-reconciler's method), missed-archive, retro-candidates (the pool section of the table), incremental-scope (full vs incremental screenshot pass, the baseline from the scheduled task's runs)
├── evals/uiux-research/              # baseline: default prompts from real sessions + a minimal product context; `run.mjs` runs them, the human annotates the pages (see below)
├── evals/retro/                      # replay cases for rule changes: `retro-replay.mjs` runs one small case on the pre-change and post-change plugin and has a judging session answer its yes/no question; `--queue` runs the large ones at night (`queue.mjs` holds the window and queue decisions) (see below)
├── docs/
│   ├── pr-review-loop.md             # design record of the previous review loop — superseded, kept as history
│   └── design-modeling.md            # design record of the first design-modeling skill — its rules were folded into dreaming, then split back out as skills/design/design-modeling/SKILL.md; kept as history
└── scripts/
    ├── ui-compare.mjs                # the two deterministic comparators (measurement + pixel)
    ├── ui-compare.test.mjs           # their unit tests — the red/green of visual correctness
    ├── ui-measure.mjs                # playwright shell: one browser, two tabs, walks the matrix
    ├── critic-score.mjs              # the critic's output shape and the stop decision: direction / pass / plateau / continue (+ the CLI uiux-refine calls each round)
    ├── critic-score.test.mjs         # its unit tests
    ├── design-archive.mjs            # the design archive parsed: every object, edge and reference under docs/design/prod/ (optionally with a requirement's delta/ laid over it) — the layer queries, MCP and archiving reuse
    ├── design-archive-check.mjs      # the archive's seven validation rules (reachability, async, references, journeys, decisions/candidates, motions/usedBy, sections of a long entry state), file and field named; structure also covers an edge's `when`, a `{ text }` locate and the workspace prefixes of component names (`prod/index.md` `workspaces`, or `--workspaces`); hints for `content` / `position` sections; exit 0/1
    ├── design-archive-check.test.mjs # one red fixture per rule (rule 7 on the marketing fixture: nine bends, two hints) + `when` / text locate / workspace prefixes + the delta overlay + the old-layout note
    ├── skill-private-references.test.mjs # tripwire: no skill reads another skill's private `references/` ("`idea-loop:<other>` 的 `references/…`" or a path through its directory); a shared text is promoted to a skill or moved into the skill that really uses it; also scans `agents/`: every `skills/…/references/…` path an agent definition reads must exist and belong to a skill that starts that agent (a skill whose text names `idea-loop:<agent>`)
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
    ├── design-archive-skill-doc.test.mjs # tripwire: design-archive's SKILL.md body stays under 5000 characters, and every section title other skills and agents quote after `idea-loop:design-archive` is a heading of its SKILL.md or references/
    ├── seo-method-skills-no-inference-doc.test.mjs # tripwire: the four seo method skills (`keyword-research`, `seo-audit`, `link-prospecting`, `competitor-analysis`) say "缺了不推断" in the unattended branch of 项目上下文 step 3, name what is missing and what was not done, keep the human-present branch, and read a fact written as 「无」 as absent (no inference, no question, say what was not done)
    ├── design-archive-write.mjs      # the archive script — the only writer of docs/design/prod/: validate, fold delta/ in, drop removed.md, regenerate usedBy + index.md, move interaction figures and re-point the spec's links, say what LFS / .gitignore lack, empty tmp/<spec-slug>/; --dry-run writes nothing
    ├── design-archive-write.test.mjs # one requirement end to end, refuse-writes-nothing, dry-run, hints, and the pieces
    ├── mini-yaml.mjs                 # the dependency-free YAML subset the archive's frontmatter uses
    ├── mini-yaml.test.mjs
    ├── research-check.mjs            # uiux-research's gate: the page's head (question / 研究问题 = human's words / context / conclusion = general), every source's flow + scene / logic, the decisions block after the last source, every screenshot clickable and a relative path that exists, the chapters in the fixed order with nothing after the decisions block (what a chapter holds is the contract's prose, not a check)
    ├── research-check.test.mjs       # one per rule, plus the CLI exit codes
    ├── research-baseline.test.mjs    # keeps the uiux-research baseline well-formed: six cases, each with a prompt, a comparison line and an annotation file; the runner's stream digest
    ├── claude-stream.mjs             # reads a `claude -p` stream-json event stream — per-session tool counts, cost, and whether a plugin agent or a browser got involved; shared by both eval runners
    ├── claude-stream.test.mjs
    ├── retro-case.test.mjs           # the replay-case format: a missing commit / prompt / stop point / yes-no question / size / size basis is each reported by name; the shipped cases are well-formed
    ├── retro-queue.test.mjs          # the nightly queue's decisions: the 00:00–07:00 window (09:12 runs nothing, an empty queue exits at once), the queue file, and the result as a review-loop entry that `check` reads
    ├── retro-queue-run.test.mjs      # the runner's `--queue` / `--enqueue` end to end against a fake `claude`: pass and not-pass both clear the queue file, the clock passing 07:00 mid-queue, a bad queue file
    ├── retro-install.mjs             # copies the replay runner to the fixed path `~/.idea-loop/bin/` and prints the permission rule and the scheduled task's command and prompt (written with capability names); never touches settings
    ├── retro-install.test.mjs        # the installed copy works from there; installing again replaces it
    ├── retro-replay.test.mjs         # the replay runner's decisions (pass / case missed the problem / fail / abort a small case that started an agent / human override) and its flow end to end against a fake `claude`
    ├── direction-note-check.mjs      # uiux-imagine's exit gate: the seven fixed sections + each chosen variant's composition list
    ├── direction-note-check.test.mjs # its unit tests — one per droppable section / composition item
    ├── proposal-table-check.mjs      # dreaming's exit gate: row types, per-type disposition sets, two pictures on archive rows, a delete-object row names its referrers, an unreachable-state row says what was missing and tried, "product broken" never replaces the archive, a candidate row carries a picture, a missed-archive row's disposition is 补归档 or 丢弃, a `retro 候选` row's is one of 开 issue：机械检查 / 开 issue：改 skill / 留在池里 / 驳回 with its 证据 filled, DESIGN.md-bound rows carry old → new and a DESIGN.md row names its basis, empty-table test; `--split-ask[=<file>]` (the single place the ask-or-auto rule lives) pulls out the rows that need a human as a small table of the same shape, or says there are none
    ├── proposal-table-check.test.mjs # its unit tests, through the command line — the red/green of each rule
    ├── retro-pool-count.mjs          # counts the retro candidate pool (`docs/records/retro-candidates/`, one file per candidate): per file the title, landing, status and how many distinct sessions (`<repo>#<number>`) stand in its 出现 section, not counting lines marked 已推翻; passes at 3 or more (the human's "出现超过两次"); a file with no 出现 section or 状态 line, or a status outside 在池里 / 已开 issue（链接） / 驳回（理由）, is a problem and exits 2
    ├── retro-pool-count.test.mjs     # its unit tests, through the command line — 3 with 1 overturned is 2, 3 standing passes, one session counted once, the shape problems
    ├── retro-pool-reopened.mjs       # has a rejected candidate come up again since it was last rejected: reads git history, takes the latest commit that touched the `- 状态：驳回（` line (a second rejection with a new reason counts) and lists the sessions that stand now but were not named in the file as of that commit; order is commit order, never dates, so a same-day rejection and occurrence still resolve; a status that is not 驳回, or a rejection never committed, exits 2
    ├── retro-pool-reopened.test.mjs  # its unit tests, through the command line, on throwaway git repos — rejected once, a new session after, rejected again, a third session, same day / same second, overturned or repeated sessions, put back and rejected again
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
    ├── spec.mjs                      # reads a spec (frontmatter, `issues:`, still-waiting-for-a-human lines, touches UI, freeze summary); `index` re-indexes docs/spec, `check` reports the old flat layout and leftover `status` lines
    ├── spec.test.mjs                 # its unit tests — the readers, the index, the check
    ├── issues.mjs                    # the only writer of an issue's status:* and type:* labels — the flip table and its preconditions, candidates, reconcile, migrate from the old labels, label pruning
    ├── issues.test.mjs               # its unit tests against a fake gh
    ├── issues-skill-doc.test.mjs     # tripwire — the issues skill, its two platform references, and the tracker templates carry the seven states
    ├── pr-body.mjs                   # PR description = the review report, seven fixed sections (one sentence / problem / how it was fixed / how it was verified / can it be rolled back / your to-do / reference; an old issues section is folded into the rollback one); no code references outside reference
    ├── pr-body.test.mjs              # fixed order, new sections, old headings, untouched neighbours, size limit
    ├── evidence.mjs                  # delivery evidence: one orphan branch per PR, upload → image URLs that open full size, cleanup on merge
    ├── evidence.test.mjs             # owner-prefixed names, image types, size cap
    ├── runtime-detect.mjs            # prints the current runtime (IDEA_LOOP_RUNTIME → MAGI_SESSION_ID → claude-desktop); `--line` is the SessionStart hook's one line
    ├── runtime-detect.test.mjs       # detection rules, unknown forced name, the hook is registered and prints one line
    ├── runtime-tripwire.test.mjs     # tripwire — skills/ and agents/ carry no runtime-specific tool names, commands or paths (the runtime references and frontmatter tool declarations are the only things let through); a hit prints file:line, rule and the line
    ├── runtime-skill-doc.test.mjs    # tripwire — the runtime skill's capability list and both references match one to one; the desktop reference keeps every 0.1.10 tool name
    ├── browser-lock.mjs              # one lock for the session's shared browser where the runtime has one (desktop), so parallel implementers take turns
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
| The two former design skills | `skills/design/uiux-refine/references/design/static-protocol.md` (surface, module and component altitudes in one file), `skills/design/uiux-refine/references/design/motion.md` — demoted to on-demand protocols |
| The `DESIGN.md` spec | Format: the official `@google/design.md` spec, read at run time (`npx -y @google/design.md@latest spec`). What may enter, how to write it, how a write goes, the candidate format, who may write: `skills/design/design-modeling/SKILL.md` |
| The lint hook + rules + their unit tests | `hooks/hooks.json`, `scripts/design-lint*.mjs` |
| The browser | the "browser" capability, done as the current runtime says (`skills/productivity/runtime/references/`; on the desktop a user-level `playwright` MCP, headless and isolated, checked by `setup`; in magi `magi browser`); how to use it: `skills/engineering/browser/SKILL.md` |
| The design archive's lookups | `.mcp.json` (`design-archive`, `scripts/design-archive-mcp.mjs`) |
| Design research | user-level `refero` MCP (the human adds it with their own token), checked by `setup` |

The design critic (`agents/ui-master.md`) has no separate rubric: it judges the gap to what a top
studio would ship, lists the biggest gaps first (each routed by `kind`: direction / pattern / craft)
and scores 1–10, 9 and up meaning the studio would ship it as-is. `scripts/critic-score.mjs` checks
the shape and turns the round into a stop decision (direction, pass, a three-round plateau, or continue).

Nothing in `skills/design/uiux-refine/references/design/` is an entry point. They are loaded on demand by whichever
step is running; the hooks are the only pieces that fire on their own. One fires only on a
`Write`/`Edit` whose path lands in a canvas HTML — `docs/design/tmp/<spec-slug>/canvas/*.html`, or the legacy
`design-preview/` / `design-motion-preview/` scratch dirs; the other only on a write to a file named
`DESIGN.md`, where it runs the official `@google/design.md` lint at `@latest` and hands any error
back to the model. There is no pre-merge hook: the design archive is a step of `pr-review`'s merge flow
(`skills/engineering/pr-review/references/merge.md`). The known gap is that clicking merge on the web, or merging from a session
other than the issue session, skips the archive; the weekly `dreaming` backstops it, so merges go through the issue session.

What retired outright, because its content was already relocated: the `design` entry skill,
the port-verification skill
(→ `skills/engineering/implement/references/ui-tickets.md` and the `ui-measure` skill, which generalized it past React), and the
`wireframe-candidates` workflow (its structural-divergence audit moved into `prototype`, which was later removed too).
