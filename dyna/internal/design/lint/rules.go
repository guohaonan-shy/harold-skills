// Package lint is `dyna design lint`: the mechanical gate over a design canvas HTML file, and the PostToolUse hook
// that runs it on every write to a canvas.
//
// It carries only the rules that hold across projects (the AI-slop tells in the design law). Project-specific brand
// floors live in the target project's own DESIGN.md as free text; there is no regex engine for that half.
// Deterministic, grep-style checks modeled on open-design's lint-artifact. Severities: P0 = hard ban, P1 = should fix,
// P2 = advisory. The rules were written as JavaScript regexes; they are carried over one for one (see package jsx for
// the JS behaviours they lean on).
package lint

import (
	"fmt"
	"math"
	"regexp"
	"strconv"
	"strings"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/design/jsx"
)

// Finding is one thing a rule found.
type Finding struct {
	File     string
	ID       string
	Severity string
	Why      string
	Detail   string
	Line     int // 0 = none
}

type hit struct {
	detail string
	line   int
}

type ctx struct{ css, text string }

type rule struct {
	id       string
	severity string
	why      string
	check    func(html string, c ctx) []hit
}

// ---------- helpers ----------

var (
	reComment = jsx.Re(`<!--[\s\S]*?-->`, "")
	reScript  = jsx.Re(`<script[\s\S]*?</script>`, "i")
	reStyle   = jsx.Re(`<style[\s\S]*?</style>`, "i")
	reTag     = jsx.Re(`<[^>]+>`, "")
	reBlock   = jsx.Re(`<style[^>]*>([\s\S]*?)</style>`, "i")
	reInline  = jsx.Re(`style\s*=\s*"([^"]*)"`, "i")
	reSpaces  = jsx.Re(`\s+`, "")
)

// visibleText strips script/style/comments, then tags, to the user-visible text.
func visibleText(html string) string {
	s := reComment.ReplaceAllString(html, " ")
	s = reScript.ReplaceAllString(s, " ")
	s = reStyle.ReplaceAllString(s, " ")
	s = reTag.ReplaceAllString(s, " ")
	s = strings.ReplaceAll(s, "&mdash;", "—")
	s = strings.ReplaceAll(s, "&ndash;", "–")
	return s
}

// cssText is the CSS and inline-style content: style blocks, then style="" attributes.
func cssText(html string) string {
	var parts []string
	for _, m := range reBlock.FindAllStringSubmatch(html, -1) {
		parts = append(parts, m[1])
	}
	for _, m := range reInline.FindAllStringSubmatch(html, -1) {
		parts = append(parts, m[1])
	}
	return strings.Join(parts, "\n")
}

func lineOf(html string, byteIdx int) int { return strings.Count(html[:byteIdx], "\n") + 1 }

// match is one match of a pattern: the text, where it starts, and the capture groups (-1 index = did not take part).
type match struct {
	text   string
	start  int
	groups []string
	have   []bool
}

func findAll(s string, re *regexp.Regexp) []match {
	var out []match
	for _, ix := range re.FindAllStringSubmatchIndex(s, -1) {
		m := match{text: s[ix[0]:ix[1]], start: ix[0]}
		for g := 1; g < len(ix)/2; g++ {
			if ix[2*g] < 0 {
				m.groups = append(m.groups, "")
				m.have = append(m.have, false)
			} else {
				m.groups = append(m.groups, s[ix[2*g]:ix[2*g+1]])
				m.have = append(m.have, true)
			}
		}
		out = append(out, m)
	}
	return out
}

// ---------- rules ----------

var (
	reShadow       = jsx.Re(`box-shadow\s*:\s*([^;{}]+)`, "i")
	reInset        = jsx.Re(`^inset\s+`, "i")
	reOffsetNums   = jsx.Re(`^(-?\d+(?:\.\d+)?)(?:px)?\s+(-?\d+(?:\.\d+)?)(?:px)?\s+(\d+(?:\.\d+)?)(?:px)?`, "")
	rePurpleHex    = jsx.Re(`#(?:6366f1|4f46e5|4338ca|7c3aed|8b5cf6|a855f7|6d28d9|9333ea|c084fc|d946ef)\b`, "i")
	rePurpleTw     = jsx.Re(`\b(?:bg|text|from|to|via|border|ring)-(?:indigo|violet|purple|fuchsia)-\d{2,3}\b`, "")
	reClipText     = jsx.Re(`background-clip\s*:\s*text`, "i")
	reDashCopy     = jsx.Re(`(?:\S+[ \t]+){0,3}\S*[—–]\S*(?:[ \t]+\S+){0,3}`, "")
	reCJK          = regexp.MustCompile(`[\x{4e00}-\x{9fff}\x{3000}-\x{303f}\x{ff00}-\x{ffef}]`)
	reEmoji        = regexp.MustCompile(`[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}]`)
	reStock        = jsx.Re(`(?:images\.unsplash\.com|placehold\.(?:it|co)|via\.placeholder\.com|picsum\.photos)`, "i")
	rePureBlack    = jsx.Re(`(?:color|background|border)[^;{}]*#000(?:000)?\b`, "i")
	reBounceWord   = jsx.Re(`\b(?:bounce|elastic)\b`, "i")
	reOvershoot    = jsx.Re(`cubic-bezier\(\s*[\d.]+\s*,\s*(?:1\.[1-9]\d*|[2-9][\d.]*)`, "")
	reTransition   = jsx.Re(`transition(?:-property)?\s*:\s*([^;{}]+)`, "i")
	reLayoutProp   = jsx.Re(`\b(?:width|height|top|left|right|bottom|margin(?:-\w+)?|padding(?:-\w+)?|all)\b`, "i")
	reLeftBorder   = jsx.Re(`border-left\s*:\s*[3-9]px\s+solid(\s+)`, "i")
	reSection      = jsx.Re(`<section\b`, "i")
	reTwEyebrow    = jsx.Re(`class\s*=\s*"[^"]*\buppercase\b[^"]*\btracking-|class\s*=\s*"[^"]*\btracking-\[?[^"]*\buppercase\b`, "")
	reUpper        = jsx.Re(`text-transform\s*:\s*uppercase`, "i")
	reLetterSpace  = jsx.Re(`letter-spacing\s*:\s*(?:0\.0[6-9]|0\.[1-9]|[1-9](?:\.\d+)?px|0\.\d+em)`, "i")
	reScrollCue    = jsx.Re(`scroll (?:to (?:explore|discover|walk)|down)`, "i")
	reFiller       = jsx.Re(`\b(?:elevate your|seamless(?:ly)?|unleash|next-gen|revolutioniz\w+|supercharge|innovative|cutting-edge|leverag\w*|synerg\w*|best-in-class|state-of-the-art|world-class|holistic|robust)\b`, "i")
	reCTA          = jsx.Re(`<button\b[^>]*>([\s\S]*?)</button>|<a\b[^>]*class\s*=\s*"[^"]*\b(?:btn|cta)\b[^"]*"[^>]*>([\s\S]*?)</a>`, "i")
	reWeakLabel    = jsx.Re(`^(?:ok|submit|yes|no|click here)$`, "i")
	rePlaceholder  = jsx.Re(`<input\b[^>]*placeholder\s*=\s*"[^"]*"[^>]*>`, "i")
	reAria         = jsx.Re(`aria-label(?:ledby)?\s*=`, "i")
	reInputID      = jsx.Re(`\bid\s*=\s*"([^"]+)"`, "i")
	reLorem        = jsx.Re(`lorem ipsum`, "i")
	reYou          = jsx.Re(`\byou(?:r|rs)?\b`, "i")
	reWe           = jsx.Re(`\bwe(?:'re|'ll|'ve)?\b|\bour\b|\bus\b`, "i")
	reAnimates     = jsx.Re(`@keyframes|animation\s*:|transition\s*:`, "i")
	reReducedMotio = jsx.Re(`prefers-reduced-motion`, "i")
)

func isExcludedBorder(rest string) bool {
	l := strings.ToLower(rest)
	return strings.HasPrefix(l, "#e2e8f0") || strings.HasPrefix(l, "transparent")
}

var rules = []rule{
	// — P0: hard bans, cross-project generic —
	{
		id: "hard-offset-shadow", severity: "P0",
		why: "Hard offset shadows are retired (Soft-Elevation Rule): every shadow is blurred and near-neutral.",
		check: func(html string, c ctx) []hit {
			var hits []hit
			for _, m := range findAll(c.css, reShadow) {
				for _, seg := range strings.Split(m.groups[0], ",") {
					// hard-offset signature: non-zero x AND y with 0 blur (e.g. "2px 2px 0 #0a0a0a")
					t := jsx.Trim(seg)
					t = reInset.ReplaceAllString(t, "")
					nums := reOffsetNums.FindStringSubmatch(t)
					if nums == nil {
						continue
					}
					x, _ := strconv.ParseFloat(nums[1], 64)
					y, _ := strconv.ParseFloat(nums[2], 64)
					blur, _ := strconv.ParseFloat(nums[3], 64)
					if math.Abs(x) > 0 && math.Abs(y) > 0 && blur == 0 {
						hits = append(hits, hit{detail: jsx.Head(jsx.Trim(seg), 60)})
					}
				}
			}
			return hits
		},
	},
	{
		id: "ai-purple-indigo", severity: "P0",
		why: "AI-default purple/indigo accent family (design-law: Anti-slop checklist); the project brand accent is the only structural loud color.",
		check: func(html string, _ ctx) []hit {
			var hits []hit
			for _, m := range findAll(html, rePurpleHex) {
				hits = append(hits, hit{m.text, lineOf(html, m.start)})
			}
			for _, m := range findAll(html, rePurpleTw) {
				hits = append(hits, hit{m.text, lineOf(html, m.start)})
			}
			return hits
		},
	},
	{
		id: "gradient-text", severity: "P0",
		why: "Gradient text on headers is a banned AI tell (DESIGN.md Don'ts, design-law: Anti-slop checklist).",
		check: func(_ string, c ctx) []hit {
			var hits []hit
			for _, m := range findAll(c.css, reClipText) {
				hits = append(hits, hit{detail: m.text})
			}
			return hits
		},
	},
	{
		id: "em-dash-copy", severity: "P0",
		why: "Em/en-dash in user-visible EN copy is the #1 AI tell (design-law: The em-dash ban, binary ban). CJK 破折号 is exempt.",
		check: func(_ string, c ctx) []hit {
			var hits []hit
			for _, m := range findAll(c.text, reDashCopy) {
				if reCJK.MatchString(m.text) { // skip CJK context
					continue
				}
				hits = append(hits, hit{detail: "…" + jsx.Head(reSpaces.ReplaceAllString(jsx.Trim(m.text), " "), 60) + "…"})
			}
			return hits
		},
	},

	// — P1: anti-slop tells —
	{
		id: "emoji-icon", severity: "P1",
		why: "Emoji as feature icons is an AI tell (design-law: Anti-slop checklist).",
		check: func(_ string, c ctx) []hit {
			var hits []hit
			for _, m := range reEmoji.FindAllString(c.text, -1) {
				hits = append(hits, hit{detail: m})
			}
			return hits
		},
	},
	{
		id: "external-stock-image", severity: "P1",
		why: "Hot-linked stock/placeholder CDNs break offline previews; use local assets (design-law: Assets).",
		check: func(html string, _ ctx) []hit {
			var hits []hit
			for _, m := range findAll(html, reStock) {
				hits = append(hits, hit{m.text, lineOf(html, m.start)})
			}
			return hits
		},
	},
	{
		id: "pure-black", severity: "P1",
		why: "Pure #000 is an AI tell; our ink is Slate 900 #0f172a (taste-skill §9.A).",
		check: func(_ string, c ctx) []hit {
			var hits []hit
			for _, m := range findAll(c.css, rePureBlack) {
				hits = append(hits, hit{detail: jsx.Head(m.text, 50)})
			}
			return hits
		},
	},
	{
		id: "bounce-easing", severity: "P1",
		why: "No bounce/elastic easing in-app (DESIGN.md Don'ts; motion: Easing tokens).",
		check: func(_ string, c ctx) []hit {
			var hits []hit
			for _, m := range findAll(c.css, reBounceWord) {
				hits = append(hits, hit{detail: m.text})
			}
			for _, m := range findAll(c.css, reOvershoot) {
				hits = append(hits, hit{detail: m.text})
			}
			return hits
		},
	},
	{
		id: "layout-transition", severity: "P1",
		why: "Animating layout-triggering properties causes layout thrash; animate transform/opacity only (motion: Performance and craft rules).",
		check: func(_ string, c ctx) []hit {
			var hits []hit
			for _, m := range findAll(c.css, reTransition) {
				value := jsx.Trim(m.groups[0])
				if reLayoutProp.MatchString(value) {
					hits = append(hits, hit{detail: "transition: " + jsx.Head(value, 60)})
				}
			}
			return hits
		},
	},
	{
		id: "left-accent-card", severity: "P1",
		why: `Rounded card with a left colored border accent = the "AI dashboard tile" (design-law: Anti-slop checklist).`,
		check: func(_ string, c ctx) []hit {
			// The old pattern ended in a negative lookahead, (?!#e2e8f0|transparent), which RE2 has no form of.
			// Backtracking made it match one space short when the colour was preceded by two or more spaces; that
			// is kept here, so the same text gives the same findings.
			var hits []hit
			for _, ix := range reLeftBorder.FindAllStringSubmatchIndex(c.css, -1) {
				ws0, ws1 := ix[2], ix[3]
				text := c.css[ix[0]:ix[1]]
				if !isExcludedBorder(c.css[ws1:]) {
					hits = append(hits, hit{detail: jsx.Head(text, 50)})
					continue
				}
				// the whole run is followed by an excluded colour: one space fewer is still a match
				run := []rune(c.css[ws0:ws1])
				if len(run) >= 2 {
					short := c.css[ix[0] : ws1-len(string(run[len(run)-1]))]
					hits = append(hits, hit{detail: jsx.Head(short, 50)})
				}
			}
			return hits
		},
	},
	{
		id: "eyebrow-overuse", severity: "P1",
		why: "Max 1 uppercase-tracked eyebrow per 3 sections (design-law: Layout discipline, mechanical quota).",
		check: func(html string, c ctx) []hit {
			sections := len(reSection.FindAllStringIndex(html, -1))
			if sections < 1 {
				sections = 1
			}
			tw := len(reTwEyebrow.FindAllStringIndex(html, -1))
			cssEyebrows := 0
			for _, ix := range reUpper.FindAllStringIndex(c.css, -1) {
				at := jsx.Index16(c.css, ix[0])
				around := jsx.Slice(c.css, max(0, at-300), at+300)
				if reLetterSpace.MatchString(around) {
					cssEyebrows++
				}
			}
			count := tw + cssEyebrows
			quota := (sections + 2) / 3
			if count > quota {
				return []hit{{detail: fmt.Sprintf("~%d uppercase-tracked labels across %d sections (quota %d) — verify eyebrow usage", count, sections, quota)}}
			}
			return nil
		},
	},
	{
		id: "scroll-cue", severity: "P1",
		why: "Scroll cues are banned (taste-skill §9.F): the viewport bottom does not need a label.",
		check: func(_ string, c ctx) []hit {
			var hits []hit
			for _, m := range findAll(c.text, reScrollCue) {
				hits = append(hits, hit{detail: m.text})
			}
			return hits
		},
	},
	{
		id: "filler-verbs", severity: "P1",
		why: "Filler marketing verbs/adjectives are AI tells (design-law: Copy & data tells, extended from great-web-copy): concrete language only.",
		check: func(_ string, c ctx) []hit {
			var hits []hit
			for _, m := range findAll(c.text, reFiller) {
				hits = append(hits, hit{detail: m.text})
			}
			return hits
		},
	},
	{
		id: "weak-cta-label", severity: "P1",
		why: `Button/CTA text must be a specific verb + object (design-law: Copy construction): "OK"/"Submit"/"Yes"/"No"/"Click here" are banned as the sole label.`,
		check: func(html string, _ ctx) []hit {
			var hits []hit
			for _, m := range findAll(html, reCTA) {
				// (m[1] ?? m[2] ?? ''): the first group when it took part, even empty, else the second
				inner := ""
				if m.have[0] {
					inner = m.groups[0]
				} else if m.have[1] {
					inner = m.groups[1]
				}
				inner = jsx.Trim(reTag.ReplaceAllString(inner, ""))
				if reWeakLabel.MatchString(inner) {
					hits = append(hits, hit{`"` + inner + `"`, lineOf(html, m.start)})
				}
			}
			return hits
		},
	},
	{
		id: "placeholder-only-label", severity: "P1",
		why: "Placeholder text disappears once the user types — it is not a label (design-law: Copy construction).",
		check: func(html string, _ ctx) []hit {
			var hits []hit
			for _, m := range findAll(html, rePlaceholder) {
				tag := m.text
				if reAria.MatchString(tag) {
					continue
				}
				if idm := reInputID.FindStringSubmatch(tag); idm != nil {
					// the id goes into the pattern as it is, as it always did; a pattern that does not compile
					// ends the whole rule with no findings (the old runner dropped a rule that threw)
					re, err := jsx.Compile(`<label\b[^>]*\bfor\s*=\s*"`+idm[1]+`"`, "i")
					if err != nil {
						return nil
					}
					if re.MatchString(html) {
						continue
					}
				}
				hits = append(hits, hit{jsx.Head(tag, 70), lineOf(html, m.start)})
			}
			return hits
		},
	},
	{
		id: "middle-dot-chain", severity: "P1",
		why: "Middle-dot is rationed: max 1 per metadata line, not the default separator (design-law: Copy & data tells).",
		check: func(_ string, c ctx) []hit {
			var hits []hit
			for _, l := range strings.Split(c.text, "\n") {
				if strings.Count(l, "·") >= 3 {
					hits = append(hits, hit{detail: jsx.Head(jsx.Trim(l), 60)})
					if len(hits) == 5 {
						break
					}
				}
			}
			return hits
		},
	},

	// — P2: advisory —
	{
		id: "lorem-ipsum", severity: "P2",
		why: "Filler copy left in the preview.",
		check: func(_ string, c ctx) []hit {
			if reLorem.MatchString(c.text) {
				return []hit{{detail: "lorem ipsum"}}
			}
			return nil
		},
	},
	{
		id: "you-we-ratio", severity: "P2",
		why: `"You" should outnumber "we" on persuasive marketing copy (design-law: Copy construction, great-web-copy). Advisory only — in-app copy legitimately says "we couldn't reach the server," so a mixed-register file can trip this without being wrong.`,
		check: func(_ string, c ctx) []hit {
			you := len(reYou.FindAllStringIndex(c.text, -1))
			we := len(reWe.FindAllStringIndex(c.text, -1))
			if we > you && we >= 3 {
				return []hit{{detail: fmt.Sprintf(`"we"-family %d vs "you"-family %d`, we, you)}}
			}
			return nil
		},
	},
	{
		id: "reduced-motion-missing", severity: "P2",
		why: "File animates but has no prefers-reduced-motion fallback (DESIGN.md hard floor at port time).",
		check: func(html string, c ctx) []hit {
			animates := reAnimates.MatchString(c.css)
			fallback := reReducedMotio.MatchString(c.css) || reReducedMotio.MatchString(html)
			if animates && !fallback {
				return []hit{{detail: "animation present, no prefers-reduced-motion block"}}
			}
			return nil
		},
	},
}

// ---------- runner ----------

// Lint runs every rule over one HTML text. file is only a label carried on each finding.
func Lint(html, file string) []Finding {
	c := ctx{css: cssText(html), text: visibleText(html)}
	var findings []Finding
	for _, r := range rules {
		hits := runRule(r, html, c) // a broken rule must never block the workflow
		// cap noise per rule
		for i, h := range hits {
			if i == 8 {
				break
			}
			findings = append(findings, Finding{File: file, ID: r.id, Severity: r.severity, Why: r.why, Detail: h.detail, Line: h.line})
		}
		if len(hits) > 8 {
			findings = append(findings, Finding{File: file, ID: r.id, Severity: r.severity, Why: r.why, Detail: fmt.Sprintf("…and %d more", len(hits)-8)})
		}
	}
	return findings
}

func runRule(r rule, html string, c ctx) (hits []hit) {
	defer func() {
		if recover() != nil {
			hits = nil
		}
	}()
	return r.check(html, c)
}

// Render is the findings as the text people read, grouped by severity.
func Render(findings []Finding) string {
	if len(findings) == 0 {
		return "design-lint: clean ✓"
	}
	bySev := map[string][]Finding{}
	for _, f := range findings {
		bySev[f.Severity] = append(bySev[f.Severity], f)
	}
	var lines []string
	for _, sev := range []string{"P0", "P1", "P2"} {
		if len(bySev[sev]) == 0 {
			continue
		}
		label := "advisory"
		switch sev {
		case "P0":
			label = "must fix"
		case "P1":
			label = "should fix"
		}
		lines = append(lines, fmt.Sprintf("%s (%s):", sev, label))
		for _, f := range bySev[sev] {
			head := ""
			if f.Detail != "" {
				head = f.Detail
				if f.Line != 0 {
					head += fmt.Sprintf(" (line %d)", f.Line)
				}
				head += " — "
			}
			lines = append(lines, fmt.Sprintf("  [%s] %s%s", f.ID, head, f.Why))
		}
	}
	return strings.Join(lines, "\n")
}

// Blocking is whether any finding is P0 or P1.
func Blocking(findings []Finding) bool {
	for _, f := range findings {
		if f.Severity == "P0" || f.Severity == "P1" {
			return true
		}
	}
	return false
}
