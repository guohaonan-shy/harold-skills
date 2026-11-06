# Motion — law, loop, and verification

Read after the static composition is signed off (`通过` and frozen), to decide whether to open the
motion stage and then to run it. Timing a layout that is still moving is animating something that will
change. The law below is adapted from motion-anything's `MOTION-SPEC.md` (Apache-2.0; itself aligned
with Material motion, Apple HIG, and Emil Kowalski's principles). **The target project's `DESIGN.md`
Motion chapter wins on any conflict** (it holds global principles, bans, and house duration/easing
tokens — no list of specific animations); this file quantifies what it leaves open and is the default
law when there is none (design-law's "Precedence").

## 开不开 — when to open

Motion serves the **block's job**, taken from the 「结构」 section of the direction note. Open the stage
only when a block's job is one of four:

| job | What motion does there |
|---|---|
| **状态** (state) | Makes "which state is this, which did it just come from" readable (loading, disabled, expand, selection changes) |
| **结果** (result) | Makes the result of a user intent visible (submit succeeded, delete undoable, a count changes) |
| **身份** (identity) | Makes the brand's character felt in one action (a marketing-register signature move) |
| **氛围** (atmosphere) | Keeps the environment alive while the subject is still (**marketing register only**; the in-app ambient-loop budget is zero) |

"Looks more alive" is not a job; motion without a job is filler. If none match, don't open the stage
and say so in one ledger line. Every moving element owes **one sentence of reason** tied to that job;
an element with no such sentence is cut, not tuned.

## First principles

Verbatim where possible.

1. **Motion must mean something.** Every animation gives feedback, shows a relationship / continuity,
   or directs attention. If it does none of these, cut it. "It looked cool" is not a reason.
2. **The best motion is felt, not noticed.** If users consciously notice it, it is usually too slow,
   too big, or too frequent.
3. **Restraint is the craft.** A single, well-placed moment beats ten.
4. **Performance is part of taste.** Janky motion reads as cheap.
5. **Accessibility is non-negotiable.** Always honor `prefers-reduced-motion`.

## The Motion Pyramid — how much justification an animation needs

Answer "should this exist at all" before "how to build it"; steeper levels need a stronger, more
specific reason (a vague "it'll feel nice" only clears Level 1):

1. **Micro-feedback** — hover/press/focus changes. Acknowledges the input happened. Almost always
   earns its place; keep it in the shortest tokens.
2. **State transition** — a value/tab/step changes and the UI shows before→after (sliding indicator,
   crossfade, expand/collapse height). Continuity: track *what* changed without re-scanning.
3. **Entrance/attention** — new content, a toast, a highlight pulse on a genuine update. Directs
   attention to something needed *now*, not "nicer with a fade". Counts against the restraint budget.
4. **Expressive/atmospheric** — ambient loops, marketing flourishes, brand-personality motion. A
   specific brand reason tied to the register dial; marketing only. A Level 4 animation proposed
   in-app is a register mismatch, not an implementation question.

## Duration tokens

Do not invent durations. The larger the element or distance, the longer — but stay in band. In-app
micro-interactions are almost always `fast`.

| Token | ms | Register | Use for |
|-------|----|----------|---------|
| `instant` | 80–120 | both | hover/press feedback, tiny state flips |
| `fast` | 140–220 | both | micro-interactions, button/toggle states, small reveals — **the in-app default** (the house 150–220ms band) |
| `base` | 220–320 | both | standard transitions, panel enter (e.g. `panel-enter` = 220ms) |
| `slow` | 320–500 | both | cross-screen / section transitions — nothing else should take this long |
| `deliberate` | 500–800 | marketing only | hero moments, celebratory bursts |
| `cinematic` | 800–2000 | marketing only | launch-film moments |

## Easing tokens

| Token | value | Use for |
|-------|-------|---------|
| `ease-out` | `cubic-bezier(0.22, 1, 0.36, 1)` | **default** — things entering / responding (the house curve) |
| `ease-in` | `cubic-bezier(0.4, 0, 1, 1)` | things leaving the screen |
| `ease-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)` | moves that start and end on screen |
| `spring-soft` | spring(stiffness ~170, damping ~26) | organic feel; hover lift |
| `spring-snappy` | spring(stiffness ~300–380, damping ~30–32) | crisp controls; e.g. `tab-indicator` = spring(380, 32) |

Linear is for continuous loops only (spinners). **No bounce/elastic in-app** — overshoot reads
playful/toy-like, a marketing-register decision. Lint's **`bounce-easing`** flags the keywords
`bounce`/`elastic` and any cubic-bezier with an overshoot control point (`y > 1` or `y < 0`).

## Restraint budget

Per visible viewport; parts composed together (library blocks, recipes) that each want "the one
moment" count as a **sum** — pick one.

- **≤ 1** celebratory / attention-grabbing moment.
- **≤ 3** simultaneous entrances; stagger the rest at **40–80ms**, the whole sequence finishing within
  `slow` (≤500ms).
- **In-app: zero ambient loops** (ambient decoration is slop). Marketing: at most one ambient/looping
  animation on screen.
- **Never auto-play celebratory motion.** Delight triggers on user intent (tap/submit), not load.

## The in-app whitelist vs marketing

- **In-app** motion comes from the project's whitelist (its `DESIGN.md` Motion chapter). With none
  declared, the default whitelist is: sliding tab/segment indicator · highlight reveal · hover lift
  (~1px + shadow-md) · content crossfade/small rise · clean connectors. Anything beyond is a
  `DESIGN.md` deviation — surface and ask.
- **Marketing** may go bigger (beams, spotlight, tracing reveals, staggered scroll moments), on-brand
  (the project's own accent and neutrals), within this budget and the a11y floors.

## Performance and craft rules

- Animate **`transform` and `opacity` only**. Lint's **`layout-transition`** flags `transition` /
  `transition-property` touching `width`, `height`, `top`, `left`, `right`, `bottom`, `margin*`,
  `padding*`, or `all`: a layout-triggering property recomputes layout every frame (layout thrash)
  instead of compositing on the GPU. A translate replaces a top/left animation; a scale replaces most
  width/height animations. **`transition: all` is banned outright** — it silently animates whatever
  layout property gets added later; name the 1–2 properties actually transitioned.
- `will-change` sparingly; remove it after the animation ends. Target 60fps; if a pattern can't hold
  it, simplify. Clean up: cancel timers/rAF, remove injected DOM (particles).
- **Set `transform-origin` explicitly** with any `scale`/`rotate` — the default `50% 50%` is rarely
  right; a menu opening from a trigger pivots from the trigger's corner (`top left` / `top right`).
- **SVG scale/rotate needs a wrapper**: wrap the animated content in a `<g>` with
  `transform-box: fill-box` for consistent pivoting across browsers.
- **Every animation is interruptible by user input** (a second click, a route change mid-animation);
  otherwise the UI feels queued/stuck.
- **Off-screen/hidden animations pause** — including loops that *are* allowed (a marketing loop still
  must not burn cycles off-screen).
- **Focus is not lost or skipped during an animation**: an element entering, exiting, or reordering
  stays in the tab order until it has genuinely left the DOM. Check animated lists/panels
  specifically; the static focus-order checks in `accessibility-baseline.md` don't cover a moving
  target.

## Reduced motion

Mandatory. Every animation ships a `prefers-reduced-motion: reduce` fallback: `scale-only` (a tiny
scale/opacity cue), `crossfade`, or `none` (instant end state).

- **The reveal enhances an already-visible default — never gate content visibility on a transition**
  (it ships blank on hidden tabs / headless renders; an a11y floor, not a preference).
- **The fallback preserves state change and hierarchy, not just kills everything.** No global
  near-zero duration override (forcing every transition to `0.01ms`): it makes a real state change
  (a tab indicator showing which tab is active) imperceptible. The reduced variant still *shows* the
  change (snap, crossfade, instant swap).
- The flashing floor (WCAG 2.3.1) is in `accessibility-baseline.md`.

## Motion slop catalog

Extends the restraint budget; the visual catalog is in [critique.md](critique.md).

- **pulsing-dot** — a decorative pulsing status dot with no real state change; a pulse is earned only
  by a genuine live-data transition, otherwise a static indicator with a label.
- **marquee** — auto-scrolling ticker/logo-strip motion (banned visually too).
- **image-hover-transform** — scale/rotate-on-hover with no functional reason.

## Freezable timeline — how motion is verified

A single screenshot can't verify motion, and `getComputedStyle` mid-transition reads the *target* (a
frozen animation looks fine). The falsifiable signal is **deterministic frames** *(from
motion-anything's `MA_RUNTIME`)*:

1. **Every motion preview exposes a seek handle:**
   ```js
   // Freezable timeline: pause every animation at global time T (ms) for deterministic capture.
   window.__maTimeline = {
     duration() { return TOTAL_MS; },
     seek(t) {
       document.getAnimations().forEach(a => { a.pause(); a.currentTime = t; });
       // CSS-delay-based entrances not covered by getAnimations() (e.g. paused-at-load
       // keyframes): set animationDelay = -(t - ownDelay) with animationPlayState 'paused'.
     },
     resume() { document.getAnimations().forEach(a => a.play()); },
   };
   ```
   WAAPI/CSS animations are seekable via `document.getAnimations()`; pure rAF/JS-clock motion is not
   — prefer WAAPI/CSS for choreography, or expose the JS clock through the same `seek(t)`.
2. **Verify by seeking, not by waiting**: run `__maTimeline.seek(t)` in the page (arbitrary JS via the browser capability; if the runtime can't, take the `idea-loop:runtime` fallback) at t = 0 / mid /
   end (+ keyframes of interest) → screenshot each → confirm the frames DIFFER and match the intended
   choreography. Identical frames = the animation never played. For scroll-driven or pointer
   interactions the timeline can't cover, capture before / during / after instead.
3. **Reduced-motion check**: emulate `prefers-reduced-motion` and confirm the fallback.
4. A seekable preview can later be rendered frame-exact to MP4/GIF (motion-anything's
   `html-capture.js` / HyperFrames) if motion recordings are ever needed.

## Recipe library

Parts, not paste. `~/projects/motion-anything/recipes/` (when present on this machine; skip silently
if absent) — ~400 dependency-free recipes, each a folder with `recipe.motion.yaml` + self-contained
`preview.html` + implementation, used alongside component/motion libraries (e.g. Aceternity, React
Bits). **Respect `avoid_when` + `restraint`** in each yaml: a recipe whose `avoid_when` matches the
context is discarded, whatever it looks like. **Adapt into the project's language** (the tokens above
+ `DESIGN.md`), never paste defaults.

## The loop (A build · B gates · C human sign-off · D React)

This is the review lens for **all** motion, split by concern, not chronology: motion edits made while
redesigning a component that already ships motion (retuning or removing a GSAP loop during a static
redesign) go through B's gates too before any port.

**Inputs** from the static protocol: the approved static preview HTML (you add behavior, not
redesign — start from this exact file so it stays pixel-faithful); the entry altitude, concept,
register and state contract; the route's context matrix, which motion verification repeats. Without a
frozen static UI, stop and run [static-protocol.md](static-protocol.md) first. **Setup:**
[design-law.md](design-law.md) (register dials, close-out) and this file; `DESIGN.md` if present;
the sibling shipped components whose interactions you must match or extend.

### A · Build in the browser

1. **Motion concept**, written: for each moving/interactive element — its one-sentence reason, its
   category (entrance / hover-press / state-transition / …, motion-anything's MOTION-SPEC §7
   taxonomy), and its duration & easing tokens (the project's own when its Motion chapter has them).
   Sum the entrances against the restraint budget before building.
2. **Parts, not paste**: component/motion libraries + the project's own (`motion` / framer v12,
   `gsap`, sibling components) + the recipe library; adapt everything into the project's tokens.
3. **Build on the static HTML**: copy the signed-off static version to
   `docs/design/tmp/<spec-slug>/canvas/motion-v1.html` and version up from there
   ([refine-canvas.md](../refine-canvas.md); the lint hook watches it too). React-heavy preview →
   inline `react@18.3.1` + `react-dom@18.3.1` + `@babel/standalone` + framer (`window.Motion`); else
   plain HTML + CSS + small JS on the tokens. Motion is a layer on top: a layout problem found here is
   written down and sent back to the static loop, never quietly re-skinned.
4. **Expose the freezable timeline.**
5. **Reduced motion**, per its section.
6. Serve it locally and drive it with the browser capability: load `idea-loop:browser` first (it sets the default
   headless server), then navigate, interact, capture.

### B · Review gates to convergence

1. **Gate 1 — mechanical lint** (automatic on every write): brand rules plus `layout-transition` and
   `bounce-easing`, all native to `${CLAUDE_PLUGIN_ROOT}/scripts/design-lint.mjs`. P0 = build error.
2. **Gate 2 — motion-craft audit**, self-contained, with
   [accessibility-baseline.md](accessibility-baseline.md): a11y (real semantics, focus order,
   keyboard — including mid-animation, per "Performance and craft rules"), perf (offscreen pause, no
   unbounded blur/filter), the inherited context matrix (public surfaces include 390 / 360; bounded
   components their real container modes and consequential dimensions), the motion slop catalog, the
   Motion Pyramid, and [critique.md](critique.md) for usability that motion touches. Re-audit until no
   P0/P1.
3. **Gate 3 — deterministic frame check**, per "Freezable timeline", plus the reduced-motion check.
4. **Gate 4 — Definition of done**, item by item, plus design-law's close-out protocol and the
   `idea-loop:designer` 「签字前检查」 items. An item that can't be ticked is a finding.

**Pass = lint clean AND audit clean AND the frame check demonstrates the motion AND DoD fully ticked.**

### C · ui-master on frames, then the human

The refine loop runs as usual for a motion round, with **frame sequences** instead of screenshots:
`__maTimeline.seek(t)` at t = 0 / mid / end (plus keyframes you care about), in time order; for scroll
and pointer interactions the timeline can't cover, before / during / after. The intent sentence, the
three things never given to the judge, `critic-score.mjs` and one ledger line per round are the same
as for static.

When motion is done, stop and let the human watch the running preview. The hand-back's 「改了什么」
carries: each motion's reason sentence and tokens, how reduced motion falls back, the restraint tally
for the viewport, the frame-evidence paths, responsive notes, and every `DESIGN.md` deviation and why.
Read a cluster of fine notes as one rule. **No React until the human signs off.**

On sign-off, Distill-back per design-law: a genuinely new in-app motion pattern becomes a candidate
naming the motion object it will hang on, shaped as a global principle for the Motion chapter; the
motion file itself, with the specific parameters and the candidate, is written from the final canvas
at the pre-merge archive (object shape in `idea-loop:design-archive`: its 「图的实体」 and
「写对象文件」). A new motion goes only into the motion file and the candidate, never straight into
`DESIGN.md`.

### D · Port to React (only after sign-off)

The port mechanics belong to `idea-loop:implement` (its UI-ticket reference: component tree by state
ownership, data-contract changes, token attribution, the measurement loop). What stays here is the
**motion-specific re-verification** its pixel comparators can't see:

- **Reuse, don't reimplement** — extend the real shipped component (keep its existing interactions);
  use the project's `ui/` + `motion`/`gsap`; carry the motion faithfully — same tokens, same
  choreography.
- **Re-verify in the live app** with the browser capability (the port can regress timing or break reduced
  motion): the Gate 3 frame check (the `__maTimeline` handle behind a dev flag, or capture over time),
  across the inherited context matrix.
- **Freeze record**: export key states to PNG under the project's design source-of-truth dir (e.g.
  `docs/source-of-truth/design/`), then start the worktree's dev servers and hand the URLs to the user
  for manual validation (per the project's CLAUDE.md, if defined), before the PR.

## Definition of done

Every produced motion:

- [ ] Serves feedback, continuity, or attention — stated in one sentence in the review list.
- [ ] Duration + easing from the tokens, appropriate to element size.
- [ ] Within the restraint budget; in-app additionally within the whitelist.
- [ ] Transforms/opacity only; cleans up after itself.
- [ ] Working `prefers-reduced-motion` fallback; content visible without the transition.
- [ ] Preview exposes `__maTimeline.seek(t)` and the frame check ran.
- [ ] A new in-app pattern carries its candidate.

## What this is not

- Not for designing the static visual/layout, and not a place to silently redesign it.
- Not "animate everything": the whitelist and the restraint budget are the default.
- Not verified by a single screenshot or `getComputedStyle` — only seek-frame evidence counts.
- Not Pencil (retired).
