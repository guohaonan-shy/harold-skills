package ui

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// These tests are the assertions of idea-loop/scripts/ui-png-compare.test.mjs. The seam is the command line: two
// PNG files in, the exit code and the verdict out. The PNGs are built here with an encoder that applies every
// scanline filter, so the decoder is exercised on the filter types real screenshots use.

type pngFiles struct {
	t   *testing.T
	dir string
	n   int
}

func newFiles(t *testing.T) *pngFiles { return &pngFiles{t: t, dir: t.TempDir()} }

func (f *pngFiles) write(b []byte) string {
	f.n++
	p := filepath.Join(f.dir, fmt.Sprintf("%d.png", f.n))
	if err := os.WriteFile(p, b, 0o644); err != nil {
		f.t.Fatal(err)
	}
	return p
}

func compare(args ...string) result { return run(Deps{}, append([]string{"compare"}, args...)...) }

// blockPage is a 20x20 image: a white page with a coloured block whose colour and size the tests bend.
func blockPage(block [4]byte, size int) pixelFn {
	return func(x, y int) [4]byte {
		if x < size && y < size {
			return block
		}
		return [4]byte{255, 255, 255, 255}
	}
}

var blue = [4]byte{19, 127, 236, 255}

func img(p pixelFn, opts ...func(*pngSpec)) []byte {
	s := pngSpec{width: 20, height: 20, pixel: p}
	for _, o := range opts {
		o(&s)
	}
	return encodePNG(s)
}

func TestTwoIdenticalScreenshotsAreWithinToleranceAndExit0(t *testing.T) {
	f := newFiles(t)
	r := compare(f.write(img(blockPage(blue, 10))), f.write(img(blockPage(blue, 10))))
	if r.code != 0 {
		t.Fatal(r.all())
	}
	contains(t, r.all(), "一致")
}

func TestEveryScanlineFilterTypeDecodesToTheSamePixels(t *testing.T) {
	f := newFiles(t)
	a := f.write(img(blockPage(blue, 10), func(s *pngSpec) { s.filters = []byte{0} }))
	b := f.write(img(blockPage(blue, 10), func(s *pngSpec) { s.filters = []byte{1, 2, 3, 4} }))
	if r := compare(a, b); r.code != 0 {
		t.Fatal(r.all())
	}
	rgb := f.write(img(blockPage(blue, 10), func(s *pngSpec) { s.colorType = 2; s.filters = []byte{4, 3} }))
	if r := compare(a, rgb); r.code != 0 {
		t.Fatal("an RGB (no alpha) screenshot of the same picture is the same picture:", r.all())
	}
}

func TestADifferenceAboveThePixelBudgetExits1AndReportsThePercentage(t *testing.T) {
	// 100 of 400 pixels are a different colour = 25%
	f := newFiles(t)
	r := compare(f.write(img(blockPage(blue, 10))), f.write(img(blockPage([4]byte{200, 30, 30, 255}, 10))), "--json")
	if r.code != 1 {
		t.Fatal(r.all())
	}
	var j struct {
		Within    bool
		Percent   float64
		Threshold float64
		Antialias float64
	}
	if err := json.Unmarshal([]byte(r.out), &j); err != nil {
		t.Fatal(err, r.out)
	}
	if j.Within || int(j.Percent+0.5) != 25 || j.Threshold != 1 || j.Antialias != 0.1 {
		t.Fatalf("%+v", j)
	}
}

func TestADifferenceAtOrUnderTheBudgetIsWithinTolerance(t *testing.T) {
	// 1 pixel of 400 = 0.25%
	f := newFiles(t)
	base := blockPage(blue, 10)
	one := func(x, y int) [4]byte {
		if x == 15 && y == 15 {
			return [4]byte{0, 0, 0, 255}
		}
		return base(x, y)
	}
	r := compare(f.write(img(base)), f.write(img(one)), "--json")
	if r.code != 0 || !strings.Contains(r.out, `"within": true`) {
		t.Fatal(r.all())
	}
}

func TestAColourThatDiffersByLessThanTheAntiAliasToleranceIsTheSameColour(t *testing.T) {
	f := newFiles(t)
	if r := compare(f.write(img(blockPage(blue, 10))), f.write(img(blockPage([4]byte{20, 127, 236, 255}, 10)))); r.code != 0 {
		t.Fatal(r.all())
	}
}

func TestPixelAndAntialiasOverrideTheDefaultsLikeAMatrixCellMay(t *testing.T) {
	f := newFiles(t)
	a, b := f.write(img(blockPage(blue, 10))), f.write(img(blockPage([4]byte{200, 30, 30, 255}, 10)))
	if r := compare(a, b, "--pixel", "30"); r.code != 0 {
		t.Fatal(r.all())
	}
	if r := compare(a, b, "--antialias", "0.9"); r.code != 0 {
		t.Fatal(r.all())
	}
}

func TestScreenshotsOfDifferentSizesAreOutOfToleranceAndTheReasonSaysSo(t *testing.T) {
	f := newFiles(t)
	a := f.write(encodePNG(pngSpec{width: 20, height: 20, pixel: blockPage(blue, 10)}))
	b := f.write(encodePNG(pngSpec{width: 20, height: 24, pixel: blockPage(blue, 10)}))
	r := compare(a, b)
	if r.code != 1 {
		t.Fatal(r.all())
	}
	contains(t, r.all(), "尺寸不同", "20×20", "20×24")
	j := compare(a, b, "--json")
	contains(t, j.out, `"percent": null`, `"within": false`)
}

func TestUsageErrorsAMissingFileANonPNGAndAnUnsmudgedGitLFSPointerExit2WithTheReason(t *testing.T) {
	f := newFiles(t)
	if r := compare(); r.code != 2 {
		t.Fatal(r.all())
	}
	if r := compare(filepath.Join(f.dir, "nope.png"), filepath.Join(f.dir, "nope2.png")); r.code != 2 {
		t.Fatal(r.all())
	}
	if r := compare("a.png", "b.png", "--pixel", "wat"); r.code != 2 || !strings.Contains(r.err, "usage") {
		t.Fatal("a pixel budget that is not a number is a usage error:", r.all())
	}
	text := write(t, filepath.Join(f.dir, "not-a-png.png"), "hello")
	ok := f.write(img(blockPage(blue, 10)))
	if r := compare(text, ok); r.code != 2 || !strings.Contains(r.all(), "不是 PNG") {
		t.Fatal(r.all())
	}
	lfs := write(t, filepath.Join(f.dir, "pointer.png"), "version https://git-lfs.github.com/spec/v1\noid sha256:abc\nsize 12\n")
	if r := compare(lfs, ok); r.code != 2 || !strings.Contains(r.all(), "LFS") {
		t.Fatal(r.all())
	}
}

func TestAFormatTheLoopsScreenshotsAreNotIsRefusedWithTheReason(t *testing.T) {
	f := newFiles(t)
	ok := f.write(img(blockPage(blue, 10)))
	good := img(blockPage(blue, 10))
	// 16-bit: the header says depth 16; the loop only compares 8-bit pictures
	bad := append([]byte{}, good...)
	bad[8+8+8] = 16 // IHDR bit depth
	r := compare(f.write(bad), ok)
	if r.code != 2 {
		t.Fatal(r.all())
	}
	contains(t, r.all(), "格式不支持", "位深 16")
}

// ---------- the old script and this command answer alike ----------

func TestTheOldScriptAndTheCommandAnswerTheSameForTheSamePictures(t *testing.T) {
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node is not installed")
	}
	script, _ := filepath.Abs(filepath.Join("..", "..", "..", "idea-loop", "scripts", "ui-png-compare.mjs"))
	if _, err := os.Stat(script); err != nil {
		t.Skip("the old script is gone")
	}
	f := newFiles(t)
	grey := func(x, y int) [4]byte { return [4]byte{byte(x * 12), byte(y * 12), 128, 255} }
	nudged := func(x, y int) [4]byte {
		p := grey(x, y)
		if x%7 == 0 && y%5 == 0 {
			p[0] += 40
		}
		return p
	}
	translucent := func(x, y int) [4]byte { return [4]byte{10, 20, 30, byte(x * 12)} }
	pairs := [][2]string{
		{f.write(img(blockPage(blue, 10))), f.write(img(blockPage(blue, 10)))},
		{f.write(img(blockPage(blue, 10))), f.write(img(blockPage([4]byte{200, 30, 30, 255}, 10)))},
		{f.write(img(grey, func(s *pngSpec) { s.filters = []byte{1, 2, 3, 4} })), f.write(img(nudged))},
		{f.write(img(grey)), f.write(img(nudged, func(s *pngSpec) { s.colorType = 2 }))},
		{f.write(img(translucent)), f.write(img(translucent, func(s *pngSpec) { s.filters = []byte{4} }))},
		{f.write(img(grey)), f.write(encodePNG(pngSpec{width: 20, height: 21, pixel: grey}))},
		{f.write(img(grey)), write(t, filepath.Join(f.dir, "text.png"), "hello")},
	}
	for i, p := range pairs {
		for _, extra := range [][]string{nil, {"--json"}, {"--pixel", "0.3", "--antialias", "0.02"}} {
			old := exec.Command(node, append([]string{script, p[0], p[1]}, extra...)...)
			var oldOut, oldErr strings.Builder
			old.Stdout, old.Stderr = &oldOut, &oldErr
			oldCode := 0
			if err := old.Run(); err != nil {
				oldCode = err.(*exec.ExitError).ExitCode()
			}
			got := compare(append([]string{p[0], p[1]}, extra...)...)
			if got.code != oldCode || got.out != oldOut.String() || got.err != oldErr.String() {
				t.Errorf("pair %d %v:\n go  (%d) out=%q err=%q\n old (%d) out=%q err=%q", i, extra, got.code, got.out, got.err, oldCode, oldOut.String(), oldErr.String())
			}
		}
	}
}
