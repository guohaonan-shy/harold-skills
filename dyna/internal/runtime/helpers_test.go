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

type outcome struct {
	stdout, stderr string
	code           int
}

func (o outcome) all() string { return o.stdout + o.stderr }

// noCwd is a working directory that does not exist, so the repository the tests run in (and a .idea-loop/ in its
// main checkout) cannot be the project place of a test that has no project.
const noCwd = "/nonexistent-dyna-test-cwd"

// dyna runs one command line in memory, in no project. env is all dyna itself reads.
func dyna(env map[string]string, args ...string) outcome { return dynaIn(noCwd, env, args...) }

// dynaIn is dyna run in the directory cwd.
func dynaIn(cwd string, env map[string]string, args ...string) outcome {
	var out, errb bytes.Buffer
	code := app.Run(args, app.IO{Stdin: strings.NewReader(""), Stdout: &out, Stderr: &errb, Env: func(k string) string { return env[k] }, Cwd: cwd})
	return outcome{out.String(), errb.String(), code}
}

func repoPath(parts ...string) string {
	p, _ := filepath.Abs(filepath.Join(append([]string{"..", "..", ".."}, parts...)...))
	return p
}

// pluginRoot is the real plugin directory: the capability list and the template under it are what these tests are
// about.
func pluginRoot() string { return repoPath("idea-loop") }

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

// git runs git in dir with an identity, so a test can make a repository and a worktree of it.
func git(t *testing.T, dir string, args ...string) string {
	t.Helper()
	cmd := exec.Command("git", append([]string{"-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false"}, args...)...)
	cmd.Dir = dir
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git %v: %v\n%s", args, err, out)
	}
	return strings.TrimSpace(string(out))
}

// newRepo is a git repository with one commit; its path is the one git itself reports (no symlinks).
func newRepo(t *testing.T) string {
	t.Helper()
	dir, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	git(t, dir, "init", "-q")
	git(t, dir, "commit", "-q", "--allow-empty", "-m", "first")
	return dir
}
