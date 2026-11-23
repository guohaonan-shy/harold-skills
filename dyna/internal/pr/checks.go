package pr

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/spf13/cobra"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/githubapp"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/nexterr"
)

// Exit code of `pr checks` when the wait ran out, the code timeout(1) uses (as `agent claude run` does).
const exitTimeout = 124

const (
	defaultChecksTimeout = 30 * time.Minute
	noChecksGrace        = 60 * time.Second
	defaultChecksPoll    = 15 * time.Second
)

func (d Deps) now() time.Time {
	if d.Now != nil {
		return d.Now()
	}
	return time.Now()
}

func (d Deps) sleep(t time.Duration) {
	if d.Sleep != nil {
		d.Sleep(t)
		return
	}
	time.Sleep(t)
}

// check is one entry of `gh pr checks --json`; bucket is gh's own sorting of the state: pass, fail, pending,
// skipping or cancel.
type check struct {
	Name   string `json:"name"`
	Bucket string `json:"bucket"`
	Link   string `json:"link"`
}

// Verdict is how the wait ended.
type Verdict string

const (
	Green   Verdict = "green"
	Red     Verdict = "red"
	None    Verdict = "none"
	Timeout Verdict = "timeout"
)

// judge reads the checks of a PR's head after elapsed time since the wait began. It answers done=false while the
// wait should go on. A failed or cancelled check ends it at once, whatever else is still running; no check at
// all ends it as none only once the grace period has passed (a check that is about to register looks the same).
// listed is what a verdict names: the failed checks for red, the still-running ones while waiting.
func judge(checks []check, elapsed time.Duration) (v Verdict, listed []check, done bool) {
	var failed, pending []check
	for _, c := range checks {
		switch c.Bucket {
		case "fail", "cancel":
			failed = append(failed, c)
		case "pass", "skipping":
		default:
			pending = append(pending, c)
		}
	}
	switch {
	case len(failed) > 0:
		return Red, failed, true
	case len(checks) == 0:
		return None, nil, elapsed >= noChecksGrace
	case len(pending) > 0:
		return Timeout, pending, false
	}
	return Green, nil, true
}

// readChecks asks gh for the checks of the PR's current head. gh exits 8 while some are pending and 1 when there
// is none, so the exit code is not read: the list on stdout is, and the one sentence gh uses for "none" is an
// empty list. Any other failure is an error.
func (d Deps) readChecks(repo, pr string) ([]check, error) {
	out, err := d.gh()([]string{"pr", "checks", pr, "--repo", repo, "--json", "name,bucket,state,link"}, "", nil)
	var list []check
	if jerr := json.Unmarshal([]byte(strings.TrimSpace(out)), &list); jerr == nil {
		return list, nil
	}
	var ge *githubapp.GHError
	if errors.As(err, &ge) && strings.Contains(ge.Stderr, "no checks reported") {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return nil, fmt.Errorf("gh pr checks 的回答读不懂：%q", out)
}

const checksUse = "checks <owner/repo> <pr> [--timeout <时长>]"

func (d Deps) checksCommand() *cobra.Command {
	c := leaf(checksUse, "等 PR 当前 head 的检查跑完，第一行打印结论：green（全过，skipped 算过，退出 0）、red（第一个失败或取消就返回，列出名字和链接，退出 1）、none（开始 60 秒内一个检查都没有，退出 0）、timeout（默认 30 分钟，退出 124）",
		"dyna pr view <owner/repo> <pr>",
		func(cmd *cobra.Command, args []string) error {
			repo, pr, err := repoAndPR(checksUse, args)
			if err != nil {
				return err
			}
			if len(args) != 2 {
				return usage(checksUse)
			}
			timeout, _ := cmd.Flags().GetDuration("timeout")
			poll, _ := cmd.Flags().GetDuration("interval")
			return d.waitForChecks(repo, pr, timeout, poll)
		})
	c.Flags().Duration("timeout", defaultChecksTimeout, "等多久（如 30m、90s）；到时还有检查没跑完就是 timeout")
	c.Flags().Duration("interval", defaultChecksPoll, "隔多久问一次")
	return c
}

func (d Deps) waitForChecks(repo, pr string, timeout, poll time.Duration) error {
	if timeout <= 0 || poll <= 0 {
		return usage(checksUse + "（--timeout 和 --interval 要大于 0）")
	}
	start := d.now()
	for {
		checks, err := d.readChecks(repo, pr)
		if err != nil {
			return err
		}
		elapsed := d.now().Sub(start)
		v, listed, done := judge(checks, elapsed)
		if done {
			d.printVerdict(v, listed)
			if v == Red {
				return &nexterr.Exit{Code: 1}
			}
			return nil
		}
		if elapsed >= timeout {
			d.printVerdict(Timeout, listed)
			return &nexterr.Exit{Code: exitTimeout}
		}
		d.sleep(min(poll, timeout-elapsed))
	}
}

// printVerdict writes the verdict on the first line, then one line per check it names.
func (d Deps) printVerdict(v Verdict, listed []check) {
	lines := []string{string(v)}
	for _, c := range listed {
		line := "- " + c.Name
		if c.Link != "" {
			line += " " + c.Link
		}
		lines = append(lines, line)
	}
	d.println(lines...)
}
