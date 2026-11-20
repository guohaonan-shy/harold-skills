package write

import (
	"bytes"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"regexp"
	"sort"
	"strings"
	"testing"

	"github.com/spf13/cobra"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/design/archive"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/design/check"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/design/fixture"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/nexterr"
)

// Every test of the old design-archive-write.test.mjs is here under the same name in Go style.

const (
	slug = fixture.SpecSlug
	base = fixture.Base
	tmp  = "docs/design/tmp/" + slug
	spec = "docs/spec/" + slug + "/" + slug + ".md"
)

func D(rel string) string { return tmp + "/delta/" + rel }
func P(rel string) string { return base + "/" + rel }

var (
	RESULTS  = P("pages/cookbook/cookbook--search-results.md")
	SAVED    = P("pages/cookbook/cookbook--recipe-saved.md")
	OVERVIEW = P("pages/pantry/pantry--overview.md")
)

var lfs = func() string {
	var lines []string
	for _, e := range []string{"png", "gif", "webm"} {
		lines = append(lines, "docs/design/prod/**/assets/**/*."+e+" filter=lfs diff=lfs merge=lfs -text")
	}
	return strings.Join(lines, "\n") + "\n"
}()

func png(n string) string { return "PNG-" + n }

// requirement is the requirement under test: two new states (a share sheet, a share-done screen) reached from
// recipe-saved, one edge changed (the keyboard save), one state removed (pantry--empty), a new component, and the
// pantry overview now using SearchBox (so an existing component's usedBy grows). The spec links three figures
// sitting in tmp/'s canvas.
func requirement(withLFS bool) fixture.Files {
	baseFiles := fixture.Compliant()
	state := func(id, page, extra string) string {
		return "---\ntype: design-state\ntags: [" + page + "]\nsummary: " + id + "\npage: \"[[" + page + "]]\"\n" + extra + "---\n\n## 这一屏\n\n画面。\n\n## 应看到什么\n\n- 看到画面\n"
	}
	shareButton := "---\ntype: design-component\ntags: [component]\nsummary: 分享按钮\ncode: [src/components/ShareButton.tsx]\nusedBy: []\n---\n\n# ShareButton\n\n## 决定\n\n无\n\n## 设计法候选\n\n无\n"
	files := baseFiles.Clone()
	// changed edge (keyboard save): the action text differs
	files[D("pages/cookbook/cookbook--search-results.md")] = strings.Replace(baseFiles[RESULTS], "action: 聚焦后按回车", "action: 聚焦后按空格", 1)
	// recipe-saved gains the way into the two new states
	files[D("pages/cookbook/cookbook--recipe-saved.md")] = strings.Replace(baseFiles[SAVED], "edges: []",
		"edges:\n  - id: share\n    to: \"[[cookbook--share-sheet]]\"\n    kind: user\n    component: \"[[ShareButton]]\"\n    locate: { role: button, name: 分享 }\n    action: click", 1)
	files[D("pages/cookbook/cookbook--share-sheet.md")] = state("cookbook--share-sheet", "cookbook",
		"edges:\n  - id: send\n    to: \"[[cookbook--share-done]]\"\n    kind: user\n    component: \"[[ShareButton]]\"\n    locate: { role: button, name: 发送 }\n    action: click\n")
	files[D("pages/cookbook/cookbook--share-done.md")] = state("cookbook--share-done", "cookbook", "edges: []\n")
	files[D("pages/cookbook/assets/cookbook--share-done.png")] = png("share-done")
	files[D("components/ShareButton/ShareButton.md")] = shareButton
	files[D("components/ShareButton/assets/hover.gif")] = png("hover")
	// pantry--overview: no more edge to the removed state, and it now lists SearchBox
	ov := regexp.MustCompile(`  - id: empty-shelf(?s:.*?)删除全部食材记录\n`).ReplaceAllString(baseFiles[OVERVIEW], "")
	files[D("pages/pantry/pantry--overview.md")] = strings.Replace(ov, `components: ["[[RecipeCard]]"]`, `components: ["[[RecipeCard]]", "[[SearchBox]]"]`, 1)
	files[D("removed.md")] = "# 删除\n\n- [[pantry--empty]] —— 空状态并入 overview\n"
	// the canvas: figures, their sources, and things that are not figures
	files[tmp+"/canvas/assets/flows/flow-1-cookbook--share-sheet.png"] = png("flow-1")
	files[tmp+"/canvas/assets/flows/flow-2-pantry--overview.png"] = png("flow-2")
	files[tmp+"/canvas/assets/flows/flow-3-misc.png"] = png("flow-3")
	files[tmp+"/canvas/assets/flows/src/flow-1.json"] = "{}"
	files[tmp+"/canvas/matrix/light-390.png"] = png("matrix")
	files[tmp+"/canvas/"+slug+".html"] = "<html></html>"
	files[tmp+"/imagine/note.md"] = "# 方向说明\n"
	files[spec] = baseFiles[spec] + `
## 5.3 交互图

![分享](../../design/tmp/` + slug + `/canvas/assets/flows/flow-1-cookbook--share-sheet.png)

![食材库](../../design/tmp/` + slug + `/canvas/assets/flows/flow-2-pantry--overview.png "食材库")

![其他](<../../design/tmp/` + slug + `/canvas/assets/flows/flow-3-misc.png>)

` + "```" + `
![示例，围栏里的不改](../../design/tmp/` + slug + `/canvas/assets/flows/flow-1-cookbook--share-sheet.png)
` + "```" + `
`
	if withLFS {
		files[".gitattributes"] = "* text=auto\n" + lfs
	}
	return files
}

// snapshot is every file under the repo → its bytes, so "nothing changed" is a DeepEqual.
func snapshot(t *testing.T, root string) map[string]string {
	t.Helper()
	out := map[string]string{}
	for _, abs := range archive.Walk(root, func(_, name string) bool { return name == ".git" }) {
		b, err := os.ReadFile(abs)
		if err != nil {
			t.Fatal(err)
		}
		rel, _ := filepath.Rel(root, abs)
		out[rel] = string(b)
	}
	return out
}

func repo(t *testing.T, files fixture.Files) string {
	t.Helper()
	root, err := fixture.WriteRepo(files, t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	return root
}

func read(t *testing.T, root, rel string) string {
	t.Helper()
	b, err := os.ReadFile(filepath.Join(root, filepath.FromSlash(rel)))
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

func has(root, rel string) bool {
	_, err := os.Stat(filepath.Join(root, filepath.FromSlash(rel)))
	return err == nil
}

func archiveFiles(t *testing.T, files fixture.Files, dryRun bool) (string, Result) {
	t.Helper()
	root := repo(t, files)
	res, err := ArchiveSpec(root, slug, dryRun)
	if err != nil {
		t.Fatalf("archive: %v", err)
	}
	return root, res
}

func matches(t *testing.T, pattern, s string) {
	t.Helper()
	if !regexp.MustCompile(pattern).MatchString(s) {
		t.Fatalf("%q does not match /%s/", s, pattern)
	}
}

func notMatches(t *testing.T, pattern, s string) {
	t.Helper()
	if regexp.MustCompile(pattern).MatchString(s) {
		t.Fatalf("%q should not match /%s/", s, pattern)
	}
}

func eq(t *testing.T, got, want any) {
	t.Helper()
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got  %#v\nwant %#v", got, want)
	}
}

func dumpResult(r Result) string {
	var b strings.Builder
	for _, v := range r.Violations {
		b.WriteString(check.Format(v) + "\n")
	}
	b.WriteString(strings.Join(r.Errors, "\n"))
	return b.String()
}

func mustOK(t *testing.T, r Result) {
	t.Helper()
	if !r.OK {
		t.Fatalf("refused (%s):\n%s", r.Stage, dumpResult(r))
	}
}

func kinds(hs []Hint) []string {
	out := []string{}
	for _, h := range hs {
		out = append(out, h.Kind)
	}
	return out
}

// ---------- the archive ----------

func TestArchiveDeltaLandsInProdTheRemovedStateGoesUsedByAndTheIndexRefreshFiguresMoveSpecLinksFollowTmpIsEmptied(t *testing.T) {
	root, result := archiveFiles(t, requirement(true), false)
	mustOK(t, result)

	// two states added, an edge changed, one state removed
	for _, rel := range []string{"pages/cookbook/cookbook--share-sheet.md", "pages/cookbook/cookbook--share-done.md", "components/ShareButton/ShareButton.md"} {
		if !has(root, P(rel)) {
			t.Fatalf("missing %s", rel)
		}
	}
	matches(t, `action: 聚焦后按空格`, read(t, root, RESULTS))
	if has(root, P("pages/pantry/pantry--empty.md")) {
		t.Fatal("pantry--empty should be gone")
	}
	eq(t, read(t, root, P("pages/cookbook/assets/cookbook--share-done.png")), "PNG-share-done")
	eq(t, read(t, root, P("components/ShareButton/assets/hover.gif")), "PNG-hover")

	// usedBy regenerated: a stale one in the delta, and an existing component outside the delta
	matches(t, `(?m)^usedBy: \["\[\[cookbook\]\]"\]$`, read(t, root, P("components/ShareButton/ShareButton.md")))
	matches(t, `(?m)^usedBy: \["\[\[cookbook\]\]", "\[\[pantry\]\]"\]$`, read(t, root, P("components/SearchBox/SearchBox.md")))

	// the index: tables from frontmatter, own settings kept, removed state gone
	index := read(t, root, P("index.md"))
	matches(t, `(?m)^viewport: 1440x900$`, index)
	matches(t, `(?m)^theme: light$`, index)
	matches(t, `(?m)^locale: zh-CN$`, index)
	matches(t, `\| \[\[cookbook\]\] \| .*\[\[cookbook--share-sheet\]\].* \|`, index)
	matches(t, `\| \[\[ShareButton\]\] \| \[\[cookbook\]\] \| 分享按钮 \|`, index)
	matches(t, `\| \[\[SearchBox\]\] \| \[\[cookbook\]\]、\[\[pantry\]\] \|`, index)
	matches(t, `\| \[\[glance-at-pantry\]\] \| 用户在菜谱页中途看一眼食材库，再回到菜谱页 \| \[\[cookbook\]\]、\[\[pantry\]\] \|`, index)
	notMatches(t, `pantry--empty`, index)

	// figures: by the state id in the name, else the first page the delta touches; sources and matrix stay out
	flows := func(page string) []string {
		entries, err := os.ReadDir(filepath.Join(root, filepath.FromSlash(P("pages/"+page+"/assets/flows"))))
		if err != nil {
			t.Fatal(err)
		}
		var names []string
		for _, e := range entries {
			names = append(names, e.Name())
		}
		sort.Strings(names)
		return names
	}
	eq(t, flows("cookbook"), []string{"flow-1-cookbook--share-sheet.png", "flow-3-misc.png"})
	eq(t, flows("pantry"), []string{"flow-2-pantry--overview.png"})
	eq(t, read(t, root, P("pages/pantry/assets/flows/flow-2-pantry--overview.png")), "PNG-flow-2")
	var placed [][2]string
	for _, f := range result.Summary.Figures {
		placed = append(placed, [2]string{filepath.Base(f.From), f.Page})
	}
	eq(t, placed, [][2]string{
		{"flow-1-cookbook--share-sheet.png", "cookbook"},
		{"flow-2-pantry--overview.png", "pantry"},
		{"flow-3-misc.png", "cookbook"},
	})
	matches(t, `第一个页面`, result.Summary.Figures[2].Reason)

	// the spec: links follow the figures, fenced code and everything else stay
	text := read(t, root, spec)
	matches(t, `!\[分享\]\(\.\./\.\./design/prod/pages/cookbook/assets/flows/flow-1-cookbook--share-sheet\.png\)`, text)
	matches(t, `!\[食材库\]\(\.\./\.\./design/prod/pages/pantry/assets/flows/flow-2-pantry--overview\.png "食材库"\)`, text)
	matches(t, `!\[其他\]\(<\.\./\.\./design/prod/pages/cookbook/assets/flows/flow-3-misc\.png>\)`, text)
	matches(t, "```\n!\\[示例，围栏里的不改\\]\\(\\.\\./\\.\\./design/tmp/", text)
	eq(t, len(result.Summary.SpecLinks), 3)

	// tmp/<spec-slug>/ is emptied
	if has(root, tmp) {
		t.Fatal("tmp should be emptied")
	}

	// and the archive is clean in full, usedBy included
	after, err := check.Run(root, check.Defaults())
	if err != nil {
		t.Fatal(err)
	}
	if len(after.Violations) != 0 {
		t.Fatal(dumpResult(Result{Violations: after.Violations}))
	}
	eq(t, result.Summary.Added, []string{"ShareButton", "cookbook--share-done", "cookbook--share-sheet"})
	eq(t, result.Summary.Changed, []string{"cookbook--recipe-saved", "cookbook--search-results", "pantry--overview"})
	eq(t, result.Summary.Removed, []string{"pantry--empty"})
	eq(t, result.Hints, []Hint{})
}

func TestArchiveOtherSpecsFoldersUnderTmpAreLeftAlone(t *testing.T) {
	files := requirement(true)
	files["docs/design/tmp/other-spec/canvas/a.html"] = "<html></html>"
	root, result := archiveFiles(t, files, false)
	mustOK(t, result)
	if !has(root, "docs/design/tmp/other-spec/canvas/a.html") {
		t.Fatal("other spec's folder was touched")
	}
}

func TestArchiveARemovedComponentTakesItsWholeFolderARemovedPageWithTheLastOfItsStatesToo(t *testing.T) {
	files := requirement(true)
	files[D("removed.md")] = "- [[pantry--empty]]\n- [[pantry--overview]]\n- [[pantry]]\n- [[glance-at-pantry]]\n"
	delete(files, D("pages/pantry/pantry--overview.md"))
	files[P("pages/pantry/assets/shot.png")] = png("shot")
	// cookbook--list links to the removed overview: edit it in the delta
	list := P("pages/cookbook/cookbook--list.md")
	files[D("pages/cookbook/cookbook--list.md")] = regexp.MustCompile(`  - id: open-pantry(?s:.*?)action: click\n`).ReplaceAllString(fixture.Compliant()[list], "")
	// NavBar is also used by the removed page — usedBy must shrink; the page's folder must vanish
	delete(files, tmp+"/canvas/assets/flows/flow-2-pantry--overview.png")
	files[spec] = regexp.MustCompile(`!\[食材库\].*\n`).ReplaceAllString(files[spec], "")
	root, result := archiveFiles(t, files, false)
	mustOK(t, result)
	if has(root, P("pages/pantry")) {
		t.Fatal("pantry folder should be gone")
	}
	matches(t, `(?m)^usedBy: \["\[\[cookbook\]\]"\]$`, read(t, root, P("components/NavBar/NavBar.md")))
	after, _ := check.Run(root, check.Defaults())
	if len(after.Violations) != 0 {
		t.Fatal(dumpResult(Result{Violations: after.Violations}))
	}
}

// ---------- nothing is written when it would not pass ----------

func TestRefusedADeltaThatFailsValidationLeavesProdTheSpecAndTmpByteForByteAsTheyWere(t *testing.T) {
	files := requirement(true)
	k := D("pages/cookbook/cookbook--share-sheet.md")
	files[k] = strings.Replace(files[k], "page: \"[[cookbook]]\"", "page: \"[[cookbook]]\"\nasync:\n  loading: \"[[cookbook--share-sheet]]\"", 1)
	root := repo(t, files)
	before := snapshot(t, root)
	result, err := ArchiveSpec(root, slug, false)
	if err != nil {
		t.Fatal(err)
	}
	if result.OK {
		t.Fatal("should be refused")
	}
	eq(t, result.Stage, "校验")
	found := false
	for _, v := range result.Violations {
		if v.Rule == 2 && strings.Contains(v.Field, "async.failure") {
			found = true
		}
	}
	if !found {
		t.Fatal(dumpResult(result))
	}
	eq(t, snapshot(t, root), before)
}

func TestRefusedAnArchiveAlreadyBrokenBeforeTheDeltaIsNotMadeWorseNothingWritten(t *testing.T) {
	files := requirement(true)
	delete(files, P("components/NavBar/NavBar.md"))
	root := repo(t, files)
	before := snapshot(t, root)
	result, err := ArchiveSpec(root, slug, false)
	if err != nil {
		t.Fatal(err)
	}
	if result.OK {
		t.Fatal("should be refused")
	}
	eq(t, snapshot(t, root), before)
}

func TestRefusedAFigureThatWouldOverwriteADifferentFileOfTheSameNameIsAConflictNothingWritten(t *testing.T) {
	files := requirement(true)
	files[P("pages/cookbook/assets/flows/flow-3-misc.png")] = png("older")
	root := repo(t, files)
	before := snapshot(t, root)
	result, err := ArchiveSpec(root, slug, false)
	if err != nil {
		t.Fatal(err)
	}
	if result.OK {
		t.Fatal("should be refused")
	}
	matches(t, `flow-3-misc\.png 已经存在且内容不同`, strings.Join(result.Errors, "\n"))
	eq(t, snapshot(t, root), before)
}

func TestAnIdenticalFigureAlreadyInProdIsFine(t *testing.T) {
	files := requirement(true)
	files[P("pages/cookbook/assets/flows/flow-3-misc.png")] = png("flow-3")
	_, result := archiveFiles(t, files, false)
	mustOK(t, result)
}

func TestRefusedAFigureThatNamesNoStateAndADeltaWithNoPageOrStateToPutItIn(t *testing.T) {
	files := fixture.Compliant()
	files[tmp+"/canvas/assets/flows/lonely.png"] = png("x")
	root := repo(t, files)
	before := snapshot(t, root)
	result, err := ArchiveSpec(root, slug, false)
	if err != nil {
		t.Fatal(err)
	}
	if result.OK {
		t.Fatal("should be refused")
	}
	matches(t, `lonely\.png 对应不上任何页面`, strings.Join(result.Errors, "\n"))
	eq(t, snapshot(t, root), before)
}

// ---------- dry-run ----------

func TestDryRunValidatesAndReportsTheSameSummaryWritesNothing(t *testing.T) {
	root := repo(t, requirement(true))
	before := snapshot(t, root)
	result, err := ArchiveSpec(root, slug, true)
	if err != nil {
		t.Fatal(err)
	}
	mustOK(t, result)
	if !result.DryRun {
		t.Fatal("dryRun should be set")
	}
	eq(t, result.Summary.Removed, []string{"pantry--empty"})
	eq(t, len(result.Summary.Figures), 3)
	eq(t, snapshot(t, root), before)
	// and it matches what a real run then does
	real, err := ArchiveSpec(root, slug, false)
	if err != nil {
		t.Fatal(err)
	}
	eq(t, real.Summary, result.Summary)
}

func TestDryRunOnADeltaThatDoesNotPassStillRefuses(t *testing.T) {
	files := requirement(true)
	delete(files, D("components/ShareButton/ShareButton.md"))
	root := repo(t, files)
	before := snapshot(t, root)
	result, err := ArchiveSpec(root, slug, true)
	if err != nil {
		t.Fatal(err)
	}
	if result.OK {
		t.Fatal("should be refused")
	}
	eq(t, snapshot(t, root), before)
}

// ---------- LFS ----------

func TestHintsNoLFSRulesOneHintAndNoGitignoreLineIsAskedForTheFileIsNotCreatedOrTouched(t *testing.T) {
	root := repo(t, requirement(false))
	result, err := ArchiveSpec(root, slug, false)
	if err != nil {
		t.Fatal(err)
	}
	mustOK(t, result)
	eq(t, kinds(result.Hints), []string{"lfs"})
	matches(t, `docs/design/prod/\*\*/assets/\*\*/\*\.png filter=lfs`, result.Hints[0].Message)
	matches(t, `\*\.gif`, result.Hints[0].Message)
	matches(t, `\*\.webm`, result.Hints[0].Message)
	if has(root, ".gitattributes") || has(root, ".gitignore") {
		t.Fatal("the writer must not create these")
	}
}

func TestHintsExistingFilesAreLeftByteForByteOnlyTheMissingExtensionsAreNamed(t *testing.T) {
	files := requirement(true)
	files[".gitattributes"] = "* text=auto\ndocs/design/prod/**/assets/**/*.png filter=lfs diff=lfs merge=lfs -text\n"
	files[".gitignore"] = "node_modules/\n"
	root := repo(t, files)
	result, err := ArchiveSpec(root, slug, false)
	if err != nil {
		t.Fatal(err)
	}
	eq(t, kinds(result.Hints), []string{"lfs"})
	notMatches(t, `\*\.png`, result.Hints[0].Message)
	matches(t, `(?s)\*\.gif.*\*\.webm`, result.Hints[0].Message)
	eq(t, read(t, root, ".gitattributes"), files[".gitattributes"])
	eq(t, read(t, root, ".gitignore"), files[".gitignore"])
}

func TestHintsAMissingMainViewportThemeLocaleInProdIndexIsSaidOnce(t *testing.T) {
	files := requirement(true)
	files[P("index.md")] = "---\ntype: design-index\ntags: [design]\nsummary: 索引\n---\n\n# 设计档案\n"
	_, result := archiveFiles(t, files, false)
	eq(t, kinds(result.Hints), []string{"index"})
}

func TestHintsASpecLinkIntoTmpThatIsNotArchivedIsNamedItWouldDangle(t *testing.T) {
	files := requirement(true)
	files[spec] += "\n[画布](../../design/tmp/" + slug + "/canvas/" + slug + ".html)\n"
	_, result := archiveFiles(t, files, false)
	mustOK(t, result)
	eq(t, kinds(result.Hints), []string{"dangling"})
}

func TestLFSCoversPatternsTheWayGitReadsThem(t *testing.T) {
	p := func(ext string) string { return "docs/design/prod/pages/x/assets/a." + ext }
	for _, c := range []struct {
		attrs, path string
		want        bool
	}{
		{lfs, p("png"), true},
		{lfs, p("webm"), true},
		{lfs, p("jpg"), false},
		{"*.png filter=lfs diff=lfs merge=lfs -text\n", p("png"), true},
		{"docs/design/prod/** filter=lfs\n", p("gif"), true},
		{"docs/design/prod/**/assets/*.png filter=lfs\n", p("png"), true},
		{"docs/design/prod/**/assets/*.png filter=lfs\n", "docs/design/prod/pages/x/assets/flows/a.png", false},
		{"docs/design/prod/**/assets/**/*.png filter=lfs\n", "docs/design/prod/pages/x/assets/flows/a.png", true},
		{"docs/other/**/*.png filter=lfs\n", p("png"), false},
		{"*.png filter=lfs\n*.png -filter\n", p("png"), false},
		{"# *.png filter=lfs\n", p("png"), false},
		{"", p("png"), false},
	} {
		if got := LFSCovers(c.attrs, c.path); got != c.want {
			t.Fatalf("LFSCovers(%q, %q) = %v, want %v", c.attrs, c.path, got, c.want)
		}
	}
}

// ---------- usage ----------

func TestNothingToArchiveASpecWithoutATmpFolderIsAUsageErrorNotANoOp(t *testing.T) {
	root := repo(t, fixture.Compliant())
	_, err := ArchiveSpec(root, slug, false)
	var ue *UsageError
	if !errors.As(err, &ue) {
		t.Fatalf("want a usage error, got %v", err)
	}
	matches(t, `没有 docs/design/tmp/demo-spec/`, err.Error())
	_, err = ArchiveSpec(root, "../etc", false)
	if !errors.As(err, &ue) {
		t.Fatalf("want a usage error, got %v", err)
	}
	matches(t, `不合法`, err.Error())
}

func TestARequirementWithNoDeltaStillMovesItsFiguresAndEmptiesTmp(t *testing.T) {
	files := fixture.Compliant()
	files[tmp+"/canvas/a.html"] = "<html></html>"
	files[tmp+"/canvas/assets/flows/flow-1-cookbook--list.png"] = png("f")
	files[spec] += "\n![流程](../../design/tmp/" + slug + "/canvas/assets/flows/flow-1-cookbook--list.png)\n"
	root, result := archiveFiles(t, files, false)
	mustOK(t, result)
	if !has(root, P("pages/cookbook/assets/flows/flow-1-cookbook--list.png")) {
		t.Fatal("figure not moved")
	}
	if has(root, tmp) {
		t.Fatal("tmp should be emptied")
	}
	after, _ := check.Run(root, check.Defaults())
	if len(after.Violations) != 0 {
		t.Fatal(dumpResult(Result{Violations: after.Violations}))
	}
}

// ---------- command line ----------

func cli(args ...string) (string, string, int) {
	root := &cobra.Command{Use: "dyna", SilenceErrors: true, SilenceUsage: true}
	root.AddCommand(Command())
	var out, errOut bytes.Buffer
	root.SetOut(&out)
	root.SetErr(&errOut)
	root.SetArgs(append([]string{"write"}, args...))
	err := root.Execute()
	if err == nil {
		return out.String(), errOut.String(), 0
	}
	var exit *nexterr.Exit
	if errors.As(err, &exit) {
		if exit.Msg != "" {
			errOut.WriteString(exit.Msg + "\n")
		}
		return out.String(), errOut.String(), exit.Code
	}
	errOut.WriteString(err.Error() + "\n")
	return out.String(), errOut.String(), 1
}

func TestCLI0AndAReadableSummaryOnSuccessTheArchiveIsReallyWritten(t *testing.T) {
	root := repo(t, requirement(true))
	stdout, stderr, code := cli(root, slug)
	if code != 0 {
		t.Fatalf("code %d: %s", code, stderr)
	}
	matches(t, `已归档 demo-spec`, stdout)
	matches(t, `新增：ShareButton、cookbook--share-done、cookbook--share-sheet`, stdout)
	matches(t, `删除：pantry--empty`, stdout)
	matches(t, `flow-1-cookbook--share-sheet\.png → docs/design/prod/pages/cookbook/assets/flows/`, stdout)
	if has(root, tmp) {
		t.Fatal("tmp should be emptied")
	}
}

func TestCLIDryRunSaysSoAndWritesNothingJSONIsMachineReadable(t *testing.T) {
	root := repo(t, requirement(true))
	before := snapshot(t, root)
	stdout, stderr, code := cli(root, slug, "--dry-run")
	if code != 0 {
		t.Fatalf("code %d: %s", code, stderr)
	}
	matches(t, `dry-run`, stdout)
	eq(t, snapshot(t, root), before)
	stdout, _, _ = cli(root, slug, "--dry-run", "--json")
	var j struct {
		Ok      bool `json:"ok"`
		DryRun  bool `json:"dryRun"`
		Summary struct {
			Removed []string `json:"removed"`
		} `json:"summary"`
	}
	if err := json.Unmarshal([]byte(stdout), &j); err != nil {
		t.Fatalf("%v\n%s", err, stdout)
	}
	if !j.Ok || !j.DryRun {
		t.Fatalf("%+v", j)
	}
	eq(t, j.Summary.Removed, []string{"pantry--empty"})
	eq(t, snapshot(t, root), before)
}

func TestCLI1AndTheViolationsWhenValidationFailsNothingWritten(t *testing.T) {
	files := requirement(true)
	delete(files, D("components/ShareButton/ShareButton.md"))
	root := repo(t, files)
	before := snapshot(t, root)
	stdout, _, code := cli(root, slug)
	if code != 1 {
		t.Fatalf("code %d", code)
	}
	matches(t, `拒绝归档（校验）：什么都没写`, stdout)
	matches(t, `违规 \[规则 3 引用\].*ShareButton`, stdout)
	eq(t, snapshot(t, root), before)
}

func TestCLIUsageErrorsExit2(t *testing.T) {
	if _, _, code := cli(); code != 2 {
		t.Fatalf("no args: %d", code)
	}
	root := repo(t, fixture.Compliant())
	if _, _, code := cli(root, slug); code != 2 {
		t.Fatalf("nothing to archive: %d", code)
	}
	if _, _, code := cli(root, slug, "--nope"); code != 2 {
		t.Fatalf("unknown flag: %d", code)
	}
	if _, _, code := cli(repo(t, fixture.Files{"README.md": "x"}), slug); code != 2 {
		t.Fatalf("not a repo: %d", code)
	}
}

// ---------- pieces ----------

func TestSetUsedByReplacesEveryYAMLShapeTheFieldCanTakeAppendsWhenMissingTouchesNothingElse(t *testing.T) {
	doc := func(usedBy string) string {
		return "---\ntype: design-component\nsummary: x\n" + usedBy + "code: [a.tsx]\n---\n\n# body\nusedBy: stays\n"
	}
	want := "usedBy: [\"[[a]]\", \"[[b]]\"]\n"
	for _, old := range []string{
		"usedBy: []\n",
		"usedBy: [\"[[z]]\"]\n",
		"usedBy:\n  - \"[[z]]\"\n  - \"[[y]]\"\n",
		"usedBy:\n- \"[[z]]\"\n",
		"usedBy: [\n  \"[[z]]\",\n  \"[[y]]\",\n]\n",
		"usedBy: [\"[[z]]\"] # stale\n",
	} {
		eq(t, SetUsedBy(doc(old), []string{"a", "b"}), doc(want))
	}
	eq(t, SetUsedBy(doc(""), []string{"a", "b"}), "---\ntype: design-component\nsummary: x\ncode: [a.tsx]\nusedBy: [\"[[a]]\", \"[[b]]\"]\n---\n\n# body\nusedBy: stays\n")
	eq(t, SetUsedBy(doc("usedBy: []\n"), nil), doc("usedBy: []\n"))
	eq(t, SetUsedBy("no frontmatter\n", []string{"a"}), "no frontmatter\n")
	eq(t, SetUsedBy(strings.ReplaceAll(doc("usedBy: []\n"), "\n", "\r\n"), []string{"a"}), strings.ReplaceAll(doc("usedBy: [\"[[a]]\"]\n"), "\n", "\r\n"))
}

func TestRewriteLinksRelativeRootRelativeAndAbsoluteStylesKeepTheirStyleAnchorsAndTitlesSurviveForeignLinksStay(t *testing.T) {
	moved := map[string]string{"docs/design/tmp/s/canvas/assets/flows/a.png": "docs/design/prod/pages/p/assets/flows/a.png"}
	text := strings.Join([]string{
		"![a](../../design/tmp/s/canvas/assets/flows/a.png)",
		"![b](docs/design/tmp/s/canvas/assets/flows/a.png \"t\")",
		"![c](/docs/design/tmp/s/canvas/assets/flows/a.png#x)",
		"![d](https://example.com/docs/design/tmp/s/canvas/assets/flows/a.png)",
		"[e](../../design/tmp/s/canvas/assets/flows/other.png)",
	}, "\n")
	out, changes := RewriteLinks(text, "docs/spec/s", moved)
	eq(t, out, strings.Join([]string{
		"![a](../../design/prod/pages/p/assets/flows/a.png)",
		"![b](docs/design/prod/pages/p/assets/flows/a.png \"t\")",
		"![c](/docs/design/prod/pages/p/assets/flows/a.png#x)",
		"![d](https://example.com/docs/design/tmp/s/canvas/assets/flows/a.png)",
		"[e](../../design/tmp/s/canvas/assets/flows/other.png)",
	}, "\n"))
	eq(t, len(changes), 3)
}

func TestRenderIndexFourTablesEmptyOnesSay无AMissingIndexGetsAMinimalFrontmatterPipesInTextAreEscaped(t *testing.T) {
	root := repo(t, fixture.Compliant())
	a, err := archive.Load(root, archive.Options{})
	if err != nil {
		t.Fatal(err)
	}
	existing := read(t, root, P("index.md"))
	text := RenderIndex(a, &existing)
	for _, h := range []string{"## 页面", "## 组件", "## 动效", "## 用户路径"} {
		if !strings.Contains(text, h) {
			t.Fatal(h)
		}
	}
	matches(t, `^---\ntype: design-index\n(?s:.*?)viewport: 1440x900(?s:.*?)\n---\n`, text)
	if strings.Index(text, "[[NavBar]]") > strings.Index(text, "[[RecipeCard]]") {
		t.Fatal("rows are sorted by id")
	}
	bare := RenderIndex(a, nil)
	matches(t, `^---\ntype: design-index\ntags: \[design\]\nsummary: 设计档案索引\n---\n`, bare)
	a.Objects["RecipeCard"].FM.Set("summary", "卡片 | 带竖线\n两行")
	matches(t, `卡片 \\\| 带竖线 两行`, RenderIndex(a, nil))
	emptyRoot := repo(t, fixture.Files{P("index.md"): fixture.Compliant()[P("index.md")]})
	empty, err := archive.Load(emptyRoot, archive.Options{})
	if err != nil {
		t.Fatal(err)
	}
	matches(t, `## 页面\n\n无\n`, RenderIndex(empty, nil))
}
