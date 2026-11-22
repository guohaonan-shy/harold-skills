package runtime

// The magi half of `runtime handoff`: the same command opens an issue session in magi as it does in Claude
// Desktop. Desktop needs two steps (see handoff.go); magi starts a session directly with `magi sessions start`,
// which takes the worktree as its directory, a slug, the capabilities the session may use, and the task as its
// last argument. A successful start is recorded in the dispatch records the same way a desktop hand-over is, with
// magi's session id in the `desktopSessionId` field.

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"regexp"
	"strings"
	"sync/atomic"
	"syscall"
	"time"
)

// magiIDPattern is what a session id printed by `magi sessions start` may look like.
var magiIDPattern = regexp.MustCompile(`^[\w.:-]+$`)

// startMagiSession runs `magi sessions start` and returns the session id from its `<slug> <id>` line; the
// error's text is the reason.
func startMagiSession(magi, cwd, slug string, caps []string, prompt string, timeoutSec float64) (string, error) {
	args := []string{"sessions", "start", "--cwd", cwd, "--slug", slug}
	for _, c := range caps {
		args = append(args, "--cap", c)
	}
	args = append(args, prompt)
	cmd := exec.Command(magi, args...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout, cmd.Stderr = &stdout, &stderr
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	cmd.WaitDelay = 3 * time.Second
	if err := cmd.Start(); err != nil {
		if errors.Is(err, exec.ErrNotFound) {
			return "", fmt.Errorf("找不到 %s（magi 的命令行）", magi)
		}
		return "", fmt.Errorf("magi sessions start 没跑成：%v", err)
	}
	var timedOut atomic.Bool
	timer := time.AfterFunc(time.Duration(timeoutSec*float64(time.Second)), func() {
		timedOut.Store(true)
		killGroup(cmd.Process.Pid)
	})
	err := cmd.Wait()
	timer.Stop()
	if timedOut.Load() {
		return "", fmt.Errorf("magi sessions start 没跑成：超过 %s 秒", seconds(timeoutSec))
	}
	status := 0
	var exit *exec.ExitError
	if errors.As(err, &exit) {
		status = exit.ExitCode()
	} else if err != nil && !errors.Is(err, exec.ErrWaitDelay) {
		return "", fmt.Errorf("magi sessions start 没跑成：%v", err)
	}
	if status != 0 {
		said := strings.TrimSpace(stderr.String())
		if said == "" {
			said = strings.TrimSpace(stdout.String())
		}
		return "", fmt.Errorf("magi sessions start 退出码 %d：%s", status, headChars(said, 300))
	}
	for _, line := range strings.Split(stdout.String(), "\n") {
		if f := strings.Fields(line); len(f) >= 2 {
			if !magiIDPattern.MatchString(f[1]) {
				return "", fmt.Errorf("magi sessions start 打印的会话 id 样子不对：%s", headChars(strings.TrimSpace(line), 300))
			}
			return f[1], nil
		}
	}
	return "", fmt.Errorf("magi sessions start 的输出里认不出「<slug> <id>」：%s", headChars(strings.TrimSpace(stdout.String()), 300))
}

// handoffMagi is `runtime handoff` in a magi session: it needs the worktree, the issue, the repo, the period and
// the prompt file (the directory, the slug, the record and the session's task are made from them), starts the
// session, and records it.
func handoffMagi(o HandoffOptions, env func(string) string, now func() time.Time, stdout, stderr io.Writer) int {
	fail := func(reason string) int {
		fmt.Fprintf(stderr, "交出失败：%s\n", reason)
		return 1
	}
	var missing []string
	for _, k := range []struct{ flag, value string }{
		{"worktree", o.Worktree}, {"issue", o.Issue}, {"repo", o.Repo}, {"period", o.Period}, {"prompt-file", o.PromptFile},
	} {
		if !o.Given[k.flag] || strings.TrimSpace(k.value) == "" {
			missing = append(missing, "--"+k.flag)
		}
	}
	if len(missing) > 0 {
		return fail("magi 下缺 " + strings.Join(missing, "、") + "（目录、slug、调度记录和会话的任务都从它们来）")
	}
	if !regexp.MustCompile(`^\d+$`).MatchString(o.Issue) {
		return fail("--issue 要是 issue 号")
	}
	prompt, err := os.ReadFile(o.PromptFile)
	if err != nil {
		return fail(fmt.Sprintf("读不了 --prompt-file：%v", err))
	}
	if strings.TrimSpace(string(prompt)) == "" {
		return fail("--prompt-file 是空的：" + o.PromptFile)
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
	timeout := parseSeconds(pick(o.PTimeout, o.Given["p-timeout-sec"], "DESKTOP_HANDOFF_P_TIMEOUT_SEC", "180"))
	if !(timeout > 0) || timeout > 1e9 {
		return fail("超时和等待时间要是正数")
	}
	magi := pick(o.Magi, o.Given["magi"], "IDEA_LOOP_HANDOFF_MAGI", "magi")
	id, err := startMagiSession(magi, o.Worktree, o.Repo+"-"+o.Issue, o.Caps, string(prompt), timeout)
	if err != nil {
		return fail(err.Error())
	}
	return finishHandoff(o, env, now, id, id, stdout, stderr)
}
