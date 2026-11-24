package ledger

import (
	"reflect"
	"strings"
	"testing"
)

// 「验证」 lines: CheckVerify.

// Commit b6e55944's files (it changed the rule on what a drafted spec hands to the person), and the hand-back shape
// every executor returned before the verify line existed: the standards line, one lever row per file, and a third
// acceptance cell answered 「不涉及：只改措辞」 with no verify line.
var filesB6e55944 = []string{
	"docs/spec/edge-case-known-limit/tickets/02-delete-decision-rules.md",
	"idea-loop/scripts/decision-evidence-principles-doc.test.mjs",
	"idea-loop/skills/engineering/issue-session/references/draft-spec.md",
	"idea-loop/skills/engineering/to-spec/SKILL.md",
}

const handbackB6e55944 = "verified:\n" +
	"  - 读了哪几份写法规范 | 调 | writing-for-agents\n" +
	"  - 杠杆 | idea-loop/skills/engineering/issue-session/references/draft-spec.md | 就近归置\n" +
	"  - 杠杆 | idea-loop/skills/engineering/to-spec/SKILL.md | 就近归置\n" +
	"  - 不涉及 | 只改措辞 | 行为没变\n"

const (
	draftSpec = "idea-loop/skills/engineering/issue-session/references/draft-spec.md"
	toSpec    = "idea-loop/skills/engineering/to-spec/SKILL.md"
)

var caseTree = []string{
	"idea-loop/evals/retro/cases/to-spec-diagnose-agent-docs/case.json",
	"idea-loop/evals/retro/cases/to-spec-verify-line/case.json",
	"idea-loop/skills/engineering/to-spec/SKILL.md",
}

func TestCheckVerifyAHandBackWithOnlyLeverRowsGetsOneNoVerifyRowReasonPerChangedFile(t *testing.T) {
	// the lever and standards judgement is untouched: that part still passes
	if got := CheckSkillEdit(filesB6e55944, handbackB6e55944); len(got) != 0 {
		t.Fatal(got)
	}
	reasons := CheckVerify(filesB6e55944, handbackB6e55944, nil)
	if len(reasons) != 2 {
		t.Fatal(reasons)
	}
	for i, file := range []string{draftSpec, toSpec} {
		if !strings.Contains(reasons[i], file+" 没有验证行") || !strings.Contains(reasons[i], "验证 | "+file+" | <方式>") {
			t.Fatal(reasons[i])
		}
	}
}

func TestCheckVerifyARowPerChangedFileInAnyOfTheFiveWaysPasses(t *testing.T) {
	hb := "验证 | " + draftSpec + " | 不改行为 | 只改措辞 | 行为没变\n" +
		"- 验证 | `" + toSpec + "` | 目标用例 | to-spec-verify-line | 过\n"
	if got := CheckVerify(filesB6e55944, hb, caseTree); len(got) != 0 {
		t.Fatal(got)
	}
	for _, method := range []string{"检查", "判不了", "不改行为"} {
		if got := CheckVerify([]string{toSpec}, "验证 | "+toSpec+" | "+method+" | 原因或检查名 | 见单测", nil); len(got) != 0 {
			t.Errorf("%s: %v", method, got)
		}
	}
	for _, method := range []string{"回放", "目标用例"} {
		for _, result := range []string{"过", "大用例待跑"} {
			if got := CheckVerify([]string{toSpec}, "验证 | "+toSpec+" | "+method+" | to-spec-verify-line | "+result, caseTree); len(got) != 0 {
				t.Errorf("%s %s: %v", method, result, got)
			}
		}
	}
}

func TestCheckVerifyAMethodOutsideTheFiveIsOneReason(t *testing.T) {
	got := CheckVerify([]string{toSpec}, "验证 | "+toSpec+" | 手动看了 | 看着对 | 过", caseTree)
	if len(got) != 1 || !strings.Contains(got[0], "手动看了") || !strings.Contains(got[0], "不在五种里") {
		t.Fatal(got)
	}
}

func TestCheckVerifyAReplayOrGoalCaseWhoseDirectoryTheCommitDoesNotHoldIsOneReasonNamingIt(t *testing.T) {
	for _, method := range []string{"回放", "目标用例"} {
		got := CheckVerify([]string{toSpec}, "验证 | "+toSpec+" | "+method+" | no-such-case | 过", caseTree)
		if len(got) != 1 || !strings.Contains(got[0], "no-such-case") || !strings.Contains(got[0], "仓库树里没有") {
			t.Errorf("%s: %v", method, got)
		}
	}
	// a name that is only the tail of another case's name is not that case
	if got := CheckVerify([]string{toSpec}, "验证 | "+toSpec+" | 回放 | verify-line | 过", caseTree); len(got) != 1 {
		t.Fatal(got)
	}
	// several cases: each one needs its directory
	got := CheckVerify([]string{toSpec}, "验证 | "+toSpec+" | 回放 | to-spec-verify-line、gone | 过", caseTree)
	if len(got) != 1 || !strings.Contains(got[0], "gone") {
		t.Fatal(got)
	}
}

func TestCheckVerifyAReplayOrGoalCaseResultThatIsNotPassedOrLargeToRunIsOneReason(t *testing.T) {
	for _, result := range []string{"", "不过", "没跑", "过了"} {
		got := CheckVerify([]string{toSpec}, "验证 | "+toSpec+" | 目标用例 | to-spec-verify-line | "+result, caseTree)
		if len(got) != 1 || !strings.Contains(got[0], "「过」") || !strings.Contains(got[0], "大用例待跑") {
			t.Errorf("%q: %v", result, got)
		}
	}
	// a replay row with no fifth column at all
	if got := CheckVerify([]string{toSpec}, "验证 | "+toSpec+" | 回放 | to-spec-verify-line", caseTree); len(got) != 1 {
		t.Fatal(got)
	}
	// the other ways need no result of 过
	if got := CheckVerify([]string{toSpec}, "验证 | "+toSpec+" | 判不了 | 卡在没有历史原话 | 无", nil); len(got) != 0 {
		t.Fatal(got)
	}
}

func TestCheckVerifyAnEmptyFourthColumnIsOneReason(t *testing.T) {
	got := CheckVerify([]string{toSpec}, "验证 | "+toSpec+" | 检查 |   | 过", nil)
	if len(got) != 1 || !strings.Contains(got[0], "第四栏") {
		t.Fatal(got)
	}
}

func TestCheckVerifyAFileMayHaveSeveralRowsAndEachIsJudged(t *testing.T) {
	hb := "验证 | " + toSpec + " | 检查 | a-check | 过\n验证 | " + toSpec + " | 回放 | gone | 过"
	got := CheckVerify([]string{toSpec}, hb, caseTree)
	if len(got) != 1 || !strings.Contains(got[0], "gone") {
		t.Fatal(got)
	}
}

func TestCheckVerifyNamesTheFileByItsPathOrByAPathEndingAtADirectoryBoundary(t *testing.T) {
	if got := CheckVerify([]string{toSpec}, "验证 | skills/engineering/to-spec/SKILL.md | 不改行为 | 措辞 | 过", nil); len(got) != 0 {
		t.Fatal(got)
	}
	if got := CheckVerify([]string{toSpec}, "验证 | xskills/engineering/to-spec/SKILL.md | 不改行为 | 措辞 | 过", nil); len(got) != 1 {
		t.Fatal(got)
	}
}

func TestCheckVerifyHasNothingToCoverWhenNoSkillLikeFileChanged(t *testing.T) {
	if got := CheckVerify([]string{"idea-loop/scripts/x.mjs", "docs/spec/x/tickets/01-a.md"}, "", nil); len(got) != 0 {
		t.Fatal(got)
	}
}

func TestParseHandbackReadsVerifyRowsAndTheOtherVerifiedLinesAreNotOnes(t *testing.T) {
	h := ParseHandback("verified:\n  - 验证 | `a/SKILL.md` | 回放 | c1 | 过\n  - 验证了什么行为 | 单元 | 过\n  - 验证 | b.md | 检查 | n\n")
	want := []Verify{{"a/SKILL.md", "回放", "c1", "过"}, {"b.md", "检查", "n", ""}}
	if !reflect.DeepEqual(h.Verifies, want) {
		t.Fatalf("%+v", h.Verifies)
	}
}
