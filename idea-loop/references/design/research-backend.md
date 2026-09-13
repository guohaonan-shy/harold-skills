# Research backend — summoned by a named question, routed to one of three layers

**按需加载。** This is the routing contract only: when a research call is allowed at all, which of
Refero's three layers answers which kind of question, and how the result gets recorded. Tool
mechanics (parameters, batch limits, platform filters) live in the `refero-design` skill's own
`references/mcp-tools.md`; don't restate them here, they'd rot out of sync.

Two callers, one contract: `uiux-imagine` (the divergent half) and `uiux-refine` through
`references/design/static-ui-protocol.md` §C.

## The one hard rule

**Nothing here is read before the first batch of variants exists.**

In `uiux-imagine` that is literal — the first list of deliberately underspecified ideas, and the
renders of the ones the human picked, come out of the product's own world, not out of a search. In
`uiux-refine` the same rule wears a different name: stage C is skipped by default, and a reference
is admissible only once the concept leaves a specific question unanswered.

The rule exists because a reference read too early stops being evidence and becomes the brief.
Whatever comes back from a search run before there is anything to compare it against sets the
direction by default — and setting the direction by default is the one thing the divergent half
exists to prevent.

This backend is **never a gate**. No step blocks on it, and "we ran this whole thing without
opening it" is a legitimate outcome.

## The two places a named question comes from

A **named question** is one sentence, about one decision, that the current variants cannot settle
from the product's own truth. "What should this feel like" is not one. "How does a comparison table
survive at 390px when every row carries five metrics" is.

1. **The human's directional note.** Reacting to a rendered variant, the human names something the
   variants don't answer — a state nobody drew, a density they don't believe, a step that goes
   somewhere the board doesn't show.
2. **The model's own gap.** While producing or steering variants, you reach a decision you are
   about to guess at. Write the question down first — one you cannot fit in a sentence is not ready
   to be researched, it is ready to be split.

Either way the question is stated **before** the call, and the layer is picked from the question.

## The three layers

| The named question is about… | Layer | Refero call |
|---|---|---|
| Visual direction — taste, aesthetic family, palette/type mood | **Styles** | `refero_search_styles` |
| A concrete UI pattern — how a specific component or screen is structured | **Screens** | `refero_search_screens` (+ `refero_get_screen`, `refero_get_similar_screens`) |
| A multi-step flow — how a user moves across connected screens to complete a task | **Flows** | `refero_search_flows` (+ `refero_get_flow`) |

Pick the layer that matches the *question*, not the altitude of the work — a Component-altitude
run can still need Flows if the named question is "what happens after this action, across
screens," and a Surface-altitude run can stay at Styles if the only open question is visual
direction.

### Caveats that change which layer to reach for

- Styles doesn't currently cover in-app dashboards, auth screens, settings screens, or iOS app
  screens as style systems — for those, go straight to Screens/Flows even for a visual-direction
  question.
- Even for product UI, use Styles first to establish taste, then Screens/Flows for
  product-specific structural logic — don't skip Styles just because the surface is in-app.
- User-provided sources always outrank a Refero search; Refero is a fallback candidate search, not
  ground truth (`static-ui-protocol` stage C, `platform: "web"`).

### The optional styles stress test

Once a language has been **chosen** — the language altitude closed, `DESIGN.md` written — one
Styles pass may be run against the scenarios a young language collapses under: dense tables, long
forms, error-laden states, a twelve-row list. It is optional, it happens strictly after the choice,
and it may only produce findings **against the chosen language**. It never reopens the choice by
holding up a prettier alternative; reopening is the human's call, in words.

## Recording a result — three lines per source, always

- **Can answer** — the exact question this source is evidence for.
- **Cannot answer** — the nearby decisions it does not support.
- **Keep / Change / Do not copy** — the controllable structural qualities worth keeping, what
  changes for this product, and the protected or irrelevant skin.

A source that cannot represent the target state never enters the conclusion layer. In
`uiux-imagine` these three lines land in the direction note's 「约束与素材」 section — which is where
they survive, since the renders themselves do not. In `uiux-refine` they land where stage C records
them.

## The ban that governs how they are used

**reference-averaging** (`ui-craft-checklist.md` §2): when several sources come back for one
question, blending them into a safe median instead of picking the one whose reasoning actually
answers the question. **A reference is evidence for a specific claim, not a vote.** Two sources that
disagree are a decision to make, never a midpoint to compute.

## Provenance

Refero's three-layer research backend is a live dependency of this plugin, not a one-time
inspiration source — naming it here and in the two callers above is the intended coupling. This
file exists only to keep the routing decision (which layer for which question) visible in prose
next to those callers, per this plugin's convention of naming referenced files explicitly rather
than pointing at a directory.
