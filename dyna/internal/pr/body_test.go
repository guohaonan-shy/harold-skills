package pr

import (
	"reflect"
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

func TestTheDescriptionIsTheReviewReportOneSentenceThenItsPartsThenTheFoldedReference(t *testing.T) {
	// 上线自查的网址 sits between 能否回滚 and 要你做的事: SEO changes only, the pages to check once the merge is live
	want := []string{"summary", "problem", "changes", "verification", "rollback", "live-check", "night-decided", "night-waiting", "your-todo", "reference"}
	if !reflect.DeepEqual(Sections, want) {
		t.Fatal(Sections)
	}
	if Titles["live-check"] != "上线自查的网址" {
		t.Fatal(Titles["live-check"])
	}
	// night-mode sessions only: what was settled by the recommendation overnight, and what is waiting for a person
	if Titles["night-decided"] != "夜里替你定的" || Titles["night-waiting"] != "等你定的" {
		t.Fatal(Titles)
	}
	var got []string
	for _, n := range []string{"problem", "changes", "verification", "rollback", "your-todo"} {
		got = append(got, Titles[n])
	}
	if !reflect.DeepEqual(got, []string{"问题", "怎么修", "怎么验证", "能否回滚", "要你做的事"}) {
		t.Fatal(got)
	}
	for _, title := range Titles {
		if title == "顺带开的 issue" {
			t.Fatal("issues filed on the way live inside 能否回滚 now")
		}
	}
	_, err := SetSection("", "review", "第 1 轮")
	wantErr(t, "unknown section", err)
}

func TestSectionsComeOutInTheFixedOrderWhateverOrderTheyWereWrittenIn(t *testing.T) {
	written := []string{"reference", "your-todo", "night-waiting", "night-decided", "live-check", "rollback", "verification", "summary", "changes", "problem"}
	body := ""
	for _, n := range written {
		body = set(t, body, n, "内容 "+n)
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

func TestTheNewSectionsWriteTheirOwnHeadingsAndAreRewrittenAlone(t *testing.T) {
	body := set(t, "", "problem", "学生重试失败的题会被多扣一次")
	body = set(t, body, "verification", "- 重试一次只扣一次：端到端，通过")
	body = set(t, body, "rollback", "**能不能撤回**：能，撤销合并即可。")
	mustMatch(t, `## 问题\n\n学生重试`, body)
	mustMatch(t, `## 怎么验证\n\n- 重试一次`, body)
	mustMatch(t, `## 能否回滚\n\n\*\*能不能撤回\*\*`, body)
	body = set(t, body, "problem", "重试失败的题多扣两次")
	if s, _ := get(t, body, "problem"); s != "重试失败的题多扣两次" {
		t.Fatal(s)
	}
	if s, _ := get(t, body, "verification"); !strings.Contains(s, "端到端") {
		t.Fatal(s)
	}
	if strings.Count(body, "## 问题") != 1 {
		t.Fatal(body)
	}
}

func TestADescriptionWrittenBeforeTheReportShapeKeepsItsOld改了什么HeadingOutOfTheRewrittenSection(t *testing.T) {
	old := "<!-- idea-loop:section changes -->\n## 改了什么\n\n### 重试页\n\n之前 → 之后\n<!-- /idea-loop:section changes -->"
	if s, _ := get(t, old, "changes"); s != "### 重试页\n\n之前 → 之后" {
		t.Fatal(s)
	}
	body := set(t, old, "problem", "重试多扣次数")
	mustNotMatch(t, "## 改了什么", body)
	mustMatch(t, `## 怎么修\n\n### 重试页`, body)
	if !(strings.Index(body, "section problem -->") < strings.Index(body, "section changes -->")) {
		t.Fatal(body)
	}
}

func TestTheScriptWritesEachHeadingItselfAWriterThatIncludedItIsNotDoubled(t *testing.T) {
	body := set(t, set(t, "", "summary", "学生重试失败的题不再扣次数"), "your-todo", "## 要你做的事\n\n- [ ] Harold：改 Railway 根目录")
	mustMatch(t, `## 一句话\n\n学生重试`, body)
	if strings.Count(body, "## 要你做的事") != 1 {
		t.Fatal(body)
	}
	if s, _ := get(t, body, "your-todo"); s != "- [ ] Harold：改 Railway 根目录" {
		t.Fatal(s)
	}
}

func TestRewritingOneSectionLeavesTheOthersUntouched(t *testing.T) {
	body := set(t, set(t, "", "reference", "L1"), "changes", "V1")
	body = set(t, body, "changes", "V2")
	if s, _ := get(t, body, "reference"); s != "L1" {
		t.Fatal(s)
	}
	if s, _ := get(t, body, "changes"); s != "V2" {
		t.Fatal(s)
	}
	if strings.Count(body, "section changes -->") != 2 { // one open, one close
		t.Fatal(body)
	}
}

func TestLegacyReviewAndDraftSectionsAreDroppedOnTheNextWrite(t *testing.T) {
	legacy := "<!-- idea-loop:section review -->\n## Review · 第 1 轮\n<!-- /idea-loop:section review -->\n\n<!-- idea-loop:section links -->\nL\n<!-- /idea-loop:section links -->\n\n人写的说明"
	body := set(t, legacy, "summary", "S")
	mustNotMatch(t, `Review · 第 1 轮|section review|section links`, body)
	mustMatch(t, "人写的说明", body)
}

func TestTextOutsideTheMarkersSurvivesBelowTheSections(t *testing.T) {
	body := set(t, "人写的说明\n\n🤖 Generated with Claude Code", "summary", "S")
	mustMatch(t, "人写的说明", body)
	if !(strings.Index(body, "人写的说明") > strings.Index(body, "section summary")) {
		t.Fatal(body)
	}
}

func TestEmptyContentRemovesASection(t *testing.T) {
	body := set(t, set(t, "", "changes", "CI 绿"), "changes", "")
	if _, ok := get(t, body, "changes"); ok {
		t.Fatal(body)
	}
}

func TestABodyOverTheGitHubLimitIsRefusedBeforeItIsSent(t *testing.T) {
	_, err := SetSection("", "reference", strings.Repeat("x", 70000))
	wantErr(t, "limit", err)
	// the limit is in UTF-16 units: an emoji is two
	_, err = SetSection("", "reference", strings.Repeat("😀", 33000))
	wantErr(t, "limit", err)
	if _, err = SetSection("", "reference", strings.Repeat("好", 60000)); err != nil {
		t.Fatal(err)
	}
}

func TestSectionsAPersonReadsRefuseCodeLevelReferencesImageAndLinkAddressesDoNot(t *testing.T) {
	for _, c := range []struct{ name, content string }{
		{"changes", "重试时不再调 `retryAnalysis`"},
		{"your-todo", "- [ ] 看 src/report/player.tsx:42"},
		// the report's new sections are read by a person too
		{"problem", "`retryAnalysis` 多扣了次数"},
		{"verification", "- 单测 src/report/retry.test.ts 通过"},
		{"rollback", "- 见 a1b2c3d 的提交"},
	} {
		_, err := SetSection("", c.name, c.content)
		wantErr(t, "say it in words", err)
	}
	if p := ReaderProblems("changes", "![重试流程](https://github.com/a/b/blob/idea-loop-evidence-pr-1/pr-retry_flow.png?raw=true) 见 [停下汇报](https://github.com/a/b/pull/1#discussion_r1)"); len(p) != 0 {
		t.Fatal(p)
	}
	if p := ReaderProblems("reference", "01 · 缓存 | a1b2c3d | src/cache.ts"); len(p) != 0 { // lookup only
		t.Fatal(p)
	}
}

func TestWriting怎么验证FirstThenTheOtherSectionsLeavesHandWrittenTextAndTheAttributionLineExactlyAsTheyWere(t *testing.T) {
	human := "这个 PR 修复学生重试多扣一次的问题。"
	sign := "🤖 Generated with [Claude Code](https://claude.com/claude-code)"
	body := human + "\n\n" + sign
	for _, n := range []string{"verification", "problem", "changes", "rollback", "your-todo"} {
		body = set(t, body, n, "内容 "+n)
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
	body = set(t, body, "verification", "更新后的验证")
	if !strings.HasSuffix(body, human+"\n\n"+sign+"\n") {
		t.Fatal(body)
	}
	if s, _ := get(t, body, "verification"); s != "更新后的验证" {
		t.Fatal(s)
	}
	if s, _ := get(t, body, "problem"); !strings.Contains(s, "内容 problem") {
		t.Fatal(s)
	}
}

// A description opened before 能否回滚 existed carries a 顺带开的 issue section. It is folded into 能否回滚 the
// next time anything is written, under the same label the new section uses, and never lost afterwards.
const legacyIssues = "<!-- idea-loop:section issues -->\n## 顺带开的 issue\n\n- [旧报告缓存不清](https://github.com/a/b/issues/12)：不是这次引入的\n<!-- /idea-loop:section issues -->"

func TestAnOld顺带开的IssueSectionIsFoldedInto能否回滚OnTheNextWriteAndTheOldHeadingGoes(t *testing.T) {
	body := set(t, legacyIssues+"\n\n人写的说明", "summary", "S")
	mustNotMatch(t, "section issues|## 顺带开的 issue", body)
	mustMatch(t, `## 能否回滚\n\n\*\*顺带开的 issue\*\*\n\n- \[旧报告缓存不清\]`, body)
	mustMatch(t, "人写的说明", body)
	if !(strings.Index(body, "section summary -->") < strings.Index(body, "section rollback -->")) {
		t.Fatal(body)
	}
}

func TestWriting能否回滚OnTopOfAFoldedInIssueListKeepsTheListUnlessTheNewTextCarriesItsOwn(t *testing.T) {
	folded := set(t, legacyIssues, "summary", "S")
	kept := set(t, folded, "rollback", "**能不能撤回**：能，撤销合并即可。")
	s, _ := get(t, kept, "rollback")
	mustMatch(t, `^\*\*能不能撤回\*\*[\s\S]*\*\*顺带开的 issue\*\*\n\n- \[旧报告缓存不清\]`, s)
	own := set(t, folded, "rollback", "**能不能撤回**：能。\n\n**顺带开的 issue**\n\n- [另一个](https://github.com/a/b/issues/13)")
	s, _ = get(t, own, "rollback")
	mustNotMatch(t, "旧报告缓存不清", s)
	mustMatch(t, "另一个", s)
	if strings.Count(s, "顺带开的 issue") != 1 {
		t.Fatal(s)
	}
}

func TestAnOldIssuesSectionThatOnlySaidThereWereNoneIsDroppedNotFoldedIn(t *testing.T) {
	none := "<!-- idea-loop:section issues -->\n## 顺带开的 issue\n\n无\n<!-- /idea-loop:section issues -->"
	body := set(t, none, "summary", "S")
	mustNotMatch(t, "section issues|顺带开的 issue|section rollback", body)
}

func TestLiveCheckOneURLAndItsTargetWordPerLineIsAcceptedReadBackAndOrderedBefore要你做的事(t *testing.T) {
	urls := strings.Join([]string{
		"https://cookbook.example/blog/weeknight-dinners 目标词：weeknight dinner ideas",
		"https://cookbook.example/pricing 目标词：recipe app subscription",
	}, "\n")
	body := set(t, "", "your-todo", "- [ ] 说合并即可")
	body = set(t, body, "live-check", urls)
	mustMatch(t, `## 上线自查的网址\n\nhttps://cookbook\.example/blog/weeknight-dinners 目标词：weeknight dinner ideas`, body)
	if s, _ := get(t, body, "live-check"); s != urls {
		t.Fatal(s)
	}
	if !(strings.Index(body, "section live-check -->") < strings.Index(body, "section your-todo -->")) {
		t.Fatal(body)
	}
	if p := ReaderProblems("live-check", urls); len(p) != 0 {
		t.Fatal("a URL line is not a code-level reference", p)
	}
	if _, ok := get(t, set(t, body, "live-check", ""), "live-check"); ok {
		t.Fatal("empty content removes it")
	}
	// a path written without its URL, or the target word in backticks, is code-level and refused
	_, err := SetSection("", "live-check", "`apps/site/src/content/blog/a.md`")
	wantErr(t, "say it in words", err)
}

func TestTheTwoNightModeSectionsAreWrittenBetweenTheLiveCheckAndTheToDoAndAreReadByAPerson(t *testing.T) {
	body := set(t, "", "your-todo", "说合并即可")
	body = set(t, body, "night-waiting", "- **删一条旧分支**：只能人来删")
	body = set(t, body, "night-decided", "- **要不要保留旧入口**：选了保留，因为老用户还在用；另一种是直接删掉")
	mustMatch(t, `## 夜里替你定的\n\n- \*\*要不要保留旧入口`, body)
	mustMatch(t, `## 等你定的\n\n- \*\*删一条旧分支`, body)
	var at []int
	for _, n := range []string{"night-decided", "night-waiting", "your-todo"} {
		at = append(at, strings.Index(body, "section "+n+" -->"))
	}
	if !sort.IntsAreSorted(at) {
		t.Fatal(at)
	}
	_, err := SetSection(body, "night-decided", "- 改了 `src/app.ts` 的默认值")
	wantErr(t, "read by a person", err)
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
