//go:build unix

package agent_test

import (
	"bytes"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"testing"
	"time"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/app"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/home"
)

// A fake codex: logs what it was started with, then behaves as FAKE_MODE says. It is a shell script on PATH, the
// way the real one is found, so nothing here calls a model.
const fakeCodex = `#!/bin/sh
[ "$FAKE_MODE" = warm ] && exit 0
printf '%s\n' "$@" > "$FAKE_DIR/args.txt"
cat > "$FAKE_DIR/stdin.txt"
out=""; prev=""
for a in "$@"; do
  if [ "$prev" = "-o" ]; then out="$a"; fi
  prev="$a"
done
case "$FAKE_MODE" in
  hang)
    sleep 300 &
    echo $! > "$FAKE_DIR/helper.pid"
    echo $$ > "$FAKE_DIR/leader.pid"
    echo "partial progress"
    echo "partial answer" > "$out"
    sleep 300
    ;;
  fail) echo "boom: no auth" >&2; exit 2 ;;
  silent) echo "progress only"; exit 0 ;;
  image)
    printf '\211PNG\r\n\032\nrest-of-image' > "$FAKE_IMAGE_OUT"
    echo "saved"
    ;;
  badimage)
    echo "not a png" > "$FAKE_IMAGE_OUT"
    ;;
  noimage) echo "I could not" ;;
  *)
    echo "progress line"
    echo "FINAL ANSWER" > "$out"
    echo "FINAL ANSWER"
    ;;
esac
`

// A fake claude: prints a stream-json session as FAKE_MODE says.
const fakeClaude = `#!/bin/sh
[ "$FAKE_MODE" = warm ] && exit 0
printf '%s\n' "$@" > "$FAKE_DIR/args.txt"
cat > /dev/null
case "$FAKE_MODE" in
  agent)
    sleep 300 &
    echo $! > "$FAKE_DIR/helper.pid"
    echo '{"type":"assistant","parent_tool_use_id":null,"message":{"content":[{"type":"tool_use","id":"t1","name":"Agent","input":{}}]}}'
    sleep 300
    ;;
  hang)
    sleep 300 &
    echo $! > "$FAKE_DIR/helper.pid"
    echo '{"type":"assistant","parent_tool_use_id":null,"message":{"content":[{"type":"tool_use","id":"t1","name":"Read","input":{}}]}}'
    sleep 300
    ;;
  fail) echo "no such plugin" >&2; exit 3 ;;
  noresult) echo '{"type":"assistant","parent_tool_use_id":null,"message":{"content":[{"type":"tool_use","id":"t1","name":"Read","input":{}}]}}' ;;
  *)
    echo '{"type":"assistant","parent_tool_use_id":null,"message":{"content":[{"type":"tool_use","id":"t1","name":"Agent","input":{}}]}}'
    echo '{"type":"assistant","parent_tool_use_id":"t1","message":{"content":[{"type":"tool_use","id":"t2","name":"mcp__refero__refero_search_screens","input":{}}]}}'
    echo '{"type":"assistant","parent_tool_use_id":null,"message":{"content":[{"type":"tool_use","id":"t3","name":"Write","input":{}}]}}'
    echo 'not json, a cut-off line'
    printf '%s' '{"type":"result","result":"all done","total_cost_usd":0.25,"num_turns":2,"duration_ms":5,"modelUsage":{"fake":{}}}'
    echo "a warning" >&2
    ;;
esac
`

type env struct {
	dir string // where the fakes write what they saw
	bin string // the PATH directory holding the fakes
}

var (
	fakeOnce sync.Once
	fakeBin  string
)

// fakes writes the fake codex and claude once for the whole test binary. The first start of a new script can take
// seconds on a Mac (the system scans it), which would eat a 2-second timeout before the fake had done anything, so
// each is started once, doing nothing, before any test uses it.
func fakes(t *testing.T) string {
	t.Helper()
	fakeOnce.Do(func() {
		dir, err := os.MkdirTemp("", "dyna-agent-fakes-")
		if err != nil {
			t.Fatal(err)
		}
		fakeBin = dir
		for name, text := range map[string]string{"codex": fakeCodex, "claude": fakeClaude} {
			path := filepath.Join(dir, name)
			if err := os.WriteFile(path, []byte(text), 0o755); err != nil {
				t.Fatal(err)
			}
			warm := exec.Command(path)
			warm.Env = append(os.Environ(), "FAKE_MODE=warm")
			if err := warm.Run(); err != nil {
				t.Fatal(err)
			}
		}
	})
	return fakeBin
}

func TestMain(m *testing.M) {
	code := m.Run()
	if fakeBin != "" {
		os.RemoveAll(fakeBin)
	}
	os.Exit(code)
}

// setup puts fake codex and claude on PATH and returns where they log.
func setup(t *testing.T) env {
	t.Helper()
	bin, dir := fakes(t), t.TempDir()
	t.Setenv("PATH", bin+string(os.PathListSeparator)+os.Getenv("PATH"))
	t.Setenv("FAKE_DIR", dir)
	t.Setenv("FAKE_MODE", "")
	root, _ := filepath.Abs(filepath.Join("..", "..", "..", "idea-loop"))
	t.Setenv("IDEA_LOOP_PLUGIN_ROOT", root)
	return env{dir: dir, bin: bin}
}

func run(args ...string) (code int, stdout, stderr string) {
	var out, errb bytes.Buffer
	code = app.Run(args, app.IO{Stdout: &out, Stderr: &errb, Env: home.OSEnv})
	return code, out.String(), errb.String()
}

func (e env) read(name string) string {
	b, _ := os.ReadFile(filepath.Join(e.dir, name))
	return string(b)
}

func (e env) pid(t *testing.T, name string) int {
	t.Helper()
	n, err := strconv.Atoi(strings.TrimSpace(e.read(name)))
	if err != nil {
		t.Fatalf("no pid in %s", name)
	}
	return n
}

// gone is whether the process no longer exists (an unreaped zombie is given a moment to go).
func gone(pid int) bool {
	for i := 0; i < 60; i++ {
		if syscall.Kill(pid, 0) != nil {
			return true
		}
		time.Sleep(50 * time.Millisecond)
	}
	return false
}

func writeFile(t *testing.T, path, text string) string {
	t.Helper()
	if err := os.WriteFile(path, []byte(text), 0o644); err != nil {
		t.Fatal(err)
	}
	return path
}

// ---- codex run ----

func TestCodexRunPrintsAndSavesTheFinalMessageAndStartsCodexReadOnly(t *testing.T) {
	e := setup(t)
	prompt := writeFile(t, filepath.Join(t.TempDir(), "p.md"), "你是审查者。\n")
	out := filepath.Join(t.TempDir(), "spec.md")
	cwd := t.TempDir()
	code, stdout, stderr := run("agent", "codex", "run", "--prompt-file", prompt, "--cwd", cwd, "--model", "gpt-x", "--effort", "high", "--out", out)
	if code != 0 {
		t.Fatalf("exit %d: %s", code, stderr)
	}
	if strings.TrimSpace(stdout) != "FINAL ANSWER" {
		t.Errorf("stdout = %q", stdout)
	}
	if b, _ := os.ReadFile(out); strings.TrimSpace(string(b)) != "FINAL ANSWER" {
		t.Errorf("the final message file = %q", b)
	}
	if b, _ := os.ReadFile(out + ".log"); !strings.Contains(string(b), "progress line") {
		t.Errorf("the log = %q", b)
	}
	args := strings.Split(strings.TrimSpace(e.read("args.txt")), "\n")
	cwdReal, _ := filepath.EvalSymlinks(cwd)
	want := []string{"exec", "--sandbox", "read-only", "--skip-git-repo-check", "--color", "never", "-C", cwd, "-m", "gpt-x", "-c", `model_reasoning_effort="high"`, "-o", out, "你是审查者。"}
	if len(args) < len(want)-1 {
		t.Fatalf("args = %q", args)
	}
	for i, w := range want[:len(want)-1] {
		if args[i] != w && !(w == cwd && args[i] == cwdReal) {
			t.Errorf("arg %d = %q, want %q", i, args[i], w)
		}
	}
	if args[len(want)-1] != "你是审查者。" {
		t.Errorf("the prompt arg = %q", args[len(want)-1])
	}
	if e.read("stdin.txt") != "" {
		t.Errorf("stdin was not empty: %q", e.read("stdin.txt"))
	}
}

func TestCodexRunWithATwoSecondTimeoutEndsFakeCodexAndItsSleepingChild(t *testing.T) {
	e := setup(t)
	t.Setenv("FAKE_MODE", "hang")
	prompt := writeFile(t, filepath.Join(t.TempDir(), "p.md"), "go")
	out := filepath.Join(t.TempDir(), "r.md")
	start := time.Now()
	code, _, stderr := run("agent", "codex", "run", "--prompt-file", prompt, "--timeout", "2s", "--out", out)
	if code != 124 {
		t.Fatalf("exit %d, want 124: %s", code, stderr)
	}
	if took := time.Since(start); took > 15*time.Second {
		t.Errorf("took %s", took)
	}
	if !strings.Contains(stderr, "超时") || !strings.Contains(stderr, out+".log") {
		t.Errorf("the message does not say it timed out and where the partial output is: %s", stderr)
	}
	if b, _ := os.ReadFile(out + ".log"); !strings.Contains(string(b), "partial progress") {
		t.Errorf("the partial output was not kept: %q", b)
	}
	if !gone(e.pid(t, "leader.pid")) {
		t.Error("fake codex is still running")
	}
	if !gone(e.pid(t, "helper.pid")) {
		t.Error("fake codex's sleeping child is still running")
	}
}

func TestCodexRunFailureEndsWithCodexsOwnExitCodeAndSaysTheLogTail(t *testing.T) {
	setup(t)
	t.Setenv("FAKE_MODE", "fail")
	code, _, stderr := run("agent", "codex", "run", "--prompt", "go", "--out", filepath.Join(t.TempDir(), "r.md"))
	if code != 2 || !strings.Contains(stderr, "退出码 2") || !strings.Contains(stderr, "boom: no auth") {
		t.Errorf("exit %d: %s", code, stderr)
	}
}

func TestCodexRunThatExitsZeroWithoutAFinalMessageIsNotADone(t *testing.T) {
	setup(t)
	t.Setenv("FAKE_MODE", "silent")
	code, stdout, stderr := run("agent", "codex", "run", "--prompt", "go", "--out", filepath.Join(t.TempDir(), "r.md"))
	if code != 1 || stdout != "" || !strings.Contains(stderr, "没有写出最终消息") {
		t.Errorf("exit %d, stdout %q: %s", code, stdout, stderr)
	}
}

func TestCodexRunWithNoCodexOnPathSaysSoAndWhatToRunNext(t *testing.T) {
	t.Setenv("PATH", t.TempDir())
	code, _, stderr := run("agent", "codex", "run", "--prompt", "go")
	if code != 1 || !strings.Contains(stderr, "没找到 codex") || !strings.Contains(stderr, "下一条：") {
		t.Errorf("exit %d: %s", code, stderr)
	}
}

func TestCodexRunRefusesWhatItCannotRun(t *testing.T) {
	setup(t)
	for name, args := range map[string][]string{
		"no prompt":    {"agent", "codex", "run"},
		"both prompts": {"agent", "codex", "run", "--prompt", "a", "--prompt-file", "b"},
		"bad sandbox":  {"agent", "codex", "run", "--prompt", "a", "--sandbox", "danger-full-access"},
		"bad timeout":  {"agent", "codex", "run", "--prompt", "a", "--timeout", "soon"},
		"bad effort":   {"agent", "codex", "run", "--prompt", "a", "--effort", `x"y`},
		"no such file": {"agent", "codex", "run", "--prompt-file", "/no/such/prompt.md"},
	} {
		if code, _, stderr := run(args...); code != 1 || stderr == "" {
			t.Errorf("%s: exit %d, stderr %q", name, code, stderr)
		}
	}
}

func TestCodexRunHandsALongPromptOverOnStandardInput(t *testing.T) {
	e := setup(t)
	long := strings.Repeat("长", 40_000) // 120 000 bytes: more than an argument can safely hold
	prompt := writeFile(t, filepath.Join(t.TempDir(), "p.md"), long)
	code, _, stderr := run("agent", "codex", "run", "--prompt-file", prompt, "--out", filepath.Join(t.TempDir(), "r.md"))
	if code != 0 {
		t.Fatalf("exit %d: %s", code, stderr)
	}
	args := strings.Split(strings.TrimSpace(e.read("args.txt")), "\n")
	if args[len(args)-1] != "-" {
		t.Errorf("the last arg = %.20q, want -", args[len(args)-1])
	}
	if e.read("stdin.txt") != long {
		t.Errorf("stdin has %d bytes, want %d", len(e.read("stdin.txt")), len(long))
	}
}

func TestCodexRunKeepsAPromptThatStartsWithADashFromBeingTakenForAFlag(t *testing.T) {
	e := setup(t)
	code, _, stderr := run("agent", "codex", "run", "--prompt", "-- 看这个", "--out", filepath.Join(t.TempDir(), "r.md"))
	if code != 0 {
		t.Fatalf("exit %d: %s", code, stderr)
	}
	args := strings.Split(strings.TrimSpace(e.read("args.txt")), "\n")
	if len(args) < 2 || args[len(args)-2] != "--" || args[len(args)-1] != "-- 看这个" {
		t.Errorf("args = %q", args)
	}
}

// ---- codex image ----

func TestCodexImageRunsInAWritableSandboxAndReturnsTheImagePath(t *testing.T) {
	e := setup(t)
	t.Setenv("FAKE_MODE", "image")
	dir := t.TempDir()
	out := filepath.Join(dir, "assets", "hero.png")
	t.Setenv("FAKE_IMAGE_OUT", out)
	code, stdout, stderr := run("agent", "codex", "image", "--prompt", "一只猫坐在窗台上", "--out", out)
	if code != 0 {
		t.Fatalf("exit %d: %s", code, stderr)
	}
	if strings.TrimSpace(stdout) != out {
		t.Errorf("stdout = %q, want the image path", stdout)
	}
	args := e.read("args.txt")
	for _, want := range []string{"workspace-write", "-C", filepath.Dir(out), "一只猫坐在窗台上", out} {
		if !strings.Contains(args, want) {
			t.Errorf("args lack %q:\n%s", want, args)
		}
	}
}

func TestCodexImageSaysSoWhenNoImageCameOut(t *testing.T) {
	setup(t)
	out := filepath.Join(t.TempDir(), "x.png")
	t.Setenv("FAKE_IMAGE_OUT", out)
	for mode, want := range map[string]string{"noimage": "没有出图", "badimage": "不是 PNG"} {
		t.Setenv("FAKE_MODE", mode)
		code, _, stderr := run("agent", "codex", "image", "--prompt", "x", "--out", out)
		if code != 1 || !strings.Contains(stderr, want) {
			t.Errorf("%s: exit %d: %s", mode, code, stderr)
		}
	}
}

func TestCodexImageNeedsWhereToPutTheImageAndEndsATimedOutRun(t *testing.T) {
	e := setup(t)
	if code, _, stderr := run("agent", "codex", "image", "--prompt", "x"); code != 1 || !strings.Contains(stderr, "--out") {
		t.Errorf("no --out: exit %d: %s", code, stderr)
	}
	t.Setenv("FAKE_MODE", "hang")
	t.Setenv("FAKE_IMAGE_OUT", "/dev/null")
	code, _, stderr := run("agent", "codex", "image", "--prompt", "x", "--out", filepath.Join(t.TempDir(), "x.png"), "--timeout", "1s")
	if code != 124 || !strings.Contains(stderr, "超时") {
		t.Errorf("exit %d: %s", code, stderr)
	}
	if !gone(e.pid(t, "helper.pid")) {
		t.Error("the sleeping child is still running")
	}
}

// ---- codex prompt ----

func TestCodexPromptFillsTheTemplateFromThePluginAndPrintsThePath(t *testing.T) {
	setup(t)
	out := filepath.Join(t.TempDir(), "spec-prompt.md")
	code, stdout, stderr := run("agent", "codex", "prompt", "spec", out,
		"worktree=/w", "base=abc123", "spec=docs/spec/a/a.md", "tickets=docs/spec/a/tickets/", "wontfix=无")
	if code != 0 || strings.TrimSpace(stdout) != out {
		t.Fatalf("exit %d, stdout %q: %s", code, stdout, stderr)
	}
	b, _ := os.ReadFile(out)
	if !strings.Contains(string(b), "git diff abc123...HEAD") || strings.Contains(string(b), "{{") {
		t.Errorf("the prompt is not filled: %s", b)
	}
	root := os.Getenv("IDEA_LOOP_PLUGIN_ROOT")
	if !strings.Contains(string(b), filepath.Join(root, "skills/engineering/pr-review/references/review-standards.md")) {
		t.Error("the review-standards path was not filled from the plugin directory")
	}
}

func TestCodexPromptRefusesWithExitOneAndSaysWhy(t *testing.T) {
	setup(t)
	out := filepath.Join(t.TempDir(), "p.md")
	code, _, stderr := run("agent", "codex", "prompt", "spec", out, "worktree=/w")
	if code != 1 || !strings.Contains(stderr, "拒绝：没给：") {
		t.Errorf("exit %d: %s", code, stderr)
	}
	if _, err := os.Stat(out); err == nil {
		t.Error("a refused prompt was still written")
	}
	if code, _, stderr := run("agent", "codex", "prompt", "spec", out, "oops"); code != 1 || !strings.Contains(stderr, "不是 key=value") {
		t.Errorf("exit %d: %s", code, stderr)
	}
	if code, _, stderr := run("agent", "codex", "prompt", "spec"); code != 1 || !strings.Contains(stderr, "用法") {
		t.Errorf("exit %d: %s", code, stderr)
	}
}

func TestCodexPromptWithNoPluginDirectoryTellsHowToRunIt(t *testing.T) {
	setup(t)
	t.Setenv("IDEA_LOOP_PLUGIN_ROOT", "")
	code, _, stderr := run("agent", "codex", "prompt", "spec", filepath.Join(t.TempDir(), "p.md"))
	if code != 1 || !strings.Contains(stderr, "IDEA_LOOP_PLUGIN_ROOT") || !strings.Contains(stderr, "下一条：") {
		t.Errorf("exit %d: %s", code, stderr)
	}
}

// ---- claude run ----

type summary struct {
	ExitCode   int  `json:"exitCode"`
	TimedOut   bool `json:"timedOut"`
	Escalation *struct {
		Kind string `json:"kind"`
		Tool string `json:"tool"`
	} `json:"escalation"`
	Stderr string `json:"stderr"`
	Stream string `json:"stream"`
	Digest struct {
		Session   struct{ Tools map[string]int }
		Subagents struct {
			Tools       map[string]int
			ReferoCalls int
		}
		Result *struct {
			Text   string
			Cost   *float64
			Turns  *float64
			Models []string
		}
	} `json:"digest"`
}

func TestClaudeRunDigestsTheStreamAsItGoesAndKeepsTheRawStream(t *testing.T) {
	e := setup(t)
	cwd := t.TempDir()
	stream := filepath.Join(t.TempDir(), "s", "run.stream.jsonl")
	code, stdout, stderr := run("agent", "claude", "run", "--prompt", "做这件事", "--cwd", cwd, "--plugin-dir", "/p/one", "--plugin-dir", "/p/two",
		"--skip-permissions", "--model", "opus", "--stream", stream, "--json")
	if code != 0 {
		t.Fatalf("exit %d: %s", code, stderr)
	}
	var s summary
	if err := json.Unmarshal([]byte(stdout), &s); err != nil {
		t.Fatalf("not JSON: %v\n%s", err, stdout)
	}
	if s.ExitCode != 0 || s.TimedOut || s.Escalation != nil || s.Stream != stream || s.Stderr != "a warning" {
		t.Errorf("summary = %+v", s)
	}
	if s.Digest.Session.Tools["Agent"] != 1 || s.Digest.Session.Tools["Write"] != 1 || s.Digest.Subagents.ReferoCalls != 1 {
		t.Errorf("digest = %+v", s.Digest)
	}
	if r := s.Digest.Result; r == nil || r.Text != "all done" || r.Cost == nil || *r.Cost != 0.25 || len(r.Models) != 1 || r.Models[0] != "fake" {
		t.Errorf("result = %+v", s.Digest.Result)
	}
	raw, _ := os.ReadFile(stream)
	if !strings.Contains(string(raw), "not json, a cut-off line") || !strings.HasSuffix(string(raw), `"modelUsage":{"fake":{}}}`) {
		t.Errorf("the raw stream was not kept as it came: %q", raw)
	}
	want := []string{"-p", "做这件事", "--plugin-dir", "/p/one", "--plugin-dir", "/p/two", "--dangerously-skip-permissions", "--output-format", "stream-json", "--verbose", "--model", "opus"}
	if got := strings.Split(strings.TrimSpace(e.read("args.txt")), "\n"); strings.Join(got, "|") != strings.Join(want, "|") {
		t.Errorf("claude was started with %q, want %q", got, want)
	}
}

func TestClaudeRunWithoutJSONPrintsWhatTheSessionSaidLast(t *testing.T) {
	setup(t)
	code, stdout, stderr := run("agent", "claude", "run", "--prompt", "x")
	if code != 0 || strings.TrimSpace(stdout) != "all done" {
		t.Errorf("exit %d, stdout %q: %s", code, stdout, stderr)
	}
}

func TestClaudeRunStopsASessionThatStartsAnAgentWhenAskedTo(t *testing.T) {
	e := setup(t)
	t.Setenv("FAKE_MODE", "agent")
	stream := filepath.Join(t.TempDir(), "s.jsonl")
	start := time.Now()
	code, stdout, _ := run("agent", "claude", "run", "--prompt", "x", "--stream", stream, "--stop-on-escalation", "--json")
	if code != 3 {
		t.Fatalf("exit %d, want 3", code)
	}
	if time.Since(start) > 15*time.Second {
		t.Errorf("took %s", time.Since(start))
	}
	var s summary
	if err := json.Unmarshal([]byte(stdout), &s); err != nil {
		t.Fatalf("not JSON: %v\n%s", err, stdout)
	}
	if s.Escalation == nil || s.Escalation.Kind != "agent" || s.Escalation.Tool != "Agent" {
		t.Errorf("escalation = %+v", s.Escalation)
	}
	if !gone(e.pid(t, "helper.pid")) {
		t.Error("the session's helper is still running")
	}
	if raw, _ := os.ReadFile(stream); !strings.Contains(string(raw), `"name":"Agent"`) {
		t.Errorf("the stream up to the stop was not kept: %q", raw)
	}
}

func TestClaudeRunTimeoutEndsTheSessionAndItsChildAndKeepsWhatWasWritten(t *testing.T) {
	e := setup(t)
	t.Setenv("FAKE_MODE", "hang")
	stream := filepath.Join(t.TempDir(), "s.jsonl")
	code, stdout, stderr := run("agent", "claude", "run", "--prompt", "x", "--stream", stream, "--timeout", "1s", "--json")
	if code != 124 || !strings.Contains(stderr, "超时") || !strings.Contains(stderr, stream) {
		t.Errorf("exit %d: %s", code, stderr)
	}
	var s summary
	if err := json.Unmarshal([]byte(stdout), &s); err != nil {
		t.Fatalf("not JSON: %v\n%s", err, stdout)
	}
	if !s.TimedOut || s.Digest.Result != nil || s.Digest.Session.Tools["Read"] != 1 {
		t.Errorf("summary = %+v", s)
	}
	if !gone(e.pid(t, "helper.pid")) {
		t.Error("the session's child is still running")
	}
}

func TestClaudeRunFailureAndAMissingResultAreNotADone(t *testing.T) {
	setup(t)
	t.Setenv("FAKE_MODE", "fail")
	code, stdout, stderr := run("agent", "claude", "run", "--prompt", "x", "--json")
	if code != 1 || !strings.Contains(stderr, "退出码 3") || !strings.Contains(stderr, "no such plugin") {
		t.Errorf("exit %d: %s", code, stderr)
	}
	var s summary
	if err := json.Unmarshal([]byte(stdout), &s); err != nil || s.ExitCode != 3 || s.Stderr != "no such plugin" {
		t.Errorf("summary %+v, %v", s, err)
	}
	t.Setenv("FAKE_MODE", "noresult")
	if code, _, stderr := run("agent", "claude", "run", "--prompt", "x"); code != 1 || !strings.Contains(stderr, "没有 result") {
		t.Errorf("exit %d: %s", code, stderr)
	}
}

func TestClaudeRunBinReplacesTheClaudeCommand(t *testing.T) {
	e := setup(t)
	other := filepath.Join(t.TempDir(), "my-claude")
	writeFile(t, other, "#!/bin/sh\nprintf '%s\\n' \"$@\" > \"$FAKE_DIR/other.txt\"\necho '{\"type\":\"result\",\"result\":\"from the other\"}'\n")
	if err := os.Chmod(other, 0o755); err != nil {
		t.Fatal(err)
	}
	code, stdout, stderr := run("agent", "claude", "run", "--prompt", "x", "--bin", other)
	if code != 0 || strings.TrimSpace(stdout) != "from the other" {
		t.Errorf("exit %d, stdout %q: %s", code, stdout, stderr)
	}
	if e.read("other.txt") == "" {
		t.Error("the other command was not the one started")
	}
}

// ---- the registry ----

func TestEveryAgentCommandIsInTheRegistryForSessions(t *testing.T) {
	code, stdout, stderr := run("registry", "--json")
	if code != 0 {
		t.Fatalf("exit %d: %s", code, stderr)
	}
	var reg struct {
		Commands []struct {
			Command string `json:"command"`
			Caller  string `json:"caller"`
		} `json:"commands"`
	}
	if err := json.Unmarshal([]byte(stdout), &reg); err != nil {
		t.Fatal(err)
	}
	got := map[string]string{}
	for _, c := range reg.Commands {
		if strings.HasPrefix(c.Command, "agent ") {
			got[c.Command] = c.Caller
		}
	}
	want := map[string]string{"agent codex prompt": "session", "agent codex run": "session", "agent codex image": "session", "agent claude run": "session"}
	if len(got) != len(want) {
		t.Fatalf("agent commands = %v, want %v", got, want)
	}
	for k, v := range want {
		if got[k] != v {
			t.Errorf("%s: caller %q, want %q", k, got[k], v)
		}
	}
}
