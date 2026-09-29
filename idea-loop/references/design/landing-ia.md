# Landing / IA — page taxonomy, Hero geometry, imagery

**Load when:** `static-ui-protocol` stage A routes to the **Landing / IA** entry (see the route table in
`references/design/static-ui-protocol.md` §A) — a landing, marketing, or multi-surface information-architecture
page. Read this alongside `surface-protocol.md`, not instead of it: Landing/IA still runs the
Surface R/B/W procedure end to end; this file supplies the extra domain vocabulary that procedure
needs at stage B (page taxonomy) and stage W (Hero geometry), plus the rules for every image on
the page (Imagery) — `uiux-imagine` reads that section when a direction involves imagery. It does not replace `design-core.md`
(taste, anti-slop, copy, proof map, responsive re-edit, runtime states) — those apply to a landing
page exactly as they apply to any other surface.

## Page taxonomy

Before choosing sections, classify the page's one primary responsibility:

- Company Homepage
- Product Family Landing
- Specific Product Page
- Capability Deep Dive
- Use Case / Solution Page
- Pricing / Enterprise / Trust Page
- Activation / Docs / Template Page

For a multi-product page, map Parent / Sibling / Cross-cutting nodes and distinguish which
sections carry a **Product**, **Capability**, **Router**, **Use Case**, **Buying**, **Trust**, or
**Activation** responsibility. Don't let URL depth or navigation labels decide the taxonomy by
themselves — a page nested three levels deep can still be a Router, and a top-level page can still
be a Capability Deep Dive.

Do this classification as part of the Surface protocol's stage B (concept, state map, and
expression table): the taxonomy is the "user's job" and "the one idea" for a landing page,
expressed in this domain's vocabulary instead of a generic surface's.

## Hero seven-slot model

Inventory the Hero as seven slots, not as a single "hero image + headline" block:

```text
Nav / Headline / Supporting / Primary CTA / Proof / Visual / Scroll hook
```

The content and proof actually available — from the proof map (`design-core.md` §7.1) — chooses
which slots exist and how they're weighted; never default to one
archetype because it's familiar. Do this slot inventory at stage B alongside the taxonomy call,
then lock the chosen geometry at stage W before descending into module/component work.

Four geometry archetypes are documented case law from a prior research pass, kept here as
**same-source M1 hypotheses**, not a menu to pick from by default:

- Full-bleed image
- Image-first editorial
- Engineering grid
- Split header + product mockup

All four came from the same designer's portfolio (one source, not independent evidence) and none
of them carry Mobile evidence. Treat them as a vocabulary for describing what you're building, not
as a validated ranking — the content/proof condition of *this* page chooses the geometry, and
Mobile reordering is always a fresh design decision, never a shrink of the Desktop slot order.

### Text block × image — a second small sample (2026-09-21)

The four archetypes above come from one source. This subsection adds a second one, and it is **also
a small sample**: three live references — Quizlet's homepage, Mercury's SaaS-income-statement
template page, YouTube's Creator Economy report — picked by one human on refero in one sitting, plus
one page where the rule was applied and measured (a test-score explainer, referred to below as "the
case"). Treat it as the same tier of evidence as the archetypes: a vocabulary and a set of checks
that held once, not a validated ranking. What it adds over the archetypes is measurement.

**Invariant — the text block.** Headline / Supporting / Primary CTA stack vertically, aligned left
or centred. Across the references the text block never changed shape; what changed was where the
image sat relative to it.

**Variable — where the image sits relative to the text block.**

| Geometry | Text | Image | Seen in |
|---|---|---|---|
| Full-bleed, subject offset sideways | left | whole-Hero background; the subject sits on the side opposite the text | Quizlet homepage (a person); the case, final (a still life, not a person) |
| Stacked, framed image below | centred | a rounded frame under the CTA row, holding a slightly abstract render of the page's own subject (the template) | Mercury template page |
| Full-bleed, subject below the CTA | centred (or left) | whole-Hero background; the subject sits under the CTA row | the case, tried and dropped — its image was judged unrelated to the content |

YouTube's report is a fourth arrangement — left text, a loose collage of real photos top-right, not a
background. Recorded, not generalised.

**Constraint.** When the image is a background, its **subject must not collide with the text block** —
offset sideways or offset vertically, never under the words. The text sits on the image's quiet part.
This is the per-asset "text safe zone" that `uiux-refine` §7.2's asset brief asks for.

**Corollaries** — measured once on the case, not yet confirmed on a second page:

- Centred text can only pair with a vertical offset; a sideways offset needs left-aligned text.
- **The geometry follows the image's subject, not the other way round.** A subject that spans the full
  width (on the case: a row of eleven equal slabs, one per half-band of a 1–6 scale) cannot take a
  sideways offset — the text covers part of the subject and the image stops saying what it says. A
  subject weighted to one side (a person, an object, a product capture) can. Decide what the image
  depicts first — that is a direction question and belongs to `uiux-imagine` — then the geometry.
- **One model across widths, not a layout per breakpoint.** A sideways offset has to become vertical
  on a narrow viewport. Two ways to do that failed on the case: a white wash over the image left the
  phone with no image at all, and turning the image into a separate band under the CTA read to the
  human as the picture "changing lanes from background to an illustration below". What worked keeps
  the image's role fixed: it stays the Hero's background at every width, the text block stays
  top-left, and only the subject's position relative to the text changes — beside it when there is
  room (≥1024px on the case), below it when there is not. The image's top edge fades into a colour
  sampled from the image itself, so the narrow layout reads as the same scene continuing up behind
  the text.
- **Never let `cover` size a background whose subject must stay clear of the text.** `cover` scales by
  height on tall or narrow windows and pushes the subject sideways into the text column — the actual
  cause of the mid-width overlap on the case (900–1100px, and 1280px on a tall window). Size by width
  instead, and cap the Hero's height at the image's height (`min(100vh − header, 55.8vw)` for a 16:9
  image), so the subject's edge sits at a fixed share of the viewport.
- **Make the image scale continuous across the breakpoint.** On the case the narrow layout's image
  width grows linearly as the viewport shrinks (`calc(47.87vw + 533px)`): exactly the viewport width at
  the breakpoint, so crossing it only moves the image down and never resizes it. Type scales
  continuously too (`clamp()`), not in steps.
- **Check every locale at every width.** Per-locale max-widths written for a centred Hero ran the
  Chinese headline across the image once the text moved left; the same sweep caught a Chinese
  headline clipped at 390px by a fixed font-size rule with higher specificity.
- **An offset is not enough; leave air.** A sideways offset left 24px between the subtitle and the
  subject; the human read it as cramped. Brief the subject's position as a share of the frame, then
  measure the gap on the page at several widths. A wider source frame (16:9 rather than 3:2) keeps
  more empty side under `cover`.
- **Describe the placement physically, not as a grid.** Generators follow a stated position loosely
  and a stated grid literally: "the right 40%" came back at 45%; "three equal vertical columns" came
  back with two divider lines drawn on the desk. "Pushed to the far right, cropped by the right edge;
  the left two-thirds is one empty desk surface" came back right.

**Acceptance.** Sweep widths (on the case: 360, 390, 768, 1023, 1024, 1100, 1280 on a tall window,
1440, 1920) in every locale and, at each, compute the subject's box from the image's real placement
and assert no text glyph or button enters it, plus a minimum gap. Text over an image has no computed
background colour, so contrast is measured on the image's real pixels: draw the image into a canvas
at its real scale and position, apply any overlay, sample every pixel inside each text element's
box, take the worst case. The same sampling covers text over a live render (a WebGL or canvas
background): read the rendered frame back and sample it the same way. Buttons over an image get an
**opaque** fill — a translucent one lets the image through (measured on the case: a translucent
white ghost button put `#0f6fd1` text at 3.56:1; opaque white, 4.98:1).

## Imagery — what an image may depict, and in what style

Applies to every image on a landing or marketing surface, the Hero included.

**An image must depict this page's subject.** On-brand colour, stylistic consistency and "it stands
for a concept" do not make an image relevant. Two checks, per image:

1. **Routing** — name the row below the image belongs to and where its material comes from. An
   image that fits no row is decoration.
2. **Portability** — move the image, in your head, onto any other page of the same product. If it
   still works there, it is decoration however well it matches the brand. Redo it.

Route by **what the image depicts**, not by what would look good in the slot:

| The image depicts | Use | Why |
|---|---|---|
| a concept (a standard, a scale, a breakdown) | the concept's own physical form drawn as line art (a ruler for a scale), or a still life of its physical traces (a marked-up essay for "scoring") | there is nothing real to capture; an abstract render was judged decoration twice on the case |
| a product surface (a report, a score, a list) | the product's real output, by `design-core.md` §7.1's first two routes: reuse a real capture, or reconstruct from verified real state | a fabricated surface claims something the product does not do (`design-core.md` §5.5) |
| a real situation (the scene a task is set in) | photography the product already owns | an invented person fails "who is this?" |

Between a capture and a coded reconstruction, the page's constraints decide: text that must be
crawled, translated or reflowed (SEO and multilingual pages) → coded; a surface shown only as
evidence that the product exists, whose text need not be read → a capture is fine.

**Style is chosen per page, from the content — there is no product-wide image style.** People,
still life, line art, isometric illustration, a coded animation: which one fits is decided by what
this page, or this block, has to show. On the case one page ended up with four — a still-life
photograph in the Hero (the traces of marking an essay), line-art plates for three scales, generated
line illustrations for the scoring criteria, and a coded animation where the point was a process.
Each was right for its block. An early attempt to write "this product's image language is unpeopled
still life" into the project's design law had to be withdrawn when the next section needed
something else — so a style picked for one page stays in that page's freeze record, not in
`DESIGN.md`. What *is* shared across a page is the execution: blocks that sit side by side (three
columns, a tab set) use one style between them, one projection, one ground.

**Colour is not locked to the UI's brand hue.** The interface carries the brand colour; imagery
brings its own (`design-core.md` §4). Rendering every image in the brand hue makes a page read as
one flat colour — the human's words on the case: "all one colour family feels monotonous."
Photography brings its own colour naturally; a generated image should be briefed for a palette of
its own, not the UI's.

**Two hard bans.** Never generate a person. Never generate product UI — an image that looks like the
product's own report invents a product that does not exist. (A real person in owned photography is
a legitimate style; a generated one is not.)

**Before reaching for a person, try objects and place.** On a page about an abstract subject, a still
life of the subject's physical traces carries the theme without a face — the case chose a
hand-marked essay (highlighter strokes, margin ticks, coloured tabs) over photographs of students.

**Check every generated image by hand before use.**
- *Logos and brand marks.* Models draw them despite an explicit "no logos". On the case a laptop
  maker's logo appeared twice — once only visible after cropping and enlarging the lid.
- *Writing.* Left to itself, a model writes near-words — plausible at a glance, nonsense up close.
  Blurring them in post was tried and rejected by the human ("content that is blurred on the image is
  just bad"). Put the exact text in the prompt — a short, coherent passage on the page's own subject
  — and check the output word by word. On the case the model reproduced all seven specified lines
  and every requested mark.
- *Tone fixes go in post, not in a regeneration,* once the subject has been checked word by word — a
  regeneration throws that check away. Protect the subject by geometry (measure its edges and draw
  the polygon) plus saturation, and apply one curve to everything outside it. Per-pixel
  luminance/saturation selections speckle the shadows, a blurred selection bleeds into the ink, and a
  hue selection bites the edges of pale objects. Relighting the surround also makes a white subject
  read grey, so lift its paper tone separately (bright, low-saturation pixels only).

**Where the decision sits.** *What* an image depicts, and in *which style*, is a direction question:
`uiux-imagine` puts it to the human between genuinely different subjects and styles, and the
direction note records one line per image (subject · style · route from the table above). *How well*
it is rendered — composition, light, the crop at a narrow viewport, contrast under the text,
consistency with its neighbours — is execution, `uiux-refine`. A refine that inherits an undecided
subject tends to fill it with a pretty on-brand abstract, which is exactly what fails the portability
check. How a generated image is produced and kept regenerable: `uiux-refine` §7.3.

## Provenance

Distilled from a design-lib research repository's `design-landing-plan` / `design-landing` skills
(page classification and the Hero seven-slot inventory), generalized away from that repo's
`$DESIGN_LIB_ROOT`-relative allow-list gating (M/P evidence levels, candidate-mode opt-in) — this
file carries no path dependency on that repository and no machinery to keep in sync with it. The
epistemic caveats on the four Hero archetypes (same source, no Mobile evidence) are carried over
because they're load-bearing, not because the gating mechanism they came from is being kept.

The "Text block × image" subsection and the Imagery section were distilled on 2026-09-21–09-29 from
one marketing page's `uiux-imagine` / `uiux-refine` rounds: the human's reading of Quizlet and
Mercury after reviewing them live, the human's rejection of an on-brand glass render as "purely
decoration" ("the relevance between image and content has to be strong"), that page's measurements
(subject-to-CTA gap, pixel-sampled text contrast, the 390px wash-out), and the withdrawn attempt to
turn one page's image style into the product's design law.
