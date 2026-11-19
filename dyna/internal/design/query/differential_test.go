package query

import (
	"bytes"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/design/archive"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/design/fixture"
)

// oldScript is the script this package replaces; until it is deleted it is the reference the answers are
// compared with, byte for byte.
func oldScript(t *testing.T) string {
	t.Helper()
	if _, err := exec.LookPath("node"); err != nil {
		t.Skip("node is not installed")
	}
	_, file, _, _ := runtime.Caller(0)
	return filepath.Join(filepath.Dir(file), "..", "..", "..", "..", "idea-loop", "scripts", "design-archive-query.mjs")
}

func runOld(t *testing.T, script string, args ...string) (stdout, stderr string, code int) {
	t.Helper()
	cmd := exec.Command("node", append([]string{script}, args...)...)
	var out, errb bytes.Buffer
	cmd.Stdout, cmd.Stderr = &out, &errb
	err := cmd.Run()
	if err != nil {
		if ee, ok := err.(*exec.ExitError); ok {
			code = ee.ExitCode()
		} else {
			t.Fatal(err)
		}
	}
	return out.String(), errb.String(), code
}

// sameAsOld runs the old script and the Go command with the same arguments and demands the same stdout and
// exit code (and, for a "not found" exit, the same sentence on stderr).
func sameAsOld(t *testing.T, script string, args ...string) {
	t.Helper()
	oldOut, oldErr, oldCode := runOld(t, script, args...)
	newOut, newErr, newCode := cliRun(args...)
	if oldCode != newCode || oldOut != newOut {
		t.Fatalf("dyna and the old script differ for %v\nold exit %d, new exit %d\nold stderr: %s\nnew stderr: %s\n--- old stdout\n%s\n--- new stdout\n%s", args, oldCode, newCode, oldErr, newErr, oldOut, newOut)
	}
	if oldCode == 1 && strings.TrimSpace(oldErr) != strings.TrimSpace(newErr) {
		t.Fatalf("stderr differs for %v:\nold: %q\nnew: %q", args, oldErr, newErr)
	}
}

// everyQuestion asks every entry about every object of the tree, plus the odd ones.
func everyQuestion(t *testing.T, script, root string, extra ...string) {
	t.Helper()
	a, err := archive.Load(root, archive.Options{})
	if err != nil {
		t.Fatal(err)
	}
	for _, o := range a.All() {
		switch o.Kind {
		case "page", "state", "journey":
			sameAsOld(t, script, append([]string{root, o.Kind, o.ID}, extra...)...)
		case "component", "motion":
			sameAsOld(t, script, append([]string{root, "refs", o.ID}, extra...)...)
		}
		for _, p := range asList(fmGet(o.FM, "code")) {
			sameAsOld(t, script, append([]string{root, "refs", text(p)}, extra...)...)
		}
	}
	for _, kw := range []string{"保存", "转圈", "导航", "save", "NAVBAR", "食材库 菜谱", "搜索失败的提示", "zzzqqq", "价格 无限", "重试"} {
		sameAsOld(t, script, append([]string{root, "keyword", kw}, extra...)...)
	}
	for _, arg := range []string{"nope", "cookbook", "NavBar", "#feature", "#hero", "#trust", "#nope", fixture.MKT + "#hero", fixture.MKT + "#feature-b", fixture.MKT + "#nowhere", "cookbook#hero", "no-page#x", "./src/components/NavBar.tsx"} {
		sameAsOld(t, script, append([]string{root, "refs", arg}, extra...)...)
	}
	for _, e := range []string{"page", "state", "journey"} {
		sameAsOld(t, script, append([]string{root, e, "nope"}, extra...)...)
	}
}

func TestDifferentialQueryOnTheFixtureTrees(t *testing.T) {
	script := oldScript(t)
	for name, files := range map[string]fixture.Files{
		"compliant": fixture.Compliant(),
		"marketing": fixture.Marketing(),
		"shot":      shotFiles(),
		"scroll":    withScrollDriven(t),
		"code":      withCode(nil),
	} {
		t.Run(name, func(t *testing.T) {
			everyQuestion(t, script, repoOf(t, files))
		})
	}
}

func TestDifferentialQueryWithADelta(t *testing.T) {
	script := oldScript(t)
	root := repoOf(t, deltaFiles())
	sameAsOld(t, script, root, "diff", fixture.SpecSlug)
	sameAsOld(t, script, root, "diff", "nope")
	sameAsOld(t, script, root, "state", "cookbook--share-sheet", "--delta", fixture.SpecSlug)
	everyQuestion(t, script, root, "--delta", fixture.SpecSlug)
	everyQuestion(t, script, root)

	// a marketing delta: sections move, an edge changes its `from`
	m := fixture.Marketing()
	edited := m[fixture.MKTEntryFile]
	edited = strings.Replace(edited, "  - { id: footer, locate: { role: contentinfo } }", "  - { id: faq, locate: { role: heading, name: 常见问题 } }\n  - { id: footer, locate: { role: contentinfo } }", 1)
	edited = strings.Replace(edited, "from: mkt-pricing#footer", "from: mkt-pricing#faq", 1)
	m["docs/design/tmp/"+fixture.SpecSlug+"/delta/pages/"+fixture.MKT+"/"+fixture.MKTEntry+".md"] = edited
	mroot := repoOf(t, m)
	sameAsOld(t, script, mroot, "diff", fixture.SpecSlug)
	sameAsOld(t, script, mroot, "refs", fixture.MKT+"#faq", "--delta", fixture.SpecSlug)
	sameAsOld(t, script, mroot, "page", fixture.MKT, "--delta", fixture.SpecSlug)
}

func TestDifferentialQueryAffectedAndUsageErrors(t *testing.T) {
	script := oldScript(t)
	root, first := twoCommits(t, func(r string) {
		writeFile(t, r, "src/components/SaveButton.tsx", "// restyled\n")
		writeFile(t, r, "src/data/recipes.json", "{}\n")
		writeFile(t, r, "docs/notes.md", "unrelated\n")
	})
	sameAsOld(t, script, root, "affected", first)
	sameAsOld(t, script, root, "affected", "HEAD~1")
	sameAsOld(t, script, root, "affected", "HEAD")
	sameAsOld(t, script, root, "affected", "no-such-commit")
	sameAsOld(t, script, root, "affected", first, "--code-root", root)
	for _, args := range [][]string{
		{root}, {root, "page"}, {root, "galaxy", "cookbook"}, {root, "page", "cookbook", "--delta"},
		{root, "diff", fixture.SpecSlug, "--delta", fixture.SpecSlug}, {root, "keyword", "   "}, {"--delta", fixture.SpecSlug, root, "page", "cookbook"},
	} {
		_, _, oldCode := runOld(t, script, args...)
		_, _, newCode := cliRun(args...)
		if oldCode != newCode {
			t.Fatalf("%v: old exit %d, new exit %d", args, oldCode, newCode)
		}
	}
}
