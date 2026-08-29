---
name: design-port
description: >-
  Port a signed-off `design-preview/` (or `design-motion-preview/`) change
  into the real React/TSX component it represents, AND verify the result
  actually matches — the one gap between `design-ui`'s approved preview HTML
  and shipped, verified React that nothing else in the pipeline covers.
  Covers both the translation mechanics (classifying prototype-only CSS vs
  shared branded classes, mapping to Tailwind, reconciling exact px values,
  catching prototype changes that secretly add new data, finding the right
  component by state ownership not DOM nesting, translating imperative JS
  into declarative React) and the fidelity gate (same-viewport screenshot
  diff of preview vs. live route with a stated mismatch %, plus a 5-item
  checklist: DOM-not-rebuilt-on-transition, computed-style-not-eyeballed,
  breakpoints preserved, token attribution explicit, contrast measured). Use
  whenever a design-preview change is ready to ship — most visual tweaks skip
  `design-motion` entirely and land straight here; also the mandatory final
  step after `design-motion` signs off. Also use right after a preview HTML
  has already been hand-ported into React, to verify fidelity without
  redoing the translation. Trigger phrases: "同步到 react", "sync this to
  react", "port this to react", "把这个改动同步/落地到 react", "sync the
  prototype change", "把这个设计接入代码", "verify the port", "did the port
  match the preview", "check the React port against the design", "对照预览验证
  端口", "端口保真度检查" — or immediately after a `design-ui`/`design-motion`
  sign-off with no further design work pending. One skill, one invocation:
  translate-then-verify or verify-only depending on what already exists.
user-invocable: true
argument-hint: "[design-preview file] + [React component/route it maps to] — e.g. 'design-preview/academic-report-v2.html vs /dev/academic-report-v2'"
---

Port a signed-off `design-preview/` (or `design-motion-preview/`) change into the real React/TSX
component it represents, then verify the result actually matches. This is the one gap in the
pipeline nobody else covers: `design-ui` ends at an approved preview; `design-motion` only runs
when a surface has real motion to design; neither one checks that what shipped is what got
approved. Translation is not a design step — the visual/interaction decisions were already made
and signed off upstream; the job here is making the live app match them faithfully, including the
parts a naive copy-paste misses, and then proving it with a falsifiable diff instead of eyeballing
it into "looks right."

## When to run it

Right after a preview HTML (`design-preview/<surface>.html`, or `design-motion-preview/<surface>.html`
once `design-motion` signed off) is ready to ship into the real app — most iterative visual tweaks
(a layout move, a font-weight bump, a control repositioned) never touch motion at all and go
straight from `design-ui`'s output to here, skipping `design-motion` entirely. Also the mandatory
final step after `design-motion` signs off motion/interaction work.

If the port already exists — hand-ported by a prior session, or by someone else — and only needs
checking, skip straight to **Phase B**. Either entry point ends the same way: don't tell anyone the
port is done until Phase B has run against it.

## Inputs

- The **signed-off prototype file** — the `design-preview/` or `design-motion-preview/` HTML this
  session (or a prior one) already approved. Don't re-litigate its design here; if something looks
  wrong, that's a bounce back to `design-ui`/`design-motion`, not a silent change mid-port.
- The **React component(s)** the prototype represents — may be one file or span a parent + child
  (state ownership doesn't have to match the prototype's flat DOM nesting, see Phase A §A3 below).
- Whether the change is **purely visual** or also **introduces new content/data** the app didn't
  render before — this determines whether backend/type work is in scope (Phase A §2).
- The approved preview's `design-ui` / `design-motion` handoff record: entry altitude, state
  contract, and route-specific context matrix — needed for Phase B. That matrix is part of the
  approved design, not a fresh testing preference. If no record survives, reconstruct the probative
  dimensions from the preview and real container and state the evidence; do not silently fall back
  to irrelevant mobile widths for a desktop-only component.

## Setup

1. **`references/react-port.md` — the translation protocol.** Nine numbered points, each grounded
   in a real thing that went wrong or had to be decided correctly in an actual port — read it in
   full before editing anything if Phase A applies. Don't paraphrase it from memory; re-read it per
   port, the specifics matter more than the gist.
2. **`references/design-core.md`** — the brand floors still apply to a Tailwind translation. A port
   that quietly drifts a color/spacing/motion token off the target project's DESIGN.md (when it has
   one) is a regression, not a detail, even though no new design decision is being made here.
3. **`references/browser-usage.md`** — the Playwright mechanics Phase B needs: headless/isolated
   server choice, static-file serving for the preview HTML, `browser_take_screenshot`/
   `browser_resize`/`browser_evaluate`, and the pixel-diff invocation.
4. The **sibling React components** already sharing CSS with this surface (gradient/branded
   classes, shared layout primitives) — know what's reusable before assuming you need to reinvent
   it in Tailwind.

This skill points the same browser tools at a different pair of targets in Phase B; it does not
invent a second responsive contract.

## Phase A — Translate (skip if the port already exists)

### A1 · Classify and translate every changed rule
Work through `references/react-port.md` §1–3: sort each changed CSS rule into "invented for this
prototype" (translate to Tailwind, checking utility precedent first) vs "already-shared branded
class" (reuse verbatim). Reconcile exact prototype px values against Tailwind's discrete scale —
note where the mapping is exact and where it's an approximation you'll need to confirm visually.

### A2 · Contract check — is this ALSO a data change?
Before writing JSX, ask the tell from §4: does the prototype's mock data represent a field that
doesn't exist anywhere in the real pipeline yet? If yes, this is a contract change — trace it
through type definitions, backend schema/prompt, i18n handling, and any frozen-contract doc, in
that order, BEFORE the JSX. If the field is genuinely new, don't verify against the prototype's
hand-authored mock text (§5) — drive a real submission through the real pipeline and check the
real, freshly-generated data (a live DB row, a real API response) before trusting the port.

### A3 · Land it in the right place
Find the component that actually owns the relevant state (§6) — not wherever the prototype's DOM
happened to nest the block. Express the behavior declaratively (§7); don't port the prototype's
imperative re-render function if the React state/handlers already exist. If the prototype exists in
more than one file copy, sync them (§8).

**Gate for Phase A** (`references/react-port.md`'s own Gate section is authoritative): every changed
rule is classified and translated, any new data traced to a real contract change and verified
against a real row, the edit lands in the component that owns the state, duplicate prototype
copies are back in sync. "The prototype looks right" is not the same claim as "Phase A is done" —
Phase B is what actually closes that claim.

## Phase B — Verify fidelity (always run, even right after finishing Phase A)

Reverse of `design-ui` stage R's replication-diff loop: there, the shipped product was truth and
the preview was the candidate; here, **the preview HTML is truth and the live React route is the
candidate**.

### B1 · Same-viewport screenshot diff, preview vs. live route
1. Serve the preview HTML (static file server, per `browser-usage.md`) and start/confirm the app's
   dev server so the React route is reachable.
2. Repeat every entry in the approved **route-specific context matrix**. Public surfaces include
   1440 / 390 / 360. Product modules/components use the actual container modes, consequential
   widths/heights, themes, locales, and visual-equivalence states from static sign-off. At each
   entry, navigate to the preview and live route in the same state, then screenshot the same
   region. Also confirm any state-driven value (e.g. switching an active tab) actually updates the
   ported element on interaction, not just on first paint — and, at the matrix's narrowest
   width(s), check `document.documentElement.scrollWidth > document.documentElement.clientWidth`
   as a falsifiable overflow signal a screenshot alone can crop out.
3. Pixel-diff each pair (`npx -y pixelmatch-cli preview.png port.png diff.png 0.1`, same tool
   `browser-usage.md`'s replication loop uses) and **state the mismatch %** — don't eyeball it into
   "looks right."
4. **Threshold: 5% mismatched pixels, per viewport.** This is a reasonable default, not a law —
   adjust it up for a surface with legitimately-live data (real avatars/text lengths differing from
   the preview's fixture) or down for a pixel-critical surface, but state whatever threshold you use
   and why. Under threshold → pass. Over → itemize each discrepancy and either fix the port or
   explicitly waive it with a reason (e.g. "fixture text length differs from preview, not a port
   bug").

### B2 · The 5-item checklist
Run all five for every port, independent of the screenshot diff (a visual match can still hide a
behavioral or a11y regression the diff can't see):

1. **DOM not rebuilt on transition.** The port must reuse stable elements across a state toggle
   (stable React `key`s, className/attribute-only changes) — not tear down and recreate the
   subtree. Verify by a **node-identity check** across the toggle (capture a reference to the
   element before, trigger the state change, confirm the same node reference/`data-*` identity
   after — e.g. `element.isSameNode(...)` or a marker attribute), not by eyeballing that it "looks
   smooth." A rebuilt DOM kills CSS transitions silently (no old frame to animate from) —
   screenshots of the resting state can't catch this, only an identity check can.
2. **Exact values from `getComputedStyle`, never eyeballed.** Every color/contrast claim about the
   port is a measured value, not a screenshot read. **Caveat:** only measure resting states — an
   in-flight CSS transition's computed style reads as its *target* value, not its current frame (a
   frozen animation reads as fine). Settle the state first, then measure.
3. **Breakpoints preserved.** Diff the preview's `@media` query list (grep the preview HTML's
   `<style>`) against the port's CSS (component `.css` file + any Tailwind arbitrary-variant
   breakpoints) — same breakpoints, same behavior at each. A preview with `900px`/`560px` stack
   points that quietly became `768px`/`640px` in the port is a silent regression.
4. **Token attribution is an explicit written decision.** For every value carried from the preview
   into the port, say — in a comment or in your verification notes — whether it became a real app
   token (`--primary`, a Tailwind theme class) or stayed a locally-pinned value (a hex the port
   deliberately keeps literal, with why). **Silence is a fail**: an unattributed value is one nobody
   decided about, and the next redesign won't know it was deliberate.
5. **Contrast measured, not assumed, on every text-over-tint pair.** Any text sitting on a tinted
   background (an active-state wash, a colored pill, a subtle card tint) gets its contrast ratio
   computed from real `getComputedStyle` colors, checked against the 4.5:1 (body) / 3:1 (large text)
   floor. This is exactly the check that would have caught a real shipped contrast bug (example
   from a real project, 2026-07-28: an active-state label using `text-primary` on a `primary/7%`
   wash measured ~3.65–3.98:1, below floor, and needed a post-ship fix).

## Explicitly out of scope

- **Not a design step.** Visual/interaction decisions are made and signed off in `design-ui` /
  `design-motion`; a problem discovered here bounces back to one of those, it isn't silently
  re-decided mid-port.
- **Not a literal copy-paste** of prototype class names or DOM structure — every rule and every DOM
  node earns its translation (Phase A §1), not a mechanical carry-over.
- **No visual-regression CI.** This is a one-time manual gate run by an agent during a port, not a
  pipeline that runs on every future commit.
- **No baseline image store.** Screenshots taken during a run are verification evidence for that
  run, not assets to persist/compare against forever — the preview HTML itself is the durable
  baseline.
- Not a replacement for `design-motion`'s gates (lint hook, impeccable full audit, freezable-timeline
  frame check) when the surface has real motion still under review — this skill checks fidelity to
  what was already approved, not motion quality.

## Output

A short report covering whichever phases ran: for Phase A, which rules were classified how (and any
contract change traced), the component the edit landed in, and confirmation duplicate prototype
copies are synced. For Phase B, the mismatch % for every route-specific context-matrix entry
against the stated threshold, and the 5-item checklist with a pass/fail + one line of evidence per
item (not just a checkmark). Name the altitude, container/state, and dimensions for each diff.
Anything over threshold or any checklist fail gets itemized with a fix-or-waive call — waived items
need a reason, not a shrug. "The prototype looks right" is not the same claim as "the port is
done" — this report is what closes that gap.
