// Package flow is `dyna design flow compose`: UI screenshots + arrows + short text, stitched into one PNG.
//
// A spec shows a problem or a new interaction as a screen flow: one row per path, screenshots left to right, the
// trigger written on the arrow, one line under each step, branches dropping down from the step they fork at, red
// rings on what to look at. This is THE way those figures get made, one recipe, so every figure in a spec (and in
// the next spec) looks the same. Rules: skills/productivity/evidence/references/ui-flow.md; placement is up to the
// caller.
//
// The input is one JSON per figure. Its shape is deliberately the same as a flow in the design archive
// (docs/design/prod/), so figures can move there unchanged.
//
// A step may also say which archive state it shows (`state`, the state's name, e.g. `cookbook--search-loading`). The
// id is kept in the output: a tag under the caption, a `data-state` attribute in the HTML, and a `<out>.states.json`
// map beside the PNG, so every cell of the figure can be traced back to a state file under
// docs/design/tmp/<spec-slug>/delta/. With `--archive <repo root> [--delta <spec-slug>]` the ids are also checked
// against the archive. Steps without `state` render exactly as they did before the field existed.
package flow

import (
	"fmt"
	"math"
	"regexp"
	"strconv"
	"strings"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/design/jsx"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/frontmatter"
)

func isNum(v any) bool {
	f, ok := v.(float64)
	return ok && !math.IsInf(f, 0) && !math.IsNaN(f)
}

func isText(v any) bool {
	s, ok := v.(string)
	return ok && jsx.Trim(s) != ""
}

// stateID is an archive state name: one token, no whitespace, no wikilink brackets.
var stateID = jsx.Re(`^[^\s\[\]]+$`, "")

func isStateID(v any) bool {
	s, ok := v.(string)
	return ok && stateID.MatchString(s)
}

func isInt(v any) bool {
	f, ok := v.(float64)
	return ok && !math.IsInf(f, 0) && f == math.Trunc(f)
}

// get reads a property of a JSON value the way `v.k` would: a mapping has it or not (present says which), anything
// else has no properties.
func get(v any, k string) (val any, present bool) {
	if m, ok := v.(*frontmatter.Map); ok && m.Has(k) {
		return m.Get(k), true
	}
	return nil, false
}

func has(v any, k string) bool { _, ok := get(v, k); return ok }

func prop(v any, k string) any { x, _ := get(v, k); return x }

// Check validates one flow (a value read from JSON). exists says whether a screenshot path (relative to the flow
// file) is there; hasState, when not nil, says whether the design archive has that state, and when nil state ids are
// checked for shape only. The result is one message per problem, none when the flow is valid.
func Check(flow any, exists func(string) bool, hasState func(string) bool) []string {
	var errs []string
	switch flow.(type) {
	case *frontmatter.Map, []any:
	default:
		return []string{"flow 不是一个对象"}
	}
	if !isText(prop(flow, "title")) {
		errs = append(errs, "缺 title（这张图讲的是哪个场景）")
	}
	if has(flow, "scale") {
		s := prop(flow, "scale")
		if f, ok := s.(float64); !(ok && isNum(s) && f > 0 && f <= 2) {
			errs = append(errs, "scale 必须是 (0, 2] 之间的数（2 倍像素密度的截图填 0.5）")
		}
	}
	rows, ok := prop(flow, "rows").([]any)
	if !ok || len(rows) == 0 {
		errs = append(errs, "rows 至少一行")
		return errs
	}

	stepsOf := func(row any) []any {
		l, _ := prop(row, "steps").([]any)
		return l
	}
	for r, row := range rows {
		at := fmt.Sprintf("第 %d 行", r+1)
		steps := stepsOf(row)
		if len(steps) == 0 {
			errs = append(errs, at+"没有 steps")
			continue
		}
		unconnected := prop(row, "connected") == false
		if unconnected && !isText(prop(row, "label")) {
			errs = append(errs, at+"是不画箭头的行（connected: false），必须带 label，比如「同一规则 · ……」")
		}
		branch := has(row, "branchFrom")
		if branch {
			if r == 0 {
				errs = append(errs, "第 1 行不能是分支（branchFrom 只能指向它上面的行）")
			}
			bf := prop(row, "branchFrom")
			br, bs := prop(bf, "row"), prop(bf, "step")
			if !isInt(br) || br.(float64) < 0 || br.(float64) >= float64(r) {
				errs = append(errs, at+"的 branchFrom.row 必须指向它上面的某一行（0 起数）")
			} else if !isInt(bs) || bs.(float64) < 0 || bs.(float64) >= float64(len(stepsOf(rows[int(br.(float64))]))) {
				errs = append(errs, fmt.Sprintf("%s的 branchFrom.step 超出第 %d 行的步数", at, int(br.(float64))+1))
			}
			if unconnected {
				errs = append(errs, at+"既是分支又不画箭头——二选一")
			}
			if !isText(prop(steps[0], "trigger")) {
				errs = append(errs, at+"是分支，第一步要写 trigger（箭头上的触发条件）")
			}
		}

		for s, step := range steps {
			where := fmt.Sprintf("%s第 %d 步", at, s+1)
			if img := prop(step, "image"); !isText(img) {
				errs = append(errs, where+"缺 image")
			} else if !exists(img.(string)) {
				errs = append(errs, fmt.Sprintf("%s的截图不存在：%s", where, img.(string)))
			}
			if !isText(prop(step, "caption")) {
				errs = append(errs, where+"缺 caption（截图下那一句）")
			}
			if has(step, "state") {
				st := prop(step, "state")
				if !isStateID(st) {
					errs = append(errs, where+"的 state 要写档案里的状态名（一个词，如 cookbook--search-loading，不带空格和 [[ ]]）")
				} else if hasState != nil && !hasState(st.(string)) {
					errs = append(errs, fmt.Sprintf("%s的 state「%s」在档案里找不到", where, st.(string)))
				}
			}
			arrowIn := !unconnected && (s > 0 || branch)
			if arrowIn && !isText(prop(step, "trigger")) {
				errs = append(errs, where+"有箭头指进来，要写 trigger")
			}
			if !arrowIn && has(step, "trigger") && s == 0 {
				errs = append(errs, where+"是一行的起点、没有箭头指进来，trigger 写了也画不出来")
			}
			circles, _ := prop(step, "circles").([]any)
			for i, c := range circles {
				if !(isNum(prop(c, "x")) && isNum(prop(c, "y")) && isNum(prop(c, "r")) && prop(c, "r").(float64) > 0) {
					errs = append(errs, fmt.Sprintf("%s的第 %d 个光圈要有数字 x / y / r（截图原始像素）", where, i+1))
				}
			}
		}
	}
	return errs
}

// Circle is a red ring around what to look at, in the screenshot's own pixels.
type Circle struct{ X, Y, R float64 }

// Step is one screenshot with its caption.
type Step struct {
	Image, Caption string
	Trigger        string
	State          string
	HasState       bool
	Circles        []Circle
}

// Branch says which step of an earlier row a row forks from (both count from 0).
type Branch struct{ Row, Step int }

// Row is one path.
type Row struct {
	Steps       []Step
	Label       string
	Unconnected bool
	Branch      *Branch
}

// Flow is one figure, a valid one.
type Flow struct {
	Title string
	Scale float64
	Rows  []Row
	Note  string
}

func str(v any) string {
	s, _ := v.(string)
	return s
}

// From reads a flow that passed Check.
func From(v any) Flow {
	f := Flow{Title: str(prop(v, "title")), Scale: 0.5, Note: str(prop(v, "note"))}
	if has(v, "scale") {
		f.Scale, _ = prop(v, "scale").(float64)
	}
	rows, _ := prop(v, "rows").([]any)
	for _, rv := range rows {
		row := Row{Label: str(prop(rv, "label")), Unconnected: prop(rv, "connected") == false}
		if has(rv, "branchFrom") {
			bf := prop(rv, "branchFrom")
			br, _ := prop(bf, "row").(float64)
			bs, _ := prop(bf, "step").(float64)
			row.Branch = &Branch{Row: int(br), Step: int(bs)}
		}
		steps, _ := prop(rv, "steps").([]any)
		for _, sv := range steps {
			st := Step{Image: str(prop(sv, "image")), Caption: str(prop(sv, "caption")), Trigger: str(prop(sv, "trigger"))}
			if has(sv, "state") {
				st.State, st.HasState = str(prop(sv, "state")), true
			}
			circles, _ := prop(sv, "circles").([]any)
			for _, cv := range circles {
				x, _ := prop(cv, "x").(float64)
				y, _ := prop(cv, "y").(float64)
				r, _ := prop(cv, "r").(float64)
				st.Circles = append(st.Circles, Circle{x, y, r})
			}
			row.Steps = append(row.Steps, st)
		}
		f.Rows = append(f.Rows, row)
	}
	return f
}

// StateRef says which archive state one step shows. Rows and steps count from 1, like the error messages.
type StateRef struct {
	Row, Step int
	State     string
	Caption   string
}

// StateMap lists the steps that name a state, in reading order: the correspondence the figure keeps so a cell can be
// traced back to a state file. Steps without a `state` are left out.
func StateMap(f Flow) []StateRef {
	var out []StateRef
	for r, row := range f.Rows {
		for s, st := range row.Steps {
			if st.HasState {
				out = append(out, StateRef{r + 1, s + 1, st.State, st.Caption})
			}
		}
	}
	return out
}

// FileName is the file name for the n-th figure of a spec: `flow-<n>-<page>--<state>.png`, the state being the first
// one the figure shows (state ids are `<page>--<state>`, so the page rides along). The archive script reads the owning
// page off this name. Empty when no step names a state.
func FileName(f Flow, n int) string {
	m := StateMap(f)
	if len(m) == 0 {
		return ""
	}
	return fmt.Sprintf("flow-%d-%s.png", n, m[0].State)
}

type placement struct {
	r, start, gridRow int
	labelRow          int // 0 = none
}

// layout is the grid placement. Each row occupies one grid row; a branch row starts one column right of the step it
// forks from, so its first screenshot sits diagonally below-right of the fork. A labelled row gets an extra grid row
// above it for the label.
func layout(f Flow) ([]placement, int) {
	var placed []placement
	startCol := make([]int, len(f.Rows))
	gridRow := 1
	cols := 0
	for r, row := range f.Rows {
		start := 0
		if row.Branch != nil {
			start = startCol[row.Branch.Row] + row.Branch.Step + 1
		}
		startCol[r] = start
		labelRow := 0
		if jsx.Trim(row.Label) != "" {
			labelRow = gridRow
			gridRow++
		}
		placed = append(placed, placement{r, start, gridRow, labelRow})
		gridRow++
		if start+len(row.Steps) > cols {
			cols = start + len(row.Steps)
		}
	}
	return placed, cols
}

var escaper = strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", `"`, "&quot;")

func esc(s string) string { return escaper.Replace(s) }

var exponent = regexp.MustCompile(`e([+-])0*(\d)`)

// num writes a number the way JS does.
func num(f float64) string {
	if a := math.Abs(f); a != 0 && (a >= 1e21 || a < 1e-6) {
		return exponent.ReplaceAllString(strconv.FormatFloat(f, 'e', -1, 64), "e$1$2")
	}
	return strconv.FormatFloat(f, 'f', -1, 64)
}

const stateCSS = "  .state { margin-top:4px; font:11px/1.3 ui-monospace,SFMono-Regular,Menlo,monospace; color:var(--muted); max-width:260px; word-break:break-all; }\n"

// RenderHTML renders a self-contained HTML page for one flow. src turns a screenshot's relative path into something
// usable as <img src> (a data: URI from the command).
func RenderHTML(f Flow, src func(string) string) string {
	scale := f.Scale
	if scale == 0 {
		scale = 0.5
	}
	placed, cols := layout(f)
	stateCss := ""
	if len(StateMap(f)) > 0 {
		stateCss = stateCSS
	}
	var cells strings.Builder
	for _, p := range placed {
		row := f.Rows[p.r]
		if p.labelRow != 0 {
			first := ""
			if p.start == 0 {
				first = " first"
			}
			fmt.Fprintf(&cells, `<div class="label%s" style="grid-row:%d;grid-column:%d / span %d">%s</div>`, first, p.labelRow, p.start+1, cols-p.start, esc(row.Label))
		}
		for s, step := range row.Steps {
			arrowIn := !row.Unconnected && (s > 0 || row.Branch != nil)
			id := fmt.Sprintf("s-%d-%d", p.r, s)
			from := ""
			if s > 0 {
				from = fmt.Sprintf("s-%d-%d", p.r, s-1)
			} else if row.Branch != nil {
				from = fmt.Sprintf("s-%d-%d", row.Branch.Row, row.Branch.Step)
			}
			var rings strings.Builder
			for _, c := range step.Circles {
				fmt.Fprintf(&rings, `<span class="ring" style="left:%spx;top:%spx;width:%spx;height:%spx"></span>`,
					num((c.X-c.R)*scale), num((c.Y-c.R)*scale), num(2*c.R*scale), num(2*c.R*scale))
			}
			first := ""
			if p.start+s == 0 {
				first = " first"
			}
			cells.WriteString(fmt.Sprintf(`<div class="cell%s" style="grid-row:%d;grid-column:%d">`, first, p.gridRow, p.start+s+1))
			cells.WriteString(`<div class="gutter">`)
			if arrowIn {
				branch := 0
				if s == 0 {
					branch = 1
				}
				fmt.Fprintf(&cells, `<span class="trigger" data-from="%s" data-to="%s" data-branch="%d">%s</span>`, from, id, branch, esc(step.Trigger))
			}
			cells.WriteString(`</div>`)
			dataState := ""
			if step.HasState {
				dataState = ` data-state="` + esc(step.State) + `"`
			}
			fmt.Fprintf(&cells, `<figure id="%s"%s><div class="shot"><img src="%s" data-scale="%s">%s</div>`, id, dataState, esc(src(step.Image)), num(scale), rings.String())
			cells.WriteString(`<figcaption>` + esc(step.Caption) + `</figcaption>`)
			if step.HasState {
				cells.WriteString(`<div class="state">` + esc(step.State) + `</div>`)
			}
			cells.WriteString(`</figure></div>`)
		}
	}
	note := ""
	if jsx.Trim(f.Note) != "" {
		note = `<p class="note">` + esc(f.Note) + `</p>`
	}
	return strings.NewReplacer(
		"{{TITLE}}", esc(f.Title),
		"{{COLS}}", strconv.Itoa(cols),
		"{{STATECSS}}", stateCss,
		"{{CELLS}}", cells.String(),
		"{{NOTE}}", note,
	).Replace(pageTemplate)
}

// Report is the problems of a flow as the text a person reads.
func Report(errs []string, file string) string {
	at := ""
	if file != "" {
		at = " (" + file + ")"
	}
	if len(errs) == 0 {
		return "flow-compose: green ✓" + at
	}
	lines := []string{"flow-compose: 这张图的描述不合规" + at + "："}
	for _, e := range errs {
		lines = append(lines, "  - "+e)
	}
	return strings.Join(lines, "\n")
}
