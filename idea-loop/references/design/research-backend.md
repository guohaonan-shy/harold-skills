# Research backend — one named question in, one local HTML page out

**按需加载。** Read by exactly one executor: `idea-loop:uiux-researcher` (`agents/uiux-researcher.md`),
started by the `uiux-research` skill when the **human** asks to look at how other products do
something. Nobody else reads this file and nobody else calls Refero: `uiux-imaginer`, `designer` and
stage C of `static-ui-protocol.md` do not research — when a UX question cannot be settled by
judgment they write it down as a **suggested research question** (one named question plus a
recommended answer) in their hand-back and carry on with the recommendation. Whether it gets
researched is the human's call.

Tool mechanics (parameters, batch limits, platform filters) live in the `refero-design` skill's own
`references/mcp-tools.md`; don't restate them here, they'd rot out of sync.

## What gets researched

A **named question** is one sentence, about one decision, that the current work cannot settle from the
product's own truth. "What should this feel like" is not one. "How do products confirm leaving a
session in progress, and where does the confirmation sit" is.

Research answers **UX questions**: a UX pattern, a user flow across screens, how a class of page is
usually built, the tone of a piece of copy. It does **not** answer visual-style questions (taste,
aesthetic family, palette or type mood) — those belong to `DESIGN.md` and the random seeds that drive
divergence. So only Refero's two product layers are used:

| The named question is about… | Layer | Refero call |
|---|---|---|
| A concrete UI pattern — how a specific component or screen is structured, what it says | **Screens** | `refero_search_screens` (+ `refero_get_screen`, `refero_get_similar_screens`) |
| A multi-step flow — how a user moves across connected screens to complete a task | **Flows** | `refero_search_flows` (+ `refero_get_flow`) |

Pick the layer that matches the *question*, not the altitude of the work. When a flow search comes
back sparse, search the related screens and reconstruct the order by hand — and say on the page that
the order is reconstructed.

**Never call `refero_search_styles` / `refero_get_style`,** and never use `refero_get_screen_image`:
it hands the picture back as an image block with no address, so it cannot be saved to disk. Screenshots
come from the `thumbnail_url` that each screen in a search result carries (an `images.refero.design/…_thumb.jpg`
address, about 800px wide — enough to read a dialog; the un-suffixed full-size address is refused with 403, so
do not guess it), downloaded with `curl`. Flow details carry the same field per step.

Research is not gated on how far the work has got. It does not decide what a UI looks like — it tells
the human what others tried and why; the divergence itself is driven by seeds. The human may research
before the first variant exists.

This backend is **never a gate**. Nothing blocks on it, and a run that never opened it is legitimate.

### What static screenshots cannot answer

A question about **time or behaviour** — when a state appears, whether something pauses while a dialog
is open, how an animation eases — is usually not answerable from still pictures. Do not pad the page
with references that only look relevant: write the question (or the part of it) under **Cannot
answer** at the top of the page, say what a screenshot could not show, and answer only what it can.
An honest "no reference answers this" beats a confident wrong one.

## Where the files go

The caller hands you a drop directory — one of two shapes, both local and never in git, deleted with
the `docs/design/tmp/` lifecycle:

- with a spec: `docs/design/tmp/<spec-slug>/research/<question-short-name>/`
- without one: `docs/design/tmp/research/<question-short-name>/`

Inside: `index.html` and the downloaded screenshots under `shots/<source>-<n>.jpg`. The page
references them by relative path only, so it opens from `file://` and moves with the folder.

## The page: structure

Top of the page, in this order:

1. **The named question** — the one sentence.
2. **The conclusion** — one sentence. What most sources agree on, or the fork they split on.
3. **Cannot answer** — what this research does not settle (time / behaviour questions, states no source
   shows, platforms not covered). Never empty: if truly nothing, say what was not looked at.

Then **one section per source**, in the order you would show them to a colleague:

- the **flow**: that source's screenshots in a horizontal row, in the order the user meets them, each
  with a line underneath saying what this step does;
- beside it, three readings:
  1. **Scene (场景)** — which product, which user, what they are trying to get done.
  2. **Design logic (设计逻辑)** — which pattern or flow it uses, what problem that solves, and
     therefore why the UI looks the way it does.
  3. **For us (对我们)** — what this source can answer and what it cannot; what to keep, what to
     change, what not to copy. A source that cannot represent the target state does not belong on
     the page at all.

**When sources disagree, the page says so as a decision for the human** — two or more named
alternatives, each with the source it comes from and why — never a midpoint. That is the
reference-averaging ban (`ui-craft-checklist.md` §2): a reference is evidence for a specific claim,
not a vote.

Write the page in the language of the named question.

## The page: markup contract

`scripts/research-check.mjs` checks the shape by these attributes, so keep them exactly. Everything
else (CSS, wording of headings) is yours.

```html
<!doctype html>
<html lang="zh"><head><meta charset="utf-8"><title>调研：退出确认</title>
<style>
  body{font:16px/1.6 system-ui,sans-serif;max-width:1100px;margin:0 auto;padding:24px 16px;color:#1a1a1a;background:#fff}
  @media (prefers-color-scheme:dark){body{color:#e8e8e8;background:#161616}}
  ol[data-part=flow]{display:flex;gap:16px;overflow-x:auto;list-style:none;padding:0}
  ol[data-part=flow] li{flex:0 0 220px}
  ol[data-part=flow] img{width:100%;border:1px solid #8884;border-radius:8px}
  section[data-source]{border-top:1px solid #8884;margin-top:32px;padding-top:16px}
</style></head><body>
<h1 data-part="question">一句话的具名问题</h1>
<p data-part="conclusion">一句话结论。</p>
<section data-part="cannot-answer"><h2>不能回答什么</h2><p>…</p></section>

<section data-source>
  <h2 data-part="source-title">产品名 · 这一组在做什么</h2>
  <ol data-part="flow">
    <li><img src="shots/acme-1.jpg" alt="第 1 步"><p>这一步在做什么</p></li>
    <li><img src="shots/acme-2.jpg" alt="第 2 步"><p>这一步在做什么</p></li>
  </ol>
  <div data-part="scene"><h3>场景</h3><p>…</p></div>
  <div data-part="logic"><h3>设计逻辑</h3><p>…</p></div>
  <div data-part="for-us"><h3>对我们</h3><p>…</p></div>
</section>
<!-- more <section data-source>…; sources that disagree: add a section naming the fork as a decision -->
</body></html>
```

- A page with no source at all is legal only when a `<section data-part="no-source">` says why (what was
  searched, why nothing could represent the target state).
- Every `<img>` is a path **relative to the drop directory**, under `shots/`, and exists. No remote
  addresses (they expire), no `data:` URIs, no `..`.
- Each flow step has both a screenshot and a line of text.

Run the check before handing back, and fix until it is green:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/research-check.mjs" <drop directory>/index.html
```

## What goes back to the caller

Only two things: the **absolute path of `index.html`** and **one sentence** of conclusion. Refero
calls, search results and screenshots stay with the researcher. The calling session sends the file to
the human; the human decides which readings, if any, go back to `uiux-imaginer` or `designer`, and
they go as **text from the three readings, never the pictures**.

## How a used result is recorded

When the human takes a conclusion into the work, the executor records it the way its stage already
records things:

- `uiux-imagine`: in the direction note's 「约束与素材」, as text — the renders and screenshots do not
  survive the phase, the words do.
- `uiux-refine`: in the freeze record, where stage C used to note a reference.

Keep the three readings together when recording one (what it answers, what it does not, keep /
change / do not copy) — a conclusion without its "does not answer" is the half that misleads.

## Provenance

Refero's screens and flows layers are a live dependency of this plugin, named here and in
`agents/uiux-researcher.md` — the only two places that call them. This file exists to keep the
routing and the page contract visible in prose next to that agent.
