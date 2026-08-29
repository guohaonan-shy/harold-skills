# Browser canvas — usage + the replication-diff recipe

This is the **active** canvas for `design-ui` (and `design-motion`) while the Paper canvas is
temporarily disabled (Paper has no parallel-page support yet — see `paper-usage.md`'s dormant banner;
expected back in ~1 month). The canvas is a **preview HTML file rendered in a real browser**, driven
with Playwright. Read this before your first browser tool call in a session.

The big win over a static design tool: there is a **real DOM** from the first pixel. Contrast,
route-specific responsive/container checks, and faithful screenshot-diffing against the shipped
product at the selected Surface / Module / Component scope are all real, not approximated.

## Tools

- **Playwright MCP — default to the headless + isolated server for all review/verification.** Two
  servers are wired up, and picking the wrong one costs you a session of thrash:
  - **`mcp__playwright__browser_*`** — the project `.mcp.json` server, launched `@playwright/mcp
    --headless --isolated`. **This is the default for stage R capture + stage G review** (screenshot,
    contrast via `browser_evaluate(getComputedStyle)`, route-specific viewport/container matrix,
    console). Headless + a fresh
    isolated profile per session means: no window stealing focus, **no singleton-lock "Browser is
    already in use" fights**, and **no stale-cache** — each navigate is a clean profile, so you never
    need a `?v=N` cache-buster to see your latest edit.
  - **`mcp__plugin_playwright_playwright__browser_*`** — the plugin's own server, launched headed with a
    **shared** profile. Use ONLY when a human wants to watch the page live. Its shared headed profile is
    exactly what causes the singleton-lock conflicts and serves cached (stale) HTML after edits — do not
    reach for it for automated review.
  - Nothing in the review gates needs a headed browser: **taste** doesn't drive a browser at all (you
    screenshot for its lens), and **impeccable `critique`** does all its work headless (screenshots,
    computed-style contrast, detector-overlay injection, console) — its "present the browser to the
    human" step is optional with a fallback.
  - Tools on either server: navigate, resize, hover/click, `browser_take_screenshot` (with a
    `target`/element for a region), `browser_evaluate` for measurements, `browser_console_messages`.
  - The **human** reviews by opening the served `http://localhost:<port>/…` URL in their own real
    browser (stage H) — independent of which MCP you drive; that's why you can stay headless.
- A **static file server** for the preview HTML — `cd <scratch dir> && python3 -m http.server <port>`
  (run in background). `file://` works for plain HTML but breaks ES-module / fetch loads, so serve.

## Scratch layout

- Preview files live in a scratch dir, **not** the app tree: `design-preview/<surface>.html`
  (+ `design-preview/assets/` for captured PNGs). `design-motion` uses `design-motion-preview/`.
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
   `design-preview/assets/`: the affected surface for a Surface route, the module plus enough parent
   context for a Module route, or the component in its real container for a Component route. Pin the
   **probative viewport/container dimensions** so the replica can be captured at the *same* size for
   an honest diff. Public surfaces include 1440 and 390/360; fixed product components may require
   expanded/collapsed modes or short desktop heights instead.
4. Record the surface's URL, viewport, and selector in the replica file's header comment so the diff
   is reproducible.

## The replication-diff loop (`design-ui` stage R)

The goal is a **pixel-faithful HTML baseline at the selected scope** — affected Surface, bounded
Module in parent context, or Component in its real container — so the redesign is a faithful
evolution without forcing every task to reproduce an entire page.

1. **Read the React code first** — the component(s), the `ui/` primitives, the exact tokens/classes,
   and the data shape it renders. The replica is built from the *code's real styles*, not eyeballed
   from the screenshot. (Don't guess hex from a screenshot — read it from the source / computed style.)
2. **Build the replica** in `design-preview/<surface>.html` from that code + the captured PNG as the
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

- `browser_take_screenshot` per section for taste / impeccable `critique`.
- **Contrast is real:** read exact color via `browser_evaluate(getComputedStyle)` and compute ratios
  (body ≥4.5:1, large ≥3:1) — no static approximation needed.
- **Responsive/container behavior is real:** execute the route-specific matrix from the selected
  protocol. Public surfaces always include 390 / 360; product modules/components verify the modes,
  widths, heights, themes, locales, and product states that can actually change their result. Don't
  substitute an irrelevant mobile width for a fixed sidebar's short-height check. (Full runtime
  a11y-semantics / perf / motion audit still belongs to `design-motion` — this stage is static visual
  + layout only.)
- Verify with screenshots / measured values, never by inspection of the code alone.

## Export (handoff to `design-motion`)

The preview HTML **is** the artifact — no separate export step. `design-motion` builds the motion layer
directly on top of this file, then ports to React last. Pull exact values for the React port from
`browser_evaluate(getComputedStyle)`, never off a screenshot.
