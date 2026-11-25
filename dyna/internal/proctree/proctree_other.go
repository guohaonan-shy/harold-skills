//go:build !unix

package proctree

import "os/exec"

// inGroup does nothing on a system dyna is not released for.
func inGroup(cmd *exec.Cmd) {}

// killGroup ends the child itself; there are no process groups to end here.
func killGroup(cmd *exec.Cmd, pgid int, hard bool) {
	if cmd.Process != nil {
		_ = cmd.Process.Kill()
	}
}
