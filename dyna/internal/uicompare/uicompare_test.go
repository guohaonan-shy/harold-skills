package uicompare

import (
	"encoding/json"
	"math"
	"reflect"
	"regexp"
	"sort"
	"strings"
	"testing"
)

// These tests are the assertions of idea-loop/scripts/ui-compare.test.mjs, one for one.

var regexpDigits = regexp.MustCompile(`\d+`)

func anchor(over map[string]any) Box {
	b := Box{"top": 100.0, "left": 40.0, "width": 320.0, "height": 48.0}
	for k, v := range over {
		b[k] = v
	}
	return b
}

func ids(fs []Finding) []string {
	out := []string{}
	for _, f := range fs {
		out = append(out, f.ID)
	}
	return out
}

func TestPositionWithinToleranceIsNotAFinding(t *testing.T) {
	canvas := Measurements{"hero": anchor(nil)}
	local := Measurements{"hero": anchor(map[string]any{"top": 101.0})}
	if fs := CompareMeasurements(canvas, local, Tolerance{}, nil); len(fs) != 0 {
		t.Fatal(fs)
	}
}

func TestPositionBeyondToleranceIsOnePositionFinding(t *testing.T) {
	fs := CompareMeasurements(Measurements{"hero": anchor(nil)}, Measurements{"hero": anchor(map[string]any{"top": 102.0})}, Tolerance{}, nil)
	if len(fs) != 1 || fs[0].ID != "position-drift" || *fs[0].Anchor != "hero" || *fs[0].Property != "top" || *fs[0].Delta != 2 {
		t.Fatalf("%+v", fs)
	}
	if fs[0].Detail != "hero.top: 100 → 102 (off by 2px, tolerance ±1px)" {
		t.Fatal(fs[0].Detail)
	}
}

func TestATokenValueOneStepOffIsATokenFindingNotSwallowedByThePositionTolerance(t *testing.T) {
	canvas := Measurements{"cta": anchor(map[string]any{"color": "rgb(10, 10, 10)"})}
	local := Measurements{"cta": anchor(map[string]any{"color": "rgb(11, 11, 11)"})}
	fs := CompareMeasurements(canvas, local, Tolerance{}, nil)
	if len(fs) != 1 || fs[0].ID != "token-mismatch" || *fs[0].Property != "color" || fs[0].Expected != "rgb(10, 10, 10)" || fs[0].Actual != "rgb(11, 11, 11)" {
		t.Fatalf("%+v", fs)
	}
	if fs[0].Delta != nil {
		t.Fatal("a token finding has no delta")
	}
}

func TestNumericTokenValuesGetNoToleranceEither(t *testing.T) {
	canvas := Measurements{"cta": anchor(map[string]any{"fontSize": 16.0, "borderRadius": 8.0})}
	local := Measurements{"cta": anchor(map[string]any{"fontSize": 17.0, "borderRadius": 8.0})}
	fs := CompareMeasurements(canvas, local, Tolerance{}, nil)
	if len(fs) != 1 || *fs[0].Property != "fontSize" || fs[0].ID != "token-mismatch" {
		t.Fatalf("%+v", fs)
	}
}

func TestAnAnchorOnTheCanvasButNotOnThePortIsTheMostSevereFindingThereIs(t *testing.T) {
	canvas := Measurements{"hero": anchor(nil), "cta": anchor(map[string]any{"top": 400.0})}
	local := Measurements{"hero": anchor(nil)}
	fs := CompareMeasurements(canvas, local, Tolerance{}, nil)
	if len(fs) != 1 || fs[0].ID != "missing-anchor" || *fs[0].Anchor != "cta" || fs[0].Severity != "P0" {
		t.Fatalf("%+v", fs)
	}
	if fs[0].Severity != Severities[0] {
		t.Fatal("P0 is the top of the ladder — nothing this function emits outranks it")
	}
}

func TestFindingsComeBackMostSevereFirst(t *testing.T) {
	canvas := Measurements{"a": anchor(map[string]any{"color": "rgb(0, 0, 0)"}), "z": anchor(nil)}
	local := Measurements{"a": anchor(map[string]any{"top": 120.0, "color": "rgb(1, 1, 1)"})}
	var sev []string
	for _, f := range CompareMeasurements(canvas, local, Tolerance{}, nil) {
		sev = append(sev, f.Severity)
	}
	if !reflect.DeepEqual(sev, []string{"P0", "P1", "P1"}) {
		t.Fatal(sev)
	}
}

func TestEveryFindingCarriesExactlyTheClosedFieldSet(t *testing.T) {
	canvas := Measurements{"hero": anchor(map[string]any{"color": "rgb(0, 0, 0)"}), "gone": anchor(nil)}
	local := Measurements{"hero": anchor(map[string]any{"left": 99.0, "color": "rgb(2, 2, 2)"})}
	cell := "mobile/dark/empty"
	want := []string{"id", "severity", "cell", "anchor", "property", "expected", "actual", "delta", "why", "detail"}
	sort.Strings(want)
	fs := CompareMeasurements(canvas, local, Tolerance{}, &cell)
	if len(fs) != 3 {
		t.Fatal(fs)
	}
	for _, f := range fs {
		raw, _ := json.Marshal(f)
		var m map[string]any
		_ = json.Unmarshal(raw, &m)
		var keys []string
		for k := range m {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		if !reflect.DeepEqual(keys, want) {
			t.Errorf("fields %v", keys)
		}
		if !contains(FindingIDs, f.ID) || !contains(Severities, f.Severity) || *f.Cell != cell {
			t.Errorf("%+v", f)
		}
		if m["delta"] == nil && f.ID == "position-drift" {
			t.Error("a position finding has its delta")
		}
	}
}

func contains(list []string, s string) bool {
	for _, v := range list {
		if v == s {
			return true
		}
	}
	return false
}

func TestAMatrixCellMayLoosenThePositionToleranceForOneAnchorOnly(t *testing.T) {
	canvas := Measurements{"hero": anchor(nil), "cta": anchor(nil)}
	local := Measurements{"hero": anchor(map[string]any{"top": 103.0}), "cta": anchor(map[string]any{"top": 103.0})}
	tol := Tolerance{Position: ptr(1.0), ByAnchor: map[string]AnchorTolerance{"hero": {Position: ptr(4.0)}}}
	fs := CompareMeasurements(canvas, local, tol, nil)
	if len(fs) != 1 || *fs[0].Anchor != "cta" {
		t.Fatalf("%+v", fs)
	}
}

func TestAnExtraAnchorOnThePortedSideIsNotAFinding(t *testing.T) {
	canvas := Measurements{"hero": anchor(nil)}
	local := Measurements{"hero": anchor(nil), "wrapper": anchor(map[string]any{"top": 0.0})}
	if fs := CompareMeasurements(canvas, local, Tolerance{}, nil); len(fs) != 0 {
		t.Fatal(fs)
	}
}

// A value that is not a number ("normal", say) turns into NaN, and NaN is never beyond a
// tolerance: the old script let such a pair through, and so does this.
func TestANonNumericPositionValueIsNeverADrift(t *testing.T) {
	canvas := Measurements{"a": Box{"paddingTop": "normal"}}
	local := Measurements{"a": Box{"paddingTop": 8.0}}
	if fs := CompareMeasurements(canvas, local, Tolerance{}, nil); len(fs) != 0 {
		t.Fatal(fs)
	}
}

// ---------- pixel layer ----------

func solid(w, h int, r, g, b byte) Image {
	data := make([]byte, 0, w*h*4)
	for i := 0; i < w*h; i++ {
		data = append(data, r, g, b, 255)
	}
	return Image{Width: w, Height: h, Data: data}
}

func percent(t *testing.T, a, b Image, aa float64) float64 {
	t.Helper()
	p, err := ComparePixels(a, b, aa)
	if err != nil {
		t.Fatal(err)
	}
	return p
}

func TestTwoIdenticalScreenshotsMismatchBy0Percent(t *testing.T) {
	if p := percent(t, solid(4, 4, 120, 30, 200), solid(4, 4, 120, 30, 200), DefaultAntialiasTolerance); p != 0 {
		t.Fatal(p)
	}
}

func TestAnAllWhiteScreenshotAgainstAnAllBlackOneMismatchesBy100Percent(t *testing.T) {
	if p := percent(t, solid(4, 4, 255, 255, 255), solid(4, 4, 0, 0, 0), DefaultAntialiasTolerance); p != 100 {
		t.Fatal(p)
	}
}

func TestThePercentageIsTheShareOfDifferingPixels(t *testing.T) {
	a, b := solid(2, 2, 0, 0, 0), solid(2, 2, 0, 0, 0)
	copy(b.Data[0:4], []byte{255, 255, 255, 255}) // one of four pixels
	if p := percent(t, a, b, DefaultAntialiasTolerance); p != 25 {
		t.Fatal(p)
	}
}

func TestScreenshotsOfDifferentSizesAreACallerErrorNotA100PercentResult(t *testing.T) {
	_, err := ComparePixels(solid(4, 4, 0, 0, 0), solid(4, 5, 0, 0, 0), DefaultAntialiasTolerance)
	if err == nil || !strings.Contains(err.Error(), "same size") {
		t.Fatal(err)
	}
}

func TestTheAntialiasToleranceAbsorbsAHairThinColorDifference(t *testing.T) {
	a, b := solid(2, 2, 0, 0, 0), solid(2, 2, 0, 0, 0)
	copy(b.Data[0:4], []byte{4, 4, 4, 255})
	if percent(t, a, b, 0) <= 0 {
		t.Fatal("with no tolerance the pixel differs")
	}
	if p := percent(t, a, b, DefaultAntialiasTolerance); p != 0 {
		t.Fatal("the default antialias tolerance swallows it", p)
	}
}

// In the old test the pixel layer was handed a position tolerance and the measurement layer an antialias one,
// and neither changed anything. Here the two are different types, so the mix-up does not compile; what is left
// to check is that the measurement layer's verdict does not move with the pixel layer's knob.
func TestTheAntialiasToleranceAndThePositionToleranceAreDifferentKnobs(t *testing.T) {
	a, b := solid(2, 2, 0, 0, 0), solid(2, 2, 255, 255, 255)
	if p := percent(t, b, a, DefaultAntialiasTolerance); p != 100 {
		t.Fatal(p)
	}
	fs := CompareMeasurements(Measurements{"hero": anchor(nil)}, Measurements{"hero": anchor(map[string]any{"top": 140.0})}, Tolerance{}, nil)
	if !reflect.DeepEqual(ids(fs), []string{"position-drift"}) {
		t.Fatal(ids(fs))
	}
}

func TestThePixelLayerOnlyFilesAFindingWhenItBreaksThePerCellThreshold(t *testing.T) {
	cell := "desktop/light/default"
	if PixelFinding(0.4, &cell, DefaultPixelThreshold) != nil {
		t.Fatal("0.4% is inside the 1% budget")
	}
	f := PixelFinding(3.5, &cell, DefaultPixelThreshold)
	if f == nil || f.ID != "pixel-mismatch" || f.Anchor != nil || *f.Cell != cell {
		t.Fatalf("%+v", f)
	}
	if f.Expected != "≤ 1%" || f.Actual != "3.50%" || f.Detail != "pixel mismatch 3.50% (budget 1%)" || *f.Delta != 2.5 {
		t.Fatalf("%+v", f)
	}
}

func TestThePixelLayerFilesBelowTheMeasurementLayer(t *testing.T) {
	cell := "c"
	pixel := *PixelFinding(9, &cell, DefaultPixelThreshold)
	measured := CompareMeasurements(Measurements{"hero": anchor(nil)}, Measurements{"hero": anchor(map[string]any{"top": 200.0})}, Tolerance{}, &cell)
	got := ids(SortFindings(append([]Finding{pixel}, measured...)))
	if !reflect.DeepEqual(got, []string{"position-drift", "pixel-mismatch"}) {
		t.Fatal(got)
	}
}

// ---------- the old script's conventions ----------

func TestRenderGroupsBySeverityAndSaysGreenWhenThereIsNothing(t *testing.T) {
	if got := RenderFindings(nil); got != "ui-measure: green ✓" {
		t.Fatal(got)
	}
	cell := "mobile"
	fs := CompareMeasurements(Measurements{"a": anchor(nil), "b": anchor(map[string]any{"color": "red"})},
		Measurements{"b": anchor(map[string]any{"color": "blue", "top": 120.0})}, Tolerance{}, &cell)
	want := "P0 (1):\n  [missing-anchor] mobile · anchor \"a\" is on the canvas but not on the ported route\n" +
		"P1 (2):\n  [token-mismatch] mobile · b.color: red → blue (must match exactly)\n" +
		"  [position-drift] mobile · b.top: 100 → 120 (off by 20px, tolerance ±1px)"
	if got := RenderFindings(fs); got != want {
		t.Fatalf("%q", got)
	}
}

func TestLocaleCompareIsTheOrderTheOldScriptSorted(t *testing.T) {
	in := []string{"zeta", "Alpha", "alpha", "beta", "10", "9", "_x", "Beta"}
	sort.Slice(in, func(i, j int) bool { return LocaleCompare(in[i], in[j]) < 0 })
	// punctuation, digits, then letters; "alpha" before "Alpha"; "9" before "10" is NOT numeric order
	want := []string{"_x", "10", "9", "alpha", "Alpha", "beta", "Beta", "zeta"}
	if !reflect.DeepEqual(in, want) {
		t.Fatal(in)
	}
}

func TestJSNumberReadsOnlyWhatNumberReads(t *testing.T) {
	for in, want := range map[string]float64{"12": 12, " 12 ": 12, "": 0, "1.5": 1.5, "-3": -3, "1e3": 1000} {
		if got := JSNumber(in); got != want {
			t.Errorf("%q: %v", in, got)
		}
	}
	for _, in := range []string{"normal", "12px", "auto", "inf", "nan", "0x1p-2", "1_0"} {
		if got := JSNumber(in); !math.IsNaN(got) {
			t.Errorf("%q should be NaN, got %v", in, got)
		}
	}
}

// ---------- color conversion (ui-compare.test.mjs, #414) ----------

func TestAHexColorBecomesThe8BitSRGBTheScreenShows(t *testing.T) {
	for in, want := range map[string]string{"#3b82f6": "rgb(59, 130, 246)", "#FFF": "rgb(255, 255, 255)", "#0000ff80": "rgba(0, 0, 255, 0.5)"} {
		if got := NormalizeColors(in); got != want {
			t.Errorf("%s: %v, want %s", in, got, want)
		}
	}
}

func TestRgbAndRgbaAreRewrittenIntoOneCanonicalSpelling(t *testing.T) {
	for in, want := range map[string]string{
		"rgb(59, 130, 246)": "rgb(59, 130, 246)", "rgb(59 130 246)": "rgb(59, 130, 246)", "rgba(0, 0, 0, 0.1)": "rgba(0, 0, 0, 0.1)",
		"rgb(59 130 246 / 50%)": "rgba(59, 130, 246, 0.5)", "rgba(59, 130, 246, 1)": "rgb(59, 130, 246)",
	} {
		if got := NormalizeColors(in); got != want {
			t.Errorf("%s: %v, want %s", in, got, want)
		}
	}
}

func TestOklchIsConvertedAndAColorOutsideTheGamutIsCutPerChannel(t *testing.T) {
	// The Tailwind v4 blue: measured by painting it in headless Chromium, the pixel is 43,127,255.
	for in, want := range map[string]string{
		"oklch(0.623 0.214 259.815)": "rgb(43, 127, 255)", "oklch(1 0 0)": "rgb(255, 255, 255)", "oklch(0 0 0)": "rgb(0, 0, 0)",
		"oklch(62.3% 0.214 259.815deg / 0.5)": "rgba(43, 127, 255, 0.5)",
	} {
		if got := NormalizeColors(in); got != want {
			t.Errorf("%s: %v, want %s", in, got, want)
		}
	}
	out := NormalizeColors("oklch(0.7 0.4 150)").(string)
	var channels []int
	for _, m := range regexpDigits.FindAllString(out, -1) {
		n := 0
		for _, c := range m {
			n = n*10 + int(c-'0')
		}
		channels = append(channels, n)
	}
	if len(channels) != 3 || channels[0] != 0 {
		t.Fatal(out)
	}
	for _, c := range channels {
		if c < 0 || c > 255 {
			t.Fatal(out)
		}
	}
}

func TestOklabAndColorSrgbAreConvertedToo(t *testing.T) {
	for in, want := range map[string]string{
		"oklab(0.5 0 0)": "rgb(99, 99, 99)", "oklab(1 0 0 / 0.25)": "rgba(255, 255, 255, 0.25)",
		"color(srgb 1 0 0)": "rgb(255, 0, 0)", "color(srgb 0.5 0.5 0.5 / 0.5)": "rgba(128, 128, 128, 0.5)",
	} {
		if got := NormalizeColors(in); got != want {
			t.Errorf("%s: %v, want %s", in, got, want)
		}
	}
}

func TestColorsInsideACompoundValueAreConvertedWhereTheySit(t *testing.T) {
	if got := NormalizeColors("oklch(0.623 0.214 259.815) 0px 4px 6px 0px, rgba(0, 0, 0, 0.1) 0px 1px 2px 0px"); got != "rgb(43, 127, 255) 0px 4px 6px 0px, rgba(0, 0, 0, 0.1) 0px 1px 2px 0px" {
		t.Fatal(got)
	}
	if got := NormalizeColors("1px solid #3b82f6"); got != "1px solid rgb(59, 130, 246)" {
		t.Fatal(got)
	}
}

func TestASpellingItDoesNotRecognizeComesBackExactly(t *testing.T) {
	for _, v := range []any{"color(display-p3 1 0 0)", "currentcolor", "var(--brand)", "Inter, sans-serif", "oklch(from red l c h)", "", 16.0, nil} {
		if got := NormalizeColors(v); got != v {
			t.Errorf("%v: %v", v, got)
		}
	}
}

const blueRGB = "rgb(59, 130, 246)"
const blueOKLCH = "oklch(0.6231 0.188 259.8)" // the same blue, written the way Tailwind v4 writes colors

func TestTheSameColorAsRgbOnTheCanvasAndOklchOnThePortIsNotAFinding(t *testing.T) {
	canvas := Measurements{"cta": anchor(map[string]any{"color": blueRGB, "boxShadow": "rgba(0, 0, 0, 0.1) 0px 1px 2px 0px"})}
	local := Measurements{"cta": anchor(map[string]any{"color": blueOKLCH, "boxShadow": "oklch(0 0 0 / 0.1) 0px 1px 2px 0px"})}
	if fs := CompareMeasurements(canvas, local, Tolerance{}, nil); len(fs) != 0 {
		t.Fatal(fs)
	}
}

func TestAColorOneLevelOffAfterConversionIsStillATokenFindingWithBothSpellingsAndConversions(t *testing.T) {
	off := "rgb(59, 130, 247)"
	fs := CompareMeasurements(Measurements{"cta": anchor(map[string]any{"color": off})}, Measurements{"cta": anchor(map[string]any{"color": blueOKLCH})}, Tolerance{}, nil)
	if len(fs) != 1 || fs[0].ID != TokenMismatch || fs[0].Expected != off || fs[0].Actual != blueOKLCH {
		t.Fatal(fs)
	}
	for _, part := range []string{off, blueOKLCH, "as 8-bit sRGB: rgb(59, 130, 247) → rgb(59, 130, 246)"} {
		if !strings.Contains(fs[0].Detail, part) {
			t.Errorf("%q not in %s", part, fs[0].Detail)
		}
	}
}

func TestAColorTheConverterDoesNotKnowIsComparedAsTheOriginalString(t *testing.T) {
	canvas := Measurements{"cta": anchor(map[string]any{"color": "color(display-p3 1 0 0)"})}
	if fs := CompareMeasurements(canvas, Measurements{"cta": anchor(map[string]any{"color": "color(display-p3 1 0 0)"})}, Tolerance{}, nil); len(fs) != 0 {
		t.Fatal(fs)
	}
	fs := CompareMeasurements(canvas, Measurements{"cta": anchor(map[string]any{"color": "color(display-p3 1 0 0.1)"})}, Tolerance{}, nil)
	if len(fs) != 1 || fs[0].ID != TokenMismatch || strings.Contains(fs[0].Detail, "8-bit") {
		t.Fatal(fs)
	}
}

// ---------- margin and gap are how a layout was written, not where it ended up ----------

func TestMarginAndGapAreNotCompared(t *testing.T) {
	canvas := Measurements{"block": anchor(map[string]any{"top": 120.0, "marginTop": 16.0, "marginBottom": 0.0, "gap": 0.0, "rowGap": 0.0, "columnGap": 0.0})}
	local := Measurements{"block": anchor(map[string]any{"top": 120.0, "marginTop": 0.0, "marginBottom": 16.0, "gap": 8.0, "rowGap": 8.0, "columnGap": 8.0, "marginLeft": 4.0, "marginRight": 4.0})}
	if fs := CompareMeasurements(canvas, local, Tolerance{}, nil); len(fs) != 0 {
		t.Fatal(fs)
	}
}

func TestTheBoxItselfStillDriftsAndPaddingIsStillCompared(t *testing.T) {
	canvas := Measurements{"block": anchor(map[string]any{"top": 120.0, "marginTop": 16.0, "paddingTop": 8.0})}
	local := Measurements{"block": anchor(map[string]any{"top": 130.0, "marginTop": 0.0, "paddingTop": 12.0})}
	var got []string
	for _, f := range CompareMeasurements(canvas, local, Tolerance{}, nil) {
		got = append(got, f.ID+":"+*f.Property)
	}
	if !reflect.DeepEqual(got, []string{"position-drift:paddingTop", "position-drift:top"}) {
		t.Fatal(got)
	}
}

// ---------- pixel layer: sub-pixel shifts ----------

// bar is a 100×40 page: white, with a black block spanning the full height from x = from to to.
func bar(from, to int) Image {
	w, h := 100, 40
	img := Image{Width: w, Height: h, Data: make([]byte, w*h*4)}
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			v := byte(255)
			if x >= from && x < to {
				v = 0
			}
			copy(img.Data[(y*w+x)*4:], []byte{v, v, v, 255})
		}
	}
	return img
}

func TestASharpEdgeMovedByOnePixelIsTheSamePicture(t *testing.T) {
	if p := percent(t, bar(20, 50), bar(21, 51), DefaultAntialiasTolerance); p > 1 {
		t.Fatal(p)
	}
}

func TestASharpEdgeMovedByTwoPixelsIsStillAMismatch(t *testing.T) {
	if p := percent(t, bar(20, 50), bar(22, 52), DefaultAntialiasTolerance); p <= 1 {
		t.Fatal(p)
	}
}

func TestTheNeighbourhoodIsJudgedBothWays(t *testing.T) {
	a, b := solid(5, 5, 255, 255, 255), solid(5, 5, 255, 255, 255)
	copy(b.Data[(2*5+2)*4:], []byte{0, 0, 0, 255})
	if p := percent(t, a, b, DefaultAntialiasTolerance); p <= 0 {
		t.Fatal(p)
	}
}
