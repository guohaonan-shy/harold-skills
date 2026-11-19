package seo

import (
	"fmt"
	"regexp"
	"strings"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/jsstr"
)

var (
	schemeRe = regexp.MustCompile(`^https?://`)
	wwwRe    = regexp.MustCompile(`^www\.`)
)

func domainKey(d any) string {
	s := strings.ToLower(jsstr.Trim(orEmpty(d)))
	s = schemeRe.ReplaceAllString(s, "")
	s = wwwRe.ReplaceAllString(s, "")
	return trailingSlashes.ReplaceAllString(s, "")
}

func urlKey(u any) string { return trailingSlashes.ReplaceAllString(jsstr.Trim(orEmpty(u)), "") }

// same is `String(a ?? ”).trim() === String(b ?? ”).trim()`.
func same(a, b any) bool { return jsstr.Trim(orEmpty(a)) == jsstr.Trim(orEmpty(b)) }

// keyedRows is rows indexed by a key, in the order the keys first appeared (a repeated key keeps its place).
type keyedRows struct {
	keys []string
	rows map[string]any
}

func indexRows(rows []any, key func(any) string) *keyedRows {
	k := &keyedRows{rows: map[string]any{}}
	for _, r := range rows {
		id := key(r)
		if _, ok := k.rows[id]; !ok {
			k.keys = append(k.keys, id)
		}
		k.rows[id] = r
	}
	return k
}

func (k *keyedRows) has(id string) bool { _, ok := k.rows[id]; return ok }

// CompetitorUpdate is a competitor to add or change in OpenSEO's project context.
type CompetitorUpdate struct {
	Domain string `json:"domain"`
	Name   string `json:"name,omitempty"`
	Notes  string `json:"notes,omitempty"`
}

// KeyPageUpdate is a key page to add or change in OpenSEO's project context.
type KeyPageUpdate struct {
	URL   string `json:"url"`
	Topic string `json:"topic,omitempty"`
}

type addCompetitors struct {
	List []CompetitorUpdate `json:"addCompetitors"`
}
type removeCompetitors struct {
	List []string `json:"removeCompetitors"`
}
type addKeyPages struct {
	List []KeyPageUpdate `json:"addKeyPages"`
}
type removeKeyPages struct {
	List []string `json:"removeKeyPages"`
}

// SyncPlan is the `updates` argument of OpenSEO's update_project_context, and what it does in words.
type SyncPlan struct {
	Updates []any  `json:"updates"`
	Summary string `json:"summary"`
}

// Sync plans a one-way sync of competitors and key pages from SEO.md into the OpenSEO project context. SEO.md is the
// source of truth: when the two disagree there is no other way to tell which side is right, so OpenSEO is never read
// back into SEO.md.
func Sync(seo *SeoMd, context any) (*SyncPlan, error) {
	comps, err := arrayOf(get(context, "competitors"), "competitors")
	if err != nil {
		return nil, err
	}
	pages, err := arrayOf(get(context, "keyPages"), "keyPages")
	if err != nil {
		return nil, err
	}
	var lines []string
	theirs := indexRows(comps, func(c any) string { return domainKey(get(c, "domain")) })
	ours := &keyedRows{rows: map[string]any{}}
	for _, c := range seo.Competitors {
		id := domainKey(c.Domain)
		if !ours.has(id) {
			ours.keys = append(ours.keys, id)
		}
		ours.rows[id] = c
	}
	add := []CompetitorUpdate{}
	for _, id := range ours.keys {
		c := ours.rows[id].(Competitor)
		if t, ok := theirs.rows[id]; ok && same(get(t, "name"), c.Name) && same(get(t, "notes"), c.Notes) {
			continue
		}
		add = append(add, CompetitorUpdate{Domain: id, Name: c.Name, Notes: c.Notes})
		verb := "加"
		if theirs.has(id) {
			verb = "改"
		}
		lines = append(lines, fmt.Sprintf("%s竞品 %s", verb, id))
	}
	remove := []string{}
	for _, id := range theirs.keys {
		if !ours.has(id) {
			remove = append(remove, id)
			lines = append(lines, fmt.Sprintf("删竞品 %s", id))
		}
	}

	theirPages := indexRows(pages, func(p any) string { return urlKey(get(p, "url")) })
	ourPages := &keyedRows{rows: map[string]any{}}
	for _, p := range seo.KeyPages {
		id := urlKey(p.URL)
		if !ourPages.has(id) {
			ourPages.keys = append(ourPages.keys, id)
		}
		ourPages.rows[id] = p
	}
	addPages := []KeyPageUpdate{}
	for _, id := range ourPages.keys {
		p := ourPages.rows[id].(KeyPage)
		if t, ok := theirPages.rows[id]; ok && (p.Keyword == nil || same(get(t, "topic"), *p.Keyword)) {
			continue
		}
		u := KeyPageUpdate{URL: id}
		if p.Keyword != nil {
			u.Topic = *p.Keyword
		}
		addPages = append(addPages, u)
		verb := "加"
		if theirPages.has(id) {
			verb = "改"
		}
		lines = append(lines, fmt.Sprintf("%s重点页面 %s", verb, id))
	}
	removePages := []string{}
	for _, id := range theirPages.keys {
		if !ourPages.has(id) {
			removePages = append(removePages, id)
			lines = append(lines, fmt.Sprintf("删重点页面 %s", id))
		}
	}

	updates := []any{}
	if len(add) > 0 {
		updates = append(updates, addCompetitors{add})
	}
	if len(remove) > 0 {
		updates = append(updates, removeCompetitors{remove})
	}
	if len(addPages) > 0 {
		updates = append(updates, addKeyPages{addPages})
	}
	if len(removePages) > 0 {
		updates = append(updates, removeKeyPages{removePages})
	}
	summary := "竞品和重点页面与 SEO.md 一致"
	if len(lines) > 0 {
		summary = strings.Join(lines, "；")
	}
	return &SyncPlan{Updates: updates, Summary: summary}, nil
}
