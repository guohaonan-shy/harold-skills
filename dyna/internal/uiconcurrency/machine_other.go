//go:build !linux && !darwin

package uiconcurrency

import "runtime"

// Machine on a system dyna is not released for: the number of cores, no idle core known and no memory known, so
// one matrix at a time.
func Machine() (cpus int, idleCores, availableBytes float64) {
	return runtime.NumCPU(), 0, 0
}
