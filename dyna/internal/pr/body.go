package pr

// A PR description is the review report, section by section.
//
// The reader is the person who decides the merge, opening the PR with no context: the work was delegated, and
// they may only half remember the spec. The description is the report written for that reader, one document
// start to finish: what the problem was, how it was fixed, how that was verified, what else got filed, what is
// left for them. Everything that is only for looking things up sits folded at the bottom. Round-by-round review
// reports live in the PR's review loop (the session and its local file, see loop.go), archived to the PR as
// comments when it merges; their conclusion is folded into the report. Sections live between hidden markers,
// always appear in this order whatever order they were written in, and each carries a fixed heading written here:
//
//	summary       一句话          who can now do what, or what got fixed
//	problem       问题            what was wrong (reproduced behaviour + the numbers), for a reader who never followed it
//	changes       怎么修          how it was fixed: the rules applied and their grounds, the slicing; before → after for pages
//	verification  怎么验证        one behaviour per line: how checked and the result, what was left unverified and why
//	rollback      能否回滚        if this turns out wrong after merging: can it be undone, how, what it touches; the
//	                              pre-existing problems found on the way and filed
//	live-check    上线自查的网址   SEO changes only: one live URL and its target word per line, checked after the merge goes live
//	night-decided 夜里替你定的    night-mode sessions only: each thing that needed a person and was settled by the
//	                              recommendation, with what was picked, why, and the other option
//	night-waiting 等你定的        night-mode sessions only: what the session stopped at because only a person may do it
//	your-todo     要你做的事      what to review, what to decide
//	reference     参考            folded: change map by module, spec & tickets, ledger, cleanup
//
// Everything outside `reference` is for a person, not for whoever fixes the code: a section carrying a code-level
// reference (backticks, file:line, a path, a snake_case name, a commit hash, a section number) is refused before
// it is written. Link and image addresses are not checked.
//
// Each writer rewrites only its own sections, so none clobbers another. The legacy `review` section and the
// 0.0.16 drafts' sections are dropped on the next write; legacy `header` / `ledger` blocks are left as text. A
// description opened when 顺带开的 issue was a section of its own still has it: the next write folds its list into
// 能否回滚, under the label IssuesLabel, and that list survives later writes of 能否回滚 unless the new text brings
// its own. Layout and who writes what: skills/engineering/pr/SKILL.md and its references/description.md, in the plugin.

import (
	"fmt"
	"regexp"
	"strings"
)

// Titles are the headings of the sections.
var Titles = map[string]string{
	"summary":       "一句话",
	"problem":       "问题",
	"changes":       "怎么修",
	"verification":  "怎么验证",
	"rollback":      "能否回滚",
	"live-check":    "上线自查的网址",
	"night-decided": "夜里替你定的",
	"night-waiting": "等你定的",
	"your-todo":     "要你做的事",
	"reference":     "参考",
}

// Sections are the section keys in the order they appear.
var Sections = []string{"summary", "problem", "changes", "verification", "rollback", "live-check", "night-decided", "night-waiting", "your-todo", "reference"}

// oldTitles are headings a section used to carry: a description written before the report shape still has them
// inside the markers, and they must not survive next to the new heading.
var oldTitles = map[string][]string{"changes": {"改了什么"}}

var legacySections = []string{"review", "links", "before-merge", "after-merge", "before-after", "decisions"}

const (
	// foldedSection is the section that became part of 能否回滚; its list is folded in rather than dropped.
	foldedSection = "issues"
	foldedHeading = "## 顺带开的 issue"
	// IssuesLabel labels the list of issues filed on the way, inside 能否回滚.
	IssuesLabel = "**顺带开的 issue**"
	// maxBody is the longest PR description GitHub takes, in UTF-16 units.
	maxBody = 65000
)

func validSection(name string) bool {
	_, ok := Titles[name]
	return ok
}

var (
	commentRe  = regexp.MustCompile(`(?s)<!--.*?-->`)
	linkRe     = regexp.MustCompile(`\]\([^)]*\)`)
	autoLinkRe = regexp.MustCompile(`<https?:[^>]*>`)
	urlRe      = regexp.MustCompile(`https?://[^` + spaceSet + `]+`)
	noneRe     = regexp.MustCompile(`^[（(]?无[）)]?$`)
)

// ReaderProblems are the code-level references in a section a person reads; link and image addresses are not
// text. `reference` is for looking things up, so it is never refused.
func ReaderProblems(name, content string) []string {
	if name == "reference" {
		return nil
	}
	text := commentRe.ReplaceAllString(content, "")
	text = linkRe.ReplaceAllString(text, "]")
	text = autoLinkRe.ReplaceAllString(text, "")
	text = urlRe.ReplaceAllString(text, "")
	return codeRefs(text)
}

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

// issuesToFold is the list of an old 顺带开的 issue section, without its heading; "" when it was empty or said 无.
func issuesToFold(body string) string {
	p := parse(body, []string{foldedSection})
	text, ok := p.text[foldedSection]
	if !ok {
		return ""
	}
	list := text
	if strings.HasPrefix(text, foldedHeading) {
		list = text[len(foldedHeading):]
	}
	list = trim(list)
	if list == "" || noneRe.MatchString(list) {
		return ""
	}
	return list
}

// issuesBlock is the labelled issue list at the end of a 能否回滚 section; "" when it has none.
func issuesBlock(text string) string {
	i := strings.Index(text, IssuesLabel)
	if i == -1 {
		return ""
	}
	return trim(text[i:])
}

// strip is the section content without the heading this package adds; a writer that included it anyway is forgiven.
func strip(name, text string) string {
	t := trim(text)
	heads := []string{heading(name)}
	for _, title := range oldTitles[name] {
		heads = append(heads, "## "+title)
	}
	for _, h := range heads {
		if strings.HasPrefix(t, h) {
			return trim(t[len(h):])
		}
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
// human-written description, the attribution line) is kept, below the sections. Empty content removes the section.
func SetSection(body, name, content string) (string, error) {
	if !validSection(name) {
		return "", unknownSection(name)
	}
	if problems := ReaderProblems(name, content); len(problems) > 0 {
		return "", fmt.Errorf("section %s is read by a person; say it in words, put code locations in reference:\n%s", name, strings.Join(problems, "\n"))
	}
	current := parse(body, Sections)
	sections := map[string]string{}
	for k, v := range current.text {
		sections[k] = v
	}
	folded := issuesToFold(body)
	rest := body
	removed := map[string]bool{}
	for _, n := range append(append([]string{}, current.keys...), parse(body, append(append([]string{}, legacySections...), foldedSection)).keys...) {
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
	for n := range sections {
		sections[n] = strip(n, sections[n])
	}
	before := sections["rollback"]
	if s := strip(name, content); content != "" && s != "" {
		sections[name] = s
	} else {
		delete(sections, name)
	}
	// the issue list outlives a rewrite of 能否回滚 that does not mention issues itself
	carried := ""
	if name == "rollback" {
		carried = issuesBlock(before)
	}
	if name == "rollback" && sections["rollback"] != "" && carried != "" && !strings.Contains(sections["rollback"], IssuesLabel) {
		sections["rollback"] = sections["rollback"] + "\n\n" + carried
	}
	if folded != "" {
		own := sections["rollback"]
		if !strings.Contains(own, IssuesLabel) {
			if own != "" {
				sections["rollback"] = own + "\n\n" + IssuesLabel + "\n\n" + folded
			} else {
				sections["rollback"] = IssuesLabel + "\n\n" + folded
			}
		}
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
		return "", fmt.Errorf("PR description would be %d characters (limit %d); fold or shorten section %s", n, maxBody, name)
	}
	return next, nil
}
