package app

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/registry"
)

func TestRegistryHasTheDesignArchiveMcpAndTestCommandsWithTheirCallers(t *testing.T) {
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
	want := map[string]string{
		"design archive check":              registry.CallerSession,
		"design archive query":              registry.CallerSession,
		"design archive write":              registry.CallerSession,
		"design archive sections time":      registry.CallerSession,
		"design archive sections step":      registry.CallerSession,
		"design archive sections measure":   registry.CallerSession,
		"design archive sections attribute": registry.CallerSession,
		"design archive sections shoot":     registry.CallerSession,
		"design archive sections screen":    registry.CallerSession,
		"design archive sections cover":     registry.CallerSession,
		"design archive sections pinned":    registry.CallerSession,
		"mcp design-archive":                registry.CallerSession,
		"test fixture design-archive":       registry.CallerTest,
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
	}
}

func TestTheFixtureWrittenIntoAnEmptyDirectoryPassesTheArchiveCheck(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "archive")
	out, errs, code := run(nil, "test", "fixture", "design-archive", dir)
	if code != 0 || !strings.Contains(out, dir) {
		t.Fatal(out, errs, code)
	}
	out, errs, code = run(nil, "design", "archive", "check", dir)
	if code != 0 || !strings.Contains(out, "通过") {
		t.Fatalf("check of the fixture: exit %d\n%s\n%s", code, out, errs)
	}
}

func TestTheFixtureRefusesADirectoryThatIsNotEmpty(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "keep.txt"), []byte("mine"), 0o644); err != nil {
		t.Fatal(err)
	}
	_, errs, code := run(nil, "test", "fixture", "design-archive", dir)
	if code != 1 || !strings.Contains(errs, "不是空目录") {
		t.Fatal(errs, code)
	}
	if b, _ := os.ReadFile(filepath.Join(dir, "keep.txt")); string(b) != "mine" {
		t.Fatal("the fixture touched a file that was already there")
	}
}

func TestTheFixtureNeedsExactlyOneDirectory(t *testing.T) {
	_, errs, code := run(nil, "test", "fixture", "design-archive")
	if code != 1 || !strings.Contains(errs, "usage") {
		t.Fatal(errs, code)
	}
}

func TestQueryAndMcpAnswerThroughTheCommandTree(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "archive")
	if _, errs, code := run(nil, "test", "fixture", "design-archive", dir); code != 0 {
		t.Fatal(errs)
	}
	out, errs, code := run(nil, "design", "archive", "query", dir, "page", "cookbook")
	if code != 0 || !strings.Contains(out, `"cookbook"`) {
		t.Fatal(out, errs, code)
	}
	_, errs, code = run(nil, "design", "archive", "query", dir, "page", "no-such-page")
	if code != 1 || errs == "" {
		t.Fatalf("a page that does not exist is exit 1 with the reason: %d %q", code, errs)
	}
}
