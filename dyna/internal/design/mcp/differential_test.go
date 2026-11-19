package mcp

import (
	"bytes"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/design/fixture"
)

// The old MCP server is the reference until it is deleted: the same requests go to it and to this one, on the same
// archive, and the responses must be the same line for line.

func oldServer(t *testing.T) string {
	t.Helper()
	if _, err := exec.LookPath("node"); err != nil {
		t.Skip("node is not installed")
	}
	_, file, _, _ := runtime.Caller(0)
	return filepath.Join(filepath.Dir(file), "..", "..", "..", "..", "idea-loop", "scripts", "design-archive-mcp.mjs")
}

func lines(t *testing.T, messages []any) string {
	t.Helper()
	var in strings.Builder
	for _, m := range messages {
		if s, ok := m.(string); ok {
			in.WriteString(s + "\n")
			continue
		}
		b, err := json.Marshal(m)
		if err != nil {
			t.Fatal(err)
		}
		in.Write(b)
		in.WriteString("\n")
	}
	return in.String()
}

func runOld(t *testing.T, script, cwd, homeDir, input string) string {
	t.Helper()
	cmd := exec.Command("node", script)
	cmd.Dir = cwd
	cmd.Env = []string{"PATH=" + os.Getenv("PATH"), "HOME=" + filepath.Dir(cwd), "IDEA_LOOP_HOME=" + homeDir}
	cmd.Stdin = strings.NewReader(input)
	var out bytes.Buffer
	cmd.Stdout = &out
	if err := cmd.Run(); err != nil {
		t.Fatal(err)
	}
	return out.String()
}

func runNew(t *testing.T, cwd, homeDir, input string) string {
	t.Helper()
	env := map[string]string{"HOME": filepath.Dir(cwd), "IDEA_LOOP_HOME": homeDir}
	var out bytes.Buffer
	if err := Serve(strings.NewReader(input), &out, Deps{Env: func(k string) string { return env[k] }, Cwd: cwd}); err != nil {
		t.Fatal(err)
	}
	return out.String()
}

func sameLines(t *testing.T, script, cwd, homeDir string, messages ...any) {
	t.Helper()
	input := lines(t, messages)
	oldOut := strings.Split(strings.TrimSpace(runOld(t, script, cwd, homeDir, input)), "\n")
	newOut := strings.Split(strings.TrimSpace(runNew(t, cwd, homeDir, input)), "\n")
	if len(oldOut) != len(newOut) {
		t.Fatalf("the old server answered %d lines, this one %d", len(oldOut), len(newOut))
	}
	for i := range oldOut {
		if oldOut[i] != newOut[i] {
			t.Fatalf("line %d differs\nold: %s\nnew: %s", i, oldOut[i], newOut[i])
		}
	}
}

func TestDifferentialMCPAgainstTheOldServer(t *testing.T) {
	script := oldServer(t)
	extra := fixture.Marketing()
	extra[share] = shareSheet
	w := gitRepo(t, extra)

	// a history for design_affected
	os.MkdirAll(filepath.Join(w.code, "src", "pages"), 0o755)
	page := filepath.Join(w.code, "src", "pages", "pantry.tsx")
	os.WriteFile(page, []byte("one\n"), 0o644)
	mustGit(t, w.code, "add", "-A")
	mustGit(t, w.code, "commit", "-q", "-m", "one")
	first := mustGit(t, w.code, "rev-parse", "HEAD")
	os.WriteFile(page, []byte("two\n"), 0o644)
	mustGit(t, w.code, "add", "-A")
	mustGit(t, w.code, "commit", "-q", "-m", "two")

	messages := []any{
		initMsg,
		map[string]any{"jsonrpc": "2.0", "method": "notifications/initialized"},
		listMsg,
		map[string]any{"jsonrpc": "2.0", "id": 3, "method": "ping"},
		map[string]any{"jsonrpc": "2.0", "id": 4, "method": "resources/list"},
		map[string]any{"jsonrpc": "2.0", "id": "text-id", "method": "initialize", "params": map[string]any{"protocolVersion": "1999-01-01"}},
		"{ not json",
		map[string]any{"jsonrpc": "2.0", "id": 5, "method": "tools/call", "params": map[string]any{}},
		map[string]any{"jsonrpc": "2.0", "id": 6, "method": "tools/call", "params": map[string]any{"name": 12}},
		map[string]any{"jsonrpc": "2.0", "method": 7, "id": 8},
		call(10, "design_page", map[string]any{"name": "cookbook"}),
		call(11, "design_page", map[string]any{"name": "mkt-pricing"}),
		call(12, "design_state", map[string]any{"name": "cookbook--search-results"}),
		call(13, "design_state", map[string]any{"name": "cookbook--share-sheet"}),
		call(14, "design_state", map[string]any{"name": "cookbook--share-sheet", "delta": fixture.SpecSlug}),
		call(15, "design_journey", map[string]any{"name": "save-a-recipe"}),
		call(16, "design_journey", map[string]any{"name": "explore-pricing"}),
		call(17, "design_diff", map[string]any{"spec": fixture.SpecSlug}),
		call(18, "design_diff", map[string]any{"spec": "nope"}),
		call(19, "design_diff", map[string]any{"spec": fixture.SpecSlug, "delta": fixture.SpecSlug}),
		call(20, "design_refs", map[string]any{"name": "NavBar"}),
		call(21, "design_refs", map[string]any{"name": "mkt-pricing#hero"}),
		call(22, "design_refs", map[string]any{"name": "#feature"}),
		call(23, "design_refs", map[string]any{"name": "mkt-pricing#nowhere"}),
		call(24, "design_keyword", map[string]any{"text": "保存"}),
		call(25, "design_keyword", map[string]any{"text": "zzzqqq"}),
		call(26, "design_keyword", map[string]any{"text": "  "}),
		call(27, "design_affected", map[string]any{"commit": first}),
		call(28, "design_affected", map[string]any{"commit": "no-such-commit"}),
		call(29, "design_affected", map[string]any{"commit": "--output=x"}),
		call(30, "design_page", map[string]any{}),
		call(31, "design_page", map[string]any{"name": 7}),
		call(32, "design_page", map[string]any{"name": "cookbook", "delta": ""}),
		call(33, "design_page", map[string]any{"name": "cookbook", "project": " "}),
		call(34, "design_page", map[string]any{"name": "cookbook", "project": "nope"}),
		call(35, "design_page", map[string]any{"name": "cookbook", "project": "example-app"}),
		call(36, "design_affected", map[string]any{"commit": first, "project": "example-app"}),
		call(37, "write_design", map[string]any{"name": "x"}),
	}
	sameLines(t, script, w.code, w.home, messages...)
	// the same questions from home itself, and from outside any repository
	sameLines(t, script, w.home, w.home, initMsg, call(2, "design_page", map[string]any{"name": "cookbook"}), call(3, "design_page", map[string]any{"name": "cookbook", "project": "example-app"}))
	bare, _ := filepath.EvalSymlinks(t.TempDir())
	sameLines(t, script, bare, filepath.Join(bare, "no-home"), initMsg, call(2, "design_page", map[string]any{"name": "cookbook"}), call(3, "design_keyword", map[string]any{"text": "x"}))
}
