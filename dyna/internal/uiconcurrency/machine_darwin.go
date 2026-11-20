//go:build darwin

package uiconcurrency

import (
	"os/exec"
	"regexp"
	"runtime"
	"strconv"
)

// Machine reads what Pick decides from off this computer: logical cores, cores idle over one second, and the
// memory the OS can hand out now. Anything it cannot read counts as none free, which runs one matrix at a time.
//
// macOS has no per-core counters without cgo, so the idle share comes from `top`'s second CPU sample (the first
// one is the average since boot) and is spread over the cores, which is what summing the per-core counters gave.
func Machine() (cpus int, idleCores, availableBytes float64) {
	cpus = runtime.NumCPU()
	return cpus, topIdleCores(cpus), vmAvailable()
}

var idlePercent = regexp.MustCompile(`CPU usage:.*?([\d.]+)% idle`)

func topIdleCores(cpus int) float64 {
	out, err := exec.Command("top", "-l", "2", "-n", "0", "-s", "1").Output()
	if err != nil {
		return 0
	}
	all := idlePercent.FindAllStringSubmatch(string(out), -1)
	if len(all) == 0 {
		return 0
	}
	pct, err := strconv.ParseFloat(all[len(all)-1][1], 64)
	if err != nil {
		return 0
	}
	return pct / 100 * float64(cpus)
}

var (
	pageSize = regexp.MustCompile(`page size of (\d+) bytes`)
	pages    = regexp.MustCompile(`(?m)^Pages (free|inactive|speculative|purgeable):\s+(\d+)\.`)
)

// vmAvailable is free, inactive, speculative and purgeable pages of `vm_stat`: what a new process can take
// without the OS swapping (the free count alone only holds pages never used).
func vmAvailable() float64 {
	out, err := exec.Command("vm_stat").Output()
	if err != nil {
		return 0
	}
	m := pageSize.FindSubmatch(out)
	if m == nil {
		return 0
	}
	size, _ := strconv.ParseFloat(string(m[1]), 64)
	var total float64
	for _, p := range pages.FindAllSubmatch(out, -1) {
		n, _ := strconv.ParseFloat(string(p[2]), 64)
		total += n
	}
	return total * size
}
