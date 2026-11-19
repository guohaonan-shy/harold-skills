package sections

// The old script (idea-loop/scripts/design-archive-sections.mjs) and this package, run on the same inputs: every
// subcommand must print the same code and the same notes and end with the same exit code. The old script stays in the
// repository until it is deleted, so this test is skipped when `node` or the old script is not there.
//
// What is not compared byte for byte, and why:
//   - the old command line is `node design-archive-sections.mjs …`, the new one `dyna design archive sections …`:
//     the old text is rewritten to the new command name before comparing (the usage table and the one place the
//     generated code names the command);
//   - the text of a JSON syntax error comes from the JavaScript engine in the old script: lines that end in one are
//     compared up to the colon in front of it.

import (
	"bytes"
	"math/rand"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/design/fixture"
)

func oldScript(t *testing.T) (node, script string) {
	t.Helper()
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node is not on PATH")
	}
	script, err = filepath.Abs(filepath.Join("..", "..", "..", "..", "idea-loop", "scripts", "design-archive-sections.mjs"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(script); err != nil {
		t.Skip("the old script is gone: nothing to compare with")
	}
	return node, script
}

var renamer = strings.NewReplacer(
	"node design-archive-sections.mjs ", "dyna design archive sections ",
	"design-archive-sections.mjs time", "dyna design archive sections time",
)

var jsonTail = regexp.MustCompile(`((?:不是 JSON|读不出来)：).*`)

func runOld(t *testing.T, node, script string, args ...string) cliResult {
	t.Helper()
	cmd := exec.Command(node, append([]string{script}, args...)...)
	var out, errb bytes.Buffer
	cmd.Stdout, cmd.Stderr = &out, &errb
	status := 0
	if err := cmd.Run(); err != nil {
		ee, ok := err.(*exec.ExitError)
		if !ok {
			t.Fatal(err)
		}
		status = ee.ExitCode()
	}
	return cliResult{renamer.Replace(out.String()), renamer.Replace(errb.String()), status}
}

type diffCase struct {
	args  []string
	loose bool // a JSON syntax error is in the notes
}

func compare(t *testing.T, node, script string, c diffCase) {
	t.Helper()
	want := runOld(t, node, script, c.args...)
	got := run(c.args...)
	name := strings.Join(c.args, " ")
	if got.status != want.status {
		t.Errorf("exit code of %q: got %d, old %d\nstderr: %s", name, got.status, want.status, got.stderr)
		return
	}
	if got.stdout != want.stdout {
		t.Errorf("stdout of %q differs (got %d bytes, old %d bytes)\ngot:  %s\nold:  %s", name, len(got.stdout), len(want.stdout), clip(got.stdout), clip(want.stdout))
	}
	gs, ws := got.stderr, want.stderr
	if c.loose {
		gs, ws = jsonTail.ReplaceAllString(gs, "$1"), jsonTail.ReplaceAllString(ws, "$1")
	}
	if gs != ws {
		t.Errorf("stderr of %q differs\ngot:  %s\nold:  %s", name, clip(gs), clip(ws))
	}
}

func TestSameAsTheOldScriptOnEverySubcommand(t *testing.T) {
	node, script := oldScript(t)
	mkt := repo(t, fixture.Marketing())
	cookbook := repo(t, fixture.Compliant())
	bare := repo(t, fixture.Files{"README.md": "x"})
	out := filepath.Join(t.TempDir(), "shots")
	dir := t.TempDir()

	noViewport := fixture.Marketing()
	noViewport[BASE+"/index.md"] = strings.Replace(noViewport[BASE+"/index.md"], "viewport: 1440x900\n", "", 1)
	noViewportRoot := repo(t, noViewport)
	motionRoot := repo(t, withIndex("\nmotion: reduce"))

	scrollDrivenFiles := fixture.Marketing()
	scrollDrivenFiles[fixture.MKTEntryFile] = strings.Replace(scrollDrivenFiles[fixture.MKTEntryFile], "  - { id: feature-a, locate: { role: heading, name: 无限菜谱 } }", "  - { id: feature-a, locate: { role: heading, name: 无限菜谱 }, scrollDriven: true }", 1)
	scrollDrivenRoot := repo(t, scrollDrivenFiles)

	deltaFiles := fixture.Marketing()
	entry := BASE + "/pages/" + MKT + "/" + MKTEntry + ".md"
	d := strings.Replace(deltaFiles[entry], "  - { id: footer, locate: { role: contentinfo } }", "  - { id: faq, locate: { role: heading, name: 常见问题 } }\n  - { id: footer, locate: { role: contentinfo } }", 1)
	deltaFiles["docs/design/tmp/demo-spec/delta/pages/"+MKT+"/"+MKTEntry+".md"] = strings.Replace(d, "from: mkt-pricing#footer", "from: mkt-pricing#faq", 1)
	deltaRoot := repo(t, deltaFiles)

	coverFiles := fixture.Compliant()
	src := coverFiles[BASE+"/pages/cookbook/cookbook--list.md"]
	coverFiles["docs/design/tmp/demo-spec/delta/pages/cookbook/cookbook--list-long.md"] = strings.Replace(strings.Replace(src, "id: search\n", "id: share-all\n", 1), "# cookbook--list\n", "# cookbook--list-long\n", 1)
	coverDeltaRoot := repo(t, coverFiles)

	// the measurements: the hand-written ones the tests use, each as a file
	viewport := J(`{"width":1440,"height":900}`)
	measurements := map[string]Obj{
		"all":         measurement(ALL),
		"orphans":     measurement([]any{HERO, FEATUREA, FEATUREB}),
		"lost":        measurement([]any{HEADER, J(`{"id":"faq","locate":{"role":"heading","name":"x"},"found":false}`), FOOTER}),
		"order":       measurement([]any{HEADER, FEATUREA, HERO, FEATUREB, FOOTER}),
		"nofooter":    measurement([]any{HEADER, HERO, FEATUREA, FEATUREB}, "contentinfo", nil),
		"floating":    measurement([]any{with(HEADER, "bottom", 160), HERO, FEATUREA, FEATUREB, FOOTER}),
		"twoinblock":  measurement([]any{HEADER, HERO, FEATUREA, with(FEATUREB, "top", 2000, "bottom", 2040, "block", 1), FOOTER}),
		"position":    measurement([]any{HEADER, J(`{"id":"hero","locate":{"position":1},"found":true,"top":100,"bottom":900,"block":0}`), FEATUREA, FEATUREB, FOOTER}),
		"pin":         measurement(ALL, "pins", []any{PIN}),
		"pindeclared": measurement([]any{HEADER, HERO, declared(FEATUREA), FEATUREB, FOOTER}, "pins", []any{PIN}, "viewport", viewport, "theme", "light", "motion", "default"),
		"hint":        measurement([]any{HEADER, HERO, declared(FEATUREA), FEATUREB, FOOTER}),
		"pinsmall":    measurement(ALL, "pins", []any{with(PIN, "texts", J(`["Step 1"]`), "byText", true)}),
		"scroller":    measurement(ALL, "scroller", SHELLSCROLLER, "viewport", viewport, "theme", "dark", "motion", "reduce"),
		"insection":   measurement(ALL, "state", MKT+"--feature-b-expanded", "entry", MKTEntry, "section", "feature-b", "viewport", viewport, "theme", "light"),
		"hidden": measurement(ALL, "clickables", J(`[
  {"role":"button","name":"开始使用","top":500,"bottom":548,"landmark":null,"opacity":1},
  {"role":"link","name":"01 目录","top":377,"bottom":523,"landmark":null,"opacity":0,"fixed":true,"appearance":{"scrollY":1000,"top":377,"bottom":523}},
  {"role":"link","name":"一直透明","top":700,"bottom":720,"landmark":null,"opacity":0},
  {"role":"link","name":"从没出现","top":300,"bottom":320,"landmark":null,"opacity":1,"fixed":true,"appearance":null},
  {"role":"button","name":"什么是模考","top":4700,"bottom":4740,"landmark":null,"byRole":false,"matches":0,"textMatches":1}]`),
			"headings", J(`[{"level":2,"name":"读一篇，答一篇。","byRole":true,"matches":1,"top":300,"bottom":340},{"level":2,"name":"食材库同步","top":4600,"bottom":4640}]`)),
		"overlap": measurement([]any{HEADER, HERO, J(`{"id":"trust","locate":{"position":2},"found":true,"top":900,"bottom":4500,"block":1}`), J(`{"id":"faq","locate":{"role":"heading","name":"常见问题"},"found":true,"top":1000,"bottom":1040,"block":1}`), FOOTER}),
	}
	files := map[string]string{}
	attributions := map[string]string{}
	for name, m := range measurements {
		files[name] = writeJSONFile(t, dir, "m-"+name+".json", m)
		// what the old `attribute` made of it is what both `shoot`s read
		old := runOld(t, node, script, "attribute", files[name])
		attributions[name] = writeFile(t, dir, "a-"+name+".json", old.stdout)
	}
	junk := writeFile(t, dir, "junk.json", "{ not json")

	var cases []diffCase
	add := func(loose bool, args ...string) { cases = append(cases, diffCase{args, loose}) }

	// attribute
	for name := range measurements {
		add(false, "attribute", files[name])
	}
	add(false, "attribute")
	add(false, "attribute", filepath.Join(dir, "nope.json"))
	add(true, "attribute", junk)
	// shoot
	for name := range measurements {
		add(false, "shoot", attributions[name], "--out", out)
	}
	add(false, "shoot", attributions["all"], "--out", out, "--section", "hero,footer")
	add(false, "shoot", attributions["all"], "--out", out, "--section", " hero , ,footer")
	add(false, "shoot", attributions["all"], "--out", out, "--section", ",")
	add(false, "shoot", attributions["all"], "--out", out, "--section", "nowhere")
	add(false, "shoot", attributions["all"], "--out", out, "--section", "header", "--include", `{"role":"menu","name":"产品"}`)
	add(false, "shoot", attributions["all"], "--out", out, "--include", `{"text":"x"}`)
	add(false, "shoot", attributions["all"], "--out", out, "--include", `{"color":"red"}`)
	add(true, "shoot", attributions["all"], "--out", out, "--include", "menu")
	add(false, "shoot", attributions["orphans"], "--out", out)
	add(false, "shoot", attributions["pin"], "--out", out)
	add(false, "shoot")
	add(false, "shoot", attributions["all"])
	add(false, "shoot", attributions["all"], "--out", out, "--bogus", "x")
	add(false, "shoot", attributions["all"], "--out")
	add(false, "shoot", filepath.Join(dir, "nope.json"), "--out", out)
	// measure
	add(false, "measure", mkt, MKTEntry)
	add(false, "measure", scrollDrivenRoot, MKTEntry)
	add(false, "measure", motionRoot, MKTEntry)
	add(false, "measure", motionRoot, MKTEntry, "--motion", "default", "--viewport", "1280x800", "--theme", "dark", "--locale", "en")
	add(false, "measure", deltaRoot, MKTEntry)
	add(false, "measure", deltaRoot, MKTEntry, "--delta", "demo-spec")
	add(false, "measure", mkt, MKTEntry, "--for", MKT+"--feature-b-expanded")
	add(false, "measure", mkt, MKTEntry, "--for", MKT+"--hero-menu")
	add(false, "measure", mkt, MKTEntry, "--for", MKT+"--hero-menu", "--section", "hero")
	add(false, "measure", mkt, MKTEntry, "--for", "x--y", "--section", "nowhere")
	add(false, "measure", mkt, MKTEntry, "--section", "hero")
	list := `[{"id":"hero","locate":{"role":"heading","name":"标语"}},{"id":"footer","locate":{"role":"contentinfo"}},{"id":"mid","locate":{"position":2},"scrollDriven":true}]`
	add(false, "measure", cookbook, "--state", "mkt-home--entry", "--page", "mkt-home", "--sections", list)
	add(false, "measure", cookbook, "--state", "mkt-home--entry", "--sections", list)
	add(false, "measure", cookbook, "--state", "mkt-home--entry", "--page", "mkt-home", "--sections-file", writeFile(t, dir, "sections.json", list))
	add(false, "measure", cookbook, "--state", "mkt-home--entry", "--sections-file", filepath.Join(dir, "nope.json"))
	add(false, "measure", mkt, "--state", "x--entry", "--sections", "{}")
	add(false, "measure", mkt, "--state", "x--entry", "--sections", "[]")
	add(false, "measure", mkt, "--state", "x--entry", "--sections", `[{"id":"hero","locate":{"role":"link","name":"x"}}]`)
	add(false, "measure", mkt, "--state", "x--entry", "--sections", `[{"id":"hero","locate":{"position":1},"scrollDriven":"yes"}]`)
	add(false, "measure", mkt, "--state", "x--entry", "--sections", `[{"id":"hero","locate":{"position":1},"scrollDriven":false}]`)
	add(false, "measure", mkt, "--state", "x--entry", "--sections", `[{"locate":{"position":1}}]`)
	add(false, "measure", mkt, "--state", "x--entry", "--sections", `[3]`)
	add(true, "measure", mkt, "--state", "x--entry", "--sections", "[not json")
	add(false, "measure")
	add(false, "measure", mkt)
	add(false, "measure", mkt, "nope--entry")
	add(false, "measure", mkt, "cookbook--list")
	add(false, "measure", mkt, "cookbook--search-loading")
	add(false, "measure", mkt, MKTEntry, "--bogus", "x")
	add(false, "measure", mkt, MKTEntry, "--theme", "sepia")
	add(false, "measure", mkt, MKTEntry, "--motion", "fast")
	add(false, "measure", mkt, MKTEntry, "--delta", "no-such-spec")
	add(false, "measure", mkt, MKTEntry, "--theme")
	add(false, "measure", noViewportRoot, MKTEntry)
	add(false, "measure", noViewportRoot, MKTEntry, "--viewport", "1440x900")
	add(false, "measure", noViewportRoot, MKTEntry, "--viewport", "wide")
	add(false, "measure", bare, "a--entry")
	// time / step
	add(false, "time", mkt)
	add(false, "time", mkt, "--viewport", "1280x800", "--theme", "dark", "--motion", "reduce", "--locale", "ja")
	add(false, "time", noViewportRoot)
	add(false, "time", noViewportRoot, "--viewport", "1440x900")
	add(false, "time")
	add(false, "time", mkt, "extra")
	add(false, "time", mkt, "--bogus", "x")
	add(false, "time", bare)
	add(false, "step", "400")
	add(false, "step", "1")
	add(false, "step", "60000")
	for _, bad := range []string{"0", "-3", "1.5", "abc", "60001", "120000", ""} {
		add(false, "step", bad)
	}
	add(false, "step")
	add(false, "step", "400", "500")
	add(false, "step", "400", "--ms", "5")
	// screen / cover / pinned
	add(false, "screen", mkt, "s-login--entry", "--out", out)
	add(false, "screen", mkt, "s-login--entry", "--out", out, "--viewport", "390x844", "--theme", "dark", "--motion", "reduce")
	add(false, "screen", mkt, "a/b", "--out", out)
	add(false, "screen", mkt, ".x", "--out", out)
	add(false, "screen", mkt, "s-login--entry")
	add(false, "screen", mkt, "s-login--entry", "extra", "--out", out)
	add(false, "screen", mkt)
	add(false, "screen")
	add(false, "screen", noViewportRoot, "s-login--entry", "--out", out)
	add(false, "screen", bare, "s-login--entry", "--out", out)
	add(false, "cover", cookbook, "cookbook--list", "--out", out)
	add(false, "cover", cookbook, "cookbook--list", "--out", out, "--viewport", "390x844", "--theme", "dark", "--motion", "reduce")
	add(false, "cover", cookbook, "cookbook--list-long", "--out", out)
	add(false, "cover", coverDeltaRoot, "cookbook--list-long", "--out", out, "--delta", "demo-spec")
	add(false, "cover", coverDeltaRoot, "cookbook--list", "--out", out, "--delta", "no-such-spec")
	add(false, "cover", cookbook, "cookbook--search-failed", "--out", out)
	add(false, "cover", cookbook, "pantry--empty", "--out", out)
	add(false, "cover", mkt, MKTEntry, "--out", out)
	add(false, "cover", cookbook, "no-such-state", "--out", out)
	add(false, "cover", cookbook, "cookbook--list")
	add(false, "cover", cookbook, "cookbook--list", "extra", "--out", out)
	add(false, "cover", cookbook)
	add(false, "cover")
	add(false, "cover", bare, "cookbook--list", "--out", out)
	add(false, "pinned", mkt, MKT+"--feature-a-step-2", "--out", out)
	add(false, "pinned", mkt, "x--y", "--out", out, "--viewport", "800x600", "--theme", "dark", "--locale", "zh-CN")
	add(false, "pinned", mkt, "x--y")
	add(false, "pinned", mkt)
	add(false, "pinned")
	add(false, "pinned", mkt, "x--y", "z", "--out", out)
	add(false, "pinned", bare, "x--y", "--out", out)
	add(false, "pinned", mkt, "x--y", "--out", out, "--bogus", "1")
	// the command itself
	add(false)
	add(false, "galaxy")

	for _, c := range cases {
		compare(t, node, script, c)
	}
}

// ---------- the pure functions, on made-up inputs ----------

const oldCoverScreens = `
import { coverScreens } from %s;
import { readFileSync } from 'node:fs';
const cases = JSON.parse(readFileSync(0, 'utf8'));
console.log(JSON.stringify(cases.map((c) => { try { return { ok: coverScreens(c) }; } catch (e) { return { error: e.message }; } })));
`

func TestCoverScreensIsTheSameAsTheOldFunctionOnManyInputs(t *testing.T) {
	node, script := oldScript(t)
	rnd := rand.New(rand.NewSource(7))
	var cases []any
	for i := 0; i < 400; i++ {
		var comps []any
		for k := rnd.Intn(8); k > 0; k-- {
			top := float64(rnd.Intn(3000))
			c := O("id", string(rune('a'+len(comps))), "top", top, "bottom", top+float64(10+rnd.Intn(700)))
			if rnd.Intn(3) == 0 {
				c.Set("visibleBottom", float64(rnd.Intn(1000)))
			}
			comps = append(comps, c)
		}
		vh := []float64{300, 400, 600, 900}[rnd.Intn(4)]
		cases = append(cases, O("state", "s", "components", comps, "viewportHeight", vh, "pageHeight", vh+float64(rnd.Intn(5000))))
	}
	cases = append(cases,
		O("state", "", "components", []any{}, "viewportHeight", 900.0, "pageHeight", 1.0),
		O("state", "a/b", "components", []any{}, "viewportHeight", 900.0, "pageHeight", 1.0),
		O("state", ".a", "components", []any{}, "viewportHeight", 900.0, "pageHeight", 1.0),
		O("state", "s", "components", []any{}, "viewportHeight", 0.0, "pageHeight", 1.0),
		O("state", "s", "components", "x", "viewportHeight", 900.0, "pageHeight", 1.0),
		O("state", "s", "components", []any{}, "viewportHeight", 900.0, "pageHeight", 0.0),
	)
	helper := writeFile(t, t.TempDir(), "cover.mjs", strings.Replace(oldCoverScreens, "%s", stringify("file://"+script, 0), 1))
	cmd := exec.Command(node, helper)
	cmd.Stdin = strings.NewReader(stringify(cases, 0))
	var out bytes.Buffer
	cmd.Stdout = &out
	if err := cmd.Run(); err != nil {
		t.Fatal(err)
	}
	want := list(J(out.String()))
	if len(want) != len(cases) {
		t.Fatalf("the old function answered %d of %d", len(want), len(cases))
	}
	for i, c := range cases {
		got, err := CoverScreens(c.(Obj))
		var gotV any
		if err != nil {
			gotV = O("error", err.Error())
		} else {
			gotV = O("ok", got)
		}
		if stringify(gotV, 0) != stringify(want[i], 0) {
			t.Fatalf("case %d: %s\ngot  %s\nold  %s", i, stringify(c, 0), stringify(gotV, 0), stringify(want[i], 0))
		}
	}
}
