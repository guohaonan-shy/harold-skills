package issues_test

import (
	"encoding/json"
	"testing"
)

// ---------- kind ----------

func TestKindReplacesTheKindLabelAndKeepsEverythingElse(t *testing.T) {
	p := docsWith(t, nil, nil, "")
	f := newFake(open(7, "status:todo", "kind:bug", "priority:P1", "type:seo"), open(8, "status:todo"), open(9, "kind:bug", "kind:feature"))
	r := run(p, f, "kind", p.docs, "7", "improvement")
	eq(t, r.code, 0, r.err)
	eq(t, r.lines(), []string{"#7: kind:improvement"})
	eq(t, sorted(f.issues[7].Labels), []string{"kind:improvement", "priority:P1", "status:todo", "type:seo"})
	// an issue with no kind gets one; an issue that already carries two ends with one
	run(p, f, "kind", p.docs, "8", "bug")
	eq(t, f.issues[8].Labels, []string{"status:todo", "kind:bug"})
	run(p, f, "kind", p.docs, "9", "feature")
	eq(t, f.issues[9].Labels, []string{"kind:feature"})
}

func TestKindAlreadyThatKindChangesNothing(t *testing.T) {
	p := docsWith(t, nil, nil, "")
	f := newFake(open(7, "status:todo", "kind:improvement"))
	before := len(f.calls)
	r := run(p, f, "kind", p.docs, "7", "improvement")
	eq(t, r.code, 0, r.err)
	eq(t, r.lines(), []string{"#7: kind:improvement"})
	eq(t, len(f.calls), before, "no edit call")
}

func TestKindRefusesAValueOutsideTheThreeBeforeAnyWrite(t *testing.T) {
	p := docsWith(t, nil, nil, "")
	f := newFake(open(7, "kind:bug"))
	refused(t, run(p, f, "kind", p.docs, "7", "chore"), `bug / feature / improvement`)
	refused(t, run(p, f, "kind", p.docs, "7"), `usage`)
	eq(t, len(f.calls), 0)
	eq(t, f.issues[7].Labels, []string{"kind:bug"})
}

func TestKindOnAProjectWithoutTheLabelPointsAtLabelsAndKeepsTheOldKind(t *testing.T) {
	p := docsWith(t, nil, nil, "")
	f := newFake(open(7, "kind:bug"))
	f.labels = []string{"kind:bug"} // the repository has no kind:improvement
	f.strict = true
	r := run(p, f, "kind", p.docs, "7", "improvement")
	refused(t, r, `kind:improvement`)
	mustMatch(t, `dyna issues labels`, r.err)
	eq(t, f.issues[7].Labels, []string{"kind:bug"}, "the add failed first, so the old kind is still there")
}

// ---------- list ----------

type listRow struct {
	Number    int      `json:"number"`
	Title     string   `json:"title"`
	Assignees []string `json:"assignees"`
}

func listOf(t *testing.T, f *fake, args ...string) []listRow {
	t.Helper()
	p := docsWith(t, nil, nil, "")
	r := run(p, f, append([]string{"list", p.docs}, args...)...)
	if r.code != 0 {
		t.Fatalf("exit %d: %s", r.code, r.err)
	}
	var rows []listRow
	must(t, json.Unmarshal([]byte(r.out), &rows))
	return rows
}

func TestListGivesEveryOpenIssueInTheStateWhoeverHasItAndWhateverBlocksIt(t *testing.T) {
	i1 := open(1, "status:in-progress")
	i1.Assignees = []string{"someone-else"}
	i2 := open(2, "status:in-review")
	i3 := open(3, "status:in-progress")
	i3.BlockedBy = []int{4}
	i4 := open(4, "status:todo")
	f := newFake(i3, i1, i2, i4, closed(5), open(6))
	rows := listOf(t, f, "--state", "in-progress")
	eq(t, rows, []listRow{{1, "issue 1", []string{"someone-else"}}, {3, "issue 3", []string{}}})
	eq(t, listOf(t, f, "--state=in-review"), []listRow{{2, "issue 2", []string{}}})
	eq(t, listOf(t, f, "--state", "triage"), []listRow{})
}

func TestListRefusesBacklogAndPointsAtIssuesBacklog(t *testing.T) {
	p := docsWith(t, nil, nil, "")
	f := newFake(open(1))
	r := run(p, f, "list", p.docs, "--state", "backlog")
	refused(t, r, `backlog`)
	mustMatch(t, `dyna issues backlog`, r.err)
	refused(t, run(p, f, "list", p.docs, "--state", "done"), `triage / todo / in-progress / in-review`)
	refused(t, run(p, f, "list", p.docs), `--state`)
}

func TestListRowsAreInNumberOrderEvenWhenTheListComesBackShuffled(t *testing.T) {
	f := newFake(open(30, "status:todo"), open(2, "status:todo"), open(11, "status:todo"))
	var got []int
	for _, r := range listOf(t, f, "--state", "todo") {
		got = append(got, r.Number)
	}
	eq(t, got, []int{2, 11, 30})
}
