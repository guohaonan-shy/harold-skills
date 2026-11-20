package designmd

import (
	"bytes"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/design/jsx"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/home"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/nexterr"
)

const (
	errorReport = `{"findings":[` +
		`{"severity":"error","path":"components.button","message":"Reference {colors.nope} does not resolve to any defined token.","rule":"broken-ref"},` +
		`{"severity":"warning","message":"Section order","rule":"section-order"}],` +
		`"summary":{"errors":1,"warnings":1,"infos":0}}`
	warningOnly = `{"findings":[{"severity":"warning","message":"Section order","rule":"section-order"}],"summary":{"errors":0,"warnings":1}}`
)

// fake is a stand-in for the official CLI that answers every call with one report; no test touches the network.
func fake(stdout string) (CLI, *[][]string) {
	var calls [][]string
	return func(args ...string) Result {
		calls = append(calls, args)
		return Result{Stdout: stdout}
	}, &calls
}

func exec1(d Deps, stdin string, args ...string) (out, errs string, code int) {
	c := Command(d)
	var o, e bytes.Buffer
	c.SetArgs(args)
	c.SetIn(strings.NewReader(stdin))
	c.SetOut(&o)
	c.SetErr(&e)
	if err := c.Execute(); err != nil {
		var ex *nexterr.Exit
		if errors.As(err, &ex) {
			if ex.Msg != "" {
				e.WriteString(ex.Msg + "\n")
			}
			return o.String(), e.String(), ex.Code
		}
		return o.String(), e.String() + err.Error() + "\n", 1
	}
	return o.String(), e.String(), 0
}

func designMd(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	p := filepath.Join(dir, "DESIGN.md")
	if err := os.WriteFile(p, []byte("---\nname: Demo\n---\n\n## Overview\nCalm.\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	return p
}

func ev(path string) string { return `{"tool_input":{"file_path":"` + path + `"}}` }

func TestOnlyAFileNamedExactlyDESIGNmdCounts(t *testing.T) {
	for p, want := range map[string]bool{
		"/repo/DESIGN.md": true, "/repo/apps/web/DESIGN.md": true,
		"/repo/docs/design/x/x-design.md": false, "/repo/design.md": false, "": false,
	} {
		if IsDesignMd(p) != want {
			t.Errorf("%q", p)
		}
	}
}

func TestRendersErrorsOnlyAndNothingWhenThereAreNone(t *testing.T) {
	report, _ := jsx.ParseJSON([]byte(errorReport))
	msg := RenderErrors(report, "DESIGN.md")
	for _, want := range []string{"1 error(s)", "[broken-ref] components.button:"} {
		if !strings.Contains(msg, want) {
			t.Errorf("no %q in %s", want, msg)
		}
	}
	if strings.Contains(msg, "section-order") {
		t.Fatal("a warning is not an error")
	}
	none, _ := jsx.ParseJSON([]byte(warningOnly))
	if RenderErrors(none, "DESIGN.md") != "" {
		t.Fatal("warnings alone are silent")
	}
}

func TestAWriteToAnotherFileIsSilent(t *testing.T) {
	cli, calls := fake(errorReport)
	_, errs, code := exec1(Deps{CLI: cli}, ev(filepath.Join(t.TempDir(), "README.md")), "lint", "--hook")
	if code != 0 || errs != "" || len(*calls) != 0 {
		t.Fatal(code, errs, *calls)
	}
}

func TestLintErrorsOnDESIGNmdBlockWithExit2(t *testing.T) {
	cli, calls := fake(errorReport)
	p := designMd(t)
	_, errs, code := exec1(Deps{CLI: cli}, ev(p), "lint", "--hook")
	if code != 2 || !strings.Contains(errs, "broken-ref") || len(*calls) != 1 || (*calls)[0][0] != "lint" || (*calls)[0][1] != p {
		t.Fatal(code, errs, *calls)
	}
}

func TestWarningsAloneDoNotBlock(t *testing.T) {
	cli, _ := fake(warningOnly)
	_, errs, code := exec1(Deps{CLI: cli}, ev(designMd(t)), "lint", "--hook")
	if code != 0 || errs != "" {
		t.Fatal(code, errs)
	}
}

func TestAnUnreachableCLIIsReportedButNeverBlocks(t *testing.T) {
	cli, _ := fake("")
	_, errs, code := exec1(Deps{CLI: cli}, ev(designMd(t)), "lint", "--hook")
	if code != 0 || !strings.Contains(errs, "could not run") || !strings.Contains(errs, "skipped") {
		t.Fatal(code, errs)
	}
	down := func(args ...string) Result { return Result{Err: "exec: \"npx\": executable file not found in $PATH"} }
	_, errs, code = exec1(Deps{CLI: down}, ev(designMd(t)), "lint", "--hook")
	if code != 0 || !strings.Contains(errs, "executable file not found") {
		t.Fatal(code, errs)
	}
}

func TestAFileThatIsGoneOrAPayloadThatIsNotJSONIsSilent(t *testing.T) {
	cli, calls := fake(errorReport)
	for _, in := range []string{ev(filepath.Join(t.TempDir(), "DESIGN.md")), "not json", "", "{}"} {
		if _, errs, code := exec1(Deps{CLI: cli}, in, "lint", "--hook"); code != 0 || errs != "" {
			t.Errorf("%q: %d %q", in, code, errs)
		}
	}
	if len(*calls) != 0 {
		t.Fatal("the CLI should not have been asked")
	}
}

func TestLintWithoutHookRunsTheOfficialToolAndPassesItsReportThrough(t *testing.T) {
	cli, calls := fake(errorReport)
	p := designMd(t)
	out, _, code := exec1(Deps{CLI: cli}, "", "lint", p)
	if code != 1 || out != errorReport || (*calls)[0][1] != p {
		t.Fatal(code, out)
	}
	cli, _ = fake(warningOnly)
	if out, _, code := exec1(Deps{CLI: cli}, "", "lint", p); code != 0 || out != warningOnly {
		t.Fatal(code, out)
	}
	if _, errs, code := exec1(Deps{CLI: cli}, "", "lint"); code != 1 || !strings.Contains(errs, "用法") {
		t.Fatal(code, errs)
	}
	down := func(args ...string) Result { return Result{Err: "timed out after 2m0s"} }
	if _, errs, code := exec1(Deps{CLI: down}, "", "lint", p); code != 1 || !strings.Contains(errs, "timed out") {
		t.Fatal(code, errs)
	}
}

func TestDiffPassesTheTwoFilesToTheOfficialToolAndItsAnswerThrough(t *testing.T) {
	var got []string
	cli := func(args ...string) Result {
		got = args
		return Result{Stdout: `{"regression":true}`, Code: 1}
	}
	out, _, code := exec1(Deps{CLI: cli}, "", "diff", "/tmp/design-md/before.md", "DESIGN.md")
	if code != 1 || out != `{"regression":true}` || strings.Join(got, " ") != "diff /tmp/design-md/before.md DESIGN.md" {
		t.Fatal(code, out, got)
	}
	ok := func(args ...string) Result { return Result{Stdout: `{"regression":false}`} }
	if _, _, code := exec1(Deps{CLI: ok}, "", "diff", "a", "b"); code != 0 {
		t.Fatal(code)
	}
	if _, errs, code := exec1(Deps{CLI: ok}, "", "diff", "a"); code != 1 || !strings.Contains(errs, "用法") {
		t.Fatal(code, errs)
	}
	down := func(args ...string) Result { return Result{Err: "offline"} }
	if _, errs, code := exec1(Deps{CLI: down}, "", "diff", "a", "b"); code != 1 || !strings.Contains(errs, "could not run") {
		t.Fatal(code, errs)
	}
}

// ---- the stand-in CLI the tests of the old hook used: DESIGN_MD_CLI names a script that node runs ----

func TestTheStandInCLIOfTheOldHookStillWorks(t *testing.T) {
	if _, err := exec.LookPath("node"); err != nil {
		t.Skip("node is not on PATH")
	}
	dir := t.TempDir()
	stub := filepath.Join(dir, "fake-cli.mjs")
	if err := os.WriteFile(stub, []byte(`process.stdout.write(process.env.FAKE_REPORT || "");`), 0o644); err != nil {
		t.Fatal(err)
	}
	p := designMd(t)
	for report, want := range map[string]int{errorReport: 2, warningOnly: 0, "": 0} {
		t.Setenv("FAKE_REPORT", report)
		env := func(k string) string {
			if k == EnvCLI {
				return stub
			}
			return ""
		}
		_, _, code := exec1(Deps{Env: home.Env(env)}, ev(p), "lint", "--hook")
		if code != want {
			t.Errorf("report %.30q: exit %d, want %d", report, code, want)
		}
	}
}
