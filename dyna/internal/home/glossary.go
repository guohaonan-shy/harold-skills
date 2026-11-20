package home

import (
	"fmt"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"unicode"
)

// GLOSSARY.md lint: the format half of the glossary rules in wiki-conventions (references/glossary.md, 「文件与格式」), made falsifiable.
//
// The failure it guards against is a glossary that slowly turns into a spec: field values, code constants, file
// paths and mechanism write-ups creep in one reasonable-looking line at a time. So this does not ask whether
// something is implementation detail; it checks the shapes that implementation detail almost always leaves behind
// (a backtick, a path, a link, a `2=listen_repeat` mapping, a definition grown past two sentences) and refuses
// them. It does not judge content: whether a term belongs, whether a definition is right.

// GlossarySections are the only two H2 sections a glossary may have, in this order. 术语 is required.
var GlossarySections = []string{"术语", "歧义词"}

const maxSentences = 2

type forbidden struct {
	name, why string
	hit       func(line string) bool
}

var (
	reBacktick = regexp.MustCompile("`")
	reLink     = regexp.MustCompile(`(?i)\]\(|https?://|<[a-z]+://`)
	rePath     = regexp.MustCompile(`(?i)(?:^|[\s\p{Z}(（:：])\.{1,2}/|\b[\w-]+/[\w./-]*\.[a-z][a-z0-9]{0,4}\b`)
	reMapping  = regexp.MustCompile(`\d+\s*[=＝]\s*\S`)
)

// hasMapping is `(?<![\w.])\d+\s*[=＝]\s*\S` (Go's regexp has no lookbehind): a digit run that is not the tail of a
// word or a number.
func hasMapping(line string) bool {
	for pos := 0; pos <= len(line); {
		loc := reMapping.FindStringIndex(line[pos:])
		if loc == nil {
			return false
		}
		start := pos + loc[0]
		ok := true
		if start > 0 {
			prev := []rune(line[:start])
			c := prev[len(prev)-1]
			ok = !(c == '_' || c == '.' || (c < 128 && (unicode.IsLetter(c) || unicode.IsDigit(c))))
		}
		if ok {
			return true
		}
		pos = start + 1
	}
	return false
}

var forbiddenShapes = []forbidden{
	{"反引号", "代码标识符属于代码或 AGENTS.md，不属于术语表", reBacktick.MatchString},
	{"链接", "术语表不链出去，其他文档反过来用它的叫法", reLink.MatchString},
	{"文件路径", "路径会烂，也不是「它是什么」", rePath.MatchString},
	{"取值映射", "字段取值、枚举编码进 AGENTS.md 的表结构那节", hasMapping},
}

var (
	reHeading  = regexp.MustCompile(`^(#{1,6})\s+(.+?)\s*#*\s*$`)
	reTermHead = regexp.MustCompile(`^\*\*(.+?)\*\*\s*[：:]\s*$`)
	reAvoid    = regexp.MustCompile(`^_Avoid_\s*[：:]\s*(.*)$`)
	reAmbig    = regexp.MustCompile(`^[-*]\s+\*\*(.+?)\*\*\s*[：:]\s*(.*)$`)
	reParen    = regexp.MustCompile(`（[^）]*）|\([^)]*\)`)
	reSplitAvd = regexp.MustCompile(`[,，、;；]`)
	reLineNo   = regexp.MustCompile(`^第 (\d+) 行`)
)

func isTerminator(r rune) bool { return strings.ContainsRune("。！？!?", r) }

// CountSentences counts sentences. Terminators are 。！？!? and a period followed by whitespace or the end of the
// text, so 0.5, v2.0 and a decimal band never split. Trailing text with no terminator counts.
func CountSentences(text string) int {
	var parts []string
	var cur []rune
	rs := []rune(text)
	for i := 0; i < len(rs); i++ {
		r := rs[i]
		switch {
		case isTerminator(r):
			for i+1 < len(rs) && isTerminator(rs[i+1]) {
				i++
			}
			parts = append(parts, string(cur))
			cur = nil
		case r == '.' && (i+1 == len(rs) || unicode.IsSpace(rs[i+1])):
			parts = append(parts, string(cur))
			cur = nil
		default:
			cur = append(cur, r)
		}
	}
	parts = append(parts, string(cur))
	n := 0
	for _, p := range parts {
		if strings.Map(func(r rune) rune {
			if unicode.IsSpace(r) || strings.ContainsRune(`)）"”'’`, r) {
				return -1
			}
			return r
		}, p) != "" {
			n++
		}
	}
	return n
}

// AvoidWords splits an _Avoid_ list into bare words: parentheticals dropped, separated by , ， 、 ; ；
func AvoidWords(list string) []string {
	var out []string
	for _, w := range reSplitAvd.Split(reParen.ReplaceAllString(list, ""), -1) {
		if w = strings.TrimSpace(w); w != "" {
			out = append(out, w)
		}
	}
	if out == nil {
		out = []string{}
	}
	return out
}

// GlossaryTerm is one entry of the 术语 section.
type GlossaryTerm struct {
	Name       string   `json:"name"`
	Line       int      `json:"line"`
	Definition string   `json:"definition"`
	Avoid      []string `json:"avoid"`
}

// GlossaryAmbiguous is one entry of the 歧义词 section.
type GlossaryAmbiguous struct {
	Word string `json:"word"`
	Line int    `json:"line"`
}

// GlossaryResult is what CheckGlossary found.
type GlossaryResult struct {
	Valid     bool                `json:"valid"`
	Errors    []string            `json:"errors"`
	Terms     []GlossaryTerm      `json:"terms"`
	Ambiguous []GlossaryAmbiguous `json:"ambiguous"`
}

type heading struct {
	level int
	title string
	i     int
}

func norm(s string) string { return strings.ToLower(strings.TrimSpace(s)) }

// CheckGlossary checks one GLOSSARY.md. Errors are human-readable, each prefixed with its line number.
func CheckGlossary(markdown string) GlossaryResult {
	lines := strings.Split(strings.ReplaceAll(markdown, "\r\n", "\n"), "\n")
	errs := []string{}
	at := func(i int, msg string) { errs = append(errs, fmt.Sprintf("第 %d 行：%s", i+1, msg)) }
	terms := []GlossaryTerm{}
	var ambiguous []struct {
		word string
		line int
		text string
	}

	// forbidden shapes, every line
	for i, line := range lines {
		for _, f := range forbiddenShapes {
			if f.hit(line) {
				at(i, fmt.Sprintf("出现%s——%s", f.name, f.why))
			}
		}
	}

	// headings
	var heads []heading
	for i, line := range lines {
		if m := reHeading.FindStringSubmatch(line); m != nil {
			heads = append(heads, heading{len(m[1]), strings.TrimSpace(m[2]), i})
		}
	}
	var h1s, h2s []heading
	for _, h := range heads {
		switch h.level {
		case 1:
			h1s = append(h1s, h)
		case 2:
			h2s = append(h2s, h)
		}
	}
	if len(h1s) == 0 {
		errs = append(errs, "缺一级标题（# {上下文名}）")
	}
	if len(h1s) > 1 {
		at(h1s[1].i, fmt.Sprintf("一级标题只能有一个，这里又出现「%s」", h1s[1].title))
	}
	firstContent := -1
	for i, l := range lines {
		if strings.TrimSpace(l) != "" {
			firstContent = i
			break
		}
	}
	if len(h1s) > 0 && firstContent != h1s[0].i {
		at(firstContent, "一级标题之前不能有内容")
	}
	for _, h := range heads {
		if h.level >= 4 {
			at(h.i, fmt.Sprintf("不允许 %s 级标题——术语表最深到 ### 分组", strings.Repeat("#", h.level)))
		}
	}
	known := func(title string) bool {
		for _, s := range GlossarySections {
			if s == title {
				return true
			}
		}
		return false
	}
	for _, h := range h2s {
		if !known(h.title) {
			at(h.i, fmt.Sprintf("二级标题只能是 %s，不能是「%s」", strings.Join(GlossarySections, " / "), h.title))
		}
	}
	seen := map[string]bool{}
	var order []string
	for _, h := range h2s {
		if !known(h.title) {
			continue
		}
		if seen[h.title] {
			at(h.i, fmt.Sprintf("「%s」重复出现", h.title))
		}
		seen[h.title] = true
		order = append(order, h.title)
	}
	if !seen["术语"] {
		errs = append(errs, "缺「## 术语」这一节")
	}
	idx := func(title string) int {
		for i, t := range order {
			if t == title {
				return i
			}
		}
		return -1
	}
	if idx("歧义词") != -1 && idx("术语") > idx("歧义词") {
		errs = append(errs, fmt.Sprintf("两节顺序不对：应为 %s", strings.Join(GlossarySections, " → ")))
	}

	// the description between the H1 and the first H2
	if len(h1s) > 0 {
		start := h1s[0].i + 1
		end := len(lines)
		if len(h2s) > 0 {
			end = h2s[0].i
		}
		var body []string
		for _, l := range lines[start:max(start, end)] {
			if strings.TrimSpace(l) != "" {
				body = append(body, l)
			}
		}
		anyHeading, text := false, []string{}
		for _, l := range body {
			if reHeading.MatchString(l) {
				anyHeading = true
			} else {
				text = append(text, l)
			}
		}
		if anyHeading {
			at(start, "一级标题和第一个二级标题之间只放描述，不放别的标题")
		}
		joined := strings.Join(text, " ")
		if strings.TrimSpace(joined) == "" {
			at(h1s[0].i, "一级标题下缺一到两句描述：这个上下文是什么、为什么存在")
		} else if n := CountSentences(joined); n > maxSentences {
			at(start, fmt.Sprintf("描述超过 %d 句（%d 句）", maxSentences, n))
		}
	}

	// section bodies
	sectionRange := func(title string) (int, int, bool) {
		for k, h := range h2s {
			if h.title == title {
				end := len(lines)
				if k+1 < len(h2s) {
					end = h2s[k+1].i
				}
				return h.i + 1, end, true
			}
		}
		return 0, 0, false
	}

	if from, to, ok := sectionRange("术语"); ok {
		type entry struct {
			name     string
			line     int
			defLines []string
			avoid    []string
			hasAvoid bool
			state    string // def | gap | done
		}
		var cur *entry
		flush := func() {
			if cur == nil {
				return
			}
			definition := strings.TrimSpace(strings.Join(cur.defLines, " "))
			if definition == "" {
				at(cur.line, fmt.Sprintf("词条「%s」缺定义", cur.name))
			} else if n := CountSentences(definition); n > maxSentences {
				at(cur.line, fmt.Sprintf("词条「%s」的定义超过 %d 句（%d 句）——写它是什么，机制挪去 docs/domain", cur.name, maxSentences, n))
			}
			avoid := cur.avoid
			if avoid == nil {
				avoid = []string{}
			}
			terms = append(terms, GlossaryTerm{Name: cur.name, Line: cur.line + 1, Definition: definition, Avoid: avoid})
			cur = nil
		}
		for i := from; i < to; i++ {
			line := strings.TrimSpace(lines[i])
			if line == "" {
				if cur != nil && len(cur.defLines) > 0 && cur.state == "def" {
					cur.state = "gap"
				}
				continue
			}
			if reHeading.MatchString(line) {
				flush()
				continue
			}
			if m := reTermHead.FindStringSubmatch(line); m != nil {
				flush()
				cur = &entry{name: strings.TrimSpace(m[1]), line: i, state: "def"}
				continue
			}
			if cur == nil {
				at(i, "「术语」下只放词条（**词条名**：+ 定义 + 可选 _Avoid_），这一行不属于任何词条")
				continue
			}
			if m := reAvoid.FindStringSubmatch(line); m != nil {
				if cur.hasAvoid {
					at(i, fmt.Sprintf("词条「%s」有两行 _Avoid_", cur.name))
				}
				cur.avoid = AvoidWords(m[1])
				cur.hasAvoid = true
				if len(cur.avoid) == 0 {
					at(i, fmt.Sprintf("词条「%s」的 _Avoid_ 是空的", cur.name))
				}
				cur.state = "done"
				continue
			}
			if cur.state == "def" {
				cur.defLines = append(cur.defLines, line)
			} else {
				at(i, fmt.Sprintf("词条「%s」下有多余内容——词条只有定义和 _Avoid_ 两部分", cur.name))
			}
		}
		flush()

		byName := map[string]GlossaryTerm{}
		for _, t := range terms {
			k := norm(t.Name)
			if first, dup := byName[k]; dup {
				errs = append(errs, fmt.Sprintf("第 %d 行：词条「%s」重复（第 %d 行已有）", t.Line, t.Name, first.Line))
			} else {
				byName[k] = t
			}
		}
		for _, t := range terms {
			for _, w := range t.Avoid {
				if other, ok := byName[norm(w)]; ok && other.Line != t.Line {
					errs = append(errs, fmt.Sprintf("第 %d 行：「%s」在「%s」的 _Avoid_ 里，却又是第 %d 行的词条——一个词不能既是标准叫法又被弃用", t.Line, w, t.Name, other.Line))
				}
			}
		}
	}

	if from, to, ok := sectionRange("歧义词"); ok {
		last := -1
		for i := from; i < to; i++ {
			raw := lines[i]
			if strings.TrimSpace(raw) == "" {
				continue
			}
			if m := reAmbig.FindStringSubmatch(strings.TrimSpace(raw)); m != nil && !startsWithSpace(raw) {
				ambiguous = append(ambiguous, struct {
					word string
					line int
					text string
				}{strings.TrimSpace(m[1]), i, m[2]})
				last = len(ambiguous) - 1
				continue
			}
			if last >= 0 && startsWithSpace(raw) {
				ambiguous[last].text += " " + strings.TrimSpace(raw)
				continue
			}
			at(i, "「歧义词」下只放列表项：- **词**：可能指哪几样，单独出现时该怎么说")
		}
		seenWords := map[string]bool{}
		for _, a := range ambiguous {
			if strings.TrimSpace(a.text) == "" {
				at(a.line, fmt.Sprintf("歧义词「%s」缺说明", a.word))
			} else if CountSentences(a.text) > maxSentences {
				at(a.line, fmt.Sprintf("歧义词「%s」的说明超过 %d 句", a.word, maxSentences))
			}
			k := norm(a.word)
			if seenWords[k] {
				at(a.line, fmt.Sprintf("歧义词「%s」重复", a.word))
			} else {
				seenWords[k] = true
			}
		}
	}

	// document order: line-numbered errors by line, file-level ones (no line) first
	lineOf := func(e string) int {
		if m := reLineNo.FindStringSubmatch(e); m != nil {
			n, _ := strconv.Atoi(m[1])
			return n
		}
		return 0
	}
	sort.SliceStable(errs, func(a, b int) bool { return lineOf(errs[a]) < lineOf(errs[b]) })

	amb := []GlossaryAmbiguous{}
	for _, a := range ambiguous {
		amb = append(amb, GlossaryAmbiguous{Word: a.word, Line: a.line + 1})
	}
	return GlossaryResult{Valid: len(errs) == 0, Errors: errs, Terms: terms, Ambiguous: amb}
}

func startsWithSpace(s string) bool {
	for _, r := range s {
		return unicode.IsSpace(r)
	}
	return false
}

// RenderGlossaryReport is the human-readable result.
func RenderGlossaryReport(r GlossaryResult, file string) string {
	where := ""
	if file != "" {
		where = " (" + file + ")"
	}
	if r.Valid {
		return "glossary-check: green ✓" + where
	}
	out := []string{fmt.Sprintf("glossary-check: %d 处不符合 skills/productivity/wiki-conventions/references/glossary.md 的「文件与格式」%s：", len(r.Errors), where)}
	for _, e := range r.Errors {
		out = append(out, "  - "+e)
	}
	return strings.Join(out, "\n")
}

// GlossaryHookReply is what the PostToolUse hook tells the model when a GLOSSARY.md it just wrote breaks the format.
func GlossaryHookReply(r GlossaryResult, file string) string {
	return RenderGlossaryReport(r, file) + "\n\n改到通过再继续。格式规则见 idea-loop 的 skills/productivity/wiki-conventions/references/glossary.md 的「文件与格式」；" +
		"挪出去的内容按「收什么：三问全过才收」里那张去处表放。"
}
