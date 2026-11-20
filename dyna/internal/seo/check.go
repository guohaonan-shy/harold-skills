package seo

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"unicode"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/jsstr"
)

// Thresholds are the width limits of titles and descriptions, in width units (a CJK glyph counts 2). Bing recommends
// about 50-60 (title) and 150-160 (description) raw characters and truncates titles near 70; Google has no length
// rule. The floors sit a little under Bing's.
type Thresholds struct {
	TitleMin, TitleMax, DescMin, DescMax int
}

// DefaultThresholds are the limits used when the command line gives none.
var DefaultThresholds = Thresholds{TitleMin: 48, TitleMax: 70, DescMin: 145, DescMax: 160}

// Bing counts raw characters: a full-width CJK page can clear the width floor and still trip Bing's raw-character
// floor, so that gets an [info] (a known false positive), never a warning.
const (
	bingTitleCharFloor = 50
	bingDescCharFloor  = 150
)

// JSON-LD types that no longer produce Google rich results.
var deadForGoogle = map[string]string{
	"FAQPage": "FAQ rich results are gone for Google; harmless, still fine for a visible FAQ Bing and answer engines read.",
	"HowTo":   "HowTo rich results were removed; inert for Google.",
}

// isCJKRune is the old script's CJK test: ranges 3000-303F, 3040-30FF, 3400-4DBF, 4E00-9FFF, 8C48-FAFF and FF00-FFEF.
// The fifth range is meant to be the compatibility ideographs but starts at U+8C48 in the script (a normalised
// character), so it also takes Hangul and most of what lies between; kept as it is so the same page gives the same
// report.
func isCJKRune(r rune) bool {
	switch {
	case r >= 0x3000 && r <= 0x303f, r >= 0x3040 && r <= 0x30ff, r >= 0x3400 && r <= 0x4dbf,
		r >= 0x4e00 && r <= 0x9fff, r >= 0x8c48 && r <= 0xfaff, r >= 0xff00 && r <= 0xffef:
		return true
	}
	return false
}

// VisualWidth is a string's width: CJK and full-width glyphs count double.
func VisualWidth(s string) int {
	w := 0
	for _, r := range s {
		if isCJKRune(r) {
			w += 2
		} else {
			w++
		}
	}
	return w
}

func hasCJK(s string) bool {
	for _, r := range s {
		if isCJKRune(r) {
			return true
		}
	}
	return false
}

func runeLen(s string) int { return len([]rune(s)) }

var entityReps = []struct {
	re *regexp.Regexp
	to string
}{
	{regexp.MustCompile(`&amp;`), "&"},
	{regexp.MustCompile(`&lt;`), "<"},
	{regexp.MustCompile(`&gt;`), ">"},
	{regexp.MustCompile(`&quot;`), `"`},
	{regexp.MustCompile(`&#39;`), "'"},
}

func decodeEntities(s string) string {
	for _, r := range entityReps {
		s = r.re.ReplaceAllLiteralString(s, r.to)
	}
	return s
}

var (
	titleRe       = regexp.MustCompile(`(?is)<title>(.*?)</title>`)
	descRe        = regexp.MustCompile(`(?is)<meta` + ws + `+name="description"` + ws + `+content="(.*?)"`)
	langRe        = regexp.MustCompile(`(?i)<html[^>]*` + ws + `lang="([^"]*)"`)
	robotsRe      = regexp.MustCompile(`(?i)<meta` + ws + `+name="robots"` + ws + `+content="([^"]*)"`)
	canonicalRe   = regexp.MustCompile(`(?i)<link` + ws + `+rel="canonical"` + ws + `+href="([^"]*)"`)
	hreflangRe    = regexp.MustCompile(`(?i)<link` + ws + `+rel="alternate"` + ws + `+hreflang="([^"]*)"` + ws + `+href="([^"]*)"`)
	bodyRe        = regexp.MustCompile(`(?is)<body[^>]*>(.*?)</body>`)
	h1Tag         = regexp.MustCompile(`(?i)<h1[` + wsIn + `>]`)
	imgTag        = regexp.MustCompile(`(?i)<img\b[^>]*>`)
	altAttr       = regexp.MustCompile(`(?i)` + ws + `alt=`)
	ldRe          = regexp.MustCompile(`(?is)<script type="application/ld\+json">(.*?)</script>`)
	noindexRe     = regexp.MustCompile(`(?i)noindex`)
	trailingSlash = regexp.MustCompile(`/$`)
)

// hreflangs is the `hreflang → href` pairs of a page, in the order they were written (a repeated language keeps its place).
type hreflangs struct {
	keys []string
	vals map[string]string
}

func (h *hreflangs) set(k, v string) {
	if _, ok := h.vals[k]; !ok {
		h.keys = append(h.keys, k)
	}
	h.vals[k] = v
}

func (h *hreflangs) hasValue(v string) bool {
	for _, x := range h.vals {
		if x == v {
			return true
		}
	}
	return false
}

// Page is what the check reads out of one built page.
type Page struct {
	title, description, htmlLang *string
	noindex                      bool
	canonicals                   []string
	hreflangs                    *hreflangs
	hasSnapshot                  bool
	h1Count, imgsNoAlt           int
	types                        []string
	jsonLdMalformed              bool
}

func pick(re *regexp.Regexp, html string) *string {
	m := re.FindStringSubmatch(html)
	if m == nil {
		return nil
	}
	s := decodeEntities(jsstr.Trim(m[1]))
	return &s
}

func str(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

// ParsePage reads a built page. The HTML is machine-generated, so a regular expression is safe.
func ParsePage(html string) Page {
	p := Page{
		title: pick(titleRe, html), description: pick(descRe, html), htmlLang: pick(langRe, html),
		hreflangs: &hreflangs{vals: map[string]string{}}, canonicals: []string{},
	}
	robots := pick(robotsRe, html)
	p.noindex = noindexRe.MatchString(str(robots))
	for _, m := range canonicalRe.FindAllStringSubmatch(html, -1) {
		p.canonicals = append(p.canonicals, m[1])
	}
	for _, m := range hreflangRe.FindAllStringSubmatch(html, -1) {
		p.hreflangs.set(m[1], m[2])
	}
	body := ""
	if m := bodyRe.FindStringSubmatch(html); m != nil {
		body = m[1]
	}
	p.hasSnapshot = len(jsstr.Trim(body)) > 0
	p.h1Count = len(h1Tag.FindAllString(body, -1))
	for _, t := range imgTag.FindAllString(body, -1) {
		if !altAttr.MatchString(t) {
			p.imgsNoAlt++
		}
	}
	seen := map[string]bool{}
	for _, m := range ldRe.FindAllStringSubmatch(html, -1) {
		v, err := ParseJSON([]byte(m[1]))
		if err != nil {
			p.jsonLdMalformed = true
			continue
		}
		for _, t := range ldTypes(v) {
			if !seen[t] {
				seen[t] = true
				p.types = append(p.types, t)
			}
		}
	}
	return p
}

// ldTypes are the string `@type`s of a JSON-LD block, `@graph` flattened. A block the old script could not walk (a
// null, a `@graph` that is neither a list nor a string) gave no type.
func ldTypes(v any) []string {
	var nodes []any
	switch t := v.(type) {
	case []any:
		nodes = t
	case nil:
		return nil
	default:
		g := get(v, "@graph")
		switch {
		case !truthy(g):
			nodes = []any{v}
		default:
			arr, ok := g.([]any)
			if !ok {
				return nil // a string reads as characters with no @type; an object cannot be walked
			}
			nodes = arr
		}
	}
	var out []string
	for _, n := range nodes {
		t := get(n, "@type")
		if arr, ok := t.([]any); ok {
			for _, x := range arr {
				if s, ok := x.(string); ok {
					out = append(out, s)
				}
			}
		} else if s, ok := t.(string); ok && s != "" {
			out = append(out, s)
		}
	}
	return out
}

// Route is a built page and where it is served.
type Route struct {
	Path   string
	File   string
	Parsed Page
}

// findIndexHTML is every index.html under dir.
func findIndexHTML(dir, root string, out *[]Route) error {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return err
	}
	for _, e := range entries {
		full := filepath.Join(dir, e.Name())
		st, err := os.Stat(full)
		if err != nil {
			return err
		}
		if st.IsDir() {
			if err := findIndexHTML(full, root, out); err != nil {
				return err
			}
		} else if e.Name() == "index.html" {
			rel, _ := filepath.Rel(root, dir)
			route := "/"
			if rel != "." {
				route = "/" + filepath.ToSlash(rel)
			}
			*out = append(*out, Route{Path: route, File: full})
		}
	}
	return nil
}

// FindingLine is one thing the check found on a page.
type FindingLine struct{ Sev, Platform, Msg string }

// LintPage lints one page.
func LintPage(p Page, byCanonical map[string]*Page, t Thresholds) []FindingLine {
	var f []FindingLine
	add := func(sev, platform, msg string) { f = append(f, FindingLine{sev, platform, msg}) }
	isCJK := (p.htmlLang != nil && cjkLang(*p.htmlLang)) || hasCJK(str(p.title)) || hasCJK(str(p.description))

	// noindex pages never appear in SERP: skip title, description and the SERP-facing checks, but still validate structure
	if p.noindex {
		add("notice", "Both", "noindex — SERP checks (title/description length, H1) skipped.")
		if len(p.canonicals) > 1 {
			add("error", "Both", fmt.Sprintf("Multiple rel=canonical (%d).", len(p.canonicals)))
		}
		if p.jsonLdMalformed {
			add("error", "Both", "Malformed JSON-LD (failed to parse).")
		}
		return f
	}

	// Title
	if str(p.title) == "" {
		add("error", "Both", "Missing <title>.")
	} else {
		w, c := VisualWidth(*p.title), runeLen(*p.title)
		if w < t.TitleMin {
			add("warn", "Bing", fmt.Sprintf("Title thin (width %d < %d). Google ignores length.", w, t.TitleMin))
		} else if w > t.TitleMax {
			add("warn", "Both", fmt.Sprintf("Title wide (width %d > %d); will truncate in SERP.", w, t.TitleMax))
		}
		if isCJK && c < bingTitleCharFloor && w >= t.TitleMin {
			add("info", "Bing", fmt.Sprintf(`Bing may flag "title too short" (raw chars %d < ~%d); pixel width %d is fine — CJK false positive, safe to ignore.`, c, bingTitleCharFloor, w))
		}
	}

	// Description
	if str(p.description) == "" {
		add("error", "Bing", "Missing meta description. (Google tolerates it; Bing flags it.)")
	} else {
		w, c := VisualWidth(*p.description), runeLen(*p.description)
		if w < t.DescMin {
			add("warn", "Bing", fmt.Sprintf("Description thin (width %d < %d). Google rewrites snippets, ignores length.", w, t.DescMin))
		} else if w > t.DescMax {
			// An over-long description is an error, not a warning: CI usually runs without --strict, so a warning would never be enforced.
			add("error", "Both", fmt.Sprintf("Description wide (width %d > %d); will truncate.", w, t.DescMax))
		}
		if isCJK && c < bingDescCharFloor && w >= t.DescMin {
			add("info", "Bing", fmt.Sprintf(`Bing may flag "description too short" (raw chars %d < ~%d); pixel width %d is fine — CJK false positive, safe to ignore.`, c, bingDescCharFloor, w))
		}
	}

	// Canonical
	if len(p.canonicals) == 0 {
		add("warn", "Both", "No rel=canonical.")
	} else if len(p.canonicals) > 1 {
		add("error", "Both", fmt.Sprintf("Multiple rel=canonical (%d) — Google ignores all of them.", len(p.canonicals)))
	}

	// html lang
	if str(p.htmlLang) == "" {
		add("notice", "Bing", "Missing <html lang>.")
	}

	// hreflang reciprocity, self-reference and x-default
	self, hasSelf := "", len(p.canonicals) > 0 && p.canonicals[0] != ""
	if len(p.canonicals) > 0 {
		self = p.canonicals[0]
	}
	var alts []string
	for _, k := range p.hreflangs.keys {
		if k != "x-default" {
			alts = append(alts, k)
		}
	}
	if len(alts) > 0 {
		if hasSelf && !p.hreflangs.hasValue(self) {
			add("notice", "Google", "hreflang set has no self-referential entry.")
		}
		if p.hreflangs.vals["x-default"] == "" {
			add("notice", "Google", "hreflang set has no x-default fallback.")
		}
		for _, lang := range alts {
			url := p.hreflangs.vals[lang]
			target := byCanonical[trailingSlash.ReplaceAllString(url, "")]
			if target == nil {
				add("warn", "Google", fmt.Sprintf(`hreflang "%s" → %s has no matching page in dist.`, lang, url))
			} else if hasSelf && !target.hreflangs.hasValue(self) {
				add("warn", "Google", fmt.Sprintf(`hreflang "%s" → %s is not reciprocal (target doesn't link back).`, lang, url))
			}
		}
	}

	// H1 and alt text, only where a static body snapshot exists
	if p.hasSnapshot {
		if p.h1Count == 0 {
			add("notice", "Bing", "No <h1> in page body.")
		} else if p.h1Count > 1 {
			add("warn", "Bing", fmt.Sprintf("Multiple <h1> (%d) in page body.", p.h1Count))
		}
		if p.imgsNoAlt > 0 {
			add("warn", "Both", fmt.Sprintf("%d <img> without alt in page body.", p.imgsNoAlt))
		}
	}

	// JSON-LD
	if p.jsonLdMalformed {
		add("error", "Both", "Malformed JSON-LD (failed to parse).")
	}
	for _, ty := range p.types {
		if why, ok := deadForGoogle[ty]; ok {
			add("info", "Google", fmt.Sprintf("JSON-LD %s: %s", ty, why))
		}
	}
	return f
}

// cjkLang is `/^(zh|ja|ko)/i`.
func cjkLang(lang string) bool {
	l := strings.ToLower(lang)
	return strings.HasPrefix(l, "zh") || strings.HasPrefix(l, "ja") || strings.HasPrefix(l, "ko")
}

// RouteReport is one route with what was found on it.
type RouteReport struct {
	Route    string
	Findings []FindingLine
}

// CheckResult is a whole check: every page, and the report of the ones the filter let through.
type CheckResult struct {
	Pages    []Route
	Reported []Route
	Report   []RouteReport
}

// Check lints every route under distRoot. The filter narrows which routes are reported, not the scan: hreflang
// reciprocity still checks against the full site.
func Check(distRoot, filter string, t Thresholds) (*CheckResult, error) {
	var pages []Route
	if err := findIndexHTML(distRoot, distRoot, &pages); err != nil {
		return nil, err
	}
	for i := range pages {
		b, err := os.ReadFile(pages[i].File)
		if err != nil {
			return nil, err
		}
		pages[i].Parsed = ParsePage(string(b))
	}
	sort.SliceStable(pages, func(i, j int) bool { return localeLess(pages[i].Path, pages[j].Path) })
	byCanonical := map[string]*Page{}
	for i := range pages {
		if cs := pages[i].Parsed.canonicals; len(cs) > 0 {
			byCanonical[trailingSlash.ReplaceAllString(cs[0], "")] = &pages[i].Parsed
		}
	}
	res := &CheckResult{Pages: pages, Report: []RouteReport{}}
	for _, pg := range pages {
		if filter != "" && !strings.Contains(pg.Path, filter) {
			continue
		}
		res.Reported = append(res.Reported, pg)
		res.Report = append(res.Report, RouteReport{Route: pg.Path, Findings: LintPage(pg.Parsed, byCanonical, t)})
	}
	return res, nil
}

var punctuationOrder = "_-,;:!?.'\"()[]{}@*/\\&#%`^+<=>|~$"

// collationKey is the primary weight of a character in the order ICU's root collation sorts the ASCII a URL path is
// made of: white space, punctuation, digits, letters (case folded); anything else after them by code point.
func collationKey(r rune) int {
	switch {
	case unicode.IsSpace(r):
		return 0
	case r < 128 && strings.ContainsRune(punctuationOrder, r):
		return 1 + strings.IndexRune(punctuationOrder, r)
	case r >= '0' && r <= '9':
		return 100 + int(r-'0')
	case r < 128 && unicode.IsLetter(r):
		return 200 + int(unicode.ToLower(r)-'a')
	case r < 128:
		return 50
	}
	return 1000 + int(r)
}

// localeLess is `a.localeCompare(b) < 0` for the paths of a site: letters before capitals only when everything else
// is equal, digits before letters, `_` and `-` before `/`. Non-ASCII routes compare by code point.
func localeLess(a, b string) bool {
	ra, rb := []rune(a), []rune(b)
	for i := 0; i < len(ra) && i < len(rb); i++ {
		ka, kb := collationKey(ra[i]), collationKey(rb[i])
		if ka != kb {
			return ka < kb
		}
	}
	if len(ra) != len(rb) {
		return len(ra) < len(rb)
	}
	for i := range ra {
		if ra[i] != rb[i] {
			return unicode.IsLower(ra[i]) && !unicode.IsLower(rb[i])
		}
	}
	return false
}

var sevTag = map[string]string{"error": "ERROR", "warn": "WARN ", "notice": "NOTE ", "info": "INFO "}

// Render is the human-readable report and the exit code of a check.
func Render(distRoot string, r *CheckResult, strict bool, filter string) (string, int) {
	var lines []string
	if filter != "" {
		lines = append(lines, fmt.Sprintf(`seo-check · %d routes (filter "%s" of %d) · %s`, len(r.Reported), filter, len(r.Pages), distRoot), "")
	} else {
		lines = append(lines, fmt.Sprintf("seo-check · %d routes · %s", len(r.Pages), distRoot), "")
	}
	n := map[string]int{}
	withIssues := 0
	for _, rr := range r.Report {
		if len(rr.Findings) == 0 {
			continue
		}
		withIssues++
		lines = append(lines, "  "+rr.Route)
		for _, f := range rr.Findings {
			n[f.Sev]++
			lines = append(lines, fmt.Sprintf("    [%s] [%s] %s", sevTag[f.Sev], f.Platform, f.Msg))
		}
		lines = append(lines, "")
	}
	lines = append(lines, fmt.Sprintf("Summary: %d error · %d warn · %d notice · %d info  (across %d/%d routes)", n["error"], n["warn"], n["notice"], n["info"], withIssues, len(r.Pages)))
	if n["error"] == 0 && n["warn"] == 0 {
		lines = append(lines, "✓ clean (errors + warnings)")
	}
	code := 0
	if n["error"] > 0 || (strict && n["warn"] > 0) {
		code = 1
	}
	return strings.Join(lines, "\n"), code
}
