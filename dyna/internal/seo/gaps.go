package seo

import (
	"fmt"
	"strings"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/jsstr"
)

const (
	storeSeoMd   = "SEO.md"
	storeContext = "OpenSEO 项目上下文"
)

// Need is one project fact some directions need, and where it is written down.
type Need struct {
	Item       string
	Label      string
	Store      string
	Directions []string
}

// Needs is the 「每个方向要用的信息」 table of seo-md.md, one row per item, in the order gaps are reported.
var Needs = []Need{
	{"competitors", "竞品", storeSeoMd, []string{"pages", "backlinks"}},
	{"brand_terms", "品牌词", storeSeoMd, []string{"pages"}},
	{"business_overview", "业务概述", storeContext, []string{"technical", "keywords"}},
	{"current_goal", "当前目标", storeContext, []string{"keywords"}},
	{"positioning", "定位", storeContext, []string{"backlinks"}},
}

// Gap is a fact the scan's directions need and nobody has written down.
type Gap struct {
	Item       string   `json:"item"`
	Label      string   `json:"label"`
	Store      string   `json:"store"`
	Directions []string `json:"directions"`
}

// GapsReport is what the gaps command prints.
type GapsReport struct {
	Directions     []string `json:"directions"`
	ContextChecked bool     `json:"contextChecked"`
	Gaps           []Gap    `json:"gaps"`
}

// sectionText is a typed section's text: a string as it is, or the `content` of an object.
func sectionText(v any) string {
	switch t := v.(type) {
	case string:
		return t
	case *Obj:
		if s, ok := t.Get("content").(string); ok {
			return s
		}
	}
	return ""
}

// contextSection is a typed section (business_overview, current_goal, positioning) of get_project_context's raw
// return, found as a string or as `{ content }`, at the top level or under `structuredContent` / `sections`, or as a
// `{ section | key | name, content }` row of a `sections` array.
func contextSection(context any, key string) string {
	structured := get(context, "structuredContent")
	places := []any{context, structured, get(context, "sections"), get(structured, "sections")}
	for _, place := range places {
		switch p := place.(type) {
		case []any:
			for _, row := range p {
				if !truthy(row) {
					continue
				}
				if matchesKey(get(row, "section"), key) || matchesKey(get(row, "key"), key) || matchesKey(get(row, "name"), key) {
					if jsstr.Trim(sectionText(row)) != "" {
						return sectionText(row)
					}
					break
				}
			}
		case *Obj:
			if jsstr.Trim(sectionText(p.Get(key))) != "" {
				return sectionText(p.Get(key))
			}
		}
	}
	return ""
}

func matchesKey(v any, key string) bool {
	s, ok := v.(string)
	return ok && s == key
}

func listedMissing(context any, key string) bool {
	for _, l := range []any{get(context, "missingSections"), get(get(context, "structuredContent"), "missingSections")} {
		if arr, ok := l.([]any); ok {
			for _, x := range arr {
				if matchesKey(x, key) {
					return true
				}
			}
		}
	}
	return false
}

// Gaps says which project facts the directions of one scan run need but nobody has written down. Missing means: a
// SEO.md item that was never written (`无` counts as written), or an empty field in the project context (a field the
// human answered `无` is not empty: asked and not needed). Without a readable project context only the SEO.md items
// are checked, so an unreachable OpenSEO never blocks a scan.
func Gaps(seo *SeoMd, context any, directions []string) (*GapsReport, error) {
	for _, d := range directions {
		if !contains(ScanDirections, d) {
			return nil, fmt.Errorf("不认识的方向「%s」（只认 %s）", d, strings.Join(ScanDirections, " / "))
		}
	}
	_, readable := context.(*Obj)
	written := map[string]bool{"competitors": seo.Confirmed.Competitors, "brand_terms": seo.Confirmed.BrandTerms}
	out := []Gap{}
	for _, need := range Needs {
		var wanted []string
		for _, d := range need.Directions {
			if contains(directions, d) {
				wanted = append(wanted, d)
			}
		}
		if len(wanted) == 0 {
			continue
		}
		fromSeoMd := need.Store == storeSeoMd
		if !fromSeoMd && !readable {
			continue
		}
		var missing bool
		if fromSeoMd {
			missing = !written[need.Item]
		} else {
			missing = listedMissing(context, need.Item) || jsstr.Trim(contextSection(context, need.Item)) == ""
		}
		if missing {
			out = append(out, Gap{Item: need.Item, Label: need.Label, Store: need.Store, Directions: wanted})
		}
	}
	return &GapsReport{Directions: directions, ContextChecked: readable, Gaps: out}, nil
}
