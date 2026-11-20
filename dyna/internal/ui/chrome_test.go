package ui

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/serve"
)

// What the browser sees. These tests drive a real Chrome (a mocked browser would only test the mock) against
// pages served the way `dyna serve` serves them, and are skipped when the machine has no Chrome or Chromium.

func chromeOrSkip(t *testing.T) string {
	t.Helper()
	if testing.Short() {
		t.Skip("starts a browser")
	}
	path, err := FindChrome(os.Getenv)
	if err != nil {
		t.Skip("no Chrome or Chromium on this machine: ", err)
	}
	return path
}

var (
	sharedOnce    sync.Once
	sharedBrowser *chrome
	sharedErr     error
)

// sharedChrome is one browser for the whole run of these tests: each matrix has a browser context of its own
// anyway, and starting a Chrome for every test would be most of the time they take.
func sharedChrome(t *testing.T) *chrome {
	t.Helper()
	path := chromeOrSkip(t)
	sharedOnce.Do(func() { sharedBrowser, sharedErr = launchChrome(context.Background(), path) })
	if sharedErr != nil {
		t.Fatal(sharedErr)
	}
	return sharedBrowser
}

// pages serves a directory of pages, with /slow.json answering after 400 ms.
func pages(t *testing.T, files map[string]string) string {
	t.Helper()
	dir := t.TempDir()
	for name, text := range files {
		write(t, filepath.Join(dir, name), text)
	}
	files2 := serve.Handler(dir)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/slow.json" {
			time.Sleep(400 * time.Millisecond)
			_, _ = w.Write([]byte(`{"top": 120}`))
			return
		}
		files2.ServeHTTP(w, r)
	}))
	t.Cleanup(srv.Close)
	return srv.URL
}

func walk(t *testing.T, m Matrix) MatrixResult {
	t.Helper()
	b := sharedChrome(t)
	var err error
	res, err := b.Walk(context.Background(), m)
	if err != nil {
		t.Fatal(err)
	}
	return res
}

func findingKeys(res MatrixResult) []string {
	var keys []string
	for _, f := range res.Findings {
		a, p := "", ""
		if f.Anchor != nil {
			a = *f.Anchor
		}
		if f.Property != nil {
			p = *f.Property
		}
		keys = append(keys, f.ID+" "+a+"."+p)
	}
	return keys
}

const box = `<body style="margin:0;font:16px sans-serif">
<div data-anchor="hero" style="position:absolute;top:%TOP%px;left:40px;width:320px;height:48px;background:%BG%;color:#fff">Hero</div>
<div data-anchor="%CTA%" style="position:absolute;top:200px;left:40px;width:100px;height:40px;background:#eee"></div></body>`

func boxPage(top, bg, cta string) string {
	return strings.NewReplacer("%TOP%", top, "%BG%", bg, "%CTA%", cta).Replace(box)
}

func cell(name string) Cell {
	return Cell{Name: name, Viewport: Viewport{Width: 390, Height: 844}}
}

func TestTheSamePageOnBothSidesIsGreen(t *testing.T) {
	url := pages(t, map[string]string{"a.html": boxPage("100", "#1d7fec", "cta"), "b.html": boxPage("100", "#1d7fec", "cta")})
	res := walk(t, Matrix{Canvas: url + "/a.html", Local: url + "/b.html", Cells: []Cell{cell("mobile/light")}})
	if len(res.Findings) != 0 || len(res.HumanCells) != 0 {
		t.Fatalf("%v", findingKeys(res))
	}
}

func TestADriftAWrongTokenAMissingAnchorAndAPixelDifferenceAreEachNamed(t *testing.T) {
	url := pages(t, map[string]string{"canvas.html": boxPage("100", "#1d7fec", "cta"), "local.html": boxPage("110", "#d03030", "button")})
	res := walk(t, Matrix{Canvas: url + "/canvas.html", Local: url + "/local.html", Cells: []Cell{cell("mobile/light")}})
	got := strings.Join(findingKeys(res), ",")
	for _, want := range []string{
		"missing-anchor cta.",
		"position-drift hero.top",
		"token-mismatch hero.backgroundColor",
		"pixel-mismatch .",
	} {
		if !strings.Contains(got, want) {
			t.Errorf("no %q in %s", want, got)
		}
	}
	// most severe first, and the numbers are the page's
	if res.Findings[0].ID != "missing-anchor" || *res.Findings[0].Cell != "mobile/light" {
		t.Fatalf("%v", findingKeys(res))
	}
	for _, f := range res.Findings {
		if f.ID == "position-drift" && (f.Expected != 100.0 || f.Actual != 110.0 || *f.Delta != 10) {
			t.Fatalf("%+v", f)
		}
		if f.ID == "token-mismatch" && (f.Expected != "rgb(29, 127, 236)" || f.Actual != "rgb(208, 48, 48)") {
			t.Fatalf("%+v", f)
		}
	}
}

func TestACellMayLoosenTheToleranceAndAHumanCellIsNotWalked(t *testing.T) {
	url := pages(t, map[string]string{"canvas.html": boxPage("100", "#1d7fec", "cta"), "local.html": boxPage("103", "#1d7fec", "cta")})
	four := 4.0
	hundred := 100.0
	m := Matrix{Canvas: url + "/canvas.html", Local: url + "/local.html", Cells: []Cell{
		{Name: "loose", Viewport: Viewport{Width: 390, Height: 844}, Tolerance: &Tolerance{Position: &four, Pixel: &hundred}},
		{Name: "tight", Viewport: Viewport{Width: 390, Height: 844}, Tolerance: &Tolerance{Pixel: &hundred}},
		{Name: "hover", Viewport: Viewport{Width: 390, Height: 844}, Review: "human"},
	}}
	res := walk(t, m)
	if got := strings.Join(findingKeys(res), ","); got != "position-drift hero.top" || *res.Findings[0].Cell != "tight" {
		t.Fatalf("only the tight cell finds the 3px: %s", got)
	}
	if len(res.HumanCells) != 1 || res.HumanCells[0] != "hover" {
		t.Fatal(res.HumanCells)
	}
}

// The color scheme, the state in the URL and the wait for the network all reach the page.
func TestSchemeStateAndNetworkIdleReachThePage(t *testing.T) {
	canvas := `<body style="margin:0"><style>:root{--c:#111}@media (prefers-color-scheme: dark){:root{--c:#9ad}}</style>
<div data-anchor="x" style="position:absolute;top:10px;left:10px;width:50px;height:50px;background:var(--c)"></div></body>`
	// the port is the same in light, and a different color in dark; and it draws its box only after a slow fetch
	local := `<body style="margin:0"><style>:root{--c:#111}@media (prefers-color-scheme: dark){:root{--c:#a00}}</style>
<script>
const w = new URLSearchParams(location.search).get('state') === 'wide' ? 50 : 50;
fetch('/slow.json').then(r => r.json()).then(() => {
  document.body.insertAdjacentHTML('beforeend', '<div data-anchor="x" style="position:absolute;top:10px;left:10px;width:' + w + 'px;height:50px;background:var(--c)"></div>');
});
</script></body>`
	url := pages(t, map[string]string{"canvas.html": canvas, "local.html": local})
	m := Matrix{Canvas: url + "/canvas.html", Local: url + "/local.html", Cells: []Cell{
		{Name: "light", Viewport: Viewport{Width: 200, Height: 200}},
		{Name: "dark", Viewport: Viewport{Width: 200, Height: 200}, ColorScheme: "dark"},
	}}
	res := walk(t, m)
	var got []string
	for _, f := range res.Findings {
		got = append(got, *f.Cell+":"+f.ID)
	}
	if strings.Join(got, ",") != "dark:token-mismatch,dark:pixel-mismatch" {
		t.Fatalf("light matches (so the slow fetch was waited for); dark does not (so the scheme was emulated): %v", got)
	}
	if f := res.Findings[0]; f.Expected != "rgb(153, 170, 221)" || f.Actual != "rgb(170, 0, 0)" {
		t.Fatalf("%+v", f)
	}
}

func TestTheStateIsPutInTheURLOfBothTabs(t *testing.T) {
	both := `<body style="margin:0"><script>
const s = new URLSearchParams(location.search).get('state');
document.body.insertAdjacentHTML('beforeend', '<div data-anchor="x" style="position:absolute;top:0;left:0;width:' + (s === 'wide' ? 120 : 40) + 'px;height:30px;background:#444"></div>');
</script></body>`
	url := pages(t, map[string]string{"c.html": both, "l.html": both})
	c := cell("wide")
	c.State = "wide"
	res := walk(t, Matrix{Canvas: url + "/c.html", Local: url + "/l.html", Cells: []Cell{c}})
	if len(res.Findings) != 0 {
		t.Fatal(findingKeys(res))
	}
	// and the state really changed what was measured: the canvas is asked for 'wide', the local is not
	loc := pages(t, map[string]string{"l.html": strings.ReplaceAll(both, "'wide'", "'never'")})
	res = walk(t, Matrix{Canvas: url + "/c.html", Local: loc + "/l.html", Cells: []Cell{c}})
	if got := strings.Join(findingKeys(res), ","); !strings.Contains(got, "position-drift x.width") {
		t.Fatal(got)
	}
}

// A matrix has a browser context of its own: what one matrix's pages store never reaches another's, even when
// they walk at the same moment in the same browser.
func TestMatricesInOneBrowserDoNotShareStorage(t *testing.T) {
	remember := `<body style="margin:0"><script>
const seen = localStorage.getItem('seen');
localStorage.setItem('seen', '1');
document.body.insertAdjacentHTML('beforeend', '<div data-anchor="x" style="position:absolute;top:0;left:0;width:' + (seen ? 999 : 100) + 'px;height:30px;background:#444"></div>');
</script></body>`
	plain := `<body style="margin:0"><div data-anchor="x" style="position:absolute;top:0;left:0;width:100px;height:30px;background:#444"></div></body>`
	canvasURL := pages(t, map[string]string{"c.html": remember})
	localURL := pages(t, map[string]string{"l.html": plain})
	one := Matrix{Canvas: canvasURL + "/c.html", Local: localURL + "/l.html", Cells: []Cell{cell("one")}}

	b := sharedChrome(t)
	var err error
	results, err := mapLimit(context.Background(), []Matrix{one, one, one}, 3, b.Walk)
	if err != nil {
		t.Fatal(err)
	}
	for i, r := range results {
		if len(r.Findings) != 0 {
			t.Errorf("matrix %d saw what another stored: %v", i, findingKeys(r))
		}
	}
}

func TestTheDevicePixelRatioMakesTheScreenshotBigger(t *testing.T) {
	url := pages(t, map[string]string{"a.html": boxPage("100", "#1d7fec", "cta")})
	b := sharedChrome(t)
	var err error
	bctx, dispose, err := b.newContext()
	if err != nil {
		t.Fatal(err)
	}
	defer dispose()
	tb, cancelTab, err := b.newTab(bctx)
	if err != nil {
		t.Fatal(err)
	}
	defer cancelTab()
	for _, dpr := range []float64{1, 2} {
		if err := tb.prepare(url+"/a.html", Cell{Name: "c", Viewport: Viewport{Width: 300, Height: 400}}, dpr); err != nil {
			t.Fatal(err)
		}
		shot, err := tb.screenshot()
		if err != nil {
			t.Fatal(err)
		}
		img, err := DecodePNG(shot, "shot")
		if err != nil {
			t.Fatal(err)
		}
		if img.Width != int(300*dpr) || img.Height != int(400*dpr) {
			t.Errorf("dpr %v: %d×%d", dpr, img.Width, img.Height)
		}
	}
}

func TestAnAddressThatCannotBeOpenedIsAnErrorNotAFinding(t *testing.T) {
	b := sharedChrome(t)
	url := pages(t, map[string]string{"a.html": boxPage("100", "#1d7fec", "cta")})
	_, err := b.Walk(context.Background(), Matrix{Canvas: url + "/a.html", Local: "http://127.0.0.1:1/", Cells: []Cell{cell("x")}})
	if err == nil || !strings.Contains(err.Error(), "本地页面") {
		t.Fatal(err)
	}
}

// The whole command, with a real Chrome: the exit code, the text, the JSON and the memo.
func TestTheCommandEndToEnd(t *testing.T) {
	chromeOrSkip(t)
	url := pages(t, map[string]string{"canvas.html": boxPage("100", "#1d7fec", "cta"), "same.html": boxPage("100", "#1d7fec", "cta"), "local.html": boxPage("110", "#1d7fec", "cta")})
	dir := t.TempDir()
	green := write(t, filepath.Join(dir, "green.json"), `{"canvas":"`+url+`/canvas.html","local":"`+url+`/same.html","cells":[{"name":"mobile","viewport":{"width":390,"height":844}}]}`)
	red := write(t, filepath.Join(dir, "matrix.json"), `{"canvas":"`+url+`/canvas.html","local":"`+url+`/local.html","dpr":2,"cells":[{"name":"mobile","viewport":{"width":390,"height":844}}]}`)

	if r := run(Deps{}, "measure", green); r.code != 0 || strings.TrimSpace(r.out) != "ui-measure: green ✓" {
		t.Fatal(r.all())
	}
	r := run(Deps{}, "measure", red, "--json")
	if r.code != 2 {
		t.Fatal(r.all())
	}
	var got struct {
		Findings []struct{ ID, Detail string }
		Plateau  bool `json:"瓶颈"`
	}
	if err := json.Unmarshal([]byte(r.out), &got); err != nil || len(got.Findings) == 0 || got.Plateau {
		t.Fatal(err, r.out)
	}
	if again := run(Deps{}, "measure", red); again.code != 2 || !strings.Contains(again.out, "瓶颈：同一批 finding 连续两轮不变") {
		t.Fatal(again.all())
	}
	both := run(Deps{}, "measure", green, red, "--concurrency", "2")
	if both.code != 2 || !strings.Contains(both.out, "== "+green) || !strings.Contains(both.out, "position-drift") {
		t.Fatal(both.all())
	}
}

func TestFindChromeHonoursTheEnvironmentVariable(t *testing.T) {
	fake := write(t, filepath.Join(t.TempDir(), "chrome"), "")
	env := func(k string) string {
		if k == EnvChrome {
			return fake
		}
		return ""
	}
	if p, err := FindChrome(env); err != nil || p != fake {
		t.Fatal(p, err)
	}
	missing := func(k string) string {
		if k == EnvChrome {
			return filepath.Join(t.TempDir(), "nope")
		}
		return ""
	}
	if _, err := FindChrome(missing); err == nil || !strings.Contains(err.Error(), EnvChrome) {
		t.Fatal(err)
	}
}
