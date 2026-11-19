package seo

import (
	"bytes"
	"fmt"
	"os"
	"regexp"
	"strings"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/jsstr"
)

// Directions a finding can be filed under (`type:seo/<direction>`).
var Directions = []string{"technical", "pages", "keywords", "backlinks", "geo"}

// ScanDirections are the directions one scan run can take: the five above, plus `results` (the effect report), whose
// findings are filed under the direction of the change they are about, so it is not a finding direction.
var ScanDirections = append(append([]string{}, Directions...), "results")

// PageTypes are the page types SEO.md's 写作 may map a site's own types to.
var PageTypes = []string{"对比与研究", "数据研究", "故事", "教程"}

// DefaultLiveWait is how many minutes the post-deploy check waits for the live site to match the build when SEO.md
// does not say.
const DefaultLiveWait = 30

var seoSections = []string{"站点", "OpenSEO", "竞品", "重点页面", "构建与检查", "写作", "品牌", "内容原则", "分析"}

const none = "无"

var (
	ws        = jsstr.WS
	wsIn      = jsstr.WS[1 : len(jsstr.WS)-1]
	notWS     = `[^` + wsIn + `]`
	headingRe = regexp.MustCompile(`^##` + ws + `+(.+?)` + ws + `*$`)
	h1Re      = regexp.MustCompile(`^#` + ws)
	itemRe    = regexp.MustCompile(`^` + ws + `*-` + ws + `+(.+?)` + ws + `*$`)
	tickRe    = regexp.MustCompile("`([^`]+)`")
	digitsRe  = regexp.MustCompile(`\d+`)
	resetRe   = regexp.MustCompile(`每月` + ws + `*(\d+)` + ws + `*日` + ws + `*重置`)
	labelRe   = regexp.MustCompile(`^(排名追踪|扫描|起草与验证)` + ws + `*(.*)$`)
	scanItem  = regexp.MustCompile(`^([a-z]+)` + ws + `+(\d[\d,]*)$`)
	countRe   = regexp.MustCompile(`^(\d[\d,]*)$`)
	typeMapRe = regexp.MustCompile("`([^`]+)`" + ws + `*(?:→|->)` + ws + `*(` + notWS + `+)`)
	princRe   = regexp.MustCompile(`^(.*?)` + ws + `*[（(]出处[：:]` + ws + `*(.+?)` + ws + `*[）)]$`)
	semiSplit = regexp.MustCompile(`[；;]`)
	commaSep  = regexp.MustCompile(`[，,]`)
	spaceRun  = regexp.MustCompile(ws + `+`)
)

// ScanShares is the weekly allocation of the directions of one scan, in the order SEO.md wrote them.
type ScanShares struct {
	Keys []string
	Vals map[string]float64
}

func (s *ScanShares) set(k string, v float64) {
	if s.Vals == nil {
		s.Vals = map[string]float64{}
	}
	if _, ok := s.Vals[k]; !ok {
		s.Keys = append(s.Keys, k)
	}
	s.Vals[k] = v
}

// Get is the share of a direction, 0 when it has none.
func (s *ScanShares) Get(k string) float64 { return s.Vals[k] }

// Total is the sum of the directions' shares.
func (s *ScanShares) Total() float64 {
	t := 0.0
	for _, v := range s.Vals {
		t += v
	}
	return t
}

// MarshalJSON writes the directions in the order SEO.md wrote them.
func (s *ScanShares) MarshalJSON() ([]byte, error) {
	var b bytes.Buffer
	b.WriteByte('{')
	for i, k := range s.Keys {
		if i > 0 {
			b.WriteByte(',')
		}
		kb, _ := marshalPlain(k)
		b.Write(kb)
		b.WriteByte(':')
		b.WriteString(numText(s.Vals[k]))
	}
	b.WriteByte('}')
	return b.Bytes(), nil
}

// TypeMap maps a site's own page types to the general ones, in the order SEO.md wrote them.
type TypeMap struct {
	Keys []string
	Vals map[string]string
}

// MarshalJSON writes the entries in order.
func (m *TypeMap) MarshalJSON() ([]byte, error) {
	var b bytes.Buffer
	b.WriteByte('{')
	for i, k := range m.Keys {
		if i > 0 {
			b.WriteByte(',')
		}
		kb, _ := marshalPlain(k)
		vb, _ := marshalPlain(m.Vals[k])
		b.Write(kb)
		b.WriteByte(':')
		b.Write(vb)
	}
	b.WriteByte('}')
	return b.Bytes(), nil
}

// Language is one `<code> → <prefix>` of SEO.md's 站点.
type Language struct {
	Code   string `json:"code"`
	Prefix string `json:"prefix"`
}

// Site is SEO.md's 站点.
type Site struct {
	Domain        *string    `json:"domain"`
	Languages     []Language `json:"languages"`
	SearchConsole *string    `json:"searchConsole"`
	Bing          *string    `json:"bing"`
}

// Weekly is the weekly allocation of OpenSEO credits.
type Weekly struct {
	Tracking float64     `json:"tracking"`
	Scan     *ScanShares `json:"scan"`
	Drafting float64     `json:"drafting"`
}

// OpenSEO is SEO.md's OpenSEO section.
type OpenSEO struct {
	ProjectID *string  `json:"projectId"`
	Floor     *float64 `json:"floor"`
	Monthly   *float64 `json:"monthly"`
	ResetDay  *int     `json:"resetDay"`
	Weekly    *Weekly  `json:"weekly"`
}

// Competitor is one line of 竞品.
type Competitor struct {
	Domain string `json:"domain"`
	Name   string `json:"name"`
	Notes  string `json:"notes"`
}

// KeyPage is one line of 重点页面.
type KeyPage struct {
	URL     string  `json:"url"`
	Keyword *string `json:"keyword"`
}

// Build is SEO.md's 构建与检查.
type Build struct {
	DistDir      *string  `json:"distDir"`
	CheckArgs    []string `json:"checkArgs"`
	ContentPaths []string `json:"contentPaths"`
	LiveWait     float64  `json:"liveWait"`
}

// Writing is SEO.md's 写作.
type Writing struct {
	Voice     *string  `json:"voice"`
	Failures  *string  `json:"failures"`
	TypeField *string  `json:"typeField"`
	TypeMap   *TypeMap `json:"typeMap"`
}

// Brand is SEO.md's 品牌.
type Brand struct {
	Terms []string `json:"terms"`
}

// Principle is one line of 内容原则.
type Principle struct {
	Text   string `json:"text"`
	Source string `json:"source"`
}

// Analytics is SEO.md's 分析.
type Analytics struct {
	Tool      *string `json:"tool"`
	ProjectID *string `json:"projectId"`
	Dashboard *string `json:"dashboard"`
}

// Confirmed says per item whether it was written (a value, or an explicit `无`) rather than never written.
type Confirmed struct {
	Competitors bool `json:"competitors"`
	BrandTerms  bool `json:"brandTerms"`
}

// SeoMd is the nine sections of a project's SEO.md.
type SeoMd struct {
	Site        Site         `json:"site"`
	OpenSEO     OpenSEO      `json:"openseo"`
	Competitors []Competitor `json:"competitors"`
	KeyPages    []KeyPage    `json:"keyPages"`
	Build       Build        `json:"build"`
	Writing     Writing      `json:"writing"`
	Brand       Brand        `json:"brand"`
	Principles  []Principle  `json:"principles"`
	Analytics   Analytics    `json:"analytics"`
	Confirmed   Confirmed    `json:"confirmed"`
}

func sectionBodies(md string) map[string][]string {
	out := map[string][]string{}
	for _, s := range seoSections {
		out[s] = []string{}
	}
	current := ""
	for _, line := range strings.Split(md, "\n") {
		if h := headingRe.FindStringSubmatch(line); h != nil {
			current = ""
			for _, s := range seoSections {
				if s == h[1] {
					current = s
				}
			}
			continue
		}
		if h1Re.MatchString(line) {
			current = ""
		} else if current != "" {
			out[current] = append(out[current], line)
		}
	}
	return out
}

// items are the `- key：value` lines of a section, in order.
func items(lines []string) []string {
	out := []string{}
	for _, l := range lines {
		if m := itemRe.FindStringSubmatch(l); m != nil {
			out = append(out, m[1])
		}
	}
	return out
}

// keyValue splits an item at its first ： or : that sits outside backticks.
func keyValue(item string) (string, string) {
	tick := false
	for i, c := range item {
		switch {
		case c == '`':
			tick = !tick
		case !tick && (c == '：' || c == ':'):
			return jsstr.Trim(item[:i]), jsstr.Trim(item[i+len(string(c)):])
		}
	}
	return jsstr.Trim(item), ""
}

func ticks(s string) []string {
	out := []string{}
	for _, m := range tickRe.FindAllStringSubmatch(s, -1) {
		out = append(out, m[1])
	}
	return out
}

func firstTick(s string) *string {
	t := ticks(s)
	if len(t) == 0 {
		return nil
	}
	return &t[0]
}

func pairs(lines []string) map[string]string {
	out := map[string]string{}
	for _, it := range items(lines) {
		k, v := keyValue(it)
		out[k] = v
	}
	return out
}

func parseSite(lines []string) Site {
	kv := pairs(lines)
	langs := []Language{}
	for _, part := range semiSplit.Split(kv["语言"], -1) {
		if t := ticks(part); len(t) >= 2 {
			langs = append(langs, Language{Code: t[0], Prefix: t[1]})
		}
	}
	return Site{Domain: firstTick(kv["域名"]), Languages: langs, SearchConsole: firstTick(kv["Search Console"]), Bing: firstTick(kv["Bing"])}
}

// parseWeekly reads `排名追踪 300；扫描 technical 200，pages 300；起草与验证 400`.
func parseWeekly(value string) (*Weekly, error) {
	w := &Weekly{Scan: &ScanShares{Vals: map[string]float64{}}}
	for _, raw := range semiSplit.Split(value, -1) {
		part := jsstr.Trim(raw)
		if part == "" {
			continue
		}
		label := labelRe.FindStringSubmatch(part)
		if label == nil {
			return nil, fmt.Errorf("SEO.md「OpenSEO」的每周分配里有不认识的一份「%s」（只认 排名追踪 / 扫描 / 起草与验证）", part)
		}
		name, rest := label[1], label[2]
		if name == "扫描" {
			for _, it := range commaSep.Split(rest, -1) {
				it = jsstr.Trim(it)
				if it == "" {
					continue
				}
				m := scanItem.FindStringSubmatch(it)
				if m == nil {
					continue
				}
				if !contains(ScanDirections, m[1]) {
					return nil, fmt.Errorf("SEO.md「OpenSEO」的每周分配里扫描有不认识的方向「%s」（只认 %s）", m[1], strings.Join(ScanDirections, " / "))
				}
				w.Scan.set(m[1], number(m[2]))
			}
		} else if n := countRe.FindStringSubmatch(rest); n != nil {
			if name == "排名追踪" {
				w.Tracking = number(n[1])
			} else {
				w.Drafting = number(n[1])
			}
		}
	}
	return w, nil
}

func contains(list []string, s string) bool {
	for _, x := range list {
		if x == s {
			return true
		}
	}
	return false
}

// monthlyOf is the first `每月 <n>` of a plan whose number is followed by a comma, a semicolon or the end:
// /每月\s*(\d[\d,]*)(?=\s*(?:[，,；;]|$))/.
func monthlyOf(plan string) (string, bool) {
	from := 0
	for {
		at := strings.Index(plan[from:], "每月")
		if at < 0 {
			return "", false
		}
		i := from + at + len("每月")
		from = i
		rest := strings.TrimLeftFunc(plan[i:], jsstr.IsSpace)
		start := len(plan) - len(rest)
		if rest == "" || rest[0] < '0' || rest[0] > '9' {
			continue
		}
		run := 0
		for run < len(rest) && (rest[run] == ',' || (rest[run] >= '0' && rest[run] <= '9')) {
			run++
		}
		for end := run; end >= 1; end-- {
			after := strings.TrimLeftFunc(rest[end:], jsstr.IsSpace)
			if after == "" || strings.HasPrefix(after, "，") || after[0] == ',' || strings.HasPrefix(after, "；") || after[0] == ';' {
				return plan[start : start+end], true
			}
		}
	}
}

func parseOpenSeo(lines []string) (OpenSEO, error) {
	kv := pairs(lines)
	if _, ok := kv["单次额度"]; ok {
		return OpenSEO{}, fmt.Errorf("SEO.md「OpenSEO」写的是旧的「单次额度」：额度现在按周算，改成「套餐额度」和「每周分配」两项。跑 `/idea-loop:seo-setup` 迁移")
	}
	o := OpenSEO{ProjectID: firstTick(kv["项目"])}
	if m := digitsRe.FindString(kv["余额下限"]); m != "" {
		f := jsNumber(m)
		o.Floor = &f
	}
	plan := kv["套餐额度"]
	if m, ok := monthlyOf(plan); ok {
		f := number(m)
		o.Monthly = &f
	}
	if r := resetRe.FindStringSubmatch(plan); r != nil {
		day := int(jsNumber(r[1]))
		if !(jsNumber(r[1]) >= 1 && jsNumber(r[1]) <= 31) {
			return OpenSEO{}, fmt.Errorf("SEO.md「OpenSEO」的套餐额度里，重置日「%s」不是 1 到 31 之间的日子", r[1])
		}
		o.ResetDay = &day
	}
	if v, ok := kv["每周分配"]; ok {
		w, err := parseWeekly(v)
		if err != nil {
			return OpenSEO{}, err
		}
		o.Weekly = w
	}
	return o, nil
}

func parseCompetitors(lines []string) []Competitor {
	out := []Competitor{}
	for _, it := range items(lines) {
		key, value := keyValue(it)
		domain := firstTick(key)
		if domain == nil {
			continue
		}
		parts := commaSep.Split(value, -1)
		out = append(out, Competitor{Domain: *domain, Name: jsstr.Trim(parts[0]), Notes: jsstr.Trim(strings.Join(parts[1:], "，"))})
	}
	return out
}

func parseKeyPages(lines []string) []KeyPage {
	out := []KeyPage{}
	for _, it := range items(lines) {
		key, value := keyValue(it)
		if url := firstTick(key); url != nil {
			out = append(out, KeyPage{URL: *url, Keyword: firstTick(value)})
		}
	}
	return out
}

func parseBuild(lines []string) Build {
	kv := pairs(lines)
	args := []string{}
	for _, a := range spaceRun.Split(strings.Join(ticks(kv["检查参数"]), " "), -1) {
		if a != "" {
			args = append(args, a)
		}
	}
	wait := float64(DefaultLiveWait)
	if m := digitsRe.FindString(kv["上线等待"]); m != "" {
		if f := jsNumber(m); f > 0 {
			wait = f
		}
	}
	return Build{DistDir: firstTick(kv["产物目录"]), CheckArgs: args, ContentPaths: ticks(kv["内容路径"]), LiveWait: wait}
}

func parseWriting(lines []string) (Writing, error) {
	kv := pairs(lines)
	tm := &TypeMap{Vals: map[string]string{}}
	for _, part := range semiSplit.Split(kv["类型映射"], -1) {
		m := typeMapRe.FindStringSubmatch(part)
		if m == nil {
			continue
		}
		if !contains(PageTypes, m[2]) {
			return Writing{}, fmt.Errorf("SEO.md「写作」的类型映射里「%s」不是通用类型（只认 %s）", m[2], strings.Join(PageTypes, " / "))
		}
		if _, ok := tm.Vals[m[1]]; !ok {
			tm.Keys = append(tm.Keys, m[1])
		}
		tm.Vals[m[1]] = m[2]
	}
	return Writing{Voice: firstTick(kv["文风"]), Failures: firstTick(kv["失败案例"]), TypeField: firstTick(kv["类型字段"]), TypeMap: tm}, nil
}

func parsePrinciples(lines []string) []Principle {
	out := []Principle{}
	for _, it := range items(lines) {
		if it == none {
			continue
		}
		if m := princRe.FindStringSubmatch(it); m != nil {
			out = append(out, Principle{Text: jsstr.Trim(m[1]), Source: jsstr.Trim(m[2])})
		} else {
			out = append(out, Principle{Text: it})
		}
	}
	return out
}

func parseAnalytics(lines []string) Analytics {
	kv := pairs(lines)
	value := func(key string) *string {
		raw := jsstr.Trim(kv[key])
		if raw == "" || raw == none {
			return nil
		}
		if t := firstTick(raw); t != nil {
			return t
		}
		return &raw
	}
	return Analytics{Tool: value("工具"), ProjectID: value("项目"), Dashboard: value("dashboard")}
}

// ParseSeoMd reads SEO.md's text. A section that is not there reads as empty, a line it does not know is ignored.
func ParseSeoMd(md string) (*SeoMd, error) {
	s := sectionBodies(md)
	competitors := parseCompetitors(s["竞品"])
	brand := Brand{Terms: ticks(pairs(s["品牌"])["品牌词"])}
	open, err := parseOpenSeo(s["OpenSEO"])
	if err != nil {
		return nil, err
	}
	writing, err := parseWriting(s["写作"])
	if err != nil {
		return nil, err
	}
	noCompetitors := false
	for _, it := range items(s["竞品"]) {
		if it == none {
			noCompetitors = true
		}
	}
	return &SeoMd{
		Site:        parseSite(s["站点"]),
		OpenSEO:     open,
		Competitors: competitors,
		KeyPages:    parseKeyPages(s["重点页面"]),
		Build:       parseBuild(s["构建与检查"]),
		Writing:     writing,
		Brand:       brand,
		Principles:  parsePrinciples(s["内容原则"]),
		Analytics:   parseAnalytics(s["分析"]),
		Confirmed: Confirmed{
			Competitors: len(competitors) > 0 || noCompetitors,
			BrandTerms:  len(brand.Terms) > 0 || jsstr.Trim(pairs(s["品牌"])["品牌词"]) == none,
		},
	}, nil
}

// ReadSeoMd reads and parses a SEO.md file.
func ReadSeoMd(file string) (*SeoMd, error) {
	b, err := os.ReadFile(file)
	if err != nil {
		return nil, fmt.Errorf("读不到 %s：%s", file, strings.TrimPrefix(err.Error(), "open "+file+": "))
	}
	return ParseSeoMd(string(b))
}
