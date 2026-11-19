package write

import (
	"bytes"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/design/fixture"
)

// The old script stays until the commands replace it; until then this runs both on separate copies of the same
// tree and holds their output (stdout, byte for byte, with and without --json), exit code and the resulting
// tree the same.

func runOld(t *testing.T, args ...string) (string, int) {
	t.Helper()
	if _, err := exec.LookPath("node"); err != nil {
		t.Skip("node is not on PATH")
	}
	script, err := filepath.Abs(filepath.Join("..", "..", "..", "..", "idea-loop", "scripts", "design-archive-write.mjs"))
	if err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command("node", append([]string{script}, args...)...)
	var out bytes.Buffer
	cmd.Stdout = &out
	code := 0
	if err := cmd.Run(); err != nil {
		ee, ok := err.(*exec.ExitError)
		if !ok {
			t.Fatal(err)
		}
		code = ee.ExitCode()
	}
	return out.String(), code
}

func TestDifferentialWriteIsTheSameAsTheOldScript(t *testing.T) {
	removeComponent := func() fixture.Files {
		files := requirement(true)
		files[D("removed.md")] = "- [[pantry--empty]]\n- [[pantry--overview]]\n- [[pantry]]\n- [[glance-at-pantry]]\n"
		delete(files, D("pages/pantry/pantry--overview.md"))
		files[P("pages/pantry/assets/shot.png")] = png("shot")
		list := P("pages/cookbook/cookbook--list.md")
		files[D("pages/cookbook/cookbook--list.md")] = regexp.MustCompile(`  - id: open-pantry(?s:.*?)action: click\n`).ReplaceAllString(fixture.Compliant()[list], "")
		delete(files, tmp+"/canvas/assets/flows/flow-2-pantry--overview.png")
		files[spec] = regexp.MustCompile(`!\[食材库\].*\n`).ReplaceAllString(files[spec], "")
		return files
	}
	failing := func() fixture.Files {
		files := requirement(true)
		k := D("pages/cookbook/cookbook--share-sheet.md")
		files[k] = strings.Replace(files[k], "page: \"[[cookbook]]\"", "page: \"[[cookbook]]\"\nasync:\n  loading: \"[[cookbook--share-sheet]]\"", 1)
		return files
	}
	conflict := func() fixture.Files {
		files := requirement(true)
		files[P("pages/cookbook/assets/flows/flow-3-misc.png")] = png("older")
		return files
	}
	identical := func() fixture.Files {
		files := requirement(true)
		files[P("pages/cookbook/assets/flows/flow-3-misc.png")] = png("flow-3")
		return files
	}
	lonely := func() fixture.Files {
		files := fixture.Compliant()
		files[tmp+"/canvas/assets/flows/lonely.png"] = png("x")
		return files
	}
	noDelta := func() fixture.Files {
		files := fixture.Compliant()
		files[tmp+"/canvas/a.html"] = "<html></html>"
		files[tmp+"/canvas/assets/flows/flow-1-cookbook--list.png"] = png("f")
		files[spec] += "\n![流程](../../design/tmp/" + slug + "/canvas/assets/flows/flow-1-cookbook--list.png)\n"
		return files
	}
	noLFS := func() fixture.Files { return requirement(false) }
	partialLFS := func() fixture.Files {
		files := requirement(true)
		files[".gitattributes"] = "* text=auto\ndocs/design/prod/**/assets/**/*.png filter=lfs diff=lfs merge=lfs -text\n"
		files[".gitignore"] = "node_modules/\n"
		return files
	}
	noIndexSettings := func() fixture.Files {
		files := requirement(true)
		files[P("index.md")] = "---\ntype: design-index\ntags: [design]\nsummary: 索引\n---\n\n# 设计档案\n"
		return files
	}
	dangling := func() fixture.Files {
		files := requirement(true)
		files[spec] += "\n[画布](../../design/tmp/" + slug + "/canvas/" + slug + ".html)\n"
		return files
	}
	otherSpec := func() fixture.Files {
		files := requirement(true)
		files["docs/design/tmp/other-spec/canvas/a.html"] = "<html></html>"
		return files
	}
	cases := []struct {
		name  string
		files func() fixture.Files
	}{
		{"requirement", func() fixture.Files { return requirement(true) }},
		{"remove-component", removeComponent},
		{"failing", failing},
		{"conflict", conflict},
		{"identical-figure", identical},
		{"lonely-figure", lonely},
		{"no-delta", noDelta},
		{"no-lfs", noLFS},
		{"partial-lfs", partialLFS},
		{"no-index-settings", noIndexSettings},
		{"dangling", dangling},
		{"other-spec", otherSpec},
	}
	for _, c := range cases {
		for _, extra := range [][]string{nil, {"--dry-run"}, {"--json"}, {"--dry-run", "--json"}} {
			t.Run(c.name+strings.Join(extra, ""), func(t *testing.T) {
				oldRoot, newRoot := repo(t, c.files()), repo(t, c.files())
				wantOut, wantCode := runOld(t, append([]string{oldRoot, slug}, extra...)...)
				gotOut, _, gotCode := cli(append([]string{newRoot, slug}, extra...)...)
				if gotCode != wantCode || gotOut != wantOut {
					t.Fatalf("old (%d):\n%s\nnew (%d):\n%s", wantCode, wantOut, gotCode, gotOut)
				}
				eq(t, snapshot(t, newRoot), snapshot(t, oldRoot))
			})
		}
	}
	t.Run("usage", func(t *testing.T) {
		root := repo(t, fixture.Compliant())
		for _, args := range [][]string{{}, {root, slug}, {root, slug, "--nope"}, {root, "../etc"}, {repo(t, fixture.Files{"README.md": "x"}), slug}} {
			_, wantCode := runOld(t, args...)
			_, _, gotCode := cli(args...)
			if gotCode != wantCode {
				t.Fatalf("%v: old %d, new %d", args, wantCode, gotCode)
			}
		}
	})
}
