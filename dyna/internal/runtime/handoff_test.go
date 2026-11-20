package runtime_test

// Ported from desktop-handoff.test.mjs. The stand-in for `claude` is a shell script (the old test used a Node one);
// nothing here starts a real claude or opens a real desktop session, and HOME for the records points into a
// temporary directory, so the real ~/.idea-loop/ is never touched. The tests need `expect` (macOS has it) and are
// skipped without it.
//
// Not ported: "the claude path can come from DESKTOP_HANDOFF_CLAUDE" is ported (it goes through dyna's env, not the
// process's); there is nothing left over.

import (
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"testing"
	"time"

	rt "github.com/guohaonan-shy/harold-skills/dyna/internal/runtime"
)

// FAKE is a stand-in for `claude`. `-p` prints one JSON object; `--resume <id>` is a tiny interactive prompt that
// reacts to a typed /desktop line. FAKE_MODE picks the behaviour; FAKE_LOG gets one line per call (arguments and
// directory); FAKE_PID_FILE gets the pid of the interactive process so a test can check it is gone afterwards.
const fakeClaude = `#!/bin/sh
mode="${FAKE_MODE:-ok}"
if [ -n "$FAKE_LOG" ]; then echo "$*|$(pwd -P)" >> "$FAKE_LOG"; fi
if [ "$1" = "-p" ]; then
  case "$mode" in
    p-fail) echo 'boom: not logged in' >&2; exit 2 ;;
    p-no-id) echo '{"result":"就绪"}'; exit 0 ;;
    p-hang) exec sleep 60 ;;
  esac
  echo '{"type":"result","session_id":"fake-session-123","result":"就绪"}'
  exit 0
fi
if [ -n "$FAKE_PID_FILE" ]; then echo $$ > "$FAKE_PID_FILE"; fi
echo 'fake claude ready>'
while read -r line; do
  [ "$line" = "/desktop" ] || continue
  [ "$mode" = "silent" ] && continue
  if [ "$mode" = "repaint" ]; then
    printf '\033[3G✳\033[5GChecking\033[14Gfor\033[18GClaude\033[25GDesktop…\r\r\n\r\033[4C\033[1AOp\033[8Gning Claude Desktop…\033[K\r\r\n\r\033[2C\033[1A✻\r\r\n\r\033[12C\033[1Ain Claud\033[22G Desktop…\r\r\n'
    exit 0
  fi
  echo 'Opening Claude Desktop…'
  exit 0
done
`

type handoffEnv struct {
	root, fake, home, worktree, log, pidFile, dir string
}

func setupHandoff(t *testing.T) handoffEnv {
	t.Helper()
	if _, err := exec.LookPath("expect"); err != nil {
		t.Skip("expect is not installed: the interactive step needs it")
	}
	root, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	h := handoffEnv{root: root}
	h.fake = filepath.Join(root, "fake-claude")
	writeFile(t, h.fake, fakeClaude)
	if err := os.Chmod(h.fake, 0o755); err != nil {
		t.Fatal(err)
	}
	h.home, h.worktree = filepath.Join(root, "home"), filepath.Join(root, "worktree")
	for _, d := range []string{h.home, h.worktree} {
		if err := os.Mkdir(d, 0o755); err != nil {
			t.Fatal(err)
		}
	}
	h.log, h.pidFile, h.dir = filepath.Join(root, "calls.log"), filepath.Join(root, "pid"), filepath.Join(root, "records")
	t.Setenv("FAKE_LOG", h.log)
	t.Setenv("FAKE_PID_FILE", h.pidFile)
	t.Setenv("FAKE_MODE", "")
	return h
}

// run is `dyna runtime handoff` with the fake claude and the worktree, plus the arguments; mode and extra
// variables (dyna's own environment, like DESKTOP_HANDOFF_CLAUDE) are as given.
func (h handoffEnv) run(t *testing.T, mode string, args ...string) outcome {
	t.Helper()
	t.Setenv("FAKE_MODE", mode)
	return dyna(map[string]string{"HOME": h.home}, append([]string{"runtime", "handoff", "--claude", h.fake, "--worktree", h.worktree, "--idle-ms", "300"}, args...)...)
}

type call struct{ args, cwd string }

func (h handoffEnv) calls(t *testing.T) []call {
	t.Helper()
	b, err := os.ReadFile(h.log)
	if err != nil {
		return nil
	}
	var out []call
	for _, l := range strings.Split(strings.TrimSpace(string(b)), "\n") {
		args, cwd, _ := strings.Cut(l, "|")
		out = append(out, call{args, cwd})
	}
	return out
}

func alive(pid int) bool { return syscall.Kill(pid, 0) == nil }

func waitGone(pid int) bool {
	for i := 0; i < 20 && alive(pid); i++ {
		time.Sleep(100 * time.Millisecond)
	}
	return !alive(pid)
}

func TestRenderScreenRebuildsTheLineTheResumedClaudePaintsInPieces(t *testing.T) {
	// taken from a real `/desktop` run (Claude Code 2.1.327): the text is never contiguous in the byte stream
	raw := "\x1b[3G✳\x1b[5GChecking\x1b[14Gfor\x1b[18GClaude\x1b[25GDesktop…\r\r\n\r\x1b[4C\x1b[1AOp\x1b[8Gning Claude Desktop…\x1b[K\r\r\n" +
		"\r\x1b[2C\x1b[1A✻\r\r\n\r\x1b[12C\x1b[1Ain Claud\x1b[22G Desktop…\r\r\n"
	if strings.Contains(raw, "Opening") {
		t.Fatal("the raw stream must not contain the text")
	}
	if got := rt.RenderScreen(raw); !strings.Contains(got, "Opening in Claude Desktop…") {
		t.Fatalf("%q", got)
	}
	// erase-line, carriage return, private modes ignored
	if got := rt.RenderScreen("a\r\nb\x1b[2Kc\r\x1b[?25lx"); got != "a\nxc" {
		t.Fatalf("%q", got)
	}
}

func TestBothStepsWorkExitsZeroWithOneJSONLineOfTheSessionIDAndLocalID(t *testing.T) {
	h := setupHandoff(t)
	r := h.run(t, "")
	if r.code != 0 {
		t.Fatal(r.all())
	}
	var j struct {
		SessionID, DesktopSessionID string
		Recorded                    bool
	}
	if err := json.Unmarshal([]byte(r.stdout), &j); err != nil || strings.Count(strings.TrimSpace(r.stdout), "\n") != 0 {
		t.Fatalf("one JSON line: %q", r.stdout)
	}
	if j.SessionID != "fake-session-123" || j.DesktopSessionID != "local_fake-session-123" || j.Recorded {
		t.Fatalf("%+v", j)
	}
	if r.stdout != `{"sessionId":"fake-session-123","desktopSessionId":"local_fake-session-123","recorded":false}`+"\n" {
		t.Fatalf("the keys and their order are the old script's: %q", r.stdout)
	}
}

func TestBothClaudeRunsHappenInTheGivenWorktreeWithTheReadyPromptOnly(t *testing.T) {
	h := setupHandoff(t)
	h.run(t, "")
	calls := h.calls(t)
	if len(calls) != 2 {
		t.Fatalf("%+v", calls)
	}
	if !strings.HasPrefix(calls[0].args, "-p ") || !strings.Contains(calls[0].args, rt.ReadyPrompt) || !strings.Contains(calls[0].args, "--output-format json") {
		t.Errorf("-p call: %+v", calls[0])
	}
	if calls[1].args != "--resume fake-session-123" {
		t.Errorf("resume call: %+v", calls[1])
	}
	for _, c := range calls {
		if c.cwd != h.worktree {
			t.Errorf("ran in %s, want %s", c.cwd, h.worktree)
		}
	}
}

func TestTheSuccessTextArrivingAsCursorMoveRepaintsStillCounts(t *testing.T) {
	h := setupHandoff(t)
	r := h.run(t, "repaint")
	if r.code != 0 || !strings.Contains(r.stdout, "local_fake-session-123") {
		t.Fatal(r.all())
	}
}

func TestTheClaudePathCanComeFromDESKTOP_HANDOFF_CLAUDEInsteadOfTheFlag(t *testing.T) {
	h := setupHandoff(t)
	r := dyna(map[string]string{"HOME": h.home, "DESKTOP_HANDOFF_CLAUDE": h.fake}, "runtime", "handoff", "--worktree", h.worktree, "--idle-ms", "300")
	if r.code != 0 {
		t.Fatal(r.all())
	}
}

func TestAnInteractiveSessionThatNeverPrintsFailsWithinTheTimeoutAndLeavesNoProcess(t *testing.T) {
	h := setupHandoff(t)
	started := time.Now()
	r := h.run(t, "silent", "--timeout-sec", "3")
	if r.code == 0 || !strings.Contains(r.stderr, "交出失败") {
		t.Fatal(r.all())
	}
	if time.Since(started) > 15*time.Second {
		t.Error("gave up on time")
	}
	pid, err := strconv.Atoi(strings.TrimSpace(readFile(t, h.pidFile)))
	if err != nil {
		t.Fatal(err)
	}
	if !waitGone(pid) {
		t.Errorf("fake claude %d is still running", pid)
	}
}

func TestClaudePExitingNonZeroFailsWithTheExitCodeAndWhatItSaid(t *testing.T) {
	h := setupHandoff(t)
	r := h.run(t, "p-fail")
	if r.code == 0 {
		t.Fatal(r.all())
	}
	for _, want := range []string{"交出失败", "退出码 2", "not logged in"} {
		if !strings.Contains(r.stderr, want) {
			t.Errorf("stderr lacks %q: %s", want, r.stderr)
		}
	}
	if len(h.calls(t)) != 1 {
		t.Error("never got as far as the interactive step")
	}
}

func TestClaudePOutputWithoutASessionIDFailsNamingTheMissingField(t *testing.T) {
	h := setupHandoff(t)
	r := h.run(t, "p-no-id")
	if r.code == 0 || !strings.Contains(r.stderr, "交出失败") || !strings.Contains(r.stderr, "session_id") {
		t.Fatal(r.all())
	}
}

func TestClaudePThatHangsIsCutOffAtItsOwnTimeout(t *testing.T) {
	h := setupHandoff(t)
	r := h.run(t, "p-hang", "--p-timeout-sec", "1")
	if r.code == 0 || !strings.Contains(r.stderr, "交出失败") || !strings.Contains(r.stderr, "超过 1 秒") {
		t.Fatal(r.all())
	}
}

func readRecords(t *testing.T, path string) []map[string]any {
	t.Helper()
	var list []map[string]any
	if err := json.Unmarshal([]byte(readFile(t, path)), &list); err != nil {
		t.Fatal(err)
	}
	return list
}

func TestWithIssueRepoAndPeriodASuccessAppendsOneEntryAndKeepsTheOldOnes(t *testing.T) {
	h := setupHandoff(t)
	if err := os.Mkdir(h.dir, 0o755); err != nil {
		t.Fatal(err)
	}
	old := `[{"issue":1,"desktopSessionId":"local_old","openedAt":"2026-11-17T22:05:00.000Z","period":"night"}]`
	writeFile(t, filepath.Join(h.dir, "demo.json"), old)
	first := h.run(t, "", "--issue", "302", "--repo", "demo", "--period", "night", "--dir", h.dir)
	if first.code != 0 {
		t.Fatal(first.all())
	}
	var j struct{ Recorded bool }
	if err := json.Unmarshal([]byte(first.stdout), &j); err != nil || !j.Recorded {
		t.Fatalf("recorded: %q", first.stdout)
	}
	if r := h.run(t, "", "--issue", "137", "--repo", "demo", "--period", "night", "--dir", h.dir); r.code != 0 {
		t.Fatal(r.all())
	}
	list := readRecords(t, filepath.Join(h.dir, "demo.json"))
	if len(list) != 3 {
		t.Fatalf("%+v", list)
	}
	if list[0]["issue"] != float64(1) || list[0]["desktopSessionId"] != "local_old" {
		t.Errorf("the old entry is kept: %+v", list[0])
	}
	if list[1]["issue"] != float64(302) || list[1]["desktopSessionId"] != "local_fake-session-123" || list[1]["period"] != "night" {
		t.Errorf("%+v", list[1])
	}
	if at, ok := list[1]["openedAt"].(string); !ok || !regexpISO(at) {
		t.Errorf("openedAt is an ISO time: %v", list[1]["openedAt"])
	}
	if list[2]["issue"] != float64(137) {
		t.Errorf("%+v", list[2])
	}
	// the file is the old script's shape: a two-space-indented array, the keys in order, a final newline
	text := readFile(t, filepath.Join(h.dir, "demo.json"))
	if !strings.HasPrefix(text, "[\n  {\n    \"issue\": 1,") || !strings.HasSuffix(text, "}\n]\n") {
		t.Errorf("shape: %q", text)
	}
	if !strings.Contains(text, "\"issue\": 302,\n    \"desktopSessionId\": \"local_fake-session-123\",\n    \"openedAt\": \"") || !strings.Contains(text, "\",\n    \"period\": \"night\"\n  },\n  {\n    \"issue\": 137") {
		t.Errorf("the keys are issue, desktopSessionId, openedAt, period: %q", text)
	}
}

func regexpISO(s string) bool {
	_, err := time.Parse("2006-01-02T15:04:05.000Z", s)
	return err == nil
}

func TestTheRecordsFileIsCreatedWhenItDoesNotExist(t *testing.T) {
	h := setupHandoff(t)
	r := h.run(t, "", "--issue", "5", "--repo", "demo", "--period", "night", "--dir", filepath.Join(h.dir, "nested"))
	if r.code != 0 {
		t.Fatal(r.all())
	}
	if len(readRecords(t, filepath.Join(h.dir, "nested", "demo.json"))) != 1 {
		t.Fatal("one entry")
	}
}

func TestAFailedHandOverWritesNothing(t *testing.T) {
	h := setupHandoff(t)
	r := h.run(t, "p-fail", "--issue", "5", "--repo", "demo", "--period", "night", "--dir", h.dir)
	if r.code == 0 {
		t.Fatal(r.all())
	}
	if _, err := os.Stat(filepath.Join(h.dir, "demo.json")); err == nil {
		t.Fatal("a record was written")
	}
}

func TestTheRecordsDirectoryDefaultsUnderHOMEAndIDEA_LOOP_DISPATCH_DIROverridesIt(t *testing.T) {
	h := setupHandoff(t)
	if r := h.run(t, "", "--issue", "5", "--repo", "demo", "--period", "day"); r.code != 0 {
		t.Fatal(r.all())
	}
	if _, err := os.Stat(filepath.Join(h.home, ".idea-loop", "dispatch", "demo.json")); err != nil {
		t.Fatal("under HOME:", err)
	}
	elsewhere := filepath.Join(h.root, "elsewhere")
	t.Setenv("FAKE_MODE", "")
	r := dyna(map[string]string{"HOME": h.home, "IDEA_LOOP_DISPATCH_DIR": elsewhere}, "runtime", "handoff", "--claude", h.fake, "--worktree", h.worktree, "--idle-ms", "300", "--issue", "6", "--repo", "demo", "--period", "day")
	if r.code != 0 {
		t.Fatal(r.all())
	}
	if _, err := os.Stat(filepath.Join(elsewhere, "demo.json")); err != nil {
		t.Fatal("under IDEA_LOOP_DISPATCH_DIR:", err)
	}
}

func TestARecordsFileThatCannotBeReadIsLeftAloneTheHandOverStillCountsButSaysSo(t *testing.T) {
	h := setupHandoff(t)
	if err := os.Mkdir(h.dir, 0o755); err != nil {
		t.Fatal(err)
	}
	writeFile(t, filepath.Join(h.dir, "demo.json"), "{not json")
	r := h.run(t, "", "--issue", "5", "--repo", "demo", "--period", "night", "--dir", h.dir)
	if r.code != 0 {
		t.Fatal(r.all())
	}
	var j struct{ Recorded bool }
	if err := json.Unmarshal([]byte(r.stdout), &j); err != nil || j.Recorded {
		t.Fatalf("recorded must be false: %q", r.stdout)
	}
	if !strings.Contains(r.stderr, "记录没写进去") {
		t.Errorf("says so: %s", r.stderr)
	}
	if readFile(t, filepath.Join(h.dir, "demo.json")) != "{not json" {
		t.Error("the file was touched")
	}
	// valid JSON that is not an array is left alone too
	writeFile(t, filepath.Join(h.dir, "demo.json"), `{"a":1}`)
	r = h.run(t, "", "--issue", "5", "--repo", "demo", "--period", "night", "--dir", h.dir)
	if r.code != 0 || !strings.Contains(r.stderr, "不是一个数组") || readFile(t, filepath.Join(h.dir, "demo.json")) != `{"a":1}` {
		t.Fatalf("%+v", r)
	}
}

func TestIssueRepoAndPeriodComeAllTogetherOrNotAtAllCheckedBeforeClaudeIsCalled(t *testing.T) {
	h := setupHandoff(t)
	r := h.run(t, "", "--issue", "5")
	if r.code != 1 || !strings.Contains(r.stderr, "要么都给，要么都不给") {
		t.Fatal(r.all())
	}
	if len(h.calls(t)) != 0 {
		t.Fatal("claude was called")
	}
	if r := h.run(t, "", "--issue", "abc", "--repo", "demo", "--period", "night"); r.code != 1 {
		t.Fatal(r.all())
	}
	if r := h.run(t, "", "--bogus", "x"); r.code != 1 {
		t.Fatal(r.all())
	}
	if len(h.calls(t)) != 0 {
		t.Fatal("claude was called")
	}
}

func TestARepoNameThatCannotBeAFileNameIsRefusedInsteadOfWritten(t *testing.T) {
	h := setupHandoff(t)
	r := h.run(t, "", "--issue", "5", "--repo", "../escape", "--period", "night", "--dir", h.dir)
	if r.code != 0 {
		t.Fatalf("the session is handed over: %+v", r)
	}
	var j struct{ Recorded bool }
	if err := json.Unmarshal([]byte(r.stdout), &j); err != nil || j.Recorded {
		t.Fatalf("recorded must be false: %q", r.stdout)
	}
	if !strings.Contains(r.stderr, "仓库名不能当文件名") {
		t.Error(r.stderr)
	}
	if _, err := os.Stat(filepath.Join(h.root, "escape.json")); err == nil {
		t.Error("written outside the records directory")
	}
}

func TestTimesThatAreNotPositiveNumbersAreRefusedBeforeClaudeIsCalled(t *testing.T) {
	h := setupHandoff(t)
	for _, bad := range []string{"0", "-3", "abc"} {
		r := h.run(t, "", "--timeout-sec", bad)
		if r.code != 1 || !strings.Contains(r.stderr, "交出失败：超时和等待时间要是正数") {
			t.Errorf("%s: %+v", bad, r)
		}
	}
	if len(h.calls(t)) != 0 {
		t.Fatal("claude was called")
	}
}

// ---- against the old script, where both can run: the same fake, the same arguments ----

func TestAHandOverIsWhatTheOldScriptDid(t *testing.T) {
	node, script := oldScript(t, "desktop-handoff.mjs")
	h := setupHandoff(t)
	t.Setenv("FAKE_MODE", "")
	oldDir, newDir := filepath.Join(h.root, "old-records"), filepath.Join(h.root, "new-records")
	common := []string{"--claude", h.fake, "--worktree", h.worktree, "--idle-ms", "300", "--issue", "9", "--repo", "demo", "--period", "day"}
	old := runOld(t, node, script, map[string]string{"HOME": h.home, "FAKE_LOG": h.log, "FAKE_PID_FILE": h.pidFile}, append(common, "--dir", oldDir)...)
	now := dyna(map[string]string{"HOME": h.home}, append(append([]string{"runtime", "handoff"}, common...), "--dir", newDir)...)
	if old.code != 0 || now.code != 0 || old.stdout != now.stdout {
		t.Fatalf("old %+v, new %+v", old, now)
	}
	strip := func(text string) string { // the time of the record is the only difference
		var list []map[string]any
		if err := json.Unmarshal([]byte(text), &list); err != nil {
			t.Fatal(err)
		}
		for _, e := range list {
			delete(e, "openedAt")
		}
		b, _ := json.Marshal(list)
		return string(b)
	}
	oldFile, newFile := readFile(t, filepath.Join(oldDir, "demo.json")), readFile(t, filepath.Join(newDir, "demo.json"))
	if strip(oldFile) != strip(newFile) {
		t.Errorf("records differ:\n%s\n%s", oldFile, newFile)
	}
	if len(oldFile) != len(newFile) {
		t.Errorf("same layout: %q vs %q", oldFile, newFile)
	}
}
