# Module Protocol — bounded composition inside a surface

**Load when:** stage A identifies a bounded section/module as the highest affected altitude, or a
Surface run descends into a changed/new module. The surrounding page IA and module order remain
stable; this protocol decides the module's internal composition, then descends to selected
components.

## Entry test and escalation

Enter at Module when the section's internal grouping, hierarchy, density, or local responsive
composition changes while the page's module order, dominant reading path, and journey remain stable.
Escalate to Surface when the work reorders sibling modules, changes which module leads the page,
introduces a page-level state/flow, or requires a different route/mobile information architecture.
If no spatial composition changes inside the module, enter at Component instead.

## R · Module ground truth

For an existing module:

1. Read its real React code, data/state sources, and direct parent layout.
2. Capture the module inside enough parent context to judge width, rhythm, adjacency, and scroll.
3. Reproduce the module faithfully. Do not replicate the entire page unless the boundary cannot be
   evaluated otherwise.
4. Record the container dimensions, page state, and a one-line fidelity note.

For a new module, construct its context from the real parent surface and siblings. A floating
showcase card without the parent's constraints is not an honest baseline.

## B · Module concept, state map, and expression table

Write:

1. the module's single job in the parent surface;
2. what enters/exits the module and how it supports the page's primary task;
3. the module's one idea;
4. the relationship that must remain quiet so the module does not compete with the page primary.

If conditions change which elements/components exist, create a module-level state map first. Keep
page-level lifecycle states outside this map unless they alter the module's own contract.

Apply the expression framework at Module altitude:

- inventory elements/child components;
- rank first scan / second scan / on demand;
- spend weight through size, type scale, alignment, density, and local whitespace;
- keep at most three visible hierarchy levels.

A substantial module redesign may offer concept A/B; a treatment-only change with fixed composition
belongs at Component altitude instead.

## C · Module references

References are optional and must answer a named question about internal grouping, disclosure, state
coverage, or local flow. Record Can answer / Cannot answer plus Keep / Change / Do not copy.

## W · Module wireframe

Build a gray-box local wireframe inside a lightweight real parent context. Use real text hierarchy;
no brand color, shadows, or decorative styling. Freeze:

- element order and grouping;
- leading/supporting relationships;
- density;
- local responsive reflow;
- boundaries between the module and its parent/siblings.

If no spatial decision exists, the task was misrouted: enter at Component instead of inventing a
wireframe.

## Descent to Component

After Module W is frozen, classify each changed child:

1. **Existing primitive** — reuse without redesign.
2. **Deterministic composition** — one treatment already governed by DESIGN.md/siblings; build once.
3. **Decision-bearing component** — multiple legitimate treatments or a major user decision; read
   `component-protocol.md`.
4. **Conditional component** — external product/container state changes visibility, content, action,
   or priority; read `component-protocol.md` and require a state matrix.

Do not run the full protocol on every button, badge, or card merely because the page is new.

## G · Module review matrix

At G verify:

- parent widths and adjacent modules that constrain it;
- page states that change its footprint;
- mobile reflow when the module is reachable on mobile;
- EN/zh-CN expansion and light/dark where supported;
- module hierarchy before and after child components receive visual detail;
- overflow and vertical pressure at consequential viewport heights.
