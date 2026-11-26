package archive

import (
	"reflect"
	"strings"
	"testing"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/design/fixture"
)

func load(t *testing.T, files fixture.Files, opts Options) *Archive {
	t.Helper()
	root, err := fixture.WriteRepo(files, t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	a, err := Load(root, opts)
	if err != nil {
		t.Fatal(err)
	}
	return a
}

func TestWikilinkTargetKeepsOnlyTheFileName(t *testing.T) {
	for in, want := range map[string]string{"[[a]]": "a", " [[a|alias]] ": "a", "[[a#heading]]": "a", "[[ a | b ]]": "a"} {
		if got, ok := WikilinkTarget(in); !ok || got != want {
			t.Errorf("%q: got %q %v, want %q", in, got, ok, want)
		}
	}
	for _, in := range []any{"a", "[[a]] and [[b]]", "[[]]", 3.0, nil} {
		if _, ok := WikilinkTarget(in); ok {
			t.Errorf("%#v is not one link", in)
		}
	}
}

func TestWikilinksInSkipsFencedAndInlineCode(t *testing.T) {
	text := "see [[a]] and `[[no]]`\n```\n[[fenced]]\n```\n![[img.png]] then [[b|x]]"
	var got []string
	for _, l := range WikilinksIn(text) {
		got = append(got, l.Target)
	}
	if !reflect.DeepEqual(got, []string{"a", "img.png", "b"}) {
		t.Fatal(got)
	}
}

func TestHeadingsAndSectionStopAtTheNextHeadingOfTheSameOrHigherLevel(t *testing.T) {
	md := "# T\n\n## 决定\n\ntext\n\n### 决定 1：x\nbody\n\n## 设计法候选\n\n无\n"
	sec := SectionOf(md, "决定")
	if sec == nil || sec.Level != 2 || sec.Line != 3 || !strings.Contains(sec.Text, "### 决定 1：x") || strings.Contains(sec.Text, "候选") {
		t.Fatalf("%#v", sec)
	}
	if SectionOf(md, "没有这一节") != nil {
		t.Fatal("a missing heading is nil")
	}
}

func TestParseDecisionsReadsItemsAndFlagsShapeProblems(t *testing.T) {
	sec := &Section{Level: 2, Line: 1, Text: "\n### 决定 1：甲\n- 为什么：因为\n  接着写\n- 来源：[[s]]\n### 决定 1：乙\n### 随便\n"}
	d := ParseDecisions(sec)
	if len(d.Entries) != 2 || d.Entries[0].Why == nil || *d.Entries[0].Why != "因为 接着写" || d.Entries[0].Rejected != nil {
		t.Fatalf("%#v", d)
	}
	if !reflect.DeepEqual(d.Problems, []string{"决定 1 的编号重复", "「随便」不是「决定 N：标题」的形状"}) {
		t.Fatal(d.Problems)
	}
	if !ParseDecisions(&Section{Level: 2, Text: "无"}).None {
		t.Fatal("「无」 alone means none")
	}
}

func TestParseCandidatesReadsTopBulletsWithTheirItems(t *testing.T) {
	sec := &Section{Level: 2, Line: 10, Text: "\n- **一条规则**\n  - 并进：Motion\n  - 为什么：理由\n  - 证据：[[x]]\n"}
	c := ParseCandidates(sec)
	if len(c.Entries) != 1 || c.Entries[0].Rule != "一条规则" || *c.Entries[0].Merge != "Motion" || *c.Entries[0].Evidence != "[[x]]" || c.Entries[0].Line != 12 {
		t.Fatalf("%#v", c)
	}
	if got := ParseCandidates(&Section{Text: "随便写写"}); len(got.Problems) != 1 {
		t.Fatalf("text that is neither none nor a candidate is a problem: %#v", got)
	}
}

func TestParseRemovedTakesTheIdFromALinkOrTheFirstWord(t *testing.T) {
	text := "- [[a]] 旧的\n* `b`：不要了\n- c — 说明\nnot a bullet\n-\n"
	if got := ParseRemoved(text); !reflect.DeepEqual(got, []string{"a", "b", "c"}) {
		t.Fatal(got)
	}
}

func TestLoadReadsTheFixtureAsAGraph(t *testing.T) {
	a := load(t, fixture.Compliant(), Options{})
	if len(a.Problems) != 0 || len(a.Duplicates) != 0 {
		t.Fatalf("%#v %#v", a.Problems, a.Duplicates)
	}
	if got := len(ObjectsOfKind(a, "state")); got != 7 {
		t.Fatalf("states: %d", got)
	}
	if len(a.Edges) != 9 {
		t.Fatalf("edges: %d", len(a.Edges))
	}
	if a.Index == nil || a.Index.Get("viewport") != "1440x900" {
		t.Fatalf("index: %#v", a.Index)
	}
	if !Resolves(a, "cookbook--list") || Resolves(a, "nothing") {
		t.Fatal("resolves")
	}
	if len(a.Files["01-first"]) != 0 {
		t.Fatalf("the ticket files repeat names across specs by design: %v", a.Files["01-first"])
	}
	list := a.Objects["cookbook--list"]
	if !IsEntry(list) || PageOfState(list) != "cookbook" {
		t.Fatal("cookbook--list is the entry of cookbook")
	}
	out := OutgoingEdges(a, "cookbook--list")
	if len(out) != 2 || out[0].ID != "search" || out[0].To != "cookbook--search-loading" || out[0].Component != "SearchBox" {
		t.Fatalf("%#v", out)
	}
	if got := len(IncomingEdges(a, "cookbook--search-loading")); got != 2 {
		t.Fatalf("incoming: %d", got)
	}
	fail := OutgoingEdges(a, "cookbook--search-loading")[1]
	if !HasBlocked(fail) {
		t.Fatal("the fail edge says why it cannot be walked")
	}
}

func TestComputeUsedByNamesThePagesThatUseAComponentOrMotion(t *testing.T) {
	u := ComputeUsedBy(load(t, fixture.Compliant(), Options{}))
	if !reflect.DeepEqual(u.Components["NavBar"], []string{"cookbook", "pantry"}) || !reflect.DeepEqual(u.Components["SaveButton"], []string{"cookbook"}) {
		t.Fatalf("%v", u.Components)
	}
	if !reflect.DeepEqual(u.Motions["save-pop"], []string{"cookbook"}) || !reflect.DeepEqual(u.Motions["spinner-ring"], []string{"cookbook"}) {
		t.Fatalf("%v", u.Motions)
	}
}

func TestLoadWithoutADeltaFolderSaysSo(t *testing.T) {
	root, _ := fixture.WriteRepo(fixture.Compliant(), t.TempDir())
	if _, err := Load(root, Options{Delta: "demo-spec"}); err == nil || !strings.Contains(err.Error(), "这个需求没有设计差异") {
		t.Fatal(err)
	}
}

func TestADeltaReplacesAddsAndRemovesObjectsById(t *testing.T) {
	files := fixture.Compliant()
	base := "docs/design/tmp/demo-spec/delta"
	files[base+"/pages/pantry/pantry--empty.md"] = strings.Replace(files[fixture.Base+"/pages/pantry/pantry--empty.md"], "summary: 食材库为空", "summary: 食材库为空（改过）", 1)
	files[base+"/pages/pantry/pantry--new.md"] = "---\ntype: design-state\npage: \"[[pantry]]\"\nedges: []\n---\n\n# x\n"
	files[base+"/removed.md"] = "- [[search-failed-gone]]\n- [[cookbook--search-failed]] 不要了\n"
	a := load(t, files, Options{Delta: "demo-spec"})
	if a.Delta == nil || !reflect.DeepEqual(a.Delta.Added, []string{"pantry--new"}) || !reflect.DeepEqual(a.Delta.Changed, []string{"pantry--empty"}) || !reflect.DeepEqual(a.Delta.Removed, []string{"search-failed-gone", "cookbook--search-failed"}) {
		t.Fatalf("%#v", a.Delta)
	}
	if _, ok := a.Objects["cookbook--search-failed"]; ok {
		t.Fatal("removed objects are dropped")
	}
	if got := a.Objects["pantry--empty"]; got.Source != "delta" || got.FM.Get("summary") != "食材库为空（改过）" {
		t.Fatalf("%#v", got)
	}
	if len(a.Duplicates) != 0 {
		t.Fatalf("a delta file replaces the prod one rather than duplicating it: %v", a.Duplicates)
	}
}

func TestAnObjectWithoutAUsableFrontmatterIsAProblemNotAnObject(t *testing.T) {
	files := fixture.Compliant()
	files[fixture.Base+"/components/Bad/Bad.md"] = "no frontmatter"
	files[fixture.Base+"/components/Odd/Odd.md"] = "---\ntype: other\n---\n"
	files[fixture.Base+"/components/Broken/Broken.md"] = "---\nfoo: [unclosed\n---\n"
	a := load(t, files, Options{})
	got := map[string]string{}
	for _, p := range a.Problems {
		got[p.File] = p.Message
	}
	if got["docs/design/prod/components/Bad/Bad.md"] != "没有 frontmatter" ||
		!strings.Contains(got["docs/design/prod/components/Odd/Odd.md"], "type 不是档案对象的类型（other）；应是 design-page / design-state") ||
		!strings.HasPrefix(got["docs/design/prod/components/Broken/Broken.md"], "frontmatter 读不出来：") {
		t.Fatalf("%v", got)
	}
}

func TestSectionIDsSplitIntoTheLongestKnownTypeAndAQualifier(t *testing.T) {
	cases := map[string]ParsedSectionID{
		"hero":                {Type: "hero"},
		"feature-a":           {Type: "feature", Qualifier: "a"},
		"feature-grid-prices": {Type: "feature-grid", Qualifier: "prices"},
		"Hero":                {Error: "format"},
		"mystery":             {Error: "type"},
	}
	for id, want := range cases {
		if got := ParseSectionID(id); got != want {
			t.Errorf("%s: %#v, want %#v", id, got, want)
		}
	}
	if r, ok := ParseSectionRef("mkt-pricing#feature-b"); !ok || r.Page != "mkt-pricing" || r.ID != "feature-b" {
		t.Fatal(r, ok)
	}
	if _, ok := ParseSectionRef("[[a#b]]"); ok {
		t.Fatal("a wikilink is not a section ref")
	}
}

func TestSectionsOfTheMarketingPageComeFromItsEntryState(t *testing.T) {
	a := load(t, fixture.Marketing(), Options{})
	secs := SectionsOfPage(a, fixture.MKT)
	var ids []string
	for _, s := range secs {
		ids = append(ids, s.ID)
	}
	if !reflect.DeepEqual(ids, []string{"header", "hero", "feature-a", "feature-b", "footer"}) {
		t.Fatal(ids)
	}
	if secs[0].By == nil || secs[0].By.Kind != "landmark" || secs[1].By.Kind != "heading" || secs[1].By.Name != "一个价格，没有隐藏项" {
		t.Fatalf("%#v %#v", secs[0].By, secs[1].By)
	}
	if got := SectionsOfPage(a, "cookbook"); got != nil {
		t.Fatalf("a page without sections has none: %v", got)
	}
}
