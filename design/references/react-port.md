# React-Port Checklist — from prototype to real component

Read at Setup by `design-port` (Phase A). This is what
actually goes wrong translating a `design-preview/` or `design-motion-preview/` HTML+CSS+JS file
into the real React/TSX component — every rule below came out of an actual port in a real project,
not a hypothetical (worked examples and class names below are that project's case law).
`references/design-core.md`'s brand floors still apply here: a Tailwind translation that quietly
drifts off a token in the target project's DESIGN.md is a regression, not a detail.

## 1. Classify every changed CSS rule before touching React

A prototype's `<style>` block mixes two different kinds of rule, and treating them the same way
is the single most common port mistake:

- **Invented for this prototype** — a class that exists ONLY in the HTML file's own stylesheet
  (e.g. `.pa-gist`, `.pa-toolbar`). These must be TRANSLATED into Tailwind utility classes inline
  in JSX. Never copy the literal class name into React — there is no such class there, and adding
  one just to match the name duplicates styling logic the rest of the app doesn't share.
- **Already-shared branded CSS** — a class the running React app already imports and other
  components already use (e.g. `epa-grad-brand`, `epa-grad-text`, `epa-prose` — real CSS rules
  loaded by the app, not prototype scaffolding). These must be REUSED verbatim. Reinventing them
  as a new Tailwind utility string that merely *looks* similar throws away a shared definition and
  guarantees the two will drift apart at the next redesign.

Before writing a single Tailwind class, sort the prototype's changed rules into these two buckets.

## 2. Map CSS properties to Tailwind utilities — check precedent, don't assume

Every prototype CSS property needs a Tailwind equivalent, but don't assume one exists just because
it seems like it should. Grep the codebase for prior use before trusting a utility is available.

Worked example: the prototype's `-webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow:
hidden;` became Tailwind's `line-clamp-2` in React — but only after `grep -rn "line-clamp" src/`
confirmed it was already used elsewhere in this codebase (Tailwind 4 ships it as a core utility).
Without that check, the honest answer would have been "not sure this utility exists here" and a
manual CSS class would have been the safer fallback. When no utility exists, an arbitrary-value
bracket (`text-[15px]`) is the right fallback — don't invent a new global CSS class for a one-off
value unless it's genuinely going to be reused.

## 3. Reconcile exact pixel values against Tailwind's discrete scale — then verify visually

A prototype can specify any px value (`font-size: 16px`, `margin-top: 9px`). Tailwind's scale is
discrete (`text-sm`=14px, `text-base`=16px; spacing in ~4px steps). Sometimes the mapping is
exact; sometimes it's the nearest approximation, and that gap is invisible if you only compare
class names on paper.

Worked example: bumping a caption from 14px/regular to 16px/600-weight mapped EXACTLY onto
Tailwind's `text-base font-semibold` — 16px is a real token, nothing was lost. But an adjacent dot
marker's `margin-top: 9px` had no exact Tailwind spacing match, so it was approximated (`mt-2` =
8px) — the only way to know that approximation actually looked right was a fresh screenshot of the
LIVE React page, not a comparison of the two numbers. Never declare a port "matches the prototype"
from reading class names alone; always re-screenshot the rendered page (a falsifiable signal,
not a proxy that always looks fine).

## 4. New DATA is a contract change, not a styling port

If the prototype edit adds content that didn't exist in the real data flow before, the port is not
"add the text to JSX" — it's a data-contract change, and skipping straight to JSX will render
`undefined` for every row that predates it.

Worked example: adding a one-sentence `gist` caption required, in order — (a) a new required field
in the backend's extraction schema, (b) new register/length instructions in the LLM generation
prompt for that field, (c) a matching check added to the critique-pass prompt's checklist, (d) the
extractor prompt updated to map the new markdown line into the field, (e) the field added to the
i18n relocalization gate + translation call (so a non-English target doesn't silently leave it
untranslated), (f) the markdown-cleanup pass extended to cover it, (g) the frontend TypeScript type
updated, (h) the project's frozen-contract doc updated to match — and only THEN (i) the React JSX.
The tell: does the prototype's mock data (hand-written in its own `<script>` block) represent a
field that doesn't yet exist anywhere in the real pipeline? If yes, trace the field back to its
source before writing any JSX.

## 5. Never trust the prototype's mock data as proof the real thing works

A prototype's mock text is authored to look nice. That proves nothing about what a live model call,
a real user's input, or an edge-case row will actually produce.

Worked example: after wiring a new field end-to-end, the verification wasn't "the prototype looks
right with its hand-written sample text" — it was driving a REAL submission through the actual app
(login → fill a real practice → submit → wait for the real pipeline), then querying the resulting
database row directly to confirm the model-produced value actually landed and actually met its
length/register target (word-counted from the real string). Only after that ground-truth check did
the React page get screenshotted against that real row. (Ground decisions in evidence you
actually gathered, not a plausible-looking mock.)

## 6. Find the true home in the component tree by state ownership, not prototype DOM nesting

The prototype is one flat HTML file. React is already split into components with specific state
ownership — e.g. a selection state lifted to a parent component so both a switcher control and an
action button can read it. A prototype edit that visually sits "inside" one block might actually
belong in the PARENT component's JSX, not the child that merely renders that block's look. Grep
for the relevant `useState` before deciding which file to open.

## 7. Translate imperative JS into React's declarative state model — never copy it verbatim

A prototype typically re-renders by hand: a function that does `$('#x').textContent = value` and
rebuilds `innerHTML` on every state change, wired through manual `addEventListener` delegation.
React expresses the identical behavior as JSX reading directly from state (`{value}`), with no
imperative re-render function at all. If the interaction logic (which state changes on which
event) was already correctly wired in a prior React round, a pure styling port needs ZERO new
JS/state — resist adding a `useEffect` or handler whose only job is to imitate the prototype's own
re-render mechanics.

## 8. Keep the prototype's own file copies in sync

If this project keeps more than one copy of a `design-preview/` file (e.g. one inside a git
worktree, one in the main checkout, both gitignored, served by two different local ports), `diff`
them after every edit and sync the pair. A stale copy quietly served from whichever port the user
has bookmarked is a realistic, already-observed failure mode — don't assume a previously-synced
pair stays synced across sessions.

## 9. Verify the live React port at the same breakpoints, with a falsifiable signal

Re-run the same responsive check the prototype passed (desktop 1440 + mobile 390/360) against the
LIVE rendered React page — not the prototype a second time. A screenshot alone can crop out an
overflow; prefer a signal that can't lie:

```js
document.documentElement.scrollWidth > document.documentElement.clientWidth
```

This exact check caught a real regression: clustering two flex children into one wrapper without
`flex-wrap`/`max-width: 100%` overflowed the viewport at 390px even though the desktop screenshot
looked fine. Also confirm any state-driven value (e.g. switching an active tab) actually updates
the newly-ported element on interaction, not just on first render.

## Gate

A port is done when: every changed rule is classified (§1) and translated or reused correctly
(§2–3), any new data has been traced to a real contract change if applicable (§4) and verified
against a real, freshly-generated row (§5), the edit landed in the component that actually owns
the relevant state (§6–7), both prototype copies (if any) are back in sync (§8), and the live page
has been re-verified at 1440 + 390/360 with the scrollWidth/clientWidth check plus a real
screenshot (§9). Skipping straight from "the prototype looks right" to "done" is the failure mode
this checklist exists to prevent.
