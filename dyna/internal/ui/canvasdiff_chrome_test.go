package ui

// Two versions of one canvas, compared in a real Chrome (skipped without one, like the rest of chrome_test.go): the
// assertions of ui-canvas-diff-browser.test.mjs, plus the anchor-area screenshot of an ordinary matrix's cell.

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const diffStyle = `body{margin:0;font:16px sans-serif}.hero{height:700px;background:#eef}.cta{display:block;margin:20px;height:60px;background:#36c}` +
	`.more{margin:60px 20px 20px;height:120px;background:#f60}`

const diffOld = `<!doctype html><meta charset="utf-8"><style>` + diffStyle + `</style><div class="hero" data-anchor="hero"></div><button class="cta" data-anchor="cta"></button>`

// the new block starts below the old page's end (700 + 100 = 800 < 844, the viewport; the block is at 860+)
const diffNew = diffOld + `<div class="more" data-anchor="more"></div>`

func TestABlockTheNewVersionAddsBelowTheOldPageEndHasABlankBeforeShotAndAnAfterShotOfTheSameSize(t *testing.T) {
	chromeOrSkip(t)
	url := pages(t, map[string]string{"old.html": diffOld, "new.html": diffNew})
	dir := t.TempDir()
	m := write(t, filepath.Join(dir, "matrix.json"), `{"mode":"canvas-diff","before":"`+url+`/old.html","after":"`+url+`/new.html","shotsDir":"shots",`+
		`"cells":[{"name":"mobile","viewport":{"width":390,"height":844}}]}`)
	r := run(Deps{}, "measure", m, "--json")
	if r.code != 2 {
		t.Fatal(r.all())
	}
	var out struct {
		Changed []Change
	}
	if err := json.Unmarshal([]byte(r.out), &out); err != nil {
		t.Fatal(err, r.out)
	}
	var more *Change
	for i := range out.Changed {
		if out.Changed[i].Anchor == "more" {
			more = &out.Changed[i]
		}
	}
	if more == nil || more.Kind != "added" || more.Shots == nil {
		t.Fatalf("the added anchor is listed, with area screenshots: %s", r.out)
	}
	if filepath.Dir(more.Shots.Before) != filepath.Join(dir, "shots") {
		t.Fatalf("the shots go to shotsDir next to the matrix: %s", more.Shots.Before)
	}
	read := func(p string) []byte {
		b, err := os.ReadFile(p)
		if err != nil {
			t.Fatal(err)
		}
		return b
	}
	before, err := DecodePNG(read(more.Shots.Before), "before")
	if err != nil {
		t.Fatal(err)
	}
	after, err := DecodePNG(read(more.Shots.After), "after")
	if err != nil {
		t.Fatal(err)
	}
	if before.Width != after.Width || before.Height != after.Height {
		t.Fatalf("one size: %dx%d vs %dx%d", before.Width, before.Height, after.Width, after.Height)
	}
	if after.Height < 120 {
		t.Fatalf("the whole block is cut, not a strip (got %dpx)", after.Height)
	}
	px := func(w, i int, data []byte) [3]byte { return [3]byte{data[i*4], data[i*4+1], data[i*4+2]} }
	mid := after.Width * after.Height / 2
	if got := px(before.Width, mid, before.Data); got != [3]byte{255, 255, 255} {
		t.Errorf("the old side is blank: %v", got)
	}
	if got := px(after.Width, mid, after.Data); got != [3]byte{255, 102, 0} {
		t.Errorf("the new side shows the orange block: %v", got)
	}
	// hero and cta are the same on both sides: not listed
	for _, c := range out.Changed {
		if c.Anchor != "more" {
			t.Errorf("unchanged anchor listed: %+v", c)
		}
	}
	contains(t, run(Deps{}, "measure", m).out, "变了的锚点（1）：", "mobile · more  新版新增的锚点", "区域截图（两版各一张）在 "+filepath.Join(dir, "shots"))
}

func TestTwoIdenticalVersionsAreNoChangeAndADeclaredChangeIsGreen(t *testing.T) {
	chromeOrSkip(t)
	url := pages(t, map[string]string{"old.html": diffOld, "same.html": diffOld, "new.html": strings.Replace(diffOld, "#36c", "#c36", 1)})
	dir := t.TempDir()
	same := write(t, filepath.Join(dir, "same.json"), `{"mode":"canvas-diff","before":"`+url+`/old.html","after":"`+url+`/same.html","cells":[{"name":"mobile","viewport":{"width":390,"height":844}}]}`)
	if r := run(Deps{}, "measure", same); r.code != 0 || strings.TrimSpace(r.out) != "ui-measure: 两版没有变化 ✓" {
		t.Fatal(r.all())
	}
	declared := write(t, filepath.Join(dir, "declared.json"), `{"mode":"canvas-diff","before":"`+url+`/old.html","after":"`+url+`/new.html",`+
		`"changeSet":[{"decision":"2.1","states":["mobile"],"anchors":["cta"]}],"cells":[{"name":"mobile","viewport":{"width":390,"height":844}}]}`)
	r := run(Deps{}, "measure", declared)
	if r.code != 0 {
		t.Fatal(r.all())
	}
	contains(t, r.out, "没声明却变了的地方（0）：", "改动集里声明过的（1）：", "mobile · cta  backgroundColor: rgb(51, 102, 204) → rgb(204, 51, 102)", "（改动集 2.1）")
}

func TestACellWithAShotAnchorComparesOnlyThatAnchorsArea(t *testing.T) {
	chromeOrSkip(t)
	// the two pages differ only in the hero; the cta is the same
	url := pages(t, map[string]string{"a.html": diffOld, "b.html": strings.Replace(diffOld, "#eef", "#333", 1)})
	ctaOnly := Cell{Name: "cta", Viewport: Viewport{Width: 390, Height: 844}, ShotAnchor: "cta"}
	res := walk(t, Matrix{Canvas: url + "/a.html", Local: url + "/b.html", Cells: []Cell{ctaOnly}})
	for _, k := range findingKeys(res) {
		if strings.HasPrefix(k, "pixel-mismatch") {
			t.Fatalf("the cta's area is the same: %v", findingKeys(res))
		}
	}
	heroOnly := ctaOnly
	heroOnly.Name, heroOnly.ShotAnchor = "hero", "hero"
	if got := strings.Join(findingKeys(walk(t, Matrix{Canvas: url + "/a.html", Local: url + "/b.html", Cells: []Cell{heroOnly}})), ","); !strings.Contains(got, "pixel-mismatch") {
		t.Fatalf("the hero's area differs: %s", got)
	}
	nowhere := ctaOnly
	nowhere.ShotAnchor = "nope"
	if _, err := sharedChrome(t).Walk(t.Context(), Matrix{Canvas: url + "/a.html", Local: url + "/b.html", Cells: []Cell{nowhere}}); err == nil || !strings.Contains(err.Error(), `shotAnchor "nope" is on neither page`) {
		t.Fatal(err)
	}
}
