package app

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/design/designmd"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/registry"
)

func TestRegistryHasTheDesignChecksWithTheirCallers(t *testing.T) {
	out, errs, code := run(nil, "registry", "--json")
	if code != 0 {
		t.Fatal(errs)
	}
	var reg registry.Registry
	if err := json.Unmarshal([]byte(out), &reg); err != nil {
		t.Fatal(err)
	}
	have := map[string]registry.Command{}
	for _, c := range reg.Commands {
		have[c.Command] = c
	}
	// the canvas lint is only ever run by a hook; DESIGN.md lint is also run by hand (dreaming reads its rule names)
	want := map[string]string{
		"design lint":         registry.CallerHook,
		"design md lint":      registry.CallerSession,
		"design md diff":      registry.CallerSession,
		"design note submit":  registry.CallerSession,
		"design critic round": registry.CallerSession,
		"design flow compose": registry.CallerSession,
	}
	for name, caller := range want {
		c, ok := have[name]
		if !ok {
			t.Errorf("the registry has no %q", name)
			continue
		}
		if c.Caller != caller {
			t.Errorf("%s: caller %q, want %q", name, c.Caller, caller)
		}
		if c.Summary == "" {
			t.Errorf("%s has no summary", name)
		}
	}
	for _, name := range []string{"design lint", "design md lint"} {
		var hook bool
		for _, a := range have[name].Args {
			hook = hook || (a.Name == "hook" && a.Kind == "flag")
		}
		if !hook {
			t.Errorf("%s has no --hook", name)
		}
	}
	for _, name := range []string{"design note submit", "design critic round", "design flow compose"} {
		if have[name].Next == "" {
			t.Errorf("%s says no next command for a failed call", name)
		}
	}
}

func runWith(io IO, stdin string, args ...string) (stdout, stderr string, code int) {
	var out, errb bytes.Buffer
	io.Stdin, io.Stdout, io.Stderr = strings.NewReader(stdin), &out, &errb
	if io.Env == nil {
		io.Env = envOf(nil)
	}
	code = Run(args, io)
	return out.String(), errb.String(), code
}

// The two PostToolUse hooks, through the whole binary: same event in, the reply the old hooks gave out.
func TestTheDesignHooksAnswerAPostToolUseEvent(t *testing.T) {
	root := t.TempDir()
	canvas := filepath.Join(root, "docs/design/tmp/demo/canvas/demo.html")
	os.MkdirAll(filepath.Dir(canvas), 0o755)
	os.WriteFile(canvas, []byte(`<style>h1{background-clip:text}</style><h1>x</h1>`), 0o644)
	_, errs, code := runWith(IO{}, `{"tool_input":{"file_path":"`+canvas+`"}}`, "design", "lint", "--hook")
	if code != 2 || !strings.Contains(errs, "design-lint on "+canvas) || !strings.Contains(errs, "gradient-text") {
		t.Fatal(code, errs)
	}

	md := filepath.Join(root, "DESIGN.md")
	os.WriteFile(md, []byte("# x\n"), 0o644)
	cli := func(args ...string) designmd.Result {
		return designmd.Result{Stdout: `{"findings":[{"severity":"error","message":"bad","rule":"broken-ref"}]}`}
	}
	_, errs, code = runWith(IO{DesignMD: cli}, `{"tool_input":{"file_path":"`+md+`"}}`, "design", "md", "lint", "--hook")
	if code != 2 || !strings.Contains(errs, "@google/design.md lint found 1 error(s) in "+md) {
		t.Fatal(code, errs)
	}
}

// A hook is never stopped by a version mismatch, and says so on one line (spec: lint hooks do not break the session).
func TestTheDesignHooksStayOutOfTheWayWhenTheVersionIsNotOne(t *testing.T) {
	env := envOf(map[string]string{EnvRange: ">=9.0.0 <10.0.0"})
	for _, args := range [][]string{{"design", "lint", "--hook"}, {"design", "md", "lint", "--hook"}} {
		out, errs, code := runWith(IO{Env: env}, `{"tool_input":{"file_path":"/x/docs/design/tmp/a/canvas/a.html"}}`, args...)
		if code != 0 || out != "" || !strings.Contains(errs, "/idea-loop:setup") {
			t.Errorf("%v: %d %q %q", args, code, out, errs)
		}
	}
}

func TestTheNoteAndCriticCommandsSayWhatIsWrongAndExitTwo(t *testing.T) {
	dir := t.TempDir()
	note := filepath.Join(dir, "direction-note.md")
	os.WriteFile(note, []byte("## 意图\n\n只有一节。\n"), 0o644)
	out, _, code := runWith(IO{}, "", "design", "note", "submit", note)
	if code != 2 || !strings.Contains(out, "收工校验失败") || !strings.Contains(out, "缺「验收矩阵」这一节") {
		t.Fatal(code, out)
	}
	round := filepath.Join(dir, "round.json")
	os.WriteFile(round, []byte(`{"findings":[],"score":11}`), 0o644)
	out, _, code = runWith(IO{}, "", "design", "critic", "round", round)
	if code != 2 || !strings.Contains(out, "本轮无效") || !strings.Contains(out, "score must be an integer 1–10, got 11") {
		t.Fatal(code, out)
	}
}
