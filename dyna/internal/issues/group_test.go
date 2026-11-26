package issues_test

import (
	"encoding/json"
	"strings"
	"testing"
)

const parentBody = "## 要解决什么\n一条判断规则\n\n## 子 issue 各自的问题\n- #3 读错\n- #4 漏读\n\n## 冲突或共用的地方\n同一条规则\n\n## 为什么放在一起\n改的是同一处 prompt\n"

func listRows(t *testing.T, f *fake, args ...string) []map[string]any {
	t.Helper()
	p := docsWith(t, nil, nil, "")
	r := run(p, f, append([]string{"list", p.docs}, args...)...)
	if r.code != 0 {
		t.Fatalf("exit %d: %s", r.code, r.err)
	}
	var rows []map[string]any
	must(t, json.Unmarshal([]byte(r.out), &rows))
	return rows
}

func TestListNarrowsToUnblockedTopLevelOrOneParentsSubIssues(t *testing.T) {
	kid, blocked, other := open(3, "status:triage"), open(4, "status:triage"), open(6, "status:triage")
	kid.SubOf, other.SubOf = 2, 5
	blocked.BlockedBy = []int{9}
	f := newFake(open(2, "status:triage"), kid, blocked, open(5, "status:todo"), other, open(9))
	eq(t, nums(listRows(t, f, "--state=triage")), []int{2, 3, 4, 6})
	eq(t, nums(listRows(t, f, "--state=triage", "--unblocked")), []int{2, 3, 6})
	eq(t, nums(listRows(t, f, "--state=triage", "--top-level")), []int{2, 4})
	eq(t, nums(listRows(t, f, "--state=triage", "--parent=2")), []int{3})
	rows := listRows(t, f, "--state=triage")
	eq(t, rows[0]["parent"], nil)
	eq(t, rows[0]["subOpen"], float64(1))
	eq(t, rows[1]["parent"], float64(2))
	eq(t, rows[2]["blockedBy"], float64(1))
}

func TestSubAddHangsTheChildrenAndGivesTheParentTheirHighestPriority(t *testing.T) {
	p := docsWith(t, nil, nil, "")
	f := newFake(open(2, "status:triage"), open(3, "priority:P2"), open(4, "priority:P1"), open(5))
	r := run(p, f, "sub", "add", p.docs, "2", "3", "4")
	eq(t, r.code, 0, r.err)
	eq(t, r.lines(), []string{"#3: 挂到 #2", "#4: 挂到 #2", "#2: 优先级 P1"})
	eq(t, []int{f.issues[3].SubOf, f.issues[4].SubOf}, []int{2, 2})
	if !contains(f.issues[2].Labels, "priority:P1") {
		t.Fatalf("parent labels: %v", f.issues[2].Labels)
	}
	r = run(p, f, "sub", "remove", p.docs, "2", "4")
	eq(t, r.lines(), []string{"#4: 摘离 #2", "#2: 优先级 P2"})
	if !contains(f.issues[2].Labels, "priority:P2") || contains(f.issues[2].Labels, "priority:P1") {
		t.Fatalf("parent labels: %v", f.issues[2].Labels)
	}
	var rows []map[string]any
	must(t, json.Unmarshal([]byte(run(p, f, "sub", "list", p.docs, "2").out), &rows))
	eq(t, nums(rows), []int{3})
}

func TestNewWithSubOpensATriageParentChecksItsFourSectionsAndHangsTheChildren(t *testing.T) {
	p := docsWith(t, nil, nil, "")
	f := newFake(open(3, "status:triage", "priority:P2"), open(4, "status:triage", "priority:P1"))
	writeBody := func(text string) string { return fileWith(t, text) }
	bad := run(p, f, "new", p.docs, "判断规则", writeBody("## 问题\n只有一节\n"), "--sub=3,4")
	refused(t, bad, `父 issue 的正文不合格.*缺「要解决什么」`)
	eq(t, len(writes(f.calls)), 0)
	refused(t, run(p, f, "new", p.docs, "判断规则", writeBody(parentBody), "--sub=3", "--priority=P1"), `父 issue 不带`)
	refused(t, run(p, f, "new", p.docs, "判断规则", writeBody(parentBody), "--sub=3,8"), `#8 不是开着的 issue`)
	r := run(p, f, "new", p.docs, "判断规则", writeBody(parentBody), "--sub=3", "--sub=4")
	eq(t, r.code, 0, r.err)
	n := 5
	eq(t, strings.TrimSpace(r.out), "5")
	eq(t, []int{f.issues[3].SubOf, f.issues[4].SubOf}, []int{n, n})
	if !contains(f.issues[n].Labels, "status:triage") || !contains(f.issues[n].Labels, "priority:P1") {
		t.Fatalf("parent labels: %v", f.issues[n].Labels)
	}
	ok := run(p, f, "body", p.docs, writeBody(parentBody), "--parent")
	eq(t, ok.code, 0, ok.err)
	refused(t, run(p, f, "body", p.docs, writeBody(parentBody)), `缺「背景」`)
}

func TestAParentsMergedPRClosesTheSubIssuesItNamesAndSendsTheParentBackToTriageForTheRest(t *testing.T) {
	p := docsWith(t, nil, nil, "")
	covered, left := open(3, "status:triage"), open(4, "status:triage")
	covered.SubOf, left.SubOf = 2, 2
	f := newFake(open(2, "status:in-review"), covered, left)
	f.prs["o/r"] = []*fPR{pr(10, "Refs o/r#2\nRefs o/r#3", "MERGED", false)}
	r := run(p, f, "reconcile", p.docs)
	eq(t, r.code, 0, r.err)
	eq(t, r.lines(), []string{
		"#3: triage → done（PR o/r#10 都已合并（父 issue #2 的 PR 写了它））",
		"#2: in-review → triage（PR o/r#10 都已合并，还有 1 个子 issue 开着）",
	})
	if f.issues[3].Open || !f.issues[4].Open || !f.issues[2].Open {
		t.Fatal("wrong issues closed")
	}
	eq(t, f.issues[2].Labels, []string{"status:triage"})
}

func TestAParentWhoseSubIssuesAllCloseWithItsPRGoesToDone(t *testing.T) {
	p := docsWith(t, nil, nil, "")
	a, b := open(3, "status:todo"), open(4, "status:triage")
	a.SubOf, b.SubOf = 2, 2
	f := newFake(open(2, "status:in-review"), a, b)
	f.prs["o/r"] = []*fPR{pr(10, "Refs o/r#2\nRefs o/r#3\nRefs o/r#4", "MERGED", false)}
	r := run(p, f, "reconcile", p.docs)
	eq(t, r.code, 0, r.err)
	eq(t, len(r.lines()), 3)
	if f.issues[2].Open || f.issues[3].Open || f.issues[4].Open {
		t.Fatal("the whole group should be closed")
	}
}

func TestSetDoneOnAParentWithOpenSubIssuesIsRefusedAndASubIssueClosesFromTriage(t *testing.T) {
	p := docsWith(t, nil, nil, "")
	covered, left := open(3, "status:triage"), open(4, "status:triage")
	covered.SubOf, left.SubOf = 2, 2
	f := newFake(open(2, "status:in-review"), covered, left)
	f.prs["o/r"] = []*fPR{pr(10, "Refs o/r#2\nRefs o/r#3", "MERGED", false)}
	refused(t, run(p, f, "set", p.docs, "done", "2"), `还有 2 个子 issue 开着`)
	eq(t, run(p, f, "set", p.docs, "done", "3").code, 0)
	refused(t, run(p, f, "set", p.docs, "triage", "2"), `父 issue 翻回 triage 要带 --comment`)
	eq(t, run(p, f, "set", p.docs, "triage", "2", "--comment=#3 已随 o/r#10 关，剩 #4").code, 0)
	eq(t, f.issues[2].Labels, []string{"status:triage"})
	refused(t, run(p, f, "set", p.docs, "done", "4"), `没有 PR 挂在这个 issue 上`)
}

func TestAnIssueWithoutSubIssuesStillCannotGoFromInReviewBackToTriage(t *testing.T) {
	p := docsWith(t, nil, nil, "")
	f := newFake(open(2, "status:in-review"))
	refused(t, run(p, f, "set", p.docs, "triage", "2", "--comment=x"), `不能翻成「triage」`)
}
