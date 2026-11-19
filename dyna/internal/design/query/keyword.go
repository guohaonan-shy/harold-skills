package query

import (
	"sort"
	"strings"
	"unicode"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/design/archive"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/frontmatter"
)

var tier = map[string]int{"name": 3, "summary": 2, "body": 1}
var hitByTier = map[int]string{3: "name", 2: "summary", 1: "body"}
var skipFields = map[string]bool{"type": true, "tags": true, "summary": true, "intent": true, "usedBy": true}

// frontmatterText is every string value in a frontmatter object (skipping pure wikilinks and the descriptive fields).
func frontmatterText(fm *frontmatter.Map) string {
	var out []string
	var walk func(v any)
	walk = func(v any) {
		switch x := v.(type) {
		case string:
			if _, link := archive.WikilinkTarget(x); !link {
				out = append(out, x)
			}
		case []any:
			for _, e := range x {
				walk(e)
			}
		case *frontmatter.Map:
			for _, k := range x.Keys() {
				walk(x.Get(k))
			}
		}
	}
	for _, k := range fm.Keys() {
		if !skipFields[k] {
			walk(fm.Get(k))
		}
	}
	return strings.Join(out, "\n")
}

func isCJK(r rune) bool { return r >= 0x3400 && r <= 0x9FFF }

// bigrams are overlapping pairs of CJK characters from every long CJK run, minus pairs holding a function word.
func bigrams(terms []string) []string {
	var out []string
	seen := map[string]bool{}
	for _, t := range terms {
		rs := []rune(t)
		for i := 0; i < len(rs); {
			if !isCJK(rs[i]) {
				i++
				continue
			}
			j := i
			for j < len(rs) && isCJK(rs[j]) {
				j++
			}
			if j-i >= 3 {
				run := rs[i:j]
				for k := 0; k+2 <= len(run); k++ {
					pair := string(run[k : k+2])
					if strings.ContainsAny(pair, "的了是在和与及或把被就都也还") || seen[pair] {
						continue
					}
					seen[pair] = true
					out = append(out, pair)
				}
			}
			i = j
		}
	}
	return out
}

func lowerRunes(s string) []rune {
	rs := []rune(s)
	for i, r := range rs {
		rs[i] = unicode.ToLower(r)
	}
	return rs
}

func indexRunes(hay, needle []rune) int {
	if len(needle) == 0 {
		return 0
	}
	for i := 0; i+len(needle) <= len(hay); i++ {
		match := true
		for j := range needle {
			if hay[i+j] != needle[j] {
				match = false
				break
			}
		}
		if match {
			return i
		}
	}
	return -1
}

func collapseSpace(s string) string { return strings.Join(strings.Fields(s), " ") }

func snippet(txt, term string) string {
	rs := []rune(txt)
	at := indexRunes(lowerRunes(txt), lowerRunes(term))
	if at < 0 {
		if len(rs) > 40 {
			rs = rs[:40]
		}
		return string(rs)
	}
	start := at - 20
	if start < 0 {
		start = 0
	}
	end := at + len([]rune(term)) + 20
	if end > len(rs) {
		end = len(rs)
	}
	return collapseSpace(string(rs[start:end]))
}

type hit struct{ term, field string }

func searchWith(a *archive.Archive, terms []string) []*frontmatter.Map {
	type found struct {
		m     *frontmatter.Map
		tier  int
		count int
		id    string
	}
	var all []found
	for _, o := range a.All() {
		var parts []string
		for _, k := range []string{"summary", "intent"} {
			if v := o.FM.Get(k); frontmatter.Truthy(v) {
				parts = append(parts, frontmatter.Text(v))
			}
		}
		texts := map[string]string{
			"name":    o.ID,
			"summary": strings.Join(parts, "\n"),
			"body":    o.Body + "\n" + frontmatterText(o.FM),
		}
		var hits []hit
		for _, term := range terms {
			t := lowerRunes(term)
			for _, f := range []string{"name", "summary", "body"} {
				if indexRunes(lowerRunes(texts[f]), t) >= 0 {
					hits = append(hits, hit{term, f})
					break
				}
			}
		}
		if len(hits) == 0 {
			continue
		}
		best := 0
		for _, h := range hits {
			if tier[h.field] > best {
				best = tier[h.field]
			}
		}
		var first hit
		for _, h := range hits {
			if tier[h.field] == best {
				first = h
				break
			}
		}
		matched := make([]any, len(hits))
		for i, h := range hits {
			matched[i] = h.term
		}
		snip := o.ID
		if first.field != "name" {
			snip = snippet(texts[first.field], first.term)
		}
		all = append(all, found{
			m:    obj("id", o.ID, "kind", o.Kind, "file", o.File, "summary", summaryOf(o), "hit", hitByTier[best], "terms", matched, "snippet", snip),
			tier: best, count: len(hits), id: o.ID,
		})
	}
	sort.SliceStable(all, func(i, j int) bool {
		x, y := all[i], all[j]
		if x.tier != y.tier {
			return x.tier > y.tier
		}
		if x.count != y.count {
			return x.count > y.count
		}
		return x.id < y.id
	})
	out := make([]*frontmatter.Map, len(all))
	for i, f := range all {
		out[i] = f.m
	}
	return out
}

// Keyword is the objects whose name, summary (or intent) or body (with the frontmatter's text) contain a word of
// the query, case-insensitively. Best position first — name, then summary, then body — and within a position the
// object matching more of the words. A query with no spaces and long Chinese runs that matches nothing as written
// is retried as overlapping two-character pieces (`expanded: true`).
func Keyword(a *archive.Archive, txt string) (*frontmatter.Map, error) {
	var terms []string
	seen := map[string]bool{}
	for _, t := range strings.Fields(strings.TrimSpace(txt)) {
		if !seen[t] {
			seen[t] = true
			terms = append(terms, t)
		}
	}
	if len(terms) == 0 {
		return nil, qerrCode("关键词是空的", "usage")
	}
	matches := searchWith(a, terms)
	expanded := false
	if len(matches) == 0 {
		if pieces := bigrams(terms); len(pieces) > 0 {
			matches = searchWith(a, pieces)
			expanded = true
		}
	}
	return obj("query", strings.TrimSpace(txt), "terms", strList(terms), "expanded", expanded, "matches", mapsToList(matches)), nil
}
