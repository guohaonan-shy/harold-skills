package og

// The assertions of og-render.test.mjs (main), and of og-render-browser.test.mjs through package ui's Chrome (skipped
// when the machine has none, as the other Chrome tests are).

import (
	"bytes"
	"context"
	"crypto/md5"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"testing"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/design/jsx"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/nexterr"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/ui"
)

// assets is the plugin's own layouts, in this repository.
var assets, _ = filepath.Abs(filepath.Join("..", "..", "..", "..", "idea-loop", "skills", "seo", "og", "assets"))

var pixel, _ = base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")

func params(t *testing.T, kv map[string]any) any {
	t.Helper()
	base := map[string]any{"layout": "poster", "title": "How a sourdough starter really works", "brand": "Acme Bakery"}
	for k, v := range kv {
		if v == nil {
			delete(base, k)
		} else {
			base[k] = v
		}
	}
	b, _ := json.Marshal(base)
	v, err := jsx.ParseJSON(b)
	if err != nil {
		t.Fatal(err)
	}
	return v
}

func layouts(t *testing.T) []string {
	t.Helper()
	ls, err := Layouts(assets)
	if err != nil {
		t.Fatal(err)
	}
	return ls
}

func render(t *testing.T, kv map[string]any) Card {
	t.Helper()
	c, err := RenderHTML(params(t, kv), t.TempDir(), assets)
	if err != nil {
		t.Fatal(err)
	}
	return c
}

func TestTheLayoutsAreTheTemplateFilesNoneOfThemTheSharedParts(t *testing.T) {
	ls := layouts(t)
	if !sort.StringsAreSorted(ls) || len(ls) < 2 || len(ls) > 3 {
		t.Fatal(ls)
	}
	for _, l := range ls {
		if strings.HasPrefix(l, "_") {
			t.Fatal(l)
		}
	}
}

func TestACardNeedsAKnownLayoutATitleAndABrandAndTheErrorsListTheLayouts(t *testing.T) {
	_, errs := Normalize(params(t, map[string]any{"layout": "nope", "brand": "", "title": nil}), layouts(t))
	text := strings.Join(errs, "\n")
	for _, want := range append([]string{"layout", "title", "brand"}, layouts(t)...) {
		if !strings.Contains(text, want) {
			t.Errorf("no %q in %s", want, text)
		}
	}
}

func TestEveryLayoutRendersWithoutALeftoverPlaceholderAtTheOGSize(t *testing.T) {
	for _, l := range layouts(t) {
		html := render(t, map[string]any{"layout": l}).HTML
		if strings.Contains(html, "{{") || !strings.Contains(html, "1200px") || !strings.Contains(html, "630px") || !strings.Contains(html, "How a sourdough starter really works") {
			t.Errorf("%s", l)
		}
	}
}

func TestTextIsEscaped(t *testing.T) {
	html := render(t, map[string]any{"title": `<b>5 & 6</b> "quoted"`}).HTML
	if !strings.Contains(html, "&lt;b&gt;5 &amp; 6&lt;/b&gt; &quot;quoted&quot;") || strings.Contains(html, "<b>5") {
		t.Fatal("not escaped")
	}
}

func TestNoColorsGivenNeutralDefaultsAreUsedAndReported(t *testing.T) {
	c := render(t, nil)
	if strings.Join(c.Defaults, ",") != "colors,font,logo" || !strings.Contains(c.HTML, "--accent:"+DefaultColors["accent"]) {
		t.Fatal(c.Defaults)
	}
}

func TestProjectColorsAndFontReplaceTheDefaults(t *testing.T) {
	c := render(t, map[string]any{"colors": map[string]any{"accent": "#c2410c", "accentInk": "#ffffff"}, "font": map[string]any{"family": "Source Serif 4, serif"}})
	if !strings.Contains(c.HTML, "--accent:#c2410c") || !strings.Contains(c.HTML, "--bg:"+DefaultColors["bg"]) || !strings.Contains(c.HTML, "Source Serif 4, serif") ||
		strings.Contains(strings.Join(c.Defaults, ","), "font") || !strings.Contains(strings.Join(c.Defaults, ","), "colors") {
		t.Fatal(c.Defaults)
	}
}

func TestABadColorIsAnErrorNotAStyleInjection(t *testing.T) {
	_, errs := Normalize(params(t, map[string]any{"colors": map[string]any{"accent": "red;}</style><script>x()</script>"}}), layouts(t))
	if len(errs) == 0 || !strings.Contains(strings.Join(errs, "\n"), "accent") {
		t.Fatal(errs)
	}
}

func TestTitleSizeSetsTheRangeAndABadRangeIsAnError(t *testing.T) {
	if !strings.Contains(render(t, map[string]any{"titleSize": map[string]any{"max": 90, "min": 40}}).HTML, `data-fit="90:40"`) {
		t.Fatal("custom range")
	}
	own := render(t, nil).HTML
	if !regexp.MustCompile(`<h1 class="title" data-fit="\d+:\d+">`).MatchString(own) || strings.Contains(own, `data-fit="90:40"`) {
		t.Fatal("own range")
	}
	for _, bad := range []map[string]any{{"max": 30, "min": 40}, {"max": 400, "min": 40}, {"max": "big", "min": 20}, {"max": 80}} {
		_, errs := Normalize(params(t, map[string]any{"titleSize": bad}), layouts(t))
		if !strings.Contains(strings.Join(errs, "\n"), "titleSize") {
			t.Errorf("%v: %v", bad, errs)
		}
	}
}

func TestLanguageIsReadFromTheTitle(t *testing.T) {
	if DetectLang("发酵面团到底是怎么回事") != "zh" || DetectLang("パンの発酵") != "zh" || DetectLang("Sourdough 101") != "en" {
		t.Fatal()
	}
	p, _ := Normalize(params(t, map[string]any{"lang": "fr"}), layouts(t))
	if p.Lang != "fr" {
		t.Fatal(p.Lang)
	}
}

// ---- the commands ----

type result struct {
	code           int
	stdout, stderr string
}

func run(d Deps, args ...string) result {
	var out bytes.Buffer
	d.Stdout = &out
	if d.Env == nil {
		d.Env = func(string) string { return "" }
	}
	c := Command(d)
	c.SetArgs(args)
	c.SetOut(&out)
	c.SetErr(&out)
	r := result{}
	if err := c.Execute(); err != nil {
		var ex *nexterr.Exit
		if errors.As(err, &ex) {
			r.code, r.stderr = ex.Code, ex.Msg
		} else {
			r.code, r.stderr = 1, err.Error()
		}
	}
	r.stdout = out.String()
	return r
}

func put(t *testing.T, dir, name string, v any) string {
	t.Helper()
	p := filepath.Join(dir, name)
	var b []byte
	switch x := v.(type) {
	case []byte:
		b = x
	case string:
		b = []byte(x)
	default:
		b, _ = json.Marshal(x)
	}
	if err := os.WriteFile(p, b, 0o644); err != nil {
		t.Fatal(err)
	}
	return p
}

var base = map[string]any{"layout": "poster", "title": "How a sourdough starter really works", "brand": "Acme Bakery"}

func TestTheHTMLCommandWritesTheCardInliningALogoAndSaysWhatFellBack(t *testing.T) {
	d := t.TempDir()
	put(t, d, "logo.png", pixel)
	p := map[string]any{"logo": "logo.png"}
	for k, v := range base {
		p[k] = v
	}
	r := run(Deps{}, "html", put(t, d, "params.json", p), filepath.Join(d, "out.html"), "--assets", assets)
	if r.code != 0 {
		t.Fatal(r)
	}
	var out struct {
		HTML     string
		Layout   string
		Defaults []string
	}
	if err := json.Unmarshal([]byte(r.stdout), &out); err != nil || out.Layout != "poster" || strings.Join(out.Defaults, ",") != "colors,font" {
		t.Fatal(err, r.stdout)
	}
	if !strings.HasPrefix(r.stdout, `{"html":`) {
		t.Fatalf("the keys keep their order: %s", r.stdout)
	}
	html, _ := os.ReadFile(filepath.Join(d, "out.html"))
	if !regexp.MustCompile(`src="data:image/png;base64,`).Match(html) {
		t.Fatal("logo not inlined")
	}
}

func TestABadParamsFileIsExit2ListingTheProblemsAndAMissingOneExit1(t *testing.T) {
	d := t.TempDir()
	bad := run(Deps{}, "html", put(t, d, "params.json", map[string]any{"layout": "poster"}), filepath.Join(d, "out.html"), "--assets", assets)
	if bad.code != 2 || !strings.Contains(bad.stderr, "title") {
		t.Fatal(bad)
	}
	if r := run(Deps{}, "html", filepath.Join(d, "none.json"), filepath.Join(d, "out.html"), "--assets", assets); r.code != 1 {
		t.Fatal(r)
	}
	broken := run(Deps{}, "html", put(t, d, "broken.json", "{ nope"), filepath.Join(d, "out.html"), "--assets", assets)
	if broken.code != 1 || !strings.Contains(broken.stderr, "不是合法 JSON") {
		t.Fatal(broken)
	}
	missingLogo := map[string]any{"logo": "nope.png"}
	for k, v := range base {
		missingLogo[k] = v
	}
	if r := run(Deps{}, "html", put(t, d, "logo.json", missingLogo), filepath.Join(d, "out.html"), "--assets", assets); r.code != 2 || !strings.Contains(r.stderr, "图片不存在") {
		t.Fatal(r)
	}
}

func TestLayoutsPrintsTheNamesAndTheAssetsComeFromThePluginRootOrTheFlag(t *testing.T) {
	r := run(Deps{}, "layouts", "--assets", assets)
	if r.code != 0 || strings.TrimSpace(r.stdout) != strings.Join(layouts(t), "\n") {
		t.Fatal(r)
	}
	root := filepath.Join(assets, "..", "..", "..", "..")
	fromRoot := run(Deps{Env: func(k string) string {
		if k == EnvPluginRoot {
			return root
		}
		return ""
	}}, "layouts")
	if fromRoot.code != 0 || fromRoot.stdout != r.stdout {
		t.Fatal(fromRoot)
	}
	if none := run(Deps{}, "layouts"); none.code != 1 || !strings.Contains(none.stderr, EnvPluginRoot) || !strings.Contains(none.stderr, "--assets") {
		t.Fatal(none)
	}
}

func TestMd5PrintsTheDigestAndWithURLSaysWhetherTheServerHandsBackTheSameBytes(t *testing.T) {
	d := t.TempDir()
	file := put(t, d, "a.png", "first render")
	sum := md5.Sum([]byte("first render"))
	want := hex.EncodeToString(sum[:])
	r := run(Deps{}, "md5", file)
	if r.code != 0 || r.stdout != `{"file":"`+file+`","md5":"`+want+`"}`+"\n" {
		t.Fatal(r)
	}
	var mu sync.Mutex
	body := "first render"
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		mu.Lock()
		defer mu.Unlock()
		w.Write([]byte(body))
	}))
	defer srv.Close()
	same := run(Deps{}, "md5", file, "--url", srv.URL+"/a.png")
	var out struct{ Served string }
	if same.code != 0 || json.Unmarshal([]byte(same.stdout), &out) != nil || out.Served != want {
		t.Fatal(same)
	}
	mu.Lock()
	body = "stale render"
	mu.Unlock()
	if stale := run(Deps{}, "md5", file, "--url", srv.URL+"/a.png"); stale.code != 3 || !strings.Contains(stale.stderr, "不一致") {
		t.Fatal(stale)
	}
	if r := run(Deps{}, "md5", filepath.Join(d, "nope.png")); r.code != 1 {
		t.Fatal(r)
	}
}

func TestRenderWithoutABrowserWritesTheHTMLAndExits1(t *testing.T) {
	d := t.TempDir()
	noBrowser := Deps{Shoot: func(context.Context, string, bool) (Verdict, []byte, error) {
		return Verdict{}, nil, ui.ErrNoBrowser
	}}
	r := run(noBrowser, "render", put(t, d, "params.json", base), filepath.Join(d, "card.png"), "--assets", assets)
	if r.code != 1 || !strings.Contains(r.stderr, filepath.Join(d, "card.html")) || !strings.Contains(r.stderr, "data-fit") {
		t.Fatal(r)
	}
	if _, err := os.Stat(filepath.Join(d, "card.html")); err != nil {
		t.Fatal(err)
	}
}

func TestRenderThatDoesNotFitWritesThePNGAndExits4(t *testing.T) {
	d := t.TempDir()
	overflow := Deps{Shoot: func(context.Context, string, bool) (Verdict, []byte, error) {
		return Verdict{Fit: "overflow", Overflow: "title", Sizes: json.RawMessage(`{"title":44}`)}, pixel, nil
	}}
	png := filepath.Join(d, "card.png")
	r := run(overflow, "render", put(t, d, "params.json", base), png, "--assets", assets)
	if r.code != 4 || !strings.Contains(r.stderr, "放不下：title") || !strings.Contains(r.stdout, `"fit":"overflow"`) || !strings.HasPrefix(r.stdout, `{"png":`) {
		t.Fatal(r)
	}
	if b, _ := os.ReadFile(png); !bytes.Equal(b, pixel) {
		t.Fatal("the PNG is written so it can be looked at")
	}
}

// ---- in a real browser ----

func chromeOrSkip(t *testing.T) {
	t.Helper()
	if testing.Short() {
		t.Skip("starts a browser")
	}
	if _, err := ui.FindChrome(os.Getenv); err != nil {
		t.Skip("no Chrome or Chromium on this machine: ", err)
	}
}

func shoot(t *testing.T, html string, png bool) (Verdict, []byte) {
	t.Helper()
	v, b, err := Deps{}.shoot(context.Background(), html, png)
	if err != nil {
		t.Fatal(err)
	}
	return v, b
}

var titles = map[string]string{
	"short en":      "Sourdough 101",
	"long en":       "Why your sourdough starter stops rising after the first week, and the five fixes that actually work for home bakers",
	"short zh":      "发酵面团入门",
	"long zh":       "为什么酵种在第一周之后就不再发起来，以及真正对家庭烘焙者有效的五种补救办法",
	"one long word": "Supercalifragilisticexpialidocious-fermentation-microbiology",
}

func TestInABrowserEveryLayoutFitsLongAndShortTitlesInEnglishAndChinese(t *testing.T) {
	chromeOrSkip(t)
	for _, l := range layouts(t) {
		for name, title := range titles {
			zh := regexp.MustCompile(`[\x{4e00}-\x{9fff}]`).MatchString(title)
			kicker, sub := "Baking science", "Why the first week matters, and what to feed it."
			if zh {
				kicker, sub = "烘焙科学", "第一周为什么重要，以及该喂它什么。"
			}
			v, png := shoot(t, render(t, map[string]any{"layout": l, "title": title, "kicker": kicker, "sub": sub, "site": "acmebakery.example"}).HTML, true)
			if v.Fit != "ok" {
				t.Errorf("%s / %s overflows: %s (%s)", l, name, v.Overflow, v.Sizes)
			}
			if img, err := ui.DecodePNG(png, name); err != nil || img.Width != Width || img.Height != Height {
				t.Errorf("%s / %s: %v %dx%d", l, name, err, img.Width, img.Height)
			}
		}
	}
}

func TestInABrowserSplitWithAStatPanelOrASubjectImageFits(t *testing.T) {
	chromeOrSkip(t)
	d := t.TempDir()
	put(t, d, "subject.png", pixel)
	base := map[string]any{"layout": "split", "title": titles["long en"], "sub": "Why the first week matters, and what to feed it."}
	with := func(kv map[string]any) map[string]any {
		out := map[string]any{}
		for k, v := range base {
			out[k] = v
		}
		for k, v := range kv {
			out[k] = v
		}
		return out
	}
	for _, kv := range []map[string]any{
		{"stat": map[string]any{"value": "87%", "label": "of starters recover within three feeds"}},
		{"stat": map[string]any{"value": "1,284,000", "label": "starters fed"}},
	} {
		if v, _ := shoot(t, render(t, with(kv)).HTML, false); v.Fit != "ok" {
			t.Errorf("%v: %s", kv, v.Overflow)
		}
	}
	c, err := RenderHTML(params(t, with(map[string]any{"image": "subject.png"})), d, assets)
	if err != nil {
		t.Fatal(err)
	}
	if v, _ := shoot(t, c.HTML, false); v.Fit != "ok" {
		t.Error("image:", v.Overflow)
	}
}

func TestInABrowserATitleNoSizeCanHoldOrALongKickerIsReportedNotClipped(t *testing.T) {
	chromeOrSkip(t)
	for _, l := range layouts(t) {
		v, _ := shoot(t, render(t, map[string]any{"layout": l, "title": strings.Repeat("word ", 120), "brand": "Acme"}).HTML, false)
		if v.Fit != "overflow" || !strings.Contains(v.Overflow, "title") {
			t.Errorf("%s: %+v", l, v)
		}
	}
	v, _ := shoot(t, render(t, map[string]any{"title": "Short", "brand": "Acme", "kicker": "a kicker that goes on and on and on and on and on and on and on and on and on"}).HTML, false)
	if v.Fit != "overflow" || !strings.Contains(v.Overflow, "kicker") {
		t.Fatal(v)
	}
}

func TestInABrowserTheSameParamsRenderToTheSameBytesAndTheCommandWritesThePNG(t *testing.T) {
	chromeOrSkip(t)
	html := render(t, map[string]any{"layout": "block", "title": titles["long en"]}).HTML
	_, a := shoot(t, html, true)
	_, b := shoot(t, html, true)
	if !bytes.Equal(a, b) {
		t.Fatal("two renders of the same card differ")
	}
	d := t.TempDir()
	png := filepath.Join(d, "card.png")
	r := run(Deps{Env: os.Getenv}, "render", put(t, d, "params.json", base), png, "--assets", assets, "--html", filepath.Join(d, "card.html"))
	var out struct {
		PNG, MD5, Fit string
	}
	if r.code != 0 || json.Unmarshal([]byte(r.stdout), &out) != nil || out.Fit != "ok" || out.PNG != png {
		t.Fatal(r)
	}
	b2, _ := os.ReadFile(png)
	sum := md5.Sum(b2)
	if out.MD5 != hex.EncodeToString(sum[:]) {
		t.Fatal("md5 is of the written file")
	}
	if _, err := os.Stat(filepath.Join(d, "card.html")); err != nil {
		t.Fatal(err)
	}
}
