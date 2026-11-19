// Package jsx holds the few JavaScript behaviours the design checks were first written against and that Go's
// standard library does not give for free: `\s` that means what JS means, strings measured in UTF-16 units,
// `trim`, and JSON read with its keys in the order they were written. The checks' messages quote slices of the
// user's text, so these have to agree with the old scripts to the character.
package jsx

import (
	"regexp"
	"strings"
	"unicode/utf16"
)

// space is what JS's `\s` matches (Go's is ASCII only).
const space = `\t\n\v\f\r \x{a0}\x{1680}\x{2000}-\x{200a}\x{2028}\x{2029}\x{202f}\x{205f}\x{3000}\x{feff}`

// IsSpace is whether r is a JS whitespace or line-terminator character.
func IsSpace(r rune) bool {
	switch {
	case r == '\t', r == '\n', r == '\v', r == '\f', r == '\r', r == ' ', r == 0xa0, r == 0x1680,
		r >= 0x2000 && r <= 0x200a, r == 0x2028, r == 0x2029, r == 0x202f, r == 0x205f, r == 0x3000, r == 0xfeff:
		return true
	}
	return false
}

// Trim is JS's String.prototype.trim.
func Trim(s string) string { return strings.TrimFunc(s, IsSpace) }

// TrimEnd is JS's String.prototype.trimEnd.
func TrimEnd(s string) string { return strings.TrimRightFunc(s, IsSpace) }

// Re compiles a JS-style pattern for Go: `\s` and `\S` take their JS meaning, everything else is RE2 as it is.
// flags are the RE2 inline flags without the parentheses (`i`, or empty). It panics on a bad pattern.
func Re(pattern, flags string) *regexp.Regexp {
	re, err := Compile(pattern, flags)
	if err != nil {
		panic(err)
	}
	return re
}

// Compile is Re returning the error (for patterns built from user text).
func Compile(pattern, flags string) (*regexp.Regexp, error) {
	var b strings.Builder
	if flags != "" {
		b.WriteString("(?" + flags + ")")
	}
	inClass := false
	for i := 0; i < len(pattern); i++ {
		c := pattern[i]
		switch {
		case c == '\\' && i+1 < len(pattern):
			n := pattern[i+1]
			i++
			switch {
			case n == 's' && inClass:
				b.WriteString(space)
			case n == 's':
				b.WriteString("[" + space + "]")
			case n == 'S' && inClass:
				// a negated set inside a set cannot be written in general; the one use is the `[\s\S]` idiom for
				// "any character", so this is everything
				b.WriteString(`\x{0}-\x{10FFFF}`)
			case n == 'S':
				b.WriteString("[^" + space + "]")
			default:
				b.WriteByte('\\')
				b.WriteByte(n)
			}
		case c == '[' && !inClass:
			inClass = true
			b.WriteByte(c)
			if i+1 < len(pattern) && pattern[i+1] == '^' {
				b.WriteByte('^')
				i++
			}
		case c == ']' && inClass:
			inClass = false
			b.WriteByte(c)
		default:
			b.WriteByte(c)
		}
	}
	return regexp.Compile(b.String())
}

// Len16 is the length JS reports for s.
func Len16(s string) int { return len(utf16.Encode([]rune(s))) }

// Slice is s.slice(from, to) with JS's UTF-16 indexes; a bound outside the string is clamped.
func Slice(s string, from, to int) string {
	u := utf16.Encode([]rune(s))
	if from < 0 {
		from = 0
	}
	if to > len(u) {
		to = len(u)
	}
	if from >= to {
		return ""
	}
	return string(utf16.Decode(u[from:to]))
}

// Head is s.slice(0, n).
func Head(s string, n int) string { return Slice(s, 0, n) }

// Index16 turns a byte offset into s into the UTF-16 index JS would report for the same place.
func Index16(s string, byteIdx int) int { return Len16(s[:byteIdx]) }
