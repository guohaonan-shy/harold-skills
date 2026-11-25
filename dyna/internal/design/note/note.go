// Package note is `dyna design note submit`: the shape check at the end of `uiux-imagine`.
//
// The divergent half of the design loop produces exactly one artifact that survives it: the direction note.
// Everything else it renders exists only to provoke a reaction in the room and is thrown away. So the note carries
// the whole run, and a note missing a section is a run that quietly dropped part of its job: most often 「待打磨清单」
// or 「验收矩阵」, the two written for the NEXT skill rather than for the human in the room.
//
// This does not judge the note's content, only its shape: the seven fixed sections, at one heading level, in order,
// each with something in it, and a complete composition list for every chosen variant inside 「变种裁决」, every item
// of which says where it came from (人选定 / 模型代填).
//
// The level is not pinned to `##` on purpose: the note usually sits at `##` in its own file under
// <repo>/docs/design/tmp/<spec-slug>/imagine/, but a note quoted one level deeper elsewhere checks the same.
package note

import (
	"fmt"
	"regexp"
	"sort"
	"strings"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/design/jsx"
)

// Sections are the seven sections, in the order they must appear. Closed set.
var Sections = []string{"意图", "高度记录", "结构", "变种裁决", "待打磨清单", "约束与素材", "验收矩阵"}

// Composition is the list every SELECTED variant carries inside 「变种裁决」. Closed set.
//
// The note is a letter and refine never sees the renders, so whatever the chosen variant looked like has to be
// spelled out item by item. 「待打磨」 is a legal value: it says the item was not decided here and is parked for
// convergence, which is different from silently not writing it.
var Composition = []string{"容器形状", "指向", "锚点与位置", "尺寸与字号", "颜色", "出现与消失"}

// Provenance is where each composition item came from, written at the END of its line: `- 颜色：白底（人选定）`.
// Closed set of two. Convergence reads the marker: a finding that would move a human-chosen item goes to the human
// instead of being applied.
var Provenance = []string{"人选定", "模型代填"}

type heading struct {
	level int
	title string
	line  int
	index int
}

var (
	reFence   = jsx.Re("^\\s*(`{3,}|~{3,})", "")
	reHeading = jsx.Re(`^(#{1,6})\s+(.+?)\s*#*\s*$`, "")
	reNewline = regexp.MustCompile(`\r?\n`)
	reMarker  = jsx.Re(`^\s*(?:[-*]\s+)?\*\*构成[^*]*\*\*`, "")
	reStopper = jsx.Re(`^(?:[-*]\s|#)`, "")
	reName    = jsx.Re(`\*\*(构成[^*]*)\*\*`, "")
	reTail    = jsx.Re(`（([^（）]*)）$`, "")
)

func contains(xs []string, x string) bool {
	for _, y := range xs {
		if y == x {
			return true
		}
	}
	return false
}

func splitLines(md string) []string { return reNewline.Split(md, -1) }

// headings parses ATX headings, skipping fenced code blocks: a note that shows its own template in a ```md fence
// would otherwise report every section twice.
func headings(md string) []heading {
	var out []heading
	fence := byte(0)
	for i, raw := range splitLines(md) {
		line := jsx.TrimEnd(raw)
		if m := reFence.FindStringSubmatch(line); m != nil {
			if fence == 0 {
				fence = m[1][0]
			} else if m[1][0] == fence {
				fence = 0
			}
			continue
		}
		if fence != 0 {
			continue
		}
		if m := reHeading.FindStringSubmatch(line); m != nil {
			out = append(out, heading{level: len(m[1]), title: jsx.Trim(m[2]), line: i + 1})
		}
	}
	for i := range out {
		out[i].index = i
	}
	return out
}

// nextSibling is the first heading after index at the same or a shallower level.
func nextSibling(all []heading, index int) *heading {
	for i := index + 1; i < len(all); i++ {
		if all[i].level <= all[index].level {
			return &all[i]
		}
	}
	return nil
}

func slice(lines []string, from, to int) []string {
	if from > len(lines) {
		from = len(lines)
	}
	if to > len(lines) {
		to = len(lines)
	}
	if from >= to {
		return nil
	}
	return lines[from:to]
}

// bodyOf is the lines between a heading and the next same-or-shallower one.
func bodyOf(lines []string, all []heading, index int) []string {
	here := all[index]
	end := len(lines)
	if next := nextSibling(all, index); next != nil {
		end = next.line - 1
	}
	return slice(lines, here.line, end)
}

// hasBody is whether anything but blank lines sits between this heading and the next same-or-shallower one.
func hasBody(lines []string, all []heading, index int) bool {
	for _, l := range bodyOf(lines, all, index) {
		if jsx.Trim(l) != "" {
			return true
		}
	}
	return false
}

// Result is what one check found. Level is 0 when the seven were not found as a coherent set.
type Result struct {
	Valid   bool
	Errors  []string
	Missing []string
	Level   int
}

// Check checks one direction note's shape. `Missing` lists sections that are absent outright; a present-but-empty
// section is an error too, but it is reported as empty rather than missing so the human knows the heading is
// already there.
func Check(markdown string) Result {
	all := headings(markdown)
	lines := splitLines(markdown)
	var errs []string

	var found []heading
	for _, h := range all {
		if contains(Sections, h.title) {
			found = append(found, h)
		}
	}
	if len(found) == 0 {
		return Result{Errors: []string{"方向说明一节都没有：缺 " + strings.Join(Sections, " / ")}, Missing: append([]string{}, Sections...)}
	}

	var levels []int
	count := map[int]int{}
	for _, h := range found {
		if count[h.level] == 0 {
			levels = append(levels, h.level)
		}
		count[h.level]++
	}
	sorted := append([]int{}, levels...)
	sort.SliceStable(sorted, func(i, j int) bool { return count[sorted[i]] > count[sorted[j]] })
	level := sorted[0]
	if len(levels) > 1 {
		var parts []string
		for _, h := range found {
			parts = append(parts, strings.Repeat("#", h.level)+" "+h.title)
		}
		errs = append(errs, "七节必须在同一层级（same level）："+strings.Join(parts, "、"))
	}

	var seen []heading
	index := map[string]heading{}
	for _, h := range found {
		if h.level != level {
			continue
		}
		if prev, ok := index[h.title]; ok {
			errs = append(errs, fmt.Sprintf("「%s」重复出现（第 %d 行与第 %d 行）", h.title, prev.line, h.line))
		} else {
			index[h.title] = h
			seen = append(seen, h)
		}
	}

	missing := []string{}
	for _, s := range Sections {
		if _, ok := index[s]; !ok {
			missing = append(missing, s)
			errs = append(errs, fmt.Sprintf("缺「%s」这一节", s))
		}
	}

	for _, h := range seen {
		if !hasBody(lines, all, h.index) {
			errs = append(errs, fmt.Sprintf("「%s」是空的——有标题没正文不算写过", h.title))
		}
	}

	if verdict, ok := index["变种裁决"]; ok && hasBody(lines, all, verdict.index) {
		errs = append(errs, CheckComposition(strings.Join(bodyOf(lines, all, verdict.index), "\n"))...)
	}

	var order, expected []string
	for _, h := range seen {
		order = append(order, h.title)
	}
	for _, s := range Sections {
		if _, ok := index[s]; ok {
			expected = append(expected, s)
		}
	}
	if strings.Join(order, "|") != strings.Join(expected, "|") {
		errs = append(errs, fmt.Sprintf("七节顺序不对：应为 %s，实际是 %s", strings.Join(Sections, " → "), strings.Join(order, " → ")))
	}

	first, last := found[0].line, found[len(found)-1].line
	for _, h := range all {
		if h.level != level || contains(Sections, h.title) {
			continue
		}
		if h.line > first && h.line < last {
			errs = append(errs, fmt.Sprintf("「%s」不是七节之一，却夹在七节中间——方向说明只有这七节", h.title))
		} else if h.line > last {
			errs = append(errs, fmt.Sprintf("「%s」不是七节之一——方向说明只有这七节，渲染物与 contact sheet 不进来", h.title))
		}
	}

	return Result{Valid: len(errs) == 0, Errors: errs, Missing: missing, Level: level}
}

// itemLine is the regexp for one composition item's line: `- 颜色：白底（人选定）`.
func itemLine(item string) *regexp.Regexp {
	return jsx.Re(`^\s*(?:[-*]\s+)?`+regexp.QuoteMeta(item)+`\s*[:：]\s*\S`, "")
}

// CheckComposition checks the 构成 blocks inside the 「变种裁决」 body. A block starts at a bold 「构成」 marker
// (`**构成**` or `**构成（B）**`) and runs until the next marker, the next top-level list item or heading. Each block
// must name all six items with something after the colon, and each item's line must end in a provenance marker.
func CheckComposition(verdictBody string) []string {
	var errs []string
	lines := splitLines(verdictBody)
	var starts []int
	for i, l := range lines {
		if reMarker.MatchString(l) {
			starts = append(starts, i)
		}
	}
	if len(starts) == 0 {
		return []string{fmt.Sprintf("「变种裁决」里没有选中变种的构成清单（**构成**：%s）——refine 看不到渲染物，选中的样子只能靠它", strings.Join(Composition, " / "))}
	}
	for n, start := range starts {
		end := -1
		for i := start + 1; i < len(lines); i++ {
			if reMarker.MatchString(lines[i]) || reStopper.MatchString(lines[i]) {
				end = i
				break
			}
		}
		if end == -1 {
			end = len(lines)
		}
		block := lines[start:end]
		name := reName.FindStringSubmatch(lines[start])[1]
		firstLine := func(item string) (string, bool) {
			re := itemLine(item)
			for _, l := range block {
				if re.MatchString(l) {
					return l, true
				}
			}
			return "", false
		}
		var miss []string
		for _, item := range Composition {
			if _, ok := firstLine(item); !ok {
				miss = append(miss, item)
			}
		}
		if len(miss) > 0 {
			errs = append(errs, fmt.Sprintf("第 %d 份「%s」缺：%s（没定的写「待打磨」，不要不写）", n+1, name, strings.Join(miss, " / ")))
		}
		var unmarked, wrong []string
		for _, item := range Composition {
			if contains(miss, item) {
				continue
			}
			line, _ := firstLine(item)
			tail := reTail.FindStringSubmatch(jsx.TrimEnd(line))
			switch {
			case tail == nil:
				unmarked = append(unmarked, item)
			case !contains(Provenance, tail[1]):
				wrong = append(wrong, fmt.Sprintf("%s（%s）", item, tail[1]))
			}
		}
		if len(unmarked) > 0 {
			errs = append(errs, fmt.Sprintf("第 %d 份「%s」缺来源标记：%s（每项行末标（%s），「待打磨」也要标）", n+1, name, strings.Join(unmarked, " / "), strings.Join(Provenance, "）或（")))
		}
		if len(wrong) > 0 {
			errs = append(errs, fmt.Sprintf("第 %d 份「%s」来源标记不对：%s（只能是（%s））", n+1, name, strings.Join(wrong, " / "), strings.Join(Provenance, "）或（")))
		}
	}
	return errs
}

// Report is the result as the text a person reads.
func Report(r Result, file string) string {
	at := ""
	if file != "" {
		at = " (" + file + ")"
	}
	if r.Valid {
		return "direction-note: green ✓" + at
	}
	lines := []string{"direction-note: 收工校验失败" + at + " —— 不要交给 refine，先补齐："}
	for _, e := range r.Errors {
		lines = append(lines, "  - "+e)
	}
	return strings.Join(lines, "\n")
}
