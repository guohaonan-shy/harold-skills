package seo

import (
	"reflect"
	"strings"
	"testing"
)

const testSeoMd = "# SEO\n\n说明文字可以写在这里，脚本不读。\n\n" +
	"## 站点\n- 域名：`cookbook.example`\n- 语言：`en` → `/`；`zh-CN` → `/zh/`\n- Search Console：`sc-domain:cookbook.example`\n\n" +
	"## OpenSEO\n- 项目：`00000000-0000-4000-8000-000000000000`\n- 余额下限：1000\n- 套餐额度：每月 10000，每月 1 日重置\n- 每周分配：排名追踪 300；扫描 technical 200，pages 300，keywords 600，backlinks 400，geo 0，results 100；起草与验证 400\n\n" +
	"## 竞品\n- `recipebox.example`：RecipeBox，按食材搜菜谱的订阅制 app\n- `panfry.example`：PanFry\n\n" +
	"## 重点页面\n- `https://cookbook.example/pricing`：头词 `recipe app subscription`\n- `https://cookbook.example/blog/weeknight-dinners`\n\n" +
	"## 构建与检查\n- 产物目录：`apps/site/dist`\n- 检查参数：`--title-max=70 --desc-max=160`\n- 内容路径：`apps/site/src/content/blog/`；`apps/site/public/images/**`；`apps/site/public/llms.txt`\n\n" +
	"## 写作\n- 文风：`docs/reference/voice.md`\n- 类型字段：`category`\n- 类型映射：`COMPARISON` → 对比与研究；`HOW-TO` → 教程\n\n" +
	"## 品牌\n- 品牌词：`cookbook`；`cook book`\n"

func mustParse(t *testing.T, md string) *SeoMd {
	t.Helper()
	s, err := ParseSeoMd(md)
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func str1(s *string) string {
	if s == nil {
		return "<nil>"
	}
	return *s
}

func TestSeoMdSectionsParseIntoTheShapeTheCommandsRead(t *testing.T) {
	s := mustParse(t, testSeoMd)
	if str1(s.Site.Domain) != "cookbook.example" {
		t.Fatal(str1(s.Site.Domain))
	}
	if !reflect.DeepEqual(s.Site.Languages, []Language{{"en", "/"}, {"zh-CN", "/zh/"}}) {
		t.Fatal(s.Site.Languages)
	}
	if str1(s.OpenSEO.ProjectID) != "00000000-0000-4000-8000-000000000000" || *s.OpenSEO.Floor != 1000 || *s.OpenSEO.Monthly != 10000 || *s.OpenSEO.ResetDay != 1 {
		t.Fatalf("%+v", s.OpenSEO)
	}
	w := s.OpenSEO.Weekly
	if w.Tracking != 300 || w.Drafting != 400 || strings.Join(w.Scan.Keys, ",") != "technical,pages,keywords,backlinks,geo,results" || w.Scan.Get("keywords") != 600 || w.Scan.Get("geo") != 0 {
		t.Fatalf("%+v %+v", w, w.Scan)
	}
	if !reflect.DeepEqual(s.Competitors, []Competitor{{"recipebox.example", "RecipeBox", "按食材搜菜谱的订阅制 app"}, {"panfry.example", "PanFry", ""}}) {
		t.Fatal(s.Competitors)
	}
	if len(s.KeyPages) != 2 || str1(s.KeyPages[0].Keyword) != "recipe app subscription" || s.KeyPages[1].Keyword != nil {
		t.Fatal(s.KeyPages)
	}
	if str1(s.Build.DistDir) != "apps/site/dist" || !reflect.DeepEqual(s.Build.CheckArgs, []string{"--title-max=70", "--desc-max=160"}) ||
		!reflect.DeepEqual(s.Build.ContentPaths, []string{"apps/site/src/content/blog/", "apps/site/public/images/**", "apps/site/public/llms.txt"}) || s.Build.LiveWait != 30 {
		t.Fatalf("%+v", s.Build)
	}
	if !reflect.DeepEqual(s.Writing.TypeMap.Keys, []string{"COMPARISON", "HOW-TO"}) || s.Writing.TypeMap.Vals["HOW-TO"] != "教程" {
		t.Fatal(s.Writing.TypeMap)
	}
	if !reflect.DeepEqual(s.Brand.Terms, []string{"cookbook", "cook book"}) {
		t.Fatal(s.Brand.Terms)
	}
}

func TestContentPathsAreAListOfGlobsAndAProjectThatDidNotWriteThemHasNone(t *testing.T) {
	for md, want := range map[string][]string{
		"## 构建与检查\n- 产物目录：`dist`\n":            {},
		"## 构建与检查\n- 内容路径：无\n":                 {},
		"## 构建与检查\n- 内容路径：`content/**/*.md`\n": {"content/**/*.md"},
	} {
		if got := mustParse(t, md).Build.ContentPaths; !reflect.DeepEqual(got, want) {
			t.Errorf("%q: %v", md, got)
		}
	}
}

func TestLiveWaitIsMinutesAndNotWrittenOrNotPositiveReadsAsThirty(t *testing.T) {
	wait := func(v string) float64 {
		extra := ""
		if v != "" {
			extra = "- 上线等待：" + v + "\n"
		}
		return mustParse(t, "## 构建与检查\n- 产物目录：`dist`\n"+extra).Build.LiveWait
	}
	for v, want := range map[string]float64{"": 30, "45": 45, "10 分钟": 10, "无": 30, "0": 30, "很久": 30} {
		if got := wait(v); got != want {
			t.Errorf("上线等待 %q: %v", v, got)
		}
	}
	if mustParse(t, "# SEO\n").Build.LiveWait != 30 {
		t.Error("no section at all")
	}
}

func TestPrinciplesReadOnePerLineWithTheirSource(t *testing.T) {
	md := "## 内容原则\n每行一条：原则（出处：人的原话或 issue 号）\n- 数据只当佐证，不罗列（出处：#12，「数据只当佐证」）\n- 拿不出能直接练的东西、跟已有文章大面积重合的，不开新页（出处：#30）\n- 没写出处的也读得出\n- 无\n"
	want := []Principle{
		{"数据只当佐证，不罗列", "#12，「数据只当佐证」"},
		{"拿不出能直接练的东西、跟已有文章大面积重合的，不开新页", "#30"},
		{"没写出处的也读得出", ""},
	}
	if got := mustParse(t, md).Principles; !reflect.DeepEqual(got, want) {
		t.Fatal(got)
	}
	for _, md := range []string{"# SEO\n\n## 站点\n- 域名：`cookbook.example`\n", "## 内容原则\n\n## 品牌\n- 品牌词：`cookbook`\n", testSeoMd} {
		if got := mustParse(t, md).Principles; len(got) != 0 {
			t.Errorf("%q: %v", md, got)
		}
	}
	s := mustParse(t, "## 内容原则\n- 写短句（出处：#1）\n\n## 品牌\n- 品牌词：`cookbook`\n")
	if !reflect.DeepEqual(s.Principles, []Principle{{"写短句", "#1"}}) || !reflect.DeepEqual(s.Brand.Terms, []string{"cookbook"}) {
		t.Fatal("neighbouring sections leak into each other")
	}
}

func TestBrandTermsAreReadFromBackticksAndConfirmedWhenWrittenOrNone(t *testing.T) {
	for _, md := range []string{"# SEO\n\n## 站点\n- 域名：`cookbook.example`\n", "## 品牌\n- 说明：随便写点什么\n", "## 品牌\n- 品牌词：cookbook\n", "## 品牌\n- 品牌词：\n"} {
		if got := mustParse(t, md).Brand.Terms; len(got) != 0 {
			t.Errorf("%q: %v", md, got)
		}
	}
	none := mustParse(t, "## 品牌\n- 品牌词：无\n")
	if len(none.Brand.Terms) != 0 || !none.Confirmed.BrandTerms {
		t.Error("写「无」读成没有品牌词并标成已确认")
	}
	for md, want := range map[string]bool{"## 品牌\n- 说明：随便写点什么\n": false, "# SEO\n": false, "## 品牌\n- 品牌词：cookbook\n": false, testSeoMd: true} {
		if got := mustParse(t, md).Confirmed.BrandTerms; got != want {
			t.Errorf("%q: %v", md, got)
		}
	}
}

func TestCompetitorsWrittenNoneAreConfirmedAndAnEmptySectionIsNot(t *testing.T) {
	none := mustParse(t, "## 竞品\n- 无\n\n## 品牌\n- 品牌词：无\n")
	if len(none.Competitors) != 0 || !none.Confirmed.Competitors {
		t.Error("`- 无` reads as confirmed")
	}
	for md, want := range map[string]bool{"## 竞品\n\n## 品牌\n": false, "# SEO\n": false, testSeoMd: true} {
		if got := mustParse(t, md).Confirmed.Competitors; got != want {
			t.Errorf("%q: %v", md, got)
		}
	}
}

func TestMissingSectionsReadAsEmptyAndAnUnknownPageTypeIsRefused(t *testing.T) {
	s := mustParse(t, "# SEO\n\n## 站点\n- 域名：`cookbook.example`\n")
	if len(s.Competitors) != 0 || s.Build.DistDir != nil {
		t.Fatal(s)
	}
	if _, err := ParseSeoMd("## 写作\n- 类型映射：`X` → 杂谈\n"); err == nil || !strings.Contains(err.Error(), "杂谈") {
		t.Fatal(err)
	}
}

func TestPlanAndWeeklyAllocationReadAsNumbersAndAPartLeftOutIsNotAllocated(t *testing.T) {
	s := mustParse(t, "## OpenSEO\n- 套餐额度：每月 10,000，每月 31 日重置\n- 每周分配：扫描 pages 300\n")
	if *s.OpenSEO.Monthly != 10000 || *s.OpenSEO.ResetDay != 31 {
		t.Fatalf("%+v", s.OpenSEO)
	}
	w := s.OpenSEO.Weekly
	if w.Tracking != 0 || w.Drafting != 0 || strings.Join(w.Scan.Keys, ",") != "pages" || w.Scan.Get("pages") != 300 {
		t.Fatal(w)
	}
	n := mustParse(t, "## OpenSEO\n- 余额下限：1000\n").OpenSEO
	if n.Monthly != nil || n.ResetDay != nil || n.Weekly != nil {
		t.Fatal(n)
	}
}

func TestTheOldPerRunQuotaKeyIsRefusedWithTheWayToMigrate(t *testing.T) {
	for _, md := range []string{"## OpenSEO\n- 单次额度：technical 200，pages 300\n", strings.Replace(testSeoMd, "- 套餐额度", "- 单次额度：pages 300\n- 套餐额度", 1)} {
		_, err := ParseSeoMd(md)
		if err == nil || !strings.Contains(err.Error(), "单次额度") || !strings.Contains(err.Error(), "/idea-loop:seo-setup") {
			t.Errorf("%v", err)
		}
	}
}

func TestAnAllocationThatNamesSomethingUnknownOrAResetDayThatIsNotADayIsRefused(t *testing.T) {
	for md, word := range map[string]string{
		"## OpenSEO\n- 每周分配：扫描 social 100\n":      "social",
		"## OpenSEO\n- 每周分配：社交 100\n":             "社交",
		"## OpenSEO\n- 套餐额度：每月 10000，每月 32 日重置\n": "32",
	} {
		if _, err := ParseSeoMd(md); err == nil || !strings.Contains(err.Error(), word) {
			t.Errorf("%q: %v", md, err)
		}
	}
}

func TestAnalyticsIsOptionalAndNoneOrEmptyReadAsNone(t *testing.T) {
	md := "## 分析\n- 工具：PostHog\n- 项目：`12345`\n- dashboard：`https://analytics.example/project/12345/dashboard/7`\n"
	a := mustParse(t, md).Analytics
	if str1(a.Tool) != "PostHog" || str1(a.ProjectID) != "12345" || str1(a.Dashboard) != "https://analytics.example/project/12345/dashboard/7" {
		t.Fatal(a)
	}
	for _, md := range []string{testSeoMd, "## 分析\n- 工具：无\n", "## 分析\n- 说明：随便写点什么\n"} {
		if a := mustParse(t, md).Analytics; a.Tool != nil || a.ProjectID != nil || a.Dashboard != nil {
			t.Errorf("%q: %+v", md, a)
		}
	}
	only := mustParse(t, "## 分析\n- 工具：PostHog\n").Analytics
	if str1(only.Tool) != "PostHog" || only.ProjectID != nil || only.Dashboard != nil {
		t.Fatal(only)
	}
}

func TestAnalyticsDoesNotLeakIntoItsNeighboursNorTheOtherWayRound(t *testing.T) {
	s := mustParse(t, "## 品牌\n- 品牌词：`cookbook`\n\n## 分析\n- 工具：PostHog\n- 项目：`9`\n\n## 内容原则\n- 写短句（出处：#1）\n")
	if str1(s.Analytics.Tool) != "PostHog" || str1(s.Analytics.ProjectID) != "9" || s.Analytics.Dashboard != nil {
		t.Fatal(s.Analytics)
	}
	if !reflect.DeepEqual(s.Brand.Terms, []string{"cookbook"}) || !reflect.DeepEqual(s.Principles, []Principle{{"写短句", "#1"}}) || s.OpenSEO.ProjectID != nil {
		t.Fatal(s)
	}
}

func TestResultsIsAScanDirectionOnly(t *testing.T) {
	if !reflect.DeepEqual(ScanDirections, append(append([]string{}, Directions...), "results")) || contains(Directions, "results") {
		t.Fatal(ScanDirections, Directions)
	}
}

// The JSON the parse command prints keeps the order of the old script's object keys and writes null for what is not there.
func TestParseJSONOutputKeepsTheKeyOrderAndNulls(t *testing.T) {
	out := dump(mustParse(t, "## 站点\n- 域名：`a.example`\n"))
	for _, want := range []string{
		"{\n  \"site\": {\n    \"domain\": \"a.example\",\n    \"languages\": [],\n    \"searchConsole\": null,\n    \"bing\": null\n  },\n  \"openseo\": {\n    \"projectId\": null,\n    \"floor\": null,\n    \"monthly\": null,\n    \"resetDay\": null,\n    \"weekly\": null\n  },",
		"\"build\": {\n    \"distDir\": null,\n    \"checkArgs\": [],\n    \"contentPaths\": [],\n    \"liveWait\": 30\n  },",
		"\"writing\": {\n    \"voice\": null,\n    \"failures\": null,\n    \"typeField\": null,\n    \"typeMap\": {},\n    \"lintConfig\": null,\n    \"extraLint\": null,\n    \"secondJudge\": null\n  },\n  \"images\": {\n    \"dir\": null,\n    \"tool\": null,\n    \"coverField\": null,\n    \"ogField\": null,\n    \"designMd\": null\n  },\n  \"brand\"",
		"\"confirmed\": {\n    \"competitors\": false,\n    \"brandTerms\": false,\n    \"lintConfig\": false,\n    \"extraLint\": false,\n    \"secondJudge\": false,\n    \"imageDir\": false,\n    \"imageTool\": false,\n    \"coverField\": false,\n    \"ogField\": false,\n    \"designMd\": false\n  }\n}",
	} {
		if !strings.Contains(out, want) {
			t.Errorf("missing %q in\n%s", want, out)
		}
	}
}
