# content-creator

Content creation toolkit for short-video / social-feed creators (Xiaohongshu, 视频号, YouTube). Currently ships one skill — `thumbnail-gen` — with more on the roadmap (title writer, post body drafter, hashtag generator, video voiceover script).

---

## The skill

| Skill | Use case | Trigger keywords | Output |
|---|---|---|---|
| **thumbnail-gen** | Generate eye-catching social-feed thumbnails | thumbnail / 缩略图 / 封面 / cover / 分享卡片 / share card / 视频封面 / 小红书封面 | `./cover-<name>.png` in user cwd |

Interactive HTML/CSS composer:
- Multi-platform spec presets (3:4 小红书/视频号封面, 4:3 视频号分享卡片, 9:16 Shorts, 16:9 YouTube)
- Portrait-photo layout math (cover/contain/auto, computed `background-position` for must-keep regions)
- Multi-ratio derivation: derive a 4:3 share card from an existing 3:4 cover without re-designing
- Photo prep pipeline (HEIC→JPG, EXIF flatten, rembg cutout)
- Playwright headless screenshot rendering
- Bundled commercial-use Chinese title font (Smiley Sans 得意黑)

---

## Install

### Prerequisites
- `uv` (https://docs.astral.sh/uv/) — used to run the bundled Python scripts with auto-managed dependencies. No pre-installation of playwright/rembg needed.
- macOS / Linux (uses `sips` on macOS for image inspection — adapt to ImageMagick on Linux if needed)

### Claude Code (CLI)
1. Add this marketplace: `/plugin marketplace add guohaonan-shy/harold-skills`
2. Install: `/plugin install content-creator@harold-skills`
3. First time only: run `uv run --script <SKILL_DIR>/scripts/screenshot.py --install` to install Chromium for Playwright. The skill prompts when needed.

---

## Usage

Trigger naturally:
- "帮我做一个小红书封面"
- "make a thumbnail for my YouTube short"
- "/thumbnail-gen 视频号分享卡片"

The skill drives the conversation: asks platform, content, style → generates 2-3 previews → you pick → asks for photo → computes layout → renders final to your current directory.

---

## File-layout convention

| Kind | Location |
|---|---|
| Generated HTML / intermediate PNGs | `/tmp/thumbnail-gen/` |
| **Final cover PNG** | user cwd (`./cover-<name>.png`) |
| Skill assets (fonts, scripts) | plugin install dir, read-only |

Plugin directory is treated as read-only — runtime artifacts always go to `/tmp/` (intermediate) or user cwd (deliverable).

---

## Roadmap

- `title-writer` — punchy social-feed titles (≤20 char Xiaohongshu, ≤70 char YouTube)
- `post-writer` — short body copy matching the chosen platform's tone
- `tag-gen` — hashtag/tag set recommendations
- `video-script` — voiceover / talking-head video scripts with hook + demo + close

---

## License

MIT
