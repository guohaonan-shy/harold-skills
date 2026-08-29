---
name: design-port
description: >-
  Port-verification gate for the gap between `design-ui` (ends at an approved
  preview HTML) and `design-motion` (only fires when there's real motion to
  design) — the plain static-preview-to-React port has no gate today. Use
  right after a preview HTML (`design-preview/<surface>.html`, or the
  motion-approved `design-motion-preview/<surface>.html`) has been hand-ported
  into a real React route, before calling that port done — "verify the port",
  "did the port match the preview", "check the React port against the design",
  "对照预览验证端口", "端口保真度检查". Not a new tool: it reuses `design-ui`'s
  own replication-diff-loop mechanics (`references/browser-usage.md`), run in
  the opposite direction — the preview HTML is now the truth, the live React
  route is the candidate. The gate repeats the route-specific context matrix
  signed off in `design-ui` / `design-motion` (public surfaces include
  1440/390/360; product modules/components use their real modes, dimensions,
  themes, locales, and states), with a stated mismatch % against a named
  threshold, plus a 5-item checklist (DOM-not-rebuilt-on-transition,
  computed-style-not-eyeballed, breakpoints preserved, token attribution
  explicit, contrast measured). Manual
  gate an agent runs during a port — no visual-regression CI, no baseline image
  store.
user-invocable: true
argument-hint: "[preview HTML] vs [live React route] — e.g. 'design-preview/academic-report-v2.html vs /dev/academic-report-v2'"
---

Verify that a React port of a signed-off preview HTML actually matches it — the one check missing
from the pipeline. `design-ui` ends at an approved preview; `design-motion` only runs when a surface
has real motion to design. A plain static port (or a port whose motion review already happened
upstream) can currently ship with nobody having screenshotted the two side by side. This skill is
that missing gate: small on purpose — a checklist + a falsifiable diff, not new infrastructure.

## When to run it

Right after a preview HTML (`design-preview/<surface>.html`, or `design-motion-preview/<surface>.html`
once `design-motion` signed off) has been ported into real React, and before telling anyone the port
is done. If the port also carries real motion that hasn't been through `design-motion` yet, run that
first — this skill checks fidelity to what was approved, not whether new motion is any good.

## Setup

1. Read `references/browser-usage.md` once (if not already read this session) for the underlying
   Playwright mechanics — headless/isolated server choice, static-file serving for the preview HTML,
   `browser_take_screenshot`/`browser_resize`/`browser_evaluate`, and the pixel-diff invocation.
2. Load the approved preview's `design-ui` / `design-motion` handoff record: entry altitude, state
   contract, and route-specific context matrix. That matrix is part of the approved design, not a
   fresh testing preference. If no record survives, reconstruct the probative dimensions from the
   preview and real container and state the evidence; do not silently fall back to irrelevant mobile
   widths for a desktop-only component.

This skill points the same browser tools at a different pair of targets; it does not invent a second
responsive contract.

## The one gate: same-viewport screenshot diff, preview vs. live route

Reverse of `design-ui` stage R's replication-diff loop: there, the shipped product was truth and the
preview was the candidate; here, **the preview HTML is truth and the live React route is the
candidate**.

1. Serve the preview HTML (static file server, per browser-usage.md) and start/confirm the app's dev
   server so the React route is reachable.
2. Repeat every entry in the approved **route-specific context matrix**. Public surfaces include
   1440 / 390 / 360. Product modules/components use the actual container modes, consequential
   widths/heights, themes, locales, and visual-equivalence states from static sign-off. At each
   entry, navigate to the preview and live route in the same state, then screenshot the same region.
3. Pixel-diff each pair (`npx -y pixelmatch-cli preview.png port.png diff.png 0.1`, same tool
   browser-usage.md's replication loop uses) and **state the mismatch %** — don't eyeball it into "looks
   right."
4. **Threshold: 5% mismatched pixels, per viewport.** This is a reasonable default, not a law — adjust
   it up for a surface with legitimately-live data (real avatars/text lengths differing from the
   preview's fixture) or down for a pixel-critical surface, but state whatever threshold you use and
   why. Under threshold → pass. Over → itemize each discrepancy and either fix the port or explicitly
   waive it with a reason (e.g. "fixture text length differs from preview, not a port bug").

## The 5-item checklist

Run all five for every port, independent of the screenshot diff (a visual match can still hide a
behavioral or a11y regression the diff can't see):

1. **DOM not rebuilt on transition.** The port must reuse stable elements across a state toggle
   (stable React `key`s, className/attribute-only changes) — not tear down and recreate the subtree.
   Verify by a **node-identity check** across the toggle (capture a reference to the element before,
   trigger the state change, confirm the same node reference/`data-*` identity after — e.g.
   `element.isSameNode(...)` or a marker attribute), not by eyeballing that it "looks smooth." A
   rebuilt DOM kills CSS transitions silently (no old frame to animate from) — screenshots of the
   resting state can't catch this, only an identity check can.
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

- **No visual-regression CI.** This is a one-time manual gate run by an agent during a port, not a
  pipeline that runs on every future commit.
- **No baseline image store.** Screenshots taken during a run are verification evidence for that run,
  not assets to persist/compare against forever — the preview HTML itself is the durable baseline.
- Not a replacement for `design-motion`'s gates (lint hook, impeccable full audit, freezable-timeline
  frame check) when the surface has real motion still under review — this skill checks fidelity to
  what was already approved, not motion quality.

## Output

A short report: the mismatch % for every route-specific context-matrix entry against the stated
threshold, and the 5-item checklist with a pass/fail + one line of evidence per item (not just a
checkmark). Name the altitude, container/state, and dimensions for each diff. Anything over threshold
or any checklist fail gets itemized with a fix-or-waive call — waived items need a reason, not a
shrug.
