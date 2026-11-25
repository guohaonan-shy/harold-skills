//go:build !unix

package serve

import "os/exec"

// detach does nothing on a system dyna is not released for.
func detach(cmd *exec.Cmd) {}
