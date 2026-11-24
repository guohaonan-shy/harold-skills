package worktree

import (
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/nexterr"
)

// twoCommits adds a second commit to the fixture's main checkout (not pushed) and returns both SHAs.
func twoCommits(t *testing.T, f fixture) (first, second string) {
	t.Helper()
	first = sh(t, f.main, "rev-parse", "HEAD")
	if err := os.WriteFile(filepath.Join(f.main, "b.txt"), []byte("b\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	sh(t, f.main, "add", "-A")
	sh(t, f.main, "commit", "-q", "-m", "second")
	return first, sh(t, f.main, "rev-parse", "HEAD")
}

func hasCommit(dir, sha string) bool {
	c := exec.Command("git", "cat-file", "-e", sha+"^{commit}")
	c.Dir = dir
	return c.Run() == nil
}

func TestAddDetachAtACommitPutsTheWorktreeThereWithoutABaseAndRemoveDeletesIt(t *testing.T) {
	f := newProject(t)
	first, second := twoCommits(t, f)
	p := filepath.Join(f.wts, "build")
	out, err := run("add", "build", "--repo", f.main, "--detach", "--at", first, "--path", p)
	if err != nil {
		t.Fatal(err, out)
	}
	if strings.TrimSpace(out) != p {
		t.Fatalf("prints the path: %q", out)
	}
	if sh(t, p, "rev-parse", "HEAD") != first || first == second {
		t.Fatal("HEAD is the commit asked for, not the newer one")
	}
	if sh(t, p, "rev-parse", "--abbrev-ref", "HEAD") != "HEAD" {
		t.Fatal("detached")
	}
	if again, err := run("add", "build", "--repo", f.main, "--detach", "--at", first, "--path", p); err != nil || again != out {
		t.Fatalf("a detached worktree already on the path is given back: %q %v", again, err)
	}
	if out, err := run("remove", p, "--repo", f.main, "--force"); err != nil {
		t.Fatal(err, out)
	}
	if _, err := os.Stat(p); err == nil {
		t.Fatal("removed")
	}
}

func TestAddAtDoesNotReadTheBase(t *testing.T) {
	f := newProject(t)
	first, _ := twoCommits(t, f)
	out, err := run("add", "nb", "--repo", f.main, "--detach", "--at", first, "--base", "no-such-branch")
	if err != nil {
		t.Fatal(err, out)
	}
	if sh(t, strings.TrimSpace(out), "rev-parse", "HEAD") != first {
		t.Fatal("at wins over base")
	}
}

func TestAddAtWithoutDetachIsRefused(t *testing.T) {
	f := newProject(t)
	first, _ := twoCommits(t, f)
	_, err := run("add", "nodetach", "--repo", f.main, "--base", "main", "--at", first)
	var ne *nexterr.Error
	if !errors.As(err, &ne) || !strings.Contains(ne.Msg, "--detach") || !strings.Contains(ne.Next, "--detach --at") {
		t.Fatalf("%#v", err)
	}
	if _, err := os.Stat(filepath.Join(f.wts, "nodetach")); err == nil {
		t.Fatal("nothing was made")
	}
}

func TestAddAtFetchesOriginWhenTheCommitIsNotLocal(t *testing.T) {
	f := newProject(t)
	// another clone pushes a commit this checkout has never fetched
	other := filepath.Join(filepath.Dir(f.main), "other")
	sh(t, filepath.Dir(f.main), "clone", "-q", f.remote, other)
	sh(t, other, "config", "user.email", "t@example.com")
	sh(t, other, "config", "user.name", "T")
	sh(t, other, "commit", "-q", "--allow-empty", "-m", "elsewhere")
	sh(t, other, "push", "-q")
	pushed := sh(t, other, "rev-parse", "HEAD")
	if hasCommit(f.main, pushed) {
		t.Fatal("the commit must not be here yet")
	}
	out, err := run("add", "late", "--repo", f.main, "--detach", "--at", pushed)
	if err != nil {
		t.Fatal(err, out)
	}
	if sh(t, strings.TrimSpace(out), "rev-parse", "HEAD") != pushed {
		t.Fatal("HEAD is the fetched commit")
	}
}

func TestAddAtACommitNobodyHasIsRefusedAndNamesIt(t *testing.T) {
	f := newProject(t)
	bogus := strings.Repeat("a", 40)
	_, err := run("add", "ghost", "--repo", f.main, "--detach", "--at", bogus)
	if err == nil || !strings.Contains(err.Error(), bogus) {
		t.Fatalf("the error names the commit: %v", err)
	}
	if _, err := os.Stat(filepath.Join(f.wts, "ghost")); err == nil {
		t.Fatal("nothing was made")
	}
}
