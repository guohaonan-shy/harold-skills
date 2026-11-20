package research

// Light use: the structured file the researcher (`idea-loop:uiux-researcher`) hands back each design round, one item
// per judge opinion, each with a user path, pictures and a new design intent. Its shape is in
// skills/design/uiux-research/references/light-return.md; the full-page checks in check.go do not apply to it.

import (
	"fmt"
	"math"
	"regexp"
	"strings"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/frontmatter"
)

// NoReferenceLine is the standard line a "Mobbin not connected" return carries; the review report shows it where the
// pictures would be.
const NoReferenceLine = "这一轮没有参考图：Mobbin 没连上"

var (
	lightFields     = map[string][]string{"connected": {"mode", "mobbin", "items", "uncovered"}, "unavailable": {"mode", "mobbin", "message", "reason", "items"}}
	itemFields      = []string{"covers", "path", "intent", "overturns"}
	stepFields      = []string{"source", "saw", "did", "then", "images", "reading"}
	overturnFields  = []string{"ledger", "why"}
	uncoveredFields = []string{"opinion", "why"}
	// ledgerID is `<round>.<serial>`; round 0 holds what was carried over from before the ledger.
	ledgerID  = regexp.MustCompile(`^\d+\.\d+$`)
	stepWords = map[string]string{"saw": "看到什么", "did": "做了什么", "then": "接着看到什么"}
)

// LightResult is the light return checked.
type LightResult struct {
	Valid  bool     `json:"valid"`
	Errors []string `json:"errors"`
	Items  int      `json:"items"`
}

// LightContext is what the session handed the researcher: the judge opinion numbers (as text) and, when given, the
// ledger numbers an overturn must name one of (nil = not given).
type LightContext struct {
	FileExists func(rel string) bool
	Opinions   []string
	Ledger     []string
}

func asObj(v any) (*frontmatter.Map, bool) {
	m, ok := v.(*frontmatter.Map)
	return m, ok && m != nil
}

func lightText(v any) bool {
	s, ok := v.(string)
	return ok && strings.TrimSpace(s) != ""
}

// opinionKey is an opinion number as text: 1 and "1" are the same. ok is false for anything else.
func opinionKey(v any) (string, bool) {
	if s, ok := v.(string); ok {
		return s, true
	}
	if f, ok := v.(float64); ok && !math.IsInf(f, 0) && f == math.Trunc(f) {
		return frontmatter.Text(f), true
	}
	return "", false
}

func inList(xs []string, x string) bool {
	for _, y := range xs {
		if y == x {
			return true
		}
	}
	return false
}

func unknownFields(m *frontmatter.Map, allowed []string, where string, errs *[]string) {
	for _, f := range m.Keys() {
		if !inList(allowed, f) {
			*errs = append(*errs, fmt.Sprintf("%s有不认识的字段 %s", where, f))
		}
	}
}

// CheckLight checks the light return. data is the parsed file (objects as *frontmatter.Map, so fields keep their order).
func CheckLight(data any, ctx LightContext) LightResult {
	errs := []string{}
	top, ok := asObj(data)
	if !ok {
		return LightResult{Errors: []string{"交回的文件顶层要是一个对象"}}
	}
	if top.Get("mode") != "light" {
		errs = append(errs, `mode 要写 "light"`)
	}
	mobbin, _ := top.Get("mobbin").(string)
	if mobbin != "connected" && mobbin != "unavailable" {
		errs = append(errs, `mobbin 要写 "connected" 或 "unavailable"`)
		return LightResult{Errors: errs}
	}
	unknownFields(top, lightFields[mobbin], "文件顶层", &errs)

	if mobbin == "unavailable" {
		if top.Get("message") != NoReferenceLine {
			errs = append(errs, fmt.Sprintf("message 要写「%s」，报告照这句出", NoReferenceLine))
		}
		if !lightText(top.Get("reason")) {
			errs = append(errs, "reason 是空的：写下调用 Mobbin 时看到的错误")
		}
		if items, ok := top.Get("items").([]any); !ok || len(items) > 0 {
			errs = append(errs, "Mobbin 没连上时 items 要是空数组")
		}
		return LightResult{Valid: len(errs) == 0, Errors: errs}
	}

	items, ok := top.Get("items").([]any)
	if !ok {
		errs = append(errs, "items 要是数组")
		return LightResult{Errors: errs}
	}
	var known []string
	for _, o := range ctx.Opinions {
		if !inList(known, o) {
			known = append(known, o)
		}
	}
	coveredBy := map[string]int{}

	for i, raw := range items {
		name := fmt.Sprintf("第 %d 项", i+1)
		it, ok := asObj(raw)
		if !ok {
			errs = append(errs, name+"要是一个对象")
			continue
		}
		unknownFields(it, itemFields, name, &errs)

		covers, ok := it.Get("covers").([]any)
		allKeys := ok && len(covers) > 0
		for _, n := range covers {
			if _, isKey := opinionKey(n); !isKey {
				allKeys = false
			}
		}
		if !allKeys {
			errs = append(errs, name+"的 covers 要列出它覆盖的评委意见编号（至少一个）")
		} else {
			for _, n := range covers {
				k, _ := opinionKey(n)
				if !inList(known, k) {
					errs = append(errs, fmt.Sprintf("%s覆盖的评委意见 %s 不是这一轮给的意见编号", name, k))
				} else if at, seen := coveredBy[k]; seen {
					errs = append(errs, fmt.Sprintf("评委意见 %s 同时出现在两项里（第 %d 项和%s）：并成一项", k, at, name))
				} else {
					coveredBy[k] = i + 1
				}
			}
		}

		path, ok := it.Get("path").([]any)
		if !ok || len(path) == 0 {
			errs = append(errs, name+"缺用户路径（path：每步写看到什么、做了什么、接着看到什么）")
		} else {
			for n, rawStep := range path {
				sname := fmt.Sprintf("%s第 %d 步", name, n+1)
				st, ok := asObj(rawStep)
				if !ok {
					errs = append(errs, sname+"要是一个对象")
					continue
				}
				unknownFields(st, stepFields, sname, &errs)
				for _, f := range []string{"saw", "did", "then"} {
					if !lightText(st.Get(f)) {
						errs = append(errs, fmt.Sprintf("%s缺 %s（%s）", sname, f, stepWords[f]))
					}
				}
				if !lightText(st.Get("reading")) {
					errs = append(errs, sname+"缺解读（reading：一句话说这一步为什么这样做）")
				}
				images, ok := st.Get("images").([]any)
				if !ok || len(images) < 1 || len(images) > 2 {
					errs = append(errs, sname+"要配 1–2 张图（images）")
					continue
				}
				for _, img := range images {
					s, isStr := img.(string)
					switch {
					case !isStr || !isRelative(s):
						errs = append(errs, fmt.Sprintf("%s的图 %s 不是落图目录内的相对路径", sname, frontmatter.Text(img)))
					case !ctx.FileExists(s):
						errs = append(errs, fmt.Sprintf("%s的图 %s 在落图目录里不存在", sname, s))
					}
				}
			}
		}

		if !lightText(it.Get("intent")) {
			errs = append(errs, name+"缺新的设计意图（intent：一句话）")
		}

		if it.Has("overturns") {
			overturns, ok := it.Get("overturns").([]any)
			if !ok {
				errs = append(errs, name+"的 overturns 要是数组")
			}
			for n, rawO := range overturns {
				oname := fmt.Sprintf("%s第 %d 条推翻", name, n+1)
				o, ok := asObj(rawO)
				if !ok {
					errs = append(errs, oname+"要是一个对象")
					continue
				}
				unknownFields(o, overturnFields, oname, &errs)
				l, isStr := o.Get("ledger").(string)
				switch {
				case !isStr || !ledgerID.MatchString(l):
					errs = append(errs, oname+"缺 ledger 编号（形如 1.2）")
				case ctx.Ledger != nil && !inList(ctx.Ledger, l):
					errs = append(errs, fmt.Sprintf("%s的编号 %s 不在这一轮给的 ledger 里", oname, l))
				}
				if !lightText(o.Get("why")) {
					errs = append(errs, oname+"缺理由（why）：为什么这条决策该改")
				}
			}
		}
	}

	left := map[string]bool{}
	if top.Has("uncovered") {
		uncovered, ok := top.Get("uncovered").([]any)
		if !ok {
			errs = append(errs, "uncovered 要是数组")
		}
		for n, rawU := range uncovered {
			uname := fmt.Sprintf("uncovered 第 %d 条", n+1)
			u, ok := asObj(rawU)
			if !ok {
				errs = append(errs, uname+"要是一个对象")
				continue
			}
			unknownFields(u, uncoveredFields, uname, &errs)
			if k, isKey := opinionKey(u.Get("opinion")); !isKey {
				errs = append(errs, uname+"缺 opinion（评委意见编号）")
			} else if lightText(u.Get("why")) {
				left[k] = true
			}
		}
	}
	for _, k := range known {
		if _, covered := coveredBy[k]; !covered && !left[k] {
			errs = append(errs, fmt.Sprintf("评委意见 %s 没有被覆盖：放进某一项的 covers，或在 uncovered 里写明为什么没覆盖", k))
		}
	}

	return LightResult{Valid: len(errs) == 0, Errors: errs, Items: len(items)}
}

// LightReport is the human-readable form of a light result.
func LightReport(r LightResult, file string) string {
	at := ""
	if file != "" {
		at = " (" + file + ")"
	}
	if r.Valid {
		return fmt.Sprintf("research-check: green ✓ 轻用法交回，%d 项%s", r.Items, at)
	}
	lines := []string{"research-check: 轻用法交回校验失败" + at + " —— 补齐后再交回："}
	for _, e := range r.Errors {
		lines = append(lines, "  - "+e)
	}
	return strings.Join(lines, "\n")
}
