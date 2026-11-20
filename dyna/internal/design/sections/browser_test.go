package sections

// The browser side of the sections command, run for real: testdata/browser/browser.test.mjs hands the code `measure`,
// `shoot`, `screen`, `cover`, `time`, `step` and `pinned` print to a Playwright page (the code is Playwright code by
// design: the session runs it through the Playwright MCP) and checks what it measured and shot. The code builders,
// the `sections` command and the PNG decoding and comparison all answer from this package and package ui, through the
// helper binary testdata/sectionscli; nothing here reads the old idea-loop scripts.
//
// Every case really opens Chromium and waits in real time — about 6 minutes for the whole file — so `go test ./...`
// does not run it: it runs only with IDEA_LOOP_BROWSER_TESTS=1 set (the same switch the old browser test had, spec
// sections-browser-test-out-of-full-suite), on its own:
//
//	cd dyna && IDEA_LOOP_BROWSER_TESTS=1 go test ./internal/design/sections -run TestBrowserCodeRunsInARealBrowser -timeout 15m
//
// Each case times out after 120 s and the browser start-up after 60 s (in the .mjs), so a stuck browser fails one case
// and the run still ends. With the switch on but no Playwright with a Chromium on the machine, the cases are skipped
// and so is this test.

import (
	"bytes"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"testing"
)

// browserOptIn is the environment variable that turns the browser test on (value 1).
const browserOptIn = "IDEA_LOOP_BROWSER_TESTS"

func TestBrowserCodeRunsInARealBrowser(t *testing.T) {
	if os.Getenv(browserOptIn) != "1" {
		t.Skip("about 6 minutes in a real browser: set " + browserOptIn + "=1 and run it on its own")
	}
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node is not on PATH")
	}
	test, err := filepath.Abs(filepath.Join("testdata", "browser", "browser.test.mjs"))
	if err != nil {
		t.Fatal(err)
	}
	bin := filepath.Join(t.TempDir(), "sectionscli")
	if out, err := exec.Command("go", "build", "-o", bin, "./testdata/sectionscli").CombinedOutput(); err != nil {
		t.Fatalf("building the helper: %v\n%s", err, out)
	}

	cmd := exec.Command(node, "--test", test)
	cmd.Dir = filepath.Join("..", "..", "..", "..") // the repository root: Playwright is looked up from here
	cmd.Env = append(os.Environ(), "SECTIONS_BIN="+bin, browserOptIn+"=1")
	var out bytes.Buffer
	cmd.Stdout, cmd.Stderr = &out, &out
	err = cmd.Run()
	report := out.String()
	counts := map[string]string{}
	for _, k := range []string{"tests", "pass", "fail", "skipped"} {
		if m := regexp.MustCompile(`(?m)^# ` + k + ` (\d+)`).FindStringSubmatch(report); m != nil {
			counts[k] = m[1]
		}
	}
	t.Logf("browser tests: %s run, %s passed, %s failed, %s skipped", counts["tests"], counts["pass"], counts["fail"], counts["skipped"])
	if err != nil {
		t.Fatalf("the browser test failed: %v\n%s", err, tail(report, 6000))
	}
	if counts["tests"] != "" && counts["tests"] == counts["skipped"] {
		t.Skip("no Playwright with a Chromium found on this machine")
	}
}

func tail(s string, n int) string {
	if len(s) > n {
		return "…" + s[len(s)-n:]
	}
	return s
}
