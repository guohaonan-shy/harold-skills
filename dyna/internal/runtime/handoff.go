package runtime

// Open an issue session unattended and hand it to Claude Desktop as an ordinary sidebar session.
//
// Why two steps: `claude -p` runs without anyone present but its session is invisible to the desktop app, and
// `/desktop` does not exist in `-p` mode ("/desktop isn't available in this environment"). So this runs
// `claude -p` once to create a session and read its id, then resumes that session in interactive mode (under
// `expect`, which supplies the terminal) and types `/desktop`. The desktop app then shows it as the session
// `local_<same id>`. Nothing else happens here: no task is sent, no title set, no group moved; the caller does
// those with its session-management tools.

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
	"sort"
	"strconv"
	"strings"
	"sync/atomic"
	"syscall"
	"time"
	"unicode"
)

// ReadyPrompt is what the `claude -p` step is asked; its answer does not matter, only that a session exists.
const ReadyPrompt = "只回一个字：就绪"

// successText is what the resumed session prints once the hand-over worked. 2.1.327 prints "Opening in Claude
// Desktop…"; the spec's shorter wording is accepted too.
var successText = regexp.MustCompile(`Opening (?:in )?Claude Desktop`)

const successLabel = "「Opening Claude Desktop」"

// expectScript takes its inputs from the environment (expect -c leaves no room for argv): HANDOFF_CLAUDE,
// HANDOFF_SESSION, HANDOFF_IDLE_MS, HANDOFF_TIMEOUT_SEC. Everything the resumed claude prints goes to stdout. Exit:
// 0 = /desktop was typed and the session either ended or the deadline came (the caller reads the screen to tell
// success from failure), 3 = the session never went quiet before the deadline, 4 = it ended before /desktop could
// be typed.
const expectScript = `
set claude $env(HANDOFF_CLAUDE)
set sid $env(HANDOFF_SESSION)
set idle [expr {$env(HANDOFF_IDLE_MS) / 1000.0}]
set limit $env(HANDOFF_TIMEOUT_SEC)
set deadline [expr {[clock seconds] + $limit}]
set timeout -1
log_user 1
spawn $claude --resume $sid
set pid [exp_pid]
proc leave {code} {
  global pid
  catch {exec kill -9 $pid}
  catch {close}
  catch {wait}
  exit $code
}
# type /desktop only once the resumed session has stopped printing
set quiet 0
while {!$quiet} {
  set left [expr {$deadline - [clock seconds]}]
  if {$left <= 0} { leave 3 }
  set timeout [expr {$idle < $left ? $idle : $left}]
  expect {
    -re {.+} { exp_continue }
    timeout { set quiet 1 }
    eof { leave 4 }
  }
}
send "/desktop"
sleep 0.4
send "\r"
set left [expr {$deadline - [clock seconds]}]
if {$left <= 0} { leave 0 }
set timeout $left
expect {
  -re {.+} { exp_continue -continue_timer }
  timeout { leave 0 }
  eof { leave 0 }
}
leave 0
`

// RenderScreen is what the terminal would show after raw was printed: the resumed claude repaints with cursor
// moves, so "Opening Claude Desktop…" is never one contiguous run in the byte stream (it arrives as "Op" +
// "ning Claude…" over the previous line). Handles carriage return, line feed, cursor up/down/forward/back/column,
// erase line.
func RenderScreen(raw string) string {
	rows := map[int][]rune{}
	r, c := 0, 0
	row := func(n int) []rune {
		if _, ok := rows[n]; !ok {
			rows[n] = []rune{}
		}
		return rows[n]
	}
	chars := []rune(raw)
	for i := 0; i < len(chars); i++ {
		ch := chars[i]
		switch {
		case ch == '\x1b':
			var next rune
			if i+1 < len(chars) {
				next = chars[i+1]
			}
			switch next {
			case '[':
				j := i + 2
				params := ""
				for j < len(chars) && chars[j] >= '0' && chars[j] <= '?' {
					params += string(chars[j])
					j++
				}
				for j < len(chars) && chars[j] >= ' ' && chars[j] <= '/' {
					j++
				}
				var fin rune
				if j < len(chars) {
					fin = chars[j]
				}
				i = j
				if strings.HasPrefix(params, "?") || strings.HasPrefix(params, ">") || strings.HasPrefix(params, "<") {
					continue
				}
				n, hasN := leadingInt(params)
				k := 1
				if hasN && n > 1 {
					k = n
				}
				switch fin {
				case 'A':
					r -= k
				case 'B':
					r += k
				case 'C':
					c += k
				case 'D':
					c = max(0, c-k)
				case 'G':
					c = k - 1
				case 'H':
					r, c = 0, 0
				case 'K':
					if hasN && n == 2 {
						rows[r] = []rune{}
					} else if line := row(r); len(line) > c {
						rows[r] = line[:c]
					}
				}
			case '(', ')':
				i += 2
			default:
				i++
			}
		case ch == '\r':
			c = 0
		case ch == '\n':
			r++
		case ch >= ' ':
			line := row(r)
			for len(line) < c {
				line = append(line, ' ')
			}
			if c < len(line) {
				line[c] = ch
			} else {
				line = append(line, ch)
			}
			rows[r] = line
			c++
		}
	}
	keys := make([]int, 0, len(rows))
	for k := range rows {
		keys = append(keys, k)
	}
	sort.Ints(keys)
	lines := make([]string, 0, len(keys))
	for _, k := range keys {
		lines = append(lines, strings.TrimRightFunc(string(rows[k]), unicode.IsSpace))
	}
	return strings.Join(lines, "\n")
}

// leadingInt is JavaScript's parseInt(s, 10): the digits at the start, if any.
func leadingInt(s string) (int, bool) {
	end := 0
	for end < len(s) && s[end] >= '0' && s[end] <= '9' {
		end++
	}
	if end == 0 {
		return 0, false
	}
	n, err := strconv.Atoi(s[:end])
	return n, err == nil
}

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

// handOff resumes the session interactively and types /desktop; nil when the success text showed up.
func handOff(claude, cwd, sessionID string, idleMs, timeoutSec float64) error {
	cmd := exec.Command("expect", "-c", expectScript)
	cmd.Dir = cwd
	cmd.Env = append(os.Environ(),
		"HANDOFF_CLAUDE="+claude,
		"HANDOFF_SESSION="+sessionID,
		"HANDOFF_IDLE_MS="+seconds(idleMs),
		"HANDOFF_TIMEOUT_SEC="+seconds(timeoutSec),
	)
	var out, errOut bytes.Buffer
	cmd.Stdout, cmd.Stderr = &out, &errOut
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	cmd.WaitDelay = 3 * time.Second
	if err := cmd.Start(); err != nil {
		if errors.Is(err, exec.ErrNotFound) {
			return errors.New("找不到 expect（交互模式要靠它提供终端）")
		}
		return err
	}
	pid := cmd.Process.Pid
	// the backstop: expect has its own deadline, this one only fires if expect itself hangs
	watchdog := time.AfterFunc(time.Duration((timeoutSec+10)*float64(time.Second)), func() { killGroup(pid) })
	err := cmd.Wait()
	watchdog.Stop()
	killGroup(pid) // nothing from that process group outlives us

	code := 0
	var exit *exec.ExitError
	switch {
	case errors.As(err, &exit):
		code = exit.ExitCode() // -1 when it was killed by a signal
	case err != nil && !errors.Is(err, exec.ErrWaitDelay):
		return err
	}
	screen := RenderScreen(out.String())
	var shown []string
	for _, l := range strings.Split(screen, "\n") {
		if l != "" {
			shown = append(shown, l)
		}
	}
	if len(shown) > 6 {
		shown = shown[len(shown)-6:]
	}
	tail := tailChars(strings.Join(shown, " | "), 300)
	switch {
	case code == 3 || code == -1:
		return fmt.Errorf("%s 秒内会话没安静下来，没来得及敲 /desktop（会话 %s）：%s", seconds(timeoutSec), sessionID, tail)
	case code == 4:
		return fmt.Errorf("交互模式的 claude 在能敲 /desktop 之前就退出了：%s", tail)
	case code != 0:
		said := errOut.String()
		if said == "" {
			said = tail
		}
		return fmt.Errorf("expect 退出码 %d：%s", code, headChars(strings.TrimSpace(said), 300))
	}
	if successText.MatchString(screen) {
		return nil
	}
	return fmt.Errorf("敲了 /desktop，%s 秒内（或到它退出为止）没看到%s（会话 %s）：%s", seconds(timeoutSec), successLabel, sessionID, tail)
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
	Worktree, Issue, Repo, Period, Claude, Timeout, PTimeout, Idle, Dir string
	// PromptFile, Magi and Caps are for a magi session; a desktop hand-over does not read them.
	PromptFile, Magi string
	Caps             []string
	Given            map[string]bool
}

const handoffUsage = "usage: dyna runtime handoff [--worktree <dir>] [--issue <n> --repo <name> --period <label>] [--cap <name>]... [--prompt-file <file>] [--claude <bin>] [--magi <bin>] [--timeout-sec N] [--p-timeout-sec N] [--idle-ms N] [--dir <records-dir>]"

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
	if runtimeName == "magi" {
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
	idleMs := number(pick(o.Idle, o.Given["idle-ms"], "", "2500"))
	for _, n := range []float64{timeoutSec, pTimeoutSec, idleMs} {
		if !(n > 0) || n > 1e9 {
			return fail("超时和等待时间要是正数")
		}
	}

	sessionID, err := createSession(claude, cwd, pTimeoutSec)
	if err == nil {
		err = handOff(claude, cwd, sessionID, idleMs, timeoutSec)
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
