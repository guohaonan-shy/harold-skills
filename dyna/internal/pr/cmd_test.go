package pr_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"unicode/utf16"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/app"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/githubapp"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/pr"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/registry"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/version"
)

// fakeGH is a GitHub that remembers: the description of PR 5, the comments on it, and every call it was asked for.
type fakeGH struct {
	body     string
	comments []string
	calls    [][]string
	stdins   []string
	pr       map[string]string // answers for `gh pr …`, by sub-command
	fail     map[string]string // sub-command or endpoint → stderr of a failure
}

func (f *fakeGH) run(args []string, stdin string, env []string) (string, error) {
	f.calls = append(f.calls, args)
	f.stdins = append(f.stdins, stdin)
	key := args[0]
	if len(args) > 1 {
		key += " " + args[1]
	}
	if msg, ok := f.fail[key]; ok {
		return "", &githubapp.GHError{Stderr: msg}
	}
	method := ""
	for i, a := range args {
		if a == "--method" {
			method = args[i+1]
		}
	}
	switch {
	case args[0] == "api" && args[1] == "repos/o/r/pulls/5" && method == "GET":
		b, _ := json.Marshal(map[string]string{"body": f.body})
		return string(b), nil
	case args[0] == "api" && args[1] == "repos/o/r/pulls/5" && method == "PATCH":
		var v struct{ Body string }
		if err := json.Unmarshal([]byte(stdin), &v); err != nil {
			return "", err
		}
		f.body = v.Body
		return "{}", nil
	case args[0] == "api" && strings.HasPrefix(args[1], "repos/o/r/issues/5/comments") && method == "GET":
		var page []map[string]string
		for _, c := range f.comments {
			page = append(page, map[string]string{"body": c})
		}
		b, _ := json.Marshal([][]map[string]string{page})
		return string(b), nil
	case args[0] == "api" && args[1] == "repos/o/r/issues/5/comments" && method == "POST":
		var v struct{ Body string }
		_ = json.Unmarshal([]byte(stdin), &v)
		f.comments = append(f.comments, v.Body)
		return fmt.Sprintf(`{"html_url":"https://github.com/o/r/pull/5#issuecomment-%d"}`, len(f.comments)), nil
	case args[0] == "pr":
		return f.pr[args[1]], nil
	}
	return "", &githubapp.GHError{Stderr: "fake gh: no route for " + strings.Join(args, " ")}
}

// session runs dyna with the fakes in place and reports what it printed and the exit code.
type session struct {
	t    *testing.T
	gh   *fakeGH
	home string
	git  func(args []string) (string, error)
	in   string
}

func newSession(t *testing.T) *session {
	return &session{t: t, gh: &fakeGH{pr: map[string]string{}}, home: t.TempDir()}
}

func (s *session) run(args ...string) (stdout, stderr string, code int) {
	var out, errb bytes.Buffer
	code = app.Run(args, app.IO{
		Stdin: strings.NewReader(s.in), Stdout: &out, Stderr: &errb,
		Env: func(k string) string { return map[string]string{"HOME": s.home}[k] },
		PR:  pr.Deps{GH: s.gh.run, Git: s.git},
	})
	return out.String(), errb.String(), code
}

func write(t *testing.T, path, content string) string {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
	return path
}

func contains(t *testing.T, s string, want ...string) {
	t.Helper()
	for _, w := range want {
		if !strings.Contains(s, w) {
			t.Errorf("no %q in:\n%s", w, s)
		}
	}
}

// ---- pr body ----

func TestBodySetWritesOneSectionAndLeavesWhatTheHumanWrote(t *testing.T) {
	s := newSession(t)
	s.gh.body = "Refs o/r#3\n\n🤖 Generated with Claude Code"
	dir := t.TempDir()
	out, errs, code := s.run("pr", "body", "set", "o/r", "5", "summary", write(t, filepath.Join(dir, "a.md"), "学生重试失败的题不再扣次数"))
	if code != 0 || errs != "" {
		t.Fatal(out, errs, code)
	}
	if want := fmt.Sprintf("section summary written (%d characters)\n", len(utf16.Encode([]rune(s.gh.body)))); out != want {
		t.Fatalf("%q, want %q", out, want)
	}
	if !strings.HasPrefix(s.gh.body, "<!-- idea-loop:section summary -->\n## 一句话\n\n学生重试失败的题不再扣次数\n<!-- /idea-loop:section summary -->\n\nRefs o/r#3") || !strings.HasSuffix(s.gh.body, "🤖 Generated with Claude Code\n") {
		t.Fatal(s.gh.body)
	}
	out, _, code = s.run("pr", "body", "get", "o/r", "5", "summary")
	if code != 0 || out != "学生重试失败的题不再扣次数\n" {
		t.Fatal(out, code)
	}
	out, _, code = s.run("pr", "body", "get", "o/r", "5", "problem")
	if code != 0 || out != "\n" {
		t.Fatalf("a section that is not there prints an empty line: %q %d", out, code)
	}
}

func TestBodySetRefusesCodeLevelWordsBeforeItWritesAnythingAndSaysWhich(t *testing.T) {
	s := newSession(t)
	s.gh.body = "before"
	file := write(t, filepath.Join(t.TempDir(), "a.md"), "重试时不再调 `retryAnalysis`，见 src/report/retry.ts:42")
	_, errs, code := s.run("pr", "body", "set", "o/r", "5", "changes", file)
	if code != 1 {
		t.Fatal(code)
	}
	contains(t, errs, "section changes is read by a person; say it in words, put code locations in reference:", "反引号「`retryAnalysis`」", "文件:行号「src/report/retry.ts:42」")
	if s.gh.body != "before" {
		t.Fatal("nothing may be written:", s.gh.body)
	}
	for _, c := range s.gh.calls {
		for i, a := range c {
			if a == "--method" && c[i+1] == "PATCH" {
				t.Fatal("a PATCH was sent")
			}
		}
	}
	// the same words are fine in 参考, which is for looking things up
	if _, errs, code := s.run("pr", "body", "set", "o/r", "5", "reference", file); code != 0 {
		t.Fatal(errs)
	}
}

func TestBodyUsageErrorsAreExit1WithAUsageLine(t *testing.T) {
	s := newSession(t)
	for _, args := range [][]string{
		{"pr", "body", "get", "o", "5", "summary"},
		{"pr", "body", "get", "o/r", "x", "summary"},
		{"pr", "body", "get", "o/r", "5", "nope"},
		{"pr", "body", "set", "o/r", "5", "summary"},
		{"pr", "body", "set", "o/r", "5", "nope", "f.md"},
	} {
		_, errs, code := s.run(args...)
		if code != 1 || !strings.Contains(errs, "usage: dyna pr body") {
			t.Errorf("%v: %q %d", args, errs, code)
		}
	}
	_, errs, code := s.run("pr", "body", "set", "o/r", "5", "summary", "/nonexistent/a.md")
	if code != 1 || !strings.Contains(errs, "读不到内容文件") {
		t.Fatal(errs, code)
	}
	if len(s.gh.calls) != 0 {
		t.Fatalf("a bad call must not reach GitHub: %v", s.gh.calls)
	}
}

func TestAGhFailureIsPrintedAsGhSaidIt(t *testing.T) {
	s := newSession(t)
	s.gh.fail = map[string]string{"api repos/o/r/pulls/5": "gh: Not Found (HTTP 404)"}
	_, errs, code := s.run("pr", "body", "get", "o/r", "5", "summary")
	if code != 1 || strings.TrimSpace(errs) != "gh: Not Found (HTTP 404)" {
		t.Fatalf("%q %d", errs, code)
	}
}

// ---- pr loop ----

func TestLoopNextAndCheckReadTheFile(t *testing.T) {
	s := newSession(t)
	file := write(t, filepath.Join(t.TempDir(), "5.md"), "# PR #5 的 review loop\n\n<!-- idea-loop-entry {\"kind\":\"review\",\"round\":1} -->\n## Review 第 1 轮\n\n### 要你决定\n问题\n")
	out, _, code := s.run("pr", "loop", "next", file, "review")
	if code != 0 || out != "2\n" {
		t.Fatal(out, code)
	}
	out, _, _ = s.run("pr", "loop", "next", file, "review", "impl")
	if out != "1\n" {
		t.Fatal(out)
	}
	out, _, _ = s.run("pr", "loop", "next", filepath.Join(t.TempDir(), "none.md"), "replay")
	if out != "1\n" {
		t.Fatal("a file that is not there is an empty loop:", out)
	}
	out, _, code = s.run("pr", "loop", "check", file)
	want := "{\n  \"entries\": [\n    {\n      \"kind\": \"review\",\n      \"round\": 1,\n      \"source\": \"review\",\n      \"rulings\": 0,\n      \"settled\": false\n    }\n  ],\n  \"unsettled\": [\n    {\n      \"kind\": \"review\",\n      \"round\": 1\n    }\n  ]\n}\n"
	if code != 0 || out != want {
		t.Fatalf("%q", out)
	}
	_, errs, code := s.run("pr", "loop", "next", file, "bogus")
	if code != 1 || !strings.Contains(errs, "usage: dyna pr loop next") {
		t.Fatal(errs, code)
	}
	bad := write(t, filepath.Join(t.TempDir(), "bad.md"), `<!-- idea-loop-entry {"kind":"note","round":1} -->`)
	_, errs, code = s.run("pr", "loop", "check", bad)
	if code != 1 || !strings.Contains(errs, "bad entry marker") {
		t.Fatal(errs, code)
	}
}

func TestLoopArchivePostsEachEntryOnceAsTheGhLoginWithAFigureUploadedFirst(t *testing.T) {
	s := newSession(t)
	dir := t.TempDir()
	write(t, filepath.Join(dir, "evidence", "r1-s1-flow.png"), "PNG")
	file := write(t, filepath.Join(dir, "5.md"), "# PR #5 的 review loop\n\n<!-- idea-loop-entry {\"kind\":\"review\",\"round\":1} -->\n## Review 第 1 轮\n\n![流程](evidence/r1-s1-flow.png)\n\n### 做了什么\n- 继续\n")
	// the evidence branch does not exist yet; every write of it answers with a sha
	s.gh.fail = map[string]string{"api repos/o/r/git/ref/heads/idea-loop-evidence-pr-5": "Not Found"}
	run := s.gh
	wrapped := func(args []string, stdin string, env []string) (string, error) {
		if args[0] == "api" && strings.HasPrefix(args[1], "repos/o/r/git/") && args[1] != "repos/o/r/git/ref/heads/idea-loop-evidence-pr-5" {
			run.calls = append(run.calls, args)
			return `{"sha":"abc"}`, nil
		}
		return run.run(args, stdin, env)
	}
	var out, errb bytes.Buffer
	code := app.Run([]string{"pr", "loop", "archive", file, "o/r", "5"}, app.IO{
		Stdout: &out, Stderr: &errb, Env: func(k string) string { return map[string]string{"HOME": s.home}[k] },
		PR: pr.Deps{GH: wrapped},
	})
	if code != 0 {
		t.Fatal(errb.String())
	}
	var got struct {
		Posted []struct {
			Kind  string
			Round int
			URL   string
		}
		Identity string
	}
	if err := json.Unmarshal(out.Bytes(), &got); err != nil {
		t.Fatal(err, out.String())
	}
	if got.Identity != "gh-login" || len(got.Posted) != 1 || got.Posted[0].Kind != "review" || got.Posted[0].Round != 1 || !strings.HasPrefix(got.Posted[0].URL, "https://github.com/o/r/pull/5#issuecomment-") {
		t.Fatalf("%+v", got)
	}
	if len(s.gh.comments) != 1 {
		t.Fatal(s.gh.comments)
	}
	c := s.gh.comments[0]
	contains(t, c, `<!-- idea-loop-archive {"kind":"review","round":1} -->`, "review 第 1 轮在会话里进行",
		"![流程](https://github.com/o/r/blob/idea-loop-evidence-pr-5/r1-s1-flow.png?raw=true)")
	if strings.Contains(c, "由 Claude 代发") {
		t.Fatal("the gh login posts with no signature line:", c)
	}
	// the second run finds the marker on the PR and posts nothing
	out.Reset()
	code = app.Run([]string{"pr", "loop", "archive", file, "o/r", "5"}, app.IO{
		Stdout: &out, Stderr: &errb, Env: func(k string) string { return map[string]string{"HOME": s.home}[k] },
		PR: pr.Deps{GH: wrapped},
	})
	if code != 0 || len(s.gh.comments) != 1 || !strings.Contains(out.String(), `"posted": []`) {
		t.Fatal(code, out.String(), s.gh.comments)
	}
	_, errs, code := s.run("pr", "loop", "archive", filepath.Join(dir, "none.md"), "o/r", "5")
	if code != 1 || !strings.Contains(errs, "no review-loop file at") {
		t.Fatal(errs, code)
	}
}

// ---- pr evidence ----

func TestEvidencePublishWithABadFileExits2AndListsEveryProblem(t *testing.T) {
	s := newSession(t)
	dir := t.TempDir()
	flow := write(t, filepath.Join(dir, "flow.png"), "x")
	zip := write(t, filepath.Join(dir, "t01-trace.zip"), "x")
	_, errs, code := s.run("pr", "evidence", "publish", "o/r", "5", flow, zip)
	if code != 2 {
		t.Fatal(code, errs)
	}
	contains(t, errs, "flow.png：要以归属开头", "t01-trace.zip：只收图片")
	if len(s.gh.calls) != 0 {
		t.Fatalf("nothing may be sent: %v", s.gh.calls)
	}
	_, errs, code = s.run("pr", "evidence", "publish", "o/r", "5")
	if code != 2 || !strings.Contains(errs, "没有要上传的文件") {
		t.Fatal(errs, code)
	}
	_, errs, code = s.run("pr", "evidence", "frobnicate", "o/r", "5")
	if code != 1 || !strings.Contains(errs, "不认识的命令") {
		t.Fatal(errs, code)
	}
}

// ---- pr candidates submit ----

func gitDiff(diff string) func([]string) (string, error) {
	return func(args []string) (string, error) {
		if len(args) >= 3 && args[0] == "diff" && args[len(args)-1] == "main...HEAD" {
			return diff, nil
		}
		return "", fmt.Errorf("fake git: %v", args)
	}
}

const handlerDiff = "--- a/src/api/handler.ts\n+++ b/src/api/handler.ts\n@@ -1,0 +2,3 @@\n+import { db } from '../db/client';\n+export async function handler(req) {\n"

func goodStandards(dir string) string {
	return `{"standards":[{"id":"C1","title":"接口直接查数据库","rule":{"file":"` + filepath.Join(dir, "layering.md") + `","text":"路由层不直接访问数据库"},"code":{"path":"src/api/handler.ts","snippet":"import { db } from '../db/client';"},"now":"分层规则写明路由层不直接访问数据库；分析接口直接查了数据库。","impact":"以后换存储时这一处会被漏掉。","decide":{"options":[{"do":"修：把查询挪进业务层","cost":"多一个函数","rollback":"能，纯代码改动"},{"do":"开 issue：这次不动","cost":"规则在这一处继续不成立","rollback":"能，随时可以改"}],"recommend":"修，改动很小。"}}]}`
}

func TestCandidatesSubmitAdmitsAGroundedCandidateAndExits0(t *testing.T) {
	s := newSession(t)
	s.git = gitDiff(handlerDiff)
	dir := t.TempDir()
	write(t, filepath.Join(dir, "layering.md"), "路由层不直接访问数据库，\n统一经过 service 层。")
	file := write(t, filepath.Join(dir, "cands.json"), goodStandards(dir))
	out, errs, code := s.run("pr", "candidates", "submit", file, "main", filepath.Join(dir, "evidence"), "1")
	if code != 0 || errs != "" {
		t.Fatal(out, errs, code)
	}
	var res struct{ Standards, Spec, Discarded, Rewrite []json.RawMessage }
	if err := json.Unmarshal([]byte(out), &res); err != nil || len(res.Standards) != 1 || len(res.Discarded) != 0 || len(res.Rewrite) != 0 {
		t.Fatal(err, out)
	}
}

func TestCandidatesSubmitRefusesABadlyWordedCandidateAndSaysWhichOneAndWhatIsWrong(t *testing.T) {
	s := newSession(t)
	s.git = gitDiff(handlerDiff)
	dir := t.TempDir()
	write(t, filepath.Join(dir, "layering.md"), "路由层不直接访问数据库，\n统一经过 service 层。")
	bad := strings.Replace(goodStandards(dir), `"now":"分层规则写明路由层不直接访问数据库；分析接口直接查了数据库。"`, `"now":"`+"`handler`"+` 里 import 了 db"`, 1)
	bad = strings.Replace(bad, `"recommend":"修，改动很小。"`, `"recommend":""`, 1)
	file := write(t, filepath.Join(dir, "cands.json"), bad)
	out, errs, code := s.run("pr", "candidates", "submit", file, "main", filepath.Join(dir, "evidence"), "1")
	if code != 2 {
		t.Fatal(code, errs)
	}
	contains(t, errs, "C1：「现状」里有代码层面的指称：反引号「`handler`」", "C1：「要你决定」没给建议")
	var res struct {
		Rewrite []struct {
			ID       string
			Problems []string
		}
	}
	if err := json.Unmarshal([]byte(out), &res); err != nil || len(res.Rewrite) != 1 || res.Rewrite[0].ID != "C1" {
		t.Fatal(err, out)
	}
}

func TestCandidatesSubmitUsageAndInputErrorsExit1(t *testing.T) {
	s := newSession(t)
	s.git = gitDiff(handlerDiff)
	dir := t.TempDir()
	for _, args := range [][]string{
		{"pr", "candidates", "submit", "c.json", "main", dir},
		{"pr", "candidates", "submit", "c.json", "main", dir, "x"},
	} {
		_, errs, code := s.run(args...)
		if code != 1 || !strings.Contains(errs, "usage: dyna pr candidates submit") {
			t.Errorf("%v: %q %d", args, errs, code)
		}
	}
	_, errs, code := s.run("pr", "candidates", "submit", filepath.Join(dir, "none.json"), "main", dir, "1")
	if code != 1 || !strings.Contains(errs, "读不到候选文件") {
		t.Fatal(errs, code)
	}
	_, errs, code = s.run("pr", "candidates", "submit", write(t, filepath.Join(dir, "bad.json"), "not json"), "main", dir, "1")
	if code != 1 || !strings.Contains(errs, "读不懂") {
		t.Fatal(errs, code)
	}
	s.git = func([]string) (string, error) { return "", fmt.Errorf("fatal: bad revision 'nope...HEAD'") }
	_, errs, code = s.run("pr", "candidates", "submit", write(t, filepath.Join(dir, "ok.json"), "{}"), "nope", dir, "1")
	if code != 1 || !strings.Contains(errs, "bad revision") {
		t.Fatal(errs, code)
	}
}

// ---- pr diagnostics filter ----

func TestDiagnosticsFilterKeepsOnlyWhatSitsOnChangedLines(t *testing.T) {
	s := newSession(t)
	s.git = func(args []string) (string, error) {
		if !reflect.DeepEqual(args, []string{"diff", "-U0", "--no-color", "main...HEAD"}) {
			return "", fmt.Errorf("fake git: %v", args)
		}
		return "--- a/api/routes.py\n+++ b/api/routes.py\n@@ -0,0 +1,2 @@\n+import os\n+def handler(): pass\n", nil
	}
	s.in = "api/routes.py:1:1: F401 imported but unused\napi/routes.py:9:1: old debt\nFound 2 errors.\n"
	out, errs, code := s.run("pr", "diagnostics", "filter", "main")
	want := "{\n  \"onChanged\": [\n    \"api/routes.py:1:1: F401 imported but unused\"\n  ],\n  \"elsewhere\": 1,\n  \"unlocated\": 1\n}\n"
	if code != 0 || out != want {
		t.Fatalf("%q %q %d", out, errs, code)
	}
	_, errs, code = s.run("pr", "diagnostics", "filter")
	if code != 1 || !strings.Contains(errs, "usage:") {
		t.Fatal(errs, code)
	}
}

// ---- pr open / ready / view / merge ----

func TestOpenReadyViewAndMergeCallGhWithTheRepositoryNamedAndPrintWhatTheCallerNeeds(t *testing.T) {
	s := newSession(t)
	dir := t.TempDir()
	bodyFile := write(t, filepath.Join(dir, "body.md"), "Refs o/r#3")
	s.gh.pr["create"] = "https://github.com/o/r/pull/5\n"
	s.gh.pr["view"] = `{"number":5,"isDraft":false}` + "\n"
	last := func() string { return strings.Join(s.gh.calls[len(s.gh.calls)-1], " ") }

	out, errs, code := s.run("pr", "open", "o/r", "--base", "main", "--title", "重试不再多扣次数", "--body-file", bodyFile)
	if code != 0 || out != "https://github.com/o/r/pull/5\n" {
		t.Fatal(out, errs, code)
	}
	if last() != "pr create --repo o/r --base main --title 重试不再多扣次数 --body-file "+bodyFile+" --draft" {
		t.Fatal(last())
	}
	s.run("pr", "open", "o/r", "--base", "main", "--title", "t", "--body-file", bodyFile, "--head", "issue/3-x", "--ready")
	if last() != "pr create --repo o/r --base main --title t --body-file "+bodyFile+" --head issue/3-x" {
		t.Fatal(last())
	}
	_, errs, code = s.run("pr", "open", "o/r", "--base", "main")
	if code != 1 || !strings.Contains(errs, "usage: dyna pr open") {
		t.Fatal(errs, code)
	}
	_, errs, code = s.run("pr", "open", "o/r", "--base", "main", "--title", "t", "--body-file", filepath.Join(dir, "none.md"))
	if code != 1 || !strings.Contains(errs, "读不到正文文件") {
		t.Fatal(errs, code)
	}

	out, _, code = s.run("pr", "ready", "o/r", "5")
	if code != 0 || out != "PR #5 已转 ready\n" || last() != "pr ready 5 --repo o/r" {
		t.Fatal(out, last())
	}
	out, _, code = s.run("pr", "view", "o/r", "5")
	if code != 0 || out != `{"number":5,"isDraft":false}`+"\n" || !strings.HasPrefix(last(), "pr view 5 --repo o/r --json number,title,state,isDraft") {
		t.Fatal(out, last())
	}
	s.run("pr", "view", "o/r", "5", "--fields", "state,mergeCommit")
	if last() != "pr view 5 --repo o/r --json state,mergeCommit" {
		t.Fatal(last())
	}
	out, _, code = s.run("pr", "merge", "o/r", "5", "--method", "merge")
	if code != 0 || out != "PR #5 已合并（merge）\n" || last() != "pr merge 5 --repo o/r --merge" {
		t.Fatal(out, last())
	}
	s.run("pr", "merge", "o/r", "5", "--method", "squash")
	if last() != "pr merge 5 --repo o/r --squash" {
		t.Fatal(last())
	}
	n := len(s.gh.calls)
	_, errs, code = s.run("pr", "merge", "o/r", "5")
	if code != 1 || !strings.Contains(errs, "usage: dyna pr merge") || len(s.gh.calls) != n {
		t.Fatal("a merge without its method must not reach gh:", errs, code)
	}
	_, errs, code = s.run("pr", "merge", "o/r", "5", "--method", "fast-forward")
	if code != 1 || len(s.gh.calls) != n {
		t.Fatal(errs, code)
	}
}

func TestAFailedMergeSaysWhatGhSaidAndNamesTheNextCommand(t *testing.T) {
	s := newSession(t)
	s.gh.fail = map[string]string{"pr merge": "Pull request #5 is still a draft"}
	_, errs, code := s.run("pr", "merge", "o/r", "5", "--method", "merge")
	if code != 1 {
		t.Fatal(code)
	}
	contains(t, errs, "Pull request #5 is still a draft", "下一条：dyna pr view <owner/repo> <pr>")
}

// ---- the registry ----

func TestTheRegistryHasEveryPrCommandCalledBySessions(t *testing.T) {
	var out, errb bytes.Buffer
	if code := app.Run([]string{"registry", "--json"}, app.IO{Stdout: &out, Stderr: &errb}); code != 0 {
		t.Fatal(errb.String())
	}
	var reg registry.Registry
	if err := json.Unmarshal(out.Bytes(), &reg); err != nil {
		t.Fatal(err)
	}
	if reg.Version != version.Version {
		t.Fatal(reg.Version)
	}
	want := []string{"body get", "body set", "candidates submit", "diagnostics filter", "evidence cleanup", "evidence list", "evidence publish",
		"loop archive", "loop check", "loop next", "merge", "open", "ready", "skill-growth", "view"}
	have := map[string]registry.Command{}
	for _, c := range reg.Commands {
		if c.Module == "pr" {
			have[strings.TrimPrefix(c.Command, "pr ")] = c
		}
	}
	for _, w := range want {
		c, ok := have[w]
		if !ok {
			t.Errorf("pr %s is not in the registry", w)
			continue
		}
		if c.Caller != registry.CallerSession || c.Summary == "" || len(c.Args) == 0 {
			t.Errorf("pr %s: %+v", w, c)
		}
	}
	if len(have) != len(want) {
		t.Errorf("pr has %d commands in the registry, expected %d", len(have), len(want))
	}
	// no command carries the name of an old script
	for name := range have {
		for _, old := range []string{"pr-body", "review-loop", "review-check", "changed-lines", "github-app"} {
			if strings.Contains(name, old) || strings.Contains(have[name].Summary, old+".mjs") {
				t.Errorf("pr %s still speaks of %s", name, old)
			}
		}
	}
	// the candidates check says who to run next only in its own message; merge and ready point at view
	if have["merge"].Next == "" || have["ready"].Next == "" {
		t.Error("merge and ready name a next command")
	}
	args := map[string]registry.Arg{}
	for _, a := range have["open"].Args {
		args[a.Name] = a
	}
	for _, f := range []string{"base", "title", "body-file", "head", "ready"} {
		if args[f].Kind != "flag" {
			t.Errorf("pr open lacks --%s", f)
		}
	}
	if args["owner/repo"].Kind != "positional" || !args["owner/repo"].Required {
		t.Errorf("%+v", args["owner/repo"])
	}
}
