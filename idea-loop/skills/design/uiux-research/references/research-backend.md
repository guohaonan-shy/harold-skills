# Research backend — one named question in, one local HTML page out

**按需加载。** Read by exactly one executor: `idea-loop:uiux-researcher` (`agents/uiux-researcher.md`),
started by the `uiux-research` skill when the **human** asks to look at how other products do
something. Nobody else reads this file and nobody else calls Refero: `uiux-imaginer`, `designer` and
stage C of `uiux-refine`'s static-UI protocol do not research — when a UX question cannot be settled by
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
address, about 500–800px wide — what the flow row shows), downloaded with `curl`. Flow details carry the
same field per step. The picture a click enlarges to should be sharper than that: try the same address
with `_thumb` dropped (`curl -fsS`). Probed on 2026-10-20: for iOS screenshots (`…/screenshots/<id>/mobile/<uuid>_thumb.jpg`)
the un-suffixed address answers 200 with a ~1125px-wide image; for web screenshots
(`…/screenshots/<site>/desktop/<uuid>_thumb.jpg`, the thumbnail is already ~800px wide) it answers 403,
and so do other suffixes (`_large`, `_full`, `.png`, `.webp`). So try it, take it when it answers 200;
when it does not, the enlarged picture is the thumbnail itself — never a broken link.

Research is not gated on how far the work has got. It does not decide what a UI looks like — it tells
the human what others tried and why; the divergence itself is driven by seeds. The human may research
before the first variant exists.

This backend is **never a gate**. Nothing blocks on it, and a run that never opened it is legitimate.

### What static screenshots cannot answer

A question about **time or behaviour** — when a state appears, whether something pauses while a dialog
is open, how an animation eases — is usually not answerable from still pictures. Do not pad the page
with references that only look relevant: say so — a line in the general conclusions ("no reference
shows when X happens") and an entry in the decisions block at the end of the page (with the options
you can name) — and answer only what the screenshots can. There is no standalone
"cannot answer" block: the first human annotation (2026-10-20) found it low-value, and it filled up
with process notes ("the order is mine", "these sources were left out") that belong nowhere on the
page. An honest "no reference answers this" beats a confident wrong one.

## Where the files go

The caller hands you a drop directory — one of two shapes, both local and never in git, deleted with
the `docs/design/tmp/` lifecycle:

- with a spec: `docs/design/tmp/<spec-slug>/research/<question-short-name>/`
- without one: `docs/design/tmp/research/<question-short-name>/`


Inside: `index.html` and the downloaded screenshots under `shots/` — per step the picture the flow row
shows, `shots/<source>-<n>.jpg`, and the larger one a click opens, `shots/<source>-<n>-full.jpg` (when
no sharper address answered, this file is a copy of the first, so the link never breaks). The page
references them by relative path only, so it opens from `file://` and moves with the folder.

## The page: structure

The broad shape is fixed (human decision, review round 1, 2026-10-20: "the shape follows the report
as it stands; each chapter gets a description, not a hard requirement"). The page reads in this
order — the human first sees what was asked, then what the products agree on, then the evidence, and
only at the very end is asked to decide:

1. 研究问题 (what was asked) — title, the human's words, the context
2. 通用结论 (what these products agree on)
3. one section per source, each with a flow, 场景 and 设计逻辑
4. 要我们决策的问题 (what is still open for us) — the last block; nothing comes after it

`research-check.mjs` guards that skeleton and nothing finer (see "What the check guards" below). What
follows is what each chapter is **for** — the description to write toward, not a rule the check can
fail you on. Write the page in the language of the named question.

## What each chapter is for

**研究问题.** What it holds: the named question, the one sentence you were handed, copied
**verbatim** as the page's `<h1>` (do not reword it into a nicer question); under a block headed
exactly 「研究问题」, **the human's own words** as you received them; and the **product context** you
were handed (which product, which surface, the `DESIGN.md` pointer, platform), also verbatim. Why:
the human reads the page to judge whether it served the ask, so they have to be able to see what the
ask was and what you were given; a reworded question hides a mismatch.

**通用结论 (`general`).** What it holds: the conclusions that hold across the sources you show, as
a short list, the most important first. A part of the question that static pictures cannot answer
(time / behaviour) is one line here ("no reference shows when X happens"). Why: this is the part the
human reads first and may read only; it has to stand without the sources. Keep process notes (which
sources were left out, how you ordered things) out of it — the first human annotation (2026-10-20)
found them low-value; an honest "no reference answers this" beats a confident wrong one.

**Each source.** In the order you would show them to a colleague: a title, then the **flow** — that
source's screenshots in a horizontal row, in the order the user meets them, each with a line
underneath saying what this step does. **Every screenshot can be clicked to see it larger**, with the
sharpest picture you could get behind the click (see above). Why: the human has to see the
sequence to follow the reasoning, and read the text against the picture. Beside it, two readings:

- **场景 (scene)** — which product, which user, which surface this page sits on and in what moment,
  what they are trying to get done. Why: a pattern means nothing detached from the moment it serves.
- **设计逻辑 (design logic)** — which pattern or flow it uses, what problem that solves, and
  therefore why the UI looks the way it does. Why: this is the transferable part, and it travels
  only together with its scene.

How a source bears on *our* needs is not repeated per source: it appears once, in the last chapter.
A source that cannot represent the target state does not belong on the page at all.

**要我们决策的问题 (`decisions`).** What it holds: read the general conclusions and the sources
against the product context and name what is still open for *our* product. One entry per decision:
the question, the options, the source each option comes from, and what each means for our surface
given the context. Where sources split, the split **is** the entry — alternatives named, never a
midpoint (a reference is evidence for a specific claim, not a vote). You
do not pick one: no "so choose B". If nothing is open, say so in one line. Why it goes last: the
human decides after reading the evidence (second human annotation, 2026-10-20: "需要我们决策的内容放在
内容调研后面"); at the top it asked for decisions before the sources that justify them had been read.
Why nothing follows it: it is the page's end point, the thing the human leaves with.

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
  ol[data-part=flow] img{width:100%;border:1px solid #8884;border-radius:8px;cursor:zoom-in}
  section[data-source]{border-top:1px solid #8884;margin-top:32px;padding-top:16px}
  dialog#zoom{max-width:96vw;max-height:96vh;border:0;padding:0;background:transparent}
  dialog#zoom::backdrop{background:#000c}
  dialog#zoom img{display:block;max-width:96vw;max-height:96vh;cursor:zoom-out}
</style></head><body>
<h1 data-part="question">具名问题，原样</h1>
<section data-part="brief">
  <div data-part="human-words"><h3>研究问题</h3><p>…人的原话，原样…</p></div>
  <div data-part="context"><h3>交给调研 agent 的上下文</h3><p>…原样…</p></div>
</section>
<section data-part="conclusion">
  <div data-part="general"><h2>这些产品的通用结论</h2><ul><li>…</li></ul></div>
</section>

<section data-source>
  <h2 data-part="source-title">产品名 · 这一组在做什么</h2>
  <ol data-part="flow">
    <li><a data-part="zoom" href="shots/acme-1-full.jpg"><img src="shots/acme-1.jpg" alt="第 1 步"></a><p>这一步在做什么</p></li>
    <li><a data-part="zoom" href="shots/acme-2-full.jpg"><img src="shots/acme-2.jpg" alt="第 2 步"></a><p>这一步在做什么</p></li>
  </ol>
  <div data-part="scene"><h3>场景</h3><p>…</p></div>
  <div data-part="logic"><h3>设计逻辑</h3><p>…</p></div>
</section>
<!-- more <section data-source>… -->

<section data-part="decisions-block">
  <div data-part="decisions"><h2>要我们决策的问题</h2><ol><li>…问题、选项、各自出处、对我们这块界面意味着什么…</li></ol></div>
</section>

<dialog id="zoom"><img alt=""></dialog>
<script>
  const dlg = document.getElementById('zoom');
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-part=zoom]');
    if (!a || !dlg.showModal) return;          // no dialog support: the link just opens the picture
    e.preventDefault();
    dlg.querySelector('img').src = a.getAttribute('href');
    dlg.showModal();
  });
  dlg.addEventListener('click', () => dlg.close());
</script>
</body></html>
```

- A page with no source at all is legal only when a `<section data-part="no-source">` says why (what was
  searched, why nothing could represent the target state).

### What the check guards

- **The skeleton, in order:** the title, the 「研究问题」 block (the human's words) and the context come
  before the conclusion; the conclusion (`general`, non-empty) comes before the first source; every
  source (or the `no-source` note) comes before `decisions`; `decisions` is non-empty, is not inside
  `conclusion`, and is the **last block of the page** — only the zoom `<dialog>` and its `<script>`
  may follow it.
- **Per source:** a title, a flow whose every step has a screenshot wrapped in `<a data-part="zoom">`
  and a line of text, and non-empty `scene` and `logic`.
- **Addresses:** every `<img>` on the page — in a flow step or anywhere else (the conclusion, a
  reading, the decisions) — and every zoom `href` is a path **relative to the drop directory** and
  exists. No remote addresses (they expire), no `data:` URIs, no `..`. The one exemption is the empty
  `<img alt="">` inside the zoom `<dialog>` (any `<img>` inside a `<dialog>` is skipped), whose address
  the script sets at click time.
- **Two retired parts:** `cannot-answer` and `for-us` fail the check if they appear — a human
  annotation removed them by name.

What the check does **not** guard (known limits, accepted by the human in review round 2 — the human's
reading of the page is the gate for these):

- an extra block **before** the 「研究问题」 block (a preface, a banner);
- an extra overlay, `<template>` or `<style>` block **after** the decisions that is not the zoom
  `<dialog>` and its script — the check lets any `<dialog>`, `<template>`, `<script>`, `<style>` and
  `<noscript>` follow the decisions, so only a visible block (a footer, a paragraph) is caught.

Nor is what a chapter holds checked: an extra paragraph in the conclusion, a
third reading in a source, a different screenshot folder than `shots/`. The descriptions above say
what to write, the human's reading catches drift, and once annotations show the same drift recurring
it can be promoted into a check.

Run the check before handing back, and fix until it is green:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/research-check.mjs" <drop directory>/index.html
```

## What goes back to the caller

Only two things: the **absolute path of `index.html`** and **one sentence** of conclusion (the most
important line of the general conclusions). Refero calls, search results and screenshots stay with the
researcher. The calling session sends the file to the human; the human decides which parts, if any, go
back to `uiux-imaginer` or `designer`, and they go as **text — a source's scene and design logic, a
general conclusion, a decision entry — never the pictures**.

## How a used result is recorded

When the human takes a conclusion into the work, the executor records it the way its stage already
records things:

- `uiux-imagine`: in the direction note's 「约束与素材」, as text — the renders and screenshots do not
  survive the phase, the words do.
- `uiux-refine`: in the freeze record, where stage C used to note a reference.

Keep a conclusion together with its source's scene when recording one (what it answers, for which
user in which moment) — a design logic with its scene cut off is the half that misleads.

## Provenance

Refero's screens and flows layers are a live dependency of this plugin, named here and in
`agents/uiux-researcher.md` — the only two places that call them. This file exists to keep the
routing and the page contract visible in prose next to that agent.
