package pr_test

import (
	"bytes"
	"strings"
	"testing"
	"time"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/app"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/githubapp"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/pr"
)

// reply is what one `gh pr checks` call gives back: its stdout and, as gh does, a failure when it exits non-zero.
type reply struct {
	out    string
	stderr string
	fail   bool
}

func listing(bucketsByName ...string) reply {
	var parts []string
	for i := 0; i+1 < len(bucketsByName); i += 2 {
		parts = append(parts, `{"name":"`+bucketsByName[i]+`","bucket":"`+bucketsByName[i+1]+`","state":"x","link":"https://ci.example/`+bucketsByName[i]+`"}`)
	}
	r := reply{out: "[" + strings.Join(parts, ",") + "]"}
	for i := 1; i < len(bucketsByName); i += 2 {
		if bucketsByName[i] == "pending" {
			r.fail = true // gh exits 8 while checks are pending, and still prints the list
		}
	}
	return r
}

// nothingYet is how gh answers a PR that has no checks: a sentence on stderr, exit 1, no stdout.
var nothingYet = reply{stderr: "no checks reported on the 'feature' branch", fail: true}

// checkRun runs `dyna pr checks` against a gh that answers from replies in turn (the last one repeats) and a
// clock that moves only when dyna sleeps. It returns stdout, the exit code, how many times gh was asked and how
// long dyna waited in all.
func checkRun(t *testing.T, replies []reply, args ...string) (string, int, int, time.Duration) {
	t.Helper()
	calls := 0
	var waited time.Duration
	start := time.Date(2026, 11, 23, 12, 0, 0, 0, time.UTC)
	gh := func(a []string, stdin string, env []string) (string, error) {
		if a[0] != "pr" || a[1] != "checks" {
			t.Fatalf("only gh pr checks is expected: %v", a)
		}
		r := replies[min(calls, len(replies)-1)]
		calls++
		if r.fail {
			return r.out, &githubapp.GHError{Stderr: r.stderr}
		}
		return r.out, nil
	}
	var out, errb bytes.Buffer
	code := app.Run(append([]string{"pr", "checks", "o/r", "9"}, args...), app.IO{
		Stdin: strings.NewReader(""), Stdout: &out, Stderr: &errb,
		Env: func(string) string { return "" },
		PR: pr.Deps{GH: gh,
			Now:   func() time.Time { return start.Add(waited) },
			Sleep: func(d time.Duration) { waited += d }},
	})
	if code == 1 && out.Len() == 0 {
		t.Logf("stderr: %s", errb.String())
	}
	return out.String(), code, calls, waited
}

func TestChecksEmptyThenPendingThenPassIsGreenAndExitsZero(t *testing.T) {
	out, code, calls, _ := checkRun(t, []reply{nothingYet, listing("lint", "pending", "test", "pass"), listing("lint", "pass", "test", "pass")})
	if code != 0 || strings.TrimSpace(out) != "green" || calls != 3 {
		t.Fatalf("out %q code %d calls %d", out, code, calls)
	}
}

func TestChecksSkippedCountsAsPassing(t *testing.T) {
	out, code, _, _ := checkRun(t, []reply{listing("lint", "pass", "deploy", "skipping")})
	if code != 0 || strings.TrimSpace(out) != "green" {
		t.Fatalf("out %q code %d", out, code)
	}
}

func TestChecksNothingFor60SecondsIsNoneAndExitsZero(t *testing.T) {
	out, code, _, waited := checkRun(t, []reply{nothingYet})
	if code != 0 || strings.TrimSpace(out) != "none" {
		t.Fatalf("out %q code %d", out, code)
	}
	if waited < 60*time.Second || waited > 80*time.Second {
		t.Fatalf("it waited the 60 seconds from the start and no longer: %s", waited)
	}
}

func TestChecksTheFirstFailureIsRedWithItsNameAndLinkWithoutWaitingForTheRest(t *testing.T) {
	out, code, calls, _ := checkRun(t, []reply{listing("lint", "pending"), listing("lint", "pending", "test", "fail", "e2e", "pending")})
	lines := strings.Split(strings.TrimSpace(out), "\n")
	if code != 1 || lines[0] != "red" || calls != 2 {
		t.Fatalf("out %q code %d calls %d", out, code, calls)
	}
	if !strings.Contains(out, "test") || !strings.Contains(out, "https://ci.example/test") || strings.Contains(out, "e2e") {
		t.Fatalf("red lists the failed check, its link, and not the ones still running: %q", out)
	}
}

func TestChecksACancelledCheckIsRedToo(t *testing.T) {
	out, code, _, _ := checkRun(t, []reply{listing("build", "cancel")})
	if code != 1 || !strings.HasPrefix(out, "red\n") || !strings.Contains(out, "build") {
		t.Fatalf("out %q code %d", out, code)
	}
}

func TestChecksHasNoIntervalFlagBecauseHowOftenItAsksIsFixed(t *testing.T) {
	_, code, calls, _ := checkRun(t, []reply{listing("lint", "pass")}, "--interval", "1s")
	if code == 0 || calls != 0 {
		t.Fatalf("--interval is not a parameter: it must be refused before asking gh; code %d calls %d", code, calls)
	}
}

func TestChecksAsksEveryFifteenSecondsWhateverTheTimeout(t *testing.T) {
	_, _, calls, waited := checkRun(t, []reply{listing("lint", "pending")}, "--timeout", "2m")
	if calls != 9 || waited != 2*time.Minute {
		t.Fatalf("2m at one question per 15s is 9 questions (at 0s, 15s ... 120s); got %d over %s", calls, waited)
	}
}

func TestChecksPendingUntilTheTimeoutIsTimeoutAndExits124(t *testing.T) {
	out, code, _, waited := checkRun(t, []reply{listing("lint", "pending")}, "--timeout", "5m")
	lines := strings.Split(strings.TrimSpace(out), "\n")
	if code != 124 || lines[0] != "timeout" {
		t.Fatalf("out %q code %d", out, code)
	}
	if !strings.Contains(out, "lint") {
		t.Fatalf("timeout names what was still running: %q", out)
	}
	if waited < 5*time.Minute || waited > 5*time.Minute+30*time.Second {
		t.Fatalf("waited %s", waited)
	}
}

func TestChecksTheDefaultTimeoutIs30Minutes(t *testing.T) {
	_, code, _, waited := checkRun(t, []reply{listing("lint", "pending")})
	if code != 124 || waited < 30*time.Minute || waited > 31*time.Minute {
		t.Fatalf("code %d waited %s", code, waited)
	}
}

func TestChecksAGhFailureThatIsNotTheNoChecksSentenceIsAnErrorNotAVerdict(t *testing.T) {
	out, code, _, _ := checkRun(t, []reply{{stderr: "HTTP 401: Bad credentials", fail: true}})
	if code != 1 || strings.TrimSpace(out) != "" {
		t.Fatalf("out %q code %d", out, code)
	}
}

func TestChecksNeedsARepoAndANumber(t *testing.T) {
	var out, errb bytes.Buffer
	code := app.Run([]string{"pr", "checks", "o/r"}, app.IO{Stdin: strings.NewReader(""), Stdout: &out, Stderr: &errb, Env: func(string) string { return "" }})
	if code != 1 || !strings.Contains(errb.String(), "usage: dyna pr checks") {
		t.Fatalf("%d %q", code, errb.String())
	}
}
