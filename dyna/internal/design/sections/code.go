package sections

import (
	"embed"
	"fmt"
	"math"
	"regexp"
	"strings"
)

// The browser side: the code handed to Playwright. The functions are kept as the JavaScript source they have always
// been sent as (js/*.js, one function each, as the browser runs them); this file builds the one `async (page) => …`
// text out of them.

//go:embed js/*.js
var jsFS embed.FS

func source(name string) string {
	b, err := jsFS.ReadFile("js/" + name + ".js")
	if err != nil {
		panic(err)
	}
	return string(b)
}

var commentLine = regexp.MustCompile(`^\s*//`)

// compact is a function's source for the Playwright MCP: full-line comments and blank lines dropped (the tool echoes the code).
func compact(name string) string {
	var out []string
	for _, l := range strings.Split(source(name), "\n") {
		if strings.TrimSpace(l) == "" || commentLine.MatchString(l) {
			continue
		}
		out = append(out, l)
	}
	return strings.Join(out, "\n")
}

// withTime is the text of a function `browser_run_code_unsafe` takes: `fn(page, C, T)` (and `D`, the picture kit, when
// asked for) with the kits built inside it.
func withTime(fn string, c Obj, kit string, withDiff bool) string {
	var b strings.Builder
	b.WriteString("async (page) => { const T = (" + compact(kit) + ")(); ")
	if withDiff {
		b.WriteString("const D = (" + compact("diffKit") + ")(); ")
	}
	b.WriteString("return (" + compact(fn) + ")(page, " + stringify(c, 0) + ", T")
	if withDiff {
		b.WriteString(", D")
	}
	b.WriteString("); }")
	return b.String()
}

// BuildTimeCode is the code for `time`; config is { viewport: {width, height}, theme, motion }.
func BuildTimeCode(config Obj) string {
	return withTime("timePage", O("viewport", get(config, "viewport"), "theme", get(config, "theme"), "motion", or(get(config, "motion"), "default")), "timeKit", false)
}

// BuildStepCode is the code for `step`: the page time on by ms milliseconds (a positive whole number, at most a minute).
func BuildStepCode(ms any) (string, error) {
	f, isNum := ms.(float64)
	if !isNum || f != math.Floor(f) || math.IsInf(f, 0) || f <= 0 || f > 60000 {
		return "", fmt.Errorf("拨的毫秒数要是 1 到 60000 的整数（现在是 %s）", text(ms))
	}
	return withTime("stepPage", O("ms", f), "timeKit", false), nil
}

const clickSelector = `a[href],button,summary,input:not([type="hidden"]),select,textarea,[role="button"],[role="link"],[role="tab"],[role="menuitem"],[role="checkbox"],[role="radio"],[role="switch"],[tabindex]:not([tabindex="-1"])`

// BuildMeasureCode is the text of the function `browser_run_code_unsafe` takes. config is
// { state?, entry?, section?, page?, sections: [{id, locate, scrollDriven?}], viewport, theme, motion?, reload? }:
// state is whose picture it is (the entry state, or — with section — a state inside one of its sections); reload lets
// the code start the page time itself and reload the page once when `time` was not run (an entry state); a state
// reached by interacting must not be reloaded, so there a page whose time was not started is reported as 装晚了.
func BuildMeasureCode(config Obj) string {
	var sections []any
	for _, s := range list(get(config, "sections")) {
		e := O("id", get(s, "id"), "locate", get(s, "locate"))
		if strictEq(get(s, "scrollDriven"), true) {
			e.Set("scrollDriven", true)
		}
		sections = append(sections, e)
	}
	if sections == nil {
		sections = []any{}
	}
	c := O(
		"state", nul(get(config, "state")),
		"entry", or(get(config, "entry"), nul(get(config, "state"))),
		"section", nul(get(config, "section")),
		"page", nul(get(config, "page")),
		"sections", sections,
		"viewport", get(config, "viewport"),
		"theme", get(config, "theme"),
		"motion", or(get(config, "motion"), "default"),
		"reload", or(get(config, "reload"), true),
		"clickSelector", clickSelector,
	)
	return withTime("measurePage", c, "timeKit", false)
}

// BuildShootCode is the code for `shoot`: targets are { id, file, start, end, inScroller }, scroller is the
// attribution's scroll container; see ShootTargets.
func BuildShootCode(config Obj) string {
	c := O(
		"targets", get(config, "targets"),
		"viewport", get(config, "viewport"),
		"theme", get(config, "theme"),
		"motion", or(get(config, "motion"), "default"),
		"pageHeight", get(config, "pageHeight"),
		"outDir", get(config, "outDir"),
		"include", nul(get(config, "include")),
		"scroller", nul(get(config, "scroller")),
	)
	kit := "timeProbe"
	for _, t := range list(c.Get("targets")) {
		if truthy(get(t, "scrollDriven")) {
			kit = "timeKit"
			break
		}
	}
	return withTime("shootPage", c, kit, true)
}

// BuildPinnedCode is the code for `pinned`: state is whose picture it is (the file is <state>.png).
func BuildPinnedCode(config Obj) string {
	state := get(config, "state")
	c := O(
		"state", state,
		"file", text(state)+".png",
		"viewport", get(config, "viewport"),
		"theme", get(config, "theme"),
		"motion", or(get(config, "motion"), "default"),
		"outDir", get(config, "outDir"),
	)
	return withTime("pinnedPage", c, "timeProbe", true)
}

// ScreenTargets is the shot a state with no sections asks for — a page that is not taller than the main viewport (the
// "single screen" states: a login page with a carousel on its first screen). It is one section whose range is the main
// viewport, and the picture is named after the state: <state>.png. Nothing is measured or attributed first.
// The result is { targets, skipped, scroller, pageHeight }.
func ScreenTargets(state, viewport any) (Obj, error) {
	s, isStr := state.(string)
	if !isStr || s == "" || strings.ContainsAny(s, `\/`) || strings.HasPrefix(s, ".") {
		return nil, fmt.Errorf("状态 id 不对（它会成为图的文件名）：%s", stringify(nul(state), 0))
	}
	if !truthy(viewport) || !(num(get(viewport, "width")) > 0) || !(num(get(viewport, "height")) > 0) {
		return nil, fmt.Errorf("没有视口：单屏状态的范围是主视口")
	}
	h := get(viewport, "height")
	return O(
		"targets", []any{O("id", s, "ref", s, "file", s+".png", "start", float64(0), "end", h, "inScroller", false)},
		"skipped", []any{},
		"scroller", nil,
		"pageHeight", h,
	), nil
}

// BuildScreenCode is the code for `screen`: the code `shoot` runs, handed that one section — the same wait for images
// and fonts, the same second shot 500 ms later, the same `uncontrolled` and `diffBox`. The page time is not moved and
// the page is not given a style that switches animations off, so the picture is of the state as the stopped time
// leaves it.
func BuildScreenCode(config Obj) (string, error) {
	st, err := ScreenTargets(get(config, "state"), get(config, "viewport"))
	if err != nil {
		return "", err
	}
	var targets []any
	for _, t := range list(st.Get("targets")) {
		targets = append(targets, O("id", get(t, "id"), "file", get(t, "file"), "start", get(t, "start"), "end", get(t, "end"), "inScroller", get(t, "inScroller")))
	}
	return BuildShootCode(O(
		"targets", targets,
		"scroller", st.Get("scroller"),
		"viewport", get(config, "viewport"),
		"theme", get(config, "theme"),
		"motion", get(config, "motion"),
		"pageHeight", st.Get("pageHeight"),
		"outDir", get(config, "outDir"),
	)), nil
}

// BuildCoverCode is the code for `cover`: edges are the state's `user` edges, { id, locate }. It carries coverScreens
// and shootPage along as source, so what the tests run on the plain functions is what runs in the browser. Like
// `screen`, it only asks whether the page time was started.
func BuildCoverCode(config Obj) string {
	var edges []any
	for _, e := range list(get(config, "edges")) {
		edges = append(edges, O("id", get(e, "id"), "locate", get(e, "locate")))
	}
	if edges == nil {
		edges = []any{}
	}
	c := O(
		"state", get(config, "state"),
		"edges", edges,
		"viewport", get(config, "viewport"),
		"theme", get(config, "theme"),
		"motion", or(get(config, "motion"), "default"),
		"outDir", get(config, "outDir"),
	)
	return "async (page) => { const T = (" + compact("timeProbe") + ")(); const D = (" + compact("diffKit") + ")(); const coverScreens = (" + compact("coverScreens") + "); const shootPage = (" + compact("shootPage") + "); return (" + compact("coverPage") + ")(page, " + stringify(c, 0) + ", T, D, coverScreens, shootPage); }"
}
