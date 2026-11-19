package uicompare

import (
	"encoding/json"
	"math"
	"reflect"
	"sort"
	"strings"
	"testing"
)

// These tests are the assertions of idea-loop/scripts/ui-compare.test.mjs, one for one.

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

// A value that is not a number ("normal" for the gap of a block) turns into NaN, and NaN is never beyond a
// tolerance: the old script let such a pair through, and so does this.
func TestANonNumericPositionValueIsNeverADrift(t *testing.T) {
	canvas := Measurements{"a": Box{"gap": "normal"}}
	local := Measurements{"a": Box{"gap": 8.0}}
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
