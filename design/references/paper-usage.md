> ⚠️ **DORMANT — do not use right now.** The Paper canvas is temporarily disabled because Paper has
> no parallel-page support yet (can't hold multiple surfaces' pages open at once); the Paper community
> expects it in ~1 month. Until then `design-ui` and `design-motion` run on the **browser canvas** —
> see `references/browser-usage.md`. This file is kept intact as the **restore source**: when Paper
> ships parallel pages, swap the active canvas back here and remove this banner. Everything below is the
> Paper operating manual, frozen as-is.

---

# Paper MCP — usage + the recipes that took a pilot to learn

Paper (`mcp__plugin_paper-desktop_paper__*`) is the canvas where `design-ui` draws. It renders
HTML/CSS into editable design nodes and round-trips to code. This file is the hard-won operating
manual — read it before your first Paper tool call in a session so you don't re-discover the same
gotchas live.

## Init (once per session, before any other Paper tool)

1. `get_guide({ topic: "paper-mcp-instructions" })` — Paper's own guide (review checkpoints, layout
   rules). Read once; re-read only if a long thread may have dropped it.
2. `get_basic_info` — current file, artboards, fonts, tokens. Always orient first.
3. If you're starting fresh, make a dedicated file (`create_file` → `open_file`) — never pollute the
   "Welcome to Paper" template. Confirm fonts with `get_font_family_info` before typographic styling.

## Authoring with `write_html`

- **Inline styles only.** Paper is not running our Tailwind build — utility classes won't resolve.
  Use `style="..."`, and reference design tokens as `var(--token)` after creating them.
- **Layout primitives that work:** flexbox (`display:flex`), `padding`, `gap`, `position:absolute`
  for decoration. **Do NOT use** `display:grid`, `margin`, `display:inline`, or HTML `<table>` — they
  don't behave. Center a max-width block with parent `align-items:center` + child
  `width:100%; max-width:Npx` (margin auto is out).
- **Write incrementally** — roughly one visual group per call (a header, a card, a row). The user
  watches it build live; a 60-second silent dump reads as a black box. Use `duplicate_nodes` +
  `update_styles` + `set_text_content` for repeated rows instead of re-emitting HTML.
- **SVG works** (icons, decorative paths) and supports `var(--token)` in fill/stroke. Prefer real
  SVG icons over emoji (Paper's guide bans emoji-as-icon, and so do we).
- Name nodes with `layer-name="..."` so the layer tree is legible.

## Design tokens

Create the brand system once with `create_tokens` so the file speaks the target project's language
(pull the values from its DESIGN.md / theme; the set below is an example from a real project):
- colors: slate ramp (`--color-slate-50…900`), `--color-primary #137fec` (+ strong/bright), white,
  hero gradient stops; `--color-ink #0a0a0a` only as a *legacy* token (brutalism is retired — see
  that project's DESIGN.md).
- fonts: `--font-sans Inter`, `--font-display "Plus Jakarta Sans"`.
- radii: `--radius-md 10 / -lg 14 / -xl 20 / -2xl 24`.
Then style with `var(--…)`. `get_tokens` lists what's there; reuse before adding.

## Images — the one recipe that works (this is the big gotcha)

Paper's `write_html` ingests images **only** via:

```html
<img src="paper-asset:///ABSOLUTE/path/to/file.png" style="width:Npx; height:Mpx;" />
```

Two non-negotiables, both learned the hard way:
1. **`paper-asset://` + an absolute local path.** `http(s)://` `<img>` and CSS `background-image:url()`
   **silently fail** — they produce an empty Frame with no image fill. Don't use them.
2. **Explicit `width` AND `height`.** `height:auto` collapses to 0 / renders a black box. Compute the
   real pixel size first (`sips`/PIL) and set both.

On success Paper **uploads the file to its own asset store** (`get_fill_image` shows an
`app.paper.design/file-assets/...` url), so the local source file can be moved/deleted afterward and
the canvas still renders. Verify ingest with `get_fill_image` (returns the image) or `get_screenshot`.

**Capture pipeline** (for live UI fragments, product mocks, anything not worth rebuilding as nodes —
WebGL canvases, skeuomorphic devices, complex product fragments): drive the page with Playwright
(`mcp__playwright__browser_*`), `browser_take_screenshot` with a `target` selector to a local PNG,
then reference that PNG via the recipe above. Rebuild simple text/layout/vector as nodes; screenshot
the genuinely-hard-to-rebuild bits.

## Review on the canvas (no browser needed)

- `get_screenshot(nodeId)` per section — Paper's guide mandates a senior-designer pass after each
  group (spacing, type, contrast, alignment, artboard fit, repetition). Transparent nodes screenshot
  on black; that's just the backdrop, not a bug.
- `get_computed_styles(nodeIds)` returns **exact** hex + sizes — enough to compute contrast ratios
  *statically* (no browser), which is how `design-ui` runs its a11y-visual check.

## Export to code (the handoff to `design-motion`)

- `get_jsx(nodeId, format:"inline-styles")` → clean HTML/JSX with the real styles (SVGs preserved,
  tokens mapped). `format:"tailwind"` emits Tailwind classes instead. This is verified to work and is
  the fidelity-accurate static HTML that `design-motion` builds the animation layer on top of.
- `get_computed_styles` / `get_fill_image` for exact values when porting. **Never read sizes/colors
  off a screenshot — pull them from these tools.**

## Finish

Call `finish_working_on_nodes` when done editing (releases the working indicator). Don't leave it set.

## Known limits (why `design-motion` exists)

Paper is a **static** canvas: no native animation/interaction, and no real DOM semantics/perf. It can
embed motion assets (Lottie/Rive/video/three.js are on the roadmap, not native authoring), but
scroll-driven / GSAP-style interaction and runtime a11y/perf can only be built and judged in a real
browser on real code — that's the whole reason the pipeline splits UI (here) from motion (next).
