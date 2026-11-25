package pr

import (
	"errors"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

// The structure checks of `dyna pr body set`: what a section has to look like before it is written. The samples
// are the fourth-round descriptions of five real PRs (idea-loop/evals/pr/rounds); the rest are small inputs, one
// rule each.

const view = "```text\n改前\n  一步\n```"

func structureErr(t *testing.T, err error) *StructureError {
	t.Helper()
	var se *StructureError
	if !errors.As(err, &se) {
		t.Fatalf("want a *StructureError, got %v", err)
	}
	return se
}

func refused(t *testing.T, body, name, content, want string) *StructureError {
	t.Helper()
	_, err := SetSection(body, name, content)
	if err == nil {
		t.Fatalf("section %s was written, want it refused with %q:\n%s", name, want, content)
	}
	if !regexp.MustCompile(want).MatchString(err.Error()) {
		t.Fatalf("want %q in: %v", want, err)
	}
	return structureErr(t, err)
}

// ---- the section table ----

func TestTheSectionsAreProblemOutlineEvidenceRiskToDoLiveCheckInThatOrderWhateverOrderTheyWereWrittenIn(t *testing.T) {
	want := []string{"problem", "outline", "evidence", "risk", "your-todo", "live-check"}
	if strings.Join(Sections, ",") != strings.Join(want, ",") {
		t.Fatal(Sections)
	}
	titles := []string{"问题", "概要", "证据", "合并风险", "要你做的事", "上线自查的网址"}
	for i, n := range want {
		if Titles[n] != titles[i] {
			t.Errorf("%s: %q", n, Titles[n])
		}
	}
	if len(Titles) != len(want) {
		t.Fatal(Titles)
	}
	// written backwards, the live-check URL first
	body := ""
	for i := len(want) - 1; i >= 0; i-- {
		body = set(t, body, want[i], goodSections[want[i]])
	}
	last := -1
	for _, n := range want {
		i := strings.Index(body, "<!-- idea-loop:section "+n+" -->")
		if i <= last {
			t.Fatalf("section %s is out of order in:\n%s", n, body)
		}
		last = i
	}
}

// goodSections is one section per name that passes every check.
var goodSections = map[string]string{
	"problem":    "学生重试失败的题会被多扣一次。\n\n| 谁 | 现象 |\n|---|---|\n| 学生 A | 点一次重试，额度少两次 |",
	"outline":    "重试只重新分析这一题。\n\n" + view,
	"evidence":   "- **之前**：点重试，额度少两次。\n  **之后**：点重试，额度少一次。\n\n" + view,
	"risk":       "**门**：双向。撤销合并即可。\n**影响面**：分析页。",
	"your-todo":  "说「合并」即可。",
	"live-check": "https://cookbook.example/blog/a 目标词：weeknight dinner ideas",
}

// ---- old sections ----

const oldDescription = "<!-- idea-loop:section summary -->\n## 一句话\n\n学生重试不再多扣\n<!-- /idea-loop:section summary -->\n\n" +
	"<!-- idea-loop:section problem -->\n## 问题\n\n旧的问题，没有视图。\n<!-- /idea-loop:section problem -->\n\n" +
	"<!-- idea-loop:section changes -->\n## 怎么修\n\n改了重试\n<!-- /idea-loop:section changes -->\n\n" +
	"<!-- idea-loop:section verification -->\n## 怎么验证\n\n- 通过\n<!-- /idea-loop:section verification -->\n\n" +
	"<!-- idea-loop:section rollback -->\n## 能否回滚\n\n能。\n\n**顺带开的 issue**\n\n- [旧缓存](https://github.com/a/b/issues/12)\n<!-- /idea-loop:section rollback -->\n\n" +
	"<!-- idea-loop:section night-decided -->\n## 夜里替你定的\n\n- 选了保留\n<!-- /idea-loop:section night-decided -->\n\n" +
	"<!-- idea-loop:section night-waiting -->\n## 等你定的\n\n- 无\n<!-- /idea-loop:section night-waiting -->\n\n" +
	"<!-- idea-loop:section your-todo -->\n## 要你做的事\n\n- [ ] 看一眼\n<!-- /idea-loop:section your-todo -->\n\n" +
	"<!-- idea-loop:section reference -->\n## 参考\n\n01 | a1b2c3d\n<!-- /idea-loop:section reference -->\n\n" +
	"<!-- idea-loop:section issues -->\n## 顺带开的 issue\n\n- [旧缓存](https://github.com/a/b/issues/12)\n<!-- /idea-loop:section issues -->\n\n" +
	"Refs o/r#3\n"

func TestTheSevenOldSectionsAndTheOlderOnesAreDroppedOnTheNextWriteWithoutAnError(t *testing.T) {
	body := set(t, oldDescription, "outline", goodSections["outline"])
	for _, old := range []string{"summary", "changes", "verification", "rollback", "night-decided", "night-waiting", "reference", "issues"} {
		mustNotMatch(t, "section "+old+" -->", body)
	}
	mustNotMatch(t, "旧缓存|夜里替你定的|怎么验证|顺带开的 issue", body)
	mustMatch(t, "Refs o/r#3", body)
	mustMatch(t, "## 概要", body)
	// the sections the new table keeps survive as they were, even when they are not rewritten
	if s, _ := get(t, body, "problem"); s != "旧的问题，没有视图。" {
		t.Fatal(s)
	}
	if s, _ := get(t, body, "your-todo"); s != "- [ ] 看一眼" {
		t.Fatal(s)
	}
}

func TestAnOldSectionNameIsNotASectionToWriteAnyMore(t *testing.T) {
	for _, old := range []string{"summary", "changes", "verification", "rollback", "night-decided", "night-waiting", "reference"} {
		_, err := SetSection("", old, "内容")
		wantErr(t, "unknown section", err)
	}
}

// ---- 问题、证据至少一个视图 ----

// A description in the 458 style: a sentence and a how-to-fix, a problem told in prose, no before and after.
const description458 = "<!-- idea-loop:section summary -->\n## 一句话\n\n分拣员终于能分出哪些 issue 值得做\n<!-- /idea-loop:section summary -->\n\n" +
	"<!-- idea-loop:section changes -->\n## 怎么修\n\n加了一步\n<!-- /idea-loop:section changes -->\n"

func TestAProblemWithoutAViewIsRefusedAndAsksForTheMenu(t *testing.T) {
	se := refused(t, description458, "problem", "分拣员看不出 issue 值不值得做，每周都要人再看一遍，已经发生过很多次。", "问题.*视图")
	if !se.NeedsMenu {
		t.Fatal("a refusal for a missing view prints the evidence skill's menu")
	}
	// prose, a quote and a list are not views
	refused(t, "", "problem", "现在这样。\n\n> 引用一句\n\n- 一件\n- 两件", "视图")
}

func TestAnEvidenceWithoutAViewIsRefusedAndAsksForTheMenu(t *testing.T) {
	se := refused(t, "", "evidence", "- **之前**：额度少两次。\n  **之后**：额度少一次。", "证据.*视图")
	if !se.NeedsMenu {
		t.Fatal("menu")
	}
}

func TestAnImageACodeBlockOrATableEachCountAsAView(t *testing.T) {
	for name, v := range map[string]string{
		"image": "![重试页](https://github.com/a/b/blob/x/pr-retry.png?raw=true)",
		"code":  "```text\n一段\n```",
		"table": "| a | b |\n|---|---|\n| 1 | 2 |",
	} {
		if _, err := SetSection("", "problem", "一句话。\n\n"+v); err != nil {
			t.Errorf("%s: %v", name, err)
		}
	}
}

func TestAViewThatIsNotARefusalForAnotherReasonDoesNotAskForTheMenu(t *testing.T) {
	se := refused(t, "", "risk", "**影响面**：分析页。", "门")
	if se.NeedsMenu {
		t.Fatal("only a missing view prints the menu")
	}
}

// ---- 概要 ----

func TestAnOutlineHasAtMostTwoViews(t *testing.T) {
	if _, err := SetSection("", "outline", "说一句。\n\n"+view+"\n\n"+view); err != nil {
		t.Fatal(err)
	}
	refused(t, "", "outline", "说一句。\n\n"+view+"\n\n"+view+"\n\n![图](a.png)", "概要.*最多.*两个视图.*3")
	// no view at all is fine here
	if _, err := SetSection("", "outline", "说一句。"); err != nil {
		t.Fatal(err)
	}
	// two images on separate lines are two views; a table is one however many rows it has
	if _, err := SetSection("", "outline", "![a](a.png)\n\n![b](b.png)\n\n| a | b |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |"); err == nil {
		t.Fatal("image, image, table is three views")
	}
}

func TestTheOutlineMayNameCodeTheOtherSectionsMayNot(t *testing.T) {
	code := "改了 `retryAnalysis`（src/report/retry.ts:42），见提交 a1b2c3d，POST /api/retry。\n\n" + view
	if _, err := SetSection("", "outline", code); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"problem", "evidence", "risk", "your-todo"} {
		content := goodSections[name] + "\n\n" + "src/report/retry.ts:42"
		if name == "your-todo" {
			content = "- [ ] 看 src/report/retry.ts:42\n\n说「合并」即可。"
		}
		refused(t, "", name, content, "say it in words")
	}
}

// ---- 证据：之前之后成对，组数对得上问题 ----

const twoProblems = "两件事。\n\n1. 重试多扣\n2. 报告缓存不清\n\n" + view

func TestTheBeforeAndAfterOfEachGroupComeInPairs(t *testing.T) {
	refused(t, "", "evidence", "- **之前**：额度少两次。\n\n"+view, "之前.*之后.*成对")
	refused(t, "", "evidence", "- **之后**：额度少一次。\n\n"+view, "之前.*之后.*成对")
	refused(t, "", "evidence", "- **之前**：A。\n  **之前**：B。\n  **之后**：C。\n\n"+view, "之前.*之后.*成对")
}

func TestAProblemWithSeveralItemsNeedsAGroupForEachOrAWordOnTheOnesMissing(t *testing.T) {
	body := set(t, "", "problem", twoProblems)
	one := "- **之前**：额度少两次。\n  **之后**：额度少一次。\n\n" + view
	refused(t, body, "evidence", one, "问题有 2 件.*证据只有 1 组.*没验成")
	if _, err := SetSection(body, "evidence", one+"\n\n没验成：报告缓存那件的之前，基准分支上没跑，之后补。"); err != nil {
		t.Fatal(err)
	}
	two := "- **之前**：额度少两次。\n  **之后**：额度少一次。\n- **之前**：旧报告还在。\n  **之后**：旧报告清掉了。\n\n" + view
	if _, err := SetSection(body, "evidence", two); err != nil {
		t.Fatal(err)
	}
	// a 没验成 line with nothing after it says nothing
	refused(t, body, "evidence", one+"\n\n没验成：", "没验成")
}

func TestAProblemWithoutAListCountsAsOneItem(t *testing.T) {
	body := set(t, "", "problem", goodSections["problem"])
	refused(t, body, "evidence", "只有一张图。\n\n"+view, "问题有 1 件.*证据只有 0 组")
	// an evidence written before the problem has nothing to count against: the problem counts as one
	if _, err := SetSection("", "evidence", goodSections["evidence"]); err != nil {
		t.Fatal(err)
	}
}

func TestAListInsideACodeBlockIsNotAnItemOfTheProblem(t *testing.T) {
	body := set(t, "", "problem", "一件事。\n\n```text\n1. 第一步\n2. 第二步\n```")
	if _, err := SetSection(body, "evidence", goodSections["evidence"]); err != nil {
		t.Fatal(err)
	}
}

// ---- 合并风险 ----

func TestTheRiskNeedsTheGateAndTheReachAndAtMostThreeThingsToWatch(t *testing.T) {
	refused(t, "", "risk", "**影响面**：分析页。", "合并风险.*门")
	refused(t, "", "risk", "**门**：双向。", "合并风险.*影响面")
	refused(t, "", "risk", "**门**：看情况。\n**影响面**：分析页。", "门.*双向.*单向")
	four := "**门**：单向。退不回的是已发布的包。\n**影响面**：全插件。\n- 一\n- 二\n- 三\n- 四"
	refused(t, "", "risk", four, "要特别注意的.*最多 3 条.*4")
	three := strings.Replace(four, "\n- 四", "", 1)
	if _, err := SetSection("", "risk", three); err != nil {
		t.Fatal(err)
	}
}

func TestTheRiskGateReadsPlainOrBoldAndEitherColon(t *testing.T) {
	for _, r := range []string{
		"门：双向\n影响面：分析页",
		"**门**: 单向。退不回的是包。\n**影响面**: 全插件",
		"**门：双向**\n**影响面：**分析页",
	} {
		if _, err := SetSection("", "risk", r); err != nil {
			t.Errorf("%q: %v", r, err)
		}
	}
}

// ---- 要你做的事 ----

func TestTheToDoIsCheckboxesCodeBlocksAndTheClosingLineOnly(t *testing.T) {
	ok := "- [ ] 合并后跑安装：\n  ```\n  python3 scripts/service.py install\n  ```\n- [x] 核对没问题\n\n说『合并』即可。"
	if _, err := SetSection("", "your-todo", ok); err != nil {
		t.Fatal(err)
	}
	refused(t, "", "your-todo", "- [ ] 看一眼\n\n这次改动很大，请仔细看。\n\n说「合并」即可。", "要你做的事.*复选框")
	refused(t, "", "your-todo", "- [ ] 看一眼", "说「合并」即可")
	refused(t, "", "your-todo", "- 看一眼\n\n说「合并」即可。", "复选框")
}

func TestAnInstallCommandInACodeBlockPassesTheSamePathInTheRiskDoesNot(t *testing.T) {
	todo := "- [ ] 合并后在主 checkout 跑：\n  ```\n  python3 media-tool/scripts/service.py install\n  ```\n\n说「合并」即可。"
	if _, err := SetSection("", "your-todo", todo); err != nil {
		t.Fatal(err)
	}
	refused(t, "", "risk", "**门**：双向。\n**影响面**：本机。\n- 迁移要跑 media-tool/scripts/service.py", "say it in words.*路径")
	// the same path written as text in the to-do is refused too: only the code block is let through
	refused(t, "", "your-todo", "- [ ] 跑 media-tool/scripts/service.py install\n\n说「合并」即可。", "say it in words")
}

func TestACommandAPersonTypesIsLetThroughInTheToDoEvenInsideBackticks(t *testing.T) {
	if _, err := SetSection("", "your-todo", "- [ ] 改一次 key 文件，几秒后再跑一次 `status`。\n\n说「合并」即可。"); err != nil {
		t.Fatal(err)
	}
}

// ---- 代码叫法 ----

func TestCommitsFunctionsPathsAndEndpointsAreRefusedInTheFourSections(t *testing.T) {
	for _, c := range []struct{ what, text string }{
		{"提交号", "见 a1b2c3d 那次提交"},
		{"函数名", "调了 `retryAnalysis` 多扣一次"},
		{"函数名", "调了 fail_text_analysis 多扣一次"},
		{"函数名", "调了 submit() 多扣一次"},
		{"路径", "改了 src/report/retry.ts 这个文件"},
		{"文件:行号", "见 retry.ts:42"},
		{"接口地址", "接口 POST /api/retry 返回 400"},
		{"接口地址", "打 /api/v2/retry 那个口"},
	} {
		body := "现在这样：" + c.text + "。\n\n" + view
		se := refused(t, "", "problem", body, "say it in words")
		if !strings.Contains(strings.Join(se.Problems, "\n"), c.what) {
			t.Errorf("%s: %v", c.what, se.Problems)
		}
	}
}

func TestSkillNamesSlashCommandsDynaCommandsAndOrdinaryWordsPassTheNamingCheck(t *testing.T) {
	text := "写之前调 idea-loop:evidence，再跑 /idea-loop:setup，然后 dyna pr body set <owner/repo> <pr> problem，用 `idea-loop:pr` 的 L&R、A/B、iPhone 上等 5 秒、11/24、0.0.16、TOFEL-demo、基线 `baseline-email_report-20261120`。"
	for _, name := range []string{"problem", "risk"} {
		content := text + "\n\n" + view
		if name == "risk" {
			content = "**门**：双向。\n**影响面**：" + text
		}
		if _, err := SetSection("", name, content); err != nil {
			t.Errorf("%s: %v", name, err)
		}
	}
}

func TestTheLiveCheckStaysAUrlAndItsTargetWordNotCode(t *testing.T) {
	refused(t, "", "live-check", "`apps/site/src/content/blog/a.md`", "say it in words")
}

// ---- no word count ----

func TestThereIsNoLengthLineOnASection(t *testing.T) {
	long := strings.Repeat("这一段很长很长。", 800) + "\n\n" + view
	if _, err := SetSection("", "problem", long); err != nil {
		t.Fatal(err)
	}
}

// ---- the menu ----

const evidenceSkill = "---\nname: evidence\n---\n\n开头一句。\n\n## 证据是什么\n\n不要这一段。\n\n## 视图菜单\n\n| 要讲清的是什么 | 视图 |\n|---|---|\n| 一段逻辑 | 伪代码 |\n\n```text\non(x)\n```\n\n## 怎么摆\n\n也不要这一段。\n"

func writeSkill(t *testing.T, root, content string) {
	t.Helper()
	p := filepath.Join(root, "skills", "productivity", "evidence", "SKILL.md")
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(p, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestTheMenuIsTheViewMenuSectionOfTheEvidenceSkillAndNothingElse(t *testing.T) {
	root := t.TempDir()
	writeSkill(t, root, evidenceSkill)
	menu, err := ViewMenu(root)
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"## 视图菜单", "| 一段逻辑 | 伪代码 |", "on(x)"} {
		if !strings.Contains(menu, want) {
			t.Errorf("no %q in %q", want, menu)
		}
	}
	for _, not := range []string{"不要这一段", "也不要这一段", "开头一句"} {
		if strings.Contains(menu, not) {
			t.Errorf("%q must not be in the menu: %q", not, menu)
		}
	}
}

func TestAMenuThatCannotBeReadSaysWhy(t *testing.T) {
	if _, err := ViewMenu(""); err == nil || !strings.Contains(err.Error(), "IDEA_LOOP_PLUGIN_ROOT") {
		t.Fatal(err)
	}
	root := t.TempDir()
	if _, err := ViewMenu(root); err == nil || !strings.Contains(err.Error(), "SKILL.md") {
		t.Fatal(err)
	}
	writeSkill(t, root, "---\nname: evidence\n---\n\n## 怎么摆\n\n没有菜单。\n")
	if _, err := ViewMenu(root); err == nil || !strings.Contains(err.Error(), "视图菜单") {
		t.Fatal(err)
	}
}

// ---- the five samples ----

// sampleSections splits a description into sections by heading, the way a session would write them one by one;
// the Refs line that `dyna pr open` wrote is text outside the sections.
func sampleSections(t *testing.T, text string) (map[string]string, string) {
	t.Helper()
	byTitle := map[string]string{}
	for n, title := range Titles {
		byTitle[title] = n
	}
	out := map[string]string{}
	cur, refs := "", []string{}
	var buf []string
	flush := func() {
		if cur != "" {
			out[cur] = strings.TrimSpace(strings.Join(buf, "\n"))
		}
		buf = nil
	}
	inFence := false
	for _, line := range strings.Split(text, "\n") {
		if strings.HasPrefix(strings.TrimSpace(line), "```") {
			inFence = !inFence
		}
		if !inFence && strings.HasPrefix(line, "## ") {
			flush()
			cur = byTitle[strings.TrimSpace(line[3:])]
			if cur == "" {
				t.Fatalf("a heading the table does not have: %s", line)
			}
			continue
		}
		if !inFence && strings.HasPrefix(line, "Refs ") {
			refs = append(refs, line)
			continue
		}
		buf = append(buf, line)
	}
	flush()
	return out, strings.Join(refs, "\n")
}

// samples are the directories of the fourth-round descriptions, read from the repository; none is named here
// because the plugin's tests carry no project names (the samples themselves live under evals/, where they may).
func samples(t *testing.T) []string {
	t.Helper()
	dirs, _ := filepath.Glob(filepath.Join("..", "..", "..", "idea-loop", "evals", "pr", "rounds", "*", "description.md"))
	if len(dirs) == 0 {
		t.Skip("the round samples are gone; idea-loop/evals/pr/rounds is deleted once the annotated samples exist")
	}
	var names []string
	for _, d := range dirs {
		names = append(names, filepath.Base(filepath.Dir(d)))
	}
	return names
}

func readSample(t *testing.T, name string) string {
	t.Helper()
	b, err := os.ReadFile(filepath.Join("..", "..", "..", "idea-loop", "evals", "pr", "rounds", name, "description.md"))
	if err != nil {
		t.Skipf("the round samples are gone (%v); idea-loop/evals/pr/rounds is deleted once the annotated samples exist", err)
	}
	return string(b)
}

func TestTheFiveFourthRoundDescriptionsGoThroughSectionBySectionAndTheRefsLineSurvives(t *testing.T) {
	for _, name := range samples(t) {
		t.Run(name, func(t *testing.T) {
			secs, refs := sampleSections(t, readSample(t, name))
			body := refs + "\n"
			for _, n := range Sections {
				if secs[n] == "" {
					continue
				}
				var err error
				body, err = SetSection(body, n, secs[n])
				if err != nil {
					t.Fatalf("section %s: %v", n, err)
				}
			}
			for _, n := range []string{"problem", "outline", "evidence", "risk", "your-todo"} {
				if _, ok := get(t, body, n); !ok {
					t.Errorf("section %s did not come back", n)
				}
			}
			mustMatch(t, "Refs ", body)
		})
	}
}

func TestASampleWhoseGroupsFallShortLosesItsUnverifiedLineAndTheGroupsNoLongerAddUp(t *testing.T) {
	found := 0
	for _, name := range samples(t) {
		secs, _ := sampleSections(t, readSample(t, name))
		ev := secs["evidence"]
		i := strings.Index(ev, "没验成：")
		groups, _ := groupsOf(ev)
		if i < 0 || groups >= itemsOf(secs["problem"]) {
			continue // this sample says nothing is missing
		}
		found++
		body := set(t, "", "problem", secs["problem"])
		se := refused(t, body, "evidence", strings.TrimSpace(ev[:i]), "没验成")
		if se.NeedsMenu {
			t.Fatalf("%s: this is not a missing view", name)
		}
	}
	if found == 0 {
		t.Fatal("no sample has an evidence with fewer groups than problems; the case this test stands for is gone")
	}
}

func TestADescriptionInThe458StyleIsRefusedWhereItsProblemHasNoViewAndTheMenuIsAsked(t *testing.T) {
	// the 458 problem told in prose, no before and after, rewritten into the new section
	secs, _ := sampleSections(t, readSample(t, samples(t)[0]))
	prose := strings.SplitN(secs["problem"], "\n\n", 2)[0]
	se := refused(t, description458, "problem", prose, "视图")
	if !se.NeedsMenu {
		t.Fatal("menu")
	}
}
