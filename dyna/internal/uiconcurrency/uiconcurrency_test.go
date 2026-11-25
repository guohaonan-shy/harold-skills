package uiconcurrency

import (
	"regexp"
	"testing"
	"time"
)

// These tests are the assertions of idea-loop/scripts/ui-measure-concurrency.test.mjs, one for one.

const gib = 1 << 30

var idle = Input{CPUs: 12, IdleCores: 10, AvailableBytes: 8 * gib}

func with(in Input, f func(*Input)) Input { f(&in); return in }

func pick(in Input) int { c, _ := Pick(in); return c }

func intp(n int) *int { return &n }

func TestAnIdleMachineRunsFourMatricesAtOnceNeverMore(t *testing.T) {
	if got := pick(with(idle, func(i *Input) { i.Matrices = 4 })); got != 4 {
		t.Fatal(got)
	}
	if got := pick(with(idle, func(i *Input) { i.Matrices = 9 })); got != 4 {
		t.Fatal(got)
	}
}

func TestNeverMoreSlotsThanMatrices(t *testing.T) {
	if got := pick(with(idle, func(i *Input) { i.Matrices = 2 })); got != 2 {
		t.Fatal(got)
	}
	if got := pick(with(idle, func(i *Input) { i.Matrices = 1 })); got != 1 {
		t.Fatal(got)
	}
}

func TestMemoryLimitsIt0point6GiBBrowserPlus0point5GiBAMatrix(t *testing.T) {
	// 2.4 GiB available → (2.4 − 0.6) / 0.5 = 3.6 → 3
	if got := pick(with(idle, func(i *Input) { i.Matrices = 4; i.AvailableBytes = 2.4 * gib })); got != 3 {
		t.Fatal(got)
	}
	// 1.0 GiB → 0 slots, still runs one
	if got := pick(with(idle, func(i *Input) { i.Matrices = 4; i.AvailableBytes = 1 * gib })); got != 1 {
		t.Fatal(got)
	}
}

func TestIdleCPULimitsItOneIdleCoreAMatrix(t *testing.T) {
	if got := pick(with(idle, func(i *Input) { i.Matrices = 4; i.IdleCores = 2.5 })); got != 2 {
		t.Fatal(got)
	}
	// no idle core → still one at a time
	if got := pick(with(idle, func(i *Input) { i.Matrices = 4; i.IdleCores = 0.3 })); got != 1 {
		t.Fatal(got)
	}
}

func TestIdleCoresAreReadFromThePerCoreTimeCountersNotTheLoadAverage(t *testing.T) {
	// 4 cores; over the window each core spends 100 ticks, 3 of them 75 idle, 1 of them 0 idle
	call := 0
	core := func(user, idle float64) CPUTimes { return CPUTimes{User: user, Idle: idle} }
	cpus := func() []CPUTimes {
		call++
		if call > 1 {
			return []CPUTimes{core(25, 75), core(25, 75), core(25, 75), core(100, 0)}
		}
		return []CPUTimes{core(0, 0), core(0, 0), core(0, 0), core(0, 0)}
	}
	if got := SampleIdleCores(cpus, time.Millisecond); got != 2.25 {
		t.Fatal(got)
	}
}

func TestNoTimePassingOnAnyCounterMeansAllCoresAreIdle(t *testing.T) {
	same := func() []CPUTimes { return []CPUTimes{{User: 5, Idle: 5}, {User: 5, Idle: 5}} }
	if got := SampleIdleCores(same, time.Millisecond); got != 2 {
		t.Fatal(got)
	}
}

func TestConcurrencyWinsOverTheMachineButIsStillCappedAt4AndAtTheMatrixCount(t *testing.T) {
	busy := Input{CPUs: 12, IdleCores: 0, AvailableBytes: 1 * gib}
	for _, c := range []struct{ matrices, requested, want int }{{4, 3, 3}, {8, 6, 4}, {2, 4, 2}} {
		got, reason := Pick(with(busy, func(i *Input) { i.Matrices = c.matrices; i.Requested = intp(c.requested) }))
		if got != c.want {
			t.Errorf("%+v: %d", c, got)
		}
		if c.requested != c.want && !regexp.MustCompile("按上限").MatchString(reason) {
			t.Errorf("a truncated request says so: %s", reason)
		}
	}
}

func TestTheReasonNamesTheNumbersItDecidedFrom(t *testing.T) {
	_, reason := Pick(Input{CPUs: 12, IdleCores: 2.5, AvailableBytes: 2.4 * gib, Matrices: 4})
	for _, re := range []string{`2\.4 GiB 够 3 份`, `空闲 CPU 2\.5 核.*够 2 份`} {
		if !regexp.MustCompile(re).MatchString(reason) {
			t.Errorf("%s not in %s", re, reason)
		}
	}
}

// The real machine: whatever the computer is doing, the numbers are sane (at least one core, a pick of 1 to 4).
func TestTheRealMachineGivesNumbersPickCanUse(t *testing.T) {
	if testing.Short() {
		t.Skip("samples the CPU for a second")
	}
	cpus, idleCores, avail := Machine()
	if cpus < 1 || idleCores < 0 || idleCores > float64(cpus)+0.01 || avail < 0 {
		t.Fatalf("cpus %d, idle %v, available %v", cpus, idleCores, avail)
	}
	if c := pick(Input{Matrices: 9, CPUs: cpus, IdleCores: idleCores, AvailableBytes: avail}); c < 1 || c > 4 {
		t.Fatal(c)
	}
}
