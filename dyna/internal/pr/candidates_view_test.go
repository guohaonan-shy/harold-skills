package pr

import (
	"strings"
	"testing"
)

func TestAQuestionNeedsAViewARuledFindingAsksNothingSoNeedsNone(t *testing.T) {
	noView := with(C1, obj{"example": nil})
	if p := ShapeProblems(cand(noView), "standards"); !strings.Contains(strings.Join(p, "\n"), NoViewProblem) {
		t.Fatalf("a 要你决定 item with nothing to look at is sent back: %v", p)
	}
	for name, over := range map[string]obj{
		"a table in now":     {"now": "现状：\n\n| 谁 | 结果 |\n|---|---|\n| 接口 | 直接查库 |"},
		"an image in impact": {"impact": "![漏掉的一处](https://example.com/a.png)"},
		"a figure":           {"figure": "r1-x.png"},
	} {
		if p := ShapeProblems(cand(merge(noView, over)), "standards"); strings.Contains(strings.Join(p, "\n"), NoViewProblem) {
			t.Errorf("%s is a view: %v", name, p)
		}
	}
	ruled := obj{
		"disposition": "照规则", "action": "修", "decide": nil,
		"basis": obj{"kind": "规则原文", "file": "docs/reference/wording.md", "text": "按钮名称统一用两个字的动词", "summary": "界面文案规则写明按钮用两个字的动词"},
	}
	if p := ShapeProblems(cand(merge(noView, ruled)), "standards"); strings.Contains(strings.Join(p, "\n"), NoViewProblem) {
		t.Fatalf("a ruled finding asks no question: %v", p)
	}
}
