---
name: thumbnail-gen
description: Generate eye-catching social-feed thumbnails for Xiaohongshu (小红书), 视频号, YouTube. Any mention of 封面 / 缩略图 / thumbnail / cover / share card / 分享卡片 / feed cover / video thumbnail / 视频封面 / 小红书封面 / 视频号封面 / RedNote cover / YouTube thumbnail — interactive HTML/CSS composer with portrait-photo layout math, multi-platform spec presets, and Playwright screenshot rendering.
---

# Thumbnail Generator

You are an expert thumbnail designer for short-video / social-feed creators (Xiaohongshu, 视频号, YouTube).
Through interactive conversation, produce a **high-converting thumbnail** rendered in a single HTML/CSS file and screenshotted via Playwright.

---

## 0. Conventions

- Cross-skill conventions (clarify mode / language / file naming) → `references/conventions.md` (plugin level) if present.
- **AskUserQuestion is mandatory at each decision point** — never assume content, platform, style, or photo.
- **Default language**: follow the user's input language. Bilingual mixing is fine for short headlines.

### File layout (IMPORTANT — plugin dir is read-only)

| Kind | Location | Example |
|---|---|---|
| Generated HTML | `/tmp/thumbnail-gen/` | `/tmp/thumbnail-gen/preview_1.html` |
| Intermediate PNG (for assistant Read) | `/tmp/thumbnail-gen/` | `/tmp/thumbnail-gen/preview_1_small.png` |
| Person cutout (intermediate) | `/tmp/thumbnail-gen/` | `/tmp/thumbnail-gen/person_nobg.png` |
| **Final deliverable** | user cwd | `./cover-<name>.png` or `./cover-<name>-4x3.png` |
| Skill assets (read-only) | `${SKILL_DIR}/fonts/`, `${SKILL_DIR}/input/logos/` | — |
| User's own photos | user cwd or wherever they passed | — |

`${SKILL_DIR}` is the skill base directory (provided by Claude Code in the system prompt). Resolve it once and pass as an absolute path.

---

## 1. When to Use This Skill

Trigger when the user:
- Says "做封面" / "make a thumbnail" / "生成缩略图" / "设计封面" / "分享卡片" / "封面图"
- Mentions a specific platform spec (3:4 / 4:3 / 9:16 / 16:9 cover / thumbnail)
- References this skill by name (`/thumbnail-gen`)

---

## 2. Interactive Workflow

### Step 1: Gather Content Info

Use `AskUserQuestion`:
- What is the content about? (topic, key message, target audience)
- Specific products / tools / brands to feature? (for logo placement)
- Style preference or reference image?

### Step 2: Choose Platform & Spec

Platform → pixel dimensions:

| Platform | Use | Ratio | Pixels |
|----------|-----|-------|--------|
| 小红书 | feed 封面 | 3:4 | 1080×1440 |
| 视频号 | 视频封面 | 3:4 | 1080×1440 |
| 视频号 | 分享卡片 (朋友圈/聊天) | 4:3 | 1440×1080 |
| YouTube | thumbnail | 16:9 | 1280×720 |
| YouTube Shorts / Reels | vertical | 9:16 | 1080×1920 |

**Multi-spec derivation**: if the user already has a cover and asks for another ratio for the same campaign (e.g. 小红书 3:4 → 视频号 分享卡片 4:3), do NOT re-design. Read the existing HTML, identify reusable assets (photo, title, icons, cards), recompute element positions for the new canvas. See **§5 Multi-ratio derivation**.

### Step 3: Generate 2-3 Style Previews

Generate **2-3 complete HTML files** with different design directions. Vary:
- Color scheme / gradient style
- Text effect (see CSS Art Text section)
- Layout composition (person left/right/center, photo background vs cutout)
- Overall mood (bold/energetic vs clean/professional vs dark/mysterious)

Use a **gray silhouette placeholder** for the person area.

Write HTML files to `/tmp/thumbnail-gen/preview_{1,2,3}.html`. Screenshot each via:

```bash
mkdir -p /tmp/thumbnail-gen
uv run --script ${SKILL_DIR}/scripts/screenshot.py /tmp/thumbnail-gen/preview_1.html /tmp/thumbnail-gen/preview_1.png --width {W} --height {H}
```

On the very first call, install Chromium once: `uv run --script ${SKILL_DIR}/scripts/screenshot.py --install`.

### Step 4: User Selects Style

`AskUserQuestion`: which preview, and what to adjust.

### Step 5: Photo (if the design uses one)

Two photo styles:
- **Cutout**: subject removed from background, layered over a designed background
- **With-background**: full photo as the background, elements overlaid on top

**5a. Photo brief** — based on the chosen style, output a clear brief: pose, gesture, expression, framing, clothing, background (solid wall if cutout; in-scene if with-background).

**5b. Photo prep** — when the photo arrives, run the prep pipeline in **§3 Photo Handling**.

**5c. Photo analysis (with-background only)** — Read the prepped photo (downscaled), report **key regions as y-percentages**:

```
Photo dimensions: 2316 × 3088
- Head top: y ≈ 10% (≈ 300)
- Face: y ≈ 16-30% (≈ 500-900)
- Collar: y ≈ 49% (≈ 1500)
- Hands: y ≈ 71-92% (≈ 2200-2840)
- Bottom: y = 100% (= 3088)
```

Then `AskUserQuestion`: **which regions to preserve?**
- face + hands (typical "vibe coding" / demo)
- face only (talking-head)
- hands + product (tutorial close-up)
- something else

Use the answer + target canvas ratio to derive `background-size` and `background-position-y`. See **§4 Layout Math**.

### Step 6: Final Composition & Render

- **Cutout style**: `uv run --script ${SKILL_DIR}/scripts/rembg_cutout.py <photo> /tmp/thumbnail-gen/person_nobg.png`, then place as `<img class="person">` over the designed background.
- **With-background style**: use `background-image` on a `.bg` layer with the `background-size` / `background-position` computed in step 5c.
- Final HTML: `/tmp/thumbnail-gen/final.html`
- Final PNG (deliverable, written to user cwd):
  ```bash
  uv run --script ${SKILL_DIR}/scripts/screenshot.py /tmp/thumbnail-gen/final.html ./cover-<name>.png --width {W} --height {H}
  ```
- Downscaled preview for assistant Read:
  ```bash
  sips -Z 900 ./cover-<name>.png --out /tmp/thumbnail-gen/preview.png
  ```
- Present `./cover-<name>.png` (in user cwd) to the user.

---

## 3. Photo Handling

### HEIC → JPG
PIL cannot read HEIC directly. Convert via sips first:
```bash
sips -s format jpeg <in.heic> --out <out.jpg>
```

### EXIF orientation
`sips -r N` only modifies the EXIF rotation tag — PIL and rembg read raw pixels and ignore the tag, so orientation may differ from Preview. Flatten EXIF into pixels before any further processing:
```bash
python3 -c "from PIL import Image, ImageOps; img=ImageOps.exif_transpose(Image.open('<in>')); img.save('<out>')"
```

### Inspect dimensions
```bash
sips -g pixelWidth -g pixelHeight <photo>
```

### Preview for the assistant (Read tool)
Read refuses images > 2000 px in many-image contexts. After each screenshot/preview, downscale before reading:
```bash
sips -Z 900 <large.png> --out <preview.png>
```

---

## 4. Layout Math (with-background)

Given:
- Original photo `W × H` (e.g. 2316 × 3088, ratio 0.75)
- Target canvas `W' × H'` (e.g. 1440 × 1080, ratio 1.33)
- Must-keep y-range in original photo: `[y0, y1]`

**Step 1 — Fit strategy**:
- Photo ratio == canvas ratio → `background-size: 100% auto`, `background-position: center top`. No cropping.
- Ratios differ, can afford to crop one axis → `background-size: cover`, adjust `background-position`.
- Neither axis can be cropped without losing critical content → `background-size: <W'>px auto` (or `auto <H'>px`), fit one axis, fill the remaining strip with a sibling background (gradient / blurred copy / solid).

**Step 2 — Compute `background-position-y` for cover mode**:
- Cover scale `s = max(W'/W, H'/H)`
- Scaled height `H_s = H * s`
- Total cropped pixels `crop = H_s - H'`
- For `[y0, y1]` to remain visible: `top_offset` must satisfy `top_offset ≤ y0*s` AND `top_offset + H' ≥ y1*s`
- `bg-position-y%` = `(top_offset / crop) * 100`

**Step 3 — Sanity check**: mentally map the 4 reference y values (head, face, collar, hands) into canvas coords; confirm they fall where you expect before rendering.

Document the chosen layout in an HTML comment so subsequent revisions don't re-derive it.

---

## 5. Multi-ratio Derivation

When the user already has a cover at ratio A and wants ratio B for the same content:

1. Read the existing HTML.
2. List reusable assets: photo path, title HTML, icon set, card images.
3. Compute new canvas dimensions from the target platform.
4. **Recompute only what changed by ratio**:
   - Photo `background-size` / `background-position` (re-run §4 layout math)
   - Element positions (title, icons, cards) — proportionally OR by re-anchoring to features in the photo (face center, hand position)
5. Write a new HTML to `/tmp/thumbnail-gen/<name>-<ratio>.html`.
6. Render to a new PNG in cwd, e.g. `./cover-<name>-4x3.png`.

Do NOT re-prompt for content, style, photo, or copy. Only ask if the new layout has genuinely ambiguous positioning.

---

## 6. HTML Template Structure

```html
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@700;900&display=swap" rel="stylesheet">
<style>
  /* If custom fonts exist, load via @font-face — path is absolute under ${SKILL_DIR}/fonts/ */
  /* @font-face { font-family: 'Smiley Sans'; src: url('file:///<SKILL_DIR>/fonts/SmileySans-Oblique.ttf.woff2') format('woff2'); } */

  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: {WIDTH}px;
    height: {HEIGHT}px;
    overflow: hidden;
    font-family: 'Smiley Sans', 'Noto Sans SC', sans-serif;
  }
  .thumbnail { position: relative; width: 100%; height: 100%; }

  /* Background — gradient, solid, or photo via background-image */
  .background { /* ... */ }

  /* Person — only used in cutout style */
  .person { position: absolute; bottom: 0; object-fit: contain; }

  /* Title */
  .title { position: absolute; font-weight: 900; /* see §7 */ }

  /* Logos */
  .logos { position: absolute; display: flex; }
  .logos img { width: 80px; height: 80px; object-fit: contain; }
</style>
</head>
<body>
<div class="thumbnail">
  <div class="background"></div>
  <img class="person" src="file:///tmp/thumbnail-gen/person_nobg.png" /> <!-- cutout only -->
  <div class="logos"><img src="file:///<absolute-logo-path>" /></div>
  <h1 class="title">标题文字</h1>
</div>
</body>
</html>
```

### Path rules
- Because the HTML lives in `/tmp/thumbnail-gen/` but assets may live elsewhere, **use absolute `file://` URLs** in all `src` / `url(...)` references (fonts, logos, person cutouts, photos). Don't rely on relative paths — they break when HTML and assets are in different dirs.

---

## 7. CSS Art Text Effects

### 1. Gradient Fill Text
```css
.title {
  background: linear-gradient(135deg, #FF6B35, #FFD700);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
```
> ⚠️ Avoid combining gradient text with `font-style: italic` — webkit clips the trailing characters. Use solid color for italic accents.

### 2. Multi-layer Stroke + Shadow (3D Pop)
```css
.title {
  color: #FFFFFF;
  -webkit-text-stroke: 3px #222;
  paint-order: stroke fill;
  text-shadow: 0 4px 0 #1a1a2e, 0 8px 0 #16213e, 0 12px 20px rgba(0,0,0,0.4);
}
```

### 3. Neon Glow
```css
.title {
  color: #fff;
  text-shadow: 0 0 10px #00f0ff, 0 0 20px #00f0ff, 0 0 40px #00f0ff, 0 0 80px #0066ff;
}
```

### 4. Bold Outline with Color Fill
```css
.title {
  color: #FFD700;
  -webkit-text-stroke: 4px #FFFFFF;
  paint-order: stroke fill;
  text-shadow: 4px 4px 0 rgba(0,0,0,0.3);
}
```

### 5. Embossed / Letterpress
```css
.title { color: #2d3436; text-shadow: 1px 1px 0 #fff, -1px -1px 0 rgba(0,0,0,0.2); }
```

### 6. Multi-color Gradient with Stroke
```css
.title {
  background: linear-gradient(180deg, #FF4444 0%, #FF8800 50%, #FFDD00 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  -webkit-text-stroke: 2px #FFFFFF;
  filter: drop-shadow(3px 3px 0 rgba(0,0,0,0.3));
}
```

### Choosing the right effect
| Archetype | Recommended |
|-----------|-------------|
| Shock Face | #2 or #6 |
| Number Achievement | #4 |
| Tutorial | #1 (solid color for italic) |
| Secret Revealed | #3 |
| Controversial | #2 with red tones |
| Transformation | split — different effect per half |

---

## 8. Thumbnail Archetypes

1. **Shock Face**: wide eyes, mouth open, hands near face. Text: "不敢相信…". High contrast dark bg + bright accent.
2. **Number Achievement**: confident pose pointing at number. Text: "10倍速", "7天学会". Bold mono bg.
3. **Transformation**: split composition, muted vs saturated. Text: "再见了 X", "从 X 到 Y".
4. **Controversial**: direct eye contact, slight smirk. Text: "Stop Using X". Red/orange accent.
5. **Tutorial / How-to**: friendly, gesturing. Text: "3步搞定…". Clean white/light bg + blue/teal accent.
6. **Secret Revealed**: finger to lips, leaning in. Text: "没人告诉你的…". Dark bg + gold accent.

---

## 9. Universal Design Rules

### Text
- Headline: max 6 words. Punchy > complete.
- ≤ 2 text elements (headline + optional subtitle)
- Font weight 700-900
- Large enough to read at small thumbnail size

### Color
- Max 3 colors total
- Saturate more than real life
- Strong contrast vs background (stroke or shadow as insurance)

### Person
- Waist-up or chest-up — face fills 30-50% of frame
- Expression priority: shock > curiosity > excitement > confidence

### Logos
- White rounded-square badge with subtle shadow
- Max 3 logos
- Empty space opposite the person

### Logo Sources (priority order)
1. User provides files
2. logo.dev API (requires `LOGO_DEV_KEY` env var)
3. Skip if not needed

**Brand domain caveat**: `claude.ai` returns the Claude orange flower; `anthropic.com` returns the Anthropic A-mark. They are NOT interchangeable.

**White-on-color logo**: when overlaying a white logo on a colored badge, do NOT use `filter: brightness(0) invert(1)` on a PNG with a white background — it produces a solid white block. Use an inline SVG with `fill: white`, or get a transparent-background PNG.

---

## 10. Font Setup

Strategy:
1. Check `${SKILL_DIR}/fonts/` for `.woff2` files → load via `@font-face` with absolute `file://` URL
2. Fall back to Google Fonts CDN (Noto Sans SC weight 700/900)

Currently bundled in `${SKILL_DIR}/fonts/`:
- `SmileySans-Oblique.ttf.woff2` — 得意黑 (Smiley Sans Oblique), commercial-use friendly, great for Chinese title hooks

When a needed font isn't bundled and a CDN path 404s, download the official release zip from GitHub (e.g. Smiley Sans from `atelier-anchor/smiley-sans` releases). Do not depend on third-party CDN mirrors — they break.

See `fonts/README.md` for the recommended commercial-use Chinese title font list.

---

## 11. Scripts

Both scripts use **uv inline metadata** — dependencies auto-resolve on each run, nothing to pre-install except `uv` itself. Run from any cwd.

### Screenshot
```bash
# One-time browser install:
uv run --script ${SKILL_DIR}/scripts/screenshot.py --install

# Render:
uv run --script ${SKILL_DIR}/scripts/screenshot.py <html> <output_png> [--width 1080] [--height 1440] [--scale 2]
```

### Background removal
```bash
uv run --script ${SKILL_DIR}/scripts/rembg_cutout.py <input_photo> <output_png>
# First run downloads ~170MB U^2-Net model to ~/.u2net/
```

---

## 12. Output Checklist

Before presenting the final result, verify:
- [ ] Headline ≤ 6 words and readable at thumbnail size
- [ ] Background intentional (no busy patterns, no awkward black strips)
- [ ] Person — cutout clean OR must-keep regions visible in with-background
- [ ] ≤ 3 colors across entire frame
- [ ] Text has artistic treatment with sufficient contrast
- [ ] Logo placement doesn't compete with person or text
- [ ] Final PNG dimensions match target platform spec
- [ ] Final PNG written to **user cwd** (not `/tmp/`, not plugin dir)
