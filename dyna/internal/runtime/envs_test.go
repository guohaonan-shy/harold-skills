package runtime_test

// Recognising an environment by the marker line at the top of its description (<plugin>/runtime/<name>.md, or
// <home>/runtime/<name>.md for an environment of the user's own), and the environment the human picked in
// <home>/runtime/selected. dyna holds no list of environments.

import (
	"path/filepath"
	"strings"
	"testing"

	rt "github.com/guohaonan-shy/harold-skills/dyna/internal/runtime"
)

const zedDoc = "# zed\n\n标记：`ZED_SESSION`\n\n## 定时任务\n\nzed 的定时任务做法\n\n## 推送\n\nzed 的推送做法\n"

// homeWith is a home directory with these files under runtime/ (name -> content).
func homeWith(t *testing.T, files map[string]string) string {
	t.Helper()
	h := t.TempDir()
	for name, content := range files {
		writeFile(t, filepath.Join(h, "runtime", name), content)
	}
	return h
}

func firstLine(s string) string { return strings.SplitN(s, "\n", 2)[0] }

func TestAHomeEnvironmentWithAMarkerIsRecognisedByItsMarkerVariable(t *testing.T) {
	h := homeWith(t, map[string]string{"zed.md": zedDoc})
	if r := dyna(env("IDEA_LOOP_HOME", h, "ZED_SESSION", "1"), "runtime", "name"); r.code != 0 || r.stdout != "zed\n" {
		t.Fatalf("name: %+v", r)
	}
	r := dyna(env("IDEA_LOOP_HOME", h, "ZED_SESSION", "1"), "runtime", "show", "推送")
	if r.code != 0 || r.stdout != "## 推送\n\nzed 的推送做法\n" {
		t.Fatalf("show: %+v", r)
	}
	// without the variable the session is not zed
	if r := dyna(env("IDEA_LOOP_HOME", h), "runtime", "name"); r.stdout != "claude-desktop\n" {
		t.Fatalf("no variable: %+v", r)
	}
}

func TestAnEnvironmentOnlyInHomeIsInjectedAsItsWholeFile(t *testing.T) {
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

func TestWithNoMarkerAndNoSelectionTheEnvironmentIsClaudeDesktopAndASelectionOverridesIt(t *testing.T) {
	h := homeWith(t, nil)
	if r := dyna(env("IDEA_LOOP_HOME", h), "runtime", "name"); r.stdout != "claude-desktop\n" {
		t.Fatalf("nothing: %+v", r)
	}
	writeFile(t, filepath.Join(h, "runtime", "selected"), " magi \n")
	if r := dyna(env("IDEA_LOOP_HOME", h), "runtime", "name"); r.code != 0 || r.stdout != "magi\n" {
		t.Fatalf("selected magi: %+v", r)
	}
	r := dyna(env("IDEA_LOOP_HOME", h), "runtime", "inject", "reference")
	if !strings.HasPrefix(r.stdout, "以下是运行环境「magi」的做法全文") || !strings.Contains(r.stdout, "magi sessions") {
		t.Fatalf("the reference is magi's: %q", firstLine(r.stdout))
	}
}

func TestASelectionDoesNotBeatAMarkerThatHasAValue(t *testing.T) {
	h := homeWith(t, nil)
	writeFile(t, filepath.Join(h, "runtime", "selected"), "claude-desktop\n")
	if r := dyna(env("IDEA_LOOP_HOME", h, envMagiSession, "abc"), "runtime", "name"); r.stdout != "magi\n" {
		t.Fatalf("%+v", r)
	}
}

func TestASelectionThatIsNotAKnownEnvironmentCountsAsNoneAndTheReferenceSaysSo(t *testing.T) {
	h := homeWith(t, nil)
	writeFile(t, filepath.Join(h, "runtime", "selected"), "nowhere\n")
	e := env("IDEA_LOOP_HOME", h)
	if r := dyna(e, "runtime", "name"); r.code != 0 || r.stdout != "claude-desktop\n" {
		t.Fatalf("name: %+v", r)
	}
	r := dyna(e, "runtime", "inject", "reference")
	first := firstLine(r.stdout)
	if r.code != 0 || !strings.Contains(first, "nowhere") || !strings.Contains(first, "selected") || strings.HasPrefix(first, "以下是运行环境") {
		t.Fatalf("first line: %q", first)
	}
	if !strings.Contains(r.stdout, "以下是运行环境「claude-desktop」的做法全文") {
		t.Fatal("the reference itself is still injected")
	}
}

func TestAnEmptySelectionIsNoSelectionAndNeedsNoNotice(t *testing.T) {
	h := homeWith(t, map[string]string{"selected": "  \n"})
	r := dyna(env("IDEA_LOOP_HOME", h), "runtime", "inject", "reference")
	if !strings.HasPrefix(r.stdout, "以下是运行环境「claude-desktop」") {
		t.Fatalf("%q", firstLine(r.stdout))
	}
}

func TestAForcedNameIsAcceptedWhenTheDescriptionIsInHomeAndRefusedOtherwiseWithTheKnownNames(t *testing.T) {
	h := homeWith(t, map[string]string{"zed.md": zedDoc, "plain.md": "# plain\n\n## 推送\n\nx\n"})
	if r := dyna(env("IDEA_LOOP_HOME", h, rt.EnvRuntime, "zed", envMagiSession, "abc"), "runtime", "name"); r.code != 0 || r.stdout != "zed\n" {
		t.Fatalf("forced zed: %+v", r)
	}
	for _, bad := range []string{"nope", "plain", "capabilities", "claude-desktop-mic"} {
		r := dyna(env("IDEA_LOOP_HOME", h, rt.EnvRuntime, bad), "runtime", "name")
		if r.code != 1 || r.stdout != "" || !strings.Contains(r.stderr, bad) {
			t.Fatalf("%s: %+v", bad, r)
		}
		if !strings.Contains(r.stderr, "known: claude-desktop, magi, zed") {
			t.Errorf("%s: the known names are the plugin's two and home's one: %s", bad, r.stderr)
		}
	}
}

func TestTwoMarkersWithAValueTakeTheFirstByNameAndTheReferenceSaysWhich(t *testing.T) {
	h := homeWith(t, map[string]string{"zed.md": zedDoc})
	r := dyna(env("IDEA_LOOP_HOME", h, "ZED_SESSION", "1", envMagiSession, "abc"), "runtime", "name")
	if r.stdout != "magi\n" {
		t.Fatalf("magi sorts before zed: %+v", r)
	}
	r = dyna(env("IDEA_LOOP_HOME", h, "ZED_SESSION", "1", envMagiSession, "abc"), "runtime", "inject", "reference")
	first := firstLine(r.stdout)
	for _, want := range []string{"magi", "zed", envMagiSession, "ZED_SESSION"} {
		if !strings.Contains(first, want) {
			t.Errorf("the first line lacks %q: %q", want, first)
		}
	}
	if !strings.Contains(r.stdout, "magi sessions") {
		t.Error("it is magi's text that follows")
	}
	// one marker alone has no notice
	if r := dyna(env("IDEA_LOOP_HOME", h, envMagiSession, "abc"), "runtime", "inject", "reference"); !strings.HasPrefix(r.stdout, "以下是运行环境「magi」") {
		t.Fatalf("%q", firstLine(r.stdout))
	}
}

func TestTheCapabilitiesAndDetailFilesAreNotEnvironments(t *testing.T) {
	// the plugin has capabilities.md and claude-desktop-mic.md in runtime/; neither has a marker line
	r := dyna(env(rt.EnvRuntime, "zzz"), "runtime", "name")
	if !strings.Contains(r.stderr, "known: claude-desktop, magi\n") {
		t.Fatalf("known names: %s", r.stderr)
	}
	for _, f := range []string{"capabilities.md", "claude-desktop-mic.md"} {
		if _, ok := rt.MarkerOf(readFile(t, filepath.Join(pluginRoot(), rt.DataDir, f))); ok {
			t.Errorf("%s has a marker line", f)
		}
	}
	for name, want := range map[string]string{"claude-desktop": "", "magi": envMagiSession} {
		got, ok := rt.MarkerOf(readFile(t, filepath.Join(pluginRoot(), rt.DataDir, name+".md")))
		if !ok || got != want {
			t.Errorf("%s: marker %q ok=%v, want %q", name, got, ok, want)
		}
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

func TestAHomeFileWithTheNameOfAPluginEnvironmentStaysAnOverrideWhateverItsMarker(t *testing.T) {
	// no marker line in the home file: still a section-by-section override, the marker is the plugin's
	h := homeWith(t, map[string]string{"magi.md": "## 推送\n\n本机的推送\n"})
	r := dyna(env("IDEA_LOOP_HOME", h, envMagiSession, "abc"), "runtime", "show", "推送")
	if r.code != 0 || !strings.Contains(r.stdout, "本机的推送") || !strings.Contains(firstLine(r.stdout), "本机覆盖") {
		t.Fatalf("%+v", r)
	}
	// a marker line in the home file does not decide anything: the plugin's marker does
	h2 := homeWith(t, map[string]string{"magi.md": "标记：`OTHER_VAR`\n\n## 推送\n\n本机的推送\n"})
	if r := dyna(env("IDEA_LOOP_HOME", h2, "OTHER_VAR", "1"), "runtime", "name"); r.stdout != "claude-desktop\n" {
		t.Fatalf("the plugin's marker decides: %+v", r)
	}
}

func TestNoEnvironmentNameIsWrittenInTheDetectionCode(t *testing.T) {
	for _, f := range []string{"runtime.go", "envs.go"} {
		src := readFile(t, f)
		for _, name := range []string{"magi", "MAGI", "zed"} {
			if strings.Contains(src, name) {
				t.Errorf("%s names %q", f, name)
			}
		}
	}
}
