package app

import (
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/registry"
)

func TestRegistryHasTheTestModuleCommandsAndOnlyTestsMayCallThem(t *testing.T) {
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
	for _, name := range []string{"test fixture design-archive", "test skill-doc", "test run"} {
		c, ok := have[name]
		if !ok {
			t.Errorf("the registry has no %q", name)
			continue
		}
		if c.Caller != registry.CallerTest {
			t.Errorf("%s: caller %q, want %q", name, c.Caller, registry.CallerTest)
		}
	}
}

func writeFile(t *testing.T, path, text string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(text), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestTestSkillDocIsRedForASkillOver5000CharactersThroughTheWholeCommandTree(t *testing.T) {
	root := t.TempDir()
	writeFile(t, filepath.Join(root, ".claude-plugin", "plugin.json"), `{"name":"demo-plugin"}`)
	skill := filepath.Join(root, "skills", "productivity", "long")
	writeFile(t, filepath.Join(skill, "SKILL.md"), "---\nname: long\n---\n"+strings.Repeat("字", 5001))
	_, errs, code := run(nil, "test", "skill-doc", skill)
	if code != 1 || !strings.Contains(errs, "5001") {
		t.Fatal(errs, code)
	}
	writeFile(t, filepath.Join(skill, "SKILL.md"), "---\nname: long\n---\n"+strings.Repeat("字", 4999))
	out, errs, code := run(nil, "test", "skill-doc", skill)
	if code != 0 || !strings.Contains(out, "4999") {
		t.Fatal(out, errs, code)
	}
}

func TestTestRunWithAMatchRunsOnlyThoseTestFilesAndEndsWithTheirResult(t *testing.T) {
	if _, err := exec.LookPath("node"); err != nil {
		t.Skip("node is not installed")
	}
	root := t.TempDir()
	writeFile(t, filepath.Join(root, ".claude-plugin", "plugin.json"), `{"name":"demo-plugin"}`)
	writeFile(t, filepath.Join(root, "scripts", "issues.test.mjs"), "import { test } from 'node:test';\ntest('issues ok', () => {});\n")
	writeFile(t, filepath.Join(root, "scripts", "seo.test.mjs"), "import { test } from 'node:test';\ntest('seo broken', () => { throw new Error('x'); });\n")

	out, errs, code := run(map[string]string{}, "test", "run", "issues", "--plugin", root)
	if code != 0 || !strings.Contains(out, "issues ok") || strings.Contains(out, "seo broken") {
		t.Fatal(out, errs, code)
	}
	out, _, code = run(map[string]string{}, "test", "run", "seo", "--plugin", root)
	if code == 0 || !strings.Contains(out, "seo broken") {
		t.Fatal("the failing file must end red:", out, code)
	}
}
