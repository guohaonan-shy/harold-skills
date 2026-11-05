# Critique — the isolated-critique checklists

Read at the static protocol's Gate 2 (isolated critique), for clearing AI tells, and at sign-off; at
the motion gates for anything usability-relevant that motion touches. Run it over the rendered
preview — screenshots and the real DOM (`getComputedStyle`), not the source. The mechanical subset
already runs in `${CLAUDE_PLUGIN_ROOT}/scripts/design-lint.mjs`; this file carries what a regex can't
decide. Each pass answers a different question; running only one misses what the others catch.

Severity for every finding: **P0** blocks the primary task or loses data; **P1** confuses or causes a
wrong action but is recoverable; **P2** friction, not confusion; **P3** polish. Route findings back to
the owning stage: composition → W, concept → B, craft → F.

## Typography thresholds

Measure, don't eyeball:

- **Line length**: body text wider than ~80 characters/line reads as a wall; cap paragraph
  containers at `max-width: 65–75ch`.
- **Tight leading**: `line-height` below 1.3× the font size cramps multi-line text.
- **Undersized text**: body below 12px; **functional UI text has a hard floor of 11px** (labels,
  captions, footer copy — footer placement is not an exemption). Only true legal smallprint may drop
  to 10px. A sub-11px size in a `DESIGN.md` ramp is not exempt — the floor is legibility, not token
  status.
- **Wide tracking on body copy**: `letter-spacing` above `0.05em` on paragraph text (that width is
  for short uppercase labels).
- **Flat type hierarchy**: adjacent heading/body sizes with a ratio under 1.25:1 are
  indistinguishable.
- **Overused AI-default typefaces**: Inter, Roboto, Fraunces, Geist, Plus Jakarta Sans, Space Grotesk
  as an unexamined default — fine when `DESIGN.md` picked one deliberately; this is "did you choose
  it or default to it", not a ban.
- **Oversized italic serif as a hero headline** (Fraunces/Recoleta/Playfair-family italic at display
  size): an AI-landing-page tell.
- **Other tells**: extreme negative letter-spacing on headings, justified body text without
  hyphenation (rivers), all-caps body paragraphs (fine for short labels).

## Visual slop catalog

Extends design-law's "Anti-slop checklist". Motion-only entries are in [motion.md](motion.md)'s
"Motion slop catalog".

- **dark-glow** — zero-offset, saturated colored box-shadow used as an ambient glow.
- **radial-halo** — a saturated radial gradient glow behind content on a dark background.
- **marquee** — auto-scrolling ticker/marquee text or logo strip (banned from the motion angle too).
- **gpt-thin-border-wide-shadow** — a thin 1px border paired with a wide, diffuse drop shadow (the
  "AI card" signature).
- **repeating-stripes-gradient** — a diagonal repeating-linear-gradient stripe texture as a fill.
- **codex-grid-background** — a decorative faint grid-line pattern behind content.
- **blinking-cursor** — a decorative typing-cursor animation with no real text-entry purpose.
- **shape-assembled-illustration** — an illustration built from generic primitives
  (circles/blobs/triangles) standing in for real photography or a real screenshot.
- **image-hover-transform** — an image that scales/rotates on hover for no functional reason.
- **theater-slop-phrase** — copy framing the product as a stage/performance ("take center stage",
  "the spotlight is yours").
- **calm-editorial-serif-default** — the *other* current AI default: a serif display face +
  ivory/olive/clay palette + generous whitespace, applied because it "looks premium" rather than
  because the brief calls for it. Self-check: (1) would this palette survive a brand-color swap — if
  yes, it's decoration, not identity; (2) is the serif carrying a specific brand claim, or just
  "editorial = trustworthy"; (3) does the whitespace serve the content's density, or hide a thin
  brief; (4) would three different briefs produce the same look — if yes, it's a template.
- **reference-averaging** — blending several references for one question into a safe median instead
  of picking the one whose reasoning answers it. A reference is evidence for a specific claim, not a
  vote.

## Layout/implementation integrity

Rendering bugs, not composition judgment; verify on the rendered DOM:

- **cramped-padding** — padding materially smaller than the text's size/line-height; no single px
  threshold, but under ~0.5× the font size on a text container is a strong signal.
- **body-text-viewport-edge** — text flush to the viewport edge with no gutter.
- **text-occlusion** — one element covering another's text.
- **first-viewport-column-overflow** — a column overflowing its bounds in the first viewport.
- **edge-flush-cards** — cards flush to the container edge with no gap when no bleed was intended.
- **clipped-overflow-container** — `overflow: hidden` clipping a positioned child that needed to show
  (badges, tooltips, dropdown shadows).
- **heading-rhythm** — less space above a heading than below it (should be the reverse).
- **repeated-container-text** — the same string duplicated across sibling containers (copy-paste
  signature).
- **text-overflow** — text clipped/truncated where the container should have grown or wrapped.
- **content-hidden-at-rest** — a reveal element still at `opacity: 0` after its trigger fired (check
  the settled DOM, not mid-animation).
- **broken-image** — a broken/404 image reference.
- **script-error** — an uncaught console error on load or interaction.

## Practical craft checklist

- **Forms**: correct `autocomplete` on every input that maps to a known field type; allow `paste`
  everywhere (blocking it breaks password managers); a disabled+spinner state on submit during
  submission, never a silent no-op; leaving an unsaved form follows "Leave / end confirmations".
- **Touch**: `touch-action: manipulation` on tappables (kills the 300ms delay);
  `overscroll-behavior: contain` on modal/scrollable panels; `autoFocus` on desktop only (on mobile it
  forces the keyboard open). Target sizing is in `accessibility-baseline.md`.
- **Performance**: virtualize lists over ~50 items; keep layout reads (`getBoundingClientRect`,
  `offsetHeight`) out of render and loops, batching reads before writes; prefer uncontrolled inputs
  for high-frequency typing.
- **Navigation**: keep meaningful UI state (selected tab, open filter, current page) in the URL so
  back/forward/refresh/share work.
- **Destructive actions**: every one has a recovery path — an undo window, or explicit confirmation
  when undo is impossible; prefer undo whenever recovery is possible (design-law's "Copy
  construction"). Whether a confirmation belongs at all: "Leave / end confirmations".
- **End-task entries** — for every leave, end or close entry (back, close, end session, cancel,
  navigate away), before judging confirmations:
  1. Tell what a click does: step back one step, or end the whole task (abandon the practice, exit the
     whole flow, discard the session).
  2. An entry that ends the whole task uses a close symbol (X), not a back arrow. A back arrow here is
     a finding.
  3. Give that X a hover / focus tip and an accessible name that says what it ends (for example "End
     practice"), not just "Close".
  4. Keep the back arrow for entries that really go back one step without abandoning the task.
  5. Whether a click needs a confirmation is decided next; don't repeat it here.

  Why: an arrow looks like an ordinary back, so users don't realize a click ends the whole task; an X
  tells them this button deserves care.
- **Leave / end confirmations** — for the same entries:
  1. Write down what a click right now would lose: submitted answers, non-whitespace text in an input,
     a recording or upload in progress.
  2. Something would be lost: protect it with a confirmation, or undo when recovery is possible.
  3. Nothing would be lost: the entry acts immediately. A confirmation here is a finding.
  4. Judge by state, not by entry: the same entry behaves differently empty and filled, so the
     acceptance matrix covers both.

  Why: a confirmation that guards nothing trains users to click through without reading, and the one
  that guards something real then fails to stop them. Use this for cases the list doesn't name.
- **Copy mechanics**: active voice; Title Case for UI labels/buttons per the project's own casing
  convention (a `DESIGN.md` convention wins); numerals as digits ("3 items").

## Nielsen's 10 usability heuristics

Score each 0–4 against the rendered surface, not the concept; under 3/4 is a finding, not a footnote.

| # | Heuristic | Check for |
|---|---|---|
| 1 | Visibility of system status | A loading indicator for every async action? Confirmation that an action completed? |
| 2 | Match between system and the real world | Terminology from the user's domain, not internal system names? |
| 3 | User control and freedom | An undo/cancel/back path out of every flow, especially destructive ones? |
| 4 | Consistency and standards | Same-meaning controls look the same here and on sibling surfaces? |
| 5 | Error prevention | Prevented before it happens (constrained inputs, disabled invalid actions), not only caught after? |
| 6 | Recognition rather than recall | Options visible in context, or must the user remember something from an earlier screen? |
| 7 | Flexibility and efficiency of use | A faster path for repeat users (shortcuts, bulk actions) without removing the novice path? |
| 8 | Aesthetic and minimalist design | Every element carries real signal, nothing "because it looks nice"? |
| 9 | Help users recognize, diagnose, recover from errors | Error messages state what happened, why, how to fix (design-law's "Copy construction")? |
| 10 | Help and documentation | Help for a genuinely non-obvious action is discoverable in context? |

## Cognitive load

Three load types, checked independently — a surface can pass one and fail another. **Intrinsic**
(the task's own difficulty): is the UI adding extra difficulty (unnecessary steps, indirection)?
**Extraneous** (bad presentation: inconsistent layout, unclear labels, competing signals): remove it,
don't "balance" it. **Germane** (effort that builds understanding): the only load to add
deliberately. The levers are design-law's restraint law and congestion budgets.

1. Working-memory ceiling: no more than **4** simultaneous unrelated things to hold in mind for one
   step.
2. Every visible control has an obvious purpose without hovering/clicking.
3. Related information is grouped; unrelated information separated.
4. The primary action is unambiguous at every step (the squint test).
5. Error states explain themselves without reconstruction.
6. Progressive disclosure hides advanced/rare options behind a clear affordance.
7. The user is never asked to remember a value the system already has.
8. Terminology is consistent across the whole flow.

**Named violation patterns** (diagnosis labels, not just "confusing"): **Wall of Options** (flat,
ungrouped, no default) · **Memory Bridge** (must remember an earlier screen, no reminder) · **Silent
State** (a change with no visible confirmation) · **Buried Primary** (main action subordinate to a
secondary) · **Terminology Drift** · **Modeless Ambiguity** (unclear which mode the user is in) ·
**Recall-not-Recognition** (must type/remember instead of picking) · **Undifferentiated Density**
(everything at one weight).

## Five-persona red-flag test

Pick the personas relevant to the interface type: dense in-app tools weight Jordan + Sam; public
marketing pages weight Alex + Riley; anything touching payment/deletion/account access always
includes Casey.

| Persona | Cares about | Test question | Red flag |
|---|---|---|---|
| **Alex** (first-time visitor) | What is this, what do I do first? | "What is this page for, in one glance?" | No clear entry point within 3 seconds |
| **Jordan** (returning power user) | Doing the thing fast without re-learning | "Where's the shortcut for what I do every day?" | Every action takes as many clicks as a first-timer's |
| **Sam** (screen-reader / keyboard-only) | Reaching and operating everything without a mouse | "Can I tab to this and know what it does from its accessible name alone?" | A control with no accessible name, or unreachable by keyboard |
| **Riley** (small/older device, poor connection) | Still works when network/device is worse | "What does this look like at 360px on a throttled connection?" | Layout breaks, or unusable until a heavy asset loads |
| **Casey** (anxious/high-stakes — money, deletion, privacy) | Safety from accidental irreversible actions | "What happens if I misclick here?" | A destructive/high-stakes action with no confirmation or undo |

## DESIGN.md drift check

A procedure, when the project has a `DESIGN.md`, before sign-off:

1. Pull the token set it actually maintains (color ramp, spacing, type scale, radius) from the
   project's own source of truth, not from memory.
2. Sample computed values from representative elements of the rendered preview and check each
   against the nearest declared token.
3. A value that maps to no token is either a legitimate new addition (name it and write it as a
   candidate, design-law's "DESIGN.md governance and candidates") or drift (fix it to the token).
   Every off-token value gets a decision; silence is the failure mode.
