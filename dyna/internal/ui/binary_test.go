package ui

import (
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"testing"
)

var (
	builtOnce sync.Once
	builtPath string
	builtErr  error
	builtDir  string
)

// buildDyna compiles the dyna binary once for the whole test run: the seam of these tests is the command line, so
// the lock is taken by real processes.
func buildDyna(t *testing.T) string {
	t.Helper()
	builtOnce.Do(func() {
		builtDir, builtErr = os.MkdirTemp("", "dyna-ui-test-")
		if builtErr != nil {
			return
		}
		builtPath = filepath.Join(builtDir, "dyna")
		out, err := exec.Command("go", "build", "-o", builtPath, "../../cmd/dyna").CombinedOutput()
		if err != nil {
			builtErr = &buildError{err: err, out: string(out)}
		}
	})
	if builtErr != nil {
		t.Fatal(builtErr)
	}
	return builtPath
}

type buildError struct {
	err error
	out string
}

func (e *buildError) Error() string { return "go build: " + e.err.Error() + "\n" + e.out }

func TestMain(m *testing.M) {
	code := m.Run()
	if sharedBrowser != nil {
		sharedBrowser.Close()
	}
	if builtDir != "" {
		_ = os.RemoveAll(builtDir)
	}
	os.Exit(code)
}
