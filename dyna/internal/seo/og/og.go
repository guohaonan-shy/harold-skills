// Package og is `dyna seo og`: the OG share card renderer — one JSON of the card's words and the project's brand
// values in, a 1200×630 PNG out.
//
// The `og` skill (skills/seo/og/) ships a few layouts as HTML templates (skills/seo/og/assets/<layout>.html). The
// templates know nothing about any project: every color, the font, the logo and the words are placeholders. This
// package fills them (escaping the text, falling back to neutral defaults for what the project did not give), then
// screenshots the page in a browser (package ui's Chrome). The page fits its own text: every block shrinks from its
// largest size to its smallest until it fits, and whatever still does not fit is reported, never clipped silently.
//
// The deterministic core (Layouts, Normalize, DetectLang, RenderHTML) is pure but for reading the templates and the
// pictures, and is unit-tested.
package og

import (
	"encoding/base64"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/design/jsx"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/frontmatter"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/jsnum"
)

// ColorKeys are the six colors a card takes, in the order they are listed.
var ColorKeys = []string{"bg", "surface", "ink", "muted", "accent", "accentInk"}

// DefaultColors are neutral graphite-on-paper values, used for every color the project did not give.
var DefaultColors = map[string]string{
	"bg":        "#f6f5f2",
	"surface":   "#ffffff",
	"ink":       "#16181d",
	"muted":     "#59606b",
	"accent":    "#2b3440",
	"accentInk": "#ffffff",
}

const cjkFallback = `"PingFang SC","Hiragino Sans GB","Noto Sans CJK SC","Noto Sans SC","Microsoft YaHei"`

// DefaultFont is the font-family list used when the project gave none (and appended after the project's own).
const DefaultFont = `ui-sans-serif,system-ui,-apple-system,"Segoe UI",` + cjkFallback + `,sans-serif`

// titleSize is the title's [largest, smallest] size per layout: the page shrinks the title from the first to the
// second until it fits.
var titleSize = map[string][2]int{"poster": {108, 44}, "split": {72, 34}, "block": {78, 36}}

var (
	colorRe  = regexp.MustCompile(`(?i)^(#[0-9a-f]{3,8}|(rgb|rgba|hsl|hsla|oklch|oklab)\([0-9a-z.,%\s/+-]+\))$`)
	cjkRe    = regexp.MustCompile(`[\x{3040}-\x{30FF}\x{3400}-\x{9FFF}\x{AC00}-\x{D7AF}]`)
	familyRe = regexp.MustCompile(`[;{}<>]`)
	linkRe   = regexp.MustCompile(`^https://[^\s"'<>]+$`)
	slotRe   = regexp.MustCompile(`\{\{(\w+)\}\}`)
)

func isText(v any) bool {
	s, ok := v.(string)
	return ok && strings.TrimSpace(s) != ""
}

func isInteger(v any) bool {
	f, ok := v.(float64)
	return ok && f == float64(int64(f))
}

// Layouts are the layout names: every template in the assets directory, except the shared parts (leading underscore).
func Layouts(assets string) ([]string, error) {
	entries, err := os.ReadDir(assets)
	if err != nil {
		return nil, err
	}
	var out []string
	for _, e := range entries {
		n := e.Name()
		if strings.HasSuffix(n, ".html") && !strings.HasPrefix(n, "_") {
			out = append(out, strings.TrimSuffix(n, ".html"))
		}
	}
	sort.Strings(out)
	return out, nil
}

// DetectLang is the html lang read from the title: a Chinese, Japanese or Korean title gets zh, any other en.
func DetectLang(title string) string {
	if cjkRe.MatchString(title) {
		return "zh"
	}
	return "en"
}

// Params is a validated params file: the parsed object, and the language (given, or read from the title).
type Params struct {
	m    *frontmatter.Map
	Lang string
}

func (p Params) str(k string) string {
	s, _ := p.m.Get(k).(string)
	return s
}

func (p Params) has(k string) bool { return p.m.Has(k) && p.m.Get(k) != nil }

// Layout is the params' layout.
func (p Params) Layout() string { return p.str("layout") }

func get(v any, k string) any {
	m, ok := frontmatter.AsMap(v)
	if !ok {
		return nil
	}
	return m.Get(k)
}

// Normalize checks a params value (parsed JSON) against the layouts; the errors say what is wrong, one per problem.
func Normalize(v any, layouts []string) (Params, []string) {
	var errs []string
	m, ok := frontmatter.AsMap(v)
	if !ok {
		m = frontmatter.NewMap()
	}
	layout, isStr := m.Get("layout").(string)
	known := false
	for _, l := range layouts {
		known = known || (isStr && l == layout)
	}
	if !known {
		got := "undefined"
		if m.Has("layout") {
			got = jsx.Stringify(m.Get("layout"))
		}
		errs = append(errs, fmt.Sprintf("layout 必须是 %s 之一，收到 %s", strings.Join(layouts, " / "), got))
	}
	if !isText(m.Get("title")) {
		errs = append(errs, "缺 title（卡片的大标题）")
	}
	if !isText(m.Get("brand")) {
		errs = append(errs, "缺 brand（没有 logo 时显示的名字）")
	}
	for _, k := range []string{"kicker", "sub", "site", "logo", "image"} {
		if m.Has(k) {
			if _, ok := m.Get(k).(string); !ok {
				errs = append(errs, k+" 必须是字符串")
			}
		}
	}
	if m.Has("stat") {
		st := m.Get("stat")
		if !(frontmatter.Truthy(st) && isText(get(st, "value")) && isText(get(st, "label"))) {
			errs = append(errs, "stat 要同时有 value 和 label")
		}
	}
	if colors, ok := frontmatter.AsMap(m.Get("colors")); ok {
		for _, k := range colors.Keys() {
			c := colors.Get(k)
			if _, known := DefaultColors[k]; !known {
				errs = append(errs, fmt.Sprintf("colors.%s 不认识，可用：%s", k, strings.Join(ColorKeys, " / ")))
			} else if s, isStr := c.(string); !isStr || !colorRe.MatchString(strings.TrimSpace(s)) {
				errs = append(errs, fmt.Sprintf("colors.%s 不是颜色值：%s", k, jsx.Stringify(c)))
			}
		}
	}
	if m.Has("titleSize") {
		ts := m.Get("titleSize")
		mx, mn := get(ts, "max"), get(ts, "min")
		ok := isInteger(mx) && isInteger(mn)
		if ok {
			a, b := mx.(float64), mn.(float64)
			ok = b >= 20 && a <= 160 && b <= a
		}
		if !ok {
			errs = append(errs, "titleSize 要 { max, min } 两个整数，20 <= min <= max <= 160")
		}
	}
	font := m.Get("font")
	if fm, ok := frontmatter.AsMap(font); ok {
		if fm.Has("family") {
			f, _ := fm.Get("family").(string)
			if !(isText(fm.Get("family")) && !familyRe.MatchString(f)) {
				errs = append(errs, "font.family 不是一个 font-family 列表")
			}
		}
		if fm.Has("link") {
			l, isStr := fm.Get("link").(string)
			if !(isStr && linkRe.MatchString(l)) {
				errs = append(errs, "font.link 必须是 https 地址")
			}
		}
	}
	if len(errs) > 0 {
		return Params{}, errs
	}
	lang := DetectLang(m.Get("title").(string))
	if isText(m.Get("lang")) {
		lang = strings.TrimSpace(m.Get("lang").(string))
	}
	return Params{m: m, Lang: lang}, nil
}

var escaper = strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", `"`, "&quot;")

func esc(s string) string { return escaper.Replace(s) }

var mime = map[string]string{".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml"}

func dataURI(file string) (string, error) {
	m := mime[strings.ToLower(filepath.Ext(file))]
	if m == "" {
		return "", fmt.Errorf("不认识的图片格式：%s（可用 .png .jpg .jpeg .webp .svg）", file)
	}
	b, err := os.ReadFile(file)
	if err != nil {
		return "", fmt.Errorf("图片不存在：%s", file)
	}
	return "data:" + m + ";base64," + base64.StdEncoding.EncodeToString(b), nil
}

const rings = `<svg viewBox="0 0 400 518" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><g fill="none" stroke="var(--accent)">
<circle cx="300" cy="140" r="250" stroke-width="2" opacity="0.18"/><circle cx="300" cy="140" r="190" stroke-width="2" opacity="0.28"/>
<circle cx="300" cy="140" r="130" stroke-width="2" opacity="0.4"/></g><circle cx="300" cy="140" r="64" fill="var(--accent)"/>
<rect x="48" y="400" width="110" height="12" fill="var(--accent)"/><rect x="48" y="428" width="70" height="12" fill="var(--accent)" opacity="0.4"/></svg>`

func resolvePath(baseDir, p string) string {
	if filepath.IsAbs(p) {
		return p
	}
	return filepath.Join(baseDir, p)
}

func visualFor(p Params, baseDir string) (string, error) {
	if img := p.str("image"); img != "" {
		uri, err := dataURI(resolvePath(baseDir, img))
		if err != nil {
			return "", err
		}
		return `<div class="visual"><img src="` + uri + `" alt=""></div>`, nil
	}
	if p.has("stat") {
		st := p.m.Get("stat")
		return `<div class="visual stat"><div class="value" data-fit="132:56">` + esc(get(st, "value").(string)) + `</div><div class="rulebar"></div>` +
			`<div class="labelbox"><div class="label" data-fit="26:18">` + esc(get(st, "label").(string)) + `</div></div></div>`, nil
	}
	return `<div class="visual rings">` + rings + `</div>`, nil
}

// Card is one filled layout: the page, which values fell back to neutral defaults (any of colors, font, logo), and
// the layout.
type Card struct {
	HTML     string
	Defaults []string
	Layout   string
}

// RenderHTML fills one layout. v is the params (parsed JSON); baseDir is where relative logo / image paths start.
func RenderHTML(v any, baseDir, assets string) (Card, error) {
	layouts, err := Layouts(assets)
	if err != nil {
		return Card{}, err
	}
	p, errs := Normalize(v, layouts)
	if len(errs) > 0 {
		return Card{}, errors.New(strings.Join(errs, "\n"))
	}
	colors := map[string]string{}
	for k, c := range DefaultColors {
		colors[k] = c
	}
	given, _ := frontmatter.AsMap(p.m.Get("colors"))
	if given != nil {
		for _, k := range given.Keys() {
			colors[k] = strings.TrimSpace(given.Get(k).(string))
		}
	}
	defaults := []string{}
	for _, k := range ColorKeys {
		if given == nil || !given.Has(k) {
			defaults = append(defaults, "colors")
			break
		}
	}
	family, _ := get(p.m.Get("font"), "family").(string)
	if family == "" {
		defaults = append(defaults, "font")
	}
	logo := p.str("logo")
	if logo == "" {
		defaults = append(defaults, "logo")
	}
	fam := DefaultFont
	if family != "" {
		fam = family + "," + DefaultFont
	}
	vars := "--bg:" + colors["bg"] + ";--surface:" + colors["surface"] + ";--ink:" + colors["ink"] + ";--muted:" + colors["muted"] + ";" +
		"--accent:" + colors["accent"] + ";--accent-ink:" + colors["accentInk"] + ";--font:" + fam + ";" +
		"--accent-soft:color-mix(in srgb,var(--accent) 14%,var(--bg));--line:color-mix(in srgb,var(--ink) 16%,transparent);"
	brand := p.str("brand")
	brandHTML := `<div class="brand"><span class="word" data-fit="28:18">` + esc(brand) + `</span></div>`
	if logo != "" {
		uri, err := dataURI(resolvePath(baseDir, logo))
		if err != nil {
			return Card{}, err
		}
		brandHTML = `<div class="brand"><img src="` + uri + `" alt="` + esc(brand) + `"></div>`
	}
	css, err := os.ReadFile(filepath.Join(assets, "_shared.css"))
	if err != nil {
		return Card{}, err
	}
	js, err := os.ReadFile(filepath.Join(assets, "_shared.js"))
	if err != nil {
		return Card{}, err
	}
	layout := p.Layout()
	fit := titleSize[layout]
	if fit == [2]int{} {
		fit = [2]int{96, 40}
	}
	titleFit := fmt.Sprintf("%d:%d", fit[0], fit[1])
	if p.has("titleSize") {
		ts := p.m.Get("titleSize")
		titleFit = jsnum.Format(get(ts, "max").(float64)) + ":" + jsnum.Format(get(ts, "min").(float64))
	}
	fontLink := ""
	if l, _ := get(p.m.Get("font"), "link").(string); l != "" {
		fontLink = `<link rel="stylesheet" href="` + esc(l) + `">`
	}
	visual := ""
	if layout == "split" {
		if visual, err = visualFor(p, baseDir); err != nil {
			return Card{}, err
		}
	}
	fill := map[string]string{
		"lang": esc(p.Lang), "fontLink": fontLink, "vars": vars, "css": string(css), "js": string(js),
		"title": esc(p.str("title")), "titleFit": titleFit, "kicker": esc(p.str("kicker")), "sub": esc(p.str("sub")),
		"site": esc(p.str("site")), "brandHtml": brandHTML, "visual": visual,
	}
	tpl, err := os.ReadFile(filepath.Join(assets, layout+".html"))
	if err != nil {
		return Card{}, err
	}
	html := slotRe.ReplaceAllStringFunc(string(tpl), func(m string) string {
		if v, ok := fill[slotRe.FindStringSubmatch(m)[1]]; ok {
			return v
		}
		return m
	})
	return Card{HTML: html, Defaults: defaults, Layout: layout}, nil
}
