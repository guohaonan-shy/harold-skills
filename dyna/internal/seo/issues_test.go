package seo

import (
	"encoding/json"
	"fmt"
	"reflect"
	"regexp"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/issues"
)

func finding(t *testing.T, over map[string]any) *Obj {
	t.Helper()
	o := NewObj()
	ev := NewObj()
	ev.Set("what", "get_audit_pages limit 1000")
	ev.Set("when", "2026-10-20")
	ev.Set("values", "metaDescription 为空")
	for k, v := range map[string]any{} {
		o.Set(k, v)
	}
	o.Set("direction", "technical")
	o.Set("kind", "missing-meta-description")
	o.Set("title", "页面没有 meta description")
	o.Set("targets", []any{"https://cookbook.example/a"})
	o.Set("evidence", ev)
	o.Set("repro", "get_audit_pages，看 metaDescription 为空的行；或 curl -s 该网址 | grep description")
	o.Set("fix", "每页写一句描述")
	o.Set("acceptance", []any{"页面 head 里有 meta description"})
	for k, v := range over {
		if v == nil {
			delete(o.Vals, k)
			var keys []string
			for _, kk := range o.Keys {
				if kk != k {
					keys = append(keys, kk)
				}
			}
			o.Keys = keys
			continue
		}
		o.Set(k, v)
	}
	return o
}

func TestRejectsFindingsWithoutEvidenceReproAcceptanceOrARatioBehindAPercentage(t *testing.T) {
	check := func(over map[string]any, want string) {
		t.Helper()
		got := Rejection(finding(t, over))
		if want == "" && got != "" || want != "" && !strings.Contains(got, want) {
			t.Errorf("%v: %q, want %q", over, got, want)
		}
	}
	check(nil, "")
	check(map[string]any{"evidence": nil}, "证据")
	check(map[string]any{"repro": ""}, "复现")
	check(map[string]any{"acceptance": []any{}}, "验收")
	check(map[string]any{"title": "CTR 只有 1.1% "}, "分子分母")
	ratio := NewObj()
	ratio.Set("numerator", float64(11))
	ratio.Set("denominator", float64(1042))
	check(map[string]any{"title": "CTR 只有 1.1%", "ratio": ratio}, "")
	check(map[string]any{"direction": "social"}, "方向")
	check(map[string]any{"direction": "results"}, "方向") // there is no type:seo/results
	check(map[string]any{"kind": "Missing Desc"}, "kind")
	check(map[string]any{"kind": "content-工作日晚餐"}, "")
	check(map[string]any{"title": "整站点击比上一个 7 天少了 35%"}, "分子分母")
	other := NewObj()
	other.Set("numerator", float64(130))
	other.Set("denominator", float64(200))
	check(map[string]any{"title": "整站点击比上一个 7 天少了 35%", "ratio": other}, "")
}

func marker(f any) string {
	return fmt.Sprintf("<!-- seo-finding: %s/%s -->", toString(get(f, "direction")), toString(get(f, "kind")))
}

func plan(t *testing.T, findings []any, open []OpenIssue, date string) *IssuePlan {
	t.Helper()
	p, err := Plan(findings, open, date)
	if err != nil {
		t.Fatal(err)
	}
	return p
}

func TestAChineseKindStillDedupesAgainstItsOpenIssue(t *testing.T) {
	f := finding(t, map[string]any{"direction": "keywords", "kind": "content-工作日晚餐"})
	p := plan(t, []any{f}, []OpenIssue{{3, "x", marker(f)}}, "2026-11-06")
	if len(p.Comment) != 1 {
		t.Fatal(p)
	}
}

func TestThirtyFindingsOfOneKindBecomeOneIssueListingEveryTarget(t *testing.T) {
	var many []any
	for i := 0; i < 30; i++ {
		many = append(many, finding(t, map[string]any{"targets": []any{fmt.Sprintf("https://cookbook.example/p%d", i)}}))
	}
	p := plan(t, many, nil, "2026-11-06")
	if len(p.Create) != 1 || len(p.Comment) != 0 {
		t.Fatal(p)
	}
	for i := 0; i < 30; i++ {
		if !strings.Contains(p.Create[0].Body, fmt.Sprintf("https://cookbook.example/p%d", i)) {
			t.Fatalf("target %d is missing", i)
		}
	}
	if !strings.Contains(p.Create[0].Body, marker(many[0])) || !strings.HasPrefix(p.Create[0].Title, "SEO（技术 SEO 与索引）：") {
		t.Fatal(p.Create[0])
	}
}

func TestAnOpenIssueWithTheSameMarkerGetsACommentWithOnlyTheNewTargets(t *testing.T) {
	old := finding(t, map[string]any{"direction": "pages", "kind": "low-ctr"})
	open := []OpenIssue{{7, "old", "- https://cookbook.example/a\n\n" + marker(old)}}
	f := finding(t, map[string]any{"direction": "pages", "kind": "low-ctr", "targets": []any{"https://cookbook.example/a", "https://cookbook.example/b", "https://cookbook.example/c"}})
	p := plan(t, []any{f}, open, "2026-11-06")
	if len(p.Create) != 0 || len(p.Comment) != 1 || p.Comment[0].Number != 7 {
		t.Fatal(p)
	}
	body := p.Comment[0].Body
	if !strings.Contains(body, "https://cookbook.example/b") || !strings.Contains(body, "https://cookbook.example/c") || strings.Contains(body, "- https://cookbook.example/a") {
		t.Fatal(body)
	}
}

func TestUncollectedPlaceholdersAreSkippedContentAndBacklinkIssuesCarryTheStagePointers(t *testing.T) {
	placeholder := NewObj()
	placeholder.Set("direction", "geo")
	placeholder.Set("uncollected", "没有 AI 可见性跟踪")
	content := NewObj()
	content.Set("keyword", "weeknight dinner ideas")
	content.Set("pageType", "教程")
	content.Set("mode", "new")
	p := plan(t, []any{placeholder, finding(t, map[string]any{"direction": "keywords", "kind": "new-topic", "content": content}), finding(t, map[string]any{"direction": "backlinks", "kind": "competitor-only-domains"})}, nil, "2026-11-06")
	if len(p.Create) != 2 {
		t.Fatal(p)
	}
	for _, want := range []string{"idea-loop:seo-writing` 的 brief 分支", "需要 grill：选题角度和论点"} {
		if !strings.Contains(p.Create[0].Body, want) {
			t.Errorf("%q missing from the content issue", want)
		}
	}
	for _, want := range []string{"idea-loop:seo-outreach", "草稿进人的草稿箱，人说「发」才发"} {
		if !strings.Contains(p.Create[1].Body, want) {
			t.Errorf("%q missing from the backlinks issue", want)
		}
	}
	if strings.Contains(p.Create[1].Body, "任何会话都不发") || len(p.Rejected) != 0 {
		t.Fatal(p)
	}
}

// fakeGH records the calls and answers what the file-issues command asks, the way the old test's fake did.
type fakeGH struct {
	calls  [][]string
	next   int
	labels map[string][]string
	open   string
}

func newFakeGH() *fakeGH { return &fakeGH{next: 40, labels: map[string][]string{}} }

func (f *fakeGH) run(args []string) (string, error) {
	f.calls = append(f.calls, args)
	switch {
	case args[0] == "issue" && args[1] == "create":
		f.next++
		return fmt.Sprintf("https://github.com/acme/cookbook/issues/%d\n", f.next-1), nil
	case args[0] == "issue" && args[1] == "list":
		if f.open != "" {
			return f.open, nil
		}
		return "[]", nil
	case args[0] == "issue" && args[1] == "view":
		var ls []map[string]string
		for _, l := range f.labels[args[2]] {
			ls = append(ls, map[string]string{"name": l})
		}
		b, _ := json.Marshal(map[string]any{"number": args[2], "state": "OPEN", "title": "t", "labels": ls})
		return string(b), nil
	case args[0] == "issue" && args[1] == "edit":
		for i, a := range args {
			if a == "--add-label" {
				f.labels[args[2]] = append(f.labels[args[2]], args[i+1])
			}
		}
	}
	return "", nil
}

func typesFrom(t *testing.T, md string) *issues.Types {
	t.Helper()
	ty, err := issues.ParseTypes(md)
	if err != nil {
		t.Fatal(err)
	}
	return ty
}

const seoTypes = "## 分类 label\n\n- `bug`：缺陷\n- `seo`：搜索流量\n  - `technical`：技术\n  - `keywords`：关键词\n  - `pages`：页面\n"

func sorted(xs []string) []string { ys := append([]string{}, xs...); sort.Strings(ys); return ys }

func TestApplyNewIssuesGetNoStatusLabelAndAreClassifiedSeoDirection(t *testing.T) {
	gh := newFakeGH()
	p := plan(t, []any{finding(t, nil), finding(t, map[string]any{"direction": "keywords", "kind": "new-topic"})}, nil, "2026-11-06")
	r, err := Apply(gh.run, typesFrom(t, seoTypes), p)
	if err != nil {
		t.Fatal(err)
	}
	if len(r.Created) != 2 || *r.Created[0].Number != 40 || *r.Created[1].Number != 41 || r.Untyped {
		t.Fatalf("%+v", r)
	}
	if !reflect.DeepEqual(sorted(gh.labels["40"]), []string{"type:seo", "type:seo/technical"}) || !reflect.DeepEqual(sorted(gh.labels["41"]), []string{"type:seo", "type:seo/keywords"}) {
		t.Fatal(gh.labels)
	}
	for _, c := range gh.calls {
		for _, a := range c {
			if strings.HasPrefix(a, "status:") {
				t.Fatal("no status label at creation", c)
			}
		}
	}
}

func TestApplyAProjectWithoutTheSeoCategoryStillGetsTheIssueFlaggedUntyped(t *testing.T) {
	gh := newFakeGH()
	r, err := Apply(gh.run, typesFrom(t, "## 分类 label\n\n- `bug`：缺陷\n"), plan(t, []any{finding(t, nil)}, nil, "2026-11-06"))
	if err != nil || len(r.Created) != 1 || !r.Untyped || gh.labels["40"] != nil {
		t.Fatalf("%+v %v %v", r, err, gh.labels)
	}
}

func TestApplyCommentsGoToTheOpenIssueNothingIsCreated(t *testing.T) {
	gh := newFakeGH()
	f := finding(t, nil)
	r, err := Apply(gh.run, typesFrom(t, seoTypes), plan(t, []any{f}, []OpenIssue{{9, "old", marker(f)}}, "2026-11-06"))
	if err != nil || len(r.Created) != 0 || !reflect.DeepEqual(r.Commented, []Commented{{9, "old"}}) {
		t.Fatalf("%+v %v", r, err)
	}
	found := false
	for _, c := range gh.calls {
		if c[1] == "comment" && c[2] == "9" {
			found = true
		}
	}
	if !found {
		t.Fatal(gh.calls)
	}
}

func sectionsOf(body string) map[string]string {
	out := map[string]string{}
	for _, s := range regexp.MustCompile(`(?m)^## `).Split(body, -1)[1:] {
		head, rest, _ := strings.Cut(s, "\n")
		out[head] = rest
	}
	return out
}

func TestAnIssueBodyHasTheFiveRequiredSectionsNoneEmptyBackgroundFirstAndTheTargetsUnderScope(t *testing.T) {
	ratio := NewObj()
	ratio.Set("numerator", float64(2))
	ratio.Set("denominator", float64(40))
	f := finding(t, map[string]any{"targets": []any{"https://cookbook.example/a", "https://cookbook.example/b"}, "ratio": ratio})
	c := plan(t, []any{f}, nil, "2026-11-06").Create[0]
	if errs := issues.BodyErrors(c.Body); len(errs) != 0 || !strings.HasPrefix(c.Body, "## 背景\n") {
		t.Fatal(errs, c.Body)
	}
	s := sectionsOf(c.Body)
	for _, want := range []struct{ section, pattern string }{
		{"背景", "2026-11-06"}, {"背景", "技术 SEO 与索引"}, {"背景", "seo-scan"}, {"背景", "怎么复现"}, {"背景", "建议的修法"}, {"背景", "triage"},
		{"影响范围", `受影响 2 处，占 2 / 40`}, {"影响范围", `- https://cookbook\.example/a`}, {"从哪发现", "seo-scan 2026-11-06 的 technical 方向"}, {"证据", "metaDescription 为空"},
	} {
		if !regexp.MustCompile(want.pattern).MatchString(s[want.section]) {
			t.Errorf("%s lacks %q:\n%s", want.section, want.pattern, s[want.section])
		}
	}
	if strings.Contains(s["问题"], "cookbook.example") || !strings.Contains(c.Body, "## 怎么复现") || !strings.Contains(c.Body, "## 验收标准") {
		t.Fatal(c.Body)
	}
}

func TestAFindingWithNoListedTargetsStillGetsAFilledScope(t *testing.T) {
	c := plan(t, []any{finding(t, map[string]any{"targets": []any{}})}, nil, "2026-11-06").Create[0]
	if errs := issues.BodyErrors(c.Body); len(errs) != 0 {
		t.Fatal(errs)
	}
	if !strings.Contains(c.Body, "没有列出具体的处，范围见证据。") {
		t.Fatal(c.Body)
	}
}

func TestTheScanDateDefaultsToToday(t *testing.T) {
	if got := today(func() time.Time { return time.Date(2026, 11, 19, 23, 59, 0, 0, time.UTC) }); got != "2026-11-19" {
		t.Fatal(got)
	}
	if len(today(nil)) != 10 {
		t.Fatal(today(nil))
	}
}

func TestApplyOpensTheIssueWithABodyThatPassesTheBodyCheckAndNoStatusLabel(t *testing.T) {
	gh := newFakeGH()
	if _, err := Apply(gh.run, typesFrom(t, seoTypes), plan(t, []any{finding(t, nil)}, nil, "2026-11-06")); err != nil {
		t.Fatal(err)
	}
	for _, c := range gh.calls {
		if c[0] == "issue" && c[1] == "create" {
			var body string
			for i, a := range c {
				if a == "--body" {
					body = c[i+1]
				}
				if a == "--label" {
					t.Fatal("no status label at creation")
				}
			}
			if errs := issues.BodyErrors(body); len(errs) != 0 {
				t.Fatal(errs)
			}
			return
		}
	}
	t.Fatal("no issue was created")
}

// The results direction (效果报告): its findings are ordinary findings filed under the direction of the change they are
// about, so they pass the same validation and become issues with an ordinary `type:seo/<direction>` label.
func TestAFindingTheEffectReportRaisesBecomesAnIssueUnderTheChangesOwnDirection(t *testing.T) {
	ratio := NewObj()
	ratio.Set("numerator", float64(38))
	ratio.Set("denominator", float64(40))
	ev := NewObj()
	ev.Set("what", "get_search_console_performance dimensions=[date] filters=[page equals …] 改动前后各 14 天")
	ev.Set("when", "2026-11-16")
	ev.Set("values", "前 14 天 40 次点击，后 14 天 38 次点击；平均排名 7.4 → 7.5")
	noLift := finding(t, map[string]any{"direction": "pages", "kind": "change-no-lift", "title": "「weeknight dinner ideas」改标题满 14 天，点击没有增加", "evidence": ev, "ratio": ratio, "acceptance": []any{"再过 14 天，同一页面的点击高于改动前 14 天"}})
	if Rejection(noLift) != "" {
		t.Fatal(Rejection(noLift))
	}
	drop := finding(t, map[string]any{"kind": "site-clicks-drop", "targets": []any{}})
	gh := newFakeGH()
	r, err := Apply(gh.run, typesFrom(t, seoTypes), plan(t, []any{noLift, drop}, nil, "2026-11-16"))
	if err != nil || len(r.Created) != 2 || r.Untyped {
		t.Fatalf("%+v %v", r, err)
	}
	for _, ls := range gh.labels {
		for _, l := range ls {
			if strings.Contains(l, "results") {
				t.Fatal("there is no type:seo/results")
			}
		}
	}
	if got := Rejection(finding(t, map[string]any{"direction": "results"})); !strings.Contains(got, "方向") {
		t.Fatal(got)
	}
}
