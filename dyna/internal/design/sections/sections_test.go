package sections

// Ported from design-archive-sections.test.mjs: the seams of the sections command — its pure functions (Attribute,
// ShootTargets, CoverScreens) fed hand-written measurements, the code builders, and the command line (exit codes,
// stdout). The generated code actually running in a browser is in browser_test.go.

import (
	"math"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"testing"

	"github.com/spf13/cobra"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/design/fixture"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/registry"
)

const (
	MKT      = fixture.MKT
	MKTEntry = fixture.MKTEntry
	BASE     = fixture.Base
)

// ---------- a hand-written measurement of a 1440×6000 marketing page ----------
//
//   0     banner (0–100)
//   100   block 0: hero (heading at 300)
//   900   block 1: feature-a (heading at 1000), 3600 tall
//   4500  block 2: feature-b (heading at 4600)
//   5800  contentinfo (5800–6000)

var (
	HERO     = J(`{"id":"hero","locate":{"role":"heading","name":"一个价格"},"found":true,"top":300,"bottom":340,"block":0}`).(Obj)
	FEATUREA = J(`{"id":"feature-a","locate":{"role":"heading","name":"无限菜谱"},"found":true,"top":1000,"bottom":1040,"block":1}`).(Obj)
	FEATUREB = J(`{"id":"feature-b","locate":{"role":"heading","name":"食材库同步"},"found":true,"top":4600,"bottom":4640,"block":2}`).(Obj)
	HEADER   = J(`{"id":"header","locate":{"role":"banner"},"found":true,"top":0,"bottom":100,"block":-1}`).(Obj)
	FOOTER   = J(`{"id":"footer","locate":{"role":"contentinfo"},"found":true,"top":5800,"bottom":6000,"block":-1}`).(Obj)
	CLICKS   = J(`[
  {"role":"link","name":"跳过导航","top":20,"bottom":40,"landmark":null},
  {"role":"link","name":"菜谱","top":50,"bottom":70,"landmark":"banner"},
  {"role":"button","name":"开始使用","top":500,"bottom":548,"landmark":null},
  {"role":"link","name":"看功能","top":600,"bottom":620,"landmark":null},
  {"role":"button","name":"展开细节","top":4700,"bottom":4740,"landmark":null},
  {"role":"link","name":"条款","top":5900,"bottom":5920,"landmark":"contentinfo"}
]`)
	ALL = []any{HEADER, HERO, FEATUREA, FEATUREB, FOOTER}
)

func measurement(sections []any, overrides ...any) Obj {
	m := O(
		"state", MKTEntry,
		"page", MKT,
		"pageSize", J(`{"width":1440,"height":6000}`),
		"blocks", J(`[{"top":100,"bottom":900},{"top":900,"bottom":4500},{"top":4500,"bottom":5800}]`),
		"contentinfo", J(`{"top":5800,"bottom":6000}`),
		"sections", sections,
		"clickables", CLICKS,
	)
	for i := 0; i+1 < len(overrides); i += 2 {
		m.Set(overrides[i].(string), norm(overrides[i+1]))
	}
	return m
}

func rangeOf(r Obj, id string) any { return findBy(r.Get("ranges"), "id", id) }

func TestAttributeEverySectionGetsARange(t *testing.T) {
	r := Attribute(measurement(ALL))
	eq(t, col(r.Get("ranges"), "id", "start", "end"), J(`[["header",0,100],["hero",100,900],["feature-a",900,4500],["feature-b",4500,5800],["footer",5800,6000]]`))
	is(t, get(at(r.Get("ranges"), 0.0), "ref"), MKT+"#header")
	eq(t, r.Get("coverage"), J(`{"gaps":[],"overlaps":[]}`), "the five ranges meet end to start and cover the page")
}

func TestAttributeAHeadingSectionEndsWhereTheNextStarts(t *testing.T) {
	r := Attribute(measurement([]any{HEADER, HERO, FEATUREA, FEATUREB}))
	eq(t, rangeOf(r, "feature-b"), J(`{"id":"feature-b","ref":"`+MKT+`#feature-b","by":"heading","role":"heading","start":4500,"end":5800,"height":1300}`))
	// no contentinfo at all: to the bottom of the page
	none := Attribute(measurement([]any{HEADER, HERO, FEATUREA, FEATUREB}, "contentinfo", nil))
	is(t, get(rangeOf(none, "feature-b"), "end"), 6000.0)
}

func TestAttributeTwoDeclaredHeadingsInOneBlock(t *testing.T) {
	second := with(FEATUREB, "top", 2000, "bottom", 2040, "block", 1) // now in the same block as feature-a
	r := Attribute(measurement([]any{HEADER, HERO, FEATUREA, second, FOOTER}))
	var rows []any
	for _, x := range list(r.Get("ranges")) {
		if id := get(x, "id"); id == "feature-a" || id == "feature-b" {
			rows = append(rows, []any{get(x, "id"), get(x, "start"), get(x, "end")})
		}
	}
	eq(t, rows, J(`[["feature-a",1000,2000],["feature-b",2000,5800]]`))
}

func TestAttributeAPositionSectionIsThatBlocksOwnBox(t *testing.T) {
	pos := J(`{"id":"hero","locate":{"position":1},"found":true,"top":100,"bottom":900,"block":0}`)
	r := Attribute(measurement([]any{HEADER, pos, FEATUREA, FEATUREB, FOOTER}))
	eq(t, rangeOf(r, "hero"), J(`{"id":"hero","ref":"`+MKT+`#hero","by":"position","role":null,"start":100,"end":900,"height":800}`))
}

func TestAttributeOrphansAndDeclaringHeaderAndFooterClearsThem(t *testing.T) {
	without := Attribute(measurement([]any{HERO, FEATUREA, FEATUREB}))
	is(t, without.Get("ok"), false)
	names := col(without.Get("orphans"), "name")
	want := map[any]bool{"条款": true, "跳过导航": true, "菜谱": true}
	if len(names) != 3 {
		t.Fatalf("orphans: %v", names)
	}
	for _, n := range names {
		if !want[n] {
			t.Fatalf("unexpected orphan %v", n)
		}
	}
	match(t, text(get(findBy(without.Get("orphans"), "name", "条款"), "reason")), `contentinfo`)
	match(t, text(get(findBy(without.Get("orphans"), "name", "跳过导航"), "reason")), `之前`)
	withBoth := Attribute(measurement(ALL))
	is(t, withBoth.Get("ok"), true)
	eq(t, withBoth.Get("orphans"), []any{})
}

func TestAttributeEachClickableGetsTheSectionItLeavesFrom(t *testing.T) {
	r := Attribute(measurement(ALL))
	eq(t, col(r.Get("clickables"), "name", "section"), J(`[["跳过导航","header"],["菜谱","header"],["开始使用","hero"],["看功能","hero"],["展开细节","feature-b"],["条款","footer"]]`))
	is(t, get(at(r.Get("clickables"), 2.0), "ref"), MKT+"#hero")
}

func TestAttributeAnElementInsideALandmarkBelongsToItWhateverItsPosition(t *testing.T) {
	// a sticky header's link measured far down the page still belongs to the header
	r := Attribute(measurement(ALL, "clickables", J(`[{"role":"link","name":"粘性导航","top":3000,"bottom":3020,"landmark":"banner"}]`)))
	is(t, get(at(r.Get("clickables"), 0.0), "section"), "header")
}

func TestAttributeASectionThatCannotBeLocatedFailsTheRun(t *testing.T) {
	lost := J(`{"id":"faq","locate":{"role":"heading","name":"常见问题"},"found":false,"reason":"页面上没有这个定位对应的元素（标题改名了？）"}`)
	r := Attribute(measurement([]any{HEADER, HERO, FEATUREA, lost, FEATUREB, FOOTER}))
	is(t, r.Get("ok"), false)
	eq(t, col(r.Get("notFound"), "id", "ref", "locate"), J(`[["faq","`+MKT+`#faq",{"role":"heading","name":"常见问题"}]]`))
	match(t, text(get(at(r.Get("notFound"), 0.0), "reason")), `标题`)
	is(t, isUndef(findBy(r.Get("ranges"), "id", "faq")), true)
}

func TestAttributeSectionsInADifferentOrderFromThePageAreReported(t *testing.T) {
	r := Attribute(measurement([]any{HEADER, FEATUREA, HERO, FEATUREB, FOOTER}))
	is(t, r.Get("ok"), false)
	if len(list(r.Get("outOfOrder"))) < 1 {
		t.Fatalf("outOfOrder is empty: %s", stringify(r.Get("outOfOrder"), 0))
	}
}

// ---------- after the trial scan ----------

func TestAttributeASeeThroughClickableIsHiddenAndAFixedOneIsPlacedWhereItFirstShowed(t *testing.T) {
	clicks := J(`[
  {"role":"button","name":"开始使用","top":500,"bottom":548,"landmark":null,"opacity":1},
  {"role":"link","name":"01 目录","top":377,"bottom":523,"landmark":null,"opacity":0,"fixed":true,"appearance":{"scrollY":1000,"top":377,"bottom":523}},
  {"role":"link","name":"一直透明","top":700,"bottom":720,"landmark":null,"opacity":0},
  {"role":"link","name":"从没出现","top":300,"bottom":320,"landmark":null,"opacity":1,"fixed":true,"appearance":null}
]`)
	r := Attribute(measurement(ALL, "clickables", clicks))
	is(t, r.Get("ok"), true, stringify(r.Get("orphans"), 0))
	eq(t, col(r.Get("clickables"), "name", "section"), J(`[["开始使用","hero"],["01 目录","feature-a"]]`))
	is(t, get(at(r.Get("clickables"), 1.0), "y"), 1450.0)
	is(t, get(at(r.Get("clickables"), 1.0), "fixed"), true)
	eq(t, col(r.Get("hidden"), "name"), J(`["一直透明","从没出现"]`))
	match(t, text(get(at(r.Get("hidden"), 0.0), "reason")), `透明度`)
	match(t, text(get(at(r.Get("hidden"), 1.0), "reason")), `固定`)
}

func TestAttributeASeeThroughClickableInsideTheBannerIsHiddenToo(t *testing.T) {
	r := Attribute(measurement(ALL, "clickables", J(`[
  {"role":"link","name":"关着的菜单项","top":50,"bottom":70,"landmark":"banner","opacity":0},
  {"role":"link","name":"固定顶栏","top":10,"bottom":40,"landmark":"banner","opacity":1,"fixed":true,"appearance":{"scrollY":0,"top":10,"bottom":40}}
]`)))
	eq(t, col(r.Get("hidden"), "name"), J(`["关着的菜单项"]`))
	eq(t, col(r.Get("clickables"), "name", "section"), J(`[["固定顶栏","header"]]`))
}

func TestAttributeTwoSectionsWhoseRangesOverlapFailLikeAnOrphan(t *testing.T) {
	// a `position` section on the block that also holds the faq heading: the heading section starts at the block top too
	pos := J(`{"id":"trust","locate":{"position":2},"found":true,"top":900,"bottom":4500,"block":1}`)
	faq := J(`{"id":"faq","locate":{"role":"heading","name":"常见问题"},"found":true,"top":1000,"bottom":1040,"block":1}`)
	r := Attribute(measurement([]any{HEADER, HERO, pos, faq, FOOTER}))
	is(t, r.Get("ok"), false)
	if len(list(r.Get("overlaps"))) != 1 {
		t.Fatalf("overlaps: %s", stringify(r.Get("overlaps"), 0))
	}
	o := at(r.Get("overlaps"), 0.0)
	eq(t, []any{get(o, "with"), get(o, "at"), get(o, "from"), get(o, "to")}, J(`["trust","faq",900,4500]`))
	match(t, text(get(o, "reason")), `重叠`)
	eq(t, get(r.Get("coverage"), "overlaps"), r.Get("overlaps"))
}

func TestAttributeAHeaderThatFloatsOverTheContentIsNotAFailure(t *testing.T) {
	floating := with(HEADER, "bottom", 160)
	r := Attribute(measurement([]any{floating, HERO, FEATUREA, FEATUREB, FOOTER}))
	is(t, r.Get("ok"), true)
	eq(t, r.Get("overlaps"), []any{})
}

func TestAttributeRoleUnresolvedClickablesAndHeadingsWithTheirFullNames(t *testing.T) {
	r := Attribute(measurement(ALL,
		"clickables", J(`[
  {"role":"button","name":"什么是模考","top":4700,"bottom":4740,"landmark":null,"byRole":false,"matches":0,"textMatches":1},
  {"role":"button","name":"开始使用","top":500,"bottom":548,"landmark":null,"byRole":true,"matches":1}
]`),
		"headings", J(`[{"level":2,"name":"读一篇，答一篇。","byRole":true,"matches":1,"top":300,"bottom":340},{"level":2,"name":"食材库同步","byRole":true,"matches":1,"top":4600,"bottom":4640}]`),
	))
	eq(t, r.Get("roleUnresolved"), J(`[{"role":"button","name":"什么是模考","section":"feature-b","textMatches":1}]`))
	eq(t, col(r.Get("headings"), "level", "name", "section"), J(`[[2,"读一篇，答一篇。","hero"],[2,"食材库同步","feature-b"]]`))
}

func TestAttributeCarriesTheShootingSettingsAndWhichStateItWasMeasuredFor(t *testing.T) {
	r := Attribute(measurement(ALL, "entry", MKTEntry, "section", "faq", "viewport", J(`{"width":1440,"height":900}`), "theme", "dark", "motion", "reduce"))
	eq(t, []any{r.Get("entry"), r.Get("section"), r.Get("viewport"), r.Get("theme"), r.Get("motion")}, J(`["`+MKTEntry+`","faq",{"width":1440,"height":900},"dark","reduce"]`))
}

func mustPick(t *testing.T, a any, only []string) Picked {
	t.Helper()
	p, err := ShootTargets(a, only)
	if err != nil {
		t.Fatal(err)
	}
	return p
}

func TestShootTargetsOnePerSectionNamedEntryAtSection(t *testing.T) {
	a := Attribute(measurement(ALL))
	all := mustPick(t, a, nil)
	eq(t, col(all.Targets, "file", "start", "end"), J(`[
  ["`+MKTEntry+`@header.png",0,100],["`+MKTEntry+`@hero.png",100,900],["`+MKTEntry+`@feature-a.png",900,4500],
  ["`+MKTEntry+`@feature-b.png",4500,5800],["`+MKTEntry+`@footer.png",5800,6000]]`))
	third := at(all.Targets, 2.0)
	is(t, num(get(third, "end"))-num(get(third, "start")), 3600.0)
	eq(t, col(mustPick(t, a, []string{"feature-b", "hero"}).Targets, "id"), J(`["hero","feature-b"]`))
	_, err := ShootTargets(a, []string{"nowhere"})
	if err == nil || !regexp.MustCompile(`nowhere.*header、hero`).MatchString(err.Error()) {
		t.Fatalf("unknown section: %v", err)
	}
	flat := with(a, "ranges", append(append([]any{}, list(a.Get("ranges"))...), J(`{"id":"tail","ref":"p#tail","start":6100,"end":6100}`)))
	eq(t, col(mustPick(t, flat, nil).Skipped, "id"), J(`["tail"]`))
}

// ---------- scroll-driven sections: a pin that holds a screen while the page scrolls under it ----------
//
// feature-a (900–4500) holds a 800-tall element pinned to the top of the screen inside a 2400-tall container (1000–3400)

var PIN = J(`{"kind":"sticky","tag":"div","label":"Step 1","height":800,"container":{"top":1000,"bottom":3400},"stuck":{"from":1000,"to":2600,"count":5},"texts":["Step 1","Step 2","Step 3"]}`).(Obj)

func declared(s Obj) Obj { return with(s, "declaredScrollDriven", true) }

func TestAttributeAPinnedElementMakesASectionScrollDriven(t *testing.T) {
	r := Attribute(measurement(ALL, "pins", []any{PIN}))
	is(t, r.Get("ok"), false)
	eq(t, col(r.Get("scrollDriven"), "id", "ref", "detected", "declared"), J(`[["feature-a","`+MKT+`#feature-a",true,false]]`))
	eq(t, col(r.Get("undeclaredScrollDriven"), "id", "ref"), J(`[["feature-a","`+MKT+`#feature-a"]]`))
	evidence := joinTexts(list(get(at(r.Get("undeclaredScrollDriven"), 0.0), "evidence")), "；")
	match(t, evidence, `position: sticky`)
	match(t, evidence, `800`, "how tall the pinned element is")
	match(t, evidence, `2400`, "how tall its container is")
	match(t, evidence, `3 种`, "the pinned text changed with the scroll")
	match(t, text(get(at(r.Get("undeclaredScrollDriven"), 0.0), "reason")), `scrollDriven: true`)
	eq(t, r.Get("orphans"), []any{})
	eq(t, r.Get("declaredNotDetected"), []any{})
}

// The evidence says what the pin is and how long it holds, never that it was taken for a pin because of its text — a
// measurement saved by an older version (a small pin with byText) still reads the same.
func TestAttributeTheEvidenceNeverSaysAPinWasTakenForOneBecauseOfItsText(t *testing.T) {
	small := with(PIN, "height", 420, "byText", true, "probes", J(`[{"y":1000,"text":"Step 1"}]`), "index", 0)
	for _, pin := range []Obj{PIN, small} {
		evidence := joinTexts(list(get(at(Attribute(measurement(ALL, "pins", []any{pin})).Get("undeclaredScrollDriven"), 0.0), "evidence")), "；")
		if regexp.MustCompile(`不到半屏|按「钉住时的文字随滚动变了」认定`).MatchString(evidence) {
			t.Errorf("evidence still names the text rule: %s", evidence)
		}
	}
}

func TestAttributeADeclaredScrollDrivenSectionPassesAndTheEvidenceIsStillGiven(t *testing.T) {
	r := Attribute(measurement([]any{HEADER, HERO, declared(FEATUREA), FEATUREB, FOOTER}, "pins", []any{PIN}))
	is(t, r.Get("ok"), true)
	eq(t, r.Get("undeclaredScrollDriven"), []any{})
	eq(t, col(r.Get("scrollDriven"), "id", "detected", "declared"), J(`[["feature-a",true,true]]`))
	if len(list(get(at(r.Get("scrollDriven"), 0.0), "evidence"))) == 0 {
		t.Fatal("no evidence")
	}
}

func TestAttributeDeclaredButNotDetectedOnlyGetsAHint(t *testing.T) {
	r := Attribute(measurement([]any{HEADER, HERO, declared(FEATUREA), FEATUREB, FOOTER}))
	is(t, r.Get("ok"), true)
	eq(t, col(r.Get("declaredNotDetected"), "id"), J(`["feature-a"]`))
	eq(t, col(r.Get("scrollDriven"), "id", "detected", "declared"), J(`[["feature-a",false,true]]`))
}

func TestAttributeAPinIsGivenToTheSectionItsContainerSitsIn(t *testing.T) {
	inFeatureB := with(PIN, "container", J(`{"top":4600,"bottom":5200}`))
	eq(t, col(Attribute(measurement(ALL, "pins", []any{inFeatureB})).Get("undeclaredScrollDriven"), "id"), J(`["feature-b"]`))
	nowhere := with(PIN, "container", J(`{"top":7000,"bottom":9400}`))
	r := Attribute(measurement(ALL, "pins", []any{nowhere}))
	is(t, r.Get("ok"), true)
	eq(t, []any{r.Get("scrollDriven"), r.Get("undeclaredScrollDriven"), r.Get("declaredNotDetected")}, J(`[[],[],[]]`))
	plainOne := Attribute(measurement(ALL))
	is(t, plainOne.Get("ok"), true)
	eq(t, []any{plainOne.Get("scrollDriven"), plainOne.Get("undeclaredScrollDriven"), plainOne.Get("declaredNotDetected")}, J(`[[],[],[]]`))
}

func TestAttributeAPinWhoseTextNeverChangedIsStillEvidence(t *testing.T) {
	r := Attribute(measurement(ALL, "pins", []any{with(PIN, "texts", J(`["Step 1"]`))}))
	is(t, r.Get("ok"), false)
	noMatch(t, joinTexts(list(get(at(r.Get("undeclaredScrollDriven"), 0.0), "evidence")), "；"), `随滚动变了`)
}

func scrollDrivenAttribution(extra ...any) Obj {
	kv := append([]any{"pins", []any{PIN}, "viewport", J(`{"width":1440,"height":900}`), "theme", "light"}, extra...)
	return Attribute(measurement([]any{HEADER, HERO, declared(FEATUREA), FEATUREB, FOOTER}, kv...))
}

func TestShootTargetsAScrollDrivenSectionIsOneScreenFromThePinsContainer(t *testing.T) {
	a := scrollDrivenAttribution()
	targets := mustPick(t, a, nil).Targets
	var rows []any
	for _, x := range targets {
		rows = append(rows, []any{get(x, "id"), get(x, "start"), get(x, "end"), strictEq(get(x, "scrollDriven"), true)})
	}
	eq(t, rows, J(`[["header",0,100,false],["hero",100,900,false],["feature-a",1000,1900,true],["feature-b",4500,5800,false],["footer",5800,6000,false]]`))
	is(t, get(findBy(targets, "id", "feature-a"), "file"), MKTEntry+"@feature-a.png")
	eq(t, col(mustPick(t, a, []string{"feature-a"}).Targets, "id"), J(`["feature-a"]`))
}

func TestShootTargetsTheScreenIsTheViewportsHeight(t *testing.T) {
	viewport := J(`{"width":1440,"height":900}`)
	a := scrollDrivenAttribution()
	is(t, get(rangeOf(a, "feature-a"), "end"), 4500.0, "the range is still the whole block")
	is(t, get(findBy(mustPick(t, a, nil).Targets, "id", "feature-a"), "end"), 1900.0)
	atTop := Attribute(measurement([]any{HEADER, HERO, declared(FEATUREA), FEATUREB, FOOTER}, "pins", []any{with(PIN, "container", J(`{"top":900,"bottom":3300}`))}, "viewport", viewport, "theme", "light"))
	eq(t, findBy(mustPick(t, atTop, nil).Targets, "id", "feature-a"), J(`{"id":"feature-a","ref":"`+MKT+`#feature-a","file":"`+MKTEntry+`@feature-a.png","start":900,"end":1800,"inScroller":false,"scrollDriven":true}`))
	noPin := Attribute(measurement([]any{HEADER, HERO, declared(FEATUREA), FEATUREB, FOOTER}, "viewport", viewport, "theme", "light"))
	is(t, get(findBy(mustPick(t, noPin, nil).Targets, "id", "feature-a"), "start"), 900.0, "declared but not detected: shot from the section's top")
	inside := Attribute(measurement([]any{HEADER, HERO, declared(FEATUREA), FEATUREB, FOOTER}, "pins", []any{PIN}, "viewport", viewport, "theme", "light", "state", MKT+"--feature-a-step-2", "entry", MKTEntry, "section", "feature-a"))
	var rows []any
	for _, x := range mustPick(t, inside, nil).Targets {
		rows = append(rows, []any{get(x, "id"), get(x, "file"), get(x, "start"), get(x, "end"), strictEq(get(x, "scrollDriven"), true)})
	}
	eq(t, rows, J(`[["feature-a","`+MKT+`--feature-a-step-2.png",900,4500,false]]`))
}

func TestBuildShootCodeAScrollDrivenTargetBringsThePageTimeWithIt(t *testing.T) {
	viewport := J(`{"width":1440,"height":900}`)
	a := scrollDrivenAttribution()
	code := BuildShootCode(O("targets", mustPick(t, a, nil).Targets, "viewport", viewport, "theme", "light", "motion", "default", "pageHeight", 6000.0, "outDir", "/tmp/shots"))
	isAsyncFunction(t, code)
	match(t, code, `"scrollDriven":true`)
	match(t, code, `clock\.install`)
	match(t, code, `reload\(\)`)
	plainTargets := mustPick(t, Attribute(measurement(ALL, "viewport", viewport, "theme", "light")), nil).Targets
	noMatch(t, BuildShootCode(O("targets", plainTargets, "viewport", viewport, "theme", "light", "motion", "default", "pageHeight", 6000.0, "outDir", "/tmp/shots")), `clock\.install|runFor`)
}

func TestCliAttributeAnUndeclaredScrollDrivenSectionIsExit1(t *testing.T) {
	dir := t.TempDir()
	bad := run("attribute", writeJSONFile(t, dir, "undeclared.json", measurement(ALL, "pins", []any{PIN})))
	is(t, bad.status, 1)
	out, _ := parseJSON(bad.stdout)
	is(t, len(list(get(out, "undeclaredScrollDriven"))), 1)
	match(t, bad.stderr, `滚动驱动`)
	match(t, bad.stderr, `feature-a`)
	match(t, bad.stderr, `scrollDriven: true`)
	ok := run("attribute", writeJSONFile(t, dir, "declared.json", measurement([]any{HEADER, HERO, declared(FEATUREA), FEATUREB, FOOTER}, "pins", []any{PIN})))
	is(t, ok.status, 0, ok.stderr)
	hint := run("attribute", writeJSONFile(t, dir, "hint.json", measurement([]any{HEADER, HERO, declared(FEATUREA), FEATUREB, FOOTER})))
	is(t, hint.status, 0, hint.stderr)
	match(t, hint.stderr, `feature-a`)
	match(t, hint.stderr, `没检出`)
}

func TestCliMeasureScrollDrivenOnASectionIsPassedToTheCode(t *testing.T) {
	files := fixture.Marketing()
	entry := fixture.MKTEntryFile
	files[entry] = strings.Replace(files[entry], "  - { id: feature-a, locate: { role: heading, name: 无限菜谱 } }", "  - { id: feature-a, locate: { role: heading, name: 无限菜谱 }, scrollDriven: true }", 1)
	r := run("measure", repo(t, files), MKTEntry)
	is(t, r.status, 0, r.stderr)
	match(t, r.stdout, `"id":"feature-a","locate":\{"role":"heading","name":"无限菜谱"\},"scrollDriven":true`)
	noMatch(t, r.stdout, `"id":"hero","locate":\{[^}]*\},"scrollDriven"`)
	root := repo(t, fixture.Marketing())
	given := run("measure", root, "--state", MKTEntry, "--page", MKT, "--sections", `[{"id":"hero","locate":{"position":1},"scrollDriven":true}]`)
	is(t, given.status, 0, given.stderr)
	match(t, given.stdout, `"scrollDriven":true`)
	wrong := run("measure", root, "--state", MKTEntry, "--page", MKT, "--sections", `[{"id":"hero","locate":{"position":1},"scrollDriven":"yes"}]`)
	is(t, wrong.status, 2)
	match(t, wrong.stderr, `scrollDriven.*true`)
}

var SHELLSCROLLER = J(`{"kind":"element","selector":"body > div:nth-child(1) > main:nth-child(2)","tag":"main","top":60,"left":0,"width":800,"contentHeight":2100,"visibleHeight":540,"others":[]}`).(Obj)

func TestAttributeCarriesTheScrollContainerItWasMeasuredWith(t *testing.T) {
	eq(t, Attribute(measurement(ALL, "scroller", SHELLSCROLLER)).Get("scroller"), SHELLSCROLLER)
	is(t, Attribute(measurement(ALL)).Get("scroller"), nil)
}

func TestShootTargetsHandsTheScrollContainerOn(t *testing.T) {
	a := Attribute(with(J(`{
  "state":"app-home--entry","page":"app-home","pageSize":{"width":800,"height":2160},
  "blocks":[{"top":60,"bottom":760},{"top":760,"bottom":1660},{"top":1660,"bottom":2160}],"contentinfo":null,"clickables":[],
  "sections":[
    {"id":"header","locate":{"role":"banner"},"found":true,"top":0,"bottom":60,"block":-1},
    {"id":"hero","locate":{"role":"heading","name":"A"},"found":true,"top":80,"bottom":120,"block":0},
    {"id":"list","locate":{"role":"heading","name":"B"},"found":true,"top":800,"bottom":840,"block":1},
    {"id":"form","locate":{"role":"heading","name":"C"},"found":true,"top":1700,"bottom":1740,"block":2}
  ]}`), "scroller", SHELLSCROLLER))
	picked := mustPick(t, a, nil)
	eq(t, picked.Scroller, SHELLSCROLLER)
	eq(t, col(picked.Targets, "id", "start", "end", "inScroller"), J(`[["header",0,60,false],["hero",60,760,true],["list",760,1660,true],["form",1660,2160,true]]`))
	doc := mustPick(t, Attribute(measurement(ALL, "scroller", J(`{"kind":"document","selector":null,"top":0,"contentHeight":6000,"visibleHeight":900}`))), nil)
	for _, x := range doc.Targets {
		is(t, get(x, "inScroller"), false, "a scrolling document is shot as before: page shots")
	}
	is(t, mustPick(t, Attribute(measurement(ALL)), nil).Scroller, nil)
}

func TestBuildShootCodeTheScrollContainerIsInTheCodeAndOnlyWhenThereIsOne(t *testing.T) {
	p := mustPick(t, Attribute(measurement(ALL, "scroller", SHELLSCROLLER)), nil)
	code := BuildShootCode(O("targets", p.Targets, "scroller", p.Scroller, "viewport", J(`{"width":800,"height":600}`), "theme", "light", "motion", "default", "pageHeight", 6000.0, "outDir", "/tmp/shots"))
	isAsyncFunction(t, code)
	if !strings.Contains(code, stringify(SHELLSCROLLER.Get("selector"), 0)) {
		t.Fatal("the selector the measurement found is not in the code")
	}
	match(t, code, `"inScroller":false`)
	plainCode := BuildShootCode(O("targets", p.Targets, "viewport", J(`{"width":800,"height":600}`), "theme", "light", "motion", "default", "pageHeight", 6000.0, "outDir", "/tmp/shots"))
	match(t, plainCode, `"scroller":null`)
}

func TestShootTargetsForAStateInsideASectionItIsTheOneSectionNamedAfterTheState(t *testing.T) {
	a := Attribute(measurement(ALL, "state", MKT+"--feature-b-expanded", "entry", MKTEntry, "section", "feature-b"))
	eq(t, col(mustPick(t, a, nil).Targets, "id", "file", "start", "end"), J(`[["feature-b","`+MKT+`--feature-b-expanded.png",4500,5800]]`))
	_, err := ShootTargets(with(a, "section", nil), nil)
	if err == nil || !strings.Contains(err.Error(), "在哪一段") {
		t.Fatalf("a state with no section: %v", err)
	}
}

func TestBuildShootCodeASingleAsyncFunctionOfPage(t *testing.T) {
	targets := mustPick(t, Attribute(measurement(ALL)), nil).Targets
	code := BuildShootCode(O("targets", targets, "viewport", J(`{"width":1440,"height":900}`), "theme", "light", "motion", "default", "pageHeight", 6000.0, "outDir", "/tmp/shots"))
	isAsyncFunction(t, code)
	match(t, code, `fullPage: true`)
	match(t, code, `/tmp/shots`)
	match(t, code, regexp.QuoteMeta(MKTEntry)+`@feature-a\.png`)
	noMatch(t, code, `pauseAt|resume\(|runFor|clock\.install`, "shoot does not freeze, resume or step the page clock")
	noMatch(t, code, `animations: 'disabled'`, "a shot that fast-forwards CSS animations to their end flips a carousel away")
	match(t, code, `uncontrolled`)
	noMatch(t, code, `\bstable\b`, "`stable` is replaced by `uncontrolled`")
	noMatch(t, code, `(?m)^\s*//`, "full-line comments are not sent to the tool")
}

func TestScreenTargetsAStateWithNoSectionsIsOneSectionTheMainViewport(t *testing.T) {
	vp := J(`{"width":1440,"height":900}`)
	st, err := ScreenTargets(MKT+"--entry", vp)
	if err != nil {
		t.Fatal(err)
	}
	eq(t, st.Get("targets"), J(`[{"id":"`+MKT+`--entry","ref":"`+MKT+`--entry","file":"`+MKT+`--entry.png","start":0,"end":900,"inScroller":false}]`))
	eq(t, st.Get("skipped"), []any{})
	is(t, st.Get("scroller"), nil)
	is(t, st.Get("pageHeight"), 900.0)
	one := J(`{"width":1,"height":1}`)
	for _, bad := range [][2]any{{"", one}, {"a/b", one}, {".x", one}, {"x", J(`{"width":1,"height":0}`)}, {"x", Undefined}} {
		_, err := ScreenTargets(bad[0], bad[1])
		if err == nil || !regexp.MustCompile(`状态|视口`).MatchString(err.Error()) {
			t.Fatalf("%v: %v", bad, err)
		}
	}
}

func TestBuildScreenCodeTheSameCodeShootRuns(t *testing.T) {
	code, err := BuildScreenCode(O("state", MKT+"--entry", "viewport", J(`{"width":1440,"height":900}`), "theme", "light", "motion", "default", "outDir", "/tmp/shots"))
	if err != nil {
		t.Fatal(err)
	}
	isAsyncFunction(t, code)
	match(t, code, regexp.QuoteMeta(MKT)+`--entry\.png`)
	match(t, code, `/tmp/shots`)
	match(t, code, `"pageHeight":900`)
	match(t, code, `fullPage: true`)
	match(t, code, `uncontrolled`)
	noMatch(t, code, `pauseAt|resume\(|runFor|clock\.install`, "it does not freeze, resume or step the page clock")
	noMatch(t, code, `animations: 'disabled'`)
	noMatch(t, code, `animation: none`, "no style that switches animations off is put into the page")
	noMatch(t, code, `(?m)^\s*//`, "full-line comments are not sent to the tool")
}

func TestCliAttributePrintsTheResultAsJSON(t *testing.T) {
	dir := t.TempDir()
	good := run("attribute", writeJSONFile(t, dir, "good.json", measurement(ALL)))
	is(t, good.status, 0, good.stderr)
	out, _ := parseJSON(good.stdout)
	is(t, get(out, "ok"), true)
	orphaned := run("attribute", writeJSONFile(t, dir, "orphans.json", measurement([]any{HERO, FEATUREA, FEATUREB})))
	is(t, orphaned.status, 1)
	out, _ = parseJSON(orphaned.stdout)
	is(t, len(list(get(out, "orphans"))), 3)
	match(t, orphaned.stderr, `落空 3`)
	lost := run("attribute", writeJSONFile(t, dir, "lost.json", measurement([]any{HEADER, J(`{"id":"faq","locate":{"role":"heading","name":"x"},"found":false}`), FOOTER})))
	is(t, lost.status, 1)
	match(t, lost.stderr, `定位失败 1`)
	is(t, run("attribute").status, 2)
	is(t, run("attribute", filepath.Join(dir, "nope.json")).status, 2)
	writeFile(t, dir, "junk.json", "{ not json")
	is(t, run("attribute", filepath.Join(dir, "junk.json")).status, 2)
}

// ---------- measure: the code handed to Playwright ----------

var SECTIONS = J(`[{"id":"hero","locate":{"role":"heading","name":"一个价格"}},{"id":"footer","locate":{"role":"contentinfo"}},{"id":"feature-b","locate":{"position":3}}]`)

func TestBuildMeasureCodeASingleAsyncFunctionOfPage(t *testing.T) {
	code := BuildMeasureCode(O("state", "p--entry", "page", "p", "sections", SECTIONS, "viewport", J(`{"width":1440,"height":900}`), "theme", "light", "motion", "default"))
	isAsyncFunction(t, code)
	match(t, code, `"id":"hero"`)
	match(t, code, `"viewport":\{"width":1440,"height":900\}`)
	match(t, code, `"theme":"light"`)
	match(t, code, `"motion":"default"`)
	if !strings.Contains(code, `getByRole('heading', { name: sec.locate.name, exact: true })`) {
		t.Fatal("the heading locate is not in the code")
	}
	match(t, code, `scrollTo`)
	match(t, code, `display === 'contents'`, "a wrapper that takes no room is looked through")
	match(t, code, `clock\.install`)
	match(t, code, `window\.__dsMeasure`, "the result stays in the page, where browser_evaluate can save it")
	noMatch(t, code, `fullPage`, "measuring takes no picture any more; each section is shot by itself")
	noMatch(t, code, `(?m)^\s*//`, "full-line comments are not sent to the tool")
}

func TestBuildMeasureCodeAnEntryStateMayReloadAndAStateReachedByInteractingMustNot(t *testing.T) {
	base := O("sections", SECTIONS, "viewport", J(`{"width":1440,"height":900}`), "theme", "light")
	match(t, BuildMeasureCode(base), `"reload":true`)
	match(t, BuildMeasureCode(with(base, "reload", false)), `"reload":false`)
}

func TestBuildMeasureCodeReducedMotionIsOnlyAskedForWhenTheSettingsSayso(t *testing.T) {
	base := O("sections", SECTIONS, "viewport", J(`{"width":1440,"height":900}`), "theme", "dark")
	match(t, BuildMeasureCode(with(base, "motion", "reduce")), `"motion":"reduce"`)
	match(t, BuildMeasureCode(base), `"motion":"default"`)
}

func TestBuildTimeCodeStopsThePageClockAndTheCSSAnimationTimeline(t *testing.T) {
	code := BuildTimeCode(O("viewport", J(`{"width":1440,"height":900}`), "theme", "dark", "motion", "default"))
	isAsyncFunction(t, code)
	match(t, code, `"viewport":\{"width":1440,"height":900\}`)
	match(t, code, `"theme":"dark"`)
	match(t, code, `clock\.install`)
	match(t, code, `pauseAt`)
	match(t, code, `Animation\.setPlaybackRate`)
	match(t, code, `playbackRate: 0`)
	match(t, code, `reload\(\)`)
	match(t, code, `runFor`)
	noMatch(t, code, `(?m)^\s*//`, "full-line comments are not sent to the tool")
	match(t, BuildTimeCode(O("viewport", J(`{"width":1,"height":1}`), "theme", "light", "motion", "reduce")), `"motion":"reduce"`)
}

func TestBuildStepCodeStepsThePageTimeByTheGivenMilliseconds(t *testing.T) {
	code, err := BuildStepCode(500.0)
	if err != nil {
		t.Fatal(err)
	}
	isAsyncFunction(t, code)
	match(t, code, `"ms":500`)
	match(t, code, `runFor`)
	for _, bad := range []any{0.0, -5.0, 1.5, math.NaN(), "200", 120000.0} {
		_, err := BuildStepCode(bad)
		if err == nil || !strings.Contains(err.Error(), "毫秒") {
			t.Fatalf("%v: %v", bad, err)
		}
	}
}

// ---------- the command line: measure ----------

func withIndex(extra string) fixture.Files {
	files := fixture.Marketing()
	idx := BASE + "/index.md"
	files[idx] = strings.Replace(files[idx], "locale: zh-CN", "locale: zh-CN"+extra, 1)
	return files
}

func TestCliMeasureTakesTheSectionsFromTheEntryStateAndTheSettingsFromTheIndex(t *testing.T) {
	r := run("measure", repo(t, fixture.Marketing()), MKTEntry)
	is(t, r.status, 0, r.stderr)
	code := r.stdout
	isAsyncFunction(t, code)
	for _, id := range []string{"header", "hero", "feature-a", "feature-b", "footer"} {
		match(t, code, `"id":"`+id+`"`)
	}
	match(t, code, `"viewport":\{"width":1440,"height":900\}`)
	match(t, code, `"theme":"light"`)
	match(t, code, `"motion":"default"`, "the plugin default when index.md has no motion")
	match(t, code, `"page":"`+MKT+`"`)
	match(t, r.stderr, `5 段`)
	match(t, r.stderr, `zh-CN`)
}

func TestCliMeasureMotionInTheIndexAndFlagsOverride(t *testing.T) {
	root := repo(t, withIndex("\nmotion: reduce"))
	match(t, run("measure", root, MKTEntry).stdout, `"motion":"reduce"`)
	flagged := run("measure", root, MKTEntry, "--motion", "default", "--viewport", "1280x800", "--theme", "dark")
	match(t, flagged.stdout, `"motion":"default"`)
	match(t, flagged.stdout, `"viewport":\{"width":1280,"height":800\}`)
	match(t, flagged.stdout, `"theme":"dark"`)
}

func TestCliMeasureBeforeTheStateIsInTheArchiveTheSectionsComeFromTheCommandLine(t *testing.T) {
	root := repo(t, fixture.Compliant())
	list := `[{"id":"hero","locate":{"role":"heading","name":"标语"}},{"id":"footer","locate":{"role":"contentinfo"}}]`
	r := run("measure", root, "--state", "mkt-home--entry", "--page", "mkt-home", "--sections", list)
	is(t, r.status, 0, r.stderr)
	match(t, r.stdout, `"state":"mkt-home--entry"`)
	match(t, r.stdout, `"id":"hero"`)
	file := writeFile(t, t.TempDir(), "sections.json", list)
	is(t, run("measure", root, "--state", "mkt-home--entry", "--page", "mkt-home", "--sections-file", file).status, 0)
}

func TestCliMeasureTheSettingsMissingFromTheIndexAreAnError(t *testing.T) {
	files := fixture.Marketing()
	files[BASE+"/index.md"] = strings.Replace(files[BASE+"/index.md"], "viewport: 1440x900\n", "", 1)
	r := run("measure", repo(t, files), MKTEntry)
	is(t, r.status, 2)
	match(t, r.stderr, `viewport`)
	is(t, run("measure", repo(t, files), MKTEntry, "--viewport", "1440x900").status, 0)
}

func TestCliMeasureUsageErrorsExit2AndSayWhy(t *testing.T) {
	root := repo(t, fixture.Marketing())
	cases := []struct {
		args    []string
		pattern string
	}{
		{[]string{"measure"}, `仓库根`},
		{[]string{"measure", root}, `入口状态`},
		{[]string{"measure", root, "nope--entry"}, `没有状态`},
		{[]string{"measure", root, "cookbook--list"}, `没有 sections`},
		{[]string{"measure", root, "cookbook--search-loading"}, `不是入口状态`},
		{[]string{"measure", root, MKTEntry, "--bogus", "x"}, `不认识的选项`},
		{[]string{"measure", root, MKTEntry, "--theme", "sepia"}, `主题`},
		{[]string{"measure", root, MKTEntry, "--motion", "fast"}, `motion`},
		{[]string{"measure", root, MKTEntry, "--delta", "no-such-spec"}, `设计差异`},
		{[]string{"measure", root, "--state", "x--entry", "--sections", "{}"}, `非空的 JSON 数组`},
		{[]string{"measure", root, "--state", "x--entry", "--sections", `[{"id":"hero","locate":{"role":"link","name":"x"}}]`}, `locate`},
		{[]string{"measure", root, "--state", "x--entry", "--sections", "[not json"}, `不是 JSON`},
		{[]string{"galaxy"}, `子命令`},
		{[]string{}, `子命令`},
	}
	for _, c := range cases {
		r := run(c.args...)
		is(t, r.status, 2, strings.Join(c.args, " "))
		match(t, r.stderr, c.pattern, strings.Join(c.args, " "))
	}
	bare := run("measure", repo(t, fixture.Files{"README.md": "x"}), "a--entry")
	is(t, bare.status, 2)
	match(t, bare.stderr, `不是目标仓库的根`)
}

func TestCliMeasureWithDeltaTheSectionsComeFromTheRequirementsDelta(t *testing.T) {
	files := fixture.Marketing()
	entry := BASE + "/pages/" + MKT + "/" + MKTEntry + ".md"
	d := strings.Replace(files[entry], "  - { id: footer, locate: { role: contentinfo } }", "  - { id: faq, locate: { role: heading, name: 常见问题 } }\n  - { id: footer, locate: { role: contentinfo } }", 1)
	d = strings.Replace(d, "from: mkt-pricing#footer", "from: mkt-pricing#faq", 1)
	files["docs/design/tmp/demo-spec/delta/pages/"+MKT+"/"+MKTEntry+".md"] = d
	root := repo(t, files)
	noMatch(t, run("measure", root, MKTEntry).stdout, `"id":"faq"`)
	match(t, run("measure", root, MKTEntry, "--delta", "demo-spec").stdout, `"id":"faq"`)
	if _, err := os.Stat(root); err != nil {
		t.Fatal(err)
	}
}

func TestCliTimePrintsTheCodeThatStartsThePageTime(t *testing.T) {
	root := repo(t, fixture.Marketing())
	r := run("time", root)
	is(t, r.status, 0, r.stderr)
	isAsyncFunction(t, r.stdout)
	match(t, r.stdout, `"viewport":\{"width":1440,"height":900\}`)
	match(t, r.stdout, `"theme":"light"`)
	match(t, r.stderr, `browser_navigate`, "says when to run it: after navigating to the entry, before any interaction")
	flagged := run("time", root, "--viewport", "1280x800", "--theme", "dark", "--motion", "reduce")
	match(t, flagged.stdout, `"viewport":\{"width":1280,"height":800\}`)
	match(t, flagged.stdout, `"motion":"reduce"`)
	files := fixture.Marketing()
	files[BASE+"/index.md"] = strings.Replace(files[BASE+"/index.md"], "viewport: 1440x900\n", "", 1)
	bare := run("time", repo(t, files))
	is(t, bare.status, 2)
	match(t, bare.stderr, `viewport`)
	is(t, run("time", repo(t, files), "--viewport", "1440x900").status, 0)
	is(t, run("time").status, 2)
	is(t, run("time", root, "--bogus", "x").status, 2)
	is(t, run("time", repo(t, fixture.Files{"README.md": "x"})).status, 2)
}

func TestCliStepPrintsTheCodeThatMovesThePageTimeOn(t *testing.T) {
	r := run("step", "400")
	is(t, r.status, 0, r.stderr)
	isAsyncFunction(t, r.stdout)
	match(t, r.stdout, `"ms":400`)
	for _, args := range [][]string{{}, {"0"}, {"-3"}, {"1.5"}, {"abc"}, {"400", "500"}, {"400", "--ms", "5"}} {
		bad := run(append([]string{"step"}, args...)...)
		is(t, bad.status, 2, strings.Join(args, " "))
		match(t, bad.stderr, `毫秒|不认识`, strings.Join(args, " "))
	}
}

func TestCliMeasureForAStateInsideASection(t *testing.T) {
	root := repo(t, fixture.Marketing())
	r := run("measure", root, MKTEntry, "--for", MKT+"--feature-b-expanded")
	is(t, r.status, 0, r.stderr)
	match(t, r.stdout, `"state":"`+MKT+`--feature-b-expanded"`)
	match(t, r.stdout, `"entry":"`+MKTEntry+`"`)
	match(t, r.stdout, `"section":"feature-b"`)
	match(t, r.stdout, `"reload":false`)
	match(t, r.stderr, `不重载`)
	// a state the archive does not have yet (first scan) needs --section
	first := run("measure", root, MKTEntry, "--for", MKT+"--hero-menu")
	is(t, first.status, 2)
	match(t, first.stderr, `--section`)
	given := run("measure", root, MKTEntry, "--for", MKT+"--hero-menu", "--section", "hero")
	is(t, given.status, 0, given.stderr)
	match(t, given.stdout, `"section":"hero"`)
	is(t, run("measure", root, MKTEntry, "--for", "x--y", "--section", "nowhere").status, 2)
	is(t, run("measure", root, MKTEntry, "--section", "hero").status, 2, "--section alone means nothing")
}

// ---------- the command line: shoot ----------

func attributionFile(t *testing.T, overrides ...any) string {
	t.Helper()
	a := Attribute(measurement(ALL, "viewport", J(`{"width":1440,"height":900}`), "theme", "light", "motion", "default"))
	for i := 0; i+1 < len(overrides); i += 2 {
		a.Set(overrides[i].(string), overrides[i+1])
	}
	return writeJSONFile(t, t.TempDir(), "attribution.json", a)
}

func TestCliShootPrintsTheCodeForEverySectionOrOnlyTheSectionOnes(t *testing.T) {
	out := filepath.Join(t.TempDir(), "shots")
	all := run("shoot", attributionFile(t), "--out", out)
	is(t, all.status, 0, all.stderr)
	isAsyncFunction(t, all.stdout)
	for _, id := range []string{"header", "hero", "feature-a", "feature-b", "footer"} {
		match(t, all.stdout, regexp.QuoteMeta(MKTEntry)+`@`+id+`\.png`)
	}
	match(t, all.stdout, `"viewport":\{"width":1440,"height":900\}`)
	if !strings.Contains(all.stdout, stringify(out, 0)) {
		t.Fatal("the output directory is not written into the code")
	}
	match(t, all.stderr, `5 张`)
	only := run("shoot", attributionFile(t), "--out", out, "--section", "hero,footer")
	is(t, only.status, 0, only.stderr)
	noMatch(t, only.stdout, `@feature-a`)
	match(t, only.stderr, `2 张`)
}

func TestCliShootIncludeIsPassedOnAsALocator(t *testing.T) {
	out := filepath.Join(t.TempDir(), "shots")
	ok := run("shoot", attributionFile(t), "--out", out, "--section", "header", "--include", `{"role":"menu","name":"产品"}`)
	is(t, ok.status, 0, ok.stderr)
	match(t, ok.stdout, `"include":\{"role":"menu","name":"产品"\}`)
	is(t, run("shoot", attributionFile(t), "--out", out, "--include", `{"color":"red"}`).status, 2)
	is(t, run("shoot", attributionFile(t), "--out", out, "--include", "menu").status, 2)
}

func TestCliShootUsageErrorsExit2AndSayWhy(t *testing.T) {
	out := filepath.Join(t.TempDir(), "shots")
	good := attributionFile(t)
	cases := []struct {
		args    []string
		pattern string
	}{
		{[]string{"shoot"}, `归属结果`},
		{[]string{"shoot", good}, `--out`},
		{[]string{"shoot", filepath.Join(t.TempDir(), "nope.json"), "--out", out}, `读不出来`},
		{[]string{"shoot", good, "--out", out, "--section", "nowhere"}, `nowhere`},
		{[]string{"shoot", attributionFile(t, "ok", false), "--out", out}, `没通过`},
		{[]string{"shoot", attributionFile(t, "viewport", nil), "--out", out}, `viewport`},
		{[]string{"shoot", attributionFile(t, "ranges", Undefined), "--out", out}, `ranges`},
		{[]string{"shoot", good, "--out", out, "--bogus", "x"}, `不认识的选项`},
	}
	for _, c := range cases {
		r := run(c.args...)
		is(t, r.status, 2, strings.Join(c.args, " "))
		match(t, r.stderr, c.pattern, strings.Join(c.args, " "))
	}
}

func TestCliShootAnAttributionForAStateInsideASectionShootsThatSectionOnly(t *testing.T) {
	f := attributionFile(t, "state", MKT+"--feature-b-expanded", "entry", MKTEntry, "section", "feature-b")
	r := run("shoot", f, "--out", filepath.Join(t.TempDir(), "shots"))
	is(t, r.status, 0, r.stderr)
	match(t, r.stdout, regexp.QuoteMeta(MKT)+`--feature-b-expanded\.png`)
	noMatch(t, r.stdout, `@hero`)
	match(t, r.stderr, `1 张`)
}

func TestCliShootAnAttributionThatFailedBecauseOfAnUndeclaredScrollDrivenSectionIsRefused(t *testing.T) {
	f := attributionFile(t, "ok", false, "undeclaredScrollDriven", J(`[{"id":"feature-a","ref":"`+MKT+`#feature-a","evidence":[],"reason":"x"}]`))
	r := run("shoot", f, "--out", filepath.Join(t.TempDir(), "shots"))
	is(t, r.status, 2)
	match(t, r.stderr, `滚动驱动`)
}

func TestCliShootAScrollDrivenSectionGoesIntoThePrintedCodeAsScrollDriven(t *testing.T) {
	f := writeJSONFile(t, t.TempDir(), "driven-attribution.json", Attribute(measurement([]any{HEADER, HERO, declared(FEATUREA), FEATUREB, FOOTER}, "pins", []any{PIN}, "viewport", J(`{"width":1440,"height":900}`), "theme", "light", "motion", "default")))
	r := run("shoot", f, "--out", filepath.Join(t.TempDir(), "shots"))
	is(t, r.status, 0, r.stderr)
	m := regexp.MustCompile(`"targets":(\[.*?\]),"viewport"`).FindStringSubmatch(r.stdout)
	if m == nil {
		t.Fatal("no targets in the code")
	}
	var rows []any
	for _, x := range list(J(m[1])) {
		rows = append(rows, []any{get(x, "id"), strictEq(get(x, "scrollDriven"), true)})
	}
	eq(t, rows, J(`[["header",false],["hero",false],["feature-a",true],["feature-b",false],["footer",false]]`))
}

// ---------- pinned: the screen a scroll-driven section holds, shot where the page stands ----------

func TestBuildPinnedCodeShootsTheViewportAsItStands(t *testing.T) {
	code := BuildPinnedCode(O("state", MKT+"--feature-a-step-2", "viewport", J(`{"width":1440,"height":900}`), "theme", "light", "motion", "default", "outDir", "/tmp/shots"))
	isAsyncFunction(t, code)
	match(t, code, regexp.QuoteMeta(MKT)+`--feature-a-step-2\.png`)
	match(t, code, `uncontrolled`)
	noMatch(t, code, `pauseAt|runFor|clock\.install|scrollTo|animations: 'disabled'`)
	noMatch(t, code, `(?m)^\s*//`, "full-line comments are not sent to the tool")
}

func TestCliPinnedPrintsTheCodeAndSaysWhichFileItWillWrite(t *testing.T) {
	root := repo(t, fixture.Marketing())
	out := filepath.Join(t.TempDir(), "shots")
	r := run("pinned", root, MKT+"--feature-a-step-2", "--out", out)
	is(t, r.status, 0, r.stderr)
	isAsyncFunction(t, r.stdout)
	match(t, r.stdout, `"viewport":\{"width":\d+,"height":\d+\}`)
	if !strings.Contains(r.stdout, stringify(out, 0)) {
		t.Fatal("the output directory is not in the code")
	}
	match(t, r.stderr, regexp.QuoteMeta(MKT)+`--feature-a-step-2\.png`)
	flags := run("pinned", root, "x--y", "--out", out, "--viewport", "800x600", "--theme", "dark")
	match(t, flags.stdout, `"viewport":\{"width":800,"height":600\}`)
	match(t, flags.stdout, `"theme":"dark"`)
	cases := []struct {
		args    []string
		pattern string
	}{
		{[]string{"pinned"}, `仓库根`},
		{[]string{"pinned", root}, `状态`},
		{[]string{"pinned", root, "x--y"}, `--out`},
		{[]string{"pinned", root, "x--y", "--out", out, "--bogus", "1"}, `不认识的选项`},
		{[]string{"pinned", root, "x--y", "z", "--out", out}, `多出`},
		{[]string{"pinned", t.TempDir(), "x--y", "--out", out}, `docs`},
	}
	for _, c := range cases {
		e := run(c.args...)
		is(t, e.status, 2, strings.Join(c.args, " "))
		match(t, e.stderr, c.pattern, strings.Join(c.args, " "))
	}
}

// ---------- the command line: screen ----------

func TestCliScreenPrintsTheCodeThatShootsAStateWithNoSectionsAsOneScreen(t *testing.T) {
	root := repo(t, fixture.Marketing())
	out := filepath.Join(t.TempDir(), "shots")
	r := run("screen", root, "s-login--entry", "--out", out)
	is(t, r.status, 0, r.stderr)
	isAsyncFunction(t, r.stdout)
	match(t, r.stdout, `s-login--entry\.png`)
	match(t, r.stdout, `"viewport":\{"width":1440,"height":900\}`)
	match(t, r.stdout, `"theme":"light"`)
	match(t, r.stdout, `"pageHeight":900`)
	if !strings.Contains(r.stdout, stringify(out, 0)) {
		t.Fatal("the output directory is not written into the code")
	}
	match(t, r.stderr, `1 张`)
	match(t, r.stderr, `装时间|time`, "says the page time has to be started first")
	flagged := run("screen", root, "s-login--entry", "--out", out, "--viewport", "390x844", "--theme", "dark", "--motion", "reduce")
	match(t, flagged.stdout, `"viewport":\{"width":390,"height":844\}`)
	match(t, flagged.stdout, `"pageHeight":844`)
	match(t, flagged.stdout, `"motion":"reduce"`)
}

func TestCliScreenUsageErrorsExit2AndSayWhy(t *testing.T) {
	root := repo(t, fixture.Marketing())
	out := filepath.Join(t.TempDir(), "shots")
	files := fixture.Marketing()
	files[BASE+"/index.md"] = strings.Replace(files[BASE+"/index.md"], "viewport: 1440x900\n", "", 1)
	noViewport := repo(t, files)
	cases := []struct {
		args    []string
		pattern string
	}{
		{[]string{"screen"}, `仓库根`},
		{[]string{"screen", root}, `状态 id`},
		{[]string{"screen", root, "s-login--entry"}, `--out`},
		{[]string{"screen", root, "s-login--entry", "extra", "--out", out}, `多出`},
		{[]string{"screen", root, "a/b", "--out", out}, `状态`},
		{[]string{"screen", noViewport, "s-login--entry", "--out", out}, `viewport`},
		{[]string{"screen", root, "s-login--entry", "--out", out, "--bogus", "x"}, `不认识的选项`},
		{[]string{"screen", repo(t, fixture.Files{"README.md": "x"}), "s-login--entry", "--out", out}, `docs`},
	}
	for _, c := range cases {
		r := run(c.args...)
		is(t, r.status, 2, strings.Join(c.args, " "))
		match(t, r.stderr, c.pattern, strings.Join(c.args, " "))
	}
	is(t, run("screen", noViewport, "s-login--entry", "--out", out, "--viewport", "1440x900").status, 0)
}

// ---------- cover: the components below the first screen, shot a screen at a time ----------

func comp(id string, top float64, height ...float64) Obj {
	h := 40.0
	if len(height) > 0 {
		h = height[0]
	}
	return O("id", id, "top", top, "bottom", top+h)
}

func covers(t *testing.T, state string, components []any, viewportHeight, pageHeight float64) Obj {
	t.Helper()
	r, err := CoverScreens(O("state", state, "components", components, "viewportHeight", viewportHeight, "pageHeight", pageHeight))
	if err != nil {
		t.Fatal(err)
	}
	return r
}

func TestCoverScreensGroupedFromTheTopDown(t *testing.T) {
	components := []any{comp("a", 1200), comp("b", 1500), comp("c", 3300), comp("d", 3350)}
	tall := covers(t, "report--loaded", components, 900, 5000)
	eq(t, tall.Get("screens"), J(`[
  {"id":"a","file":"report--loaded@a.png","start":975,"end":1875,"edges":["a","b"]},
  {"id":"c","file":"report--loaded@c.png","start":3075,"end":3975,"edges":["c","d"]}]`))
	eq(t, tall.Get("shot"), J(`{"a":"report--loaded@a.png","b":"report--loaded@a.png","c":"report--loaded@c.png","d":"report--loaded@c.png"}`))
	eq(t, tall.Get("inViewport"), []any{})
	short := covers(t, "report--loaded", components, 900, 3500)
	eq(t, col(short.Get("screens"), "start", "end", "edges"), J(`[[975,1875,["a","b"]],[2600,3500,["c","d"]]]`))
}

func TestCoverScreensAComponentThatDoesNotFitStartsTheNextOne(t *testing.T) {
	r := covers(t, "s", []any{comp("late", 1800), comp("first", 1200), comp("mid", 1700)}, 900, 9000)
	// the screen of `first` is 975–1875: `mid` (1700–1740) fits, `late` (1800–1840) fits too
	eq(t, col(r.Get("screens"), "id", "start", "edges"), J(`[["first",975,["first","mid","late"]]]`))
	wide := covers(t, "s", []any{comp("x", 1200), comp("y", 1850)}, 900, 9000)
	eq(t, col(wide.Get("screens"), "id", "start", "edges"), J(`[["x",975,["x"]],["y",1625,["y"]]]`), "y ends at 1890, past the end of the first screen (1875)")
}

func TestCoverScreensAComponentWholeInsideTheMainViewportIsNotShotAgain(t *testing.T) {
	none := covers(t, "s", []any{comp("a", 100), comp("b", 860)}, 900, 3000)
	eq(t, none, J(`{"screens":[],"shot":{},"inViewport":["a","b"]}`))
	half := covers(t, "s", []any{comp("in", 100), comp("half", 880)}, 900, 3000)
	eq(t, half.Get("inViewport"), J(`["in"]`))
	eq(t, half.Get("shot"), J(`{"half":"s@half.png"}`))
	is(t, get(at(half.Get("screens"), 0.0), "start"), 655.0)
}

func TestCoverScreensAComponentTheBarOrTheContainersFootHidesIsShot(t *testing.T) {
	// viewport 600: a bar pinned at 540 and a container whose visible foot is at 540 (`visibleBottom`) hide 530–570; the bar's own button (550–590) is not hidden by it
	components := []any{
		with(comp("shown", 20), "visibleBottom", 540), with(comp("hidden", 530), "visibleBottom", 540), with(comp("exact", 500), "visibleBottom", 540),
		with(comp("tab", 550), "visibleBottom", 600), comp("free", 300),
	}
	r := covers(t, "s", components, 600, 3000)
	eq(t, r.Get("inViewport"), J(`["shown","exact","tab","free"]`))
	eq(t, r.Get("shot"), J(`{"hidden":"s@hidden.png"}`))
	eq(t, col(r.Get("screens"), "start", "end"), J(`[[380,980]]`))
	// a `visibleBottom` below the viewport's height does not widen it; without one the viewport's height is the limit as before
	below := covers(t, "s", []any{with(comp("a", 590), "visibleBottom", 900), comp("b", 590)}, 600, 3000)
	eq(t, below.Get("inViewport"), []any{})
	eq(t, below.Get("shot").(Obj).Keys(), []any{"a", "b"})
}

func TestCoverScreensTheFirstScreenNeverStartsAboveTheTopOfThePage(t *testing.T) {
	near := covers(t, "s", []any{comp("a", 950)}, 900, 3000)
	is(t, get(at(near.Get("screens"), 0.0), "start"), 725.0)
	high := covers(t, "s", []any{comp("a", 905, 600)}, 400, 3000)
	eq(t, col(high.Get("screens"), "start", "end"), J(`[[805,1205]]`))
	huge := covers(t, "s", []any{comp("big", 1000, 2000), comp("after", 3100)}, 900, 9000)
	eq(t, col(huge.Get("screens"), "edges"), J(`[["big"],["after"]]`))
	shortPage := covers(t, "s", []any{comp("a", 1000)}, 900, 1100)
	is(t, get(at(shortPage.Get("screens"), 0.0), "start"), 200.0)
}

func TestCoverScreensBadInputIsRefused(t *testing.T) {
	for _, bad := range []Obj{
		O("state", "", "components", []any{}, "viewportHeight", 900.0, "pageHeight", 1.0),
		O("state", "a/b", "components", []any{}, "viewportHeight", 900.0, "pageHeight", 1.0),
		O("state", "s", "components", []any{}, "viewportHeight", 0.0, "pageHeight", 1.0),
		O("state", "s", "components", "x", "viewportHeight", 900.0, "pageHeight", 1.0),
	} {
		_, err := CoverScreens(bad)
		if err == nil || !regexp.MustCompile(`状态|视口|组件`).MatchString(err.Error()) {
			t.Fatalf("%s: %v", stringify(bad, 0), err)
		}
	}
}

func TestBuildCoverCodeLooksTheEdgesUpItself(t *testing.T) {
	code := BuildCoverCode(O("state", "report--loaded", "edges", J(`[{"id":"see-sample","locate":{"role":"link","name":"查看范文"}}]`), "viewport", J(`{"width":1440,"height":900}`), "theme", "light", "motion", "default", "outDir", "/tmp/shots"))
	isAsyncFunction(t, code)
	match(t, code, `see-sample`)
	match(t, code, `/tmp/shots`)
	match(t, code, `unlocated`)
	match(t, code, `uncontrolled`)
	match(t, code, `fullPage: true`)
	noMatch(t, code, `pauseAt|resume\(|runFor|clock\.install|animations: 'disabled'`, "no page time moved (that the page is not reloaded is checked in the browser test)")
	noMatch(t, code, `(?m)^\s*//`, "full-line comments are not sent to the tool")
}

// ---------- the command line: cover ----------

func TestCliCoverPrintsTheCodeForTheComponentsBelowTheFirstScreen(t *testing.T) {
	root := repo(t, fixture.Compliant())
	out := filepath.Join(t.TempDir(), "shots")
	r := run("cover", root, "cookbook--list", "--out", out)
	is(t, r.status, 0, r.stderr)
	isAsyncFunction(t, r.stdout)
	match(t, r.stdout, `"id":"search"`)
	match(t, r.stdout, `"id":"open-pantry"`)
	noMatch(t, r.stdout, `"id":"done"`, "only user edges")
	match(t, r.stdout, `"viewport":\{"width":\d+,"height":\d+\}`)
	if !strings.Contains(r.stdout, stringify(out, 0)) {
		t.Fatal("the output directory is not in the code")
	}
	match(t, r.stderr, `cover`)
	match(t, r.stderr, `装时间|time`)
	flagged := run("cover", root, "cookbook--list", "--out", out, "--viewport", "390x844", "--theme", "dark", "--motion", "reduce")
	match(t, flagged.stdout, `"viewport":\{"width":390,"height":844\}`)
	match(t, flagged.stdout, `"theme":"dark"`)
	match(t, flagged.stdout, `"motion":"reduce"`)
}

func TestCliCoverAStateThatDeclaresSectionsExits2(t *testing.T) {
	root := repo(t, fixture.Marketing())
	r := run("cover", root, MKTEntry, "--out", filepath.Join(t.TempDir(), "shots"))
	is(t, r.status, 2)
	match(t, r.stderr, `measure`)
	match(t, r.stderr, `attribute`)
	match(t, r.stderr, `shoot`)
}

func TestCliCoverWithDeltaAStateThatIsOnlyInDeltaIsRead(t *testing.T) {
	files := fixture.Compliant()
	src := files[BASE+"/pages/cookbook/cookbook--list.md"]
	// a state that exists only in the requirement's delta/: the list page's state under a new id, with its own edge
	d := strings.Replace(src, "summary: 菜谱主页的默认一屏", "summary: 菜谱主页加载完的长页面", 1)
	d = strings.Replace(d, "id: search\n", "id: share-all\n", 1)
	d = strings.Replace(d, "# cookbook--list\n", "# cookbook--list-long\n", 1)
	files["docs/design/tmp/demo-spec/delta/pages/cookbook/cookbook--list-long.md"] = d
	root := repo(t, files)
	out := filepath.Join(t.TempDir(), "shots")
	r := run("cover", root, "cookbook--list-long", "--out", out, "--delta", "demo-spec")
	is(t, r.status, 0, r.stderr)
	isAsyncFunction(t, r.stdout)
	match(t, r.stdout, `"id":"share-all"`, "the user edge of the delta-only state")
	match(t, r.stdout, `"id":"open-pantry"`)
	noMatch(t, r.stdout, `"id":"search"`)
	without := run("cover", root, "cookbook--list-long", "--out", out)
	is(t, without.status, 2)
	match(t, without.stderr, `没有状态`)
}

func TestCliCoverWithDeltaAUserEdgeAddedInDeltaToAStateInProdIsRead(t *testing.T) {
	files := fixture.Compliant()
	src := files[BASE+"/pages/cookbook/cookbook--list.md"]
	files["docs/design/tmp/demo-spec/delta/pages/cookbook/cookbook--list.md"] = strings.Replace(src, "async:", `  - id: export
    to: "[[pantry--overview]]"
    kind: user
    component: "[[NavBar]]"
    locate: { role: button, name: 导出菜谱 }
    action: click
async:`, 1)
	root := repo(t, files)
	out := filepath.Join(t.TempDir(), "shots")
	noMatch(t, run("cover", root, "cookbook--list", "--out", out).stdout, `"id":"export"`, "prod/ alone does not have the new edge")
	r := run("cover", root, "cookbook--list", "--out", out, "--delta", "demo-spec")
	is(t, r.status, 0, r.stderr)
	match(t, r.stdout, `"id":"export"`)
	match(t, r.stdout, `"id":"search"`)
	missing := run("cover", root, "cookbook--list", "--out", out, "--delta", "no-such-spec")
	is(t, missing.status, 2)
	match(t, missing.stderr, `设计差异`)
}

func TestCliCoverUsageErrorsExit2AndSayWhy(t *testing.T) {
	root := repo(t, fixture.Compliant())
	out := filepath.Join(t.TempDir(), "shots")
	files := fixture.Compliant()
	files[BASE+"/index.md"] = regexp.MustCompile(`viewport: .*\n`).ReplaceAllString(files[BASE+"/index.md"], "")
	noViewport := repo(t, files)
	cases := []struct {
		args    []string
		pattern string
	}{
		{[]string{"cover"}, `仓库根`},
		{[]string{"cover", root}, `状态 id`},
		{[]string{"cover", root, "cookbook--list"}, `--out`},
		{[]string{"cover", root, "cookbook--list", "extra", "--out", out}, `多出`},
		{[]string{"cover", root, "no-such-state", "--out", out}, `没有状态`},
		{[]string{"cover", noViewport, "cookbook--list", "--out", out}, `viewport`},
		{[]string{"cover", root, "cookbook--list", "--out", out, "--bogus", "x"}, `不认识的选项`},
		{[]string{"cover", repo(t, fixture.Files{"README.md": "x"}), "cookbook--list", "--out", out}, `docs`},
	}
	for _, c := range cases {
		r := run(c.args...)
		is(t, r.status, 2, strings.Join(c.args, " "))
		match(t, r.stderr, c.pattern, strings.Join(c.args, " "))
	}
	is(t, run("cover", noViewport, "cookbook--list", "--out", out, "--viewport", "1440x900").status, 0)
}

// ---------- the command tree ----------

func TestRegistryListsEverySubcommandWithItsFlagsAndCaller(t *testing.T) {
	root := &cobra.Command{Use: "dyna"}
	root.AddCommand(Command())
	reg := registry.Export(root, "test")
	is(t, len(reg.Commands), len(commandFlags))
	for name, flags := range commandFlags {
		c, ok := reg.Find("sections " + name)
		if !ok {
			t.Fatalf("no sections %s in the registry", name)
		}
		is(t, c.Caller, registry.CallerSession, name)
		got := []string{}
		for _, a := range c.Args {
			if a.Kind == "flag" {
				got = append(got, a.Name)
			}
		}
		want := append([]string{}, flags...)
		sort.Strings(want)
		is(t, got, want, name+" flags")
	}
}
