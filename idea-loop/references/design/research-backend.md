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

The page reads in this order — the human first sees what was asked, then what the products agree on,
then the evidence, and only at the very end is asked to decide:

1. **The named question** — the one sentence you were handed, copied **verbatim** (it is the page's
   `<h1>`; do not reword it into a nicer question).
2. **研究问题 (what was asked)** — a block headed exactly 「研究问题」 holding **the human's own words**
   (as you received them), then the **product context** you were handed (which product, which
   surface, the `DESIGN.md` pointer, platform), both verbatim. The human reads the page to judge
   whether it served the ask, so they have to be able to see what the ask was and what you were given.
3. **The conclusion — what these products agree on (通用结论)** — and nothing else: the conclusions
   that hold across the sources you show, as a short list, the most important first. A part of the
   question that static pictures cannot answer (time / behaviour) is one line here ("no reference
   shows when X happens") — not a separate block, and no process notes (which sources were left out,
   how you ordered things).

Then **one section per source**, in the order you would show them to a colleague:

- the **flow**: that source's screenshots in a horizontal row, in the order the user meets them, each
  with a line underneath saying what this step does. **Every screenshot can be clicked to see it
  larger**, with the sharpest picture you could get behind the click (see above);
- beside it, two readings, nothing more:
  1. **Scene (场景)** — which product, which user, which surface this page sits on and in what
     moment, what they are trying to get done.
  2. **Design logic (设计逻辑)** — which pattern or flow it uses, what problem that solves, and
     therefore why the UI looks the way it does.

How a source bears on *our* needs is **not** repeated per source: it appears once, in the decisions
block after the last source. A source that cannot represent the target state does not belong on the
page at all.

Last, **after the final source**, the page's closing block:

4. **The questions the human has to decide (要我们决策的问题)**: read the general conclusions and the
   sources against the product context and name what is still open for *our* product. One entry per
   decision: the question, the options, the source each option comes from, and what each means for
   our surface given the context. Where sources split, the split **is** the entry — alternatives
   named, never a midpoint (`ui-craft-checklist.md` §2: a reference is evidence for a specific claim,
   not a vote). You do not pick one: no "so choose B". If nothing is open, say so in one line. It
   goes last because the human decides after reading the evidence (second human annotation,
   2026-10-20: "需要我们决策的内容放在内容调研后面"); put at the top it asked for decisions before
   the sources that justify them had been read.

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
- The block holding the human's words is headed 「研究问题」. `conclusion` holds `general` (non-empty)
  and nothing else. `decisions` is non-empty and sits **after the last source** (after the `no-source`
  note when there is no source) — not inside `conclusion`.
- `cannot-answer` and `for-us` are retired and fail the check if they appear.
- Every `<img>` and every zoom `href` is a path **relative to the drop directory**, under `shots/`, and
  exists. No remote addresses (they expire), no `data:` URIs, no `..`.
- Each flow step has a screenshot wrapped in `<a data-part="zoom">` and a line of text.

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
