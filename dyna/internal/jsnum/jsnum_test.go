package jsnum

import (
	"math"
	"testing"
)

func TestToFixedRoundsHalfUpLikeJavaScript(t *testing.T) {
	for _, c := range []struct {
		x      float64
		digits int
		want   string
	}{{0.125, 2, "0.13"}, {3.5, 2, "3.50"}, {0, 2, "0.00"}, {100, 2, "100.00"}, {2.5, 1, "2.5"}, {2.25, 1, "2.3"}, {0.05, 1, "0.1"}, {1.005, 2, "1.00"}, {0.0004, 2, "0.00"}, {9.995, 2, "9.99"}, {-1.5, 0, "-2"}} {
		if got := ToFixed(c.x, c.digits); got != c.want {
			t.Errorf("toFixed(%v,%d) = %s, want %s", c.x, c.digits, got, c.want)
		}
	}
}

func TestFormatIsJavaScriptsToString(t *testing.T) {
	for _, c := range []struct {
		x    float64
		want string
	}{{340, "340"}, {100.5, "100.5"}, {0.1, "0.1"}, {1e21, "1e+21"}, {1.5e-7, "1.5e-7"}, {0, "0"}, {math.Copysign(0, -1), "0"}, {-2, "-2"}, {math.NaN(), "NaN"}, {math.Inf(1), "Infinity"}} {
		if got := Format(c.x); got != c.want {
			t.Errorf("%v: %s, want %s", c.x, got, c.want)
		}
	}
}
