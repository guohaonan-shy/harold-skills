package app

import (
	"bytes"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/registry"
)

func runWithStdin(stdin string, args ...string) (stdout, stderr string, code int) {
	var out, errb bytes.Buffer
	code = Run(args, IO{Stdin: strings.NewReader(stdin), Stdout: &out, Stderr: &errb, Env: envOf(nil)})
	return out.String(), errb.String(), code
}

func hookEvent(command string) string {
	b, _ := json.Marshal(map[string]any{"tool_name": "Bash", "tool_input": map[string]string{"command": command}})
	return string(b)
}

func TestTheWorktreeGuardBlocksHandWrittenRemoveAndLetsListThrough(t *testing.T) {
	_, errs, code := runWithStdin(hookEvent("git worktree remove x"), "worktree", "guard", "--hook")
	if code != 2 || !strings.Contains(errs, "dyna worktree remove") {
		t.Fatalf("blocked, told the dyna command: %d %q", code, errs)
	}
	out, errs, code := runWithStdin(hookEvent("git worktree list"), "worktree", "guard", "--hook")
	if code != 0 || out != "" || errs != "" {
		t.Fatalf("git worktree list goes through: %d %q %q", code, out, errs)
	}
}

func TestRegistryJSONHasEveryGitAndWorktreeCommandWithItsCaller(t *testing.T) {
	out, errs, code := run(nil, "registry", "--json")
	if code != 0 {
		t.Fatal(errs)
	}
	var reg registry.Registry
	if err := json.Unmarshal([]byte(out), &reg); err != nil {
		t.Fatal(err)
	}
	want := map[string]string{
		"git commit":      registry.CallerSession,
		"git push":        registry.CallerSession,
		"worktree add":    registry.CallerSession,
		"worktree list":   registry.CallerSession,
		"worktree remove": registry.CallerSession,
		"worktree guard":  registry.CallerHook,
	}
	for name, caller := range want {
		c, ok := reg.Find(name)
		if !ok {
			t.Errorf("%s is not in the registry", name)
			continue
		}
		if c.Caller != caller || c.Summary == "" || c.Next == "" || len(c.Args) == 0 {
			t.Errorf("%s: %+v", name, c)
		}
	}
	var rm registry.Command
	rm, _ = reg.Find("worktree remove")
	var flags []string
	for _, a := range rm.Args {
		if a.Kind == "flag" {
			flags = append(flags, a.Name)
		}
	}
	if strings.Join(flags, ",") != "force,keep-branch,repo" {
		t.Fatal(flags)
	}
}

func sh(t *testing.T, dir string, args ...string) string {
	t.Helper()
	c := exec.Command("git", args...)
	c.Dir = dir
	out, err := c.CombinedOutput()
	if err != nil {
		t.Fatalf("git %s: %v\n%s", strings.Join(args, " "), err, out)
	}
	return strings.TrimSpace(string(out))
}

func TestWorktreeAddAndRemoveThroughTheCommandTreeOnARealRepository(t *testing.T) {
	t.Setenv("GIT_CONFIG_GLOBAL", os.DevNull)
	t.Setenv("GIT_CONFIG_SYSTEM", os.DevNull)
	root, _ := filepath.EvalSymlinks(t.TempDir())
	main := filepath.Join(root, "proj")
	remote := filepath.Join(root, "origin.git")
	if err := os.Mkdir(main, 0o755); err != nil {
		t.Fatal(err)
	}
	sh(t, main, "init", "-q", "-b", "main")
	sh(t, main, "config", "user.email", "t@example.com")
	sh(t, main, "config", "user.name", "T")
	if err := os.WriteFile(filepath.Join(main, "a.txt"), []byte("a\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	sh(t, main, "add", "-A")
	sh(t, main, "commit", "-q", "-m", "init")
	sh(t, root, "init", "-q", "--bare", "-b", "main", remote)
	sh(t, main, "remote", "add", "origin", remote)
	sh(t, main, "push", "-q", "-u", "origin", "main")

	out, errs, code := run(nil, "worktree", "add", "7-demo", "--repo", main, "--base", "main")
	if code != 0 {
		t.Fatal(errs)
	}
	wt := strings.TrimSpace(out)
	if wt != filepath.Join(root, "proj-worktrees", "7-demo") {
		t.Fatal(wt)
	}
	sh(t, main, "worktree", "lock", wt)

	// land one file from the worktree: only that file goes in
	if err := os.WriteFile(filepath.Join(wt, "x.txt"), []byte("x\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(wt, "y.txt"), []byte("y\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	out, errs, code = run(nil, "git", "commit", "--repo", wt, "-m", "add x", "x.txt")
	if code != 0 || !strings.Contains(out, sh(t, wt, "rev-parse", "HEAD")) {
		t.Fatal(out, errs, code)
	}
	if sh(t, wt, "show", "--name-only", "--format=", "HEAD") != "x.txt" {
		t.Fatal("only x.txt is in the commit")
	}
	if sh(t, wt, "status", "--porcelain") != "?? y.txt" {
		t.Fatal("y.txt was left alone")
	}
	if err := os.Remove(filepath.Join(wt, "y.txt")); err != nil {
		t.Fatal(err)
	}

	_, errs, code = run(nil, "worktree", "remove", wt, "--repo", main)
	if code != 0 {
		t.Fatal(errs)
	}
	if _, err := os.Stat(wt); err == nil {
		t.Fatal("worktree directory is gone")
	}
	if got := sh(t, main, "branch", "--list", "issue/7-demo"); got != "" {
		t.Fatalf("branch is gone, got %q", got)
	}
}
