---
name: design-brief
description: Establish a project's design language and write its DESIGN.md — the three-tier law (T1 identity floors, T2 case law, T3 bans) that every other design skill reads at runtime. Use when a project has no DESIGN.md, when its design decisions live only in people's heads or in scattered components, or when the user asks to define a visual direction, design system, or brand guidelines for a codebase.
user-invocable: true
argument-hint: "[project or product to establish a design language for]"
---

# Design Brief

Every other skill in this plugin **reads** `DESIGN.md`. This one **writes** it.

Without it, each surface decides identity implicitly and the project accumulates a design language nobody agreed to. The point of this skill is to make that agreement once, explicitly, and in a form later sessions cannot silently drift from.

## 0. Two modes — determine which before starting

| Situation | Mode | What truth comes from |
|---|---|---|
| Project has real UI already | **Infer** | The existing code and screens. The language largely exists; your job is to surface and name it. |
| Greenfield, or UI is placeholder | **Establish** | The product, its users, and the user's decisions. Nothing is inferred from a codebase that has no opinions yet. |

State which mode you are in. Inferring a language from three placeholder pages and presenting it as law is the main way this skill fails.

## 1. Gather product truth first

Design language is downstream of what the product is. Read, if present: `PRODUCT.md`, README, landing copy, existing routes and components, `.impeccable/design.json`, any prior brand assets.

Establish before proposing anything:

- what the product is and what it replaces;
- who uses it and under what pressure (a tool used all day and a page visited once have opposite requirements);
- the register: how serious, how technical, how expressive;
- what is genuinely off-limits (competitor adjacency, legal, accessibility floors, existing brand assets you do not control).

Missing inputs are recorded, not guessed.

## 2. Infer mode — read the existing system

When code exists, measure rather than eyeball:

- computed values, not intent: actual type scale, spacing rhythm, radii, border weights, shadows, color roles as used;
- what is **consistent** (candidate T1 floors), what is **inconsistent** (open decisions), and what is **accidental** (a default nobody chose);
- interaction and motion precedents already in the codebase;
- measured contrast, not assumed contrast.

Report the three buckets separately. An inconsistency presented as a floor freezes an accident into law.

## 3. Propose the language

Offer **two directions**, not five, and not one. Each must state what it is optimizing for and what it gives up. Directions differ in **register and structural commitment**, not in accent color — swapping a hue is not a second direction.

Ground both in the product's own world. Reach for the materials, instruments, and vernacular of what the product actually does before reaching for what other products in the category look like.

For each direction, specify concretely enough to be judged:

- typographic pairing and scale, with the roles each face carries;
- color as **roles** (ground, ink, accent, semantic states), each with a stated purpose — never a palette without jobs;
- spacing and density commitment;
- shape language (radii, borders, elevation) and what it signals;
- motion posture: how much, where, and what it is for.

Present them for a decision. **Stop and let the user choose.** This is the one gate in this skill.

## 4. Write DESIGN.md

Structure the file in three tiers, because that is what the other skills enforce:

```text
T1 · Identity floors  — never relaxed silently; the things that make it this product
T2 · Case law         — dated precedents from real surfaces; appended over time
T3 · Bans             — what this project does not do, and why
```

Rules that keep the file usable:

- **T1 is short.** Five to eight floors. A T1 with thirty entries has no floors, only preferences.
- **Every T3 ban carries its reason.** A ban without a reason gets relitigated every session.
- **T2 starts nearly empty** and grows from real work. Do not seed it with speculative precedents — case law comes from cases.
- **Write floors as checkable statements.** "Accessible" is not a floor; "text contrast ≥ 4.5:1, measured, no exceptions for decorative headings" is.
- Record the accessibility floor explicitly. It is the one T1 entry that should never be a matter of taste.

Confirm the draft with the user before writing the file. If they decline the file, hand back the content as text.

## 5. Hand off

Name what was decided, what was deliberately left open, and what inputs were missing. Then point to the next step: `design` for the first surface, which will read this file as law and append T2 entries back after real work.

Do not design a surface inside this skill. Establishing the language and applying it are different jobs, and doing both at once produces a language shaped to fit one page.
