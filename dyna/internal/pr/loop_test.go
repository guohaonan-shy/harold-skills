package pr

import (
	"reflect"
	"strings"
	"testing"
)

// These are the assertions of the old review-loop.test.mjs, one test each, over the same inputs.

const loopText = `# PR #12 的 review loop

<!-- idea-loop-entry {"kind":"pause","round":1} -->
## 第 1 次停下 · 落地 3 张，等你决定 1 件
…汇报…

### 你的批示（2026-10-13 09:10）
> 03 选 A

### 做了什么
- 03 的决定写回工单，03 和 05 继续（提交链接）

<!-- idea-loop-entry {"kind":"review","round":1} -->
## Review 第 1 轮
…结论…

### 你的批示（2026-10-13 14:02）
> S1 接受，C1 修

### 做了什么
- S1 写回 spec；C1 已修

### 你的批示（2026-10-13 15:30）
> C1 的回归测试补一下
`

func parseText(t *testing.T, text string) []Entry {
	t.Helper()
	e, err := ParseLoop(text)
	if err != nil {
		t.Fatal(err)
	}
	return e
}

func settledOf(es []Entry) []bool {
	var out []bool
	for _, e := range es {
		out = append(out, e.Settled)
	}
	return out
}

func TestEntriesComeOutInOrderWithTheirKindRoundAndBody(t *testing.T) {
	e := parseText(t, loopText)
	type row struct {
		kind    string
		round   int
		rulings int
	}
	var got []row
	var sources []string
	for _, x := range e {
		got = append(got, row{x.Kind, x.Round, x.Rulings})
		sources = append(sources, x.Source)
	}
	if !reflect.DeepEqual(got, []row{{"pause", 1, 1}, {"review", 1, 2}}) {
		t.Fatal(got)
	}
	if !reflect.DeepEqual(sources, []string{"impl", "review"}) { // a legacy pause entry is a report from implementation
		t.Fatal(sources)
	}
	mustMatch(t, "^## 第 1 次停下", e[0].Body)
	mustNotMatch(t, "review loop", e[0].Body) // the title is not part of an entry
}

func TestAnEntryIsSettledOnlyWhenItsLatestRulingHasBeenActedOn(t *testing.T) {
	e := parseText(t, loopText)
	if !reflect.DeepEqual(settledOf(e), []bool{true, false}) {
		t.Fatal(settledOf(e))
	}
	if got := Unsettled(e); !reflect.DeepEqual(got, []Ref{{"review", 1}}) {
		t.Fatal(got)
	}
	if parseText(t, `<!-- idea-loop-entry {"kind":"review","round":2} -->`+"\n## Review 第 2 轮")[0].Settled { // no ruling yet
		t.Fatal("no 做了什么, not settled")
	}
}

func TestTheNextRoundCountsPerKindStartingAt1ForAnEmptyFile(t *testing.T) {
	e := parseText(t, loopText)
	if NextRound(e, "review", "") != 2 || NextRound(e, "pause", "") != 2 || NextRound(parseText(t, ""), "review", "") != 1 {
		t.Fatal(NextRound(e, "review", ""), NextRound(e, "pause", ""))
	}
}

// One kind of report: stops during implementation and review rounds are both a Review 汇报. The marker says where
// it came from; rounds are counted per source, so review rounds keep starting at 1 and the two-round automatic cap
// is not eaten by implementation stops.
const mergedText = loopText + `
<!-- idea-loop-entry {"kind":"review","round":2,"from":"impl"} -->
## 第 3 次 · 来自实现
**结论**：落地 2 张。

### 做了什么
- 继续下一批
`

func TestAReview汇报FromImplementationIsAReviewEntryWithFromImplCountedApartFromReviewRounds(t *testing.T) {
	e := parseText(t, mergedText)
	type row struct {
		kind, source string
		round        int
	}
	var got []row
	for _, x := range e {
		got = append(got, row{x.Kind, x.Source, x.Round})
	}
	if !reflect.DeepEqual(got, []row{{"pause", "impl", 1}, {"review", "review", 1}, {"review", "impl", 2}}) {
		t.Fatal(got)
	}
	if NextRound(e, "review", "") != 2 { // implementation stops do not use up a review round
		t.Fatal("review")
	}
	if NextRound(e, "review", "impl") != 3 { // the legacy pause counts as an implementation report
		t.Fatal("impl")
	}
	if NextRound(parseText(t, ""), "review", "impl") != 1 {
		t.Fatal("empty")
	}
	_, err := ParseLoop(`<!-- idea-loop-entry {"kind":"review","round":1,"from":"nowhere"} -->`)
	wantErr(t, "bad entry marker", err)
}

func TestAnImplementationReportIsArchivedUnderItsOwnMarkerAndLabelTheSameRoundNumberOfAnotherSourceIsNotMistakenForIt(t *testing.T) {
	e := parseText(t, mergedText)
	body, err := ArchiveBody(e[2], "app")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(body, ArchiveMarker("review", 2, "impl")) {
		t.Fatal(body)
	}
	mustMatch(t, "实现阶段第 2 次汇报在会话里进行", body)
	// legacy markers, written before the kinds were merged, still mark their entries as posted
	posted := []string{ArchiveMarker("pause", 1, ""), ArchiveMarker("review", 1, "")}
	left := ToArchive(e, posted)
	if len(left) != 1 || left[0].Kind != "review" || left[0].Source != "impl" || left[0].Round != 2 {
		t.Fatal(left)
	}
	// a review round 2 is not the implementation report 2
	if n := len(ToArchive(e, []string{ArchiveMarker("review", 2, "")})); n != 3 {
		t.Fatal(n)
	}
}

func TestTheOne要你决定HeadingHoldsAnEntryForARulingTheOlderBoldMarkAndTheOld需要你决定HeadingStillDo(t *testing.T) {
	entry := func(body string) string {
		return `<!-- idea-loop-entry {"kind":"review","round":3,"from":"impl"} -->` + "\n## 第 3 次 · 来自实现\n" + body
	}
	asks := func(heading string) string {
		return entry("\n" + heading + "\n\n#### T03 · 卡在哪\n现状……\n\n### 做了什么\n- 其余继续\n")
	}
	for _, h := range []string{"### 要你决定", "### 需要你决定", "#### S1 · 标题\n**要你决定**：A，还是 B？"} {
		if parseText(t, asks(h))[0].Settled {
			t.Errorf("%q should hold the entry", h)
		}
	}
	if !parseText(t, entry("\n### 已按规则处理\n- 一条\n\n### 做了什么\n- 继续\n"))[0].Settled {
		t.Fatal("nothing asked, and said what was done")
	}
	// and once ruled on and acted on, it is settled as before
	if !parseText(t, asks("### 要你决定")+"\n### 你的批示（2026-11-01 10:00）\n> T03 选 A\n\n### 做了什么\n- 03 按 A 做了\n")[0].Settled {
		t.Fatal("ruled on and acted on")
	}
}

func TestAMalformedMarkerIsAnErrorNotASilentlyDroppedEntry(t *testing.T) {
	_, err := ParseLoop(`<!-- idea-loop-entry {"kind":"note","round":1} -->`)
	wantErr(t, "bad entry marker", err)
	for _, bad := range []string{`{"kind":"review"}`, `{"kind":"review","round":1.5}`, `{"kind":"review","round":"1"}`, `{"kind":"review","round":1,"from":null}`, `{"kind":7,"round":1}`} {
		if _, err := ParseLoop("<!-- idea-loop-entry " + bad + " -->"); err == nil {
			t.Errorf("%s should be refused", bad)
		}
	}
}

func TestArchivingPostsEachEntryOnceLabelledAsARecordSayingWhoPosted(t *testing.T) {
	e := parseText(t, loopText)
	already := []string{ArchiveMarker("pause", 1, "") + "\n…", "人写的评论"}
	left := ToArchive(e, already)
	if len(left) != 1 || left[0].Kind != "review" || left[0].Round != 1 {
		t.Fatal(left)
	}
	body, err := ArchiveBody(e[1], "gh-login")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(body, ArchiveMarker("review", 1, "")) {
		t.Fatal(body)
	}
	mustMatch(t, "由 Claude 代发", body)
	mustMatch(t, "review 第 1 轮在会话里进行", body)
	if WithAuthorship("x", "app") != "x" {
		t.Fatal("the App speaks for itself")
	}
}

func TestAnEntryTooLongForOneGitHubCommentIsRefusedBeforeItIsSent(t *testing.T) {
	_, err := ArchiveBody(Entry{Kind: "review", Round: 1, Source: "review", Body: strings.Repeat("x", 70000)}, "app")
	wantErr(t, "limit", err)
}

const ruledOnly = `<!-- idea-loop-entry {"kind":"review","round":1} -->
## Review 第 1 轮
**结论**：Spec 0 条、Standards 1 条，都已按规则处理。

### 已按规则处理
- C1：补了缺的说明文字（依据：仓库的文案规定；提交链接）

### 做了什么
- C1 已修并推送（提交链接）
`

func TestAReviewRoundWhoseFindingsWereAllHandledByRuleAndSaysWhatWasDoneIsSettledWithoutARuling(t *testing.T) {
	e := parseText(t, ruledOnly)[0]
	if e.Rulings != 0 || !e.Settled || len(Unsettled([]Entry{e})) != 0 {
		t.Fatal(e)
	}
}

func TestAReviewRoundThatStillAsksTheHumanSomethingOrHasNotSaidWhatWasDoneIsNotSettledWithoutARuling(t *testing.T) {
	asks := strings.Replace(ruledOnly, "### 做了什么", "#### S1 · 标题\n**要你决定**：A，还是 B？\n\n### 做了什么", 1)
	if parseText(t, asks)[0].Settled {
		t.Fatal("asks")
	}
	if parseText(t, ruledOnly[:strings.Index(ruledOnly, "### 做了什么")])[0].Settled {
		t.Fatal("has not said what was done")
	}
}

// A stop report is judged like a review round: it waits for the human only when it asks something (a 需要你决定
// section); otherwise saying what was done settles it. Unticked delivery items do not hold it: they go to the
// human in the final review report (pr-review's 交审核报告), not mid-implementation.
func pauseEntry(body string) string {
	return `<!-- idea-loop-entry {"kind":"pause","round":2} -->
## 第 2 次停下 · 落地 2 张，已按规则处理 1 件，等你决定 0 件

### 已按规则处理（不同意的，说「推翻某条」）
- **03 · 标题**：文案沿用全站写法。依据：首页的同类按钮
` + body
}

func TestAStopReportWithNoDecisionQuestionNoUntickedDeliveryItemAnd做了什么IsSettledWithoutARuling(t *testing.T) {
	e := parseText(t, pauseEntry("\n### 交付验收\n\n#### 03 · 标题\n无需人看\n\n### 做了什么\n- 继续下一批（提交链接）\n"))[0]
	if e.Rulings != 0 || !e.Settled || len(Unsettled([]Entry{e})) != 0 {
		t.Fatal(e)
	}
	if !parseText(t, pauseEntry("\n### 做了什么\n- 继续（提交链接）\n"))[0].Settled { // no delivery section at all
		t.Fatal("no delivery section")
	}
}

func TestAStopReportThatStillAsksTheHumanADecisionQuestionStaysUnsettledUntilRuledOn(t *testing.T) {
	asks := "\n### 需要你决定\n\n#### 03 · 卡在哪\n缺的是什么。\n\n- **A**：做法——代价\n- **B**：做法——代价\n\n推荐 A：理由\n\n### 做了什么\n- 其余继续\n"
	e := parseText(t, pauseEntry(asks))[0]
	if e.Rulings != 0 || e.Settled {
		t.Fatal(e)
	}
	if got := Unsettled([]Entry{e}); !reflect.DeepEqual(got, []Ref{{"pause", 2}}) {
		t.Fatal(got)
	}
	// ruled on and acted on: settled as before
	if !parseText(t, pauseEntry(asks+"\n### 你的批示（2026-10-20 10:00）\n> 03 选 A\n\n### 做了什么\n- 03 按 A 做了\n"))[0].Settled {
		t.Fatal("ruled on and acted on")
	}
}

func TestAStopReportWhoseDeliveryItemsAreStillUntickedIsSettledByItsActedOnTheyWaitForTheReviewReport(t *testing.T) {
	open := "\n### 交付验收\n\n#### 03 · 标题\n\n**动效**\n- [ ] 展开是否顺\n\n  ![..](x.gif)\n\n### 做了什么\n- 继续\n"
	if !parseText(t, pauseEntry(open))[0].Settled {
		t.Fatal("settled by 做了什么")
	}
	if parseText(t, pauseEntry(open[:strings.Index(open, "### 做了什么")]))[0].Settled {
		t.Fatal("without 做了什么 it is not settled")
	}
}

func TestAStopReportWithNoDecisionQuestionThatHasNotYetSaidWhatWasDoneIsUnsettled(t *testing.T) {
	if parseText(t, pauseEntry("\n### 交付验收\n\n#### 03 · 标题\n无需人看\n"))[0].Settled {
		t.Fatal("unsettled")
	}
}

func TestOverturningAHandledByRuleItemIsOneMoreRulingInTheSameEntryAndReopensItUntilItIsActedOn(t *testing.T) {
	overturned := ruledOnly + "\n### 你的批示（2026-10-19 16:00）\n> 推翻 C1，这个不用改\n\n"
	e := parseText(t, overturned)[0]
	if e.Rulings != 1 || e.Settled {
		t.Fatal(e)
	}
	mustMatch(t, "推翻 C1", e.Body)
	done := parseText(t, overturned+"### 做了什么\n- C1 改回去了（提交链接）\n")[0]
	if done.Rulings != 1 || !done.Settled {
		t.Fatal(done)
	}
}

func TestLocalFiguresAreFoundAndSwappedForTheirUploadedAddressesWebAddressesAreLeftAlone(t *testing.T) {
	body := "![重试流程](../pr-review/12/evidence/r1-s1-flow.png)\n![旧图](https://example.com/a.png)\n![同一张](../pr-review/12/evidence/r1-s1-flow.png)"
	if got := LocalFigures(body); !reflect.DeepEqual(got, []string{"../pr-review/12/evidence/r1-s1-flow.png"}) {
		t.Fatal(got)
	}
	out := WithFigureUrls(body, map[string]string{"r1-s1-flow.png": "https://github.com/a/b/blob/idea-loop-evidence-pr-12/r1-s1-flow.png?raw=true"})
	if strings.Count(out, "raw=true") != 2 {
		t.Fatal(out)
	}
	mustMatch(t, `example\.com`, out)
}

func TestAReplayIsAThirdKindOfEntryNumberedAmongReplaysArchivedWithItsOwnLabelAndTheOldKindsReadAsBefore(t *testing.T) {
	withReplay := loopText + `
<!-- idea-loop-entry {"kind":"replay","round":1} -->
## 规则回放 第 1 次 · 1 个用例，1 个过

### 做了什么
- 全部用例都过
`
	e := parseText(t, withReplay)
	type row struct {
		kind    string
		round   int
		settled bool
	}
	var got []row
	for _, x := range e {
		got = append(got, row{x.Kind, x.Round, x.Settled})
	}
	if !reflect.DeepEqual(got, []row{{"pause", 1, true}, {"review", 1, false}, {"replay", 1, true}}) {
		t.Fatal(got)
	}
	if NextRound(e, "replay", "") != 2 {
		t.Fatal("replay")
	}
	if NextRound(e, "review", "") != 2 { // a replay does not use up a review round
		t.Fatal("review")
	}
	body, err := ArchiveBody(e[2], "app")
	if err != nil {
		t.Fatal(err)
	}
	mustMatch(t, "规则回放第 1 次在会话里进行", body)
}
