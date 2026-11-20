package ui

// The deterministic half of two versions of one canvas compared: the assertions of ui-canvas-diff.test.mjs, one for
// one.

import (
	"encoding/json"
	"reflect"
	"regexp"
	"sort"
	"strings"
	"testing"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/uicompare"
)

func mbox(over map[string]any) uicompare.Box {
	b := uicompare.Box{"top": 100.0, "left": 40.0, "width": 320.0, "height": 48.0, "color": "rgb(0, 0, 0)"}
	for k, v := range over {
		b[k] = v
	}
	return b
}

var page1440 = Size{1440, 900}

func rect(top, left, width, height float64) *Rect {
	return &Rect{Top: top, Left: left, Width: width, Height: height}
}

func sameRegion(t *testing.T, got *Region, want *Region) {
	t.Helper()
	if (got == nil) != (want == nil) || (got != nil && *got != *want) {
		t.Fatalf("region %+v, want %+v", got, want)
	}
}

// ---------- region box (what the anchor-area screenshot is cut from) ----------

func TestARegionBoxIsTheAnchorRectangleInWholePixelsTheSameForBothSides(t *testing.T) {
	r := rect(100.4, 40, 320, 48.2)
	sameRegion(t, RegionBox(r, r, page1440, page1440, false), &Region{40, 100, 320, 49})
}

func TestWhenTheAnchorGrewTheRegionCoversBothRectangles(t *testing.T) {
	sameRegion(t, RegionBox(rect(100, 40, 320, 48), rect(100, 40, 320, 120), page1440, page1440, false), &Region{40, 100, 320, 120})
}

func TestARegionIsCutDownToTheAreaBothPagesHaveAndIsNilWhenNothingIsLeft(t *testing.T) {
	low := rect(800, 0, 100, 200)
	sameRegion(t, RegionBox(low, low, page1440, Size{1440, 1000}, false), &Region{0, 800, 100, 100})
	beyond := rect(950, 0, 100, 20)
	sameRegion(t, RegionBox(beyond, beyond, page1440, page1440, false), nil)
}

func TestAnAnchorHiddenOnBothSidesHasNoRegion(t *testing.T) {
	none := rect(0, 0, 0, 0)
	sameRegion(t, RegionBox(none, none, page1440, page1440, false), nil)
}

func TestAnAnchorPresentOnOneSideOnlyStillGetsARegion(t *testing.T) {
	sameRegion(t, RegionBox(nil, rect(10, 10, 50, 20), Size{400, 400}, Size{400, 400}, false), &Region{10, 10, 50, 20})
}

func TestTwoVersionsOfOneCanvasARegionOnTheLongerPageIsCutInFull(t *testing.T) {
	oldPage, newPage := Size{390, 844}, Size{390, 1100}
	sameRegion(t, RegionBox(nil, rect(900, 20, 350, 120), oldPage, newPage, true), &Region{20, 900, 350, 120})
	sameRegion(t, RegionBox(nil, rect(840, 20, 350, 120), oldPage, newPage, true), &Region{20, 840, 350, 120})
}

func TestAUnionRegionIsStillCutAtTheEndOfTheLongerPage(t *testing.T) {
	low := rect(800, 0, 100, 400)
	sameRegion(t, RegionBox(low, low, page1440, Size{1440, 1000}, true), &Region{0, 800, 100, 200})
	beyond := rect(950, 0, 100, 20)
	sameRegion(t, RegionBox(beyond, beyond, page1440, page1440, true), nil)
}

func TestPadSizeIsHowBigAPageHasToBeForTheRegion(t *testing.T) {
	if got := PadSize(Region{20, 900, 350, 120}); got != (Size{370, 1020}) {
		t.Fatal(got)
	}
}

// ---------- which anchors changed ----------

func diff(before, after uicompare.Measurements) []AnchorDiff {
	return DiffAnchors(before, after, nil, nil, uicompare.Tolerance{})
}

func TestTwoIdenticalVersionsHaveNoChangedAnchors(t *testing.T) {
	m := uicompare.Measurements{"hero": mbox(nil), "cta": mbox(map[string]any{"top": 300.0})}
	same := uicompare.Measurements{"hero": mbox(nil), "cta": mbox(map[string]any{"top": 300.0})}
	if got := diff(m, same); len(got) != 0 {
		t.Fatal(got)
	}
}

func TestAChangedStyleIsReportedWithThePropertyAndBothValues(t *testing.T) {
	before := uicompare.Measurements{"hero": mbox(nil), "cta": mbox(map[string]any{"top": 300.0})}
	after := uicompare.Measurements{"hero": mbox(nil), "cta": mbox(map[string]any{"top": 300.0, "color": "rgb(255, 0, 0)"})}
	got := diff(before, after)
	if len(got) != 1 || got[0].Anchor != "cta" || got[0].Kind != "changed" {
		t.Fatal(got)
	}
	want := []AnchorChange{{Property: "color", Before: "rgb(0, 0, 0)", After: "rgb(255, 0, 0)", Delta: nil}}
	if !reflect.DeepEqual(got[0].Changes, want) {
		t.Fatalf("%+v", got[0].Changes)
	}
	b, _ := json.Marshal(got[0].Changes[0])
	if string(b) != `{"property":"color","before":"rgb(0, 0, 0)","after":"rgb(255, 0, 0)","delta":null}` {
		t.Fatal(string(b))
	}
}

func TestASizeChangeInsideThePositionToleranceIsNotAChangeOneBeyondItIs(t *testing.T) {
	before := uicompare.Measurements{"card": mbox(nil)}
	if got := diff(before, uicompare.Measurements{"card": mbox(map[string]any{"height": 49.0})}); len(got) != 0 {
		t.Fatal(got)
	}
	got := diff(before, uicompare.Measurements{"card": mbox(map[string]any{"height": 120.0})})
	if got[0].Changes[0].Property != "height" || *got[0].Changes[0].Delta != 72 {
		t.Fatalf("%+v", got)
	}
}

func TestAnAnchorOnlyInTheNewVersionIsAddedOnlyInTheOldOneIsRemoved(t *testing.T) {
	got := diff(uicompare.Measurements{"gone": mbox(nil), "kept": mbox(nil)}, uicompare.Measurements{"kept": mbox(nil), "toggle": mbox(nil)})
	var pairs []string
	for _, c := range got {
		pairs = append(pairs, c.Anchor+":"+c.Kind)
	}
	sort.Strings(pairs)
	if strings.Join(pairs, ",") != "gone:removed,toggle:added" {
		t.Fatal(pairs)
	}
}

// ---------- the change set ----------

func TestAChangeSetEntryNamesADecisionTheStatesAndTheAnchors(t *testing.T) {
	set, err := ParseChangeSet(json.RawMessage(`[{"decision":"2.1","states":["default"],"anchors":["card","card-title"]}]`))
	if err != nil || !reflect.DeepEqual(set, []ChangeEntry{{"2.1", []string{"default"}, []string{"card", "card-title"}}}) {
		t.Fatal(set, err)
	}
	if set, err := ParseChangeSet(json.RawMessage(`[]`)); err != nil || len(set) != 0 {
		t.Fatal(set, err)
	}
}

func TestAMalformedChangeSetIsRefusedWithTheEntryNamed(t *testing.T) {
	for raw, want := range map[string]string{
		`{}`: `数组`,
		`[{"decision":"two","states":["a"],"anchors":["b"]}]`: `changeSet\[0\]\.decision .*拿到 "two"`,
		`[{"states":["a"],"anchors":["b"]}]`:                  `拿到 undefined`,
		`[{"decision":"2.1","states":[],"anchors":["b"]}]`:    `states`,
		`[{"decision":"2.1","states":["a"]}]`:                 `anchors`,
		`[null]`:                                              `changeSet\[0\] 必须是对象`,
		`null`:                                                `数组`,
	} {
		_, err := ParseChangeSet(json.RawMessage(raw))
		if err == nil || !regexp.MustCompile(want).MatchString(err.Error()) {
			t.Errorf("%s: %v, want %s", raw, err, want)
		}
	}
}

func change(state, anchor string) Change {
	return Change{Cell: "desktop/" + state, State: state, Anchor: anchor, Kind: "changed", Changes: []AnchorChange{}}
}

func anchorsOf(cs []Change) []string {
	out := []string{}
	for _, c := range cs {
		out = append(out, c.Anchor)
	}
	return out
}

func TestAChangeNobodyDeclaredIsFoundADeclaredOneIsNotReportedAsUndeclared(t *testing.T) {
	r := ClassifyChanges([]Change{change("default", "card"), change("default", "card-toggle")}, []ChangeEntry{{"2.1", []string{"default"}, []string{"card"}}}, []string{"default"})
	if !reflect.DeepEqual(anchorsOf(r.Undeclared), []string{"card-toggle"}) || len(r.Declared) != 1 || r.Declared[0].Anchor != "card" || !reflect.DeepEqual(r.Declared[0].Decisions, []string{"2.1"}) {
		t.Fatalf("%+v", r)
	}
}

func TestDeclaringAnAnchorForAnotherStateDoesNotCoverAChangeInThisState(t *testing.T) {
	r := ClassifyChanges([]Change{change("empty", "card")}, []ChangeEntry{{"2.1", []string{"default"}, []string{"card"}}}, []string{"default", "empty"})
	if len(r.Undeclared) != 1 || r.Undeclared[0].State != "empty" {
		t.Fatalf("%+v", r)
	}
}

func TestADeclarationThatMatchesNothingThatChangedIsListedForTheComparedStates(t *testing.T) {
	r := ClassifyChanges([]Change{change("default", "card")}, []ChangeEntry{{"2.1", []string{"default", "empty"}, []string{"card", "title"}}}, []string{"default", "empty"})
	var pairs []string
	for _, d := range r.DeclaredUnchanged {
		pairs = append(pairs, d.Decision+"|"+d.State+"|"+d.Anchor)
	}
	sort.Strings(pairs)
	if strings.Join(pairs, ",") != "2.1|default|title,2.1|empty|card,2.1|empty|title" {
		t.Fatal(pairs)
	}
}

func TestADeclarationForAStateNoCellComparedIsUncheckedNotUnchanged(t *testing.T) {
	r := ClassifyChanges(nil, []ChangeEntry{{"2.1", []string{"mobile-empty"}, []string{"card"}}}, []string{"default"})
	if len(r.DeclaredUnchanged) != 0 || !reflect.DeepEqual(r.Unchecked, []Declaration{{Decision: "2.1", State: "mobile-empty"}}) {
		t.Fatalf("%+v", r)
	}
	b, _ := json.Marshal(r.Unchecked)
	if string(b) != `[{"decision":"2.1","state":"mobile-empty"}]` {
		t.Fatal(string(b))
	}
}

func TestWithAnEmptyChangeSetEveryChangeIsUndeclared(t *testing.T) {
	r := ClassifyChanges([]Change{change("default", "card")}, []ChangeEntry{}, []string{"default"})
	if len(r.Undeclared) != 1 || len(r.Declared) != 0 {
		t.Fatalf("%+v", r)
	}
}

func TestOneChangeCoveredByTwoDecisionsCarriesBothNumbers(t *testing.T) {
	set := []ChangeEntry{{"2.1", []string{"default"}, []string{"card"}}, {"2.3", []string{"default"}, []string{"card"}}}
	r := ClassifyChanges([]Change{change("default", "card")}, set, []string{"default"})
	if !reflect.DeepEqual(r.Declared[0].Decisions, []string{"2.1", "2.3"}) {
		t.Fatalf("%+v", r)
	}
}

// ---------- output ----------

func TestShotFileNamesAreSafeAndSayCellAnchorAndSide(t *testing.T) {
	if got := ShotFileName("desktop/light/default", "card-title", "before"); got != "desktop-light-default--card-title--before.png" {
		t.Fatal(got)
	}
	if got := ShotFileName("a b", "x/y", "after"); got != "a-b--x-y--after.png" {
		t.Fatal(got)
	}
}

func TestAttentionUndeclaredChangesNeedALookWithoutAChangeSetAnyChangeDoes(t *testing.T) {
	c := change("d", "a")
	if HasAttention(DiffReport{}, true) || HasAttention(DiffReport{Changed: []Change{c}}, true) {
		t.Fatal("declared changes alone need no look")
	}
	if !HasAttention(DiffReport{Changed: []Change{c}, Classified: Classified{Undeclared: []Change{c}}}, true) {
		t.Fatal("an undeclared change needs a look")
	}
	if !HasAttention(DiffReport{Changed: []Change{c}}, false) {
		t.Fatal("without a change set any change needs a look")
	}
}

func TestTheHumanReadableRenderPutsTheUndeclaredBlockFirstAndSaysPlainlyWhenNothingChanged(t *testing.T) {
	d := 72.0
	c := change("default", "card-toggle")
	c.Changes = []AnchorChange{{Property: "height", Before: 48.0, After: 120.0, Delta: &d}}
	text := RenderCanvasDiff(DiffReport{Changed: []Change{c}, Classified: Classified{Undeclared: []Change{c}}}, true)
	contains(t, text, "没声明", "card-toggle", "height: 48 → 120")
	if !strings.HasPrefix(text, "没声明却变了的地方（1）：") {
		t.Fatal(text)
	}
	if got := RenderCanvasDiff(DiffReport{}, true); !strings.Contains(got, "没有变") {
		t.Fatal(got)
	}
	p := 3.14159
	c.PixelPercent = &p
	c.Decisions = []string{"2.1", "2.3"}
	contains(t, RenderCanvasDiff(DiffReport{Changed: []Change{c}, Classified: Classified{Declared: []Change{c}}}, true),
		"没声明却变了的地方（0）：", "改动集里声明过的（1）：", "区域像素差 3.14%", "（改动集 2.1、2.3）")
	contains(t, RenderCanvasDiff(DiffReport{Changed: []Change{c}}, false), "变了的锚点（1）：")
}
