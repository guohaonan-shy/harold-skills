package seo

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/issues"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/jsstr"
)

// DirectionNames are the directions as the issue titles and bodies call them.
var DirectionNames = map[string]string{
	"technical": "技术 SEO 与索引",
	"pages":     "已有页面优化",
	"keywords":  "关键词挖掘与新内容",
	"backlinks": "外链",
	"geo":       "AI 搜索可见性",
}

var (
	kindRe   = regexp.MustCompile(`^[\p{Ll}\p{Lo}\p{Nd}]+(-[\p{Ll}\p{Lo}\p{Nd}]+)*$`)
	markerRe = regexp.MustCompile(`<!-- seo-finding: ([a-z]+/[^` + wsIn + `>]+) -->`)
	percent  = regexp.MustCompile(`\d` + ws + `*%|百分之`)
)

func findingMarker(g *Group) string {
	return fmt.Sprintf("<!-- seo-finding: %s/%s -->", toString(g.Get("direction")), toString(g.Get("kind")))
}

// Rejection is why a finding cannot become an issue, or "" when it can: no evidence, no repro, empty acceptance, or a
// percentage without numerator and denominator.
func Rejection(f any) string {
	direction, _ := get(f, "direction").(string)
	if !contains(Directions, direction) || !isString(get(f, "direction")) {
		return fmt.Sprintf("方向「%s」不认识", toString(get(f, "direction")))
	}
	if !kindRe.MatchString(orEmpty(get(f, "kind"))) {
		return fmt.Sprintf("kind「%s」不是连字符连起来的短名（小写字母、数字、中文）", orEmpty(get(f, "kind")))
	}
	if !filled(get(f, "title")) {
		return "缺 title"
	}
	ev := get(f, "evidence")
	if !truthy(ev) {
		return "缺证据（查了什么、拿回什么）"
	}
	if _, isObject := evidenceObject(ev); isObject {
		if !(filled(get(ev, "what")) && filled(get(ev, "values"))) {
			return "缺证据（查了什么、拿回什么）"
		}
	} else if !filled(ev) {
		return "缺证据（查了什么、拿回什么）"
	}
	if !filled(get(f, "repro")) {
		return "缺复现方法"
	}
	acc, isArr := get(f, "acceptance").([]any)
	someFilled := false
	for _, a := range acc {
		if filled(a) {
			someFilled = true
		}
	}
	if !isArr || !someFilled {
		return "缺验收标准"
	}
	parts := []any{get(f, "title"), text(ev), get(f, "fix")}
	parts = append(parts, acc...)
	prose := make([]string, len(parts))
	for i, p := range parts {
		prose[i] = orEmpty(p)
	}
	if percent.MatchString(strings.Join(prose, " ")) {
		ratio := get(f, "ratio")
		_, num := get(ratio, "numerator").(float64)
		_, den := get(ratio, "denominator").(float64)
		if !(num && den) {
			return "用了百分比却没给分子分母（ratio）"
		}
	}
	return ""
}

func isString(v any) bool { _, ok := v.(string); return ok }

// evidenceObject reports whether v is `typeof v === 'object'` (an object or an array; null is handled before).
func evidenceObject(v any) (any, bool) {
	switch v.(type) {
	case *Obj, []any:
		return v, true
	}
	return v, false
}

// Group is the findings of one direction and kind, merged: the first finding's fields, plus every target, evidence,
// repro, acceptance and assumption the others brought.
type Group struct {
	*Obj
	Targets     []string
	Evidences   []any
	Repros      []string
	Acceptance  []string
	Assumptions []string
}

func uniqFilled(xs []any) []string {
	var out []string
	for _, x := range xs {
		if filled(x) {
			out = append(out, jsstr.Trim(toString(x)))
		}
	}
	return uniqueStrings(out)
}

func spread(v any, what string) ([]any, error) {
	switch t := v.(type) {
	case nil, undefT:
		return nil, nil
	case []any:
		return t, nil
	case string:
		var out []any
		for _, r := range t {
			out = append(out, string(r))
		}
		return out, nil
	}
	return nil, fmt.Errorf("%s 不是数组", what)
}

// Merge groups findings by direction and kind, in the order they were first seen.
func Merge(findings []any) ([]*Group, error) {
	var order []string
	groups := map[string]*Group{}
	for _, f := range findings {
		k := toString(get(f, "direction")) + "/" + toString(get(f, "kind"))
		g, ok := groups[k]
		if !ok {
			base := NewObj()
			if o, isObj := f.(*Obj); isObj {
				for _, key := range o.Keys {
					base.Set(key, o.Vals[key])
				}
			}
			g = &Group{Obj: base}
			groups[k] = g
			order = append(order, k)
		}
		targets, err := spread(get(f, "targets"), "targets")
		if err != nil {
			return nil, err
		}
		var tv []any
		for _, t := range g.Targets {
			tv = append(tv, t)
		}
		g.Targets = uniqFilled(append(tv, targets...))
		g.Evidences = append(g.Evidences, get(f, "evidence"))
		var rv []any
		for _, r := range g.Repros {
			rv = append(rv, r)
		}
		g.Repros = uniqFilled(append(rv, get(f, "repro")))
		acceptance, err := spread(get(f, "acceptance"), "acceptance")
		if err != nil {
			return nil, err
		}
		var av []any
		for _, a := range g.Acceptance {
			av = append(av, a)
		}
		g.Acceptance = uniqFilled(append(av, acceptance...))
		assumptions, err := spread(get(f, "assumptions"), "assumptions")
		if err != nil {
			return nil, err
		}
		var sv []any
		for _, a := range g.Assumptions {
			sv = append(sv, a)
		}
		g.Assumptions = uniqFilled(append(sv, assumptions...))
	}
	out := make([]*Group, len(order))
	for i, k := range order {
		out[i] = groups[k]
	}
	return out, nil
}

func evidenceLine(ev any) string {
	if _, isObject := evidenceObject(ev); isObject && truthy(ev) {
		var parts []string
		for _, p := range []any{get(ev, "when"), get(ev, "what")} {
			if filled(p) {
				parts = append(parts, toString(p))
			}
		}
		return fmt.Sprintf("- %s：%s", strings.Join(parts, " · "), text(get(ev, "values")))
	}
	return "- " + text(ev)
}

func ratioLine(r any) string {
	if !truthy(r) {
		return ""
	}
	return fmt.Sprintf("\n比例：%s / %s", toString(get(r, "numerator")), toString(get(r, "denominator")))
}

func bullets(xs []string) string {
	lines := make([]string, len(xs))
	for i, x := range xs {
		lines[i] = "- " + x
	}
	return strings.Join(lines, "\n")
}

// IssueTitle is the title of the issue a group becomes.
func IssueTitle(g *Group) string {
	return fmt.Sprintf("SEO（%s）：%s", DirectionNames[toString(g.Get("direction"))], toString(g.Get("title")))
}

// scope is 影响范围: how many places, the share when the finding has one, and the list.
func scope(g *Group) string {
	share := ""
	if r := g.Get("ratio"); truthy(r) {
		share = fmt.Sprintf("，占 %s / %s", toString(get(r, "numerator")), toString(get(r, "denominator")))
	}
	if len(g.Targets) > 0 {
		return fmt.Sprintf("受影响 %d 处%s：\n\n%s", len(g.Targets), share, bullets(g.Targets))
	}
	return fmt.Sprintf("没有列出具体的处%s，范围见证据。", share)
}

// IssueBody is the body of the issue a group becomes: the five sections every issue needs, plus how to reproduce it,
// because the issue session re-runs that independently.
func IssueBody(g *Group, date string) string {
	direction := toString(g.Get("direction"))
	evidences := make([]string, len(g.Evidences))
	for i, ev := range g.Evidences {
		evidences[i] = evidenceLine(ev)
	}
	fix := text(g.Get("fix"))
	if fix == "" {
		fix = "需要诊断"
	}
	acceptance := make([]string, len(g.Acceptance))
	for i, a := range g.Acceptance {
		acceptance[i] = "- [ ] " + a
	}
	parts := []string{
		fmt.Sprintf("## 背景\n\n这条 issue 是 seo-scan 在 %s 扫描「%s」方向时提出的。「怎么复现」一节可以独立重跑，拿到的结果应该和「证据」一致；「建议的修法」是扫描时的判断，triage 时要先核实再采用。", date, DirectionNames[direction]),
		fmt.Sprintf("## 问题\n\n%s", toString(g.Get("title"))),
		fmt.Sprintf("## 证据\n\n%s%s", strings.Join(evidences, "\n"), ratioLine(g.Get("ratio"))),
		fmt.Sprintf("## 影响范围\n\n%s", scope(g)),
		fmt.Sprintf("## 从哪发现\n\nseo-scan %s 的 %s 方向", date, direction),
		fmt.Sprintf("## 怎么复现\n\n%s", strings.Join(g.Repros, "\n\n")),
		fmt.Sprintf("## 建议的修法\n\n%s", fix),
		fmt.Sprintf("## 验收标准\n\n%s", strings.Join(acceptance, "\n")),
	}
	if len(g.Assumptions) > 0 {
		parts = append(parts, fmt.Sprintf("## 扫描时的假设\n\n无人值守时代替提问用的默认值，triage 时核一下：\n\n%s", bullets(g.Assumptions)))
	}
	if c := g.Get("content"); truthy(c) {
		mode := "新开页"
		if get(c, "mode") == "update" {
			mode = "改已有页"
		}
		parts = append(parts, fmt.Sprintf("## triage 阶段\n\n内容类：目标词「%s」，页面类型「%s」，%s。起草 spec 时用 `idea-loop:seo-writing` 的 brief 分支写「方案」；spec 标题下第一行写「> 需要 grill：选题角度和论点」，由人定。实现阶段用 `idea-loop:seo-writing` 按 brief 写。", text(get(c, "keyword")), text(get(c, "pageType")), mode))
	}
	if direction == "backlinks" {
		parts = append(parts, "## 实现阶段\n\n用 `idea-loop:seo-outreach` 起草邮件和跟进表，产出是 home 里 `docs/` 下的草稿和跟进表。草稿进人的草稿箱，人说「发」才发。")
	}
	parts = append(parts, fmt.Sprintf("---\n由 `idea-loop:seo-scan` 提出。\n\n%s", findingMarker(g)))
	return strings.Join(parts, "\n\n")
}

// CommentBody is the comment an open issue with the same marker gets: this run's evidence and the targets it did not know.
func CommentBody(g *Group, known string) string {
	var fresh []string
	for _, t := range g.Targets {
		if !strings.Contains(known, t) {
			fresh = append(fresh, t)
		}
	}
	evidences := make([]string, len(g.Evidences))
	for i, ev := range g.Evidences {
		evidences[i] = evidenceLine(ev)
	}
	freshText := "受影响处没有新增。"
	if len(fresh) > 0 {
		freshText = "**新增的受影响处**\n\n" + bullets(fresh)
	}
	return strings.Join([]string{
		"`idea-loop:seo-scan` 本次又发现了同一个问题。",
		fmt.Sprintf("**本次证据**\n\n%s%s", strings.Join(evidences, "\n"), ratioLine(g.Get("ratio"))),
		freshText,
	}, "\n\n")
}

// NewIssue is an issue to open.
type NewIssue struct {
	Direction string
	Title     string
	Body      string
}

// NewComment is a comment on an open issue.
type NewComment struct {
	Number int
	Title  string
	Body   string
}

// Rejected is a finding that did not become an issue, and why.
type Rejected struct {
	Title  string `json:"title"`
	Reason string `json:"reason"`
}

// IssuePlan is what to do with a run's findings.
type IssuePlan struct {
	Create   []NewIssue
	Comment  []NewComment
	Rejected []Rejected
}

// OpenIssue is an open issue of the project, as the plan reads it.
type OpenIssue struct {
	Number int
	Title  string
	Body   string
}

// Plan decides what to do with a run's findings, given the open issues. date is the scan's.
func Plan(findings []any, open []OpenIssue, date string) (*IssuePlan, error) {
	p := &IssuePlan{Create: []NewIssue{}, Comment: []NewComment{}, Rejected: []Rejected{}}
	var ok []any
	for _, f := range findings {
		if truthy(f) && get(f, "uncollected") != undef {
			continue
		}
		if why := Rejection(f); why != "" {
			title := text(get(f, "title"))
			if title == "" {
				title = "(无标题)"
			}
			p.Rejected = append(p.Rejected, Rejected{Title: title, Reason: why})
		} else {
			ok = append(ok, f)
		}
	}
	byMarker := map[string]OpenIssue{}
	for _, i := range open {
		if m := markerRe.FindStringSubmatch(i.Body); m != nil {
			if _, seen := byMarker[m[1]]; !seen {
				byMarker[m[1]] = i
			}
		}
	}
	groups, err := Merge(ok)
	if err != nil {
		return nil, err
	}
	for _, g := range groups {
		key := toString(g.Get("direction")) + "/" + toString(g.Get("kind"))
		if hit, found := byMarker[key]; found {
			p.Comment = append(p.Comment, NewComment{Number: hit.Number, Title: hit.Title, Body: CommentBody(g, hit.Body)})
			continue
		}
		body := IssueBody(g, date)
		if errs := issues.BodyErrors(body); len(errs) > 0 {
			p.Rejected = append(p.Rejected, Rejected{Title: IssueTitle(g), Reason: "正文不合格：" + strings.Join(errs, "；")})
		} else {
			p.Create = append(p.Create, NewIssue{Direction: toString(g.Get("direction")), Title: IssueTitle(g), Body: body})
		}
	}
	return p, nil
}

// Created is an issue that was opened; Number is null when gh's answer carried none.
type Created struct {
	Number *int   `json:"number"`
	Title  string `json:"title"`
}

// Commented is an issue that got a comment.
type Commented struct {
	Number int    `json:"number"`
	Title  string `json:"title"`
}

// IssueResult is what the file-issues command prints.
type IssueResult struct {
	Created   []Created   `json:"created"`
	Commented []Commented `json:"commented"`
	Rejected  []Rejected  `json:"rejected"`
	Untyped   bool        `json:"untyped"`
}

func commented(p *IssuePlan) []Commented {
	out := []Commented{}
	for _, c := range p.Comment {
		out = append(out, Commented{Number: c.Number, Title: c.Title})
	}
	return out
}

var trailingNumber = regexp.MustCompile(`(\d+)` + ws + `*$`)

// Apply writes the plan: opens the issues (no status label, so they are backlog), classifies each as
// `type:seo/<direction>`, and comments on the open ones. A project whose categories have no `seo` leaves the issue
// untyped and says so.
func Apply(gh issues.GH, types *issues.Types, p *IssuePlan) (*IssueResult, error) {
	res := &IssueResult{Created: []Created{}, Rejected: p.Rejected, Commented: commented(p)}
	for _, c := range p.Create {
		out, err := gh([]string{"issue", "create", "--title", c.Title, "--body", c.Body})
		if err != nil {
			return nil, err
		}
		var number *int
		if m := trailingNumber.FindStringSubmatch(jsstr.Trim(out)); m != nil {
			n, _ := strconv.Atoi(m[1])
			number = &n
		}
		res.Created = append(res.Created, Created{Number: number, Title: c.Title})
		if number == nil {
			res.Untyped = true
			continue
		}
		if _, err := issues.SetTypes(gh, types, *number, []string{"seo/" + c.Direction}); err != nil {
			res.Untyped = true
		}
	}
	for _, c := range p.Comment {
		if _, err := gh([]string{"issue", "comment", strconv.Itoa(c.Number), "--body", c.Body}); err != nil {
			return nil, err
		}
	}
	return res, nil
}

// DryRun is what Apply would print, with nothing written.
func DryRun(types *issues.Types, p *IssuePlan) *IssueResult {
	res := &IssueResult{Created: []Created{}, Rejected: p.Rejected, Commented: commented(p)}
	for _, c := range p.Create {
		res.Created = append(res.Created, Created{Title: c.Title})
	}
	if _, err := issues.TypeSet(types, []string{"seo"}); err != nil {
		res.Untyped = true
	}
	return res
}

// OpenIssues reads the project's open issues.
func OpenIssues(gh issues.GH) ([]OpenIssue, error) {
	out, err := gh([]string{"issue", "list", "--state", "open", "--limit", "1000", "--json", "number,title,body"})
	if err != nil {
		return nil, err
	}
	v, err := ParseJSON([]byte(out))
	if err != nil {
		return nil, fmt.Errorf("gh 的回答读不懂：%v", err)
	}
	rows, err := arrayOf(v, "issue list")
	if err != nil {
		return nil, err
	}
	res := []OpenIssue{}
	for _, r := range rows {
		n, _ := get(r, "number").(float64)
		res = append(res, OpenIssue{Number: int(n), Title: orEmpty(get(r, "title")), Body: orEmpty(get(r, "body"))})
	}
	return res, nil
}

// today is the scan date used when the command line gives none.
func today(now func() time.Time) string {
	if now == nil {
		return time.Now().UTC().Format("2006-01-02")
	}
	return now().UTC().Format("2006-01-02")
}
