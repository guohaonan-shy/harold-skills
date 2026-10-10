# Browser canvas — usage + the replication-diff recipe

This is the **active** canvas for `static-ui-protocol` (and `motion-protocol`) while the Paper canvas is
temporarily disabled (Paper has no parallel-page support yet — see `paper-usage.md`'s dormant banner;
expected back in ~1 month). The canvas is a **preview HTML file rendered in a real browser**, driven
with Playwright. Read this before your first browser tool call in a session.

The big win over a static design tool: there is a **real DOM** from the first pixel. Contrast,
route-specific responsive/container checks, and faithful screenshot-diffing against the shipped
product at the selected Surface / Module / Component scope are all real, not approximated.

## Tools

- **Playwright MCP — default to a headless + isolated server for all review/verification.** Up to
  three servers can be present, and picking the wrong one costs you a session of thrash:
  - **`mcp__playwright__browser_*`** — the target project's own `.mcp.json` server, when it defines
    one, launched `@playwright/mcp --headless --isolated`. **Prefer this over this plugin's bundled
    server when both are present** — a project-level server wins by Claude Code's own precedence
    (Local > Project > User > Plugins), and this line just names the tool prefix that shows up when
    it does.
  - **`mcp__plugin_idea-loop_playwright__browser_*`** — **this plugin's own bundled headless + isolated
    server** (`idea-loop/.mcp.json`, same `@playwright/mcp --headless --isolated` launch), present the
    moment the `idea-loop` plugin is installed even when the target project configures nothing itself.
    **This is the default for stage R capture + stage G review** (screenshot, contrast via
    `browser_evaluate(getComputedStyle)`, route-specific viewport/container matrix, console) whenever
    no project-level `mcp__playwright__browser_*` is present. Headless + a fresh isolated profile per
    session means: no window stealing focus, **no singleton-lock "Browser is already in use" fights**,
    and **no stale-cache** — each navigate is a clean profile, so you never need a `?v=N` cache-buster
    to see your latest edit.
  - **`mcp__plugin_playwright_playwright__browser_*`** — a separate, generic Playwright plugin some
    environments have installed, launched headed with a **shared** profile. Use ONLY when a human
    wants to watch the page live. Its shared headed profile is exactly what causes the singleton-lock
    conflicts and serves cached (stale) HTML after edits — do not reach for it for automated review.
  - Nothing in the review gates needs a headed browser: **taste** doesn't drive a browser at all (you
    screenshot for its lens), and the **isolated critique pass** (`ui-craft-checklist.md` /
    `heuristics-checklist.md`) does all its work headless (screenshots, computed-style contrast,
    console) — presenting the browser to a human is stage H's job, not this one's.
  - Tools on either server: navigate, resize, hover/click, `browser_take_screenshot` (with a
    `target`/element for a region), `browser_evaluate` for measurements, `browser_console_messages`.
  - The **human** looks at the page in the **built-in browser** of the Claude desktop app
    (`mcp__Claude_Browser__preview_start` with the served `url`), which opens a tab in a pane next to
    the conversation. That is the default for every page you put in front of a human — the imagine
    comparison board, the refine canvas. It is a separate browser from the Playwright you drive:
    you keep measuring and screenshotting headless, the human clicks in the pane.
    **Fallbacks, in order, and say which one you fell back to:** no built-in browser (CLI, no
    desktop app) → give the served `http://localhost:<port>/…` URL for the human's own browser;
    no way for the human to open a URL at all → screenshots stitched into one image, which loses
    motion and interaction and must be said out loud.
- A **static file server** for the preview HTML — `cd <scratch dir> && python3 -m http.server <port>`
  (run in background). Serve, always: the Playwright MCP refuses `file:` URLs outright, and `file://`
  breaks ES-module / fetch loads anyway. The MCP can also only **write** files inside the workspace
  root — save screenshots there and move them.

## Scratch layout

- The canvas lives in the target project's docs, **not** the app tree: `docs/design/<spec-slug>/<spec-slug>.html`
  (+ `docs/design/<spec-slug>/assets/` for captured PNGs; the motion layer is `<spec-slug>-motion.html` in the
  same folder). It is written there from the first stroke and frozen in place by `uiux-refine`. One spec
  = one folder, however many surfaces it spans. Scratch that should not survive (critic frames, round
  JSON) goes under `.tmp/<skill>/<spec-slug>/` at the worktree root instead (not the system `/tmp` — the
  lifetime follows the worktree; see `wiki-conventions.md` §2.1).
- Authoring style: inline styles + `var(--token)`, or pull our real Tailwind/tokens by inlining a
  built CSS — whatever reproduces the shipped surface most faithfully. Real DOM means real CSS works;
  you are not limited to flex-only like Paper.

## Capturing the production reference (ground truth for replication)

1. **Navigate** to the shipped surface. Prefer the target project's **production URL** as ground
   truth; the real app on local dev (same code) is an acceptable equivalent when a production state
   is hard to reach. Brand-new surfaces have no shipped reference — skip replication.
2. **Reach the right state.** Many in-app surfaces are behind auth — log in with the target
   project's QA/test account (check its CLAUDE.md or ask the user for credentials) and drive the UI
   to the exact data state you need to redesign. A screenshot of the wrong state is a wrong
   baseline. **On the default `--isolated` headless server there is no persisted session**, so
   drive the QA login flow each run (fill the login form headlessly); don't assume you're already
   signed in. (The headed plugin server happens to keep a session, but its lock/cache pitfalls
   aren't worth it just to skip a login.)
3. **Screenshot the exact selected scope** with a `target` selector to a PNG under
   the canvas folder's `assets/`: the affected surface for a Surface route, the module plus enough parent
   context for a Module route, or the component in its real container for a Component route. Pin the
   **probative viewport/container dimensions** so the replica can be captured at the *same* size for
   an honest diff. Public surfaces include 1440 and 390/360; fixed product components may require
   expanded/collapsed modes or short desktop heights instead.
4. Record the surface's URL, viewport, and selector in the replica file's header comment so the diff
   is reproducible.

## The replication-diff loop (`static-ui-protocol` stage R)

The goal is a **pixel-faithful HTML baseline at the selected scope** — affected Surface, bounded
Module in parent context, or Component in its real container — so the redesign is a faithful
evolution without forcing every task to reproduce an entire page.

1. **Read the React code first** — the component(s), the `ui/` primitives, the exact tokens/classes,
   and the data shape it renders. The replica is built from the *code's real styles*, not eyeballed
   from the screenshot. (Don't guess hex from a screenshot — read it from the source / computed style.)
2. **Build the replica** in the canvas file from that code + the captured PNG as the
   visual target.
3. **Capture the replica** at the *same viewport + region* as the production reference.
4. **Diff:** put the two screenshots side by side and compare — spacing, color, type, weight,
   radius, layout. Lead with the model's visual read; for a **falsifiable** convergence signal, run a
   pixel diff and track the mismatch %:
   ```bash
   # one-off, in the scratch dir
   npx -y pixelmatch-cli prod.png replica.png diff.png 0.1   # writes diff.png, prints mismatched px
   ```
   (or a tiny `pixelmatch` node script). A frozen-looking screenshot that always matches is not a
   check — the mismatch number is the signal that can come back wrong.
5. **Loop:** each delta → edit the preview HTML → re-capture → re-diff. Stop when there are **no major
   diffs** (faithful baseline). Small sub-pixel/AA noise is fine; structural/color/spacing deltas are
   not.
6. **Output:** the faithful baseline HTML + a one-line fidelity note (final mismatch %, anything
   intentionally not reproduced). The redesign (stage F) evolves *this* file, so you can always diff
   new-vs-original.

## Review screenshots (stage G) — now on a real DOM

- `browser_take_screenshot` per section for taste / the isolated critique pass.
- **Contrast is real:** read exact color via `browser_evaluate(getComputedStyle)` and compute ratios
  (body ≥4.5:1, large ≥3:1) — no static approximation needed.
- **Responsive/container behavior is real:** execute the route-specific matrix from the selected
  protocol. Public surfaces always include 390 / 360; product modules/components verify the modes,
  widths, heights, themes, locales, and product states that can actually change their result. Don't
  substitute an irrelevant mobile width for a fixed sidebar's short-height check. (Full runtime
  a11y-semantics / perf / motion audit still belongs to `motion-protocol` — this stage is static visual
  + layout only.)
- Verify with screenshots / measured values, never by inspection of the code alone.

## Export (handoff to `motion-protocol`)

The preview HTML **is** the artifact — no separate export step. `motion-protocol` builds the motion layer
directly on top of this file, then ports to React last. Pull exact values for the React port from
`browser_evaluate(getComputedStyle)`, never off a screenshot.

## The comparison board (`uiux-imagine`)

Every imagine round is put in front of the human as **one clickable page with real motion**, opened
in the built-in browser — not a stitched contact sheet. What these changes compare is usually a
state transition (playable → loading → playing / failed); a still can't show it, and "imagine it
spinning" is not a reaction the human can give honestly.

### The board

- One file, `.tmp/uiux-imagine/<spec-slug>/board.html` at the worktree root, served from that directory; the same page
  is refreshed every round (no new tab per round).
- **Variants stack vertically**, full width each. The built-in browser pane is ~800px wide; three
  side-by-side columns squash every variant into something nobody would ship.
- **Every variant carries its label on the page**: its name, the one line it bets on, and how it
  really differs from the others. This replaces the variant table in chat; chat only says which
  variants this round rendered.
- **Each variant runs a simulated timeline**, so the human clicks and sees what happens: e.g.
  "loading for 2s, then plays", "fails after 1.3s", "click again to retry". Put the timing on the
  variant's label so a human knows what they are about to see.
- **A "preview reduced motion" toggle at the top** that flips a class standing in for
  `prefers-reduced-motion: reduce`. Reduced motion is where directions break — a spinner that stops
  dead reads as "stuck" — and that is a direction-level reaction, so it belongs in this phase.
- Lowest fidelity that tells the variants apart still holds; real motion is not polish, it is what
  makes a state-change variant distinguishable at all.

### Building variants on an existing UI

When the change lands on a shipped surface, each variant is a **clone of the real component**,
changed only where this change bites:

1. Open the real page on local dev with Playwright and drive it to the **right state** (log in,
   seed data, route requests). Grab the target component's `outerHTML`.
2. Grab the page's CSS: walk `document.styleSheets`, join every rule's `cssText`, and rewrite
   relative `url(/…)` to absolute dev-server URLs — otherwise fonts and icons don't load on the
   board.
3. The Playwright MCP's code sandbox **cannot write files**. Run a tiny CORS-enabled HTTP server in
   `.tmp/uiux-imagine/<spec-slug>/` that accepts a POST and writes the body to disk, and `fetch` the
   captures to it from inside the page.
4. Assemble `board.html`: the captured CSS once, then one clone per variant with only the changed
   parts edited, each wired to its simulated timeline.

Pitfalls that have bitten real runs:

- **Capture the component in its resting state.** The moment you grab it, it may be mid-load —
  that loading state then quietly becomes the "baseline" every variant is compared against. Check
  what you captured before cloning it.
- **No `setTimeout` in the Playwright code sandbox**; wait with `page.waitForTimeout(ms)`.
- Brand-new surfaces have nothing to clone; build the variants from scratch, same board, same
  built-in browser.

### Cleanup

The board, the captures, and **both** servers (static + the capture POST server) go when imagine
finishes — renders do not survive the phase. The direction note is the only thing that does.
