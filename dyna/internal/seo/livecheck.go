package seo

import (
	"context"
	"errors"
	"fmt"
	"io"
	"math"
	"net"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/jsstr"
)

// LiveItems are the four things the post-deploy check looks at on each page, in the order they are reported.
var LiveItems = []string{"status", "noindex", "meta", "sitemap"}

var (
	hexEntity = regexp.MustCompile(`(?i)&#x([0-9a-f]+);`)
	decEntity = regexp.MustCompile(`&#(\d+);`)
	namedEnt  = regexp.MustCompile(`(?i)&([a-z]+);`)
	namedMap  = map[string]string{"amp": "&", "lt": "<", "gt": ">", "quot": `"`, "apos": "'", "nbsp": " "}
)

func codePoint(n uint64, whole string) string {
	if n > 0x10ffff {
		return whole
	}
	return string(rune(n))
}

// decodeHTML decodes the entities a title or a description is written with: hexadecimal and decimal references first,
// then the named ones.
func decodeHTML(s string) string {
	s = hexEntity.ReplaceAllStringFunc(s, func(m string) string {
		n, err := strconv.ParseUint(hexEntity.FindStringSubmatch(m)[1], 16, 64)
		if err != nil {
			return m
		}
		return codePoint(n, m)
	})
	s = decEntity.ReplaceAllStringFunc(s, func(m string) string {
		n, err := strconv.ParseUint(decEntity.FindStringSubmatch(m)[1], 10, 64)
		if err != nil {
			return m
		}
		return codePoint(n, m)
	})
	return namedEnt.ReplaceAllStringFunc(s, func(m string) string {
		if r, ok := namedMap[strings.ToLower(namedEnt.FindStringSubmatch(m)[1])]; ok {
			return r
		}
		return m
	})
}

func tidy(s string) string { return jsstr.Trim(jsstr.Collapse(decodeHTML(s))) }

var (
	metaTag    = regexp.MustCompile(`(?i)<meta\b([^>]*)>`)
	attrRe     = regexp.MustCompile(`([a-zA-Z_:][-\w:.]*)` + ws + `*=` + ws + `*(?:"([^"]*)"|'([^']*)')`)
	liveTitle  = regexp.MustCompile(`(?is)<title[^>]*>(.*?)</title>`)
	robotsMeta = regexp.MustCompile(`(?i)^(?:robots|googlebot|bingbot)$`)
	descMeta   = regexp.MustCompile(`(?i)^description$`)
)

// attributes are the attributes of one tag's text, names lower-cased; either quote style, any order.
func attributes(tag string) map[string]string {
	out := map[string]string{}
	for _, m := range attrRe.FindAllStringSubmatchIndex(tag, -1) {
		name := strings.ToLower(tag[m[2]:m[3]])
		if m[4] >= 0 {
			out[name] = tag[m[4]:m[5]]
		} else {
			out[name] = tag[m[6]:m[7]]
		}
	}
	return out
}

func asciiLower(s string) string {
	b := []byte(s)
	for i, c := range b {
		if c >= 'A' && c <= 'Z' {
			b[i] = c + 32
		}
	}
	return string(b)
}

func isRobotsSep(r rune) bool { return r == ',' || r == ':' || jsstr.IsSpace(r) }

// forbidsIndex is noindex or none, anywhere in a robots-style value (`noindex, follow`, `googlebot: noindex`, `none`).
func forbidsIndex(value string) bool {
	v := asciiLower(value)
	for i := 0; i < len(v); i++ {
		if i > 0 {
			prev := []rune(v[:i])
			if !isRobotsSep(prev[len(prev)-1]) {
				continue
			}
		}
		for _, word := range []string{"noindex", "none"} {
			if !strings.HasPrefix(v[i:], word) {
				continue
			}
			rest := v[i+len(word):]
			if rest == "" {
				return true
			}
			r := []rune(rest)[0]
			if r == ',' || jsstr.IsSpace(r) {
				return true
			}
		}
	}
	return false
}

// PageFacts is what a page says about itself.
type PageFacts struct {
	Title       *string `json:"title"`
	Description *string `json:"description"`
	Noindex     bool    `json:"noindex"`
}

// Facts reads a page's title, description and robots directive, whatever the attribute order and quote style.
func Facts(html string) PageFacts {
	var metas []map[string]string
	for _, m := range metaTag.FindAllStringSubmatch(html, -1) {
		metas = append(metas, attributes(m[1]))
	}
	named := func(re *regexp.Regexp) []map[string]string {
		var out []map[string]string
		for _, a := range metas {
			if re.MatchString(a["name"]) {
				out = append(out, a)
			}
		}
		return out
	}
	f := PageFacts{}
	if m := liveTitle.FindStringSubmatch(html); m != nil {
		t := tidy(m[1])
		f.Title = &t
	}
	if d := named(descMeta); len(d) > 0 {
		if c, ok := d[0]["content"]; ok {
			t := tidy(c)
			f.Description = &t
		}
	}
	for _, a := range named(robotsMeta) {
		if forbidsIndex(a["content"]) {
			f.Noindex = true
		}
	}
	return f
}

// LiveEntry is one URL of the post-deploy list and the word it is meant to rank for.
type LiveEntry struct {
	URL     string  `json:"url"`
	Keyword *string `json:"keyword"`
}

var urlLineRe = regexp.MustCompile(`^` + ws + `*(?:[-*]` + ws + `+)?(?:\[[ xX]\]` + ws + `*)?[<` + "`" + `]?(https?://[^` + wsIn + `>` + "`" + `]+)[>` + "`" + `]?` + ws + `*(?:目标词` + ws + `*[：:]` + ws + `*(.*?))?` + ws + `*$`)

// ParseURLs reads one URL and its 目标词 per line (a bullet, a checkbox or <> around the URL is fine); a line without
// a URL is skipped.
func ParseURLs(text string) []LiveEntry {
	out := []LiveEntry{}
	for _, line := range strings.Split(text, "\n") {
		m := urlLineRe.FindStringSubmatch(line)
		if m == nil {
			continue
		}
		e := LiveEntry{URL: m[1]}
		if k := jsstr.Trim(m[2]); k != "" {
			e.Keyword = &k
		}
		out = append(out, e)
	}
	return out
}

func parseURL(raw string) (*url.URL, error) {
	u, err := url.Parse(raw)
	if err != nil || u.Scheme == "" || u.Host == "" {
		return nil, fmt.Errorf("Invalid URL: %s", raw)
	}
	return u, nil
}

// originOf is `new URL(raw).origin`.
func originOf(u *url.URL) string {
	scheme := strings.ToLower(u.Scheme)
	host := strings.ToLower(u.Hostname())
	if strings.Contains(host, ":") {
		host = "[" + host + "]"
	}
	port := u.Port()
	if (scheme == "http" && port == "80") || (scheme == "https" && port == "443") {
		port = ""
	}
	if port != "" {
		return scheme + "://" + host + ":" + port
	}
	return scheme + "://" + host
}

// DistFile is the build's file for a live URL: `<path>/index.html`, the file itself, or `<path>.html`.
func DistFile(distRoot, rawURL string) (string, error) {
	u, err := parseURL(rawURL)
	if err != nil {
		return "", err
	}
	p := u.Path
	if p != "" {
		p = path.Clean(p)
	}
	p = trailingSlashes.ReplaceAllString(p, "")
	root, err := filepath.Abs(distRoot)
	if err != nil {
		return "", err
	}
	candidates := []string{filepath.Join(root, p, "index.html"), filepath.Join(root, p), filepath.Join(root, p) + ".html"}
	for _, f := range candidates {
		if !strings.HasPrefix(f, root) {
			continue
		}
		if st, err := os.Stat(f); err == nil && st.Mode().IsRegular() {
			return f, nil
		}
	}
	tried := make([]string, len(candidates))
	for i, c := range candidates {
		tried[i] = strings.TrimPrefix(c, root)
	}
	return "", fmt.Errorf("产物目录 %s 里找不到 %s 对应的页面（试过 %s）：网址写错，或这次的构建产物不对", distRoot, rawURL, strings.Join(tried, "、"))
}

// Response is what one fetch of a live page gave: its status and X-Robots-Tag header and body, or why it failed.
type Response struct {
	Status  int
	XRobots string
	Body    string
	Err     string
}

// Fetch gets one URL, following redirects.
type Fetch func(rawURL string) Response

// HTTPFetch is the real fetch: GET with redirects followed (up to 20) and a 20 second limit.
func HTTPFetch() Fetch {
	client := &http.Client{CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if len(via) >= 20 {
			return errors.New("too many redirects")
		}
		return nil
	}}
	return func(rawURL string) Response {
		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		defer cancel()
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
		if err != nil {
			return Response{Err: err.Error()}
		}
		req.Header.Set("User-Agent", "idea-loop-seo-live-check")
		req.Header.Set("Cache-Control", "no-cache")
		res, err := client.Do(req)
		if err != nil {
			return Response{Err: fetchError(err)}
		}
		defer res.Body.Close()
		body, err := io.ReadAll(res.Body)
		if err != nil {
			return Response{Err: fetchError(err)}
		}
		return Response{Status: res.StatusCode, XRobots: res.Header.Get("X-Robots-Tag"), Body: string(body)}
	}
}

// fetchError says why a fetch failed the way Node's fetch names it: the system error's code when there is one.
func fetchError(err error) string {
	var dns *net.DNSError
	switch {
	case errors.Is(err, syscall.ECONNREFUSED):
		return "ECONNREFUSED"
	case errors.Is(err, syscall.ECONNRESET):
		return "ECONNRESET"
	case errors.As(err, &dns):
		return "ENOTFOUND"
	case errors.Is(err, context.DeadlineExceeded):
		return "The operation was aborted due to timeout"
	}
	return err.Error()
}

func sameURL(a, b string) bool {
	x, err1 := parseURL(a)
	y, err2 := parseURL(b)
	if err1 != nil || err2 != nil {
		return false
	}
	return strings.EqualFold(originOf(x), originOf(y)) &&
		trailingSlashes.ReplaceAllString(x.EscapedPath(), "") == trailingSlashes.ReplaceAllString(y.EscapedPath(), "") &&
		x.RawQuery == y.RawQuery
}

var locRe = regexp.MustCompile(`(?i)<loc>` + ws + `*([^<]+?)` + ws + `*</loc>`)

func locs(xml string) []string {
	var out []string
	for _, m := range locRe.FindAllStringSubmatch(xml, -1) {
		out = append(out, decodeHTML(m[1]))
	}
	return out
}

var sitemapIndexRe = regexp.MustCompile(`(?i)<sitemapindex`)

type sitemap struct {
	urls []string
	err  string
}

// sitemapOf is every page URL the origin's sitemap.xml lists (the child sitemaps of an index included), or why it could not be read.
func sitemapOf(origin string, fetch Fetch) sitemap {
	first := fetch(origin + "/sitemap.xml")
	if first.Err != "" {
		return sitemap{err: fmt.Sprintf("%s/sitemap.xml 连不上：%s", origin, first.Err)}
	}
	if first.Status != 200 {
		return sitemap{err: fmt.Sprintf("%s/sitemap.xml 返回 %d", origin, first.Status)}
	}
	if !sitemapIndexRe.MatchString(first.Body) {
		return sitemap{urls: locs(first.Body)}
	}
	var urls []string
	children := locs(first.Body)
	if len(children) > 50 {
		children = children[:50]
	}
	for _, child := range children {
		r := fetch(child)
		if r.Err == "" && r.Status == 200 {
			urls = append(urls, locs(r.Body)...)
		}
	}
	return sitemap{urls: urls}
}

// Item is the result of one of the four checks on a page.
type Item struct {
	OK     bool   `json:"ok"`
	Detail string `json:"detail"`
}

func fail(detail string) Item { return Item{false, detail} }
func pass(detail string) Item { return Item{true, detail} }

// LivePage is the four results for one live URL.
type LivePage struct {
	URL     string  `json:"url"`
	Keyword *string `json:"keyword"`
	Status  Item    `json:"status"`
	Noindex Item    `json:"noindex"`
	Meta    Item    `json:"meta"`
	Sitemap Item    `json:"sitemap"`
}

func (p LivePage) item(name string) Item {
	switch name {
	case "status":
		return p.Status
	case "noindex":
		return p.Noindex
	case "meta":
		return p.Meta
	}
	return p.Sitemap
}

func sitemapItem(rawURL string, sm sitemap) Item {
	if sm.err != "" {
		return fail(sm.err)
	}
	for _, u := range sm.urls {
		if sameURL(u, rawURL) {
			return pass("")
		}
	}
	origin := ""
	if u, err := parseURL(rawURL); err == nil {
		origin = originOf(u)
	}
	return fail(fmt.Sprintf("%s/sitemap.xml 里没有这个网址", origin))
}

func orNone(s *string) string {
	if s == nil {
		return "没有"
	}
	return *s
}

func samePtr(a, b *string) bool {
	if a == nil || b == nil {
		return a == b
	}
	return *a == *b
}

// judgePage is the four items for one live URL, given what the page returned, the build's facts and the origin's sitemap.
func judgePage(e LiveEntry, got Response, built PageFacts, sm sitemap) LivePage {
	base := LivePage{URL: e.URL, Keyword: e.Keyword}
	if got.Err != "" {
		why := fmt.Sprintf("没取到页面（%s）", got.Err)
		base.Status, base.Noindex, base.Meta = fail("连不上："+got.Err), fail(why+"，未核"), fail(why+"，未核")
		base.Sitemap = sitemapItem(e.URL, sm)
		return base
	}
	if got.Status != 200 {
		why := fmt.Sprintf("页面返回 %d，未核", got.Status)
		base.Status, base.Noindex, base.Meta = fail(fmt.Sprintf("返回 %d", got.Status)), fail(why), fail(why)
		base.Sitemap = sitemapItem(e.URL, sm)
		return base
	}
	live := Facts(got.Body)
	base.Status = pass("200")
	switch {
	case live.Noindex:
		base.Noindex = fail("meta robots 写了 noindex")
	case forbidsIndex(got.XRobots):
		base.Noindex = fail(fmt.Sprintf("响应头 X-Robots-Tag 是「%s」", got.XRobots))
	default:
		base.Noindex = pass("")
	}
	var diffs []string
	if !samePtr(live.Title, built.Title) {
		diffs = append(diffs, fmt.Sprintf("title 线上「%s」，产物「%s」", orNone(live.Title), orNone(built.Title)))
	}
	if !samePtr(live.Description, built.Description) {
		diffs = append(diffs, fmt.Sprintf("description 线上「%s」，产物「%s」", orNone(live.Description), orNone(built.Description)))
	}
	if len(diffs) > 0 {
		base.Meta = fail(strings.Join(diffs, "；"))
	} else {
		base.Meta = pass("")
	}
	base.Sitemap = sitemapItem(e.URL, sm)
	return base
}

func builtFacts(distRoot, rawURL string) (PageFacts, error) {
	f, err := DistFile(distRoot, rawURL)
	if err != nil {
		return PageFacts{}, err
	}
	b, err := os.ReadFile(f)
	if err != nil {
		return PageFacts{}, err
	}
	return Facts(string(b)), nil
}

// FailedItem is one check that did not pass.
type FailedItem struct {
	URL    string `json:"url"`
	Item   string `json:"item"`
	Detail string `json:"detail"`
}

// LiveReport is every page's four results and the ones that failed.
type LiveReport struct {
	Pages  []LivePage
	Failed []FailedItem
}

// CheckAll checks every URL against the live site now.
func CheckAll(entries []LiveEntry, distRoot string, fetch Fetch) (*LiveReport, error) {
	built := make([]PageFacts, len(entries))
	for i, e := range entries {
		f, err := builtFacts(distRoot, e.URL)
		if err != nil {
			return nil, err
		}
		built[i] = f
	}
	sitemaps := map[string]sitemap{}
	r := &LiveReport{Pages: []LivePage{}, Failed: []FailedItem{}}
	for i, e := range entries {
		u, err := parseURL(e.URL)
		if err != nil {
			return nil, err
		}
		origin := originOf(u)
		if _, ok := sitemaps[origin]; !ok {
			sitemaps[origin] = sitemapOf(origin, fetch)
		}
		r.Pages = append(r.Pages, judgePage(e, fetch(e.URL), built[i], sitemaps[origin]))
	}
	for _, p := range r.Pages {
		for _, item := range LiveItems {
			if it := p.item(item); !it.OK {
				r.Failed = append(r.Failed, FailedItem{URL: p.URL, Item: item, Detail: it.Detail})
			}
		}
	}
	return r, nil
}

// Verdict is "pass" when nothing failed.
func (r *LiveReport) Verdict() string {
	if len(r.Failed) > 0 {
		return "fail"
	}
	return "pass"
}

// WaitOpts are the clock and the pace of a wait for the deploy.
type WaitOpts struct {
	Fetch      Fetch
	IntervalMs float64
	MaxMs      float64
	Sleep      func(ms float64)
	Now        func() float64
}

// WaitResult is how the wait ended.
type WaitResult struct {
	Live     bool
	WaitedMs float64
	Pending  []string
}

// WaitLive polls until every page serves the build's title and description, or MaxMs ran out. A page whose
// description alone changed would pass a title-only test against the old deploy, so the description counts too.
func WaitLive(entries []LiveEntry, distRoot string, o WaitOpts) (*WaitResult, error) {
	built := make([]PageFacts, len(entries))
	for i, e := range entries {
		f, err := builtFacts(distRoot, e.URL)
		if err != nil {
			return nil, err
		}
		built[i] = f
	}
	start := o.Now()
	for {
		pending := []string{}
		for i, e := range entries {
			got := o.Fetch(e.URL)
			if got.Err != "" || got.Status != 200 {
				pending = append(pending, e.URL)
				continue
			}
			f := Facts(got.Body)
			if !samePtr(f.Title, built[i].Title) || !samePtr(f.Description, built[i].Description) {
				pending = append(pending, e.URL)
			}
		}
		waited := o.Now() - start
		if len(pending) == 0 {
			return &WaitResult{Live: true, WaitedMs: waited, Pending: pending}, nil
		}
		if waited >= o.MaxMs {
			return &WaitResult{Live: false, WaitedMs: waited, Pending: pending}, nil
		}
		o.Sleep(o.IntervalMs)
	}
}

// LiveResult is what the verify-live command prints.
type LiveResult struct {
	Verdict       string       `json:"verdict"`
	WaitedMinutes *float64     `json:"waitedMinutes,omitempty"`
	LimitMinutes  *float64     `json:"limitMinutes,omitempty"`
	Pending       []string     `json:"pending,omitempty"`
	Pages         []LivePage   `json:"pages"`
	Failed        []FailedItem `json:"failed"`
}

// roundHalfUp is Math.round.
func roundHalfUp(f float64) float64 { return math.Floor(f + 0.5) }
