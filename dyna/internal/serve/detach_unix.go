//go:build unix

package serve

import (
	"os/exec"
	"syscall"
)

// detach puts the server in a session of its own, so it outlives the command that started it and a Ctrl-C or a
// closed terminal of the caller does not reach it.
func detach(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
}
