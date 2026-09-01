# Component Protocol — state-first treatment and Variant Board

**Load when:** a bounded component is the highest affected altitude, or a Surface/Module run descends
into a decision-bearing or conditional child. The parent composition and journey are already stable.
This is the Component Fast Path when entered directly; inside a higher route it is the same reusable
protocol, not a second workflow.

## Entry test and escalation

Enter at Component only when all are true:

- the changed UI is one bounded subtree;
- parent module order and page IA stay stable;
- the main user journey stays stable;
- no new cross-page flow is introduced;
- uncertainty is signal priority, treatment, or state presentation.

Escalate to Module/Surface when the component forces parent scrolling or regrouping, changes the
primary reading path, requires a different mobile IA, or cannot be judged in a fixed context frame.

## R · Component ground truth and context frame

1. Read the real component, direct parent, shared primitives, state/data sources, i18n strings, and
   sibling implementations.
2. Capture it inside its actual container. Include enough surrounding UI to judge visual weight,
   available width/height, and whether it competes with the parent primary.
3. For an existing component, reproduce the target component faithfully; do not reproduce the whole
   page by default.
4. For a new component, build an honest context frame from the real parent and siblings.
5. Record container dimensions, product state, theme/locale, and a one-line fidelity/context note.

## B1 · State inventory before visual design

A component is **conditional** when external product or container conditions change its visibility,
content, available action, fallback, or visual priority. Typical dimensions:

- business eligibility: free/paid, role, permission, entitlement;
- data lifecycle: loading, success, empty, stale/refetching, recoverable error, terminal error;
- container context: expanded/collapsed, desktop/drawer, standard/short height;
- local interaction: default, hover, focus, selected, disabled.

For each external dimension, identify the real source of truth in code/data and which combinations
are reachable. Do not invent product states from UI convention.

Create a reachable-state matrix with at least:

| Conditions | Reachable? | Render? | Content/value | Available action | Fallback/recovery | Visual equivalence class |
|---|---|---|---|---|---|---|

Avoid a blind Cartesian product:

- remove impossible combinations with evidence;
- keep externally different conditions separate for behavior tests;
- collapse cells with identical render/content/action into one **visual equivalence class**;
- model hover/focus/pressed as a separate interaction-state strip unless they alter the business
  contract.

The state matrix is the shared source for design, implementation behavior, and tests. Every
reachable, behaviorally distinct cell becomes a test case; equivalent cells may share one visual
design.

## B2 · Component concept and expression table

For each distinct visual behavior, write:

1. **User's decision/job** — what this component helps the user understand or do.
2. **The one idea** — its dominant message/action.
3. **Signal inventory** — every visible qualifier, label, value, action, and recovery cue.
4. **Priority** — first scan / second scan / on demand.
5. **Weight assignment** — L4/L3/L2/L1 and position ladder from the expression framework.
6. **Congestion check** — ≤1 L4, ≤2 L3, ≤4 simultaneous signals.

A single component concept is normally enough. Create alternatives only where a real unresolved
choice remains.

## C · Component-sized references

Skip by default. Use a reference only for an exact question such as collapsed-container behavior,
error recovery placement, disclosure, or preview/CTA composition. Record:

- Can answer;
- Cannot answer;
- Keep / Change / Do not copy.

A source showing only light-mode color cannot justify collapsed behavior; a desktop sidebar cannot
justify a mobile drawer. References never replace product-state evidence from code.

## W · Deterministic treatment or Variant Board

Choose the cheapest honest artifact:

### Deterministic treatment

Use one design when DESIGN.md, a signed-off sibling, or user-provided specification already settles
the treatment. Do not generate decorative alternatives to satisfy a process.

### Variant Board

Use a board when 2–3 legitimate treatments remain. Place variants side by side in the **same** real
container, with identical content and state, so only the disputed variables change. Label the exact
question each row/column answers, for example:

- signal placement: eyebrow vs inline vs icon;
- CTA treatment: flat primary vs governed gradient;
- preview composition: abstract path vs product-native cards.

Do not combine every independent choice into an exponential grid. Select 2–3 coherent combinations
that expose the meaningful tradeoff. Include the highest-risk visual equivalence class and, when
relevant, a second row showing the most different state (for example terminal error or collapsed).

The user chooses or merges once. Only the selected treatment proceeds to F/React later.

## E/F · Reuse, build, and keep context honest

Classify changed children before designing:

1. **Existing primitive** — reuse exactly.
2. **Deterministic composition** — combine governed primitives once.
3. **Decision-bearing component** — expression table + optional Variant Board.
4. **Conditional component** — state matrix + expression table + optional Variant Board.

Build the component in its parent context, not as a flattering isolated tile. Product previews use
real product UI/chrome when available; abstraction must be a deliberate product decision, not a
placeholder for unread code.

## G · Component review matrix

Derive verification dimensions from the state matrix and real container, not a fixed page checklist:

- every visual equivalence class plus every behaviorally distinct action/recovery path;
- default, focus-visible, disabled, and selected states as applicable;
- light/dark where supported;
- EN/zh-CN where text expansion can change fit;
- real container modes (expanded/collapsed, desktop/drawer);
- consequential width and **height** constraints, especially fixed sidebars, drawers, and sticky
  regions;
- pointer and keyboard target integrity;
- computed contrast from the real DOM;
- overflow, clipping, and parent-scroll effects.

For a fixed desktop sidebar, 1440×1000, 1440×900, 1366×768, and 1280×720 may be more probative than
an isolated 390-wide card. Test mobile only when the component exists there; test the mobile drawer
rather than pretending it is the desktop sidebar.

## H · Component handoff record

The human review list includes:

- context frame and entry-altitude rationale;
- state dimensions, reachable combinations, and visual equivalence classes;
- expression table and congestion decisions;
- Variant Board question and selected combination, if used;
- route-specific review matrix and failures found;
- test cases derived from the state matrix;
- generalizable product decisions proposed for DESIGN.md Distill-back.

The component preview remains the static source for `design-motion`; direct React iteration is not a
substitute for resolving visual choices in the board/context first.
