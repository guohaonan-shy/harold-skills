---
name: design-ui
description: >-
  Stage 1 of the design pipeline — design or redesign any STATIC UI in a
  real browser before it ships: a brand-new page, an existing surface, one module,
  or a bounded component. Route by the HIGHEST affected altitude, not by the noun
  in the request: Surface work descends through Module and then the decision-bearing
  or conditional Components; Module work descends through Components; a bounded
  Component treatment uses the component fast path directly. Conditional UI starts
  with a reachable-state matrix before visual design. Surface/Module composition is
  frozen as gray-box wireframes; unresolved component treatments use a compact
  Variant Board instead. Existing redesigns begin from captured product truth at
  the relevant scope, references are optional and question-gated, and every route
  ends with browser review, human sign-off, and Distill-back into DESIGN.md T2 case
  law. Motion/native interaction and the React port remain Stage 2 (`design-motion`).
  Use this whenever the user asks to design, prototype, redesign, or explore the
  look/structure of UI — including pages, modules, cards, banners, navigation,
  dialogs, empty states, conditional states, or responsive treatments. SUPERSEDES
  the retired design-loop / Pencil skills.
user-invocable: true
argument-hint: "[UI to design — page, module, or component]"
---

Design the **static UI** of a product surface in a **real browser** as a preview HTML file. Static
includes visual system, layout, hierarchy, copy, component structure, and the *shape* of
interactions (which states exist and where controls sit). Real animation, native interaction, and
the React port belong to `design-motion` after this stage is approved.

The workflow has one public entry but three composable design altitudes:

```text
Surface route  → Surface protocol → Module protocol → Component protocol where needed
Module route   → Module protocol → Component protocol where needed
Component route→ Component protocol only
```

The route chooses the **highest altitude changed by the work**. Lower-altitude design is still part
of a higher route: a new page does not skip component design; it descends into the components that
carry a decision, introduce a new pattern, or vary by product state. Choose one entry route so the
same work is not performed twice.

> **Canvas: browser, not Paper (temporarily).** Read `references/browser-usage.md` before any
> browser tool call. Paper remains dormant (`references/paper-usage.md`).

## Principles

### 1. Concept before references

Start from product truth: the user's actual job, the data/domain model, the reachable states, and
the language of shipped sibling components. References may answer a named structural, coverage, or
state question after the concept exists; they never supply the product's visual skin.

Replication is the exception: it reproduces the current UI only to establish ground truth at the
scope being changed. The redesign begins after that baseline exists.

### 2. The core is always on; detailed protocols load only when needed

Read the shared core once, then progressively disclose route-specific instructions. This keeps
component work from carrying a page-sized playbook while ensuring page work still reaches component
altitude.

- `references/design-core.md` supplies the Design Read, register dials, identity floors, anti-slop
  law, and close-out protocol.
- `references/expression-framework.md` supplies the altitude-neutral content → priority → weight
  procedure and the conditional-state precondition.
- The **target project's design docs** are the product and visual source of truth: `DESIGN.md` at
  the project root, plus `.impeccable/design.json` and `PRODUCT.md` (project root) when present.
  If the project has no `DESIGN.md`, fall back to this plugin's built-in defaults (design-core
  floors + anti-slop law), note that no project design law was found, and suggest the user create
  a `DESIGN.md` — never abort over a missing doc.
- The route protocols supply only the instructions needed at the affected altitudes.

### 3. The gates do not trust the generator

Every route closes through deterministic lint, isolated critique with persisted evidence, real-DOM
checks, a context-appropriate visual matrix, and human sign-off. A direction/slop finding returns to
concept or composition; a craft finding is fixed in the preview. Signed-off generalizable decisions
are written into `DESIGN.md` T2 case law before handoff.

## Setup

Before stage A:

1. Read `references/design-core.md` first.
2. Read `references/expression-framework.md`.
3. Read the target project root's `DESIGN.md`, `.impeccable/design.json`, and `PRODUCT.md` —
   each **if present**. Missing files are not errors: continue with the plugin's generic defaults
   and recommend creating `DESIGN.md` (see Setup note above).
4. Read the real code, data/domain model, and sibling shipped components at the target scope.
5. Before any browser call, read `references/browser-usage.md`.

Do not load every altitude protocol up front. Stage A selects the entry route; read lower-altitude
protocols when the work descends to them.

## The loop (A route · R ground truth · B concept & expression · C ground? · W freeze · D escalate? · E parts · F build · G gates · H human)

### A · Clarify the brief, declare the Design Read, and choose the entry route

State the Design Read from core §2 in one line. Ask at most one clarifying question only when the
brief is genuinely ambiguous; otherwise infer from the request and real code.

Choose the **highest affected altitude**, not the filename or noun in the prompt:

| Entry route | Use when… | Read now |
|---|---|---|
| **Surface** | Route/page IA, user journey, module order, dominant reading path, or responsive composition changes | `references/surface-protocol.md` |
| **Module** | One bounded section's internal composition changes while page IA and surrounding module order remain stable | `references/module-protocol.md` |
| **Component** | One bounded UI subtree changes; parent composition and user journey remain stable; uncertainty is treatment, signals, or conditional states | `references/component-protocol.md` |

A component that forces parent scrolling, module reordering, a different mobile information
architecture, or a new journey has crossed altitude: route from Module or Surface instead. A module
whose change is only a bounded component treatment should enter at Component.

Close A by recording: chosen entry route, why it is the highest changed altitude, and which lower
altitudes are expected later. Run exactly one entry route; descending is composition, not a second
run.

### R · Establish ground truth at the selected scope

Follow the selected protocol's R section:

- Surface redesign: faithful affected-surface baseline and production screenshot diff.
- Module redesign: faithful module baseline inside its real parent context; do not reproduce the
  whole page unless the module boundary cannot be judged otherwise.
- Component redesign: capture the component in its real container and read its actual state/data
  sources; do not build a page replica merely because the component already ships.
- Brand-new work: there is nothing to replicate; build an honest context frame from real siblings
  and tokens instead.

The judge here is fidelity, not improvement. Record a one-line fidelity/context note.

### B · Form the concept and expression contract

Run the selected protocol's B section plus the expression framework.

For any UI whose visibility, content, action, or visual priority changes with external product
conditions, complete the **reachable-state matrix before visual design**. State framing precedes the
content inventory: a component cannot have one honest hierarchy until its distinct behaviors are
known. Collapse behaviorally identical cells into visual equivalence classes, but keep their source
conditions available for tests.

Then write the expression table at the current altitude. Higher routes later repeat the same
procedure at lower altitudes only for changed or decision-bearing children.

Surface/new-module redesigns normally offer concept A (in-system) and concept B (bending a named T2
preference). A bounded component treatment may use one concept; use variants only for unresolved
visual choices, not to manufacture options.

**Gate:** concept, state contract where applicable, and expression table are signed off before
references or design pixels.

### C · Ground with references only for a named question

Skip by default. A reference is admissible only when the concept leaves a specific structural,
coverage, flow, or state question unanswered. Component references are not forbidden, but must answer
a component-sized question such as collapsed behavior or error recovery.

For every used reference record:

- **Can answer** — the exact question this source is evidence for.
- **Cannot answer** — nearby decisions it does not support.
- **Keep / Change / Do not copy** — controllable structural qualities, product-specific changes,
  and protected/irrelevant skin.

A reference that cannot represent the target state never enters the conclusion layer. User-provided
sources come first; Refero is a fallback candidate search, not ground truth (`platform: "web"`).

### W · Freeze the appropriate low-cost artifact

Use the artifact defined by the current altitude:

- **Surface:** gray-box page wireframe with real text hierarchy.
- **Module:** gray-box local composition inside a lightweight parent context.
- **Component:** a deterministic treatment if the answer is already governed, otherwise a compact
  2–3 option Variant Board in the same real context and state.

A higher route descends only after its current composition is frozen. Surface work therefore freezes
page composition, then reads `module-protocol.md` for changed modules; changed modules freeze local
composition, then read `component-protocol.md` for decision-bearing or conditional children.
Existing primitives and unchanged siblings are reused, not redesigned.

**Gate:** the relevant wireframe or chosen component treatment is signed off. Styling cannot quietly
change the frozen composition; bounce back to W when spatial structure changes.

### D · Escalate the playbook only when earned

For a flagship marketing surface, deep-read the vendored taste-skill sections named in core §7.
In-app surfaces, modules, and components use core + DESIGN.md + shipped siblings; they do not pay the
flagship token cost.

### E · Pull parts that serve the concept

- Reuse the target project's UI primitives (e.g. `src/components/ui`) and shipped sibling
  components before inventing new chrome.
- Inspect Aceternity/shadcn as parts, not skin; translate any useful structure into our tokens.
- Read `references/color-application.md` before assigning component color.
- At component descent, classify children per `component-protocol.md`: existing primitive,
  deterministic composition, decision-bearing component, or conditional component. Only the last
  two earn the full protocol.

### F · Build in the browser

Evolve the baseline or context frame in `design-preview/<surface>.html`. Implement changed parts in
full; preserve unchanged parts from the replica or mark them with an honest placeholder. Pure
deletions remain code-level work.

Re-run the squint test at every altitude: page composition, module hierarchy, then component signal
weight. The declared primary must survive styling. A spatial failure returns to W; a state-contract
failure returns to B.

The lint hook runs on every preview write. Treat P0 as a build error. Close each build round with the
core's 5-dimensional critique and restraint check.

### G · Review gates to convergence

1. **Mechanical lint.** Confirm the final preview is P0-clean; run
   `node "$CLAUDE_PLUGIN_ROOT/scripts/design-lint.mjs" design-preview/<surface>.html` (this
   plugin's script, wherever the plugin is installed) when needed. Fix or explicitly justify P1s.
2. **Isolated critique.** Run impeccable `critique <served preview URL>` and require a fresh
   `.impeccable/critique/` snapshot. Route direction findings back to B/W and craft findings to F.
   Check computed contrast and a clean console from the real DOM.
3. **Context matrix.** Use the selected protocol's review matrix instead of a one-size viewport:
   public surfaces always include 1440 plus 390/360; product modules/components include every
   reachable container mode, consequential width/height, theme, locale, and product state. A fixed
   sidebar component may need 1000/900/768/720 heights more than an irrelevant standalone 390 view.

Pass means lint clean, fresh critique evidence resolved or explicitly deferred with the user, and the
route-specific matrix visibly verified.

### H · Human review, Distill-back, and handoff

Serve the preview and provide a short review list:

- Design Read, entry route, and concept;
- R fidelity/context note;
- state matrix summary and visual equivalence classes where applicable;
- expression and composition decisions;
- Variant Board choice, if one was needed;
- context-matrix coverage;
- critique findings fixed/deferred;
- T2 deviations and tradeoffs.

On feedback, return to the earliest wrong altitude. Read a cluster of fine notes as one underlying
rule, not independent patches.

On sign-off, perform **Distill-back before handoff**: identify decisions that generalize, draft dated
T2 case-law amendments, confirm them with the user, and apply them in the same session. Workflow
method changes belong in this plugin; product interaction/treatment decisions belong in DESIGN.md.
If the project has no `DESIGN.md` yet, offer to bootstrap a minimal one (title + a "T2 case law"
section holding this session's confirmed decisions) — with user confirmation only; if declined,
hand the drafted amendments to the user as text instead of writing any file. Distill-back only
appends dated T2 entries; it never rewrites human-authored T1/T3 content.
An empty Distill-back is valid only when stated explicitly.

The approved preview HTML + concept + state contract pass to `design-motion`. Do not port to React in
this skill.

## DESIGN.md governance

(Applies when the target project has a `DESIGN.md`; the named floors below are examples from a
real project's design law — substitute the target project's own T1/T3 entries.)

- **T1 identity floors and T3 bans:** never relax silently. Example set from a real project:
  a11y, Electric Blue identity, Retired-Ink, Soft-Elevation, Tamed-Aceternity, selection by brand
  ring, Inter-tight marketing display.
- **T2 case law:** challenge through concept B or surface a mid-build deviation explicitly. A
  winning deviation is written back at H; a silent deviation is a workflow failure.
- Typical T2 territory includes density, component treatments, responsive container behavior,
  promotion hierarchy, disclosure, and motion precedents.

## What this skill is not

- Not three competing skills: Surface, Module, and Component are composable altitudes behind one
  entry.
- Not a reason to redesign every component on a new page: existing primitives are reused; only
  decision-bearing or conditional components earn the full Component Protocol.
- Not a reference assembler or a one-shot generator.
- Not where native motion/interaction or the React port happens; use `design-motion` after sign-off.
- Not self-refereed: lint, isolated critique evidence, real-DOM checks, and the human gate remain
  mandatory.
