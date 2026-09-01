# Color Application — roles, dosage, text-on-fill

**What this is.** How to *apply* the tokens the target project's DESIGN.md fixes: the
component-level color decisions of design-ui stages E/F. DESIGN.md owns which colors exist
(when the project has none, use the theme/tokens found in its code); this file owns how much
and where.

**Provenance.** Distilled 2026-07-24 from impeccable v4.0.1 `reference/colorize.md` +
`scripts/palette.mjs` (the text-on-fill and badge-accent rules). Externals are raw feeds;
update by explicit re-distill, never by runtime reads of external paths.

- **Build roles, not a bag of swatches:** canvas / elevated surface, primary / secondary text,
  action / focus / selection, borders, semantic states, data-category. Every color use names
  its role; a color without a role is decoration and gets cut.
- **Two separate systems, never conflated:** semantic color (state: success / error / progress)
  vs data-category color (badge tier, practice category). One element speaks one system.
- **Name the dosage strategy before assigning** *(per register)*: in-app default is
  **Restrained** — tinted neutrals + the accent on ≤10% of the surface (rarity is the point).
  A marketing moment may go **Committed** — one saturated color carrying 30–60% —
  deliberately and on-brand, never by drift. Either way One Voice holds: the project's single
  brand accent (e.g. Electric Blue, in the project this rule was distilled from) is the only
  structural loud color.
- **Rarity gives an accent force:** a color used everywhere stops meaning anything. Don't
  spend the primary-action color on decoration; the strongest color owns one region.
- **Text on color fills** *(perceptual, not just WCAG)*: a saturated mid-luminance fill
  (L ≈ 0.42–0.78, chroma ≥ 0.08) takes **white** text — this covers primary buttons, filled
  badges, status pills, tag highlights, filled callouts. Dark text belongs only on pale
  (L > 0.85) or pure-neutral fills. A badge/pill accent is saturated OR clearly light OR
  clearly dark — a muddy mid-tone (taupe / dusty grey) can't hold text either way and reads
  weak.
- **Secondary text derives from the foreground/surface hue** (a step toward the surface),
  never a washed-out generic grey dropped in from nowhere.
- **Contrast floors (hard):** body ≥4.5:1, large text ≥3:1, controls / icons / focus
  indicators ≥3:1 — measured on the real rendered page (`getComputedStyle`), plus a non-color
  cue for every color-carried meaning.
