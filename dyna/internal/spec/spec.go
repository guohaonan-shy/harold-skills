// Package spec reads what a spec says. A spec is a document with no status of its own: how far the work has
// got is the status:* label of the issues it lists. This package never touches GitHub.
//
// Layout: docs/spec/<slug>/<slug>.md, tickets in docs/spec/<slug>/tickets/.
package spec

import (
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

// IssueRef is an issue a spec covers: a GitHub number, or (Key set) a Linear key such as FA-577.
type IssueRef struct {
	Num int
	Key string
}

// IsKey reports whether the ref is a Linear key.
func (r IssueRef) IsKey() bool { return r.Key != "" }

// String is the ref as a bare value: "12" or "FA-577".
func (r IssueRef) String() string {
	if r.IsKey() {
		return r.Key
	}
	return strconv.Itoa(r.Num)
}

// Label is the ref as a person reads it: "#12" or "FA-577".
func (r IssueRef) Label() string {
	if r.IsKey() {
		return r.Key
	}
	return "#" + strconv.Itoa(r.Num)
}

var fmLine = regexp.MustCompile(`^(\w+):\s*(.*?)\s*(#.*)?$`)
var fmBlock = regexp.MustCompile(`^---\n([\s\S]*?)\n---`)

// Frontmatter reads the top-level `key: value` lines of the frontmatter.
func Frontmatter(md string) map[string]string {
	out := map[string]string{}
	m := fmBlock.FindStringSubmatch(md)
	if m == nil {
		return out
	}
	for _, line := range strings.Split(m[1], "\n") {
		if kv := fmLine.FindStringSubmatch(line); kv != nil {
			out[kv[1]] = kv[2]
		}
	}
	return out
}

var refRe = regexp.MustCompile(`[A-Za-z][A-Za-z0-9]*-\d+|\d+`)
var digits = regexp.MustCompile(`^\d+$`)

// IssuesOf is the issues a spec covers: frontmatter `issues: [12, FA-577]`.
func IssuesOf(md string) []IssueRef {
	raw := Frontmatter(md)["issues"]
	if raw == "" {
		return nil
	}
	var out []IssueRef
	for _, m := range refRe.FindAllString(raw, -1) {
		if digits.MatchString(m) {
			n, _ := strconv.Atoi(m)
			out = append(out, IssueRef{Num: n})
		} else {
			out = append(out, IssueRef{Key: m})
		}
	}
	return out
}

var headingRe = regexp.MustCompile(`^#{1,6}\s`)

// Section is the body of the first heading whose text includes title, up to the next heading of the same or
// higher level; ok is false when there is no such heading.
func Section(md, title string) (string, bool) {
	lines := strings.Split(md, "\n")
	start := -1
	for i, l := range lines {
		if headingRe.MatchString(l) && strings.Contains(l, title) {
			start = i
			break
		}
	}
	if start < 0 {
		return "", false
	}
	level := countHashes(lines[start])
	rest := lines[start+1:]
	end := len(rest)
	for i, l := range rest {
		if h := countHashesIfHeading(l); h > 0 && h <= level {
			end = i
			break
		}
	}
	return strings.Join(rest[:end], "\n"), true
}

func countHashes(l string) int {
	n := 0
	for n < len(l) && l[n] == '#' {
		n++
	}
	return n
}

var anyHeading = regexp.MustCompile(`^(#+)\s`)

func countHashesIfHeading(l string) int {
	if m := anyHeading.FindStringSubmatch(l); m != nil {
		return len(m[1])
	}
	return 0
}

var notTouching = regexp.MustCompile(`^\s*(>\s*)?不涉及`)

// TouchesUI: 「前端交互」 says 不涉及 → the spec does not touch UI. A missing section counts as touching nothing.
func TouchesUI(md string) bool {
	ui, ok := Section(md, "前端交互")
	return ok && !notTouching.MatchString(strings.TrimSpace(ui))
}

var grillRe = regexp.MustCompile(`(?m)^>\s*需要 grill`)

// NeedsGrill: the spec opens by saying it still needs a grill.
func NeedsGrill(md string) bool { return grillRe.MatchString(md) }

// HasFreezeSummary: the design is frozen — 「实现决策」 has a 「冻结摘要」.
func HasFreezeSummary(md string) bool {
	impl, _ := Section(md, "实现决策")
	_, ok := Section(impl, "冻结摘要")
	return ok
}

var forkRe = regexp.MustCompile(`^#{2,6}\s+待定`)

// ForHuman is what in the spec still waits for a human; empty when it can go ahead.
func ForHuman(md string) []string {
	var out []string
	if NeedsGrill(md) {
		out = append(out, "开头标着「需要 grill」")
	}
	impl, _ := Section(md, "实现决策")
	forks := 0
	for _, l := range strings.Split(impl, "\n") {
		if forkRe.MatchString(l) {
			forks++
		}
	}
	if forks > 0 {
		out = append(out, "「实现决策」里还有 "+strconv.Itoa(forks)+" 条「待定」")
	}
	return out
}

// Spec is one spec found under docs/spec/.
type Spec struct {
	Slug string
	File string
}

// Scan lists the specs under <docs>/spec/ (one directory each, holding <slug>.md).
func Scan(docs string) []Spec {
	root := filepath.Join(docs, "spec")
	entries, err := os.ReadDir(root)
	if err != nil {
		return nil
	}
	var specs []Spec
	for _, e := range entries {
		if !e.IsDir() || e.Name() == "tickets" {
			continue
		}
		file := filepath.Join(root, e.Name(), e.Name()+".md")
		if _, err := os.Stat(file); err != nil {
			continue
		}
		specs = append(specs, Spec{Slug: e.Name(), File: file})
	}
	sort.Slice(specs, func(i, j int) bool { return specs[i].Slug < specs[j].Slug })
	return specs
}

// Covering is the first spec under docs whose `issues:` lists ref, with its text; ok is false when none does.
func Covering(docs string, ref IssueRef) (slug, md string, ok bool) {
	for _, s := range Scan(docs) {
		b, err := os.ReadFile(s.File)
		if err != nil {
			continue
		}
		for _, x := range IssuesOf(string(b)) {
			if x == ref {
				return s.Slug, string(b), true
			}
		}
	}
	return "", "", false
}
