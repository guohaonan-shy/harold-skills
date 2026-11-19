//go:build unix

package proctree

import (
	"bytes"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"testing"
	"time"
)

// alive is whether a process still exists (a zombie that nobody has reaped yet is given a moment to go).
func alive(pid int) bool {
	for i := 0; i < 40; i++ {
		if err := syscall.Kill(pid, 0); err != nil {
			return false
		}
		time.Sleep(50 * time.Millisecond)
	}
	return true
}

func pidFrom(t *testing.T, file string) int {
	t.Helper()
	var text string
	for i := 0; i < 100; i++ {
		b, _ := os.ReadFile(file)
		if strings.TrimSpace(string(b)) != "" {
			text = strings.TrimSpace(string(b))
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	n, err := strconv.Atoi(text)
	if err != nil {
		t.Fatalf("no pid in %s: %q", file, text)
	}
	return n
}

// A shell that starts a sleeping helper of its own and then sleeps itself.
func sleeper(pidFile string) []string {
	return []string{"-c", `sleep 300 & echo $! > ` + pidFile + `; sleep 300`}
}

func TestATimeoutEndsTheChildAndTheHelperItStarted(t *testing.T) {
	pidFile := filepath.Join(t.TempDir(), "helper.pid")
	start := time.Now()
	res, err := Run("sh", sleeper(pidFile), Options{Timeout: 500 * time.Millisecond})
	if err != nil {
		t.Fatal(err)
	}
	if !res.TimedOut {
		t.Fatalf("result = %+v, want timed out", res)
	}
	if took := time.Since(start); took > 10*time.Second {
		t.Errorf("took %s", took)
	}
	if alive(pidFrom(t, pidFile)) {
		t.Error("the helper the child started is still running")
	}
}

func TestAChildThatExitsTakesItsHelperWithIt(t *testing.T) {
	pidFile := filepath.Join(t.TempDir(), "helper.pid")
	// the shell leaves a helper running and exits at once
	res, err := Run("sh", []string{"-c", `sleep 300 & echo $! > ` + pidFile + `; exit 3`}, Options{})
	if err != nil {
		t.Fatal(err)
	}
	if res.ExitCode != 3 || res.TimedOut {
		t.Fatalf("result = %+v", res)
	}
	if alive(pidFrom(t, pidFile)) {
		t.Error("the helper outlived the child")
	}
}

func TestAHelperHoldingTheOutputOpenDoesNotKeepWaitFromReturning(t *testing.T) {
	var out bytes.Buffer
	start := time.Now()
	res, err := Run("sh", []string{"-c", `sleep 300 & echo hello`}, Options{Stdout: &out})
	if err != nil {
		t.Fatal(err)
	}
	if res.ExitCode != 0 || strings.TrimSpace(out.String()) != "hello" {
		t.Errorf("result = %+v, out = %q", res, out.String())
	}
	if took := time.Since(start); took > 5*time.Second {
		t.Errorf("took %s", took)
	}
}

func TestAChildThatIgnoresTheTerminateRequestIsKilledAfterTheGrace(t *testing.T) {
	pidFile := filepath.Join(t.TempDir(), "child.pid")
	script := `trap '' TERM; echo $$ > ` + pidFile + `; while :; do sleep 1; done`
	start := time.Now()
	res, err := Run("sh", []string{"-c", script}, Options{Timeout: 300 * time.Millisecond, Grace: 300 * time.Millisecond})
	if err != nil {
		t.Fatal(err)
	}
	if !res.TimedOut {
		t.Fatalf("result = %+v", res)
	}
	if took := time.Since(start); took > 10*time.Second {
		t.Errorf("took %s", took)
	}
	if alive(pidFrom(t, pidFile)) {
		t.Error("the child that ignores TERM is still running")
	}
}

func TestStdinIsClosedSoAChildThatWaitsForInputSeesTheEnd(t *testing.T) {
	var out bytes.Buffer
	start := time.Now()
	res, err := Run("cat", nil, Options{Stdout: &out})
	if err != nil {
		t.Fatal(err)
	}
	if res.ExitCode != 0 || out.Len() != 0 {
		t.Errorf("result = %+v, out = %q", res, out.String())
	}
	if took := time.Since(start); took > 5*time.Second {
		t.Errorf("cat waited %s for input", took)
	}
}

func TestTextHandedOverArrivesOnStdinAndThenTheInputEnds(t *testing.T) {
	var out bytes.Buffer
	res, err := Run("cat", nil, Options{Stdin: []byte("the prompt\n"), Stdout: &out})
	if err != nil {
		t.Fatal(err)
	}
	if res.ExitCode != 0 || out.String() != "the prompt\n" {
		t.Errorf("result = %+v, out = %q", res, out.String())
	}
}

func TestKillEndsTheGroupAtOnce(t *testing.T) {
	pidFile := filepath.Join(t.TempDir(), "helper.pid")
	p, err := Start("sh", sleeper(pidFile), Options{})
	if err != nil {
		t.Fatal(err)
	}
	pid := pidFrom(t, pidFile)
	p.Kill()
	res := p.Wait()
	if !res.Killed || res.TimedOut {
		t.Fatalf("result = %+v", res)
	}
	if alive(pid) {
		t.Error("the helper is still running after Kill")
	}
}

func TestAnInterruptToDynaEndsTheGroup(t *testing.T) {
	pidFile := filepath.Join(t.TempDir(), "helper.pid")
	p, err := Start("sh", sleeper(pidFile), Options{Grace: 500 * time.Millisecond})
	if err != nil {
		t.Fatal(err)
	}
	pid := pidFrom(t, pidFile)
	if err := syscall.Kill(os.Getpid(), syscall.SIGTERM); err != nil {
		t.Fatal(err)
	}
	res := p.Wait()
	if !res.Interrupted {
		t.Fatalf("result = %+v", res)
	}
	if alive(pid) {
		t.Error("the helper is still running after dyna was told to stop")
	}
}

func TestACommandThatCannotStartIsAnError(t *testing.T) {
	if _, err := Start("/no/such/command", nil, Options{}); err == nil {
		t.Error("expected an error")
	}
}
