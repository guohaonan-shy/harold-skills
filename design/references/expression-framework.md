# Expression Framework — content → expression, at every altitude

**What this is.** The decision procedure that turns "what the user needs to see" into layout and
visual treatment. It is the wireframe-stage logic of the classic pipeline (requirements →
information architecture → wireframe → visual design → prototype), plus the visual-weight
ladder used at the hi-fi stage. `design-ui` reads this at Setup; its stage-B **state contract +
expression table** and stage-W **wireframe / Variant Board** are this file's outputs. It exists
because "which color should this badge be" is almost never the real question — "what behavior is
reachable, and how important is this signal to the user's decision" comes first; both have answers
that can be established before taste.

**Provenance.** Distilled 2026-07-24 from: open-design `craft/typography-hierarchy.md` (the
dominance model, hierarchy vectors, flat/noise failure modes) + `craft/laws-of-ux.md`
(selective attention, decision weight, congestion caps — research-grounded), impeccable v4.0.1
(`critique.md` visual-noise floor + ≤4 working-memory chunking, `layout.md` spatial thesis +
squint test, `scripts/palette.mjs` text-on-fill rules), and a real project's practice-dashboard-card
badge decision (2026-07, now that project's DESIGN.md §7 case law). Externals are raw feeds; this file is the
source of truth — update by explicit re-distill, never by runtime reads of external paths. The
remaining laws from `craft/laws-of-ux.md` not operationalized here (Gestalt grouping, decision
framing beyond Hick's Law, memory/recall, motor timing, behavioral expectation) were distilled
separately into `references/laws-of-ux.md`, which cross-references back to this file rather than
restating the four laws already turned into ladders/budgets here.

## 0. Conditional-state precondition

Before the five expression steps, ask whether external product or container conditions change the
UI's **visibility, content, available action, fallback, or visual priority**. If so, establish the
state contract before designing one "default" that silently ignores the rest:

1. Name each state dimension and trace its real source of truth in code/data.
2. Mark reachable and impossible combinations; do not blindly build the Cartesian product.
3. Record render/content/action/recovery behavior for every reachable combination.
4. Collapse behaviorally identical cells into **visual equivalence classes** while keeping their
   source conditions separate for tests.
5. Keep local hover/focus/pressed states in a separate interaction strip unless they change the
   business contract.

Use page-level state maps to decide which modules exist, module-level maps to decide which child
groups exist, and component matrices for bounded behavior. Do not cross-product all three levels.
Every reachable, behaviorally distinct cell becomes an implementation test; equivalent cells may
share one visual treatment.

This is a precondition, not a sixth expression step: the five-step procedure runs once the honest
content for each distinct behavior is known.

## 1. The procedure (five steps, altitude-neutral)

1. **Content inventory** — list every element this surface must show. From the data model and
   the user's job, not from imagination or "what such pages usually have."
2. **Priority ranking** — rank by the user's job on this surface: seen in the first scan /
   second scan / on demand. Hard constraint at every altitude: **≤1 primary, 2–3 secondary,
   everything else quiet.** If two things feel primary, the ranking isn't done — demote one.
3. **Weight assignment** — map each rank to a treatment using the altitude's levers (§2, §3).
   Visual weight must match decision weight; nothing gets emphasis "because it looks nice."
4. **Congestion budget** — check the altitude's cap (§5). Over budget → demote a signal or
   move it down the position ladder (§4); never solve congestion by making everything louder.
5. **Verify — the squint test.** Blur the details (squint, or blur the screenshot): a stranger
   must still name the primary and the secondaries, in order. Name the failure explicitly if it
   fails: **flat** (everything equal = a wall) or **noise** (too many competing = demote even
   the things that "feel important").

## 2. The three altitudes — same procedure, different levers

| Altitude | Inventory lists… | "Weight" is spent as… | Budget |
|---|---|---|---|
| **Page / surface** (IA → wireframe) | modules / sections | **area, position (above/below fold), order, grouping, whitespace** | 1 dominant module per screen; ≤5 named groups |
| **Module** (wireframe) | elements within a module | size, type scale, alignment, density | ≤3 visible hierarchy levels |
| **Component** (hi-fi) | signals on one component | **the weight ladder (§3), font weight, the position ladder (§4)** | ≤1 L4 · ≤2 L3 · ≤4 signals total |

The law across altitudes: **at wireframe altitude, weight is spent in space; at hi-fi altitude,
it is spent in ink. The ranking logic never changes — only the currency does.** A dominant
element earns its place through at least two levers pointing the same way (bigger AND first;
filled AND heavier) — a single lever reads as accident, not intent.

## 3. The weight ladder (component altitude — L3 examples cite a real project's tokens)

- **L4 — loud:** saturated deep fill + white text. Reserved for the single most
  decision-relevant signal on the component. Text-on-fill rule *(impeccable palette)*: a
  saturated mid-luminance fill takes **white** text; dark text belongs only on pale (L > 0.85)
  or pure-neutral fills. A badge accent is saturated OR clearly light OR clearly dark — never a
  muddy mid-tone (it can't hold text either way and reads weak).
- **L3 — present:** brand/semantic tint background + dark text (`primary-subtle`, the feedback
  tints). Attribute-grade information.
- **L2 — quiet:** hairline-outlined pill, or emphasis carried by font weight alone.
- **L1 — silent:** plain text / `muted-foreground` metadata.
- **Non-color redundancy** *(a11y + von Restorff)*: every emphasized signal also carries a
  non-color cue — position, an icon, a text label. Color-only emphasis fails color-blind users
  and weakens the signal for everyone.
- Semantic color (state) and data-category color (e.g. practice category) are **separate
  systems** — one element speaks one system (DESIGN.md One Voice: categories ride a dot/label).

## 4. The position ladder (progressive disclosure — all altitudes)

**in content flow → corner-anchored → behind hover/expand → next page/level.**

Demoting a signal down this ladder is the standard answer to congestion — not shrinking
everything, not another color. Instances: a NEW badge moves from the inline badge row to a
corner anchor (component altitude); a secondary module moves below the fold or to a detail page
(page altitude).

## 5. Congestion budgets (why they exist)

- Reserve the strongest visual contrast for the **single goal-relevant action or signal** per
  surface (selective attention). Repeated attention-grabbers train **banner blindness**; the
  named anti-pattern is "importance solved by red dots and badges everywhere."
- Working memory holds ~4 items: ≤4 simultaneous signals per component, ≤4 items per group,
  ≤5 top-level groups. 5–7 is pushing it; 8+ is overloaded.
- Decision screens: 3–5 visible primary options, exactly one marked recommended — never a flat
  wall of equivalents.
- The budget is a *feature*: hitting it forces the priority conversation ("is NEW really more
  important than difficulty?") that step 2 should have settled. Argue rank, not hue.

## 6. Worked example — the badge case (component altitude, 2026-07)

Practice dashboard card. **Inventory:** title, category, real-exam qualifier, difficulty, NEW
recency, count/duration meta. **Ranking** for the student's job (pick what to practice): real
exam = primary qualifier (changes the decision); difficulty = secondary; NEW = tertiary; meta =
silent. **Assignment:** real exam → L4 (deep fill + white text, the card's one loud signal);
difficulty → L3 tint; meta → L1. **Budget:** three inline badges + NEW = congestion → NEW moves
down the position ladder to the corner anchor. **Verify:** squint — the L4 badge and the title
survive; nothing else competes. The hours once spent iterating hue and placement collapse into
one argument about step 2 — and rank has a right answer where taste doesn't.

## 7. Maintenance

New generalizable treatment decisions distill back into DESIGN.md §7 case law (design-ui's
Distill-back step): this file defines the ladders and the procedure; DESIGN.md records the
decided instances.
