package runtime

// The local override: <home>/runtime/<environment>.md. A device whose way of doing a capability differs from the
// plugin's data writes the sections it changes there; the section with the same level and title is replaced whole.
// Nothing is appended and nothing is guessed: a section that does not match is reported and left out.

import (
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/home"
)

// InjectLimit is how long a SessionStart hook's output may be before the host cuts it.
const InjectLimit = 10000

var headingLine = regexp.MustCompile(`^(#{1,6})[ \t]+(.*?)[ \t]*$`)

type heading struct {
	line, level int
	title       string
}

// headingsOf are the headings of a text, a line in a code fence never one.
func headingsOf(lines []string) []heading {
	var out []heading
	fenced := false
	for i, line := range lines {
		t := strings.TrimSpace(line)
		if strings.HasPrefix(t, "```") || strings.HasPrefix(t, "~~~") {
			fenced = !fenced
			continue
		}
		if fenced {
			continue
		}
		if m := headingLine.FindStringSubmatch(line); m != nil {
			out = append(out, heading{line: i, level: len(m[1]), title: m[2]})
		}
	}
	return out
}

// endOf is the line a heading's section stops at: the next heading of the same or a higher level.
func endOf(hs []heading, i, total int) int {
	for _, h := range hs[i+1:] {
		if h.level <= hs[i].level {
			return h.line
		}
	}
	return total
}

// piece is one section of the override file: a `##` or `###` heading and everything up to the next heading of the
// same or a higher level (so a `##` carries its `###`).
type piece struct {
	level      int
	title      string
	start, end int
}

func piecesOf(lines []string) []piece {
	var out []piece
	hs := headingsOf(lines)
	for i := 0; i < len(hs); i++ {
		h := hs[i]
		if h.level == 2 || h.level == 3 {
			p := piece{level: h.level, title: h.title, start: h.line, end: endOf(hs, i, len(lines))}
			out = append(out, p)
			// the headings inside this section belong to it
			for i+1 < len(hs) && hs[i+1].line < p.end {
				i++
			}
		}
	}
	return out
}

// replacement is one plugin section the override took over.
type replacement struct {
	level         int
	title, parent string // parent is the `##` a `###` sits under in the plugin
	start, end    int    // the plugin's lines
	with          []string
}

// merged is the plugin text with the override's sections in, and what happened to each section of the override.
type merged struct {
	text      string
	replaced  []replacement // in the order the override file lists them
	unmatched []string      // each: 「title」（why）
	noPieces  bool          // the override has no `##` / `###` section at all
}

// merge puts the override's sections into the plugin's text.
func merge(pluginText, localText string) merged {
	pl := strings.Split(pluginText, "\n")
	ll := strings.Split(localText, "\n")
	phs := headingsOf(pl)
	locals := piecesOf(ll)
	m := merged{noPieces: len(locals) == 0}

	type hit struct {
		r     replacement
		order int
	}
	var hits []hit
	seen := map[string]bool{}
	for i, p := range locals {
		key := strconv.Itoa(p.level) + " " + p.title
		if seen[key] {
			m.unmatched = append(m.unmatched, "「"+p.title+"」（本机文件里重复，用的是第一段）")
			continue
		}
		seen[key] = true
		var found []int
		for j, h := range phs {
			if h.level == p.level && h.title == p.title {
				found = append(found, j)
			}
		}
		switch {
		case len(found) == 0:
			m.unmatched = append(m.unmatched, "「"+p.title+"」（插件里没有同级同名的一节）")
			continue
		case len(found) > 1:
			m.unmatched = append(m.unmatched, "「"+p.title+"」（插件里同级同名的有 "+strconv.Itoa(len(found))+" 处）")
			continue
		}
		j := found[0]
		r := replacement{level: p.level, title: p.title, start: phs[j].line, end: endOf(phs, j, len(pl)), with: ll[p.start:p.end]}
		for k := j - 1; k >= 0; k-- {
			if phs[k].level == 2 {
				r.parent = phs[k].title
				break
			}
		}
		hits = append(hits, hit{r, i})
	}

	// apply from the top of the plugin; a section inside one already replaced is covered by it
	byPlace := make([]hit, len(hits))
	copy(byPlace, hits)
	sort.SliceStable(byPlace, func(a, b int) bool {
		if byPlace[a].r.start != byPlace[b].r.start {
			return byPlace[a].r.start < byPlace[b].r.start
		}
		return byPlace[a].r.end > byPlace[b].r.end
	})
	var applied []replacement
	covered := map[int]string{}
	lastEnd, lastTitle := 0, ""
	for _, h := range byPlace {
		if len(applied) > 0 && h.r.start < lastEnd {
			covered[h.order] = lastTitle
			continue
		}
		applied = append(applied, h.r)
		lastEnd, lastTitle = h.r.end, h.r.title
	}
	var out []string
	cursor := 0
	for _, r := range applied {
		out = append(out, pl[cursor:r.start]...)
		out = append(out, trimBlankTail(r.with)...)
		out = append(out, blankTail(pl[r.start:r.end])...)
		cursor = r.end
	}
	out = append(out, pl[cursor:]...)
	m.text = strings.Join(out, "\n")

	for _, h := range hits {
		if by, ok := covered[h.order]; ok {
			m.unmatched = append(m.unmatched, "「"+h.r.title+"」（已被同文件里更大的一节「"+by+"」整段换掉）")
			continue
		}
		m.replaced = append(m.replaced, h.r)
	}
	return m
}

func trimBlankTail(lines []string) []string {
	n := len(lines)
	for n > 0 && strings.TrimSpace(lines[n-1]) == "" {
		n--
	}
	return lines[:n]
}

// blankTail is the empty lines a section ends with, so the replacement leaves the same gap before what follows.
func blankTail(lines []string) []string {
	n := len(trimBlankTail(lines))
	return lines[n:]
}

// override is what is on this device for one environment.
type override struct {
	path string
	text string
	// failure is why the file could not be read; empty when it was read or is not there.
	failure string
	present bool
}

// loadOverride reads <home>/runtime/<name>.md. No home, or no file, is no override; a file that cannot be read is
// reported and counts as none.
func loadOverride(name string, env home.Env) override {
	h := home.Dir(env)
	if h == "" || !filepath.IsAbs(h) {
		return override{}
	}
	path := filepath.Join(h, DataDir, name+".md")
	if st, err := os.Stat(h); err != nil || !st.IsDir() {
		return override{}
	}
	if _, err := os.Stat(path); err != nil {
		if os.IsNotExist(err) {
			return override{}
		}
		return override{path: path, failure: err.Error()}
	}
	b, err := os.ReadFile(path)
	if err != nil {
		return override{path: path, failure: err.Error()}
	}
	if !utf8.Valid(b) {
		return override{path: path, failure: path + " 不是 UTF-8 文本"}
	}
	return override{path: path, text: string(b), present: true}
}

func (o override) failedLine() string { return "本机覆盖读取失败：" + o.failure }

// titles is 「a」「b」.
func titles(rs []replacement) string {
	var b strings.Builder
	for _, r := range rs {
		b.WriteString("「" + r.title + "」")
	}
	return b.String()
}

// header is the first line of the injection: where the override is and what became of its sections.
func (o override) header(m merged) string {
	switch {
	case m.noPieces:
		return "本机覆盖 " + o.path + "：文件里没有 ## 或 ### 小节，没替换任何一节。"
	case len(m.replaced) == 0:
		return "本机覆盖 " + o.path + "：没替换任何一节；没对上、没用上：" + strings.Join(m.unmatched, "") + "。"
	}
	line := "本机覆盖 " + o.path + "：替换了" + titles(m.replaced)
	if len(m.unmatched) > 0 {
		line += "；没对上、没用上：" + strings.Join(m.unmatched, "")
	}
	return line + "。"
}

func runeCount(s string) int { return utf8.RuneCountInString(s) }

// leadOf is the line `show` puts before a capability's section when some of it is the override's: the whole
// section, or the `###` parts of it.
func leadOf(o override, m merged, capability string) string {
	var parts []replacement
	for _, r := range m.replaced {
		if r.level == 2 && r.title == capability {
			return "本机覆盖 " + o.path + "：这一节是本机写的\n"
		}
		if r.level == 3 && r.parent == capability {
			parts = append(parts, r)
		}
	}
	if len(parts) == 0 {
		return ""
	}
	return "本机覆盖 " + o.path + "：这一节里" + titles(parts) + "是本机写的\n"
}
