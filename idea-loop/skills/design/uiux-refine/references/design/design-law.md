# Design law — the always-on layer

Read once at Setup, before any concept or pixels, for static and motion work alike; it is the law of
the session from the start, not something looked up mid-loop.

**Precedence.** The target project root's `DESIGN.md` (plus `PRODUCT.md` when present) is the product
and visual source of truth and wins on any brand/token conflict; this file never restates its values,
only names the kinds of floors it holds. When the project has no `DESIGN.md`, this file's generic law
is the default: continue with it, say in the hand-back that no project design law was found, and
suggest `idea-loop:uiux-imagine` (no live UI) or `idea-loop:dreaming` (live UI) to create one. A
missing doc is a degradation, never an abort.

**Examples are fictional.** "Register dials" and "Brand floors" are filled in for a fictional product,
**Fieldnote** (a notebook app for field researchers), only to show how concrete a dial or a floor
should be. They are not defaults.

**Enforcement split.** The mechanically-checkable subset is enforced by
`${CLAUDE_PLUGIN_ROOT}/scripts/design-lint.mjs`: a PostToolUse hook runs it on every write to a canvas
HTML (`docs/design/tmp/<spec-slug>/canvas/`, plus the legacy `design-preview/` /
`design-motion-preview/`). The lint is the hard gate; this file carries the *why* plus the judgment
calls a regex can't make.

## Posture

- **Embody the specialist** *(open-design discovery §A)*:
  - **Landing / marketing surface** → brand designer. One hero, 3–6 sections, real copy, **one**
    decisive flourish.
  - **In-app product surface** (report, dashboard, task flow) → systems designer. Information
    density is the feature; calm is the identity; no decoration.
  - *(impeccable v4's four-Mode marketing/persuade/operate/read framing is the same axis as the
    register dial; kept as a terminology cross-reference only.)*
- **Concept before references** — the concept comes from the product's own truth (data model, the
  user's job on this surface, reachable states, the language of shipped sibling components), never
  from "what a dashboard looks like". A reference may answer a named structural, coverage or state
  question after the concept exists; it never supplies the visual skin. Replication is the
  exception: it reproduces the current UI only to establish ground truth.
- **The category-reflex check** *(impeccable)* — at two altitudes: if someone could guess the design
  from the surface's category alone, it's the first training-data reflex; if they could guess it
  from category-plus-anti-references, it's the trap one tier deeper. Rework until neither is obvious.
- **Honest placeholders beat fake stats** *(open-design)*: without a real value, use a short labelled
  stub or a grey block — never invent one.

## The Design Read

Forced first output *(taste-skill §0, near-verbatim)*. Before any concept work or code, state in one line:

> **"Reading this as: \<surface kind\> for \<audience\>, register \<in-app | marketing\>, leaning
> toward \<direction / aesthetic family\>."**

Read these signals first: surface kind · vibe words the user used · references they linked ·
audience · existing brand assets · quiet constraints (a11y-first, trust-first). If the brief is
genuinely ambiguous, ask exactly **one** clarifying question; if you can infer confidently, declare
the read and proceed.

**Anti-Default Discipline** *(taste-skill §0.D)*: do not default to AI-purple gradients, centered
hero over dark mesh, three equal feature cards, generic glassmorphism, infinite-loop
micro-animations, or the same templated section rhythm. Reach past them deliberately.

## Register dials

Calibration — the Fieldnote example; re-tune per target project. The register is decided in the
Design Read and never drifts mid-loop.

| Dial | In-app (product) | Marketing (public) |
|---|---|---|
| DESIGN_VARIANCE | medium-low — calm; emphasis from the accent ring + motion | medium-high — livelier, cinematic allowed, on-brand |
| MOTION_INTENSITY | low–medium — the in-app whitelist only | medium–high — bigger signature moments |
| VISUAL_DENSITY | medium — a working notebook | medium — anchor moments + natural-height content sections |

## Brand floors

A floor is a token or a measurable rule, never an adjective. For any target project its own
`DESIGN.md` floors replace these Fieldnote examples; only the a11y floors are universal. Never relax
the project's floors.

- **One Voice** — Signal Teal `#0b7285` is the only structural loud color; categories ride on a
  dot/label.
- **Retired-Neon** — the launch identity's neon `#39ff14` accents, glow shadows and dark mesh
  backgrounds are retired; none of them returns.
- **Soft-Elevation** — every shadow blurred and near-neutral; selection = accent ring + tint.
- **Whitelisted-Motion** — in-app motion from a short named whitelist only; bigger moments are
  marketing-only and on-brand.
- **Motion-Earns-It** — motion marks a real change; ambient decoration is slop.
- **One-Display-Face** — one sans display family; **no serif display anywhere** (a serif is allowed
  for long-form body text only).
- **A11y floors** — contrast ≥4.5:1 body / ≥3:1 large text / ≥3:1 controls, icons and focus
  indicators, measured on the real rendered page (`getComputedStyle`); a non-color cue for every
  color-carried meaning; focus-visible ring; reduced-motion alternative for every animation; never
  gate content visibility on a transition. When a question needs the full compliance floor,
  touch-target table, or keyboard/ARIA discipline, read
  [accessibility-baseline.md](accessibility-baseline.md).

**Brand override:** when `DESIGN.md` picks something generic advice flags (e.g. "avoid Inter as a
display face", taste-skill §4.1, open-design §C), the `DESIGN.md` decision wins. Palette-rotation
advice is likewise overridden for a brand-locked project.

## DESIGN.md governance and candidates

Applies to static and motion work alike.

- **T1 identity floors and T3 bans** never relax silently. Usual territory: a11y (reduced motion
  included), the single-accent identity, a retired previous identity, the elevation language, the
  motion principles and bans, the restraint budget, the selection treatment, the display face.
- **T2 defaults** (rules that are neither a floor nor a ban — density, component treatments,
  responsive container behavior, promotion hierarchy, disclosure, motion defaults): challenge
  through concept B, or surface a mid-build deviation explicitly and ask. A silent deviation is a
  workflow failure.
- **Distill-back on sign-off writes candidates only.** Each signed-off decision that might
  generalize (a winning T2 deviation, a new treatment, a new in-app motion pattern, a legitimate new
  token from the drift check) becomes one line in the freeze record's `设计法候选` section, naming
  the archive object it will hang on (page, component, motion or journey), in the format
  `idea-loop:design-modeling`, section 设计法候选的形态 defines: a one-line rule already shaped for
  `DESIGN.md` (no date, no page name), which chapter it joins, why, evidence. The object file itself
  is written from the final canvas at the pre-merge archive; nothing goes under `delta/` at freeze.
  An empty Distill-back is valid only when stated: the section holds one line, 「无」. A new pattern
  shipping with no candidate is the failure mode.
- Stop there. `idea-loop:dreaming` later runs every candidate through `idea-loop:design-modeling`,
  section 准入分层表, with the human: product design system goes to `DESIGN.md`, method that holds
  for any product goes back to this plugin as an issue, a single page's choice stays in its object's
  「决定」. The design work never writes or bootstraps `DESIGN.md`.

## Anti-slop law

Generic law, reconciled against `DESIGN.md`.

### Anti-slop checklist

*(open-design discovery §C, reconciled)*
- ❌ Aggressive purple/violet/indigo gradients or accents (the AI-default hex family)
- ❌ Generic emoji feature icons (✨ 🚀 🎯 …)
- ❌ Rounded card with a left colored border accent (the "AI dashboard tile")
- ❌ Hand-drawn SVG humans / faces / scenery
- ❌ Invented metrics ("10× faster", "99.9% uptime") without a source
- ❌ Filler copy — "Feature One / Feature Two", lorem ipsum
- ❌ An icon next to every heading; a gradient on every background
- ❌ Warm beige / cream / peach page backgrounds, unless `DESIGN.md` chose them
- ❌ Gradient text on large headers; neon glow; glassmorphism-by-default
- ❌ Lucide icons as editorial/marketing decoration (decoration ≠ demonstration)
- ❌ More than ~12 raw hex values outside `:root` — tokens were not honoured
- ❌ The brand accent token used 6+ times in the rendered body — cap at 2 visible uses per screen

The extended visual and motion slop catalogs are in [critique.md](critique.md) and
[motion.md](motion.md).

### Layout discipline

*(taste-skill §4.7, the hard rules)*
- **Hero fits the initial viewport**: headline ≤2 lines desktop, subtext ≤20 words, CTAs visible
  without scroll, top padding ≤ `pt-24`, **max 4 text elements** (eyebrow-or-nothing, headline,
  subtext, CTAs). Trust strips / pricing teasers / feature bullets move below the hero.
- **Eyebrow quota**: max 1 uppercase-tracked eyebrow per 3 sections (hero counts):
  `count(uppercase tracking labels) ≤ ceil(sections / 3)`.
- **Zigzag cap**: max 2 consecutive image/text split sections; the 3rd consecutive is a fail.
- **Layout-family repetition**: one layout family (3-col cards, full-width quote, split) appears at
  most once per page; a page with 8 sections needs ≥4 families.
- **No 3-equal-feature-cards** as the default feature row.
- **Bento cell count = content count** — never a blank tile to fill a grid; grids need background
  variety (not 6 white-on-white text cells).
- **Split-header ban**: "big left headline + small right floater paragraph" is banned as default;
  stack vertically (max-width 65ch) unless the right column carries a real element.
- Nav single-line at desktop, height ≤80px.

### Copy & data tells

*(taste-skill §9.D / §9.F)*
- No filler verbs/adjectives: "Elevate", "Seamless", "Unleash", "Next-Gen", "Revolutionize",
  "Innovative", "Cutting-edge", "Leverage", "Synergy", "Best-in-class", "State-of-the-art",
  "World-class", "Holistic", "Robust" *(the last eight from great-web-copy)*.
- No fake-perfect numbers (99.99%, 1234567) — organic data reads real (47.2%).
- No generic names/avatars ("John Doe", egg avatars) — locale-appropriate, believable.
- No version labels as hero eyebrows (`BETA`, `V2.0`, `EARLY ACCESS`) unless the brief is a launch.
- No section-number eyebrows (`001 · Capabilities`), no `01 / 4` pagination labels on tiles.
- No scroll cues ("Scroll to explore", animated mouse icons).
- No locale/time/weather strips ("LIS 14:23 · 18°C") — agency-portfolio tells.
- No decorative status dots (a colored dot only when it conveys real semantic state, sparingly).
- Middle-dot `·` rationed: max 1 per metadata line, never the default separator for everything.
- No poetic section labels ("From the field", "On our desks") — plain functional labels or none.
- No photo-credit captions as decoration; no pills/tags overlaid on images.

### The em-dash ban

*(taste-skill §9.G, binary)* **Zero `—` (and separator `–`) in user-visible copy** of a designed
surface — headlines, labels, body, captions, buttons, quotes. It is the #1 AI tell. Use a period,
comma, colon, or ` - `. Ranges use a hyphen (`2018-2026`). Scope: visible page copy in
previews/ports; docs and code comments are out of scope.

### Assets

- **No div-built fake screenshots** — capture the real running product or use none.
- No hot-linked stock CDNs (unsplash/placehold) in previews; local assets under the canvas folder's
  `assets/`.

### Copy construction

How to build copy that works, split by register. Mechanically-checkable pieces (extended filler-word
list, weak CTA labels, placeholder-only labels) are enforced by design-lint; the rest is judgment,
applied at close-out.

**In-app / product copy** *(distilled from the `impeccable` plugin's `clarify` command; going deeper
is a re-distill into this file, never a runtime read of an external path)*:
- **Errors, three-part formula**: what happened + why + how to fix. Never blame the user ("Please
  enter a date in MM/DD/YYYY" not "You entered an invalid date"). Never surface an internal error
  code as the primary message, never state a cause or fix the system can't verify *(impeccable v4)*.
- **Buttons: verb + object**, never a bare "OK" / "Submit" / "Yes" / "No" / "Click here".
  Destructive actions name the destruction and the count: "Delete 5 items" not "Delete selected".
- **Prefer undo over a confirmation dialog** when recovery is safe *(impeccable v4)*; whether a
  confirmation belongs at all is [critique.md](critique.md)'s "Leave / end confirmations".
- **Loading states never invent progress**: determinate progress only when genuinely available; a
  vague spinner is honest, a fake progress bar is not *(impeccable v4)*.
- **Voice is constant, tone shifts with the moment**: success = brief and celebratory, error =
  empathetic, loading = reassuring, destructive-confirm = serious and specific. Warmth is welcome in
  an error; a joke is not once the stakes are real (privacy, payment, deletion, access loss).

**Landing / marketing copy** *(distilled from `great-web-copy`, github.com/makash/great-web-copy)*:
- **Pick the narrative by scenario**: PAS (problem → agitation → solution) for a cold-audience
  landing page; BAB (before → after → bridge) for a transformation/SaaS story; AIDA for a
  broad-audience homepage; StoryBrand for full-site narrative. The register dial sets how loud to
  play it, not which one — that's the audience and traffic source.
- **CTA formula**: verb + what they get, with a friction-reducer nearby. "Start your free scan" not
  "Get started"; pair with "No credit card required" / "Takes 2 minutes" where true.
- **"You" outnumbers "we"** on persuasive marketing copy only; in-app error copy legitimately says
  "we couldn't reach the server". Judgment at close-out, not hard-enforced.

**Landing narrative skeleton** *(from the `imagegen-frontend-web` taste skill)*:
- **Every section has exactly one job** — hook, proof, educate, or convert. A section that can't
  name its job is cut.
- **Default funnel order** (deviate deliberately, never by drift): hook → proof bar → features /
  use case → testimonial → pricing → FAQ → final CTA.
- **Pace the scroll**: vary section intensity at least twice (lighter → richer → calmer); monotone
  slabs read as a template.
- **One unmistakable primary action per viewport tier**; secondary actions look secondary (scale,
  outline, ghost), never primary clones.
- **The final section closes**: a single strong CTA + one trust cue. A mood-reel ending with no
  funnel logic is a fail.

## Close-out protocol

Every build round, non-negotiable *(open-design Steps 7–8)*.

1. **Mechanical pre-flight**: confirm the lint hook ran clean on the final write (or run
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/design-lint.mjs" <preview.html>`). Every P0 must pass — a
   failing P0 does not proceed to review.
2. **5-dimensional critique** *(verbatim from open-design; score silently 1–5)*:
   1. **Philosophy** — does the visual posture match what was asked, or did you drift back to your
      favourite default?
   2. **Hierarchy** — does the eye land in one obvious place per screen, or is everything competing?
   3. **Execution** — typography, spacing, alignment, contrast — right, or just close?
   4. **Specificity** — is every word, number, image specific to *this* brief, or did filler /
      generic stat-slop creep in?
   5. **Restraint** — one accent used at most twice, one decisive flourish — or three competing?
   Any dimension under 3/5 is a regression: fix the weakest, re-score. Two passes is normal.
3. **Restraint over ornament** *(open-design §I, verbatim)*: "One thousand no's for every yes." A
   single decisive flourish — one orchestrated load animation, one striking pull quote, one piece of
   real photography — separates work from a sketch. Three competing flourishes turn it back into
   noise.

## Craft methodology

Three procedures that apply at any altitude — landing pages, in-app surfaces, modules, and
components carrying metrics, media, or async data.

### Proof map

For every claim, number, testimonial, logo, or screenshot the UI shows, trace it to one of four
routes before it ships (at stage E for any part carrying a claim; rolled into the asset inventory
for a whole-page build):

- **Reuse a real product asset** — preferred whenever the surface claims something about the
  product itself (a screenshot, a real chart, a real state).
- **Reconstruct from verified real state** — HTML/CSS/SVG built from an actually-observed UI or data
  shape, never inventing a feature or a number.
- **Source licensed/owned media** — record provenance and any crop/processing applied.
- **Mark unsupported** — an honest labelled placeholder or grey block. Never a fake logo, a
  fabricated metric, or a generic stock avatar. The proof map is the procedure that catches what the
  invented-metrics ban catches after the fact.

### Responsive re-edit

Desktop and Mobile are separate compositions sharing one content contract, not one shrunk into the
other. The review matrix ([static-protocol.md](static-protocol.md), stage G) says *which* widths to
check; this says *what changes* between them:

- Choose the Mobile order explicitly — don't assume it mirrors Desktop DOM order.
- Preserve the reading logic (claim → explanation/identity → proof → action) at the new width, even
  when the arrangement changes completely.
- Re-crop or replace media instead of shrinking the Desktop frame.
- Test 390px and 360px, longer copy (+30–40% for localization), missing optional assets, keyboard
  focus order at the new layout, and no horizontal scroll.
- Touch targets ≥44px where touch applies (the AAA craft commitment; the AA floor and exceptions are
  in `accessibility-baseline.md`).

### Runtime & fallback states

For any dynamic, animated, or media-bearing section, expose six directly testable states before
calling it done (at stage F; results recorded in the G review next to the matrix):

```text
normal / reduced / offscreen / failed / loading / settled
```

- **Reduced** has an equivalent settled state and no required autoplay — the structural half;
  [motion.md](motion.md)'s "Reduced motion" owns the implementation half.
- **Offscreen** work pauses or substantially reduces.
- **Failed** hides or bypasses broken media while the claim, proof, and CTA remain.
- **Loading** reserves dimensions and never pretends success; timing bands are
  [laws-of-ux.md](laws-of-ux.md)'s Doherty Threshold (skeleton vs spinner vs determinate bar vs
  error/retry).
- **Settled** is deterministic — the state a screenshot or regression check captures.
- A static section may mark reduced/offscreen `not-required`, but still needs the image/font failure
  path and the responsive checks.

## Expression framework — content → expression, at every altitude

The decision procedure that turns "what the user needs to see" into layout and visual treatment:
the wireframe-stage logic of the classic pipeline (requirements → IA → wireframe → visual design →
prototype) plus the visual-weight ladder used at hi-fi. The static protocol's stage-B state contract
+ expression table and stage-W wireframe / Variant Board are its outputs. "Which color should this
badge be" is almost never the real question — "what behavior is reachable, and how important is this
signal to the user's decision" comes first, and both have answers before taste.

### Conditional-state precondition

Before the five steps, ask whether external product or container conditions change the UI's
**visibility, content, available action, fallback, or visual priority**. If so, establish the state
contract before designing one "default" that silently ignores the rest:

1. Name each state dimension and trace its real source of truth in code/data. Do not invent product
   states from UI convention.
2. Mark reachable and impossible combinations (impossible ones removed with evidence); do not build
   the blind Cartesian product.
3. Record render/content/action/recovery behavior for every reachable combination.
4. Collapse behaviorally identical cells into **visual equivalence classes** while keeping their
   source conditions separate for tests.
5. Keep local hover/focus/pressed states in a separate interaction strip unless they change the
   business contract.

Page-level state maps decide which modules exist, module-level maps which child groups exist,
component matrices bounded behavior; do not cross-product the three levels. Every reachable,
behaviorally distinct cell becomes an implementation test; equivalent cells may share one visual
treatment. This is a precondition, not a sixth step.

### The procedure

1. **Content inventory** — every element this surface must show, from the data model and the user's
   job, not from "what such pages usually have".
2. **Priority ranking** — by the user's job: first scan / second scan / on demand. Hard constraint at
   every altitude: **≤1 primary, 2–3 secondary, everything else quiet.** If two feel primary, demote
   one.
3. **Weight assignment** — map each rank to a treatment with the altitude's levers. Visual weight
   matches decision weight; nothing gets emphasis "because it looks nice".
4. **Congestion budget** — check the altitude's cap. Over budget → demote a signal or move it down
   the position ladder; never solve congestion by making everything louder.
5. **Verify — the squint test.** Blur the details: a stranger must still name the primary and the
   secondaries, in order. Name the failure: **flat** (everything equal = a wall) or **noise** (too
   many competing = demote even what "feels important").

### The three altitudes

| Altitude | Inventory lists… | "Weight" is spent as… | Budget |
|---|---|---|---|
| **Page / surface** (IA → wireframe) | modules / sections | **area, position (above/below fold), order, grouping, whitespace** | 1 dominant module per screen; ≤5 named groups |
| **Module** (wireframe) | elements within a module | size, type scale, alignment, density | ≤3 visible hierarchy levels |
| **Component** (hi-fi) | signals on one component | **the weight ladder, font weight, the position ladder** | ≤1 L4 · ≤2 L3 · ≤4 signals total |

**At wireframe altitude, weight is spent in space; at hi-fi altitude, in ink. The ranking logic never
changes — only the currency.** A dominant element earns its place through at least two levers
pointing the same way (bigger AND first; filled AND heavier) — a single lever reads as accident.

### The weight ladder

Component altitude; token names are examples.

- **L4 — loud:** saturated deep fill + white text (text-on-fill rule in "Color application").
  Reserved for the single most decision-relevant signal on the component.
- **L3 — present:** brand/semantic tint background + dark text (`primary-subtle`, the feedback
  tints). Attribute-grade information.
- **L2 — quiet:** hairline-outlined pill, or emphasis by font weight alone.
- **L1 — silent:** plain text / `muted-foreground` metadata.
- **Non-color redundancy** *(a11y + von Restorff)*: every emphasized signal also carries a non-color
  cue — position, an icon, a text label.

### The position ladder

Progressive disclosure, all altitudes: **in content flow → corner-anchored → behind hover/expand →
next page/level.** Demoting a signal down this ladder is the standard answer to congestion — not
shrinking everything, not another color. A NEW badge moves from the inline row to a corner anchor
(component); a secondary module moves below the fold or to a detail page (page).

### Congestion budgets

- Reserve the strongest contrast for the **single goal-relevant action or signal** per surface
  (selective attention). Repeated attention-grabbers train **banner blindness**; the named
  anti-pattern is "importance solved by red dots and badges everywhere".
- Working memory holds ~4 items: ≤4 simultaneous signals per component, ≤4 items per group, ≤5
  top-level groups. 5–7 is pushing it; 8+ is overloaded.
- Decision screens: 3–5 visible primary options, exactly one marked recommended — never a flat wall.
- The budget is a *feature*: hitting it forces the priority conversation ("is NEW really more
  important than difficulty?") step 2 should have settled. Argue rank, not hue.

### Worked example — the badge case

A trail card in a hiking app (fictional). **Inventory:** title, region, permit-required qualifier,
difficulty, NEW recency, distance/elevation meta. **Ranking** for the hiker's job (pick a trail for
Saturday): permit required = primary qualifier (changes the decision); difficulty = secondary; NEW =
tertiary; meta = silent. **Assignment:** permit → L4; difficulty → L3 tint; meta → L1. **Budget:**
three inline badges + NEW = congestion → NEW moves to the corner anchor. **Verify:** squint — the L4
badge and the title survive. Hours of hue-and-placement iteration collapse into one argument about
step 2 — and rank has a right answer where taste doesn't.

## Color application — roles, dosage, text-on-fill

How to *apply* the tokens `DESIGN.md` fixes (with no `DESIGN.md`, the theme/tokens in the code): the
component-level color decisions of stages E/F. `DESIGN.md` owns which colors exist; this owns how
much and where.

- **Build roles, not a bag of swatches:** canvas / elevated surface, primary / secondary text,
  action / focus / selection, borders, semantic states, data-category. Every color use names its
  role; a color without a role is decoration and gets cut.
- **Two separate systems, never conflated:** semantic color (state: success / error / progress) vs
  data-category color (badge tier, content category). One element speaks one system (a common
  `DESIGN.md` floor: categories ride a dot/label).
- **Name the dosage strategy before assigning:** in-app default is **Restrained** — tinted neutrals
  + the accent on ≤10% of the surface. A marketing moment may go **Committed** — one saturated color
  carrying 30–60% — deliberately and on-brand. Either way One Voice holds.
- **Rarity gives an accent force:** don't spend the primary-action color on decoration; the
  strongest color owns one region.
- **Text on color fills** *(perceptual, not just WCAG; impeccable palette)*: a saturated
  mid-luminance fill (L ≈ 0.42–0.78, chroma ≥ 0.08) takes **white** text — primary buttons, filled
  badges, status pills, tag highlights, filled callouts. Dark text belongs only on pale (L > 0.85) or
  pure-neutral fills. A badge/pill accent is saturated OR clearly light OR clearly dark — a muddy
  mid-tone (taupe / dusty grey) can't hold text either way and reads weak.
- **Secondary text derives from the foreground/surface hue** (a step toward the surface), never a
  washed-out generic grey.
- **Contrast floors** are the A11y floors in "Brand floors".

## Escalation

For a flagship marketing surface that wants the full playbook (GSAP skeletons, design-system
mapping, redesign protocol), deep-read taste-skill §4 / §9 / §11 / §14 directly (upstream
`Leonxlnx/taste-skill`; local copies at `~/projects/open-design/skills/taste-skill/SKILL.md` and
`.claude/skills/design-taste-frontend`). In-app surfaces, modules and components use this file +
`DESIGN.md` + shipped siblings and don't pay that token cost.

## Provenance

Distilled from taste-skill (upstream `Leonxlnx/taste-skill`), the open-design prompt core and its
`craft/typography-hierarchy.md` / `craft/laws-of-ux.md`, the `impeccable` plugin v4.0.1 (`clarify`,
`critique.md`, `layout.md`, `reference/colorize.md`, `scripts/palette.mjs`), `great-web-copy`, the
`imagegen-frontend-web` taste skill, a design-lib research repository's `design-landing` /
`design-landing-plan` skills, and the target project's `DESIGN.md`; sections marked *(verbatim)* are
lifted, not paraphrased. Every gate runs on this plugin's own scripts and references, with no runtime
read of an external skill; the one live dependency is `idea-loop:uiux-research`'s Refero research,
run only when the human asks, never a gate.
