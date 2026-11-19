// Package jsstr holds the few string rules the old Node scripts relied on and Go spells differently: which
// characters count as white space, what trim removes, and how long a string is. The research, dreaming and
// retro modules read documents the old scripts read, and their checks must give the same answers on the same
// text, so they trim, collapse and count the way JavaScript does.
package jsstr

import (
	"strings"
	"unicode"
	"unicode/utf16"
)

// WS is a regular-expression character class (brackets included) that matches what JavaScript's `\s` matches.
// Go's `\s` is ASCII only, and a full-width space in a Chinese table cell is the case that shows it.
const WS = `[\t\n\v\f\r \x{00a0}\x{1680}\x{2000}-\x{200a}\x{2028}\x{2029}\x{202f}\x{205f}\x{3000}\x{feff}]`

// IsSpace reports whether r is white space for JavaScript's trim and `\s`.
func IsSpace(r rune) bool {
	if r == 0x85 {
		return false
	}
	return unicode.IsSpace(r) || r == 0xfeff
}

// Trim is JavaScript's String.prototype.trim.
func Trim(s string) string { return strings.TrimFunc(s, IsSpace) }

// TrimEnd is JavaScript's String.prototype.trimEnd.
func TrimEnd(s string) string { return strings.TrimRightFunc(s, IsSpace) }

// Collapse is `s.replace(/\s+/g, ' ')`.
func Collapse(s string) string {
	var b strings.Builder
	space := false
	for _, r := range s {
		if IsSpace(r) {
			if !space {
				b.WriteByte(' ')
			}
			space = true
			continue
		}
		space = false
		b.WriteRune(r)
	}
	return b.String()
}

// Len is JavaScript's string length: UTF-16 code units, not characters.
func Len(s string) int { return len(utf16.Encode([]rune(s))) }

// Tail is `s.slice(-n)`: the last n UTF-16 code units. A cut inside a surrogate pair comes out as U+FFFD.
func Tail(s string, n int) string {
	u := utf16.Encode([]rune(s))
	if n >= len(u) {
		return s
	}
	return string(utf16.Decode(u[len(u)-n:]))
}
