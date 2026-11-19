package ui

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// These tests are the assertions of idea-loop/scripts/browser-lock.test.mjs, one for one, then the command line
// and two real processes taking the lock at once.

func lockDir(t *testing.T) string { return filepath.Join(t.TempDir(), "browser.lock") }

func at(s string) time.Time {
	tm, err := time.Parse(time.RFC3339, s)
	if err != nil {
		panic(err)
	}
	return tm
}

func try(t *testing.T, dir, owner string, staleMin float64, now time.Time) bool {
	t.Helper()
	ok, err := TryAcquire(dir, owner, staleMin, now)
	if err != nil {
		t.Fatal(err)
	}
	return ok
}

func TestTheFirstCallerHoldsTheLockAndASecondOneIsRefused(t *testing.T) {
	dir := lockDir(t)
	if !try(t, dir, "03", 45, time.Now()) {
		t.Fatal("the first caller holds it")
	}
	if try(t, dir, "05", 45, time.Now()) {
		t.Fatal("a second one is refused")
	}
	if o := ReadOwner(dir); o == nil || o.Owner != "03" {
		t.Fatal(o)
	}
}

func TestALockWhoseParentDirectoriesDoNotExistYetIsStillAcquired(t *testing.T) {
	dir := filepath.Join(t.TempDir(), ".tmp", "dreaming", "2026-10-21", "browser.lock")
	if !try(t, dir, "dreaming", 45, time.Now()) {
		t.Fatal("not acquired")
	}
	if o := ReadOwner(dir); o == nil || o.Owner != "dreaming" {
		t.Fatal(o)
	}
}

func TestReAcquiringByTheHolderIsANoOpSuccess(t *testing.T) {
	dir := lockDir(t)
	try(t, dir, "03", 45, time.Now())
	if !try(t, dir, "03", 45, time.Now()) {
		t.Fatal("the holder asks again")
	}
}

func TestAStaleLockIsTakenOver(t *testing.T) {
	dir := lockDir(t)
	try(t, dir, "03", 45, at("2026-01-01T00:00:00Z"))
	if !try(t, dir, "05", 45, at("2026-01-01T01:00:00Z")) {
		t.Fatal("an hour later the lock is stale")
	}
	if o := ReadOwner(dir); o.Owner != "05" {
		t.Fatal(o)
	}
}

func TestADirectoryWithoutOwnerJSONIsLeftAloneBrieflyThenCountsAsStale(t *testing.T) {
	dir := lockDir(t)
	if err := os.Mkdir(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	if Status(dir, 45, time.Now()).Stale {
		t.Fatal("a holder between its mkdir and its write")
	}
	if try(t, dir, "05", 45, time.Now()) {
		t.Fatal("left alone")
	}
	later := time.Now().Add(time.Minute)
	if !Status(dir, 45, later).Stale {
		t.Fatal("a minute later it is stale")
	}
	if !try(t, dir, "05", 45, later) {
		t.Fatal("and taken over")
	}
}

func TestOnlyTheHolderReleasesUnlessForced(t *testing.T) {
	dir := lockDir(t)
	try(t, dir, "03", 45, time.Now())
	if Release(dir, "05", false) {
		t.Fatal("not the holder")
	}
	if _, err := os.Stat(dir); err != nil {
		t.Fatal("still held")
	}
	if !Release(dir, "", true) {
		t.Fatal("forced")
	}
	if _, err := os.Stat(dir); err == nil {
		t.Fatal("gone")
	}
}

func TestStatusOfAFreeLockLeavesNothingBehind(t *testing.T) {
	dir := lockDir(t)
	if s := Status(dir, 45, time.Now()); s.Held || s.JSON() != `{"held":false}` {
		t.Fatal(s)
	}
	if _, err := os.Stat(dir); err == nil {
		t.Fatal("status made the directory")
	}
}

func TestStatusPrintsTheJSONTheOldScriptPrinted(t *testing.T) {
	dir := lockDir(t)
	try(t, dir, "03", 45, at("2026-01-01T00:00:00Z"))
	got := Status(dir, 45, at("2026-01-01T00:10:00Z")).JSON()
	if got != `{"held":true,"owner":"03","since":"2026-01-01T00:00:00.000Z","stale":false}` {
		t.Fatal(got)
	}
	if got := Status(dir, 45, at("2026-01-01T01:00:00Z")).JSON(); !strings.HasSuffix(got, `"stale":true}`) {
		t.Fatal(got)
	}
	bare := lockDir(t)
	_ = os.Mkdir(bare, 0o755)
	if got := Status(bare, 45, time.Now()).JSON(); got != `{"held":true,"owner":null,"since":null,"stale":false}` {
		t.Fatal(got)
	}
}

// CLI: acquire with no wait fails while held, release frees it.
func TestCLIAcquireWithNoWaitFailsWhileHeldAndReleaseFreesIt(t *testing.T) {
	dir := lockDir(t)
	if r := run(Deps{}, "lock", "acquire", dir, "--owner", "03"); r.code != 0 || !strings.Contains(r.err, "browser-lock: acquired by 03") {
		t.Fatal(r.all())
	}
	r := run(Deps{}, "lock", "acquire", dir, "--owner", "05", "--wait-min", "0")
	if r.code != 1 || !strings.Contains(r.err, "browser-lock: still held by 03 — gave up waiting") {
		t.Fatal(r.all())
	}
	if r := run(Deps{}, "lock", "release", dir, "--owner", "05"); r.code != 1 || !strings.Contains(r.err, "held by 03, not 05") {
		t.Fatal(r.all())
	}
	if r := run(Deps{}, "lock", "release", dir, "--owner", "03"); r.code != 0 {
		t.Fatal(r.all())
	}
	r = run(Deps{}, "lock", "status", dir)
	if strings.TrimSpace(r.out) != `{"held":false}` {
		t.Fatal(r.all())
	}
}

func TestCLIUsageErrorsExit1(t *testing.T) {
	dir := lockDir(t)
	for _, args := range [][]string{
		{"lock", "acquire", dir},                      // no --owner
		{"lock", "release", dir},                      // neither --owner nor --force
		{"lock", "acquire"},                           // no lock dir
		{"lock", "status"},                            // no lock dir
		{"lock", "acquire", dir, "--owner", "a", "x"}, // more than a lock dir
	} {
		if r := run(Deps{}, args...); r.code != 1 || !strings.Contains(r.err, "usage") {
			t.Errorf("%v: %s", args, r.all())
		}
	}
	if r := run(Deps{}, "lock", "release", dir, "--force"); r.code != 0 {
		t.Fatal("--force needs no owner:", r.all())
	}
}

// acquire waits for the holder: it tries again every 3 seconds, gets the lock once it is released, and gives up
// once the wait is over.
func TestAcquireWaitsForTheHolderAndGivesUpWhenTheWaitIsOver(t *testing.T) {
	dir := lockDir(t)
	try(t, dir, "03", 45, time.Now())
	clock := time.Now()
	var sleeps []time.Duration
	d := Deps{
		Now: func() time.Time { return clock },
		Sleep: func(s time.Duration) {
			sleeps = append(sleeps, s)
			clock = clock.Add(s)
			if len(sleeps) == 4 {
				Release(dir, "03", false) // the holder lets go during the fourth wait
			}
		},
	}
	if r := run(d, "lock", "acquire", dir, "--owner", "05", "--wait-min", "1"); r.code != 0 {
		t.Fatal(r.all())
	}
	if len(sleeps) != 4 || sleeps[0] != 3*time.Second {
		t.Fatalf("it polls every 3 s: %v", sleeps)
	}
	if o := ReadOwner(dir); o == nil || o.Owner != "05" {
		t.Fatal(o)
	}

	// a holder that never lets go: the minute runs out after 20 tries
	sleeps = nil
	r := run(d, "lock", "acquire", dir, "--owner", "07", "--wait-min", "1", "--stale-min", "45")
	if r.code != 1 || !strings.Contains(r.err, "still held by 05 — gave up waiting") || len(sleeps) != 20 {
		t.Fatal(len(sleeps), r.all())
	}
}

// Two callers at the same moment: exactly one holds the lock.
func TestManyCallersAtOnceExactlyOneHoldsTheLock(t *testing.T) {
	dir := lockDir(t)
	var won atomic.Int32
	var wg sync.WaitGroup
	for i := 0; i < 24; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			ok, err := TryAcquire(dir, "owner-"+string(rune('a'+i)), 45, time.Now())
			if err != nil {
				t.Error(err)
			}
			if ok {
				won.Add(1)
			}
		}()
	}
	wg.Wait()
	if won.Load() != 1 {
		t.Fatalf("%d callers hold the lock", won.Load())
	}
}

// Two real processes: the second waits for the first, or is refused the way the old script refused it.
func TestTwoProcessesAtOnceTheSecondWaitsOrIsRefused(t *testing.T) {
	bin := buildDyna(t)
	dir := lockDir(t)
	first := exec.Command(bin, "ui", "lock", "acquire", dir, "--owner", "03")
	if out, err := first.CombinedOutput(); err != nil {
		t.Fatal(err, string(out))
	}

	refused := exec.Command(bin, "ui", "lock", "acquire", dir, "--owner", "05", "--wait-min", "0")
	out, err := refused.CombinedOutput()
	if ee, ok := err.(*exec.ExitError); !ok || ee.ExitCode() != 1 || !strings.Contains(string(out), "still held by 03") {
		t.Fatalf("refused: %v %s", err, out)
	}

	// the second one waits (it tries every 3 s); the first lets go; the second gets it
	waiter := exec.Command(bin, "ui", "lock", "acquire", dir, "--owner", "05", "--wait-min", "1")
	var buf strings.Builder
	waiter.Stderr = &buf
	if err := waiter.Start(); err != nil {
		t.Fatal(err)
	}
	time.Sleep(500 * time.Millisecond)
	if out, err := exec.Command(bin, "ui", "lock", "release", dir, "--owner", "03").CombinedOutput(); err != nil {
		t.Fatal(err, string(out))
	}
	done := make(chan error, 1)
	go func() { done <- waiter.Wait() }()
	select {
	case err := <-done:
		if err != nil || !strings.Contains(buf.String(), "acquired by 05") {
			t.Fatal(err, buf.String())
		}
	case <-time.After(15 * time.Second):
		_ = waiter.Process.Kill()
		t.Fatal("the waiting process did not get the lock once it was released")
	}
	if o := ReadOwner(dir); o == nil || o.Owner != "05" {
		t.Fatal(o)
	}
}
