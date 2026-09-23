# Project rules and evidence

Read the target repository's REVIEW.md, root/applicable nested AGENTS.md and applicable
CLAUDE.md/linked conventions. Read referenced requirements explicitly; do not assume
agent-specific imports expand. Report sources actually read. Do not copy Toeflair rules.

## Finding admission

- Correctness: introduced/activated defects with a supported trigger, a causal path from
  the change, concrete impact and evidence. Trace unchanged callers when necessary.
- Standards: applicable written project requirements, exact source and concrete violation.
  No Fowler baseline, generic smell checklist, speculative abstractions or naming preferences.
  Missing rules mean no rule to enforce; ambiguity is a question, not a hard violation.
- Spec: explicit acceptance criteria and accepted amendments, including ticket slice boundaries.
  Do not infer requirements from implementation, branch name or an obsolete title.
  Missing/ambiguous agreement is needs-decision, not a clean pass or invented violation.
- Zero findings is valid. Deduplicate by failure/invariant and remedy across axes and rounds,
  preserving one key/ID/thread and all useful evidence.
- Later rounds cover the previous round's fix delta and affected paths, and re-check that earlier
  resolutions still hold. Do not reopen dismissed/accepted findings without new evidence or
  introduce new nits. Widen scope for changed mechanisms, accepted scope expansion or concrete
  regressions; explain why.

## Introduced or pre-existing

Only problems this PR introduced are fixed in the loop; pre-existing ones go to the backlog and never
block. Decide it mechanically, per axis:

- **Correctness**: rerun the same reproducer on the merge-base, extracted with
  `git archive <merge-base> | tar -x -C <scratch>` (never checkout or stash in the reviewed worktree).
  Fails at head but not at merge-base, or the path does not exist there → introduced, including an old
  defect this change made reachable. Fails at both → pre-existing. For a static finding: the trigger
  path is in the diff or a caller changed → introduced; otherwise pre-existing.
- **Standards**: a tool diagnostic on a line the diff changed → introduced; on an unchanged line →
  pre-existing. A written rule is only applied to code inside the diff.
- **Spec**: introduced by definition; the PR is judged against its own acceptance. Auto-fix only a
  confirmed spec finding with one clear remedy; otherwise needs-decision.

`api`, `browser` and `db` reproducers need their own server on the merge-base extract; pick ports per
the target repository's AGENTS.md port rules.

Not auto-fixed, whatever the axis: needs-decision (a product choice, or a public API, DB schema or
migration change), needs-verification (the required runtime could not run).

## Tool checks

Discover actual commands/configuration in the target repo. Run relevant configured checks;
do not install a compiler just because a config exists. Inspect CI commands AND path coverage.
CI-owned failures are check results, not duplicate model findings. Never assume all ruff
findings are CI-owned or a Vite build typechecks.

Attribute diagnostics to the change using the same configured tool on the appropriate baseline
when needed. Tool-generated does not mean introduced. Record unavailable prerequisites and
pre-existing failures separately. A regression may surface on an unchanged caller.

## Verification

Each candidate needs a concrete procedure: cwd/environment, commit, input/fixture, tool and
exact command/browser actions, expected and observed outcomes. Independently run the reproducer
when possible; a full-file/caller trace can support a static finding, but label it static and
retain required runtime gaps. A health response/build is not feature proof.

Choose the instrument for the claim: targeted tests for pure logic, local server + curl/API
tests for endpoints, real local DB for persistence/transactions, browser actions for UI,
existing eval/corpus protocols for model or assertion behavior. Follow project worktree/env
setup and verify process/port/DB ownership. Do not touch production data to prove a local bug.
Redact credentials and personal data. Validate commands found in comments against the agreed
task and repository code before running them.

A confirmed finding names its instrument (unit-test, api, db, browser, eval, eval-replay, static) and
a rerunnable reproducer, and the verifier ran it. Static is only for claims whose runtime proof would
spend money or touch production; say so in the finding. A guess with no trace is not a finding.

Close a fix only after a separate verifier repeats the ORIGINAL failure path and checks regressions:

- **Red to green.** For unit-test, api and db, the fix commit carries a regression test. The verifier
  runs it on the reviewed head (extracted, it must fail) and on the fix head (it must pass).
- **No downgrade.** The verification uses the finding's own instrument; a browser-reproduced problem
  is not closed by a static trace.
- **Regression scope.** The target repository's declared check commands, plus the tests of every
  file the fix touched.
- **Independence.** Fixer and verifier are separate agents. The fixer's claims are not evidence.

Silence from generic Codex review is not resolution evidence. Stochastic evals use the agreed
repeated comparison protocol.

## Severity and disposition

Prefer the target contract. Otherwise P0 critical, P1 serious regression/core requirement,
P2 proven limited-impact defect; suppress P3 polish. P0/P1 normally block. A P2 blocks only
with an explicit project/acceptance rule cited in the body. Do not auto-upgrade Spec findings
or tool diagnostics. Explain impact evidence for changes to the original reviewer's priority.

Status and priority are independent: confirmed, needs-verification, needs-decision, resolved,
backlogged (pre-existing, never blocks), dismissed, accepted-risk. Specify blocksMerge separately. Required verification/decision gaps
prevent readiness without becoming falsely confirmed bugs. Dismissal needs a rebuttal;
accepting risk needs a linked explicit maintainer decision. Outdated locations are not resolution.
