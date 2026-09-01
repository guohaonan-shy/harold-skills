---
name: design-motion
description: >-
  Stage 2 of the design pipeline — take the approved static UI from
  `design-ui` (its fidelity-accurate preview HTML) and design the ANIMATION +
  native INTERACTION in a real browser under the motion law
  (references/motion-spec.md: duration/easing tokens, restraint budget,
  freezable-timeline verification), pass the review gates (lint hook, the
  self-contained motion-craft audit, deterministic seek-frame check), get the user's sign-off, and only
  THEN port it to React. Use this whenever a surface needs real motion or
  interaction designed or reworked — "加动效", "做交互", "重做这块的动效/交互",
  "animate this", "prototype the interaction", "make it move", "把动效加上" — or
  right after `design-ui` freezes a static design. Motion is built and judged in
  the browser (not straight in React) because real timing, scroll-driven
  interaction, runtime a11y/perf, and responsive behavior can only be verified on
  a rendered page; React is the FINAL step, entered only after the user approves
  the browser preview. References aceternity / react-bits / motion-anything
  recipes + our own motion implementations for ideas, never as copy-paste.
  SUPERSEDES the retired design-loop / Pencil skills.
user-invocable: true
argument-hint: "[surface whose motion/interaction to design — usually the one design-ui just froze]"
---

Design the **animation + native interaction** for a surface whose static UI `design-ui` already
approved, as a human-in-the-loop loop that ends in real React only after the user signs off on a
browser preview. The reason this is its own stage: real motion is only honest when you can watch it
run — timing, easing, scroll-driven behavior, reduced-motion fallbacks, and the runtime
a11y/perf/responsive checks all need a rendered page. `design-ui` settles the static visual; here we
layer motion on top, gate it on the human, and port to React last.

## Inputs (from `design-ui`)
- The approved **static preview HTML** — you're adding behavior on top, not redesigning. Start from
  this exact file so it stays pixel-faithful at its Surface / Module / Component scope.
- The **entry altitude, concept, register, and state contract** from the Design Read and selected
  protocol. Motion serves the user job and the distinct reachable states; it is not decoration.
- The **route-specific context matrix** used for static sign-off. Motion verification repeats the
  same relevant modes, dimensions, themes, locales, and product states.

If you arrived here without a frozen static UI, stop and run `design:design-ui` first — designing motion on
an unsettled layout wastes both stages.

## Principle — motion is law-governed, and the gates don't trust the generator

- **`references/motion-spec.md` is the motion law** (read at Setup): duration/easing **tokens**
  (never invented numbers), the **restraint budget** (≤1 delight moment, ≤3 simultaneous
  entrances, stagger 40–80ms, zero ambient loops in-app), mandatory reduced-motion, the in-app
  **motion precedent library** (DESIGN.md §4, T2 — preferred patterns with an admission process,
  not a closed whitelist) vs the marketing register, and the **freezable-timeline** verification
  convention.
- **Every animation earns a one-sentence reason** tied to the concept: feedback, continuity, or
  attention (spec §1). "It looked cool" is not a reason — drop it.
- **Verification is deterministic frames, not vibes.** `getComputedStyle` mid-transition reads the
  *target* (a frozen animation looks fine) — the only falsifiable signal is seeking the timeline to
  fixed times and confirming the frames differ as intended (spec §8).
- **This skill is the review lens for ALL motion — split by CONCERN, not chronology.** Any
  animation work goes through here: not just a fresh post-`design-ui` pass, but also **motion edits
  made while redesigning a component that already ships motion** (e.g. retuning/removing a GSAP
  loop during a static redesign). Such edits must NOT ship under `design-ui` alone — run them
  through B's gates before the React port.

## Setup
1. **`references/design-core.md` + `references/motion-spec.md` (this plugin) — FIRST.** The core
   carries the register dials + close-out protocol; the spec carries the motion law.
2. The target project root's `DESIGN.md` — **if present** — for the
   project's in-app motion precedent library (e.g., from a real project: sliding indicator,
   highlight reveal, hover lift, crossfade, clean connectors, processing shimmer; T2, with the
   admission process for new patterns) vs the livelier marketing register, and the project's
   house motion tokens (e.g. `ease-out` cubic-bezier(0.22,1,0.36,1), tab-indicator spring).
   If the project has no `DESIGN.md`, use the motion-spec tokens as the default law, note it,
   and suggest the user create a `DESIGN.md` — never abort over a missing doc.
3. The sibling shipped components whose interactions you must match or extend.

## The loop (A build · B gates · C human sign-off · D React)

### A · Design the motion/interaction in the browser
1. **Motion concept** (brief, written): for each moving/interactive element — the one-sentence
   reason (spec §1) + its **spec category** (entrance / hover-press / state-transition / …, spec
   §7 of motion-anything's taxonomy as adopted) + the **duration & easing tokens** (spec §2–3).
   Sum the entrances against the **restraint budget** (spec §4) before building.
2. **Parts, not paste.** Reference **aceternity / react-bits + our own** (`motion` / framer v12,
   `gsap`, the sibling components) *and* **motion-anything's recipe library** (spec §9 —
   `~/projects/motion-anything/recipes/` **when available on this machine; skip silently if
   absent**, each recipe self-contained with `avoid_when` +
   `restraint` in its yaml; a recipe whose `avoid_when` matches our context is discarded). Adapt
   everything into our tokens; never paste defaults.
3. **Build on the static HTML.** Start from `design-ui`'s approved preview (so the visual stays
   pixel-faithful) and layer in real motion + native interaction. Write to
   `design-motion-preview/<surface>.html` (the lint hook watches this dir too). React-heavy
   preview → inline `react@18.3.1` + `react-dom@18.3.1` + `@babel/standalone` + framer
   (`window.Motion`); else plain HTML + CSS + small JS using the spec tokens.
4. **Expose the freezable timeline** (spec §8): the preview defines
   `window.__maTimeline = { seek(t), duration(), resume() }` covering the entrance choreography.
   Prefer WAAPI/CSS animations (seekable via `document.getAnimations()`) over rAF clocks for
   choreography — unseekable motion is unverifiable motion.
5. **Reduced motion is mandatory** (spec §6): every animation has a `prefers-reduced-motion`
   alternative (scale-only / crossfade / none), and the reveal must enhance an already-visible
   default — never gate content visibility on a transition (it ships blank on hidden tabs /
   headless renders).
6. Serve it locally and drive it with Playwright (default headless server per
   `references/browser-usage.md`): navigate, interact, capture.

### B · Review gates — to convergence
Now there's a real rendered page, so the full checks are available.
1. **Gate 1 — mechanical lint (automatic).** The PostToolUse hook lints every write to
   `design-motion-preview/` — brand rules plus the native `layout-transition` and `bounce-easing`
   detectors (`scripts/design-lint.mjs`, no external tool chained in). P0 = build error; fix before
   continuing.
2. **Gate 2 — motion-craft audit** (self-contained: read `references/motion-craft-checklist.md`
   and `references/accessibility-baseline.md`): a11y (real semantics, focus order, keyboard — check
   the animation-in-progress case per motion-craft-checklist §3), perf (offscreen-pause, no
   unbounded blur/filter), and the **route-specific context matrix inherited from design-ui** —
   plus the motion slop catalog and Motion Pyramid framework for motion craft. Public surfaces
   include 390 / 360; bounded product components use their real container modes and consequential
   dimensions. Fix findings, re-audit until clean (no P0/P1).
3. **Gate 3 — deterministic frame check (the falsifiable one, spec §8):**
   `browser_evaluate(__maTimeline.seek(t))` at t = 0 / mid / end (+ keyframes of interest) →
   screenshot each → confirm the frames **differ** and match the intended choreography (identical
   frames = the animation never played). Then emulate `prefers-reduced-motion` and confirm the
   fallback. For scroll-driven or pointer interactions the timeline can't cover, capture
   screenshots across the interaction (before / during / after) instead.
4. **Gate 4 — the motion DoD checklist (spec §10)**, item by item, plus the close-out protocol
   (core §6). A checklist item that can't be ticked is a finding, not a footnote.
- **Pass = lint clean AND audit clean AND frame check demonstrates the motion AND DoD fully
  ticked.**

### C · Human review list + sign-off (the hard gate)
Produce a **human review list**: each motion/interaction with its one-line reason + tokens used,
the a11y/reduced-motion handling, the restraint-budget tally for the view, responsive notes, and
any tradeoff or DESIGN.md deviation (with why). The user reviews the running preview in the
browser. Their feedback is the only switch that advances. Read a *cluster* of fine notes as ONE
rule. **Do not enter React until the user approves.**

**Distill-back on sign-off** (as in design-ui H): a genuinely new in-app motion pattern that
passed the gates is recorded into the project's DESIGN.md motion precedent library as a dated
entry — that IS the admission process (if the project has no DESIGN.md yet, propose creating one
to hold the precedent). A new pattern shipping silently, outside the library, is the failure
mode.

### D · Port to React (final, only after sign-off)
Port the approved HTML/motion into real React/TSX in a worktree (per the target project's
CLAUDE.md workflow, if it defines one):
- **Reuse, don't reimplement** — extend the real shipped component (keep its existing
  interactions); use our `ui/` + `motion`/`gsap`. The static visual already matches `design-ui`;
  carry the motion faithfully — same tokens, same choreography.
- **Re-verify in the live app** with Playwright (the port can regress timing or break
  reduced-motion): the same frame-based check as Gate 3 (add the `__maTimeline` handle behind a
  dev flag, or capture over time), across the inherited route-specific context matrix.
- **Freeze record:** export key states to PNG under the project's design source-of-truth dir
  (e.g. `docs/source-of-truth/design/`, or wherever the target project keeps design records), then
  start the worktree's dev servers and hand the URLs to the user for manual validation (per the
  target project's CLAUDE.md, if defined), before the PR.

## DESIGN.md governance (same as design-ui)
Soft preferences → surface and ASK before deviating. Hard floors never relax: a11y (incl.
reduced-motion is non-optional), the restraint budget, and the target project's brand core
(example from a real project: Electric Blue; Retired-Ink; Tamed-Aceternity — no flashy defaults
in product UI; selection = brand ring).

## What this skill is NOT
- Not for designing the static visual/layout — that's `design-ui` (run it first).
- Not a place to silently redesign the approved UI — if the motion work reveals a layout problem,
  surface it and bounce back to `design:design-ui`, don't quietly re-skin in the browser.
- Not "animate everything" — unmotivated motion is slop; the in-app whitelist + the restraint
  budget are the default.
- Not verified by a single screenshot or `getComputedStyle` — only seek-frame evidence counts.
- Not Pencil (retired).
