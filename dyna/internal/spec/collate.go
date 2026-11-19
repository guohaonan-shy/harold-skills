package spec

import (
	"sort"
	"unicode"
)

// The old script sorted slugs with JavaScript's localeCompare (ICU root collation). Slugs are kebab-case, so this
// is that ordering for ASCII: punctuation first in ICU's own order, then digits, then letters without regard to
// case, and a lowercase letter before the same uppercase one. Anything else sorts after, by code point.
const punctuationOrder = "_-,;:!?.'\"()[]{}@*/\\&#%`^+<=>|~$"

type weight struct {
	class int
	value rune
}

func primary(r rune) weight {
	for i, p := range punctuationOrder {
		if r == p {
			return weight{0, rune(i)}
		}
	}
	switch {
	case r >= '0' && r <= '9':
		return weight{1, r}
	case unicode.IsLetter(r) && r < 128:
		return weight{2, unicode.ToLower(r)}
	}
	return weight{3, r}
}

// slugBefore reports whether slug a sorts before slug b.
func slugBefore(a, b string) bool {
	ra, rb := []rune(a), []rune(b)
	for i := 0; i < len(ra) && i < len(rb); i++ {
		wa, wb := primary(ra[i]), primary(rb[i])
		if wa != wb {
			return wa.class < wb.class || (wa.class == wb.class && wa.value < wb.value)
		}
	}
	if len(ra) != len(rb) {
		return len(ra) < len(rb)
	}
	for i := range ra {
		if ra[i] != rb[i] {
			return unicode.IsLower(ra[i]) // same letter, different case: lowercase first
		}
	}
	return false
}

func sortSlugs(specs []Listed) {
	sort.SliceStable(specs, func(i, j int) bool { return slugBefore(specs[i].Slug, specs[j].Slug) })
}
