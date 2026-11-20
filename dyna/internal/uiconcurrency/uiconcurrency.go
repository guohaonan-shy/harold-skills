// Package uiconcurrency decides how many matrices `dyna ui measure` walks at once, from what this machine has
// free right now. Pick is pure: the caller reads the machine and passes the numbers in.
//
// Costs below were measured on the old script (0.1.26, a project with 4 matrices × 27 cells, process tree
// including Chromium): one browser ≈ 0.6 GiB, each extra matrix ≈ 0.5 GiB (1 → 1.0 GiB, 2 → 1.7 GiB, 4 → 2.4
// GiB); each matrix keeps ≈ 1 core busy between the script's tree and the dev server it loads. Running more
// matrices than idle cores did not change a measurement-layer finding, but it did push pixel percentages near
// the 1% budget across it (busy machine, 4 at once: 56 extra pixel-mismatch), so CPU is a real limit, not just a
// speed knob.
//
// Idle cores are sampled (the kernel's per-core time counters twice), not read off the load average: on macOS
// the load average ran at 23.8 on 12 cores while 3.1 cores were idle.
package uiconcurrency

import (
	"fmt"
	"time"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/jsnum"
)

// The limits the costs above give.
const (
	MaxConcurrency = 4
	BrowserBytes   = 0.6 * (1 << 30)
	PerMatrixBytes = 0.5 * (1 << 30)
	PerMatrixCores = 1.0
)

// Input is what Pick decides from.
type Input struct {
	Matrices       int     // matrices in this run
	Requested      *int    // --concurrency, if given (still capped at MaxConcurrency)
	CPUs           int     // logical cores
	IdleCores      float64 // cores idle right now (SampleIdleCores)
	AvailableBytes float64 // memory the OS can hand out now
}

// Pick is how many matrices to run at once, and the sentence that says what it was decided from.
func Pick(in Input) (int, string) {
	limit := max(1, min(MaxConcurrency, in.Matrices))
	if in.Requested != nil {
		c := max(1, min(*in.Requested, limit))
		reason := fmt.Sprintf("--concurrency %d", *in.Requested)
		if c != *in.Requested {
			reason += fmt.Sprintf("，按上限 %d 截断", limit)
		}
		return c, reason
	}
	memSlots := floor((in.AvailableBytes - BrowserBytes) / PerMatrixBytes)
	cpuSlots := floor(in.IdleCores / PerMatrixCores)
	c := max(1, min(limit, memSlots, cpuSlots))
	gib := func(b float64) string { return jsnum.ToFixed(b/(1<<30), 1) }
	return c, fmt.Sprintf("可用内存 %s GiB 够 %d 份，空闲 CPU %s 核（共 %d 核）够 %d 份，上限 %d（%d 份矩阵，最多 %d）",
		gib(in.AvailableBytes), max(0, memSlots), jsnum.ToFixed(max(0, in.IdleCores), 1), in.CPUs, max(0, cpuSlots), limit, in.Matrices, MaxConcurrency)
}

func floor(x float64) int {
	n := int(x)
	if float64(n) > x {
		n--
	}
	return n
}

// CPUTimes is one core's time counters, in whatever unit the kernel counts in.
type CPUTimes struct {
	User, Nice, Sys, Idle, IRQ float64
}

// SampleIdleCores is how many cores were idle over window, from the kernel's per-core time counters: the share
// of all core time that was idle, times the number of cores. With no time passing on any counter it says all
// cores are idle.
func SampleIdleCores(cpus func() []CPUTimes, window time.Duration) float64 {
	sum := func() (idle, total float64) {
		for _, t := range cpus() {
			idle += t.Idle
			total += t.User + t.Nice + t.Sys + t.Idle + t.IRQ
		}
		return
	}
	idleBefore, totalBefore := sum()
	time.Sleep(window)
	idleAfter, totalAfter := sum()
	total := totalAfter - totalBefore
	n := float64(len(cpus()))
	if total > 0 {
		return (idleAfter - idleBefore) / total * n
	}
	return n
}
