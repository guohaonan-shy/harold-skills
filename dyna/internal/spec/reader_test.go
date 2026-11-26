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

func TestForHumanListsWhatWaitsForAHuman(t *testing.T) {
	if got := ForHuman(doc(opts{})); len(got) != 0 {
		t.Fatal(got)
	}
	if got := ForHuman(doc(opts{Grill: true, Fork: true})); len(got) != 2 {
		t.Fatal(got)
	}
}
