package seo

import (
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"
)

const (
	enTitle = "Weeknight dinner ideas that take thirty minutes or less"
	enDesc  = "Thirty quick weeknight dinners with a shopping list for each, tested in a small kitchen, plus what to swap when an ingredient is missing from the shelf."
)

type pageOpts struct{ lang, title, desc, canonical, extra string }

func html(o pageOpts) string {
	if o.lang == "" {
		o.lang = "en"
	}
	if o.canonical == "" {
		o.canonical = "https://cookbook.example/"
	}
	return `<!doctype html><html lang="` + o.lang + `"><head><title>` + o.title + `</title><meta name="description" content="` + o.desc + `"><link rel="canonical" href="` + o.canonical + `">` + o.extra + `</head><body><h1>` + o.title + `</h1></body></html>`
}

func en(o pageOpts) pageOpts {
	if o.title == "" {
		o.title = enTitle
	}
	if o.desc == "" {
		o.desc = enDesc
	}
	return o
}

func site(t *testing.T, pages map[string]string) string {
	t.Helper()
	root := t.TempDir()
	for route, text := range pages {
		dir := filepath.Join(root, route)
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(dir, "index.html"), []byte(text), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	return root
}

func sevs(fs []FindingLine) []string {
	out := []string{}
	for _, f := range fs {
		out = append(out, f.Sev)
	}
	return out
}

func hasFinding(fs []FindingLine, sev, platform, msg string) bool {
	for _, f := range fs {
		if f.Sev == sev && (platform == "" || f.Platform == platform) && strings.Contains(f.Msg, msg) {
			return true
		}
	}
	return false
}

func checkOf(t *testing.T, dist, filter string, th Thresholds) *CheckResult {
	t.Helper()
	r, err := Check(dist, filter, th)
	if err != nil {
		t.Fatal(err)
	}
	return r
}

func TestWidthCountsCJKDouble(t *testing.T) {
	if VisualWidth("abc") != 3 || VisualWidth("菜谱") != 4 {
		t.Fatal(VisualWidth("abc"), VisualWidth("菜谱"))
	}
	// the old script's fifth range starts at U+8C48, so Korean counts double too; kept
	if VisualWidth("한") != 2 || VisualWidth("ａ") != 2 {
		t.Fatal("Hangul and full-width Latin count double")
	}
}

func TestACleanEnglishPageHasNoWarningsOrErrors(t *testing.T) {
	dist := site(t, map[string]string{"": html(en(pageOpts{}))})
	for _, s := range sevs(checkOf(t, dist, "", DefaultThresholds).Report[0].Findings) {
		if s == "error" || s == "warn" {
			t.Fatal(s)
		}
	}
}

func TestAChineseTitleWhoseWidthIsFineOnlyGetsTheBingFalsePositiveInfo(t *testing.T) {
	zhTitle := "三十分钟以内就能做好的工作日晚餐菜谱合集与采购清单"
	zhDesc := "三十道工作日快手晚餐，每道附采购清单，都在小厨房里实测过；缺了某样食材时用什么替换也写清楚，照着做当晚就能开饭，不用再跑一趟超市，周末也能提前备好。"
	dist := site(t, map[string]string{"zh": html(pageOpts{lang: "zh-CN", title: zhTitle, desc: zhDesc, canonical: "https://cookbook.example/zh"})})
	f := checkOf(t, dist, "", DefaultThresholds).Report[0].Findings
	if hasFinding(f, "warn", "", "Title") || !hasFinding(f, "info", "Bing", "title too short") {
		t.Fatal(f)
	}
}

func TestAnOverWideDescriptionIsAnErrorAndAnArgumentCanRaiseTheLimit(t *testing.T) {
	long := enDesc + " And one more sentence that pushes it well past the limit."
	dist := site(t, map[string]string{"": html(en(pageOpts{desc: long}))})
	if !hasFinding(checkOf(t, dist, "", DefaultThresholds).Report[0].Findings, "error", "", "Description wide") {
		t.Fatal("over-wide description")
	}
	opts, err := ParseCheckArgs([]string{dist, "--desc-max=400"})
	if err != nil {
		t.Fatal(err)
	}
	for _, s := range sevs(checkOf(t, dist, "", opts.T).Report[0].Findings) {
		if s == "error" {
			t.Fatal("the raised limit holds")
		}
	}
}

func TestDuplicateCanonicalsAndMalformedJSONLDAreErrorsFAQPageIsOnlyInfo(t *testing.T) {
	dist := site(t, map[string]string{
		"a": html(en(pageOpts{canonical: "https://cookbook.example/a", extra: `<link rel="canonical" href="https://cookbook.example/b">`})),
		"b": html(en(pageOpts{canonical: "https://cookbook.example/b", extra: `<script type="application/ld+json">{broken</script>`})),
		"c": html(en(pageOpts{canonical: "https://cookbook.example/c", extra: `<script type="application/ld+json">{"@type":"FAQPage"}</script>`})),
	})
	by := map[string][]FindingLine{}
	for _, r := range checkOf(t, dist, "", DefaultThresholds).Report {
		by[r.Route] = r.Findings
	}
	if !hasFinding(by["/a"], "error", "", "Multiple rel=canonical") || !hasFinding(by["/b"], "error", "", "Malformed JSON-LD") || !hasFinding(by["/c"], "info", "", "FAQPage") {
		t.Fatal(by)
	}
	if hasFinding(by["/c"], "error", "", "") {
		t.Fatal("FAQPage is harmless")
	}
}

func TestHreflangMustBeReciprocal(t *testing.T) {
	dist := site(t, map[string]string{
		"":   html(en(pageOpts{canonical: "https://cookbook.example", extra: `<link rel="alternate" hreflang="zh-CN" href="https://cookbook.example/zh">`})),
		"zh": html(en(pageOpts{lang: "zh-CN", canonical: "https://cookbook.example/zh"})),
	})
	for _, r := range checkOf(t, dist, "", DefaultThresholds).Report {
		if r.Route == "/" {
			if !hasFinding(r.Findings, "warn", "", "not reciprocal") {
				t.Fatal(r.Findings)
			}
			return
		}
	}
	t.Fatal("no / route")
}

func TestFilterNarrowsTheReportAndTheExitCodeNotTheScan(t *testing.T) {
	dist := site(t, map[string]string{"ok": html(en(pageOpts{canonical: "https://cookbook.example/ok"})), "bad": html(pageOpts{canonical: "https://cookbook.example/bad", desc: enDesc})})
	res := checkOf(t, dist, "ok", DefaultThresholds)
	if len(res.Pages) != 2 {
		t.Fatal(len(res.Pages))
	}
	if _, code := Render(dist, res, false, "ok"); code != 0 {
		t.Fatal("the bad page is not reported")
	}
	if _, code := Render(dist, checkOf(t, dist, "", DefaultThresholds), false, ""); code != 1 {
		t.Fatal("the bad page is reported")
	}
}

func TestRunCheckExitsOneOnErrorsAndTwoOnAMissingDirectoryOrAFilterWithNoRoute(t *testing.T) {
	dist := site(t, map[string]string{"": html(pageOpts{desc: enDesc})})
	if out, _, code := RunCheck(CheckOpts{Dist: dist, T: DefaultThresholds}); code != 1 || !strings.Contains(out, "Missing <title>") {
		t.Fatal(out, code)
	}
	if _, errs, code := RunCheck(CheckOpts{Dist: filepath.Join(dist, "nope"), T: DefaultThresholds}); code != 2 || !strings.Contains(errs, "产物目录不存在") {
		t.Fatal(errs, code)
	}
	if _, errs, code := RunCheck(CheckOpts{Dist: dist, Filter: "zzz", T: DefaultThresholds}); code != 2 || !strings.Contains(errs, "--filter=zzz") {
		t.Fatal(errs, code)
	}
	if _, err := ParseCheckArgs([]string{dist, "--lang=zh"}); err == nil || !strings.Contains(err.Error(), "不认识的参数") {
		t.Fatal(err)
	}
	if _, err := ParseCheckArgs([]string{dist, "other"}); err == nil || !strings.Contains(err.Error(), "多余的参数") {
		t.Fatal(err)
	}
	if _, err := ParseCheckArgs([]string{"--strict"}); err == nil || !strings.Contains(err.Error(), "usage") {
		t.Fatal(err)
	}
}

func TestRoutesAreOrderedTheWayLocaleCompareDoes(t *testing.T) {
	paths := []string{"/a", "/B", "/a-b", "/ab", "/a_b", "/a/b", "/1", "/a1", "/blog", "/blog/x", "/blog-x", "/zh"}
	pages := map[string]string{}
	for _, p := range paths {
		pages[strings.TrimPrefix(p, "/")] = html(en(pageOpts{canonical: "https://cookbook.example" + p}))
	}
	var got []string
	for _, r := range checkOf(t, site(t, pages), "", DefaultThresholds).Pages {
		got = append(got, r.Path)
	}
	want := []string{"/1", "/a", "/a_b", "/a-b", "/a/b", "/a1", "/ab", "/B", "/blog", "/blog-x", "/blog/x", "/zh"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("%v\n%v", got, want)
	}
	// two routes that differ only in case cannot share a directory on a case-insensitive disk, so the tie-break is checked on the function
	if !localeLess("/a", "/A") || localeLess("/A", "/a") || !localeLess("/A", "/a_b") || localeLess("/a", "/a") {
		t.Fatal("lower case first when nothing else differs, and only then")
	}
}

func TestHookHelpersTouchedSinceAndErrorsOnly(t *testing.T) {
	dist := site(t, map[string]string{"": html(en(pageOpts{}))})
	f := filepath.Join(dist, "index.html")
	old := time.Now().Add(-time.Minute)
	if err := os.Chtimes(f, old, old); err != nil {
		t.Fatal(err)
	}
	if TouchedSince(dist, float64(time.Now().UnixMilli()-1000)) {
		t.Fatal("nothing was written in the last second")
	}
	if TouchedSince(filepath.Join(dist, "missing"), 0) {
		t.Fatal("a missing directory was not touched")
	}
	if !TouchedSince(dist, 0) {
		t.Fatal("everything is newer than the epoch")
	}
	report := "  /a\n    [WARN ] [Bing] Title thin\n  /b\n    [ERROR] [Both] Missing <title>.\nSummary: 1 error"
	if got := ErrorsOnly(report); got != "/b\n    [ERROR] [Both] Missing <title>.\nSummary: 1 error" {
		t.Fatal(got)
	}
}

func TestJudgeScopeAPRTouchingABlogPostAndATsxIsNotContentOnly(t *testing.T) {
	blog := []string{"apps/site/src/content/blog/"}
	r := JudgeScope([]string{"apps/site/src/content/blog/weeknight-dinners.md", "apps/site/src/components/Hero.tsx"}, blog)
	if r.ContentOnly || !reflect.DeepEqual(r.Outside, []string{"apps/site/src/components/Hero.tsx"}) {
		t.Fatal(r)
	}
	r = JudgeScope([]string{"apps/site/src/content/blog/a.md", "apps/site/src/content/blog/img/b.png"}, blog)
	if !r.ContentOnly || len(r.Outside) != 0 {
		t.Fatal(r)
	}
}

func TestJudgeScopeCodeFilesAreContentOnlyWhenListedExplicitly(t *testing.T) {
	blog := []string{"apps/site/src/content/blog/"}
	css := "apps/site/src/styles/blog.css"
	if JudgeScope([]string{css}, blog).ContentOnly || !JudgeScope([]string{css}, []string{css}).ContentOnly {
		t.Fatal("css")
	}
	if !JudgeScope([]string{"apps/site/src/lib/analytics.ts"}, []string{"apps/site/src/lib/analytics.ts"}).ContentOnly {
		t.Fatal("ts")
	}
}

func TestGlobsStarStaysInOneDirectoryDoubleStarCrossesAndADirectoryCoversWhatIsUnderIt(t *testing.T) {
	for _, c := range []struct {
		file string
		glob string
		want bool
		why  string
	}{
		{"public/robots.txt", "public/robots.txt", true, ""},
		{"public/images/a/b.webp", "public/images/**", true, ""},
		{"public/images/a/b.webp", "public/images/*.webp", false, "* does not cross a directory"},
		{"public/images/b.webp", "public/images/*.webp", true, ""},
		{"apps/site/public/llms.txt", "**/llms.txt", true, ""},
		{"llms.txt", "**/llms.txt", true, ""},
		{"public/images/a/b.webp", "public/images", true, "a directory without a slash covers its files"},
		{"public/images-old/b.webp", "public/images", false, "only at a path boundary"},
	} {
		if got := Matches(c.file, []string{c.glob}); got != c.want {
			t.Errorf("%s vs %s: %v (%s)", c.file, c.glob, got, c.why)
		}
	}
}

func TestDocsAndSeoMdAreNotContent(t *testing.T) {
	blog := []string{"apps/site/src/content/blog/"}
	if JudgeScope([]string{"docs/spec/x/x.md"}, nil).ContentOnly || JudgeScope([]string{"SEO.md"}, blog).ContentOnly {
		t.Fatal("docs/ and SEO.md live in the project directory")
	}
	if got := JudgeScope([]string{"docs/a.md", "SEO.md"}, blog).Outside; !reflect.DeepEqual(got, []string{"docs/a.md", "SEO.md"}) {
		t.Fatal(got)
	}
}

func TestAPathThatClimbsOutWithDotDotIsNeverContentAndALeadingDotSlashIsSpelling(t *testing.T) {
	if JudgeScope([]string{"content/../src/App.tsx"}, []string{"content"}).ContentOnly || !JudgeScope([]string{"./content/a.md"}, []string{"content"}).ContentOnly {
		t.Fatal("dot dot / dot slash")
	}
}

func TestAnEmptyChangeListIsNotContentOnly(t *testing.T) {
	got := stringify(JudgeScope(nil, []string{"apps/site/src/content/blog/"}))
	if got != `{"contentOnly":false,"files":0,"outside":[],"reason":"没有改动文件"}` {
		t.Fatal(got)
	}
	if got := stringify(JudgeScope([]string{"a.md", "b.tsx"}, []string{"a.md"})); got != `{"contentOnly":false,"files":2,"outside":["b.tsx"]}` {
		t.Fatal(got)
	}
}

// git in a temp repo, for the --base reading and a rename counting under its old name too (see cmd_test in package app).
func gitRun(t *testing.T, dir string, args ...string) {
	t.Helper()
	cmd := exec.Command("git", append([]string{"-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false"}, args...)...)
	cmd.Dir = dir
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("git %v: %v\n%s", args, err, out)
	}
}
