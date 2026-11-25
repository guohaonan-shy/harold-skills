//go:build unix

package worktree

import (
	"bufio"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"time"
)

// proc is one running process: its id, its parent's, the command line ps shows and its current directory.
type proc struct {
	PID, PPID int
	Command   string
	Cwd       string
}

// listProcs reads every process this user can see: pid, parent and command from ps, current directory from
// /proc on Linux and from lsof elsewhere. A process whose directory cannot be read is kept with an empty Cwd.
var listProcs = func() ([]proc, error) {
	out, err := exec.Command("ps", "-A", "-o", "pid=,ppid=,command=").Output()
	if err != nil {
		return nil, fmt.Errorf("ps 读不出进程表：%v", err)
	}
	var all []proc
	byPID := map[int]int{}
	sc := bufio.NewScanner(strings.NewReader(string(out)))
	sc.Buffer(make([]byte, 1<<16), 1<<20)
	for sc.Scan() {
		f := strings.Fields(sc.Text())
		if len(f) < 3 {
			continue
		}
		pid, e1 := strconv.Atoi(f[0])
		ppid, e2 := strconv.Atoi(f[1])
		if e1 != nil || e2 != nil {
			continue
		}
		byPID[pid] = len(all)
		all = append(all, proc{PID: pid, PPID: ppid, Command: strings.Join(f[2:], " ")})
	}
	if runtime.GOOS == "linux" {
		for i := range all {
			if cwd, err := os.Readlink(fmt.Sprintf("/proc/%d/cwd", all[i].PID)); err == nil {
				all[i].Cwd = cwd
			}
		}
		return all, nil
	}
	// lsof exits 1 when some processes could not be read; what it did print is still good.
	lo, _ := exec.Command("lsof", "-n", "-P", "-w", "-d", "cwd", "-F", "pn").Output()
	pid := 0
	for _, line := range strings.Split(string(lo), "\n") {
		switch {
		case strings.HasPrefix(line, "p"):
			pid, _ = strconv.Atoi(line[1:])
		case strings.HasPrefix(line, "n") && pid > 0:
			if i, ok := byPID[pid]; ok {
				all[i].Cwd = line[1:]
			}
		}
	}
	return all, nil
}

// signalProc and alive are the two things stopping a process needs from the OS.
var (
	signalProc = func(pid int, sig syscall.Signal) error { return syscall.Kill(pid, sig) }
	alive      = func(pid int) bool { return syscall.Kill(pid, 0) == nil }
	stopGrace  = 3 * time.Second
)

// inside says whether dir is root or below it, comparing resolved paths.
func inside(dir, root string) bool {
	if dir == "" {
		return false
	}
	d, r := realPath(dir), realPath(root)
	return d == r || strings.HasPrefix(d, r+string(filepath.Separator))
}

// procsInside is every process whose current directory is in root, except this process and its ancestors (the
// session that asked, its shell): stopping those would end the caller before it could finish closing.
func procsInside(all []proc, root string, self int) []proc {
	parent := map[int]int{}
	for _, p := range all {
		parent[p.PID] = p.PPID
	}
	skip := map[int]bool{}
	for pid := self; pid > 1 && !skip[pid]; pid = parent[pid] {
		skip[pid] = true
	}
	var hit []proc
	for _, p := range all {
		if !skip[p.PID] && inside(p.Cwd, root) {
			hit = append(hit, p)
		}
	}
	return hit
}

// stopProcsInside terminates the processes working in root, waits, kills what is left, and says what it stopped.
func stopProcsInside(w io.Writer, root string) error {
	all, err := listProcs()
	if err != nil {
		return err
	}
	hit := procsInside(all, root, os.Getpid())
	if len(hit) == 0 {
		return nil
	}
	for _, p := range hit {
		_ = signalProc(p.PID, syscall.SIGTERM)
	}
	deadline := time.Now().Add(stopGrace)
	for time.Now().Before(deadline) {
		left := 0
		for _, p := range hit {
			if alive(p.PID) {
				left++
			}
		}
		if left == 0 {
			break
		}
		time.Sleep(100 * time.Millisecond)
	}
	for _, p := range hit {
		how := "已停掉"
		if alive(p.PID) {
			_ = signalProc(p.PID, syscall.SIGKILL)
			how = "已强停"
		}
		fmt.Fprintf(w, "%s进程 %d：%s\n", how, p.PID, clip(p.Command, 120))
	}
	return nil
}

func clip(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n]) + "…"
}
