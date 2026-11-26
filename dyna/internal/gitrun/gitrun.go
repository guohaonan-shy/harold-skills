// Package gitrun starts the git program for the git and worktree modules: one place that knows how a git call
// is run and what a failed one says.
package gitrun

import (
	"bytes"
	"os/exec"
	"strings"
)

// Error is a failed git call. Its message is what git said on stderr.
type Error struct {
	Args   []string
	Stderr string
	Err    error
}

func (e *Error) Error() string {
	if s := strings.TrimSpace(e.Stderr); s != "" {
		return s
	}
	if e.Err != nil {
		return e.Err.Error()
	}
	return "git failed"
}

func (e *Error) Unwrap() error { return e.Err }

// Run runs `git <args>` in dir (the process's directory when dir is empty) with stdin closed and returns
// what git printed on stdout.
func Run(dir string, args ...string) (string, error) {
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	var out, errb bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &errb
	if err := cmd.Run(); err != nil {
		return out.String(), &Error{Args: args, Stderr: errb.String(), Err: err}
	}
	return out.String(), nil
}
