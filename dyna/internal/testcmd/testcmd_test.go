package testcmd

import (
	"bytes"
	"context"
	"errors"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/nexterr"
)

func put(t *testing.T, path, text string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(text), 0o644); err != nil {
		t.Fatal(err)
	}
}

// exec runs a command line against d and returns what it printed and the error it returned.
func execCmd(d Deps, args ...string) (stdout, stderr string, err error) {
	var out, errb bytes.Buffer
	root := CommandWith(d)
	root.SetOut(&out)
	root.SetErr(&errb)
	root.SetArgs(args)
	err = root.Execute()
	return out.String(), errb.String(), err
}

// pluginWithSkill is a plugin whose skill demo has a body of bodyChars characters and one section.
func pluginWithSkill(t *testing.T, bodyChars int, files map[string]string) (root, skillDir string) {
	t.Helper()
	root = t.TempDir()
	put(t, filepath.Join(root, ".claude-plugin", "plugin.json"), `{"name":"demo-plugin"}`)
	skillDir = filepath.Join(root, "skills", "productivity", "demo")
	body := "## 有的一节\n"
	body += strings.Repeat("字", bodyChars-len([]rune(body)))
	put(t, filepath.Join(skillDir, "SKILL.md"), "---\nname: demo\ndescription: 这行不算字数\n---\n"+body)
	for rel, text := range files {
		put(t, filepath.Join(root, rel), text)
	}
	return root, skillDir
}

func TestSkillDocPassesASkillWhoseQuotedSectionsExistAndSaysHowManyItChecked(t *testing.T) {
	_, skillDir := pluginWithSkill(t, 100, map[string]string{"README.md": "见 `idea-loop:demo` 的「有的一节」。\n"})
	out, _, err := execCmd(Deps{}, "skill-doc", skillDir)
	if err != nil {
		t.Fatal(err, out)
	}
	for _, want := range []string{"demo", "1 处"} {
		if !strings.Contains(out, want) {
			t.Errorf("the report lacks %q: %s", want, out)
		}
	}
}

func TestSkillDocDoesNotMeasureTheBody(t *testing.T) {
	// how long a body may be is `spec skill-lint`'s line, held in one place; skill-doc checks the pointers only
	_, skillDir := pluginWithSkill(t, 9000, map[string]string{"README.md": "见 `idea-loop:demo` 的「有的一节」。\n"})
	out, _, err := execCmd(Deps{}, "skill-doc", skillDir)
	if err != nil {
		t.Fatalf("a long body is not skill-doc's concern: %v", err)
	}
	if strings.Contains(out, "9000") || strings.Contains(out, "上限") {
		t.Errorf("the report counts no characters: %s", out)
	}
}

func TestSkillDocIsRedForADanglingSectionAndNamesTheFileAndLine(t *testing.T) {
	_, skillDir := pluginWithSkill(t, 100, map[string]string{"agents/a.md": "第一行\n见 `idea-loop:demo` 的「改过名的一节」。\n"})
	_, _, err := execCmd(Deps{}, "skill-doc", skillDir)
	if err == nil {
		t.Fatal("a quoted section that is not a heading must be red")
	}
	if want := filepath.Join("agents", "a.md") + ":2  「改过名的一节」"; !strings.Contains(err.Error(), want) {
		t.Fatalf("want %q in %v", want, err)
	}
	var ne *nexterr.Error
	if !errors.As(err, &ne) || ne.Next != "" {
		t.Fatalf("the message already says what to do, no next command is appended: %#v", err)
	}
}

func TestSkillDocMinPointersCatchesAWrongSkillNameThatScansNothing(t *testing.T) {
	_, skillDir := pluginWithSkill(t, 100, nil)
	if _, _, err := execCmd(Deps{}, "skill-doc", skillDir); err != nil {
		t.Fatal(err)
	}
	_, _, err := execCmd(Deps{}, "skill-doc", skillDir, "--min-pointers", "1")
	if err == nil || !strings.Contains(err.Error(), "至少 1 处") {
		t.Fatal(err)
	}
}

func TestSkillDocFindsThePluginAboveTheSkillOrTakesOneFromAFlagOrTheEnvironment(t *testing.T) {
	root, skillDir := pluginWithSkill(t, 100, nil)
	// a skill folder outside any plugin: the flag, then the environment variable, name the plugin to scan
	loose := t.TempDir()
	put(t, filepath.Join(loose, "demo", "SKILL.md"), "---\nname: demo\n---\n## 有的一节\n")
	put(t, filepath.Join(root, "README.md"), "见 `idea-loop:demo` 的「不存在」。\n")

	if _, _, err := execCmd(Deps{}, "skill-doc", skillDir); err == nil || !strings.Contains(err.Error(), "README.md:1") {
		t.Fatalf("plugin found above the skill: %v", err)
	}
	if _, _, err := execCmd(Deps{}, "skill-doc", filepath.Join(loose, "demo")); err == nil || !strings.Contains(err.Error(), "找不到插件根目录") {
		t.Fatalf("no plugin, no flag, no environment: %v", err)
	}
	if _, _, err := execCmd(Deps{}, "skill-doc", filepath.Join(loose, "demo"), "--plugin", root); err == nil || !strings.Contains(err.Error(), "README.md:1") {
		t.Fatalf("--plugin: %v", err)
	}
	env := Deps{Env: func(k string) string {
		if k == envPluginRoot {
			return root
		}
		return ""
	}}
	if _, _, err := execCmd(env, "skill-doc", filepath.Join(loose, "demo")); err == nil || !strings.Contains(err.Error(), "README.md:1") {
		t.Fatalf("environment: %v", err)
	}
}

func TestSkillDocNeedsASkillFolder(t *testing.T) {
	if _, _, err := execCmd(Deps{}); err != nil {
		t.Fatal("a bare group prints its table")
	}
	if _, _, err := execCmd(Deps{}, "skill-doc"); err == nil || !strings.Contains(err.Error(), "usage") {
		t.Fatal(err)
	}
	if _, _, err := execCmd(Deps{}, "skill-doc", t.TempDir()); err == nil || !strings.Contains(err.Error(), "SKILL.md") {
		t.Fatal(err)
	}
}

// pluginWithTests is a plugin with these test files under scripts/ (plus a helper that is not a test).
func pluginWithTests(t *testing.T, names ...string) string {
	t.Helper()
	root := t.TempDir()
	put(t, filepath.Join(root, ".claude-plugin", "plugin.json"), `{"name":"demo-plugin"}`)
	put(t, filepath.Join(root, "scripts", "helper.mjs"), "export const x = 1;\n")
	for _, n := range names {
		put(t, filepath.Join(root, "scripts", n), "// test\n")
	}
	return root
}

type call struct {
	dir, name string
	args      []string
}

func recorder(code int, calls *[]call) Runner {
	return func(ctx context.Context, dir, name string, args []string, stdout, stderr io.Writer) (int, error) {
		*calls = append(*calls, call{dir, name, args})
		io.WriteString(stdout, "node says hi\n")
		return code, nil
	}
}

func TestRunWithAMatchPassesOnlyTheTestFilesWhoseNameContainsIt(t *testing.T) {
	root := pluginWithTests(t, "issues.test.mjs", "issues-skill-doc.test.mjs", "seo-issues.test.mjs", "spec.test.mjs")
	var calls []call
	out, errs, err := execCmd(Deps{Cwd: root, Run: recorder(0, &calls)}, "run", "issues")
	if err != nil {
		t.Fatal(err)
	}
	want := []call{{root, "node", []string{"--test", "scripts/issues-skill-doc.test.mjs", "scripts/issues.test.mjs", "scripts/seo-issues.test.mjs"}}}
	if !reflect.DeepEqual(calls, want) {
		t.Fatalf("%+v", calls)
	}
	if out != "node says hi\n" || !strings.Contains(errs, "「issues」的 3 个") {
		t.Fatalf("what node printed goes to stdout untouched; the header goes to stderr: %q %q", out, errs)
	}
}

func TestRunWithoutAMatchPassesEveryTestFileAndOnlyTestFiles(t *testing.T) {
	root := pluginWithTests(t, "a.test.mjs", "b.test.mjs")
	put(t, filepath.Join(root, "scripts", "sub", "c.test.mjs"), "// not at the top of scripts/\n")
	var calls []call
	if _, _, err := execCmd(Deps{Cwd: root, Run: recorder(0, &calls)}, "run"); err != nil {
		t.Fatal(err)
	}
	if got := calls[0].args; !reflect.DeepEqual(got, []string{"--test", "scripts/a.test.mjs", "scripts/b.test.mjs"}) {
		t.Fatal(got)
	}
}

func TestRunEndsWithTheExitCodeOfTheTestRunner(t *testing.T) {
	root := pluginWithTests(t, "a.test.mjs")
	var calls []call
	_, _, err := execCmd(Deps{Cwd: root, Run: recorder(3, &calls)}, "run")
	var exit *nexterr.Exit
	if !errors.As(err, &exit) || exit.Code != 3 {
		t.Fatalf("%#v", err)
	}
}

func TestRunSaysSoWhenNoTestFileMatchesAndDoesNotStartNode(t *testing.T) {
	root := pluginWithTests(t, "a.test.mjs", "b.test.mjs")
	var calls []call
	_, _, err := execCmd(Deps{Cwd: root, Run: recorder(0, &calls)}, "run", "zzz")
	if err == nil || !strings.Contains(err.Error(), "「zzz」") || !strings.Contains(err.Error(), "共 2 个") {
		t.Fatal(err)
	}
	if len(calls) != 0 {
		t.Fatal("nothing to run, so node is not started")
	}
}

func TestRunFindsThePluginFromTheRepoRootOrFromInsideItOrFromAFlagOrTheEnvironment(t *testing.T) {
	repo := t.TempDir()
	plug := filepath.Join(repo, "idea-loop")
	put(t, filepath.Join(plug, ".claude-plugin", "plugin.json"), `{"name":"demo-plugin"}`)
	put(t, filepath.Join(plug, "scripts", "a.test.mjs"), "// test\n")
	var calls []call
	for name, d := range map[string]Deps{
		"repo root":     {Cwd: repo},
		"inside plugin": {Cwd: filepath.Join(plug, "scripts")},
	} {
		d.Run = recorder(0, &calls)
		if _, _, err := execCmd(d, "run"); err != nil {
			t.Fatal(name, err)
		}
	}
	elsewhere := t.TempDir()
	if _, _, err := execCmd(Deps{Cwd: elsewhere, Run: recorder(0, &calls)}, "run"); err == nil || !strings.Contains(err.Error(), "找不到插件根目录") {
		t.Fatal(err)
	}
	if _, _, err := execCmd(Deps{Cwd: elsewhere, Run: recorder(0, &calls)}, "run", "--plugin", plug); err != nil {
		t.Fatal(err)
	}
	env := func(k string) string {
		if k == envPluginRoot {
			return plug
		}
		return ""
	}
	if _, _, err := execCmd(Deps{Cwd: elsewhere, Env: env, Run: recorder(0, &calls)}, "run"); err != nil {
		t.Fatal(err)
	}
	if len(calls) != 4 {
		t.Fatalf("%d runs", len(calls))
	}
	for _, c := range calls {
		if c.dir != plug {
			t.Fatalf("node runs in the plugin root: %s", c.dir)
		}
	}
}

// With a real node: the files that match run and report their own result, the ones that do not are not run.
func TestRunWithTheRealNodeRunsOnlyTheMatchingFileAndReturnsItsResult(t *testing.T) {
	if _, err := exec.LookPath("node"); err != nil {
		t.Skip("node is not installed")
	}
	root := pluginWithTests(t)
	put(t, filepath.Join(root, "scripts", "issues.test.mjs"), "import { test } from 'node:test';\ntest('the issues one', () => {});\n")
	put(t, filepath.Join(root, "scripts", "other.test.mjs"), "import { test } from 'node:test';\ntest('the other one', () => { throw new Error('must not run'); });\n")

	out, _, err := execCmd(Deps{Cwd: root}, "run", "issues")
	if err != nil {
		t.Fatalf("%v\n%s", err, out)
	}
	if !strings.Contains(out, "the issues one") || strings.Contains(out, "the other one") {
		t.Fatalf("%s", out)
	}

	out, _, err = execCmd(Deps{Cwd: root}, "run", "other")
	var exit *nexterr.Exit
	if !errors.As(err, &exit) || exit.Code == 0 || !strings.Contains(out, "the other one") {
		t.Fatalf("a failing test file ends red: %v\n%s", err, out)
	}
}

func TestRunSaysWhenNodeCannotBeStarted(t *testing.T) {
	root := pluginWithTests(t, "a.test.mjs")
	failing := func(ctx context.Context, dir, name string, args []string, stdout, stderr io.Writer) (int, error) {
		return -1, errors.New("exec: \"node\": executable file not found in $PATH")
	}
	_, _, err := execCmd(Deps{Cwd: root, Run: failing}, "run")
	if err == nil || !strings.Contains(err.Error(), "Node") {
		t.Fatal(err)
	}
}
