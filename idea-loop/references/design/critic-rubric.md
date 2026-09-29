# Critic rubric — what a score means, and what it may not mean

The rubric the critic reads before every round of the design loop. It answers one question and
declines the rest: **measured against the aesthetic this work is reaching for, how well is it
executed?** Nothing here scores whether the thing is usable, legible, accessible, or on-brand —
those have their own gates, listed at the bottom, and folding them in here would let a
contrast failure and a timid type scale cancel each other out into a meaningless 7.

The stop threshold is **9**, and it is written here on purpose. The critic sees it. What keeps a
critic from simply typing 9 is not secrecy — it is that the score has to survive
`scripts/critic-score.mjs`, which recomputes the allowed band from the findings the critic just
wrote. A 9 under a P1 is an invalid round and the critic is rerun.

## Severity ladder

Each rung is anchored to what an AD at a top studio would actually do with the work — not to how
bad it feels.

| Severity | Definition | The AD's action | Dimension it lands on |
|---|---|---|---|
| **P0** | The aesthetic the screen reads as is not the one it wants; or it hits any entry in the slop catalog | Reopen the direction — do not revise this comp | Philosophy; the filler half of Specificity |
| **P1** | The squint test fails: the eye lands nowhere, primary and secondary compete; or several flourishes fight each other | Send this block back to be recomposed | Hierarchy; Restraint |
| **P2** | Type size, tracking, spacing, alignment, contrast are "close but not right" — there is a fix you could put a ruler on | Red-pen it, one more round | Execution |
| **P3** | Something an AD notices but would not hold the release for | Fix it in passing; not a blocker | Headroom in any dimension |

### Kind, and where each one goes

Every finding also carries a **kind**, and the legal kinds are constrained by severity — a P0 is
never a craft note, a P2 is never a direction argument:

| Severity | Legal kinds |
|---|---|
| P0 | `direction` |
| P1 | `pattern` or `craft` |
| P2 | `craft` |
| P3 | `craft` |

`direction` reopens the direction. `pattern` is the one kind that may summon reference research —
it is a named question ("what do studios do with a filter rail this dense?"), never a pre-work
browse. `craft` is fixed in place in the current comp.

## Score bands

The worst finding of the round sets the ceiling. Count moves the score inside that ceiling; it
never lifts it. **Every count below is a number, read literally** — "two or more P2" means two
counts. A critic that feels two P2 do not add up to much should say so in their severity, not by typing a
score outside the band: the number is audited, the feeling is not.

| Score | Findings | What it means |
|---|---|---|
| 10 | none | The critic cannot find anything it would put a hand on |
| 9 | 1–2 P3, nothing worse | The studio would ship this as-is |
| 8 | at least one P2 and no P1; or 3 or more P3 and nothing worse | Approved, but one more red-pen round |
| 7 | exactly one P1, with at most one P2 | One block needs recomposing |
| 6 | two or more P1; or one P1 with two or more P2 | More than one block needs recomposing |
| 4–5 | exactly one P0 | Direction drift or slop — reopen |
| 1–3 | two or more P0 | Not an execution problem, a brief problem |

`scripts/critic-score.mjs` implements this table row for row — when one changes, both change, and
its test suite fails if a word stands in for a number in this section again.

## What the check returns

`checkRound(findings, score, history, invalidBefore)` is a pure function. It takes the round's
findings, the critic's score, the worst severity of each previous round, and how many runs of
this round were already thrown away, and returns two things:

- **valid / invalid** — invalid means the score is outside the band its own findings allow. Rerun
  the critic; do not argue the number down.
- **stop judgement** — `continue`, `pass` (≥ 9), `plateau` (three rounds running at the same worst
  severity — more rounds are not going to help), or `direction` (a P0 is present; the next move is
  a new direction, not another polish pass). On an invalid run it is empty, except on the second
  invalid run of the same round, which is `stuck`: two invalid runs in a row nearly always share a
  shape, which means this rubric and the script disagree about a word — a defect to fix here, not
  a critic to rerun a third time.

It never assigns a score. Scoring is the critic's judgement; this is the audit.

## Material this rubric stands on — read it there, it is not copied here

- **The five dimensions** (Philosophy / Hierarchy / Execution / Specificity / Restraint) and the
  close-out protocol they belong to: `design-core.md` §6.
- **The P0–P3 severity semantics** that the ladder above specializes for aesthetics:
  `heuristics-checklist.md`.
- **The slop catalog** that a P0 can hit, and the **reference-averaging** ban that governs how a
  `pattern` finding may use research: `ui-craft-checklist.md` §2.

## Not this rubric's business

| Concern | The gate that owns it |
|---|---|
| Usability heuristics (Nielsen, cognitive load, persona scoring) | `heuristics-checklist.md`, run at `static-ui-protocol` / `motion-protocol` Gate 2 |
| Contrast and accessibility | `accessibility-baseline.md`, verified against computed style from the real DOM at the same Gate 2 |
| DESIGN.md compliance and brand floors | the `design-lint.mjs` hook (mechanical, Gate 1) plus the DESIGN.md drift check in `ui-craft-checklist.md` §5 |

A critic that finds one of these should say so where that gate lives, not convert it into a score
here.
