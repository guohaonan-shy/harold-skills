package ui

// Two versions of one design canvas, compared — the deterministic half.
//
// `ui measure` opens the two versions (a matrix with "mode": "canvas-diff") in a browser, measures every anchor and
// cuts a screenshot out of each; everything it then has to decide is here, on plain data, so it is unit-tested
// without a browser:
//
//   - RegionBox       where to cut the anchor's area out of a screenshot
//   - PadSize         how big the shorter version's page is padded so that box exists in it
//   - DiffAnchors     which anchors changed between the two versions, and how
//   - ParseChangeSet  the shape of the change set a designer hands in with a version
//   - ClassifyChanges which of the changes the change set declared, and which it did not
//
// The shape of the change set is fixed here (and written up in the ui-measure skill's canvas-diff.md): one entry per
// decision the human made last round — { decision: "<round>.<n>", states: [state names], anchors: [anchor names] }.

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/design/jsx"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/frontmatter"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/uicompare"
)

// ModeCanvasDiff is the `mode` of a matrix that compares two versions of one canvas.
const ModeCanvasDiff = "canvas-diff"

// Rect is where an anchor sits on its page, CSS pixels in page coordinates. nil is "not on this page".
type Rect struct {
	Top, Left, Width, Height float64
}

// Size is the size of a whole page, CSS pixels.
type Size struct {
	Width, Height float64
}

// Region is the box (whole CSS pixels, page coordinates) an anchor's screenshot is cut from.
type Region struct {
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
	Width  float64 `json:"width"`
	Height float64 `json:"height"`
}

func present(r *Rect) bool { return r != nil && r.Width > 0 && r.Height > 0 }

// rectOf reads an anchor's box out of a measurement; nil when the anchor is not there.
func rectOf(m uicompare.Measurements, anchor string) *Rect {
	b, ok := m[anchor]
	if !ok || b == nil {
		return nil
	}
	return &Rect{Top: uicompare.JSNumber(b["top"]), Left: uicompare.JSNumber(b["left"]), Width: uicompare.JSNumber(b["width"]), Height: uicompare.JSNumber(b["height"])}
}

// RegionBox is the box an anchor's screenshot is cut from, the same for both sides so the two crops have the same
// size (the pixel comparator refuses two sizes). It covers the anchor in both versions (an anchor that grew is judged
// over its larger area). nil when nothing is left to look at (hidden on both sides, or entirely outside the pages).
//
// By default the box is cut down to what BOTH pages have (canvas against implementation: a region one side lacks is
// not part of the comparison). With union (two versions of one canvas) it is cut down to what EITHER page has: a
// block the new version added below the old page's end is still cut in full, and the caller pads the shorter page
// (see PadSize) so the old crop is the blank it really was.
func RegionBox(a, b *Rect, pageA, pageB Size, union bool) *Region {
	var rects []*Rect
	for _, r := range []*Rect{a, b} {
		if present(r) {
			rects = append(rects, r)
		}
	}
	if len(rects) == 0 {
		return nil
	}
	limit := math.Min
	if union {
		limit = math.Max
	}
	left, top := math.Inf(1), math.Inf(1)
	right, bottom := math.Inf(-1), math.Inf(-1)
	for _, r := range rects {
		left = math.Min(left, r.Left)
		top = math.Min(top, r.Top)
		right = math.Max(right, r.Left+r.Width)
		bottom = math.Max(bottom, r.Top+r.Height)
	}
	x, y := math.Floor(left), math.Floor(top)
	right = math.Min(math.Ceil(right), limit(pageA.Width, pageB.Width))
	bottom = math.Min(math.Ceil(bottom), limit(pageA.Height, pageB.Height))
	width := right - math.Max(x, 0)
	height := bottom - math.Max(y, 0)
	if !(width > 0) || !(height > 0) {
		return nil
	}
	return &Region{X: math.Max(x, 0), Y: math.Max(y, 0), Width: width, Height: height}
}

// PadSize is how big a page has to be for a region to lie inside it (what the shorter page is padded to).
func PadSize(r Region) Size { return Size{Width: r.X + r.Width, Height: r.Y + r.Height} }

// AnchorChange is one property that differs between the two versions of an anchor. Delta is null for a token value.
type AnchorChange struct {
	Property string   `json:"property"`
	Before   any      `json:"before"`
	After    any      `json:"after"`
	Delta    *float64 `json:"delta"`
}

// AnchorDiff is one anchor that differs between two versions: changed, added (only in the new one) or removed.
type AnchorDiff struct {
	Anchor  string         `json:"anchor"`
	Kind    string         `json:"kind"`
	Changes []AnchorChange `json:"changes"`
}

// DiffAnchors says which anchors differ between two versions of one state. Shared anchors are compared with the same
// measurement-layer rules as everything else (position within ±tolerance is the same; a token value is the same only
// if identical). before and after list their anchors in page order (the order the changes come back in before they
// are sorted by anchor).
func DiffAnchors(before, after uicompare.Measurements, beforeOrder, afterOrder []string, tolerance uicompare.Tolerance) []AnchorDiff {
	sharedB, sharedA := uicompare.Measurements{}, uicompare.Measurements{}
	for a, box := range before {
		if other, ok := after[a]; ok && other != nil {
			sharedB[a], sharedA[a] = box, other
		}
	}
	var out []AnchorDiff
	at := map[string]int{}
	for _, f := range uicompare.CompareMeasurements(sharedB, sharedA, tolerance, nil) {
		anchor := *f.Anchor
		i, ok := at[anchor]
		if !ok {
			i = len(out)
			at[anchor] = i
			out = append(out, AnchorDiff{Anchor: anchor, Kind: "changed", Changes: []AnchorChange{}})
		}
		prop := ""
		if f.Property != nil {
			prop = *f.Property
		}
		out[i].Changes = append(out[i].Changes, AnchorChange{Property: prop, Before: f.Expected, After: f.Actual, Delta: f.Delta})
	}
	for _, a := range orderOf(before, beforeOrder) {
		if after[a] == nil {
			out = append(out, AnchorDiff{Anchor: a, Kind: "removed", Changes: []AnchorChange{}})
		}
	}
	for _, a := range orderOf(after, afterOrder) {
		if before[a] == nil {
			out = append(out, AnchorDiff{Anchor: a, Kind: "added", Changes: []AnchorChange{}})
		}
	}
	sort.SliceStable(out, func(i, j int) bool { return uicompare.LocaleCompare(out[i].Anchor, out[j].Anchor) < 0 })
	if out == nil {
		out = []AnchorDiff{}
	}
	return out
}

// orderOf is the anchors of m in the given order, then any the order does not name, sorted.
func orderOf(m uicompare.Measurements, order []string) []string {
	var out []string
	seen := map[string]bool{}
	for _, a := range order {
		if _, ok := m[a]; ok && !seen[a] {
			out = append(out, a)
			seen[a] = true
		}
	}
	var rest []string
	for a := range m {
		if !seen[a] {
			rest = append(rest, a)
		}
	}
	sort.Strings(rest)
	return append(out, rest...)
}

// ChangeEntry is one entry of a change set: a decision of the human's, the states and the anchors it touched.
type ChangeEntry struct {
	Decision string   `json:"decision"`
	States   []string `json:"states"`
	Anchors  []string `json:"anchors"`
}

var decisionID = regexp.MustCompile(`^\d+\.\d+$`)

// nameList is a non-empty list of non-empty strings.
func nameList(v any) ([]string, bool) {
	list, ok := v.([]any)
	if !ok || len(list) == 0 {
		return nil, false
	}
	out := make([]string, len(list))
	for i, s := range list {
		str, ok := s.(string)
		if !ok || str == "" {
			return nil, false
		}
		out[i] = str
	}
	return out, true
}

// ParseChangeSet validates a change set (the raw JSON of the matrix's `changeSet`); the error names the offending
// entry.
func ParseChangeSet(raw json.RawMessage) ([]ChangeEntry, error) {
	v, err := jsx.ParseJSON(raw)
	if err != nil {
		return nil, fmt.Errorf("changeSet 不是 JSON：%v", err)
	}
	list, ok := v.([]any)
	if !ok {
		return nil, errors.New("changeSet 必须是数组（第一轮没有改动就写 []）")
	}
	out := make([]ChangeEntry, 0, len(list))
	for i, e := range list {
		at := fmt.Sprintf("changeSet[%d]", i)
		get := func(string) (any, bool) { return nil, false }
		if m, isMap := frontmatter.AsMap(e); isMap {
			get = func(k string) (any, bool) { return m.Get(k), m.Has(k) }
		} else if _, isList := e.([]any); !isList { // an array is an object to JavaScript: one with none of the fields
			return nil, fmt.Errorf("%s 必须是对象", at)
		}
		d, has := get("decision")
		ds, isStr := d.(string)
		if !isStr || !decisionID.MatchString(ds) {
			got := "undefined"
			if has {
				got = jsx.Stringify(d)
			}
			return nil, fmt.Errorf("%s.decision 必须是 <轮次>.<序号>，例如 \"2.1\"，拿到 %s", at, got)
		}
		s, _ := get("states")
		states, ok := nameList(s)
		if !ok {
			return nil, fmt.Errorf("%s.states 必须是非空的状态名数组", at)
		}
		a, _ := get("anchors")
		anchors, ok := nameList(a)
		if !ok {
			return nil, fmt.Errorf("%s.anchors 必须是非空的锚点名数组", at)
		}
		out = append(out, ChangeEntry{Decision: ds, States: states, Anchors: anchors})
	}
	return out, nil
}

// Shots are the two area screenshots of a changed anchor, as file paths.
type Shots struct {
	Before string `json:"before"`
	After  string `json:"after"`
}

// Change is one anchor that changed in one cell. Decisions is set on a declared change only.
type Change struct {
	Cell         string         `json:"cell"`
	State        string         `json:"state"`
	Anchor       string         `json:"anchor"`
	Kind         string         `json:"kind"`
	Changes      []AnchorChange `json:"changes"`
	PixelPercent *float64       `json:"pixelPercent"`
	Shots        *Shots         `json:"shots"`
	Decisions    []string       `json:"decisions,omitempty"`
}

// Declaration is a change-set entry's claim on one state (and anchor) that turned out not to hold or not to be checked.
type Declaration struct {
	Decision string `json:"decision"`
	State    string `json:"state"`
	Anchor   string `json:"anchor,omitempty"`
}

// Classified is the changes split by whether the change set declared them.
//
//   - Declared: changes some entry covers, each with its decisions;
//   - Undeclared: changes no entry covers — "没声明却变了的地方";
//   - DeclaredUnchanged: declared for a compared state, but nothing changed there;
//   - Unchecked: declared for a state no cell compared — unknown, not "unchanged".
type Classified struct {
	Declared          []Change      `json:"declared"`
	Undeclared        []Change      `json:"undeclared"`
	DeclaredUnchanged []Declaration `json:"declaredUnchanged"`
	Unchecked         []Declaration `json:"unchecked"`
}

func inStrings(xs []string, x string) bool {
	for _, y := range xs {
		if y == x {
			return true
		}
	}
	return false
}

// ClassifyChanges splits changes by whether the change set declared them. comparedStates are the states some matrix
// cell actually compared.
func ClassifyChanges(changes []Change, changeSet []ChangeEntry, comparedStates []string) Classified {
	r := Classified{Declared: []Change{}, Undeclared: []Change{}, DeclaredUnchanged: []Declaration{}, Unchecked: []Declaration{}}
	for _, c := range changes {
		var decisions []string
		for _, e := range changeSet {
			if inStrings(e.States, c.State) && inStrings(e.Anchors, c.Anchor) {
				decisions = append(decisions, e.Decision)
			}
		}
		if len(decisions) > 0 {
			c.Decisions = decisions
			r.Declared = append(r.Declared, c)
		} else {
			c.Decisions = nil
			r.Undeclared = append(r.Undeclared, c)
		}
	}
	changed := map[string]bool{}
	for _, c := range changes {
		changed[c.State+"\x00"+c.Anchor] = true
	}
	for _, e := range changeSet {
		for _, state := range e.States {
			if !inStrings(comparedStates, state) {
				r.Unchecked = append(r.Unchecked, Declaration{Decision: e.Decision, State: state})
				continue
			}
			for _, anchor := range e.Anchors {
				if !changed[state+"\x00"+anchor] {
					r.DeclaredUnchanged = append(r.DeclaredUnchanged, Declaration{Decision: e.Decision, State: state, Anchor: anchor})
				}
			}
		}
	}
	return r
}

var (
	unsafeName = regexp.MustCompile(`[^A-Za-z0-9_.-]+`)
	edgeDashes = regexp.MustCompile(`^-+|-+$`)
)

// ShotFileName is `<cell>--<anchor>--<side>.png`, safe as a file name.
func ShotFileName(cell, anchor, side string) string {
	safe := func(s string) string { return edgeDashes.ReplaceAllString(unsafeName.ReplaceAllString(s, "-"), "") }
	return safe(cell) + "--" + safe(anchor) + "--" + side + ".png"
}

// DiffReport is one canvas-diff matrix's result, in the order its JSON keys are written.
type DiffReport struct {
	Changed []Change `json:"changed"`
	Classified
}

// HasAttention says whether the run needs a human's look (exit 2): with a change set, only changes it did not
// declare; without one, any change.
func HasAttention(r DiffReport, hasChangeSet bool) bool {
	if hasChangeSet {
		return len(r.Undeclared) > 0
	}
	return len(r.Changed) > 0
}

func describe(c Change) string {
	where := c.Cell + " · " + c.Anchor
	var what string
	switch c.Kind {
	case "added":
		what = "新版新增的锚点"
	case "removed":
		what = "新版没有了这个锚点"
	default:
		var parts []string
		for _, x := range c.Changes {
			parts = append(parts, fmt.Sprintf("%s: %s → %s", x.Property, uicompare.JSString(x.Before), uicompare.JSString(x.After)))
		}
		if c.PixelPercent != nil && *c.PixelPercent > 0 {
			parts = append(parts, "区域像素差 "+strconv.FormatFloat(*c.PixelPercent, 'f', 2, 64)+"%")
		}
		what = strings.Join(parts, "；")
	}
	decided := ""
	if c.Decisions != nil {
		decided = "  （改动集 " + strings.Join(c.Decisions, "、") + "）"
	}
	return "  " + where + "  " + what + decided
}

// RenderCanvasDiff is the human-readable form. The undeclared block comes first.
func RenderCanvasDiff(r DiffReport, hasChangeSet bool) string {
	if len(r.Changed) == 0 && len(r.DeclaredUnchanged) == 0 && len(r.Unchecked) == 0 {
		return "ui-measure: 两版没有变化 ✓"
	}
	var lines []string
	block := func(title string, cs []Change) {
		lines = append(lines, fmt.Sprintf(title, len(cs)))
		for _, c := range cs {
			lines = append(lines, describe(c))
		}
	}
	if hasChangeSet {
		block("没声明却变了的地方（%d）：", r.Undeclared)
		if len(r.Declared) > 0 {
			block("改动集里声明过的（%d）：", r.Declared)
		}
		if len(r.DeclaredUnchanged) > 0 {
			lines = append(lines, fmt.Sprintf("改动集声明了、却没变的（%d）：", len(r.DeclaredUnchanged)))
			for _, d := range r.DeclaredUnchanged {
				lines = append(lines, fmt.Sprintf("  %s  %s · %s", d.Decision, d.State, d.Anchor))
			}
		}
		if len(r.Unchecked) > 0 {
			lines = append(lines, fmt.Sprintf("改动集声明了、但矩阵里没有这个状态的格，没比（%d）：", len(r.Unchecked)))
			for _, d := range r.Unchecked {
				lines = append(lines, fmt.Sprintf("  %s  %s", d.Decision, d.State))
			}
		}
	} else {
		block("变了的锚点（%d）：", r.Changed)
	}
	return strings.Join(lines, "\n")
}
