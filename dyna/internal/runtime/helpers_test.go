package runtime_test

import (
	"bytes"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/app"
)

// envMagiSession is the marker variable of the environment the plugin ships with a marker; the tests name it
// because it is the plugin's data, not dyna's code.
const envMagiSession = "MAGI_SESSION_ID"

// shipped are the environments the plugin ships a description for.
var shipped = []string{"claude-desktop", "magi"}

type outcome struct {
	stdout, stderr string
	code           int
}

func (o outcome) all() string { return o.stdout + o.stderr }

// dyna runs one command line in memory. The child processes a command starts (claude) get the real
// process environment, which tests set with t.Setenv; env is only what dyna itself reads.
func dyna(env map[string]string, args ...string) outcome {
	var out, errb bytes.Buffer
	code := app.Run(args, app.IO{Stdin: strings.NewReader(""), Stdout: &out, Stderr: &errb, Env: func(k string) string { return env[k] }})
	return outcome{out.String(), errb.String(), code}
}

func repoPath(parts ...string) string {
	p, _ := filepath.Abs(filepath.Join(append([]string{"..", "..", ".."}, parts...)...))
	return p
}

// pluginRoot is the real plugin directory: the data under it is what these tests are about.
func pluginRoot() string { return repoPath("idea-loop") }

// oldScript is the old Node script; without node (or once the script is gone) the test that asks for it is
// skipped. The old scripts stay in the repository until the last ticket removes them.
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

// runOld runs the old script with exactly the given environment (plus PATH), so the machine running the test
// cannot leak into it.
func runOld(t *testing.T, node, script string, env map[string]string, args ...string) outcome {
	t.Helper()
	cmd := exec.Command(node, append([]string{script}, args...)...)
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

func readFile(t *testing.T, path string) string {
	t.Helper()
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

// withoutSection is text with the `## <title>` section (and its subsections) taken out.
func withoutSection(text, title string) string {
	var out []string
	skip := false
	for _, line := range strings.Split(text, "\n") {
		if strings.HasPrefix(line, "## ") {
			skip = strings.TrimSpace(line[3:]) == title
		}
		if !skip {
			out = append(out, line)
		}
	}
	return strings.Join(out, "\n")
}

func skillBody(t *testing.T, rel string) string {
	t.Helper()
	text := readFile(t, filepath.Join(pluginRoot(), rel))
	if strings.HasPrefix(text, "---\n") {
		if end := strings.Index(text[4:], "\n---\n"); end >= 0 {
			text = text[4+end+5:]
		}
	}
	return strings.TrimSpace(text)
}
