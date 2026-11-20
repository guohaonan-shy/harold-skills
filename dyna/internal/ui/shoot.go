package ui

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/chromedp/cdproto/emulation"
	"github.com/chromedp/cdproto/page"
	"github.com/chromedp/chromedp"
)

// ErrNoBrowser is what ShootHTML returns when there is no Chrome or Chromium to drive (or it will not start).
var ErrNoBrowser = errors.New("no browser")

// Shot is what ShootHTML saw: the value of the verdict expression (as JSON) and, when asked for, the screenshot of
// the viewport.
type Shot struct {
	Verdict json.RawMessage
	PNG     []byte
}

// ShootHTML opens a page of html in a headless Chrome at width × height (DPR 1, light scheme), waits until the load's
// network has gone quiet and the ready expression is truthy (at most timeout), evaluates the verdict expression and,
// when screenshot is set, captures the viewport. The page is loaded from a temporary file, so the html has to carry its
// pictures inline (data: URIs). An error wrapping ErrNoBrowser means there was no browser to use.
func ShootHTML(ctx context.Context, env func(string) string, html string, width, height int, ready, verdict string, timeout time.Duration, screenshot bool) (Shot, error) {
	path, err := FindChrome(env)
	if err != nil {
		return Shot{}, fmt.Errorf("%w: %v", ErrNoBrowser, err)
	}
	browser, err := launchChrome(ctx, path)
	if err != nil {
		return Shot{}, fmt.Errorf("%w: %v", ErrNoBrowser, err)
	}
	defer browser.Close()
	return browser.shootHTML(html, width, height, ready, verdict, timeout, screenshot)
}

func (c *chrome) shootHTML(html string, width, height int, ready, verdict string, timeout time.Duration, screenshot bool) (Shot, error) {
	dir, err := os.MkdirTemp("", "dyna-shoot-")
	if err != nil {
		return Shot{}, err
	}
	defer os.RemoveAll(dir)
	file := filepath.Join(dir, "page.html")
	if err := os.WriteFile(file, []byte(html), 0o644); err != nil {
		return Shot{}, err
	}
	bctx, dispose, err := c.newContext()
	if err != nil {
		return Shot{}, err
	}
	defer dispose()
	t, cancel, err := c.newTab(bctx)
	if err != nil {
		return Shot{}, err
	}
	defer cancel()
	var shot Shot
	err = chromedp.Run(t.ctx,
		emulation.SetDeviceMetricsOverride(int64(width), int64(height), 1, false),
		emulation.SetEmulatedMedia().WithFeatures([]*emulation.MediaFeature{{Name: "prefers-color-scheme", Value: "light"}}),
		chromedp.ActionFunc(func(ctx context.Context) error { return t.load(ctx, "file://"+file) }),
		chromedp.ActionFunc(func(ctx context.Context) error {
			deadline := time.Now().Add(timeout)
			for {
				var ok bool
				if err := chromedp.Evaluate("!!("+ready+")", &ok).Do(ctx); err != nil {
					return err
				}
				if ok {
					return nil
				}
				if time.Now().After(deadline) {
					return fmt.Errorf("页面在 %s 内没有准备好（%s）", timeout, ready)
				}
				select {
				case <-ctx.Done():
					return ctx.Err()
				case <-time.After(50 * time.Millisecond):
				}
			}
		}),
		chromedp.Evaluate("JSON.stringify("+verdict+")", &shot.Verdict),
		chromedp.ActionFunc(func(ctx context.Context) error {
			if !screenshot {
				return nil
			}
			var err error
			shot.PNG, err = page.CaptureScreenshot().WithFormat(page.CaptureScreenshotFormatPng).
				WithClip(&page.Viewport{X: 0, Y: 0, Width: float64(width), Height: float64(height), Scale: 1}).Do(ctx)
			return err
		}),
	)
	if err != nil {
		return Shot{}, err
	}
	// Evaluate of JSON.stringify hands back a JSON string; unwrap it to the JSON it holds.
	var inner string
	if json.Unmarshal(shot.Verdict, &inner) == nil {
		shot.Verdict = json.RawMessage(inner)
	}
	return shot, nil
}
