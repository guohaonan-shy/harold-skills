package app

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/issues"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/registry"
)

// The seo module through the whole program, the way the old scripts' tests ran the scripts: exit codes, what reaches
// stdout and stderr, and the hook's answer to a hook event.

type seoRun struct {
	env   map[string]string
	stdin string
	gh    func(dir string) issues.GH
	cwd   string
}

func (r seoRun) do(args ...string) (stdout, stderr string, code int) {
	var out, errb bytes.Buffer
	code = Run(append([]string{"seo"}, args...), IO{Stdin: strings.NewReader(r.stdin), Stdout: &out, Stderr: &errb, Env: envOf(r.env), GH: r.gh, Cwd: r.cwd})
	return out.String(), errb.String(), code
}

func write(t *testing.T, p, text string) string {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(p, []byte(text), 0o644); err != nil {
		t.Fatal(err)
	}
	return p
}

func realTemp(t *testing.T) string {
	t.Helper()
	d, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	return d
}

const (
	enTitle = "Weeknight dinner ideas that take thirty minutes or less"
	enDesc  = "Thirty quick weeknight dinners with a shopping list for each, tested in a small kitchen, plus what to swap when an ingredient is missing from the shelf."
)

func page(title string) string {
	return `<!doctype html><html lang="en"><head><title>` + title + `</title><meta name="description" content="` + enDesc + `"><link rel="canonical" href="https://cookbook.example/"></head><body><h1>` + title + `</h1></body></html>`
}

func TestRegistryHasEverySeoCommandMarkedForSessionsWithTheArgumentsTheOldScriptsTook(t *testing.T) {
	out, errs, code := run(nil, "registry", "--json")
	if code != 0 {
		t.Fatal(errs)
	}
	var reg registry.Registry
	if err := json.Unmarshal([]byte(out), &reg); err != nil {
		t.Fatal(err)
	}
	want := []string{
		"seo allocate", "seo check", "seo compare-audits", "seo due", "seo file-issues", "seo gaps",
		"seo og html", "seo og layouts", "seo og md5", "seo og render", "seo parse", "seo provenance", "seo record body",
		"seo record from-rollback", "seo record list", "seo scope", "seo sync-context", "seo verify-live", "seo writing lint",
	}
	var have []string
	for _, c := range reg.Commands {
		if strings.HasPrefix(c.Command, "seo ") {
			have = append(have, c.Command)
			if c.Caller != registry.CallerSession || c.Summary == "" {
				t.Errorf("%s: %+v", c.Command, c)
			}
			if strings.Contains(c.Command, "seo-") || strings.Contains(c.Use, ".mjs") {
				t.Errorf("%s still carries an old script name", c.Command)
			}
		}
	}
	sort.Strings(have)
	if strings.Join(have, ",") != strings.Join(want, ",") {
		t.Fatalf("the module holds %v, want the commands of the old scripts (and og-render, writing-lint) as %v", have, want)
	}
	flags := func(name string) string {
		c, _ := reg.Find(name)
		var fs []string
		for _, a := range c.Args {
			if a.Kind == "flag" {
				fs = append(fs, a.Name)
			}
		}
		sort.Strings(fs)
		return strings.Join(fs, ",")
	}
	for name, want := range map[string]string{
		"seo allocate":     "context,spent,today",
		"seo check":        "desc-max,desc-min,filter,hook,strict,title-max,title-min",
		"seo scope":        "base,files,image-dir",
		"seo og layouts":   "assets",
		"seo og html":      "assets",
		"seo og render":    "assets,html",
		"seo og md5":       "url",
		"seo writing lint": "config,format,lang",
		"seo file-issues":  "date,dry-run",
		"seo verify-live":  "interval,max-wait,urls,wait",
		"seo record body":  "merged,pr",
		"seo record list":  "since",
		"seo provenance":   "branch",
		"seo parse":        "",
		"seo due":          "",
		"seo gaps":         "",
		"seo sync-context": "",
	} {
		if got := flags(name); got != want {
			t.Errorf("%s flags: %q, want %q", name, got, want)
		}
	}
}

func TestParsePrintsTheTenSectionsAndAnUnreadableFileExitsOne(t *testing.T) {
	dir := t.TempDir()
	md := write(t, filepath.Join(dir, "SEO.md"), "## 站点\n- 域名：`a.example`\n")
	out, errs, code := seoRun{}.do("parse", md)
	if code != 0 || errs != "" || !strings.HasPrefix(out, "{\n  \"site\": {\n    \"domain\": \"a.example\"") || !strings.HasSuffix(out, "}\n") {
		t.Fatal(code, errs, out)
	}
	if _, errs, code := (seoRun{}).do("parse", filepath.Join(dir, "nope.md")); code != 1 || errs == "" {
		t.Fatal(code, errs)
	}
	if _, errs, code := (seoRun{}).do("parse"); code != 1 || !strings.Contains(errs, "usage") {
		t.Fatal(code, errs)
	}
}

func TestCheckExitsOneOnErrorsTwoOnAMissingDirectoryOrAnUnknownFlag(t *testing.T) {
	dist := t.TempDir()
	write(t, filepath.Join(dist, "index.html"), page(""))
	out, _, code := seoRun{}.do("check", dist)
	if code != 1 || !strings.Contains(out, "Missing <title>") || !strings.HasPrefix(out, "seo-check · 1 routes · ") {
		t.Fatal(code, out)
	}
	if _, errs, code := (seoRun{}).do("check", filepath.Join(dist, "nope")); code != 2 || !strings.Contains(errs, "产物目录不存在") {
		t.Fatal(code, errs)
	}
	if _, errs, code := (seoRun{}).do("check", dist, "--lang=zh"); code != 2 || !strings.Contains(errs, "不认识的参数") {
		t.Fatal(code, errs)
	}
	if _, _, code := (seoRun{}).do("check", dist, "--title-min=abc"); code != 2 {
		t.Fatal("a threshold that is not a number is a bad argument")
	}
	if _, _, code := (seoRun{}).do("check"); code != 2 {
		t.Fatal("no directory is a usage error, exit 2")
	}
	ok := t.TempDir()
	write(t, filepath.Join(ok, "index.html"), page(enTitle))
	out, errs, code := seoRun{}.do("check", ok, "--strict", "--filter=/")
	if code != 0 || errs != "" || !strings.Contains(out, `(filter "/" of 1)`) || !strings.HasSuffix(out, "✓ clean (errors + warnings)\n") {
		t.Fatal(code, errs, out)
	}
}

// ---- the hook ----

const hookSeoMd = "# SEO\n\n## 构建与检查\n- 产物目录：`site/dist`\n"

type hookWorld struct {
	root string
	env  map[string]string
}

// hookRepo is a fake home that registers example-app (its directory in home holds SEO.md when seoMd, and a docs/ — that
// is what "moved" means), and a code repository with that origin and a built site.
func hookRepo(t *testing.T, seoMd, bad, moved, inRepo bool) hookWorld {
	t.Helper()
	base := realTemp(t)
	home := filepath.Join(base, "home")
	root := filepath.Join(base, "code")
	write(t, filepath.Join(home, "AGENTS.md"), "# 设备\n\n## 项目\n\nexample-app（一个例子）: ~/projects/example-app. Clone from https://github.com/acme/example-app if missing.\n")
	if moved {
		if err := os.MkdirAll(filepath.Join(home, "projects", "example-app", "docs"), 0o755); err != nil {
			t.Fatal(err)
		}
		if seoMd {
			write(t, filepath.Join(home, "projects", "example-app", "SEO.md"), hookSeoMd)
		}
	}
	if err := os.MkdirAll(root, 0o755); err != nil {
		t.Fatal(err)
	}
	for _, args := range [][]string{{"init", "-q"}, {"remote", "add", "origin", "git@github.com:acme/example-app.git"}} {
		cmd := exec.Command("git", args...)
		cmd.Dir = root
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("%v %s", err, out)
		}
	}
	if inRepo {
		write(t, filepath.Join(root, "SEO.md"), hookSeoMd)
	}
	title := enTitle
	if bad {
		title = ""
	}
	write(t, filepath.Join(root, "site/dist/index.html"), page(title))
	write(t, filepath.Join(root, "app/dist/index.html"), "app build")
	return hookWorld{root: root, env: map[string]string{"IDEA_LOOP_HOME": home, "HOME": base, "IDEA_LOOP_SEO_HOOK_DIR": t.TempDir()}}
}

func (w hookWorld) hook(event, cwd, id string, extra map[string]any) (string, int) {
	payload := map[string]any{"hook_event_name": event, "tool_name": "Bash", "tool_use_id": id, "cwd": cwd, "tool_input": map[string]string{"command": "npm run build"}}
	for k, v := range extra {
		payload[k] = v
	}
	b, _ := json.Marshal(payload)
	_, errs, code := seoRun{env: w.env, stdin: string(b)}.do("check", "--hook")
	return errs, code
}

// rebuilt writes the site's index again as a build would, and dates it a second ahead: Linux stamps a file's mtime
// from a coarse kernel clock that can sit a few milliseconds behind time.Now, so a file written right after the
// PreToolUse record could otherwise look older than the command that rebuilt it.
func rebuilt(t *testing.T, w hookWorld, title string) {
	t.Helper()
	file := filepath.Join(w.root, "site/dist/index.html")
	write(t, file, page(title))
	ahead := time.Now().Add(time.Second)
	if err := os.Chtimes(file, ahead, ahead); err != nil {
		t.Fatal(err)
	}
}

func age(t *testing.T, file string) {
	t.Helper()
	old := time.Now().Add(-time.Minute)
	if err := os.Chtimes(file, old, old); err != nil {
		t.Fatal(err)
	}
}

func TestHookTheSiteBuildThatLeftAnErrorIsReportedBackWithExitTwo(t *testing.T) {
	w := hookRepo(t, true, true, true, false)
	age(t, filepath.Join(w.root, "site/dist/index.html"))
	if _, code := w.hook("PreToolUse", w.root, "t1", nil); code != 0 {
		t.Fatal("PreToolUse only records the start")
	}
	rebuilt(t, w, "")
	errs, code := w.hook("PostToolUse", w.root, "t1", nil)
	if code != 2 || !strings.Contains(errs, "Missing <title>") || !strings.Contains(errs, "seo-writing/references/checks.md") || strings.Contains(errs, "idea-loop:seo-check") || !strings.HasPrefix(errs, "构建产物 "+filepath.Join(w.root, "site/dist")+" 有 SEO error") || !strings.HasSuffix(errs, "改完重新构建；每条规则的理由见 idea-loop 插件的 skills/seo/seo-writing/references/checks.md。\n") {
		t.Fatal(code, errs)
	}
}

func TestHookSeoMdIsReadFromTheProjectDirectoryInHomeAndTheOutputDirectoryIsTheWorktrees(t *testing.T) {
	w := hookRepo(t, true, true, true, false)
	if _, err := os.Stat(filepath.Join(w.root, "SEO.md")); err == nil {
		t.Fatal("the code repository has no SEO.md")
	}
	sub := filepath.Join(w.root, "app")
	age(t, filepath.Join(w.root, "site/dist/index.html"))
	if _, code := w.hook("PreToolUse", sub, "t1b", nil); code != 0 {
		t.Fatal("from a subdirectory of the worktree too")
	}
	rebuilt(t, w, "")
	errs, code := w.hook("PostToolUse", sub, "t1b", nil)
	if code != 2 || !strings.Contains(errs, filepath.Join(w.root, "site/dist")) {
		t.Fatal(code, errs)
	}
}

func TestHookAProjectThatHasNotMovedIntoHomePassesSilentlyEvenWhenTheWorktreeStillHasSeoMd(t *testing.T) {
	w := hookRepo(t, true, true, false, true)
	w.hook("PreToolUse", w.root, "t1c", nil)
	rebuilt(t, w, "")
	if errs, code := w.hook("PostToolUse", w.root, "t1c", nil); code != 0 || errs != "" {
		t.Fatal(code, errs)
	}
}

func TestHookARepositoryTheProjectListDoesNotKnowPassesSilently(t *testing.T) {
	w := hookRepo(t, true, true, true, false)
	cmd := exec.Command("git", "remote", "set-url", "origin", "git@github.com:acme/unlisted.git")
	cmd.Dir = w.root
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatal(err, string(out))
	}
	w.hook("PreToolUse", w.root, "t1d", nil)
	rebuilt(t, w, "")
	if _, code := w.hook("PostToolUse", w.root, "t1d", nil); code != 0 {
		t.Fatal(code)
	}
}

func TestHookAnotherBuildThatDidNotTouchTheOutputDirPasses(t *testing.T) {
	w := hookRepo(t, true, true, true, false)
	age(t, filepath.Join(w.root, "site/dist/index.html"))
	w.hook("PreToolUse", w.root, "t2", nil)
	write(t, filepath.Join(w.root, "app/dist/index.html"), "student app build")
	if _, code := w.hook("PostToolUse", w.root, "t2", nil); code != 0 {
		t.Fatal(code)
	}
}

func TestHookWithoutAPreToolUseRecordTheStartComesFromDurationMs(t *testing.T) {
	w := hookRepo(t, true, true, true, false)
	rebuilt(t, w, "")
	if _, code := w.hook("PostToolUse", w.root, "never-seen", map[string]any{"duration_ms": 5000}); code != 2 {
		t.Fatal("the build ran 5 seconds ago and touched the directory")
	}
	if _, code := w.hook("PostToolUse", w.root, "never-seen-2", nil); code != 0 {
		t.Fatal("no record and no duration: pass")
	}
}

func TestHookNoSeoMdNoCheck(t *testing.T) {
	w := hookRepo(t, false, true, true, false)
	w.hook("PreToolUse", w.root, "t3", nil)
	rebuilt(t, w, "")
	if _, code := w.hook("PostToolUse", w.root, "t3", nil); code != 0 {
		t.Fatal(code)
	}
}

func TestHookAGoodBuildPassesAndUnreadableInputPasses(t *testing.T) {
	w := hookRepo(t, true, false, true, false)
	age(t, filepath.Join(w.root, "site/dist/index.html"))
	w.hook("PreToolUse", w.root, "t4", nil)
	write(t, filepath.Join(w.root, "site/dist/index.html"), page(enTitle))
	if errs, code := w.hook("PostToolUse", w.root, "t4", nil); code != 0 || errs != "" {
		t.Fatal(code, errs)
	}
	for _, in := range []string{"", "not json", "null", `{"hook_event_name":"PostToolUse"}`, `{"tool_use_id":"x","hook_event_name":"SessionStart"}`} {
		if errs, _, code := (seoRun{env: w.env, stdin: in}).do("check", "--hook"); code != 0 || errs != "" {
			t.Errorf("%q: %d %q", in, code, errs)
		}
	}
}

// The hook is never stopped by a version the plugin does not accept, exactly like the other hooks (see app.Run).
func TestHookIsNotStoppedByAVersionMismatch(t *testing.T) {
	_, errs, code := run(map[string]string{EnvRange: ">=9.0.0 <10.0.0"}, "seo", "check", "--hook")
	if code != 0 || errs == "" {
		t.Fatal(code, errs)
	}
}

// ---- the plans that read files ----

func TestScopeJudgesTheFileListFromStdinAndFromGit(t *testing.T) {
	dir := t.TempDir()
	withPaths := write(t, filepath.Join(dir, "with.md"), "# SEO\n\n## 构建与检查\n- 产物目录：`apps/site/dist`\n- 内容路径：`apps/site/src/content/blog/`\n")
	without := write(t, filepath.Join(dir, "without.md"), "# SEO\n\n## 构建与检查\n- 产物目录：`apps/site/dist`\n")
	out, errs, code := seoRun{stdin: "apps/site/src/content/blog/a.md\napps/site/src/components/Hero.tsx\n"}.do("scope", withPaths, "--files=-")
	if code != 0 || errs != "" || out != `{"contentOnly":false,"files":2,"outside":["apps/site/src/components/Hero.tsx"]}`+"\n" {
		t.Fatal(code, errs, out)
	}
	out, _, _ = seoRun{stdin: "apps/site/src/content/blog/a.md\n"}.do("scope", without, "--files=-")
	if !strings.Contains(out, `"contentOnly":false`) {
		t.Fatal("no 内容路径 → the blog post is outside:", out)
	}
	out, _, _ = seoRun{stdin: "docs/a.md\nSEO.md\n"}.do("scope", without, "--files=-")
	if !strings.Contains(out, `"contentOnly":false`) {
		t.Fatal(out)
	}

	repo := realTemp(t)
	vcs := func(args ...string) {
		t.Helper()
		cmd := exec.Command("git", append([]string{"-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false"}, args...)...)
		cmd.Dir = repo
		if o, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("%v %s", err, o)
		}
	}
	vcs("init", "-q", "-b", "main")
	write(t, filepath.Join(repo, "apps/site/src/components/Hero.tsx"), strings.Repeat("export const Hero = () => null;\n", 5))
	write(t, filepath.Join(repo, "apps/site/src/content/blog/a.md"), "a\n")
	vcs("add", "-A")
	vcs("commit", "-q", "-m", "base")
	vcs("checkout", "-q", "-b", "pr")
	// a code file moved into the blog directory: only its old name gives it away
	vcs("mv", "apps/site/src/components/Hero.tsx", "apps/site/src/content/blog/Hero.tsx")
	write(t, filepath.Join(repo, "apps/site/src/content/blog/a.md"), "a edited\n")
	vcs("add", "-A")
	vcs("commit", "-q", "-m", "pr")
	md := write(t, filepath.Join(repo, "SEO.md"), "# SEO\n\n## 构建与检查\n- 内容路径：`apps/site/src/content/blog/`\n")
	out, errs, code = seoRun{cwd: repo}.do("scope", md, "--base=main")
	if code != 0 || out != `{"contentOnly":false,"files":3,"outside":["apps/site/src/components/Hero.tsx"]}`+"\n" {
		t.Fatalf("a rename counts under its old name too: %d %q %q", code, out, errs)
	}
}

func TestScopeAnUnreadableSeoMdOrNoSourceForTheFileListExitsOneWithAReason(t *testing.T) {
	if _, errs, code := (seoRun{stdin: "a\n"}).do("scope", "/nonexistent/SEO.md", "--files=-"); code != 1 || errs == "" {
		t.Fatal(code, errs)
	}
	md := write(t, filepath.Join(t.TempDir(), "SEO.md"), "# SEO\n")
	if _, errs, code := (seoRun{}).do("scope", md); code != 1 || !strings.Contains(errs, "--files") || !strings.Contains(errs, "--base") {
		t.Fatal(code, errs)
	}
}

const allocSeoMd = "## OpenSEO\n- 项目：`p`\n- 余额下限：1000\n- 套餐额度：每月 10000，每月 1 日重置\n- 每周分配：排名追踪 300；扫描 technical 200，pages 300，keywords 600，backlinks 400，geo 0，results 100；起草与验证 400\n"

func TestAllocateReadsSeoMdAndTheContextFileAndPrintsTheWeekWithThePlan(t *testing.T) {
	dir := t.TempDir()
	md := write(t, filepath.Join(dir, "SEO.md"), allocSeoMd)
	log := []map[string]string{
		{"entryDate": "2027-01-28", "summary": "seo-scan 2027-01-28 22:05，方向：pages\n采集：pages 1 条\n花费：700 credits，余额 15000"},
		{"entryDate": "2027-02-02", "summary": "seo-scan 2027-02-02 22:05，方向：pages\n采集：pages 1 条\n花费：3000 credits，余额 9000，份：扫描"},
		{"entryDate": "2027-02-09", "summary": "seo-scan 2027-02-09 22:05，方向：pages\n采集：pages 1 条\n花费：1500 credits，份：扫描"},
		{"entryDate": "2027-02-10", "summary": "起草 2027-02-10：issue #7\n花费：900 credits，份：起草与验证"},
	}
	b, _ := json.Marshal(map[string]any{"researchLog": log})
	ctx := write(t, filepath.Join(dir, "context.json"), string(b))
	out, errs, code := seoRun{}.do("allocate", md, "20000", "technical", "pages", "--context", ctx, "--today", "2027-02-15", "--spent", "0")
	if code != 0 {
		t.Fatal(code, errs)
	}
	var got struct {
		Allow map[string]float64
		Week  struct {
			Budget   float64
			LogKnown bool
		}
	}
	if err := json.Unmarshal([]byte(out), &got); err != nil || got.Allow["technical"] != 200 || got.Allow["pages"] != 300 || got.Week.Budget != 2300 || !got.Week.LogKnown {
		t.Fatal(out, err)
	}
	bare, _, _ := seoRun{}.do("allocate", md, "20000", "--today", "2027-02-15")
	if !strings.Contains(bare, `"logKnown": false`) || !strings.Contains(bare, `"allow": {}`) {
		t.Fatal("no context file: the book is unknown, not empty:", bare)
	}
	if _, _, code := (seoRun{}).do("allocate", md, "x", "pages", "--today", "2027-02-15"); code != 0 {
		t.Fatal("an unreadable balance is \"unknown\", not a usage error")
	}
	if _, _, code := (seoRun{}).do("allocate"); code != 1 {
		t.Fatal("no arguments is a usage error")
	}
	if _, errs, code := (seoRun{}).do("allocate", md, "100", "--spent", "-3"); code != 1 || !strings.Contains(errs, "--spent") {
		t.Fatal(code, errs)
	}
}

func TestDueGapsSyncContextAndCompareAuditsPrintTheirJSON(t *testing.T) {
	dir := t.TempDir()
	md := write(t, filepath.Join(dir, "SEO.md"), "## 竞品\n- `recipebox.example`：RecipeBox\n\n## 重点页面\n- `https://cookbook.example/pricing`\n")
	ctx := write(t, filepath.Join(dir, "context.json"), `{"researchLog":[{"entryDate":"2026-10-23","summary":"seo-scan 2026-10-23 22:05，方向：technical\n采集：technical 3 条；results 1 条"}],"competitors":[],"keyPages":[]}`)
	out, errs, code := seoRun{}.do("due", ctx, "2026-10-25")
	if code != 0 || errs != "" || !strings.Contains(out, `"due": [`) || !strings.Contains(out, `"technical": "2026-10-23"`) || !strings.Contains(out, `"backlinks": null`) {
		t.Fatal(code, errs, out)
	}
	if _, errs, code := (seoRun{}).do("due", ctx, "10/25"); code != 1 || !strings.Contains(errs, "YYYY-MM-DD") {
		t.Fatal(code, errs)
	}
	out, _, code = seoRun{}.do("gaps", md, "-", "pages", "keywords")
	if code != 0 || !strings.Contains(out, `"contextChecked": false`) || !strings.Contains(out, `"item": "brand_terms"`) {
		t.Fatal(code, out)
	}
	if _, errs, code := (seoRun{}).do("gaps", md, "-", "social"); code != 1 || !strings.Contains(errs, "social") {
		t.Fatal(code, errs)
	}
	out, _, code = seoRun{}.do("sync-context", md, ctx)
	if code != 0 || !strings.Contains(out, `"addCompetitors": [`) || !strings.Contains(out, "加竞品 recipebox.example") {
		t.Fatal(code, out)
	}
	prev := write(t, filepath.Join(dir, "prev.json"), `{"auditId":"old","pages":[{"url":"https://cookbook.example/pricing","statusCode":200,"title":"P","metaDescription":"d","isIndexable":true,"inSitemap":true}]}`)
	cur := write(t, filepath.Join(dir, "cur.json"), `{"auditId":"new","completedAt":"2026-10-20T10:00:00Z","pages":[{"url":"https://cookbook.example/pricing","statusCode":404,"title":"P","metaDescription":"d"}]}`)
	out, errs, code = seoRun{}.do("compare-audits", md, prev, cur)
	if code != 0 || errs != "" || !strings.Contains(out, `"kind": "key-page-regression"`) || !strings.Contains(out, "状态码 200 → 404") || !strings.Contains(out, `"when": "2026-10-20"`) {
		t.Fatal(code, errs, out)
	}
	if _, _, code := (seoRun{}).do("compare-audits", md, prev, filepath.Join(dir, "nope.json")); code != 1 {
		t.Fatal("an unreadable audit exits 1")
	}
}

// ---- verify-live ----

func liveBuild(t *testing.T, title string) string {
	t.Helper()
	dist := t.TempDir()
	write(t, filepath.Join(dist, "blog/weeknight-dinners/index.html"), `<html><head><title>`+title+`</title><meta name="description" content="Twelve dinners you can cook on a weeknight."></head></html>`)
	return dist
}

func liveSite(t *testing.T, title, head string) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/sitemap.xml":
			fmt.Fprintf(w, "<urlset><url><loc>http://%s/blog/weeknight-dinners/</loc></url></urlset>", r.Host)
		case "/blog/weeknight-dinners/":
			fmt.Fprintf(w, `<html><head><title>%s</title><meta name="description" content="Twelve dinners you can cook on a weeknight.">%s</head></html>`, title, head)
		default:
			w.WriteHeader(404)
		}
	}))
	t.Cleanup(srv.Close)
	return srv
}

func seoMdWith(t *testing.T, extra string) string {
	return write(t, filepath.Join(t.TempDir(), "SEO.md"), "## 构建与检查\n- 产物目录：`dist`\n"+extra)
}

func TestVerifyLiveNamesTheFailingItemAndTheVerdict(t *testing.T) {
	dist := liveBuild(t, "Weeknight dinners in 20 minutes")
	srv := liveSite(t, "Weeknight dinners in 20 minutes", `<meta name="robots" content="noindex">`)
	out, errs, code := seoRun{stdin: srv.URL + "/blog/weeknight-dinners/ 目标词：weeknight dinner ideas\n"}.do("verify-live", seoMdWith(t, ""), dist, "--urls=-")
	if code != 0 || errs != "" {
		t.Fatal(code, errs)
	}
	var r struct {
		Verdict string
		Failed  []struct{ Item string }
		Pages   []struct{ Keyword string }
	}
	if err := json.Unmarshal([]byte(out), &r); err != nil || r.Verdict != "fail" || len(r.Failed) != 1 || r.Failed[0].Item != "noindex" || r.Pages[0].Keyword != "weeknight dinner ideas" {
		t.Fatal(out, err)
	}
}

func TestVerifyLiveWaitOnASiteThatAlreadyServesTheBuildChecksAtOnceAndSaysHowLongItWaited(t *testing.T) {
	dist := liveBuild(t, "Weeknight dinners in 20 minutes")
	srv := liveSite(t, "Weeknight dinners in 20 minutes", "")
	out, errs, code := seoRun{stdin: srv.URL + "/blog/weeknight-dinners/ 目标词：weeknight dinner ideas\n"}.do("verify-live", seoMdWith(t, ""), dist, "--urls=-", "--wait", "--interval=0.05")
	if code != 0 || errs != "" || !strings.Contains(out, `"verdict": "pass"`) || !strings.Contains(out, `"waitedMinutes": 0`) || !strings.Contains(out, `"limitMinutes": 30`) {
		t.Fatal(code, errs, out)
	}
}

func TestVerifyLiveWaitOnASiteThatNeverServesTheBuildGivesUpAndSaysNotLiveNotFail(t *testing.T) {
	dist := liveBuild(t, "Weeknight dinners in 20 minutes")
	srv := liveSite(t, "Old title", "")
	url := srv.URL + "/blog/weeknight-dinners/"
	out, errs, code := seoRun{stdin: url + " 目标词：x\n"}.do("verify-live", seoMdWith(t, "- 上线等待：1\n"), dist, "--urls=-", "--wait", "--interval=0.05", "--max-wait=0.3")
	if code != 0 || errs != "" {
		t.Fatal(code, errs)
	}
	var r struct {
		Verdict      string
		Pending      []string
		LimitMinutes float64
	}
	if err := json.Unmarshal([]byte(out), &r); err != nil || r.Verdict != "not-live" || len(r.Pending) != 1 || r.Pending[0] != url || r.LimitMinutes != 1 {
		t.Fatal(out, err)
	}
	if !strings.Contains(out, "\"pages\": [],\n  \"failed\": []") {
		t.Fatal(out)
	}
}

func TestVerifyLiveNoURLsAnUnreadableSeoMdOrAURLWithoutAPageInTheBuildExitOneWithTheReason(t *testing.T) {
	dist := liveBuild(t, "x")
	md := seoMdWith(t, "")
	if _, errs, code := (seoRun{stdin: "没有网址\n"}).do("verify-live", md, dist, "--urls=-"); code != 1 || !strings.Contains(errs, "网址") {
		t.Fatal(code, errs)
	}
	if _, errs, code := (seoRun{stdin: "https://cookbook.example/blog/nothing-here/ 目标词：x\n"}).do("verify-live", md, dist, "--urls=-"); code != 1 || !strings.Contains(errs, "产物") {
		t.Fatal(code, errs)
	}
	if _, _, code := (seoRun{}).do("verify-live", filepath.Join(filepath.Dir(md), "nope.md"), dist, "--urls=-"); code != 1 {
		t.Fatal("unreadable SEO.md")
	}
	if _, _, code := (seoRun{}).do("verify-live", md, dist); code != 1 {
		t.Fatal("--urls is required")
	}
	if _, _, code := (seoRun{}).do("verify-live"); code != 1 {
		t.Fatal("no arguments")
	}
}

// ---- the commands that write or read GitHub for a project in home ----

type ghLog struct{ calls [][]string }

func (l *ghLog) factory(answers map[string]string) func(dir string) issues.GH {
	return func(dir string) issues.GH {
		return func(args []string) (string, error) {
			l.calls = append(l.calls, args)
			for prefix, answer := range answers {
				if strings.HasPrefix(strings.Join(args, " "), prefix) {
					return answer, nil
				}
			}
			return "", nil
		}
	}
}

// projectHome is a fake home with project example-app (repo o/r), whose docs/ and ISSUE_TRACKER.md are returned.
func projectHome(t *testing.T) (docs string, env map[string]string) {
	t.Helper()
	base := realTemp(t)
	home := filepath.Join(base, "home")
	write(t, filepath.Join(home, "AGENTS.md"), "# 设备\n\n## 项目\n\nexample-app（一个例子）: ~/code/example-app. Clone from https://github.com/o/r if missing.\n")
	docs = filepath.Join(home, "projects", "example-app", "docs")
	if err := os.MkdirAll(docs, 0o755); err != nil {
		t.Fatal(err)
	}
	write(t, filepath.Join(home, "projects", "example-app", "ISSUE_TRACKER.md"), "# Issue tracker：GitHub\n\n## 分类 label\n\n- `bug`：缺陷\n- `seo`：搜索流量\n  - `technical`：技术\n")
	return docs, map[string]string{"IDEA_LOOP_HOME": home, "HOME": base}
}

const findingJSON = `[{"direction":"technical","kind":"missing-meta-description","title":"页面没有 meta description","targets":["https://cookbook.example/a"],"evidence":{"what":"get_audit_pages limit 1000","when":"2026-10-20","values":"metaDescription 为空"},"repro":"get_audit_pages，看 metaDescription 为空的行","fix":"每页写一句描述","acceptance":["页面 head 里有 meta description"]},{"direction":"geo","uncollected":"没有 AI 可见性跟踪"},{"direction":"pages","kind":"low-ctr","title":"CTR 只有 1.1%","evidence":"x","repro":"y","acceptance":["z"]}]`

func TestFileIssuesDryRunOpensNothingAndLiveRunOpensTheIssuesInTheProjectsRepoWithItsType(t *testing.T) {
	docs, env := projectHome(t)
	findings := write(t, filepath.Join(t.TempDir(), "findings.json"), findingJSON)
	log := &ghLog{}
	gh := log.factory(map[string]string{"issue list": "[]", "issue create": "https://github.com/o/r/issues/41\n", "issue view": `{"labels":[]}`})
	out, errs, code := seoRun{env: env, gh: gh}.do("file-issues", docs, findings, "--dry-run", "--date=2026-11-06")
	if code != 0 || errs != "" {
		t.Fatal(code, errs)
	}
	var r struct {
		Created []struct {
			Number *int
			Title  string
		}
		Rejected []struct{ Title, Reason string }
		Untyped  bool
	}
	if err := json.Unmarshal([]byte(out), &r); err != nil || len(r.Created) != 1 || r.Created[0].Number != nil || r.Created[0].Title != "SEO（技术 SEO 与索引）：页面没有 meta description" ||
		len(r.Rejected) != 1 || r.Rejected[0].Title != "CTR 只有 1.1%" || !strings.Contains(r.Rejected[0].Reason, "分子分母") || r.Untyped {
		t.Fatal(out, err)
	}
	for _, c := range log.calls {
		if c[1] == "create" || c[1] == "edit" || c[1] == "comment" {
			t.Fatal("a dry run writes nothing:", c)
		}
		if c[2] != "-R" || c[3] != "o/r" {
			t.Fatalf("every gh call is aimed at the project's repo: %v", c)
		}
	}
	log.calls = nil
	out, errs, code = seoRun{env: env, gh: gh}.do("file-issues", docs, findings, "--date=2026-11-06")
	if code != 0 || errs != "" || !strings.Contains(out, `"number": 41`) {
		t.Fatal(code, errs, out)
	}
	var sawLabel bool
	for _, c := range log.calls {
		if c[1] == "edit" && strings.Contains(strings.Join(c, " "), "--add-label type:seo/technical") {
			sawLabel = true
		}
		if c[1] == "create" && strings.Contains(strings.Join(c, " "), "--label") {
			t.Fatal("no status label at creation")
		}
	}
	if !sawLabel {
		t.Fatal(log.calls)
	}
}

func TestFileIssuesRefusesUsageADocsOutsideHomeAndAFindingsFileThatIsNotAList(t *testing.T) {
	docs, env := projectHome(t)
	findings := write(t, filepath.Join(t.TempDir(), "findings.json"), findingJSON)
	if _, errs, code := (seoRun{env: env}).do("file-issues", docs); code != 1 || !strings.Contains(errs, "usage") {
		t.Fatal(code, errs)
	}
	if _, errs, code := (seoRun{env: env}).do("file-issues", docs, findings, "--date=yesterday"); code != 1 || !strings.Contains(errs, "usage") {
		t.Fatal(code, errs)
	}
	object := write(t, filepath.Join(t.TempDir(), "o.json"), `{"a":1}`)
	if _, errs, code := (seoRun{env: env}).do("file-issues", docs, object); code != 1 || !strings.Contains(errs, "不是发现清单") {
		t.Fatal(code, errs)
	}
	outside := t.TempDir()
	if _, errs, code := (seoRun{env: env}).do("file-issues", outside, findings); code != 1 || errs == "" {
		t.Fatal("a docs outside home stops with the project map's sentence:", code, errs)
	}
}

func TestRecordListAndFromRollbackReadTheProjectsRepositoryNotWhateverRepositoryDocsSitsIn(t *testing.T) {
	docs, env := projectHome(t)
	log := &ghLog{}
	gh := log.factory(map[string]string{"issue list": "[]", "issue view": `{"body":"x"}`})
	out, errs, code := seoRun{env: env, gh: gh}.do("record", "list", docs)
	if code != 0 || errs != "" || out != "[]\n" {
		t.Fatal(code, errs, out)
	}
	if got := strings.Join(log.calls[0], " "); !strings.HasPrefix(got, "issue list -R o/r --state closed --label type:seo") {
		t.Fatal(got)
	}
	out, errs, code = seoRun{env: env, gh: gh}.do("record", "from-rollback", docs, "12")
	if code != 0 || errs != "" || out != `{"issue":12,"fromRollback":false}`+"\n" {
		t.Fatal(code, errs, out)
	}
	if got := strings.Join(log.calls[1], " "); !strings.HasPrefix(got, "issue view -R o/r 12 --json body") {
		t.Fatal(got)
	}
	if _, errs, code := (seoRun{env: env, gh: gh}).do("record", "list", docs, "--since=Nov"); code != 1 || !strings.Contains(errs, "--since") {
		t.Fatal(code, errs)
	}
	if _, _, code := (seoRun{env: env, gh: gh}).do("record", "from-rollback", docs, "ENG-123"); code != 1 {
		t.Fatal("not an issue number")
	}
}

func TestRecordBodyWritesTheCommentOfAPassedCheckAndRefusesAFailedOne(t *testing.T) {
	dir := t.TempDir()
	item := `{"ok":true,"detail":""}`
	result := write(t, filepath.Join(dir, "r.json"), `{"verdict":"pass","pages":[{"url":"https://cookbook.example/a/","keyword":"k","status":`+item+`,"noindex":`+item+`,"meta":`+item+`,"sitemap":`+item+`}],"failed":[]}`)
	out, errs, code := seoRun{}.do("record", "body", result, "--merged=2026-11-16", "--pr=321")
	if code != 0 || errs != "" || !strings.HasPrefix(out, "上线自查：全过（1 个网址，合并日 2026-11-16，PR #321）") || !strings.Contains(out, "<!-- seo-live-check: {") {
		t.Fatal(code, errs, out)
	}
	failed := write(t, filepath.Join(dir, "f.json"), `{"verdict":"fail","pages":[],"failed":[]}`)
	if _, errs, code := (seoRun{}).do("record", "body", failed, "--merged=2026-11-16"); code != 1 || !strings.Contains(errs, "全过") {
		t.Fatal(code, errs)
	}
	if _, errs, code := (seoRun{}).do("record", "body", result); code != 1 || !strings.Contains(errs, "YYYY-MM-DD") {
		t.Fatal(code, errs)
	}
}

func TestProvenancePrintsTheVerdictAndUnreadableInputExitsOneWithTheReason(t *testing.T) {
	repo := realTemp(t)
	git := func(when string, args ...string) {
		t.Helper()
		cmd := exec.Command("git", append([]string{"-C", repo, "-c", "commit.gpgsign=false"}, args...)...)
		cmd.Env = append(os.Environ(), "GIT_AUTHOR_DATE="+when, "GIT_COMMITTER_DATE="+when)
		if o, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("%v %s", err, o)
		}
	}
	git("2026-10-20T09:00:00Z", "init", "-q", "-b", "main")
	git("2026-10-20T09:00:00Z", "config", "user.email", "t@example.com")
	git("2026-10-20T09:00:00Z", "config", "user.name", "t")
	write(t, filepath.Join(repo, "pricing.md"), "title: Old pricing\n")
	git("2026-10-20T09:00:00Z", "add", "-A")
	git("2026-10-20T09:00:00Z", "commit", "-q", "-m", "base")
	git("2026-11-03T09:00:00Z", "checkout", "-q", "-b", "pr-42")
	write(t, filepath.Join(repo, "pricing.md"), "title: Pricing that fits any kitchen\n")
	git("2026-11-03T09:00:00Z", "add", "-A")
	git("2026-11-03T09:00:00Z", "commit", "-q", "-m", "edit")
	git("2026-11-04T09:00:00Z", "checkout", "-q", "main")
	git("2026-11-04T09:00:00Z", "merge", "--no-ff", "-q", "-m", "Merge pull request #42 from user/pr-42", "pr-42")

	files := t.TempDir()
	url := "https://cookbook.example/pricing"
	prev := write(t, filepath.Join(files, "prev.json"), `{"pages":[{"url":"`+url+`","title":"Old pricing"}]}`)
	cur := write(t, filepath.Join(files, "cur.json"), `{"pages":[{"url":"`+url+`","title":"Pricing that fits any kitchen"}]}`)
	findings := write(t, filepath.Join(files, "findings.json"), `[{"direction":"technical","kind":"key-page-meta-changed","title":"1","targets":["`+url+`"]}]`)
	out, errs, code := seoRun{}.do("provenance", repo, prev, cur, findings, "2026-11-01T10:00:00Z", "2026-11-08T10:00:00Z", "--branch=main")
	if code != 0 || errs != "" || !strings.Contains(out, `"findings": []`) || !strings.Contains(out, `"log": "有意改动：`+url+` → #42"`) {
		t.Fatal(code, errs, out)
	}
	if _, errs, code := (seoRun{}).do("provenance", repo, filepath.Join(files, "nope.json"), cur, findings, "2026-11-01T10:00:00Z", "2026-11-08T10:00:00Z"); code != 1 || errs == "" {
		t.Fatal(code, errs)
	}
	if _, _, code := (seoRun{}).do("provenance", files, prev, cur, findings, "2026-11-01T10:00:00Z", "2026-11-08T10:00:00Z", "--branch=main"); code != 1 {
		t.Fatal("not a git repository")
	}
	if _, errs, code := (seoRun{}).do("provenance", repo, prev); code != 1 || !strings.Contains(errs, "usage") {
		t.Fatal(code, errs)
	}
}
