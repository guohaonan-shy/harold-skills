# Surface Protocol — page and route composition

**Load when:** stage A identifies the highest affected altitude as a page/surface: route IA, user
journey, module order, dominant reading path, or responsive composition changes. This protocol owns
the Surface altitude. It deliberately descends into `module-protocol.md`, then
`component-protocol.md`; a page is not complete until its changed lower-altitude decisions are
resolved.

## R · Surface ground truth

For an existing surface:

1. Read the route/page React code, layout shell, real data shape, and shared primitives.
2. Capture the shipped surface at a pinned viewport using the production-capture recipe in
   `browser-usage.md`.
3. Build the affected surface faithfully in `design-preview/<surface>.html`.
4. Run the screenshot-diff loop until no major differences remain. Preserve shipped warts; lint
   findings against legacy styling are redesign backlog, not permission to change the baseline.
5. Record a one-line fidelity note and the exact state/viewport captured.

For a new surface, skip replication. Build a context frame from the real app shell, navigation,
tokens, and sibling routes; do not invent a generic product frame.

## B · Surface concept, state map, and expression table

Write:

1. **User's job** — the task completed on this surface.
2. **User path** — entry, primary sequence, decisions, recovery, and exit.
3. **The one idea** — the dominant interaction or message the composition expresses.
4. **The no-reference move** — the product-specific part that cannot be borrowed from a category.

If external conditions change the page's module composition, create a **page-level state map** before
the content inventory: loading, ready, empty, permission/access state, recoverable error, terminal
error, or other real states traced from code/data. The page map answers which modules exist and what
recovery is available; it does not cross-product every child's local state.

Then apply the expression framework at Surface altitude:

- inventory modules/sections;
- rank first scan / second scan / on demand;
- spend weight through area, order, grouping, above/below fold, and whitespace;
- keep one dominant module per screen and at most five named groups.

For a redesign or substantial new surface, offer concept A inside current T2 case law and concept B
that bends at least one named T2 preference. Name the bend, benefit, and cost. T1 floors and T3 bans
remain fixed.

## C · Surface references

Use references only for a named question about module coverage, page sequencing, recovery flow, or
responsive composition. For each source record Can answer / Cannot answer plus Keep / Change / Do not
copy. A desktop screenshot does not answer mobile navigation; a visual promotion card does not
answer collapsed-container behavior.

## W · Surface wireframe

Build gray boxes with real text hierarchy and no visual skin. Name the spatial thesis first:

- primary reading/task path;
- semantic grouping;
- leading and supporting module;
- density and whitespace rhythm;
- responsive composition intent.

Run the squint test against the Surface expression table. Iterate until module order, area, grouping,
and responsive collapse are signed off. Styling later cannot change these silently.

## Descent to Module and Component

After Surface W is frozen:

1. Inventory modules as **unchanged**, **changed composition**, or **new**.
2. Preserve/stub unchanged modules; do not redesign them for completeness.
3. Read `module-protocol.md` for each changed/new module whose internal hierarchy matters.
4. Let each changed module classify its children and read `component-protocol.md` only for
   decision-bearing or conditional components.

This is one Surface run descending in altitude, not separate design sessions.

## G · Surface review matrix

At G verify:

- the captured business states from the page-level state map;
- 1440 desktop composition;
- 390 and 360 for every public/marketing surface, and for in-app routes reachable at those widths;
- EN and zh-CN where copy expansion can change composition;
- light/dark when the surface supports both;
- consequential viewport heights when fixed regions or above-fold promises exist;
- page hierarchy after lower-altitude components have been styled.

The whole-page squint result must still match the Surface expression table after component detail is
added.
