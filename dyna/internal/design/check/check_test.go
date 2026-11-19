package check

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"regexp"
	"sort"
	"strings"
	"testing"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/design/archive"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/design/fixture"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/miniyaml"
)

// Every test of the old design-archive-check.test.mjs is here under the same name in Go style; the one that
// read the skill's reference text (the last of the rule 8 group) reads the same files.

const (
	base    = fixture.Base
	slug    = fixture.SpecSlug
	mkt     = fixture.MKT
	mktFile = fixture.MKTEntryFile
)

func P(rel string) string { return base + "/" + rel }

var (
	LIST        = P("pages/cookbook/cookbook--list.md")
	LOADING     = P("pages/cookbook/cookbook--search-loading.md")
	RESULTS     = P("pages/cookbook/cookbook--search-results.md")
	FAILED      = P("pages/cookbook/cookbook--search-failed.md")
	OVERVIEW    = P("pages/pantry/pantry--overview.md")
	RECIPE_CARD = P("components/RecipeCard/RecipeCard.md")
	SPINNER     = P("motions/spinner-ring.md")
	SAVE_POP    = P("motions/save-pop.md")
	SAVE_JOUR   = P("journeys/save-a-recipe.md")
	COOKBOOK    = P("pages/cookbook/cookbook.md")
	INDEX_FILE  = P("index.md")
	MKT_FEAT_B  = P("pages/" + mkt + "/" + mkt + "--feature-b-expanded.md")
)

type edit func(string) string

// sub replaces the first occurrence (a JavaScript string replace).
func sub(from, to string) edit {
	return func(t string) string { return strings.Replace(t, from, to, 1) }
}

// subRe replaces the first match of a regular expression.
func subRe(pattern, to string) edit {
	re := regexp.MustCompile(pattern)
	return func(t string) string {
		loc := re.FindStringIndex(t)
		if loc == nil {
			return t
		}
		return t[:loc[0]] + to + t[loc[1]:]
	}
}

func apply(t *testing.T, files fixture.Files, edits map[string]edit) fixture.Files {
	t.Helper()
	for path, fn := range edits {
		old, ok := files[path]
		if !ok {
			t.Fatalf("fixture has no %s", path)
		}
		next := fn(old)
		if next == old {
			t.Fatalf("edit on %s changed nothing", path)
		}
		files[path] = next
	}
	return files
}

// bend is the compliant fixture with edits applied and extra files added.
func bend(t *testing.T, edits map[string]edit, extra map[string]string) fixture.Files {
	t.Helper()
	files := apply(t, fixture.Compliant(), edits)
	for k, v := range extra {
		files[k] = v
	}
	return files
}

func bendShot(t *testing.T, edits map[string]edit) fixture.Files {
	t.Helper()
	return apply(t, fixture.Shot(), edits)
}

// bendMkt is the marketing fixture with edits applied; renames also rename every reference to a section.
func bendMkt(t *testing.T, edits map[string]edit, renames ...[2]string) fixture.Files {
	t.Helper()
	files := fixture.Marketing()
	for _, r := range renames {
		for path, text := range files {
			text = strings.ReplaceAll(text, mkt+"#"+r[0], mkt+"#"+r[1])
			files[path] = strings.ReplaceAll(text, "id: "+r[0]+",", "id: "+r[1]+",")
		}
	}
	return apply(t, files, edits)
}

func repo(t *testing.T, files fixture.Files) string {
	t.Helper()
	root, err := fixture.WriteRepo(files, t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	return root
}

func run(t *testing.T, files fixture.Files) Result {
	t.Helper()
	return runWith(t, files, Defaults())
}

func runWith(t *testing.T, files fixture.Files, opts Options) Result {
	t.Helper()
	r, err := Run(repo(t, files), opts)
	if err != nil {
		t.Fatalf("check: %v", err)
	}
	return r
}

func rules(r Result) []int {
	out := []int{}
	for _, v := range r.Violations {
		out = append(out, v.Rule)
	}
	return out
}

func wantRules(t *testing.T, r Result, want ...int) {
	t.Helper()
	if want == nil {
		want = []int{}
	}
	if got := rules(r); !reflect.DeepEqual(got, want) {
		t.Fatalf("rules = %v, want %v\n%s", got, want, dump(r))
	}
}

func dump(r Result) string {
	var b strings.Builder
	for _, v := range r.Violations {
		b.WriteString(Format(v) + "\n")
	}
	return b.String()
}

func noViolations(t *testing.T, r Result) {
	t.Helper()
	if len(r.Violations) != 0 {
		t.Fatalf("want no violations:\n%s", dump(r))
	}
}

func noNotes(t *testing.T, r Result) {
	t.Helper()
	if len(r.Notes) != 0 {
		t.Fatalf("want no notes: %v", r.Notes)
	}
}

// named are the violations of a rule whose file, field and message all contain every needle.
func named(r Result, rule int, needles ...string) []Violation {
	var out []Violation
	for _, v := range r.Violations {
		if v.Rule != rule {
			continue
		}
		hay := v.File + " " + v.Field + " " + v.Message
		ok := true
		for _, n := range needles {
			ok = ok && strings.Contains(hay, n)
		}
		if ok {
			out = append(out, v)
		}
	}
	return out
}

func ofRule(r Result, rule int) []Violation {
	var out []Violation
	for _, v := range r.Violations {
		if v.Rule == rule {
			out = append(out, v)
		}
	}
	return out
}

func notOfRule(r Result, rule int) []Violation {
	var out []Violation
	for _, v := range r.Violations {
		if v.Rule != rule {
			out = append(out, v)
		}
	}
	return out
}

func matches(t *testing.T, pattern, s string) {
	t.Helper()
	if !regexp.MustCompile(pattern).MatchString(s) {
		t.Fatalf("%q does not match /%s/", s, pattern)
	}
}

func eq(t *testing.T, got, want any) {
	t.Helper()
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got  %#v\nwant %#v", got, want)
	}
}

func TestTheCompliantFixtureHasNoViolationsAndNoNotes(t *testing.T) {
	r := run(t, fixture.Compliant())
	noViolations(t, r)
	noNotes(t, r)
}

// ---------- the parsed archive (what the queries and later commands build on) ----------

func TestLoadArchiveReturnsEveryObjectEdgeAndReference(t *testing.T) {
	a, err := archive.Load(repo(t, fixture.Compliant()), archive.Options{})
	if err != nil {
		t.Fatal(err)
	}
	if len(a.Problems) != 0 {
		t.Fatalf("problems: %v", a.Problems)
	}
	ids := func(kind string) []string {
		out := []string{}
		for _, o := range archive.ObjectsOfKind(a, kind) {
			out = append(out, o.ID)
		}
		sort.Strings(out)
		return out
	}
	eq(t, ids("page"), []string{"cookbook", "pantry"})
	eq(t, ids("state"), []string{
		"cookbook--list", "cookbook--recipe-saved", "cookbook--search-failed", "cookbook--search-loading", "cookbook--search-results",
		"pantry--empty", "pantry--overview",
	})
	eq(t, ids("component"), []string{"NavBar", "RecipeCard", "RetryButton", "SaveButton", "SearchBox"})
	eq(t, ids("motion"), []string{"save-pop", "spinner-ring"})
	eq(t, ids("journey"), []string{"glance-at-pantry", "save-a-recipe"})
	if len(a.Objects) != 18 {
		t.Fatalf("objects = %d", len(a.Objects))
	}
	if len(a.Edges) != 9 {
		t.Fatalf("edges = %d", len(a.Edges))
	}
	pantry := []string{}
	for _, s := range archive.StatesOfPage(a, "pantry") {
		pantry = append(pantry, s.ID)
	}
	sort.Strings(pantry)
	eq(t, pantry, []string{"pantry--empty", "pantry--overview"})

	find := func(from, id string) archive.Edge {
		for _, e := range archive.OutgoingEdges(a, from) {
			if e.ID == id {
				return e
			}
		}
		t.Fatalf("no edge %s in %s", id, from)
		return archive.Edge{}
	}
	fail := find("cookbook--search-loading", "fail")
	eq(t, fail.To, "cookbook--search-failed")
	eq(t, fail.Kind, "system")
	eq(t, fail.How, "拦截搜索请求并返回 500")
	tried := fail.Blocked.(*miniyaml.Map).Get("tried")
	eq(t, tried, []any{"拦截搜索请求返回 500", "用空关键词搜索"})
	search := find("cookbook--list", "search")
	eq(t, search.Component, "SearchBox")
	loc := search.Locate.(*miniyaml.Map)
	eq(t, []any{loc.Get("role"), loc.Get("name")}, []any{"searchbox", "搜索菜谱"})
	eq(t, search.Action, "输入关键词并回车")

	foundRegion, foundBody := false, false
	for _, r := range a.Refs {
		if r.From == "cookbook" && r.Where == "regions[0].component" && r.Target == "NavBar" {
			foundRegion = true
		}
		if r.From == "RecipeCard" && strings.HasPrefix(r.Where, "正文") && r.Target == slug {
			foundBody = true
		}
	}
	if !foundRegion || !foundBody {
		t.Fatalf("refs: region %v body %v", foundRegion, foundBody)
	}
	idx := map[string]any{}
	for _, k := range a.Index.Keys() {
		idx[k] = a.Index.Get(k)
	}
	eq(t, idx, map[string]any{"type": "design-index", "tags": []any{"design"}, "summary": "设计档案索引", "viewport": "1440x900", "theme": "light", "locale": "zh-CN"})
}

func TestComputeUsedByListsThePagesThatUseEachComponentAndMotion(t *testing.T) {
	a, err := archive.Load(repo(t, fixture.Compliant()), archive.Options{})
	if err != nil {
		t.Fatal(err)
	}
	used := archive.ComputeUsedBy(a)
	eq(t, used.Components["RecipeCard"], []string{"cookbook", "pantry"})
	eq(t, used.Components["NavBar"], []string{"cookbook", "pantry"})
	eq(t, used.Components["RetryButton"], []string{"cookbook"}) // only through an edge
	eq(t, used.Motions["spinner-ring"], []string{"cookbook"})   // through a state
	eq(t, used.Motions["save-pop"], []string{"cookbook"})       // through an edge
}

// ---------- structure ----------

func TestAFileThatIsNotAnArchiveObjectIsReportedNotSkipped(t *testing.T) {
	r := run(t, bend(t, map[string]edit{SPINNER: sub("type: design-motion", "type: design-moton")}, nil))
	if len(named(r, 0, "spinner-ring.md", "type")) != 1 {
		t.Fatal(dump(r))
	}
}

func TestAMalformedEdgeIsNamedWithItsPosition(t *testing.T) {
	r := run(t, bend(t, map[string]edit{LIST: sub("    kind: user\n    component: \"[[SearchBox]]\"", "    kind: usr\n    component: \"[[SearchBox]]\"")}, nil))
	if len(named(r, 0, "cookbook--list.md", "edges[0].kind")) != 1 {
		t.Fatal(dump(r))
	}
}

// ---------- rule 1: reachability ----------

const lonelyState = "---\ntype: design-state\ntags: [pantry]\nsummary: 没人能进来\npage: \"[[pantry]]\"\nedges: []\n---\n\n## 这一屏\n\n空。\n\n## 应看到什么\n\n- 空\n"

func TestRule1AStateNobodyCanEnterAndThatSaysNothingAboutWhyIsNamed(t *testing.T) {
	r := run(t, bend(t, nil, map[string]string{P("pages/pantry/pantry--lonely.md"): lonelyState}))
	wantRules(t, r, 1)
	matches(t, `pantry--lonely\.md$`, r.Violations[0].File)
}

func TestRule1AStateReachableOnlyThroughABlockedEdgePassesItsSuccessorsStillNeedARoute(t *testing.T) {
	noViolations(t, run(t, fixture.Compliant())) // search-failed: blocked in, retry out
	tail := "---\ntype: design-state\ntags: [cookbook]\nsummary: 失败后的下一步\npage: \"[[cookbook]]\"\nedges: []\n---\n\n## 这一屏\n\n空。\n\n## 应看到什么\n\n- 空\n"
	r := run(t, bend(t, map[string]edit{FAILED: sub("action: click", "action: click\n  - id: give-up\n    to: \"[[cookbook--after-failure]]\"\n    kind: user\n    component: \"[[RetryButton]]\"\n    locate: { role: button, name: 放弃 }\n    action: click")},
		map[string]string{P("pages/cookbook/cookbook--after-failure.md"): tail}))
	wantRules(t, r, 1) // reached only from a state that nobody can enter
	matches(t, `cookbook--after-failure`, r.Violations[0].Message)
}

func TestRule1DroppingBlockedFromTheOnlyWayInDoesNotHideAnUnreachableState(t *testing.T) {
	// make search-failed's only incoming edge go away entirely: nothing reaches it and nothing is blocked
	r := run(t, bend(t, map[string]edit{LOADING: subRe(`  - id: fail(?s:.*?)\] \}`, "")}, nil))
	if len(named(r, 1, "cookbook--search-failed")) < 1 {
		t.Fatal(dump(r))
	}
}

// ---------- rule 2: async ----------

func TestRule2AsyncMissingOneOfItsThreeItems(t *testing.T) {
	r := run(t, bend(t, map[string]edit{LIST: sub("  failure: \"[[cookbook--search-failed]]\"\n", "")}, nil))
	wantRules(t, r, 2)
	matches(t, `async\.failure`, r.Violations[0].Field)
}

func TestRule2AsyncItemsMustBeAnExistingStateOr不适用(t *testing.T) {
	wantRules(t, run(t, bend(t, map[string]edit{LIST: sub("loading: \"[[cookbook--search-loading]]\"", "loading: \"[[cookbook--nowhere]]\"")}, nil)), 2)
	wantRules(t, run(t, bend(t, map[string]edit{LIST: sub("empty: 不适用", "empty: 暂时没有")}, nil)), 2)
	wantRules(t, run(t, bend(t, map[string]edit{LIST: sub("empty: 不适用", "empty: \"[[RecipeCard]]\"")}, nil)), 2)
}

// ---------- rule 3: references ----------

func TestRule3AnUnresolvableWikilinkInTheBodyNamesFileAndLine(t *testing.T) {
	r := run(t, bend(t, map[string]edit{COOKBOOK: sub("页面描述。", "页面描述，见 [[no-such-note]]。")}, nil))
	wantRules(t, r, 3)
	matches(t, `no-such-note`, r.Violations[0].Message)
}

func TestRule3AnUnresolvableWikilinkInFrontmatterNamesTheField(t *testing.T) {
	r := run(t, bend(t, map[string]edit{LIST: sub("components: [\"[[RecipeCard]]\"]", "components: [\"[[RecipeCrad]]\"]")}, nil))
	if len(named(r, 3, "cookbook--list.md", "components[0]", "RecipeCrad")) != 1 {
		t.Fatal(dump(r))
	}
}

func TestRule3AnEdgeComponentMustBeAComponentAndAnEdgeMotionAMotion(t *testing.T) {
	comp := run(t, bend(t, map[string]edit{LIST: sub("component: \"[[SearchBox]]\"", "component: \"[[save-pop]]\"")}, nil))
	if len(named(comp, 3, "cookbook--list.md", "edges[0].component", "要component")) != 1 {
		t.Fatal(dump(comp))
	}
	motion := run(t, bend(t, map[string]edit{RESULTS: sub("motion: \"[[save-pop]]\"", "motion: \"[[SaveButton]]\"")}, nil))
	if len(named(motion, 3, "cookbook--search-results.md", "edges[0].motion", "要motion")) != 1 {
		t.Fatal(dump(motion))
	}
}

func TestRule3ABasenameThatAppearsTwiceUnderDocsIsReported(t *testing.T) {
	r := run(t, bend(t, nil, map[string]string{"docs/reference/RecipeCard.md": "# 另一份同名文件\n"}))
	if len(named(r, 3, "RecipeCard", "重复")) != 1 {
		t.Fatal(dump(r))
	}
}

func TestRule3TicketFilesAndIndexMdMayRepeatNames(t *testing.T) {
	r := run(t, bend(t, nil, map[string]string{"docs/spec/third/tickets/01-first.md": "# x\n", "docs/spec/index.md": "# x\n"}))
	noViolations(t, r)
}

// ---------- rule 4: journeys ----------

func TestRule4TwoStatesWithNoEdgeBetweenThem(t *testing.T) {
	r := run(t, bend(t, map[string]edit{SAVE_JOUR: sub("  - \"[[cookbook--search-loading]]\"\n", "")}, nil))
	wantRules(t, r, 4)
	matches(t, `cookbook--list.*cookbook--search-results`, r.Violations[0].Message)
}

func TestRule4SeveralEdgesBetweenTwoStatesNeedAViaThatNamesOneOfThem(t *testing.T) {
	noVia := run(t, bend(t, map[string]edit{SAVE_JOUR: sub("{ state: \"[[cookbook--search-results]]\", via: save }", "\"[[cookbook--search-results]]\"")}, nil))
	wantRules(t, noVia, 4)
	matches(t, `save.*save-key`, noVia.Violations[0].Message)
	badVia := run(t, bend(t, map[string]edit{SAVE_JOUR: sub("via: save }", "via: nope }")}, nil))
	wantRules(t, badVia, 4)
	matches(t, `nope`, badVia.Violations[0].Message)
}

// ---------- rule 5: decisions and candidates ----------

func TestRule5AStateFileWithADecisionSection(t *testing.T) {
	r := run(t, bend(t, map[string]edit{LIST: func(s string) string {
		return s + "\n## 决定\n\n### 决定 1：x\n- 为什么：y\n- 否掉过：无\n- 来源：[[" + slug + "]]\n"
	}}, nil))
	wantRules(t, r, 5)
	matches(t, `cookbook--list\.md$`, r.Violations[0].File)
}

func TestRule5ADecisionMissingAnyOfItsThreeItems(t *testing.T) {
	for _, label := range []string{"为什么", "否掉过", "来源"} {
		r := run(t, bend(t, map[string]edit{RECIPE_CARD: subRe(`(?m)^- `+label+`：.*\n?`, "")}, nil))
		wantRules(t, r, 5)
		matches(t, "缺「"+label+"」", r.Violations[0].Message)
	}
}

func TestRule5否掉过MaySay无ButNotBeEmpty(t *testing.T) {
	wantRules(t, run(t, bend(t, map[string]edit{RECIPE_CARD: sub("- 否掉过：无", "- 否掉过：")}, nil)), 5)
}

func TestRule5ACandidateMissingAnyOf并进为什么证据(t *testing.T) {
	for _, label := range []string{"并进", "为什么", "证据"} {
		r := run(t, bend(t, map[string]edit{SAVE_POP: subRe(`(?m)^  - `+label+`：.*\n?`, "")}, nil))
		wantRules(t, r, 5)
		matches(t, "缺「"+label+"」", r.Violations[0].Message)
	}
}

func TestRule5BothSectionsMustExistAndMustNotBeLeftEmpty(t *testing.T) {
	noCandidates := run(t, bend(t, map[string]edit{COOKBOOK: sub("## 设计法候选\n\n无", "")}, nil))
	wantRules(t, noCandidates, 5)
	matches(t, `设计法候选`, noCandidates.Violations[0].Message)
	pantry := P("pages/pantry/pantry.md")
	wantRules(t, run(t, bend(t, map[string]edit{pantry: sub("## 决定\n\n无", "## 决定\n")}, nil)), 5)
	wantRules(t, run(t, bend(t, map[string]edit{pantry: sub("## 决定\n\n无\n\n", "")}, nil)), 5)
}

func TestRule5DecisionNumbersAreNotReusedWithinAFile(t *testing.T) {
	dup := "\n### 决定 1：再来一条\n- 为什么：y\n- 否掉过：无\n- 来源：[[" + slug + "]]\n"
	r := run(t, bend(t, map[string]edit{RECIPE_CARD: sub("## 设计法候选", dup+"\n## 设计法候选")}, nil))
	wantRules(t, r, 5)
	matches(t, `编号重复`, r.Violations[0].Message)
}

// ---------- rule 6: motions and usedBy ----------

func TestRule6ALiteralDurationOrEasingNeedsDeviates(t *testing.T) {
	r := run(t, bend(t, map[string]edit{SAVE_POP: subRe(`(?m)^deviates:.*\n`, "")}, nil))
	wantRules(t, r, 6)
	eq(t, r.Violations[0].Field, "deviates")
	// a token reference needs none (spinner-ring is the compliant example)
	noViolations(t, run(t, fixture.Compliant()))
}

func TestRule6UsedByAbsentCountsAsNotGenerated(t *testing.T) {
	r := run(t, bend(t, map[string]edit{P("components/SearchBox/SearchBox.md"): subRe(`(?m)^usedBy:.*\n`, "")}, nil))
	wantRules(t, r, 6)
	matches(t, `未生成`, r.Violations[0].Message)
}

func TestRule6UsedByMustMatchTheReferencesActuallyFound(t *testing.T) {
	stale := run(t, bend(t, map[string]edit{P("components/NavBar/NavBar.md"): sub(`usedBy: ["[[cookbook]]", "[[pantry]]"]`, `usedBy: ["[[cookbook]]"]`)}, nil))
	wantRules(t, stale, 6)
	matches(t, `少了 \[\[pantry\]\]`, stale.Violations[0].Message)
	extra := run(t, bend(t, map[string]edit{SPINNER: sub(`usedBy: ["[[cookbook]]"]`, `usedBy: ["[[cookbook]]", "[[pantry]]"]`)}, nil))
	wantRules(t, extra, 6)
	matches(t, `多了 \[\[pantry\]\]`, extra.Violations[0].Message)
	skipped := runWith(t, bend(t, map[string]edit{SPINNER: sub(`usedBy: ["[[cookbook]]"]`, `usedBy: []`)}, nil), Options{UsedBy: false})
	noViolations(t, skipped)
}

func TestRule6WithUsedByOffLinksInUsedByThatNoLongerResolveAreNotJudgedEitherWithItOnTheyAre(t *testing.T) {
	stale := map[string]edit{SPINNER: sub(`usedBy: ["[[cookbook]]"]`, `usedBy: ["[[cookbook]]", "[[gone]]"]`)}
	noViolations(t, runWith(t, bend(t, stale, nil), Options{UsedBy: false}))
	seen := map[int]bool{}
	for _, x := range rules(run(t, bend(t, stale, nil))) {
		seen[x] = true
	}
	eq(t, seen, map[int]bool{3: true, 6: true})
}

// ---------- delta overlay ----------

var (
	DELTA = "docs/design/tmp/" + slug + "/delta"
)

func D(rel string) string { return DELTA + "/" + rel }

func deltaFiles() fixture.Files {
	base := fixture.Compliant()
	shareSheet := "---\ntype: design-state\ntags: [cookbook]\nsummary: 分享面板\npage: \"[[cookbook]]\"\nedges: []\n---\n\n## 这一屏\n\n分享面板。\n\n## 应看到什么\n\n- 看到分享面板\n"
	shareButton := "---\ntype: design-component\ntags: [component]\nsummary: 分享按钮\ncode: [src/components/ShareButton.tsx]\nusedBy: [\"[[cookbook]]\"]\n---\n\n# ShareButton\n\n## 决定\n\n无\n\n## 设计法候选\n\n无\n"
	f := fixture.Files{}
	for k, v := range base {
		f[k] = v
	}
	// changed: results gains a share edge
	f[D("pages/cookbook/cookbook--search-results.md")] = strings.Replace(base[RESULTS], "action: 聚焦后按回车",
		"action: 聚焦后按回车\n  - id: share\n    to: \"[[cookbook--share-sheet]]\"\n    kind: user\n    component: \"[[ShareButton]]\"\n    locate: { role: button, name: 分享 }\n    action: click", 1)
	// added
	f[D("pages/cookbook/cookbook--share-sheet.md")] = shareSheet
	f[D("components/ShareButton/ShareButton.md")] = shareButton
	// changed: overview loses the edge to the state that goes away
	f[D("pages/pantry/pantry--overview.md")] = subRe(`  - id: empty-shelf(?s:.*?)删除全部食材记录`, "")(base[OVERVIEW])
	f[D("removed.md")] = "# 删除\n\n- [[pantry--empty]] —— 空状态并入 overview\n"
	return f
}

func TestDeltaObjectsInDeltaReplaceProdOnesRemovedMdDropsTheRestAndTheResultIsJudged(t *testing.T) {
	r := runWith(t, deltaFiles(), Options{Delta: slug, UsedBy: true})
	noViolations(t, r)
	a := r.Archive
	if a.Objects["cookbook--share-sheet"] == nil || a.Objects["ShareButton"] == nil {
		t.Fatal("delta additions missing")
	}
	if a.Objects["pantry--empty"] != nil {
		t.Fatal("pantry--empty should be removed")
	}
	want := &archive.DeltaInfo{
		Slug:    slug,
		Added:   []string{"ShareButton", "cookbook--share-sheet"},
		Changed: []string{"cookbook--search-results", "pantry--overview"},
		Removed: []string{"pantry--empty"},
	}
	sort.Strings(want.Added)
	sort.Strings(want.Changed)
	eq(t, a.Delta, want)
	eq(t, a.Objects["cookbook--search-results"].Source, "delta")
	eq(t, len(archive.OutgoingEdges(a, "pantry--overview")), 1)
}

func TestDeltaWithoutTheOverlayTheProdArchiveIsStillTheOneJudged(t *testing.T) {
	r := run(t, deltaFiles())
	noViolations(t, r)
	if r.Archive.Objects["pantry--empty"] == nil {
		t.Fatal("pantry--empty should still be in prod")
	}
	if r.Archive.Delta != nil {
		t.Fatal("no delta expected")
	}
}

func TestDeltaARemovalThatLeavesADanglingEdgeIsCaught(t *testing.T) {
	files := deltaFiles()
	delete(files, D("pages/pantry/pantry--overview.md"))
	r := runWith(t, files, Options{Delta: slug, UsedBy: true})
	if len(named(r, 3, "pantry--overview.md", "pantry--empty")) < 1 {
		t.Fatal(dump(r))
	}
}

func TestDeltaAChangedObjectThatBreaksARuleIsCaughtUnderItsDeltaPath(t *testing.T) {
	files := deltaFiles()
	k := D("pages/cookbook/cookbook--share-sheet.md")
	files[k] = strings.Replace(files[k], "page: \"[[cookbook]]\"", "page: \"[[cookbook]]\"\nasync:\n  loading: \"[[cookbook--share-sheet]]\"", 1)
	r := runWith(t, files, Options{Delta: slug, UsedBy: true})
	if len(named(r, 2, DELTA+"/pages/cookbook/cookbook--share-sheet.md", "async.failure")) != 1 {
		t.Fatal(dump(r))
	}
}

func TestDeltaAnUnknownSpecSlugIsAnErrorNotAnEmptyOverlay(t *testing.T) {
	_, err := Run(repo(t, fixture.Compliant()), Options{Delta: "nope", UsedBy: true})
	if err == nil {
		t.Fatal("want an error")
	}
	matches(t, `没有 .*nope`, err.Error())
}

// ---------- the old per-spec layout ----------

func TestLegacyLayoutOneNotePerOldDirectoryNothingReadNoViolation(t *testing.T) {
	r := run(t, bend(t, nil, map[string]string{
		"docs/design/old-spec-a/old-spec-a-design.md": "---\ntype: [broken\n---\n乱七八糟 [[nowhere]]\n",
		"docs/design/old-spec-b/canvas.html":          "<html></html>\n",
	}))
	noViolations(t, r)
	if len(r.Notes) != 2 {
		t.Fatalf("notes: %v", r.Notes)
	}
	matches(t, `docs/design/old-spec-a/.*旧布局.*建议删`, r.Notes[0])
}

// ---------- rule 8: an edge's screenshot (`shot`) ----------

var SHOT_SAVE = "shot: " + fixture.ShotState + "@save.png"

func TestRule8ThreeUserEdgesWithShotTwoSharingOneImagePassWithNoViolationAndNoNote(t *testing.T) {
	files := fixture.Shot()
	if n := len(regexp.MustCompile(`(?m)^ {4}shot: `).FindAllString(files[fixture.ShotStateFile], -1)); n != 3 {
		t.Fatalf("shot edges = %d", n)
	}
	r := run(t, files)
	noViolations(t, r)
	noNotes(t, r)
}

func TestRule8AnEdgeWithoutShotIsNotJudgedItsComponentIsInTheMainViewportImage(t *testing.T) {
	wantRules(t, run(t, fixture.Compliant()))
	wantRules(t, run(t, fixture.Marketing()))
}

func TestRule8WhetherTheImageFileExistsIsNotChecked(t *testing.T) {
	root := repo(t, fixture.Shot())
	if _, err := os.Stat(filepath.Join(root, base, "pages/cookbook/assets", fixture.ShotState+"@save.png")); err == nil {
		t.Fatal("the image should not exist")
	}
	r, err := Run(root, Defaults())
	if err != nil {
		t.Fatal(err)
	}
	noViolations(t, r)
}

func TestRule8BreaksEachGiveOneRule8Violation(t *testing.T) {
	st := fixture.ShotState
	type brk struct {
		name   string
		file   string
		edit   edit
		field  string
		needle string
	}
	for _, b := range []brk{
		{"`shot` named after another state", fixture.ShotStateFile, sub(SHOT_SAVE, "shot: cookbook--list@save.png"), "edges[0].shot", "出发状态"},
		{"`shot` with no state id in front", fixture.ShotStateFile, sub(SHOT_SAVE, "shot: save.png"), "edges[0].shot", "<出发状态 id>@<边 id>.png"},
		{"`shot` that is not a .png", fixture.ShotStateFile, sub(st+"@save-all.png", st+"@save-all.jpg"), "edges[2].shot", ".png"},
		{"`shot` with an empty edge id", fixture.ShotStateFile, sub(st+"@save-all.png", st+"@.png"), "edges[2].shot", "<出发状态 id>@<边 id>.png"},
		{"`shot` that is not a string", fixture.ShotStateFile, sub("shot: "+st+"@save-all.png", "shot: 3"), "edges[2].shot", "<出发状态 id>@<边 id>.png"},
		{"`shot` whose edge id is not an edge of the state", fixture.ShotStateFile, sub(st+"@save-all.png", st+"@nowhere.png"), "edges[2].shot", "nowhere"},
		{"`shot` on a `system` edge", LOADING, sub("    trigger: 搜索请求完成", "    shot: cookbook--search-loading@done.png\n    trigger: 搜索请求完成"), "edges[0].shot", "system"},
		{"`shot` on a state that declares `sections`", mktFile, sub("    locate: { role: link, name: 菜谱 }\n", "    locate: { role: link, name: 菜谱 }\n    shot: "+fixture.MKTEntry+"@nav-home.png\n"), "edges[0].shot", "sections"},
	} {
		t.Run(b.name, func(t *testing.T) {
			var files fixture.Files
			if b.file == mktFile {
				files = bendMkt(t, map[string]edit{b.file: b.edit})
			} else {
				files = bendShot(t, map[string]edit{b.file: b.edit})
			}
			r := run(t, files)
			v := ofRule(r, 8)
			if len(v) != 1 {
				t.Fatalf("want one rule 8 violation:\n%s", dump(r))
			}
			if !strings.HasSuffix(v[0].File, ".md") || v[0].Field != b.field {
				t.Fatalf("%+v", v[0])
			}
			if !strings.Contains(v[0].Message, b.needle) {
				t.Fatal(v[0].Message)
			}
			if o := notOfRule(r, 8); len(o) != 0 {
				t.Fatalf("only rule 8 is broken:\n%s", dump(r))
			}
		})
	}
}

func TestRule8TheReferencesDescribeShotAndListExactlyTheRulesUnderTheirNames(t *testing.T) {
	dir := filepath.Join("..", "..", "..", "..", "idea-loop", "skills", "design", "design-archive", "references")
	read := func(name string) string {
		b, err := os.ReadFile(filepath.Join(dir, name))
		if err != nil {
			t.Skipf("the skill's references are not here: %v", err)
		}
		return string(b)
	}
	listed := map[string]string{}
	for _, m := range regexp.MustCompile(`(?m)^\| (\d+) (\S+?) \|`).FindAllStringSubmatch(read("check.md"), -1) {
		listed[m[1]] = m[2]
	}
	want := map[string]string{}
	for n, name := range Rules {
		want[string(rune('0'+n))] = name
	}
	eq(t, listed, want)
	matches(t, `## 规则 8 的逐条违规与提示`, read("check.md"))
	matches(t, "`shot`.*<出发状态 id>@<边 id>\\.png", read("writing.md"))
	matches(t, "`shot`.*`shotExists`", read("query.md"))
}

// ---------- rule 7: sections of a long entry state ----------

func TestRule7TheMarketingFixturePassesWithNoNotes(t *testing.T) {
	r := run(t, fixture.Marketing())
	noViolations(t, r)
	noNotes(t, r)
}

func TestRule7APageWithoutSectionsIsJudgedExactlyAsBefore(t *testing.T) {
	wantRules(t, run(t, fixture.Compliant()))
}

func TestRule7BreaksEachGiveOneRule7Violation(t *testing.T) {
	type brk struct {
		name    string
		edits   map[string]edit
		field   string
		needle  string
		renames [][2]string
	}
	for _, b := range []brk{
		{"a type outside the closed set", nil, "sections[3]", "类型", [][2]string{{"feature-b", "closing-band"}}},
		{"a type and the same type with a qualifier side by side", nil, "sections", "限定词", [][2]string{{"feature-a", "feature"}}},
		{"a repeated id", map[string]edit{mktFile: sub("  - { id: footer,", "  - { id: feature-a, locate: { role: heading, name: 另一段 } }\n  - { id: footer,")}, "sections[4]", "重名", nil},
		{"sections on a state that is not an entry", map[string]edit{MKT_FEAT_B: sub("edges: []", "sections:\n  - { id: hero, locate: { position: 1 } }\nedges: []")}, "sections", "入口", nil},
		{"an edge leaving from an undeclared section", map[string]edit{mktFile: sub("from: mkt-pricing#header", "from: mkt-pricing#nowhere")}, "edges[0].from", "nowhere", nil},
		{"an edge landing on a section the target does not have", map[string]edit{LIST: sub("section: mkt-pricing#feature-b", "section: mkt-pricing#faq")}, "edges[2].section", "faq", nil},
		{"an edge with `section` whose target is not an entry state", map[string]edit{mktFile: sub("    from: mkt-pricing#feature-b\n", "    from: mkt-pricing#feature-b\n    section: mkt-pricing#feature-b\n")}, "edges[3].section", "入口", nil},
		{"a `user` edge without `from` on an entry state with sections", map[string]edit{mktFile: sub("    from: mkt-pricing#header\n", "")}, "edges[0].from", "出发", nil},
		{"a reference written as a wikilink", map[string]edit{mktFile: sub("from: mkt-pricing#header", "from: \"[[mkt-pricing#header]]\"")}, "edges[0].from", "普通字符串", nil},
	} {
		t.Run(b.name, func(t *testing.T) {
			r := run(t, bendMkt(t, b.edits, b.renames...))
			v := ofRule(r, 7)
			if len(v) != 1 {
				t.Fatalf("want one rule 7 violation:\n%s", dump(r))
			}
			if !strings.HasSuffix(v[0].File, ".md") || !strings.Contains(v[0].Field, b.field) {
				t.Fatalf("%+v", v[0])
			}
			if !strings.Contains(v[0].Message, b.needle) {
				t.Fatal(v[0].Message)
			}
			if o := notOfRule(r, 7); len(o) != 0 {
				t.Fatalf("only rule 7 is broken:\n%s", dump(r))
			}
		})
	}
}

func scrollDriven(value string) map[string]edit {
	return map[string]edit{mktFile: sub("  - { id: feature-a, locate: { role: heading, name: 无限菜谱 } }", "  - { id: feature-a, locate: { role: heading, name: 无限菜谱 }, scrollDriven: "+value+" }")}
}

func TestRule7ScrollDrivenOtherThanTrueIsOneRule7Violation(t *testing.T) {
	for _, value := range []string{"false", `"yes"`, "1"} {
		r := run(t, bendMkt(t, scrollDriven(value)))
		v := ofRule(r, 7)
		if len(v) != 1 {
			t.Fatalf("%s: want one rule 7 violation:\n%s", value, dump(r))
		}
		eq(t, v[0].File, mktFile)
		eq(t, v[0].Field, "sections[2].scrollDriven")
		matches(t, `只能写 true`, v[0].Message)
		if o := notOfRule(r, 7); len(o) != 0 {
			t.Fatalf("only rule 7 is broken:\n%s", dump(r))
		}
	}
}

func TestRule7ScrollDrivenTrueIsAcceptedWithNoViolationAndNoNote(t *testing.T) {
	r := run(t, bendMkt(t, scrollDriven("true")))
	noViolations(t, r)
	noNotes(t, r)
}

func TestRule7TwoEntryStatesOfOnePageBothDeclaringSectionsIsReported(t *testing.T) {
	files := fixture.Marketing()
	text := files[mktFile]
	text = regexp.MustCompile(`edges:(?s:.*)$`).ReplaceAllString(text, "edges: []\n---\n\n## 这一屏\n\n第二个入口。\n\n## 应看到什么\n\n- 看到页面\n")
	text = regexp.MustCompile(`from: [^\n]+\n`).ReplaceAllString(text, "")
	text = strings.Replace(text, "url: /pricing", "url: /pricing-b", 1)
	files[base+"/pages/"+mkt+"/"+mkt+"--second-entry.md"] = text
	v := ofRule(run(t, files), 7)
	if len(v) != 1 {
		t.Fatalf("%+v", v)
	}
	matches(t, `两个入口`, v[0].Message)
}

func TestRule7ALocateThatIsNoneOfTheThreeShapesIsReported(t *testing.T) {
	for _, bad := range []string{"{ role: heading }", "{ role: link, name: x }", "{ position: 0 }", "{ position: 1.5 }", "{ role: banner, name: x }", "{ text: 价格 }"} {
		r := run(t, bendMkt(t, map[string]edit{mktFile: sub("{ role: contentinfo }", bad)}))
		v := ofRule(r, 7)
		if len(v) != 1 {
			t.Fatalf("%s: %s", bad, dump(r))
		}
		matches(t, `sections\[4\]\.locate`, v[0].Field)
	}
}

func TestRule7AnIdThatIsNotTypeOrTypeQualifierInKebabCaseIsAFormatErrorNotAnUnknownType(t *testing.T) {
	for _, bad := range []string{"Hero", "hero_2", "hero-", "hero--x", "feature-A"} {
		r := run(t, bendMkt(t, map[string]edit{mktFile: sub("id: hero,", "id: "+bad+",")}))
		var v []Violation
		for _, x := range r.Violations {
			if x.Rule == 7 && regexp.MustCompile(`sections\[1\]`).MatchString(x.Field) {
				v = append(v, x)
			}
		}
		if len(v) != 1 {
			t.Fatalf("%s: %s", bad, dump(r))
		}
		matches(t, `写法|kebab`, v[0].Message)
	}
}

func TestRule7TheLongestTypePrefixWins(t *testing.T) {
	ok := run(t, bendMkt(t, nil, [2]string{"feature-a", "feature-grid-pricing"}))
	eq(t, len(ofRule(ok, 7)), 0)
	alone := run(t, bendMkt(t, nil, [2]string{"feature-a", "feature-grid"}, [2]string{"feature-b", "feature-grid-pricing"}))
	found := false
	for _, x := range alone.Violations {
		if x.Rule == 7 && strings.Contains(x.Message, "限定词") {
			found = true
		}
	}
	if !found {
		t.Fatalf("feature-grid and feature-grid-pricing are the same type twice:\n%s", dump(alone))
	}
}

func TestRule7NotesContentAndAPositionLocateAreHintsNotViolations(t *testing.T) {
	r := run(t, bendMkt(t, map[string]edit{mktFile: sub("{ role: heading, name: 食材库同步 }", "{ position: 2 }")}, [2]string{"feature-a", "content"}))
	noViolations(t, r)
	if len(r.Notes) != 2 {
		t.Fatalf("notes: %v", r.Notes)
	}
	has := func(a, b string) bool {
		for _, n := range r.Notes {
			if regexp.MustCompile(a).MatchString(n) && regexp.MustCompile(b).MatchString(n) {
				return true
			}
		}
		return false
	}
	if !has(`content`, `sections\[2\]`) || !has(`位置|脆`, `sections\[3\]`) {
		t.Fatalf("notes: %v", r.Notes)
	}
}

func TestRule7AStateSectionThatThePageDidNotDeclareIsReportedTheEntryStateDoesNotCarryOne(t *testing.T) {
	bad := run(t, bendMkt(t, map[string]edit{MKT_FEAT_B: sub("section: mkt-pricing#feature-b", "section: mkt-pricing#faq")}))
	v := ofRule(bad, 7)
	if len(v) != 1 {
		t.Fatal(dump(bad))
	}
	eq(t, v[0].Field, "section")
	other := run(t, bendMkt(t, map[string]edit{MKT_FEAT_B: sub("section: mkt-pricing#feature-b", "section: cookbook#hero")}))
	eq(t, len(ofRule(other, 7)), 1)
	entry := run(t, bendMkt(t, map[string]edit{mktFile: sub("edges:", "section: mkt-pricing#hero\nedges:")}))
	eq(t, len(ofRule(entry, 7)), 1)
}

// ---------- after the trial scan: `when`, a text locate, workspace prefixes ----------

const searchEdge = "locate: { role: searchbox, name: 搜索菜谱 }"

func TestAnEdgeMayCarryWhenAnEmptyOrNonStringOneIsAStructureViolationNamingTheField(t *testing.T) {
	ok := run(t, bend(t, map[string]edit{LIST: sub(searchEdge, searchEdge+"\n    when: 从首页进来时")}, nil))
	noViolations(t, ok)
	for _, bad := range []string{`""`, "[a, b]", "{ x: 1 }"} {
		r := run(t, bend(t, map[string]edit{LIST: sub(searchEdge, searchEdge+"\n    when: "+bad)}, nil))
		v := named(r, 0, "when")
		if len(v) != 1 {
			t.Fatalf("%s: %s", bad, dump(r))
		}
		matches(t, `edges\[\d+\]\.when`, v[0].Field)
	}
}

func TestTheParsedEdgeCarriesWhenNilWhenNotWritten(t *testing.T) {
	a, err := archive.Load(repo(t, bend(t, map[string]edit{LIST: sub(searchEdge, searchEdge+"\n    when: 从首页进来时")}, nil)), archive.Options{})
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range archive.OutgoingEdges(a, "cookbook--list") {
		if e.ID == "search" {
			eq(t, e.When, "从首页进来时")
		} else if e.When != nil {
			t.Fatalf("edge %s: when = %v", e.ID, e.When)
		}
	}
}

func TestAUserEdgeMayLocateByTextAloneButTextMixedWithRoleOrEmptyIsNotALocate(t *testing.T) {
	ok := run(t, bend(t, map[string]edit{LIST: sub(searchEdge, "locate: { text: 搜索菜谱 }")}, nil))
	noViolations(t, ok)
	for _, bad := range []string{`{ text: "" }`, "{ text: 搜索菜谱, role: searchbox }", "{ text: 搜索菜谱, name: x }", "{ text: [a] }"} {
		r := run(t, bend(t, map[string]edit{LIST: sub(searchEdge, "locate: "+bad)}, nil))
		v := named(r, 0, "locate")
		if len(v) != 1 {
			t.Fatalf("%s: %s", bad, dump(r))
		}
		matches(t, `edges\[\d+\]\.locate`, v[0].Field)
	}
}

func TestAsyncAFailureStateMayBelongToAnotherPage(t *testing.T) {
	r := run(t, bend(t, map[string]edit{LIST: sub(`failure: "[[cookbook--search-failed]]"`, `failure: "[[pantry--empty]]"`)}, nil))
	if v := named(r, 2); len(v) != 0 {
		t.Fatal(dump(r))
	}
}

var componentNames = []string{"NavBar", "RecipeCard", "RetryButton", "SaveButton", "SearchBox"}

func withWorkspaces(list string) edit {
	return sub("locale: zh-CN", "locale: zh-CN\nworkspaces: "+list)
}

func prefixHits(r Result) []Violation {
	var out []Violation
	for _, x := range r.Violations {
		if x.File != INDEX_FILE && strings.Contains(x.Message, "前缀") {
			out = append(out, x)
		}
	}
	return out
}

func TestWorkspacesInProdIndexAComponentFileNameMustStartWithOneOfThePrefixes(t *testing.T) {
	r := run(t, bend(t, map[string]edit{INDEX_FILE: withWorkspaces("[mkt, app]")}, nil))
	v := prefixHits(r)
	got, want := []string{}, []string{}
	for _, x := range v {
		got = append(got, x.File)
		if x.Rule != 0 {
			t.Fatalf("rule %d", x.Rule)
		}
	}
	for _, n := range componentNames {
		want = append(want, P("components/"+n+"/"+n+".md"))
	}
	sort.Strings(got)
	sort.Strings(want)
	eq(t, got, want)
	matches(t, `mkt-`, v[0].Message)
	matches(t, `app-`, v[0].Message)
	if len(r.Violations) != len(v) {
		t.Fatalf("nothing else is broken:\n%s", dump(r))
	}
}

func TestWorkspacesComponentsNamedWithADeclaredPrefixPassAndAProjectThatDeclaresNoneIsNotJudged(t *testing.T) {
	files := fixture.Compliant()
	moved := fixture.Files{}
	compRe := regexp.MustCompile(`components/([^/]+)/([^/]+)\.md$`)
	for path, text := range files {
		target := path
		if m := compRe.FindStringSubmatch(path); m != nil && m[1] == m[2] {
			target = strings.Replace(path, m[1]+"/"+m[1]+".md", "mkt-"+m[1]+"/mkt-"+m[1]+".md", 1)
		}
		for _, n := range componentNames {
			text = strings.ReplaceAll(text, "[["+n+"]]", "[[mkt-"+n+"]]")
			text = subRe(`(?m)^# `+n+`$`, "# mkt-"+n)(text)
		}
		moved[target] = text
	}
	moved[INDEX_FILE] = withWorkspaces("[mkt, app]")(moved[INDEX_FILE])
	r := run(t, moved)
	noViolations(t, r)
	noViolations(t, run(t, fixture.Compliant())) // no workspaces key, no prefix rule
}

func TestWorkspacesAValueThatIsNotANonEmptyListOfKebabCaseWordsIsOneViolationOnTheIndex(t *testing.T) {
	for _, bad := range []string{"mkt", "[]", "[Mkt]", "[mkt, 3]", "{ a: b }"} {
		r := run(t, bend(t, map[string]edit{INDEX_FILE: withWorkspaces(bad)}, nil))
		var v []Violation
		for _, x := range r.Violations {
			if x.File == INDEX_FILE {
				v = append(v, x)
			}
		}
		if len(v) != 1 {
			t.Fatalf("%s: %s", bad, dump(r))
		}
		eq(t, v[0].Field, "workspaces")
		eq(t, len(prefixHits(r)), 0)
	}
}

func TestCheckThePrefixesCanAlsoComeFromTheCallerAndThenBeatTheIndex(t *testing.T) {
	r := runWith(t, fixture.Compliant(), Options{UsedBy: true, Workspaces: []string{"mkt"}})
	eq(t, len(prefixHits(r)), 5)
	declared := bend(t, map[string]edit{INDEX_FILE: withWorkspaces("[mkt]")}, nil)
	eq(t, len(prefixHits(run(t, declared))), 5)
	r2 := runWith(t, declared, Options{UsedBy: true, Workspaces: []string{"app"}})
	matches(t, `app-`, prefixHits(r2)[0].Message)
}

// ---------- pieces of the output ----------

func TestFormatAndViolationJSONKeepTheOldShape(t *testing.T) {
	v := Violation{Rule: 8, File: "a.md", Field: "edges[2].shot", Message: "m"}
	eq(t, Format(v), "违规 [规则 8 边的截图] a.md · edges[2].shot：m")
	eq(t, Format(Violation{Rule: 1, File: "a.md", Message: "m"}), "违规 [规则 1 可达] a.md：m")
	b, err := json.Marshal(Violation{Rule: 1, File: "a.md", Message: "m"}.Map())
	if err != nil {
		t.Fatal(err)
	}
	eq(t, string(b), `{"rule":1,"file":"a.md","field":null,"message":"m"}`)
}
