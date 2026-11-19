package jsstr

import (
	"regexp"
	"testing"
)

// r is the one-character string of a code point, so the odd white space is visible in the test source.
func r(cp rune) string { return string(cp) }

func TestTrimRemovesWhatJavaScriptRemoves(t *testing.T) {
	for _, c := range []struct{ in, want string }{
		{"  a  ", "a"},
		{r(0x3000) + "全角" + r(0x3000), "全角"},
		{r(0xa0) + "nbsp" + r(0xa0), "nbsp"},
		{r(0xfeff) + "bom", "bom"},
		{r(0x85) + "next-line" + r(0x85), r(0x85) + "next-line" + r(0x85)}, // JavaScript does not count U+0085 as white space
		{"\n\ttab\r\n", "tab"},
	} {
		if got := Trim(c.in); got != c.want {
			t.Errorf("Trim(%q) = %q, want %q", c.in, got, c.want)
		}
	}
	if got := TrimEnd("  a  "); got != "  a" {
		t.Error(got)
	}
}

func TestCollapseTurnsEveryRunOfWhiteSpaceIntoOneSpace(t *testing.T) {
	if got := Collapse("a \n\t b" + r(0x3000) + r(0x3000) + "c"); got != "a b c" {
		t.Error(got)
	}
}

func TestLenAndTailCountUTF16Units(t *testing.T) {
	emoji := r(0x1f600)
	if Len("a前"+emoji) != 4 { // the emoji is two units
		t.Error(Len("a前" + emoji))
	}
	if got := Tail("前文"+emoji+"结尾", 2); got != "结尾" {
		t.Error(got)
	}
	if got := Tail("ab", 5); got != "ab" {
		t.Error(got)
	}
}

func TestWSClassMatchesWhatJSBackslashSMatches(t *testing.T) {
	re := regexp.MustCompile("^" + WS + "+$")
	for _, s := range []string{" ", "\t\n", r(0x3000), r(0xa0), r(0xfeff), r(0x2028)} {
		if !re.MatchString(s) {
			t.Errorf("%q should match", s)
		}
	}
	if re.MatchString("a") || re.MatchString(r(0x85)) {
		t.Error("matches what it should not")
	}
}
