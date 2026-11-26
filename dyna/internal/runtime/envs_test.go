package runtime_test

// Recognising an environment by the marker line at the top of its description, which lives in one of three places
// (the main checkout's .idea-loop/runtime/, <home>/runtime/, ~/.idea-loop/runtime/), and the environment the human
// picked in a `selected` file there. dyna holds no list of environments, and the plugin carries no description: a
// session that matches none is told so.

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	rt "github.com/guohaonan-shy/harold-skills/dyna/internal/runtime"
)

const (
	zedDoc      = "# zed\n\n标记：`ZED_SESSION`\n\n## 定时任务\n\nzed 的定时任务做法\n\n## 推送\n\nzed 的推送做法\n"
	deskDoc     = "# desk\n\n标记：没有\n\n## 浏览器\n\n### 给人看\n\ndesk 的浏览器做法\n\n### 无头\n\ndesk 无头\n\n## 推送\n\ndesk 推送\n"
	noMarkerDoc = "# plain\n\n## 推送\n\nx\n"
)

// zedFrom is zed's description saying in its 推送 section where it came from.
func zedFrom(place string) string {
	return "# zed\n\n标记：`ZED_SESSION`\n\n## 推送\n\n来自" + place + "的推送做法\n"
}

// homeWith is a home directory with these files under runtime/ (name -> content).
func homeWith(t *testing.T, files map[string]string) string {
	t.Helper()
	h := t.TempDir()
	for name, content := range files {
		writeFile(t, filepath.Join(h, "runtime", name), content)
	}
	return h
}

// userRootWith is a user's home directory with these files under .idea-loop/runtime/.
func userRootWith(t *testing.T, files map[string]string) string {
	t.Helper()
	u := t.TempDir()
	for name, content := range files {
		writeFile(t, filepath.Join(u, ".idea-loop", "runtime", name), content)
	}
	return u
}

// projectWith is a git repository with these files under .idea-loop/runtime/.
func projectWith(t *testing.T, files map[string]string) string {
	t.Helper()
	repo := newRepo(t)
	for name, content := range files {
		writeFile(t, filepath.Join(repo, ".idea-loop", "runtime", name), content)
	}
	return repo
}

func firstLine(s string) string { return strings.SplitN(s, "\n", 2)[0] }

// reference is what the SessionStart hook injects about the environment, run in cwd.
func reference(cwd string, e map[string]string) outcome {
	return dynaIn(cwd, e, "runtime", "inject", "reference")
}

func TestADescriptionWithAMarkerIsRecognisedByItsMarkerVariable(t *testing.T) {
	h := homeWith(t, map[string]string{"zed.md": zedDoc})
	if r := dyna(env("IDEA_LOOP_HOME", h, "ZED_SESSION", "1"), "runtime", "name"); r.code != 0 || r.stdout != "zed\n" {
		t.Fatalf("name: %+v", r)
	}
	r := dyna(env("IDEA_LOOP_HOME", h, "ZED_SESSION", "1"), "runtime", "show", "推送")
	if r.code != 0 || r.stdout != "## 推送\n\nzed 的推送做法\n" {
		t.Fatalf("show: %+v", r)
	}
	// without the variable the session is not zed, and nothing says it is anything else
	if r := dyna(env("IDEA_LOOP_HOME", h), "runtime", "name"); r.code != 1 || r.stdout != "" {
		t.Fatalf("no variable: %+v", r)
	}
}

func TestADescriptionIsInjectedAsItsWholeFile(t *testing.T) {
	h := homeWith(t, map[string]string{"zed.md": zedDoc})
	r := dyna(env("IDEA_LOOP_HOME", h, "ZED_SESSION", "1"), "runtime", "inject", "reference")
	want := "以下是运行环境「zed」的做法全文，开场注入，不必再取。\n\n" + strings.TrimSpace(zedDoc) + "\n"
	if r.code != 0 || r.stdout != want {
		t.Fatalf("%+v", r)
	}
	if r := dyna(env("IDEA_LOOP_HOME", h, "ZED_SESSION", "1"), "runtime", "inject", "runtime"); firstLine(r.stdout) != "当前运行环境：zed" {
		t.Fatalf("%+v", r)
	}
}

// ---- the three places ----

func TestTheProjectsDescriptionBeatsHomesAndHomesBeatsTheUserRootsWhateverTheirContent(t *testing.T) {
	repo := projectWith(t, map[string]string{"zed.md": zedFrom("项目")})
	h := homeWith(t, map[string]string{"zed.md": zedFrom("home")})
	u := userRootWith(t, map[string]string{"zed.md": zedFrom("用户根目录")})
	e := env("IDEA_LOOP_HOME", h, "HOME", u, "ZED_SESSION", "1")

	if r := reference(repo, e); r.code != 0 || !strings.Contains(r.stdout, "来自项目的推送做法") || strings.Contains(r.stdout, "来自home") || strings.Contains(r.stdout, "来自用户根目录") {
		t.Fatalf("in the project: %+v", r)
	}
	// not in a project: home's, whole, nothing of the user root's
	if r := reference(noCwd, e); r.code != 0 || !strings.Contains(r.stdout, "来自home的推送做法") || strings.Contains(r.stdout, "来自用户根目录") {
		t.Fatalf("no project: %+v", r)
	}
	// only the user root's is left
	e2 := env("IDEA_LOOP_HOME", noHome, "HOME", u, "ZED_SESSION", "1")
	if r := reference(noCwd, e2); r.code != 0 || !strings.Contains(r.stdout, "来自用户根目录的推送做法") {
		t.Fatalf("user root only: %+v", r)
	}
	// a project without the file falls through to home's
	empty := projectWith(t, nil)
	if r := reference(empty, e); r.code != 0 || !strings.Contains(r.stdout, "来自home的推送做法") {
		t.Fatalf("a project without it: %+v", r)
	}
}

func TestTheFileThatWinsIsUsedWholeAndNeverMergedWithTheOthers(t *testing.T) {
	repo := projectWith(t, map[string]string{"zed.md": "标记：`ZED_SESSION`\n\n## 推送\n\n只有项目的推送\n"})
	h := homeWith(t, map[string]string{"zed.md": zedDoc})
	e := env("IDEA_LOOP_HOME", h, "ZED_SESSION", "1")
	r := reference(repo, e)
	if strings.Contains(r.stdout, "定时任务") || strings.Contains(r.stdout, "zed 的推送做法") {
		t.Fatalf("something of home's came through: %s", r.stdout)
	}
	if s := dynaIn(repo, e, "runtime", "show", "定时任务"); s.code != 1 || !strings.Contains(s.stderr, "没有「定时任务」一节") {
		t.Fatalf("the project's file has no such section, and home's is not looked at: %+v", s)
	}
}

func TestADescriptionWithoutAMarkerLineDoesNotCountAndTheNextPlaceIsLookedAt(t *testing.T) {
	repo := projectWith(t, map[string]string{"zed.md": noMarkerDoc})
	h := homeWith(t, map[string]string{"zed.md": zedFrom("home")})
	e := env("IDEA_LOOP_HOME", h, "ZED_SESSION", "1")
	if r := reference(repo, e); !strings.Contains(r.stdout, "来自home的推送做法") {
		t.Fatalf("%+v", r)
	}
}

func TestInAWorktreeTheMainCheckoutsDescriptionIsFound(t *testing.T) {
	repo := projectWith(t, map[string]string{"zed.md": zedFrom("主 checkout")})
	wt := filepath.Join(filepath.Dir(repo), filepath.Base(repo)+"-wt")
	git(t, repo, "worktree", "add", "-q", wt, "-b", "side")
	t.Cleanup(func() { os.RemoveAll(wt) })
	e := env("ZED_SESSION", "1")
	if _, err := os.Stat(filepath.Join(wt, ".idea-loop")); err == nil {
		t.Fatal("the worktree itself has no .idea-loop/: the test is about the main checkout's")
	}
	if r := reference(wt, e); r.code != 0 || !strings.Contains(r.stdout, "来自主 checkout的推送做法") {
		t.Fatalf("in the worktree: %+v", r)
	}
	// and from a directory inside it
	sub := filepath.Join(wt, "a", "b")
	if err := os.MkdirAll(sub, 0o755); err != nil {
		t.Fatal(err)
	}
	if r := reference(sub, e); r.code != 0 || !strings.Contains(r.stdout, "来自主 checkout的推送做法") {
		t.Fatalf("in a directory of the worktree: %+v", r)
	}
	// the worktree's own .idea-loop/ is not the place: a file only there is not found
	writeFile(t, filepath.Join(wt, ".idea-loop", "runtime", "only-here.md"), "标记：`ONLY_HERE`\n\n## 推送\n\nx\n")
	if r := dynaIn(wt, env("ONLY_HERE", "1"), "runtime", "name"); r.code != 1 {
		t.Fatalf("the worktree's own root is not a place: %+v", r)
	}
}

func TestOutsideAGitRepositoryTheProjectPlaceIsSkipped(t *testing.T) {
	dir := t.TempDir() // not a repository; its .idea-loop/ is not looked at
	writeFile(t, filepath.Join(dir, ".idea-loop", "runtime", "zed.md"), zedFrom("这个目录"))
	h := homeWith(t, map[string]string{"zed.md": zedFrom("home")})
	r := reference(dir, env("IDEA_LOOP_HOME", h, "ZED_SESSION", "1"))
	if r.code != 0 || !strings.Contains(r.stdout, "来自home的推送做法") || strings.Contains(r.stdout, "来自这个目录") {
		t.Fatalf("%+v", r)
	}
}

// ---- nothing found ----

func TestWithNothingAnywhereTheThreeCommandsSayTheyCannotTell(t *testing.T) {
	e := env()
	name := dyna(e, "runtime", "name")
	if name.code != 1 || name.stdout != "" || !strings.Contains(name.stderr, "认不出运行环境") || !strings.Contains(name.stderr, "/idea-loop:setup") {
		t.Fatalf("name: %+v", name)
	}
	ref := dyna(e, "runtime", "inject", "reference")
	if ref.code != 0 || ref.stdout != "没有运行环境说明，跑 `/idea-loop:setup`\n" || ref.stderr != "" {
		t.Fatalf("inject reference: %+v", ref)
	}
	run := dyna(e, "runtime", "inject", "runtime")
	if run.code != 0 || firstLine(run.stdout) != "当前运行环境：没有（跑 /idea-loop:setup）" {
		t.Fatalf("inject runtime: %+v", run)
	}
	show := dyna(e, "runtime", "show", "推送")
	if show.code != 1 || !strings.Contains(show.stderr, "认不出运行环境") {
		t.Fatalf("show: %+v", show)
	}
}

func TestAMarkerVariableWithAValueAndNoDescriptionForItIsNotAnEnvironment(t *testing.T) {
	// the environment variable alone says nothing: dyna knows no names
	r := dyna(env("ZED_SESSION", "1", "MAGI_SESSION_ID", "abc"), "runtime", "name")
	if r.code != 1 {
		t.Fatalf("%+v", r)
	}
}

// ---- the pick in `selected` ----

func TestASelectionNamesTheEnvironmentOfADescriptionWithNoMarker(t *testing.T) {
	h := homeWith(t, map[string]string{"desk.md": deskDoc, "selected": " desk \n"})
	if r := dyna(env("IDEA_LOOP_HOME", h), "runtime", "name"); r.code != 0 || r.stdout != "desk\n" {
		t.Fatalf("name: %+v", r)
	}
	r := reference(noCwd, env("IDEA_LOOP_HOME", h))
	want := "以下是运行环境「desk」的做法全文，开场注入，不必再取。\n\n" + strings.TrimSpace(deskDoc) + "\n"
	if r.code != 0 || r.stdout != want {
		t.Fatalf("the whole file of home's: %+v", r)
	}
}

func TestASelectionDoesNotBeatAMarkerThatHasAValue(t *testing.T) {
	h := homeWith(t, map[string]string{"desk.md": deskDoc, "zed.md": zedDoc, "selected": "desk\n"})
	if r := dyna(env("IDEA_LOOP_HOME", h, "ZED_SESSION", "abc"), "runtime", "name"); r.stdout != "zed\n" {
		t.Fatalf("%+v", r)
	}
}

func TestASelectionIsLookedForInTheSameThreePlacesAndTheFirstOneWins(t *testing.T) {
	repo := projectWith(t, map[string]string{"selected": "desk\n"})
	h := homeWith(t, map[string]string{"desk.md": deskDoc, "zed.md": zedFrom("home"), "selected": "zed\n"})
	// the project's pick beats home's, and the description it names is found in home
	if r := dynaIn(repo, env("IDEA_LOOP_HOME", h), "runtime", "name"); r.code != 0 || r.stdout != "desk\n" {
		t.Fatalf("project's pick: %+v", r)
	}
	if r := dyna(env("IDEA_LOOP_HOME", h), "runtime", "name"); r.stdout != "zed\n" {
		t.Fatalf("home's pick: %+v", r)
	}
	u := userRootWith(t, map[string]string{"selected": "desk\n"})
	// the user root's pick names a description that is in home
	h3 := homeWith(t, map[string]string{"desk.md": deskDoc})
	if r := dyna(env("IDEA_LOOP_HOME", h3, "HOME", u), "runtime", "name"); r.code != 0 || r.stdout != "desk\n" {
		t.Fatalf("the user root's pick: %+v", r)
	}
}

func TestASelectionNoPlaceHasADescriptionForIsNotedAndTheResultIsThatOfNoEnvironment(t *testing.T) {
	h := homeWith(t, map[string]string{"selected": "nowhere\n"})
	e := env("IDEA_LOOP_HOME", h)
	name := dyna(e, "runtime", "name")
	if name.code != 1 || !strings.Contains(name.stderr, "nowhere") || !strings.Contains(name.stderr, "认不出运行环境") {
		t.Fatalf("name: %+v", name)
	}
	r := dyna(e, "runtime", "inject", "reference")
	lines := strings.Split(strings.TrimSpace(r.stdout), "\n")
	if r.code != 0 || len(lines) != 2 || !strings.Contains(lines[0], "nowhere") || !strings.Contains(lines[0], "selected") || lines[1] != "没有运行环境说明，跑 `/idea-loop:setup`" {
		t.Fatalf("the note, then the one line: %+v", r)
	}
	if run := dyna(e, "runtime", "inject", "runtime"); run.code != 0 || firstLine(run.stdout) != "当前运行环境：没有（跑 /idea-loop:setup）" {
		t.Fatalf("inject runtime: %+v", run)
	}
}

func TestAnEmptySelectionIsNoSelectionAndNeedsNoNotice(t *testing.T) {
	h := homeWith(t, map[string]string{"selected": "  \n"})
	r := dyna(env("IDEA_LOOP_HOME", h), "runtime", "inject", "reference")
	if r.stdout != "没有运行环境说明，跑 `/idea-loop:setup`\n" {
		t.Fatalf("%q", r.stdout)
	}
}

// ---- forced name, two markers, what is a description ----

func TestAForcedNameIsAcceptedWhenADescriptionHasItAndRefusedOtherwiseWithTheKnownNames(t *testing.T) {
	h := homeWith(t, map[string]string{"zed.md": zedDoc, "desk.md": deskDoc, "plain.md": noMarkerDoc})
	if r := dyna(env("IDEA_LOOP_HOME", h, rt.EnvRuntime, "zed", "ZED_SESSION", ""), "runtime", "name"); r.code != 0 || r.stdout != "zed\n" {
		t.Fatalf("forced zed: %+v", r)
	}
	for _, bad := range []string{"nope", "plain", "capabilities"} {
		r := dyna(env("IDEA_LOOP_HOME", h, rt.EnvRuntime, bad), "runtime", "name")
		if r.code != 1 || r.stdout != "" || !strings.Contains(r.stderr, bad) {
			t.Fatalf("%s: %+v", bad, r)
		}
		if !strings.Contains(r.stderr, "known: desk, zed") {
			t.Errorf("%s: the known names are the files with a marker line: %s", bad, r.stderr)
		}
	}
	// no description at all: still an error, and it points at setup
	r := dyna(env(rt.EnvRuntime, "zed"), "runtime", "name")
	if r.code != 1 || !strings.Contains(r.stderr, "zed") || !strings.Contains(r.stderr, "/idea-loop:setup") {
		t.Fatalf("%+v", r)
	}
}

func TestAnEmptyForcedNameCountsAsUnset(t *testing.T) {
	h := homeWith(t, map[string]string{"zed.md": zedDoc})
	if r := dyna(env("IDEA_LOOP_HOME", h, rt.EnvRuntime, "", "ZED_SESSION", "abc"), "runtime", "name"); r.stdout != "zed\n" {
		t.Fatal(r)
	}
}

func TestForcedKnownNameWinsOverWhatTheEnvironmentSays(t *testing.T) {
	h := homeWith(t, map[string]string{"zed.md": zedDoc, "desk.md": deskDoc})
	if r := dyna(env("IDEA_LOOP_HOME", h, rt.EnvRuntime, "desk", "ZED_SESSION", "abc"), "runtime", "name"); r.stdout != "desk\n" {
		t.Fatal(r)
	}
}

func TestTwoMarkersWithAValueTakeTheFirstByNameAndTheReferenceSaysWhich(t *testing.T) {
	h := homeWith(t, map[string]string{"zed.md": zedDoc, "amy.md": "标记：`AMY_SESSION`\n\n## 推送\n\namy 的推送\n"})
	e := env("IDEA_LOOP_HOME", h, "ZED_SESSION", "1", "AMY_SESSION", "abc")
	if r := dyna(e, "runtime", "name"); r.stdout != "amy\n" {
		t.Fatalf("amy sorts before zed: %+v", r)
	}
	r := dyna(e, "runtime", "inject", "reference")
	first := firstLine(r.stdout)
	for _, want := range []string{"amy", "zed", "AMY_SESSION", "ZED_SESSION"} {
		if !strings.Contains(first, want) {
			t.Errorf("the first line lacks %q: %q", want, first)
		}
	}
	if !strings.Contains(r.stdout, "amy 的推送") {
		t.Error("it is amy's text that follows")
	}
	// one marker alone has no notice
	if r := dyna(env("IDEA_LOOP_HOME", h, "AMY_SESSION", "abc"), "runtime", "inject", "reference"); !strings.HasPrefix(r.stdout, "以下是运行环境「amy」") {
		t.Fatalf("%q", firstLine(r.stdout))
	}
}

func TestOnlyFilesWithAMarkerLineAreEnvironmentsTheOthersAreNot(t *testing.T) {
	h := homeWith(t, map[string]string{"zed.md": zedDoc, "plain.md": noMarkerDoc, "desk-mic.md": "# 细节\n\n## 随便\n", "selected": "desk\n"})
	r := dyna(env("IDEA_LOOP_HOME", h, rt.EnvRuntime, "zzz"), "runtime", "name")
	if !strings.Contains(r.stderr, "known: zed\n") {
		t.Fatalf("known names: %s", r.stderr)
	}
}

func TestTheMarkerLineIsOnlyReadAboveTheFirstSection(t *testing.T) {
	type res struct {
		marker string
		ok     bool
	}
	for text, want := range map[string]res{
		"# a\n\n标记：`A_VAR`\n\n## x\n":                {"A_VAR", true},
		"标记：没有\n\n## x\n":                            {"", true},
		"# a\n\n标记：没有（命令行也一样）\n\n## x\n":             {"", true},
		"---\nname: a\n---\n# a\n标记：`A_VAR`\n## x\n": {"A_VAR", true},
		"# a\n\n## x\n\n标记：`A_VAR`\n":                {"", false},
		"# a\n\n## x\n":                              {"", false},
		"# a\n\n标记：某个变量\n\n## x\n":                   {"", false},
		"# a\n\n标记：`lower case`\n\n## x\n":           {"", false},
	} {
		m, ok := rt.MarkerOf(text)
		if m != want.marker || ok != want.ok {
			t.Errorf("%q: got %q %v, want %q %v", text, m, ok, want.marker, want.ok)
		}
	}
}

// dyna holds no list of environments and no default one: the code that finds them names none, and nothing in it
// falls back to a name.
func TestNoEnvironmentNameIsWrittenInTheRuntimeModulesCode(t *testing.T) {
	files, err := filepath.Glob("*.go")
	if err != nil || len(files) == 0 {
		t.Fatalf("no source files: %v", err)
	}
	for _, f := range files {
		if strings.HasSuffix(f, "_test.go") {
			continue
		}
		src := readFile(t, f)
		for _, name := range []string{"claude-desktop", "magi", "MAGI", "zed"} {
			if strings.Contains(src, name) {
				t.Errorf("%s names %q", f, name)
			}
		}
	}
}
