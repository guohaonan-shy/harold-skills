package spec

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

const base = "---\ntype: spec\nsummary: 重试不消耗配额\nissues: [12, FA-577]\n---\n\n# 重试\n\n## 方案\n\nx\n\n### 前端交互\n- 点重试\n\n## 实现决策\n\n无分歧。\n"

func TestIssuesOfReadsNumbersAndLinearKeys(t *testing.T) {
	got := IssuesOf(base)
	if !reflect.DeepEqual(got, []IssueRef{{Num: 12}, {Key: "FA-577"}}) {
		t.Fatal(got)
	}
	if len(IssuesOf("---\ntype: spec\n---\n")) != 0 {
		t.Fatal("no issues line")
	}
	if (IssueRef{Num: 5}).Label() != "#5" || (IssueRef{Key: "FA-1"}).Label() != "FA-1" {
		t.Fatal("labels")
	}
}

func TestTouchesUIAndFreezeSummary(t *testing.T) {
	if !TouchesUI(base) {
		t.Fatal("touches")
	}
	if TouchesUI("# x\n\n### 前端交互\n不涉及\n\n## 实现决策\n") {
		t.Fatal("不涉及 is not UI")
	}
	if TouchesUI("# x\n\n## 方案\n") {
		t.Fatal("no section, no UI")
	}
	if HasFreezeSummary(base) || !HasFreezeSummary(base+"\n### 冻结摘要\n- 画布\n") {
		t.Fatal("freeze summary")
	}
}

func TestForHumanListsWhatWaits(t *testing.T) {
	if got := ForHuman("> 需要 grill：x\n\n## 实现决策\n\n### 待定：a\n\n### 待定：b\n"); !reflect.DeepEqual(got, []string{"开头标着「需要 grill」", "「实现决策」里还有 2 条「待定」"}) {
		t.Fatal(got)
	}
	if len(ForHuman(base)) != 0 {
		t.Fatal("nothing waits")
	}
}

func TestCoveringFindsTheSpecThatListsTheIssue(t *testing.T) {
	docs := t.TempDir()
	dir := filepath.Join(docs, "spec", "retry")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "retry.md"), []byte(base), 0o644); err != nil {
		t.Fatal(err)
	}
	if slug, _, ok := Covering(docs, IssueRef{Num: 12}); !ok || slug != "retry" {
		t.Fatal(slug, ok)
	}
	if _, _, ok := Covering(docs, IssueRef{Num: 13}); ok {
		t.Fatal("13 is not covered")
	}
	if _, _, ok := Covering(docs, IssueRef{Key: "FA-577"}); !ok {
		t.Fatal("a key is covered")
	}
}
