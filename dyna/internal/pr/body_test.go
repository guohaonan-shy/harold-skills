package pr

import (
	"regexp"
	"sort"
	"strings"
	"testing"
)

// These are the assertions of the old pr-body.test.mjs, one test each, over the same inputs.

func set(t *testing.T, body, name, content string) string {
	t.Helper()
	out, err := SetSection(body, name, content)
	if err != nil {
		t.Fatalf("%s: %v", name, err)
	}
	return out
}

func get(t *testing.T, body, name string) (string, bool) {
	t.Helper()
	s, ok, err := GetSection(body, name)
	if err != nil {
		t.Fatal(err)
	}
	return s, ok
}

func mustMatch(t *testing.T, re, s string) {
	t.Helper()
	if !regexp.MustCompile(re).MatchString(s) {
		t.Errorf("want match %q in:\n%s", re, s)
	}
}

func mustNotMatch(t *testing.T, re, s string) {
	t.Helper()
	if regexp.MustCompile(re).MatchString(s) {
		t.Errorf("want no match %q in:\n%s", re, s)
	}
}

func wantErr(t *testing.T, re string, err error) {
	t.Helper()
	if err == nil || !regexp.MustCompile(re).MatchString(err.Error()) {
		t.Errorf("want error matching %q, got %v", re, err)
	}
}

func TestSectionsComeOutInTheFixedOrderWhateverOrderTheyWereWrittenIn(t *testing.T) {
	body := ""
	for i := len(Sections) - 1; i >= 0; i-- {
		body = set(t, body, Sections[i], goodSections[Sections[i]])
	}
	var order []int
	for _, n := range Sections {
		i := strings.Index(body, "<!-- idea-loop:section "+n+" -->")
		if i < 0 {
			t.Fatalf("section %s is not written", n)
		}
		order = append(order, i)
	}
	if !sort.IntsAreSorted(order) {
		t.Fatal(order)
	}
}

func TestEachSectionWritesItsOwnHeadingAndIsRewrittenAlone(t *testing.T) {
	body := set(t, "", "problem", goodSections["problem"])
	body = set(t, body, "risk", goodSections["risk"])
	mustMatch(t, `## 问题\n\n学生重试`, body)
	mustMatch(t, `## 合并风险\n\n\*\*门\*\*：双向`, body)
	body = set(t, body, "problem", "重试失败的题多扣两次\n\n"+view)
	if s, _ := get(t, body, "problem"); !strings.HasPrefix(s, "重试失败的题多扣两次") {
		t.Fatal(s)
	}
	if s, _ := get(t, body, "risk"); !strings.Contains(s, "撤销合并即可") {
		t.Fatal(s)
	}
	if strings.Count(body, "## 问题") != 1 {
		t.Fatal(body)
	}
}

func TestTheScriptWritesEachHeadingItselfAWriterThatIncludedItIsNotDoubled(t *testing.T) {
	body := set(t, "", "your-todo", "## 要你做的事\n\n- [ ] Harold：改 Railway 根目录\n\n说「合并」即可。")
	mustMatch(t, `## 要你做的事\n\n- \[ \] Harold`, body)
	if strings.Count(body, "## 要你做的事") != 1 {
		t.Fatal(body)
	}
	if s, _ := get(t, body, "your-todo"); s != "- [ ] Harold：改 Railway 根目录\n\n说「合并」即可。" {
		t.Fatal(s)
	}
}

func TestRewritingOneSectionLeavesTheOthersUntouched(t *testing.T) {
	body := set(t, set(t, "", "outline", "L1"), "risk", goodSections["risk"])
	body = set(t, body, "risk", "**门**：单向。退不回的是包。\n**影响面**：全插件。")
	if s, _ := get(t, body, "outline"); s != "L1" {
		t.Fatal(s)
	}
	if s, _ := get(t, body, "risk"); !strings.Contains(s, "单向") {
		t.Fatal(s)
	}
	if strings.Count(body, "section risk -->") != 2 { // one open, one close
		t.Fatal(body)
	}
}

func TestLegacyReviewAndDraftSectionsAreDroppedOnTheNextWrite(t *testing.T) {
	legacy := "<!-- idea-loop:section review -->\n## Review · 第 1 轮\n<!-- /idea-loop:section review -->\n\n<!-- idea-loop:section links -->\nL\n<!-- /idea-loop:section links -->\n\n人写的说明"
	body := set(t, legacy, "outline", "S")
	mustNotMatch(t, `Review · 第 1 轮|section review|section links`, body)
	mustMatch(t, "人写的说明", body)
}

func TestTextOutsideTheMarkersSurvivesBelowTheSections(t *testing.T) {
	body := set(t, "人写的说明\n\n🤖 Generated with Claude Code", "outline", "S")
	mustMatch(t, "人写的说明", body)
	if !(strings.Index(body, "人写的说明") > strings.Index(body, "section outline")) {
		t.Fatal(body)
	}
}

func TestEmptyContentRemovesASection(t *testing.T) {
	body := set(t, set(t, "", "outline", "CI 绿"), "outline", "")
	if _, ok := get(t, body, "outline"); ok {
		t.Fatal(body)
	}
}

func TestABodyOverTheGitHubLimitIsRefusedBeforeItIsSent(t *testing.T) {
	_, err := SetSection("", "outline", strings.Repeat("x", 70000))
	wantErr(t, "limit", err)
	// the limit is in UTF-16 units: an emoji is two
	_, err = SetSection("", "outline", strings.Repeat("😀", 33000))
	wantErr(t, "limit", err)
	if _, err = SetSection("", "outline", strings.Repeat("好", 60000)); err != nil {
		t.Fatal(err)
	}
}

func TestWritingEverySectionLeavesHandWrittenTextAndTheAttributionLineExactlyAsTheyWere(t *testing.T) {
	human := "这个 PR 修复学生重试多扣一次的问题。"
	sign := "🤖 Generated with [Claude Code](https://claude.com/claude-code)"
	body := human + "\n\n" + sign
	for _, n := range []string{"evidence", "problem", "outline", "risk", "your-todo"} {
		body = set(t, body, n, goodSections[n])
		if strings.Count(body, sign) != 1 {
			t.Fatalf("after %s: attribution line appears once", n)
		}
		if strings.Count(body, human) != 1 {
			t.Fatalf("after %s: hand-written text appears once", n)
		}
		if !strings.HasSuffix(body, human+"\n\n"+sign+"\n") {
			t.Fatalf("after %s: text outside the sections is unchanged and last", n)
		}
	}
	body = set(t, body, "evidence", "- **之前**：额度少两次。\n  **之后**：额度少一次。\n\n"+view+"\n\n更新后的验证")
	if !strings.HasSuffix(body, human+"\n\n"+sign+"\n") {
		t.Fatal(body)
	}
	if s, _ := get(t, body, "evidence"); !strings.Contains(s, "更新后的验证") {
		t.Fatal(s)
	}
	if s, _ := get(t, body, "problem"); !strings.Contains(s, "学生重试失败的题") {
		t.Fatal(s)
	}
}

func TestLiveCheckOneURLAndItsTargetWordPerLineIsAcceptedReadBackAndOrderedAfter要你做的事(t *testing.T) {
	urls := strings.Join([]string{
		"https://cookbook.example/blog/weeknight-dinners 目标词：weeknight dinner ideas",
		"https://cookbook.example/pricing 目标词：recipe app subscription",
	}, "\n")
	body := set(t, "", "your-todo", "说「合并」即可。")
	body = set(t, body, "live-check", urls)
	mustMatch(t, `## 上线自查的网址\n\nhttps://cookbook\.example/blog/weeknight-dinners 目标词：weeknight dinner ideas`, body)
	if s, _ := get(t, body, "live-check"); s != urls {
		t.Fatal(s)
	}
	if !(strings.Index(body, "section your-todo -->") < strings.Index(body, "section live-check -->")) {
		t.Fatal(body)
	}
	if _, ok := get(t, set(t, body, "live-check", ""), "live-check"); ok {
		t.Fatal("empty content removes it")
	}
}

// ---- beyond the old assertions: pieces of the port that have no JavaScript to lean on ----

func TestTheCodeReferenceKindsAreTheOnesTheOldScriptFound(t *testing.T) {
	hits := codeRefs("提交 2daa0bae 在 routers/analysis/writing.py:42 调 `fail_text_analysis`，spec §4.1 说 submit_text_analysis() 不行")
	if len(hits) != 6 {
		t.Fatal(hits)
	}
	if hits := codeRefs("L&R 和 Interview 两种报告的计时规则不一样，A/B 两个选项，iPhone 上最多等 5 秒"); len(hits) != 0 {
		t.Fatal(hits)
	}
	// a hash is hex with both a digit and a letter; a plain number or a word is not one
	for _, s := range []string{"1234567890", "deadbeef", "abcdefabcdef"} {
		if hits := codeRefs(s); len(hits) != 0 {
			t.Errorf("%s: %v", s, hits)
		}
	}
	if hits := codeRefs("a1b2c3d4"); len(hits) != 1 || !strings.HasPrefix(hits[0], "提交号") {
		t.Fatal(hits)
	}
}
