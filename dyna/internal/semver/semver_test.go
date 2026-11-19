package semver

import "testing"

func mustV(t *testing.T, s string) Version {
	t.Helper()
	v, err := Parse(s)
	if err != nil {
		t.Fatal(err)
	}
	return v
}

func TestVersionsCompareAsNumbersNotStrings(t *testing.T) {
	for _, c := range []struct {
		a, b string
		want int
	}{{"0.1.10", "0.1.9", 1}, {"0.2.0", "0.1.99", 1}, {"1.0.0", "0.99.99", 1}, {"0.1.14", "0.1.14", 0}, {"0.3.2", "0.4.0", -1}} {
		if got := mustV(t, c.a).Compare(mustV(t, c.b)); got != c.want {
			t.Errorf("%s vs %s: %d", c.a, c.b, got)
		}
	}
	if mustV(t, "v1.2.3").String() != "1.2.3" {
		t.Fatal("a leading v is dropped")
	}
	for _, bad := range []string{"", "1.2", "1.2.3-rc1", "next", "1.2.x"} {
		if _, err := Parse(bad); err == nil {
			t.Errorf("%q parsed", bad)
		}
	}
}

func TestRangeSaysBelowInsideOrAbove(t *testing.T) {
	r, err := ParseRange(">=0.4.0 <1.0.0")
	if err != nil {
		t.Fatal(err)
	}
	for v, want := range map[string]Position{"0.3.2": Below, "0.4.0": Inside, "0.9.9": Inside, "1.0.0": Above, "2.1.0": Above} {
		if got := r.Where(mustV(t, v)); got != want {
			t.Errorf("%s: %v want %v", v, got, want)
		}
	}
	if low, ok := r.Lower(); !ok || low.String() != "0.4.0" {
		t.Fatal(low, ok)
	}
	if r.String() != ">=0.4.0 <1.0.0" {
		t.Fatal(r.String())
	}
}

func TestOtherOperators(t *testing.T) {
	r, _ := ParseRange(">0.1.0 <=0.2.0")
	for v, want := range map[string]bool{"0.1.0": false, "0.1.1": true, "0.2.0": true, "0.2.1": false} {
		if got := r.Contains(mustV(t, v)); got != want {
			t.Errorf("%s: %v", v, got)
		}
	}
	exact, _ := ParseRange("0.3.0")
	if !exact.Contains(mustV(t, "0.3.0")) || exact.Contains(mustV(t, "0.3.1")) || exact.Where(mustV(t, "0.2.0")) != Below {
		t.Fatal("a bare version is exactly that")
	}
}

func TestBadRangesAreRefused(t *testing.T) {
	for _, bad := range []string{"", "  ", ">=x", "~0.4.0", ">= 0.4.0", "0.4"} {
		if _, err := ParseRange(bad); err == nil {
			t.Errorf("%q parsed", bad)
		}
	}
}
