# Static protocol — design a surface's static UI in the browser

Not an entry: `idea-loop:uiux-refine` reads this when it reaches the static visual stage. Motion and
native interaction come after sign-off in [motion.md](motion.md); turning a signed-off canvas into
code is `idea-loop:implement`'s job.

Design the **static UI** of a product surface in a **real browser** as a preview HTML file: visual
system, layout, hierarchy, copy, component structure, and the *shape* of interactions (which states
exist and where controls sit). The canvas is the browser, not Paper (temporarily); before any browser
tool call, load `idea-loop:browser` with the Skill tool.

**The gates do not trust the generator.** Every route closes through deterministic lint, isolated
critique with persisted evidence, real-DOM checks, a context-appropriate matrix, and human sign-off.
A direction/slop finding returns to concept or composition; a craft finding is fixed in the preview.

## Setup

1. Read [design-law.md](design-law.md).
2. Read the target project root's `DESIGN.md` and `PRODUCT.md`, each if present (missing: see
   design-law's "Precedence").
3. Read the real code, data/domain model, and sibling shipped components at the target scope.
4. Load `idea-loop:browser` before any browser call.

[accessibility-baseline.md](accessibility-baseline.md) (beyond the one-line a11y floor) and
[laws-of-ux.md](laws-of-ux.md) (a composition question the expression framework doesn't answer) load
only when such a question comes up.

## Altitudes and the entry route

One entry, three composable altitudes:

```text
Surface route  → Surface → Module → Component where needed
Module route   → Module → Component where needed
Component route→ Component only
```

The route is the **highest altitude changed by the work**, not the filename or noun in the prompt.
Lower altitudes are still part of a higher route — a new page descends into the components that carry
a decision, introduce a new pattern, or vary by product state — but descending is composition, not a
second run. Run exactly one entry route.

| Entry route | Use when… |
|---|---|
| **Surface** | Route/page IA, user journey, module order, dominant reading path, or responsive composition changes |
| **Landing / IA** | A landing, marketing, or multi-product page whose page taxonomy and Hero geometry must be decided before composition. Not a fourth tier: it runs the Surface procedure plus "Landing / IA" below, and descends exactly as Surface does |
| **Module** | One bounded section's internal grouping, hierarchy, density, or local responsive composition changes while page IA, module order, the dominant reading path and the journey stay stable |
| **Component** | All hold: one bounded subtree changes; parent module order and page IA stay stable; the journey stays stable; no new cross-page flow; the uncertainty is signal priority, treatment, or state presentation |

**Crossing altitude.** A change whose effect reaches **outside its own DOM subtree** — a sibling's
rendered size/position, the parent's scroll position or grouping, module order, which module leads
the page, a page-level state/flow, the mobile IA, the user's journey — has crossed altitude: route
from the higher one, even when a local CSS/JS patch could make the symptom go away. The named cases
are examples, not the list. Downward: a module change with no spatial composition change inside it
enters at Component; a component that can't be judged in a fixed context frame escalates.

Close A by recording the chosen route, why it is the highest changed altitude, and which lower
altitudes are expected later.

## The loop (A route · R ground truth · B concept & expression · C named question · W freeze · D escalate · E parts · F build · G gates · H human)

### A · Clarify, declare the Design Read, choose the route

State the Design Read (design-law) in one line. Ask at most one clarifying question, only when the
brief is genuinely ambiguous. Choose the route above.

### R · Ground truth at the selected scope

The judge here is fidelity, not improvement. Record a one-line fidelity/context note with the exact
state, viewport and container dimensions captured.

| Scope | Ground truth |
|---|---|
| Surface | Read the route/page code, layout shell, real data shape, shared primitives; capture the shipped surface; rebuild the affected surface faithfully; diff until no major differences |
| Module | Read its code, data/state sources and direct parent layout; capture it inside enough parent context to judge width, rhythm, adjacency and scroll; reproduce the module, not the page, unless the boundary can't be judged otherwise |
| Component | Read the component, direct parent, shared primitives, state/data sources, i18n strings and sibling implementations; capture it inside its actual container with enough surrounding UI to judge weight, available width/height, and competition with the parent primary; reproduce the component, not the page |
| Brand-new work | Nothing to replicate: build an honest context frame from the real app shell, parent, siblings and tokens. Never a generic product frame or a flattering floating showcase card |
| Imagine handoff | The baseline was already cloned from production and lives in `handoff/`: don't re-capture production or restart the app; verify the copy against the handoff canvas (the 「起手」 section of the `idea-loop:designer` agent) |

Preserve shipped warts: lint findings against legacy styling are redesign backlog, not permission to
change the baseline.

#### Capturing the production reference

1. **Navigate** to the shipped surface. Prefer the target project's production URL; the real app on
   local dev (same code) is acceptable when a production state is hard to reach.
2. **Reach the right state.** Behind auth, log in with the project's QA/test account (its CLAUDE.md,
   or ask the user) and drive the UI to the exact data state; a wrong-state screenshot is a wrong
   baseline. The default `--isolated` headless server has no persisted session: drive the QA login
   each run. (The headed plugin server keeps a session, but its lock/cache pitfalls aren't worth it.)
3. **Screenshot the exact scope** with a `target` selector to a PNG under the canvas folder's
   `assets/`, at pinned **probative dimensions** so the replica is captured at the same size (public
   surfaces 1440 and 390/360; fixed product components may need expanded/collapsed modes or short
   desktop heights instead).
4. Record URL, viewport and selector in the replica's header comment so the diff is reproducible.

#### The replication-diff loop

The goal is a pixel-faithful HTML baseline at the selected scope, so the redesign is a faithful
evolution.

1. **Read the code first** — components, `ui/` primitives, exact tokens/classes, data shape. Build
   from the code's real styles; never guess hex from a screenshot.
2. **Build the replica** in the canvas (the latest `docs/design/tmp/<spec-slug>/canvas/v<N>.html`,
   see [refine-canvas.md](../refine-canvas.md)) with the captured PNG as the visual target.
3. **Capture the replica** at the same viewport + region.
4. **Diff** side by side — spacing, color, type, weight, radius, layout. Lead with the visual read;
   for a falsifiable signal run a pixel diff and track mismatch %:
   ```bash
   # one-off, in the scratch dir
   npx -y pixelmatch-cli prod.png replica.png diff.png 0.1   # writes diff.png, prints mismatched px
   ```
   A frozen-looking screenshot that always matches is not a check — the number can come back wrong.
5. **Loop** edit → re-capture → re-diff until no major diffs (sub-pixel/AA noise is fine;
   structural/color/spacing deltas are not).
6. **Output** the baseline + a fidelity note (final mismatch %, anything intentionally not
   reproduced). Stage F evolves *this* file, so new-vs-original can always be diffed.

### B · Concept, state contract, expression table

For UI whose visibility, content, action, or priority changes with external conditions, complete the
**reachable-state matrix before visual design** (design-law's "Conditional-state precondition"):
state framing precedes the content inventory. Per altitude:

- **Surface:** a page-level state map (loading, ready, empty, permission/access, recoverable error,
  terminal error, other real states) answers which modules exist and what recovery is available; it
  does not cross-product children's local states.
- **Module:** a module-level map when conditions change which elements/components exist; page
  lifecycle states stay outside unless they alter the module's contract.
- **Component** (conditional when external product/container conditions change its visibility,
  content, action, fallback, or priority). Typical dimensions: business eligibility (free/paid, role,
  permission, entitlement); data lifecycle (loading, success, empty, stale/refetching, recoverable
  error, terminal error); container context (expanded/collapsed, desktop/drawer, standard/short
  height); local interaction (default, hover, focus, selected, disabled — as a separate strip). The
  matrix is the shared source for design, implementation behavior, and tests:

  | Conditions | Reachable? | Render? | Content/value | Available action | Fallback/recovery | Visual equivalence class |
  |---|---|---|---|---|---|---|

Then write the concept and the expression table at the current altitude (design-law's "Expression
framework"; higher routes repeat it at lower altitudes only for changed or decision-bearing children):

| Altitude | Concept items |
|---|---|
| Surface | user's job (the task completed here); user path (entry, primary sequence, decisions, recovery, exit); the one idea; the no-reference move (the product-specific part no category supplies). Landing pages add the taxonomy and Hero slots below |
| Module | its single job in the parent surface; what enters/exits and how it supports the page's primary task; its one idea; the relationship that must stay quiet so it doesn't compete with the page primary |
| Component | per distinct visual behavior: the user's decision/job; the one idea; signal inventory (every qualifier, label, value, action, recovery cue); priority; L4–L1 + position ladder; congestion check (≤1 L4, ≤2 L3, ≤4 signals) |

**Concepts.** A redesign or substantial new surface/module offers concept A (inside current T2
defaults) and concept B (bending at least one named T2 preference: name the bend, benefit, and
cost; T1 floors and T3 bans stay fixed). A bounded component treatment normally takes one concept;
variants only for unresolved visual choices, never to manufacture options.

**Gate:** concept, state contract where applicable, and expression table are signed off before
references or pixels.

### C · A named question the concept leaves open: write it down, don't research it

Skip by default. Fires only when the concept leaves a specific structural, coverage, flow, or state
question a judgment at this altitude cannot settle.

**The executor does not research**: no Refero, no research agent. It writes a **suggested research
question** — one sentence, one decision, plus its **recommended answer** — into the hand-back
(`designer`'s 「建议调研的问题」) and carries on without stopping, working from the recommendation.
Whether to research is the human's call: they may run `idea-loop:uiux-research` and forward
conclusions back as **text**. How research runs is that skill's business.

- Anything the human attached is read now, as input, not as research.
- Every source used (attached, or a forwarded conclusion) is recorded in the freeze record with four
  parts: what it answers, what it does not (**Cannot answer**), and **Keep / Change / Do not copy**.
  "Cannot answer" is the half that keeps a reference from being over-read: a desktop screenshot
  doesn't answer mobile navigation; a light-mode color sample doesn't justify collapsed behavior; a
  desktop sidebar doesn't justify a mobile drawer; a visual promotion card doesn't answer
  collapsed-container behavior. A source that cannot represent the target state never enters the
  conclusion, and references never replace product-state evidence from code.
- **reference-averaging** ([critique.md](critique.md)) applies: sources that disagree are a decision
  for the human, not a midpoint.

### W · Freeze the cheapest honest artifact

- **Surface:** gray boxes with real text hierarchy, no visual skin. Name the spatial thesis first:
  primary reading/task path; semantic grouping; leading and supporting module; density and
  whitespace rhythm; responsive composition intent. Squint against the Surface expression table;
  iterate until module order, area, grouping and responsive collapse are signed off.
- **Module:** a gray-box local wireframe inside a lightweight real parent context, real text
  hierarchy, no brand color, shadows or decoration. Freeze element order and grouping,
  leading/supporting relationships, density, local responsive reflow, and boundaries with
  parent/siblings. No spatial decision to make means the task was misrouted: enter at Component.
- **Component:** a **deterministic treatment** when `DESIGN.md`, a signed-off sibling, or a
  user-provided spec already settles it (no decorative alternatives to satisfy a process); otherwise
  a **Variant Board** of 2–3 legitimate treatments side by side in the **same** real container, with
  identical content and state, so only the disputed variables change. Label the exact question each
  row/column answers (signal placement: eyebrow vs inline vs icon; CTA: flat primary vs governed
  gradient; preview: abstract path vs product-native cards). Pick 2–3 coherent combinations, not an
  exponential grid; include the highest-risk equivalence class and, when relevant, a second row with
  the most different state (terminal error, collapsed). The user chooses or merges once; only the
  selection proceeds.

**Gate:** the wireframe or chosen treatment is signed off. Styling cannot quietly change the frozen
composition; spatial structure changes bounce back to W.

#### Descent

A higher route descends only after its current composition is frozen, in one run:

1. Inventory modules as **unchanged**, **changed composition**, or **new**; preserve/stub unchanged
   ones, never redesign for completeness.
2. Changed/new modules whose internal hierarchy matters run the Module rows of each stage.
3. Each changed module classifies its children:
   - **Existing primitive** — reuse exactly.
   - **Deterministic composition** — one treatment already governed by `DESIGN.md`/siblings; build once.
   - **Decision-bearing** — several legitimate treatments or a major user decision: expression table
     + optional Variant Board.
   - **Conditional** — external state changes visibility, content, action, or priority: state matrix
     + expression table + optional Variant Board.

   Only the last two run the Component rows. Don't run the full procedure on every button, badge, or
   card merely because the page is new.

#### Landing / IA

**Page taxonomy** (stage B — the "user's job" and "one idea" for a landing page). Classify the page's
one primary responsibility: Company Homepage · Product Family Landing · Specific Product Page ·
Capability Deep Dive · Use Case / Solution Page · Pricing / Enterprise / Trust Page · Activation /
Docs / Template Page. For a multi-product page, map Parent / Sibling / Cross-cutting nodes and which
sections carry a **Product**, **Capability**, **Router**, **Use Case**, **Buying**, **Trust**, or
**Activation** responsibility. URL depth and nav labels don't decide the taxonomy: a page three
levels deep can be a Router; a top-level page can be a Capability Deep Dive.

**Hero seven-slot model** (inventory at B, geometry locked at W before descending):

```text
Nav / Headline / Supporting / Primary CTA / Proof / Visual / Scroll hook
```

The content and proof actually available (design-law's "Proof map") choose which slots exist and how
they're weighted. Four geometry archetypes — Full-bleed image · Image-first editorial · Engineering
grid · Split header + product mockup — are same-source M1 hypotheses from one designer's portfolio
with no Mobile evidence: a vocabulary, not a menu or a ranking. Mobile reordering is always a fresh
decision, never a shrink of the Desktop slot order. *(Distilled from a design-lib research
repository's `design-landing-plan` / `design-landing` skills.)*

### D · Escalate the playbook only when earned

Flagship marketing surfaces only: design-law's "Escalation".

### E · Pull parts that serve the concept

- Reuse the project's UI primitives (e.g. `src/components/ui`) and shipped siblings before inventing
  chrome.
- Third-party libraries (e.g. shadcn, Aceternity) are parts, not skin; translate useful structure
  into the project's tokens.
- Color by design-law's "Color application"; claims by its "Proof map".
- Classify children as in "Descent".

### F · Build in the browser

Evolve the baseline or context frame in the canvas. Implement changed parts in full; preserve
unchanged parts from the replica or mark them with an honest placeholder. Pure deletions remain
code-level work. Build in the parent context, never as a flattering isolated tile; product previews
use real product UI/chrome when available — abstraction is a deliberate product decision, not a
placeholder for unread code.

Re-run the squint test at every altitude (page composition, module hierarchy, component signal
weight); the declared primary must survive styling. A spatial failure returns to W; a state-contract
failure returns to B. Expose the runtime & fallback states (design-law) for anything not purely
static.

The lint hook runs on every preview write; P0 is a build error. Close each round with design-law's
close-out protocol.

### G · Review gates to convergence

1. **Mechanical lint.** The final preview is P0-clean (run
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/design-lint.mjs" docs/design/tmp/<spec-slug>/canvas/v<N>.html`
   when needed). Fix or explicitly justify P1s.
2. **Isolated critique** over the served preview URL: read [critique.md](critique.md), screenshot
   each section (`browser_take_screenshot`), record findings against it. Route direction findings to
   B/W, craft findings to F. On the real DOM: computed contrast via
   `browser_evaluate(getComputedStyle)` (ratios, no approximation) and a clean console. Verify with
   screenshots and measured values, never by reading the code alone.
3. **Context matrix** for the route, never a one-size viewport:

   | Route | Verify |
   |---|---|
   | Surface | the captured business states from the page-level map; 1440 desktop; 390 and 360 for every public/marketing surface and for in-app routes reachable there; EN and zh-CN where copy expansion changes composition; light/dark where supported; consequential heights when fixed regions or above-fold promises exist; page hierarchy after lower altitudes are styled — the whole-page squint still matches the Surface expression table |
   | Module | parent widths and adjacent modules that constrain it; page states that change its footprint; mobile reflow when reachable on mobile; EN/zh-CN and light/dark where supported; hierarchy before and after children get visual detail; overflow and vertical pressure at consequential heights |
   | Component | derived from the state matrix and real container: every visual equivalence class plus every distinct action/recovery path; default, focus-visible, disabled, selected as applicable; light/dark; EN/zh-CN where expansion changes fit; real container modes (expanded/collapsed, desktop/drawer); consequential width and **height** (a fixed desktop sidebar at 1440×1000, 1440×900, 1366×768, 1280×720 can be more probative than an isolated 390 card; test mobile only where the component exists, and test the drawer as a drawer); pointer and keyboard target integrity; computed contrast; overflow, clipping, parent-scroll effects |

   The full runtime a11y-semantics / perf / motion audit belongs to [motion.md](motion.md); this
   stage is static visual + layout.

Pass = lint clean, fresh critique evidence resolved or explicitly deferred with the user, and the
route matrix visibly verified.

### H · Human review, Distill-back, handoff

Serve the preview with a short review list: Design Read, entry route and why, concept; R
fidelity/context note; state dimensions, reachable combinations and visual equivalence classes;
expression, composition and congestion decisions; the Variant Board question and choice, if any;
matrix coverage and failures found; critique findings fixed/deferred; test cases derived from the
state matrix; T2 deviations and tradeoffs.

On feedback, return to the earliest wrong altitude; read a cluster of fine notes as one underlying
rule, not independent patches. On sign-off, Distill-back per design-law's "DESIGN.md governance and
candidates".

**Handoff to motion.** The preview HTML **is** the artifact; no export step. The approved preview +
concept + state contract pass to [motion.md](motion.md), which layers motion on this file and ports
to React last, pulling exact values from `browser_evaluate(getComputedStyle)`, never off a
screenshot. Direct React iteration is no substitute for resolving visual choices here.

## What this protocol is not

- Not three competing protocols: Surface, Module, and Component are composable altitudes behind one
  entry.
- Not a reason to redesign every component on a new page.
- Not a reference assembler or a one-shot generator.
- Not where native motion/interaction or the React port happens.
- Not self-refereed: lint, isolated critique evidence, real-DOM checks, and the human gate remain
  mandatory.
