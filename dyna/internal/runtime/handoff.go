package runtime

// Open an issue session unattended and hand it to Claude Desktop as an ordinary sidebar session.
//
// Why two steps: `claude -p` runs without anyone present but its session is invisible to the desktop app. So this
// runs `claude -p` once to create a session and read its id, then `claude --desktop --resume <id>`, which opens
// that session in the desktop app. The desktop app then shows it as the session `local_<same id>`. Nothing else
// happens here: no task is sent, no title set, no group moved; the caller does those with its session-management
// tools.

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync/atomic"
	"syscall"
	"time"
)

// ReadyPrompt is what the `claude -p` step is asked; its answer does not matter, only that a session exists.
const ReadyPrompt = "只回一个字：就绪"

// tailChars is the last n characters of s.
func tailChars(s string, n int) string {
	r := []rune(s)
	if len(r) > n {
		r = r[len(r)-n:]
	}
	return string(r)
}

func headChars(s string, n int) string {
	r := []rune(s)
	if len(r) > n {
		r = r[:n]
	}
	return string(r)
}

func killGroup(pid int) { _ = syscall.Kill(-pid, syscall.SIGKILL) }

// seconds is a number of seconds the way JavaScript prints it (1, 1.5).
func seconds(v float64) string { return strconv.FormatFloat(v, 'f', -1, 64) }

// createSession runs `claude -p` once and returns the session id; the error's text is the reason.
func createSession(claude, cwd string, timeoutSec float64) (string, error) {
	cmd := exec.Command(claude, "-p", ReadyPrompt, "--output-format", "json")
	cmd.Dir = cwd
	var stdout, stderr bytes.Buffer
	cmd.Stdout, cmd.Stderr = &stdout, &stderr
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	cmd.WaitDelay = 3 * time.Second
	if err := cmd.Start(); err != nil {
		return "", fmt.Errorf("claude -p 没跑成：%v", err)
	}
	var timedOut atomic.Bool
	timer := time.AfterFunc(time.Duration(timeoutSec*float64(time.Second)), func() {
		timedOut.Store(true)
		killGroup(cmd.Process.Pid)
	})
	err := cmd.Wait()
	timer.Stop()
	if timedOut.Load() {
		return "", fmt.Errorf("claude -p 没跑成：超过 %s 秒", seconds(timeoutSec))
	}
	status := 0
	var exit *exec.ExitError
	if errors.As(err, &exit) {
		status = exit.ExitCode()
	} else if err != nil && !errors.Is(err, exec.ErrWaitDelay) {
		return "", fmt.Errorf("claude -p 没跑成：%v", err)
	}
	if status != 0 {
		said := stderr.String()
		if said == "" {
			said = stdout.String()
		}
		return "", fmt.Errorf("claude -p 退出码 %d：%s", status, headChars(strings.TrimSpace(said), 300))
	}
	var parsed map[string]any
	if err := json.Unmarshal(stdout.Bytes(), &parsed); err != nil || parsed == nil {
		return "", fmt.Errorf("claude -p 的输出不是 JSON：%s", headChars(strings.TrimSpace(stdout.String()), 300))
	}
	id, _ := parsed["session_id"].(string)
	if id == "" {
		return "", errors.New("claude -p 的 JSON 里没有 session_id")
	}
	if !regexp.MustCompile(`^[\w-]+$`).MatchString(id) {
		return "", fmt.Errorf("session_id 的样子不对：%s", id)
	}
	return id, nil
}

// handOff runs `claude --desktop --resume <id>` in cwd and judges it by its exit code: nil when it exits 0. A run
// that is still going after timeoutSec is killed together with everything it started.
func handOff(claude, cwd, sessionID string, timeoutSec float64) error {
	cmd := exec.Command(claude, "--desktop", "--resume", sessionID)
	cmd.Dir = cwd
	var out bytes.Buffer
	cmd.Stdout, cmd.Stderr = &out, &out
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	cmd.WaitDelay = 3 * time.Second
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("claude --desktop 没跑成：%v", err)
	}
	pid := cmd.Process.Pid
	var timedOut atomic.Bool
	timer := time.AfterFunc(time.Duration(timeoutSec*float64(time.Second)), func() {
		timedOut.Store(true)
		killGroup(pid)
	})
	err := cmd.Wait()
	timer.Stop()
	killGroup(pid) // nothing from that process group outlives us
	said := tailChars(strings.TrimSpace(out.String()), 300)
	if timedOut.Load() {
		return fmt.Errorf("claude --desktop 超过 %s 秒没结束（会话 %s）：%s", seconds(timeoutSec), sessionID, said)
	}
	var exit *exec.ExitError
	switch {
	case errors.As(err, &exit):
		return fmt.Errorf("claude --desktop 退出码 %d（会话 %s）：%s", exit.ExitCode(), sessionID, said)
	case err != nil && !errors.Is(err, exec.ErrWaitDelay):
		return fmt.Errorf("claude --desktop 没跑成：%v", err)
	}
	return nil
}

var repoName = regexp.MustCompile(`^\w[\w.-]*$`)

// appendRecord appends one entry to <dir>/<repo>.json (an array); an unreadable existing file is left untouched.
func appendRecord(dir, repo string, entry any) error {
	if !repoName.MatchString(repo) {
		return fmt.Errorf("仓库名不能当文件名：%s", repo)
	}
	file := filepath.Join(dir, repo+".json")
	var list []json.RawMessage
	if b, err := os.ReadFile(file); err == nil {
		if err := json.Unmarshal(b, &list); err != nil {
			var anything any
			if json.Unmarshal(b, &anything) == nil {
				return fmt.Errorf("%s 不是一个数组，没动它", file)
			}
			return fmt.Errorf("%s 读不出来，没动它", file)
		}
	} else if !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("%s 读不出来，没动它", file)
	}
	raw, err := json.Marshal(entry)
	if err != nil {
		return err
	}
	list = append(list, raw)
	if err := os.MkdirAll(filepath.Dir(file), 0o755); err != nil {
		return err
	}
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	enc.SetIndent("", "  ")
	if err := enc.Encode(list); err != nil {
		return err
	}
	tmp := fmt.Sprintf("%s.%d.tmp", file, os.Getpid())
	if err := os.WriteFile(tmp, buf.Bytes(), 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, file)
}

// record is one entry in <records-dir>/<repo>.json.
type record struct {
	Issue            int    `json:"issue"`
	DesktopSessionID string `json:"desktopSessionId"`
	OpenedAt         string `json:"openedAt"`
	Period           string `json:"period"`
}

// result is the one JSON line a successful hand-over prints.
type result struct {
	SessionID        string `json:"sessionId"`
	DesktopSessionID string `json:"desktopSessionId"`
	Recorded         bool   `json:"recorded"`
}

// HandoffOptions are the parameters of `runtime handoff`, as the flags gave them (strings: the old script took
// any positive number for the seconds, not only whole ones).
type HandoffOptions struct {
	Worktree, Issue, Repo, Period, Claude, Timeout, PTimeout, Dir string
	// PromptFile, Magi and Caps are for a magi session; a desktop hand-over does not read them.
	PromptFile, Magi string
	Caps             []string
	Given            map[string]bool
}

const handoffUsage = "usage: dyna runtime handoff [--worktree <dir>] [--issue <n> --repo <name> --period <label>] [--cap <name>]... [--prompt-file <file>] [--claude <bin>] [--magi <bin>] [--timeout-sec N] [--p-timeout-sec N] [--dir <records-dir>]"

// parseSeconds is a number from a flag or an environment variable; 0 when it is not one.
func parseSeconds(v string) float64 {
	n, err := strconv.ParseFloat(strings.TrimSpace(v), 64)
	if err != nil {
		return 0
	}
	return n
}

// Handoff opens an issue session in the current runtime and, with --issue, records it; it returns the exit code
// and writes the one JSON line to stdout, the reasons to stderr. In Claude Desktop that is the two steps above; in
// magi it is `magi sessions start` (handoff_magi.go).
func Handoff(o HandoffOptions, env func(string) string, cwdDefault string, now func() time.Time, stdout, stderr io.Writer) int {
	runtimeName, err := Detect(env)
	if err != nil {
		fmt.Fprintf(stderr, "交出失败：%v\n", err)
		return 1
	}
	if runtimeName.Name == "magi" {
		return handoffMagi(o, env, now, stdout, stderr)
	}
	given := 0
	for _, k := range []string{"issue", "repo", "period"} {
		if o.Given[k] {
			given++
		}
	}
	usage := func(msg string) int {
		fmt.Fprintf(stderr, "runtime handoff: %s\n%s\n", msg, handoffUsage)
		return 1
	}
	if given > 0 && given < 3 {
		return usage("--issue、--repo、--period 要么都给，要么都不给")
	}
	if o.Given["issue"] && !regexp.MustCompile(`^\d+$`).MatchString(o.Issue) {
		return usage("--issue 要是 issue 号")
	}
	fail := func(reason string) int {
		fmt.Fprintf(stderr, "交出失败：%s\n", reason)
		return 1
	}

	pick := func(flag string, given bool, envName, fallback string) string {
		switch {
		case given:
			return flag
		case env(envName) != "":
			return env(envName)
		}
		return fallback
	}
	claude := pick(o.Claude, o.Given["claude"], "DESKTOP_HANDOFF_CLAUDE", "claude")
	cwd := o.Worktree
	if !o.Given["worktree"] {
		cwd = cwdDefault
	}
	number := parseSeconds
	timeoutSec := number(pick(o.Timeout, o.Given["timeout-sec"], "DESKTOP_HANDOFF_TIMEOUT_SEC", "90"))
	pTimeoutSec := number(pick(o.PTimeout, o.Given["p-timeout-sec"], "DESKTOP_HANDOFF_P_TIMEOUT_SEC", "180"))
	for _, n := range []float64{timeoutSec, pTimeoutSec} {
		if !(n > 0) || n > 1e9 {
			return fail("超时和等待时间要是正数")
		}
	}

	sessionID, err := createSession(claude, cwd, pTimeoutSec)
	if err == nil {
		err = handOff(claude, cwd, sessionID, timeoutSec)
	}
	if err != nil {
		return fail(err.Error())
	}

	return finishHandoff(o, env, now, sessionID, "local_"+sessionID, stdout, stderr)
}

// finishHandoff records a handed-over session when --issue was given and prints the one JSON line; the ids are the
// ones the runtime's own start step gave (desktop: the claude session and its `local_` twin; magi: magi's id twice).
func finishHandoff(o HandoffOptions, env func(string) string, now func() time.Time, sessionID, desktopSessionID string, stdout, stderr io.Writer) int {
	pick := func(flag string, given bool, envName, fallback string) string {
		switch {
		case given:
			return flag
		case env(envName) != "":
			return env(envName)
		}
		return fallback
	}
	recorded := false
	if o.Given["issue"] {
		dir := pick(o.Dir, o.Given["dir"], "IDEA_LOOP_DISPATCH_DIR", "")
		if dir == "" {
			h := env("HOME")
			if h == "" {
				h, _ = os.UserHomeDir()
			}
			dir = filepath.Join(h, ".idea-loop", "dispatch")
		}
		n, _ := strconv.Atoi(o.Issue)
		err := appendRecord(dir, o.Repo, record{Issue: n, DesktopSessionID: desktopSessionID, OpenedAt: now().UTC().Format("2006-01-02T15:04:05.000Z"), Period: o.Period})
		if err != nil {
			// the session is already in the sidebar; say so loudly rather than hand it over twice on a retry
			fmt.Fprintf(stderr, "runtime handoff: 会话已交出，但记录没写进去：%v\n", err)
		} else {
			recorded = true
		}
	}
	b, _ := json.Marshal(result{SessionID: sessionID, DesktopSessionID: desktopSessionID, Recorded: recorded})
	fmt.Fprintln(stdout, string(b))
	return 0
}
