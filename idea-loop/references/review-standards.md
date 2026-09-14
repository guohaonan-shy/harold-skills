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
- Later rounds cover fix deltas and affected paths. Do not reopen dismissed/accepted findings
  without new evidence or introduce new nits. Widen scope for changed mechanisms, accepted
  scope expansion or concrete regressions; explain why.

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

Close a fix only after a separate verifier repeats the ORIGINAL failure path at the fix SHA
and checks relevant regressions. Silence from generic Codex review is not resolution evidence.
Label static verification and do not substitute it for required runtime verification.
Stochastic evals use the agreed repeated comparison protocol.

## Severity and disposition

Prefer the target contract. Otherwise P0 critical, P1 serious regression/core requirement,
P2 proven limited-impact defect; suppress P3 polish. P0/P1 normally block. A P2 blocks only
with an explicit project/acceptance rule cited in the body. Do not auto-upgrade Spec findings
or tool diagnostics. Explain impact evidence for changes to the original reviewer's priority.

Status and priority are independent: confirmed, needs-verification, needs-decision, resolved,
dismissed, accepted-risk. Specify blocksMerge separately. Required verification/decision gaps
prevent readiness without becoming falsely confirmed bugs. Dismissal needs a rebuttal;
accepting risk needs a linked explicit maintainer decision. Outdated locations are not resolution.
