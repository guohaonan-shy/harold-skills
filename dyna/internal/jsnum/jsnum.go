// Package jsnum prints numbers the way JavaScript does. The UI commands replace scripts whose output is read by
// other tools and by the plugin's skills, so a number has to read the same: 340 and not 340.0, 1.5e-7 and not
// 1.5e-07, and an exact half rounded up by toFixed.
package jsnum

import (
	"math"
	"math/big"
	"strconv"
	"strings"
)

// Format is Number.prototype.toString.
func Format(x float64) string {
	switch {
	case math.IsNaN(x):
		return "NaN"
	case math.IsInf(x, 1):
		return "Infinity"
	case math.IsInf(x, -1):
		return "-Infinity"
	case x == 0:
		return "0"
	}
	if a := math.Abs(x); a >= 1e-6 && a < 1e21 {
		return strconv.FormatFloat(x, 'f', -1, 64)
	}
	s := strconv.FormatFloat(x, 'e', -1, 64) // 1e-07
	mant, exp, _ := strings.Cut(s, "e")
	sign := exp[:1]
	digits := strings.TrimLeft(exp[1:], "0")
	return mant + "e" + sign + digits
}

// ToFixed is Number.prototype.toFixed(digits): the exact decimal expansion of the double, rounded half up (Go's
// own %.2f rounds an exact half to even, so 0.125 would print 0.12 where JavaScript prints 0.13).
func ToFixed(x float64, digits int) string {
	if math.IsNaN(x) || math.IsInf(x, 0) {
		return Format(x)
	}
	neg := x < 0
	if neg {
		x = -x
	}
	r := new(big.Rat).SetFloat64(x)
	scale := new(big.Int).Exp(big.NewInt(10), big.NewInt(int64(digits)), nil)
	r.Mul(r, new(big.Rat).SetInt(scale))
	r.Add(r, big.NewRat(1, 2))
	n := new(big.Int).Div(r.Num(), r.Denom()) // floor: r is not negative
	s := n.String()
	if digits > 0 {
		for len(s) <= digits {
			s = "0" + s
		}
		s = s[:len(s)-digits] + "." + s[len(s)-digits:]
	}
	if neg && strings.Trim(s, "0.") != "" {
		s = "-" + s
	}
	return s
}
