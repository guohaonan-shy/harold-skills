package spec_test

import (
	"bytes"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/app"
)

// These run the command tree the way a session does: arguments in, stdout, stderr and the exit code out.

func run(t *testing.T, args ...string) (stdout, stderr string, code int) {
	t.Helper()
	var out, errb bytes.Buffer
	code = app.Run(args, app.IO{Stdin: strings.NewReader(""), Stdout: &out, Stderr: &errb})
	return out.String(), errb.String(), code
}

func writeFile(t *testing.T, path, text string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(text), 0o644); err != nil {
		t.Fatal(err)
	}
}

const retrySpec = "---\ntype: spec\ntags: [retry]\nsummary: 重试不消耗配额\nrelated: []\nissues: [12, ENG-123]\n---\n\n# 重试不消耗配额\n\n## 问题陈述\n\n重试多扣配额。\n\n## 方案\n\n重试不再扣配额。\n\n## User Stories\n\n1. 作为用户，我想要重试不扣配额。\n\n## 实现决策\n\n无。\n\n## 测试决策\n\n无。\n\n## Out of scope\n\n无。\n\n## 关联\n\n无。\n"

func docsDir(t *testing.T) string {
	t.Helper()
	docs := filepath.Join(t.TempDir(), "docs")
	writeFile(t, filepath.Join(docs, "spec", "index.md"), "# spec\n> 契约：x\n\n| 文件 | summary |\n|---|---|\n")
	writeFile(t, filepath.Join(docs, "spec", "practice-retry", "practice-retry.md"), retrySpec)
	writeFile(t, filepath.Join(docs, "spec", "practice-retry", "tickets", "01-a.md"), "x")
	return docs
}

func TestIndexWritesTheTableAndPrintsNothing(t *testing.T) {
	docs := docsDir(t)
	out, errs, code := run(t, "spec", "index", docs)
	if code != 0 || out != "" || errs != "" {
		t.Fatal(out, errs, code)
	}
	b, _ := os.ReadFile(filepath.Join(docs, "spec", "index.md"))
	if !strings.Contains(string(b), "| [[practice-retry]] | 重试不消耗配额 |") {
		t.Fatalf("got %q", b)
	}
}

func TestCheckPrintsTheSpecsAndProblemsAsJSON(t *testing.T) {
	docs := docsDir(t)
	out, _, code := run(t, "spec", "check", docs)
	if code != 0 {
		t.Fatal(code)
	}
	var got struct {
		Specs []struct {
			Slug    string
			Issues  []any
			Summary string
			Tickets int
		}
		Problems []string
	}
	if err := json.Unmarshal([]byte(out), &got); err != nil {
		t.Fatal(err, out)
	}
	if len(got.Specs) != 1 || got.Specs[0].Slug != "practice-retry" || got.Specs[0].Tickets != 1 || got.Specs[0].Summary != "重试不消耗配额" {
		t.Fatalf("%+v", got)
	}
	if len(got.Problems) != 0 {
		t.Fatal(got.Problems)
	}
}

func TestTheStateMachineIsGoneSetRouteAndMigrateAreRefused(t *testing.T) {
	docs := docsDir(t)
	for _, args := range [][]string{{"set", docs, "practice-retry", "正式"}, {"route", docs, "practice-retry"}, {"migrate", docs}} {
		_, errs, code := run(t, append([]string{"spec"}, args...)...)
		if code != 1 || !strings.Contains(errs, "不认识的命令「"+args[0]+"」") {
			t.Errorf("%v: %q %d", args, errs, code)
		}
	}
}

func TestACommandWithoutItsArgumentsSaysHowItIsUsedAndExitsOne(t *testing.T) {
	for _, args := range [][]string{{"index"}, {"check"}, {"landed"}, {"ticket-of"}, {"skill-edit", "HEAD"}} {
		out, errs, code := run(t, append([]string{"spec"}, args...)...)
		if code != 1 || out != "" || !strings.Contains(errs, "usage: dyna spec "+args[0]) {
			t.Errorf("%v: %q %q %d", args, out, errs, code)
		}
	}
}

// ---- the ticket ledger, on a real git repository ----

const gitIdentity = "-c user.name=t -c user.email=t@example.com -c commit.gpgsign=false"

func git(t *testing.T, dir string, args ...string) string {
	t.Helper()
	cmd := exec.Command("git", append(strings.Fields(gitIdentity), args...)...)
	cmd.Dir = dir
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git %v: %v: %s", args, err, out)
	}
	return strings.TrimSpace(string(out))
}

// repo is a repository on branch `issue/x` with three commits past main: a landed ticket (the attribution as its
// own paragraph after the Ticket line), a stopped half-way commit that names none, and a commit that changes a
// skill file.
func repo(t *testing.T) (dir string, shas []string) {
	t.Helper()
	dir = t.TempDir()
	git(t, dir, "init", "-q", "-b", "main")
	writeFile(t, filepath.Join(dir, "a.txt"), "0\n")
	git(t, dir, "add", ".")
	git(t, dir, "commit", "-q", "-m", "init")
	git(t, dir, "checkout", "-q", "-b", "issue/x")
	commit := func(file, text, msg string) {
		writeFile(t, filepath.Join(dir, file), text)
		git(t, dir, "add", ".")
		git(t, dir, "commit", "-q", "-m", msg)
		shas = append(shas, git(t, dir, "rev-parse", "HEAD"))
	}
	commit("a.txt", "1\n", "feat: one\n\nTicket: 01-alpha\n\nCo-Authored-By: Claude <noreply@anthropic.com>")
	commit("a.txt", "2\n", "wip(02): stopped at the API test")
	commit("idea-loop/skills/a/SKILL.md", "# a\n", "feat: two\n\nTicket: 03-gamma")
	return dir, shas
}

func TestLandedListsTheCommitsThatNameATicketOldestFirst(t *testing.T) {
	dir, shas := repo(t)
	t.Chdir(dir)
	out, errs, code := run(t, "spec", "landed", "main")
	if code != 0 || errs != "" {
		t.Fatal(errs, code)
	}
	want := "[\n  {\n    \"sha\": \"" + shas[0] + "\",\n    \"ticket\": \"01-alpha\"\n  },\n  {\n    \"sha\": \"" + shas[2] + "\",\n    \"ticket\": \"03-gamma\"\n  }\n]\n"
	if out != want {
		t.Fatalf("got %q", out)
	}
}

func TestLandedWithNothingPastTheBaseIsAnEmptyList(t *testing.T) {
	dir, _ := repo(t)
	t.Chdir(dir)
	out, _, code := run(t, "spec", "landed", "HEAD")
	if code != 0 || out != "[]\n" {
		t.Fatalf("%q %d", out, code)
	}
}

func TestLandedWithAnUnknownRefFailsWithGitsReasonOnStderr(t *testing.T) {
	dir, _ := repo(t)
	t.Chdir(dir)
	out, errs, code := run(t, "spec", "landed", "no-such-branch")
	if code != 1 || out != "" || !strings.Contains(errs, "no-such-branch") {
		t.Fatalf("%q %q %d", out, errs, code)
	}
}

func TestTicketOfPrintsTheTicketOfOneCommitAndExitsTwoWithNothingForACommitThatNamesNone(t *testing.T) {
	dir, shas := repo(t)
	t.Chdir(dir)
	out, errs, code := run(t, "spec", "ticket-of", shas[0])
	if code != 0 || out != "01-alpha\n" || errs != "" {
		t.Fatalf("%q %q %d", out, errs, code)
	}
	out, errs, code = run(t, "spec", "ticket-of", shas[1])
	if code != 2 || out != "" || errs != "" {
		t.Fatalf("%q %q %d", out, errs, code)
	}
}

func TestSkillEditRefusesAHandBackThatDoesNotCoverTheSkillFileAndNamesTheReasons(t *testing.T) {
	dir, shas := repo(t)
	t.Chdir(dir)
	hb := filepath.Join(t.TempDir(), "handback.txt")
	writeFile(t, hb, "读了哪几份写法规范 | 读 | writing-for-agents\n")
	out, errs, code := run(t, "spec", "skill-edit", shas[2], hb)
	if code != 2 || errs != "" {
		t.Fatalf("%q %d", errs, code)
	}
	lines := strings.Split(strings.TrimSpace(out), "\n")
	if len(lines) != 3 || !strings.HasPrefix(lines[0], "- ") || !strings.Contains(lines[0], "调") || !strings.Contains(lines[1], "idea-loop/skills/a/SKILL.md 没有杠杆行") || !strings.Contains(lines[2], "idea-loop/skills/a/SKILL.md 没有验证行") {
		t.Fatalf("%q", out)
	}
}

func TestSkillEditAcceptsAHandBackThatCallsWritingForAgentsAndCarriesTheLeverRowAndTheVerifyRow(t *testing.T) {
	dir, shas := repo(t)
	t.Chdir(dir)
	hb := filepath.Join(t.TempDir(), "handback.txt")
	writeFile(t, hb, "读了哪几份写法规范 | 调 | writing-for-agents\n杠杆 | idea-loop/skills/a/SKILL.md | 剪枝\n验证 | idea-loop/skills/a/SKILL.md | 不改行为 | 只改措辞 | 过\n")
	out, errs, code := run(t, "spec", "skill-edit", shas[2], hb)
	if code != 0 || errs != "" || out != "ok: 1 个 skill、agent 定义或 skill 参考文件，写法规范、杠杆行、验证行都齐\n" {
		t.Fatalf("%q %q %d", out, errs, code)
	}
	out, _, code = run(t, "spec", "skill-edit", shas[0], hb)
	if code != 0 || out != "ok: 没改到 skill、agent 定义或 skill 参考文件\n" {
		t.Fatalf("%q %d", out, code)
	}
}

func TestSkillEditWithAMissingHandBackFileFailsOnStderr(t *testing.T) {
	dir, shas := repo(t)
	t.Chdir(dir)
	out, errs, code := run(t, "spec", "skill-edit", shas[2], filepath.Join(dir, "nope.txt"))
	if code != 1 || out != "" || !strings.Contains(errs, "nope.txt") {
		t.Fatalf("%q %q %d", out, errs, code)
	}
}

func TestRegistryJSONHasEverySpecCommandWithItsArgumentsAndCaller(t *testing.T) {
	out, errs, code := run(t, "registry", "--json")
	if code != 0 {
		t.Fatal(errs)
	}
	var reg struct {
		Commands []struct {
			Command string
			Summary string
			Caller  string
			Args    []struct {
				Name     string
				Kind     string
				Required bool
			}
		}
	}
	if err := json.Unmarshal([]byte(out), &reg); err != nil {
		t.Fatal(err)
	}
	want := map[string]string{
		"spec check":      "docs",
		"spec index":      "docs",
		"spec landed":     "base-ref",
		"spec skill-edit": "commit,handback-file",
		"spec skill-lint": "file",
		"spec ticket-of":  "commit",
	}
	seen := map[string]bool{}
	for _, c := range reg.Commands {
		args, ok := want[c.Command]
		if !ok {
			if strings.HasPrefix(c.Command, "spec ") {
				t.Errorf("%s is not a command of the module", c.Command)
			}
			continue
		}
		seen[c.Command] = true
		var names []string
		for _, a := range c.Args {
			if c.Command == "spec skill-lint" || c.Command == "spec check" {
				if a.Kind == "positional" { // their files and flags are pinned by TestTheRegistryHasSkillLintAsAHookCommand and TestTheRegistryHasSpecCheckWithAHookFlagForSessionsToo
					names = append(names, a.Name)
				}
				continue
			}
			if a.Kind != "positional" || !a.Required {
				t.Errorf("%s: %+v", c.Command, a)
			}
			names = append(names, a.Name)
		}
		caller := "session"
		if c.Command == "spec skill-lint" {
			caller = "hook"
		}
		if strings.Join(names, ",") != args || c.Caller != caller || c.Summary == "" {
			t.Errorf("%s: %+v", c.Command, c)
		}
	}
	for name := range want {
		if !seen[name] {
			t.Errorf("%s is not in the registry", name)
		}
	}
}
