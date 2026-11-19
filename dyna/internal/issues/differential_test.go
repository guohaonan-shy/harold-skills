package issues_test

import (
	"bytes"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/app"
)

// The old script and dyna answer the same question about the same docs and the same issue: the JSON of `show`
// is byte for byte the same, and a `set` that is refused is refused with the same reason. The old script is
// still in the repository until the last ticket removes it; node is needed to run it, and without node this
// test is skipped.

const gitIdentity = "-c user.name=t -c user.email=t@example.com -c commit.gpgsign=false"

func gitIn(t *testing.T, dir string, args ...string) {
	t.Helper()
	cmd := exec.Command("git", append(strings.Fields(gitIdentity), args...)...)
	cmd.Dir = dir
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("%v: %s", err, out)
	}
}

func TestShowAndARefusedSetAreTheSameAsTheOldScript(t *testing.T) {
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node is not installed")
	}
	script, _ := filepath.Abs(filepath.Join("..", "..", "..", "idea-loop", "scripts", "issues.mjs"))
	if _, err := os.Stat(script); err != nil {
		t.Skip("the old script is gone")
	}
	p := docsWith(t, map[string]string{"retry": specText(sp{Issues: "[5]"})}, str(typesTracker), "o/r")
	// the clone the project list registers, with the branch of issue 5
	clone := filepath.Join(p.env["HOME"], "code", "example-app")
	must(t, os.MkdirAll(clone, 0o755))
	gitIn(t, clone, "init", "-q", "-b", "main")
	must(t, os.WriteFile(filepath.Join(clone, "a.txt"), []byte("x\n"), 0o644))
	gitIn(t, clone, "add", "a.txt")
	gitIn(t, clone, "commit", "-q", "-m", "init")
	gitIn(t, clone, "branch", "issue/5-retry")

	// a gh that answers from files, the same one for both
	bin := t.TempDir()
	data := filepath.Join(bin, "data")
	must(t, os.MkdirAll(data, 0o755))
	must(t, os.WriteFile(filepath.Join(data, "issue5.json"), []byte(`{"number":5,"id":1005,"title":"重试 <会> 重复扣配额 & 其他","body":"b","state":"open","state_reason":null,"labels":[{"name":"status:in-progress"},{"name":"type:seo"},{"name":"type:seo/blog"},{"name":"kind:bug"}],"assignees":[],"created_at":"2026-01-01T00:00:00Z","updated_at":"2026-01-01T00:00:00Z","repository_url":"https://api.github.com/repos/o/r"}`), 0o644))
	must(t, os.WriteFile(filepath.Join(data, "issue6.json"), []byte(`{"number":6,"id":1006,"title":"没标状态","body":"","state":"open","state_reason":null,"labels":[],"assignees":[],"created_at":"2026-01-01T00:00:00Z","updated_at":"2026-01-01T00:00:00Z","repository_url":"https://api.github.com/repos/o/r"}`), 0o644))
	must(t, os.WriteFile(filepath.Join(data, "prs.json"), []byte(`[{"number":1,"body":"Refs o/r#5","state":"OPEN","isDraft":true,"url":"https://github.com/pr/1"},{"number":2,"body":"Refs o/r#99","state":"OPEN","isDraft":false,"url":"https://github.com/pr/2"},{"number":3,"body":"Refs o/r#5","state":"MERGED","isDraft":false,"url":"https://github.com/pr/3"},{"number":4,"body":"Refs #5","state":"CLOSED","isDraft":false}]`), 0o644))
	script2 := "#!/bin/sh\nd=\"$(dirname \"$0\")/data\"\ncase \"$*\" in\n  *\"api repos/o/r/issues/5\") cat \"$d/issue5.json\";;\n  *\"api repos/o/r/issues/6\") cat \"$d/issue6.json\";;\n  \"pr list\"*) cat \"$d/prs.json\";;\n  *) echo \"fake gh: no route for $*\" >&2; exit 1;;\nesac\n"
	must(t, os.WriteFile(filepath.Join(bin, "gh"), []byte(script2), 0o755))

	path := bin + string(os.PathListSeparator) + os.Getenv("PATH")
	t.Setenv("PATH", path)
	for k, v := range p.env {
		t.Setenv(k, v)
	}

	oldRun := func(args ...string) (string, string, int) {
		cmd := exec.Command(node, append([]string{script}, args...)...)
		var out, errb bytes.Buffer
		cmd.Stdout, cmd.Stderr = &out, &errb
		code := 0
		if err := cmd.Run(); err != nil {
			code = err.(*exec.ExitError).ExitCode()
		}
		return out.String(), errb.String(), code
	}
	newRun := func(args ...string) (string, string, int) {
		var out, errb bytes.Buffer
		code := app.Run(append([]string{"issues"}, args...), app.IO{Stdin: strings.NewReader(""), Stdout: &out, Stderr: &errb})
		return out.String(), errb.String(), code
	}

	oo, _, oc := oldRun("show", p.docs, "5")
	no, ne, nc := newRun("show", p.docs, "5")
	if oc != 0 || nc != 0 {
		t.Fatalf("old %d, new %d: %s", oc, nc, ne)
	}
	if oo != no {
		t.Fatalf("show differs\nold: %s\nnew: %s", oo, no)
	}
	if !strings.Contains(no, "issue/5-retry") || !strings.Contains(no, `"draft"`) || !strings.Contains(no, "<会>") {
		t.Fatalf("the comparison did not exercise the branch, the PRs and the unescaped text:\n%s", no)
	}

	for _, at := range []string{"23:30", "10:00", "20:00"} {
		oq, _, _ := oldRun("queues", p.docs, "--at="+at)
		nq, _, _ := newRun("queues", p.docs, "--at="+at)
		if oq != nq || oq == "" {
			t.Fatalf("queues --at=%s differs\nold: %s\nnew: %s", at, oq, nq)
		}
	}

	// refused flips: the same reason on the first line of stderr, exit 1, nothing on stdout
	for _, c := range [][]string{
		{"set", p.docs, "in-progress", "6"},
		{"set", p.docs, "backlog", "5"},
		{"set", p.docs, "done", "5"},
		{"set", p.docs, "in-review", "5", "6"},
		{"check", p.docs, "todo", "5"},
	} {
		_, oe, oc := oldRun(c...)
		nout, ne, nc := newRun(c...)
		if oc != 1 || nc != 1 || nout != "" {
			t.Fatalf("%v: old %d, new %d, out %q", c, oc, nc, nout)
		}
		first := strings.SplitN(strings.TrimSpace(ne), "\n", 2)[0]
		if first != strings.TrimSpace(oe) {
			t.Fatalf("%v: the reason differs\nold: %s\nnew: %s", c, oe, first)
		}
	}
}
