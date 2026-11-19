package spec

import (
	"regexp"
	"strconv"
	"strings"
)

// Verdict is what a spec says about one issue it covers: 存在 or 不存在.
type Verdict struct {
	Ref  IssueRef
	Word string
}

var (
	frontmatterBlock = regexp.MustCompile(`^---\n[\s\S]*?\n---\n?`)
	openingVerdict   = regexp.MustCompile(`^>\s*(?:#(\d+)|([A-Za-z][A-Za-z0-9]*-\d+))\s*(不存在|存在)\s*[：:]`)
	tableVerdict     = regexp.MustCompile(`^\|\s*#(\d+)\s*\|\s*(存在|不存在)\s*\|`)
	sectionStart     = regexp.MustCompile(`^##\s`)
)

// Verdicts is whether each covered issue exists, in the order the spec says it. Current specs open with one
// quoted line per issue, straight under the title: `> #12 存在：…` or `> #12 不存在：…` (a Linear issue by its key:
// `> FA-577 存在：…`). Specs written before that carry a 「验证」 table with a row per issue, `| #12 | 存在 | … |`;
// it is still read, and the opening lines win when both say something.
func Verdicts(md string) []Verdict {
	var out []Verdict
	set := func(ref IssueRef, word string, overwrite bool) {
		for i := range out {
			if out[i].Ref == ref {
				if overwrite {
					out[i].Word = word
				}
				return
			}
		}
		out = append(out, Verdict{Ref: ref, Word: word})
	}
	var opening []string
	for _, line := range strings.Split(frontmatterBlock.ReplaceAllString(md, ""), "\n") {
		if sectionStart.MatchString(line) {
			break
		}
		opening = append(opening, line)
	}
	for _, line := range opening {
		m := openingVerdict.FindStringSubmatch(line)
		if m == nil {
			continue
		}
		if m[1] != "" {
			n, _ := strconv.Atoi(m[1])
			set(IssueRef{Num: n}, m[3], true)
		} else {
			set(IssueRef{Key: m[2]}, m[3], true)
		}
	}
	table, _ := Section(md, "验证")
	for _, line := range strings.Split(table, "\n") {
		if m := tableVerdict.FindStringSubmatch(line); m != nil {
			n, _ := strconv.Atoi(m[1])
			set(IssueRef{Num: n}, m[2], false)
		}
	}
	return out
}

// AllAbsent: the spec lists issues and every one of them was verified as not existing.
func AllAbsent(md string) bool {
	list := IssuesOf(md)
	if len(list) == 0 {
		return false
	}
	words := map[IssueRef]string{}
	for _, v := range Verdicts(md) {
		words[v.Ref] = v.Word
	}
	for _, ref := range list {
		if words[ref] != "不存在" {
			return false
		}
	}
	return true
}
