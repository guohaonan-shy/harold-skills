# DESIGN.md 的格式与三层法

**按需加载。** 这是 `DESIGN.md` 这份文件本身的规格：固定八节、三层法怎么落进这八节、以及让它保持可用的那几条规则（T1 五到八条是其中最重要的一条）。

**谁写这份文件**：`uiux-imagine` 打开「语言」这个高度时（项目还没有 `DESIGN.md`，或人显式说要重探语言），选完方向那一步就照这份规格写。其余环节只读不写，`uiux-refine` 的 Distill-back 只往 `## Case Law` 追加。

§1 是规格本身。§2 是建立设计语言时的取证与提案纪律，`uiux-imagine` 走到那一步时取用。

---

## 1 文件形状（固定八节）

The file's shape is not invented per project — it is a fixed structure so that every downstream step (and any outside `design.md`-aware tooling) can parse it the same way:

```text
---
name: <required — the project/product name>
version: <optional>
description: <optional>
colors: / typography: / rounded: / spacing: / components:  <optional token fields, only the ones the project actually has>
---

## Overview
## Colors
## Typography
## Layout
## Elevation & Depth
## Shapes
## Components
## Do's and Don'ts
```

`name` is the only required frontmatter field. The eight `##` headings are fixed, in this exact order — do not rename, reorder, merge, or drop one, even if a section ends up thin.

Custom or unrecognized headings are allowed and are **not** an error — that is how the appended case-law section below gets attached. What *is* an error is a **duplicate** heading: never write one of the eight fixed headings twice, and never open a second `## Case Law` when one already exists in the file — append into the existing one instead.

The three-tier law from before is not gone — it now lives inside this structure instead of beside it:

- **T1 identity floors** are not a separate list; they live as token + prose *inside* `Overview` and inside whichever of `Colors` / `Typography` / `Layout` / `Elevation & Depth` / `Shapes` / `Components` the floor concerns. A floor stated in prose without a checkable token is a preference, not a floor.
- **T3 bans** live in the native `Do's and Don'ts` section, in the `Don't` half. Every ban still carries its reason — a ban without one gets relitigated every session.
- **T2 case law** lives in an appended, non-native `## Case Law` heading, entries dated and appended in chronological order only. New precedents get appended to this section; T1 floors and T3 bans already written elsewhere in the file are never rewritten to accommodate a new case.

Rules that keep the file usable:

- **T1 is short.** Five to eight floors total, spread across the fixed sections. Thirty scattered floors are not floors, only preferences.
- **Write floors as checkable statements.** "Accessible" is not a floor; "text contrast ≥ 4.5:1, measured, no exceptions for decorative headings" is.
- Record the accessibility floor explicitly, inside whichever section it constrains (usually `Colors` or `Typography`). It is the one floor that should never be a matter of taste.
- **`## Case Law` starts nearly empty** and grows from real work. Do not seed it with speculative precedents — case law comes from cases.

Confirm the draft with the user before writing the file. If they decline the file, hand back the content as text.

---

## 2 建立设计语言的过程（`uiux-imagine` 的「写 DESIGN.md」那一步取用）

每个碰 UI 的环节都**读** `DESIGN.md`。 The `uiux-imagine` step that opens the language altitude **writes** it.

Without it, each surface decides identity implicitly and the project accumulates a design language nobody agreed to. The point of this step is to make that agreement once, explicitly, and in a form later sessions cannot silently drift from.

### 0. Two modes — determine which before starting

| Situation | Mode | What truth comes from |
|---|---|---|
| Project has real UI already | **Infer** | The existing code and screens. The language largely exists; your job is to surface and name it. |
| Greenfield, or UI is placeholder | **Establish** | The product, its users, and the user's decisions. Nothing is inferred from a codebase that has no opinions yet. |

State which mode you are in. Inferring a language from three placeholder pages and presenting it as law is the main way this step fails.

### 1. Gather product truth first

Design language is downstream of what the product is. Read, if present: `PRODUCT.md`, README, landing copy, existing routes and components, any prior brand assets.

Establish before proposing anything:

- what the product is and what it replaces;
- who uses it and under what pressure (a tool used all day and a page visited once have opposite requirements);
- the register: how serious, how technical, how expressive;
- what is genuinely off-limits (competitor adjacency, legal, accessibility floors, existing brand assets you do not control).

Missing inputs are recorded, not guessed.

### 2. Infer mode — read the existing system

When code exists, measure rather than eyeball:

- computed values, not intent: actual type scale, spacing rhythm, radii, border weights, shadows, color roles as used;
- what is **consistent** (candidate T1 floors), what is **inconsistent** (open decisions), and what is **accidental** (a default nobody chose);
- interaction and motion precedents already in the codebase;
- measured contrast, not assumed contrast.

Report the three buckets separately. An inconsistency presented as a floor freezes an accident into law.

### 3. Propose the language

Offer **two directions**, not five, and not one. Each must state what it is optimizing for and what it gives up. Directions differ in **register and structural commitment**, not in accent color — swapping a hue is not a second direction.

Ground both in the product's own world. Reach for the materials, instruments, and vernacular of what the product actually does before reaching for what other products in the category look like.

For each direction, specify concretely enough to be judged:

- typographic pairing and scale, with the roles each face carries;
- color as **roles** (ground, ink, accent, semantic states), each with a stated purpose — never a palette without jobs;
- spacing and density commitment;
- shape language (radii, borders, elevation) and what it signals;
- motion posture: how much, where, and what it is for.

Present them for a decision. **Stop and let the user choose.** This is the one gate in this step.

### 收工

Name what was decided, what was deliberately left open, and what inputs were missing. Then point to the next step: the first surface — `uiux-refine` reads this file as law and appends T2 entries back after real work.

Do not design a surface while establishing the language. Establishing the language and applying it are different jobs, and doing both at once produces a language shaped to fit one page.
