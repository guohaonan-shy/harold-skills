package git

import (
	"errors"
	"strings"
	"testing"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/nexterr"
)

func TestEmptyCommitAddsACommitWithNoFileChangeAndLeavesTheIndexAlone(t *testing.T) {
	repo := newRepo(t)
	write(t, repo, "b.txt", "b changed\n")
	sh(t, repo, "add", "b.txt") // a staged change that must not ride along
	write(t, repo, "loose.txt", "untracked\n")

	out, err := run("commit", "--empty", "--repo", repo, "-m", "chore: 开工 #1")
	if err != nil {
		t.Fatal(err, out)
	}
	head := sh(t, repo, "rev-parse", "HEAD")
	if !strings.Contains(out, head) {
		t.Fatalf("the full SHA of the new commit is printed: %q (HEAD %s)", out, head)
	}
	if sh(t, repo, "rev-list", "--count", "HEAD") != "2" {
		t.Fatal("one new commit")
	}
	if files := sh(t, repo, "show", "--name-only", "--format=", "HEAD"); files != "" {
		t.Fatalf("the commit has no file change, got %q", files)
	}
	if sh(t, repo, "log", "-1", "--format=%s") != "chore: 开工 #1" {
		t.Fatal("message")
	}
	if status := sh(t, repo, "status", "--porcelain"); status != "M  b.txt\n?? loose.txt" {
		t.Fatalf("the staged change and the working tree are untouched, got %q", status)
	}
}

func TestEmptyCommitTogetherWithFilesIsRefusedAndNamesTheFlagToDrop(t *testing.T) {
	repo := newRepo(t)
	write(t, repo, "a.txt", "changed\n")
	_, err := run("commit", "--empty", "--repo", repo, "-m", "x", "a.txt")
	var ne *nexterr.Error
	if !errors.As(err, &ne) || !strings.Contains(ne.Msg, "--empty") || !strings.Contains(ne.Next, "dyna git commit") || strings.Contains(ne.Next, "--empty") {
		t.Fatalf("the error says to drop --empty and the next command is the file form: %#v", err)
	}
	if sh(t, repo, "rev-list", "--count", "HEAD") != "1" || sh(t, repo, "status", "--porcelain") != "M a.txt" {
		t.Fatal("a refused commit leaves the repository as it was")
	}
}

func TestEmptyCommitNeedsAMessage(t *testing.T) {
	repo := newRepo(t)
	if _, err := run("commit", "--empty", "--repo", repo); err == nil {
		t.Fatal("no -m, refused")
	}
	if sh(t, repo, "rev-list", "--count", "HEAD") != "1" {
		t.Fatal("nothing committed")
	}
}

func TestCommitWithoutEmptyStillNeedsFiles(t *testing.T) {
	repo := newRepo(t)
	if _, err := run("commit", "--repo", repo, "-m", "no files"); err == nil {
		t.Fatal("files stay required without --empty")
	}
}
