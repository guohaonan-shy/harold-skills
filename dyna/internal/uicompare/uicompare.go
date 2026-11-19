// Package uicompare holds the two deterministic comparators of the UI implementation loop: the measurement
// layer (primary) and the pixel layer (fallback). They are the red/green judges of `dyna ui measure` and
// `dyna ui compare`. Neither touches a browser, a file or a clock: the callers hand them plain data, which is
// why they are the part of the loop with unit tests.
//
// A finding has one closed field set and one stable id per defect kind, with a severity on the P0 / P1 / P2
// ladder, the same shape design-lint reports.
package uicompare

import (
	"fmt"
	"math"

	"sort"
	"strconv"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/jsnum"
	"strings"
	"unicode"
)

// Finding ids. A closed set: a new kind is a deliberate edit here, not a string.
const (
	MissingAnchor = "missing-anchor"
	PositionDrift = "position-drift"
	TokenMismatch = "token-mismatch"
	PixelMismatch = "pixel-mismatch"
)

// FindingIDs lists every defect kind.
var FindingIDs = []string{MissingAnchor, PositionDrift, TokenMismatch, PixelMismatch}

// Severities is the ladder, most severe first.
var Severities = []string{"P0", "P1", "P2"}

// Finding always carries these fields, in this order. Absent values are null, never omitted, so a consumer never
// has to feature-detect.
type Finding struct {
	ID       string   `json:"id"`
	Severity string   `json:"severity"`
	Cell     *string  `json:"cell"`
	Anchor   *string  `json:"anchor"`
	Property *string  `json:"property"`
	Expected any      `json:"expected"`
	Actual   any      `json:"actual"`
	Delta    *float64 `json:"delta"`
	Why      string   `json:"why"`
	Detail   string   `json:"detail"`
}

// Box is what is measured on one anchored element: a number for px values, the raw text for the rest.
type Box map[string]any

// Measurements are boxes keyed by anchor.
type Measurements map[string]Box

// Tolerance is the position tolerance of the measurement layer, overall and per anchor.
type Tolerance struct {
	Position *float64
	ByAnchor map[string]AnchorTolerance
}

// AnchorTolerance loosens (or tightens) one anchor.
type AnchorTolerance struct {
	Position *float64
}

// DefaultPositionTolerance is the default position tolerance in px; a matrix cell may override it.
const DefaultPositionTolerance = 1.0

// positionProps are measured in px, so their difference is judged against a tolerance. Everything not in this
// set is a token value and must match exactly.
var positionProps = map[string]bool{
	"top": true, "left": true, "right": true, "bottom": true, "width": true, "height": true, "x": true, "y": true,
	"gap": true, "rowGap": true, "columnGap": true,
	"paddingTop": true, "paddingRight": true, "paddingBottom": true, "paddingLeft": true,
	"marginTop": true, "marginRight": true, "marginBottom": true, "marginLeft": true,
}

var why = map[string]string{
	MissingAnchor: "The canvas has this anchor and the port does not — the two tabs are not showing the same thing, so every other number in this cell is unverified.",
	PositionDrift: "A measured box differs by more than the position tolerance; geometry drifted during the port.",
	TokenMismatch: "A token value (color, size, radius, weight…) is not identical to the canvas — an off-token value is a second style system, not a rounding detail.",
}

func ptr[T any](v T) *T { return &v }

func positionTolerance(t Tolerance, anchor string) float64 {
	if a, ok := t.ByAnchor[anchor]; ok && a.Position != nil {
		return *a.Position
	}
	if t.Position != nil {
		return *t.Position
	}
	return DefaultPositionTolerance
}

// CompareMeasurements is the measurement layer: canvas and local are the measurements of the design canvas and
// of the ported route, keyed by the same anchors; cell is the matrix cell they came from (nil when unknown).
// Findings come back most severe first.
func CompareMeasurements(canvas, local Measurements, tolerance Tolerance, cell *string) []Finding {
	findings := []Finding{}
	for anchor, expectedBox := range canvas {
		actualBox, present := local[anchor]
		if !present || actualBox == nil {
			findings = append(findings, Finding{
				ID: MissingAnchor, Severity: "P0", Cell: cell, Anchor: ptr(anchor),
				Expected: "present", Actual: "absent",
				Why:    why[MissingAnchor],
				Detail: fmt.Sprintf("anchor \"%s\" is on the canvas but not on the ported route", anchor),
			})
			continue
		}
		tol := positionTolerance(tolerance, anchor)
		for property, expected := range expectedBox {
			// a property the port did not measure is JavaScript's undefined: NaN as a number, "undefined" as text
			actual, measured := actualBox[property]
			if !measured {
				actual = undefined{}
			}
			if positionProps[property] {
				delta := math.Abs(JSNumber(expected) - JSNumber(actual))
				if delta > tol { // a NaN delta (a non-numeric value such as "normal") is never above the tolerance
					findings = append(findings, Finding{
						ID: PositionDrift, Severity: "P1", Cell: cell, Anchor: ptr(anchor), Property: ptr(property),
						Expected: expected, Actual: actual, Delta: ptr(delta),
						Why: why[PositionDrift],
						Detail: fmt.Sprintf("%s.%s: %s → %s (off by %spx, tolerance ±%spx)",
							anchor, property, JSString(expected), JSString(actual), jsnum.Format(delta), jsnum.Format(tol)),
					})
				}
				continue
			}
			// Token class: exact match. No tolerance of any kind is consulted here — "one shade off" is a
			// different token, not a rounding error.
			if !strictEqual(expected, actual) {
				findings = append(findings, Finding{
					ID: TokenMismatch, Severity: "P1", Cell: cell, Anchor: ptr(anchor), Property: ptr(property),
					Expected: expected, Actual: actual,
					Why:    why[TokenMismatch],
					Detail: fmt.Sprintf("%s.%s: %s → %s (must match exactly)", anchor, property, JSString(expected), JSString(actual)),
				})
			}
		}
	}
	return SortFindings(findings)
}

// undefined stands for a property that was not measured at all (as opposed to one measured as null).
type undefined struct{}

func (undefined) MarshalJSON() ([]byte, error) { return []byte("null"), nil }

func strictEqual(a, b any) bool {
	switch x := a.(type) {
	case float64:
		y, ok := b.(float64)
		return ok && x == y
	case string:
		y, ok := b.(string)
		return ok && x == y
	case nil:
		return b == nil
	}
	return a == b
}

// SortFindings is the deterministic order: severity, then anchor, then property. It sorts a copy; findings that
// tie keep the order they came in.
func SortFindings(findings []Finding) []Finding {
	out := append([]Finding{}, findings...)
	sort.SliceStable(out, func(i, j int) bool {
		a, b := out[i], out[j]
		if si, sj := severityIndex(a.Severity), severityIndex(b.Severity); si != sj {
			return si < sj
		}
		if c := LocaleCompare(str(a.Anchor), str(b.Anchor)); c != 0 {
			return c < 0
		}
		return LocaleCompare(str(a.Property), str(b.Property)) < 0
	})
	return out
}

func severityIndex(s string) int {
	for i, v := range Severities {
		if v == s {
			return i
		}
	}
	return -1
}

func str(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

// LocaleCompare orders two strings the way the old script's String.localeCompare did for the names a matrix
// uses: punctuation before digits before letters, letters without regard to case, and a lower-case letter before
// the same upper-case letter when nothing else differs.
func LocaleCompare(a, b string) int {
	ra, rb := []rune(a), []rune(b)
	for i := 0; i < len(ra) && i < len(rb); i++ {
		ka, kb := primaryKey(ra[i]), primaryKey(rb[i])
		if ka != kb {
			if ka < kb {
				return -1
			}
			return 1
		}
	}
	if len(ra) != len(rb) {
		if len(ra) < len(rb) {
			return -1
		}
		return 1
	}
	for i := range ra {
		if ra[i] != rb[i] {
			// lower case first
			if unicode.IsLower(ra[i]) && !unicode.IsLower(rb[i]) {
				return -1
			}
			if !unicode.IsLower(ra[i]) && unicode.IsLower(rb[i]) {
				return 1
			}
			if ra[i] < rb[i] {
				return -1
			}
			return 1
		}
	}
	return 0
}

// punctuationOrder is the order the CLDR root collation (what localeCompare uses) gives the ASCII punctuation
// and symbols, all of which sort before the digits.
const punctuationOrder = " _-,;:!?.'\"()[]{}@*/\\&#%`^+<=>|~$"

func primaryKey(r rune) int64 {
	class := int64(0)
	switch {
	case unicode.IsDigit(r):
		class = 2
	case unicode.IsLetter(r):
		class = 3
	}
	if class == 0 {
		if i := strings.IndexRune(punctuationOrder, r); i >= 0 {
			return int64(i)
		}
		return 1<<32 | int64(r) // other symbols: after the ASCII ones, by code point
	}
	return class<<32 | int64(unicode.ToLower(r))
}

// ---------- pixel layer (fallback) ----------

// DefaultAntialiasTolerance is the only tolerance the pixel layer knows about.
//
// It is NOT the position tolerance and the two must never be read from the same number: ±1px says "this box may
// sit one pixel off"; this says "these two pixels are the same color as far as a rasterizer is concerned". A
// renderer that shades a glyph edge differently is not a layout defect.
//
// The metric is the normalized perceived color distance in YIQ space (Kotsarenko & Ramos, "Measuring perceived
// color difference"), the same one pixelmatch uses, and 0.1 is pixelmatch's own default threshold.
const DefaultAntialiasTolerance = 0.1

// DefaultPixelThreshold is the default per-cell pixel budget, in percent. A matrix cell may override it.
const DefaultPixelThreshold = 1.0

// maxYIQDistance is the largest possible YIQ distance (pure white against pure black), used to normalize.
const maxYIQDistance = 35215

// Image is a decoded screenshot: RGBA, four bytes a pixel, row after row.
type Image struct {
	Width, Height int
	Data          []byte
}

// flatten composites RGBA onto white — screenshots are opaque, but never trust that blindly. The float64
// conversions stop the compiler fusing a multiply and an add, so the sums round the way the old script's did.
func flatten(data []byte, i int) [3]float64 {
	a := float64(data[i+3]) / 255
	var out [3]float64
	for k := 0; k < 3; k++ {
		out[k] = 255 + float64((float64(data[i+k])-255)*a)
	}
	return out
}

func yiqDistance(p, q [3]float64) float64 {
	y := func(c [3]float64) float64 {
		return float64(c[0]*0.29889531) + float64(c[1]*0.58662247) + float64(c[2]*0.11448223)
	}
	i := func(c [3]float64) float64 {
		return float64(c[0]*0.59597799) - float64(c[1]*0.27417610) - float64(c[2]*0.32180189)
	}
	q2 := func(c [3]float64) float64 {
		return float64(c[0]*0.21147017) - float64(c[1]*0.52261711) + float64(c[2]*0.31114694)
	}
	dy := y(p) - y(q)
	di := i(p) - i(q)
	dq := q2(p) - q2(q)
	return float64(0.5053*float64(dy*dy)) + float64(0.299*float64(di*di)) + float64(0.1957*float64(dq*dq))
}

// ComparePixels is the pixel layer — it catches what nobody thought to put an anchor on. Both images must be the
// same size. antialias is the perceived-color distance (0..1) below which two pixels count as the same color.
// The result is the mismatch percentage, 0–100.
func ComparePixels(canvas, local Image, antialias float64) (float64, error) {
	if canvas.Width != local.Width || canvas.Height != local.Height {
		return 0, fmt.Errorf("pixel layer needs two screenshots of the same size: %d×%d vs %d×%d",
			canvas.Width, canvas.Height, local.Width, local.Height)
	}
	cutoff := float64(float64(antialias*antialias) * maxYIQDistance)
	total := canvas.Width * canvas.Height
	differing := 0
	for i := 0; i < total*4; i += 4 {
		if yiqDistance(flatten(canvas.Data, i), flatten(local.Data, i)) > cutoff {
			differing++
		}
	}
	return float64(differing) / float64(total) * 100, nil
}

// PixelFinding turns a mismatch percentage into a finding of the same shape as everything else. It is P2 on
// purpose: the pixel layer is the fallback. It knows something differs but not what, so it must never outrank a
// measurement-layer finding that names the anchor and the property. nil when the percentage is within threshold.
func PixelFinding(percent float64, cell *string, threshold float64) *Finding {
	if percent <= threshold {
		return nil
	}
	return &Finding{
		ID: PixelMismatch, Severity: "P2", Cell: cell,
		Expected: "≤ " + jsnum.Format(threshold) + "%", Actual: jsnum.ToFixed(percent, 2) + "%", Delta: ptr(percent - threshold),
		Why:    "Pixels differ beyond the per-cell budget somewhere the measurement layer has no anchor on — either add an anchor there or explain the difference.",
		Detail: fmt.Sprintf("pixel mismatch %s%% (budget %s%%)", jsnum.ToFixed(percent, 2), jsnum.Format(threshold)),
	}
}

// RenderFindings is the human-readable render, grouped by severity the way design-lint groups its findings.
func RenderFindings(findings []Finding) string {
	if len(findings) == 0 {
		return "ui-measure: green ✓"
	}
	var lines []string
	for _, sev := range Severities {
		var group []Finding
		for _, f := range findings {
			if f.Severity == sev {
				group = append(group, f)
			}
		}
		if len(group) == 0 {
			continue
		}
		lines = append(lines, fmt.Sprintf("%s (%d):", sev, len(group)))
		for _, f := range group {
			cell := ""
			if f.Cell != nil && *f.Cell != "" {
				cell = *f.Cell + " · "
			}
			lines = append(lines, fmt.Sprintf("  [%s] %s%s", f.ID, cell, f.Detail))
		}
	}
	return strings.Join(lines, "\n")
}

// ---------- number and string conventions of the old script ----------

// JSNumber is JavaScript's Number(v) for the values a measurement holds.
func JSNumber(v any) float64 {
	switch x := v.(type) {
	case float64:
		return x
	case nil:
		return 0
	case undefined:
		return math.NaN()
	case bool:
		if x {
			return 1
		}
		return 0
	case string:
		s := strings.TrimSpace(x)
		if s == "" {
			return 0
		}
		switch s {
		case "Infinity", "+Infinity":
			return math.Inf(1)
		case "-Infinity":
			return math.Inf(-1)
		}
		low := strings.ToLower(s)
		// Go's ParseFloat also reads inf, nan, hex floats and underscores; Number() reads none of them
		if strings.Contains(low, "inf") || strings.Contains(low, "nan") || strings.ContainsAny(low, "_px") {
			return math.NaN()
		}
		f, err := strconv.ParseFloat(s, 64)
		if err != nil {
			return math.NaN()
		}
		return f
	}
	return math.NaN()
}

// JSString is what a JavaScript template string makes of a value.
func JSString(v any) string {
	switch x := v.(type) {
	case float64:
		return jsnum.Format(x)
	case string:
		return x
	case nil:
		return "null"
	case undefined:
		return "undefined"
	}
	return fmt.Sprint(v)
}
