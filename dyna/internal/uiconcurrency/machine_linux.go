//go:build linux

package uiconcurrency

import (
	"bufio"
	"os"
	"runtime"
	"strconv"
	"strings"
	"time"
)

// Machine reads what Pick decides from off this computer: logical cores, cores idle over the next half second,
// and the memory the OS can hand out now. Memory it cannot read counts as none, which runs one matrix at a time.
func Machine() (cpus int, idleCores, availableBytes float64) {
	cpus = runtime.NumCPU()
	idleCores = SampleIdleCores(procStat, 500*time.Millisecond)
	return cpus, idleCores, memAvailable()
}

// procStat is /proc/stat: one `cpuN user nice system idle iowait irq softirq steal …` line a core.
func procStat() []CPUTimes {
	f, err := os.Open("/proc/stat")
	if err != nil {
		return nil
	}
	defer f.Close()
	var out []CPUTimes
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		fields := strings.Fields(sc.Text())
		if len(fields) < 8 || !strings.HasPrefix(fields[0], "cpu") || fields[0] == "cpu" {
			continue
		}
		n := func(i int) float64 { v, _ := strconv.ParseFloat(fields[i], 64); return v }
		out = append(out, CPUTimes{User: n(1), Nice: n(2), Sys: n(3), Idle: n(4), IRQ: n(6)})
	}
	return out
}

// memAvailable is MemAvailable of /proc/meminfo, the memory a new process can get without swapping.
func memAvailable() float64 {
	f, err := os.Open("/proc/meminfo")
	if err != nil {
		return 0
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		if rest, ok := strings.CutPrefix(sc.Text(), "MemAvailable:"); ok {
			kb, _ := strconv.ParseFloat(strings.Fields(rest)[0], 64)
			return kb * 1024
		}
	}
	return 0
}
