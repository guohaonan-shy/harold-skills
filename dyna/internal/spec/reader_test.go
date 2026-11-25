package spec

import (
	"reflect"
	"testing"
)

// These are the old spec.test.mjs's assertions about reading one spec, in the same order.

func TestFrontmatterReadsSummaryAndIssuesIgnoringATrailingComment(t *testing.T) {
	if got := Frontmatter(doc(opts{}))["summary"]; got != "重试不消耗配额" {
		t.Fatal(got)
	}
	if got := Frontmatter("---\nsummary: 重试   # 起草 routine\n---\n")["summary"]; got != "重试" {
		t.Fatal(got)
	}
	cases := []struct {
		issues string
		want   []IssueRef
	}{
		{"[12, 15]", []IssueRef{{Num: 12}, {Num: 15}}},
		{"[FA-577, 12]", []IssueRef{{Key: "FA-577"}, {Num: 12}}},
		{"[FA-577]", []IssueRef{{Key: "FA-577"}}},
		{"", nil},
	}
	for _, c := range cases {
		if got := IssuesOf(doc(opts{Issues: c.issues})); !reflect.DeepEqual(got, c.want) {
			t.Errorf("issues %q: %v", c.issues, got)
		}
	}
}

func TestTouchesUIAFrontEndSubSectionUnderPlanMeansUINoSuchSubSectionMeansNone(t *testing.T) {
	if TouchesUI(doc(opts{})) {
		t.Fatal("no sub-section")
	}
	if !TouchesUI(doc(opts{UI: uiBlock})) {
		t.Fatal("sub-section")
	}
}

func TestTouchesUIStillReadsAnOlderSpec(t *testing.T) {
	if TouchesUI(doc(opts{Legacy: true})) {
		t.Fatal("不涉及 under 技术方案总览 means no UI")
	}
	if !TouchesUI(doc(opts{Legacy: true, UI: uiBlock})) {
		t.Fatal("older spec with UI")
	}
}

func TestVerdictsReadTheQuotedLinesUnderTheTitleAndAllAbsentNeedsEveryListedIssueMarkedNotExisting(t *testing.T) {
	md := doc(opts{Issues: "[1, 2]", Verdict: map[string]string{"1": "存在", "2": "不存在"}})
	want := []Verdict{{IssueRef{Num: 1}, "存在"}, {IssueRef{Num: 2}, "不存在"}}
	if got := Verdicts(md); !reflect.DeepEqual(got, want) {
		t.Fatal(got)
	}
	if AllAbsent(md) {
		t.Fatal("one exists")
	}
	if !AllAbsent(doc(opts{Issues: "[1, 2]", Verdict: map[string]string{"1": "不存在", "2": "不存在"}})) {
		t.Fatal("both absent")
	}
	if AllAbsent(doc(opts{})) {
		t.Fatal("no issues listed is not all absent")
	}
}

func TestVerdictsReadALinearKeyAsAKeyMatchingWhatIssuesOfReturns(t *testing.T) {
	md := doc(opts{Issues: "[FA-577, 12]", Verdict: map[string]string{"FA-577": "存在", "12": "不存在"}})
	v := verdictMap(Verdicts(md))
	if v[IssueRef{Key: "FA-577"}] != "存在" || v[IssueRef{Num: 12}] != "不存在" {
		t.Fatal(v)
	}
	if AllAbsent(md) {
		t.Fatal("FA-577 exists")
	}
	if !AllAbsent(doc(opts{Issues: "[ENG-9, 12]", Verdict: map[string]string{"ENG-9": "不存在", "12": "不存在"}})) {
		t.Fatal("both absent")
	}
	if AllAbsent(doc(opts{Issues: "[ENG-9]", Verdict: map[string]string{"ENG-8": "不存在"}})) {
		t.Fatal("a verdict for another issue says nothing about ENG-9")
	}
}

func TestVerdictsStillReadTheOlderVerificationTable(t *testing.T) {
	md := doc(opts{Legacy: true, Issues: "[1, 2]", Verdict: map[string]string{"1": "存在", "2": "不存在"}})
	want := []Verdict{{IssueRef{Num: 1}, "存在"}, {IssueRef{Num: 2}, "不存在"}}
	if got := Verdicts(md); !reflect.DeepEqual(got, want) {
		t.Fatal(got)
	}
	if !AllAbsent(doc(opts{Legacy: true, Issues: "[1, 2]", Verdict: map[string]string{"1": "不存在", "2": "不存在"}})) {
		t.Fatal("both absent")
	}
}

func TestAQuotedLineCountsOnlyUpToTheFirstSectionTheGrillLineAndProseAreNotVerdicts(t *testing.T) {
	md := doc(opts{Issues: "[1]", Verdict: map[string]string{"1": "存在"}, Grill: true})
	md = replaceOnce(md, "## 方案", "## 方案\n\n> #1 不存在：这是方案里的引用，不算结论")
	if got := Verdicts(md); !reflect.DeepEqual(got, []Verdict{{IssueRef{Num: 1}, "存在"}}) {
		t.Fatal(got)
	}
	// an ASCII colon works too, and an issue with no verdict stays unknown
	two := replaceOnce(doc(opts{Issues: "[1, 2]"}), "# 重试不消耗配额", "# 重试不消耗配额\n\n> #1 不存在: 试过了")
	if got := Verdicts(two); !reflect.DeepEqual(got, []Verdict{{IssueRef{Num: 1}, "不存在"}}) {
		t.Fatal(got)
	}
	if AllAbsent(two) {
		t.Fatal("#2 has no verdict")
	}
}

func TestForHumanListsWhatWaitsForAHuman(t *testing.T) {
	if got := ForHuman(doc(opts{})); len(got) != 0 {
		t.Fatal(got)
	}
	if got := ForHuman(doc(opts{Grill: true, Fork: true})); len(got) != 2 {
		t.Fatal(got)
	}
}
