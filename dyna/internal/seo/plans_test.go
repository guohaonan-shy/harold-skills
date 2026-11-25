package seo

import (
	"encoding/json"
	"fmt"
	"math"
	"reflect"
	"strings"
	"testing"
	"time"
)

// jsonOf reads a JSON literal the way a command reads a file.
func jsonOf(t *testing.T, s string) any {
	t.Helper()
	v, err := ParseJSON([]byte(s))
	if err != nil {
		t.Fatalf("%v: %s", err, s)
	}
	return v
}

func logOf(t *testing.T, entries ...string) []any {
	t.Helper()
	out := []any{}
	for _, e := range entries {
		out = append(out, jsonOf(t, e))
	}
	return out
}

func spendEntry(date, lines string) string {
	return fmt.Sprintf(`{"entryDate":%q,"summary":%q}`, date, fmt.Sprintf("seo-scan %s 22:05，方向：pages\n采集：pages 1 条\n%s", date, lines))
}

func openseo(t *testing.T) OpenSEO { return mustParse(t, testSeoMd).OpenSEO }

func TestBillingPeriodStartsOnTheResetDayAndADayPastTheMonthEndFallsOnItsLastDay(t *testing.T) {
	for _, c := range []struct {
		reset      int
		today      string
		start, end string
	}{
		{15, "2026-11-10", "2026-10-15", "2026-11-15"},
		{15, "2026-11-15", "2026-11-15", "2026-12-15"}, // the reset day itself opens the new period
		{31, "2027-02-20", "2027-01-31", "2027-02-28"},
		{1, "2026-12-31", "2026-12-01", "2027-01-01"},
		{20, "2027-01-05", "2026-12-20", "2027-01-20"}, // across the new year
	} {
		got, err := BillingPeriod(c.reset, c.today)
		if err != nil || got.Start != c.start || got.End != c.end {
			t.Errorf("%d %s: %+v %v", c.reset, c.today, got, err)
		}
	}
}

func TestSpendingsSumsLinesByShareAndTakesTheDateFromTheEntryOrItsFirstLine(t *testing.T) {
	log := logOf(t,
		`{"entryDate":"2027-02-02","summary":"seo-scan 2027-02-02 22:05，方向：pages\n采集：pages 1 条\n花费：300 credits，余额 9000，份：扫描；预算跳过：无\n花费：50 credits，份：排名追踪"}`,
		`{"summary":"起草 2027-02-03：issue #12\n花费：1,200 credits，份：起草与验证"}`,
		`{"entryDate":"2027-02-04","summary":"seo-scan 2027-02-04 22:05，方向：pages\n花费：未知 credits，余额 未知"}`,
		`{"entryDate":"2027-02-05","summary":"Keyword research: weeknight dinners. Verdict: ..."}`,
		`{"summary":"没有日期的一条\n花费：999 credits"}`,
	)
	want := []Spending{{"2027-02-02", "扫描", 300}, {"2027-02-02", "排名追踪", 50}, {"2027-02-03", "起草与验证", 1200}}
	if got := Spendings(log); !reflect.DeepEqual(got, want) {
		t.Fatal(got)
	}
}

func feb(t *testing.T) []any {
	return logOf(t,
		spendEntry("2027-01-28", "花费：700 credits，余额 15000"), // last period
		spendEntry("2027-02-02", "花费：3000 credits，余额 9000，份：扫描"),
		spendEntry("2027-02-09", "花费：1500 credits，份：扫描"),
		`{"entryDate":"2027-02-10","summary":"起草 2027-02-10：issue #7\n花费：900 credits，份：起草与验证"}`,
	)
}

func budget(t *testing.T, o OpenSEO, balance float64, dirs []string, log []any, today string, spent float64) *BudgetPlan {
	t.Helper()
	p, err := PlanBudget(o, balance, dirs, BudgetOpts{Log: log, Today: today, Spent: spent, LogKnown: log != nil})
	if err != nil {
		t.Fatal(err)
	}
	return p
}

func allowed(p *BudgetPlan) map[string]float64 { return p.Allow.Vals }

func TestBudgetTwoWeeksLeftSplitsTheWeeksCreditsByTheAllocationRatio(t *testing.T) {
	r := budget(t, openseo(t), 20000, []string{"technical"}, feb(t), "2027-02-15", 0)
	if r.Week.WeeksLeft != 2 || r.Week.PeriodSpent != 5400 || r.Week.Budget != 2300 {
		t.Fatalf("%+v", r.Week)
	}
	if r.Week.Shares.Tracking != (Share{300, 0, 300}) || r.Week.Shares.Scan != (Share{1600, 0, 1600}) || r.Week.Shares.Drafting != (Share{400, 0, 400}) {
		t.Fatalf("%+v", r.Week.Shares)
	}
	if !reflect.DeepEqual(allowed(r), map[string]float64{"technical": 200}) {
		t.Fatal(allowed(r))
	}
}

func TestBudgetWhatTheWeekHasSpentComesOutOfItsShareButNotOutOfTheBudget(t *testing.T) {
	log := append(feb(t), logOf(t, spendEntry("2027-02-16", "花费：1300 credits，份：扫描"), `{"entryDate":"2027-02-17","summary":"起草 2027-02-17：issue #9\n花费：100 credits，份：起草与验证"}`)...)
	r := budget(t, openseo(t), 20000, []string{}, log, "2027-02-18", 0)
	if r.Week.Budget != 2300 || r.Week.Shares.Scan.Spent != 1300 || r.Week.Shares.Scan.Left != 300 || r.Week.Shares.Drafting.Left != 300 {
		t.Fatalf("%+v", r.Week)
	}
	if len(allowed(r)) != 0 {
		t.Fatal("no directions asked: the week's books only")
	}
}

func TestBudgetAnUnspentPeriodIsSpreadOverTheWeeksLeft(t *testing.T) {
	r := budget(t, openseo(t), 20000, []string{"technical", "pages", "keywords", "backlinks", "geo"}, []any{}, "2027-02-15", 0)
	if r.Week.Budget != 5000 {
		t.Fatal(r.Week.Budget)
	}
	if !reflect.DeepEqual(allowed(r), map[string]float64{"technical": 434, "pages": 652, "keywords": 1304, "backlinks": 869, "geo": 0}) {
		t.Fatal(allowed(r))
	}
}

func TestBudgetAnEstimateLargerThanItsSharesRemainderIsNotRun(t *testing.T) {
	log := append(feb(t), logOf(t, spendEntry("2027-02-16", "花费：1300 credits"))...) // 扫描 left 300 of 1600
	r := budget(t, openseo(t), 20000, []string{"keywords", "technical", "pages"}, log, "2027-02-18", 0)
	if !reflect.DeepEqual(allowed(r), map[string]float64{"keywords": 0, "technical": 200, "pages": 0}) {
		t.Fatal(allowed(r))
	}
	if len(r.Skipped) != 2 || r.Skipped[0].Direction != "keywords" || r.Skipped[1].Direction != "pages" {
		t.Fatal(r.Skipped)
	}
	if !strings.Contains(r.Skipped[0].Reason, "预估 600") || !strings.Contains(r.Skipped[0].Reason, "剩余 300") {
		t.Fatal(r.Skipped[0].Reason)
	}
	if got := strings.Join(r.Allow.Keys, ","); got != "keywords,technical,pages" {
		t.Fatal("the directions come out in the order they were asked:", got)
	}
}

func TestBudgetWhatTheGateSpentEarlierComesOutOfTheScanShare(t *testing.T) {
	r := budget(t, openseo(t), 20000, []string{"technical", "pages"}, feb(t), "2027-02-15", 1500)
	if r.Week.Shares.Scan.Left != 100 || !reflect.DeepEqual(allowed(r), map[string]float64{"technical": 0, "pages": 0}) {
		t.Fatalf("%+v %v", r.Week.Shares.Scan, allowed(r))
	}
}

func TestBudgetAWeekWithNoBudgetLeftRunsFreeCallsOnly(t *testing.T) {
	r := budget(t, openseo(t), 20000, []string{"technical"}, logOf(t, spendEntry("2027-02-02", "花费：10000 credits，份：扫描")), "2027-02-15", 0)
	if r.Week.Budget != 0 || !reflect.DeepEqual(allowed(r), map[string]float64{"technical": 0}) || len(r.Skipped) != 1 {
		t.Fatalf("%+v %+v", r.Week, r.Skipped)
	}
}

func TestBudgetBelowTheFloorNothingPaidRuns(t *testing.T) {
	r := budget(t, openseo(t), 800, []string{"technical", "pages"}, []any{}, "2027-02-15", 0)
	if !reflect.DeepEqual(allowed(r), map[string]float64{"technical": 0, "pages": 0}) || len(r.Skipped) != 2 || !strings.Contains(r.Skipped[0].Reason, "余额 800 低于下限 1000") {
		t.Fatalf("%v %+v", allowed(r), r.Skipped)
	}
}

func TestBudgetNeverSpendsIntoTheFloorAndAnUnknownBalanceMeansFreeCallsOnly(t *testing.T) {
	o := openseo(t)
	scan := &ScanShares{}
	scan.set("keywords", 600)
	o.Weekly = &Weekly{Scan: scan}
	if got := allowed(budget(t, o, 1300, []string{"keywords"}, []any{}, "2027-02-15", 0)); !reflect.DeepEqual(got, map[string]float64{"keywords": 300}) {
		t.Fatal(got)
	}
	if got := budget(t, o, 1300, []string{}, []any{}, "2027-02-15", 0).Week.FloorRoom; got != 300 {
		t.Fatal(got)
	}
	r := budget(t, o, math.NaN(), []string{"keywords"}, []any{}, "2027-02-15", 0)
	if !reflect.DeepEqual(allowed(r), map[string]float64{"keywords": 0}) || !strings.Contains(r.Skipped[0].Reason, "读不到余额") {
		t.Fatal(r)
	}
	if _, err := PlanBudget(o, 5000, []string{"social"}, BudgetOpts{Log: []any{}, Today: "2027-02-15"}); err == nil || !strings.Contains(err.Error(), "social") {
		t.Fatal(err)
	}
}

func TestBudgetASeoMdWithoutThePlanIsRefusedWithTheWayOutAndABadDateIsRefused(t *testing.T) {
	floor := 1000.0
	if _, err := PlanBudget(OpenSEO{Floor: &floor}, 5000, []string{"pages"}, BudgetOpts{Log: []any{}, Today: "2027-02-15"}); err == nil || !strings.Contains(err.Error(), "套餐额度") || !strings.Contains(err.Error(), "/idea-loop:setup") {
		t.Fatal(err)
	}
	if _, err := PlanBudget(openseo(t), 5000, []string{"pages"}, BudgetOpts{Log: []any{}, Today: "15/02"}); err == nil || !strings.Contains(err.Error(), "YYYY-MM-DD") {
		t.Fatal(err)
	}
}

func TestBudgetJSONHasTheWeekAfterAllowAndSkippedInTheOldOrder(t *testing.T) {
	r := budget(t, openseo(t), 20000, []string{"technical", "pages"}, feb(t), "2027-02-15", 0)
	out := dump(r)
	for _, want := range []string{
		"{\n  \"allow\": {\n    \"technical\": 200,\n    \"pages\": 300\n  },\n  \"skipped\": [],\n  \"week\": {\n    \"period\": {\n      \"start\": \"2027-02-01\",\n      \"end\": \"2027-03-01\"\n    },\n    \"weekStart\": \"2027-02-15\",\n    \"weeksLeft\": 2,\n    \"periodSpent\": 5400,\n    \"budget\": 2300,\n    \"shares\": {\n      \"排名追踪\": {\n        \"quota\": 300,",
		"\"logKnown\": true,\n    \"logSince\": \"2027-01-28\",\n    \"floorRoom\": 19000\n  }\n}",
	} {
		if !strings.Contains(out, want) {
			t.Errorf("missing %q in\n%s", want, out)
		}
	}
}

func TestJSNumberReadsNumbersTheWayJavaScriptDoes(t *testing.T) {
	for s, want := range map[string]float64{"20000": 20000, " 12.5 ": 12.5, "1e3": 1000, "": 0, "0x10": 16, "-5": -5, ".5": 0.5} {
		if got := jsNumber(s); got != want {
			t.Errorf("%q: %v", s, got)
		}
	}
	for _, s := range []string{"x", "12px", "1,000", "NaN", "inf", "0x", "1_0"} {
		if got := jsNumber(s); !math.IsNaN(got) {
			t.Errorf("%q: %v", s, got)
		}
	}
	if !math.IsInf(jsNumber("Infinity"), 1) {
		t.Error("Infinity")
	}
}

func TestSyncIsOneWaySeoMdAddsChangesAndRemovesAndOpenSEOIsNeverReadBack(t *testing.T) {
	seo := mustParse(t, testSeoMd)
	ctx := jsonOf(t, `{"competitors":[{"id":"a","domain":"recipebox.example","name":"RecipeBox","notes":"按食材搜菜谱的订阅制 app"},{"id":"b","domain":"oldrival.example","name":"OldRival","notes":""}],"keyPages":[{"id":"c","url":"https://cookbook.example/pricing","topic":"recipe app"}]}`)
	plan, err := Sync(seo, ctx)
	if err != nil {
		t.Fatal(err)
	}
	got := stringify(plan.Updates)
	want := `[{"addCompetitors":[{"domain":"panfry.example","name":"PanFry"}]},{"removeCompetitors":["oldrival.example"]},{"addKeyPages":[{"url":"https://cookbook.example/pricing","topic":"recipe app subscription"},{"url":"https://cookbook.example/blog/weeknight-dinners"}]}]`
	if got != want {
		t.Fatalf("\n%s\n%s", got, want)
	}
	if !strings.Contains(plan.Summary, "加竞品 panfry.example") || !strings.Contains(plan.Summary, "删竞品 oldrival.example") {
		t.Fatal(plan.Summary)
	}
}

func TestSyncAlreadyInSyncPlansNothingDomainCaseWwwAndTrailingSlashDoNotCount(t *testing.T) {
	seo := mustParse(t, "## 竞品\n- `recipebox.example`：RecipeBox\n## 重点页面\n- `https://cookbook.example/pricing`\n")
	ctx := jsonOf(t, `{"competitors":[{"domain":"www.RecipeBox.example/","name":"RecipeBox","notes":""}],"keyPages":[{"url":"https://cookbook.example/pricing/","topic":"anything"}]}`)
	plan, err := Sync(seo, ctx)
	if err != nil || len(plan.Updates) != 0 || plan.Summary != "竞品和重点页面与 SEO.md 一致" {
		t.Fatalf("%+v %v", plan, err)
	}
	if stringify(plan) != `{"updates":[],"summary":"竞品和重点页面与 SEO.md 一致"}` {
		t.Fatal(stringify(plan))
	}
}

func auditPage(url string, over map[string]any) any {
	o := NewObj()
	o.Set("url", url)
	o.Set("statusCode", float64(200))
	o.Set("title", "Pricing")
	o.Set("metaDescription", "Plans")
	o.Set("isIndexable", true)
	o.Set("inSitemap", true)
	for k, v := range over {
		o.Set(k, v)
	}
	return o
}

func audit(extra map[string]any, pages ...any) any {
	o := NewObj()
	for k, v := range extra {
		o.Set(k, v)
	}
	o.Set("pages", pages)
	return o
}

var fixedNow = time.Date(2026, 11, 19, 12, 0, 0, 0, time.UTC)

func TestBaselineAKeyPageTurningNonIndexableIsSevereAChangedTitleIsAWarning(t *testing.T) {
	seo := mustParse(t, testSeoMd)
	prev := audit(map[string]any{"auditId": "old"}, auditPage("https://cookbook.example/pricing", nil), auditPage("https://cookbook.example/blog/weeknight-dinners/", map[string]any{"title": "Weeknight"}))
	cur := audit(map[string]any{"auditId": "new", "completedAt": "2026-10-20T10:00:00Z"}, auditPage("https://cookbook.example/pricing", map[string]any{"isIndexable": false}), auditPage("https://cookbook.example/blog/weeknight-dinners", map[string]any{"title": "Weeknight dinners"}))
	out, err := Regressions(seo, prev, cur, fixedNow)
	if err != nil || len(out) != 2 {
		t.Fatal(out, err)
	}
	severe, warning := out[0], out[1]
	if severe.Kind != "key-page-regression" || !reflect.DeepEqual(severe.Targets, []string{"https://cookbook.example/pricing"}) ||
		!strings.Contains(severe.Evidence.Values, "可索引 → 不可索引") || severe.Evidence.When != "2026-10-20" || !strings.Contains(severe.Repro, "auditId old") {
		t.Fatalf("%+v", severe)
	}
	if warning.Kind != "key-page-meta-changed" || !reflect.DeepEqual(warning.Targets, []string{"https://cookbook.example/blog/weeknight-dinners"}) {
		t.Fatalf("%+v", warning)
	}
}

func TestBaselineAKeyPageMissingFromThisAuditIsSevereAndUnchangedPagesGiveNothing(t *testing.T) {
	seo := mustParse(t, "## 重点页面\n- `https://cookbook.example/pricing`\n- `https://cookbook.example/about`\n")
	prev := audit(nil, auditPage("https://cookbook.example/pricing", nil), auditPage("https://cookbook.example/about", nil))
	cur := audit(nil, auditPage("https://cookbook.example/about", nil))
	out, err := Regressions(seo, prev, cur, fixedNow)
	if err != nil || len(out) != 1 || !strings.Contains(out[0].Evidence.Values, "本次审计里没有这个页面") {
		t.Fatal(out, err)
	}
	same, err := Regressions(seo, prev, prev, fixedNow)
	if err != nil || len(same) != 0 || stringify(same) != "[]" {
		t.Fatal(same, err)
	}
}

func run(date, collected string) string {
	return fmt.Sprintf(`{"entryDate":%q,"summary":%q}`, date, fmt.Sprintf("seo-scan %s 22:05，方向：%s\n采集：%s\n花费：0 credits", date, collected, collected))
}

func dueOf(t *testing.T, today string, entries ...string) *DuePlan {
	t.Helper()
	ctx := jsonOf(t, `{"researchLog":[`+strings.Join(entries, ",")+`]}`)
	p, err := Due(ctx, today)
	if err != nil {
		t.Fatal(err)
	}
	return p
}

func TestDueAnEmptyLogRunsEverythingACollectedRunWaitsItsCadenceASkippedOneDoesNot(t *testing.T) {
	all := []string{"technical", "pages", "keywords", "backlinks", "geo", "results"}
	if got := dueOf(t, "2026-10-25").Due; !reflect.DeepEqual(got, all) {
		t.Fatal(got)
	}
	r := dueOf(t, "2026-10-25",
		run("2026-10-23", "technical 3 条；pages 2 条；results 1 条"),
		run("2026-10-04", "technical 1 条；pages 0 条；keywords 4 条；backlinks 未采集（数据源不可用）；geo 0 条"),
		`{"entryDate":"2026-10-10","summary":"Keyword research: weeknight dinners. Verdict: ..."}`)
	if stringify(r.Last) != `{"technical":"2026-10-23","pages":"2026-10-23","keywords":"2026-10-04","backlinks":null,"geo":"2026-10-04","results":"2026-10-23"}` {
		t.Fatal(stringify(r.Last))
	}
	if !reflect.DeepEqual(r.Due, []string{"keywords", "backlinks", "geo"}) {
		t.Fatal(r.Due)
	}
}

func TestDueResultsEveryThreeDaysTheOtherFiveEverySeven(t *testing.T) {
	log := []string{run("2026-10-22", "results 2 条"), run("2026-10-19", "technical 1 条")}
	r := dueOf(t, "2026-10-25", append(log, run("2026-10-10", "pages 1 条；keywords 1 条；backlinks 1 条；geo 1 条"))...)
	if !contains(r.Due, "results") || contains(r.Due, "technical") {
		t.Fatal(r.Due)
	}
	if later := dueOf(t, "2026-10-26", log...); !contains(later.Due, "technical") {
		t.Fatal("technical ran 7 days ago")
	}
	if contains(dueOf(t, "2026-10-25", run("2026-10-23", "results 1 条")).Due, "results") {
		t.Fatal("results ran 2 days ago")
	}
}

func TestDueADayIsACalendarDateAndABadDateIsRefused(t *testing.T) {
	log := run("2026-10-18", "technical 1 条；pages 1 条")
	if got := dueOf(t, "2026-10-25", log).Due[:2]; !reflect.DeepEqual(got, []string{"technical", "pages"}) {
		t.Fatal(got)
	}
	if contains(dueOf(t, "2026-10-24", log).Due, "technical") {
		t.Fatal("6 days is not due")
	}
	if _, err := Due(jsonOf(t, `{}`), "10/25"); err == nil || !strings.Contains(err.Error(), "YYYY-MM-DD") {
		t.Fatal(err)
	}
	if got := dueOf(t, "2026-10-26", run("2026-10-25", "technical 1 条；pages 1 条；keywords 1 条；backlinks 1 条；geo 1 条；results 1 条")).Due; len(got) != 0 {
		t.Fatal(got)
	}
	if b, _ := json.Marshal(dueOf(t, "2026-10-26", run("2026-10-25", "technical 1 条；pages 1 条；keywords 1 条；backlinks 1 条；geo 1 条；results 1 条"))); !strings.Contains(string(b), `"due":[]`) {
		t.Fatal(string(b))
	}
}

func seoFor(competitors, brand string) *SeoMd {
	s, _ := ParseSeoMd("# SEO\n\n## 竞品\n" + competitors + "\n\n## 品牌\n" + brand + "\n")
	return s
}

const gapsContext = `{"structuredContent":{"sections":{"business_overview":"菜谱网站，面向下班后要快手做晚饭的上班族。","current_goal":"","positioning":""},"missingSections":["current_goal","positioning"]}}`

func gapItems(r *GapsReport) []string {
	out := []string{}
	for _, g := range r.Gaps {
		out = append(out, g.Item)
	}
	return out
}

func TestGapsCompetitorsEmptyBrandNoneOverviewPresentPositioningEmpty(t *testing.T) {
	r, err := Gaps(seoFor("", "- 品牌词：无"), jsonOf(t, gapsContext), []string{"pages", "backlinks"})
	if err != nil {
		t.Fatal(err)
	}
	want := []Gap{{"competitors", "竞品", "SEO.md", []string{"pages", "backlinks"}}, {"positioning", "定位", "OpenSEO 项目上下文", []string{"backlinks"}}}
	if !reflect.DeepEqual(r.Gaps, want) || !r.ContextChecked {
		t.Fatalf("%+v", r)
	}
	if r, _ := Gaps(seoFor("", "- 品牌词：无"), jsonOf(t, gapsContext), []string{"technical"}); len(r.Gaps) != 0 {
		t.Fatal("technical only needs the overview, which is there:", r.Gaps)
	}
}

func TestGapsAnUnreadableContextChecksOnlyTheSeoMdItems(t *testing.T) {
	for _, ctx := range []any{nil, "not an object", jsonOf(t, `[1]`)} {
		r, err := Gaps(seoFor("", ""), ctx, []string{"pages", "keywords", "backlinks"})
		if err != nil || !reflect.DeepEqual(gapItems(r), []string{"competitors", "brand_terms"}) || r.ContextChecked {
			t.Fatalf("%v: %+v %v", ctx, r, err)
		}
	}
}

func TestGapsNoDirectionsGeoAndWrittenNoneAreNoGaps(t *testing.T) {
	if r, _ := Gaps(seoFor("", ""), jsonOf(t, gapsContext), []string{}); len(r.Gaps) != 0 || stringify(r.Directions) != "[]" {
		t.Fatal(r)
	}
	if r, _ := Gaps(seoFor("", ""), jsonOf(t, gapsContext), []string{"geo"}); len(r.Gaps) != 0 {
		t.Fatal(r)
	}
	r, _ := Gaps(seoFor("- 无", "- 说明：随便"), jsonOf(t, gapsContext), []string{"pages"})
	if !reflect.DeepEqual(gapItems(r), []string{"brand_terms"}) {
		t.Fatal(gapItems(r))
	}
}

func TestGapsEachGapCarriesTheDirectionsThatNeedIt(t *testing.T) {
	ctx := jsonOf(t, `{"structuredContent":{"sections":{},"missingSections":["business_overview","current_goal"]}}`)
	r, _ := Gaps(seoFor("- `recipebox.example`：RecipeBox", "- 品牌词：`cookbook`"), ctx, []string{"technical", "keywords"})
	want := []Gap{{"business_overview", "业务概述", "OpenSEO 项目上下文", []string{"technical", "keywords"}}, {"current_goal", "当前目标", "OpenSEO 项目上下文", []string{"keywords"}}}
	if !reflect.DeepEqual(r.Gaps, want) {
		t.Fatalf("%+v", r.Gaps)
	}
}

func TestGapsContextSectionsMayBeContentObjectsOrTopLevelKeysAndBlankIsEmpty(t *testing.T) {
	ctx := jsonOf(t, `{"business_overview":{"content":"菜谱网站"},"current_goal":"半年内订阅翻倍","positioning":"   "}`)
	r, _ := Gaps(seoFor("- 无", "- 品牌词：无"), ctx, []string{"technical", "keywords", "backlinks"})
	if !reflect.DeepEqual(gapItems(r), []string{"positioning"}) {
		t.Fatal(gapItems(r))
	}
}

func TestGapsAnUnknownDirectionIsAnError(t *testing.T) {
	if _, err := Gaps(seoFor("", ""), jsonOf(t, gapsContext), []string{"social"}); err == nil || !strings.Contains(err.Error(), "social") {
		t.Fatal(err)
	}
	if _, err := Gaps(mustParse(t, testSeoMd), nil, []string{"nonsense"}); err == nil || !strings.Contains(err.Error(), "不认识的方向") {
		t.Fatal(err)
	}
	if r, err := Gaps(mustParse(t, testSeoMd), nil, []string{"results"}); err != nil || len(r.Gaps) != 0 {
		t.Fatal("the report needs no project facts", r, err)
	}
	if r := budget(t, openseo(t), 20000, []string{"results"}, []any{}, "2027-02-15", 0); allowed(r)["results"] <= 0 {
		t.Fatal("results has an allocation of its own")
	}
}

func TestGapsAContextSectionWrittenNoneMeansAskedAndNotNeededInEveryShape(t *testing.T) {
	shapes := []string{
		`{"business_overview":"无","current_goal":"无","positioning":"无"}`,
		`{"business_overview":{"content":"无"},"current_goal":{"content":" 无 "},"positioning":{"content":"无"}}`,
		`{"structuredContent":{"sections":{"business_overview":"无","current_goal":"无","positioning":"无"},"missingSections":[]}}`,
		`{"sections":[{"section":"business_overview","content":"无"},{"key":"current_goal","content":"无"},{"name":"positioning","content":"无"}]}`,
	}
	for _, s := range shapes {
		r, err := Gaps(seoFor("- 无", "- 品牌词：无"), jsonOf(t, s), []string{"technical", "keywords", "backlinks"})
		if err != nil || len(r.Gaps) != 0 {
			t.Errorf("%s: %+v %v", s, r, err)
		}
	}
	r, _ := Gaps(seoFor("- 无", "- 品牌词：无"), jsonOf(t, `{"business_overview":"无","current_goal":"  ","positioning":"无"}`), []string{"keywords"})
	if !reflect.DeepEqual(gapItems(r), []string{"current_goal"}) {
		t.Fatal(gapItems(r))
	}
}
