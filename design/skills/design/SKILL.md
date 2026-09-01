---
name: design
description: End-to-end design entry. Takes a requirement, loads the target project's design language and product truth, clarifies only what changes the outcome, produces 2-3 structurally distinct gray-box wireframe candidates for human selection, then routes the selected structure into static UI and, when warranted, motion. Use whenever someone asks to design, redesign, or lay out a page, section, or surface and no structure has been agreed yet.
user-invocable: true
argument-hint: "[what to design]"
---

# Design

The single entry for design work. It owns one thing the individual skills do not: **turning a requirement into a small set of genuinely different structures and stopping for a human to choose.**

Everything downstream already has its own protocol. This skill routes into them; it does not restate them.

## 0. Intake and routing

Classify the request by the **highest affected altitude**, not by the noun used:

| Ask | Route |
|---|---|
| Whole marketing site / multiple pages / IA, or one landing page / landing section | §1–4, then `design:design-ui`'s Landing/IA entry route |
| Product surface (app page, module) | §1–4, then `design:design-ui` |
| Bounded component treatment | Skip to `design:design-ui` component fast path — candidates are overkill |
| Motion or interaction on an approved static design | Skip to `design:design-motion` |
| Verifying an existing port | Skip to `design:design-port` |

If a structure has **already been agreed** — an approved plan, an existing page being tweaked, or the common case in the `grill` → spec → ticket pipeline, where `grill`'s decision tree already settled the structure before handing off here — skip §3–4 entirely and go straight to the downstream skill. In that pipeline, skipping candidate generation is the default path, not the exception. The mechanism itself is unchanged: it stays available for when the structure is genuinely open, e.g. a brand-new page that never went through `grill`. Do not manufacture a decision the user already made.

## 1. Load target-project truth

Read at the target project root, each **if present**:

- `DESIGN.md` — design language, T1 identity floors, T2 case law, T3 bans;
- `PRODUCT.md` — product, user, jobs, commercial and proof truth;
- existing routes, components, sibling surfaces, analytics.

**Missing `DESIGN.md` is not an error, but it is a fork.** If the project has no design language and the work is more than a one-off tweak, offer `design:design-brief` first — establishing the language once is cheaper than deciding it implicitly inside every surface. If the user declines, proceed on this plugin's vendored taste layer and say explicitly that no project design law was found.

Knowledge records are optional: resolve `$DESIGN_LIB_ROOT` (explicit config, or the repository root when running inside a design-lib checkout — **the plugin does not ship the library**). Unreachable is a normal mode: state that no approved rule is available and work from first principles with labeled assumptions. Never attribute an invented rule to design-lib.

## 2. Clarify

**Skip this section when `design` is invoked as `grill`'s design-subtree handoff.** By that point `grill`'s frontier has already surfaced everything this round would ask; asking again would split one interview across two Q&A formats mid-stream. This section applies in full only when a human invokes `design` directly, without going through `grill`.

Ask only what changes the output. Use `AskUserQuestion`, at most one round, and prefer questions whose answers you cannot obtain by reading the project.

Worth asking:

- who this page is for, when their alternatives differ materially;
- which conversion actually matters;
- what real proof exists and what is off-limits to show;
- hard constraints (existing components, launch date, legal review).

Not worth asking: anything visible in the codebase, anything with an obvious default, and anything about visual style — that is not decided at this stage.

Record what remains unknown. Unknown inputs travel into the candidates as `(unknown)` slots; they are never filled with plausible-looking content.

## 3. Generate candidates

Run the `wireframe-candidates` workflow with the assembled brief. It fans out independent agents, one per structural thesis, then audits whether the results are actually different.

Three properties are non-negotiable, and the workflow enforces them:

- **Gray box only.** No color, type, or imagery. The user is choosing a structure; showing a look makes them judge taste instead.
- **The differences are in content responsibility**, not composition. "Left image / right image" is one candidate, not two. Who carries the claim, who carries the proof, what a reader meets first — those are candidates.
- **No invented content.** Every slot is marked `(real)`, `(empty)`, or `(unknown)`.

If the audit reports collapsed pairs, **say so** and present the real number of options. Three options that are secretly one is worse than two honest ones.

## 4. Human selection gate — stop here

Present each candidate with:

```text
它赌的是什么 → 谁承担主张 / 证明 / 身份 → 块序列 → 放弃了什么 → 什么会证伪它 → 依赖哪些还不存在的输入
```

Then stop. The user selects one, mixes two, or rejects all and redirects. **Do not begin implementation on a candidate you chose yourself.** If the user asks you to pick, state a recommendation and its reason, then still confirm before building.

This is the only gate this skill adds. Downstream skills keep their own sign-offs; do not add more.

## 5. Route the selection downstream

Hand the chosen structure to the matching skill from §0, carrying forward:

- the block sequence and each block's single job;
- the responsibility map;
- every `(unknown)` and `(empty)` slot, still marked;
- constraints, labeled assumptions, and any candidate-mode knowledge with its M/P labels.

Motion is not automatic. Invoke `design:design-motion` only when a block's job actually requires it — state, result, identity, or atmosphere. "It would look more alive" is not a job.

## 6. Close out

After the downstream skill delivers and the user has reviewed the running result, identify decisions that generalize beyond this surface. Draft dated T2 case-law entries for `DESIGN.md`, confirm with the user, and append only — never rewrite human-authored T1 or T3. If nothing generalizes, say so explicitly rather than inventing an entry.

Do not modify any design-lib `maturity` or `p_level` field, and do not add anything to its allow-list. Record evidence; promotion is a human decision made elsewhere.
