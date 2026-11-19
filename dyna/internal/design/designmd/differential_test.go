package designmd

import (
	"bytes"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/home"
)

// The old hook stays until hooks.json switches to the command; until then this gives both the same event and the same
// stand-in CLI, and holds what they say and how they exit the same.
func TestDifferentialHookSaysWhatTheOldHookSaid(t *testing.T) {
	if _, err := exec.LookPath("node"); err != nil {
		t.Skip("node is not on PATH")
	}
	old, err := filepath.Abs(filepath.Join("..", "..", "..", "..", "idea-loop", "scripts", "design-md-hook.mjs"))
	if err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	stub := filepath.Join(dir, "fake-cli.mjs")
	if err := os.WriteFile(stub, []byte(`process.stdout.write(process.env.FAKE_REPORT || "");`), 0o644); err != nil {
		t.Fatal(err)
	}
	p := designMd(t)
	other := filepath.Join(dir, "README.md")
	os.WriteFile(other, []byte("x"), 0o644)
	reports := []string{
		errorReport, warningOnly, "", "not json", "null", "{}", `{"findings":[]}`,
		`{"findings":[{"severity":"error","message":"no rule or path"}]}`,
		`{"findings":[{"severity":"error","path":"","message":"empty path","rule":"r"},{"severity":"error","path":"a.b","message":"m","rule":7}]}`,
	}
	events := []string{ev(p), ev(other), ev(filepath.Join(dir, "gone", "DESIGN.md")), "not json", "", "{}", `{"tool_input":{"file_path":7}}`}
	env := func(k string) string {
		if k == EnvCLI {
			return stub
		}
		return ""
	}
	for _, report := range reports {
		for _, event := range events {
			cmd := exec.Command("node", old)
			cmd.Stdin = strings.NewReader(event)
			cmd.Env = append(os.Environ(), "DESIGN_MD_CLI="+stub, "FAKE_REPORT="+report)
			var oerr bytes.Buffer
			cmd.Stderr = &oerr
			oldCode := 0
			if err := cmd.Run(); err != nil {
				ee, ok := err.(*exec.ExitError)
				if !ok {
					t.Fatal(err)
				}
				oldCode = ee.ExitCode()
			}
			t.Setenv("FAKE_REPORT", report)
			_, errs, code := exec1(Deps{Env: home.Env(env)}, event, "lint", "--hook")
			if code != oldCode || errs != oerr.String() {
				t.Errorf("report %q event %s\n--- old (exit %d)\n%s\n--- new (exit %d)\n%s", report, event, oldCode, oerr.String(), code, errs)
			}
		}
	}
}
