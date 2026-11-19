package worktree

import (
	"bytes"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/nexterr"
)

// sh runs a real git in dir. These tests use real throwaway repositories: git is the boundary here, and a fake
// git would only test the fake.
func sh(t *testing.T, dir string, args ...string) string {
	t.Helper()
	c := exec.Command("git", args...)
	c.Dir = dir
	out, err := c.CombinedOutput()
	if err != nil {
		t.Fatalf("git %s: %v\n%s", strings.Join(args, " "), err, out)
	}
	return strings.TrimSpace(string(out))
}

func real(t *testing.T, p string) string {
	t.Helper()
	r, err := filepath.EvalSymlinks(p)
	if err != nil {
		t.Fatal(err)
	}
	return r
}

type fixture struct {
	main   string // the main checkout: <tmp>/proj
	remote string
	wts    string // where worktrees go: <tmp>/proj-worktrees
}

// newProject makes a main checkout on main with one commit pushed to a bare origin.
func newProject(t *testing.T) fixture {
	t.Helper()
	t.Setenv("GIT_CONFIG_GLOBAL", os.DevNull)
	t.Setenv("GIT_CONFIG_SYSTEM", os.DevNull)
	root := real(t, t.TempDir())
	f := fixture{main: filepath.Join(root, "proj"), remote: filepath.Join(root, "origin.git"), wts: filepath.Join(root, "proj-worktrees")}
	if err := os.Mkdir(f.main, 0o755); err != nil {
		t.Fatal(err)
	}
	sh(t, f.main, "init", "-q", "-b", "main")
	sh(t, f.main, "config", "user.email", "t@example.com")
	sh(t, f.main, "config", "user.name", "T")
	if err := os.WriteFile(filepath.Join(f.main, "a.txt"), []byte("a\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	sh(t, f.main, "add", "-A")
	sh(t, f.main, "commit", "-q", "-m", "init")
	sh(t, root, "init", "-q", "--bare", "-b", "main", f.remote)
	sh(t, f.main, "remote", "add", "origin", f.remote)
	sh(t, f.main, "push", "-q", "-u", "origin", "main")
	return f
}

func run(args ...string) (string, error) {
	var out bytes.Buffer
	c := Command(Deps{Stdout: &out})
	c.SetArgs(args)
	c.SetOut(&out)
	c.SetErr(&out)
	err := c.Execute()
	return out.String(), err
}

func branchExists(t *testing.T, repo, branch string) bool {
	t.Helper()
	c := exec.Command("git", "show-ref", "--verify", "--quiet", "refs/heads/"+branch)
	c.Dir = repo
	return c.Run() == nil
}

// ---------- add ----------

func TestAddMakesTheWorktreeBesideTheCheckoutOnANewBranchFromTheBase(t *testing.T) {
	f := newProject(t)
	// the remote moves on after the checkout last looked: the new branch starts where origin/main is now
	sh(t, f.main, "commit", "-q", "--allow-empty", "-m", "second")
	sh(t, f.main, "push", "-q")
	sh(t, f.main, "reset", "-q", "--hard", "HEAD~1")

	out, err := run("add", "12-fix-login", "--repo", f.main, "--base", "main")
	if err != nil {
		t.Fatal(err, out)
	}
	want := filepath.Join(f.wts, "12-fix-login")
	if strings.TrimSpace(out) != want {
		t.Fatalf("prints the worktree path %s, got %q", want, out)
	}
	if got := sh(t, want, "rev-parse", "--abbrev-ref", "HEAD"); got != "issue/12-fix-login" {
		t.Fatal(got)
	}
	if sh(t, want, "rev-parse", "HEAD") != sh(t, f.main, "rev-parse", "origin/main") {
		t.Fatal("the branch starts at origin/main")
	}
	if sh(t, f.main, "rev-parse", "--abbrev-ref", "HEAD") != "main" {
		t.Fatal("the main checkout's branch is not touched")
	}
}

func TestAddDetachedMakesNoBranch(t *testing.T) {
	f := newProject(t)
	out, err := run("add", "13-spec", "--repo", f.main, "--base", "main", "--detach")
	if err != nil {
		t.Fatal(err, out)
	}
	p := strings.TrimSpace(out)
	if got := sh(t, p, "rev-parse", "--abbrev-ref", "HEAD"); got != "HEAD" {
		t.Fatalf("detached, got %s", got)
	}
	if branchExists(t, f.main, "issue/13-spec") {
		t.Fatal("a triage worktree has no branch")
	}
}

func TestAddTakesTheBranchTheIssueAlreadyHasInsteadOfMakingANewOne(t *testing.T) {
	f := newProject(t)
	// left by an earlier session: the branch is there locally, and its worktree is gone
	sh(t, f.main, "branch", "issue/14-old")
	out, err := run("add", "14-old", "--repo", f.main)
	if err != nil {
		t.Fatalf("an existing local branch needs no --base: %v %s", err, out)
	}
	if got := sh(t, strings.TrimSpace(out), "rev-parse", "--abbrev-ref", "HEAD"); got != "issue/14-old" {
		t.Fatal(got)
	}

	// only the remote has it
	sh(t, f.main, "branch", "issue/15-remote")
	sh(t, f.main, "push", "-q", "origin", "issue/15-remote")
	sh(t, f.main, "branch", "-q", "-D", "issue/15-remote")
	out, err = run("add", "15-remote", "--repo", f.main)
	if err != nil {
		t.Fatalf("a remote branch is picked up, tracking it: %v %s", err, out)
	}
	p := strings.TrimSpace(out)
	if sh(t, p, "rev-parse", "--abbrev-ref", "HEAD") != "issue/15-remote" || sh(t, p, "rev-parse", "--abbrev-ref", "@{upstream}") != "origin/issue/15-remote" {
		t.Fatal("tracks origin/issue/15-remote")
	}

	// a branch the issue names, which is not issue/<name>
	sh(t, f.main, "branch", "feature/odd")
	out, err = run("add", "16-odd", "--repo", f.main, "--branch", "feature/odd")
	if err != nil {
		t.Fatal(err, out)
	}
	if got := sh(t, strings.TrimSpace(out), "rev-parse", "--abbrev-ref", "HEAD"); got != "feature/odd" {
		t.Fatal(got)
	}
}

func TestAddAgainForAWorktreeThatIsAlreadyThereGivesItBack(t *testing.T) {
	f := newProject(t)
	first, err := run("add", "17-again", "--repo", f.main, "--base", "main")
	if err != nil {
		t.Fatal(err)
	}
	second, err := run("add", "17-again", "--repo", f.main, "--base", "main")
	if err != nil {
		t.Fatalf("made but never handed over last round: reuse it, %v", err)
	}
	if first != second {
		t.Fatalf("%q vs %q", first, second)
	}
	// the path is taken by something else
	if err := os.MkdirAll(filepath.Join(f.wts, "18-taken"), 0o755); err != nil {
		t.Fatal(err)
	}
	if _, err := run("add", "18-taken", "--repo", f.main, "--base", "main"); err == nil {
		t.Fatal("a directory that is not a worktree of this repository is not reused")
	}
}

func TestAddANewBranchNeedsABaseAndSaysSo(t *testing.T) {
	f := newProject(t)
	_, err := run("add", "19-nobase", "--repo", f.main)
	var ne *nexterr.Error
	if !errors.As(err, &ne) || !strings.Contains(ne.Msg, "--base") || !strings.Contains(ne.Next, "dyna worktree add") {
		t.Fatalf("%#v", err)
	}
	if _, err := os.Stat(filepath.Join(f.wts, "19-nobase")); err == nil {
		t.Fatal("nothing was made")
	}
	_, err = run("add", "19-nobase", "--repo", f.main, "--base", "nonexistent")
	if err == nil || !strings.Contains(err.Error(), "origin/nonexistent") {
		t.Fatalf("a base the remote does not have is named: %v", err)
	}
}

func TestAddFromInsideALinkedWorktreePutsTheNewOneBesideTheMainCheckout(t *testing.T) {
	f := newProject(t)
	out, err := run("add", "20-one", "--repo", f.main, "--base", "main")
	if err != nil {
		t.Fatal(err)
	}
	inside := strings.TrimSpace(out)
	out, err = run("add", "21-two", "--repo", inside, "--base", "main")
	if err != nil {
		t.Fatal(err, out)
	}
	if strings.TrimSpace(out) != filepath.Join(f.wts, "21-two") {
		t.Fatalf("got %q", out)
	}
}

// ---------- list ----------

func TestListShowsEachWorktreeWithItsBranchAndLock(t *testing.T) {
	f := newProject(t)
	one, _ := run("add", "30-one", "--repo", f.main, "--base", "main")
	two, _ := run("add", "31-two", "--repo", f.main, "--base", "main", "--detach")
	sh(t, f.main, "worktree", "lock", "--reason", "running", strings.TrimSpace(one))

	out, err := run("list", "--repo", f.main)
	if err != nil {
		t.Fatal(err)
	}
	lines := strings.Split(strings.TrimSuffix(out, "\n"), "\n")
	want := []string{
		f.main + "\tmain\t",
		strings.TrimSpace(one) + "\tissue/30-one\tlocked",
		strings.TrimSpace(two) + "\t(detached)\t",
	}
	if strings.Join(lines, "\n") != strings.Join(want, "\n") {
		t.Fatalf("got\n%s\nwant\n%s", strings.Join(lines, "\n"), strings.Join(want, "\n"))
	}
}

// ---------- remove ----------

func TestRemoveUnlocksDeletesTheWorktreeAndItsBranch(t *testing.T) {
	f := newProject(t)
	out, _ := run("add", "40-locked", "--repo", f.main, "--base", "main")
	wt := strings.TrimSpace(out)
	if err := os.WriteFile(filepath.Join(wt, "work.txt"), []byte("w\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	sh(t, wt, "add", "work.txt")
	sh(t, wt, "commit", "-q", "-m", "unmerged work")
	sh(t, f.main, "worktree", "lock", "--reason", "session running", wt)

	out, err := run("remove", wt, "--repo", f.main)
	if err != nil {
		t.Fatal(err, out)
	}
	if _, err := os.Stat(wt); err == nil {
		t.Fatal("the directory is gone")
	}
	if strings.Contains(sh(t, f.main, "worktree", "list"), "40-locked") {
		t.Fatal("git no longer lists it")
	}
	if branchExists(t, f.main, "issue/40-locked") {
		t.Fatal("the branch is deleted, merged or not: the caller judged that")
	}
	for _, want := range []string{wt, "issue/40-locked"} {
		if !strings.Contains(out, want) {
			t.Errorf("says what it did (%s): %q", want, out)
		}
	}
}

func TestRemoveKeepsTheBranchOnRequest(t *testing.T) {
	f := newProject(t)
	out, _ := run("add", "41-keep", "--repo", f.main, "--base", "main")
	wt := strings.TrimSpace(out)
	if _, err := run("remove", wt, "--repo", f.main, "--keep-branch"); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(wt); err == nil {
		t.Fatal("worktree is gone")
	}
	if !branchExists(t, f.main, "issue/41-keep") {
		t.Fatal("the branch stays")
	}
}

func TestRemoveFindsTheMainCheckoutFromTheWorktreeWhenNoRepoIsGiven(t *testing.T) {
	f := newProject(t)
	out, _ := run("add", "42-alone", "--repo", f.main, "--base", "main")
	wt := strings.TrimSpace(out)
	if _, err := run("remove", wt); err != nil {
		t.Fatal(err)
	}
	if branchExists(t, f.main, "issue/42-alone") || strings.Contains(sh(t, f.main, "worktree", "list"), "42-alone") {
		t.Fatal("removed with its branch")
	}
}

func TestRemoveRefusesAWorktreeWithUncommittedWorkAndTouchesNothing(t *testing.T) {
	f := newProject(t)
	out, _ := run("add", "43-dirty", "--repo", f.main, "--base", "main")
	wt := strings.TrimSpace(out)
	if err := os.WriteFile(filepath.Join(wt, "scratch.txt"), []byte("unsaved\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	sh(t, f.main, "worktree", "lock", wt)

	_, err := run("remove", wt, "--repo", f.main)
	var ne *nexterr.Error
	if !errors.As(err, &ne) || !strings.Contains(ne.Msg, "scratch.txt") || !strings.Contains(ne.Next, "--force") {
		t.Fatalf("names the unsaved file and the way to force: %#v", err)
	}
	if _, err := os.Stat(filepath.Join(wt, "scratch.txt")); err != nil {
		t.Fatal("the file is still there")
	}
	if !branchExists(t, f.main, "issue/43-dirty") {
		t.Fatal("the branch is still there")
	}
	if !strings.Contains(sh(t, f.main, "worktree", "list", "--porcelain"), "locked") {
		t.Fatal("a refused remove does not unlock it either")
	}

	if _, err := run("remove", wt, "--repo", f.main, "--force"); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(wt); err == nil {
		t.Fatal("--force removes it")
	}
}

func TestRemoveDoesNotDeleteTheBaseBranchAndDoesNotRemoveTheMainCheckout(t *testing.T) {
	f := newProject(t)
	sh(t, f.main, "checkout", "-q", "-b", "dev")
	wt := filepath.Join(f.wts, "50-on-main")
	sh(t, f.main, "worktree", "add", "-q", wt, "main")

	_, err := run("remove", wt, "--repo", f.main)
	if err == nil || !strings.Contains(err.Error(), "main") || !strings.Contains(err.Error(), "--keep-branch") {
		t.Fatalf("the base branch is not deleted unless asked to keep: %v", err)
	}
	if _, err := os.Stat(wt); err != nil {
		t.Fatal("refused before removing anything")
	}
	if _, err := run("remove", wt, "--repo", f.main, "--keep-branch"); err != nil {
		t.Fatal(err)
	}
	if !branchExists(t, f.main, "main") {
		t.Fatal("main is still there")
	}
	if _, err := run("remove", f.main, "--repo", f.main); err == nil {
		t.Fatal("the main checkout is not a worktree to remove")
	}
}

func TestRemoveOfAPathThatIsNoWorktreeSaysSoAndPointsAtList(t *testing.T) {
	f := newProject(t)
	_, err := run("remove", filepath.Join(f.wts, "nope"), "--repo", f.main)
	var ne *nexterr.Error
	if !errors.As(err, &ne) || !strings.Contains(ne.Next, "dyna worktree list") {
		t.Fatalf("%#v", err)
	}
}

func TestRemoveOfADetachedWorktreeHasNoBranchToDelete(t *testing.T) {
	f := newProject(t)
	out, _ := run("add", "44-triage", "--repo", f.main, "--base", "main", "--detach")
	wt := strings.TrimSpace(out)
	out, err := run("remove", wt, "--repo", f.main)
	if err != nil {
		t.Fatal(err, out)
	}
	if _, err := os.Stat(wt); err == nil {
		t.Fatal("gone")
	}
}

// When git itself says the worktree and the checkout do not point at each other (the same checkout reached by
// two paths), nothing is deleted: the error carries the manual recipe.
func TestAWorktreeGitCannotRemoveBecauseThePathsDoNotPointBackGetsTheManualRecipe(t *testing.T) {
	f := newProject(t)
	out, _ := run("add", "45-alias", "--repo", f.main, "--base", "main")
	wt := strings.TrimSpace(out)

	realGit, err := exec.LookPath("git")
	if err != nil {
		t.Skip("no git")
	}
	bin := t.TempDir()
	script := "#!/bin/sh\n" +
		`if [ "$1" = worktree ] && [ "$2" = remove ]; then echo "fatal: validation failed, cannot remove working tree: '` + wt + `' does not point back to '/other/path'" >&2; exit 128; fi` + "\n" +
		`exec "` + realGit + `" "$@"` + "\n"
	if err := os.WriteFile(filepath.Join(bin, "git"), []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", bin+string(os.PathListSeparator)+os.Getenv("PATH"))

	_, err = run("remove", wt, "--repo", f.main)
	var ne *nexterr.Error
	if !errors.As(err, &ne) || !strings.Contains(ne.Next, "worktree prune") || !strings.Contains(ne.Next, "status --porcelain") {
		t.Fatalf("%#v", err)
	}
	if _, err := os.Stat(wt); err != nil {
		t.Fatal("nothing was deleted")
	}
	if !branchExists(t, f.main, "issue/45-alias") {
		t.Fatal("the branch stays until the worktree is really gone")
	}
}

// ---------- guard ----------

func hook(t *testing.T, command string) error {
	t.Helper()
	var out bytes.Buffer
	ev := `{"tool_name":"Bash","tool_input":{"command":` + jsonString(command) + `}}`
	c := Command(Deps{Stdin: strings.NewReader(ev), Stdout: &out})
	c.SetArgs([]string{"guard", "--hook"})
	c.SetOut(&out)
	c.SetErr(&out)
	return c.Execute()
}

func jsonString(s string) string {
	s = strings.ReplaceAll(s, `\`, `\\`)
	s = strings.ReplaceAll(s, `"`, `\"`)
	s = strings.ReplaceAll(s, "\n", `\n`)
	return `"` + s + `"`
}

func TestTheGuardBlocksHandWrittenWorktreeRemoveAndPointsAtTheCommand(t *testing.T) {
	for _, command := range []string{
		"git worktree remove x",
		"git worktree remove --force /a/b/c",
		"git -C /repo worktree remove ../wt",
		`git -C "/my repo" worktree remove ../wt`,
		"git -c core.quotepath=off worktree remove x",
		"cd /repo && git worktree remove x && git branch -D y",
		"git worktree prune; git worktree remove x",
		"echo done\ngit worktree remove x",
	} {
		err := hook(t, command)
		var exit *nexterr.Exit
		if !errors.As(err, &exit) || exit.Code != 2 || !strings.Contains(exit.Msg, "dyna worktree remove") {
			t.Errorf("%q should be blocked with exit 2 and the dyna command: %#v", command, err)
		}
	}
}

func TestTheGuardLetsEverythingElseThrough(t *testing.T) {
	for _, command := range []string{
		"git worktree list",
		"git worktree add ../x -b y",
		"git worktree prune",
		"git worktree unlock x",
		"git -C /repo status",
		"dyna worktree remove ../wt",
		"ls worktree remove",
		"git branch -D worktree-remove",
	} {
		if err := hook(t, command); err != nil {
			t.Errorf("%q should go through: %v", command, err)
		}
	}
}

func TestTheGuardIgnoresEventsItDoesNotRead(t *testing.T) {
	for _, stdin := range []string{
		`{"tool_name":"Write","tool_input":{"command":"git worktree remove x"}}`,
		`not json`,
		``,
	} {
		var out bytes.Buffer
		c := Command(Deps{Stdin: strings.NewReader(stdin), Stdout: &out})
		c.SetArgs([]string{"guard", "--hook"})
		c.SetOut(&out)
		c.SetErr(&out)
		if err := c.Execute(); err != nil {
			t.Errorf("%q: %v", stdin, err)
		}
	}
}

func TestTheGuardWithoutHookJudgesTheCommandGiven(t *testing.T) {
	var out bytes.Buffer
	c := Command(Deps{Stdout: &out})
	c.SetArgs([]string{"guard", "git worktree remove x"})
	c.SetOut(&out)
	c.SetErr(&out)
	err := c.Execute()
	var ne *nexterr.Error
	if !errors.As(err, &ne) || !strings.Contains(ne.Msg, "dyna worktree remove") {
		t.Fatalf("%#v", err)
	}
}
