# Critic rubric — what a score means, and what it may not mean

The rubric the critic reads before every round of the design loop. The critic is given **only what
the screen looks like** — a screenshot, or for motion a time-ordered set of frames — and this file.
No code, no earlier rounds, no brief about what the design is meant to be. It answers one question
and declines the rest: **read the aesthetic this screen is going for off the screen itself; measured
against how a top studio would execute that aesthetic, how well is it executed, and where are the
biggest gaps?** Whether that aesthetic is the one the project asked for is not the critic's question
— a human judges that against the direction note at sign-off. Nothing here scores whether the thing is usable, legible, accessible, or on-brand —
those have their own gates, listed at the bottom, and folding them in here would let a
contrast failure and a timid type scale cancel each other out into a meaningless 7.

Score what you see. This file does not say what score ends the loop, and the critic is not told —
a critic that knows the finish line drifts toward it. The number is not free either: it has to sit
inside the band that the critic's own findings allow (the table under Score bands), and
`scripts/critic-score.mjs` checks that every round. A number outside the band throws the round away.

## Severity ladder

Each rung is anchored to what an AD at a top studio would actually do with the work — not to how
bad it feels.

| Severity | Definition | The AD's action | Dimension it lands on |
|---|---|---|---|
| **P0** | The screen does not hold one aesthetic — it reads as none, or as two at war; or it hits any entry in the slop catalog | Stop polishing this comp — the direction itself is in question | Philosophy; the filler half of Specificity |
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

`direction` stops the loop and puts the direction in front of a human. `pattern` is the one kind that may summon reference research —
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
its test suite fails if a word stands in for a number in this section again. How the loop reads
the result — when it ends, when it gives up — lives in that script and in `uiux-refine` §5,
not here: the critic does not need it and should not have it.

## What you hand back — exact literals

One JSON object and nothing else. Field names and values are **exact strings, lower-case where
shown**; anything else fails the schema check and the round is thrown away, however good the
reading was.

```json
{ "findings": [ { "dimension": "hierarchy", "severity": "P1", "kind": "craft", "where": "group header", "detail": "…", "why": "…" } ], "score": 7 }
```

| Field | Allowed values |
|---|---|
| `dimension` | `philosophy` · `hierarchy` · `execution` · `specificity` · `restraint` |
| `severity` | `P0` · `P1` · `P2` · `P3` |
| `kind` | `direction` · `pattern` · `craft`, legal only in the combinations under "Kind, and where each one goes" |
| `where` | a string naming the place on the screen, or `null` |
| `detail` · `why` | strings |
| `score` | an integer 1–10, inside the band your findings allow |

Every finding carries all six fields — no more, no fewer. The prose above names the dimensions in
title case; the JSON takes them lower-case.

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
