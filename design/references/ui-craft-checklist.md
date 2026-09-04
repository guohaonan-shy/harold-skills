# UI craft checklist — the static-visual half of Gate 2

Self-contained replacement for a live critique-tool invocation. Read this at `design-ui` Gate 2
("isolated critique") alongside `design-core.md` §5. The mechanically-checkable subset already runs
in `scripts/design-lint.mjs`; this file carries what a regex can't decide — judgment applied against
a rendered screenshot/DOM, plus the checklist items that are cheap for a human/model to eyeball but
not worth encoding as a brittle regex.

## 1. Typography thresholds

Quantified failure signatures — measure against the rendered DOM (`getComputedStyle`), don't eyeball:

- **Line length**: body text wider than ~80 characters/line reads as a wall; cap with
  `max-width: 65–75ch` on paragraph containers.
- **Tight leading**: `line-height` below 1.3× the font size cramps multi-line text.
- **Undersized text**: body text below 12px; **functional UI text has a hard floor of 11px**
  (labels, captions, footer copy — footer placement is not an exemption). Only true legal
  smallprint may drop to 10px. Adding a sub-11px size to a DESIGN.md size ramp does not exempt it
  from this floor — the floor is about legibility, not token status.
- **Wide tracking on body copy**: `letter-spacing` above `0.05em` on paragraph/body text (tracking
  that wide is for short uppercase labels, not reading copy).
- **Flat type hierarchy**: adjacent heading/body sizes with a ratio under 1.25:1 read as
  indistinguishable — the eye can't find the level.
- **Overused AI-default typefaces**: Inter, Roboto, Fraunces, Geist, Plus Jakarta Sans, Space
  Grotesk as an unexamined default (they're fine *when the project's own DESIGN.md picked one
  deliberately* — this is a "did you choose it or default to it" check, not a ban).
- **Oversized italic serif as a hero headline**: Fraunces/Recoleta/Playfair-family italic serif at
  display size is a recognizable AI-generated-landing-page tell.
- **Other tells**: extreme negative letter-spacing on headings, justified body text without
  hyphenation (produces ugly rivers), all-caps body paragraphs (fine for short labels, wrong for
  running text).

## 2. Visual slop catalog (extends design-core.md §5.1)

- **dark-glow** — zero-offset, saturated colored box-shadow used as an ambient glow.
- **radial-halo** — a saturated radial gradient glow behind content on a dark page background.
- **marquee** — auto-scrolling ticker/marquee text or logo strip.
- **gpt-thin-border-wide-shadow** — a thin 1px border paired with a wide, diffuse drop shadow (the
  "AI card" signature combination).
- **repeating-stripes-gradient** — a diagonal repeating-linear-gradient stripe texture as a
  background fill.
- **codex-grid-background** — a decorative faint grid-line background pattern behind content.
- **blinking-cursor** — a decorative typing-cursor animation with no real text-entry purpose.
- **shape-assembled-illustration** — an illustration built from generic primitive shapes
  (circles/blobs/triangles) standing in for real photography or a real product screenshot.
- **image-hover-transform** — an image that scales/rotates on hover for no functional reason.
- **theater-slop-phrase** — copy that frames the product/feature as a stage/performance ("take
  center stage", "the spotlight is yours") — a recognizable AI-copy register tell.
- **calm-editorial-serif-default** — the *other* current AI default (not the purple-gradient one):
  a serif display face + ivory/olive/clay palette + generous whitespace, applied because it "looks
  premium" rather than because the brief calls for it. Self-check: (1) would this palette survive
  if the brand color were swapped out — if yes, it's decoration, not identity; (2) is the serif
  carrying a specific claim about the brand, or just "editorial = trustworthy"; (3) does the
  whitespace serve the content's actual density, or hide a thin brief; (4) if this generated for
  three different briefs, would it look the same — if yes, it's a template, not a design.
- **reference-averaging** — when multiple references are pulled for one question, blending them
  into a safe median instead of picking the one whose reasoning actually answers the question. A
  reference is evidence for a specific claim, not a vote.

## 3. Layout/implementation integrity (rendering bugs, not composition judgment)

Verify on the rendered DOM, not the source:

- **cramped-padding** — padding materially smaller than the contained text's font size/line-height
  reads as claustrophobic; there is no single px threshold, but padding under ~0.5× the font size
  on a text-bearing container is a strong signal to check.
- **body-text-viewport-edge** — text running flush to the viewport edge with no gutter.
- **text-occlusion** — one element visually covering another element's text.
- **first-viewport-column-overflow** — a multi-column layout where a column's content overflows its
  bounds in the first viewport.
- **edge-flush-cards** — cards/tiles with no gap or outer margin, flush to the container edge when
  the design intent wasn't a bleed layout.
- **clipped-overflow-container** — an `overflow: hidden` container clipping a positioned child that
  needed to be visible (badges, tooltips, dropdown shadows cut off).
- **heading-rhythm** — a heading with less space above it than below it (should be the reverse — a
  heading belongs visually with the content it introduces).
- **repeated-container-text** — the same text string duplicated across sibling containers, usually
  a copy-paste-and-forgot-to-edit signature.
- **text-overflow** — text clipped/truncated where the container should have grown or wrapped.
- **content-hidden-at-rest** — a reveal-on-scroll/reveal-on-load element still at `opacity: 0` after
  its trigger has already fired (the animation-still-not-run failure signature — check the settled
  DOM state, not just mid-animation).
- **broken-image** — a broken/404 image reference in the shipped preview.
- **script-error** — an uncaught console error/exception on load or interaction.

## 4. Structured critique methodologies

### 4.1 Heuristic and cognitive-load scoring

See `references/heuristics-checklist.md` for the Nielsen 10-heuristic scoring rubric, the
cognitive-load checklist, and the five-persona red-flag test — run these as part of the same Gate 2
pass.

### 4.2 Practical craft checklist (forms, touch, performance, navigation, copy)

- **Forms**: correct `autocomplete` values on every input that maps to a known field type; never
  block `paste` into a field (breaks password managers and legitimate copy-paste); submit buttons
  show a disabled+spinner state during submission, not a silent no-op; warn before navigating away
  from an unsaved form.
- **Touch**: `touch-action: manipulation` on tappable elements to kill the 300ms tap delay;
  `overscroll-behavior: contain` on modal/scrollable panels so background scroll doesn't leak;
  `autoFocus` is desktop-only (it forces the mobile keyboard open unexpectedly).
  Touch-target sizing itself lives in `accessibility-baseline.md`.
- **Performance**: virtualize lists over ~50 items; never read layout (`getBoundingClientRect`,
  `offsetHeight`) inside a render/loop — batch reads before writes; prefer uncontrolled inputs for
  high-frequency-typing fields over a controlled input that re-renders on every keystroke.
- **Navigation**: meaningful UI state (selected tab, open filter, current page) belongs in the URL,
  not only in component state, so back/forward/refresh/share work.
- **Destructive actions**: require explicit confirmation or provide an undo window — never a
  same-click destructive action with no recovery path (cross-reference design-core.md §5.6's
  undo-over-confirm preference: prefer undo when recovery is actually possible; confirmation is the
  fallback only when it isn't).
- **Copy mechanics**: active voice over passive; Title Case for UI labels/buttons per the project's
  own casing convention (don't override a DESIGN.md convention that already picked one); numerals
  as digits ("3 items" not "three items") in UI copy.

## 5. DESIGN.md drift check (procedure, not a new rule set)

When the target project has a `DESIGN.md`, diff the rendered preview's computed values against its
declared tokens before sign-off:

1. Pull the token set the project's own `DESIGN.md` actually maintains (color ramp, spacing scale,
   type scale, radius scale) — read it from the project's own source of truth, not from memory.
2. Sample computed values from the rendered preview (`getComputedStyle` on representative elements)
   and check each against the nearest declared token.
3. A value that doesn't map to any declared token is either a legitimate new addition (name it,
   propose it as a T2 case-law entry at close-out) or drift (fix it to the existing token). Silence
   is the failure mode either way — every off-token value gets a decision, not a shrug.
