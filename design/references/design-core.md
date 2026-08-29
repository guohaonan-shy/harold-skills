# Design Core — the always-on taste layer

> **Note on provenance:** this core was distilled inside a real product project (an English-learning
> app) and its brand floors (§4) and register dials (§3) name that project's decisions as concrete
> examples. The *law structure* (precedence, anti-slop, close-out) is generic; the named tokens are
> example case law. When the target project has its own `DESIGN.md`, its values replace the examples
> below wherever they conflict.

**What this is.** The distilled taste core for every design run, modeled on open-design's
baked-in prompt layer (their `official-system.ts` + `discovery.ts`: ~555 lines that ride along on
EVERY generation, regardless of which skill is active). `design-ui` and `design-motion` MUST read
this file at Setup, before any concept or pixels — it is not invoked mid-loop, it is the law of
the session from the start. The old model ("invoke the taste skill at stage D/G") relied on the
model remembering to load a 1200-line playbook mid-task; in practice it didn't happen. This file
is small enough to always be present.

**Precedence.** The target project root's `DESIGN.md` (+ `.impeccable/design.json`), when present,
wins on any brand/token conflict — this file never restates its values, only names its floors (§4).
When the target project has no `DESIGN.md`, this file's generic law (§2, §5, §6, §7) is the default,
the §4 example floors serve as illustrative case law only, and the skill should suggest the user
create a `DESIGN.md` — a missing doc is a degradation, never an abort. What this file adds is
the *generic* anti-slop law and the forced protocols (§2, §6) that no brand doc carries.

**Enforcement split.** The mechanically-checkable subset of these rules is enforced by
`scripts/design-lint.mjs` — a PostToolUse hook runs it on every write to `design-preview/` /
`design-motion-preview/` HTML, so violations surface without anyone remembering to check. The lint
is the hard gate; this file carries the *why* plus the judgment calls a regex can't make.

---

## 1. Posture

- **Embody the specialist** *(open-design discovery §A, the two personas we use)*:
  - **Landing / marketing surface** → brand designer. One hero, 3–6 sections, real copy, **one**
    decisive flourish.
  - **In-app product surface** (report, dashboard, practice flow) → systems designer. Information
    density is the feature; calm is the identity; no decoration.
  - *(Mapping to impeccable v4's Modes: marketing → **Persuade**; in-app product → **Operate** /
    **Read** — same axis as our register dial, useful when reading impeccable output.)*
- **Concept before references** — the design concept comes from the product's own truth (data
  model, pedagogy, the user's job on this surface), never from "what a dashboard looks like."
  (design-ui stage B owns this; the core just states the principle.)
- **The category-reflex check** *(impeccable)* — run at two altitudes: if someone could guess the
  design from the surface's category alone, it's the first training-data reflex; if they could
  guess it from category-plus-anti-references, it's the trap one tier deeper. Rework until neither
  answer is obvious.
- **Honest placeholders beat fake stats** *(open-design)*: when you don't have a real value, use a
  short labelled stub or a grey block — never invent one.

## 2. The Design Read — forced first output *(taste-skill §0, near-verbatim)*

Before any concept work or code, state in one line:

> **"Reading this as: \<surface kind\> for \<audience\>, register \<in-app | marketing\>, leaning
> toward \<direction / aesthetic family\>."**

Read these signals first: surface kind · vibe words the user used · references they linked ·
audience · existing brand assets · quiet constraints (a11y-first, trust-first). If the brief is
genuinely ambiguous, ask exactly **one** clarifying question — never a multi-question dump. If you
can infer confidently, don't ask; declare the read and proceed.

**Anti-Default Discipline** *(taste-skill §0.D)*: do not default to AI-purple gradients, centered
hero over dark mesh, three equal feature cards, generic glassmorphism, infinite-loop
micro-animations, or the same templated section rhythm. These are the LLM defaults; reach past
them deliberately based on the read.

## 3. Register dials (calibration — example from a real project; re-tune per target project)

| Dial | In-app (product) | Marketing (public) |
|---|---|---|
| DESIGN_VARIANCE | medium-low — shadcn-calm; emphasis from brand ring + motion | medium-high — livelier, cinematic allowed, on-brand |
| MOTION_INTENSITY | low–medium — the tamed whitelist only | medium–high — bigger Aceternity moments |
| VISUAL_DENSITY | medium — a learning workspace | medium — anchor moments + natural-height content sections |

The register is decided in the Design Read (§2) and never drifts mid-loop.

## 4. Brand floors — names only; the target project's DESIGN.md is the law

The floors below are an **example set from a real project's DESIGN.md** (kept as case law for how
concrete a floor should be). For any target project, its own DESIGN.md floors replace these; the
a11y floors are universal. Never relax the target project's floors:
- **One Voice** — Electric Blue `#137fec` is the only structural loud color; categories ride on a
  dot/label.
- **Retired-Ink** — no ink `#0a0a0a` borders, no hard offset shadows, no warm `#FFFDF4` tint.
- **Soft-Elevation** — every shadow blurred and near-neutral; selection = brand ring + tint.
- **Tamed-Aceternity** — in-app motion from the whitelist only; flashy defaults are marketing-only
  and on-brand.
- **Motion-Earns-It** — motion marks a real change; ambient decoration is slop.
- **Marketing-Display** — Inter tight; **no serif display anywhere** (Instrument Serif is retired
  as slop; Charter is blog *body* only).
- **A11y floors** — contrast ≥4.5:1 body / ≥3:1 large; focus-visible ring; reduced-motion
  alternative for every animation; never gate content visibility on a transition. Full compliance
  floor, touch-target table, and keyboard/ARIA discipline: `references/accessibility-baseline.md`.

> Brand override note: generic advice like "avoid Inter as a display face" (taste-skill §4.1,
> open-design §C) is **overridden** — Inter tight / Plus Jakarta Sans ARE our display faces by
> DESIGN.md decision. Palette-rotation advice is likewise overridden: we are brand-locked.

## 5. Anti-slop law (generic; reconciled against DESIGN.md)

### 5.1 The checklist *(open-design discovery §C, reconciled)*
- ❌ Aggressive purple/violet/indigo gradients or accents (the AI-default hex family)
- ❌ Generic emoji feature icons (✨ 🚀 🎯 …)
- ❌ Rounded card with a left colored border accent (the "AI dashboard tile")
- ❌ Hand-drawn SVG humans / faces / scenery
- ❌ Invented metrics ("10× faster", "99.9% uptime") without a source
- ❌ Filler copy — "Feature One / Feature Two", lorem ipsum
- ❌ An icon next to every heading; a gradient on every background
- ❌ Warm beige / cream / peach page backgrounds (our base is slate)
- ❌ Gradient text on large headers; neon glow; glassmorphism-by-default
- ❌ Lucide icons as editorial/marketing decoration (DESIGN.md — decoration ≠ demonstration)
- ❌ More than ~12 raw hex values outside `:root` — tokens were not honoured
- ❌ The brand accent token used 6+ times in the rendered body — cap at 2 visible uses per screen

### 5.2 Layout discipline *(taste-skill §4.7, the hard rules)*
- **Hero fits the initial viewport**: headline ≤2 lines desktop, subtext ≤20 words, CTAs visible
  without scroll, top padding ≤ `pt-24`, **max 4 text elements** (eyebrow-or-nothing, headline,
  subtext, CTAs). Trust strips / pricing teasers / feature bullets move below the hero.
- **Eyebrow quota**: max 1 uppercase-tracked eyebrow per 3 sections (hero counts). The check is
  mechanical: `count(uppercase tracking labels) ≤ ceil(sections / 3)`.
- **Zigzag cap**: max 2 consecutive image/text split sections; the 3rd consecutive is a fail.
- **Layout-family repetition**: one layout family (3-col cards, full-width quote, split) appears
  at most once per page; a page with 8 sections needs ≥4 families.
- **No 3-equal-feature-cards** as the default feature row.
- **Bento cell count = content count** — never a blank tile to fill a grid; grids need background
  variety (not 6 white-on-white text cells).
- **Split-header ban**: "big left headline + small right floater paragraph" is banned as default;
  stack vertically (max-width 65ch) unless the right column carries a real element.
- Nav single-line at desktop, height ≤80px.

### 5.3 Copy & data tells *(taste-skill §9.D / §9.F)*
- No filler verbs/adjectives: "Elevate", "Seamless", "Unleash", "Next-Gen", "Revolutionize",
  "Innovative", "Cutting-edge", "Leverage", "Synergy", "Best-in-class", "State-of-the-art",
  "World-class", "Holistic", "Robust" *(the last eight from great-web-copy, §5.6 provenance)*.
- No fake-perfect numbers (99.99%, 1234567) — organic data reads real (47.2%).
- No generic names/avatars ("John Doe", egg avatars) — locale-appropriate, believable.
- No version labels as hero eyebrows (`BETA`, `V2.0`, `EARLY ACCESS`) unless the brief is a launch.
- No section-number eyebrows (`001 · Capabilities`), no `01 / 4` pagination labels on tiles.
- No scroll cues ("Scroll to explore", animated mouse icons) — banned.
- No locale/time/weather strips ("LIS 14:23 · 18°C") — agency-portfolio tells.
- No decorative status dots (a colored dot only when it conveys real semantic state, sparingly).
- Middle-dot `·` rationed: max 1 per metadata line, never the default separator for everything.
- No poetic section labels ("From the field", "On our desks") — plain functional labels or none.
- No photo-credit captions as decoration; no pills/tags overlaid on images.

### 5.4 The em-dash ban *(taste-skill §9.G, binary)*
**Zero `—` (and separator `–`) in user-visible copy** of a designed surface — headlines, labels,
body, captions, buttons, quotes. It is the #1 AI tell. Use a period, comma, colon, or ` - `.
Ranges use a hyphen (`2018-2026`). (Scope: visible page copy in previews/ports; docs and code
comments are out of scope.)

### 5.5 Assets
- **No div-built fake screenshots** — we have a real product; capture the real surface (the
  product-shots pipeline) or use none.
- No hot-linked stock CDNs (unsplash/placehold) in previews; local assets under
  `design-preview/assets/`.

### 5.6 Copy construction — landing & app copy

Where §5.3 lists copy *tells to avoid*, this is how to build copy that works — split by register
(§3), each pointing to its real source instead of re-deriving from scratch. Mechanically-checkable
pieces (extended filler-word list, weak CTA labels, placeholder-only labels) are enforced by
design-lint.mjs; the rest is judgment, applied at close-out (§6).

**In-app / product copy.** Deep reference: the vendored **`impeccable` plugin's `clarify`
command** (`reference/clarify.md`) — richer than anything found externally (situational error
templates by cause, translation-expansion tables, terminology-glossary discipline). Read it for
the full case-by-case tables; the rules below are the always-on floor, distilled from it:
- **Errors, three-part formula**: what happened + why + how to fix. Never blame the user
  ("Please enter a date in MM/DD/YYYY" not "You entered an invalid date"). Don't over-promise:
  never surface an internal error code as the primary message, never state a cause or fix the
  system can't actually verify *(impeccable v4)*.
- **Buttons: verb + object**, never a bare "OK" / "Submit" / "Yes" / "No" / "Click here".
  Destructive actions name the destruction and the count: "Delete 5 items" not "Delete selected".
- **Prefer undo over a confirmation dialog** when recovery is safe — a confirm-then-act step is a
  worse default than "do it, then let them undo" whenever undo is actually possible *(impeccable
  v4)*.
- **Loading states never invent progress**: show determinate progress when it's genuinely
  available; a vague spinner is honest, a fake progress bar is not *(impeccable v4)*.
- **Voice is constant, tone shifts with the moment**: success = brief and celebratory, error =
  empathetic, loading = reassuring, destructive-confirm = serious and specific. Warmth is welcome
  in an error; a joke is not, once the stakes are real (privacy, payment, deletion, access loss)
  *(impeccable v4)*.

**Landing / marketing copy.** Distilled from `great-web-copy` (github.com/makash/great-web-copy —
the closest thing found to a ready-made framework for this register; not vendored locally, see
§8 provenance). **Not adopted**: Unbounce's page-architecture / section-order model — considered,
parked for now.
- **Pick the narrative by scenario, don't default to one**: PAS (problem → agitation → solution)
  for a cold-audience landing page; BAB (before → after → bridge) for a transformation/SaaS story;
  AIDA for a broad-audience homepage; StoryBrand for full-site narrative. The register dial (§3)
  sets how loud to play it, not which one to pick — that's the audience and traffic source.
- **CTA formula**: verb + what they get, with a friction-reducer nearby. "Start your free scan"
  not "Get started"; pair with "No credit card required" / "Takes 2 minutes" where true.
- **"You" outnumbers "we"**: the copy is about the reader, not the company. Judgment call at
  close-out, not hard-enforced — in-app error copy legitimately says "we couldn't reach the
  server," so the ratio only applies to persuasive marketing copy, not a whole mixed-register file.

**Landing narrative skeleton** *(distilled 2026-07-24 from the local `imagegen-frontend-web`
taste skill — its narrative logic generalizes beyond image generation)*:
- **Every section has exactly one job** — hook, proof, educate, or convert. A section that
  can't name its job is cut.
- **Default funnel order** (deviate deliberately, never by drift): hook → proof bar →
  features / use case → testimonial → pricing → FAQ → final CTA.
- **Pace the scroll**: vary section intensity at least twice across the page (lighter → richer
  → calmer); monotone slabs read as a template.
- **One unmistakable primary action per viewport tier**; secondary actions look secondary
  (scale, outline, ghost), never primary clones.
- **The final section closes**: a single strong CTA + one trust cue. A mood-reel ending with no
  funnel logic is a fail.

## 6. Close-out protocol — every build round, non-negotiable *(open-design Steps 7–8)*

1. **Mechanical pre-flight**: confirm the lint hook ran clean on the final write (or run
   `node "$CLAUDE_PLUGIN_ROOT/scripts/design-lint.mjs" <preview.html>` yourself — i.e. this
   plugin's `scripts/design-lint.mjs`, wherever the plugin is installed). Every
   P0 must pass — a failing P0 does not proceed to review.
2. **5-dimensional critique** *(verbatim from open-design; score silently 1–5)*:
   1. **Philosophy** — does the visual posture match what was asked, or did you drift back to
      your favourite default?
   2. **Hierarchy** — does the eye land in one obvious place per screen, or is everything
      competing?
   3. **Execution** — typography, spacing, alignment, contrast — right, or just close?
   4. **Specificity** — is every word, number, image specific to *this* brief, or did filler /
      generic stat-slop creep in?
   5. **Restraint** — one accent used at most twice, one decisive flourish — or three competing
      flourishes?
   Any dimension under 3/5 is a regression: go back, fix the weakest, re-score. Two passes is
   normal.
3. **Restraint over ornament** *(open-design §I, verbatim)*: "One thousand no's for every yes." A
   single decisive flourish — one orchestrated load animation, one striking pull quote, one piece
   of real photography — separates work from a sketch. Three competing flourishes turn it back
   into noise.

## 7. Craft methodology — proof map, responsive re-edit, runtime & fallback states

Three procedures that apply at any altitude, not just a landing page — they were originally scoped
to landing-page work and generalize cleanly to in-app surfaces, modules, and components carrying
metrics, media, or async data.

### 7.1 Proof map

For every claim, number, testimonial, logo, or screenshot the UI shows, trace it to one of four
routes before it ships:

- **Reuse a real product asset** — preferred whenever the surface is claiming something about the
  product itself (a screenshot, a real chart, a real state).
- **Reconstruct from verified real state** — HTML/CSS/SVG built from an actually-observed UI or
  data shape, never inventing a feature or a number that doesn't exist.
- **Source licensed/owned media** — record provenance and any crop/processing applied.
- **Mark unsupported** — an honest labelled placeholder or grey block. Never fill the space with a
  fake logo, a fabricated metric, or a generic stock avatar (the same floor as §1's "honest
  placeholders beat fake stats" and §5.1's invented-metrics ban — the proof map is the procedure
  that catches it before build, not just the checklist that catches it after).

Do this at stage E (pulling parts) for any component/module carrying a claim, and roll it into the
Surface-level asset inventory for a whole-page build.

### 7.2 Responsive re-edit

Desktop and Mobile are separate compositions sharing the same content contract, not one shrunk into
the other:

- Choose the Mobile order explicitly — don't assume it mirrors Desktop DOM order.
- Preserve the underlying reading logic (claim → explanation/identity → proof → action) at the new
  width, even when the visual arrangement changes completely.
- Re-crop or replace media instead of shrinking the Desktop frame.
- Test 390px and 360px, longer copy (+30–40%, for localization expansion), missing optional
  assets, keyboard focus order at the new layout, and confirm no horizontal scroll.
- Touch targets ≥44px where touch applies (the AAA craft commitment — see
  `accessibility-baseline.md`'s touch-target table for the AA floor and the exceptions).

This is `surface-protocol.md`'s G-stage viewport matrix (1440 + 390/360) made procedural: the
matrix says *which* widths to check, this section says *what changes* between them.

### 7.3 Runtime & fallback states

For any dynamic, animated, or media-bearing section, expose six directly testable states before
calling it done:

```text
normal / reduced / offscreen / failed / loading / settled
```

- **Reduced** has an equivalent settled state and no required autoplay — this is the *structural*
  half (does an equivalent state exist); `motion-spec.md` §6 owns the *mechanical* half (the
  `prefers-reduced-motion` fallback implementation) once a surface reaches `design-motion`.
- **Offscreen** work pauses or substantially reduces.
- **Failed** hides or bypasses broken media while the claim, proof, and CTA remain — a failed image
  never takes the surrounding meaning down with it.
- **Loading** reserves dimensions and never pretends product success; see `laws-of-ux.md`'s
  Doherty Threshold entry for the timing bands (skeleton vs spinner vs determinate bar vs
  error/retry).
- **Settled** is deterministic — the state a screenshot or regression check captures.
- A static section may mark reduced/offscreen `not-required`, but still needs the image/font
  failure path and the responsive checks above before promotion.

Do this at stage F (build) for anything that isn't purely static content, and record the six
states' results in the G-stage review alongside the viewport matrix.

Distilled from a design-lib research repository's `design-landing`/`design-landing-plan` skills
(§5 responsive re-edit, §6 runtime states, and the asset-truth production routes behind the proof
map), generalized away from that repo's landing-only framing and `$DESIGN_LIB_ROOT` gating.

## 8. Provenance & escalation

Distilled 2026-07-08 from: **taste-skill** (vendored at
`~/projects/open-design/skills/taste-skill/SKILL.md`, upstream `Leonxlnx/taste-skill`; also
installed locally as `.claude/skills/design-taste-frontend`), **open-design prompt core**
(`~/projects/open-design/apps/daemon/src/prompts/{official-system,discovery}.ts`), and our
`DESIGN.md`. Sections marked *(verbatim)* are lifted, not paraphrased, to preserve their force.

§5.6 (copy construction) distilled 2026-07-23 from: the **`impeccable` plugin's `clarify`
command** (installed at `~/.claude/plugins/cache/impeccable/impeccable/<version>/skills/impeccable/
reference/clarify.md` — already in this environment, not something to re-source) for in-app copy,
and **`great-web-copy`** (github.com/makash/great-web-copy, MIT, `skills/write-copy/SKILL.md` —
read remotely, not vendored) for landing/marketing copy. A parallel research pass (web search +
Codex, both logged in the originating session) surveyed named traditions — Unbounce page
architecture, StoryBrand/PAS/AIDA/BAB, April Dunford positioning, Eugene Schwartz's awareness
stages, Google Material's UX-writing principles, NN/g, GOV.UK, Shopify Polaris — before settling on
these two as the actually-distillable sources; the rest stay theoretical background, not
re-derived into this file.

§5.6's in-app rules were refreshed 2026-07-23 against **`impeccable` v4.0.1** (the plugin was
upgraded locally that day; `clarify.md` was rewritten upstream, ~60% shorter, principle-driven over
example tables). Four new judgments survived the diff and were folded in *(impeccable v4)*: prefer
undo over confirmation when recovery is safe, don't over-promise a diagnosis the system can't
verify, never invent loading progress, and warmth-not-jokes on serious errors. The three-part error
formula, the button verb+object rule, and the placeholder-is-not-a-label rule (§5.6, enforced by
`weak-cta-label` / `placeholder-only-label` in design-lint.mjs) were unchanged in v4 and remain
correct as written.

**Source-tracking update (2026-07-24).** open-design consolidated its two prompt files into
`apps/daemon/src/prompts/core-slim.ts` (0.15.x; the runtime default in current builds) — future
re-distills track that file. `taste-skill/SKILL.md` is unchanged since 2026-06. impeccable is at
v4.0.1 (its register split became four Modes — see §1's mapping). **Vendoring principle** (the
architecture this plugin follows): knowledge-layer content from external skills is distilled
into this plugin's `references/` with a provenance header (source path, version, date) — the
external source is the raw feed, and an upstream update is consumed by an explicit re-distill,
never by runtime reads of external paths. Runtime *tools* (impeccable `critique`/`audit`
invocations, the detect.mjs engine inside our lint hook) stay live-linked: engine upgrades are
wanted. Sibling distillates: `expression-framework.md` (open-design craft/ + impeccable emphasis
rules + our badge case), `color-application.md` (impeccable colorize + palette.mjs),
`design-system-review.md` (impeccable doctor discipline), `accessibility-baseline.md` and
`laws-of-ux.md` (an external product repository's `craft/`, one-time inspiration source, no path
dependency retained), `landing-ia.md` (a design-lib research repository's landing skills,
generalized away from its allow-list gating), `research-backend.md` (routing contract for
`refero-design`'s three research layers, a live dependency by design).

- **Escalation**: for a flagship marketing surface that wants the full playbook (GSAP skeletons,
  design-system mapping, redesign protocol), deep-read taste-skill §4 / §9 / §11 / §14 directly.
- **Maintenance**: this file is OUR asset — it changes in the same pass as any DESIGN.md rule
  change that touches §3/§4, and gets re-checked against upstream when we re-pull the vendored
  skills. A slightly stale core that is always loaded beats a fresh playbook that never was.
