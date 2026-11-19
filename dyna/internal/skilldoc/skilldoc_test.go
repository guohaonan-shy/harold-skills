package skilldoc

import (
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"testing"
)

// plugin makes a throwaway plugin tree with one skill named demo that has the section 「有的一节」, plus the files given.
func plugin(t *testing.T, files map[string]string) (root, skillDir string) {
	t.Helper()
	root = t.TempDir()
	skillDir = filepath.Join(root, "skills", "productivity", "demo")
	put(t, filepath.Join(skillDir, "SKILL.md"), "---\nname: demo\n---\n\n## 有的一节\n")
	for rel, text := range files {
		put(t, filepath.Join(root, rel), text)
	}
	return root, skillDir
}

func put(t *testing.T, path, text string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(text), 0o644); err != nil {
		t.Fatal(err)
	}
}

// Moved from skill-doc-check.test.mjs: the check covers the whole plugin, not only skills/ and agents/.
func TestADanglingPointerIsCaughtInFilesOutsideSkillsAndAgents(t *testing.T) {
	dangling := "见 `idea-loop:demo` 的「不存在的一节」。\n"
	root, skillDir := plugin(t, map[string]string{
		"README.md":                           dangling,
		"scripts/x.mjs":                       "// " + dangling,
		"evals/retro/cases/a/annotations.md":  dangling,
		"skills/design/other/references/y.md": dangling,
	})
	got, err := DanglingSectionPointers(root, skillDir, "demo")
	if err != nil {
		t.Fatal(err)
	}
	if got.Seen != 4 {
		t.Fatalf("seen %d, want 4: %v", got.Seen, got.Bad)
	}
	var files []string
	for _, b := range got.Bad {
		files = append(files, strings.SplitN(b, ":", 2)[0])
	}
	sort.Strings(files)
	want := []string{"README.md", "evals/retro/cases/a/annotations.md", "scripts/x.mjs", "skills/design/other/references/y.md"}
	if !reflect.DeepEqual(files, want) {
		t.Fatalf("bad files %v, want %v", files, want)
	}
	if got.Bad[0] != "README.md:1  「不存在的一节」" && !strings.HasSuffix(got.Bad[0], ":1  「不存在的一节」") {
		t.Fatalf("a finding names the file, the line and the title: %q", got.Bad[0])
	}
}

// Moved from skill-doc-check.test.mjs.
func TestAPointerToAnExistingSectionPasses(t *testing.T) {
	root, skillDir := plugin(t, map[string]string{"README.md": "见 `idea-loop:demo` 的「有的一节」。\n"})
	got, err := DanglingSectionPointers(root, skillDir, "demo")
	if err != nil {
		t.Fatal(err)
	}
	if got.Seen != 1 || len(got.Bad) != 0 {
		t.Fatalf("%+v", got)
	}
}

func TestEveryPointerShapeIsRead(t *testing.T) {
	root, skillDir := plugin(t, map[string]string{
		"skills/design/demo/references/more.md": "# 参考\n\n## 另一节：副标题\n\n### 括号节（附注）\n\n```\n## 围栏里的不是标题\n```\n",
		"a.md": strings.Join([]string{
			"`idea-loop:demo`，看它的「有的一节」到「另一节」",
			"（`idea-loop:demo`（看它的「括号节」）",
			"`idea-loop:demo` 的 `references/more.md`「有的一节」「另一节」",
			"`idea-loop:demo` 的「有的一节」里的「括号节」、「围栏里的不是标题」",
			"`idea-loop:other` 的「不归 demo 管」",
			"`idea-loop:demo` 没有引号的话不算",
		}, "\n"),
	})
	// the references file sits in a different skill's folder, so the demo skill's own references/ is empty:
	put(t, filepath.Join(skillDir, "references", "more.md"), "# 参考\n\n## 另一节：副标题\n\n### 括号节（附注）\n\n```\n## 围栏里的不是标题\n```\n")
	got, err := DanglingSectionPointers(root, skillDir, "demo")
	if err != nil {
		t.Fatal(err)
	}
	// 2 (到) + 1 + 2 + 3 = 8 titles; only the one inside the code fence is missing; `idea-loop:other` is not demo's.
	if got.Seen != 8 {
		t.Fatalf("seen %d: %v", got.Seen, got.Bad)
	}
	if len(got.Bad) != 1 || !strings.Contains(got.Bad[0], "「围栏里的不是标题」") || !strings.HasPrefix(got.Bad[0], "a.md:4") {
		t.Fatalf("%v", got.Bad)
	}
}

func TestHiddenDirectoriesAndNodeModulesAreNotScanned(t *testing.T) {
	dangling := "见 `idea-loop:demo` 的「不存在的一节」。\n"
	root, skillDir := plugin(t, map[string]string{
		".git/notes.md":            dangling,
		"node_modules/x/README.md": dangling,
		"notes.txt":                dangling,
	})
	got, err := DanglingSectionPointers(root, skillDir, "demo")
	if err != nil {
		t.Fatal(err)
	}
	if got.Seen != 0 {
		t.Fatalf("%+v", got)
	}
}

func TestBodyCharsCountsUTF8CharactersAfterTheFrontmatter(t *testing.T) {
	dir := t.TempDir()
	put(t, filepath.Join(dir, "SKILL.md"), "---\nname: x\ndescription: 这一段不算\n---\n汉字ab \n")
	got, err := BodyChars(dir)
	if err != nil {
		t.Fatal(err)
	}
	// 2 han + a + b + space + newline: characters, not the 3 bytes a han takes
	if got != 6 {
		t.Fatalf("%d", got)
	}
	put(t, filepath.Join(dir, "SKILL.md"), "没有 frontmatter\n")
	if got, _ = BodyChars(dir); got != 15 {
		t.Fatalf("a file without frontmatter is all body: %d", got)
	}
}

func TestBodyIsWhatFollowsTheClosingDashes(t *testing.T) {
	if got := Body("---\na: 1\n---\n正文\n---\n后面的横线不算\n"); got != "正文\n---\n后面的横线不算\n" {
		t.Fatalf("%q", got)
	}
}
