package retro_test

import (
	"bytes"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/app"
)

type outcome struct {
	stdout, stderr string
	code           int
}

func (o outcome) all() string { return o.stdout + o.stderr }

// dyna runs one command line in memory with the given environment.
func dyna(env map[string]string, args ...string) outcome {
	var out, errb bytes.Buffer
	code := app.Run(args, app.IO{Stdin: strings.NewReader(""), Stdout: &out, Stderr: &errb, Env: func(k string) string { return env[k] }})
	return outcome{out.String(), errb.String(), code}
}

func repoPath(parts ...string) string {
	p, _ := filepath.Abs(filepath.Join(append([]string{"..", "..", ".."}, parts...)...))
	return p
}

func pluginRoot() string { return repoPath("idea-loop") }

// oldScript is the old Node script for the module's commands; without node (or once the script is gone) the test
// that asks for it is skipped. The old scripts stay in the repository until the last ticket removes them.
func oldScript(t *testing.T, name string) (node, script string) {
	t.Helper()
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node is not installed")
	}
	script = repoPath("idea-loop", "scripts", name)
	if _, err := os.Stat(script); err != nil {
		t.Skip("the old script is gone")
	}
	return node, script
}

// runOld runs node with the script and the arguments, with HOME and the session id as given.
func runOld(t *testing.T, node string, env map[string]string, args ...string) outcome {
	t.Helper()
	cmd := exec.Command(node, args...)
	cmd.Env = []string{"PATH=" + os.Getenv("PATH")}
	for k, v := range env {
		cmd.Env = append(cmd.Env, k+"="+v)
	}
	var out, errb bytes.Buffer
	cmd.Stdout, cmd.Stderr = &out, &errb
	code := 0
	if err := cmd.Run(); err != nil {
		ee, ok := err.(*exec.ExitError)
		if !ok {
			t.Fatal(err)
		}
		code = ee.ExitCode()
	}
	return outcome{out.String(), errb.String(), code}
}

func writeFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

func jsonOf(t *testing.T, s string, into any) {
	t.Helper()
	if err := json.Unmarshal([]byte(s), into); err != nil {
		t.Fatalf("%v: %s", err, s)
	}
}
