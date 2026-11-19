package seo

import (
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/jsstr"
)

// Evidence is what a finding the commands build says it looked at.
type Evidence struct {
	What   string `json:"what"`
	When   string `json:"when"`
	Values string `json:"values"`
}

// Finding is a finding the compare-audits and provenance commands build.
type Finding struct {
	Direction  string   `json:"direction"`
	Kind       string   `json:"kind"`
	Title      string   `json:"title"`
	Targets    []string `json:"targets"`
	Evidence   Evidence `json:"evidence"`
	Repro      string   `json:"repro"`
	Fix        string   `json:"fix"`
	Acceptance []string `json:"acceptance"`
}

var trailingSlashes = regexp.MustCompile(`/+$`)

// pageKey is a URL as the audits are compared on: trimmed, without trailing slashes.
func pageKey(u any) string { return trailingSlashes.ReplaceAllString(jsstr.Trim(orEmpty(u)), "") }

func isoDay(iso any, now time.Time) string {
	if truthy(iso) {
		s := toString(iso)
		return jsSlice(s, 0, 10)
	}
	return now.UTC().Format("2006-01-02")
}

// jsSlice is s.slice(from, to) for ASCII-safe use: counts UTF-16 units like JavaScript.
func jsSlice(s string, from, to int) string {
	u := []rune(s)
	// positions are in UTF-16 units; for the dates and ids this is used on, runes and units agree
	if from > len(u) {
		return ""
	}
	if to > len(u) {
		to = len(u)
	}
	return string(u[from:to])
}

// pageChange is what regressed on one page: short lines for the severe and the warning ones.
type pageChange struct{ severe, warning []string }

func strictEqual(a, b any) bool {
	switch x := a.(type) {
	case undefT:
		_, ok := b.(undefT)
		return ok
	case nil:
		return b == nil
	case bool:
		y, ok := b.(bool)
		return ok && x == y
	case float64:
		y, ok := b.(float64)
		return ok && x == y
	case string:
		y, ok := b.(string)
		return ok && x == y
	}
	return false
}

// interp is a value as a template literal writes it.
func interp(v any) string { return toString(v) }

func changesOf(prev, cur any, hasPrev, hasCur bool) pageChange {
	var c pageChange
	if !hasCur {
		if hasPrev {
			c.severe = append(c.severe, "本次审计里没有这个页面")
		}
		return c
	}
	if !strictEqual(get(cur, "statusCode"), float64(200)) {
		prevCode := "?"
		if hasPrev && !nullish(get(prev, "statusCode")) {
			prevCode = interp(get(prev, "statusCode"))
		}
		c.severe = append(c.severe, fmt.Sprintf("状态码 %s → %s", prevCode, interp(get(cur, "statusCode"))))
	}
	if hasPrev && truthy(get(prev, "isIndexable")) && strictEqual(get(cur, "isIndexable"), false) {
		c.severe = append(c.severe, "可索引 → 不可索引")
	}
	if hasPrev && truthy(get(prev, "inSitemap")) && strictEqual(get(cur, "inSitemap"), false) {
		c.severe = append(c.severe, "从 sitemap 里消失")
	}
	if hasPrev && !strictEqual(get(prev, "title"), get(cur, "title")) {
		c.warning = append(c.warning, fmt.Sprintf("title「%s」→「%s」", orEmpty(get(prev, "title")), orEmpty(get(cur, "title"))))
	}
	if hasPrev && !strictEqual(get(prev, "metaDescription"), get(cur, "metaDescription")) {
		c.warning = append(c.warning, "description 变了")
	}
	return c
}

func auditRef(a any) string {
	if truthy(get(a, "auditId")) {
		return "auditId " + toString(get(a, "auditId"))
	}
	return "最近一次审计"
}

func reproOf(urls []string, previous, current any) string {
	return fmt.Sprintf("list_site_audits 找到两次审计（上一次 %s，本次 %s），各调 get_audit_pages（limit 1000），按网址对比：%s；再用 curl -sI 和 curl -s 看线上页面的状态码与 <title>、meta robots",
		auditRef(previous), auditRef(current), strings.Join(urls, "、"))
}

// urlLines is a URL with what changed on it.
type urlLines struct {
	url   string
	lines []string
}

func valuesOf(rows []urlLines) string {
	parts := make([]string, len(rows))
	for i, r := range rows {
		parts[i] = r.url + "：" + strings.Join(r.lines, "，")
	}
	return strings.Join(parts, "；")
}

func urlsOf(rows []urlLines) []string {
	out := make([]string, len(rows))
	for i, r := range rows {
		out[i] = r.url
	}
	return out
}

// metaChangedFinding is the `key-page-meta-changed` finding for rows; provenance rebuilds it for the pages that are left.
func metaChangedFinding(rows []urlLines, previous, current any, now time.Time) Finding {
	acceptance := make([]string, len(rows))
	for i, r := range rows {
		acceptance[i] = r.url + " 的 title 和 description 是有意写下的版本"
	}
	return Finding{
		Direction: "technical",
		Kind:      "key-page-meta-changed",
		Title:     fmt.Sprintf("%d 个重点页面的 title 或 description 和上一次审计不同", len(rows)),
		Targets:   urlsOf(rows),
		Evidence: Evidence{
			What:   fmt.Sprintf("get_audit_pages：%s 对 %s", auditRef(previous), auditRef(current)),
			When:   isoDay(get(current, "completedAt"), now),
			Values: valuesOf(rows),
		},
		Repro:      reproOf(urlsOf(rows), previous, current),
		Fix:        "需要决定：确认改动是有意的；不是就改回",
		Acceptance: acceptance,
	}
}

// auditPages indexes an audit's pages by the key of their URL.
func auditPages(audit any) (map[string]any, error) {
	pages, err := arrayOf(get(audit, "pages"), "pages")
	if err != nil {
		return nil, err
	}
	out := map[string]any{}
	for _, p := range pages {
		out[pageKey(get(p, "url"))] = p
	}
	return out, nil
}

// Regressions are the key pages that got worse between two audits: one finding for the severe ones, one for the
// title or description changes.
func Regressions(seo *SeoMd, previous, current any, now time.Time) ([]Finding, error) {
	prev, err := auditPages(previous)
	if err != nil {
		return nil, err
	}
	cur, err := auditPages(current)
	if err != nil {
		return nil, err
	}
	var severe, warning []urlLines
	for _, kp := range seo.KeyPages {
		k := pageKey(kp.URL)
		p, hasPrev := prev[k]
		c, hasCur := cur[k]
		ch := changesOf(p, c, hasPrev, hasCur)
		if len(ch.severe) > 0 {
			severe = append(severe, urlLines{k, ch.severe})
		}
		if len(ch.warning) > 0 {
			warning = append(warning, urlLines{k, ch.warning})
		}
	}
	out := []Finding{}
	if len(severe) > 0 {
		acceptance := make([]string, len(severe))
		for i, r := range severe {
			acceptance[i] = r.url + " 返回 200、可索引、在 sitemap 里"
		}
		out = append(out, Finding{
			Direction: "technical",
			Kind:      "key-page-regression",
			Title:     fmt.Sprintf("%d 个重点页面相对上一次审计出现了会影响收录的回退", len(severe)),
			Targets:   urlsOf(severe),
			Evidence: Evidence{
				What:   fmt.Sprintf("get_audit_pages：%s 对 %s", auditRef(previous), auditRef(current)),
				When:   isoDay(get(current, "completedAt"), now),
				Values: valuesOf(severe),
			},
			Repro:      reproOf(urlsOf(severe), previous, current),
			Fix:        "需要诊断：先确认是不是有意的下线或改版，不是就恢复",
			Acceptance: acceptance,
		})
	}
	if len(warning) > 0 {
		out = append(out, metaChangedFinding(warning, previous, current, now))
	}
	return out, nil
}
