package research_test

import (
	"bytes"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/app"
)

type outcome struct {
	stdout, stderr string
	code           int
}

func dyna(args ...string) outcome {
	var out, errb bytes.Buffer
	code := app.Run(args, app.IO{Stdin: strings.NewReader(""), Stdout: &out, Stderr: &errb, Env: func(string) string { return "" }})
	return outcome{out.String(), errb.String(), code}
}

// dropDir makes a drop directory with the page and the pictures the default page points at.
func dropDir(t *testing.T, html string) string {
	t.Helper()
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, "shots"), 0o755); err != nil {
		t.Fatal(err)
	}
	for _, f := range []string{"acme-1", "acme-2"} {
		for _, suffix := range []string{"", "-full"} {
			if err := os.WriteFile(filepath.Join(dir, "shots", f+suffix+".png"), []byte("x"), 0o644); err != nil {
				t.Fatal(err)
			}
		}
	}
	if err := os.WriteFile(filepath.Join(dir, "index.html"), []byte(html), 0o644); err != nil {
		t.Fatal(err)
	}
	return dir
}

func TestSubmitGreenExitsZeroABadPageExitsTwoNamingTheProblemAMissingFileOrNoArgumentExitsOne(t *testing.T) {
	dir := dropDir(t, page())
	index := filepath.Join(dir, "index.html")
	r := dyna("research", "submit", index)
	if r.code != 0 || !strings.Contains(r.stdout, "green") {
		t.Fatalf("%+v", r)
	}

	bad := pageWith(func(c *pageCfg) {
		c.sources = []string{sourceWith(func(s *sourceCfg) { s.steps = []step{st("shots/gone.png", "点 X")} })}
	})
	if err := os.WriteFile(index, []byte(bad), 0o644); err != nil {
		t.Fatal(err)
	}
	r = dyna("research", "submit", index)
	if r.code != 2 || !strings.Contains(r.stdout, "shots/gone.png") {
		t.Fatalf("%+v", r)
	}

	j := dyna("research", "submit", index, "--json")
	var parsed struct{ Valid bool }
	if err := json.Unmarshal([]byte(j.stdout), &parsed); err != nil || parsed.Valid || j.code != 2 {
		t.Fatalf("%+v %v", j, err)
	}

	if r := dyna("research", "submit", filepath.Join(dir, "nope.html")); r.code != 1 {
		t.Fatalf("%+v", r)
	}
	if r := dyna("research", "submit"); r.code != 1 {
		t.Fatalf("%+v", r)
	}
}

// The old script is asked the same question over the same pages and must answer the same, byte for byte, with the
// same exit code. The old script stays in the repository until the last ticket removes it; node runs it, and
// without node (or once it is gone) this test is skipped.
func TestSubmitAnswersLikeTheOldScript(t *testing.T) {
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node is not installed")
	}
	script, _ := filepath.Abs(filepath.Join("..", "..", "..", "idea-loop", "scripts", "research-check.mjs"))
	if _, err := os.Stat(script); err != nil {
		t.Skip("the old script is gone")
	}
	b := blocksOf(page())
	h1, brief, conclusion, src, decisions := b[0], b[1], b[2], b[3], b[4]
	pages := map[string]string{
		"green": page(),
		"gone": pageWith(func(c *pageCfg) {
			c.sources = []string{sourceWith(func(s *sourceCfg) { s.steps = []step{st("shots/gone.png", "点 X")} })}
		}),
		"remote": pageWith(func(c *pageCfg) {
			c.sources = []string{sourceWith(func(s *sourceCfg) { s.steps = []step{st("https://x/a.png", "点 X")} })}
		}),
		"no-zoom": pageWith(func(c *pageCfg) {
			c.sources = []string{sourceWith(func(s *sourceCfg) { s.steps = []step{stNoZoom("shots/acme-1.png", "点 X")} })}
		}),
		"no-label": pageWith(func(c *pageCfg) {
			c.sources = []string{sourceWith(func(s *sourceCfg) { s.steps = []step{stNoLabel("shots/acme-1.png")} })}
		}),
		"two": pageWith(func(c *pageCfg) {
			c.sources = []string{source(), sourceWith(func(s *sourceCfg) { s.title = ""; s.scene = "" })}
		}),
		"order":     assemble(h1, brief, src, conclusion, decisions),
		"head-late": assemble(h1, conclusion, brief, src, decisions),
		"footer":    strings.Replace(page(), "</body>", `<section data-part="footer"><p>附</p></section></body>`, 1),
		"retired":   strings.Replace(page(), "</body>", `<section data-part="cannot-answer"><p>…</p></section></body>`, 1),
		"no-source": pageWith(func(c *pageCfg) { c.sources = nil }),
		"why": pageWith(func(c *pageCfg) {
			c.sources = []string{`<section data-part="no-source">搜了三页，没有。</section>`}
		}),
		"empty-head": pageWith(func(c *pageCfg) { c.context = "  "; c.general = "" }),
		"hidden":     strings.Replace(page(), "<body>", `<body><!-- <div data-part="general">x</div> --><script>var s = '<div data-part="general">x</div>'</script>`, 1),
		"stray-img":  pageWith(func(c *pageCfg) { c.general = `<p>x</p><img src="shots/none.png" alt=""><img alt="">` }),
	}
	for name, html := range pages {
		dir := dropDir(t, html)
		index := filepath.Join(dir, "index.html")
		for _, flags := range [][]string{nil, {"--json"}} {
			cmd := exec.Command(node, append([]string{script, index}, flags...)...)
			var out, errb bytes.Buffer
			cmd.Stdout, cmd.Stderr = &out, &errb
			code := 0
			if err := cmd.Run(); err != nil {
				ee, ok := err.(*exec.ExitError)
				if !ok {
					t.Fatal(err)
				}
				code = ee.ExitCode()
			}
			got := dyna(append([]string{"research", "submit", index}, flags...)...)
			if got.stdout != out.String() || got.code != code {
				t.Errorf("%s %v: old (%d)\n%s\nnew (%d)\n%s", name, flags, code, out.String(), got.code, got.stdout)
			}
		}
	}
}
