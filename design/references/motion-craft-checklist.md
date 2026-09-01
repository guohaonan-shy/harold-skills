# Motion craft checklist — the static-rules half of Gate 2

Self-contained replacement for a live audit-tool invocation. Read this at `design-motion` Gate 2
alongside `motion-spec.md`. The mechanically-checkable subset runs natively in
`scripts/design-lint.mjs` (`bounce-easing`, `layout-transition` rules — no external detector
chained in); this file carries the judgment calls and the rules not worth encoding as regex,
plus the self-check recipes for the two that are.

## 1. The two lint-enforced detectors — what they catch and why

Both already run automatically via the PostToolUse hook on every write to
`design-motion-preview/`. Documented here so the *reasoning* travels with the rule, not just the
pass/fail:

- **`layout-transition`** — flags `transition`/`transition-property` declarations touching
  `width`, `height`, `top`, `left`, `right`, `bottom`, `margin*`, `padding*`, or the value `all`.
  Animating a layout-triggering property forces the browser to recompute layout on every frame
  (layout thrash) instead of compositing on the GPU. Fix: animate `transform` (`translate`/`scale`)
  and `opacity` only — a translate can replace a top/left animation; a scale can replace a
  width/height animation in most cases.
  **`transition: all` is banned outright**, independent of what layout properties are actually
  present today — it silently animates whatever layout property gets added later, and it's
  strictly cheaper to name the 1–2 properties actually being transitioned.
- **`bounce-easing`** — flags the literal keywords `bounce`/`elastic` and any cubic-bezier with an
  overshoot control point (`y > 1` or `y < 0`), which is what elastic/spring/wobble/jiggle easings
  produce mathematically. In-app motion uses exponential/standard easing only (motion-spec §3); the
  overshoot silhouette reads as playful/toy-like, wrong register for a product surface.

## 2. Motion slop catalog (extends motion-spec's restraint budget)

- **pulsing-dot** — a decorative pulsing status dot with no real underlying state change. A pulse
  is only earned when it's reporting a genuine live-data transition; otherwise use a static
  indicator with a clear label.
- **marquee** — auto-scrolling ticker/logo-strip motion (also a visual-slop entry in
  `ui-craft-checklist.md` — it's banned from both angles).
- **image-hover-transform** — scale/rotate-on-hover with no functional reason for the image to
  react.

## 3. Rules not yet in motion-spec.md

- **`transform-origin` must be set explicitly** whenever a `scale`/`rotate` transform is used — the
  default (`50% 50%`) is rarely the right pivot. A dropdown/menu opening from a trigger should pivot
  from the trigger's corner (`top left`/`top right`), not its own center.
- **SVG scale/rotate needs a wrapper**: animating `transform` directly on an SVG element can hit
  browser-inconsistent origin behavior — wrap the animated content in a `<g>` and set
  `transform-box: fill-box` on it for consistent pivoting across browsers.
- **Every animation must be interruptible by user input.** A running entrance/transition that can't
  be cancelled by the next user action (a second click, a route change mid-animation) creates a
  queued/stuck-feeling UI. Design the interaction to accept input at any point in the timeline, not
  only after it completes.
- **Off-screen/hidden animations pause.** Any looping or scroll-driven animation stops doing work
  when its element leaves the viewport or its tab/panel is hidden — this is a performance rule
  (motion-spec §4's "zero ambient loops in-app" already bans the case that matters most; this
  extends it to loops that *are* allowed, e.g. a marketing-register loop, which still must not burn
  cycles off-screen).
- **`prefers-reduced-motion` fallback must preserve state change and hierarchy, not just kill
  everything.** Do not blanket the whole page in a global near-zero duration override (e.g. forcing
  every transition to `0.01ms`) — that silently breaks any animation that was communicating a real
  state change (a tab indicator sliding to show which tab is active) by making the change
  imperceptible rather than instant-but-visible. The reduced variant must still *show* the change
  (a snap/crossfade/instant state swap), never hide that a change happened at all.
- **Focus must not be lost or skipped during an animation.** An element mid-transition (entering,
  exiting, reordering) must not drop out of the tab order early or become unreachable by keyboard
  until it has genuinely left the DOM — check this specifically for animated lists/panels, since
  `accessibility-baseline.md`'s static focus-order checks don't cover a moving target.

## 4. The Motion Pyramid — how much justification an animation needs

A four-level framework for judging whether a proposed animation earns its place, steeper levels
need a stronger, more specific reason (a vague "it'll feel nice" only clears Level 1):

1. **Micro-feedback** — hover/press/focus state changes. Justification: acknowledges the input
   happened. Almost always earns its place; keep it fast (motion-spec's shortest duration tokens).
2. **State transition** — a value/tab/step changes and the UI shows the before→after relationship
   (sliding indicator, crossfade, height animation on expand/collapse). Justification: continuity —
   the user should be able to track *what* changed without re-scanning the whole screen.
3. **Entrance/attention** — new content appearing, a toast, a highlight pulse on a genuine update.
   Justification: directs attention to something the user needs to notice *now*, not "the section
   arriving is nicer with a fade." Counts against the restraint budget (motion-spec §4).
4. **Expressive/atmospheric** — ambient loops, marketing-register flourishes, brand-personality
   motion. Justification: a specific brand/identity reason tied to the register dial (marketing
   only — motion-spec's in-app rules ban ambient decoration outright). The highest bar; "it looked
   cool" never clears it at any level, but especially not here.

Use this to answer "should this exist at all" before spending any time on *how* to build it — a
Level 4 animation proposed for an in-app surface is a register mismatch, not an implementation
question.
