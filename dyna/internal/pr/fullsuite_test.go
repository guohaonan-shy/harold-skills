package pr_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// worktreeAt makes `git rev-parse --show-toplevel` answer with dir, the way it does inside a worktree.
func worktreeAt(s *session, dir string) {
	s.git = func(args []string) (string, error) {
		if len(args) == 2 && args[0] == "rev-parse" && args[1] == "--show-toplevel" {
			return dir + "\n", nil
		}
		return "", nil
	}
}

type fullSuiteRecord struct {
	Head     string `json:"head"`
	ExitCode int    `json:"exitCode"`
	Log      string `json:"log"`
	At       string `json:"at"`
}

func TestFullSuiteShowAnswersWithTheRecordOfThatHeadAndExits2WhenThereIsNone(t *testing.T) {
	s := newSession(t)
	tree := t.TempDir()
	worktreeAt(s, tree)
	logFile := write(t, filepath.Join(t.TempDir(), "full.log"), "ok\n")

	_, errs, code := s.run("pr", "full-suite", "record", "abc1234", "0", logFile)
	if code != 0 {
		t.Fatal(errs, code)
	}
	out, errs, code := s.run("pr", "full-suite", "show", "abc1234")
	if code != 0 {
		t.Fatal(out, errs, code)
	}
	var rec fullSuiteRecord
	if err := json.Unmarshal([]byte(out), &rec); err != nil {
		t.Fatalf("%v: %q", err, out)
	}
	if rec.Head != "abc1234" || rec.ExitCode != 0 || rec.Log != logFile || rec.At == "" {
		t.Fatalf("%+v", rec)
	}

	// another head has no record
	out, errs, code = s.run("pr", "full-suite", "show", "def5678")
	if code != 2 || out != "" || !strings.Contains(errs, "def5678") {
		t.Fatalf("%q %q %d", out, errs, code)
	}

	// a red run replaces the green record of the same head, so the caller reruns instead of reusing
	_, errs, code = s.run("pr", "full-suite", "record", "abc1234", "1", logFile)
	if code != 0 {
		t.Fatal(errs, code)
	}
	out, _, code = s.run("pr", "full-suite", "show", "abc1234")
	if code != 0 {
		t.Fatal(code)
	}
	rec = fullSuiteRecord{}
	if err := json.Unmarshal([]byte(out), &rec); err != nil || rec.ExitCode != 1 {
		t.Fatalf("%v %+v", err, rec)
	}

	// the record sits in the worktree's .tmp/full-suite/
	if _, err := os.Stat(filepath.Join(tree, ".tmp", "full-suite", "abc1234.json")); err != nil {
		t.Fatal(err)
	}
}

func TestFullSuiteRefusesWhatIsNotAHeadOrAnExitCode(t *testing.T) {
	s := newSession(t)
	tree := t.TempDir()
	worktreeAt(s, tree)
	logFile := write(t, filepath.Join(t.TempDir(), "full.log"), "ok\n")
	for _, args := range [][]string{
		{"pr", "full-suite", "record", "../escape", "0", logFile},
		{"pr", "full-suite", "record", "abc1234", "green", logFile},
		{"pr", "full-suite", "record", "abc1234", "0"},
		{"pr", "full-suite", "show", "../escape"},
		{"pr", "full-suite", "show"},
	} {
		_, errs, code := s.run(args...)
		if code != 1 || !strings.Contains(errs, "usage:") {
			t.Errorf("%v: %q %d", args, errs, code)
		}
	}
	if _, err := os.Stat(filepath.Join(tree, ".tmp")); err == nil {
		t.Error("a refused call left a .tmp behind")
	}
}
