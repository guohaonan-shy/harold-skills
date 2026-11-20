package query

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/design/fixture"
)

// The second half of the old design-archive-query.test.mjs: sections, edge shots, `when`, scrollDriven.

const (
	mkt      = fixture.MKT
	mktEntry = fixture.MKTEntry
)

// ---------- 边的截图 shot ----------

// shotArchiveFiles is the `shot` fixture plus the image of `save` / `save-key` (shared) — `save-all`'s image is missing.
func shotFiles() fixture.Files {
	f := fixture.Shot()
	f[P("pages/cookbook/assets/"+fixture.ShotState+"@save.png")] = "png"
	return f
}

func edgeByID(list_ any, id string) any {
	for _, e := range list(list_) {
		if g(e, "id") == id {
			return e
		}
	}
	return nil
}

func stateOf(r any, id string) any {
	for _, s := range list(g(r, "states")) {
		if g(s, "id") == id {
			return s
		}
	}
	return nil
}

func TestPageAnEdgeWithShotCarriesItAndShotExists(t *testing.T) {
	r := okMap(t)(Page(archiveOf(t, shotFiles()), "cookbook"))
	out := g(stateOf(r, fixture.ShotState), "outgoing")
	got := []any{}
	for _, e := range list(out) {
		got = append(got, []any{g(e, "id"), g(e, "shot"), g(e, "shotExists")})
	}
	want := fixture.ShotState
	eq(t, got, js(t, `[["save","`+want+`@save.png",true],["save-key","`+want+`@save.png",true],["save-all","`+want+`@save-all.png",false]]`))
	for _, e := range list(g(stateOf(r, "cookbook--list"), "outgoing")) {
		if has(e, "shot") || has(e, "shotExists") {
			t.Fatalf("an edge without shot has the keys: %v", e)
		}
	}
	// the same edge seen from the other end
	saved := []any{}
	for _, e := range list(g(stateOf(r, "cookbook--recipe-saved"), "incoming")) {
		saved = append(saved, []any{g(e, "id"), g(e, "shotExists")})
	}
	eq(t, saved, js(t, `[["save",true],["save-key",true],["save-all",false]]`))
}

func TestStateTheWayInShowsShotAndShotExistsOnTheStepsThatCarryThem(t *testing.T) {
	steps := list(g(okMap(t)(State(archiveOf(t, shotFiles()), "cookbook--recipe-saved")), "enter", "steps"))
	last := steps[len(steps)-1]
	eq(t, []any{g(last, "id"), g(last, "shot"), g(last, "shotExists")}, []any{"save", fixture.ShotState + "@save.png", true})
	for _, e := range steps[:len(steps)-1] {
		if has(e, "shot") || has(e, "shotExists") {
			t.Fatalf("a step without shot has the keys: %v", e)
		}
	}
}

func TestDiffShotIsComparedLikeAnyOtherEdgeField(t *testing.T) {
	base := fixture.Shot()
	changed := fixture.Shot()
	file := D("pages/cookbook/" + fixture.ShotState + ".md")
	src := P("pages/cookbook/" + fixture.ShotState + ".md")
	changed[file] = strings.Replace(base[src], "shot: "+fixture.ShotState+"@save-all.png", "shot: "+fixture.ShotState+"@save.png", 1)
	for k, v := range changed {
		base[k] = v
	}
	r := okMap(t)(Diff(repoOf(t, base), fixture.SpecSlug))
	text, _ := json.Marshal(r)
	if !strings.Contains(string(text), "edges[save-all].shot") {
		t.Fatalf("no shot difference in %s", text)
	}
}

// ---------- sections of a long entry state ----------

func sectionByID(r any) map[string]any {
	by := map[string]any{}
	for _, x := range list(g(r, "sections")) {
		id := g(x, "id").(string)
		by[id[strings.Index(id, "#")+1:]] = x
	}
	return by
}

func TestPageTheSectionsOfTheEntryStateWithEdgesStatesAndSlicePath(t *testing.T) {
	p := okMap(t)(Page(archiveOf(t, fixture.Marketing()), mkt))
	want := []any{}
	for _, x := range []string{"header", "hero", "feature-a", "feature-b", "footer"} {
		want = append(want, mkt+"#"+x)
	}
	eq(t, pick(g(p, "sections"), "id"), want)
	by := sectionByID(p)
	hero := by["hero"]
	eq(t, map[string]any{"type": g(hero, "type"), "qualifier": g(hero, "qualifier"), "locate": g(hero, "locate"), "locateBy": g(hero, "locateBy"), "declaredBy": g(hero, "declaredBy")},
		map[string]any{"type": "hero", "qualifier": nil, "locate": map[string]any{"role": "heading", "name": "一个价格，没有隐藏项"}, "locateBy": "heading", "declaredBy": mktEntry})
	eq(t, g(by["feature-b"], "type"), "feature")
	eq(t, g(by["feature-b"], "qualifier"), "b")
	eq(t, g(by["header"], "locateBy"), "landmark")
	// out: from the section; in: landing on it, including the same-page anchor (a self-loop)
	eq(t, pick(g(hero, "outgoing"), "id"), strs("start", "see-features"))
	fa := []any{}
	for _, e := range list(g(by["feature-a"], "incoming")) {
		fa = append(fa, []any{g(e, "id"), g(e, "from"), g(e, "to")})
	}
	eq(t, fa, js(t, `[["see-features","`+mktEntry+`","`+mktEntry+`"]]`))
	fb := []any{}
	for _, e := range list(g(by["feature-b"], "incoming")) {
		fb = append(fb, []any{g(e, "id"), g(e, "from")})
	}
	eq(t, fb, js(t, `[["see-pricing","cookbook--list"]]`))
	eq(t, pick(g(by["feature-b"], "outgoing"), "id"), strs("expand"))
	eq(t, g(by["feature-b"], "states"), strs(mkt+"--feature-b-expanded"))
	eq(t, g(hero, "states"), []any{})
	// the slice lives next to the entry state, named <state>@<section>.png
	eq(t, g(hero, "screenshot"), base+"/pages/"+mkt+"/assets/"+mktEntry+"@hero.png")
	eq(t, g(hero, "screenshotExists"), false)
}

func TestPageEdgesCarryFromSectionAndToSectionSoDoAStatesWayInAndAJourneysSteps(t *testing.T) {
	a := archiveOf(t, fixture.Marketing())
	p := okMap(t)(Page(a, mkt))
	entry := stateOf(p, mktEntry)
	anchor := edgeByID(g(entry, "outgoing"), "see-features")
	eq(t, g(anchor, "fromSection"), mkt+"#hero")
	eq(t, g(anchor, "toSection"), mkt+"#feature-a")
	eq(t, has(edgeByID(g(entry, "outgoing"), "start"), "toSection"), false)
	eq(t, g(edgeByID(g(entry, "incoming"), "see-pricing"), "toSection"), mkt+"#feature-b")
	// the way into a state shows where to scroll first
	st := okMap(t)(State(a, mkt+"--feature-b-expanded"))
	got := []any{}
	for _, e := range list(g(st, "enter", "steps")) {
		got = append(got, []any{g(e, "id"), g(e, "fromSection")})
	}
	eq(t, got, js(t, `[["expand","`+mkt+`#feature-b"]]`))
	eq(t, g(st, "state", "section"), mkt+"#feature-b")
	// a journey
	j := okMap(t)(Journey(a, "explore-pricing"))
	eq(t, g(j, "steps", 1, "trigger", "toSection"), mkt+"#feature-b")
	eq(t, g(j, "steps", 2, "trigger", "fromSection"), mkt+"#feature-b")
}

func TestAnEdgesWhenShowsInEveryEdgeView(t *testing.T) {
	files := fixture.Marketing()
	files[fixture.MKTEntryFile] = strings.Replace(files[fixture.MKTEntryFile], "    locate: { role: button, name: 展开细节 }", "    locate: { role: button, name: 展开细节 }\n    when: 从价格页进来时", 1)
	a := archiveOf(t, files)
	entry := stateOf(okMap(t)(Page(a, mkt)), mktEntry)
	eq(t, g(edgeByID(g(entry, "outgoing"), "expand"), "when"), "从价格页进来时")
	eq(t, has(edgeByID(g(entry, "outgoing"), "start"), "when"), false)
	eq(t, g(edgeByID(g(okMap(t)(State(a, mkt+"--feature-b-expanded")), "enter", "steps"), "expand"), "when"), "从价格页进来时")
	eq(t, g(okMap(t)(Journey(a, "explore-pricing")), "steps", 2, "trigger", "when"), "从价格页进来时")
}

func TestPageAPageWithoutSectionsGetsAnEmptyListAndItsEdgesAreUnchanged(t *testing.T) {
	p := okMap(t)(Page(archiveOf(t, fixture.Compliant()), "cookbook"))
	eq(t, g(p, "sections"), []any{})
	text, _ := json.Marshal(g(p, "states"))
	eq(t, strings.Contains(string(text), "Section"), false)
}

func TestPageASliceThatExistsOnDiskIsReportedAsExisting(t *testing.T) {
	files := fixture.Marketing()
	files[base+"/pages/"+mkt+"/assets/"+mktEntry+"@hero.png"] = "x"
	p := okMap(t)(Page(archiveOf(t, files), mkt))
	eq(t, g(sectionByID(p)["hero"], "screenshotExists"), true)
}

func withScrollDriven(t *testing.T) fixture.Files {
	files := fixture.Marketing()
	files[fixture.MKTEntryFile] = strings.Replace(files[fixture.MKTEntryFile], "  - { id: feature-a, locate: { role: heading, name: 无限菜谱 } }", "  - { id: feature-a, locate: { role: heading, name: 无限菜谱 }, scrollDriven: true }", 1)
	if !strings.Contains(files[fixture.MKTEntryFile], "scrollDriven: true") {
		t.Fatal("the replacement did not apply")
	}
	return files
}

func TestPageAndRefsASectionDeclaredScrollDrivenSaysSoEverywhere(t *testing.T) {
	a := archiveOf(t, withScrollDriven(t))
	by := sectionByID(okMap(t)(Page(a, mkt)))
	eq(t, g(by["feature-a"], "scrollDriven"), true)
	eq(t, has(by["hero"], "scrollDriven"), false)
	eq(t, g(okMap(t)(Refs(a, mkt+"#feature-a")), "target", "scrollDriven"), true)
	eq(t, has(g(okMap(t)(Refs(a, mkt+"#hero")), "target"), "scrollDriven"), false)
	for _, x := range list(g(okMap(t)(Refs(a, "#feature")), "sections")) {
		if g(x, "id") == mkt+"#feature-a" {
			eq(t, g(x, "scrollDriven"), true)
		}
	}
	// everything else about the section is as before
	eq(t, pick(g(by["feature-a"], "incoming"), "id"), strs("see-features"))
	eq(t, g(by["feature-a"], "screenshot"), base+"/pages/"+mkt+"/assets/"+mktEntry+"@feature-a.png")
}

func TestRefsPageSectionReturnsEdgesStatesAndJourneys(t *testing.T) {
	a := archiveOf(t, fixture.Marketing())
	r := okMap(t)(Refs(a, mkt+"#feature-b"))
	eq(t, g(r, "target"), js(t, `{"id":"`+mkt+`#feature-b","kind":"section","page":"`+mkt+`","type":"feature","qualifier":"b","locate":{"role":"heading","name":"食材库同步"},"declaredBy":"`+mktEntry+`"}`))
	eq(t, g(r, "matchedBy"), "section")
	eq(t, pick(g(r, "outgoing"), "id"), strs("expand"))
	eq(t, pick(g(r, "incoming"), "id"), strs("see-pricing"))
	eq(t, pick(g(r, "states"), "id"), strs(mkt+"--feature-b-expanded"))
	eq(t, pick(g(r, "journeys"), "id"), strs("explore-pricing"))
	eq(t, g(r, "pages"), strs(mkt))
	// a section with only a way out
	hero := okMap(t)(Refs(a, mkt+"#hero"))
	eq(t, pick(g(hero, "outgoing"), "id"), strs("start", "see-features"))
	eq(t, g(hero, "incoming"), []any{})
	eq(t, g(hero, "journeys"), []any{})
}

func TestRefsTypeReturnsEverySectionOfThatTypeQualifiedOnesIncluded(t *testing.T) {
	a := archiveOf(t, fixture.Marketing())
	r := okMap(t)(Refs(a, "#feature"))
	eq(t, g(r, "target"), js(t, `{"kind":"section-type","type":"feature"}`))
	eq(t, g(r, "matchedBy"), "type")
	got := []any{}
	for _, x := range list(g(r, "sections")) {
		got = append(got, []any{g(x, "page"), g(x, "id"), g(x, "qualifier")})
	}
	eq(t, got, js(t, `[["`+mkt+`","`+mkt+`#feature-a","a"],["`+mkt+`","`+mkt+`#feature-b","b"]]`))
	eq(t, pick(g(okMap(t)(Refs(a, "#hero")), "sections"), "id"), strs(mkt+"#hero"))
}

func TestRefsTheOldArgumentsBehaveAsBeforeOnAnArchiveWithSections(t *testing.T) {
	a := archiveOf(t, fixture.Marketing())
	eq(t, g(okMap(t)(Refs(a, "SiteNav")), "matchedBy"), "name")
	eq(t, g(okMap(t)(Refs(a, "src/components/CtaButton.tsx")), "target", "id"), "CtaButton")
	eq(t, g(okMap(t)(Refs(a, "save-pop")), "target", "kind"), "motion")
}

func TestRefsASectionOrTypeThatIsNotThereListsWhatExists(t *testing.T) {
	a := archiveOf(t, fixture.Marketing())
	_, err := Refs(a, mkt+"#nowhere")
	qe(t, err, "", "nowhere")
	qe(t, err, "", "hero")
	qe(t, err, "", "footer")
	_, err = Refs(a, "no-page#hero")
	qe(t, err, "", "no-page")
	_, err = Refs(a, "cookbook#hero")
	qe(t, err, "", "没有声明分段")
	_, err = Refs(a, "#trust")
	qe(t, err, "", "trust")
	qe(t, err, "", "hero")
	_, err = Refs(a, "#closing-band")
	qe(t, err, "", "类型表")
}

func TestCliRefsWithASectionIDPrintsTheSameJSONAndExits1WhenNotThere(t *testing.T) {
	root := repoOf(t, fixture.Marketing())
	out, errText, code := cliRun(root, "refs", mkt+"#hero")
	eq(t, code, 0, errText)
	a, _ := archiveLoad(root)
	v, err := Refs(a, mkt+"#hero")
	want, _ := jsonText(v, err)
	eq(t, js(t, out), js(t, want))
	_, _, code = cliRun(root, "refs", "#feature")
	eq(t, code, 0)
	out, errText, code = cliRun(root, "refs", mkt+"#nowhere")
	eq(t, code, 1)
	match(t, errText, "hero")
	eq(t, out, "")
	page, _, _ := cliRun(root, "page", mkt)
	eq(t, len(list(g(js(t, page), "sections"))), 5)
}

func TestDiffSectionsAreExpandedBySectionIDMovingOneLocateShowsOnlyThatField(t *testing.T) {
	base := fixture.Marketing()
	edited := strings.Replace(base[fixture.MKTEntryFile], "{ role: heading, name: 无限菜谱 }", "{ role: heading, name: 无限菜谱收藏 }", 1)
	if edited == base[fixture.MKTEntryFile] {
		t.Fatal("the edit did not apply")
	}
	base["docs/design/tmp/"+fixture.SpecSlug+"/delta/pages/"+mkt+"/"+mktEntry+".md"] = edited
	changed := g(okMap(t)(Diff(repoOf(t, base), fixture.SpecSlug)), "changed")
	eq(t, pick(changed, "id"), strs(mktEntry))
	eq(t, g(changed, 0, "fields"), js(t, `[{"field":"sections[feature-a].locate","before":{"role":"heading","name":"无限菜谱"},"after":{"role":"heading","name":"无限菜谱收藏"}}]`))
}

func TestDiffASectionAddedIsReportedUnderItsOwnIDAndAnEdgeFromChangeUnderThatEdge(t *testing.T) {
	base := fixture.Marketing()
	edited := base[fixture.MKTEntryFile]
	edited = strings.Replace(edited, "  - { id: footer, locate: { role: contentinfo } }", "  - { id: faq, locate: { role: heading, name: 常见问题 } }\n  - { id: footer, locate: { role: contentinfo } }", 1)
	edited = strings.Replace(edited, "from: mkt-pricing#footer", "from: mkt-pricing#faq", 1)
	base["docs/design/tmp/"+fixture.SpecSlug+"/delta/pages/"+mkt+"/"+mktEntry+".md"] = edited
	fields := pick(g(okMap(t)(Diff(repoOf(t, base), fixture.SpecSlug)), "changed", 0, "fields"), "field")
	eq(t, fields, strs("sections[faq]", "edges[footer-terms].from"))
}
