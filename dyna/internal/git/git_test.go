package git

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

// newRepo makes a repository with one commit (a.txt, b.txt) on main.
func newRepo(t *testing.T) string {
	t.Helper()
	t.Setenv("GIT_CONFIG_GLOBAL", os.DevNull)
	t.Setenv("GIT_CONFIG_SYSTEM", os.DevNull)
	dir := t.TempDir()
	sh(t, dir, "init", "-q", "-b", "main")
	sh(t, dir, "config", "user.email", "t@example.com")
	sh(t, dir, "config", "user.name", "T")
	write(t, dir, "a.txt", "a\n")
	write(t, dir, "b.txt", "b\n")
	sh(t, dir, "add", "-A")
	sh(t, dir, "commit", "-q", "-m", "init")
	return dir
}

func write(t *testing.T, dir, name, text string) {
	t.Helper()
	p := filepath.Join(dir, name)
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(p, []byte(text), 0o644); err != nil {
		t.Fatal(err)
	}
}

// run runs the module's command line and returns stdout and the error.
func run(args ...string) (string, error) {
	var out bytes.Buffer
	c := Command(Deps{Stdout: &out})
	c.SetArgs(args)
	c.SetOut(&out)
	c.SetErr(&out)
	err := c.Execute()
	return out.String(), err
}

func TestCommitTakesOnlyTheFilesItIsGiven(t *testing.T) {
	repo := newRepo(t)
	write(t, repo, "a.txt", "a changed\n")
	write(t, repo, "b.txt", "b changed\n")
	write(t, repo, "new.txt", "brand new\n")
	write(t, repo, "other.txt", "not mine\n")
	sh(t, repo, "add", "b.txt") // someone else's staged change must stay out of the commit too

	out, err := run("commit", "--repo", repo, "-m", "change a, add new", "a.txt", "new.txt")
	if err != nil {
		t.Fatal(err, out)
	}
	head := sh(t, repo, "rev-parse", "HEAD")
	if !strings.Contains(out, head) {
		t.Fatalf("the full SHA of the new commit is printed: %q (HEAD %s)", out, head)
	}
	files := sh(t, repo, "show", "--name-only", "--format=", "HEAD")
	if files != "a.txt\nnew.txt" {
		t.Fatalf("the commit holds exactly the given files, got %q", files)
	}
	if sh(t, repo, "log", "-1", "--format=%s") != "change a, add new" {
		t.Fatal("message")
	}
	status := sh(t, repo, "status", "--porcelain")
	if status != "M  b.txt\n?? other.txt" {
		t.Fatalf("the rest of the working tree is untouched, got %q", status)
	}
}

func TestCommitTakesADeletedFile(t *testing.T) {
	repo := newRepo(t)
	if err := os.Remove(filepath.Join(repo, "a.txt")); err != nil {
		t.Fatal(err)
	}
	if out, err := run("commit", "--repo", repo, "-m", "drop a", "a.txt"); err != nil {
		t.Fatal(err, out)
	}
	if got := sh(t, repo, "show", "--name-status", "--format=", "HEAD"); got != "D\ta.txt" {
		t.Fatal(got)
	}
}

func TestCommitWithoutFilesOrMessageIsRefusedBeforeAnythingHappens(t *testing.T) {
	repo := newRepo(t)
	write(t, repo, "a.txt", "changed\n")
	for _, args := range [][]string{
		{"commit", "--repo", repo, "-m", "no files"},
		{"commit", "--repo", repo, "a.txt"},
	} {
		if _, err := run(args...); err == nil {
			t.Errorf("%v: should be refused", args)
		}
	}
	if sh(t, repo, "rev-list", "--count", "HEAD") != "1" || sh(t, repo, "status", "--porcelain") != "M a.txt" {
		t.Fatal("a refused commit leaves the repository as it was")
	}
}

func TestCommitOfAFileWithNothingToCommitSaysSoAndTheNextCommand(t *testing.T) {
	repo := newRepo(t)
	_, err := run("commit", "--repo", repo, "-m", "nothing", "a.txt")
	if err == nil {
		t.Fatal("a.txt has no change")
	}
	var ne *nexterr.Error
	if !errors.As(err, &ne) || !strings.Contains(ne.Msg, "a.txt") || !strings.Contains(ne.Next, "dyna git commit") {
		t.Fatalf("the error names the file and the next command: %#v", err)
	}
}

func TestCommitOfAFileThatIsNotThereNamesIt(t *testing.T) {
	repo := newRepo(t)
	_, err := run("commit", "--repo", repo, "-m", "x", "nope.txt")
	if err == nil || !strings.Contains(err.Error(), "nope.txt") {
		t.Fatalf("the error names the missing file: %v", err)
	}
}

func TestPushSendsTheCurrentBranchAndSaysWhereItWent(t *testing.T) {
	repo := newRepo(t)
	remote := filepath.Join(t.TempDir(), "remote.git")
	sh(t, repo, "init", "-q", "--bare", "-b", "main", remote)
	sh(t, repo, "remote", "add", "origin", remote)
	sh(t, repo, "checkout", "-q", "-b", "issue/7-x")
	write(t, repo, "a.txt", "changed\n")
	sh(t, repo, "commit", "-q", "-am", "work")

	out, err := run("push", "--repo", repo)
	if err != nil {
		t.Fatal(err, out)
	}
	if !strings.Contains(out, "origin/issue/7-x") {
		t.Fatalf("says where it went: %q", out)
	}
	if sh(t, remote, "rev-parse", "issue/7-x") != sh(t, repo, "rev-parse", "HEAD") {
		t.Fatal("the remote has the commit")
	}
	if sh(t, repo, "rev-parse", "--abbrev-ref", "@{upstream}") != "origin/issue/7-x" {
		t.Fatal("the branch tracks what it pushed to, so a later push needs no arguments")
	}
	write(t, repo, "a.txt", "changed again\n")
	sh(t, repo, "commit", "-q", "-am", "more")
	if out, err := run("push", "--repo", repo); err != nil {
		t.Fatal(err, out)
	}
	if sh(t, remote, "rev-parse", "issue/7-x") != sh(t, repo, "rev-parse", "HEAD") {
		t.Fatal("the second push arrived")
	}
}

func TestARejectedPushReportsTheNextStepAndLeavesTheRemoteAlone(t *testing.T) {
	repo := newRepo(t)
	remote := filepath.Join(t.TempDir(), "remote.git")
	sh(t, repo, "init", "-q", "--bare", "-b", "main", remote)
	sh(t, repo, "remote", "add", "origin", remote)
	sh(t, repo, "push", "-q", "-u", "origin", "main")
	other := filepath.Join(t.TempDir(), "other")
	sh(t, repo, "clone", "-q", remote, other)
	sh(t, other, "config", "user.email", "o@example.com")
	sh(t, other, "config", "user.name", "O")
	write(t, other, "a.txt", "theirs\n")
	sh(t, other, "commit", "-q", "-am", "theirs")
	sh(t, other, "push", "-q")
	write(t, repo, "b.txt", "mine\n")
	sh(t, repo, "commit", "-q", "-am", "mine")

	_, err := run("push", "--repo", repo)
	var ne *nexterr.Error
	if err == nil || !errors.As(err, &ne) || !strings.Contains(ne.Next, "dyna git merge --repo "+repo+" origin/main") {
		t.Fatalf("a rejected push says to bring the remote's commits in first: %#v", err)
	}
	if sh(t, remote, "log", "-1", "--format=%s", "main") != "theirs" {
		t.Fatal("the remote is as the other clone left it")
	}
}

// twoClones makes a bare remote with main, and a clone of it (repo); other is a second clone to push from.
func twoClones(t *testing.T) (repo, other, remote string) {
	t.Helper()
	repo = newRepo(t)
	remote = filepath.Join(t.TempDir(), "remote.git")
	sh(t, repo, "init", "-q", "--bare", "-b", "main", remote)
	sh(t, repo, "remote", "add", "origin", remote)
	sh(t, repo, "push", "-q", "-u", "origin", "main")
	other = filepath.Join(t.TempDir(), "other")
	sh(t, repo, "clone", "-q", remote, other)
	sh(t, other, "config", "user.email", "o@example.com")
	sh(t, other, "config", "user.name", "O")
	return
}

func TestMergeOfARemoteBranchFetchesItFirstAndPrintsTheMergeCommit(t *testing.T) {
	repo, other, _ := twoClones(t)
	write(t, other, "a.txt", "theirs\n")
	sh(t, other, "commit", "-q", "-am", "theirs")
	sh(t, other, "push", "-q")
	write(t, repo, "b.txt", "mine\n")
	sh(t, repo, "commit", "-q", "-am", "mine")

	out, err := run("merge", "--repo", repo, "origin/main") // repo has not fetched: the command does
	if err != nil {
		t.Fatal(err, out)
	}
	if head := sh(t, repo, "rev-parse", "HEAD"); !strings.Contains(out, head) {
		t.Fatalf("prints the full SHA of the merge commit: %q (HEAD %s)", out, head)
	}
	if sh(t, repo, "show", "--no-patch", "--format=%P", "HEAD") == sh(t, repo, "rev-parse", "HEAD~1") {
		t.Fatal("two parents")
	}
	if got := sh(t, repo, "show", "origin/main:a.txt"); got != "theirs" {
		t.Fatal(got)
	}
	data, _ := os.ReadFile(filepath.Join(repo, "a.txt"))
	if string(data) != "theirs\n" {
		t.Fatalf("their change is in the working tree: %q", data)
	}
}

func TestMergeOfACommitSaysSoWhenThereIsNothingNewToBringIn(t *testing.T) {
	repo := newRepo(t)
	head := sh(t, repo, "rev-parse", "HEAD")
	out, err := run("merge", "--repo", repo, head)
	if err != nil || !strings.Contains(out, "已经在当前分支里") {
		t.Fatal(out, err)
	}
	if sh(t, repo, "rev-parse", "HEAD") != head {
		t.Fatal("no new commit")
	}
}

func TestMergeOfACommitFastForwards(t *testing.T) {
	repo := newRepo(t)
	sh(t, repo, "checkout", "-q", "-b", "side")
	write(t, repo, "a.txt", "side\n")
	sh(t, repo, "commit", "-q", "-am", "side")
	side := sh(t, repo, "rev-parse", "HEAD")
	sh(t, repo, "checkout", "-q", "main")
	out, err := run("merge", "--repo", repo, side)
	if err != nil || !strings.Contains(out, side) {
		t.Fatal(out, err)
	}
	if sh(t, repo, "rev-parse", "HEAD") != side {
		t.Fatal("fast-forwarded to the commit")
	}
}

func conflictRepo(t *testing.T) (repo, other string) {
	t.Helper()
	repo, other, _ = twoClones(t)
	write(t, other, "a.txt", "theirs\n")
	write(t, other, "c.txt", "their clean file\n")
	sh(t, other, "add", "-A")
	sh(t, other, "commit", "-q", "-m", "theirs")
	sh(t, other, "push", "-q")
	write(t, repo, "a.txt", "mine\n")
	sh(t, repo, "commit", "-q", "-am", "mine")
	return
}

func TestMergeWithConflictsStopsListsTheFilesAndResolvesNothing(t *testing.T) {
	repo, _ := conflictRepo(t)
	_, err := run("merge", "--repo", repo, "origin/main")
	var ne *nexterr.Error
	if err == nil || !errors.As(err, &ne) {
		t.Fatalf("a conflict is an error with a next command: %#v", err)
	}
	if !strings.Contains(ne.Msg, "a.txt") || strings.Contains(ne.Msg, "c.txt") {
		t.Fatalf("lists exactly the conflicting files: %q", ne.Msg)
	}
	if !strings.Contains(ne.Next, "dyna git commit") {
		t.Fatalf("next command: %q", ne.Next)
	}
	data, _ := os.ReadFile(filepath.Join(repo, "a.txt"))
	if !strings.Contains(string(data), "<<<<<<<") || !strings.Contains(string(data), "mine") || !strings.Contains(string(data), "theirs") {
		t.Fatalf("the conflict is left for a person: %q", data)
	}
	if _, err := os.Stat(filepath.Join(repo, ".git", "MERGE_HEAD")); err != nil {
		t.Fatal("the merge stays open")
	}
}

func TestCommitRefusesAFileThatStillHasConflictMarkers(t *testing.T) {
	repo, _ := conflictRepo(t)
	if _, err := run("merge", "--repo", repo, "origin/main"); err == nil {
		t.Fatal("conflict expected")
	}
	// committing before the conflict is resolved is refused and names the file
	_, err := run("commit", "--repo", repo, "-m", "merge", "a.txt")
	if err == nil {
		t.Fatal("git add would take the file as resolved, so the markers are checked first")
	}
	if !strings.Contains(err.Error(), "a.txt") {
		t.Fatalf("names the file: %v", err)
	}
	if !merging(repo) {
		t.Fatal("the merge is still open")
	}
}

func TestCommitConcludesAMergeOnceTheConflictIsResolved(t *testing.T) {
	repo, _ := conflictRepo(t)
	if _, err := run("merge", "--repo", repo, "origin/main"); err == nil {
		t.Fatal("conflict expected")
	}
	write(t, repo, "a.txt", "resolved\n")
	out, err := run("commit", "--repo", repo, "-m", "merge origin/main", "a.txt")
	if err != nil {
		t.Fatal(err, out)
	}
	head := sh(t, repo, "rev-parse", "HEAD")
	if !strings.Contains(out, head) {
		t.Fatalf("prints the merge commit: %q", out)
	}
	if len(strings.Fields(sh(t, repo, "show", "--no-patch", "--format=%P", "HEAD"))) != 2 {
		t.Fatal("the commit is a merge of two parents")
	}
	if sh(t, repo, "show", "HEAD:a.txt") != "resolved" || sh(t, repo, "show", "HEAD:c.txt") != "their clean file" {
		t.Fatal("the resolution and the clean part of their change are both in")
	}
	if merging(repo) {
		t.Fatal("merge is over")
	}
}

func TestAMergeThatCannotStartIsNotReportedAsAConflict(t *testing.T) {
	repo, _ := conflictRepo(t)
	write(t, repo, "c.txt", "my uncommitted file\n")
	sh(t, repo, "add", "c.txt")
	_, err := run("merge", "--repo", repo, "origin/main")
	var ne *nexterr.Error
	if err == nil || errors.As(err, &ne) && strings.Contains(ne.Msg, "冲突的文件") {
		t.Fatalf("local changes in the way are git's own refusal, not a conflict list: %v", err)
	}
}
