//go:build !unix

package worktree

import "io"

// stopProcsInside does nothing on a system dyna is not released for.
func stopProcsInside(w io.Writer, root string) error { return nil }
