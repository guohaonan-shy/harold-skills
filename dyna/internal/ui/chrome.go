package ui

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"sync"
	"time"

	"github.com/chromedp/cdproto/cdp"
	"github.com/chromedp/cdproto/emulation"
	"github.com/chromedp/cdproto/page"
	cdpruntime "github.com/chromedp/cdproto/runtime"
	"github.com/chromedp/cdproto/target"
	"github.com/chromedp/chromedp"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/uicompare"
)

// The browser boundary: driving Chrome, navigating, measuring the DOM, screenshotting. Everything deterministic
// lives in package uicompare and is unit-tested; a mocked browser would only test the mock, so this file is
// covered by actually running it (chrome_test.go, when a Chrome is on the machine).

// EnvChrome names the Chrome or Chromium to drive, when the one `dyna` would find is not the one to use.
const EnvChrome = "IDEA_LOOP_CHROME"

// navigationTimeout is how long a page may take to load and go quiet, as the old script's browser allowed.
const navigationTimeout = 30 * time.Second

// FindChrome is the browser `ui measure` drives: the one EnvChrome names; else a Chrome or Chromium on the
// machine; else the Chromium Playwright downloaded for the project (the old script ran on that one).
func FindChrome(env func(string) string) (string, error) {
	if p := env(EnvChrome); p != "" {
		if _, err := os.Stat(p); err != nil {
			return "", fmt.Errorf("%s 指的浏览器不存在：%s", EnvChrome, p)
		}
		return p, nil
	}
	var candidates []string
	switch runtime.GOOS {
	case "darwin":
		candidates = []string{
			"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
			"/Applications/Chromium.app/Contents/MacOS/Chromium",
			"/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
		}
	default:
		for _, n := range []string{"google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "chrome", "headless_shell"} {
			if p, err := exec.LookPath(n); err == nil {
				candidates = append(candidates, p)
			}
		}
	}
	for _, p := range candidates {
		if _, err := os.Stat(p); err == nil {
			return p, nil
		}
	}
	if p := playwrightChromium(env); p != "" {
		return p, nil
	}
	return "", errors.New("找不到 Chrome 或 Chromium。装一个，或在项目里跑 `npx playwright install chromium`，或用 " + EnvChrome + " 指一个")
}

// playwrightChromium is the newest Chromium in Playwright's browser cache, "" when there is none.
func playwrightChromium(env func(string) string) string {
	var roots []string
	if p := env("PLAYWRIGHT_BROWSERS_PATH"); p != "" && p != "0" {
		roots = append(roots, p)
	}
	if home, err := os.UserHomeDir(); err == nil {
		roots = append(roots, filepath.Join(home, "Library", "Caches", "ms-playwright"), filepath.Join(home, ".cache", "ms-playwright"))
	}
	patterns := []string{
		"chromium-*/chrome-mac*/Chromium.app/Contents/MacOS/Chromium",
		"chromium-*/chrome-linux*/chrome",
		"chromium_headless_shell-*/chrome-headless-shell-*/chrome-headless-shell",
	}
	for _, root := range roots {
		for _, pat := range patterns {
			matches, _ := filepath.Glob(filepath.Join(root, pat))
			sort.Strings(matches)
			for i := len(matches) - 1; i >= 0; i-- { // the highest build number first
				if _, err := os.Stat(matches[i]); err == nil {
					return matches[i]
				}
			}
		}
	}
	return ""
}

// chrome is one browser that matrices walk in, each in a context of its own.
type chrome struct {
	ctx    context.Context
	cancel context.CancelFunc
}

// launchChrome starts a headless browser. The browser lives until Close.
func launchChrome(ctx context.Context, path string) (*chrome, error) {
	opts := append([]chromedp.ExecAllocatorOption{}, chromedp.DefaultExecAllocatorOptions[:]...)
	opts = append(opts, chromedp.ExecPath(path), chromedp.Flag("hide-scrollbars", true))
	if os.Geteuid() == 0 {
		opts = append(opts, chromedp.NoSandbox) // Chrome refuses to start as root otherwise (a container)
	}
	allocCtx, cancelAlloc := chromedp.NewExecAllocator(ctx, opts...)
	browserCtx, cancelBrowser := chromedp.NewContext(allocCtx)
	if err := chromedp.Run(browserCtx); err != nil { // starts the browser
		cancelBrowser()
		cancelAlloc()
		return nil, fmt.Errorf("浏览器起不来（%s）：%w", path, err)
	}
	return &chrome{ctx: browserCtx, cancel: func() { cancelBrowser(); cancelAlloc() }}, nil
}

// Close stops the browser and everything it started.
func (c *chrome) Close() { c.cancel() }

// tab is one page of a matrix's context, with the record of which loads have gone quiet.
type tab struct {
	ctx  context.Context
	mu   sync.Mutex
	idle map[cdp.LoaderID]bool
}

// browserExecutor is what sends a command to the browser itself (not to a tab).
func (c *chrome) browserExecutor(ctx context.Context) context.Context {
	return cdp.WithExecutor(ctx, chromedp.FromContext(c.ctx).Browser)
}

// newContext makes a browser context: its own cookies, storage and cache, shared with nothing else. The
// returned func disposes of it, and with it every tab in it.
func (c *chrome) newContext() (cdp.BrowserContextID, func(), error) {
	id, err := target.CreateBrowserContext().Do(c.browserExecutor(c.ctx))
	if err != nil {
		return "", nil, err
	}
	return id, func() {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		_ = target.DisposeBrowserContext(id).Do(c.browserExecutor(ctx))
	}, nil
}

// newTab opens a tab (in a window of its own: a headless Chrome has no window to add a tab to in a browser
// context that has none yet).
func (c *chrome) newTab(in cdp.BrowserContextID) (*tab, context.CancelFunc, error) {
	id, err := target.CreateTarget("about:blank").WithBrowserContextID(in).WithNewWindow(true).Do(c.browserExecutor(c.ctx))
	if err != nil {
		return nil, nil, err
	}
	ctx, cancel := chromedp.NewContext(c.ctx, chromedp.WithTargetID(id))
	t := &tab{ctx: ctx, idle: map[cdp.LoaderID]bool{}}
	chromedp.ListenTarget(ctx, func(ev any) {
		if e, ok := ev.(*page.EventLifecycleEvent); ok && e.Name == "networkIdle" {
			t.mu.Lock()
			t.idle[e.LoaderID] = true
			t.mu.Unlock()
		}
	})
	if err := chromedp.Run(ctx, page.Enable(), page.SetLifecycleEventsEnabled(true)); err != nil {
		cancel()
		return nil, nil, err
	}
	return t, cancel, nil
}

// freezeCSS kills motion so a screenshot is a function of the DOM, not of when it was taken.
const freezeCSS = `*, *::before, *::after {
  animation: none !important; transition: none !important;
  caret-color: transparent !important; scroll-behavior: auto !important;
}`

// prepare puts the tab in the cell's viewport, DPR and color scheme, loads the url until the network has been
// quiet for half a second, freezes motion and waits for the fonts.
func (t *tab) prepare(url string, c Cell, dpr float64) error {
	css, _ := json.Marshal(freezeCSS)
	return chromedp.Run(t.ctx,
		emulation.SetDeviceMetricsOverride(int64(c.Viewport.Width), int64(c.Viewport.Height), dpr, false),
		emulation.SetEmulatedMedia().WithFeatures([]*emulation.MediaFeature{{Name: "prefers-color-scheme", Value: c.scheme()}}),
		chromedp.ActionFunc(func(ctx context.Context) error { return t.load(ctx, url) }),
		chromedp.Evaluate(`(css => { const s = document.createElement('style'); s.textContent = css;
			(document.head || document.documentElement).appendChild(s); })(`+string(css)+`)`, nil),
		chromedp.Evaluate(`document.fonts.ready.then(() => null)`, nil, func(p *cdpruntime.EvaluateParams) *cdpruntime.EvaluateParams { return p.WithAwaitPromise(true) }),
	)
}

// load navigates and waits until Chrome says this load's network has been quiet for 500 ms (the signal
// Playwright's networkidle is).
func (t *tab) load(ctx context.Context, url string) error {
	_, loader, errText, _, err := page.Navigate(url).Do(ctx)
	if err != nil {
		return err
	}
	if errText != "" {
		return fmt.Errorf("打不开 %s：%s", url, errText)
	}
	deadline := time.Now().Add(navigationTimeout)
	for {
		t.mu.Lock()
		quiet := t.idle[loader]
		t.mu.Unlock()
		if quiet {
			return nil
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("%s 在 %s 内没有停下网络请求", url, navigationTimeout)
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(20 * time.Millisecond):
		}
	}
}

// measureStyles are the properties pulled off every anchored element. The order is the reference's order.
var measureStyles = []string{
	"color", "backgroundColor", "fontFamily", "fontSize", "fontWeight", "lineHeight",
	"letterSpacing", "textTransform", "borderRadius", "borderWidth", "borderColor",
	"boxShadow", "opacity",
	"paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
	"marginTop", "marginRight", "marginBottom", "marginLeft",
	"gap", "rowGap", "columnGap",
}

// measureInPage runs in the page and returns { <anchor>: { …measurements } }.
const measureInPage = `(styleProps => {
  const px = (v) => (/^-?[\d.]+px$/.test(v) ? Number.parseFloat(v) : v);
  const out = {};
  for (const el of document.querySelectorAll('[data-anchor]')) {
    const anchor = el.getAttribute('data-anchor');
    if (out[anchor]) continue; // first wins; duplicate anchors are a canvas bug
    const rect = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const m = {
      top: Math.round((rect.top + window.scrollY) * 100) / 100,
      left: Math.round((rect.left + window.scrollX) * 100) / 100,
      width: Math.round(rect.width * 100) / 100,
      height: Math.round(rect.height * 100) / 100,
    };
    for (const p of styleProps) m[p] = px(cs[p]);
    out[anchor] = m;
  }
  return out;
})`

func (t *tab) measure() (uicompare.Measurements, error) {
	props, _ := json.Marshal(measureStyles)
	var raw map[string]map[string]any
	if err := chromedp.Run(t.ctx, chromedp.Evaluate(measureInPage+"("+string(props)+")", &raw)); err != nil {
		return nil, err
	}
	out := uicompare.Measurements{}
	for anchor, box := range raw {
		out[anchor] = uicompare.Box(box)
	}
	return out, nil
}

func (t *tab) screenshot() ([]byte, error) {
	var buf []byte
	err := chromedp.Run(t.ctx, chromedp.ActionFunc(func(ctx context.Context) error {
		var err error
		buf, err = page.CaptureScreenshot().WithFormat(page.CaptureScreenshotFormatPng).Do(ctx)
		return err
	}))
	return buf, err
}

// Walk goes through every cell of the matrix in a context of its own (nothing stored by one matrix's pages
// reaches another's), with two tabs: the design canvas and the ported local route.
func (c *chrome) Walk(ctx context.Context, m Matrix) (MatrixResult, error) {
	bctx, dispose, err := c.newContext()
	if err != nil {
		return MatrixResult{}, err
	}
	defer dispose()
	canvasTab, cancel1, err := c.newTab(bctx)
	if err != nil {
		return MatrixResult{}, err
	}
	defer cancel1()
	localTab, cancel2, err := c.newTab(bctx)
	if err != nil {
		return MatrixResult{}, err
	}
	defer cancel2()

	var findings []uicompare.Finding
	human := []string{}
	for _, cell := range m.Cells {
		if err := ctx.Err(); err != nil {
			return MatrixResult{}, err
		}
		if cell.Review == "human" {
			human = append(human, cell.Name)
			continue
		}
		position, antialias, pixel := m.resolve(cell)
		canvasURL, err := withState(m.Canvas, cell.State)
		if err != nil {
			return MatrixResult{}, err
		}
		localURL, err := withState(m.Local, cell.State)
		if err != nil {
			return MatrixResult{}, err
		}
		// One tab after the other, on purpose: loading both at once changed a measured top by 1px on a real
		// port (a layout that depends on load timing), so the verdict would no longer match the serial walk's.
		if err := canvasTab.prepare(canvasURL, cell, m.dpr()); err != nil {
			return MatrixResult{}, fmt.Errorf("%s 的画布：%w", cell.Name, err)
		}
		if err := localTab.prepare(localURL, cell, m.dpr()); err != nil {
			return MatrixResult{}, fmt.Errorf("%s 的本地页面：%w", cell.Name, err)
		}
		canvasM, err := canvasTab.measure()
		if err != nil {
			return MatrixResult{}, err
		}
		localM, err := localTab.measure()
		if err != nil {
			return MatrixResult{}, err
		}
		byAnchor := map[string]uicompare.AnchorTolerance{}
		for anchor, t := range cell.ByAnchor {
			byAnchor[anchor] = uicompare.AnchorTolerance{Position: t.Position}
		}
		name := cell.Name
		findings = append(findings, uicompare.CompareMeasurements(canvasM, localM,
			uicompare.Tolerance{Position: &position, ByAnchor: byAnchor}, &name)...)

		canvasShot, err := canvasTab.screenshot()
		if err != nil {
			return MatrixResult{}, err
		}
		localShot, err := localTab.screenshot()
		if err != nil {
			return MatrixResult{}, err
		}
		canvasImg, err := DecodePNG(canvasShot, cell.Name+" canvas")
		if err != nil {
			return MatrixResult{}, err
		}
		localImg, err := DecodePNG(localShot, cell.Name+" local")
		if err != nil {
			return MatrixResult{}, err
		}
		percent, err := uicompare.ComparePixels(canvasImg, localImg, antialias)
		if err != nil {
			return MatrixResult{}, err
		}
		if pf := uicompare.PixelFinding(percent, &name, pixel); pf != nil {
			findings = append(findings, *pf)
		}
	}
	return MatrixResult{Findings: uicompare.SortFindings(findings), HumanCells: human}, nil
}
