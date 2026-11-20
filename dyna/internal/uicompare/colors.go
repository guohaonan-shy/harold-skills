package uicompare

import (
	"fmt"
	"math"
	"regexp"
	"strconv"
	"strings"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/jsnum"
)

// Color conversion: the browser hands back a color in the color space the author wrote it in (`oklch(…)` stays
// `oklch(…)`, a hex becomes `rgb(…)`), so the same color reads as two different strings. NormalizeColors is the one
// function that makes them comparable — it runs here, not in the page, so the answer does not depend on which browser
// measured it.

var (
	hexColor = regexp.MustCompile(`(?i)^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$`)
	// a color as it sits inside a (possibly compound) value: a hex, or one function call without nesting
	colorInValue = regexp.MustCompile(`(?i)#[0-9a-f]+\b|\b(?:rgba?|oklch|oklab|color)\([^()]*\)`)
	numberRe     = regexp.MustCompile(`(?i)^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$`)
	hueRe        = regexp.MustCompile(`^(.+?)(deg|grad|rad|turn)?$`)
	colorFunc    = regexp.MustCompile(`(?i)^(rgba?|oklch|oklab|color)\(([^()]*)\)$`)
	tokenSplit   = regexp.MustCompile(`[\s,]+`)
)

// leadingFloat is Number.parseFloat of a text that matches numberRe (with an optional trailing %).
func leadingFloat(t string) float64 {
	f, err := strconv.ParseFloat(strings.TrimSuffix(t, "%"), 64)
	if err != nil {
		return math.NaN()
	}
	return f
}

// component is one component as a number: `%` is percentScale × the percentage; `none` is 0; anything else
// unparsable is NaN.
func component(token string, have bool, percentScale float64) float64 {
	if !have {
		return math.NaN()
	}
	t := strings.ToLower(token)
	if t == "none" {
		return 0
	}
	if strings.HasSuffix(t, "%") {
		if numberRe.MatchString(t[:len(t)-1]) {
			return leadingFloat(t) / 100 * percentScale
		}
		return math.NaN()
	}
	if numberRe.MatchString(t) {
		return leadingFloat(t)
	}
	return math.NaN()
}

// hue is a hue in degrees; bare numbers are degrees.
func hue(token string) float64 {
	t := strings.ToLower(token)
	if t == "none" {
		return 0
	}
	unit := map[string]float64{"deg": 1, "grad": 0.9, "rad": 180 / math.Pi, "turn": 360}
	m := hueRe.FindStringSubmatch(t)
	if m == nil || !numberRe.MatchString(m[1]) {
		return math.NaN()
	}
	v := leadingFloat(m[1])
	if m[2] != "" {
		v *= unit[m[2]]
	}
	return v
}

func clamp01(v float64) float64 { return math.Min(1, math.Max(0, v)) }

// encodeSrgb is linear-light sRGB (0–1, may lie outside) → gamma-encoded sRGB cut to the gamut, 0–1.
func encodeSrgb(linear float64) float64 {
	v := clamp01(linear)
	if v <= 0.0031308 {
		return 12.92 * v
	}
	return 1.055*math.Pow(v, 1/2.4) - 0.055
}

// oklabToSrgb is OKLab (Björn Ottosson's matrices) → r, g, b 0–1, each cut to the sRGB gamut.
func oklabToSrgb(L, a, b float64) []float64 {
	l := math.Pow(L+0.3963377774*a+0.2158037573*b, 3)
	m := math.Pow(L-0.1055613458*a-0.0638541728*b, 3)
	s := math.Pow(L-0.0894841775*a-1.2914855480*b, 3)
	return []float64{
		encodeSrgb(4.0767416621*l - 3.3077115913*m + 0.2309699292*s),
		encodeSrgb(-1.2684380046*l + 2.6097574011*m - 0.3413193965*s),
		encodeSrgb(-0.0041960863*l - 0.7034186147*m + 1.7076147010*s),
	}
}

// jsRound is Math.round: halves go up.
func jsRound(x float64) float64 { return math.Floor(x + 0.5) }

type rgba8 struct{ r, g, b, a int }

// parseColor reads one color written one way; ok is false when it is not understood.
func parseColor(text string) (rgba8, bool) {
	if hexColor.MatchString(text) {
		h := text[1:]
		if len(h) <= 4 {
			var b strings.Builder
			for _, c := range h {
				b.WriteRune(c)
				b.WriteRune(c)
			}
			h = b.String()
		}
		var v []int
		for i := 0; i+2 <= len(h); i += 2 {
			n, _ := strconv.ParseInt(h[i:i+2], 16, 64)
			v = append(v, int(n))
		}
		if len(v) == 3 {
			v = append(v, 255)
		}
		return rgba8{v[0], v[1], v[2], v[3]}, true
	}
	m := colorFunc.FindStringSubmatch(text)
	if m == nil {
		return rgba8{}, false
	}
	name := strings.ToLower(m[1])
	parts := strings.Split(m[2], "/")
	if len(parts) > 2 {
		return rgba8{}, false
	}
	var tokens []string
	for _, t := range tokenSplit.Split(strings.TrimSpace(parts[0]), -1) {
		if t != "" {
			tokens = append(tokens, t)
		}
	}
	alphaToken, haveAlpha := "", false
	if len(parts) == 2 {
		alphaToken, haveAlpha = strings.TrimSpace(parts[1]), true
	}
	var channels []float64
	switch name {
	case "color":
		if len(tokens) == 0 || strings.ToLower(tokens[0]) != "srgb" || len(tokens) != 4 {
			return rgba8{}, false
		}
		for _, t := range tokens[1:] {
			channels = append(channels, component(t, true, 1))
		}
	case "rgb", "rgba":
		if len(tokens) == 4 && !haveAlpha {
			alphaToken, haveAlpha = tokens[3], true
			tokens = tokens[:3]
		}
		if len(tokens) != 3 {
			return rgba8{}, false
		}
		for _, t := range tokens {
			channels = append(channels, component(t, true, 255)/255)
		}
	default:
		if len(tokens) != 3 {
			return rgba8{}, false
		}
		L := component(tokens[0], true, 1)
		second := component(tokens[1], true, 0.4) // oklch: chroma; oklab: a (100% = 0.4 in both)
		if name == "oklch" {
			rad := hue(tokens[2]) * math.Pi / 180
			channels = oklabToSrgb(L, second*math.Cos(rad), second*math.Sin(rad))
		} else {
			channels = oklabToSrgb(L, second, component(tokens[2], true, 0.4))
		}
	}
	alpha := 1.0
	if haveAlpha {
		alpha = component(alphaToken, true, 1)
	}
	for _, c := range channels {
		if math.IsNaN(c) {
			return rgba8{}, false
		}
	}
	if math.IsNaN(alpha) {
		return rgba8{}, false
	}
	to8 := func(c float64) int { return int(jsRound(clamp01(c) * 255)) }
	return rgba8{to8(channels[0]), to8(channels[1]), to8(channels[2]), to8(alpha)}, true
}

// alphaText is the shortest decimal (up to 3 places) that is the same 8-bit alpha: 26 → "0.1", 128 → "0.5".
func alphaText(a8 int) string {
	for digits := 0; digits <= 3; digits++ {
		text := jsnum.ToFixed(float64(a8)/255, digits)
		f, _ := strconv.ParseFloat(text, 64)
		if int(jsRound(f*255)) == a8 {
			return jsnum.Format(f)
		}
	}
	return jsnum.Format(float64(a8) / 255)
}

// NormalizeColors rewrites every color in a value as 8-bit sRGB plus opacity: `rgb(r, g, b)` or `rgba(r, g, b, a)`.
// A color outside the sRGB gamut is cut to 0–255 per channel, as the screen draws it. Colors nested in a compound
// value (`boxShadow`, `border`) are rewritten where they sit; anything it does not recognise — another color space,
// `var()`, a keyword, a number — comes back exactly as it went in.
func NormalizeColors(value any) any {
	s, ok := value.(string)
	if !ok {
		return value
	}
	return colorInValue.ReplaceAllStringFunc(s, func(text string) string {
		c, ok := parseColor(text)
		if !ok {
			return text
		}
		if c.a == 255 {
			return fmt.Sprintf("rgb(%d, %d, %d)", c.r, c.g, c.b)
		}
		return fmt.Sprintf("rgba(%d, %d, %d, %s)", c.r, c.g, c.b, alphaText(c.a))
	})
}
