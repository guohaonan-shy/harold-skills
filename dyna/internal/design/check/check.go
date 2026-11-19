// Package check is the design archive's validation: the eight rules, run over a parsed archive.
//
// `docs/design/prod/` is only trustworthy if the graph in it holds together: every state can be reached (or says
// why not), every reference points at something, every journey follows real edges, every recorded decision carries
// its reasons. Nothing else catches these — a broken link or a state nobody can enter looks fine in any single
// file — so they are checked mechanically, with the file and field named, and the archive writer (which is the
// only way to write `prod/`) refuses to write when the result would not pass.
//
// Rules (the design-archive skill's check reference, 校验):
//
//	1 every state is reachable from an entry node over non-blocked edges, or has a blocked incoming edge
//	2 a state that starts async work writes loading / failure / empty — each an existing state or 「不适用」
//	3 every wikilink resolves; an edge's component is a component, its motion a motion; docs/ basenames are unique
//	4 consecutive states of a journey are joined by an edge; with several, `via` names one
//	5 state files carry no 「决定」; every decision has 为什么 / 否掉过 / 来源; every candidate 并进 / 为什么 / 证据
//	6 literal motion values carry `deviates`; `usedBy` matches the references actually found
//	7 sections of a long entry state: closed type set, ids, `locate` shapes, `from` / `section` references, `user`
//	  edges name their section, `scrollDriven` only `true`
//	8 an edge's `shot` is `<state id>@<edge id>.png` of an edge of that state; not on `system` edges, not on a state
//	  with `sections`
//
// Rule 0 is the structure the rules stand on: files that cannot be read as objects, required fields.
//
// With a delta slug the requirement's `tmp/<slug>/delta/` is laid over `prod/` first (replace by id, drop what
// removed.md lists) and the rules judge the result. `docs/design/` entries other than tmp/, prod/ and index.md are
// the old per-spec layout: one note each, never a violation, never read.
package check

import (
	"fmt"
	"regexp"
	"sort"
	"strings"
	"unicode/utf8"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/design/archive"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/frontmatter"
)

// Rules names each rule by its number.
var Rules = map[int]string{
	0: "结构",
	1: "可达",
	2: "async",
	3: "引用",
	4: "用户路径",
	5: "决定与候选",
	6: "动效",
	7: "分段",
	8: "边的截图",
}

// Violation is one thing wrong with the archive. Field is "" when the violation is about the whole file.
type Violation struct {
	Rule    int
	File    string
	Field   string
	Message string
}

// Map is the violation as the JSON the command prints: rule, file, field (null when empty), message.
func (v Violation) Map() *frontmatter.Map {
	m := frontmatter.NewMap()
	m.Set("rule", v.Rule)
	m.Set("file", v.File)
	if v.Field == "" {
		m.Set("field", nil)
	} else {
		m.Set("field", v.Field)
	}
	m.Set("message", v.Message)
	return m
}

// ViolationsJSON is the violations as JSON values (never null, an empty list is `[]`).
func ViolationsJSON(vs []Violation) []any {
	out := make([]any, 0, len(vs))
	for _, v := range vs {
		out = append(out, v.Map())
	}
	return out
}

// Options for Run.
type Options struct {
	// Delta is the spec slug whose `tmp/<slug>/delta/` is laid over `prod/`.
	Delta string
	// UsedBy judges the `usedBy` fields (the consistency half of rule 6, and rule 3's check that its links
	// resolve). false is for the archive writer, which validates a delta before it regenerates usedBy; the
	// regenerated archive is then checked with UsedBy true. Note the zero value is false: use Defaults.
	UsedBy bool
	// Workspaces are the component name prefixes of a project with more than one front end; they come from
	// `prod/index.md` (`workspaces`) unless the caller passes them (the first scan, before that file exists).
	Workspaces []string
}

// Defaults is what a plain check uses: judge usedBy, take the workspaces from the index.
func Defaults() Options { return Options{UsedBy: true} }

// Result is what Run returns.
type Result struct {
	Violations []Violation
	Notes      []string
	Archive    *archive.Archive
}

// Run loads the archive under root and checks it.
func Run(root string, opts Options) (Result, error) {
	a, err := archive.Load(root, archive.Options{Delta: opts.Delta})
	if err != nil {
		return Result{}, err
	}
	violations, err := Archive(a, opts)
	if err != nil {
		return Result{}, err
	}
	notes := []string{}
	for _, n := range a.Legacy {
		notes = append(notes, fmt.Sprintf("docs/design/%s/ 是旧布局（按 spec 命名的冻结记录），建议删——不读，不算违规", n))
	}
	notes = append(notes, SectionNotes(a)...)
	return Result{Violations: violations, Notes: notes, Archive: a}, nil
}

// Format is one violation as a line.
func Format(x Violation) string {
	field := ""
	if x.Field != "" {
		field = " · " + x.Field
	}
	return fmt.Sprintf("违规 [规则 %d %s] %s%s：%s", x.Rule, Rules[x.Rule], x.File, field, x.Message)
}

// ---------- helpers that read the untyped frontmatter the way the rules were written ----------

func filled(v any) bool {
	switch x := v.(type) {
	case nil:
		return false
	case string:
		return strings.TrimSpace(x) != ""
	case []any:
		return len(x) > 0
	}
	return true
}

func filledText(s *string) bool { return s != nil && strings.TrimSpace(*s) != "" }

func asList(v any) []any {
	switch x := v.(type) {
	case nil:
		return nil
	case []any:
		return x
	}
	return []any{v}
}

// get reads a field of a value that may or may not be a mapping.
func get(v any, key string) any {
	if m, ok := v.(*frontmatter.Map); ok {
		return m.Get(key)
	}
	return nil
}

func isObject(v any) bool { // a mapping or a list: what the rules' `typeof v === 'object'` lets through (not null)
	switch v.(type) {
	case *frontmatter.Map, []any:
		return true
	}
	return false
}

// label writes a possibly absent id the way the messages always have.
func label(s string, has bool) string {
	if !has {
		return "null"
	}
	return s
}

func nullable(s string) string {
	if s == "" {
		return "null"
	}
	return s
}

func sliceChars(s string, n int) string {
	if utf8.RuneCountInString(s) <= n {
		return s
	}
	return string([]rune(s)[:n])
}

var (
	tokenRef        = regexp.MustCompile(`^\{[^{}]+\}$`)
	decisionHeading = regexp.MustCompile(`^决定(\s*\d+)?(\s*[：:].*)?$`)
	usedByWhere     = regexp.MustCompile(`^usedBy(\[|$)`)
)

type collector struct{ out []Violation }

func (c *collector) v(rule int, file, field, message string) {
	c.out = append(c.out, Violation{Rule: rule, File: file, Field: field, Message: message})
}

// Archive checks a loaded archive. It returns the violations in rule order.
func Archive(a *archive.Archive, opts Options) ([]Violation, error) {
	c := &collector{out: []Violation{}}
	objs := a.All()
	usedBy := opts.UsedBy

	// ---------- 0: structure ----------
	for _, p := range a.Problems {
		c.v(0, p.File, "", p.Message)
	}
	for _, o := range objs {
		structure(o, c)
	}
	if err := workspacePrefixes(a, opts.Workspaces, c); err != nil {
		return nil, err
	}

	// ---------- 1: reachability ----------
	states := archive.ObjectsOfKind(a, "state")
	reached := map[string]bool{}
	var queue []string
	for _, s := range states {
		if archive.IsEntry(s) {
			queue = append(queue, s.ID)
		}
	}
	for _, id := range queue {
		reached[id] = true
	}
	for len(queue) > 0 {
		id := queue[0]
		queue = queue[1:]
		for _, e := range archive.OutgoingEdges(a, id) {
			if archive.HasBlocked(e) || e.To == "" || reached[e.To] {
				continue
			}
			if t := a.Objects[e.To]; t == nil || t.Kind != "state" {
				continue
			}
			reached[e.To] = true
			queue = append(queue, e.To)
		}
	}
	for _, s := range states {
		if reached[s.ID] {
			continue
		}
		blockedIn := false
		for _, e := range archive.IncomingEdges(a, s.ID) {
			if archive.HasBlocked(e) {
				blockedIn = true
				break
			}
		}
		if blockedIn {
			continue
		}
		c.v(1, s.File, "", fmt.Sprintf("状态 %s 既不能从任何入口节点沿非 blocked 的边到达，入边里也没有写 blocked——进入方式没人记（漏写前置条件，或缺入口）", s.ID))
	}

	// ---------- 2: async ----------
	for _, s := range states {
		if !s.FM.Has("async") {
			continue
		}
		am, ok := s.FM.Get("async").(*frontmatter.Map)
		if !ok {
			c.v(2, s.File, "async", "async 必须是 loading / failure / empty 三项的映射")
			continue
		}
		for _, key := range []string{"loading", "failure", "empty"} {
			val := am.Get(key)
			if !filled(val) {
				c.v(2, s.File, "async."+key, fmt.Sprintf("async 缺 %s：写一个状态的引用，或「不适用」", key))
				continue
			}
			if val == "不适用" {
				continue
			}
			t, ok := archive.WikilinkTarget(val)
			if !ok {
				c.v(2, s.File, "async."+key, fmt.Sprintf("「%s」既不是状态的引用也不是「不适用」", frontmatter.Text(val)))
			} else if o := a.Objects[t]; o == nil || o.Kind != "state" {
				c.v(2, s.File, "async."+key, fmt.Sprintf("[[%s]] 不是档案里的状态", t))
			}
		}
	}

	// ---------- 3: references ----------
	kindOf := func(id string) string {
		if o := a.Objects[id]; o != nil {
			return o.Kind
		}
		return ""
	}
	for _, r := range a.Refs {
		if strings.HasPrefix(r.Where, "async.") {
			continue // rule 2 judges these
		}
		if archive.Resolves(a, r.Target) {
			continue
		}
		if !usedBy && usedByWhere.MatchString(r.Where) {
			continue // about to be regenerated
		}
		c.v(3, r.File, r.Where, fmt.Sprintf("[[%s]] 解析不到：docs/ 下没有这个文件", r.Target))
	}
	expect := func(o *archive.Object, field string, value any, want string) {
		items := asList(value)
		_, isList := value.([]any)
		for i, item := range items {
			path := field
			if isList {
				path = fmt.Sprintf("%s[%d]", field, i)
			}
			if item == nil {
				continue
			}
			t, ok := archive.WikilinkTarget(item)
			if !ok {
				c.v(3, o.File, path, fmt.Sprintf("「%s」要写成指向%s的 wikilink（\"[[名字]]\"）", frontmatter.Text(item), want))
				continue
			}
			if !archive.Resolves(a, t) {
				continue // already reported as unresolved
			}
			k := kindOf(t)
			if k != want {
				is := "不是档案对象"
				if k != "" {
					is = "是" + k
				}
				c.v(3, o.File, path, fmt.Sprintf("[[%s]] %s，这里要%s", t, is, want))
			}
		}
	}
	for _, o := range objs {
		if o.Kind == "state" {
			expect(o, "page", o.FM.Get("page"), "page")
			expect(o, "components", o.FM.Get("components"), "component")
			expect(o, "motions", o.FM.Get("motions"), "motion")
		}
		if o.Kind == "page" {
			for i, r := range asList(o.FM.Get("regions")) {
				expect(o, fmt.Sprintf("regions[%d].component", i), get(r, "component"), "component")
			}
		}
		if usedBy && (o.Kind == "component" || o.Kind == "motion") {
			expect(o, "usedBy", o.FM.Get("usedBy"), "page")
		}
		if o.Kind == "journey" {
			for i, item := range asList(o.FM.Get("path")) {
				var v any = item
				if m, ok := item.(*frontmatter.Map); ok {
					v = m.Get("state")
				} else if _, ok := item.([]any); ok {
					v = nil
				}
				expect(o, fmt.Sprintf("path[%d]", i), v, "state")
			}
		}
	}
	for _, e := range a.Edges {
		o := a.Objects[e.From]
		at := fmt.Sprintf("edges[%d]", e.Index)
		var raw any
		if list, ok := o.FM.Get("edges").([]any); ok && e.Index < len(list) {
			raw = list[e.Index]
		}
		expect(o, at+".to", get(raw, "to"), "state")
		expect(o, at+".component", get(raw, "component"), "component")
		expect(o, at+".motion", get(raw, "motion"), "motion")
	}
	for _, o := range objs {
		if paths := a.Files[o.ID]; len(paths) > 1 {
			c.v(3, o.File, "", fmt.Sprintf("basename「%s」在 docs/ 下重复：%s（wiki-link 按 basename 解析，必须全局唯一）", o.ID, strings.Join(paths, "、")))
		}
	}

	// ---------- 4: journeys ----------
	type step struct {
		state  string
		via    string
		hasVia bool
	}
	for _, j := range archive.ObjectsOfKind(a, "journey") {
		var steps []step
		for _, item := range asList(j.FM.Get("path")) {
			if m, ok := item.(*frontmatter.Map); ok {
				st, _ := archive.WikilinkTarget(m.Get("state"))
				s := step{state: st}
				if via := m.Get("via"); via != nil {
					s.via, s.hasVia = frontmatter.Text(via), true
				}
				steps = append(steps, s)
			} else {
				st, _ := archive.WikilinkTarget(item)
				steps = append(steps, step{state: st})
			}
		}
		for i := 0; i+1 < len(steps); i++ {
			x, y := steps[i], steps[i+1]
			if x.state == "" || y.state == "" || kindOf(x.state) != "state" || kindOf(y.state) != "state" {
				continue
			}
			var joining []archive.Edge
			for _, e := range archive.OutgoingEdges(a, x.state) {
				if e.To == y.state {
					joining = append(joining, e)
				}
			}
			ids := func() string {
				parts := make([]string, len(joining))
				for k, e := range joining {
					parts[k] = e.ID
				}
				return strings.Join(parts, "、")
			}
			field := fmt.Sprintf("path[%d]", i)
			switch {
			case len(joining) == 0:
				c.v(4, j.File, field, fmt.Sprintf("%s 到 %s 之间没有边", x.state, y.state))
			case len(joining) > 1 && !x.hasVia:
				c.v(4, j.File, field, fmt.Sprintf("%s 到 %s 之间有 %d 条边（%s），这一项要写成 state + via", x.state, y.state, len(joining), ids()))
			case x.hasVia:
				found := false
				for _, e := range joining {
					if e.HasID && e.ID == x.via {
						found = true
					}
				}
				if !found {
					have := ""
					if len(joining) > 0 {
						have = fmt.Sprintf("（有：%s）", ids())
					}
					c.v(4, j.File, field, fmt.Sprintf("via「%s」不是 %s 到 %s 的边%s", x.via, x.state, y.state, have))
				}
			}
		}
	}

	// ---------- 5: decisions and candidates ----------
	for _, o := range objs {
		if o.Kind == "state" {
			var bad []archive.Heading
			for _, h := range archive.Headings(o.Body) {
				if decisionHeading.MatchString(h.Title) {
					bad = append(bad, h)
				}
			}
			if len(bad) > 0 {
				more := ""
				if len(bad) > 1 {
					more = fmt.Sprintf("等 %d 处", len(bad))
				}
				c.v(5, o.File, fmt.Sprintf("正文第 %d 行", bad[0].Line), fmt.Sprintf("状态文件不写「决定」（「%s」%s）：决定跟着页面、组件、动效或用户路径走", bad[0].Title, more))
			}
			continue
		}
		dec := archive.SectionOf(o.Body, "决定")
		cand := archive.SectionOf(o.Body, "设计法候选")
		if dec == nil {
			c.v(5, o.File, "", "缺「## 决定」一节（没有决定就写「无」）")
		}
		if cand == nil {
			c.v(5, o.File, "", "缺「## 设计法候选」一节（没有候选就写「无」）")
		}
		if dec != nil {
			d := archive.ParseDecisions(dec)
			for _, p := range d.Problems {
				c.v(5, o.File, fmt.Sprintf("正文第 %d 行起的「决定」", dec.Line), p)
			}
			if !d.None && len(d.Entries) == 0 && len(d.Problems) == 0 {
				c.v(5, o.File, fmt.Sprintf("正文第 %d 行", dec.Line), "「决定」一节是空的：没有决定写「无」，空着分不清是没有还是漏了")
			}
			for _, e := range d.Entries {
				for _, it := range []struct {
					label string
					val   *string
				}{{"为什么", e.Why}, {"否掉过", e.Rejected}, {"来源", e.Source}} {
					if !filledText(it.val) {
						extra := ""
						if it.label == "否掉过" {
							extra = "（确实没有备选写「无」）"
						}
						c.v(5, o.File, fmt.Sprintf("决定 %d（正文第 %d 行）", e.N, e.Line), fmt.Sprintf("决定 %d 缺「%s」%s", e.N, it.label, extra))
					}
				}
			}
		}
		if cand != nil {
			cs := archive.ParseCandidates(cand)
			for _, p := range cs.Problems {
				c.v(5, o.File, fmt.Sprintf("正文第 %d 行起的「设计法候选」", cand.Line), p)
			}
			for _, e := range cs.Entries {
				for _, it := range []struct {
					label string
					val   *string
				}{{"并进", e.Merge}, {"为什么", e.Why}, {"证据", e.Evidence}} {
					if !filledText(it.val) {
						c.v(5, o.File, fmt.Sprintf("候选「%s」（正文第 %d 行）", sliceChars(e.Rule, 24), e.Line), fmt.Sprintf("候选缺「%s」", it.label))
					}
				}
			}
		}
	}

	// ---------- 6: motions and usedBy ----------
	for _, m := range archive.ObjectsOfKind(a, "motion") {
		var literals []string
		var values []string
		for _, k := range []string{"duration", "easing"} {
			v := m.FM.Get(k)
			if !filled(v) {
				continue
			}
			if s, ok := v.(string); ok && tokenRef.MatchString(strings.TrimSpace(s)) {
				continue
			}
			literals = append(literals, k)
			values = append(values, frontmatter.Text(v))
		}
		if len(literals) > 0 && !filled(m.FM.Get("deviates")) {
			c.v(6, m.File, "deviates", fmt.Sprintf("%s 写的是字面值（%s），要用 {token} 引用，或者写 deviates 说明为什么偏离", strings.Join(literals, "、"), strings.Join(values, "、")))
		}
	}
	if usedBy {
		used := archive.ComputeUsedBy(a)
		for _, kk := range []struct {
			kind string
			m    map[string][]string
		}{{"component", used.Components}, {"motion", used.Motions}} {
			for _, o := range archive.ObjectsOfKind(a, kk.kind) {
				ub := o.FM.Get("usedBy")
				if ub == nil {
					c.v(6, o.File, "usedBy", "usedBy 缺失——未生成（由归档命令反向生成，不手写）")
					continue
				}
				list, ok := ub.([]any)
				if !ok {
					c.v(6, o.File, "usedBy", "usedBy 必须是页面引用的列表")
					continue
				}
				var have []string
				haveSet := map[string]bool{}
				for _, x := range list {
					t, ok := archive.WikilinkTarget(x)
					if !ok {
						t = frontmatter.Text(x)
					}
					if !haveSet[t] {
						haveSet[t] = true
						have = append(have, t)
					}
				}
				want := kk.m[o.ID]
				wantSet := map[string]bool{}
				for _, w := range want {
					wantSet[w] = true
				}
				var missing, extra []string
				for _, w := range want {
					if !haveSet[w] {
						missing = append(missing, w)
					}
				}
				for _, h := range have {
					if !wantSet[h] {
						extra = append(extra, h)
					}
				}
				if len(missing) > 0 || len(extra) > 0 {
					var parts []string
					links := func(xs []string) string {
						ls := make([]string, len(xs))
						for i, x := range xs {
							ls[i] = "[[" + x + "]]"
						}
						return strings.Join(ls, "、")
					}
					if len(missing) > 0 {
						parts = append(parts, "少了 "+links(missing))
					}
					if len(extra) > 0 {
						parts = append(parts, "多了 "+links(extra))
					}
					c.v(6, o.File, "usedBy", "usedBy 与实际引用不一致："+strings.Join(parts, "；"))
				}
			}
		}
	}

	// ---------- 7: sections ----------
	sectionRules(a, c)

	// ---------- 8: edge screenshots ----------
	shotRules(a, c)

	return c.out, nil
}

func sortedStates(a *archive.Archive) []*archive.Object {
	states := archive.ObjectsOfKind(a, "state")
	sort.SliceStable(states, func(i, j int) bool { return states[i].ID < states[j].ID })
	return states
}

var shotForm = regexp.MustCompile(`^[^@\s]+@[^@\s]+\.png$`)

// shotRules is rule 8. An edge's `shot` is `<state id>@<edge id>.png`: the supplementary image its component is in
// (an edge without `shot` has its component in the main viewport image). Several edges may name one image.
// Whether the file exists is not judged here (it may be an LFS pointer): the query reports it.
func shotRules(a *archive.Archive, c *collector) {
	const form = "<出发状态 id>@<边 id>.png"
	for _, s := range sortedStates(a) {
		var edges []archive.Edge
		for _, x := range a.Edges {
			if x.From == s.ID {
				edges = append(edges, x)
			}
		}
		var ids []string
		idSet := map[string]bool{}
		for _, e := range edges {
			if e.HasID && !idSet[e.ID] {
				idSet[e.ID] = true
				ids = append(ids, e.ID)
			}
		}
		for _, e := range edges {
			if e.Shot == nil {
				continue
			}
			field := fmt.Sprintf("edges[%d].shot", e.Index)
			shot, isString := e.Shot.(string)
			switch {
			case e.Kind == "system":
				c.v(8, s.File, field, fmt.Sprintf("system 边「%s」不经过组件，不写 shot", label(e.ID, e.HasID)))
			case s.FM.Has("sections"):
				c.v(8, s.File, field, fmt.Sprintf("%s 声明了 sections，分段页的边用 from 挂在段上，不写 shot", s.ID))
			case !isString || !shotForm.MatchString(shot):
				eid := "save"
				if e.HasID {
					eid = e.ID
				}
				shown, _ := frontmatter.JSON(e.Shot, 0)
				c.v(8, s.File, field, fmt.Sprintf("shot 写法不对，应为 %s（如 %s@%s.png），现在是 %s", form, s.ID, eid, shown))
			case !strings.HasPrefix(shot, s.ID+"@"):
				c.v(8, s.File, field, fmt.Sprintf("shot「%s」的前半要是出发状态 %s（%s），补拍图放在出发状态自己的 assets/ 里", shot, s.ID, form))
			default:
				named := shot[len(s.ID)+1 : len(shot)-len(".png")]
				if !idSet[named] {
					have := ""
					if len(ids) > 0 {
						have = "；它现有的边：" + strings.Join(ids, "、")
					}
					c.v(8, s.File, field, fmt.Sprintf("shot「%s」里的边 id「%s」不是 %s 的边%s", shot, named, s.ID, have))
				}
			}
		}
	}
}

func typeList() string {
	names := make([]string, len(archive.SectionTypes))
	for i, t := range archive.SectionTypes {
		names[i] = t.Name
	}
	return strings.Join(names, " ")
}

var wholeWikilink = regexp.MustCompile(`^\s*\[\[.*\]\]\s*$`)

// badSectionRef says why a `<page>#<section>` value cannot be used here, or "" when it names a declared section.
// raw is the value as written; page and declared are the page it has to name and the sections that page declares.
func badSectionRef(raw any, wantPage string, declared []archive.StateSection, what string) string {
	s, ok := raw.(string)
	if !ok {
		shown, _ := frontmatter.JSON(raw, 0)
		return fmt.Sprintf("%s要写成 <页面>#<段> 的普通字符串（现在是 %s）", what, shown)
	}
	page := nullable(wantPage)
	if wholeWikilink.MatchString(s) {
		return fmt.Sprintf("%s「%s」要写普通字符串 %s#<段>，不写 wikilink（Obsidian 会把 # 后面当成页面文件里的标题）", what, s, page)
	}
	ref, ok := archive.ParseSectionRef(s)
	if !ok {
		return fmt.Sprintf("%s「%s」写法不对，应为 <页面>#<段>（如 %s#hero）", what, s, page)
	}
	if wantPage == "" || ref.Page != wantPage {
		return fmt.Sprintf("%s「%s」的页面部分应是 %s", what, s, page)
	}
	found := false
	ids := make([]string, len(declared))
	for i, x := range declared {
		ids[i] = x.ID
		if x.HasID && x.ID == ref.ID {
			found = true
		}
	}
	if !found {
		if len(declared) > 0 {
			return fmt.Sprintf("%s「%s」指向的段 %s 没有声明过；%s 现有分段：%s", what, s, ref.ID, page, strings.Join(ids, "、"))
		}
		return fmt.Sprintf("%s「%s」指向的段 %s 没有声明过（%s 的入口状态没有 sections）", what, s, ref.ID, page)
	}
	return ""
}

// sectionRules is rule 7.
func sectionRules(a *archive.Archive, c *collector) {
	states := sortedStates(a)
	declaring := map[string]*archive.Object{} // page id -> the entry state whose `sections` count

	for _, s := range states {
		if !s.FM.Has("sections") {
			continue
		}
		page := archive.PageOfState(s)
		if !archive.IsEntry(s) {
			c.v(7, s.File, "sections", fmt.Sprintf("sections 只写在入口状态上（有 entry 的状态），%s 不是入口", s.ID))
			continue
		}
		if _, ok := s.FM.Get("sections").([]any); !ok {
			c.v(7, s.File, "sections", "sections 必须是列表（自上而下，顺序即页面顺序）")
			continue
		}
		if prev, ok := declaring[page]; ok {
			c.v(7, s.File, "sections", fmt.Sprintf("页面 %s 的分段已经由 %s 声明；两个入口状态都写 sections，「%s#<段>」就指不到唯一一处", nullable(page), prev.ID, nullable(page)))
			continue
		}
		declaring[page] = s
		list := archive.SectionsOfState(s)
		seen := map[string]bool{}
		for _, x := range list {
			at := fmt.Sprintf("sections[%d]", x.Index)
			switch {
			case x.IDError == "format":
				c.v(7, s.File, at+".id", fmt.Sprintf("分段 id「%s」写法不对：要 <类型> 或 <类型>-<限定词>，小写 kebab-case", x.ID))
			case x.IDError == "type":
				c.v(7, s.File, at+".id", fmt.Sprintf("分段 id「%s」的类型不在闭集里；类型表：%s", x.ID, typeList()))
			case seen[x.ID]:
				c.v(7, s.File, at+".id", fmt.Sprintf("分段 id「%s」在 %s 里重名", x.ID, nullable(page)))
			}
			if x.HasID {
				seen[x.ID] = true
			}
			if x.By == nil {
				c.v(7, s.File, at+".locate", "locate 只能是 { role: heading, name: <完整标题> }、{ role: banner } / { role: contentinfo }、{ position: N } 三种之一")
			}
			if x.ScrollDrivenSet && x.ScrollDriven != true {
				shown, _ := frontmatter.JSON(x.ScrollDriven, 0)
				c.v(7, s.File, at+".scrollDriven", fmt.Sprintf("scrollDriven 只能写 true（现在是 %s）：不是滚动驱动的段不写这个字段", shown))
			}
		}
		// the same type more than once: every one of them carries a qualifier
		var typeOrder []string
		byType := map[string][]archive.StateSection{}
		for _, x := range list {
			if x.Type == "" {
				continue
			}
			if _, ok := byType[x.Type]; !ok {
				typeOrder = append(typeOrder, x.Type)
			}
			byType[x.Type] = append(byType[x.Type], x)
		}
		for _, typ := range typeOrder {
			xs := byType[typ]
			var bare *archive.StateSection
			for i := range xs {
				if xs[i].Qualifier == "" {
					bare = &xs[i]
					break
				}
			}
			if len(xs) > 1 && bare != nil {
				ids := make([]string, len(xs))
				for i, x := range xs {
					ids[i] = x.ID
				}
				c.v(7, s.File, fmt.Sprintf("sections[%d].id", bare.Index), fmt.Sprintf("同一页出现了 %d 个 %s 类的段（%s），要每个都加限定词（如 %s-<按内容起的词>）", len(xs), typ, strings.Join(ids, "、"), typ))
			}
		}
	}

	declared := func(page string) []archive.StateSection { return archive.SectionsOfPage(a, page) }
	for _, s := range states {
		page := archive.PageOfState(s)
		isDeclaring := declaring[page] != nil && declaring[page].ID == s.ID
		for _, e := range a.Edges {
			if e.From != s.ID {
				continue
			}
			at := fmt.Sprintf("edges[%d]", e.Index)
			if e.HasFromSection {
				if why := badSectionRef(e.FromSection, page, declared(page), "边的 from（本页的出发段）"); why != "" {
					c.v(7, s.File, at+".from", why)
				}
			} else if isDeclaring && e.Kind == "user" {
				c.v(7, s.File, at+".from", fmt.Sprintf("%s 声明了分段，user 边「%s」要写 from: %s#<出发段>", s.ID, label(e.ID, e.HasID), nullable(page)))
			}
			if e.HasToSection {
				var target *archive.Object
				if e.To != "" {
					target = a.Objects[e.To]
				}
				if target == nil || target.Kind != "state" {
					continue // rule 3
				}
				if !archive.IsEntry(target) {
					c.v(7, s.File, at+".section", fmt.Sprintf("边的 section 要落在入口状态的段上，而 %s 不是入口状态", target.ID))
				} else if why := badSectionRef(e.ToSection, archive.PageOfState(target), archive.SectionsOfState(target), fmt.Sprintf("边的 section（落在 %s 的段）", target.ID)); why != "" {
					c.v(7, s.File, at+".section", why)
				}
			}
		}
		if s.FM.Has("section") {
			if archive.IsEntry(s) {
				c.v(7, s.File, "section", "入口状态不写 section（它自己有 sections）")
			} else if why := badSectionRef(s.FM.Get("section"), page, declared(page), "状态的 section（它发生在本页哪一段）"); why != "" {
				c.v(7, s.File, "section", why)
			}
		}
	}
}

// SectionNotes are hints for sections that are allowed but weak: `content` as a catch-all, a locate by position.
func SectionNotes(a *archive.Archive) []string {
	var out []string
	for _, page := range archive.ObjectsOfKind(a, "page") {
		entries := archive.SectionEntries(a, page.ID)
		if len(entries) == 0 {
			continue
		}
		entry := entries[0]
		for _, x := range archive.SectionsOfState(entry) {
			at := fmt.Sprintf("%s · sections[%d]", entry.File, x.Index)
			if x.Type == "content" {
				out = append(out, fmt.Sprintf("%s：分段「%s」用了 content 兜底——多半该归进某一类，或者类型表里缺一类", at, x.ID))
			}
			if x.By != nil && x.By.Kind == "position" {
				out = append(out, fmt.Sprintf("%s：分段「%s」按第 %d 个顶层分块定位，这条定位比较脆，页面加一个分块就会错位", at, x.ID, x.By.Position))
			}
		}
	}
	return out
}

// structure is rule 0 for one object: the fields the other rules and the queries lean on.
func structure(o *archive.Object, c *collector) {
	f := o.FM
	if !filled(f.Get("summary")) {
		c.v(0, o.File, "summary", "缺 summary（wiki 约定的 type / tags / summary）")
	}
	if !f.Has("tags") {
		c.v(0, o.File, "tags", "缺 tags")
	}
	if o.Kind == "page" {
		if !filled(f.Get("code")) {
			c.v(0, o.File, "code", "页面缺 code（页面入口代码路径）")
		}
		regions, ok := f.Get("regions").([]any)
		if !ok {
			c.v(0, o.File, "regions", "页面缺 regions（区域 → 组件的列表）")
		} else {
			for i, r := range regions {
				m, isMap := r.(*frontmatter.Map)
				if !isMap || !filled(m.Get("name")) || !filled(m.Get("component")) {
					c.v(0, o.File, fmt.Sprintf("regions[%d]", i), "每个区域要有 name 和 component")
				}
			}
		}
	}
	if o.Kind == "component" && !filled(f.Get("code")) {
		c.v(0, o.File, "code", "组件缺 code（代码路径）")
	}
	if o.Kind == "motion" {
		for _, k := range []string{"duration", "easing"} {
			if !filled(f.Get(k)) {
				c.v(0, o.File, k, "动效缺 "+k)
			}
		}
	}
	if o.Kind == "journey" {
		if !filled(f.Get("intent")) {
			c.v(0, o.File, "intent", "用户路径缺 intent（一句话意图）")
		}
		if path, ok := f.Get("path").([]any); !ok || len(path) == 0 {
			c.v(0, o.File, "path", "用户路径缺 path（有序状态列表）")
		}
	}
	if o.Kind != "state" {
		return
	}
	if !filled(f.Get("page")) {
		c.v(0, o.File, "page", "状态缺 page")
	}
	if f.Has("entry") {
		em, ok := f.Get("entry").(*frontmatter.Map)
		if !ok || !filled(em.Get("url")) {
			c.v(0, o.File, "entry", "入口节点的 entry 要有 url（和 preconditions）")
		}
	}
	if f.Has("edges") {
		if _, ok := f.Get("edges").([]any); !ok {
			c.v(0, o.File, "edges", "edges 必须是列表")
		}
	}
	seen := map[string]bool{}
	for i, item := range asList(f.Get("edges")) {
		at := fmt.Sprintf("edges[%d]", i)
		e, ok := item.(*frontmatter.Map)
		if !ok {
			c.v(0, o.File, at, "每条边是一个映射")
			continue
		}
		switch {
		case !filled(e.Get("id")):
			c.v(0, o.File, at, "边缺 id（在本状态内唯一）")
		case seen[frontmatter.Text(e.Get("id"))]:
			c.v(0, o.File, at, fmt.Sprintf("边 id「%s」在本状态内重复", frontmatter.Text(e.Get("id"))))
		default:
			seen[frontmatter.Text(e.Get("id"))] = true
		}
		if !filled(e.Get("to")) {
			c.v(0, o.File, at+".to", "边缺 to（目标状态）")
		}
		if w := e.Get("when"); w != nil {
			if s, ok := w.(string); !ok || strings.TrimSpace(s) == "" {
				c.v(0, o.File, at+".when", "when 是一句话的条件（字符串），不能为空")
			}
		}
		kind := e.Get("kind")
		if kind != "user" && kind != "system" {
			shown := "缺失"
			if kind != nil {
				shown = frontmatter.Text(kind)
			}
			c.v(0, o.File, at+".kind", fmt.Sprintf("边的 kind 只能是 user 或 system（现在是 %s）", shown))
			continue
		}
		if b := e.Get("blocked"); b != nil && b != false {
			bm, ok := b.(*frontmatter.Map)
			tried, isList := (any)(nil), false
			if ok {
				tried = bm.Get("tried")
				_, isList = tried.([]any)
			}
			if !ok || !filled(bm.Get("missing")) || !isList || len(tried.([]any)) == 0 {
				c.v(0, o.File, at+".blocked", "blocked 要写 missing（缺什么）和 tried（试过什么，列表）")
			}
			continue
		}
		need := []string{"trigger", "how"}
		if kind == "user" {
			need = []string{"component", "locate", "action"}
		}
		for _, k := range need {
			if !filled(e.Get(k)) {
				c.v(0, o.File, at+"."+k, fmt.Sprintf("%s 边缺 %s", kind, k))
			}
		}
		if kind == "user" && filled(e.Get("locate")) && !edgeLocateOK(e.Get("locate")) {
			c.v(0, o.File, at+".locate", "locate 要写 role 和 name（用 ARIA 角色和名字定位）；按角色定位不到的元素才改写成只有 text 的 { text: <完整文字> }，两种不混写")
		}
	}
}

// edgeLocateOK: an edge's `locate` is `{ role, name }`, or — when the element cannot be found by role — `{ text }` alone.
func edgeLocateOK(locate any) bool {
	m, ok := locate.(*frontmatter.Map)
	if !ok {
		return false
	}
	if m.Has("text") {
		s, isString := m.Get("text").(string)
		return m.Len() == 1 && isString && strings.TrimSpace(s) != ""
	}
	return filled(m.Get("role")) && filled(m.Get("name"))
}

var kebabWord = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)

// IndexFile is where the project declares its workspaces.
const IndexFile = "docs/design/prod/index.md"

// parseWorkspaces reads `workspaces` as a list of prefixes; false when it is not a non-empty list of kebab-case words.
func parseWorkspaces(value any) ([]string, bool) {
	list, ok := value.([]any)
	if !ok || len(list) == 0 {
		return nil, false
	}
	out := make([]string, len(list))
	for i, x := range list {
		s, ok := x.(string)
		if !ok || !kebabWord.MatchString(s) {
			return nil, false
		}
		out[i] = s
	}
	return out, true
}

// ParseWorkspacePrefixes reads prefixes a person typed (`mkt,app`): false when any is not kebab-case or there are none.
func ParseWorkspacePrefixes(prefixes []string) bool {
	if len(prefixes) == 0 {
		return false
	}
	for _, p := range prefixes {
		if !kebabWord.MatchString(p) {
			return false
		}
	}
	return true
}

// workspacePrefixes: a project with more than one front end names every component file with the workspace's
// prefix (`mkt-SiteFooter`, `app-SiteFooter`), so two workspaces' same-named components do not collide on
// basename. The prefixes are the project's to declare, in `prod/index.md`; the caller can hand them in when that
// file does not exist yet.
func workspacePrefixes(a *archive.Archive, given []string, c *collector) error {
	prefixes := given
	if given == nil {
		if a.Index == nil || !a.Index.Has("workspaces") {
			return nil
		}
		var ok bool
		prefixes, ok = parseWorkspaces(a.Index.Get("workspaces"))
		if !ok {
			c.v(0, IndexFile, "workspaces", "workspaces 要写成工作区前缀的列表（小写 kebab-case，如 [mkt, app]），不能为空")
			return nil
		}
	} else if !ParseWorkspacePrefixes(prefixes) {
		return fmt.Errorf("workspaces 要是工作区前缀的列表（小写 kebab-case，如 mkt、app），不能为空")
	}
	for _, o := range archive.ObjectsOfKind(a, "component") {
		has := false
		for _, p := range prefixes {
			if strings.HasPrefix(o.ID, p+"-") {
				has = true
				break
			}
		}
		if has {
			continue
		}
		shown := make([]string, len(prefixes))
		for i, p := range prefixes {
			shown[i] = p + "-"
		}
		c.v(0, o.File, "", fmt.Sprintf("组件文件名「%s」要带工作区前缀（%s），如 %s-%s；前缀在 prod/index.md 的 workspaces 里声明", o.ID, strings.Join(shown, "、"), prefixes[0], o.ID))
	}
	return nil
}
