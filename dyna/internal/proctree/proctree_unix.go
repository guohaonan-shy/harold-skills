//go:build unix

package proctree

import (
	"os/exec"
	"syscall"
)

// inGroup makes the child the leader of a process group of its own, so the group can be ended as one.
func inGroup(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
}

// killGroup sends the group a kill (hard) or a terminate (soft). A group with no members left is not an error.
func killGroup(cmd *exec.Cmd, pgid int, hard bool) {
	sig := syscall.SIGTERM
	if hard {
		sig = syscall.SIGKILL
	}
	if pgid > 0 {
		_ = syscall.Kill(-pgid, sig)
	}
}
