package runtime_test

// The stand-in for `claude` is a shell script; nothing here starts a real claude or opens a real desktop session,
// and HOME for the records points into a temporary directory, so the real ~/.idea-loop/ is never touched.

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"testing"
	"time"

	rt "github.com/guohaonan-shy/harold-skills/dyna/internal/runtime"
)

// FAKE is a stand-in for `claude`. `-p` prints one JSON object; `--desktop --resume <id>` is what the second step
// runs. FAKE_MODE picks the behaviour; FAKE_LOG gets one line per call (arguments and directory); FAKE_PID_FILE
// gets the pid of the `--desktop` process so a test can check it is gone afterwards.
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
case "$mode" in
  desktop-fail) echo 'Desktop app is not installed' >&2; exit 3 ;;
  desktop-hang) exec sleep 60 ;;
esac
echo 'Opening in Claude Desktop…'
exit 0
`

type handoffEnv struct {
	root, fake, home, worktree, log, pidFile, dir string
}

func setupHandoff(t *testing.T) handoffEnv {
	t.Helper()
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
	return dynaHandoff(map[string]string{"HOME": h.home}, append([]string{"runtime", "handoff", "--claude", h.fake, "--worktree", h.worktree}, args...)...)
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
	if calls[1].args != "--desktop --resume fake-session-123" {
		t.Errorf("resume call: %+v", calls[1])
	}
	for _, c := range calls {
		if c.cwd != h.worktree {
			t.Errorf("ran in %s, want %s", c.cwd, h.worktree)
		}
	}
}

func TestTheClaudePathCanComeFromDESKTOP_HANDOFF_CLAUDEInsteadOfTheFlag(t *testing.T) {
	h := setupHandoff(t)
	r := dynaHandoff(map[string]string{"HOME": h.home, "DESKTOP_HANDOFF_CLAUDE": h.fake}, "runtime", "handoff", "--worktree", h.worktree)
	if r.code != 0 {
		t.Fatal(r.all())
	}
}

func TestClaudeDesktopThatNeverEndsFailsWithinTheTimeoutAndLeavesNoProcess(t *testing.T) {
	h := setupHandoff(t)
	started := time.Now()
	r := h.run(t, "desktop-hang", "--timeout-sec", "2")
	if r.code != 1 || !strings.Contains(r.stderr, "交出失败：claude --desktop 超过 2 秒没结束") || r.stdout != "" {
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

func TestClaudeDesktopExitingNonZeroFailsWithTheExitCodeAndWhatItSaidAndWritesNoRecord(t *testing.T) {
	h := setupHandoff(t)
	r := h.run(t, "desktop-fail", "--issue", "5", "--repo", "demo", "--period", "night", "--dir", h.dir)
	if r.code != 1 || r.stdout != "" {
		t.Fatal(r.all())
	}
	for _, want := range []string{"交出失败：claude --desktop 退出码 3", "fake-session-123", "Desktop app is not installed"} {
		if !strings.Contains(r.stderr, want) {
			t.Errorf("stderr lacks %q: %s", want, r.stderr)
		}
	}
	if len(h.calls(t)) != 2 {
		t.Errorf("both steps ran: %+v", h.calls(t))
	}
	if _, err := os.Stat(filepath.Join(h.dir, "demo.json")); err == nil {
		t.Fatal("a record was written")
	}
}

func TestAClaudeThatCannotBeStartedFailsAtTheFirstStepNamingTheCommand(t *testing.T) {
	h := setupHandoff(t)
	r := dynaHandoff(map[string]string{"HOME": h.home}, "runtime", "handoff", "--claude", filepath.Join(h.root, "no-such-claude"), "--worktree", h.worktree)
	if r.code != 1 || !strings.Contains(r.stderr, "交出失败：claude -p 没跑成") {
		t.Fatal(r.all())
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
	r := dynaHandoff(map[string]string{"HOME": h.home, "IDEA_LOOP_DISPATCH_DIR": elsewhere}, "runtime", "handoff", "--claude", h.fake, "--worktree", h.worktree, "--issue", "6", "--repo", "demo", "--period", "day")
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
