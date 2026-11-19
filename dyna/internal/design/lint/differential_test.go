package lint

import (
	"bytes"
	"encoding/json"
	"math/rand"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// The old scripts stay until the commands replace them; until then this runs both on the same text and holds the
// findings (and the text and JSON printed from them) the same. The rules were JavaScript regexes carried into RE2, so
// this is the check that nothing was lost on the way: every snippet below is a place the two engines could part.

func oldScripts(t *testing.T) string {
	t.Helper()
	if _, err := exec.LookPath("node"); err != nil {
		t.Skip("node is not on PATH")
	}
	dir, err := filepath.Abs(filepath.Join("..", "..", "..", "..", "idea-loop", "scripts"))
	if err != nil {
		t.Fatal(err)
	}
	return dir
}

// snippets are pieces of HTML, each touching one rule or one engine difference.
var snippets = []string{
	`<style>.a{box-shadow: 2px 2px 0 #0a0a0a}</style>`,
	`<style>.a{box-shadow: inset 3px -3px 0px rgba(0,0,0,.2), 0 4px 12px rgba(0,0,0,.1)}</style>`,
	`<style>.a{box-shadow: 0 0 0 1px #ccc; box-shadow: 1px 1px 2px #ccc}</style>`,
	`<div style="color:#6366F1;box-shadow:4px 4px 0 #000">x</div>`,
	`<div class="bg-indigo-500 text-violet-600 from-purple-400">x</div>`,
	"<div class=\"x\">\n<span style=\"color:#7c3aed\">a</span>\n</div>",
	`<style>h1{background-clip:text} h2{-webkit-background-clip: text}</style>`,
	`<p>Fast — and simple</p><p>Plain – dash</p>`,
	`<p>Ship it &mdash; today &ndash; now</p>`,
	`<p>这是中文——破折号</p><p>mixed 中文 — dash</p>`,
	`<p>🚀 launch ✨ now ☀ bright</p>`,
	`<img src="https://images.unsplash.com/a.jpg"><img src="https://placehold.co/10"><img src="//via.placeholder.com/1">`,
	`<style>.a{color:#000} .b{background:#000000} .c{border:1px solid #0008}</style>`,
	`<style>.a{transition: transform .3s cubic-bezier(.3,1.5,.6,1)} .b{animation: bounce 1s} .c{transition-timing-function: cubic-bezier(0.2, 2.5, 0.5, 1)}</style>`,
	`<style>.a{transition: width .2s, opacity .1s} .b{transition-property: margin-left} .c{transition: all .1s} .d{transition: opacity .2s}</style>`,
	`<style>.a{border-left: 4px solid #3b82f6}</style>`,
	`<style>.a{border-left: 4px solid  transparent}</style>`,
	`<style>.a{border-left: 4px solid transparent}</style>`,
	`<style>.a{border-left: 5px solid #E2E8F0} .b{border-left:3px solid   #e2e8f0aa}</style>`,
	"<style>.a{border-left: 4px solid\t\t#fff} .b{border-left: 9px solid  TRANSPARENT}</style>",
	`<style>.a{border-left: 2px solid red} .b{border-left:3px solid;}</style>`,
	`<section><span class="uppercase tracking-wide">a</span></section><section class="x uppercase y tracking-[0.2em]">b</section>`,
	`<section><style>.e{text-transform:uppercase;letter-spacing:0.12em} .f{text-transform: uppercase; letter-spacing: 2px}</style></section>`,
	`<style>.e{text-transform:uppercase} .pad{margin:0}` + "/* " + strings.Repeat("é", 400) + " */" + `.f{letter-spacing:0.1em}</style>`,
	`<p>Scroll to explore</p><p>scroll down</p><p>SCROLL TO DISCOVER</p>`,
	`<p>Elevate your team. A seamless, robust, innovative, cutting-edge platform that leverages synergies.</p>`,
	`<p>Seamlessly unleash holistic best-in-class state-of-the-art world-class next-gen supercharge revolutionizes</p>`,
	`<button>OK</button><button> Submit </button><button><b>Yes</b></button><button></button><button>Save recipe</button>`,
	`<a class="btn" href="#">No</a><a class="x cta y" href="#">Click here</a><a class="link" href="#">OK</a>`,
	`<input placeholder="Email"><input id="e" placeholder="Name"><label for="e">Name</label><input aria-label="x" placeholder="y">`,
	`<input id="a.b" placeholder="dot"><label for="axb">other</label>`,
	`<input id="a(b" placeholder="paren"><input placeholder="after paren">`,
	`<input id="x+" placeholder="plus"><label for="xxx">x</label>`,
	`<input type="text" placeholder="a very long placeholder that goes on and on and on past the seventy character mark for sure">`,
	"<p>a · b · c · d</p>\n<p>e · f</p>\n<p>1·2·3·4·5</p>",
	`<p>Lorem ipsum dolor sit amet</p>`,
	`<p>We love our work. We ship what we make; ours is us.</p><p>You and your team</p>`,
	`<p>we're glad we'll help; we've done it. Our product, ours.</p>`,
	`<style>@keyframes spin{to{transform:rotate(1turn)}} .a{animation: spin 1s}</style>`,
	`<style>@keyframes spin{to{transform:rotate(1turn)}} @media (prefers-reduced-motion: reduce){.a{animation:none}}</style>`,
	`<!-- 🚀 — scroll down --><script>var x = "— 🚀 lorem ipsum"</script>`,
	"<p>" + strings.Repeat("😀", 40) + " — " + strings.Repeat("x", 80) + "</p>",
	"<p> Fast — simple </p>",
	`<style>` + strings.Repeat(`.a{box-shadow: 1px 1px 0 #111}`, 12) + `</style>`,
	strings.Repeat(`<p>🎉 party</p>`, 12),
	strings.Repeat(`<img src="https://picsum.photos/1">`, 10),
}

func TestDifferentialLintFindsWhatTheOldScriptFound(t *testing.T) {
	scripts := oldScripts(t)
	rng := rand.New(rand.NewSource(7))
	var corpus []string
	corpus = append(corpus, "", "<p>nothing here</p>")
	for _, s := range snippets {
		corpus = append(corpus, s)
	}
	for i := 0; i < 400; i++ {
		var parts []string
		for k := 1 + rng.Intn(5); k > 0; k-- {
			parts = append(parts, snippets[rng.Intn(len(snippets))])
		}
		corpus = append(corpus, strings.Join(parts, "\n"))
	}

	in, _ := json.Marshal(corpus)
	dir := t.TempDir()
	corpusFile := filepath.Join(dir, "corpus.json")
	if err := os.WriteFile(corpusFile, in, 0o644); err != nil {
		t.Fatal(err)
	}
	const runner = `
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const { lintHtml, renderFindings } = await import(pathToFileURL(process.env.OLD_SCRIPT).href);
const corpus = JSON.parse(readFileSync(process.env.CORPUS, 'utf8'));
process.stdout.write(JSON.stringify(corpus.map((html) => { const f = lintHtml(html, '<input>'); return { text: renderFindings(f), json: JSON.stringify(f, null, 2) }; })));
`
	cmd := exec.Command("node", "--input-type=module", "-e", runner)
	cmd.Env = append(os.Environ(), "OLD_SCRIPT="+filepath.Join(scripts, "design-lint.mjs"), "CORPUS="+corpusFile)
	var out, errb bytes.Buffer
	cmd.Stdout, cmd.Stderr = &out, &errb
	if err := cmd.Run(); err != nil {
		t.Fatalf("%v\n%s", err, errb.String())
	}
	var want []struct{ Text, JSON string }
	if err := json.Unmarshal(out.Bytes(), &want); err != nil {
		t.Fatal(err)
	}
	if len(want) != len(corpus) {
		t.Fatalf("%d results for %d inputs", len(want), len(corpus))
	}
	bad := 0
	for i, html := range corpus {
		got := Lint(html, "<input>")
		if text := Render(got); text != want[i].Text {
			bad++
			if bad <= 3 {
				t.Errorf("text differs for %q\n--- old\n%s\n--- new\n%s", html, want[i].Text, text)
			}
		} else if j := findingsJSON(got); j != want[i].JSON {
			bad++
			if bad <= 3 {
				t.Errorf("json differs for %q\n--- old\n%s\n--- new\n%s", html, want[i].JSON, j)
			}
		}
	}
	if bad > 0 {
		t.Errorf("%d of %d inputs differ", bad, len(corpus))
	}
}

// The hook itself: the old PostToolUse entry and the new --hook, given the same event, say the same thing and exit
// the same way.
func TestDifferentialHookSaysWhatTheOldHookSaid(t *testing.T) {
	scripts := oldScripts(t)
	root := t.TempDir()
	files := map[string]string{
		"docs/design/tmp/a/canvas/dirty.html":             `<style>h1{background-clip:text}</style><p>x — y</p>`,
		"docs/design/tmp/a/canvas/p1.html":                `<p>🚀</p>`,
		"docs/design/tmp/a/canvas/p2only.html":            `<p>Lorem ipsum</p>`,
		"docs/design/tmp/a/canvas/clean.html":             clean,
		"docs/design/tmp/a/canvas/assets/dirty.html":      dirty,
		"docs/design/tmp/a/imagine/dirty.html":            dirty,
		"design-preview/dirty.html":                       dirty,
		"design-motion-preview/clean.html":                clean,
		"docs/design/tmp/a/canvas/notes.md":               dirty,
		"docs/design/prod/pages/p/index.html":             dirty,
		"home/projects/x/docs/design/tmp/s/canvas/a.html": dirty,
	}
	var events []string
	for rel, html := range files {
		events = append(events, event(put(t, root, rel, html)))
	}
	events = append(events, event(filepath.Join(root, "docs/design/tmp/a/canvas/gone.html")), "not json", "", `{}`, `{"tool_input":{"file_path":7}}`, `{"tool_input":null}`)
	for _, ev := range events {
		old := exec.Command("node", filepath.Join(scripts, "design-lint-hook.mjs"))
		old.Stdin = strings.NewReader(ev)
		var oerr bytes.Buffer
		old.Stderr = &oerr
		oldCode := 0
		if err := old.Run(); err != nil {
			ee, ok := err.(*exec.ExitError)
			if !ok {
				t.Fatal(err)
			}
			oldCode = ee.ExitCode()
		}
		_, errs, code := execute(ev, "--hook")
		if code != oldCode || errs != oerr.String() {
			t.Errorf("event %s\n--- old (exit %d)\n%s\n--- new (exit %d)\n%s", ev, oldCode, oerr.String(), code, errs)
		}
	}
}
