package runtime

import (
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

// The three-layer boundary (spec dyna-app-layer-cleanup): the harness runs the model and its tools, the application
// layer (the Claude desktop app, magi, ...) does grouping, titles, archiving, schedules and messages between sessions,
// and dyna is the project layer. What the application layer does is written in each machine's runtime description,
// not in dyna, so no name of an application, its sidebar, or its session-id field appears in dyna's non-test code.
// dyna/internal/design/sections is out: its "sidebar" is the sidebar of a web page it photographs.
var appLayerNames = regexp.MustCompile(`(?i)claude-desktop|desktopSessionId|侧栏|侧边栏|sidebar|\bmagi\b|t3code`)

func TestDynaCodeNamesNoApplicationLayerThing(t *testing.T) {
	root, err := filepath.Abs(filepath.Join("..", ".."))
	if err != nil {
		t.Fatal(err)
	}
	skip := filepath.Join(root, "internal", "design", "sections")
	var hits []string
	err = filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			if path == skip || d.Name() == "dist" || d.Name() == "registry" {
				return filepath.SkipDir
			}
			return nil
		}
		if !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
			return nil
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		for i, line := range strings.Split(string(data), "\n") {
			if m := appLayerNames.FindString(line); m != "" {
				rel, _ := filepath.Rel(root, path)
				hits = append(hits, fmt.Sprintf("%s:%d 「%s」 %s", rel, i+1, m, strings.TrimSpace(line)))
			}
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(hits) > 0 {
		t.Errorf("dyna 的非测试代码里有应用层的叫法（写进各运行环境的说明，不进 dyna）：\n%s", strings.Join(hits, "\n"))
	}
}
