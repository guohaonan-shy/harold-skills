package ledger

import (
	"reflect"
	"strings"
	"testing"
)

// These are the old ticket-ledger.test.mjs's assertions, in the same order.

func TestTicketOfFindsTheLineInTheSameParagraphAsTheAttribution(t *testing.T) {
	msg := "feat: a thing\n\nbody\n\nTicket: 01-pr-review-rule-dispositions\nCo-Authored-By: Claude <noreply@anthropic.com>\n"
	if got, ok := TicketOf(msg); !ok || got != "01-pr-review-rule-dispositions" {
		t.Fatal(got, ok)
	}
}

func TestTicketOfFindsTheLineWhenTheAttributionIsItsOwnParagraphAfterIt(t *testing.T) {
	msg := "fix: a thing\n\nbody\n\nTicket: 03-implement-pause-rules\n\nCo-Authored-By: Claude <noreply@anthropic.com>\n"
	if got, ok := TicketOf(msg); !ok || got != "03-implement-pause-rules" {
		t.Fatal(got, ok)
	}
}

func TestTicketOfIsNothingForNoLineAWipCommitOrTheWordInsideProse(t *testing.T) {
	for _, msg := range []string{
		"wip(02): stopped at the API test\n",
		"docs: mention the Ticket: 01-x line in prose\n",
		"docs(tickets): 01 — review 第 1 轮 S2\n",
		"",
	} {
		if got, ok := TicketOf(msg); ok {
			t.Errorf("%q named %q", msg, got)
		}
	}
}

func TestTicketOfReadsALineEndingInCarriageReturnToo(t *testing.T) {
	if got, ok := TicketOf("feat: x\r\n\r\nTicket: 04-crlf\r\n"); !ok || got != "04-crlf" {
		t.Fatal(got, ok)
	}
}

func TestParseLogKeepsTheCommitsThatNameATicketInOrderWithTheirSha(t *testing.T) {
	raw := strings.Join([]string{
		"aaa111\x1ffeat: one\n\nTicket: 01-alpha\nCo-Authored-By: X\n\x1e",
		"\nbbb222\x1fdocs(tickets): 01 — review\n\nCo-Authored-By: X\n\x1e",
		"\nccc333\x1ffix: two\n\nTicket: 02-beta\n\nCo-Authored-By: X\n\x1e",
	}, "")
	want := []Landed{{SHA: "aaa111", Ticket: "01-alpha"}, {SHA: "ccc333", Ticket: "02-beta"}}
	if got := ParseLog(raw); !reflect.DeepEqual(got, want) {
		t.Fatal(got)
	}
}

func TestParseLogOfAnEmptyLogIsAnEmptyList(t *testing.T) {
	if got := ParseLog(""); len(got) != 0 {
		t.Fatal(got)
	}
}

// ---- skill-edit: a ticket that changes skills, agent definitions or skill references must hand back
// ---- a `调 writing-for-agents` line and one 杠杆 line per changed file.

// The files commit 2be5d8e changed (a ticket that rewrote pr-review's SKILL.md).
var files2be5d8e = []string{
	"docs/spec/test-layering-ci-full/tickets/01-test-layering-ci-full.md",
	"idea-loop/scripts/pr-review-slim-doc.test.mjs",
	"idea-loop/skills/engineering/pr-review/SKILL.md",
}

// The hand-back around the one line quoted from that executor's real return.
const handback2be5d8e = `status: landed
ticket: 01-test-layering-ci-full
verified:
  - 字数测试改成棘轮 | 单元 | 绿
  - 跑了哪些测试 | 单元 | idea-loop/scripts/pr-review-slim-doc.test.mjs，全量交给 CI
  - 读了哪几份写法规范 | 读 | 工单里 writing-for-agents 的规则原文（已在工单 C1 一格引用）
found:
  - 无`

var handbackFixed = strings.Replace(handback2be5d8e,
	"  - 读了哪几份写法规范 | 读 | 工单里 writing-for-agents 的规则原文（已在工单 C1 一格引用）",
	"  - 读了哪几份写法规范 | 调 | writing-for-agents\n  - 杠杆 | idea-loop/skills/engineering/pr-review/SKILL.md | 剪枝：恢复被字数压掉的范围外原句，不为守上限删句", 1)

func TestIsSkillEditFileCountsSkillMdAnyMdUnderSkillsAndAMdDirectlyUnderAgents(t *testing.T) {
	for _, p := range []string{
		"idea-loop/skills/engineering/pr-review/SKILL.md",
		"SKILL.md",
		"idea-loop/skills/engineering/implement/references/stop-and-resume.md",
		"skills/foo/references/deep/cases.md",
		"idea-loop/agents/implementer.md",
		".claude/agents/reviewer.md",
	} {
		if !IsSkillEditFile(p) {
			t.Errorf("%s should count", p)
		}
	}
}

func TestIsSkillEditFileLeavesOutTicketFilesScriptsAgentsMdNestedAgentsFilesAndNonMd(t *testing.T) {
	for _, p := range []string{
		"docs/spec/test-layering-ci-full/tickets/01-test-layering-ci-full.md",
		"docs/spec/skill-edit-acceptance/tickets/SKILL.md",
		"idea-loop/scripts/ticket-ledger.mjs",
		"idea-loop/skills/engineering/pr-review/scripts/x.mjs",
		"AGENTS.md",
		"idea-loop/AGENTS.md",
		"idea-loop/README.md",
		"idea-loop/agents/notes/implementer.md",
		"idea-loop/agents/implementer.mjs",
		"docs/skills-overview.md",
	} {
		if IsSkillEditFile(p) {
			t.Errorf("%s should not count", p)
		}
	}
}

func TestIsSkillEditFileIgnoresALeadingDotSlash(t *testing.T) {
	if !IsSkillEditFile("./idea-loop/skills/a/SKILL.md") {
		t.Fatal("a leading ./ is not part of the path")
	}
}

func TestSkillEditFilesKeepsOnlyTheFilesThatCountInOrder(t *testing.T) {
	if got := SkillEditFiles(files2be5d8e); !reflect.DeepEqual(got, []string{"idea-loop/skills/engineering/pr-review/SKILL.md"}) {
		t.Fatal(got)
	}
}

func TestParseHandbackReadsTheStandardsLineAndTheLeverLinesWithOrWithoutALeadingDash(t *testing.T) {
	got := ParseHandback(strings.Join([]string{
		"  - 读了哪几份写法规范 | 调 | writing-for-agents, CODING_STANDARDS.md",
		"杠杆 | `idea-loop/agents/implementer.md` | 上下文指针",
		"  - 杠杆 | idea-loop/skills/a/SKILL.md | 渐进披露 | 分支挪进参考",
		"  - 杠杆 | idea-loop/skills/b/SKILL.md |",
	}, "\n"))
	if got.Standards == nil || *got.Standards != (Standards{Method: "调", Names: "writing-for-agents, CODING_STANDARDS.md"}) {
		t.Fatal(got.Standards)
	}
	want := []Lever{
		{File: "idea-loop/agents/implementer.md", Lever: "上下文指针"},
		{File: "idea-loop/skills/a/SKILL.md", Lever: "渐进披露 | 分支挪进参考"},
		{File: "idea-loop/skills/b/SKILL.md", Lever: ""},
	}
	if !reflect.DeepEqual(got.Levers, want) {
		t.Fatal(got.Levers)
	}
	none := ParseHandback("status: landed")
	if none.Standards != nil || len(none.Levers) != 0 {
		t.Fatal(none)
	}
}

func TestCheckSkillEditReadOnlyStandardsLineAndNoLeverRowForPrReviewIsTwoReasons(t *testing.T) {
	reasons := CheckSkillEdit(files2be5d8e, handback2be5d8e)
	if len(reasons) != 2 {
		t.Fatal(reasons)
	}
	if !strings.Contains(reasons[0], "调") {
		t.Fatal(reasons[0])
	}
	if !strings.Contains(reasons[1], "idea-loop/skills/engineering/pr-review/SKILL.md") || !strings.Contains(reasons[1], "杠杆") {
		t.Fatal(reasons[1])
	}
}

func TestCheckSkillEditPassesWhenTheHandBackSaysCalledWritingForAgentsAndCarriesTheLeverRow(t *testing.T) {
	if got := CheckSkillEdit(files2be5d8e, handbackFixed); len(got) != 0 {
		t.Fatal(got)
	}
}

func TestCheckSkillEditPassesACommitThatOnlyTouchesAScriptAndTicketFilesWhateverTheHandBackSays(t *testing.T) {
	if got := CheckSkillEdit([]string{"idea-loop/scripts/ticket-ledger.mjs", "docs/spec/x/tickets/02-y.md"}, ""); len(got) != 0 {
		t.Fatal(got)
	}
}

func TestCheckSkillEditAnAgentDefinitionASkillReferenceAndAClaudeAgentsFileEachNeedTheirOwnLeverRow(t *testing.T) {
	files := []string{"idea-loop/agents/implementer.md", "idea-loop/skills/engineering/implement/references/x.md", ".claude/agents/r.md"}
	handback := "读了哪几份写法规范 | 调 | writing-for-agents\n杠杆 | idea-loop/agents/implementer.md | 上下文指针"
	reasons := CheckSkillEdit(files, handback)
	if len(reasons) != 2 {
		t.Fatal(reasons)
	}
	all := strings.Join(reasons, "\n")
	if !strings.Contains(all, "implement/references/x.md") || !strings.Contains(all, ".claude/agents/r.md") {
		t.Fatal(all)
	}
}

func TestCheckSkillEditALeverRowWithAnEmptyThirdColumnCountsAsNoRow(t *testing.T) {
	reasons := CheckSkillEdit([]string{"idea-loop/skills/a/SKILL.md"},
		"读了哪几份写法规范 | 调 | writing-for-agents\n杠杆 | idea-loop/skills/a/SKILL.md |   ")
	if len(reasons) != 1 || !strings.Contains(reasons[0], "idea-loop/skills/a/SKILL.md") {
		t.Fatal(reasons)
	}
}

func TestCheckSkillEditTheStandardsLineMissingOrWithoutCalledOrWithoutWritingForAgentsEachFail(t *testing.T) {
	files := []string{"idea-loop/skills/a/SKILL.md"}
	lever := "杠杆 | idea-loop/skills/a/SKILL.md | 剪枝"
	if got := strings.Join(CheckSkillEdit(files, lever), "\n"); !strings.Contains(got, "读了哪几份写法规范") {
		t.Fatal(got)
	}
	if got := strings.Join(CheckSkillEdit(files, "读了哪几份写法规范 | 读 | writing-for-agents\n"+lever), "\n"); !strings.Contains(got, "调") {
		t.Fatal(got)
	}
	if got := strings.Join(CheckSkillEdit(files, "读了哪几份写法规范 | 调 | CODING_STANDARDS.md\n"+lever), "\n"); !strings.Contains(got, "writing-for-agents") {
		t.Fatal(got)
	}
	if got := CheckSkillEdit(files, "读了哪几份写法规范 | 调 | writing-for-agents\n"+lever); len(got) != 0 {
		t.Fatal(got)
	}
}

func TestCheckSkillEditALeverRowNamesTheFileByItsPathOrByAPathEndingAtADirectoryBoundary(t *testing.T) {
	files := []string{"idea-loop/skills/a/SKILL.md"}
	std := "读了哪几份写法规范 | 调 | writing-for-agents"
	if got := CheckSkillEdit(files, std+"\n杠杆 | skills/a/SKILL.md | 剪枝"); len(got) != 0 {
		t.Fatal(got)
	}
	if got := CheckSkillEdit(files, std+"\n杠杆 | b/SKILL.md | 剪枝"); len(got) != 1 {
		t.Fatal(got)
	}
	if got := CheckSkillEdit(files, std+"\n杠杆 | xskills/a/SKILL.md | 剪枝"); len(got) != 1 {
		t.Fatal(got)
	}
}

// ---- the template's own words 「读 / 调」 left in the method column do not count as having called it.

// Commit 4417076's files, and the standards line its executor handed back with the template's 「读 / 调」 untouched.
var files4417076 = []string{
	"docs/spec/skill-edit-acceptance/tickets/01-implement-slim.md",
	"idea-loop/scripts/implement-slim-doc.test.mjs",
	"idea-loop/scripts/test-layering-ci-doc.test.mjs",
	"idea-loop/skills/engineering/implement/SKILL.md",
}

const handback4417076 = "verified:\n  - 读了哪几份写法规范 | 读 / 调 | idea-loop:evidence（skill）、DEVELOPMENT.md、review 第 2 轮汇报里 writing-for-agents「单一事实来源」那条（引文取自汇报）"

func TestCheckSkillEditTheTemplateReadOrCallCopiedAsTheMethodIsReportedNextToTheMissingLeverRow(t *testing.T) {
	reasons := CheckSkillEdit(files4417076, handback4417076)
	if len(reasons) != 2 {
		t.Fatal(reasons)
	}
	if !strings.Contains(reasons[0], "读 / 调") {
		t.Fatal(reasons[0])
	}
	if !strings.Contains(reasons[1], "idea-loop/skills/engineering/implement/SKILL.md") {
		t.Fatal(reasons[1])
	}
}

func TestCheckSkillEditMethodCalledAloneOrBesideOtherWaysPassesTheTemplateStringInAnySpacingDoesNot(t *testing.T) {
	files := []string{"idea-loop/skills/a/SKILL.md"}
	lever := "杠杆 | idea-loop/skills/a/SKILL.md | 剪枝"
	for _, method := range []string{"调", "调、读", "读、调", "读 + 调", "调 / 读 引文"} {
		if got := CheckSkillEdit(files, "读了哪几份写法规范 | "+method+" | writing-for-agents\n"+lever); len(got) != 0 {
			t.Errorf("%q: %v", method, got)
		}
	}
	for _, method := range []string{"读 / 调", "读/调", " 读  /  调 ", "读 ／ 调"} {
		if got := CheckSkillEdit(files, "读了哪几份写法规范 | "+method+" | writing-for-agents\n"+lever); len(got) != 1 {
			t.Errorf("%q: %v", method, got)
		}
	}
}
