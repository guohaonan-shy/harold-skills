// Package sections is the deterministic half of shooting a long page for the design archive.
//
// A long entry state declares `sections`. Writing it into the archive takes a browser for the measuring and the
// shooting, and plain logic for everything else; this package is the plain logic plus the code handed to the browser:
//
//	time       prints the code that starts the page's time (装时间): the page clock and the CSS animation timeline are
//	           both stopped at a fixed start, the page is reloaded, and a fixed run of steps lets it come up. Run it once
//	           after the browser has navigated to the entry, before any interaction. From then on page time only moves
//	           when a step moves it, so the page is in the same place on every run however long the agent thinks between
//	           tool calls.
//	step       prints the code that moves the page time on by N ms (拨一步): the page clock runs N ms and every animation
//	           that is still running is moved on N ms with it, so an animation plays to its end, fires its end event, just
//	           at a fixed page time. For waiting after an interaction.
//	measure    prints the code the headless Playwright MCP runs (`browser_run_code_unsafe`): start the page time if `time`
//	           was not run, find what scrolls, scroll it through once in fixed steps, locate each section with the
//	           accessibility tree, box the top-level blocks, every heading and every clickable element.
//	attribute  measurement JSON → each section's range, which section each clickable element belongs to, the ones that
//	           fall in none ("落空"), the sections that could not be located, the ones that overlap. Exit 1 on any of them.
//	shoot      attribution JSON → the code that shoots each section by itself, one PNG per section,
//	           `<entry state id>@<section id>.png`.
//	screen     a state with no sections (a page not taller than the main viewport): the code `shoot` runs, handed the one
//	           section that is the main viewport, `<state>.png`.
//	cover      a state with no sections that is taller than the main viewport: the code that finds the component of each
//	           of the state's `user` edges, shoots the ones the first screen does not show.
//	pinned     the screen a scroll-driven section holds, shot where the page stands.
//
// The browser functions are kept as the JavaScript they are sent as (js/*.js). The browser side is covered by
// browser_test.go (skipped when no Chromium is found) and by a real run; `attribute` and the target arithmetic are
// pure functions over data.
package sections

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/spf13/cobra"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/design/archive"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/miniyaml"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/nexterr"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/registry"
)

// commandFlags are the subcommands and the options each one takes (every one takes a value).
var commandFlags = map[string][]string{
	"time":      {"viewport", "theme", "locale", "motion"},
	"step":      {},
	"measure":   {"delta", "state", "page", "sections", "sections-file", "for", "section", "viewport", "theme", "locale", "motion"},
	"attribute": {},
	"shoot":     {"out", "section", "include"},
	"screen":    {"out", "viewport", "theme", "locale", "motion"},
	"cover":     {"delta", "out", "viewport", "theme", "locale", "motion"},
	"pinned":    {"out", "viewport", "theme", "locale", "motion"},
}

var flagHelp = map[string]string{
	"viewport":      "视口，如 1440x900（默认取 docs/design/prod/index.md 的 frontmatter）",
	"theme":         "light 或 dark（默认取 prod/index.md）",
	"locale":        "语言，如 zh-CN（默认取 prod/index.md）",
	"motion":        "default 或 reduce（默认取 prod/index.md，再默认 default）",
	"delta":         "spec 名：把 docs/design/tmp/<spec>/delta/ 盖在 prod/ 上读",
	"state":         "入口状态 id（档案里还没有这个状态时用，要配 --page 和 --sections / --sections-file）",
	"page":          "页面 id",
	"sections":      "分段列表，JSON 数组：[{ \"id\": \"hero\", \"locate\": { … } }, …]",
	"sections-file": "分段列表的 JSON 文件",
	"for":           "段内状态 id：给它量，不重载页面",
	"section":       "段 id（measure：配 --for；shoot：只拍这些段，逗号分隔）",
	"out":           "图写到的目录（Playwright 只能写它的工作区根目录里）",
	"include":       "JSON 定位，把叠在页面上的东西也拍进去：{ \"role\": …, \"name\": … } / { \"text\": … } / { \"selector\": … }",
}

const usageText = `用法：
  dyna design archive sections time <仓库根> [设置]
  dyna design archive sections step <毫秒数>
  dyna design archive sections measure <仓库根> <入口状态 id> [--delta <spec-slug>] [--for <段内状态 id> --section <段 id>] [设置]
  dyna design archive sections measure <仓库根> --state <入口状态 id> --page <页面> (--sections '<JSON 列表>' | --sections-file <文件>) [--for <段内状态 id> --section <段 id>] [设置]
  dyna design archive sections attribute <测量结果.json>
  dyna design archive sections shoot <归属结果.json> --out <目录> [--section <段 id,段 id>] [--include '<JSON 定位>']
  dyna design archive sections screen <仓库根> <状态 id> --out <目录> [设置]
  dyna design archive sections cover <仓库根> <状态 id> [--delta <spec-slug>] --out <目录> [设置]
  dyna design archive sections pinned <仓库根> <状态 id> --out <目录> [设置]
设置：--viewport 1440x900 --theme light|dark --locale zh-CN --motion default|reduce（默认取 docs/design/prod/index.md 的 frontmatter）
time / step / measure / shoot / screen / cover / pinned 打印交给 Playwright MCP「执行一段代码」的代码；attribute 有落空、定位失败、顺序不对、重叠，或检出了滚动驱动的段而分段声明里没写 scrollDriven 时退出码 1。
time（装时间）：在 browser_navigate 到入口之后、做任何交互之前跑一次；step（拨一步）：交互之后等界面变化时用；
screen：不分段的单屏状态，先滚到页顶再截主视口，不用先 measure / attribute；
cover：不分段、比主视口高的状态，按屏补拍首屏以下会连出边的组件，不重载页面、不拨页面时间；状态或它的边还只在 delta/ 里（合并前归档、初扫的草稿）时带 --delta（写法同 measure）；返回里 shot 是每条边该写的图，unlocated 非空时 exit 为 1；声明了 sections 的状态退出码 2；
pinned：滚动驱动的段里第 2 步起的状态，到了这一步之后不滚动、不拨时间，直接截当前视口，图叫 <状态 id>.png。`

// Usage is the command table the old script printed after a usage error.
func Usage() string { return usageText }

// usageError is a mistake in how the command was called: the message, then the usage, exit 2.
type usageError struct{ msg string }

func (e *usageError) Error() string { return e.msg }

func usagef(format string, a ...any) error { return &usageError{fmt.Sprintf(format, a...)} }

// toExit turns what a command returned into the way dyna ends: a usage error prints its message and the usage and exits 2.
func toExit(err error) error {
	if err == nil {
		return nil
	}
	if ue, ok := err.(*usageError); ok {
		return &nexterr.Exit{Code: 2, Msg: ue.msg + "\n" + usageText}
	}
	return err
}

type parsed struct {
	flags      map[string]string
	positional []string
}

func (p parsed) has(name string) bool { _, ok := p.flags[name]; return ok }

// truthyFlag is `flags.x` in a condition: given, and not the empty string.
func (p parsed) truthyFlag(name string) bool { return p.flags[name] != "" }

func parseArgs(command string, argv []string) (parsed, error) {
	p := parsed{flags: map[string]string{}}
	valued := map[string]bool{}
	for _, f := range commandFlags[command] {
		valued["--"+f] = true
	}
	for i := 0; i < len(argv); i++ {
		a := argv[i]
		switch {
		case valued[a]:
			if i+1 >= len(argv) || strings.HasPrefix(argv[i+1], "--") {
				return p, usagef("%s 后面要跟一个值", a)
			}
			i++
			p.flags[a[2:]] = argv[i]
		case strings.HasPrefix(a, "--"):
			return p, usagef("不认识的选项 %s", a)
		default:
			p.positional = append(p.positional, a)
		}
	}
	return p, nil
}

func readJSONFile(file, what string) (any, error) {
	b, err := os.ReadFile(file)
	if err != nil {
		reason := err.Error()
		if os.IsNotExist(err) {
			reason = "文件不存在"
		}
		return nil, usagef("%s %s 读不出来：%s", what, file, reason)
	}
	v, err := parseJSON(string(b))
	if err != nil {
		return nil, usagef("%s %s 读不出来：%s", what, file, err.Error())
	}
	return v, nil
}

// settings are the shooting settings: from the flags over the `prod/index.md` frontmatter.
type settings struct {
	viewport Obj
	width    float64
	height   float64
	theme    string
	motion   string
	locale   any
}

var viewportRe = regexp.MustCompile(`^(\d+)x(\d+)$`)

// settingsOf reads the settings. A missing one is an error: no silent default.
func settingsOf(a *archive.Archive, p parsed) (settings, error) {
	idx := a.Index
	pick := func(name string) any {
		if v, ok := p.flags[name]; ok {
			return v
		}
		return idx.Get(name)
	}
	vp := pick("viewport")
	vs := ""
	if vp != nil {
		vs = miniyaml.Text(vp)
	}
	m := viewportRe.FindStringSubmatch(vs)
	if m == nil {
		return settings{}, usagef("没有视口：prod/index.md 的 frontmatter 没写 viewport，也没给 --viewport 1440x900")
	}
	theme, _ := pick("theme").(string)
	if theme != "light" && theme != "dark" {
		return settings{}, usagef("没有主题：prod/index.md 的 frontmatter 没写 theme（light 或 dark），也没给 --theme")
	}
	motionV := or(pickNullable(p, idx, "motion"), "default")
	motion, _ := motionV.(string)
	if motion != "default" && motion != "reduce" {
		return settings{}, usagef("motion 只能是 default 或 reduce（现在是 %s）", text(motionV))
	}
	w := num(m[1])
	h := num(m[2])
	return settings{viewport: O("width", w, "height", h), width: w, height: h, theme: theme, motion: motion, locale: nul(pickNullable(p, idx, "locale"))}, nil
}

// pickNullable is `flags[name] ?? idx[name]`.
func pickNullable(p parsed, idx Obj, name string) any {
	if v, ok := p.flags[name]; ok {
		return v
	}
	return idx.Get(name)
}

func (s settings) describe() string {
	d := fmt.Sprintf("视口 %s×%s，%s，motion %s", text(s.width), text(s.height), s.theme, s.motion)
	return d
}

func (s settings) localeNote(suffix string) string {
	if truthy(s.locale) {
		return fmt.Sprintf("，语言 %s%s", text(s.locale), suffix)
	}
	return ""
}

func rootOf(arg string) (string, error) {
	root, err := filepath.Abs(arg)
	if err != nil {
		return "", usagef("%s", err.Error())
	}
	if st, err := os.Stat(filepath.Join(root, "docs")); err != nil || st == nil {
		return "", usagef("%s 下没有 docs/：这不是目标仓库的根", root)
	}
	return root, nil
}

func loadArchive(root, delta string) (*archive.Archive, error) {
	a, err := archive.Load(root, archive.Options{Delta: delta})
	if err != nil {
		return nil, usagef("%s", err.Error())
	}
	return a, nil
}

type printer struct{ out, err io.Writer }

func (p printer) code(s string)                { fmt.Fprintln(p.out, s) }
func (p printer) note(format string, a ...any) { fmt.Fprintf(p.err, format+"\n", a...) }
func newPrinter(cmd *cobra.Command) printer {
	return printer{out: cmd.OutOrStdout(), err: cmd.ErrOrStderr()}
}
func joinStr(parts []string, sep string) string { return strings.Join(parts, sep) }
func idList(ids []any, sep string) string       { return joinTexts(ids, sep) }
func sectionIDs(sections []any) []any {
	out := make([]any, len(sections))
	for i, s := range sections {
		out[i] = get(s, "id")
	}
	return out
}

func runTime(pr printer, p parsed) error {
	if len(p.positional) == 0 {
		return usagef("缺少仓库根")
	}
	if len(p.positional) > 1 {
		return usagef("time 只要一个仓库根（多出 %s）", joinStr(p.positional[1:], " "))
	}
	root, err := rootOf(p.positional[0])
	if err != nil {
		return err
	}
	a, err := loadArchive(root, "")
	if err != nil {
		return err
	}
	s, err := settingsOf(a, p)
	if err != nil {
		return err
	}
	pr.code(BuildTimeCode(O("viewport", s.viewport, "theme", s.theme, "motion", s.motion, "locale", s.locale)))
	pr.note("time: %s%s；在 browser_navigate 到入口之后、做任何交互之前跑一次：页面时钟和 CSS 动画时间线停在固定的起点，重载一次，再按固定步长拨一段让页面起来。之后页面时间只在 step 和 measure 里按固定步长走", s.describe(), s.localeNote("（浏览器要先按这个语言打开页面）"))
	return nil
}

var allDigits = regexp.MustCompile(`^\d+$`)

func runStep(pr printer, p parsed) error {
	if len(p.positional) != 1 {
		return usagef("step 要一个毫秒数（拨多少页面时间）")
	}
	var ms any = nanValue
	if allDigits.MatchString(p.positional[0]) {
		ms = num(p.positional[0])
	}
	code, err := BuildStepCode(ms)
	if err != nil {
		return usagef("step 的毫秒数不对：%s", err.Error())
	}
	pr.code(code)
	pr.note("step: 页面时间往前拨 %s 毫秒（页面时钟和还在播的动画一起）；要先跑过 time", text(ms))
	return nil
}

// sectionFromArchive is a section of the state as the measurement takes it: { id, locate, scrollDriven? }.
func sectionsFromArchive(state *archive.Object) []any {
	var out []any
	for _, s := range archive.SectionsOfState(state) {
		var id any
		if s.HasID {
			id = s.ID
		}
		sd := Undefined
		if s.ScrollDrivenSet {
			sd = s.ScrollDriven
		}
		out = append(out, O("id", id, "locate", s.Locate, "scrollDriven", sd))
	}
	return out
}

func runMeasure(pr printer, p parsed) error {
	if len(p.positional) == 0 {
		return usagef("缺少仓库根")
	}
	root, err := rootOf(p.positional[0])
	if err != nil {
		return err
	}
	a, err := loadArchive(root, p.flags["delta"])
	if err != nil {
		return err
	}
	stateID := ""
	if len(p.positional) > 1 {
		stateID = p.positional[1]
	} else if v, ok := p.flags["state"]; ok {
		stateID = v
	}
	if stateID == "" {
		return usagef("缺少入口状态 id")
	}
	var sections []any
	var page any
	if p.has("page") {
		page = p.flags["page"]
	}
	if p.truthyFlag("sections") || p.truthyFlag("sections-file") {
		var raw any
		if p.truthyFlag("sections") {
			raw, err = parseJSON(p.flags["sections"])
			if err != nil {
				return usagef("--sections 不是 JSON：%s", err.Error())
			}
		} else {
			raw, err = readJSONFile(p.flags["sections-file"], "分段列表")
			if err != nil {
				return err
			}
		}
		l, isList := raw.([]any)
		if !isList || len(l) == 0 {
			return usagef(`分段列表要是一个非空的 JSON 数组：[{ "id": "hero", "locate": { … } }, …]`)
		}
		sections = l
	} else {
		state, ok := a.Objects[stateID]
		if !ok || state.Kind != "state" {
			return usagef("档案里没有状态「%s」；档案里还没有这个状态时（初扫）用 --sections 给分段列表", stateID)
		}
		if !miniyaml.Truthy(state.FM.Get("entry")) {
			return usagef("%s 不是入口状态：只有入口状态声明 sections", stateID)
		}
		sections = sectionsFromArchive(state)
		if len(sections) == 0 {
			return usagef("%s 没有 sections", stateID)
		}
		if page == nil {
			if pg := archive.PageOfState(state); pg != "" {
				page = pg
			}
		}
	}
	var clean []any
	for i, s := range sections {
		by := archive.SectionLocate(nulIfUndef(get(s, "locate")))
		id, idIsStr := get(s, "id").(string)
		if !idIsStr || by == nil {
			return usagef("第 %d 段的 id 或 locate 不对（locate 只能是 heading + name、banner / contentinfo、position 三种之一）", i+1)
		}
		sd := get(s, "scrollDriven")
		if !isUndef(sd) && !strictEq(sd, true) {
			return usagef("第 %d 段（%s）的 scrollDriven 只能写 true（现在是 %s）", i+1, id, stringify(sd, 0))
		}
		e := O("id", id, "locate", get(s, "locate"))
		if strictEq(sd, true) {
			e.Set("scrollDriven", true)
		}
		clean = append(clean, e)
	}
	sections = clean

	// a state inside one of the entry state's sections: shot as it stands now (no reload), named after the state
	var state any = stateID
	var section any
	if p.truthyFlag("for") {
		state = p.flags["for"]
		known, isKnown := a.Objects[p.flags["for"]]
		var written *archive.SectionRef
		if isKnown && known.Kind == "state" && known.FM.Get("section") != nil {
			if r, ok := archive.ParseSectionRef(miniyaml.Text(known.FM.Get("section"))); ok {
				written = &r
			}
		}
		switch {
		case p.has("section"):
			section = p.flags["section"]
		case written != nil:
			section = written.ID
		}
		if !truthy(section) {
			return usagef("--for %s：不知道它在哪一段——档案里它没写 section，也没给 --section <段 id>", p.flags["for"])
		}
		found := false
		for _, s := range sections {
			if strictEq(get(s, "id"), section) {
				found = true
				break
			}
		}
		if !found {
			return usagef("--section %s 不是 %s 的分段（有：%s）", text(section), stateID, idList(sectionIDs(sections), "、"))
		}
	} else if p.truthyFlag("section") {
		return usagef("--section 要和 --for 一起用（段内状态在哪一段）")
	}
	s, err := settingsOf(a, p)
	if err != nil {
		return err
	}
	code := BuildMeasureCode(O("state", state, "entry", stateID, "section", nul(section), "page", nul(page), "sections", sections, "viewport", s.viewport, "theme", s.theme, "motion", s.motion, "locale", s.locale, "reload", !p.truthyFlag("for")))
	pr.code(code)
	mode := "；页面时间 time 装过就不再装，没装过的自己装并重载一次页面"
	if p.truthyFlag("for") {
		mode = fmt.Sprintf("；给段内状态 %s（在 %s 段）量，不重载页面，只拨一小步让界面画完（页面时间要是 time 装好的，没装就说「装晚了」）", text(state), text(section))
	}
	pr.note("measure: %d 段，%s%s%s；结果也留在 window.__dsMeasure，用 browser_evaluate 的 filename 存成文件", len(sections), s.describe(), s.localeNote("（浏览器要先按这个语言打开页面）"), mode)
	return nil
}

func nulIfUndef(v any) any {
	if isUndef(v) {
		return nil
	}
	return v
}

func runPinned(pr printer, p parsed) error {
	if len(p.positional) == 0 {
		return usagef("缺少仓库根")
	}
	if len(p.positional) < 2 {
		return usagef("缺少状态 id（图叫 <状态 id>.png）")
	}
	if len(p.positional) > 2 {
		return usagef("pinned 只要仓库根和一个状态 id（多出 %s）", joinStr(p.positional[2:], " "))
	}
	if !p.truthyFlag("out") {
		return usagef("pinned 要 --out <目录>（Playwright 只能写它的工作区根目录里）")
	}
	root, err := rootOf(p.positional[0])
	if err != nil {
		return err
	}
	a, err := loadArchive(root, "")
	if err != nil {
		return err
	}
	s, err := settingsOf(a, p)
	if err != nil {
		return err
	}
	out, _ := filepath.Abs(p.flags["out"])
	pr.code(BuildPinnedCode(O("state", p.positional[1], "viewport", s.viewport, "theme", s.theme, "motion", s.motion, "outDir", out)))
	pr.note("pinned: %s.png 写到 %s（视口 %s×%s，%s，motion %s%s）；不滚动、不拨页面时间，截此刻的视口——先把页面带到这一步，再跑", p.positional[1], out, text(s.width), text(s.height), s.theme, s.motion, s.localeNote(""))
	return nil
}

func runScreen(pr printer, p parsed) error {
	if len(p.positional) == 0 {
		return usagef("缺少仓库根")
	}
	if len(p.positional) < 2 {
		return usagef("缺少状态 id（要拍的单屏状态）")
	}
	if len(p.positional) > 2 {
		return usagef("screen 只要一个仓库根和一个状态 id（多出 %s）", joinStr(p.positional[2:], " "))
	}
	if !p.truthyFlag("out") {
		return usagef("screen 要 --out <目录>（Playwright 只能写它的工作区根目录里）")
	}
	root, err := rootOf(p.positional[0])
	if err != nil {
		return err
	}
	a, err := loadArchive(root, "")
	if err != nil {
		return err
	}
	s, err := settingsOf(a, p)
	if err != nil {
		return err
	}
	outDir, _ := filepath.Abs(p.flags["out"])
	st, err := ScreenTargets(p.positional[1], s.viewport)
	if err != nil {
		return usagef("%s", err.Error())
	}
	file := text(get(at(st.Get("targets"), float64(0)), "file"))
	code, err := BuildScreenCode(O("state", p.positional[1], "viewport", s.viewport, "theme", s.theme, "motion", s.motion, "outDir", outDir))
	if err != nil {
		return usagef("%s", err.Error())
	}
	pr.code(code)
	pr.note("screen: 1 张（%s）写到 %s；范围是主视口 %s×%s，%s，motion %s%s；页面时间要是装过时间（time）的，到了这个状态再拍，拍的时候不拨时间；返回里 uncontrolled 为 true 的，页面时间管不到的东西在动，diffBox 是哪一块", file, outDir, text(s.width), text(s.height), s.theme, s.motion, s.localeNote("（浏览器要先按这个语言打开页面）"))
	return nil
}

func runCover(pr printer, p parsed) error {
	if len(p.positional) == 0 {
		return usagef("缺少仓库根")
	}
	if len(p.positional) < 2 {
		return usagef("缺少状态 id（要补拍的状态）")
	}
	if len(p.positional) > 2 {
		return usagef("cover 只要一个仓库根和一个状态 id（多出 %s）", joinStr(p.positional[2:], " "))
	}
	if !p.truthyFlag("out") {
		return usagef("cover 要 --out <目录>（Playwright 只能写它的工作区根目录里）")
	}
	root, err := rootOf(p.positional[0])
	if err != nil {
		return err
	}
	a, err := loadArchive(root, p.flags["delta"])
	if err != nil {
		return err
	}
	stateID := p.positional[1]
	state, ok := a.Objects[stateID]
	if !ok || state.Kind != "state" {
		return usagef("档案里没有状态「%s」", stateID)
	}
	if state.FM.Has("sections") {
		return usagef("%s 声明了 sections：分段页每个可点元素已经归进某一段，用 measure / attribute / shoot 拍，不用 cover", stateID)
	}
	var edges []any
	var userEdges []archive.Edge
	for _, e := range archive.OutgoingEdges(a, stateID) {
		if strictEq(e.Kind, "user") {
			userEdges = append(userEdges, e)
		}
	}
	for _, e := range userEdges {
		if e.ID == "" {
			return usagef("%s 的第 %d 条边没有 id（图名和 shot 都用边 id）", stateID, e.Index+1)
		}
	}
	for _, e := range userEdges {
		var id any
		if e.HasID {
			id = e.ID
		}
		edges = append(edges, O("id", id, "locate", e.Locate))
	}
	s, err := settingsOf(a, p)
	if err != nil {
		return err
	}
	outDir, _ := filepath.Abs(p.flags["out"])
	code := BuildCoverCode(O("state", stateID, "edges", edges, "viewport", s.viewport, "theme", s.theme, "motion", s.motion, "outDir", outDir))
	pr.code(code)
	pr.note("cover: %s 的 %d 条 user 边，在已经走到的这一屏上跑；首屏真正露出来、整个放得下的组件不拍（被别的元素盖住、或被容器裁掉一部分的，也拍），其余按屏拍成 %s@<这一屏第一条边的 id>.png 写到 %s（视口 %s×%s，%s，motion %s%s）；不重载页面、不拨页面时间（页面时间要先用 time 装好）；返回里 shot 是每条边该写的 shot，shot 为空就是都在首屏图里，不用补拍；unlocated 非空时 exit 为 1（边的 locate 找不到或不唯一，先改 locate）；uncontrolled 为 true 的图，页面时间管不到的东西在动，diffBox 是哪一块",
		stateID, len(userEdges), stateID, outDir, text(s.width), text(s.height), s.theme, s.motion, s.localeNote("（浏览器要先按这个语言打开页面）"))
	return nil
}

func runAttribute(pr printer, p parsed) error {
	if len(p.positional) != 1 {
		return usagef("attribute 要一个测量结果文件")
	}
	m, err := readJSONFile(p.positional[0], "测量结果")
	if err != nil {
		return err
	}
	result := Attribute(m)
	fmt.Fprintln(pr.out, stringify(result, 2))
	if n := len(list(result.Get("hidden"))); n > 0 {
		pr.note("attribute: %d 个可点元素看不见（透明度为 0，或固定在屏幕上却从没出现），不参与归属", n)
	}
	if n := len(list(result.Get("roleUnresolved"))); n > 0 {
		pr.note("attribute: %d 个可点元素按「角色 + 名字」定位不到（roleUnresolved），边的 locate 对它们改写 { text: <完整文字> }", n)
	}
	for _, x := range list(result.Get("declaredNotDetected")) {
		pr.note("attribute: %s 声明了 scrollDriven 但测量没检出钉住的元素（只提示）：按声明拍，确认这一段真是滚动驱动的", text(get(x, "id")))
	}
	for _, x := range list(result.Get("undeclaredScrollDriven")) {
		pr.note("attribute: %s 是滚动驱动的段（%s），分段声明里没写：给它加 scrollDriven: true，并照 design-archive 的「拍档案截图」里的「滚动驱动的段」把每一步建成段内状态", text(get(x, "id")), joinTexts(list(get(x, "evidence")), "；"))
	}
	if !truthy(result.Get("ok")) {
		pr.note("attribute: 落空 %d 个，定位失败 %d 段，顺序不对 %d 段，重叠 %d 处，滚动驱动没声明 %d 段——补分段、改定位或补 scrollDriven 后重测，清零再写档案",
			len(list(result.Get("orphans"))), len(list(result.Get("notFound"))), len(list(result.Get("outOfOrder"))), len(list(result.Get("overlaps"))), len(list(result.Get("undeclaredScrollDriven"))))
		return &nexterr.Exit{Code: 1}
	}
	return nil
}

func runShoot(pr printer, p parsed) error {
	if len(p.positional) != 1 {
		return usagef("shoot 要一个归属结果文件")
	}
	if !p.truthyFlag("out") {
		return usagef("shoot 要 --out <目录>（Playwright 只能写它的工作区根目录里）")
	}
	attribution, err := readJSONFile(p.positional[0], "归属结果")
	if err != nil {
		return err
	}
	if _, isList := get(attribution, "ranges").([]any); !isList {
		return usagef("归属结果里没有 ranges：先跑 attribute，把它的输出存成文件")
	}
	if !truthy(get(attribution, "viewport")) || !truthy(get(attribution, "theme")) {
		return usagef("归属结果里没有 viewport / theme：用这一版 measure 量、再 attribute")
	}
	if strictEq(get(attribution, "ok"), false) {
		var lost []any
		for _, x := range list(or(get(attribution, "undeclaredScrollDriven"), []any{})) {
			lost = append(lost, get(x, "id"))
		}
		extra := ""
		if len(lost) > 0 {
			extra = fmt.Sprintf("；滚动驱动的段 %s 没写 scrollDriven", idList(lost, "、"))
		}
		return usagef("归属结果没通过（有落空、定位失败、顺序不对或重叠%s）：补分段后重测，清零了再拍", extra)
	}
	var include any
	if p.truthyFlag("include") {
		v, err := parseJSON(p.flags["include"])
		if err != nil {
			return usagef("--include 不是 JSON：%s", err.Error())
		}
		include = v
		if _, isMap := v.(Obj); !isMap || !(truthy(get(v, "role")) || truthy(get(v, "text")) || truthy(get(v, "selector"))) {
			return usagef(`--include 要是 { "role": …, "name": … } / { "text": … } / { "selector": … } 之一`)
		}
	}
	var only []string
	if p.truthyFlag("section") {
		only = []string{}
		for _, s := range strings.Split(p.flags["section"], ",") {
			if s = strings.TrimSpace(s); s != "" {
				only = append(only, s)
			}
		}
	}
	picked, err := ShootTargets(attribution, only)
	if err != nil {
		return usagef("%s", err.Error())
	}
	if len(picked.Targets) == 0 {
		var parts []string
		for _, s := range picked.Skipped {
			parts = append(parts, fmt.Sprintf("%s（%s）", text(get(s, "id")), text(get(s, "reason"))))
		}
		why := joinStr(parts, "；")
		if why == "" {
			why = "归属结果的 ranges 是空的"
		}
		return usagef("没有要拍的段：%s", why)
	}
	var targets []any
	var files []string
	for _, t := range picked.Targets {
		e := O("id", get(t, "id"), "file", get(t, "file"), "start", get(t, "start"), "end", get(t, "end"), "inScroller", get(t, "inScroller"))
		if truthy(get(t, "scrollDriven")) {
			e.Set("scrollDriven", true)
		}
		targets = append(targets, e)
		files = append(files, text(get(t, "file")))
	}
	out, _ := filepath.Abs(p.flags["out"])
	code := BuildShootCode(O(
		"targets", targets,
		"scroller", picked.Scroller,
		"viewport", get(attribution, "viewport"),
		"theme", get(attribution, "theme"),
		"motion", or(get(attribution, "motion"), "default"),
		"pageHeight", get(attribution, "pageHeight"),
		"outDir", out,
		"include", include,
	))
	pr.code(code)
	skippedNote := ""
	if len(picked.Skipped) > 0 {
		skippedNote = fmt.Sprintf("；跳过 %s（没有高度）", idList(sectionIDs(picked.Skipped), "、"))
	}
	pr.note("shoot: %d 张（%s）写到 %s%s", len(picked.Targets), joinStr(files, "、"), out, skippedNote)
	return nil
}

var runners = map[string]func(pr printer, p parsed) error{
	"time": runTime, "step": runStep, "measure": runMeasure, "attribute": runAttribute,
	"shoot": runShoot, "screen": runScreen, "cover": runCover, "pinned": runPinned,
}

type leafSpec struct{ use, short, next string }

var leaves = []struct {
	name string
	leafSpec
}{
	{"time", leafSpec{"time <root>", "打印「装时间」的代码：页面时钟和 CSS 动画时间线停在固定的起点，重载页面，按固定步长拨一段让页面起来（browser_navigate 到入口之后、做任何交互之前跑一次）", "dyna design archive check <root>"}},
	{"step", leafSpec{"step <ms>", "打印「拨一步」的代码：页面时间往前拨 N 毫秒（页面时钟和还在播的动画一起）；要先跑过 time", "dyna design archive sections time <root>"}},
	{"measure", leafSpec{"measure <root> [state]", "打印量页面的代码：定位各段、框出分块、标题和可点元素；结果留在 window.__dsMeasure，交给 attribute", "dyna design archive check <root>"}},
	{"attribute", leafSpec{"attribute <measurement>", "测量结果 → 每段的范围、每个可点元素属于哪一段、落空 / 定位失败 / 顺序不对 / 重叠 / 滚动驱动没声明（有任何一项退出码 1）", "dyna design archive sections measure <root> <state>"}},
	{"shoot", leafSpec{"shoot <attribution>", "归属结果 → 打印逐段截图的代码，一段一张 <入口状态>@<段>.png", "dyna design archive sections attribute <measurement>"}},
	{"screen", leafSpec{"screen <root> <state>", "不分段的单屏状态：打印截主视口的代码，图叫 <状态>.png", "dyna design archive check <root>"}},
	{"cover", leafSpec{"cover <root> <state>", "不分段、比主视口高的状态：打印按屏补拍首屏以下会连出边的组件的代码", "dyna design archive check <root>"}},
	{"pinned", leafSpec{"pinned <root> <state>", "滚动驱动的段里第 2 步起的状态：打印不滚动、不拨时间、直接截当前视口的代码", "dyna design archive check <root>"}},
}

// Command is the `sections` group: the leaves are the subcommands of the old script. It is mounted under
// `dyna design archive`.
func Command() *cobra.Command {
	g := registry.Group("sections", "给长页面拍设计档案截图的确定性部分：打印交给浏览器的代码，把测量结果归到各段")
	g.RunE = func(cmd *cobra.Command, args []string) error {
		if len(args) == 0 {
			return toExit(usagef("缺少子命令"))
		}
		return toExit(usagef("没有「%s」这个子命令", args[0]))
	}
	for _, l := range leaves {
		name := l.name
		c := &cobra.Command{
			Use:                l.use,
			Short:              l.short,
			Args:               cobra.ArbitraryArgs,
			SilenceUsage:       true,
			SilenceErrors:      true,
			DisableFlagParsing: true, // the flags are read by parseArgs, which keeps the exact rules the command has always had
		}
		for _, f := range commandFlags[name] {
			c.Flags().String(f, "", flagHelp[f])
		}
		c.RunE = func(cmd *cobra.Command, args []string) error {
			p, err := parseArgs(name, args)
			if err != nil {
				return toExit(err)
			}
			return toExit(runners[name](newPrinter(cmd), p))
		}
		registry.Mark(c, registry.CallerSession, l.next)
		g.AddCommand(c)
	}
	return g
}
