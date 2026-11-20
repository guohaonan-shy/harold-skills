// Package semver reads the plain MAJOR.MINOR.PATCH versions dyna and the plugin use,
// and the version ranges the plugin writes down (">=0.4.0 <1.0.0").
package semver

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

// Version is MAJOR.MINOR.PATCH. Pre-release and build parts are not used by dyna and are refused.
type Version struct{ Major, Minor, Patch int }

var versionRe = regexp.MustCompile(`^v?(\d+)\.(\d+)\.(\d+)$`)

// Parse reads "1.2.3" or "v1.2.3".
func Parse(s string) (Version, error) {
	m := versionRe.FindStringSubmatch(strings.TrimSpace(s))
	if m == nil {
		return Version{}, fmt.Errorf("「%s」不是 主.次.修 三段的版本号", s)
	}
	n := func(x string) int { v, _ := strconv.Atoi(x); return v }
	return Version{n(m[1]), n(m[2]), n(m[3])}, nil
}

func (v Version) String() string { return fmt.Sprintf("%d.%d.%d", v.Major, v.Minor, v.Patch) }

// Compare returns -1, 0 or 1 as v is below, equal to or above o.
func (v Version) Compare(o Version) int {
	for _, p := range [][2]int{{v.Major, o.Major}, {v.Minor, o.Minor}, {v.Patch, o.Patch}} {
		if p[0] != p[1] {
			if p[0] < p[1] {
				return -1
			}
			return 1
		}
	}
	return 0
}

type comparator struct {
	op string
	v  Version
}

// Range is a space-separated list of comparators that must all hold.
type Range struct {
	text  string
	comps []comparator
}

var compRe = regexp.MustCompile(`^(>=|<=|>|<|=)?(v?\d+\.\d+\.\d+)$`)

// ParseRange reads ">=0.4.0 <1.0.0". A bare version means "exactly".
func ParseRange(s string) (Range, error) {
	fields := strings.Fields(s)
	if len(fields) == 0 {
		return Range{}, fmt.Errorf("版本范围是空的")
	}
	r := Range{text: strings.Join(fields, " ")}
	for _, f := range fields {
		m := compRe.FindStringSubmatch(f)
		if m == nil {
			return Range{}, fmt.Errorf("版本范围里的「%s」读不懂（写法：>=0.4.0 <1.0.0）", f)
		}
		v, _ := Parse(m[2])
		op := m[1]
		if op == "" {
			op = "="
		}
		r.comps = append(r.comps, comparator{op, v})
	}
	return r, nil
}

func (r Range) String() string { return r.text }

// Position says where a version sits against a range.
type Position int

const (
	Inside Position = iota
	// Below: lower than the range allows (the command line is too old).
	Below
	// Above: at or over the upper limit (the plugin is too old).
	Above
)

// Where reports Below when any lower bound fails, Above when only an upper bound fails.
func (r Range) Where(v Version) Position {
	above := false
	for _, c := range r.comps {
		cmp := v.Compare(c.v)
		switch c.op {
		case ">=":
			if cmp < 0 {
				return Below
			}
		case ">":
			if cmp <= 0 {
				return Below
			}
		case "<":
			if cmp >= 0 {
				above = true
			}
		case "<=":
			if cmp > 0 {
				above = true
			}
		case "=":
			if cmp < 0 {
				return Below
			}
			if cmp > 0 {
				above = true
			}
		}
	}
	if above {
		return Above
	}
	return Inside
}

// Contains reports whether v satisfies every comparator.
func (r Range) Contains(v Version) bool { return r.Where(v) == Inside }

// Lower is the floor the range names (">=X" or "=X"); false when it has none.
func (r Range) Lower() (Version, bool) {
	for _, c := range r.comps {
		if c.op == ">=" || c.op == "=" {
			return c.v, true
		}
	}
	return Version{}, false
}
