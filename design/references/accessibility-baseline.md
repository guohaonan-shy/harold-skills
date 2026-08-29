# Accessibility baseline — the compliance floor an artifact must clear

Universal rules for the legal floor of accessibility, plus craft commitments that go beyond it.
`design-core.md` §4's "A11y floors" line is the one-sentence summary always in scope; this file is
what backs it up when a surface needs more than the summary — contrast/touch-target numbers,
keyboard semantics, ARIA discipline, and the mistakes that most often slip past a review.

> Grounded in primary sources: WCAG 2.2 Understanding pages, ISO/IEC 40500:2025, ADA Title II 2024
> + 2026 IFR, EN 301 549 v3.2.1, WAI-ARIA 1.3 + AccName 1.2 + Core AAM 1.2, WebAIM Million 2026
> (February 2026 crawl), APCA W3C silver branch.

## The legal floor changes by jurisdiction

- **EU (EAA, enforcement live 2025-06-28):** EN 301 549 v3.2.1 is the OJ-cited harmonised
  standard; it references **WCAG 2.1 AA**. The v4.1.1 update incorporating WCAG 2.2's nine new SCs
  is OJ-citation-targeted late 2026/2027 — until then EAA references 2.1.
- **US public sector — ADA Title II 2024 final rule:** **WCAG 2.1 AA**. The 2026-04-20 IFR slipped
  deadlines: 2027-04-26 for jurisdictions ≥50,000 population; 2028-04-26 below that.
- **US federal procurement — Section 508:** harmonised with EN 301 549 → references **WCAG 2.0
  AA** in the current published rev.
- **US private sector — ADA Title III:** no federal technical standard; settlements and DOJ
  guidance routinely cite **WCAG 2.1 AA** as the de-facto target, case-by-case not rule-based.

**Practical rule for craft:** target **WCAG 2.2 AA** as the working ceiling — it clears the 2.1 AA
legal floor in both jurisdictions and prepares for v4.1.1. Anything below 2.2 AA is craft debt.

## Color contrast

| Pair | WCAG 2.x AA minimum |
|---|---|
| Normal text below 18pt regular / 14pt bold (most body/UI text) | 4.5:1 |
| Large text (≥18pt regular ≈24px, or ≥14pt bold ≈18.5px) | 3:1 |
| Non-text UI components and graphical objects | 3:1 |
| Focus indicator vs adjacent and unfocused state | 3:1 |

Thresholds are **inclusive** (4.5:1 exactly passes); don't round up — 2.999:1 fails. "Large text"
means 18*pt* regular, not 18px: 18px regular still needs 4.5:1.

**APCA as a parallel check.** APCA's Lc value catches font-weight/stem-thickness effects WCAG's
luminance ratio misses — body copy at Lc ≥60 is a reasonable parallel pass. APCA is not itself part
of WCAG/EN 301 549/ADA/508 compliance as of 2026-05; treat it as design-review only, keep WCAG 2.2
AA as the compliance floor.

## Touch targets

| Bar | SC | Size |
|---|---|---|
| AA (legal floor) | 2.5.8 Target Size (Minimum) | **24×24 CSS px** |
| AAA (craft commitment) | 2.5.5 Target Size (Enhanced) | 44×44 CSS px |
| iOS HIG | — | 44×44 pt |
| Material 3 | — | 48×48 dp |

WCAG 2.5.8 lists five exceptions to the 24×24 minimum: **Spacing** (a 24px exclusion circle
doesn't intersect adjacent targets), **Equivalent** (an alternative control of sufficient size
exists), **Inline** (target sits inside a sentence, e.g. a body-copy link), **User agent control**
(browser default), **Essential** (smaller size is required to convey information, e.g. a map pin).
Spacing is the one icon-toolbars actually rely on; the others are narrower than they read and
shouldn't excuse an undersized primary action.

## Focus visibility

Removing the focus outline via CSS without a replacement is a **triple failure**: 1.4.11 Non-text
Contrast, 2.4.7 Focus Visible, 2.4.13 Focus Appearance (AAA). Use `:focus-visible` for keyboard
users; suppress for mouse-only when a non-color affordance exists instead. AAA (2.4.13): indicator
area ≥2 CSS px perimeter, contrast ≥3:1 between focused/unfocused — a 1px outline at 3:1 doesn't
qualify.

## Form input labels

WebAIM Million 2026 (WAVE-based, not axe-core): 51% of top-1M home pages have ≥1 missing
form-input label; 33.1% of all inputs are unlabeled — one of the few categories rising year over
year. Default error wiring per WCAG 2.2 + ARIA APG:

```html
<label for="email">Email</label>
<input id="email" type="email" required
       aria-describedby="email-hint email-error"
       aria-invalid="true">
<span id="email-hint">Used for receipts only.</span>
<span id="email-error" role="alert">Email must include @ and a domain.</span>
```

`aria-describedby` is the production default; `aria-errormessage` has incomplete screen-reader
support as of 2026-05 — treat as progressive enhancement, not the primary wiring.

WCAG 3.3.7 Redundant Entry is **Level A**: re-asking for data the user already entered "in the
same process" fails unless the form auto-populates or offers a selectable shortcut — browser
autofill alone does not satisfy it.

## Keyboard operability and semantic structure

- **Tab reachability** (2.1.1, A): every interactive element reachable/operable via keyboard.
  `tabindex="-1"` removes from tab order; positive `tabindex` breaks document order — don't use it.
- **Activation keys** (2.1.1, A): `<button>` activates on Enter+Space; `<a href="…">` on Enter. A
  bare `<a>` without `href` is not focusable or keyboard-operable — use `<a href="…">` for
  navigation, `<button>` for actions, never a placeholder anchor.
- **No keyboard trap** (2.1.2, A): focus must be able to leave via the same standard keys it
  entered with. A modal trapping focus until Escape/close is correct behavior, not a violation.
- **Focus order** (2.4.3, A): tab order follows meaningful reading order — fix the DOM, don't patch
  with positive `tabindex`.
- **Native control first**: a `<button>` is keyboard-operable, focusable, and announced correctly
  by every AT for free. `<div role="button" tabindex="0">` requires reimplementing all of that, and
  most reimplementations miss `aria-pressed`, disabled state, or Space-on-keyup.
- **Document language** (3.1.1, A): `<html lang="...">` required; sub-tree switches use `lang` on
  the inner element.
- **Heading hierarchy** (1.3.1 A, 2.4.6 AA): one `<h1>` per page, don't skip levels
  (`<h1>`→`<h3>` without `<h2>`). Visual size and heading level are independent — style the level
  you mean, don't pick a level for its default size.
- **Landmarks** (1.3.1, 2.4.1 A): `<header> <nav> <main> <aside> <footer>` over
  `<div role="banner">` — AT users navigate by landmark.
- **Text alternatives** (1.1.1, A): `alt="..."` for content images, `alt=""` for decorative,
  `aria-label` on icon-only buttons, long-form description for charts/data-viz SVG.

## ARIA discipline

WebAIM Million 2026: ARIA pages average 59.1 errors vs 42 on non-ARIA pages — ARIA deployment
(82.7% of home pages) outpaces ARIA correctness. Decision order per ARIA APG:

1. Native HTML element with the right semantics.
2. Native element under custom visuals if restyling is required.
3. APG pattern verbatim if neither fits.
4. Closest APG pattern + documented deviation — last resort.

Never invent ARIA attributes or roles.

## Reduced motion and flashing

The non-negotiable floor: WCAG 2.3.1 (Level A) — flashing more than three times per one-second
period is non-conformant unless the flash area stays below the general/red flash thresholds
(photosensitive epilepsy is the protected concern). The animation-timing half of reduced motion
(duration/easing fallback mechanics) is `motion-spec.md` §6's job once a surface reaches
`design-motion`; this file owns the flashing floor, not the fallback implementation.

## Native mobile parity

Web ARIA does not auto-translate — each platform has its own labelling API:

| Platform | Label | Role |
|---|---|---|
| iOS UIKit | `accessibilityLabel` | `accessibilityTraits` |
| iOS SwiftUI | `.accessibilityLabel(…)` | `.accessibilityAddTraits(.isButton)` |
| Android Compose | `Modifier.semantics { contentDescription = … }` | `Modifier.semantics { role = Role.Button }` |
| Flutter | `Semantics(label: …)` | `Semantics(button: true, …)` |
| React Native | `accessibilityLabel` | `accessibilityRole` |

AI-generated mobile UI that mirrors web ARIA verbatim usually misses the platform-native
screen-reader path — use the platform API for each target.

## Common mistakes (lint these)

- "Target Size 44×44" cited as the AA bar — that's **AAA** (2.5.5). AA is **24×24** (2.5.8).
- "18px = large text" — wrong; the threshold is 18*pt* regular (~24px) or 14pt bold (~18.5px).
- "EAA = WCAG 2.2 AA" — wrong; EN 301 549 v3.2.1 is anchored to WCAG 2.1.
- "Tabindex fixes focus order" — positive `tabindex` reorders against the DOM and almost always
  makes it worse. Fix the DOM.
- "Modal traps focus → keyboard trap" — a modal trapping focus until Escape/close is correct
  behavior, not a 2.1.2 violation.
- "Adding ARIA improves accessibility" — empirically the opposite (59.1 vs 42 average errors).
- "Bare `<a>` with a click handler is a link" — without `href` it's not focusable, not
  keyboard-operable, and not a link.
- Removing `outline: none` without a replacement — triple failure (1.4.11, 2.4.7, 2.4.13).
- Placeholder text as the only label for a form input — fails 1.3.1/3.3.2; it disappears on input.

## Provenance

Distilled from an external product repository's `craft/accessibility-baseline.md` (one-time
inspiration source, no path dependency retained) — trimmed of that repo's own tooling references
(its linter, its sibling `state-coverage.md`/`animation-discipline.md` files) since this plugin
doesn't vendor them; the flashing floor above is restated standalone rather than pointed at a file
that doesn't exist here.
