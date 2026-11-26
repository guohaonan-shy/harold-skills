package issues

import (
	"reflect"
	"regexp"
	"strings"
	"testing"
)

type specOpts struct {
	Issues string
	UI     string
	Freeze bool
	Grill  bool
	Fork   bool
	Status string
}

// specMd writes a spec text like the one the old script's tests used.
func specMd(o specOpts) string {
	var sb strings.Builder
	sb.WriteString("---\ntype: spec\n")
	if o.Status != "" {
		sb.WriteString("status: " + o.Status + "\n")
	}
	sb.WriteString("summary: 重试不消耗配额\nrelated: []\n")
	if o.Issues != "" {
		sb.WriteString("issues: " + o.Issues + "\n")
	}
	sb.WriteString("---\n\n# 重试不消耗配额\n")
	if o.Grill {
		sb.WriteString("\n> 需要 grill：要不要单独计配额。\n")
	}
	sb.WriteString("\n## 方案\n\n重试不再扣配额。\n")
	if o.UI != "" {
		sb.WriteString("\n### 前端交互\n" + o.UI + "\n")
	}
	sb.WriteString("\n## 实现决策\n")
	if o.Freeze {
		sb.WriteString("\n### 冻结摘要\n- 画布\n")
	} else {
		sb.WriteString("\n无分歧。\n")
	}
	if o.Fork {
		sb.WriteString("\n### 待定：要不要单独计配额\n- A\n")
	}
	sb.WriteString("\n")
	return sb.String()
}

const uiLine = "- 点重试 → 只重跑这一题"

func mdp(o specOpts) *string { s := specMd(o); return &s }

func mustMatch(t *testing.T, re, s string) {
	t.Helper()
	if !regexp.MustCompile(re).MatchString(s) {
		t.Fatalf("want match /%s/, got %q", re, s)
	}
}

func TestSevenStatesAndStateOf(t *testing.T) {
	if !reflect.DeepEqual(States, []string{"backlog", "triage", "todo", "in-progress", "in-review", "done", "canceled"}) {
		t.Fatal(States)
	}
	cases := []struct {
		labels []string
		open   bool
		reason string
		want   string
	}{
		{[]string{"bug"}, true, "", "backlog"},
		{[]string{"bug", "status:in-review"}, true, "", "in-review"},
		{[]string{"status:triage", "status:todo"}, true, "", "triage + todo"},
		{[]string{"status:实现中"}, true, "", "实现中"},
		{nil, false, "completed", "done"},
		{[]string{"status:todo"}, false, "not_planned", "canceled"},
	}
	for _, c := range cases {
		if got := StateOf(c.labels, c.open, c.reason); got != c.want {
			t.Errorf("StateOf(%v,%v,%q)=%q want %q", c.labels, c.open, c.reason, got, c.want)
		}
	}
	if len(Next["done"]) != 0 || len(Next["canceled"]) != 0 {
		t.Fatal("done and canceled are final")
	}
}

func TestFlipTableIsTheSpecs(t *testing.T) {
	want := map[string][]string{
		"backlog":     {"triage", "todo", "canceled"},
		"triage":      {"todo", "backlog", "canceled"},
		"todo":        {"in-progress", "backlog", "canceled"},
		"in-progress": {"in-review", "triage", "backlog", "canceled"},
		"in-review":   {"in-progress", "done", "backlog", "canceled"},
		"done":        {},
		"canceled":    {},
	}
	if !reflect.DeepEqual(Next, want) {
		t.Fatalf("%v", Next)
	}
}

func TestFlipsInTheTablePassOthersAreRefusedWithTheChoices(t *testing.T) {
	merged := []PR{{Repo: "o/r", Number: 1, State: "merged"}}
	ok := [][2]string{{"backlog", "triage"}, {"backlog", "todo"}, {"todo", "in-progress"}, {"in-progress", "in-review"}, {"in-review", "in-progress"}, {"in-review", "done"}, {"in-progress", "canceled"}, {"triage", "canceled"}}
	for _, p := range ok {
		if why := TransitionError(p[0], p[1], Transition{PRs: merged, Comment: "x", Spec: mdp(specOpts{})}); why != "" {
			t.Errorf("%s → %s: %s", p[0], p[1], why)
		}
	}
	mustMatch(t, `能翻成：triage / todo / canceled`, TransitionError("backlog", "in-progress", Transition{}))
	mustMatch(t, `能翻成：in-review / triage / backlog / canceled`, TransitionError("in-progress", "done", Transition{PRs: merged}))
	mustMatch(t, `能翻成：in-progress / backlog / canceled`, TransitionError("todo", "triage", Transition{}))
	mustMatch(t, `能翻成：无`, TransitionError("done", "todo", Transition{}))
	mustMatch(t, `能翻成：无`, TransitionError("canceled", "backlog", Transition{Comment: "x"}))
	mustMatch(t, `不是 issue 的状态`, TransitionError("todo", "待验证", Transition{}))
	mustMatch(t, `先跑 dyna issues migrate`, TransitionError("实现中", "in-review", Transition{}))
	mustMatch(t, `已经是`, TransitionError("todo", "todo", Transition{}))
}

func TestBacklogNeedsAComment(t *testing.T) {
	mustMatch(t, `--comment.*停在哪个阶段、分支`, TransitionError("in-progress", "backlog", Transition{}))
	mustMatch(t, `--comment`, TransitionError("triage", "backlog", Transition{Comment: "   "}))
	if why := TransitionError("in-progress", "backlog", Transition{Comment: "停在 in-progress，分支 issue/12-retry"}); why != "" {
		t.Fatal(why)
	}
}

func TestTriageToTodoNeedsASpecNothingForAHumanAndDesignFrozen(t *testing.T) {
	mustMatch(t, `没有 spec`, TransitionError("triage", "todo", Transition{}))
	mustMatch(t, `需要 grill`, TransitionError("triage", "todo", Transition{Spec: mdp(specOpts{Grill: true})}))
	mustMatch(t, `待定`, TransitionError("triage", "todo", Transition{Spec: mdp(specOpts{Fork: true})}))
	mustMatch(t, `冻结摘要.*--skip-design`, TransitionError("triage", "todo", Transition{Spec: mdp(specOpts{UI: uiLine})}))
	for _, tr := range []Transition{
		{Spec: mdp(specOpts{UI: uiLine}), SkipDesign: true},
		{Spec: mdp(specOpts{UI: uiLine, Freeze: true})},
		{Spec: mdp(specOpts{})},
	} {
		if why := TransitionError("triage", "todo", tr); why != "" {
			t.Error(why)
		}
	}
	// backlog goes straight to todo for what needs no human assessment: no spec yet
	if why := TransitionError("backlog", "todo", Transition{}); why != "" {
		t.Error(why)
	}
}

func TestDoneNeedsEveryPRMerged(t *testing.T) {
	merged := PR{Repo: "o/r", Number: 1, State: "merged"}
	if why := TransitionError("in-review", "done", Transition{PRs: []PR{merged, {Repo: "o/api", Number: 4, State: "closed"}}}); why != "" {
		t.Error(why)
	}
	mustMatch(t, `o/api#7（ready）`, TransitionError("in-review", "done", Transition{PRs: []PR{merged, {Repo: "o/api", Number: 7, State: "ready"}}}))
	mustMatch(t, `没有 PR 挂在`, TransitionError("in-review", "done", Transition{PRs: nil}))
	mustMatch(t, `没有 PR 挂在`, TransitionError("in-review", "done", Transition{PRs: []PR{{Repo: "o/r", Number: 2, State: "closed"}}}))
}

func TestAProjectThatSkipsTriage(t *testing.T) {
	mustMatch(t, `跳过 triage.*能翻成：todo / canceled`, TransitionError("backlog", "triage", Transition{SkipTriage: true}))
	mustMatch(t, `能翻成：todo / canceled`, TransitionError("backlog", "in-review", Transition{SkipTriage: true}))
	if why := TransitionError("backlog", "todo", Transition{SkipTriage: true}); why != "" {
		t.Error(why)
	}
}

func TestSkipsTriageReadsTheProjectDocument(t *testing.T) {
	for in, want := range map[string]bool{
		"# x\n\ntriage：跳过\n":          true,
		"- triage: 跳过（团队没开 Triage）\n": true,
		"| triage | 跳过 |\n":           true,
		"**triage**：跳过":               true,
		"triage：用\n":                  false,
		"triage：用 / 跳过\n":             false,
		"":                            false,
	} {
		if got := SkipsTriage(in); got != want {
			t.Errorf("SkipsTriage(%q)=%v", in, got)
		}
	}
}

func TestRefsIssueAndPRState(t *testing.T) {
	cases := []struct {
		body        string
		n           int
		issue, prRe string
		want        bool
	}{
		{"Refs o/r#242", 242, "o/r", "o/api", true},
		{"说明\n\nrefs O/R#242。", 242, "o/r", "o/api", true},
		{"Refs #242", 242, "o/r", "o/r", true},
		{"Refs #242", 242, "o/r", "o/api", false},
		{"Refs o/r#2420", 242, "o/r", "o/api", false},
		{"Refs o/other#242", 242, "o/r", "o/api", false},
		{"Closes o/r#242", 242, "o/r", "o/r", false},
		{"", 242, "o/r", "o/r", false},
	}
	for _, c := range cases {
		if got := RefsIssue(c.body, c.n, c.issue, c.prRe); got != c.want {
			t.Errorf("RefsIssue(%q)=%v", c.body, got)
		}
	}
	for _, c := range []struct {
		state string
		draft bool
		want  string
	}{{"OPEN", true, "draft"}, {"OPEN", false, "ready"}, {"MERGED", false, "merged"}, {"CLOSED", false, "closed"}} {
		if got := PRState(c.state, c.draft); got != c.want {
			t.Errorf("PRState(%s,%v)=%s", c.state, c.draft, got)
		}
	}
}

func TestRefsLinear(t *testing.T) {
	cases := []struct {
		title, body string
		want        bool
	}{
		{"[FA-577] x", "", true},
		{" [fa-577] x", "", true},
		{"x", "a\nLinear: FA-577\nb", true},
		{"x", "Linear: FA-577", true},
		{"[FA-5770] x", "Linear: FA-5771", false},
		{"see [FA-577]", "also Linear: FA-577 here", false},
		{"", "", false},
	}
	for _, c := range cases {
		if got := RefsLinear(c.title, c.body, "FA-577"); got != c.want {
			t.Errorf("RefsLinear(%q,%q)=%v", c.title, c.body, got)
		}
	}
}

func row(n int, labels ...string) Row { return Row{Number: n, Labels: labels} }

func TestReconcilePlan(t *testing.T) {
	p := func(state string) PR { return PR{Repo: "o/r", Number: 9, State: state} }
	issues := []Row{row(1, "status:in-review"), row(2, "status:in-progress"), row(3, "status:in-progress"), row(4, "status:in-progress"), row(5, "status:todo"), row(6, "status:in-progress")}
	prs := map[int][]PR{1: {p("merged")}, 2: {p("ready"), p("merged")}, 3: {p("ready"), p("draft")}, 4: {p("merged"), p("closed")}, 5: {p("merged")}, 6: {}}
	actions, _ := ReconcilePlan(issues, prs)
	var got [][3]any
	for _, a := range actions {
		got = append(got, [3]any{a.N, a.From, a.To})
	}
	want := [][3]any{{1, "in-review", "done"}, {2, "in-progress", "in-review"}, {4, "in-progress", "done"}}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("%v", got)
	}
}

func TestReconcilePlanReportsOldLabelsAndTwoStatusLabels(t *testing.T) {
	actions, problems := ReconcilePlan([]Row{row(30, "status:实现中"), row(31, "status:todo", "status:in-review"), row(32)}, nil)
	if len(actions) != 0 || len(problems) != 2 {
		t.Fatal(actions, problems)
	}
	mustMatch(t, `#30 的 label「实现中」不是 issue 的状态.*migrate`, problems[0])
	mustMatch(t, `#31 有两个 status:\* label`, problems[1])
}

func TestMigratePlan(t *testing.T) {
	issues := []Row{
		row(1, "status:验证中"), row(2, "status:审核中"), row(3, "status:待设计"), row(4, "status:设计中"), row(5, "status:待实现"),
		row(6, "status:实现中"), row(7, "status:实现中"), row(8, "status:搁置"), row(9, "status:todo"), row(10),
		row(11, "status:实现中", "status:搁置"), row(12, "status:wat"),
	}
	prs := map[int][]PR{6: {{State: "ready"}}, 7: {{State: "draft"}}}
	relabels, _, problems := MigratePlan(issues, prs, nil)
	var got [][2]any
	for _, r := range relabels {
		got = append(got, [2]any{r.N, r.To})
	}
	want := [][2]any{{1, "triage"}, {2, "triage"}, {3, "triage"}, {4, "triage"}, {5, "todo"}, {6, "in-review"}, {7, "in-progress"}, {8, "backlog"}}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("%v", got)
	}
	for _, r := range relabels {
		if r.N == 8 {
			if len(r.Add) != 0 {
				t.Error("backlog adds nothing")
			}
			mustMatch(t, `从搁置迁回`, r.Comment)
		}
		if r.N == 5 && !reflect.DeepEqual(r, Relabel{N: 5, From: "待实现", To: "todo", Remove: []string{"status:待实现"}, Add: []string{"status:todo"}}) {
			t.Errorf("%+v", r)
		}
	}
	if len(problems) != 2 {
		t.Fatal(problems)
	}
}

func TestWithoutStatusDropsOnlyTheFrontmatterLine(t *testing.T) {
	md := specMd(specOpts{Status: "完成"}) + "\nstatus: 正文里的\n"
	out := WithoutStatus(md)
	if strings.Contains(strings.SplitN(out, "\n---", 2)[0], "status:") {
		t.Fatal("status line left in frontmatter")
	}
	if !strings.Contains(out, "status: 正文里的") {
		t.Fatal("body line dropped")
	}
	if s := specMd(specOpts{}); WithoutStatus(s) != s {
		t.Fatal("changed a spec without a status")
	}
}

func TestPriorityOf(t *testing.T) {
	if PriorityOf([]string{"priority:P2", "priority:P0"}) != "P0" || PriorityOf([]string{"priority:high", "bug"}) != "" {
		t.Fatal()
	}
}

const typesMd = "# Issue tracker：GitHub\n\n## 分类 label\n\nGitHub 上打成 `type:<父类>`。\n\n- `billing`：计费\n- `seo`：搜索流量\n  - `backlink`：外链\n  - `blog`\n- `uiux`：界面与交互\n\n保留的 label：`Idea`、`test infra`\n\n## 别的\n- `not-a-type`\n"

func TestParseTypesReadsParentsChildrenAndKeepList(t *testing.T) {
	types, err := ParseTypes(typesMd)
	if err != nil {
		t.Fatal(err)
	}
	var names []string
	for _, p := range types.Parents {
		names = append(names, p.Name)
	}
	if !reflect.DeepEqual(names, []string{"billing", "seo", "uiux"}) {
		t.Fatal(names)
	}
	if !reflect.DeepEqual(types.Parents[1].Children, []Category{{"backlink", "外链"}, {"blog", ""}}) {
		t.Fatal(types.Parents[1].Children)
	}
	if !reflect.DeepEqual(types.Keep, []string{"Idea", "test infra"}) {
		t.Fatal(types.Keep)
	}
	if none, _ := ParseTypes("# x\n"); none != nil {
		t.Fatal("no section, no types")
	}
	if _, err := ParseTypes("## 分类 label\n- `UI/UX`\n"); err == nil || !strings.Contains(err.Error(), "「/」") {
		t.Fatal(err)
	}
}

func TestTypeSet(t *testing.T) {
	types, _ := ParseTypes(typesMd)
	got, err := TypeSet(types, []string{"seo/blog", "billing"})
	if err != nil || !reflect.DeepEqual(got, []string{"type:seo", "type:seo/blog", "type:billing"}) {
		t.Fatal(got, err)
	}
	if _, err := TypeSet(types, []string{"ai"}); err == nil || !strings.Contains(err.Error(), "seo/backlink") {
		t.Fatal(err)
	}
	if _, err := TypeSet(types, []string{"seo/ads"}); err == nil || !strings.Contains(err.Error(), "没有子类「ads」") {
		t.Fatal(err)
	}
}

func TestAnOldQueueNoteStaysOutOfTheLabelText(t *testing.T) {
	types, _ := ParseTypes("## 分类 label\n\n- `bug`：缺陷\n- `seo`：搜索可见性（独立队列，上限 5）\n  - `technical`：技术\n")
	if types.Parents[1].About != "搜索可见性" {
		t.Fatal(types.Parents[1].About)
	}
	if !reflect.DeepEqual(Working, []string{"triage", "in-progress", "in-review"}) {
		t.Fatal(Working)
	}
}

const goodBody = "## 背景\n\n「重试」按钮：把失败的任务按原参数再交给队列一次；配额按每次交给队列扣一次\n\n## 问题\n\n重试会重复扣配额\n\n## 证据\n\n无，待验证\n\n## 影响范围\n\n所有点过重试的用户\n\n## 从哪发现\n\n#242 的复现\n"

func TestBodyErrors(t *testing.T) {
	if e := BodyErrors(goodBody); len(e) != 0 {
		t.Fatal(e)
	}
	without := func(name string) string {
		return regexp.MustCompile(`## `+name+`\n\n[^#]*`).ReplaceAllString(goodBody, "")
	}
	if got := BodyErrors(without("从哪发现")); !reflect.DeepEqual(got, []string{"缺「从哪发现」一节（## 从哪发现）"}) {
		t.Fatal(got)
	}
	if got := BodyErrors("## 问题\n\nx\n"); !reflect.DeepEqual(got, []string{"缺「背景」一节（## 背景）", "缺「证据」一节（## 证据）", "缺「影响范围」一节（## 影响范围）", "缺「从哪发现」一节（## 从哪发现）"}) {
		t.Fatal(got)
	}
	if got := BodyErrors(strings.Replace(goodBody, "所有点过重试的用户", " \n\t", 1)); !reflect.DeepEqual(got, []string{"「影响范围」一节是空的"}) {
		t.Fatal(got)
	}
	if got := BodyErrors("## 问题\n\n## 证据\n\nx\n## 影响范围\nx\n## 从哪发现\nx\n## 背景\nx"); !reflect.DeepEqual(got, []string{"「问题」一节是空的"}) {
		t.Fatal(got)
	}
	// an optional section stays optional
	if e := BodyErrors(goodBody + "\n## 已确认原因\n\n"); len(e) != 0 {
		t.Fatal(e)
	}
	// text under a sub-heading is content; a 三级 heading with a required name does not start a section
	if e := BodyErrors("## 背景\n\n### 细节\n\nx\n\n## 问题\n\nx\n\n## 证据\n\n### 影响范围\n\n## 影响范围\n\nx\n## 从哪发现\nx"); len(e) != 0 {
		t.Fatal(e)
	}
	if len(BodyErrors("")) != 5 {
		t.Fatal("empty body misses all five")
	}
	// 背景: missing is refused naming it, blank is refused as empty, 「无」 counts as filled
	bg := regexp.MustCompile(`## 背景\n\n[^#]*`)
	if got := BodyErrors(bg.ReplaceAllString(goodBody, "## 背景\n\n \n\t\n\n")); !reflect.DeepEqual(got, []string{"「背景」一节是空的"}) {
		t.Fatal(got)
	}
	if e := BodyErrors(bg.ReplaceAllString(goodBody, "## 背景\n\n无\n\n")); len(e) != 0 {
		t.Fatal(e)
	}
}

func TestPlatformOf(t *testing.T) {
	for in, want := range map[string]string{
		"# Issue tracker：Linear\n\n## 团队\n":              "linear",
		"\n# Issue tracker：Linear\n":                     "linear",
		"# Issue tracker：GitHub\n\n## 仓库\n用 Linear 的人\n": "github",
		"## Linear 小节\n":                                 "github",
		"":                                               "github",
	} {
		if got := PlatformOf(in); got != want {
			t.Errorf("PlatformOf(%q)=%s", in, got)
		}
	}
}

func TestHandEditsStatus(t *testing.T) {
	cases := map[string]bool{
		"gh issue edit 1 --add-label status:todo":                      true,
		"gh issue edit 1 --remove-label status:triage":                 true,
		"gh issue edit 1 --add-label=status:in-review":                 true,
		`gh issue edit 1 --add-label "kind:bug,status:todo"`:           true,
		"gh issue edit 1 -R o/r --add-label status:todo":               true,
		"gh -R o/r issue edit 1 --add-label status:todo":               true,
		"cd x && gh issue edit 1 --add-label status:todo":              true,
		"gh issue edit 1 --add-label kind:bug":                         false,
		"gh issue edit 1 --add-label priority:P0 --add-label kind:bug": false,
		"gh issue view 1 --json labels":                                false,
		"gh issue comment 1 --body 'status:todo is the state'":         false,
		"echo status:todo; gh issue edit 1 --add-label kind:bug":       false,
		"": false,
	}
	for in, want := range cases {
		if got := HandEditsStatus(in); got != want {
			t.Errorf("HandEditsStatus(%q)=%v", in, got)
		}
	}
}
