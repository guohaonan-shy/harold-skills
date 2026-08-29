# Laws of UX — composition rules grounded in named research

Universal cognitive, perceptual, and behavioral heuristics that decide what a UI *composes* — how
many pricing tiers fit on a screen, where a primary action anchors in scanning order, when a
progress indicator earns its place, why a settings list needs grouping. `design-core.md` decides
brand/taste and the anti-slop floor; `expression-framework.md` already encodes several of these
laws as prescriptive ladders and budgets (see the cross-references below — this file names the
underlying research, `expression-framework.md` operationalizes a subset of it). This file's job is
the laws `expression-framework.md` doesn't already cover: Gestalt grouping, decision framing,
memory/recall, motor/interaction timing, and behavioral expectation.

> Distilled from primary sources: Wertheimer (1923) for proximity/similarity/Prägnanz, Palmer
> (1992) for Common Region, Palmer & Rock (1994) for Uniform Connectedness, Kurosu & Kashimura
> (1995), Tversky & Kahneman (1974) for Anchoring, Pareto (c.1906)/Juran (1951), Tesler (Apple,
> 1980s), Ockham (14th c.), Ebbinghaus (1885), Kahneman/Fredrickson/Schreiber/Redelmeier (1993) for
> Peak-End, Zeigarnik (1927), Fitts (1954), Doherty & Thadani (1982), Csíkszentmihályi (1975), Hull
> (1932), Postel (RFC 760, 1980), Nielsen (2000), Norman *POET* (1988), Carroll & Rosson (1987),
> Parkinson (1955), Sweller (1988).

**These are guidance, applied by the reviewer and the agent — not auto-checked** by
`design-lint.mjs`, unlike the mechanical rules in `design-core.md` §5.

## Already operationalized elsewhere — don't re-derive

`expression-framework.md` already turns four of the best-known laws into this plugin's actual
ladders and budgets: **Selective Attention** and **Von Restorff Effect** → its congestion budget
(§5, "reserve the strongest contrast for the single goal-relevant signal"); **Hick's Law** and
**Choice Overload** → its priority ranking (§1 step 2, "≤1 primary, 2–3 secondary") and decision-
screen caps. Cite the law name if it clarifies a review comment; don't restate the mechanics here.

## Perception and visual grouping

Five Gestalt laws govern how the eye groups elements before the brain reads them — none of these
are covered by `expression-framework.md`'s ladders, which assume weight is already assigned and
answer a different question (how loud, not how grouped).

- **Law of Proximity** (Wertheimer, 1923). Objects near each other read as a group — the cheapest
  grouping signal, cheaper than borders or shared color. Use variable vertical rhythm: 8–12px
  within a group, 32–48px between groups. Uniform spacing reads as nothing being grouped.
- **Law of Similarity** (Wertheimer, 1923). Visually similar elements read as a group. Equivalent
  affordances must share treatment — every list row the same class set, every secondary button
  identical, every destructive action identical. Visible deviation is reserved for the one item
  meant to draw attention.
- **Law of Common Region** (Palmer, 1992). A shared bounded area binds enclosed elements. Use
  enclosure when proximity alone isn't enough, and reserve it: padding ≥16px inside the region, a
  distinct surface (border + tinted background, or ≥1px hairline card chrome). A page where every
  section is bordered destroys the signal.
- **Law of Prägnanz / Good Figure** (Wertheimer, 1923). The eye resolves complex layouts into the
  simplest underlying form. A layout that aligns with a clear grid (12-column, F-pattern,
  4-quadrant) feels inevitable; an ornate break that adds nothing semantic feels arbitrary.
- **Law of Uniform Connectedness** (Palmer & Rock, 1994). The strongest grouping signal in the
  Gestalt hierarchy — connected lines, shared toolbars, bracketing containers tie items together
  more strongly than proximity or similarity. Use for wizard steps, comparison sets, explicit
  navigation flows.
- **Aesthetic-Usability Effect** (Kurosu & Kashimura, Hitachi Design Center, 1995). Visual polish
  biases perceived usability — refined typography, generous whitespace, a calm palette earn the
  benefit of the doubt for minor friction. Never a substitute for measurable usability or for the
  runtime-states contract (`design-core.md` §7.3).

## Decision-making

- **Anchoring** (Tversky & Kahneman, *Science* 185, 1974). The first number a user sees re-weights
  every subsequent number. Place the recommended pricing tier where it anchors the comparison;
  render yearly-billing savings as concrete dollar deltas, not just a percentage badge; pre-select
  the safer default in radio groups. Visual weight matches intended decision weight.
- **Pareto Principle / 80-20** (Pareto, c.1906; Juran, 1951 for the management framing). A small
  share of features drives most of the value. Identify the 2–3 actions that drive the dominant
  journey for the target persona; emphasize those; demote the long tail to overflow menus, footer
  surfaces, or settings.
- **Tesler's Law / Conservation of Complexity** (Tesler, Apple, 1980s). Every product has an
  irreducible amount of complexity — the design choice is *where* it lives (engineering, interface,
  user), not whether to eliminate it. When complexity reaches the user, surface contextual guidance
  (tooltips, smart defaults, inline empty-state coaching) at the exact step where it surfaces.
- **Occam's Razor** (Ockham, 14th c.). Among options that explain the data equally well, prefer the
  one with fewest assumptions. Specify a minimal element inventory; forbid decorative chrome that
  doesn't serve a stated user task. Constrains assumptions, not feature count.

## Memory and learning

- **Working Memory / Recognition over Recall** (Baddeley & Hitch, 1974). Items decay in seconds
  without rehearsal. Recognition beats recall: persist prior context across screens, mark visited
  elements, surface comparison views instead of forcing the user to memorize. On dashboards:
  sticky filter chips, last-N selections persisted, breadcrumbs that include applied filters.
- **Serial Position Effect** (Ebbinghaus, 1885). Recall favors the extremes — primacy at the start,
  recency at the end — while middle items fade. Anchor the most important nav items at the
  leftmost and rightmost positions of a horizontal menu; cluster utilities in the middle.
- **Peak-End Rule** (Kahneman, Fredrickson, Schreiber, Redelmeier, *Psychological Science*, 1993).
  Memory of an experience is dominated by the emotional peak and the ending, not the average. Stage
  a high-effort celebratory success state; let intermediate steps stay calm. The peak belongs at
  the *end* of a flow, not as arbitrary mid-flow motion — `motion-spec.md` §1's "motion must mean
  something" already rejects motion that performs rather than confirms a state change.
- **Zeigarnik Effect** (Zeigarnik, 1927). Uncompleted tasks create cognitive tension that pulls the
  user back. Visible progress ("3 of 5 steps", greyed-out next sections) converts that tension into
  completion pressure. Reserve for genuinely beneficial flows like onboarding — applying the same
  lever to streaks or notification-reduction nags is a dark pattern.

## Interaction and motor

- **Fitts's Law** (Fitts, 1954). Time to acquire a target depends on its distance and size — bigger
  and closer is faster; spacing between adjacent hit zones matters as much as size. Pair with
  `accessibility-baseline.md`'s 24×24 CSS px AA touch-target floor; on mobile, place high-frequency
  controls in the natural thumb arc.
- **Doherty Threshold** (Doherty & Thadani, *IBM Systems Journal*, 1982). Sub-second feedback keeps
  users in flow; latency above ~1s breaks attention. Working directive: no indicator under 300ms;
  skeleton 300ms–2s; labelled spinner 2–10s; determinate bar with cancel 10–60s; stop and offer
  error/retry past 60s — this is also the loading-state timing under the runtime/fallback model
  (`design-core.md` §7.3).
- **Flow** (Csíkszentmihályi, 1975). Flow sits in the balance between challenge and skill — too
  hard breeds frustration, too easy breeds boredom. Continuous feedback and a clear sense of
  control keep the user inside the state; system friction and latency are the fastest ways to
  break it.
- **Goal-Gradient Effect** (Hull, 1932). Motivation to finish rises as the goal gets closer.
  Multi-step flows render a progress indicator reflecting *real* endowed progress — show completed
  prerequisites only when they truly exist. When no real prerequisite exists, render the current
  step honestly as "1 of N." Fabricated progress or streak dark patterns are a misread of the law,
  not an application of it.
- **Postel's Law / Robustness Principle** (Postel, RFC 760, 1980). "Be liberal in what you accept,
  conservative in what you send." Take input in whatever shape users naturally give it (phone
  numbers with/without dashes, mixed date formats, percentages with/without `%`); normalize
  internally; emit one consistent format on output.

## Behavior and expectation

- **Jakob's Law** (Nielsen, 2000). Users spend most of their time on other sites and expect yours
  to work the same. Reuse category convention — nav placement, cart icon, settings gear, primary
  CTA position — so the user spends zero cycles relearning interaction grammar. Novelty must earn
  its keep against the convention's ROI.
- **Mental Model** (Norman, *POET*, 1988). Every user arrives with a prior built from competitor
  products and the physical world. When the brief names a reference product, anchor explicitly —
  capture the reference and inherit its transferable interaction grammar.
- **Paradox of the Active User** (Carroll & Rosson, 1987). Users skip the manual and start using
  the software immediately, even when reading it would speed them up. Bake guidance into the
  surface itself — empty-state coaching, inline tooltips, contextual hints — at the action point.
- **Parkinson's Law** (Parkinson, 1955). Work expands to fill the time allotted to it. Loose
  interfaces let users dawdle; cut friction and pre-fill what you can (autofill, smart defaults,
  saved state) so a flow finishes faster than the user expected.
- **Cognitive Load** (Sweller, 1988). Total mental effort splits into intrinsic (the task's
  inherent difficulty) and extraneous (poor layout, jargon, inconsistent patterns, visual noise).
  Extraneous load is what a designer controls — `design-core.md`'s restraint law (§5, §6) and the
  expression framework's congestion budgets are the concrete levers; this entry names the cost
  those levers exist to reduce.

## Provenance

Distilled from an external product repository's `craft/laws-of-ux.md` (one-time inspiration
source, no path dependency retained). Trimmed of the four laws `expression-framework.md` already
operationalizes (see above) to avoid restating the same rule twice, and of cross-references to that
repository's sibling craft files this plugin doesn't vendor (`state-coverage.md`,
`animation-discipline.md`, `typography.md`, `color.md`, `form-validation.md`) — pointers were
redirected to this plugin's own equivalents (`design-core.md`, `motion-spec.md`,
`accessibility-baseline.md`) where one exists, or dropped where none does.
