package runtime_test

// `runtime handoff` in a magi session. There is no magi on this machine: the stand-in for it is a shell script that
// logs the arguments it was called with (one per line, in brackets, because the prompt is one argument that may
// span lines) and prints what the test asks for. Nothing here starts a real magi session, and HOME for the records
// points into a temporary directory.

import (
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

// FAKE_MAGI_MODE: ok (prints "<slug> magi-abc123"), reject (a capability the session may not have), no-id (prints
// nothing useful), bad-id, hang.
const fakeMagi = `#!/bin/sh
mode="${FAKE_MAGI_MODE:-ok}"
if [ -n "$FAKE_MAGI_LOG" ]; then
  for a in "$@"; do printf '[%s]\n' "$a" >> "$FAKE_MAGI_LOG"; done
  echo '--' >> "$FAKE_MAGI_LOG"
fi
[ "$1 $2" = "sessions start" ] || { echo "unexpected: $*" >&2; exit 9; }
slug=""
while [ $# -gt 0 ]; do
  [ "$1" = "--slug" ] && slug="$2"
  shift
done
case "$mode" in
  reject) echo "cap 'linear' is not available to this session" >&2; exit 2 ;;
  no-id) echo "started"; exit 0 ;;
  bad-id) echo "$slug not/an/id"; exit 0 ;;
  hang) exec sleep 60 ;;
esac
echo "$slug magi-abc123"
`

type magiEnv struct {
	root, fake, home, worktree, log, prompt, dir string
}

func setupMagi(t *testing.T) magiEnv {
	t.Helper()
	root, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	m := magiEnv{root: root}
	m.fake = filepath.Join(root, "fake-magi")
	writeFile(t, m.fake, fakeMagi)
	if err := os.Chmod(m.fake, 0o755); err != nil {
		t.Fatal(err)
	}
	m.home, m.worktree = filepath.Join(root, "home"), filepath.Join(root, "worktree")
	for _, d := range []string{m.home, m.worktree} {
		if err := os.Mkdir(d, 0o755); err != nil {
			t.Fatal(err)
		}
	}
	m.log, m.dir = filepath.Join(root, "magi-calls.log"), filepath.Join(root, "records")
	m.prompt = filepath.Join(root, "prompt.md")
	writeFile(t, m.prompt, "处理 issue #302。\n夜间模式。")
	t.Setenv("FAKE_MAGI_LOG", m.log)
	t.Setenv("FAKE_MAGI_MODE", "")
	return m
}

// run is `dyna runtime handoff` inside a magi session, with the fake magi; mode and the arguments are as given.
func (m magiEnv) run(t *testing.T, mode string, args ...string) outcome {
	t.Helper()
	t.Setenv("FAKE_MAGI_MODE", mode)
	return dyna(map[string]string{"HOME": m.home, "MAGI_SESSION_ID": "abc"}, append([]string{"runtime", "handoff", "--magi", m.fake}, args...)...)
}

// full is every argument the dispatcher gives, for issue 302 of repo demo.
func (m magiEnv) full(extra ...string) []string {
	return append([]string{"--worktree", m.worktree, "--issue", "302", "--repo", "demo", "--period", "todo",
		"--cap", "magi", "--cap", "linear", "--cap", "browser", "--prompt-file", m.prompt, "--dir", m.dir}, extra...)
}

// magiCalls is what the fake magi was called with, one entry per call, one element per argument.
func (m magiEnv) magiCalls(t *testing.T) [][]string {
	t.Helper()
	b, err := os.ReadFile(m.log)
	if err != nil {
		return nil
	}
	var calls [][]string
	var cur []string
	for _, l := range strings.Split(strings.TrimSuffix(string(b), "\n"), "\n") {
		if l == "--" {
			calls, cur = append(calls, cur), nil
			continue
		}
		cur = append(cur, l)
	}
	return calls
}

func TestInMagiTheHandoffStartsASessionInTheWorktreeWithTheSlugTheCapsAndThePromptFileAsTheLastArgument(t *testing.T) {
	m := setupMagi(t)
	r := m.run(t, "", m.full()...)
	if r.code != 0 {
		t.Fatal(r.all())
	}
	calls := m.magiCalls(t)
	if len(calls) != 1 {
		t.Fatalf("%+v", calls)
	}
	want := []string{"[sessions]", "[start]", "[--cwd]", "[" + m.worktree + "]", "[--slug]", "[demo-302]",
		"[--cap]", "[magi]", "[--cap]", "[linear]", "[--cap]", "[browser]", "[处理 issue #302。", "夜间模式。]"}
	if strings.Join(calls[0], "\n") != strings.Join(want, "\n") {
		t.Fatalf("magi was called with\n%s\nwant\n%s", strings.Join(calls[0], "\n"), strings.Join(want, "\n"))
	}
}

func TestInMagiASuccessPrintsTheSameOneLineOfJSONAsTheDesktopAndAppendsTheDispatchRecord(t *testing.T) {
	m := setupMagi(t)
	if err := os.Mkdir(m.dir, 0o755); err != nil {
		t.Fatal(err)
	}
	writeFile(t, filepath.Join(m.dir, "demo.json"), `[{"issue":1,"desktopSessionId":"local_old","openedAt":"2026-11-17T22:05:00.000Z","period":"todo"}]`)
	r := m.run(t, "", m.full()...)
	if r.code != 0 || r.stderr != "" {
		t.Fatal(r.all())
	}
	// the keys and their order are the desktop hand-over's (handoff_test.go); the id is magi's
	if r.stdout != `{"sessionId":"magi-abc123","desktopSessionId":"magi-abc123","recorded":true}`+"\n" {
		t.Fatalf("%q", r.stdout)
	}
	list := readRecords(t, filepath.Join(m.dir, "demo.json"))
	if len(list) != 2 || list[0]["desktopSessionId"] != "local_old" {
		t.Fatalf("the old entry is kept and one is added: %+v", list)
	}
	if list[1]["issue"] != float64(302) || list[1]["desktopSessionId"] != "magi-abc123" || list[1]["period"] != "todo" {
		t.Errorf("%+v", list[1])
	}
	if at, ok := list[1]["openedAt"].(string); !ok || !regexpISO(at) {
		t.Errorf("openedAt is an ISO time: %v", list[1]["openedAt"])
	}
	text := readFile(t, filepath.Join(m.dir, "demo.json"))
	if !strings.Contains(text, "\"issue\": 302,\n    \"desktopSessionId\": \"magi-abc123\",\n    \"openedAt\": \"") || !strings.HasSuffix(text, "}\n]\n") {
		t.Errorf("the desktop's file layout: %q", text)
	}
}

func TestTheRuntimeIsTheOneDynaRuntimeNameSaysMagiSessionVariableOrForcedName(t *testing.T) {
	m := setupMagi(t)
	t.Setenv("FAKE_MAGI_MODE", "")
	forced := dyna(map[string]string{"HOME": m.home, "IDEA_LOOP_RUNTIME": "magi"}, append([]string{"runtime", "handoff", "--magi", m.fake}, m.full()...)...)
	if forced.code != 0 || !strings.Contains(forced.stdout, "magi-abc123") {
		t.Fatalf("forced by IDEA_LOOP_RUNTIME: %+v", forced)
	}
	bogus := dyna(map[string]string{"HOME": m.home, "IDEA_LOOP_RUNTIME": "nope"}, append([]string{"runtime", "handoff", "--magi", m.fake}, m.full()...)...)
	if bogus.code != 1 || !strings.HasPrefix(bogus.stderr, "交出失败：") || !strings.Contains(bogus.stderr, "IDEA_LOOP_RUNTIME") {
		t.Fatalf("an unknown name is refused: %+v", bogus)
	}
	if n := len(m.magiCalls(t)); n != 1 {
		t.Fatalf("magi was called %d times, want the forced run only", n)
	}
}

func TestTheMagiBinaryCanComeFromTheEnvironmentInsteadOfTheFlag(t *testing.T) {
	m := setupMagi(t)
	r := dyna(map[string]string{"HOME": m.home, "MAGI_SESSION_ID": "abc", "IDEA_LOOP_HANDOFF_MAGI": m.fake}, append([]string{"runtime", "handoff"}, m.full()...)...)
	if r.code != 0 || !strings.Contains(r.stdout, "magi-abc123") {
		t.Fatal(r.all())
	}
}

func TestInMagiAMissingPromptFileStopsBeforeMagiIsCalledAndNamesWhatIsMissing(t *testing.T) {
	m := setupMagi(t)
	r := m.run(t, "", "--worktree", m.worktree, "--issue", "302", "--repo", "demo", "--period", "todo", "--cap", "magi", "--dir", m.dir)
	if r.code != 1 || r.stdout != "" || !strings.HasPrefix(r.stderr, "交出失败：magi 下缺 --prompt-file") {
		t.Fatal(r.all())
	}
	if len(m.magiCalls(t)) != 0 {
		t.Error("magi was called")
	}
	if _, err := os.Stat(filepath.Join(m.dir, "demo.json")); err == nil {
		t.Error("a record was written")
	}
	// the other things the slug, the directory and the record come from are named too, all at once
	r = m.run(t, "", "--prompt-file", m.prompt)
	for _, want := range []string{"交出失败：magi 下缺", "--worktree", "--issue", "--repo", "--period"} {
		if r.code != 1 || !strings.Contains(r.stderr, want) {
			t.Errorf("stderr lacks %q: %+v", want, r)
		}
	}
	if strings.Contains(r.stderr, "--prompt-file") {
		t.Errorf("the flag that was given is not reported missing: %s", r.stderr)
	}
}

func TestInMagiAPromptFileThatCannotBeReadOrIsEmptyFailsBeforeMagiIsCalled(t *testing.T) {
	m := setupMagi(t)
	r := m.run(t, "", m.full("--prompt-file", filepath.Join(m.root, "nowhere.md"))...)
	if r.code != 1 || !strings.HasPrefix(r.stderr, "交出失败：读不了 --prompt-file") {
		t.Fatal(r.all())
	}
	empty := filepath.Join(m.root, "empty.md")
	writeFile(t, empty, "  \n")
	r = m.run(t, "", m.full("--prompt-file", empty)...)
	if r.code != 1 || !strings.HasPrefix(r.stderr, "交出失败：--prompt-file 是空的") {
		t.Fatal(r.all())
	}
	if r = m.run(t, "", m.full("--issue", "abc")...); r.code != 1 || !strings.HasPrefix(r.stderr, "交出失败：") {
		t.Fatal(r.all())
	}
	if len(m.magiCalls(t)) != 0 {
		t.Error("magi was called")
	}
}

func TestInMagiAFailedStartExitsOneSaysWhyAndWritesNoRecord(t *testing.T) {
	m := setupMagi(t)
	r := m.run(t, "reject", m.full()...)
	if r.code != 1 || r.stdout != "" {
		t.Fatal(r.all())
	}
	if !regexp.MustCompile(`^交出失败：magi sessions start 退出码 2：.*cap 'linear' is not available`).MatchString(r.stderr) {
		t.Errorf("the reason is what magi said: %s", r.stderr)
	}
	if _, err := os.Stat(filepath.Join(m.dir, "demo.json")); err == nil {
		t.Error("a record was written for a session that did not start")
	}
	for _, mode := range []string{"no-id", "bad-id"} {
		r := m.run(t, mode, m.full()...)
		if r.code != 1 || !strings.HasPrefix(r.stderr, "交出失败：magi sessions start ") {
			t.Errorf("%s: %+v", mode, r)
		}
	}
	missing := dyna(map[string]string{"HOME": m.home, "MAGI_SESSION_ID": "abc"}, append([]string{"runtime", "handoff", "--magi", filepath.Join(m.root, "no-such-magi")}, m.full()...)...)
	if missing.code != 1 || !strings.HasPrefix(missing.stderr, "交出失败：") {
		t.Errorf("a magi that is not there: %+v", missing)
	}
}

func TestInMagiAStartThatHangsIsCutOffAtItsTimeout(t *testing.T) {
	m := setupMagi(t)
	r := m.run(t, "hang", m.full("--p-timeout-sec", "1")...)
	if r.code != 1 || !strings.HasPrefix(r.stderr, "交出失败：") || !strings.Contains(r.stderr, "超过 1 秒") {
		t.Fatal(r.all())
	}
}

func TestInMagiARecordsFileThatCannotBeReadIsLeftAloneTheSessionStillCountsButSaysSo(t *testing.T) {
	m := setupMagi(t)
	if err := os.Mkdir(m.dir, 0o755); err != nil {
		t.Fatal(err)
	}
	writeFile(t, filepath.Join(m.dir, "demo.json"), "{not json")
	r := m.run(t, "", m.full()...)
	var j struct{ Recorded bool }
	if r.code != 0 || json.Unmarshal([]byte(r.stdout), &j) != nil || j.Recorded || !strings.Contains(r.stderr, "记录没写进去") {
		t.Fatalf("%+v", r)
	}
	if readFile(t, filepath.Join(m.dir, "demo.json")) != "{not json" {
		t.Error("the file was touched")
	}
}

func TestInTheDesktopTheMagiOnlyFlagsAreAcceptedAndIgnored(t *testing.T) {
	h := setupHandoff(t)
	m := setupMagi(t)
	t.Setenv("FAKE_MODE", "")
	r := dyna(map[string]string{"HOME": h.home, "IDEA_LOOP_HANDOFF_MAGI": m.fake}, "runtime", "handoff", "--claude", h.fake, "--worktree", h.worktree,
		"--cap", "magi", "--prompt-file", filepath.Join(h.root, "nowhere.md"), "--issue", "302", "--repo", "demo", "--period", "todo", "--dir", h.dir)
	if r.code != 0 || !strings.Contains(r.stdout, `"desktopSessionId":"local_fake-session-123"`) {
		t.Fatal(r.all())
	}
	if len(h.calls(t)) != 2 {
		t.Errorf("the desktop path ran: %+v", h.calls(t))
	}
	if len(m.magiCalls(t)) != 0 {
		t.Error("magi was called from the desktop")
	}
}
