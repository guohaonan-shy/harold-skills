package seo_test

import (
	"bytes"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/app"
)

// The old scripts and dyna answer the same questions about the same files: stdout is byte for byte the same and so
// is the exit code. The old scripts stay in the repository until the last ticket removes them; node is needed to
// run them, and without node (or without the old script) these tests are skipped.

type oldNew struct {
	t       *testing.T
	node    string
	scripts string
	env     []string
}

func newOldNew(t *testing.T) *oldNew {
	t.Helper()
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node is not installed")
	}
	scripts, _ := filepath.Abs(filepath.Join("..", "..", "..", "idea-loop", "scripts"))
	if _, err := os.Stat(filepath.Join(scripts, "seo-md.mjs")); err != nil {
		t.Skip("the old scripts are gone")
	}
	return &oldNew{t: t, node: node, scripts: scripts}
}

type result struct {
	stdout, stderr string
	code           int
}

func (o *oldNew) old(stdin, script string, args ...string) result {
	cmd := exec.Command(o.node, append([]string{filepath.Join(o.scripts, script)}, args...)...)
	cmd.Stdin = strings.NewReader(stdin)
	var out, errb bytes.Buffer
	cmd.Stdout, cmd.Stderr = &out, &errb
	code := 0
	if err := cmd.Run(); err != nil {
		ee, ok := err.(*exec.ExitError)
		if !ok {
			o.t.Fatal(err)
		}
		code = ee.ExitCode()
	}
	return result{out.String(), errb.String(), code}
}

func (o *oldNew) new(stdin string, args ...string) result {
	var out, errb bytes.Buffer
	code := app.Run(append([]string{"seo"}, args...), app.IO{Stdin: strings.NewReader(stdin), Stdout: &out, Stderr: &errb})
	return result{out.String(), errb.String(), code}
}

// same runs both and fails when stdout or the exit code differ; withStderr also compares stderr.
func (o *oldNew) same(withStderr bool, stdin, script string, args []string, newArgs ...string) {
	o.t.Helper()
	a, b := o.old(stdin, script, args...), o.new(stdin, newArgs...)
	label := fmt.Sprintf("%s %v", script, args)
	if a.code != b.code {
		o.t.Errorf("%s: exit code old %d, new %d\nold stderr: %s\nnew stderr: %s", label, a.code, b.code, a.stderr, b.stderr)
		return
	}
	if a.stdout != b.stdout {
		o.t.Errorf("%s: stdout differs\n--- old\n%s\n--- new\n%s", label, a.stdout, b.stdout)
	}
	if withStderr && strings.TrimSpace(a.stderr) != strings.TrimSpace(b.stderr) {
		o.t.Errorf("%s: stderr differs\n--- old\n%s\n--- new\n%s", label, a.stderr, b.stderr)
	}
}

func put(t *testing.T, dir, name, text string) string {
	t.Helper()
	p := filepath.Join(dir, name)
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(p, []byte(text), 0o644); err != nil {
		t.Fatal(err)
	}
	return p
}

const fullSeoMd = "# SEO\n\n说明文字\n\n## 站点\n- 域名：`cookbook.example`\n- 语言：`en` → `/`；`zh-CN` → `/zh/`\n- Search Console：`sc-domain:cookbook.example`\n- Bing：`b-1`\n\n" +
	"## OpenSEO\n- 项目：`00000000-0000-4000-8000-000000000000`\n- 余额下限：1000\n- 套餐额度：每月 10,000，每月 1 日重置\n- 每周分配：排名追踪 300；扫描 technical 200，pages 300，keywords 600，backlinks 400，geo 0，results 100；起草与验证 400\n\n" +
	"## 竞品\n- `recipebox.example`：RecipeBox，按食材搜菜谱的订阅制 app\n- `panfry.example`：PanFry\n- 随便写的一行\n\n" +
	"## 重点页面\n- `https://cookbook.example/pricing`：头词 `recipe app subscription`\n- `https://cookbook.example/blog/weeknight-dinners`\n\n" +
	"## 构建与检查\n- 产物目录：`apps/site/dist`\n- 检查参数：`--title-max=70 --desc-max=160`\n- 内容路径：`apps/site/src/content/blog/`；`apps/site/public/images/**`；`apps/site/public/llms.txt`\n- 上线等待：45 分钟\n\n" +
	"## 写作\n- 文风：`docs/reference/voice.md`\n- 失败案例：`docs/f.md`\n- 类型字段：`category`\n- 类型映射：`COMPARISON` → 对比与研究；`HOW-TO` → 教程；`COMPARISON` → 故事\n\n" +
	"## 品牌\n- 品牌词：`cookbook`；`cook book`\n\n" +
	"## 内容原则\n- 数据只当佐证，不罗列（出处：#12，「数据只当佐证」）\n- 没写出处的也读得出\n- 无\n\n" +
	"## 分析\n- 工具：PostHog\n- 项目：`12345`\n- dashboard：https://analytics.example/7\n"

func TestParseIsTheSameAsTheOldScript(t *testing.T) {
	o := newOldNew(t)
	dir := t.TempDir()
	for name, md := range map[string]string{
		"full":      fullSeoMd,
		"empty":     "",
		"crlf":      strings.ReplaceAll(fullSeoMd, "\n", "\r\n"),
		"none":      "## 竞品\n- 无\n## 品牌\n- 品牌词：无\n",
		"old-quota": "## OpenSEO\n- 单次额度：technical 200\n",
		"bad-day":   "## OpenSEO\n- 套餐额度：每月 10000，每月 32 日重置\n",
		"bad-scan":  "## OpenSEO\n- 每周分配：扫描 social 100\n",
		"bad-label": "## OpenSEO\n- 每周分配：社交 100\n",
		"bad-type":  "## 写作\n- 类型映射：`X` → 杂谈\n",
		"plan-tail": "## OpenSEO\n- 套餐额度：每月 5,000,x 每月 7 日重置\n- 余额下限：约 800\n",
		"plan-end":  "## OpenSEO\n- 套餐额度：每月 5,\n",
		"colon":     "## 站点\n- 域名: `a:b.example`\n- 语言：`en`\n",
		"deep":      "# Title\n## 站点\n- 域名：`a.example`\n# 另一个一级标题\n- 域名：`b.example`\n## 品牌\n  - 品牌词：`x`\n",
		"fullwidth": "## 竞品\n- `a.example`：甲　公司，说明一，说明二\n",
	} {
		md := put(t, dir, name+".md", md)
		o.same(true, "", "seo-md.mjs", []string{md}, "parse", md)
	}
	o.same(false, "", "seo-md.mjs", []string{filepath.Join(dir, "missing.md")}, "parse", filepath.Join(dir, "missing.md"))
}

func TestCompareAuditsAndAllocateAndSyncContextAndDueAndGapsAreTheSameAsTheOldScripts(t *testing.T) {
	o := newOldNew(t)
	dir := t.TempDir()
	md := put(t, dir, "SEO.md", fullSeoMd)
	prev := put(t, dir, "prev.json", `{"auditId":"old","completedAt":"2026-10-12T10:00:00Z","pages":[
	  {"url":"https://cookbook.example/pricing","statusCode":200,"title":"Pricing","metaDescription":"Plans","isIndexable":true,"inSitemap":true},
	  {"url":"https://cookbook.example/blog/weeknight-dinners/","statusCode":200,"title":"Weeknight","metaDescription":"Tonight","isIndexable":true,"inSitemap":true}]}`)
	cur := put(t, dir, "cur.json", `{"auditId":"new","completedAt":"2026-10-20T10:00:00Z","pages":[
	  {"url":"https://cookbook.example/pricing","statusCode":301,"title":"Pricing","metaDescription":"Plans","isIndexable":false,"inSitemap":false},
	  {"url":"https://cookbook.example/blog/weeknight-dinners","statusCode":200,"title":"Weeknight dinners & more","metaDescription":"Tonight!","isIndexable":true,"inSitemap":true}]}`)
	missing := put(t, dir, "cur2.json", `{"completedAt":"2026-10-21T00:00:00Z","pages":[]}`)
	o.same(true, "", "seo-baseline.mjs", []string{md, prev, cur}, "compare-audits", md, prev, cur)
	o.same(true, "", "seo-baseline.mjs", []string{md, prev, missing}, "compare-audits", md, prev, missing)
	o.same(true, "", "seo-baseline.mjs", []string{md, prev, prev}, "compare-audits", md, prev, prev)
	o.same(false, "", "seo-baseline.mjs", []string{md, prev}, "compare-audits", md, prev)

	log := put(t, dir, "context.json", `{"researchLog":[
	  {"entryDate":"2027-01-28","summary":"seo-scan 2027-01-28 22:05，方向：pages\n采集：pages 1 条\n花费：700 credits，余额 15000"},
	  {"entryDate":"2027-02-02","summary":"seo-scan 2027-02-02 22:05，方向：technical；pages\n采集：technical 2 条；pages 1 条\n花费：3000 credits，余额 9000，份：扫描；预算跳过：无\n花费：50 credits，份：排名追踪"},
	  {"entryDate":"2027-02-09","summary":"seo-scan 2027-02-09 22:05，方向：results\n采集：results 1 条\n花费：1,500 credits，份：扫描"},
	  {"summary":"起草 2027-02-10：issue #7\n花费：900 credits，份：起草与验证"},
	  {"summary":"no date\n花费：5 credits"}],
	  "competitors":[{"domain":"www.RecipeBox.example/","name":"RecipeBox","notes":"x"},{"domain":"old.example","name":"Old"}],
	  "keyPages":[{"url":"https://cookbook.example/pricing/","topic":"recipe app"}],
	  "structuredContent":{"sections":{"business_overview":"菜谱网站","current_goal":""},"missingSections":["current_goal"]}}`)
	for _, args := range [][]string{
		{md, "20000", "technical", "pages", "--context", log, "--today", "2027-02-15"},
		{md, "20000", "--context", log, "--today", "2027-02-18"},
		{md, "20000", "technical", "pages", "keywords", "backlinks", "geo", "results", "--today", "2027-02-15", "--spent", "1500"},
		{md, "1300", "keywords", "--today", "2027-02-15"},
		{md, "800", "technical", "pages", "--today", "2027-02-15"},
		{md, "x", "pages", "--today", "2027-02-15"},
		{md, "null", "pages", "--today", "2027-02-15"},
		{md, "12.5", "pages", "--today", "2027-02-31"},
		{md, "20000", "social", "--today", "2027-02-15"},
		{md, "20000", "pages", "--today", "15/02"},
		{md, "20000", "pages", "--today", "2027-02-15", "--spent", "-1"},
		{md, "20000", "pages", "--today", "2027-02-15", "--spent", "abc"},
		{md, "1e4", "pages", "--today", "2027-12-31"},
		{md, "0x10", "--today", "2027-01-01"},
	} {
		o.same(true, "", "seo-budget.mjs", args, append([]string{"allocate"}, args...)...)
	}
	noPlan := put(t, dir, "noplan.md", "## OpenSEO\n- 余额下限：1000\n")
	o.same(true, "", "seo-budget.mjs", []string{noPlan, "5000", "pages", "--today", "2027-02-15"}, "allocate", noPlan, "5000", "pages", "--today", "2027-02-15")
	noFloor := put(t, dir, "nofloor.md", "## OpenSEO\n- 套餐额度：每月 100，每月 1 日重置\n- 每周分配：扫描 pages 100\n")
	o.same(true, "", "seo-budget.mjs", []string{noFloor, "5000", "pages", "--today", "2027-02-15"}, "allocate", noFloor, "5000", "pages", "--today", "2027-02-15")

	o.same(true, "", "seo-context.mjs", []string{md, log}, "sync-context", md, log)
	for _, today := range []string{"2027-02-15", "2026-10-25", "2027-02-10", "2027-02", "2026-02-30", "10/25", "2027-13-01"} {
		o.same(true, "", "seo-due.mjs", []string{log, today}, "due", log, today)
	}
	o.same(true, "", "seo-gaps.mjs", []string{md, log, "pages", "keywords", "backlinks"}, "gaps", md, log, "pages", "keywords", "backlinks")
	o.same(true, "", "seo-gaps.mjs", []string{md, "-", "pages", "keywords", "backlinks", "technical"}, "gaps", md, "-", "pages", "keywords", "backlinks", "technical")
	o.same(true, "", "seo-gaps.mjs", []string{md, log}, "gaps", md, log)
	o.same(true, "", "seo-gaps.mjs", []string{md, log, "social"}, "gaps", md, log, "social")
	o.same(true, "", "seo-gaps.mjs", []string{md, filepath.Join(dir, "missing.json"), "pages", "results"}, "gaps", md, filepath.Join(dir, "missing.json"), "pages", "results")
}

func TestCheckIsTheSameAsTheOldScript(t *testing.T) {
	o := newOldNew(t)
	dist := t.TempDir()
	title := "Weeknight dinner ideas that take thirty minutes or less"
	desc := "Thirty quick weeknight dinners with a shopping list for each, tested in a small kitchen, plus what to swap when an ingredient is missing from the shelf."
	pageOf := func(lang, title, desc, canonical, extra string) string {
		return `<!doctype html><html lang="` + lang + `"><head><title>` + title + `</title><meta name="description" content="` + desc + `"><link rel="canonical" href="` + canonical + `">` + extra + `</head><body><h1>` + title + `</h1></body></html>`
	}
	for route, text := range map[string]string{
		"index.html":           pageOf("en", title, desc, "https://cookbook.example", `<link rel="alternate" hreflang="zh-CN" href="https://cookbook.example/zh"><link rel="alternate" hreflang="en" href="https://cookbook.example">`),
		"zh/index.html":        pageOf("zh-CN", "三十分钟以内就能做好的工作日晚餐菜谱合集与采购清单", "三十道工作日快手晚餐，每道附采购清单，都在小厨房里实测过；缺了某样食材时用什么替换也写清楚，照着做当晚就能开饭，不用再跑一趟超市，周末也能提前备好。", "https://cookbook.example/zh", ""),
		"a/index.html":         pageOf("en", title, desc, "https://cookbook.example/a", `<link rel="canonical" href="https://cookbook.example/b">`),
		"a-b/index.html":       pageOf("en", "", desc, "https://cookbook.example/a-b", `<script type="application/ld+json">{broken</script>`),
		"a_b/index.html":       pageOf("en", title, "short", "https://cookbook.example/a_b", `<script type="application/ld+json">{"@graph":[{"@type":"FAQPage"},{"@type":["HowTo","Article"]}]}</script><script type="application/ld+json">[{"@type":"FAQPage"}]</script>`),
		"blog/x/index.html":    pageOf("en", title, desc+" And one more sentence that pushes it well past the limit.", "https://cookbook.example/blog/x", ""),
		"blog-x/index.html":    `<html><head><meta name="robots" content="noindex"><link rel="canonical" href="https://cookbook.example/blog-x"><link rel="canonical" href="https://cookbook.example/blog-y"></head><body></body></html>`,
		"1/index.html":         `<html><head><title>` + title + `</title></head><body><h1>a</h1><h1>b</h1><img src="x.png"><img alt="" src="y.png"></body></html>`,
		"한국어/index.html":       pageOf("ko", "한국어 제목입니다 한국어 제목입니다 한국어 제목입니다", desc, "https://cookbook.example/ko", ""),
		"blog/index.html":      pageOf("", "A &amp; B &lt;c&gt; &quot;d&quot; &#39;e&#39; &amp;lt;", desc, "https://cookbook.example/blog", ""),
		"not-index/other.html": "ignored",
	} {
		put(t, dist, route, text)
	}
	for _, args := range [][]string{
		{dist},
		{dist, "--strict"},
		{dist, "--filter=blog"},
		{dist, "--filter=/a"},
		{dist, "--filter=nomatch"},
		{dist, "--title-min=10", "--title-max=200", "--desc-min=10", "--desc-max=400"},
		{dist, "--desc-max=400", "--strict"},
		{dist, "--title-min=abc"},
		{dist, "--title-min"},
		{dist, "other"},
		{filepath.Join(dist, "nope")},
	} {
		o.same(true, "", "seo-check.mjs", args, append([]string{"check"}, args...)...)
	}
	// the same exit code and output; the sentence names the unknown flag without its value, and the usage line says dyna seo check
	o.same(false, "", "seo-check.mjs", []string{dist, "--lang=zh"}, "check", dist, "--lang=zh")
	o.same(false, "", "seo-check.mjs", nil, "check")
	clean := t.TempDir()
	put(t, clean, "index.html", pageOf("en", title, desc, "https://cookbook.example/", ""))
	o.same(true, "", "seo-check.mjs", []string{clean}, "check", clean)
	o.same(true, "", "seo-check.mjs", []string{clean, "--strict"}, "check", clean, "--strict")
}

func TestScopeIsTheSameAsTheOldScript(t *testing.T) {
	o := newOldNew(t)
	dir := t.TempDir()
	md := put(t, dir, "SEO.md", fullSeoMd)
	none := put(t, dir, "none.md", "## 构建与检查\n- 产物目录：`dist`\n")
	for _, files := range []string{
		"apps/site/src/content/blog/a.md\napps/site/src/components/Hero.tsx\n",
		"apps/site/src/content/blog/a.md\napps/site/public/images/x/y.webp\napps/site/public/llms.txt\n./apps/site/src/content/blog/b.md\n",
		"content/../src/App.tsx\n/etc/passwd\nSEO.md\ndocs/a.md\n",
		"apps/site/public/images-old/a.png\napps/site/public/llms.txt.bak\n\n  \n",
		"",
		"apps/site/src/content/blog\r\napps/site/src/content/blog/c.md\r\n",
	} {
		o.same(true, files, "seo-content-scope.mjs", []string{md, "--files=-"}, "scope", md, "--files=-")
		o.same(true, files, "seo-content-scope.mjs", []string{none, "--files=-"}, "scope", none, "--files=-")
	}
	list := put(t, dir, "files.txt", "apps/site/src/content/blog/a.md\nREADME.md\n")
	o.same(true, "", "seo-content-scope.mjs", []string{md, "--files=" + list}, "scope", md, "--files="+list)
	o.same(false, "", "seo-content-scope.mjs", []string{md}, "scope", md)
	o.same(false, "", "seo-content-scope.mjs", []string{filepath.Join(dir, "nope.md"), "--files=-"}, "scope", filepath.Join(dir, "nope.md"), "--files=-")
}

func TestVerifyLiveIsTheSameAsTheOldScript(t *testing.T) {
	o := newOldNew(t)
	dist := t.TempDir()
	pg := func(title, desc, head string) string {
		return `<!doctype html><html lang="en"><head><title>` + title + `</title><meta name="description" content="` + desc + `">` + head + `</head><body><h1>x</h1></body></html>`
	}
	put(t, dist, "blog/weeknight-dinners/index.html", pg("Weeknight dinners in 20 minutes", "Twelve dinners you can cook on a weeknight.", ""))
	put(t, dist, "index.html", pg("Cookbook", "Recipes.", ""))
	put(t, dist, "blog/meal-prep.html", pg("Meal prep &amp; plans", "Prep.", ""))
	put(t, dist, "about/index.html", pg("About", "Us.", ""))
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		base := "http://" + r.Host
		switch r.URL.Path {
		case "/sitemap.xml":
			fmt.Fprintf(w, "<sitemapindex><sitemap><loc>%s/sitemap-0.xml</loc></sitemap></sitemapindex>", base)
		case "/sitemap-0.xml":
			fmt.Fprintf(w, "<urlset><url><loc>%s/blog/weeknight-dinners</loc></url><url><loc>%s/</loc></url><url><loc>%s/blog/meal-prep</loc></url></urlset>", base, base, base)
		case "/blog/weeknight-dinners/":
			w.Header().Set("X-Robots-Tag", "googlebot: noindex")
			fmt.Fprint(w, pg("Weeknight dinners in 20 minutes", "Twelve dinners you can cook on a weeknight.", `<meta content="index" name="robots">`))
		case "/":
			fmt.Fprint(w, pg("Stale", "Recipes.", ""))
		case "/blog/meal-prep":
			fmt.Fprint(w, pg("Meal prep &#38; plans", "Prep.", `<meta name='googlebot' content='NONE'>`))
		case "/about/":
			w.WriteHeader(404)
		}
	}))
	defer srv.Close()
	md := put(t, t.TempDir(), "SEO.md", "## 构建与检查\n- 产物目录：`dist`\n- 上线等待：1\n")
	lines := "" +
		srv.URL + "/blog/weeknight-dinners/ 目标词：weeknight dinner ideas\n" +
		"- " + srv.URL + "/ 目标词: home\n" +
		"* <" + srv.URL + "/blog/meal-prep> 目标词：meal prep\n" +
		"- [ ] " + srv.URL + "/about/\n还有一行不是网址\n"
	o.same(true, lines, "seo-live-check.mjs", []string{md, dist, "--urls=-"}, "verify-live", md, dist, "--urls=-")
	one := srv.URL + "/blog/weeknight-dinners/ 目标词：x\n"
	o.same(true, one, "seo-live-check.mjs", []string{md, dist, "--urls=-", "--wait", "--interval=0.05", "--max-wait=0.3"}, "verify-live", md, dist, "--urls=-", "--wait", "--interval=0.05", "--max-wait=0.3")
	about := srv.URL + "/about/ 目标词：about\n"
	o.same(true, about, "seo-live-check.mjs", []string{md, dist, "--urls=-", "--wait", "--interval=0.05", "--max-wait=0.2"}, "verify-live", md, dist, "--urls=-", "--wait", "--interval=0.05", "--max-wait=0.2")
	dead := httptest.NewServer(http.NotFoundHandler())
	deadURL := dead.URL
	dead.Close()
	o.same(false, deadURL+"/blog/weeknight-dinners/ 目标词：x\n", "seo-live-check.mjs", []string{md, dist, "--urls=-"}, "verify-live", md, dist, "--urls=-")
	o.same(true, "没有网址\n", "seo-live-check.mjs", []string{md, dist, "--urls=-"}, "verify-live", md, dist, "--urls=-")
	o.same(false, "https://cookbook.example/nothing-here/ 目标词：x\n", "seo-live-check.mjs", []string{md, dist, "--urls=-"}, "verify-live", md, dist, "--urls=-")
	o.same(false, "", "seo-live-check.mjs", []string{md, dist}, "verify-live", md, dist)

	// record: the comment of a passed check, byte for byte, and the refusals
	pass := put(t, t.TempDir(), "result.json", `{"verdict":"pass","pages":[
	  {"url":"https://cookbook.example/blog/a/","keyword":"a | b","status":{"ok":true,"detail":"200"},"noindex":{"ok":true,"detail":""},"meta":{"ok":true,"detail":""},"sitemap":{"ok":true,"detail":""}},
	  {"url":"https://cookbook.example/blog/b/","keyword":"x --> <y> & \"z\"","status":{"ok":true,"detail":"200"},"noindex":{"ok":true,"detail":""},"meta":{"ok":true,"detail":""},"sitemap":{"ok":true,"detail":""}},
	  {"url":"https://cookbook.example/blog/c/","keyword":null,"status":{"ok":true,"detail":"200"},"noindex":{"ok":true,"detail":""},"meta":{"ok":true,"detail":""},"sitemap":{"ok":true,"detail":""}}],"failed":[]}`)
	fail := put(t, t.TempDir(), "fail.json", `{"verdict":"fail","pages":[],"failed":[]}`)
	for _, args := range [][]string{
		{"body", pass, "--merged=2026-11-16", "--pr=321"},
		{"body", pass, "--merged=2026-11-16"},
		{"body", pass, "--merged=2026-11-16", "--pr=0"},
		{"body", pass, "--merged=16 Nov"},
		{"body", pass},
		{"body", fail, "--merged=2026-11-16"},
	} {
		o.same(true, "", "seo-live-record.mjs", args, append([]string{"record"}, args...)...)
	}
}

// a fake gh, the same one for both, that logs what it is asked and answers from files.
func fakeGhOn(t *testing.T, answers map[string]string) (bin string, log string) {
	t.Helper()
	root := t.TempDir()
	bin = filepath.Join(root, "bin")
	log = filepath.Join(root, "gh.log")
	var cases strings.Builder
	for pattern, file := range answers {
		put(t, root, "answers/"+pattern, file)
		fmt.Fprintf(&cases, "  *\" %s\"*) cat \"%s/answers/%s\";;\n", pattern, root, pattern)
	}
	script := "#!/bin/sh\necho \"$@\" >> \"" + log + "\"\ncase \" $*\" in\n" + cases.String() + "  *\"issue create\"*) echo https://github.com/o/r/issues/41;;\n  *) ;;\nesac\n"
	put(t, bin, "gh", script)
	if err := os.Chmod(filepath.Join(bin, "gh"), 0o755); err != nil {
		t.Fatal(err)
	}
	return bin, log
}

func TestFileIssuesAndRecordListAreTheSameAsTheOldScripts(t *testing.T) {
	o := newOldNew(t)
	base := t.TempDir()
	home := filepath.Join(base, "home")
	put(t, home, "AGENTS.md", "# 设备\n\n## 项目\n\nexample-app（一个例子）: ~/code/example-app. Clone from https://github.com/o/r if missing.\n")
	docs := filepath.Join(home, "projects", "example-app", "docs")
	if err := os.MkdirAll(docs, 0o755); err != nil {
		t.Fatal(err)
	}
	put(t, filepath.Join(home, "projects", "example-app"), "ISSUE_TRACKER.md", "# Issue tracker：GitHub\n\n## 分类 label\n\n- `bug`：缺陷\n- `seo`：搜索流量\n  - `technical`：技术\n  - `pages`：页面\n")
	bin, _ := fakeGhOn(t, map[string]string{
		"issue list -R o/r --state open":   `[{"number":3,"title":"old","body":"- https://cookbook.example/a\n\n<!-- seo-finding: pages/low-ctr -->"},{"number":4,"title":"x","body":null}]`,
		"issue list -R o/r --state closed": `[{"number":9,"title":"SEO（已有页面优化）：改标题","comments":[{"body":"开工了"},{"body":"上线自查：全过\n\n<!-- seo-live-check: {\"mergedOn\":\"2026-11-16\",\"pages\":[{\"url\":\"https://cookbook.example/a/\",\"keyword\":\"k\",\"status\":true,\"noindex\":true,\"meta\":false}]} -->"}]},{"number":2,"title":"早的","comments":[{"body":"<!-- seo-live-check: {\"mergedOn\":\"2026-10-01\",\"pages\":[{\"url\":\"u\",\"keyword\":null,\"status\":true,\"noindex\":true,\"meta\":true,\"sitemap\":true}]} -->"},{"body":"<!-- seo-live-check: {bad} -->"}]}]`,
		"issue view -R o/r 12 --json body": `{"body":"由上线自查回滚而来。"}`,
	})
	t.Setenv("PATH", bin+string(os.PathListSeparator)+os.Getenv("PATH"))
	t.Setenv("IDEA_LOOP_HOME", home)
	t.Setenv("HOME", base)
	findings := put(t, t.TempDir(), "findings.json", `[
	 {"direction":"technical","kind":"missing-meta-description","title":"页面没有 meta description","targets":["https://cookbook.example/a","https://cookbook.example/b"],"evidence":{"what":"get_audit_pages limit 1000","when":"2026-10-20","values":"metaDescription 为空"},"repro":"get_audit_pages","fix":"每页写一句描述","acceptance":["页面 head 里有 meta description","第二条"],"ratio":{"numerator":2,"denominator":40},"assumptions":["默认值"]},
	 {"direction":"technical","kind":"missing-meta-description","title":"页面没有 meta description","targets":["https://cookbook.example/c"],"evidence":"另一条证据","repro":"再来一次","acceptance":["页面 head 里有 meta description"]},
	 {"direction":"pages","kind":"low-ctr","title":"CTR 低","targets":["https://cookbook.example/a","https://cookbook.example/n"],"evidence":{"what":"w","values":{"clicks":3,"b":[1,2]}},"repro":"r","acceptance":["a"]},
	 {"direction":"geo","uncollected":"没有 AI 可见性跟踪"},
	 {"direction":"pages","kind":"ctr","title":"CTR 只有 1.1%","evidence":"x","repro":"y","acceptance":["z"]},
	 {"direction":"social","kind":"x","title":"t","evidence":"e","repro":"r","acceptance":["a"]},
	 {"direction":"keywords","kind":"new-topic","title":"新话题","evidence":{"what":"w","when":"d","values":"v"},"repro":"r","acceptance":["a"],"content":{"keyword":"weeknight dinner ideas","pageType":"教程","mode":"update"}},
	 {"direction":"backlinks","kind":"competitor-only-domains","title":"外链","evidence":{"what":"w","values":"v"},"repro":"r","acceptance":["a"]},
	 {"direction":"technical","kind":"Bad Kind","title":"t","evidence":"e","repro":"r","acceptance":["a"]},
	 null, 7]`)
	for _, args := range [][]string{
		{docs, findings, "--dry-run", "--date=2026-11-06"},
		{docs, findings, "--date=2026-11-06"},
		{docs, findings, "--dry-run"},
		{docs, findings, "--date=nope"},
		{docs},
		{filepath.Join(base, "elsewhere"), findings},
	} {
		oldRes, newRes := o.old("", "seo-issues.mjs", args...), o.new("", append([]string{"file-issues"}, args...)...)
		strip := func(s string) string { return strings.ReplaceAll(s, "\r", "") }
		if oldRes.code != newRes.code || strip(oldRes.stdout) != strip(newRes.stdout) {
			t.Errorf("file-issues %v:\nold (%d): %s\n%s\nnew (%d): %s\n%s", args[1:], oldRes.code, oldRes.stdout, oldRes.stderr, newRes.code, newRes.stdout, newRes.stderr)
		}
	}
	// the comparison above is only worth something when the commands really ran: a dry run lists what it would open
	if r := o.new("", "file-issues", docs, findings, "--dry-run", "--date=2026-11-06"); r.code != 0 || !strings.Contains(r.stdout, `"created": [`) || !strings.Contains(r.stdout, "SEO（技术 SEO 与索引）") || !strings.Contains(r.stdout, `"commented": [`) {
		t.Fatalf("the dry run did not run: %d %s %s", r.code, r.stdout, r.stderr)
	}
	if r := o.new("", "record", "list", docs); r.code != 0 || !strings.Contains(r.stdout, `"mergedOn": "2026-11-16"`) {
		t.Fatalf("the list did not run: %d %s %s", r.code, r.stdout, r.stderr)
	}
	for _, args := range [][]string{{"list", docs}, {"list", docs, "--since=2026-11-01"}, {"list", docs, "--since=Nov"}, {"from-rollback", docs, "12"}, {"from-rollback", docs, "ENG-1"}} {
		o.same(false, "", "seo-live-record.mjs", args, append([]string{"record"}, args...)...)
	}
}

func TestProvenanceIsTheSameAsTheOldScript(t *testing.T) {
	o := newOldNew(t)
	repo := t.TempDir()
	git := func(when string, args ...string) {
		t.Helper()
		cmd := exec.Command("git", append([]string{"-C", repo, "-c", "commit.gpgsign=false"}, args...)...)
		cmd.Env = append(os.Environ(), "GIT_AUTHOR_DATE="+when, "GIT_COMMITTER_DATE="+when)
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("%v\n%s", err, out)
		}
	}
	commit := func(when, file, text, msg string) {
		put(t, repo, file, text)
		git(when, "add", "-A")
		git(when, "commit", "-q", "-m", msg)
	}
	git("2026-10-20T09:00:00Z", "init", "-q", "-b", "main")
	git("2026-10-20T09:00:00Z", "config", "user.email", "t@example.com")
	git("2026-10-20T09:00:00Z", "config", "user.name", "t")
	commit("2026-10-20T09:00:00Z", "pricing.md", "title: Old pricing\ndescription: Old plans\n", "base")
	commit("2026-10-20T09:00:00Z", "about.md", "title: About us\n", "base 2")
	commit("2026-10-20T09:00:00Z", "faq.md", "title: FAQ\n", "base 3")
	git("2026-11-03T09:00:00Z", "checkout", "-q", "-b", "pr-42")
	commit("2026-11-03T09:00:00Z", "pricing.md", "title: Pricing that fits any kitchen\ndescription: Old plans\n", "edit pricing")
	git("2026-11-04T09:00:00Z", "checkout", "-q", "main")
	git("2026-11-04T09:00:00Z", "merge", "--no-ff", "-q", "-m", "Merge pull request #42 from user/pr-42", "pr-42")
	commit("2026-11-05T09:00:00Z", "about.md", "title: About the cookbook (squashed)\n", "Rename about (#51)")
	commit("2026-11-05T10:00:00Z", "faq.md", "title: FAQ direct push\n", "tweak faq")

	files := t.TempDir()
	pageOf := func(url, title, desc string) string {
		return fmt.Sprintf(`{"url":%q,"statusCode":200,"title":%q,"metaDescription":%q,"isIndexable":true,"inSitemap":true}`, url, title, desc)
	}
	u := func(p string) string { return "https://cookbook.example/" + p }
	prev := put(t, files, "prev.json", `{"auditId":"old","completedAt":"2026-11-01T10:00:00Z","pages":[`+pageOf(u("pricing"), "Old pricing", "Old plans")+","+pageOf(u("about"), "About us", "")+","+pageOf(u("faq"), "FAQ", "")+`]}`)
	cur := put(t, files, "cur.json", `{"auditId":"new","completedAt":"2026-11-08T10:00:00Z","pages":[`+pageOf(u("pricing"), "Pricing that fits any kitchen", "Old plans")+","+pageOf(u("about"), "About the cookbook (squashed)", "")+","+pageOf(u("faq"), "FAQ direct push", "")+`]}`)
	findings := put(t, files, "findings.json", fmt.Sprintf(`[{"direction":"technical","kind":"key-page-regression","title":"x","targets":[%q],"n":1.0,"extra":{"b":1,"a":[1,2]}},{"direction":"technical","kind":"key-page-meta-changed","title":"3 个","targets":[%q,%q,%q],"evidence":{"what":"w","when":"2026-11-08","values":"v"},"repro":"r","fix":"f","acceptance":["a"]}]`, u("pricing"), u("pricing"), u("about"), u("faq")))
	since, until := "2026-11-01T10:00:00Z", "2026-11-08T10:00:00Z"
	for _, args := range [][]string{
		{repo, prev, cur, findings, since, until, "--branch=main"},
		{repo, prev, cur, findings, since, until},
		{repo, prev, cur, findings, "2026-11-04T10:00:00Z", until, "--branch=main"},
		{repo, prev, cur, findings, since, "2026-11-04T08:00:00Z", "--branch=main"},
		{repo, prev, cur, findings, "yesterday", until, "--branch=main"},
		{files, prev, cur, findings, since, until, "--branch=main"},
		{repo, prev, filepath.Join(files, "nope.json"), findings, since, until},
		{repo, prev, cur},
	} {
		o.same(false, "", "seo-meta-provenance.mjs", args, append([]string{"provenance"}, args...)...)
	}
}
