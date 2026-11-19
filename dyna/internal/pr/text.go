package pr

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

// The text helpers keep the old scripts' reading of whitespace and length: a "space" is what JavaScript counts
// as one (so the no-break space and the ideographic space are spaces too), and a length is in UTF-16 units,
// which is what the 65000-character limit of a PR body was measured in.

const spaceSet = `\t\n\v\f\r \x{00a0}\x{1680}\x{2000}-\x{200a}\x{2028}\x{2029}\x{202f}\x{205f}\x{3000}\x{feff}`

var (
	spaceRun = regexp.MustCompile(`[` + spaceSet + `]+`)
)

func isSpace(r rune) bool {
	switch {
	case r == '\t', r == '\n', r == '\v', r == '\f', r == '\r', r == ' ', r == 0xa0, r == 0x1680,
		r >= 0x2000 && r <= 0x200a, r == 0x2028, r == 0x2029, r == 0x202f, r == 0x205f, r == 0x3000, r == 0xfeff:
		return true
	}
	return false
}

// trim is String.prototype.trim.
func trim(s string) string { return strings.TrimFunc(s, isSpace) }

// normalize collapses every run of whitespace to one space and trims; nothing else is fuzzy.
func normalize(s string) string { return trim(spaceRun.ReplaceAllString(s, " ")) }

// contains is true when needle (not empty after normalizing) is in haystack, whitespace aside.
func contains(haystack, needle string) bool {
	n := normalize(needle)
	return n != "" && strings.Contains(normalize(haystack), n)
}

// jsLen is the length of s in UTF-16 units.
func jsLen(s string) int {
	n := 0
	for _, r := range s {
		if r >= 0x10000 {
			n += 2
		} else {
			n++
		}
	}
	return n
}

// text is the text of v, and nothing for a missing one: what a missing value reads as when it is compared as text.
func text(v any) string {
	if v == nil {
		return ""
	}
	return jsString(v)
}

// jsString is how a template literal would print v.
func jsString(v any) string {
	switch x := v.(type) {
	case nil:
		return "null"
	case string:
		return x
	case bool:
		return strconv.FormatBool(x)
	case float64:
		return strconv.FormatFloat(x, 'f', -1, 64)
	case []any:
		parts := make([]string, len(x))
		for i, e := range x {
			if e != nil {
				parts[i] = jsString(e)
			}
		}
		return strings.Join(parts, ",")
	case map[string]any:
		return "[object Object]"
	}
	return fmt.Sprint(v)
}
