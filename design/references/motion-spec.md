# Motion Spec — the motion law

Adapted 2026-07-08 from motion-anything's `MOTION-SPEC.md`
(`~/projects/motion-anything/MOTION-SPEC.md`, Apache-2.0; itself aligned with Material motion,
Apple HIG, and Emil Kowalski's principles), originally reconciled with a real project's DESIGN.md
§4 motion language and motion tokens (DESIGN.md-specific citations below
are that project's case law). `design-motion` MUST read this at Setup — it replaces the loose
"motion numbers" prose. **The target project's DESIGN.md (when present) wins on any conflict**;
this file quantifies what it leaves open, and is the default law when the project has none.

## 1. First principles *(verbatim where possible)*

1. **Motion must mean something.** Every animation gives feedback, shows a relationship /
   continuity, or directs attention. If it does none of these, cut it. (= DESIGN.md
   Motion-Earns-It.)
2. **The best motion is felt, not noticed.** If users consciously notice it, it is usually too
   slow, too big, or too frequent.
3. **Restraint is the craft.** A single, well-placed moment beats ten.
4. **Performance is part of taste.** Janky motion reads as cheap.
5. **Accessibility is non-negotiable.** Always honor `prefers-reduced-motion`.

## 2. Duration tokens — do not invent arbitrary durations

| Token | ms | Register | Use for |
|-------|----|----------|---------|
| `instant` | 80–120 | both | hover/press feedback, tiny state flips |
| `fast` | 140–220 | both | micro-interactions, button/toggle states, small reveals — **the in-app default** (our house 150–220ms band) |
| `base` | 220–320 | both | standard transitions, panel enter (our `panel-enter` = 220ms) |
| `slow` | 320–500 | both | cross-screen / section transitions (DESIGN.md's "~300–500ms, nothing else should") |
| `deliberate` | 500–800 | marketing only | hero moments, celebratory bursts |
| `cinematic` | 800–2000 | marketing only | launch-film moments |

Rule of thumb: the larger the element or distance, the longer the duration — but stay in band.
In-app UI micro-interactions are almost always `fast`.

## 3. Easing tokens

| Token | value | Use for |
|-------|-------|---------|
| `ease-out` | `cubic-bezier(0.22, 1, 0.36, 1)` | **default** — things entering / responding (our house curve, design.json) |
| `ease-in` | `cubic-bezier(0.4, 0, 1, 1)` | things leaving the screen |
| `ease-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)` | moves that start and end on screen |
| `spring-soft` | spring(stiffness ~170, damping ~26) | organic feel; hover lift |
| `spring-snappy` | spring(stiffness ~300–380, damping ~30–32) | crisp controls; our `tab-indicator` = spring(380, 32) |

Default to `ease-out`. Linear is for continuous loops only (spinners, marquees). **No
bounce/elastic in-app** (DESIGN.md Don'ts) — overshoot springs are a marketing-register decision.

## 4. Restraint budget (per visible viewport)

- **≤ 1** celebratory / attention-grabbing moment.
- **≤ 3** simultaneous entrance animations; stagger the rest at **40–80ms** steps, the whole
  sequence finishing within `slow` (≤500ms).
- **In-app: zero ambient loops** (Motion-Earns-It — ambient decoration is slop). Marketing: at
  most one ambient/looping animation on screen.
- **Never auto-play celebratory motion.** Delight triggers on user intent (tap/submit), not load.
- When composing parts (Aceternity blocks, recipes) that each want "the one moment", the budget
  applies to their **sum** — pick one.

## 5. Performance rules

- Animate **`transform` and `opacity` only**. Never `width`/`height`/`top`/`left`/`margin`
  (layout thrash — the lint's `layout-transition` detect rule catches this).
- `will-change` sparingly; remove it after the animation ends.
- Target 60fps; if a pattern can't hold it, simplify.
- Clean up: cancel timers/rAF, remove injected DOM (particles) after they finish.

## 6. Reduced motion (mandatory)

Every animation ships a `prefers-reduced-motion: reduce` fallback: `scale-only` (keep a tiny
scale/opacity cue), `crossfade`, or `none` (instant end state). **The reveal must enhance an
already-visible default — never gate content visibility on a transition** (it ships blank on
hidden tabs / headless renders; DESIGN.md hard floor).

## 7. The in-app whitelist (DESIGN.md §4) vs marketing

- **In-app**, motion comes from the tamed whitelist: sliding tab/segment indicator ·
  highlight reveal · hover lift (~1px + shadow-md) · content crossfade/small rise ·
  clean connectors. Anything beyond the whitelist is a DESIGN.md deviation — surface and ask.
- **Marketing** may go bigger (beams, spotlight, tracing reveals, staggered scroll moments),
  on-brand (Electric Blue + slate), within this spec's budget and a11y floors.

## 8. The freezable timeline — how motion gets VERIFIED *(from motion-anything's `MA_RUNTIME`)*

A single screenshot cannot verify motion, and `getComputedStyle` mid-transition reads the
*target* (a frozen animation looks fine). The falsifiable signal is **deterministic frames**:

1. **Every motion preview exposes a seek handle.** Add to the preview HTML:
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
   Web-Animations/CSS animations are seekable via `document.getAnimations()`; pure
   rAF/JS-clock-driven motion is NOT seekable — prefer WAAPI/CSS for choreography, or expose the
   JS clock through the same `seek(t)`.
2. **Verify by seeking, not by waiting.** Drive Playwright: `browser_evaluate` →
   `__maTimeline.seek(t)` at t = 0 / mid / end (+ any keyframe of interest) → screenshot each →
   confirm the frames DIFFER and match the intended choreography. Identical frames across t =
   the animation never played (the failure single screenshots can't see).
3. **Reduced-motion check**: emulate `prefers-reduced-motion` and confirm the fallback state.
4. This is also the export path: a seekable preview can be rendered frame-exact to MP4/GIF later
   (motion-anything's `html-capture.js` / HyperFrames) if we ever need motion recordings.

## 9. Recipe library (parts, not paste)

`~/projects/motion-anything/recipes/` — ~400 dependency-free motion recipes, each a folder with
`recipe.motion.yaml` + self-contained `preview.html` + implementation. Use alongside
aceternity/react-bits as an ideas/parts source, with two rules:
- **Respect `avoid_when` + `restraint`** in each recipe's yaml — a recipe whose `avoid_when`
  matches our context is discarded, whatever it looks like.
- **Adapt into our language** (tokens above + DESIGN.md), never paste defaults — same as the
  Aceternity rule.

## 10. Definition of done (every produced motion)

- [ ] Serves feedback, continuity, or attention (§1) — stated in one sentence in the review list.
- [ ] Duration + easing pulled from the tokens (§2–3), appropriate to element size.
- [ ] Within the restraint budget (§4); in-app additionally within the whitelist (§7).
- [ ] Transforms/opacity only; cleans up after itself (§5).
- [ ] Working `prefers-reduced-motion` fallback; content visible without the transition (§6).
- [ ] Preview exposes `__maTimeline.seek(t)` and the frame check ran (§8).
