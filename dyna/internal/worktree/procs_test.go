//go:build unix

package worktree

import (
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"testing"
	"time"
)

func TestRemoveStopsWhatIsStillRunningInTheWorktreeFirst(t *testing.T) {
	f := newProject(t)
	out, err := run("add", "21-server", "--repo", f.main, "--base", "main")
	if err != nil {
		t.Fatal(err, out)
	}
	wt := strings.TrimSpace(out)
	// a dev server the session started and never stopped, working in a subdirectory of the worktree
	sub := filepath.Join(wt, "web")
	if err := os.Mkdir(sub, 0o755); err != nil {
		t.Fatal(err)
	}
	srv := exec.Command("sleep", "60")
	srv.Dir = sub
	if err := srv.Start(); err != nil {
		t.Fatal(err)
	}
	done := make(chan struct{})
	go func() { _ = srv.Wait(); close(done) }()
	t.Cleanup(func() { _ = srv.Process.Kill() })
	// a process elsewhere is left alone
	other := exec.Command("sleep", "60")
	other.Dir = f.main
	if err := other.Start(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = other.Process.Kill(); _, _ = other.Process.Wait() })

	out, err = run("remove", wt, "--repo", f.main)
	if err != nil {
		t.Fatal(err, out)
	}
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("the process working in the worktree is still running")
	}
	if !strings.Contains(out, "进程 "+strconv.Itoa(srv.Process.Pid)) {
		t.Fatalf("says which process it stopped, got %q", out)
	}
	if syscall.Kill(other.Process.Pid, 0) != nil {
		t.Fatal("a process outside the worktree was stopped")
	}
	if _, err := os.Stat(wt); !os.IsNotExist(err) {
		t.Fatal("the worktree is gone")
	}
}

func TestRemoveKillsWhatIgnoresTheTerminate(t *testing.T) {
	f := newProject(t)
	out, err := run("add", "22-stubborn", "--repo", f.main, "--base", "main")
	if err != nil {
		t.Fatal(err, out)
	}
	wt := strings.TrimSpace(out)
	old := stopGrace
	stopGrace = 300 * time.Millisecond
	t.Cleanup(func() { stopGrace = old })
	p := exec.Command("sh", "-c", `trap "" TERM; echo ready; while :; do sleep 1; done`)
	p.Dir = wt
	stdout, _ := p.StdoutPipe()
	if err := p.Start(); err != nil {
		t.Fatal(err)
	}
	buf := make([]byte, 6)
	_, _ = stdout.Read(buf) // the trap is set
	done := make(chan struct{})
	go func() { _ = p.Wait(); close(done) }()
	t.Cleanup(func() { _ = p.Process.Kill() })

	out, err = run("remove", wt, "--repo", f.main, "--force")
	if err != nil {
		t.Fatal(err, out)
	}
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("a process that ignores TERM is killed")
	}
	if !strings.Contains(out, "已强停进程 "+strconv.Itoa(p.Process.Pid)) {
		t.Fatalf("says it had to kill it, got %q", out)
	}
}

func TestTheCallerAndItsAncestorsAreNeverStopped(t *testing.T) {
	root := "/w/12-x"
	all := []proc{
		{PID: 1, PPID: 0, Cwd: "/"},
		{PID: 10, PPID: 1, Command: "claude", Cwd: root},        // the session
		{PID: 11, PPID: 10, Command: "zsh", Cwd: root + "/web"}, // its shell
		{PID: 12, PPID: 11, Command: "dyna", Cwd: root},         // this process
		{PID: 20, PPID: 10, Command: "npm run dev", Cwd: root},  // a server the session started
		{PID: 21, PPID: 1, Command: "vite", Cwd: root + "/web"}, // reparented
		{PID: 30, PPID: 1, Command: "sleep", Cwd: "/w/12-xy"},   // a sibling worktree whose name starts the same
		{PID: 31, PPID: 1, Command: "unknown", Cwd: ""},         // directory not readable
	}
	got := procsInside(all, root, 12)
	var pids []int
	for _, p := range got {
		pids = append(pids, p.PID)
	}
	if len(pids) != 2 || pids[0] != 20 || pids[1] != 21 {
		t.Fatalf("only the session's leftovers inside the worktree, got %v", pids)
	}
}

func TestAddWaitsOutALockAnotherSessionHolds(t *testing.T) {
	f := newProject(t)
	// only the remote has the branch, so add writes the tracking setting into .git/config
	sh(t, f.main, "branch", "issue/23-busy")
	sh(t, f.main, "push", "-q", "origin", "issue/23-busy")
	sh(t, f.main, "branch", "-q", "-D", "issue/23-busy")
	oldWait := lockWait
	lockWait = 200 * time.Millisecond
	t.Cleanup(func() { lockWait = oldWait })
	lock := filepath.Join(f.main, ".git", "config.lock")
	if err := os.WriteFile(lock, nil, 0o644); err != nil {
		t.Fatal(err)
	}
	go func() { time.Sleep(300 * time.Millisecond); _ = os.Remove(lock) }()

	out, err := run("add", "23-busy", "--repo", f.main)
	if err != nil {
		t.Fatalf("waits for the lock instead of failing: %v %s", err, out)
	}
	wt := strings.TrimSpace(out)
	if got := sh(t, wt, "rev-parse", "--abbrev-ref", "@{upstream}"); got != "origin/issue/23-busy" {
		t.Fatal(got)
	}
}
