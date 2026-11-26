package issues_test

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"regexp"
	"sort"
	"strings"
	"testing"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/home"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/issues"
)

// These tests are the old issues script's tests, moved: every assertion of issues.test.mjs is here, run through
// the whole program (dyna issues ...) with a fake gh. The ones that tested the old script's own JavaScript
// (the header usage text, `node` exit codes) became their Go counterparts at the bottom.

type sp struct {
	Issues string
	UI     string
	Freeze bool
	Grill  bool
	Fork   bool
	Status string
}

func specText(o sp) string {
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

func sorted(l []string) []string {
	out := append([]string{}, l...)
	sort.Strings(out)
	return out
}

func eq(t *testing.T, got, want any, msg ...any) {
	t.Helper()
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("%v\n got: %#v\nwant: %#v", msg, got, want)
	}
}

func refused(t *testing.T, r result, re string) {
	t.Helper()
	if r.code != 1 {
		t.Fatalf("want exit 1, got %d (out %q)", r.code, r.out)
	}
	mustMatch(t, re, r.err)
}

const githubTracker = "# Issue tracker：GitHub\n\n## 仓库\n\n这一节是旧版留下的，脚本不再读：\n\n| 仓库 | 本地路径 | 主分支 | 管什么 |\n|---|---|---|---|\n| o/r | ~/code/r | main | 知识库、worker |\n| o/api | ~/code/api | main | 接口 |\n"

const typesTracker = "# Issue tracker：GitHub\n\n## 分类 label\n\nGitHub 上打成 `type:<父类>`。\n\n- `billing`：计费\n- `seo`：搜索流量\n  - `backlink`：外链\n  - `blog`\n- `uiux`：界面与交互\n\n保留的 label：`Idea`、`test infra`\n\n## 别的\n- `not-a-type`\n"

const linearTracker = "# Issue tracker：Linear\n\n## 团队\n\nFish（key `FA`），issue 号形如 `FA-123`\n\n"

const goodBody = "## 背景\n\n「重试」按钮：把失败的任务按原参数再交给队列一次；配额按每次交给队列扣一次\n\n## 问题\n\n重试会重复扣配额\n\n## 证据\n\n无，待验证\n\n## 影响范围\n\n所有点过重试的用户\n\n## 从哪发现\n\n#242 的复现\n"

func withoutSection(name string) string {
	i := strings.Index(goodBody, "## "+name+"\n")
	j := strings.Index(goodBody[i+1:], "\n## ")
	if j < 0 {
		return goodBody[:i]
	}
	return goodBody[:i] + goodBody[i+1+j+1:]
}

// ---------- set / check ----------

func TestSetRelabelsCommentsWithTheAIMarkerAndClosesDoneAndCanceledDroppingTheLabel(t *testing.T) {
	p := docsWith(t, map[string]string{"retry": specText(sp{Issues: "[1]"})}, nil, "")
	f := newFake(open(1, "status:triage", "type:bug"), open(2, "status:in-review"), open(3, "status:in-progress"), open(4, "status:todo"))
	f.prs["o/r"] = []*fPR{pr(5, "Refs o/r#2", "MERGED", false)}
	eq(t, run(p, f, "set", p.docs, "todo", "1").lines(), []string{"#1: triage → todo"})
	eq(t, sorted(f.issues[1].Labels), []string{"status:todo", "type:bug"})
	eq(t, run(p, f, "set", p.docs, "done", "2").lines(), []string{"#2: in-review → done（关闭，completed）"})
	if f.issues[2].Open || f.issues[2].Reason != "completed" || len(f.issues[2].Labels) != 0 {
		t.Fatalf("%+v", f.issues[2])
	}
	eq(t, commentsOn(f.calls, 2), []string{issues.AIMarker + "\n合并的 PR：o/r#5。"})
	run(p, f, "set", p.docs, "backlog", "3", "--comment=先放着：等 0.2.x")
	eq(t, len(f.issues[3].Labels), 0)
	eq(t, commentsOn(f.calls, 3), []string{issues.AIMarker + "\n先放着：等 0.2.x"})
	run(p, f, "set", p.docs, "canceled", "4", "--comment=不做了")
	if f.issues[4].Reason != "not_planned" || len(f.issues[4].Labels) != 0 {
		t.Fatalf("%+v", f.issues[4])
	}
	eq(t, commentsOn(f.calls, 4), []string{issues.AIMarker + "\n不做了"})
}

func TestSetChecksEveryFlipBeforeMakingAny(t *testing.T) {
	p := docsWith(t, nil, nil, "")
	f := newFake(open(1, "status:todo"), open(2))
	r := run(p, f, "set", p.docs, "in-progress", "1", "2")
	refused(t, r, `#2：「backlog」不能翻成「in-progress」`)
	eq(t, len(writes(f.calls)), 0)
}

func TestSetRefusesAClosedIssueWhicheverWayItWasClosed(t *testing.T) {
	a, b := closed(1), closed(2)
	b.Reason = "not_planned"
	f := newFake(a, b)
	p := docsWith(t, nil, nil, "")
	refused(t, run(p, f, "set", p.docs, "todo", "1"), `已关闭（done）`)
	refused(t, run(p, f, "set", p.docs, "backlog", "2", "--comment=x"), `已关闭（canceled）`)
}

func TestSetTodoFromTriageRefusesWhileTheSpecStillNeedsGrillAndCheckSaysTheSameWritingNothing(t *testing.T) {
	p := docsWith(t, map[string]string{"retry": specText(sp{Issues: "[1]", Grill: true})}, nil, "")
	f := newFake(open(1, "status:triage"))
	refused(t, run(p, f, "set", p.docs, "todo", "1"), `#1：spec 里还有等人定的：开头标着「需要 grill」`)
	r := run(p, f, "check", p.docs, "todo", "1")
	refused(t, r, `开头标着「需要 grill」`)
	eq(t, len(writes(f.calls)), 0)
	// once the spec is settled, check says yes and still writes nothing
	must(t, os.WriteFile(filepath.Join(p.docs, "spec", "retry", "retry.md"), []byte(specText(sp{Issues: "[1]"})), 0o644))
	r = run(p, f, "check", p.docs, "todo", "1")
	eq(t, r.code, 0)
	eq(t, len(writes(f.calls)), 0)
	eq(t, f.issues[1].Labels[0], "status:triage")
}

func TestAProjectThatSkipsTriageSetTriageIsRefusedBacklogGoesStraightToTodo(t *testing.T) {
	p := docsWith(t, nil, str("# Issue tracker\n\ntriage：跳过\n"), "")
	f := newFake(open(1))
	refused(t, run(p, f, "set", p.docs, "triage", "1"), `跳过 triage`)
	eq(t, len(writes(f.calls)), 0)
	eq(t, run(p, f, "set", p.docs, "todo", "1").lines(), []string{"#1: backlog → todo"})
	eq(t, f.issues[1].Labels, []string{"status:todo"})
}

func TestAnIssueWithTwoPRsSetDoneListsTheOneNotMergedAfterBothMergeReconcileClosesIt(t *testing.T) {
	p := docsWith(t, nil, nil, "")
	f := newFake(open(242, "status:in-review"))
	f.prs["o/r"] = []*fPR{pr(10, "改知识库\n\nRefs o/r#242", "MERGED", false), pr(11, "别的 Refs o/r#9", "MERGED", false), pr(20, "Refs o/r#242", "OPEN", false)}
	refused(t, run(p, f, "set", p.docs, "done", "242"), `#242：还有 PR 没合并：o/r#20（ready）`)
	eq(t, len(writes(f.calls)), 0)
	r := run(p, f, "reconcile", p.docs)
	eq(t, r.out, "")
	f.prs["o/r"][2].State = "MERGED"
	r = run(p, f, "reconcile", p.docs)
	eq(t, r.lines(), []string{"#242: in-review → done（PR o/r#10、o/r#20 都已合并）"})
	if f.issues[242].Open || f.issues[242].Reason != "completed" || len(f.issues[242].Labels) != 0 {
		t.Fatalf("%+v", f.issues[242])
	}
	mustMatch(t, markerThen(`PR o/r#10、o/r#20 都已合并`), commentsOn(f.calls, 242)[0])
}

func TestOnlyTheProjectsOwnRepoIsSearchedForPRs(t *testing.T) {
	p := docsWith(t, nil, str(githubTracker), "")
	f := newFake(open(5, "status:in-review"))
	f.prs["o/r"] = []*fPR{pr(1, "Refs #5", "MERGED", false)}
	f.prs["o/api"] = []*fPR{pr(2, "Refs o/r#5", "OPEN", false)}
	eq(t, run(p, f, "set", p.docs, "done", "5").lines(), []string{"#5: in-review → done（关闭，completed）"})
	repos := map[string]bool{}
	for _, c := range f.raw {
		if c[0] == "pr" {
			for k, a := range c {
				if a == "--repo" {
					repos[c[k+1]] = true
				}
			}
		}
	}
	eq(t, repos, map[string]bool{"o/r": true})
}

func TestReconcileFlipsAnInProgressIssueWhosePRsAllTurnedReadyToInReview(t *testing.T) {
	p := docsWith(t, nil, nil, "")
	f := newFake(open(7, "status:in-progress"))
	f.prs["o/r"] = []*fPR{pr(1, "Refs #7", "OPEN", false)}
	eq(t, run(p, f, "reconcile", p.docs).lines(), []string{"#7: in-progress → in-review（PR o/r#1 都已 ready）"})
	eq(t, f.issues[7].Labels, []string{"status:in-review"})
	mustMatch(t, markerThen(`PR o/r#1 都已 ready`), commentsOn(f.calls, 7)[0])
}

func TestReconcilePrintsProblemsAfterTheFlips(t *testing.T) {
	p := docsWith(t, nil, nil, "")
	f := newFake(open(30, "status:实现中"))
	r := run(p, f, "reconcile", p.docs)
	eq(t, len(r.lines()), 1)
	mustMatch(t, `^问题：#30 的 label「实现中」不是 issue 的状态`, r.lines()[0])
}

// ---------- migrate ----------

func TestMigrateListsByDefaultAndApplySwapsLabelsCommentsDropsSpecStatusLines(t *testing.T) {
	p := docsWith(t, map[string]string{"retry": specText(sp{Issues: "[1]", Status: "实现中"})}, nil, "")
	f := newFake(open(1, "status:实现中", "type:bug"), open(2, "status:搁置"), open(3, "status:待实现"), open(10, "status:验证中"))
	f.prs["o/r"] = []*fPR{pr(50, "Refs #1", "OPEN", false)}
	dry := run(p, f, "migrate", p.docs)
	eq(t, len(writes(f.calls)), 0)
	eq(t, dry.lines(), []string{
		"#1: status:实现中 → status:in-review",
		"#2: status:搁置 → 回 backlog（去掉 status:*），补评论",
		"#3: status:待实现 → status:todo",
		"#10: status:验证中 → status:triage",
		"spec retry: 删掉 frontmatter 的 status 行",
	})
	specFile := filepath.Join(p.docs, "spec", "retry", "retry.md")
	b, _ := os.ReadFile(specFile)
	mustMatch(t, `(?m)^status: 实现中$`, string(b))
	r := run(p, f, "migrate", p.docs, "--apply")
	eq(t, r.code, 0, r.err)
	eq(t, sorted(f.issues[1].Labels), []string{"status:in-review", "type:bug"})
	eq(t, len(f.issues[2].Labels), 0)
	eq(t, len(commentsOn(f.calls, 2)), 1)
	mustMatch(t, markerThen(`从搁置迁回`), commentsOn(f.calls, 2)[0])
	eq(t, f.issues[3].Labels, []string{"status:todo"})
	b, _ = os.ReadFile(specFile)
	if strings.Contains(string(b), "\nstatus:") && strings.Index(string(b), "\nstatus:") < strings.Index(string(b), "\n---\n\n#") {
		t.Fatal("status line left in the frontmatter")
	}
	mustMatch(t, `issues: \[1\]`, string(b))
	if !f.issues[1].Open {
		t.Fatal("closed")
	}
}

func TestMigrateApplyCreatesTheNewStatusLabelsFirst(t *testing.T) {
	p := docsWith(t, nil, nil, "")
	f := newFake(open(1, "status:设计中"), open(2, "status:实现中"))
	f.labels = []string{"status:设计中", "status:实现中"}
	f.strict = true
	r := run(p, f, "migrate", p.docs, "--apply")
	eq(t, r.code, 0, r.err)
	eq(t, f.issues[1].Labels, []string{"status:triage"})
	eq(t, f.issues[2].Labels, []string{"status:in-progress"})
}

func TestALabelSwapAddsBeforeItRemoves(t *testing.T) {
	p := docsWith(t, nil, nil, "")
	f := newFake(open(1, "status:设计中"), open(2, "status:todo"))
	f.labels = []string{"status:设计中", "status:todo", "status:triage", "status:in-progress"}
	f.strict = true
	// the connection drops on the call that adds a label, after any removal sent with it went through
	f.fails = func(args []string) bool {
		return args[0] == "issue" && args[1] == "edit" && contains(args, "--add-label")
	}
	refused(t, run(p, f, "migrate", p.docs, "--apply"), `EOF`)
	eq(t, f.issues[1].Labels, []string{"status:设计中"})
	refused(t, run(p, f, "set", p.docs, "in-progress", "2", "--skip-design"), `EOF`)
	eq(t, f.issues[2].Labels, []string{"status:todo"})
}

func TestMigrateOnlyUnlinksAndClosesRootsTheConsolidationTaskOpened(t *testing.T) {
	p := docsWith(t, nil, nil, "")
	root := open(10)
	root.Body = "由整合定时任务开出\n\n改的是设计档案页面"
	human := open(20, "status:验证中")
	human.Body = "把重试拆开做\n\n由整合定时任务开出 只是正文里提到"
	taken := open(30, "status:设计中")
	taken.Body = "由整合定时任务开出"
	c11, c12, c21, c31 := open(11), open(12), open(21), open(31)
	c11.SubOf, c12.SubOf, c21.SubOf, c31.SubOf = 10, 10, 20, 30
	f := newFake(root, c11, c12, human, c21, taken, c31)
	dry := run(p, f, "migrate", p.docs)
	eq(t, len(writes(f.calls)), 0)
	var subset []string
	for _, l := range dry.lines() {
		if strings.Contains(l, "子 issue") || strings.Contains(l, "not planned") || strings.Contains(l, "关") {
			subset = append(subset, l)
		}
	}
	eq(t, subset, []string{
		"#11: 解除 #10 的子 issue 关系",
		"#12: 解除 #10 的子 issue 关系",
		"#31: 解除 #30 的子 issue 关系",
		"#10: 整合开出的根，解除后关成 not planned（补评论）",
		"#30: 整合开出的根，但已有 status:* label（有人在做），解除关系后不关",
	})
	if strings.Contains(dry.out, "#21") {
		t.Fatal("the human-made link is listed")
	}
	r := run(p, f, "migrate", p.docs, "--apply")
	eq(t, r.code, 0, r.err)
	eq(t, [][2]int{{f.issues[11].SubOf, 0}, {f.issues[12].SubOf, 0}, {f.issues[31].SubOf, 0}, {f.issues[21].SubOf, 20}}, [][2]int{{0, 0}, {0, 0}, {0, 0}, {20, 20}})
	if f.issues[10].Open || f.issues[10].Reason != "not_planned" {
		t.Fatalf("%+v", f.issues[10])
	}
	mustMatch(t, markerThen(``), commentsOn(f.calls, 10)[0])
	if strings.Contains(commentsOn(f.calls, 10)[0], "🤖 idea-loop：") {
		t.Fatal("the old prefix is gone")
	}
	if !f.issues[20].Open || !f.issues[30].Open {
		t.Fatal("closed a root somebody works on")
	}
}

// ---------- candidates ----------

func candidateNumbers(t *testing.T, r result) []int {
	t.Helper()
	if r.code != 0 {
		t.Fatalf("exit %d: %s", r.code, r.err)
	}
	var rows []struct {
		Number int `json:"number"`
	}
	must(t, json.Unmarshal([]byte(r.out), &rows))
	out := []int{}
	for _, x := range rows {
		out = append(out, x.Number)
	}
	return out
}

func candidatesOf(t *testing.T, f *fake, args ...string) []map[string]any {
	t.Helper()
	p := docsWith(t, nil, nil, "")
	r := run(p, f, append([]string{"candidates", p.docs}, args...)...)
	if r.code != 0 {
		t.Fatalf("exit %d: %s", r.code, r.err)
	}
	var rows []map[string]any
	must(t, json.Unmarshal([]byte(r.out), &rows))
	return rows
}

func nums(rows []map[string]any) []int {
	out := []int{}
	for _, r := range rows {
		out = append(out, int(r["number"].(float64)))
	}
	return out
}

func TestCandidatesAreTodoIssuesNoOpenIssueBlocks(t *testing.T) {
	i3, i6 := open(3, "status:todo"), open(6, "status:todo")
	i3.BlockedBy = []int{4}
	i6.BlockedBy = []int{7}
	f := newFake(open(5, "status:todo"), open(2, "status:todo"), i3, open(4, "status:in-progress"), i6, closed(7), open(8), open(9, "status:triage"))
	eq(t, nums(candidatesOf(t, f)), []int{2, 5, 6})
	eq(t, nums(candidatesOf(t, f, "1")), []int{2})
}

func TestCandidatesLeaveOutSubIssues(t *testing.T) {
	kid, triageKid := open(3, "status:todo"), open(6, "status:triage")
	kid.SubOf, triageKid.SubOf = 2, 2
	f := newFake(open(2, "status:todo"), kid, open(5, "status:todo"), triageKid, open(7, "status:triage"))
	eq(t, nums(candidatesOf(t, f)), []int{2, 5})
	eq(t, nums(candidatesOf(t, f, "--state=triage")), []int{7})
}

func TestCandidatesMineFirstByPriorityThenNumber(t *testing.T) {
	mine := func(i *fIssue) *fIssue { i.Assignees = []string{"me"}; return i }
	i12 := mine(open(12, "status:todo", "priority:P0"))
	i12.BlockedBy = []int{3}
	f := newFake(mine(open(3, "status:todo")), mine(open(5, "status:todo", "priority:P2")), mine(open(9, "status:todo", "priority:P0")),
		mine(open(4, "status:todo", "priority:P1")), mine(open(2, "status:todo", "priority:P1")), mine(open(11, "status:triage", "priority:P0")), i12)
	eq(t, nums(candidatesOf(t, f)), []int{9, 2, 4, 5, 3})
	rows := candidatesOf(t, f, "2")
	eq(t, [][]any{{rows[0]["number"], rows[0]["priority"], rows[0]["assignee"]}, {rows[1]["number"], rows[1]["priority"], rows[1]["assignee"]}}, [][]any{{float64(9), "P0", "me"}, {float64(2), "P1", "me"}})
}

func TestCandidatesMineAloneThenTheUnassignedSomeoneElsesNever(t *testing.T) {
	t0 := "status:todo"
	a := func(i *fIssue, who ...string) *fIssue { i.Assignees = who; return i }
	f := newFake(open(1, t0, "priority:P0"), a(open(2, t0, "priority:P2"), "me"), a(open(3, t0, "priority:P0"), "other"), a(open(4, t0, "priority:P1"), "other", "me"))
	b5 := a(open(5, t0), "other")
	b5.BlockedBy = []int{2}
	f.issues[5] = b5
	rows := candidatesOf(t, f)
	eq(t, [][]any{{rows[0]["number"], rows[0]["assignee"]}, {rows[1]["number"], rows[1]["assignee"]}}, [][]any{{float64(4), "me"}, {float64(2), "me"}}, "P1 before P2")
	b4 := a(open(4, t0), "other")
	b4.BlockedBy = []int{3}
	g := newFake(open(1, t0), a(open(3, t0), "other"), b4, a(open(6, "status:triage"), "me"))
	rows = candidatesOf(t, g)
	eq(t, nums(rows), []int{1})
	eq(t, rows[0]["assignee"], nil)
	eq(t, len(candidatesOf(t, newFake(a(open(3, t0), "other")))), 0)
}

func labeled(name, at string) event {
	e := event{Event: "labeled", CreatedAt: at}
	e.Label.Name = name
	return e
}

func TestCandidatesUnassignedOfOnePriorityGoByTimeInTodo(t *testing.T) {
	t0 := "status:todo"
	mk := func(n int, created string, ev ...event) *fIssue {
		i := open(n, t0)
		i.CreatedAt = created
		i.Events = ev
		return i
	}
	f := newFake(
		mk(1, "2026-01-01T00:00:00Z", labeled(t0, "2026-03-01T00:00:00Z")),
		mk(2, "2026-02-01T00:00:00Z", labeled(t0, "2026-02-02T00:00:00Z")),
		mk(3, "2026-01-05T00:00:00Z", labeled(t0, "2026-01-06T00:00:00Z"), labeled("status:in-progress", "2026-01-07T00:00:00Z"), labeled(t0, "2026-02-20T00:00:00Z")),
		mk(4, "2026-01-10T00:00:00Z", labeled("priority:P0", "2026-01-11T00:00:00Z"), labeled(t0, "2026-01-12T00:00:00Z"), labeled("priority:P1", "2026-04-01T00:00:00Z")),
		mk(5, "2026-01-20T00:00:00Z"),
	)
	eq(t, nums(candidatesOf(t, f)), []int{4, 5, 2, 3, 1})
	rows := candidatesOf(t, f, "2")
	eq(t, nums(rows), []int{4, 5})
}

func TestCandidatesUnassignedGoByPriorityFirst(t *testing.T) {
	t0 := "status:todo"
	at := func(i *fIssue, day string) *fIssue {
		i.Events = []event{labeled(t0, "2026-02-"+day+"T00:00:00Z")}
		return i
	}
	f := newFake(at(open(1, t0, "priority:P2"), "01"), at(open(2, t0), "02"), at(open(3, t0, "priority:P0"), "20"), at(open(4, t0, "priority:P1"), "10"), at(open(5, t0, "priority:P1"), "05"), at(open(6, t0, "priority:P0"), "25"))
	rows := candidatesOf(t, f)
	var got [][]any
	for _, r := range rows {
		got = append(got, []any{r["number"], r["priority"]})
	}
	eq(t, got, [][]any{{float64(3), "P0"}, {float64(6), "P0"}, {float64(5), "P1"}, {float64(4), "P1"}, {float64(1), "P2"}, {float64(2), nil}})
	eq(t, nums(candidatesOf(t, f, "1")), []int{3})
}

// reads is every read of the user or an issue's events the candidates made.
func reads(f *fake) []string {
	var out []string
	for _, c := range f.raw {
		j := strings.Join(c, " ")
		if j == "api user" || strings.Contains(j, "/events") {
			out = append(out, strings.SplitN(j, "?", 2)[0])
		}
	}
	return out
}

func TestCandidatesReadOnlyWhatTheOrderNeeds(t *testing.T) {
	t0 := "status:todo"
	ev := []event{labeled(t0, "2026-02-01T00:00:00Z")}
	with := func(i *fIssue) *fIssue { i.Events = ev; return i }
	read := func(issueList ...*fIssue) []string {
		f := newFake(issueList...)
		candidatesOf(t, f)
		return reads(f)
	}
	eq(t, read(with(open(1, t0)), with(open(2, t0))), []string{"api repos/o/r/issues/1/events", "api repos/o/r/issues/2/events"}, "nobody assigned")
	eq(t, len(read(with(open(1, t0)))), 0, "a single unassigned one needs no order")
	eq(t, len(read(with(open(1, t0, "priority:P0")), with(open(2, t0, "priority:P1")), with(open(3, t0)))), 0, "different priorities")
	eq(t, read(with(open(1, t0, "priority:P0")), with(open(2, t0, "priority:P1")), with(open(3, t0, "priority:P1"))), []string{"api repos/o/r/issues/2/events", "api repos/o/r/issues/3/events"}, "only those that share a priority")
	m := open(2, t0)
	m.Assignees = []string{"me"}
	eq(t, read(with(open(1, t0)), m, with(open(3, t0))), []string{"api user"}, "one of mine")
	x := with(open(1, t0))
	x.Assignees = []string{"x"}
	eq(t, read(x), []string{"api user"})
	tm := open(1, "status:triage")
	tm.Assignees = []string{"me"}
	eq(t, len(read(tm, with(open(2, t0)))), 0, "issues that are not candidates cost nothing")
}

func TestCandidatesAnIssueWithMoreEventsThanAPageIsReadPageByPage(t *testing.T) {
	var noise []event
	for k := 0; k < 120; k++ {
		noise = append(noise, labeled("priority:P1", fmt.Sprintf("2026-01-%02dT00:00:00Z", k%28+1)))
	}
	a, b := open(1, "status:todo"), open(2, "status:todo")
	a.CreatedAt, b.CreatedAt = "2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z"
	a.Events = append(noise, labeled("status:todo", "2026-05-01T00:00:00Z"))
	b.Events = []event{labeled("status:todo", "2026-04-01T00:00:00Z")}
	eq(t, nums(candidatesOf(t, newFake(a, b))), []int{2, 1})
}

func TestReadingOpenIssuesPagesThroughTheRepoListAndSkipsPullRequests(t *testing.T) {
	var list []*fIssue
	for n := 1; n <= 230; n++ {
		list = append(list, open(n, "status:todo"))
	}
	pull := open(231, "status:todo")
	pull.Pull = true
	list = append(list, pull)
	eq(t, len(candidatesOf(t, newFake(list...), "1000")), 230)
}

func TestCandidatesStateTriageAndTheCommandLine(t *testing.T) {
	tr := "status:triage"
	i4 := open(4, tr)
	i4.BlockedBy = []int{5}
	f := newFake(open(1, tr, "priority:P2"), open(2, tr), open(3, tr, "priority:P0"), i4, open(5, "status:in-progress"), open(6, "status:todo", "priority:P0"), open(7, tr, "priority:P1"), open(8))
	rows := candidatesOf(t, f, "--state=triage")
	var got [][]any
	for _, r := range rows {
		got = append(got, []any{r["number"], r["priority"]})
	}
	eq(t, got, [][]any{{float64(3), "P0"}, {float64(7), "P1"}, {float64(1), "P2"}, {float64(2), nil}})
	eq(t, nums(candidatesOf(t, f, "2", "--state=triage")), []int{3, 7})
	eq(t, nums(candidatesOf(t, f)), []int{6}, "no state: todo")
	eq(t, nums(candidatesOf(t, f, "--state=todo")), []int{6})
	p := docsWith(t, nil, nil, "")
	refused(t, run(p, f, "candidates", p.docs, "--state=in-progress"), `state`)
	refused(t, run(p, f, "candidates", p.docs, "--state=backlog"), `triage.*todo|todo.*triage`)
	refused(t, run(p, f, "candidates", p.docs, "--state"), `state`)
}

func TestCandidatesStateTriageMineFirstAndTheUnassignedByTimeInTriage(t *testing.T) {
	tr := "status:triage"
	at := func(i *fIssue, day string) *fIssue {
		i.Events = []event{labeled(tr, "2026-02-"+day+"T00:00:00Z"), labeled("status:todo", "2026-03-30T00:00:00Z")}
		return i
	}
	o3 := open(3, tr, "priority:P0")
	o3.Assignees = []string{"other"}
	f := newFake(at(open(1, tr), "20"), at(open(2, tr), "02"), o3, at(open(4, tr), "10"))
	rows := candidatesOf(t, f, "--state=triage")
	var got [][]any
	for _, r := range rows {
		got = append(got, []any{r["number"], r["assignee"]})
	}
	eq(t, got, [][]any{{float64(2), nil}, {float64(4), nil}, {float64(1), nil}})
	m2 := open(2, tr, "priority:P2")
	m2.Assignees = []string{"me"}
	o3b := open(3, tr, "priority:P0")
	o3b.Assignees = []string{"other"}
	g := newFake(at(open(1, tr), "20"), m2, o3b)
	rows = candidatesOf(t, g, "--state=triage")
	eq(t, [][]any{{rows[0]["number"], rows[0]["assignee"]}}, [][]any{{float64(2), "me"}})
}

// ---------- show ----------

func TestShow(t *testing.T) {
	p := docsWith(t, map[string]string{"retry": specText(sp{Issues: "[10]"})}, nil, "")
	f := newFake(open(10, "status:in-progress", "type:seo", "type:seo/blog", "kind:bug"), open(13))
	f.prs["o/r"] = []*fPR{pr(1, "Refs o/r#10", "OPEN", true), pr(2, "Refs o/r#99", "OPEN", false), pr(3, "Refs o/r#10", "MERGED", false), pr(4, "Refs o/r#10", "CLOSED", false)}
	git := func([]string) (string, error) {
		return "main\norigin/main\nissue/10-retry\norigin/issue/10-retry\nissue/100-other\n", nil
	}
	r := cli(p, f, git, "issues", "show", p.docs, "10")
	eq(t, r.code, 0, r.err)
	var v struct {
		Number     int      `json:"number"`
		Title      string   `json:"title"`
		State      string   `json:"state"`
		Categories []string `json:"categories"`
		Kind       string   `json:"kind"`
		PRs        []struct {
			Repo   string `json:"repo"`
			Number int    `json:"number"`
			State  string `json:"state"`
		} `json:"prs"`
		Spec   string `json:"spec"`
		Branch string `json:"branch"`
	}
	must(t, json.Unmarshal([]byte(r.out), &v))
	eq(t, [2]string{v.State, v.Title}, [2]string{"in-progress", "issue 10"})
	eq(t, v.Categories, []string{"type:seo", "type:seo/blog"})
	eq(t, v.Kind, "bug")
	var prs [][]any
	for _, x := range v.PRs {
		prs = append(prs, []any{x.Repo, x.Number, x.State})
	}
	eq(t, prs, [][]any{{"o/r", 1, "draft"}, {"o/r", 3, "merged"}, {"o/r", 4, "closed"}})
	eq(t, [2]string{v.Spec, v.Branch}, [2]string{"retry", "issue/10-retry"})
	r = cli(p, f, nil, "issues", "show", p.docs, "13")
	mustMatch(t, `"state": "backlog"`, r.out)
	mustMatch(t, `"prs": \[\]`, r.out)
	mustMatch(t, `"spec": null`, r.out)
	mustMatch(t, `"branch": null`, r.out)
}

// ---------- categories and labels ----------

func TestReadTypesReadsTheTrackerInTheProjectDirectoryOnly(t *testing.T) {
	p := docsWith(t, nil, nil, "")
	got, _ := issues.ReadTypes(p.docs)
	if got != nil {
		t.Fatal("no tracker, no types")
	}
	oldWay := "# AGENTS.md\n\n## issue 分类\n\n- `legacy`：旧写法\n\n保留的 label：`Old`\n"
	projectDir := filepath.Dir(p.docs)
	must(t, os.WriteFile(filepath.Join(projectDir, "AGENTS.md"), []byte(oldWay), 0o644))
	must(t, os.WriteFile(filepath.Join(projectDir, "CLAUDE.md"), []byte(oldWay), 0o644))
	if got, _ := issues.ReadTypes(p.docs); got != nil {
		t.Fatal("the old heading in AGENTS.md / CLAUDE.md is not a source")
	}
	must(t, os.WriteFile(filepath.Join(projectDir, "ISSUE_TRACKER.md"), []byte("# Issue tracker：GitHub\n\n## 别的\n\n只有这个\n"), 0o644))
	if got, _ := issues.ReadTypes(p.docs); got != nil {
		t.Fatal("a tracker without the section")
	}
	must(t, os.WriteFile(filepath.Join(projectDir, "ISSUE_TRACKER.md"), []byte(typesTracker), 0o644))
	got, _ = issues.ReadTypes(p.docs)
	eq(t, got.Keep, []string{"Idea", "test infra"})
}

func TestLabelsCreatesTheMissingOnesAndListsTheRestWithTheirUse(t *testing.T) {
	p := docsWith(t, nil, str(typesTracker), "")
	f := newFake(open(1, "bug", "Idea"), open(2, "bug"))
	f.labels = []string{"status:todo", "bug", "Idea", "status:实现中", "type:seo"}
	r := run(p, f, "labels", p.docs)
	eq(t, r.code, 0, r.err)
	var made []string
	for _, l := range r.lines() {
		if strings.HasPrefix(l, "created ") {
			made = append(made, strings.TrimPrefix(l, "created "))
		}
	}
	pick := func(prefix string) []string {
		var out []string
		for _, l := range made {
			if strings.HasPrefix(l, prefix) {
				out = append(out, l)
			}
		}
		return out
	}
	eq(t, pick("status:"), []string{"status:triage", "status:in-progress", "status:in-review"})
	eq(t, pick("kind:"), []string{"kind:bug", "kind:feature", "kind:improvement"})
	eq(t, pick("type:"), []string{"type:billing", "type:seo/backlink", "type:seo/blog", "type:uiux"})
	eq(t, pick("priority:"), []string{"priority:P0", "priority:P1", "priority:P2"})
	mustMatch(t, `  bug（2 个 open issue 在用）`, r.out)
	mustMatch(t, `  status:实现中（0 个 open issue 在用）`, r.out)
	for _, c := range f.calls {
		if c[1] != "create" {
			t.Fatalf("labels without --prune wrote %v", c)
		}
	}
	kept := issues.KeptLabels(mustTypes(t))
	if !kept["kind:improvement"] || kept["status:done"] || !kept["priority:P1"] {
		t.Fatal("kept set")
	}
}

func mustTypes(t *testing.T) *issues.Types {
	t.Helper()
	ty, err := issues.ParseTypes(typesTracker)
	must(t, err)
	return ty
}

func TestLabelsPruneDeletesTheSurplusAndRefusesWithoutCategories(t *testing.T) {
	p := docsWith(t, nil, str(typesTracker), "")
	f := newFake()
	f.labels = []string{"bug", "Idea"}
	r := run(p, f, "labels", p.docs, "--prune")
	eq(t, r.code, 0, r.err)
	mustMatch(t, `deleted bug`, r.out)
	found := false
	for _, c := range f.calls {
		if strings.Join(c, " ") == "label delete bug --yes" {
			found = true
		}
	}
	if !found {
		t.Fatal("no label delete bug --yes")
	}
	p2 := docsWith(t, nil, nil, "")
	refused(t, run(p2, newFake(), "labels", p2.docs, "--prune"), `不清理`)
	r = run(p2, newFake(), "labels", p2.docs)
	if strings.Contains(r.out, "不在状态") {
		t.Fatal("listed surplus without categories")
	}
}

func TestTypeReplacesTheIssuesTypeLabelsAndLeavesTheRest(t *testing.T) {
	p := docsWith(t, nil, str(typesTracker), "")
	f := newFake(open(1, "status:triage", "type:billing", "Idea", "kind:bug"))
	r := run(p, f, "type", p.docs, "1", "seo/blog")
	eq(t, r.lines(), []string{"#1: type:seo type:seo/blog"})
	eq(t, sorted(f.issues[1].Labels), []string{"Idea", "kind:bug", "status:triage", "type:seo", "type:seo/blog"})
	refused(t, run(p, f, "type", p.docs, "1", "legacy"), `「legacy」不是这个项目的分类`)
}

func TestAnIssueOfACategoryOnceMarkedIndependentQueueGoesInTheSameOrder(t *testing.T) {
	t0 := "status:todo"
	f := newFake(open(1, t0, "type:seo", "type:seo/pages"), open(2, t0, "type:bug"), open(3, t0), open(4, t0, "type:seo"))
	eq(t, nums(candidatesOf(t, f)), []int{1, 2, 3, 4})
}

// ---------- body, new, priority, backlog, note ----------

func TestNewRefusesABodyThatMissesASectionWithoutCallingCreate(t *testing.T) {
	p := docsWith(t, nil, nil, "")
	f := newFake()
	refused(t, run(p, f, "new", p.docs, "重试重复扣配额", fileWith(t, withoutSection("从哪发现"))), `从哪发现`)
	refused(t, run(p, f, "new", p.docs, "重试重复扣配额", fileWith(t, withoutSection("背景"))), `缺「背景」`)
	eq(t, len(writes(f.calls)), 0)
}

func TestNewRefusesATitleAnOpenIssueAlreadyHas(t *testing.T) {
	p := docsWith(t, nil, nil, "")
	f := newFake(open(5, "status:todo"))
	refused(t, run(p, f, "new", p.docs, "issue 5", fileWith(t, goodBody)), `#5`)
	eq(t, len(writes(f.calls)), 0)
	// a closed issue with the same title does not count
	g := newFake(closed(6))
	r := run(p, g, "new", p.docs, "issue 6", fileWith(t, goodBody))
	eq(t, r.lines(), []string{"7"})
	eq(t, len(g.calls), 1)
}

func TestNewStateTodoNeedsAPriorityAndBadValuesAreRefusedBeforeAnythingIsCreated(t *testing.T) {
	p := docsWith(t, nil, str(typesTracker), "")
	f := newFake()
	body := fileWith(t, goodBody)
	refused(t, run(p, f, "new", p.docs, "t", body, "--state=todo"), `--priority`)
	refused(t, run(p, f, "new", p.docs, "t", body, "--state=in-progress"), `backlog 或 todo`)
	refused(t, run(p, f, "new", p.docs, "t", body, "--priority=P3"), `P0 / P1 / P2`)
	refused(t, run(p, f, "new", p.docs, "t", body, "--kind=chore"), `bug / feature / improvement`)
	refused(t, run(p, f, "new", p.docs, "t", body, "--type=ai"), `不是这个项目的分类`)
	refused(t, run(p, f, "new", p.docs, "  ", body), `标题`)
	eq(t, len(writes(f.calls)), 0)
}

func TestNewLabelsFollowTheArgumentsAndTheNumberIsPrinted(t *testing.T) {
	p := docsWith(t, nil, str(typesTracker), "")
	f := newFake(open(3))
	body := fileWith(t, goodBody)
	r := run(p, f, "new", p.docs, "新的一条", body, "--state=todo", "--priority=P1", "--kind=bug", "--type=seo/blog")
	eq(t, r.lines(), []string{"4"})
	eq(t, sorted(f.issues[4].Labels), []string{"kind:bug", "priority:P1", "status:todo", "type:seo", "type:seo/blog"})
	eq(t, f.issues[4].Body, goodBody)
	r = run(p, f, "new", p.docs, "另一条", body)
	eq(t, len(f.issues[5].Labels), 0, r.lines())
	run(p, f, "new", p.docs, "第三条", body, "--priority=P0")
	eq(t, f.issues[6].Labels, []string{"priority:P0"})
	r = run(p, f, "new", p.docs, "x", body, "--state")
	refused(t, r, `--state 要带值`)
}

func TestNewTypeFlagsMayRepeatAndBodyOnlyChecks(t *testing.T) {
	p := docsWith(t, nil, str(typesTracker), "")
	f := newFake()
	r := run(p, f, "new", p.docs, "重试重复扣配额", fileWith(t, goodBody), "--state=todo", "--priority=P0", "--kind=bug", "--type=billing", "--type=seo/blog")
	eq(t, r.lines(), []string{"1"})
	var labels []string
	c := f.calls[0]
	for k, a := range c {
		if a == "--label" {
			labels = append(labels, c[k+1])
		}
	}
	eq(t, sorted(labels), []string{"kind:bug", "priority:P0", "status:todo", "type:billing", "type:seo", "type:seo/blog"})
	eq(t, run(p, f, "body", p.docs, fileWith(t, goodBody)).lines(), []string{"正文齐了"})
	refused(t, run(p, f, "body", p.docs, fileWith(t, withoutSection("证据"))), `缺「证据」`)
	refused(t, run(p, f, "body", p.docs, fileWith(t, withoutSection("背景"))), `缺「背景」`)
	refused(t, run(p, f, "body", p.docs, filepath.Join(p.docs, "no-such.md")), `没有正文文件`)
	eq(t, len(f.calls), 1, "body wrote nothing")
}

func TestNewRepoOpensInThatRepositoryAndChecksForADuplicateThere(t *testing.T) {
	p := docsWith(t, nil, nil, "")
	var calls [][]string
	gh := func(args []string) (string, error) {
		calls = append(calls, args)
		if args[0] == "api" {
			if strings.HasPrefix(args[1], "repos/plugin/repo/") {
				return "[]", nil
			}
			return `[{"number":5,"title":"同名","state":"open","labels":[]}]`, nil
		}
		if args[0] == "issue" && args[1] == "create" {
			return "https://github.com/plugin/repo/issues/9\n", nil
		}
		return "", nil
	}
	n, err := issues.NewIssue(gh, nil, issues.NewIssueOpts{Title: "同名", Body: goodBody, Repo: "plugin/repo"})
	must(t, err)
	eq(t, n, 9)
	apiRead := false
	for _, c := range calls {
		if c[0] == "api" && strings.HasPrefix(c[1], "repos/plugin/repo/issues?") {
			apiRead = true
		}
		if c[0] == "api" && strings.HasPrefix(c[1], "repos/{owner}/{repo}/") {
			t.Fatal("read the current repo")
		}
	}
	if !apiRead {
		t.Fatal("duplicate check did not read the named repo")
	}
	var create []string
	for _, c := range calls {
		if c[0] == "issue" {
			create = c
		}
	}
	eq(t, create[:4], []string{"issue", "create", "-R", "plugin/repo"})
	taken := func([]string) (string, error) {
		return `[{"number":3,"title":"同名","state":"open","labels":[]}]`, nil
	}
	_, err = issues.NewIssue(taken, nil, issues.NewIssueOpts{Title: "同名", Body: goodBody, Repo: "plugin/repo"})
	if err == nil || !strings.Contains(err.Error(), "#3") {
		t.Fatal(err)
	}
	// without Repo: the current repo, no -R
	calls = nil
	_, err = issues.NewIssue(gh, nil, issues.NewIssueOpts{Title: "同名", Body: goodBody})
	if err == nil || !strings.Contains(err.Error(), "#5") {
		t.Fatal(err)
	}
	for _, c := range calls {
		if contains(c, "-R") {
			t.Fatal("-R without Repo")
		}
	}
	_, err = issues.NewIssue(gh, nil, issues.NewIssueOpts{Title: "x", Body: goodBody, Repo: "plugin"})
	if err == nil || !strings.Contains(err.Error(), "owner/name") {
		t.Fatal(err)
	}
	_ = p
}

func TestNewRepoThroughTheCommandLineAndInALinearProject(t *testing.T) {
	linear := docsWith(t, nil, str("# Issue tracker：Linear\n"), "")
	var calls [][]string
	gh := func(args []string) (string, error) {
		calls = append(calls, args)
		if args[0] == "api" {
			return "[]", nil
		}
		return "https://github.com/plugin/repo/issues/4\n", nil
	}
	call := func(p project, extra ...string) result {
		return cliWithGH(p, gh, append([]string{"issues", "new", p.docs, "标题", fileWith(t, goodBody)}, extra...)...)
	}
	refused(t, call(linear), `Linear`)
	eq(t, len(calls), 0)
	eq(t, call(linear, "--repo=plugin/repo").lines(), []string{"4"})
	plain := docsWith(t, nil, nil, "")
	calls = nil
	eq(t, call(plain, "--repo=plugin/repo").lines(), []string{"4"})
	eq(t, calls[len(calls)-1][:4], []string{"issue", "create", "-R", "plugin/repo"})
	n := 0
	for _, a := range calls[len(calls)-1] {
		if a == "-R" {
			n++
		}
	}
	eq(t, n, 1)
}

func TestPriorityReplacesThePriorityLabelNoneOnlyRemovesNothingToChangeMeansNoEdit(t *testing.T) {
	p := docsWith(t, nil, nil, "")
	f := newFake(open(1, "status:todo", "priority:P2", "bug"), open(2, "priority:P0"), open(3))
	run(p, f, "priority", p.docs, "P0", "1")
	eq(t, sorted(f.issues[1].Labels), []string{"bug", "priority:P0", "status:todo"})
	run(p, f, "priority", p.docs, "none", "2")
	eq(t, len(f.issues[2].Labels), 0)
	before := len(f.calls)
	run(p, f, "priority", p.docs, "none", "3")
	run(p, f, "priority", p.docs, "P0", "1")
	eq(t, len(f.calls), before)
	refused(t, run(p, f, "priority", p.docs, "P3", "1"), `P0 / P1 / P2 / none`)
	eq(t, run(p, f, "priority", p.docs, "P1", "1", "3").lines(), []string{"#1: priority:P1", "#3: priority:P1"})
	eq(t, f.issues[3].Labels, []string{"priority:P1"})
}

func TestBacklogListsTheOnesTriageShouldLookAt(t *testing.T) {
	ask := comment{Body: issues.AIMarker + "\n查过了，还要你补：复现步骤", CreatedAt: "2026-10-20T00:00:00Z"}
	oldAsk := comment{Body: "🤖 idea-loop：查过了，还要你补：复现步骤", CreatedAt: "2026-10-20T00:00:00Z"}
	mk := func(n int, upd string, cs ...comment) *fIssue {
		i := open(n)
		i.UpdatedAt = upd
		i.Comments = cs
		return i
	}
	i9 := open(9, "type:seo")
	f := newFake(
		mk(7, "2026-10-20T00:00:30Z", ask), mk(8, "2026-10-25T00:00:00Z", ask), i9, open(10, "status:todo"),
		mk(11, "2026-10-20T00:00:00Z", comment{Body: issues.AIMarker + "\n已查清：重复了 #3", CreatedAt: "2026-10-20T00:00:00Z"}),
		mk(12, "2026-10-20T00:00:00Z", comment{Body: "人写的：还要你补一句也不算", CreatedAt: "2026-10-20T00:00:00Z"}),
		mk(13, "2026-10-20T00:01:01Z", ask), mk(14, "2026-10-20T00:01:00Z", ask), open(15, "status:triage"), closed(16),
		mk(17, "2026-10-20T00:00:30Z", oldAsk),
		mk(18, "2026-10-20T00:00:30Z", comment{Body: "人写的，没有标记：还要你补", CreatedAt: "2026-10-20T00:00:00Z"}),
	)
	p := docsWith(t, nil, nil, "")
	type row struct {
		Number    int      `json:"number"`
		Title     string   `json:"title"`
		Labels    []string `json:"labels"`
		CreatedAt string   `json:"createdAt"`
	}
	list := func(args ...string) []row {
		r := run(p, f, append([]string{"backlog", p.docs}, args...)...)
		eq(t, r.code, 0, r.err)
		var rows []row
		must(t, json.Unmarshal([]byte(r.out), &rows))
		return rows
	}
	numbers := func(rows []row) []int {
		var out []int
		for _, r := range rows {
			out = append(out, r.Number)
		}
		return out
	}
	eq(t, numbers(list()), []int{8, 9, 11, 12, 13, 18})
	eq(t, list()[1], row{9, "issue 9", []string{"type:seo"}, "2026-01-01T00:00:00Z"})
	eq(t, numbers(list("1")), []int{8}, "the skipped #7 does not use up the limit")
	f.raw = nil
	eq(t, numbers(list("2")), []int{8, 9})
	seen := map[string]bool{}
	for _, c := range f.raw {
		if c[0] == "api" && strings.Contains(c[1], "/comments") {
			seen[strings.Split(strings.Split(c[1], "issues/")[1], "/")[0]] = true
		}
	}
	eq(t, seen, map[string]bool{"7": true, "8": true, "9": true}, "comments are read only for the issues that are candidates")
}

func TestBacklogReadsTheNewestCommentEvenPastTheFirstPage(t *testing.T) {
	var many []comment
	for k := 0; k < 101; k++ {
		many = append(many, comment{Body: fmt.Sprintf("c%d", k), CreatedAt: "2026-10-01T00:00:00Z"})
	}
	many[100] = comment{Body: issues.AIMarker + "\n还要你补", CreatedAt: "2026-10-02T00:00:00Z"}
	i := open(1)
	i.UpdatedAt = "2026-10-02T00:00:10Z"
	i.Comments = many
	p := docsWith(t, nil, nil, "")
	r := run(p, newFake(i), "backlog", p.docs)
	eq(t, strings.TrimSpace(r.out), "[]")
}

func TestNoteCommentsWithTheAIMarkerOnItsOwnFirstLineOnceAndShowsTheURL(t *testing.T) {
	p := docsWith(t, nil, nil, "")
	f := newFake(open(4))
	n, err := issues.NoteIssue(f.gh, 4, "已查清：重复了 #3\n")
	must(t, err)
	mustMatch(t, `^https://github\.com/o/r/issues/4#issuecomment-\d+$`, n)
	issues.NoteIssue(f.gh, 4, "🤖 idea-loop：还要你补：复现步骤")
	issues.NoteIssue(f.gh, 4, issues.AIMarker+"\n已经带标记")
	eq(t, commentsOn(f.calls, 4), []string{issues.AIMarker + "\n已查清：重复了 #3", issues.AIMarker + "\n还要你补：复现步骤", issues.AIMarker + "\n已经带标记"})
	for _, body := range commentsOn(f.calls, 4) {
		if strings.Count(body, issues.AIMarker) != 1 || strings.Contains(body, "🤖 idea-loop：") {
			t.Fatalf("the marker once, never the old prefix: %q", body)
		}
	}
	_, err = issues.NoteIssue(f.gh, 4, "  \n")
	if err == nil || !strings.Contains(err.Error(), "空的") {
		t.Fatal(err)
	}
	r := run(p, f, "note", p.docs, "4", fileWith(t, "行"))
	eq(t, len(r.lines()), 1)
	mustMatch(t, `^#4: 已评论 https://github\.com/o/r/issues/4#issuecomment-\d+$`, r.lines()[0])
	eq(t, commentsOn(f.calls, 4)[3], issues.AIMarker+"\n行")
	// a gh that prints nothing: no URL, still commented
	u, err := issues.NoteIssue(func([]string) (string, error) { return "", nil }, 4, "x")
	must(t, err)
	eq(t, u, "")
}

// ---------- closing: close first, label after ----------

func TestDoneAndCanceledCloseFirstAndDropTheLabelAfter(t *testing.T) {
	p := docsWith(t, nil, nil, "")
	f := newFake(open(2, "status:in-review"), open(3, "status:todo"))
	f.prs["o/r"] = []*fPR{pr(5, "Refs o/r#2", "MERGED", false)}
	f.fails = func(a []string) bool { return a[0] == "issue" && a[1] == "close" }
	refused(t, run(p, f, "set", p.docs, "done", "2"), `EOF`)
	refused(t, run(p, f, "set", p.docs, "canceled", "3", "--comment=不做了"), `EOF`)
	for _, c := range f.calls {
		if c[0] == "issue" && c[1] == "edit" {
			t.Fatal("gh issue edit was called")
		}
	}
	if !f.issues[2].Open || !reflect.DeepEqual(f.issues[2].Labels, []string{"status:in-review"}) || !reflect.DeepEqual(f.issues[3].Labels, []string{"status:todo"}) {
		t.Fatal("changed")
	}
	// the retry works, and closes before it relabels
	f.fails = nil
	eq(t, run(p, f, "set", p.docs, "done", "2").code, 0)
	closeAt, editAt := -1, -1
	for k, c := range f.calls {
		if c[0] == "issue" && c[1] == "close" && closeAt < 0 {
			closeAt = k
		}
		if c[0] == "issue" && c[1] == "edit" && editAt < 0 {
			editAt = k
		}
	}
	if closeAt < 0 || editAt < closeAt {
		t.Fatal(closeAt, editAt)
	}
	eq(t, len(f.issues[2].Labels), 0)
	if f.issues[2].Open {
		t.Fatal("still open")
	}
}

func TestReconcileClosesBeforeItRelabelsToo(t *testing.T) {
	p := docsWith(t, nil, nil, "")
	f := newFake(open(8, "status:in-review"))
	f.prs["o/r"] = []*fPR{pr(1, "Refs #8", "MERGED", false)}
	f.fails = func(a []string) bool { return a[1] == "close" }
	refused(t, run(p, f, "reconcile", p.docs), `EOF`)
	eq(t, f.issues[8].Labels, []string{"status:in-review"})
	eq(t, len(f.calls), 0)
}

func TestSetDoneOpensItsCommentWithTheMergedPRs(t *testing.T) {
	p := docsWith(t, nil, nil, "")
	f := newFake(open(4, "status:in-review"), open(5, "status:in-review"))
	f.prs["o/r"] = []*fPR{pr(10, "Refs o/r#4\nRefs o/r#5", "MERGED", false), pr(12, "Refs o/r#4", "CLOSED", false), pr(20, "Refs o/r#4", "MERGED", false)}
	run(p, f, "set", p.docs, "done", "4")
	eq(t, commentsOn(f.calls, 4), []string{issues.AIMarker + "\n合并的 PR：o/r#10、o/r#20。"})
	run(p, f, "set", p.docs, "done", "5", "--comment=另见 #9")
	eq(t, commentsOn(f.calls, 5), []string{issues.AIMarker + "\n合并的 PR：o/r#10。另见 #9"})
}

// ---------- Linear projects ----------

func linearPR(number int, title, body, state string, draft bool) *fPR {
	return &fPR{Number: number, Title: title, Body: body, State: state, IsDraft: draft, URL: fmt.Sprintf("https://github.com/pr/%d", number)}
}

func TestInALinearProjectTheCommandsThatWriteGitHubAreRefusedAndGHIsNeverCalled(t *testing.T) {
	p := docsWith(t, nil, str(linearTracker), "")
	body := fileWith(t, goodBody)
	lines := map[string][]string{
		"labels": {"labels", p.docs}, "type": {"type", p.docs, "1", "seo"}, "set": {"set", p.docs, "todo", "1"}, "candidates": {"candidates", p.docs},
		"reconcile": {"reconcile", p.docs}, "migrate": {"migrate", p.docs}, "new": {"new", p.docs, "标题", body}, "priority": {"priority", p.docs, "P0", "1"},
		"kind": {"kind", p.docs, "1", "bug"}, "list": {"list", p.docs, "--state", "todo"},
		"backlog": {"backlog", p.docs}, "note": {"note", p.docs, "1", body},
	}
	for cmd, argv := range lines {
		r := cli(p, nil, nil, append([]string{"issues"}, argv...)...)
		refused(t, r, `Linear`)
		mustMatch(t, `references/linear\.md`, r.err)
		if !strings.Contains(r.err, "「"+cmd+"」") {
			t.Errorf("%s: %s", cmd, r.err)
		}
	}
	eq(t, issues.LinearRefusal("set") != "", true)
	// what does not touch GitHub issues still works
	eq(t, cli(p, nil, nil, "issues", "body", p.docs, body).lines(), []string{"正文齐了"})
	r := cli(p, nil, nil, "issues", "queues", p.docs)
	mustMatch(t, `"states": \[\s*"triage",\s*"in-progress",\s*"in-review"\s*\]`, r.out)
}

func TestCheckFromDoesNotReadTheIssueTakesALinearKeyAndReadsTheSpec(t *testing.T) {
	p := docsWith(t, map[string]string{"retry": specText(sp{Issues: "[FA-577]", Fork: true})}, str(linearTracker), "")
	f := newFake()
	refused(t, run(p, f, "check", p.docs, "todo", "FA-577", "--from=triage"), `FA-577：spec 里还有等人定的.*待定`)
	eq(t, len(f.raw), 0, "no gh call at all")
	must(t, os.WriteFile(filepath.Join(p.docs, "spec", "retry", "retry.md"), []byte(specText(sp{Issues: "[FA-577]"})), 0o644))
	eq(t, run(p, f, "check", p.docs, "todo", "FA-577", "--from=triage").lines(), []string{"FA-577: triage → todo 可以翻"})
	for _, c := range f.raw {
		if c[0] == "api" {
			t.Fatal("the issue API was called")
		}
	}
	refused(t, run(p, f, "check", p.docs, "done", "FA-577", "--from=todo"), `能翻成`)
	refused(t, run(p, f, "check", p.docs, "todo", "FA-577", "--from=实现中"), `不在状态机里`)
	refused(t, run(p, f, "check", p.docs, "todo", "nope", "--from=triage"), `不是 GitHub 的号`)
}

func TestCheckDoneFromInALinearProjectFindsThePRsByTitleOrLinearLine(t *testing.T) {
	p := docsWith(t, nil, str(linearTracker), "")
	f := newFake()
	f.prs["o/r"] = []*fPR{
		linearPR(1, "[FA-577] 改 worker", "", "MERGED", false), linearPR(2, "[FA-5770] 别的", "", "OPEN", false), linearPR(3, "提到 FA-577 但不是前缀", "没有那一行", "OPEN", false),
		linearPR(4, "接口", "说明\nLinear: FA-577\n", "OPEN", true), linearPR(5, "接口", "Linear: FA-57", "OPEN", false),
	}
	f.prs["o/api"] = []*fPR{linearPR(6, "[FA-577] 别的仓库", "", "OPEN", false)}
	refused(t, run(p, f, "check", p.docs, "done", "FA-577", "--from=in-review"), `还有 PR 没合并：o/r#4（draft）`)
	f.prs["o/r"][3].IsDraft = false
	refused(t, run(p, f, "check", p.docs, "done", "FA-577", "--from=in-review"), `o/r#4（ready）`)
	f.prs["o/r"][3].State = "MERGED"
	f.raw = nil
	eq(t, run(p, f, "check", p.docs, "done", "FA-577", "--from=in-review").lines(), []string{"FA-577: in-review → done 可以翻"})
	titleSearch, bodySearch := false, false
	for _, c := range f.raw {
		if c[0] != "pr" {
			t.Fatalf("only PRs were searched: %v", c)
		}
		for k, a := range c {
			if a == "--repo" && c[k+1] != "o/r" {
				t.Fatal("not the project's repo")
			}
		}
		if contains(c, "FA-577 in:title") {
			titleSearch = true
		}
		if contains(c, "FA-577 in:body") {
			bodySearch = true
		}
	}
	if !titleSearch || !bodySearch {
		t.Fatal("both searches")
	}
	refused(t, run(p, f, "check", p.docs, "done", "FA-999", "--from=in-review"), `没有 PR 挂在`)
}

func TestCheckInALinearProjectWithoutFromIsRefused(t *testing.T) {
	p := docsWith(t, nil, str(linearTracker), "")
	f := newFake()
	refused(t, run(p, f, "check", p.docs, "todo", "FA-577"), `--from`)
	eq(t, len(f.raw), 0)
}

func TestALinearProjectLooksForPRsInTheRepoOfTheProjectListAndNeverAsksGHWhichRepo(t *testing.T) {
	p := docsWith(t, nil, str("# Issue tracker：Linear\n\n## 团队\n\nFish（key `FA`）\n"), "")
	f := newFake()
	f.prs["o/r"] = []*fPR{linearPR(1, "[FA-577] x", "", "MERGED", false), linearPR(2, "[FA-1] y", "", "OPEN", false)}
	eq(t, run(p, f, "check", p.docs, "done", "FA-577", "--from=in-review").lines(), []string{"FA-577: in-review → done 可以翻"})
	for _, c := range f.raw {
		if c[0] == "repo" {
			t.Fatal("gh repo view")
		}
	}
	r := run(p, newFake(), "show", p.docs, "FA-577")
	_ = r
	g := newFake()
	g.prs["o/r"] = f.prs["o/r"]
	r = run(p, g, "show", p.docs, "FA-577")
	mustMatch(t, `"number": 1`, r.out)
	mustMatch(t, `"state": "merged"`, r.out)
}

func TestCheckFromInAGitHubProjectReadsNoIssueEither(t *testing.T) {
	p := docsWith(t, nil, nil, "")
	f := newFake()
	f.prs["o/r"] = []*fPR{pr(1, "Refs #5", "MERGED", false)}
	eq(t, run(p, f, "check", p.docs, "done", "5", "--from=in-review").lines(), []string{"#5: in-review → done 可以翻"})
	for _, c := range f.raw {
		if c[0] == "api" {
			t.Fatal("api read")
		}
	}
	g := newFake(open(5, "status:in-review"))
	g.prs["o/r"] = f.prs["o/r"]
	eq(t, run(p, g, "check", p.docs, "done", "5").lines(), []string{"#5: in-review → done 可以翻"})
	read := false
	for _, c := range g.raw {
		if c[0] == "api" {
			read = true
		}
	}
	if !read {
		t.Fatal("without --from the issue is read")
	}
}

func TestShowInALinearProject(t *testing.T) {
	p := docsWith(t, map[string]string{"retry": specText(sp{Issues: "[FA-577, 12]"})}, str(linearTracker), "")
	f := newFake()
	f.prs["o/r"] = []*fPR{linearPR(1, "[FA-577] x", "", "OPEN", true), linearPR(2, "y", "Linear: FA-577", "MERGED", false)}
	git := func([]string) (string, error) { return "main\nissue/FA-577-retry\norigin/issue/FA-577-retry\n", nil }
	r := cli(p, f, git, "issues", "show", p.docs, "FA-577")
	eq(t, r.code, 0, r.err)
	mustMatch(t, `"number": "FA-577"`, r.out)
	mustMatch(t, `"state": null`, r.out)
	mustMatch(t, `"spec": "retry"`, r.out)
	mustMatch(t, `"branch": "issue/FA-577-retry"`, r.out)
	mustMatch(t, `"state": "draft"`, r.out)
	for _, c := range f.raw {
		if c[0] == "api" {
			t.Fatal("api read")
		}
	}
}

// ---------- the project's own repository ----------

const acme = "acme/example-app"

func allAimedAt(raw [][]string, repo string) bool {
	for _, a := range raw {
		if a[0] == "api" {
			if a[1] == "user" {
				continue
			}
			ok := false
			for _, x := range a {
				if strings.HasPrefix(x, "repos/"+repo+"/") && !strings.Contains(x, "{") {
					ok = true
				}
			}
			if !ok {
				return false
			}
			continue
		}
		hit := false
		for k, x := range a {
			if (x == "-R" || x == "--repo") && k+1 < len(a) && a[k+1] == repo {
				hit = true
			}
		}
		if !hit {
			return false
		}
	}
	return true
}

func TestEveryCommandAimsItsGHCallsAtTheProjectsRepoNotTheDirectoryItRunsIn(t *testing.T) {
	body := fileWith(t, goodBody)
	p := docsWith(t, map[string]string{"retry": specText(sp{Issues: "[1, 7]"})}, str(typesTracker), acme)
	world := func() *fake {
		i2 := open(2, "status:todo")
		i2.Assignees = []string{"me"}
		f := newFake(open(1, "status:triage"), i2, open(3, "status:in-progress"), open(4), open(7, "status:in-progress", "type:seo"))
		f.repo = acme
		f.labels = []string{"Idea"}
		f.prs[acme] = []*fPR{pr(9, "Refs "+acme+"#3", "MERGED", false), pr(8, "Refs "+acme+"#7", "OPEN", false)}
		return f
	}
	commands := map[string][]string{
		"show": {"show", p.docs, "7"}, "check": {"check", p.docs, "todo", "1"}, "set": {"set", p.docs, "todo", "1"}, "type": {"type", p.docs, "7", "seo/blog"},
		"new": {"new", p.docs, "重试重复扣配额", body, "--priority=P1", "--type=billing"}, "labels": {"labels", p.docs}, "labels --prune": {"labels", p.docs, "--prune"},
		"priority": {"priority", p.docs, "P1", "4"}, "note": {"note", p.docs, "4", body}, "candidates": {"candidates", p.docs}, "backlog": {"backlog", p.docs},
		"reconcile": {"reconcile", p.docs}, "migrate": {"migrate", p.docs}, "migrate --apply": {"migrate", p.docs, "--apply"},
		"read": {"read", p.docs, "7"}, "block list": {"block", "list", p.docs, "7"},
	}
	for name, argv := range commands {
		f := world()
		r := run(p, f, argv...)
		if r.code != 0 {
			t.Fatalf("%s: %s", name, r.err)
		}
		if len(f.raw) == 0 || !allAimedAt(f.raw, acme) {
			t.Errorf("%s: %v", name, f.raw)
		}
	}
	f := world()
	run(p, f, "show", p.docs, "7")
	read, searched := false, false
	for _, a := range f.raw {
		if a[0] == "api" && a[1] == "repos/"+acme+"/issues/7" {
			read = true
		}
		if a[0] == "pr" && contains(a, "--repo") && a[indexOf(a, "--repo")+1] == acme {
			searched = true
		}
		if a[0] == "repo" {
			t.Fatal("gh is asked which repo it is in")
		}
	}
	if !read || !searched {
		t.Fatal(read, searched)
	}
}

func indexOf(l []string, s string) int {
	for i, x := range l {
		if x == s {
			return i
		}
	}
	return -1
}

func TestRepoOnNewStillNamesAnotherRepositoryAndTheProjectsIsNotAdded(t *testing.T) {
	p := docsWith(t, nil, nil, acme)
	var raw [][]string
	gh := func(args []string) (string, error) {
		raw = append(raw, args)
		if args[0] == "api" {
			return "[]", nil
		}
		return "https://github.com/plugin/repo/issues/4\n", nil
	}
	r := cliWithGH(p, gh, "issues", "new", p.docs, "插件里的问题", fileWith(t, goodBody), "--repo=plugin/repo")
	eq(t, r.lines(), []string{"4"})
	last := raw[len(raw)-1]
	eq(t, last[:4], []string{"issue", "create", "-R", "plugin/repo"})
	n := 0
	for _, a := range last {
		if a == "-R" {
			n++
		}
	}
	eq(t, n, 1)
}

func TestTheBranchOfAnIssueIsFoundInTheCloneTheProjectListRegisters(t *testing.T) {
	p := docsWith(t, map[string]string{"retry": specText(sp{Issues: "[7]"})}, nil, acme)
	f := newFake(open(7, "status:in-progress"))
	f.repo = acme
	var dir string
	io := p
	r := cliWithDirs(io, f, func(d string) { dir = d }, "issues", "show", p.docs, "7")
	eq(t, r.code, 0, r.err)
	eq(t, dir, filepath.Join(p.env["HOME"], "code", "example-app"))
}

func TestTheCategoriesComeFromTheTrackerInTheProjectDirectoryNotTheCodeRepositorysAgentsMd(t *testing.T) {
	p := docsWith(t, nil, str(typesTracker), acme)
	clone := filepath.Join(p.env["HOME"], "code", "example-app")
	must(t, os.MkdirAll(clone, 0o755))
	must(t, os.WriteFile(filepath.Join(clone, "AGENTS.md"), []byte("# AGENTS.md\n\n## issue 分类\n\n- `legacy`：只在代码仓库的 AGENTS.md 里\n"), 0o644))
	f := newFake(open(1, "status:triage"))
	f.repo = acme
	eq(t, run(p, f, "type", p.docs, "1", "seo/blog").lines(), []string{"#1: type:seo type:seo/blog"})
	refused(t, run(p, f, "type", p.docs, "1", "legacy"), `「legacy」不是这个项目的分类`)
}

func TestADocsNotInAProjectDirectoryOfHomeStopsEveryCommandWithTheSentenceAndGHIsNeverCalled(t *testing.T) {
	p := docsWith(t, nil, nil, acme)
	must(t, os.RemoveAll(filepath.Dir(p.docs)))
	code := filepath.Join(p.env["HOME"], "code", "example-app")
	must(t, os.MkdirAll(filepath.Join(code, "docs"), 0o755))
	must(t, os.WriteFile(filepath.Join(code, "DEVELOPMENT.md"), []byte("# 开发\n"), 0o644))
	cmds := []string{"labels", "type", "show", "check", "set", "new", "body", "priority", "backlog", "note", "candidates", "reconcile", "queues", "migrate", "read"}
	for _, c := range cmds {
		r := cli(p, nil, nil, "issues", c, filepath.Join(code, "docs"), "7", "x")
		eq(t, r.code, 1, c)
		eq(t, strings.TrimSpace(r.err), home.NotMoved, c)
		eq(t, r.out, "", c)
	}
	loose := filepath.Join(p.env["HOME"], "loose", "notes")
	must(t, os.MkdirAll(loose, 0o755))
	for _, c := range cmds {
		r := cli(p, nil, nil, "issues", c, loose, "7", "x")
		eq(t, r.code, 1, c)
		eq(t, strings.TrimSpace(r.err), home.NotConnected, c)
	}
}

func TestADocsInHomeUnderANameTheProjectListDoesNotHaveIsNotConnected(t *testing.T) {
	p := docsWith(t, nil, nil, acme)
	stranger := filepath.Join(p.env["IDEA_LOOP_HOME"], "projects", "stranger", "docs")
	must(t, os.MkdirAll(stranger, 0o755))
	refused(t, cli(p, nil, nil, "issues", "show", stranger, "7"), `没接上`)
}

// ---------- the command line itself ----------

func TestTheCommandLineRefusesTheCommandsOfTheOldModel(t *testing.T) {
	p := docsWith(t, nil, nil, "")
	for _, cmd := range []string{"advance", "resume", "handoff", "unhandoff", "drop", "queue", "group", "split"} {
		r := cli(p, nil, nil, "issues", cmd, p.docs, "1")
		refused(t, r, `不认识的命令`)
	}
}

func TestCandidatesStateFlagOnTheCommandLine(t *testing.T) {
	p := docsWith(t, nil, nil, "")
	f := newFake(open(1, "status:todo"), open(2, "status:triage", "priority:P1"), open(3, "status:triage"))
	eq(t, candidateNumbers(t, run(p, f, "candidates", p.docs, "--state=triage")), []int{2, 3})
	eq(t, candidateNumbers(t, run(p, f, "candidates", p.docs, "1", "--state=triage")), []int{2})
	eq(t, candidateNumbers(t, run(p, f, "candidates", p.docs)), []int{1})
	refused(t, run(p, f, "candidates", p.docs, "--state=done"), `state`)
}

func TestQueuesGivesOnlyTheThreeStateNamesAndTheTimeIsNoLongerItsBusiness(t *testing.T) {
	p := docsWith(t, nil, nil, "")
	r := run(p, newFake(), "queues", p.docs)
	eq(t, r.code, 0, r.err)
	var q map[string]any
	must(t, json.Unmarshal([]byte(r.out), &q))
	eq(t, len(q), 1, r.out)
	eq(t, q["states"], []any{"triage", "in-progress", "in-review"})
	// the period, the limit and --at moved to `home dispatch`
	refused(t, run(p, newFake(), "queues", p.docs, "--at=10:00"), `--at`)
	// a 调度 table left in ISSUE_TRACKER.md is no longer read, so a broken one is no longer refused
	old := docsWith(t, nil, str("# Issue tracker：GitHub\n\n## 调度\n\n| 时段 | 派什么 | 上限 |\n|---|---|---|\n| 09:00–19:00 | review | 3 |\n"), "")
	eq(t, run(old, newFake(), "queues", old.docs).code, 0)
}

func TestTheNextCommandIsPrintedAfterARefusal(t *testing.T) {
	p := docsWith(t, nil, nil, "")
	f := newFake(open(2))
	r := run(p, f, "set", p.docs, "in-progress", "2")
	eq(t, r.code, 1)
	lines := strings.Split(strings.TrimSpace(r.err), "\n")
	eq(t, len(lines), 2)
	mustMatch(t, `^#2：「backlog」不能翻成「in-progress」`, lines[0])
	eq(t, lines[1], "下一条：dyna issues check <docs> <状态> <n>")
}

// ---------- the new commands ----------

func TestReadPrintsTheIssueWithItsComments(t *testing.T) {
	p := docsWith(t, nil, nil, "")
	i := open(7, "status:todo", "kind:bug")
	i.Title, i.Body = "重试重复扣配额", "正文"
	i.Comments = []comment{{Body: "第一条", CreatedAt: "2026-10-01T00:00:00Z"}}
	r := run(p, newFake(i), "read", p.docs, "7")
	eq(t, r.code, 0, r.err)
	var v map[string]any
	must(t, json.Unmarshal([]byte(r.out), &v))
	eq(t, v["number"], float64(7))
	eq(t, v["state"], "todo")
	eq(t, v["body"], "正文")
	eq(t, v["labels"], []any{"status:todo", "kind:bug"})
	eq(t, len(v["comments"].([]any)), 1)
}

func TestBlockAddRemoveList(t *testing.T) {
	p := docsWith(t, nil, nil, "")
	f := newFake(open(3, "status:todo"), open(4, "status:in-progress"))
	eq(t, run(p, f, "block", "add", p.docs, "3", "4").lines(), []string{"#3: 被 #4 挡着"})
	var post []string
	for _, c := range f.calls {
		if c[0] == "api" {
			post = c
		}
	}
	eq(t, post, []string{"api", "-X", "POST", "repos/o/r/issues/3/dependencies/blocked_by", "-F", "issue_id=1004"}, "the blocking issue's id, not its number")
	r := run(p, f, "block", "list", p.docs, "3")
	eq(t, r.code, 0, r.err)
	mustMatch(t, `"number": 4`, r.out)
	mustMatch(t, `"state": "in-progress"`, r.out)
	eq(t, run(p, f, "block", "remove", p.docs, "3", "4").lines(), []string{"#3: 不再被 #4 挡着"})
	last := f.calls[len(f.calls)-1]
	eq(t, last, []string{"api", "-X", "DELETE", "repos/o/r/issues/3/dependencies/blocked_by/1004"})
	refused(t, run(p, f, "block", "add", p.docs, "3"), `usage`)
	refused(t, run(p, f, "block", "nope", p.docs), `不认识的命令`)
}

func TestGuardHook(t *testing.T) {
	p := docsWith(t, nil, nil, "")
	hook := func(command string) result {
		ev := map[string]any{"tool_name": "Bash", "tool_input": map[string]string{"command": command}}
		b, _ := json.Marshal(ev)
		return cliStdin(p, string(b), "issues", "guard", "--hook")
	}
	r := hook("gh issue edit 1 --add-label status:todo")
	eq(t, r.code, 2)
	mustMatch(t, `dyna issues set`, r.err)
	for _, ok := range []string{"gh issue edit 1 --add-label kind:bug", "gh issue view 1", "ls"} {
		r := hook(ok)
		eq(t, [2]any{r.code, r.err}, [2]any{0, ""}, ok)
	}
	// another tool, or garbage on stdin: let it through
	r = cliStdin(p, `{"tool_name":"Write","tool_input":{"command":"gh issue edit 1 --add-label status:todo"}}`, "issues", "guard", "--hook")
	eq(t, r.code, 0)
	r = cliStdin(p, `not json`, "issues", "guard", "--hook")
	eq(t, r.code, 0)
	// not as a hook: the command text is the argument
	r = cli(p, nil, nil, "issues", "guard", "gh issue edit 1 --remove-label status:triage")
	eq(t, r.code, 1)
	mustMatch(t, `dyna issues set`, r.err)
}

// markerThen matches a comment that opens with the marker on its own line, then rest.
func markerThen(rest string) string { return `^` + regexp.QuoteMeta(issues.AIMarker+"\n"+rest) }

func TestSetWithACommentThatStartsWithTheOldPrefixOrCarriesTheMarkerPostsTheMarkerOnce(t *testing.T) {
	p := docsWith(t, map[string]string{"retry": specText(sp{Issues: "[1]"})}, nil, "")
	f := newFake(open(1, "status:triage"), open(2, "status:triage"))
	eq(t, run(p, f, "set", p.docs, "backlog", "1", "--comment=🤖 idea-loop：先放着").code, 0)
	eq(t, run(p, f, "set", p.docs, "backlog", "2", "--comment="+issues.AIMarker+"\n先放着").code, 0)
	eq(t, commentsOn(f.calls, 1), []string{issues.AIMarker + "\n先放着"})
	eq(t, commentsOn(f.calls, 2), []string{issues.AIMarker + "\n先放着"})
}

func TestIsIdeaLoopCommentTheMarkerAnywhereOrTheOldPrefixAtTheStart(t *testing.T) {
	for body, want := range map[string]bool{issues.AIMarker + "\n正文": true, "🤖 idea-loop：正文": true, "人写的评论": false, "他说 🤖 idea-loop：不在开头": false, "": false} {
		if issues.IsIdeaLoopComment(body) != want {
			t.Errorf("%q: want %v", body, want)
		}
	}
}
