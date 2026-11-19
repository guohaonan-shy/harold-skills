package home_test

import (
	"bytes"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/app"
)

// Shared by the tests of the home module. They run the whole program (app.Run) in memory against a fake home, a
// fake code repository with an `origin`, and real git, the way the old scripts' tests ran the scripts.

const (
	remote  = "https://github.com/acme/example-app"
	mapText = "# example-app 项目地图\n\n知识库在 docs/，过去的决定先查 docs/spec/。\n"
	docsRel = "projects/example-app/docs"
)

func gitIn(t *testing.T, dir string, args ...string) string {
	t.Helper()
	cmd := exec.Command("git", append([]string{"-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false"}, args...)...)
	cmd.Dir = dir
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git %v: %v\n%s", args, err, out)
	}
	return strings.TrimSpace(string(out))
}

func write(t *testing.T, dir, rel, text string) {
	t.Helper()
	p := filepath.Join(dir, rel)
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(p, []byte(text), 0o644); err != nil {
		t.Fatal(err)
	}
}

func readFile(t *testing.T, p string) string {
	t.Helper()
	b, err := os.ReadFile(p)
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

func realDir(t *testing.T) string {
	t.Helper()
	d, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	return d
}

// repo makes a repository with one commit and the given origin (none when empty).
func repo(t *testing.T, dir, origin string) string {
	t.Helper()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	gitIn(t, dir, "init", "-q", "-b", "main")
	if origin != "" {
		gitIn(t, dir, "remote", "add", "origin", origin)
	}
	write(t, dir, "README.md", "x\n")
	gitIn(t, dir, "add", "README.md")
	gitIn(t, dir, "commit", "-q", "-m", "init")
	return dir
}

func listLine(name, remote string) string {
	return name + "（一个例子）: ~/projects/" + name + ". Clone from " + remote + " if missing.\n"
}

type world struct {
	root, home, code string
}

type opts struct {
	noMap  bool
	origin string // the code repository's origin; default the ssh form of the registered remote
	agents string // home's AGENTS.md; default registers example-app and other-app
	mapMD  string
}

// newWorld: a home (a git repository, as a real one is) that registers example-app and has its map, and a code
// repository whose origin is the SSH form of the registered remote.
func newWorld(t *testing.T, o opts) world {
	t.Helper()
	root := realDir(t)
	home := repo(t, filepath.Join(root, "home"), "")
	agents := o.agents
	if agents == "" {
		agents = "# 设备\n\n## 设备地图\n\n看地图。\n\n## 项目\n\n" + listLine("example-app", remote) + listLine("other-app", "https://github.com/acme/other-app")
	}
	write(t, home, "AGENTS.md", agents)
	if !o.noMap {
		m := o.mapMD
		if m == "" {
			m = mapText
		}
		write(t, home, "projects/example-app/AGENTS.md", m)
	}
	origin := o.origin
	if origin == "" {
		origin = "git@github.com:acme/example-app.git"
	}
	code := repo(t, filepath.Join(root, "code", "example-app"), origin)
	return world{root, home, code}
}

// moved: a world whose project directory in home has a docs/, and a home with a committer identity.
func moved(t *testing.T, o opts) world {
	t.Helper()
	w := newWorld(t, o)
	write(t, w.home, docsRel+"/index.md", "# docs\n")
	gitIn(t, w.home, "config", "user.name", "t")
	gitIn(t, w.home, "config", "user.email", "t@example.com")
	gitIn(t, w.home, "config", "commit.gpgsign", "false")
	gitIn(t, w.home, "add", "-A")
	gitIn(t, w.home, "commit", "-q", "-m", "project")
	return w
}

type result struct {
	out, err string
	code     int
}

// run runs `dyna <args>` in cwd with exactly this environment: the fake home and a HOME beside the world, never
// the machine's own.
func (w world) run(cwd string, args ...string) result {
	return w.runWith(cwd, "", nil, args...)
}

func (w world) runWith(cwd, stdin string, extra map[string]string, args ...string) result {
	vars := map[string]string{"IDEA_LOOP_HOME": w.home, "HOME": w.root}
	for k, v := range extra {
		vars[k] = v
	}
	var out, errb bytes.Buffer
	code := app.Run(args, app.IO{
		Stdin: strings.NewReader(stdin), Stdout: &out, Stderr: &errb, Cwd: cwd,
		Env: func(k string) string { return vars[k] },
		Now: func() time.Time { return time.Date(2026, 11, 19, 10, 20, 30, 0, time.UTC) },
	})
	return result{out.String(), errb.String(), code}
}

func (r result) ok(t *testing.T) result {
	t.Helper()
	if r.code != 0 {
		t.Fatalf("exit %d\nstdout: %s\nstderr: %s", r.code, r.out, r.err)
	}
	return r
}

func subjects(t *testing.T, dir string, rev ...string) []string {
	return strings.Split(gitIn(t, dir, append([]string{"log", "--format=%s"}, rev...)...), "\n")
}

func filesOf(t *testing.T, dir, rev string) []string {
	var out []string
	for _, f := range strings.Split(gitIn(t, dir, "show", "--name-only", "--format=", rev), "\n") {
		if f != "" {
			out = append(out, f)
		}
	}
	return out
}
