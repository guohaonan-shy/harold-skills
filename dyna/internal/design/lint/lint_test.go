package lint

import (
	"bytes"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/nexterr"
)

// execute runs `design lint` the way the process would: stdin, arguments, and the exit code a nexterr.Exit carries.
func execute(stdin string, args ...string) (out, errs string, code int) {
	c := Command()
	var o, e bytes.Buffer
	c.SetArgs(args)
	c.SetIn(strings.NewReader(stdin))
	c.SetOut(&o)
	c.SetErr(&e)
	err := c.Execute()
	if err != nil {
		var ex *nexterr.Exit
		if errors.As(err, &ex) {
			if ex.Msg != "" {
				e.WriteString(ex.Msg + "\n")
			}
			return o.String(), e.String(), ex.Code
		}
		return o.String(), e.String() + err.Error() + "\n", 1
	}
	return o.String(), e.String(), 0
}

func ids(fs []Finding) map[string]bool {
	m := map[string]bool{}
	for _, f := range fs {
		m[f.ID] = true
	}
	return m
}

// ---- design-lint.test.mjs ----

func TestDoesNotFlagTheRetiredProjectSpecificBrandFloors(t *testing.T) {
	html := `
    <style>
      .card { border: 1px solid #0a0a0a; background: #FFFDF4; }
    </style>
    <h1 style="font-family: 'Instrument Serif', serif;">Instrument Serif headline</h1>
  `
	// a project's own brand floors (its ink, its warm tint, its display font) live in its own DESIGN.md: none of
	// this is the lint's business, so it finds nothing
	if fs := Lint(html, ""); len(fs) != 0 {
		t.Errorf("a project brand floor was flagged: %+v", fs)
	}
}

func TestStillFlagsGenericAISlopSignals(t *testing.T) {
	html := `
    <style>
      .headline { background-clip: text; -webkit-background-clip: text; }
    </style>
    <button class="btn bg-indigo-500">🚀 Launch it</button>
  `
	got := ids(Lint(html, ""))
	for _, id := range []string{"gradient-text", "ai-purple-indigo", "emoji-icon"} {
		if !got[id] {
			t.Errorf("%s not flagged", id)
		}
	}
}

// ---- rules the old tests did not name: one trigger each, so a rule dropped in the port goes red ----

func TestEveryRuleFiresOnItsOwnTell(t *testing.T) {
	cases := map[string]string{
		"hard-offset-shadow":     `<style>.a{box-shadow: 2px 2px 0 #0a0a0a}</style>`,
		"ai-purple-indigo":       `<div style="color:#6366f1">x</div>`,
		"gradient-text":          `<style>h1{background-clip:text}</style>`,
		"em-dash-copy":           `<p>Fast — and simple</p>`,
		"emoji-icon":             `<p>🚀 go</p>`,
		"external-stock-image":   `<img src="https://images.unsplash.com/x.jpg">`,
		"pure-black":             `<style>.a{color:#000}</style>`,
		"bounce-easing":          `<style>.a{transition: transform .3s cubic-bezier(.3,1.5,.6,1)}</style>`,
		"layout-transition":      `<style>.a{transition: width .2s}</style>`,
		"left-accent-card":       `<style>.a{border-left: 4px solid #3b82f6}</style>`,
		"eyebrow-overuse":        `<section><style>.a{text-transform:uppercase;letter-spacing:0.1em} .b{text-transform:uppercase;letter-spacing:0.1em}</style></section>`,
		"scroll-cue":             `<p>Scroll down</p>`,
		"filler-verbs":           `<p>A seamless experience</p>`,
		"weak-cta-label":         `<button>OK</button>`,
		"placeholder-only-label": `<input placeholder="Email">`,
		"middle-dot-chain":       "<p>a · b · c · d</p>",
		"lorem-ipsum":            `<p>Lorem ipsum dolor</p>`,
		"you-we-ratio":           `<p>We build. We ship. We care. Our team.</p>`,
		"reduced-motion-missing": `<style>.a{animation: spin 1s}</style>`,
	}
	for id, html := range cases {
		if !ids(Lint(html, ""))[id] {
			t.Errorf("%s did not fire on %s", id, html)
		}
	}
}

func TestACleanFileHasNoFindings(t *testing.T) {
	fs := Lint(`<!doctype html><style>h1{color:#222}</style><h1>Plan the week</h1>`, "")
	if len(fs) != 0 || Render(fs) != "design-lint: clean ✓" {
		t.Fatal(fs)
	}
}

func TestOnlyEightFindingsPerRuleAndTheRestAreCounted(t *testing.T) {
	var b strings.Builder
	for i := 0; i < 11; i++ {
		b.WriteString(`<p>🚀</p>`)
	}
	var emoji []Finding
	for _, f := range Lint(b.String(), "") {
		if f.ID == "emoji-icon" {
			emoji = append(emoji, f)
		}
	}
	if len(emoji) != 9 || emoji[8].Detail != "…and 3 more" {
		t.Fatalf("%d findings, last %q", len(emoji), emoji[len(emoji)-1].Detail)
	}
}

// ---- design-lint-hook.test.mjs ----

const (
	// A hard-ban (gradient text) so the hook has something to block on.
	dirty = `<!doctype html><style>h1{background-clip:text}</style><h1>x</h1>`
	clean = `<!doctype html><style>h1{color:#222}</style><h1>x</h1>`
)

func put(t *testing.T, root, rel, html string) string {
	t.Helper()
	file := filepath.Join(root, rel)
	if err := os.MkdirAll(filepath.Dir(file), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(file, []byte(html), 0o644); err != nil {
		t.Fatal(err)
	}
	return file
}

func event(file string) string {
	return `{"tool_input":{"file_path":` + quote(file) + `}}`
}

func quote(s string) string { return `"` + strings.ReplaceAll(s, `\`, `\\`) + `"` }

func TestTheCanvasOfARequirementIsWatched(t *testing.T) {
	for _, p := range []string{
		"/repo/docs/design/tmp/cookbook-redesign/canvas/cookbook-redesign.html",
		"/repo/docs/design/tmp/cookbook-redesign/canvas/cookbook-redesign-motion.html",
		"docs/design/tmp/x/canvas/x.htm",
	} {
		if !IsCanvas(p) {
			t.Errorf("%s should be a canvas", p)
		}
	}
}

func TestOnlyHTMLDirectlyInsideCanvasCounts(t *testing.T) {
	for _, p := range []string{
		"/repo/docs/design/tmp/x/canvas/assets/capture.html", // assets/ holds captures
		"/repo/docs/design/tmp/x/imagine/board.html",         // imagine/ is throwaway
		"/repo/docs/design/tmp/x/delta/pages/p/p.html",
		"/repo/docs/design/tmp/x/canvas/x.md",
	} {
		if IsCanvas(p) {
			t.Errorf("%s is not a canvas", p)
		}
	}
}

func TestTheOldPerSpecHomeAndTheArchiveAreNoLongerCanvases(t *testing.T) {
	for _, p := range []string{"/repo/docs/design/cookbook-redesign/cookbook-redesign.html", "/repo/docs/design/prod/pages/cookbook/index.html"} {
		if IsCanvas(p) {
			t.Errorf("%s is not a canvas", p)
		}
	}
}

func TestTheLegacyScratchDirsStayRecognized(t *testing.T) {
	if !IsCanvas("/repo/design-preview/home.html") || !IsCanvas("/repo/design-motion-preview/home.html") {
		t.Fatal("the legacy scratch dirs are canvases")
	}
}

func TestMissingPathIsNotACanvas(t *testing.T) {
	if IsCanvas("") {
		t.Fatal("an empty path is not a canvas")
	}
}

func TestAHardBanWrittenIntoACanvasBlocksWithExit2AndNamesTheFile(t *testing.T) {
	root := t.TempDir()
	file := put(t, root, "docs/design/tmp/demo/canvas/demo.html", dirty)
	_, errs, code := execute(event(file), "--hook")
	if code != 2 || !strings.Contains(errs, "design-lint on ") || !strings.Contains(errs, "gradient-text") || !strings.Contains(errs, file) {
		t.Fatal(code, errs)
	}
}

func TestACleanCanvasStaysSilent(t *testing.T) {
	root := t.TempDir()
	out, errs, code := execute(event(put(t, root, "docs/design/tmp/demo/canvas/clean.html", clean)), "--hook")
	if code != 0 || errs != "" || out != "" {
		t.Fatal(code, out, errs)
	}
}

func TestTheSameDirtyHTMLOutsideCanvasIsIgnored(t *testing.T) {
	root := t.TempDir()
	for _, rel := range []string{
		"docs/design/tmp/demo/imagine/board.html",
		"docs/design/tmp/demo/canvas/assets/capture.html",
		"docs/design/demo/demo.html",
	} {
		_, errs, code := execute(event(put(t, root, rel, dirty)), "--hook")
		if code != 0 || errs != "" {
			t.Errorf("%s: %d %q", rel, code, errs)
		}
	}
}

func TestALegacyPreviewDirIsStillLinted(t *testing.T) {
	root := t.TempDir()
	if _, _, code := execute(event(put(t, root, "design-preview/home.html", dirty)), "--hook"); code != 2 {
		t.Fatal(code)
	}
}

func TestAPathThatDoesNotExistOrAPayloadThatIsNotJSONIsSilent(t *testing.T) {
	root := t.TempDir()
	if _, errs, code := execute(event(filepath.Join(root, "docs/design/tmp/demo/canvas/gone.html")), "--hook"); code != 0 || errs != "" {
		t.Fatal(code, errs)
	}
	if _, errs, code := execute("not json", "--hook"); code != 0 || errs != "" {
		t.Fatal(code, errs)
	}
}

// ---- the canvas lives in the project's directory in home, not in the code repository the session is in ----

const homeProject = "home/projects/example-app"

func TestACanvasUnderAProjectDirectoryInHomeIsACanvasAndItsAssetsAreNot(t *testing.T) {
	dir := "/x/" + homeProject + "/docs/design/tmp/x"
	if !IsCanvas(dir+"/canvas/a.html") || IsCanvas(dir+"/canvas/assets/a.html") || IsCanvas(dir+"/imagine/a.html") || IsCanvas(dir+"/delta/pages/p/a.html") {
		t.Fatal("canvas judged by its tail alone")
	}
}

func TestTheHookLintsACanvasInHomeThoughTheSessionIsInACodeWorktreeElsewhere(t *testing.T) {
	root := t.TempDir()
	dirtyFile := put(t, root, homeProject+"/docs/design/tmp/x/canvas/a.html", dirty)
	ev := func(file string) string {
		return `{"cwd":` + quote(filepath.Join(root, "code", "example-app")) + `,"tool_input":{"file_path":` + quote(file) + `}}`
	}
	_, errs, code := execute(ev(dirtyFile), "--hook")
	if code != 2 || !strings.Contains(errs, "gradient-text") || !strings.Contains(errs, dirtyFile) {
		t.Fatal(code, errs)
	}
	if _, _, code := execute(ev(put(t, root, homeProject+"/docs/design/tmp/x/canvas/assets/a.html", dirty)), "--hook"); code != 0 {
		t.Fatal("assets/ is not a canvas")
	}
	if _, _, code := execute(ev(put(t, root, homeProject+"/docs/design/tmp/x/canvas/ok.html", clean)), "--hook"); code != 0 {
		t.Fatal("a clean canvas is silent")
	}
}

// ---- the command without --hook is the old design-lint.mjs ----

func TestTheCommandOnFilesExitsTwoOnABlockingFindingAndZeroOtherwise(t *testing.T) {
	root := t.TempDir()
	bad := put(t, root, "bad.html", dirty)
	good := put(t, root, "good.html", clean)
	out, _, code := execute("", bad)
	if code != 2 || !strings.Contains(out, "P0 (must fix):") || !strings.Contains(out, "[gradient-text]") {
		t.Fatal(code, out)
	}
	out, _, code = execute("", good)
	if code != 0 || out != "design-lint: clean ✓\n" {
		t.Fatal(code, out)
	}
	// a P2 alone does not fail the file
	p2 := put(t, root, "p2.html", `<p>Lorem ipsum</p>`)
	if out, _, code := execute("", p2); code != 0 || !strings.Contains(out, "P2 (advisory):") {
		t.Fatal(code, out)
	}
}

func TestTheCommandWithNoFileOrAFileNobodyWroteIsAUsageError(t *testing.T) {
	if _, errs, code := execute(""); code != 1 || !strings.Contains(errs, "用法") {
		t.Fatal(code, errs)
	}
	if _, errs, code := execute("", filepath.Join(t.TempDir(), "nope.html")); code != 1 || !strings.Contains(errs, "cannot read") {
		t.Fatal(code, errs)
	}
}

func TestJSONHasTheKeysInTheOrderTheOldScriptWroteThem(t *testing.T) {
	root := t.TempDir()
	out, _, _ := execute("", "--json", put(t, root, "a.html", `<p>🚀</p><img src="https://picsum.photos/1">`))
	wantStart := "[\n  {\n    \"file\": "
	if !strings.HasPrefix(out, wantStart) || !strings.Contains(out, "\"severity\": \"P1\",\n    \"why\": ") || !strings.Contains(out, "\"detail\": \"picsum.photos\",\n    \"line\": 1\n") {
		t.Fatal(out)
	}
	if out, _, _ := execute("", "--json", put(t, root, "ok.html", clean)); out != "[]\n" {
		t.Fatalf("%q", out)
	}
}
