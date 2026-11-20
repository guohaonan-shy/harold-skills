package writing

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/design/jsx"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/jsnum"
)

var parseJSON = jsx.ParseJSON

// Offsets below are byte offsets into Go strings throughout; they only ever travel back to a line through the same
// text, so they stay consistent.

// ── word lists ──

// listRegex is a word list as one regex; no words, no regex. English matches whole words (any case), Chinese anywhere.
func listRegex(words []string, lang, prefix, suffix string) *regexp.Regexp {
	var alts []string
	for _, w := range words {
		if strings.TrimSpace(w) == "" {
			continue
		}
		alts = append(alts, regexp.MustCompile(`\s+`).ReplaceAllString(regexp.QuoteMeta(strings.TrimSpace(w)), `\s+`))
	}
	if len(alts) == 0 {
		return nil
	}
	body := "(?:" + strings.Join(alts, "|") + ")"
	if lang == "zh" {
		return regexp.MustCompile(prefix + body + suffix)
	}
	return regexp.MustCompile("(?i)" + prefix + `\b` + body + `\b` + suffix)
}

// ── text helpers ──

const cjkClass = `[\x{3000}-\x{303F}\x{3040}-\x{30FF}\x{3400}-\x{4DBF}\x{4E00}-\x{9FFF}\x{F900}-\x{FAFF}\x{FF00}-\x{FFEF}]`

var (
	cjkRe   = regexp.MustCompile(cjkClass)
	latinRe = regexp.MustCompile(`[A-Za-z0-9][A-Za-z0-9'-]*`)
)

func isCJK(r rune) bool { return cjkRe.MatchString(string(r)) }

func visualWidth(s string) int {
	w := 0
	for _, r := range s {
		if isCJK(r) {
			w += 2
		} else {
			w++
		}
	}
	return w
}

// wordEquiv counts Latin words plus CJK characters, so a Chinese and an English text are comparable.
func wordEquiv(s string) int {
	cjk := len(cjkRe.FindAllStringIndex(s, -1))
	latin := len(latinRe.FindAllStringIndex(cjkRe.ReplaceAllString(s, " "), -1))
	return cjk + latin
}

var (
	parensRe   = regexp.MustCompile(`\([^()]*\)`)
	cjkParenRe = regexp.MustCompile(`（[^（）]*）`)
	enumRe     = regexp.MustCompile(`(?:[^,，]{1,24}[,，]\s*){3,}[^,，]{1,24}`)
	commaSplit = regexp.MustCompile(`[,，]`)
	spaces     = regexp.MustCompile(`\s+`)
)

// stripParens drops parenthetical asides: they do not chain clauses.
func stripParens(s string) string {
	return cjkParenRe.ReplaceAllString(parensRe.ReplaceAllString(s, ""), "")
}

// stripEnumerations turns four or more short comma-separated items into one word: an enumeration, not a chain.
func stripEnumerations(s string) string {
	return enumRe.ReplaceAllStringFunc(s, func(run string) string {
		var items []string
		for _, x := range commaSplit.Split(run, -1) {
			if x = strings.TrimSpace(x); x != "" {
				items = append(items, x)
			}
		}
		short := 0
		for _, x := range items {
			if cjkRe.MatchString(x) {
				if utf8.RuneCountInString(x) <= 6 {
					short++
				}
			} else if len(spaces.Split(x, -1)) <= 2 {
				short++
			}
		}
		if float64(short)/float64(len(items)) >= 0.8 {
			return " LIST "
		}
		return run
	})
}

// singleStar says whether s[i] is a `*` with no `*` right before or after it.
func singleStar(s string, i int) bool {
	return s[i] == '*' && (i == 0 || s[i-1] != '*') && (i+1 >= len(s) || s[i+1] != '*')
}

var boldRe = regexp.MustCompile(`\*\*[^*]*\*\*`)

// isWholeBlockItalic: a block wrapped start to end in one *italic* span is a deliberate footnote, not stray emphasis.
func isWholeBlockItalic(raw string) bool {
	t := strings.TrimSpace(raw)
	if len(t) < 3 || t[0] != '*' || t[1] == '*' || t[len(t)-1] != '*' || t[len(t)-2] == '*' {
		return false
	}
	inner := boldRe.ReplaceAllString(t[1:len(t)-1], "")
	for i := range inner {
		if singleStar(inner, i) {
			return false
		}
	}
	return true
}

var (
	codeSpan   = regexp.MustCompile("`[^`]*`")
	linkRe     = regexp.MustCompile(`!?\[([^\]]*)\]\([^)]*\)`)
	emphMarks  = regexp.MustCompile(`[*_]{1,3}`)
	tagRe      = regexp.MustCompile(`<[^>]+>`)
	abbrevRe   = regexp.MustCompile(`(?i)\b(e\.g|i\.e|etc|vs|Mr|Mrs|Ms|Dr|Prof|Ph\.D|U\.S|a\.m|p\.m)\.`)
	decimalRe  = regexp.MustCompile(`\d+\.\d+`)
	zhStops    = regexp.MustCompile(`[。！？]+`)
	enStopRuns = regexp.MustCompile(`[.!?]+`)
)

// stripInline strips inline markdown so counts reflect prose, not markup.
func stripInline(s string) string {
	s = codeSpan.ReplaceAllString(s, " ")
	s = linkRe.ReplaceAllString(s, "${1}")
	s = emphMarks.ReplaceAllString(s, "")
	return tagRe.ReplaceAllString(s, " ")
}

// sentenceEnd says whether the text right after a run of [.!?] ends a sentence: whitespace, the end, or a closing
// quote or bracket.
func sentenceEnd(s string, at int) bool {
	if at >= len(s) {
		return true
	}
	r, _ := utf8.DecodeRuneInString(s[at:])
	return unicode.IsSpace(r) || strings.ContainsRune(`"')]`, r)
}

func countSentences(text, lang string) int {
	n := 0
	if lang == "zh" {
		n = len(zhStops.FindAllStringIndex(text, -1))
	} else {
		t := strings.ReplaceAll(decimalRe.ReplaceAllString(abbrevRe.ReplaceAllString(text, "${1}_"), "N"), "...", "…")
		for _, m := range enStopRuns.FindAllStringIndex(t, -1) {
			if sentenceEnd(t, m[1]) {
				n++
			}
		}
	}
	if n > 0 {
		return n
	}
	if strings.TrimSpace(text) != "" {
		return 1
	}
	return 0
}

func splitSentences(text, lang string) []string {
	var out []string
	if lang == "zh" {
		// split after every 。！？
		start := 0
		for i, r := range text {
			if r == '。' || r == '！' || r == '？' {
				end := i + utf8.RuneLen(r)
				out = append(out, text[start:end])
				start = end
			}
		}
		out = append(out, text[start:])
		var kept []string
		for _, s := range out {
			if s = strings.TrimSpace(s); s != "" {
				kept = append(kept, s)
			}
		}
		return kept
	}
	guarded := decimalRe.ReplaceAllString(abbrevRe.ReplaceAllString(text, "${1}_"), "N")
	// split on a run of whitespace that comes right after a . ! or ?
	start := 0
	for i := 0; i < len(guarded); {
		r, size := utf8.DecodeRuneInString(guarded[i:])
		if unicode.IsSpace(r) && i > 0 && strings.ContainsRune(".!?", rune(guarded[i-1])) {
			out = append(out, guarded[start:i])
			j := i
			for j < len(guarded) {
				r2, s2 := utf8.DecodeRuneInString(guarded[j:])
				if !unicode.IsSpace(r2) {
					break
				}
				j += s2
			}
			start, i = j, j
			continue
		}
		i += size
	}
	out = append(out, guarded[start:])
	var kept []string
	for _, s := range out {
		s = strings.ReplaceAll(s, "_", ".")
		if strings.TrimSpace(s) != "" {
			kept = append(kept, s)
		}
	}
	return kept
}

func snippet(s string) string {
	t := spaces.ReplaceAllString(strings.TrimSpace(s), " ")
	if r := []rune(t); len(r) > 60 {
		return string(r[:57]) + "…"
	}
	return t
}

// ── images ──

var (
	mdImageRe      = regexp.MustCompile(`!\[((?:[^\]\\]|\\.)*)\]\(\s*(?:<[^>]*>|[^\s)]+)(?:\s+(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'))?\s*\)`)
	mdSrcRe        = regexp.MustCompile(`\]\(\s*<?([^\s)>]+)`)
	htmlImgRe      = regexp.MustCompile(`(?i)<img\b(?:"[^"]*"|'[^']*'|[^>"'])*>`)
	captionLabelRe = regexp.MustCompile(`(?i)^(?:figure|fig\.?|图)\s*\d*\s*[—–:：.-]*\s*`)
)

type image struct {
	src, alt, caption string
	index             int
}

func normCaption(t string) string { return strings.TrimSpace(spaces.ReplaceAllString(t, " ")) }

func wordChar(b byte) bool {
	return b == '_' || b >= 'a' && b <= 'z' || b >= 'A' && b <= 'Z' || b >= '0' && b <= '9'
}

// findImages is every image in a block of text. A markdown image's caption is its title; a hand-written <img>'s is
// the configured attribute.
func findImages(text, captionAttr string) []image {
	var out []image
	for _, m := range mdImageRe.FindAllStringSubmatchIndex(text, -1) {
		whole := text[m[0]:m[1]]
		src := ""
		if s := mdSrcRe.FindStringSubmatch(whole); s != nil {
			src = s[1]
		}
		caption := ""
		if m[4] >= 0 {
			caption = text[m[4]:m[5]]
		} else if m[6] >= 0 {
			caption = text[m[6]:m[7]]
		}
		out = append(out, image{src: src, alt: text[m[2]:m[3]], caption: caption, index: m[0]})
	}
	for _, m := range htmlImgRe.FindAllStringIndex(text, -1) {
		tag := text[m[0]:m[1]]
		attr := func(name string) string {
			re := regexp.MustCompile(`(?i)` + regexp.QuoteMeta(name) + `\s*=\s*(?:"([^"]*)"|'([^']*)')`)
			for _, a := range re.FindAllStringSubmatchIndex(tag, -1) {
				if a[0] > 0 && (wordChar(tag[a[0]-1]) || tag[a[0]-1] == '-') {
					continue
				}
				if a[2] >= 0 {
					return tag[a[2]:a[3]]
				}
				return tag[a[4]:a[5]]
			}
			return ""
		}
		out = append(out, image{src: attr("src"), alt: attr("alt"), caption: attr(captionAttr), index: m[0]})
	}
	return out
}

// ── parsing ──

type block struct {
	typ   string
	lines []string
	start int // first line, 1-based
}

var (
	fenceRe   = regexp.MustCompile("^```")
	closeTag  = regexp.MustCompile(`>\s*$`)
	headingRe = regexp.MustCompile(`^#{1,6}\s`)
	listRe    = regexp.MustCompile(`^\s*([-*+]\s|\d+\.\s)`)
	quoteRe   = regexp.MustCompile(`^\s*>`)
	tableRe   = regexp.MustCompile(`^\s*\|`)
	imageRe   = regexp.MustCompile(`^\s*!\[`)
	hrRe      = regexp.MustCompile(`^\s*(---|\*\*\*|___)\s*$`)
	htmlRe    = regexp.MustCompile(`^\s*<`)
	esmRe     = regexp.MustCompile(`^\s*(import|export)\s`)
)

// parse splits a file into frontmatter and blocks; every block knows its first line.
func parse(raw string) (string, []block) {
	lines := strings.Split(strings.ReplaceAll(raw, "\r\n", "\n"), "\n")
	i := 0
	front := ""
	if lines[0] == "---" {
		for end := 1; end < len(lines); end++ {
			if lines[end] == "---" {
				front = strings.Join(lines[1:end], "\n")
				i = end + 1
				break
			}
		}
	}
	var blocks []block
	inFence, inJsx := false, false
	var cur *block
	push := func() {
		if cur != nil && len(cur.lines) > 0 {
			blocks = append(blocks, *cur)
		}
		cur = nil
	}
	for ; i < len(lines); i++ {
		ln := lines[i]
		no := i + 1
		if fenceRe.MatchString(ln) {
			push()
			inFence = !inFence
			blocks = append(blocks, block{typ: "code", lines: []string{ln}, start: no})
			continue
		}
		if inFence {
			if len(blocks) > 0 {
				blocks[len(blocks)-1].lines = append(blocks[len(blocks)-1].lines, ln)
			}
			continue
		}
		// a JSX element spans several lines; stay inside its opening tag until the tag closes
		if inJsx {
			blocks[len(blocks)-1].lines = append(blocks[len(blocks)-1].lines, ln)
			if closeTag.MatchString(ln) {
				inJsx = false
			}
			continue
		}
		if strings.TrimSpace(ln) == "" {
			push()
			continue
		}
		var typ string
		switch {
		case headingRe.MatchString(ln):
			typ = "heading"
		case listRe.MatchString(ln):
			typ = "list"
		case quoteRe.MatchString(ln):
			typ = "quote"
		case tableRe.MatchString(ln):
			typ = "table"
		case imageRe.MatchString(ln):
			typ = "image"
		case hrRe.MatchString(ln):
			typ = "hr"
		case htmlRe.MatchString(ln), esmRe.MatchString(ln):
			typ = "html"
		default:
			typ = "para"
		}
		if typ == "heading" || typ == "image" || typ == "hr" {
			push()
			blocks = append(blocks, block{typ: typ, lines: []string{ln}, start: no})
			continue
		}
		if typ == "html" && htmlRe.MatchString(ln) && !closeTag.MatchString(ln) {
			push()
			blocks = append(blocks, block{typ: "html", lines: []string{ln}, start: no})
			inJsx = true
			continue
		}
		if cur == nil || cur.typ != typ {
			push()
			cur = &block{typ: typ, start: no}
		}
		cur.lines = append(cur.lines, ln)
	}
	push()
	return front, blocks
}

type joined struct {
	text   string
	starts []int
	start  int
}

// blockText is the block's lines joined with spaces, and the way back from an offset in it to a file line.
func blockText(b block, transform func(string) string) joined {
	parts := make([]string, len(b.lines))
	starts := make([]int, len(b.lines))
	at := 0
	for k, l := range b.lines {
		if transform != nil {
			l = transform(l)
		}
		parts[k] = l
		starts[k] = at
		at += len(l) + 1
	}
	return joined{text: strings.Join(parts, " "), starts: starts, start: b.start}
}

func (j joined) lineAt(offset int) int {
	k := 0
	for k+1 < len(j.starts) && j.starts[k+1] <= offset {
		k++
	}
	return j.start + k
}

// ── one file ──

// DetectLang is the language of a text: Chinese when more than a fifth of it is CJK, else English.
func DetectLang(text string) string {
	if float64(len(cjkRe.FindAllStringIndex(text, -1))) > float64(utf8.RuneCountInString(text))*0.2 {
		return "zh"
	}
	return "en"
}

var postFileRe = regexp.MustCompile(`^(.+?)\.([A-Za-z]{2,3}(?:-[A-Za-z0-9]+)*)\.mdx?$`)

func langFromName(file string, cfg Config) string {
	m := postFileRe.FindStringSubmatch(filepath.Base(file))
	if m == nil {
		return ""
	}
	if m[2] == cfg.LocalePair.Zh || strings.HasPrefix(strings.ToLower(m[2]), "zh") {
		return "zh"
	}
	return "en"
}

// Finding is one thing a rule found in one file.
type Finding struct {
	Rule     string `json:"-"`
	File     string `json:"file"`
	Line     int    `json:"line"`
	Severity string `json:"severity"`
	Message  string `json:"message"`
}

// Stats are the structure counts locale-parity compares.
type Stats struct{ H2, H3, Tables, Images, Quotes, Captions int }

func (s Stats) get(k string) int {
	return map[string]int{"h2": s.H2, "h3": s.H3, "tables": s.Tables, "images": s.Images, "captions": s.Captions, "quotes": s.Quotes}[k]
}

var (
	italicLabel  = regexp.MustCompile(`\[[^\]]*\]`)
	divAlignRe   = regexp.MustCompile(`(?i)<div[^>]*text-align`)
	tildeRe      = regexp.MustCompile(`~\s*\d`)
	headingStrip = regexp.MustCompile(`^#+\s*`)
	h2Re         = regexp.MustCompile(`^##\s`)
	h3Re         = regexp.MustCompile(`^###\s`)
)

// strayItalics finds `*italic*` the way /(?:^|[^*\\])\*(?!\*)([^*\n ][^*\n]*?)\*(?!\*)/g does: the offset of each
// opening star, and the text between the stars.
func strayItalics(s string) (at []int, inner []string) {
	open := func(q int) (int, bool) { // a match whose opening star is at q; returns the end
		if q >= len(s) || s[q] != '*' || (q+1 < len(s) && s[q+1] == '*') {
			return 0, false
		}
		g := q + 1
		if g >= len(s) || s[g] == '*' || s[g] == '\n' || s[g] == ' ' {
			return 0, false
		}
		for j := g + 1; j < len(s); j++ {
			switch s[j] {
			case '\n':
				return 0, false
			case '*':
				if j+1 < len(s) && s[j+1] == '*' {
					return 0, false
				}
				return j + 1, true
			}
		}
		return 0, false
	}
	for p := 0; p < len(s); {
		if p == 0 {
			if end, ok := open(0); ok {
				at, inner = append(at, 0), append(inner, s[1:end-1])
				p = end
				continue
			}
		}
		if s[p] != '*' && s[p] != '\\' {
			_, size := utf8.DecodeRuneInString(s[p:])
			if end, ok := open(p + size); ok {
				at, inner = append(at, p+size), append(inner, s[p+size+1:end-1])
				p = end
				continue
			}
		}
		_, size := utf8.DecodeRuneInString(s[p:])
		p += size
	}
	return at, inner
}

// numericRanges finds "15-20" the way /(?<![\w/-])\d+-\d+(?![\w/-])/g does.
func numericRanges(s string) (at []int, text []string) {
	digit := func(b byte) bool { return b >= '0' && b <= '9' }
	edge := func(b byte) bool { return wordChar(b) || b == '/' || b == '-' }
	for p := 0; p < len(s); p++ {
		if !digit(s[p]) || (p > 0 && edge(s[p-1])) {
			continue
		}
		i := p
		for i < len(s) && digit(s[i]) {
			i++
		}
		if i >= len(s) || s[i] != '-' {
			continue
		}
		j := i + 1
		for j < len(s) && digit(s[j]) {
			j++
		}
		if j == i+1 || (j < len(s) && edge(s[j])) {
			continue
		}
		at, text = append(at, p), append(text, s[p:j])
		p = j - 1
	}
	return at, text
}

// LintText is the findings of one article and its structure counts. lang forces the language; "" means from the
// file name, then from the text.
func LintText(raw, file, lang string, cfg Config) ([]Finding, Stats) {
	th := cfg.Thresholds
	L := lang
	if L == "" {
		L = langFromName(file, cfg)
	}
	if L == "" {
		L = DetectLang(raw)
	}
	fm, blocks := parse(raw)
	var findings []Finding
	add := func(rule, severity string, line int, message string) {
		if !contains(cfg.DisableRules, rule) {
			findings = append(findings, Finding{Rule: rule, Severity: severity, Line: line, Message: message})
		}
	}
	slopRe := listRegex(cfg.Wordlists.AISlop.Of(L), L, "", "")
	transRe := listRegex(cfg.Wordlists.Transitions.Of(L), L, "", "")
	colonRe := listRegex(cfg.Wordlists.ColonOpeners.Of(L), L, "^", `\s*[:：]`)
	fmLine := func(idx int) int { return strings.Count(fm[:idx], "\n") + 2 }

	// frontmatter
	hasField := func(name string) bool {
		return regexp.MustCompile(`(?m)^` + regexp.QuoteMeta(name) + `:\s*\S`).MatchString(fm)
	}
	for _, name := range cfg.Fields.Required {
		if !hasField(name) {
			add("required-fields", "error", 1, fmt.Sprintf("Missing required frontmatter field `%s:`.", name))
		}
	}
	if len(cfg.Fields.Image) > 0 {
		any := false
		var names []string
		for _, n := range cfg.Fields.Image {
			any = any || hasField(n)
			names = append(names, "`"+n+":`")
		}
		if !any {
			add("image-field", "warn", 1, fmt.Sprintf("None of %s is set; the article has no image.", strings.Join(names, " / ")))
		}
	}
	if !regexp.MustCompile(`(?m)^` + regexp.QuoteMeta(cfg.Fields.Faqs) + `:`).MatchString(fm) {
		add("faqs-field", "warn", 1, fmt.Sprintf("No `%s:` in the frontmatter; the article carries no FAQ list.", cfg.Fields.Faqs))
	}

	// FAQ answers: a floor only
	answerRe := regexp.MustCompile(`(?m)^\s*` + regexp.QuoteMeta(cfg.Fields.FaqAnswer) + `:\s*"([^"]*)"\s*$`)
	for _, m := range answerRe.FindAllStringSubmatchIndex(fm, -1) {
		answer := fm[m[2]:m[3]]
		words := wordEquiv(answer)
		if min := th.FaqMinWords.Of(L); float64(words) < min {
			add("faq-thin", "warn", fmLine(m[0]), fmt.Sprintf("FAQ answer is thin (%d words, minimum %s); it cannot stand alone when quoted: \"%s\"", words, jsnum.Format(min), snippet(answer)))
		}
	}

	// body
	heading := "(intro)"
	proseRun := 0
	breakReported := false
	totalWords, totalDashes, firstDashLine := 0, 0, 0
	seenFirstQuote := false
	var stats Stats
	visual := map[string]bool{"table": true, "image": true, "quote": true, "list": true, "hr": true}

	for _, b := range blocks {
		bt := blockText(b, nil)
		text := bt.text
		cleaned := blockText(b, stripInline)
		clean := cleaned.text

		if b.typ == "heading" {
			heading = strings.TrimSpace(headingStrip.ReplaceAllString(b.lines[0], ""))
			if h2Re.MatchString(b.lines[0]) {
				stats.H2++
			} else if h3Re.MatchString(b.lines[0]) {
				stats.H3++
			}
			proseRun, breakReported = 0, false
			continue
		}
		if b.typ == "code" {
			proseRun, breakReported = 0, false
			continue
		}
		switch b.typ {
		case "table":
			stats.Tables++
		case "image":
			stats.Images++
		case "quote":
			stats.Quotes++
		}

		// image captions, on every non-code block so a list or table cell is seen too
		for _, img := range findImages(text, cfg.Fields.CaptionAttribute) {
			caption := normCaption(img.caption)
			line := bt.lineAt(img.index)
			if caption != "" {
				stats.Captions++
			}
			switch {
			case caption == "":
				add("image-caption", "error", line, fmt.Sprintf(`Image has no caption under "%s" (%s); write it as the image title: ![alt](src "caption").`, heading, img.src))
			case caption == normCaption(img.alt):
				add("image-caption", "error", line, fmt.Sprintf(`Caption repeats the alt text under "%s" (%s); alt describes the picture, the caption says what it shows here: "%s"`, heading, img.src, snippet(caption)))
			case strings.TrimSpace(captionLabelRe.ReplaceAllString(caption, "")) == "":
				add("image-caption", "error", line, fmt.Sprintf(`Caption is only a label under "%s" (%s); follow "%s" with the sentence that says what the picture shows.`, heading, img.src, caption))
			}
		}

		// stray italic; the first blockquote is the one place some sites style as italic on purpose
		exempt := cfg.Italic.ExemptFirstBlockquote && b.typ == "quote" && !seenFirstQuote
		if b.typ == "quote" {
			seenFirstQuote = true
		}
		if !exempt && b.typ != "html" && !(b.typ == "para" && isWholeBlockItalic(text)) {
			// italic inside a link label is a cited title
			masked := italicLabel.ReplaceAllStringFunc(text, func(m string) string { return strings.Repeat(" ", len(m)) })
			ats, inners := strayItalics(masked)
			for k, at := range ats {
				add("stray-italic", "warn", bt.lineAt(at), fmt.Sprintf(`Stray *italic* under "%s"; use **bold** for a term, or "quotes" for a word named as a word: "*%s*"`, heading, strings.TrimSpace(inners[k])))
			}
		}

		if visual[b.typ] {
			proseRun, breakReported = 0, false
		}

		if b.typ == "table" {
			if m := divAlignRe.FindStringIndex(text); m != nil {
				add("table-div-align", "error", bt.lineAt(m[0]), fmt.Sprintf(`Table cell uses <div style="text-align:..."> under "%s"; align with the separator row instead ("| :--- |", "| :---: |", "| ---: |").`, heading))
			}
		}

		if b.typ == "para" {
			n := countSentences(clean, L)
			if float64(n) > th.MaxSentencesPerParagraph {
				add("para-sentences", "warn", b.start, fmt.Sprintf(`Paragraph has %d sentences (limit %s) under "%s": "%s"`, n, jsnum.Format(th.MaxSentencesPerParagraph), heading, snippet(clean)))
			}

			proseRun += wordEquiv(clean)
			if limit := th.VisualBreakWords.Of(L); float64(proseRun) > limit && !breakReported {
				breakReported = true
				add("visual-break", "warn", b.start, fmt.Sprintf(`About %d words of prose with no visual break under "%s" (limit %s); add a list, table, sample or diagram.`, proseRun, heading, jsnum.Format(limit)))
			}

			totalWords += wordEquiv(clean)
			dashes := strings.Count(clean, "—")
			if dashes > 0 && firstDashLine == 0 {
				firstDashLine = cleaned.lineAt(strings.Index(clean, "—"))
			}
			totalDashes += dashes

			// comma chains: one finding per sentence, on the line the sentence starts
			comma := ","
			if L == "zh" {
				comma = "，"
			}
			from := 0
			for _, s := range splitSentences(clean, L) {
				at := -1
				if from <= len(clean) {
					if k := strings.Index(clean[from:], s); k >= 0 {
						at = from + k
					}
				}
				if at >= 0 {
					from = at + len(s)
				}
				commas := strings.Count(stripEnumerations(stripParens(s)), comma)
				if float64(commas) > th.MaxCommasPerSentence {
					add("comma-chain", "warn", cleaned.lineAt(max(0, at)), fmt.Sprintf(`Sentence has %d commas outside parentheses (limit %s) under "%s"; split it: "%s"`, commas, jsnum.Format(th.MaxCommasPerSentence), heading, snippet(s)))
				}
			}

			if colonRe != nil {
				if m := colonRe.FindString(strings.TrimLeftFunc(clean, unicode.IsSpace)); m != "" {
					add("colon-opener", "warn", b.start, fmt.Sprintf(`Paragraph opens with "%s" under "%s"; that is a label on your own output. Cut it and start with the sentence.`, m, heading))
				}
			}

			if transRe != nil {
				tc := len(transRe.FindAllStringIndex(text, -1))
				sentences := max(1, n)
				if tc > 1 && float64(tc)/float64(sentences) > th.MaxTransitionsPerSentence {
					add("transition-density", "note", b.start, fmt.Sprintf(`%d transition words in %d sentence(s) under "%s" (limit %s per sentence); thin them.`, tc, sentences, heading, jsnum.Format(th.MaxTransitionsPerSentence)))
				}
			}
		}

		if b.typ == "list" {
			for k, li := range b.lines {
				if w := visualWidth(stripInline(li)); float64(w) > th.MaxBulletWidth {
					add("bullet-long", "note", b.start+k, fmt.Sprintf(`List item is long (width %d, limit %s) under "%s": "%s"`, w, jsnum.Format(th.MaxBulletWidth), heading, snippet(stripInline(li))))
				}
			}
		}

		if slopRe != nil {
			for _, m := range slopRe.FindAllStringIndex(text, -1) {
				add("ai-slop", "warn", bt.lineAt(m[0]), fmt.Sprintf(`Filler phrase "%s" under "%s"; cut it and go straight to the next sentence.`, text[m[0]:m[1]], heading))
			}
		}

		if b.typ == "para" || b.typ == "list" || b.typ == "quote" {
			if m := tildeRe.FindStringIndex(text); m != nil {
				add("tilde-number", "note", bt.lineAt(m[0]), fmt.Sprintf(`"~number" under "%s"; write "about N" in prose.`, heading))
			}
			ats, ranges := numericRanges(text)
			for k, at := range ats {
				add("numeric-range-hyphen", "note", bt.lineAt(at), fmt.Sprintf(`Numeric range "%s" uses a hyphen under "%s"; use an en-dash "%s" (ignore if it is a date or an id).`, ranges[k], heading, strings.Replace(ranges[k], "-", "–", 1)))
			}
		}
	}

	if totalWords > 0 {
		density := float64(totalDashes) / float64(totalWords) * 100
		if density > th.MaxDashPer100Words {
			line := firstDashLine
			if line == 0 {
				line = 1
			}
			add("dash-density", "note", line, fmt.Sprintf("Em-dash density is %s per 100 words (limit %s); use a period or colon for some of them.", jsnum.ToFixed(density, 2), jsnum.Format(th.MaxDashPer100Words)))
		}
	}

	sort.SliceStable(findings, func(i, j int) bool { return findings[i].Line < findings[j].Line })
	return findings, stats
}

// ── files and parity ──

var mdFileRe = regexp.MustCompile(`\.mdx?$`)

func expand(paths []string) ([]string, error) {
	var out []string
	seen := map[string]bool{}
	addFile := func(p string) {
		if !seen[p] {
			seen[p] = true
			out = append(out, p)
		}
	}
	for _, p := range paths {
		st, err := os.Stat(p)
		if err != nil {
			return nil, fmt.Errorf("not found: %s", p)
		}
		if st.IsDir() {
			entries, err := os.ReadDir(p)
			if err != nil {
				return nil, err
			}
			var names []string
			for _, e := range entries {
				names = append(names, e.Name())
			}
			sort.Strings(names)
			for _, n := range names {
				if mdFileRe.MatchString(n) {
					addFile(filepath.Join(p, n))
				}
			}
		} else {
			addFile(p)
		}
	}
	return out, nil
}

func sibling(file, locale string) string {
	m := postFileRe.FindStringSubmatch(filepath.Base(file))
	if m == nil {
		return ""
	}
	for _, ext := range []string{"md", "mdx"} {
		p := filepath.Join(filepath.Dir(file), m[1]+"."+locale+"."+ext)
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}
	return ""
}

// Report is the grouped result of linting files.
type Report struct {
	Clean      bool
	Total      int
	BySeverity map[string]int
	Files      []string
	Rules      map[string][]Finding
}

// LintPaths lints files (a directory means every .md / .mdx directly in it). Parity is checked once per article that
// is named by its `<slug>.<locale>.md` files, against the other language's file on disk.
func LintPaths(paths []string, cfg Config, lang string) (Report, error) {
	files, err := expand(paths)
	if err != nil {
		return Report{}, err
	}
	rules := map[string][]Finding{}
	push := func(f Finding, file string) {
		f.File = file
		rules[f.Rule] = append(rules[f.Rule], f)
	}
	statsOf := map[string]Stats{}
	for _, file := range files {
		b, err := os.ReadFile(file)
		if err != nil {
			return Report{}, err
		}
		fs, stats := LintText(string(b), file, lang, cfg)
		statsOf[file] = stats
		for _, f := range fs {
			push(f, file)
		}
	}

	if !contains(cfg.DisableRules, "locale-parity") {
		en, zh := cfg.LocalePair.En, cfg.LocalePair.Zh
		done := map[string]bool{}
		for _, file := range files {
			m := postFileRe.FindStringSubmatch(filepath.Base(file))
			if m == nil || (m[2] != en && m[2] != zh) {
				continue
			}
			key := filepath.Join(filepath.Dir(file), m[1])
			if done[key] {
				continue
			}
			done[key] = true
			enFile, zhFile := file, file
			if m[2] != en {
				enFile = sibling(file, en)
			}
			if m[2] != zh {
				zhFile = sibling(file, zh)
			}
			primary := enFile
			if primary == "" {
				primary = file
			}
			if enFile == "" || zhFile == "" {
				if !cfg.LocalePair.RequireBoth {
					continue
				}
				have, missing := zh, en
				if enFile != "" {
					have, missing = en, zh
				}
				push(Finding{Rule: "locale-parity", Line: 1, Severity: "error", Message: fmt.Sprintf(`Only the %s version of "%s" exists; the other language version (%s) is missing.`, have, m[1], missing)}, file)
				continue
			}
			stat := func(f string) Stats {
				if s, ok := statsOf[f]; ok {
					return s
				}
				b, _ := os.ReadFile(f)
				_, s := LintText(string(b), f, lang, cfg)
				return s
			}
			a, z := stat(enFile), stat(zhFile)
			for _, k := range []string{"h2", "h3", "tables", "images", "captions", "quotes"} {
				if a.get(k) != z.get(k) {
					push(Finding{Rule: "locale-parity", Line: 1, Severity: "warn", Message: fmt.Sprintf("Structure differs between versions: %s: %s=%d %s=%d; the two files should mirror each other.", k, en, a.get(k), zh, z.get(k))}, primary)
				}
			}
		}
	}

	r := Report{BySeverity: map[string]int{"error": 0, "warn": 0, "note": 0}, Files: files, Rules: map[string][]Finding{}}
	if r.Files == nil {
		r.Files = []string{}
	}
	for rule, list := range rules {
		sort.SliceStable(list, func(i, j int) bool {
			if list[i].File != list[j].File {
				return list[i].File < list[j].File
			}
			return list[i].Line < list[j].Line
		})
		r.Rules[rule] = list
		for _, f := range list {
			r.BySeverity[f.Severity]++
			r.Total++
		}
	}
	r.Clean = r.Total == 0
	return r, nil
}

// JSON is the report as `JSON.stringify(report, null, 2)` wrote it: keys in their documented order, rules in Rules order.
func (r Report) JSON() string {
	var b strings.Builder
	q := func(s string) string { return jsx.Stringify(s) }
	fmt.Fprintf(&b, "{\n  \"clean\": %t,\n  \"total\": %d,\n  \"bySeverity\": {\n    \"error\": %d,\n    \"warn\": %d,\n    \"note\": %d\n  },\n", r.Clean, r.Total, r.BySeverity["error"], r.BySeverity["warn"], r.BySeverity["note"])
	if len(r.Files) == 0 {
		b.WriteString("  \"files\": [],\n")
	} else {
		b.WriteString("  \"files\": [\n")
		for i, f := range r.Files {
			sep := ","
			if i == len(r.Files)-1 {
				sep = ""
			}
			fmt.Fprintf(&b, "    %s%s\n", q(f), sep)
		}
		b.WriteString("  ],\n")
	}
	var present []string
	for _, rule := range Rules {
		if len(r.Rules[rule]) > 0 {
			present = append(present, rule)
		}
	}
	if len(present) == 0 {
		b.WriteString("  \"rules\": {}\n}")
		return b.String()
	}
	b.WriteString("  \"rules\": {\n")
	for i, rule := range present {
		fmt.Fprintf(&b, "    %s: [\n", q(rule))
		list := r.Rules[rule]
		for k, f := range list {
			sep := ","
			if k == len(list)-1 {
				sep = ""
			}
			fmt.Fprintf(&b, "      {\n        \"file\": %s,\n        \"line\": %d,\n        \"severity\": %s,\n        \"message\": %s\n      }%s\n", q(f.File), f.Line, q(f.Severity), q(f.Message), sep)
		}
		sep := ","
		if i == len(present)-1 {
			sep = ""
		}
		fmt.Fprintf(&b, "    ]%s\n", sep)
	}
	b.WriteString("  }\n}")
	return b.String()
}

// Text is the same list as lines.
func (r Report) Text() string {
	var out []string
	for _, rule := range Rules {
		list := r.Rules[rule]
		if len(list) == 0 {
			continue
		}
		out = append(out, fmt.Sprintf("%s (%d)", rule, len(list)))
		for _, f := range list {
			out = append(out, fmt.Sprintf("  %s:%d [%s] %s", f.File, f.Line, f.Severity, f.Message))
		}
	}
	if r.Clean {
		out = append(out, "clean")
	} else {
		out = append(out, fmt.Sprintf("%d finding(s): %d error, %d warn, %d note", r.Total, r.BySeverity["error"], r.BySeverity["warn"], r.BySeverity["note"]))
	}
	return strings.Join(out, "\n")
}
