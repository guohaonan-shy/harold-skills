package runtime_test

// The two runtimes open an issue session with the same command, so the plugin's two data files must say it the
// same way: `dyna runtime show 会话管理` prints the same "open an issue session" bullet and the same command line
// (with how to read its result) for claude-desktop and for magi. What differs by runtime follows that sentence.

import (
	"regexp"
	"strings"
	"testing"

	rt "github.com/guohaonan-shy/harold-skills/dyna/internal/runtime"
)

const openBullet = "- **开一个 issue 会话**："

// showSessions is `dyna runtime show 会话管理` in the named runtime.
func showSessions(t *testing.T, name string) string {
	t.Helper()
	r := dyna(env(rt.EnvRuntime, name), "runtime", "show", "会话管理")
	if r.code != 0 {
		t.Fatalf("%s: %s", name, r.all())
	}
	return r.stdout
}

func lineStarting(text, prefix string) string {
	for _, l := range strings.Split(text, "\n") {
		if strings.HasPrefix(strings.TrimSpace(l), prefix) || strings.HasPrefix(l, prefix) {
			return strings.TrimSpace(l)
		}
	}
	return ""
}

// commandSentence is the part of step 2 of 「怎么交出 issue」 every runtime shares: from the command to the end of
// "how a failure is handled".
func commandSentence(t *testing.T, name, text string) string {
	t.Helper()
	at := strings.Index(text, "- **怎么交出 issue**")
	if at < 0 {
		t.Fatalf("%s: no 「怎么交出 issue」", name)
	}
	rest := text[at:]
	from := strings.Index(rest, "`dyna runtime handoff --worktree")
	if from < 0 {
		t.Fatalf("%s: the hand-off command is not in 「怎么交出 issue」", name)
	}
	to := strings.Index(rest[from:], "不在本轮重试。")
	if to < 0 {
		t.Fatalf("%s: no 「不在本轮重试。」 after the command", name)
	}
	return rest[from : from+to+len("不在本轮重试。")]
}

func TestBothRuntimesOpenAnIssueSessionWithTheSameCommandAndSayItTheSameWay(t *testing.T) {
	desktop, magi := showSessions(t, "claude-desktop"), showSessions(t, "magi")

	a, b := lineStarting(desktop, openBullet), lineStarting(magi, openBullet)
	if a == "" || a != b {
		t.Fatalf("the 「开一个 issue 会话」 step differs:\n  claude-desktop: %s\n  magi:           %s", a, b)
	}
	if !strings.Contains(a, "`dyna runtime handoff …`") {
		t.Errorf("the step names the one command: %s", a)
	}
	if da, ma := commandSentence(t, "claude-desktop", desktop), commandSentence(t, "magi", magi); da != ma {
		t.Fatalf("the command and how to read its result differ:\n  claude-desktop: %s\n  magi:           %s", da, ma)
	}
}

func TestTheSharedCommandSentenceNamesOnlyFlagsTheCommandHasAndTheFailureShapeItPrints(t *testing.T) {
	sentence := commandSentence(t, "magi", showSessions(t, "magi"))
	help := dyna(env(), "runtime", "handoff", "--help")
	if help.code != 0 {
		t.Fatal(help.all())
	}
	flags := regexp.MustCompile(`--[a-z][a-z-]*`).FindAllString(sentence, -1)
	for _, want := range []string{"--worktree", "--issue", "--repo", "--period", "--cap", "--prompt-file"} {
		found := false
		for _, f := range flags {
			found = found || f == want
		}
		if !found {
			t.Errorf("the sentence lacks %s", want)
		}
	}
	for _, f := range flags {
		if !strings.Contains(help.stdout, f) {
			t.Errorf("the sentence names %s, which `runtime handoff --help` does not list", f)
		}
	}
	for _, want := range []string{"交出失败：<原因>", "退出码 1", "下一轮再试", "在沙箱外跑", "`recorded`"} {
		if !strings.Contains(sentence, want) {
			t.Errorf("the sentence lacks %q", want)
		}
	}
}

func TestWhatDiffersByRuntimeStaysAfterTheSharedSentence(t *testing.T) {
	desktop, magi := showSessions(t, "claude-desktop"), showSessions(t, "magi")
	for _, want := range []string{"`claude -p`", "`claude --desktop --resume <id>`", "`start_session`", "归位", "发任务"} {
		if !strings.Contains(desktop, want) {
			t.Errorf("claude-desktop lacks %q", want)
		}
	}
	for _, want := range []string{"magi sessions start --cwd <那个 worktree> --slug <仓库名>-<号> --cap", "`--cap` 的能力名", "magi 的会话 id"} {
		if !strings.Contains(magi, want) {
			t.Errorf("magi lacks %q", want)
		}
	}
	// the old two-runtime wording is gone: magi's step no longer tells the dispatcher to start the session itself
	if strings.Contains(magi, "**开会话**：`magi sessions start") || strings.Contains(magi, "往 `~/.idea-loop/dispatch/<仓库名>.json`（JSON 数组）追加") {
		t.Error("magi still tells the dispatcher to run magi sessions start and write the record by hand")
	}
}
