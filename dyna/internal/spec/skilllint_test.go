package spec_test

import (
	"bytes"
	"encoding/json"
	"path/filepath"
	"strings"
	"testing"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/app"
)

// runWith runs the command tree with stdin and the environment given, the way a hook is called.
func runWith(t *testing.T, stdin string, env map[string]string, args ...string) (stdout, stderr string, code int) {
	t.Helper()
	var out, errb bytes.Buffer
	code = app.Run(args, app.IO{
		Stdin: strings.NewReader(stdin), Stdout: &out, Stderr: &errb,
		Env: func(k string) string { return env[k] },
	})
	return out.String(), errb.String(), code
}

// event is the PostToolUse event of a Write to path.
func event(path string) string {
	b, _ := json.Marshal(map[string]any{
		"hook_event_name": "PostToolUse", "tool_name": "Write",
		"tool_input": map[string]any{"file_path": path},
	})
	return string(b)
}

// skillText is a SKILL.md whose body is n characters long.
func skillText(n int) string {
	return "---\nname: x\ndescription: x\n---\n" + strings.Repeat("字", n)
}

// workspace is a plugin named idea-loop and one named other, side by side, and a home that holds a project.
type workspace struct {
	root, ideaLoop, other, home string
}

// realDir is a temporary directory with its symbolic links resolved (macOS puts /var behind /private/var).
func realDir(t *testing.T) string {
	t.Helper()
	d, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	return d
}

func newWorkspace(t *testing.T) workspace {
	t.Helper()
	root := realDir(t)
	w := workspace{root: root, ideaLoop: filepath.Join(root, "idea-loop"), other: filepath.Join(root, "other"), home: filepath.Join(root, "home")}
	writeFile(t, filepath.Join(w.ideaLoop, ".claude-plugin", "plugin.json"), `{"name":"idea-loop"}`)
	writeFile(t, filepath.Join(w.other, ".claude-plugin", "plugin.json"), `{"name":"other"}`)
	writeFile(t, filepath.Join(w.home, "AGENTS.md"), "# home\n")
	return w
}

func (w workspace) env() map[string]string { return map[string]string{"IDEA_LOOP_HOME": w.home} }

func (w workspace) hook(t *testing.T, path string) (string, int) {
	t.Helper()
	out, errs, code := runWith(t, event(path), w.env(), "spec", "skill-lint", "--hook")
	if out != "" {
		t.Fatalf("a hook prints nothing on stdout: %q", out)
	}
	if code == 0 && errs != "" {
		t.Fatalf("a clean or out-of-scope file is silent: %q", errs)
	}
	return errs, code
}

func TestHookReportsABodyOver4500AndStaysSilentAt4500(t *testing.T) {
	w := newWorkspace(t)
	f := filepath.Join(w.ideaLoop, "skills", "productivity", "x", "SKILL.md")
	writeFile(t, f, skillText(4501))
	errs, code := w.hook(t, f)
	if code != 2 {
		t.Fatalf("exit %d, %q", code, errs)
	}
	for _, want := range []string{f, "4501", "线 4500", "idea-loop:writing-for-agents"} {
		if !strings.Contains(errs, want) {
			t.Errorf("the report has no %q: %q", want, errs)
		}
	}
	if strings.Contains(errs, "references") {
		t.Errorf("the report names no way to shorten the file: %q", errs)
	}
	writeFile(t, f, skillText(4500))
	if errs, code := w.hook(t, f); code != 0 || errs != "" {
		t.Fatalf("4500 characters are on the line: %d %q", code, errs)
	}
}

func TestTheBodyCountSkipsTheFrontmatter(t *testing.T) {
	w := newWorkspace(t)
	f := filepath.Join(w.ideaLoop, "skills", "x", "SKILL.md")
	writeFile(t, f, "---\nname: x\ndescription: "+strings.Repeat("长", 3000)+"\n---\n"+strings.Repeat("字", 4500))
	if errs, code := w.hook(t, f); code != 0 {
		t.Fatalf("%d %q", code, errs)
	}
}

func TestHookCoversTheProjectsInHomeAndAgentDefinitionsAndNothingElse(t *testing.T) {
	w := newWorkspace(t)
	inHome := filepath.Join(w.home, "projects", "demo", "skills", "x", "SKILL.md")
	writeFile(t, inHome, skillText(4501))
	if errs, code := w.hook(t, inHome); code != 2 || !strings.Contains(errs, "4501") {
		t.Fatalf("a skill in a project in home: %d %q", code, errs)
	}
	outside := filepath.Join(w.root, "elsewhere", ".claude", "skills", "x", "SKILL.md")
	writeFile(t, outside, skillText(4501))
	if errs, code := w.hook(t, outside); code != 0 || errs != "" {
		t.Fatalf("a skill outside home with no plugin root above it: %d %q", code, errs)
	}
	agent := filepath.Join(w.ideaLoop, "agents", "a.md")
	writeFile(t, agent, skillText(4501))
	if errs, code := w.hook(t, agent); code != 2 || !strings.Contains(errs, agent) {
		t.Fatalf("an agent definition of a plugin: %d %q", code, errs)
	}
	homeAgent := filepath.Join(w.home, "projects", "demo", ".claude", "agents", "a.md")
	writeFile(t, homeAgent, skillText(4501))
	if errs, code := w.hook(t, homeAgent); code != 2 {
		t.Fatalf("an agent definition in home: %d %q", code, errs)
	}
	for _, f := range []string{
		filepath.Join(w.ideaLoop, "skills", "x", "references", "long.md"),
		filepath.Join(w.ideaLoop, "AGENTS.md"),
		filepath.Join(w.ideaLoop, "agents", "sub", "deep.md"),
	} {
		writeFile(t, f, skillText(9000))
		if errs, code := w.hook(t, f); code != 0 || errs != "" {
			t.Errorf("%s is not a skill or an agent definition: %d %q", f, code, errs)
		}
	}
}

func TestHookStaysSilentForAnEventItCannotUse(t *testing.T) {
	w := newWorkspace(t)
	for _, in := range []string{"", "not json", `{"tool_input":{}}`, `{"tool_input":{"file_path":7}}`, event(filepath.Join(w.ideaLoop, "skills", "gone", "SKILL.md"))} {
		out, errs, code := runWith(t, in, w.env(), "spec", "skill-lint", "--hook")
		if out != "" || errs != "" || code != 0 {
			t.Errorf("%q: %q %q %d", in, out, errs, code)
		}
	}
}

func TestHookOutsideThePluginsVersionRangeIsOneLineAndExitZero(t *testing.T) {
	w := newWorkspace(t)
	f := filepath.Join(w.ideaLoop, "skills", "x", "SKILL.md")
	writeFile(t, f, skillText(9000))
	env := w.env()
	env["IDEA_LOOP_CLI_RANGE"] = ">=9.0.0"
	out, errs, code := runWith(t, event(f), env, "spec", "skill-lint", "--hook")
	if out != "" || code != 0 || strings.Count(strings.TrimSpace(errs), "\n") != 0 || errs == "" {
		t.Fatalf("%q %q %d", out, errs, code)
	}
}

const ghLine = "先看 `gh issue view 1 --comments` 的输出\n"

func tripwireSkill(body string) string {
	return "---\nname: x\ndescription: x\nallowed-tools: Bash(gh issue:*), Bash(git status:*)\n---\n" + body
}

func TestHookReportsAnInlineHostCommandInAnIdeaLoopFileWithFileAndLine(t *testing.T) {
	w := newWorkspace(t)
	f := filepath.Join(w.ideaLoop, "skills", "x", "SKILL.md")
	writeFile(t, f, tripwireSkill("# x\n\n"+ghLine))
	errs, code := w.hook(t, f)
	if code != 2 {
		t.Fatalf("%d %q", code, errs)
	}
	// the file's own line: 5 lines of frontmatter, then "# x", a blank line, the command
	for _, want := range []string{f + ":8 ", "写了行内命令 gh issue view 1 --comments", "idea-loop:writing-for-agents", "「坑」"} {
		if !strings.Contains(errs, want) {
			t.Errorf("the report has no %q: %q", want, errs)
		}
	}
	gitLine := filepath.Join(w.ideaLoop, "agents", "a.md")
	writeFile(t, gitLine, tripwireSkill("用 `git checkout -B x` 切\n"))
	if errs, code := w.hook(t, gitLine); code != 2 || !strings.Contains(errs, "git checkout -B x") {
		t.Fatalf("a git command in an agent definition: %d %q", code, errs)
	}
}

// the two lines the dispatch skill really had (git show 489c5278:idea-loop/skills/engineering/issue-dispatch/SKILL.md,
// lines 18 and 29): the command name is followed by an option and its value before the subcommand
func TestAnOptionBeforeTheSubcommandDoesNotHideAnInlineHostCommand(t *testing.T) {
	w := newWorkspace(t)
	f := filepath.Join(w.ideaLoop, "skills", "x", "SKILL.md")
	for _, c := range []struct{ line, want string }{
		{"对各项目的本地 clone 只做 `git -C <cloneDir> pull --ff-only` 和建 worktree\n", "git -C <cloneDir> pull --ff-only"},
		{"clone 不在默认分支、`git -C <clone> pull --ff-only` 失败：记一行\n", "git -C <clone> pull --ff-only"},
		{"看 `gh --repo <仓库> issue view 1` 的输出\n", "gh --repo <仓库> issue view 1"},
		{"看 `gh -R owner/repo pr list` 的输出\n", "gh -R owner/repo pr list"},
		{"看 `git --no-pager log -1` 的输出\n", "git --no-pager log -1"},
		{"看 `git -c core.quotepath=off diff` 的输出\n", "git -c core.quotepath=off diff"},
	} {
		writeFile(t, f, tripwireSkill(c.line))
		errs, code := w.hook(t, f)
		if code != 2 || !strings.Contains(errs, "写了行内命令 "+c.want) {
			t.Errorf("%q: %d %q", c.line, code, errs)
		}
	}
	// the pit mark and the adapter layer still let it through
	writeFile(t, f, tripwireSkill("坑：`git -C <clone> pull --ff-only` 会卡\n"))
	if errs, code := w.hook(t, f); code != 0 {
		t.Fatalf("a marked line: %d %q", code, errs)
	}
}

// options with no subcommand after them are not a command
func TestOptionsAloneAfterTheCommandNameAreNotAnInlineCommand(t *testing.T) {
	w := newWorkspace(t)
	f := filepath.Join(w.ideaLoop, "skills", "x", "SKILL.md")
	writeFile(t, f, tripwireSkill("`git --version`、`gh --help`、`git -C <目录>`、`git -c`、`gh -R <仓库>` 都不是命令\n"))
	if errs, code := w.hook(t, f); code != 0 {
		t.Fatalf("%d %q", code, errs)
	}
}

func TestAPitMarkOnTheSameLineLetsTheCommandThrough(t *testing.T) {
	w := newWorkspace(t)
	f := filepath.Join(w.ideaLoop, "skills", "x", "SKILL.md")
	writeFile(t, f, tripwireSkill("坑：`gh issue view 1 --comments` 会截断\n"))
	if errs, code := w.hook(t, f); code != 0 {
		t.Fatalf("%d %q", code, errs)
	}
	writeFile(t, f, tripwireSkill("坑：上一行\n`gh issue view 1 --comments`\n"))
	if errs, code := w.hook(t, f); code != 2 {
		t.Fatalf("the mark has to be on the same line: %d %q", code, errs)
	}
}

func TestOnlyInlineCodeThatStartsAsAHostCommandIsAnInlineCommand(t *testing.T) {
	w := newWorkspace(t)
	f := filepath.Join(w.ideaLoop, "skills", "x", "SKILL.md")
	body := strings.Join([]string{
		"`dyna issues show 1`，不扫",
		"提到 gh 和 git 这两个词，不扫",
		"`gh`、`git` 单独写，不扫",
		"`.github/gh-notes.md` 和 `digit status` 不是命令",
		"```",
		"gh pr view 1",
		"`git status`",
		"```",
	}, "\n") + "\n"
	writeFile(t, f, "---\nname: x\ndescription: 用 `gh pr view` 之类\n---\n"+body)
	if errs, code := w.hook(t, f); code != 0 {
		t.Fatalf("%d %q", code, errs)
	}
}

func TestTheTripwireIsOnlyForTheIdeaLoopPlugin(t *testing.T) {
	w := newWorkspace(t)
	f := filepath.Join(w.other, "skills", "x", "SKILL.md")
	writeFile(t, f, tripwireSkill("# x\n\n"+ghLine))
	if errs, code := w.hook(t, f); code != 0 || errs != "" {
		t.Fatalf("another plugin: %d %q", code, errs)
	}
	inHome := filepath.Join(w.home, "projects", "demo", "skills", "x", "SKILL.md")
	writeFile(t, inHome, tripwireSkill(ghLine))
	if errs, code := w.hook(t, inHome); code != 0 || errs != "" {
		t.Fatalf("a project's own skill: %d %q", code, errs)
	}
	// the line still counts for another plugin
	writeFile(t, f, skillText(4501))
	if _, code := w.hook(t, f); code != 2 {
		t.Fatalf("exit %d", code)
	}
}

func TestAnAdapterLayerFileMayNameHostCommands(t *testing.T) {
	w := newWorkspace(t)
	for _, rel := range []string{
		"skills/engineering/issues/references/github.md",
		"skills/engineering/setup/references/issue-tracker.md",
		"skills/engineering/setup/references/preflight-table.md",
		"skills/engineering/setup/references/development.md",
	} {
		f := filepath.Join(w.ideaLoop, filepath.FromSlash(rel))
		writeFile(t, f, ghLine)
		if errs, code := w.hook(t, f); code != 0 || errs != "" {
			t.Errorf("%s: %d %q", rel, code, errs)
		}
	}
}

func TestFilesGivenOnTheCommandLineAreAllListedAndTheExitIsOne(t *testing.T) {
	w := newWorkspace(t)
	long := filepath.Join(w.ideaLoop, "skills", "a", "SKILL.md")
	cmdline := filepath.Join(w.ideaLoop, "skills", "b", "SKILL.md")
	clean := filepath.Join(w.ideaLoop, "skills", "c", "SKILL.md")
	other := filepath.Join(w.root, "elsewhere", "skills", "d", "SKILL.md")
	writeFile(t, long, skillText(4600))
	writeFile(t, cmdline, tripwireSkill(ghLine))
	writeFile(t, clean, skillText(10))
	writeFile(t, other, skillText(9000))
	out, errs, code := runWith(t, "", w.env(), "spec", "skill-lint", long, cmdline, clean, other)
	if code != 1 || errs != "" {
		t.Fatalf("%d %q %q", code, out, errs)
	}
	for _, want := range []string{long + " 主体 4600 字，线 4500", cmdline + ":6 写了行内命令 gh issue view 1 --comments"} {
		if !strings.Contains(out, want) {
			t.Errorf("no %q in %q", want, out)
		}
	}
	if strings.Contains(out, other) || strings.Contains(out, clean) {
		t.Errorf("only the files with a problem are listed: %q", out)
	}
	out, errs, code = runWith(t, "", w.env(), "spec", "skill-lint", clean, other)
	if code != 0 || errs != "" || !strings.HasPrefix(out, "ok: 查了 1 份") {
		t.Fatalf("%d %q %q", code, out, errs)
	}
	if _, errs, code := runWith(t, "", w.env(), "spec", "skill-lint"); code != 1 || !strings.Contains(errs, "用法") {
		t.Fatalf("%d %q", code, errs)
	}
	if _, errs, code := runWith(t, "", w.env(), "spec", "skill-lint", filepath.Join(w.ideaLoop, "skills", "gone", "SKILL.md")); code != 1 || !strings.Contains(errs, "读不到") {
		t.Fatalf("a file that is asked for and cannot be read is an error: %d %q", code, errs)
	}
}

func TestChangedChecksOnlyTheInScopeFilesTheBranchChangedAndKeptAndAllOfTheirProblems(t *testing.T) {
	dir, _ := repo(t) // main, then issue/x with idea-loop/skills/a/SKILL.md added
	writeFile(t, filepath.Join(dir, "idea-loop", ".claude-plugin", "plugin.json"), `{"name":"idea-loop"}`)
	writeFile(t, filepath.Join(dir, "idea-loop", "skills", "stale", "SKILL.md"), skillText(4800))
	writeFile(t, filepath.Join(dir, "idea-loop", "skills", "gone", "SKILL.md"), skillText(4800))
	git(t, dir, "add", ".")
	git(t, dir, "commit", "-q", "-m", "base work")
	git(t, dir, "branch", "-f", "base", "HEAD")
	// on the branch: one over the line (changed), one over the line already and not touched, one removed,
	// a reference file over the line, and a clean one
	writeFile(t, filepath.Join(dir, "idea-loop", "skills", "a", "SKILL.md"), skillText(4501)+"\n`gh pr list`\n")
	writeFile(t, filepath.Join(dir, "idea-loop", "skills", "a", "references", "x.md"), skillText(9000))
	writeFile(t, filepath.Join(dir, "idea-loop", "skills", "fresh", "SKILL.md"), skillText(30))
	git(t, dir, "rm", "-q", "-r", "idea-loop/skills/gone")
	git(t, dir, "add", ".")
	git(t, dir, "commit", "-q", "-m", "branch work")
	t.Chdir(dir)

	out, errs, code := runWith(t, "", nil, "spec", "skill-lint", "--changed", "base")
	if code != 1 || errs != "" {
		t.Fatalf("%d %q %q", code, out, errs)
	}
	if !strings.Contains(out, "idea-loop/skills/a/SKILL.md 主体 4515 字，线 4500") || !strings.Contains(out, "idea-loop/skills/a/SKILL.md:6 写了行内命令 gh pr list") {
		t.Errorf("both problems of the changed file are listed: %q", out)
	}
	for _, not := range []string{"stale", "gone", "fresh", "x.md"} {
		if strings.Contains(out, not) {
			t.Errorf("%s is not reported: %q", not, out)
		}
	}

	writeFile(t, filepath.Join(dir, "idea-loop", "skills", "a", "SKILL.md"), skillText(100))
	git(t, dir, "add", ".")
	git(t, dir, "commit", "-q", "-m", "shorten")
	out, errs, code = runWith(t, "", nil, "spec", "skill-lint", "--changed", "base")
	if code != 0 || errs != "" || !strings.HasPrefix(out, "ok: 查了 2 份") {
		t.Fatalf("%d %q %q", code, out, errs)
	}
	if _, errs, code := runWith(t, "", nil, "spec", "skill-lint", "--changed", "no-such-ref"); code == 0 || errs == "" {
		t.Fatalf("an unknown ref is an error: %d %q", code, errs)
	}
}

func TestTheRegistryHasSkillLintAsAHookCommand(t *testing.T) {
	out, errs, code := run(t, "registry", "--json")
	if code != 0 {
		t.Fatal(errs)
	}
	var reg struct {
		Commands []struct {
			Command, Caller string
			Args            []struct{ Name, Kind string }
		}
	}
	if err := json.Unmarshal([]byte(out), &reg); err != nil {
		t.Fatal(err)
	}
	for _, c := range reg.Commands {
		if c.Command != "spec skill-lint" {
			continue
		}
		var names []string
		for _, a := range c.Args {
			names = append(names, a.Kind+":"+a.Name)
		}
		if c.Caller != "hook" || strings.Join(names, ",") != "positional:file,flag:changed,flag:hook" {
			t.Fatalf("%+v", c)
		}
		return
	}
	t.Fatal("spec skill-lint is not in the registry")
}
