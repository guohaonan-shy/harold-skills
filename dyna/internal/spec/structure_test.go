package spec

import (
	"strings"
	"testing"
)

func TestASpecWithTheSevenSectionsInOrderHasNoStructureProblem(t *testing.T) {
	if got := StructureProblems(doc(opts{})); len(got) != 0 {
		t.Fatalf("%v", got)
	}
	// a front-end sub-section and a 待定 sub-section are not sections of the seven
	if got := StructureProblems(doc(opts{UI: uiBlock, Fork: true, Freeze: true})); len(got) != 0 {
		t.Fatalf("%v", got)
	}
}

func TestSwappingPlanAndUserStoriesIsAnOrderProblemThatSaysWhatToDo(t *testing.T) {
	md := doc(opts{})
	md = replaceOnce(md, "## 方案", "## @@")
	md = replaceOnce(md, "## User Stories", "## 方案")
	md = replaceOnce(md, "## @@", "## User Stories")
	got := StructureProblems(md)
	if len(got) != 1 || !strings.Contains(got[0], "顺序错") || !strings.Contains(got[0], "照 idea-loop:to-spec 的模板补") {
		t.Fatalf("%v", got)
	}
	if !strings.Contains(got[0], "现在是 「问题陈述」「User Stories」「方案」") {
		t.Fatalf("it says what the order is now: %v", got)
	}
}

func TestAMissingSectionIsNamed(t *testing.T) {
	md := replaceOnce(doc(opts{}), "## Out of scope", "### Out of scope")
	md = replaceOnce(md, "## 关联", "## 相关")
	got := StructureProblems(md)
	if len(got) != 1 || !strings.Contains(got[0], "缺 「Out of scope」「关联」 节") || !strings.Contains(got[0], "照 idea-loop:to-spec 的模板补") {
		t.Fatalf("%v", got)
	}
}

func TestAHeadingInsideACodeFenceIsNotASection(t *testing.T) {
	md := replaceOnce(doc(opts{}), "## 关联\n\n- 无。\n", "```\n## 关联\n```\n")
	got := StructureProblems(md)
	if len(got) != 1 || !strings.Contains(got[0], "缺 「关联」 节") {
		t.Fatalf("%v", got)
	}
}

func TestADiagnosisSectionMayStandAnywhereBetweenTheSevenAtLevelTwoOrThree(t *testing.T) {
	if got := StructureProblems(doc(opts{ChangesAgentDocs: true, Diagnosis: true})); len(got) != 0 {
		t.Fatalf("### under 方案: %v", got)
	}
	md := replaceOnce(doc(opts{ChangesAgentDocs: true}), "## 测试决策", "## 杠杆诊断\n\n改一处。\n\n## 测试决策")
	if got := StructureProblems(md); len(got) != 0 {
		t.Fatalf("## between 实现决策 and 测试决策: %v", got)
	}
}

func TestChangesAgentDocsWithoutADiagnosisSectionIsAProblem(t *testing.T) {
	got := StructureProblems(doc(opts{ChangesAgentDocs: true}))
	if len(got) != 1 || !strings.Contains(got[0], "杠杆诊断") || !strings.Contains(got[0], "changes_agent_docs") || !strings.Contains(got[0], "照 idea-loop:to-spec 的模板补") {
		t.Fatalf("%v", got)
	}
	if got := StructureProblems(doc(opts{})); len(got) != 0 {
		t.Fatalf("no marker, no diagnosis section: %v", got)
	}
}

func TestACheckOfTheWholeDocsReportsTheStructureProblemsOfEachSpec(t *testing.T) {
	r := Check(project(t, doc(opts{ChangesAgentDocs: true})))
	if len(r.Problems) != 1 || !strings.HasPrefix(r.Problems[0], "docs/spec/practice-retry/practice-retry.md ") || !strings.Contains(r.Problems[0], "杠杆诊断") {
		t.Fatalf("%v", r.Problems)
	}
	if got := Check(project(t, doc(opts{ChangesAgentDocs: true, Diagnosis: true}))).Problems; len(got) != 0 {
		t.Fatalf("%v", got)
	}
}

func TestIsSpecFileIsASpecFileAndNothingElse(t *testing.T) {
	for path, want := range map[string]bool{
		"/p/docs/spec/a-b/a-b.md":         true,
		"docs/spec/a/a.md":                true,
		"/p/docs/spec/a/tickets/01-x.md":  false,
		"/p/docs/spec/a/notes.md":         false,
		"/p/docs/spec/index.md":           false,
		"/p/docs/raw/discussions/a/a.md":  false,
		"/p/docs/spec/tickets/tickets.md": false,
		"/p/docs/specs/a/a.md":            false,
		"/p/idea-loop/skills/x/SKILL.md":  false,
		"a.md":                            false,
	} {
		if got := IsSpecFile(path); got != want {
			t.Errorf("%s: %v", path, got)
		}
	}
}
