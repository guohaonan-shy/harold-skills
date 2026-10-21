# Replicating the shipped UI, and reviewing on a real DOM

The canvas is a preview HTML file rendered in a real browser, so there is a real DOM from the first
pixel: contrast, responsive and container checks, and screenshot diffs against the shipped product
are measured, not approximated. Before your first browser call, load `idea-loop:browser` with the
Skill tool: it covers which Playwright server to drive, how to serve the page, how to show it to the
human and how to log in. Where the canvas lives and how its versions advance:
[refine-canvas.md](../refine-canvas.md).

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
