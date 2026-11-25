package pr

// A PR description is five sections for the person who decides the merge, plus one for SEO.
//
// The reader opens the PR with no context: the work was delegated, and they may only half remember the spec. They
// need what is wrong now, what this changes, proof that it changed, what merging risks, and what is left for them.
// Round-by-round review reports live in the PR's review loop (the session and its local file, see loop.go) and
// are archived to the PR as comments when it merges. Sections live between hidden markers, always appear in this
// order whatever order they were written in, and each carries a fixed heading written here:
//
//	problem    问题           what is wrong now, with a view showing it happened and how often
//	outline    概要           what this change does, in at most two views; the one section that may name code
//	evidence   证据           before / after of the same operation on the base branch and on this one, one pair per problem
//	risk       合并风险       the gate (双向 / 单向), the reach, up to three things to watch
//	your-todo  要你做的事      what only a person can do: checkboxes, then 说「合并」即可
//	live-check 上线自查的网址   SEO changes only: one live URL and its target word per line, checked after the merge goes live
//
// Writing a section checks its shape (structure.go): a missing view, an unpaired before / after, a risk without
// its gate, a to-do that is not a to-do, a code-level name where only a person reads. The description of a PR
// that was opened with the older, ten-section layout still carries those sections between their markers; the
// next write of any section drops every one of them (they are read by nobody now) and leaves the text outside
// the markers, the Refs line and the attribution, where it was. Each writer rewrites only its own section, so
// none clobbers another. Layout and who writes what: skills/engineering/pr/SKILL.md and its
// references/description.md, in the plugin.

import (
	"fmt"
	"regexp"
	"strings"
)

// Titles are the headings of the sections.
var Titles = map[string]string{
	"problem":    "问题",
	"outline":    "概要",
	"evidence":   "证据",
	"risk":       "合并风险",
	"your-todo":  "要你做的事",
	"live-check": "上线自查的网址",
}

// Sections are the section keys in the order they appear.
var Sections = []string{"problem", "outline", "evidence", "risk", "your-todo", "live-check"}

// legacySections are sections a description may still carry between markers from an earlier layout: the ten-section
// report (一句话, 怎么修, 怎么验证, 能否回滚, 夜里替你定的, 等你定的, 参考, and the 顺带开的 issue list that had
// become part of 能否回滚) and the older ones before it. None is read any more, so the next write drops them all
// without a word; the issues filed on the way are not part of the description at all.
var legacySections = []string{
	"summary", "changes", "verification", "rollback", "night-decided", "night-waiting", "reference", "issues",
	"review", "links", "before-merge", "after-merge", "before-after", "decisions",
}

// maxBody is the longest PR description GitHub takes, in UTF-16 units.
const maxBody = 65000

func validSection(name string) bool {
	_, ok := Titles[name]
	return ok
}

var (
	commentRe  = regexp.MustCompile(`(?s)<!--.*?-->`)
	linkRe     = regexp.MustCompile(`\]\([^)]*\)`)
	autoLinkRe = regexp.MustCompile(`<https?:[^>]*>`)
	urlRe      = regexp.MustCompile(`https?://[^` + spaceSet + `]+`)
)

func openMark(name string) string  { return fmt.Sprintf("<!-- idea-loop:section %s -->", name) }
func closeMark(name string) string { return fmt.Sprintf("<!-- /idea-loop:section %s -->", name) }
func heading(name string) string   { return "## " + Titles[name] }

// parsed is the text between the markers of the named sections, keyed by name, with the order they were looked
// for in.
type parsed struct {
	keys []string
	text map[string]string
}

func parse(body string, names []string) parsed {
	p := parsed{text: map[string]string{}}
	for _, name := range names {
		start := strings.Index(body, openMark(name))
		end := strings.Index(body, closeMark(name))
		if start != -1 && end > start {
			p.keys = append(p.keys, name)
			p.text[name] = trim(body[start+len(openMark(name)) : end])
		}
	}
	return p
}

// strip is the section content without the heading this package adds; a writer that included it anyway is forgiven.
func strip(name, text string) string {
	t := trim(text)
	if h := heading(name); strings.HasPrefix(t, h) {
		return trim(t[len(h):])
	}
	return t
}

func unknownSection(name string) error {
	return fmt.Errorf("unknown section %s; one of %s", name, strings.Join(Sections, ", "))
}

// GetSection is one section of a description, or ok=false when it has none.
func GetSection(body, name string) (text string, ok bool, err error) {
	if !validSection(name) {
		return "", false, unknownSection(name)
	}
	found, has := parse(body, Sections).text[name]
	if !has {
		return "", false, nil
	}
	return strip(name, found), true, nil
}

// SetSection replaces one section and re-emits every section in the fixed order. Text outside the markers (a
// human-written description, the Refs line, the attribution line) is kept, below the sections; sections of an
// earlier layout are dropped. Empty content removes the section. A section whose shape is wrong is refused with a
// *StructureError, before anything is built.
func SetSection(body, name, content string) (string, error) {
	if !validSection(name) {
		return "", unknownSection(name)
	}
	current := parse(body, Sections)
	if s := strip(name, content); s != "" {
		if problems, needsMenu := StructureProblems(name, s, strip("problem", current.text["problem"])); len(problems) > 0 {
			return "", &StructureError{Section: name, Problems: problems, NeedsMenu: needsMenu}
		}
	}
	sections := map[string]string{}
	for k, v := range current.text {
		sections[k] = strip(k, v)
	}
	rest := body
	removed := map[string]bool{}
	for _, n := range append(append([]string{}, current.keys...), parse(body, legacySections).keys...) {
		if removed[n] {
			continue
		}
		removed[n] = true
		start := strings.Index(rest, openMark(n))
		end := strings.Index(rest, closeMark(n))
		if start == -1 || end < start {
			continue
		}
		rest = rest[:start] + rest[end+len(closeMark(n)):]
	}
	rest = trim(rest)
	if s := strip(name, content); s != "" {
		sections[name] = s
	} else {
		delete(sections, name)
	}
	var out []string
	for _, n := range Sections {
		if sections[n] != "" {
			out = append(out, fmt.Sprintf("%s\n%s\n\n%s\n%s", openMark(n), heading(n), sections[n], closeMark(n)))
		}
	}
	if rest != "" {
		out = append(out, rest)
	}
	next := strings.Join(out, "\n\n") + "\n"
	if n := jsLen(next); n > maxBody {
		return "", fmt.Errorf("PR description would be %d characters (limit %d); shorten section %s", n, maxBody, name)
	}
	return next, nil
}
