package testcmd

import (
	"context"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/nexterr"
)

// isolatedTmp points TMPDIR at an empty directory, so the runs this test makes and sweeps are its own.
func isolatedTmp(t *testing.T) string {
	t.Helper()
	tmp, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Setenv("TMPDIR", tmp)
	return tmp
}

func leftIn(t *testing.T, dir string) []string {
	t.Helper()
	var all []string
	_ = filepath.Walk(dir, func(p string, _ os.FileInfo, _ error) error {
		if p != dir {
			all = append(all, strings.TrimPrefix(p, dir))
		}
		return nil
	})
	return all
}

func TestExecGivesTheChildATmpdirOfItsOwnAndRemovesItAfter(t *testing.T) {
	tmp := isolatedTmp(t)
	out, _, err := execCmd(Deps{Cwd: t.TempDir()}, "exec", "--", "sh", "-c", `mkdir "$TMPDIR/left-by-a-test" && touch "$TMPDIR/left-by-a-test/f" && printf %s "$TMPDIR"`)
	if err != nil {
		t.Fatal(err, out)
	}
	if !strings.HasPrefix(out, filepath.Join(tmp, "dyna-runs", "run-")) {
		t.Fatalf("the child's TMPDIR is inside this run's directory, got %q", out)
	}
	if left := leftIn(t, filepath.Join(tmp, "dyna-runs")); len(left) != 0 {
		t.Fatalf("nothing is left after the run: %v", left)
	}
}

func TestExecEndsWithTheChildsExitCodeAndStillCleansUp(t *testing.T) {
	tmp := isolatedTmp(t)
	_, _, err := execCmd(Deps{Cwd: t.TempDir()}, "exec", "--", "sh", "-c", `touch "$TMPDIR/x"; exit 4`)
	var ex *nexterr.Exit
	if !errors.As(err, &ex) || ex.Code != 4 {
		t.Fatalf("exit 4 comes back as 4, got %v", err)
	}
	if left := leftIn(t, filepath.Join(tmp, "dyna-runs")); len(left) != 0 {
		t.Fatalf("a failed run is cleaned up too: %v", left)
	}
}

func TestExecPassesTheChildsOwnFlagsThrough(t *testing.T) {
	isolatedTmp(t)
	out, _, err := execCmd(Deps{Cwd: t.TempDir()}, "exec", "sh", "-c", "echo $0 $1", "--test", "-x")
	if err != nil {
		t.Fatal(err)
	}
	if strings.TrimSpace(out) != "--test -x" {
		t.Fatalf("flags after the command belong to it, got %q", out)
	}
}

func TestExecFirstRemovesWhatKilledRunsLeftAndKeepsLiveOnes(t *testing.T) {
	tmp := isolatedTmp(t)
	base := filepath.Join(tmp, "dyna-runs")
	dead := filepath.Join(base, "run-dead")
	live := filepath.Join(base, "run-live")
	put(t, filepath.Join(dead, "pid"), "999999\n")
	put(t, filepath.Join(dead, "tmp", "big"), "x")
	put(t, filepath.Join(live, "pid"), strconv.Itoa(os.Getpid())+"\n")
	put(t, filepath.Join(base, "run-nopid", "tmp", "x"), "x") // killed before it wrote its pid
	old := time.Now().Add(-2 * time.Minute)
	if err := os.Chtimes(filepath.Join(base, "run-nopid"), old, old); err != nil {
		t.Fatal(err)
	}
	put(t, filepath.Join(base, "run-starting", "tmp", "x"), "x") // another run that is writing its pid right now

	_, errs, err := execCmd(Deps{Cwd: t.TempDir()}, "exec", "--", "true")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(dead); !os.IsNotExist(err) {
		t.Fatal("a run whose process is gone is removed")
	}
	if _, err := os.Stat(filepath.Join(base, "run-nopid")); !os.IsNotExist(err) {
		t.Fatal("a run that never wrote its pid is removed")
	}
	if _, err := os.Stat(live); err != nil {
		t.Fatal("a run that is still going is left alone")
	}
	if _, err := os.Stat(filepath.Join(base, "run-starting")); err != nil {
		t.Fatal("a run made a moment ago that has no pid yet is left alone")
	}
	if !strings.Contains(errs, "删掉了 2 个") {
		t.Fatalf("says what it cleared, got %q", errs)
	}
}

func TestExecInARepositoryWithDynasSourceBuildsItOnceAndHandsItOver(t *testing.T) {
	isolatedTmp(t)
	repo := t.TempDir()
	put(t, filepath.Join(repo, "dyna", "go.mod"), "module example.com/dyna\n\ngo 1.21\n")
	put(t, filepath.Join(repo, "dyna", "cmd", "dyna", "main.go"), "package main\n\nfunc main() { println(\"built\") }\n")
	sub := filepath.Join(repo, "idea-loop")
	if err := os.Mkdir(sub, 0o755); err != nil {
		t.Fatal(err)
	}
	out, errs, err := execCmd(Deps{Cwd: sub}, "exec", "--", "sh", "-c", `"$DYNA_TEST_BIN" 2>&1`)
	if err != nil {
		t.Fatal(err, errs)
	}
	if strings.TrimSpace(out) != "built" {
		t.Fatalf("the child runs the dyna built from the repository, got %q %q", out, errs)
	}
}

func TestRunGoesThroughARunDirectoryToo(t *testing.T) {
	tmp := isolatedTmp(t)
	root := pluginWithTests(t, "a.test.mjs")
	var gotEnv []string
	runner := func(ctx context.Context, dir, name string, args, env []string, stdout, stderr io.Writer) (int, error) {
		gotEnv = env
		return 0, nil
	}
	if _, _, err := execCmd(Deps{Cwd: root, Run: runner}, "run"); err != nil {
		t.Fatal(err)
	}
	found := false
	for _, kv := range gotEnv {
		if strings.HasPrefix(kv, "TMPDIR="+filepath.Join(tmp, "dyna-runs", "run-")) {
			found = true
		}
	}
	if !found {
		t.Fatalf("node gets the run's TMPDIR: %v", gotEnv)
	}
}

func TestNodeTestOnATerminalKeepsTheSpecReporter(t *testing.T) {
	tty, err := os.OpenFile("/dev/tty", os.O_WRONLY, 0)
	if err != nil {
		t.Skip("no terminal here")
	}
	defer tty.Close()
	got := specReporterOnATerminal(tty, "node", []string{"--test", "a.test.mjs"})
	if strings.Join(got, " ") != "--test --test-reporter=spec a.test.mjs" {
		t.Fatal(got)
	}
	if got := specReporterOnATerminal(tty, "node", []string{"--test", "--test-reporter=tap"}); len(got) != 2 {
		t.Fatal("a reporter asked for is kept", got)
	}
}

func TestNodeTestIntoAPipeIsLeftAlone(t *testing.T) {
	r, w, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	defer r.Close()
	defer w.Close()
	if got := specReporterOnATerminal(w, "node", []string{"--test", "a.test.mjs"}); len(got) != 2 {
		t.Fatal(got)
	}
	if got := specReporterOnATerminal(os.Stdout, "sh", []string{"-c", "x"}); len(got) != 2 {
		t.Fatal(got)
	}
}
