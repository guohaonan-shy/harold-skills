# Landing / IA — page taxonomy and Hero geometry

**Load when:** `design-ui` stage A routes to the **Landing / IA** entry (see the route table in
`skills/design-ui/SKILL.md` §A) — a landing, marketing, or multi-surface information-architecture
page. Read this alongside `surface-protocol.md`, not instead of it: Landing/IA still runs the
Surface R/B/W procedure end to end; this file supplies the extra domain vocabulary that procedure
needs at stage B (page taxonomy) and stage W (Hero geometry). It does not replace `design-core.md`
(taste, anti-slop, copy, proof map, responsive re-edit, runtime states) — those apply to a landing
page exactly as they apply to any other surface.

## Page taxonomy

Before choosing sections, classify the page's one primary responsibility:

- Company Homepage
- Product Family Landing
- Specific Product Page
- Capability Deep Dive
- Use Case / Solution Page
- Pricing / Enterprise / Trust Page
- Activation / Docs / Template Page

For a multi-product page, map Parent / Sibling / Cross-cutting nodes and distinguish which
sections carry a **Product**, **Capability**, **Router**, **Use Case**, **Buying**, **Trust**, or
**Activation** responsibility. Don't let URL depth or navigation labels decide the taxonomy by
themselves — a page nested three levels deep can still be a Router, and a top-level page can still
be a Capability Deep Dive.

Do this classification as part of the Surface protocol's stage B (concept, state map, and
expression table): the taxonomy is the "user's job" and "the one idea" for a landing page,
expressed in this domain's vocabulary instead of a generic surface's.

## Hero seven-slot model

Inventory the Hero as seven slots, not as a single "hero image + headline" block:

```text
Nav / Headline / Supporting / Primary CTA / Proof / Visual / Scroll hook
```

The content and proof actually available — from the proof map (`design-core.md` §7.1) — chooses
which slots exist and how they're weighted; never default to one
archetype because it's familiar. Do this slot inventory at stage B alongside the taxonomy call,
then lock the chosen geometry at stage W before descending into module/component work.

Four geometry archetypes are documented case law from a prior research pass, kept here as
**same-source M1 hypotheses**, not a menu to pick from by default:

- Full-bleed image
- Image-first editorial
- Engineering grid
- Split header + product mockup

All four came from the same designer's portfolio (one source, not independent evidence) and none
of them carry Mobile evidence. Treat them as a vocabulary for describing what you're building, not
as a validated ranking — the content/proof condition of *this* page chooses the geometry, and
Mobile reordering is always a fresh design decision, never a shrink of the Desktop slot order.

## Provenance

Distilled from a design-lib research repository's `design-landing-plan` / `design-landing` skills
(page classification and the Hero seven-slot inventory), generalized away from that repo's
`$DESIGN_LIB_ROOT`-relative allow-list gating (M/P evidence levels, candidate-mode opt-in) — this
file carries no path dependency on that repository and no machinery to keep in sync with it. The
epistemic caveats on the four Hero archetypes (same source, no Mobile evidence) are carried over
because they're load-bearing, not because the gating mechanism they came from is being kept.
