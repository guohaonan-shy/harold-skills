package query

import (
	"regexp"
	"sort"
	"strings"
	"testing"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/design/fixture"
)

// The tests here are the assertions of the old design-archive-query.test.mjs, in its order.

var lonely = P("pages/cookbook/cookbook--lonely.md")

func lonelyState(summary string) string {
	return "---\ntype: design-state\ntags: [cookbook]\nsummary: " + summary + "\npage: \"[[cookbook]]\"\nedges: []\n---\n\n## 这一屏\n\n孤岛。\n\n## 应看到什么\n\n- 什么都看不到\n"
}

// withLonelyState is the compliant fixture plus a state nothing points to and nothing explains.
func withLonelyState() fixture.Files {
	f := fixture.Compliant()
	f[lonely] = lonelyState("谁也进不来的一屏")
	return f
}

// ---------- 进入方式 ----------

func TestEnterAnEntryStateIsItsOwnWayIn(t *testing.T) {
	r := okMap(t)(EnterState(archiveOf(t, fixture.Compliant()), "cookbook--list"))
	eq(t, g(r, "reachable"), true)
	eq(t, g(r, "steps"), []any{})
	eq(t, g(r, "entry", "state"), "cookbook--list")
	eq(t, g(r, "entry", "url"), "/cookbook")
	eq(t, g(r, "entry", "preconditions"), js(t, `{"account":"已登录的测试账号","data":"至少 3 份已保存菜谱"}`))
	match(t, g(r, "shouldSee"), "已保存的菜谱卡片")
}

func TestEnterABCGivesEntryStepsAndWhatToSee(t *testing.T) {
	r := okMap(t)(EnterState(archiveOf(t, fixture.Compliant()), "cookbook--search-results"))
	eq(t, g(r, "reachable"), true)
	eq(t, g(r, "entry", "url"), "/cookbook")
	eq(t, g(r, "entry", "preconditions", "account"), "已登录的测试账号")
	eq(t, len(list(g(r, "steps"))), 2)
	s0, s1 := g(r, "steps", 0), g(r, "steps", 1)
	eq(t, js(t, `{"id":"search","from":"cookbook--list","to":"cookbook--search-loading","kind":"user"}`),
		map[string]any{"id": g(s0, "id"), "from": g(s0, "from"), "to": g(s0, "to"), "kind": g(s0, "kind")})
	eq(t, g(s0, "component"), "SearchBox")
	eq(t, g(s0, "locate"), js(t, `{"role":"searchbox","name":"搜索菜谱"}`))
	eq(t, g(s0, "action"), "输入关键词并回车")
	eq(t, g(s1, "kind"), "system")
	eq(t, g(s1, "trigger"), "搜索请求完成")
	eq(t, g(s1, "how"), "放行搜索请求")
	eq(t, has(s1, "component"), false)
	match(t, g(r, "shouldSee"), "每张卡片有保存按钮")
}

func TestEnterTheShortestPathWinsAcrossPagesToo(t *testing.T) {
	r := okMap(t)(EnterState(archiveOf(t, fixture.Compliant()), "pantry--empty"))
	eq(t, pick(g(r, "steps"), "to"), strs("pantry--overview", "pantry--empty"))
	eq(t, g(r, "steps", 0, "component"), "NavBar")
}

func TestEnterAStateReachableOnlyThroughABlockedEdgeIsUnreachable(t *testing.T) {
	r := okMap(t)(EnterState(archiveOf(t, fixture.Compliant()), "cookbook--search-failed"))
	eq(t, g(r, "reachable"), false)
	eq(t, g(r, "verdict"), "进不去")
	eq(t, g(r, "undeclared"), false)
	eq(t, len(list(g(r, "blocked"))), 1)
	b := g(r, "blocked", 0)
	eq(t, js(t, `{"id":"fail","from":"cookbook--search-loading","to":"cookbook--search-failed"}`),
		map[string]any{"id": g(b, "id"), "from": g(b, "from"), "to": g(b, "to")})
	eq(t, g(b, "missing"), "一个能让搜索接口稳定失败的开关")
	eq(t, g(b, "tried"), strs("拦截搜索请求返回 500", "用空关键词搜索"))
	eq(t, has(r, "steps"), false)
}

func TestEnterAStateDownstreamOfABlockedOneNamesTheBlockedEdgeUpstream(t *testing.T) {
	files := fixture.Compliant()
	f := P("pages/cookbook/cookbook--search-failed.md")
	files[f] = strings.Replace(files[f], "edges:\n",
		"edges:\n  - id: give-up\n    to: \"[[cookbook--lonely]]\"\n    kind: user\n    component: \"[[RetryButton]]\"\n    locate: { role: button, name: 放弃 }\n    action: click\n", 1)
	files[lonely] = lonelyState("放弃之后")
	r := okMap(t)(EnterState(archiveOf(t, files), "cookbook--lonely"))
	eq(t, g(r, "reachable"), false)
	eq(t, pick(g(r, "blocked"), "id"), strs("fail"))
}

func TestEnterNoPathAndNoBlockedEdgeSaysNothingExplainsIt(t *testing.T) {
	r := okMap(t)(EnterState(archiveOf(t, withLonelyState()), "cookbook--lonely"))
	eq(t, g(r, "reachable"), false)
	eq(t, g(r, "verdict"), "进不去")
	eq(t, g(r, "undeclared"), true)
	eq(t, g(r, "blocked"), []any{})
}

func TestEnterAnUnknownStateOrNonStateIsANotFoundError(t *testing.T) {
	a := archiveOf(t, fixture.Compliant())
	_, err := EnterState(a, "nope")
	qe(t, err, "not-found", "nope")
	_, err = EnterState(a, "NavBar")
	qe(t, err, "", "NavBar.*组件")
}

// ---------- 页面 ----------

func TestPageStatesEdgesRegionsComponentsJourneysMotionsDecisions(t *testing.T) {
	r := okMap(t)(Page(archiveOf(t, fixture.Compliant()), "cookbook"))
	eq(t, g(r, "page", "id"), "cookbook")
	eq(t, g(r, "page", "code"), strs("src/pages/cookbook.tsx"))
	eq(t, g(r, "page", "summary"), "菜谱主页：搜索、保存、进入食材库")

	eq(t, g(r, "regions"), js(t, `[
	  {"name":"顶部导航","component":"NavBar","code":["src/components/NavBar.tsx"]},
	  {"name":"搜索","component":"SearchBox","code":["src/components/SearchBox.tsx"]},
	  {"name":"结果卡片","component":"RecipeCard","code":["src/components/RecipeCard.tsx"]}]`))

	eq(t, pick(g(r, "states"), "id"), strs("cookbook--list", "cookbook--recipe-saved", "cookbook--search-failed", "cookbook--search-loading", "cookbook--search-results"))
	state := func(id string) any {
		for _, s := range list(g(r, "states")) {
			if g(s, "id") == id {
				return s
			}
		}
		t.Fatalf("no state %s", id)
		return nil
	}
	lst := state("cookbook--list")
	eq(t, pick(g(lst, "outgoing"), "id"), strs("search", "open-pantry"))
	eq(t, g(lst, "outgoing", 1, "to"), "pantry--overview") // a cross-page jump is an edge of this state
	eq(t, g(lst, "entry"), js(t, `{"url":"/cookbook","preconditions":{"account":"已登录的测试账号","data":"至少 3 份已保存菜谱"}}`))
	in := []any{}
	for _, e := range list(g(lst, "incoming")) {
		in = append(in, g(e, "from").(string)+":"+g(e, "id").(string))
	}
	eq(t, in, strs("pantry--overview:back"))
	loading := state("cookbook--search-loading")
	inIDs := []string{}
	for _, id := range pick(g(loading, "incoming"), "id") {
		inIDs = append(inIDs, id.(string))
	}
	sort.Strings(inIDs)
	eq(t, strs(inIDs...), strs("retry", "search"))
	eq(t, g(loading, "motions"), strs("spinner-ring"))
	eq(t, g(state("cookbook--recipe-saved"), "entry"), nil)
	eq(t, has(state("cookbook--recipe-saved"), "entry"), true)

	eq(t, pick(g(r, "journeys"), "id"), strs("glance-at-pantry", "save-a-recipe"))
	eq(t, g(r, "journeys", 0, "intent"), "用户在菜谱页中途看一眼食材库，再回到菜谱页")
	eq(t, g(r, "journeys", 1, "states"), strs("cookbook--list", "cookbook--search-loading", "cookbook--search-results", "cookbook--recipe-saved"))

	eq(t, pick(g(r, "motions"), "id"), strs("save-pop", "spinner-ring"))
	own := []any{}
	for _, d := range list(g(r, "decisions")) {
		if g(d, "of", "id") == "cookbook" {
			own = append(own, g(d, "title"))
		}
	}
	eq(t, own, strs("结果只显示一屏，不分页"))
	eq(t, strings.Contains(g(r, "decisions", 0, "why").(string), "翻页"), true)
	match(t, g(r, "decisions", 0, "rejected"), "无限滚动")
}

func TestPageAComponentTwoPagesShareListsBothPages(t *testing.T) {
	a := archiveOf(t, fixture.Compliant())
	for _, page := range []string{"cookbook", "pantry"} {
		r := okMap(t)(Page(a, page))
		var nav any
		for _, c := range list(g(r, "components")) {
			if g(c, "id") == "NavBar" {
				nav = c
			}
		}
		eq(t, g(nav, "usedBy"), strs("cookbook", "pantry"), "seen from "+page)
	}
	pantry := okMap(t)(Page(a, "pantry"))
	eq(t, pick(g(pantry, "journeys"), "id"), strs("glance-at-pantry")) // a journey across two pages shows on both
	for _, s := range list(g(pantry, "states")) {
		if g(s, "id") == "pantry--overview" {
			eq(t, pick(g(s, "incoming"), "from"), strs("cookbook--list"))
		}
	}
}

func TestPageDecisionsAndCandidatesAreTaggedWithWhoseTheyAre(t *testing.T) {
	r := okMap(t)(Page(archiveOf(t, fixture.Compliant()), "cookbook"))
	var card, cand any
	for _, d := range list(g(r, "decisions")) {
		if g(d, "of", "id") == "RecipeCard" {
			card = d
		}
	}
	for _, c := range list(g(r, "candidates")) {
		if g(c, "of", "id") == "save-pop" {
			cand = c
		}
	}
	eq(t, g(card, "of"), js(t, `{"id":"RecipeCard","kind":"component"}`))
	eq(t, g(card, "title"), "卡片标题最多两行")
	eq(t, g(card, "source"), "[[demo-spec]]")
	match(t, g(cand, "rule"), "成功反馈用一次过冲的缩放")
	match(t, g(cand, "merge"), "Motion")
	match(t, g(cand, "evidence"), "save-pop")
}

func TestPageNotAPageNamesWhatItIsOrWhatPagesExist(t *testing.T) {
	a := archiveOf(t, fixture.Compliant())
	_, err := Page(a, "cookbook--list")
	qe(t, err, "", "是状态，不是页面")
	_, err = Page(a, "nope")
	qe(t, err, "", "找不到页面「nope」.*cookbook、pantry")
}

// ---------- 单个状态 ----------

func TestStateHowToGetInWhatToSeeAndScreenshots(t *testing.T) {
	files := fixture.Compliant()
	file := P("pages/cookbook/cookbook--search-results.md")
	files[file] = strings.Replace(files[file], "结果卡片列表。", "结果卡片列表。\n\n![[results.png]]\n\n![回车保存](assets/saved.gif)", 1)
	files[P("pages/cookbook/assets/results.png")] = "png"
	files[P("pages/cookbook/assets/saved.gif")] = "gif"
	r := okMap(t)(State(archiveOf(t, files), "cookbook--search-results"))
	eq(t, g(r, "state", "id"), "cookbook--search-results")
	eq(t, g(r, "state", "page"), "cookbook")
	eq(t, g(r, "enter", "reachable"), true)
	eq(t, len(list(g(r, "enter", "steps"))), 2)
	match(t, g(r, "shouldSee"), "每张卡片有保存按钮")
	match(t, g(r, "screen"), "结果卡片列表")
	eq(t, g(r, "screenshots"), strs(P("pages/cookbook/assets/results.png"), P("pages/cookbook/assets/saved.gif")))
}

func TestStateNoScreenshotsIsAnEmptyListAndAnUnreachableStateStillAnswers(t *testing.T) {
	r := okMap(t)(State(archiveOf(t, fixture.Compliant()), "cookbook--search-failed"))
	eq(t, g(r, "screenshots"), []any{})
	eq(t, g(r, "enter", "verdict"), "进不去")
	match(t, g(r, "shouldSee"), "搜索失败")
}

// ---------- 单条用户路径 ----------

func TestJourneyIntentThenEveryStepInOrder(t *testing.T) {
	r := okMap(t)(Journey(archiveOf(t, fixture.Compliant()), "save-a-recipe"))
	eq(t, g(r, "journey", "id"), "save-a-recipe")
	eq(t, g(r, "journey", "intent"), "用户搜到一份菜谱并保存下来")
	eq(t, pick(g(r, "steps"), "state"), strs("cookbook--list", "cookbook--search-loading", "cookbook--search-results", "cookbook--recipe-saved"))
	eq(t, pick(g(r, "steps"), "n"), []any{1.0, 2.0, 3.0, 4.0})

	// the first step has no trigger: a journey says where it starts, not how to get there
	eq(t, g(r, "steps", 0, "trigger"), nil)
	match(t, g(r, "steps", 0, "shouldSee"), "搜索框")

	// a user edge: component + locate + action
	eq(t, g(r, "steps", 1, "trigger", "id"), "search")
	eq(t, g(r, "steps", 1, "trigger", "component"), "SearchBox")
	eq(t, g(r, "steps", 1, "trigger", "locate"), js(t, `{"role":"searchbox","name":"搜索菜谱"}`))
	// a system edge: trigger + how
	eq(t, g(r, "steps", 2, "trigger", "kind"), "system")
	eq(t, g(r, "steps", 2, "trigger", "trigger"), "搜索请求完成")
	eq(t, g(r, "steps", 2, "trigger", "how"), "放行搜索请求")
	// two edges between results and saved: the `via` on the previous step picks one
	eq(t, g(r, "steps", 3, "trigger", "id"), "save")
	eq(t, g(r, "steps", 3, "trigger", "motion"), "save-pop")
	match(t, g(r, "steps", 3, "shouldSee"), "已保存")
	eq(t, has(g(r, "steps", 3), "ambiguous"), false)

	// where the first state is entered from is the state's own question, answered the same way
	eq(t, g(r, "start", "reachable"), true)
	eq(t, g(r, "start", "entry", "url"), "/cookbook")
}

func TestJourneyAPathAcrossPagesCarriesThePageOfEachStep(t *testing.T) {
	r := okMap(t)(Journey(archiveOf(t, fixture.Compliant()), "glance-at-pantry"))
	eq(t, pick(g(r, "steps"), "page"), strs("cookbook", "pantry", "cookbook"))
	eq(t, g(r, "steps", 1, "trigger", "component"), "NavBar")
	eq(t, g(r, "steps", 2, "trigger", "id"), "back")
}

func TestJourneyTwoEdgesAndNoViaIsFlaggedAMissingEdgeSaysSo(t *testing.T) {
	files := fixture.Compliant()
	file := P("journeys/save-a-recipe.md")
	files[file] = strings.Replace(files[file], `{ state: "[[cookbook--search-results]]", via: save }`, `"[[cookbook--search-results]]"`, 1)
	loose := okMap(t)(Journey(archiveOf(t, files), "save-a-recipe"))
	eq(t, g(loose, "steps", 3, "ambiguous"), strs("save", "save-key"))
	eq(t, g(loose, "steps", 3, "trigger", "id"), "save")

	files[file] = strings.Replace(files[file], `"[[cookbook--recipe-saved]]"`, `"[[pantry--empty]]"`, 1)
	broken := okMap(t)(Journey(archiveOf(t, files), "save-a-recipe"))
	eq(t, g(broken, "steps", 3, "trigger"), nil)
	eq(t, g(broken, "steps", 3, "noEdge"), true)
}

func TestJourneyNotFoundSaysWhatJourneysExist(t *testing.T) {
	_, err := Journey(archiveOf(t, fixture.Compliant()), "nope")
	qe(t, err, "", "找不到用户路径「nope」.*glance-at-pantry、save-a-recipe")
}

// ---------- 反查 ----------

func TestRefsByComponentName(t *testing.T) {
	r := okMap(t)(Refs(archiveOf(t, fixture.Compliant()), "NavBar"))
	eq(t, g(r, "target"), js(t, `{"id":"NavBar","kind":"component","code":["src/components/NavBar.tsx"]}`))
	eq(t, g(r, "matchedBy"), "name")
	edges := []any{}
	for _, e := range list(g(r, "edges")) {
		edges = append(edges, g(e, "from").(string)+":"+g(e, "id").(string))
	}
	eq(t, edges, strs("cookbook--list:open-pantry", "pantry--overview:back"))
	eq(t, pick(g(r, "states"), "id"), strs("cookbook--list", "pantry--overview"))
	eq(t, pick(g(r, "journeys"), "id"), strs("glance-at-pantry"))
	eq(t, g(r, "pages"), strs("cookbook", "pantry"))
}

func TestRefsByTheComponentCodePathFindsTheSameThing(t *testing.T) {
	a := archiveOf(t, fixture.Compliant())
	byPath := okMap(t)(Refs(a, "src/components/NavBar.tsx"))
	eq(t, g(byPath, "matchedBy"), "code")
	byName := okMap(t)(Refs(a, "NavBar"))
	byPath.(map[string]any)["matchedBy"] = nil
	byName.(map[string]any)["matchedBy"] = nil
	eq(t, byPath, byName)
	eq(t, g(okMap(t)(Refs(a, "./src/components/NavBar.tsx")), "target", "id"), "NavBar")
}

func TestRefsAStateThatListsTheComponentCountsAndSoDoTheJourneys(t *testing.T) {
	r := okMap(t)(Refs(archiveOf(t, fixture.Compliant()), "RecipeCard"))
	got := []any{}
	for _, s := range list(g(r, "states")) {
		got = append(got, []any{g(s, "id"), g(s, "via")})
	}
	eq(t, got, js(t, `[["cookbook--list",["components"]],["cookbook--search-results",["components"]],["pantry--overview",["components"]]]`))
	eq(t, g(r, "edges"), []any{})
	eq(t, pick(g(r, "journeys"), "id"), strs("glance-at-pantry", "save-a-recipe"))
	eq(t, g(r, "pages"), strs("cookbook", "pantry"))
}

func TestRefsByMotionName(t *testing.T) {
	a := archiveOf(t, fixture.Compliant())
	pop := okMap(t)(Refs(a, "save-pop"))
	eq(t, g(pop, "target", "kind"), "motion")
	eq(t, pick(g(pop, "edges"), "id"), strs("save"))
	eq(t, g(pop, "edges", 0, "from"), "cookbook--search-results")
	eq(t, g(pop, "states"), js(t, `[{"id":"cookbook--search-results","page":"cookbook","via":["edges"]}]`))
	eq(t, pick(g(pop, "journeys"), "id"), strs("save-a-recipe"))
	eq(t, g(pop, "pages"), strs("cookbook"))

	ring := okMap(t)(Refs(a, "spinner-ring"))
	eq(t, g(ring, "states"), js(t, `[{"id":"cookbook--search-loading","page":"cookbook","via":["motions"]}]`))
	eq(t, g(ring, "edges"), []any{})
}

func TestRefsNothingOwnedIsNotFound(t *testing.T) {
	a := archiveOf(t, fixture.Compliant())
	_, err := Refs(a, "nope")
	qe(t, err, "", "找不到.*「nope」")
	_, err = Refs(a, "src/nothing.tsx")
	qe(t, err, "", `找不到.*「src/nothing.tsx」`)
	_, err = Refs(a, "cookbook")
	qe(t, err, "", "是页面.*组件、动效")
}

// ---------- 关键词 ----------

func TestKeywordNameBeatsSummaryBeatsBody(t *testing.T) {
	a := archiveOf(t, fixture.Compliant())
	find := func(r any, id, hit string) bool {
		for _, m := range list(g(r, "matches")) {
			if g(m, "id") == id && g(m, "hit") == hit {
				return true
			}
		}
		return false
	}
	byWord := okMap(t)(Keyword(a, "转圈"))
	eq(t, find(byWord, "spinner-ring", "summary"), true)
	eq(t, find(byWord, "cookbook--search-loading", "body"), true)

	// "导航": NavBar's summary; the pages mention it in a region name, which is body-tier
	nav := okMap(t)(Keyword(a, "导航"))
	eq(t, g(nav, "matches", 0, "id"), "NavBar")
	eq(t, g(nav, "matches", 0, "hit"), "summary")

	// "save": SaveButton / save-pop have it in the name — those come first
	save := okMap(t)(Keyword(a, "save"))
	names := []string{}
	for _, m := range list(g(save, "matches")) {
		if g(m, "hit") == "name" {
			names = append(names, g(m, "id").(string))
		}
	}
	sort.Strings(names)
	eq(t, strs(names...), strs("SaveButton", "cookbook--recipe-saved", "save-a-recipe", "save-pop"))
	eq(t, g(save, "matches", 0, "hit"), "name")
	tiers := []int{}
	for _, m := range list(g(save, "matches")) {
		tiers = append(tiers, map[string]int{"name": 3, "summary": 2, "body": 1}[g(m, "hit").(string)])
	}
	if !sort.SliceIsSorted(tiers, func(i, j int) bool { return tiers[i] > tiers[j] }) {
		t.Fatalf("tiers are not best first: %v", tiers)
	}
}

func TestKeywordIgnoresCaseShowsSnippetsAndSeveralWordsNeedNotAllBePresent(t *testing.T) {
	a := archiveOf(t, fixture.Compliant())
	eq(t, g(okMap(t)(Keyword(a, "NAVBAR")), "matches", 0, "id"), "NavBar")
	r := okMap(t)(Keyword(a, "食材库 菜谱"))
	eq(t, len(list(g(r, "terms"))), 2)
	both, one := 0, 0
	for _, m := range list(g(r, "matches")) {
		n := len(list(g(m, "terms")))
		if n < 1 {
			t.Fatalf("a match with no terms: %v", m)
		}
		if n == 2 {
			both++
		}
		if n == 1 {
			one++
		}
	}
	eq(t, both > 0 && one > 0, true)
	// among equal positions, the object matching more words comes first
	var counts []int
	for _, m := range list(g(r, "matches")) {
		if g(m, "hit") == "summary" {
			counts = append(counts, len(list(g(m, "terms"))))
		}
	}
	if !sort.SliceIsSorted(counts, func(i, j int) bool { return counts[i] > counts[j] }) {
		t.Fatalf("summary matches are not by words matched: %v", counts)
	}
	for _, m := range list(g(okMap(t)(Keyword(a, "重试")), "matches")) {
		if g(m, "id") == "RetryButton" {
			match(t, g(m, "snippet"), "重试")
			return
		}
	}
	t.Fatal("RetryButton not found for 重试")
}

func TestKeywordALongChineseRunWithNoSpacesStillFindsWhatSharesAWord(t *testing.T) {
	r := okMap(t)(Keyword(archiveOf(t, fixture.Compliant()), "搜索失败的提示"))
	found := false
	for _, m := range list(g(r, "matches")) {
		if g(m, "id") == "cookbook--search-failed" {
			found = true
		}
	}
	eq(t, found, true)
	eq(t, g(r, "terms"), strs("搜索失败的提示"))
}

func TestKeywordNothingMatchingIsAnEmptyListNotAnError(t *testing.T) {
	a := archiveOf(t, fixture.Compliant())
	eq(t, g(okMap(t)(Keyword(a, "zzzqqq")), "matches"), []any{})
	_, err := Keyword(a, "   ")
	qe(t, err, "usage", "")
}

// ---------- 需求差异 ----------

const deltaDir = "docs/design/tmp/" + fixture.SpecSlug + "/delta"

func D(rel string) string { return deltaDir + "/" + rel }

var (
	resultsFile  = P("pages/cookbook/cookbook--search-results.md")
	overviewFile = P("pages/pantry/pantry--overview.md")
)

func stateFile(summary, expect string) string {
	return "---\ntype: design-state\ntags: [cookbook]\nsummary: " + summary + "\npage: \"[[cookbook]]\"\nedges: []\n---\n\n## 这一屏\n\n" + summary + "。\n\n## 应看到什么\n\n" + expect + "\n"
}

// deltaFiles is a requirement that adds two states (share-sheet, share-done), changes one edge (results → saved
// is now announced with a toast and a longer "what to see"), and removes one state (pantry--empty, with overview
// giving up the edge that led to it).
func deltaFiles() fixture.Files {
	f := fixture.Compliant()
	base := f.Clone()
	f[D("pages/cookbook/cookbook--share-sheet.md")] = stateFile("分享面板", "- 看到分享面板")
	f[D("pages/cookbook/cookbook--share-done.md")] = stateFile("分享完成", "- 看到「已复制链接」")
	results := regexp.MustCompile(`(  - id: save\n(?s:.*?))action: click\n    motion: "\[\[save-pop\]\]"`).
		ReplaceAllString(base[resultsFile], "${1}action: 点击或按回车\n    motion: \"[[save-pop]]\"")
	f[D("pages/cookbook/cookbook--search-results.md")] = strings.Replace(results, "- 每张卡片有保存按钮", "- 每张卡片有保存按钮\n- 保存后出现提示条", 1)
	f[D("pages/pantry/pantry--overview.md")] = regexp.MustCompile(`  - id: empty-shelf(?s:.*?)删除全部食材记录`).ReplaceAllString(base[overviewFile], "")
	f[D("removed.md")] = "# 删除\n\n- [[pantry--empty]] —— 空状态并入 overview\n"
	return f
}

func TestDiffAddedChangedAndRemovedAreListedSeparately(t *testing.T) {
	r := okMap(t)(Diff(repoOf(t, deltaFiles()), fixture.SpecSlug))
	eq(t, g(r, "spec"), fixture.SpecSlug)
	eq(t, pick(g(r, "added"), "id"), strs("cookbook--share-done", "cookbook--share-sheet"))
	eq(t, g(r, "added", 1), map[string]any{"id": "cookbook--share-sheet", "kind": "state", "summary": "分享面板", "file": D("pages/cookbook/cookbook--share-sheet.md")})
	eq(t, pick(g(r, "changed"), "id"), strs("cookbook--search-results", "pantry--overview"))
	eq(t, g(r, "removed"), []any{map[string]any{"id": "pantry--empty", "kind": "state", "summary": "食材库为空", "file": P("pages/pantry/pantry--empty.md")}})
}

func changedOf(r any, id string) any {
	for _, o := range list(g(r, "changed")) {
		if g(o, "id") == id {
			return o
		}
	}
	return nil
}

func TestDiffAChangedEdgeIsAFieldLevelDifferenceKeyedByTheEdgeID(t *testing.T) {
	r := okMap(t)(Diff(repoOf(t, deltaFiles()), fixture.SpecSlug))
	eq(t, g(changedOf(r, "cookbook--search-results"), "fields"), js(t, `[{"field":"edges[save].action","before":"click","after":"点击或按回车"}]`))
	// an edge that is gone, from the other changed state
	overview := changedOf(r, "pantry--overview")
	eq(t, len(list(g(overview, "fields"))), 1)
	eq(t, g(overview, "fields", 0, "field"), "edges[empty-shelf]")
	eq(t, g(overview, "fields", 0, "before", "to"), "pantry--empty")
	eq(t, has(g(overview, "fields", 0), "after"), false)
}

func TestDiffAChangedBodyIsComparedSectionBySection(t *testing.T) {
	results := changedOf(okMap(t)(Diff(repoOf(t, deltaFiles()), fixture.SpecSlug)), "cookbook--search-results")
	got := []any{}
	for _, s := range list(g(results, "sections")) {
		got = append(got, []any{g(s, "title"), g(s, "change")})
	}
	eq(t, got, js(t, `[["应看到什么","changed"]]`))
	match(t, g(results, "sections", 0, "before"), `^- 每张卡片有保存按钮$`)
	match(t, g(results, "sections", 0, "after"), "保存后出现提示条")
}

func TestDiffAFieldAddedAndANewSectionEachShowUpUnchangedObjectsStayOut(t *testing.T) {
	files := deltaFiles()
	nav := fixture.Compliant()[P("components/NavBar/NavBar.md")]
	nav = strings.Replace(nav, "summary: 顶部导航", "summary: 顶部导航\nnotes: 新加的字段", 1)
	nav = strings.Replace(nav, "## 设计法候选", "## 补充\n\n多出来的一节\n\n## 设计法候选", 1)
	files[D("components/NavBar/NavBar.md")] = nav
	r := okMap(t)(Diff(repoOf(t, files), fixture.SpecSlug))
	n := changedOf(r, "NavBar")
	eq(t, g(n, "fields"), js(t, `[{"field":"notes","after":"新加的字段"}]`))
	eq(t, has(g(n, "fields", 0), "before"), false)
	got := []any{}
	for _, s := range list(g(n, "sections")) {
		got = append(got, []any{g(s, "title"), g(s, "change")})
	}
	eq(t, got, js(t, `[["补充","added"]]`))
	eq(t, changedOf(r, "RecipeCard"), nil)
}

func TestDiffADeltaCopyIdenticalToProdIsNotAChange(t *testing.T) {
	files := deltaFiles()
	files[D("components/NavBar/NavBar.md")] = fixture.Compliant()[P("components/NavBar/NavBar.md")]
	r := okMap(t)(Diff(repoOf(t, files), fixture.SpecSlug))
	eq(t, changedOf(r, "NavBar"), nil)
}

func TestDiffASpecWithNoDeltaIsNotFoundAndAnUnknownRemovedIDIsKeptApart(t *testing.T) {
	_, err := Diff(repoOf(t, fixture.Compliant()), "nope")
	qe(t, err, "", "没有.*nope|找不到.*nope")
	files := deltaFiles()
	files[D("removed.md")] += "- [[ghost]]\n"
	r := okMap(t)(Diff(repoOf(t, files), fixture.SpecSlug))
	eq(t, pick(g(r, "removed"), "id"), strs("pantry--empty"))
	eq(t, g(r, "unknownRemoved"), strs("ghost"))
}

// ---------- 命令行 ----------

func TestCliEveryEntryAnswersInJSONTheSameAsCallingTheModule(t *testing.T) {
	root := repoOf(t, deltaFiles())
	a, _ := archiveLoad(root)
	type c struct {
		entry, arg string
		direct     func() (any, error)
	}
	cases := []c{
		{"page", "cookbook", func() (any, error) { return Page(a, "cookbook") }},
		{"state", "cookbook--search-results", func() (any, error) { return State(a, "cookbook--search-results") }},
		{"journey", "save-a-recipe", func() (any, error) { return Journey(a, "save-a-recipe") }},
		{"refs", "NavBar", func() (any, error) { return Refs(a, "NavBar") }},
		{"refs", "src/components/NavBar.tsx", func() (any, error) { return Refs(a, "src/components/NavBar.tsx") }},
		{"keyword", "转圈", func() (any, error) { return Keyword(a, "转圈") }},
		{"diff", fixture.SpecSlug, func() (any, error) { return Diff(root, fixture.SpecSlug) }},
	}
	for _, k := range cases {
		out, errText, code := cliRun(root, k.entry, k.arg)
		if code != 0 {
			t.Fatalf("%s %s: exit %d: %s", k.entry, k.arg, code, errText)
		}
		v, err := k.direct()
		want, _ := jsonText(v, err)
		eq(t, js(t, out), js(t, want), k.entry+" "+k.arg)
	}
}

func TestCliDeltaReadsTheArchiveAsItWillBeAfterTheRequirement(t *testing.T) {
	root := repoOf(t, deltaFiles())
	_, _, code := cliRun(root, "state", "cookbook--share-sheet") // not in prod/
	eq(t, code, 1)
	out, errText, code := cliRun(root, "state", "cookbook--share-sheet", "--delta", fixture.SpecSlug)
	eq(t, code, 0, errText)
	eq(t, g(js(t, out), "state", "id"), "cookbook--share-sheet")
	// an option may come first, too
	_, _, code = cliRun(root, "--delta", fixture.SpecSlug, "page", "cookbook")
	eq(t, code, 0)
}

func TestCliAnObjectThatIsNotThereExitsNonZeroAndSaysWhatOnStderr(t *testing.T) {
	root := repoOf(t, fixture.Compliant())
	for _, k := range [][3]string{
		{"page", "nope", "找不到页面「nope」"},
		{"state", "nope", "找不到状态「nope」"},
		{"journey", "nope", "找不到用户路径「nope」"},
		{"refs", "nope", "找不到组件或动效「nope」"},
		{"diff", "nope", "nope"},
		{"keyword", "zzzqqq", "没有对象匹配「zzzqqq」"},
	} {
		out, errText, code := cliRun(root, k[0], k[1])
		eq(t, code, 1, k[0]+" "+k[1])
		match(t, errText, regexp.QuoteMeta(k[2]))
		eq(t, out, "", k[0]+" "+k[1]+" prints no result")
	}
	_, _, code := cliRun(root, "state", "nope", "--delta", "nope")
	eq(t, code, 1) // no such requirement either
}

func TestCliUsageErrorsAndANonRepositoryRootExit2(t *testing.T) {
	root := repoOf(t, fixture.Compliant())
	_, _, code := cliRun()
	eq(t, code, 2)
	_, _, code = cliRun(root, "page")
	eq(t, code, 2)
	_, _, code = cliRun(root, "galaxy", "cookbook")
	eq(t, code, 2)
	_, _, code = cliRun(root, "page", "cookbook", "--delta")
	eq(t, code, 2)
	_, _, code = cliRun(root, "diff", fixture.SpecSlug, "--delta", fixture.SpecSlug)
	eq(t, code, 2)
	_, _, code = cliRun(root, "keyword", "   ")
	eq(t, code, 2)
	_, errText, code := cliRun(repoOf(t, fixture.Files{"README.md": "x"}), "page", "cookbook")
	eq(t, code, 2)
	match(t, errText, "不是目标仓库的根")
}

func TestEveryOtherEntryCanReadTheArchiveAfterTheChange(t *testing.T) {
	root := repoOf(t, deltaFiles())
	after := archiveWith(t, root, fixtureSlug)
	hasState := func(r any, id string) bool {
		for _, s := range list(g(r, "states")) {
			if g(s, "id") == id {
				return true
			}
		}
		return false
	}
	eq(t, hasState(okMap(t)(Page(after, "cookbook")), "cookbook--share-sheet"), true)
	eq(t, hasState(okMap(t)(Page(archiveWith(t, root, ""), "cookbook")), "cookbook--share-sheet"), false)
	_, err := State(after, "pantry--empty")
	qe(t, err, "", "")
	eq(t, g(okMap(t)(State(after, "cookbook--search-results")), "enter", "steps", 1, "kind"), "system")
}
