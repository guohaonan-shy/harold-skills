package seo

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

type pg struct{ title, description, head string }

func livePage(o pg) string {
	if o.title == "" {
		o.title = "Weeknight dinners in 20 minutes"
	}
	if o.description == "" {
		o.description = "Twelve dinners you can cook on a weeknight."
	}
	return `<!doctype html><html lang="en"><head><title>` + o.title + `</title><meta name="description" content="` + o.description + `">` + o.head + `</head><body><h1>x</h1></body></html>`
}

// build is a build output: `/` and `/blog/weeknight-dinners/` (the page the PR changed).
func build(t *testing.T, over pg) string {
	t.Helper()
	dist := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dist, "blog", "weeknight-dinners"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dist, "index.html"), []byte(livePage(pg{title: "Cookbook", description: "Recipes."})), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dist, "blog", "weeknight-dinners", "index.html"), []byte(livePage(over)), 0o644); err != nil {
		t.Fatal(err)
	}
	return dist
}

type livePg struct {
	status  int
	html    string
	headers map[string]string
}

type liveSite struct {
	pages   map[string]livePg
	sitemap any               // []string of paths, or a string served as it is
	files   map[string]string // raw bodies, `{base}` is the server's own address
}

// serve is a local static server standing in for the live site.
func serve(t *testing.T, s liveSite) *httptest.Server {
	t.Helper()
	var srv *httptest.Server
	srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		base := "http://" + r.Host
		raw := ""
		have := false
		if r.URL.Path == "/sitemap.xml" {
			have = true
			switch v := s.sitemap.(type) {
			case string:
				raw = strings.ReplaceAll(v, "{base}", base)
			case []string:
				raw = "<urlset>"
				for _, p := range v {
					raw += "<url><loc>" + base + p + "</loc></url>"
				}
				raw += "</urlset>"
			}
		} else if f, ok := s.files[r.URL.Path]; ok {
			have, raw = true, strings.ReplaceAll(f, "{base}", base)
		}
		if have {
			w.Header().Set("content-type", "application/xml")
			fmt.Fprint(w, raw)
			return
		}
		p, ok := s.pages[r.URL.Path]
		if !ok {
			w.WriteHeader(404)
			fmt.Fprint(w, "not found")
			return
		}
		for k, v := range p.headers {
			w.Header().Set(k, v)
		}
		w.Header().Set("content-type", "text/html")
		if p.status != 0 {
			w.WriteHeader(p.status)
		}
		fmt.Fprint(w, p.html)
	}))
	t.Cleanup(srv.Close)
	return srv
}

const livePath = "/blog/weeknight-dinners/"

func entryFor(base string) []LiveEntry {
	k := "weeknight dinner ideas"
	return []LiveEntry{{URL: base + livePath, Keyword: &k}}
}

func itemsOf(p LivePage) map[string]bool {
	return map[string]bool{"status": p.Status.OK, "noindex": p.Noindex.OK, "meta": p.Meta.OK, "sitemap": p.Sitemap.OK}
}

func checkAll(t *testing.T, entries []LiveEntry, dist string) *LiveReport {
	t.Helper()
	r, err := CheckAll(entries, dist, HTTPFetch())
	if err != nil {
		t.Fatal(err)
	}
	return r
}

func TestALivePageThatMatchesTheBuildIsIndexableAndInTheSitemapPassesAllFourItems(t *testing.T) {
	dist := build(t, pg{})
	srv := serve(t, liveSite{pages: map[string]livePg{livePath: {html: livePage(pg{})}}, sitemap: []string{livePath}})
	r := checkAll(t, entryFor(srv.URL), dist)
	if !reflect.DeepEqual(itemsOf(r.Pages[0]), map[string]bool{"status": true, "noindex": true, "meta": true, "sitemap": true}) || r.Verdict() != "pass" || len(r.Failed) != 0 {
		t.Fatalf("%+v", r)
	}
}

func TestAPageGivenNoindexInItsMetaRobotsFailsOnlyTheNoindexItem(t *testing.T) {
	dist := build(t, pg{})
	srv := serve(t, liveSite{pages: map[string]livePg{livePath: {html: livePage(pg{head: `<meta content="noindex, follow" name="robots">`})}}, sitemap: []string{livePath}})
	r := checkAll(t, entryFor(srv.URL), dist)
	if !reflect.DeepEqual(itemsOf(r.Pages[0]), map[string]bool{"status": true, "noindex": false, "meta": true, "sitemap": true}) || r.Verdict() != "fail" ||
		len(r.Failed) != 1 || r.Failed[0].Item != "noindex" || r.Failed[0].URL != srv.URL+livePath {
		t.Fatalf("%+v", r)
	}
}

func TestNoindexInTheXRobotsTagHeaderFailsToo(t *testing.T) {
	dist := build(t, pg{})
	for header, ok := range map[string]bool{"noindex": false, "googlebot: noindex": false, "none": false, "max-snippet:50": true} {
		srv := serve(t, liveSite{pages: map[string]livePg{livePath: {html: livePage(pg{}), headers: map[string]string{"x-robots-tag": header}}}, sitemap: []string{livePath}})
		if got := checkAll(t, entryFor(srv.URL), dist).Pages[0].Noindex.OK; got != ok {
			t.Errorf("%s: %v", header, got)
		}
	}
}

func TestALiveTitleOrDescriptionThatDiffersFromTheBuildFailsTheMetaItem(t *testing.T) {
	dist := build(t, pg{})
	srv := serve(t, liveSite{pages: map[string]livePg{livePath: {html: livePage(pg{title: "Old title"})}}, sitemap: []string{livePath}})
	p := checkAll(t, entryFor(srv.URL), dist).Pages[0]
	if !reflect.DeepEqual(itemsOf(p), map[string]bool{"status": true, "noindex": true, "meta": false, "sitemap": true}) || !strings.Contains(p.Meta.Detail, "Old title") || !strings.Contains(p.Meta.Detail, "Weeknight dinners in 20 minutes") {
		t.Fatalf("%+v", p)
	}
	srv = serve(t, liveSite{pages: map[string]livePg{livePath: {html: livePage(pg{description: "Something older."})}}, sitemap: []string{livePath}})
	p = checkAll(t, entryFor(srv.URL), dist).Pages[0]
	if p.Meta.OK || !strings.Contains(p.Meta.Detail, "description") {
		t.Fatalf("%+v", p.Meta)
	}
}

func TestAPageMissingFromTheLiveSitemapFailsTheSitemapItemSoDoesASitemapThatIsNotThere(t *testing.T) {
	dist := build(t, pg{})
	a := serve(t, liveSite{pages: map[string]livePg{livePath: {html: livePage(pg{})}}, sitemap: []string{"/"}})
	p := checkAll(t, entryFor(a.URL), dist).Pages[0]
	if !reflect.DeepEqual(itemsOf(p), map[string]bool{"status": true, "noindex": true, "meta": true, "sitemap": false}) || !strings.Contains(p.Sitemap.Detail, "sitemap.xml") {
		t.Fatalf("%+v", p)
	}
	b := serve(t, liveSite{pages: map[string]livePg{livePath: {html: livePage(pg{})}}, sitemap: "<html>404</html>"})
	if checkAll(t, entryFor(b.URL), dist).Pages[0].Sitemap.OK {
		t.Fatal("a sitemap that lists nothing lists no page")
	}
}

func TestASitemapIndexIsFollowedToItsChildrenATrailingSlashIsNotADifferentPage(t *testing.T) {
	dist := build(t, pg{})
	srv := serve(t, liveSite{
		pages:   map[string]livePg{livePath: {html: livePage(pg{})}},
		sitemap: "<sitemapindex><sitemap><loc>{base}/sitemap-0.xml</loc></sitemap></sitemapindex>",
		files:   map[string]string{"/sitemap-0.xml": "<urlset><url><loc>{base}/blog/weeknight-dinners</loc></url></urlset>"},
	})
	if !checkAll(t, entryFor(srv.URL), dist).Pages[0].Sitemap.OK {
		t.Fatal("the child sitemap lists the page")
	}
}

func TestA404FailsTheStatusItemAndTheItemsThatNeedThePageCountAsFailed(t *testing.T) {
	dist := build(t, pg{})
	srv := serve(t, liveSite{sitemap: []string{livePath}})
	r := checkAll(t, entryFor(srv.URL), dist)
	p := r.Pages[0]
	if p.Status.OK || !strings.Contains(p.Status.Detail, "404") || p.Noindex.OK || p.Meta.OK || r.Verdict() != "fail" {
		t.Fatalf("%+v", p)
	}
	var items []string
	for _, f := range r.Failed {
		items = append(items, f.Item)
	}
	if !reflect.DeepEqual(items, []string{"status", "noindex", "meta"}) {
		t.Fatal(items)
	}
}

func TestASiteThatCannotBeReachedFailsTheStatusItemWithTheReason(t *testing.T) {
	dist := build(t, pg{})
	srv := serve(t, liveSite{})
	base := srv.URL
	srv.Close()
	p := checkAll(t, entryFor(base), dist).Pages[0]
	if p.Status.OK || !strings.Contains(p.Status.Detail, "连不上") || !strings.Contains(p.Status.Detail, "ECONNREFUSED") {
		t.Fatalf("%+v", p.Status)
	}
}

func TestEveryURLIsCheckedOnePassingPageDoesNotHideTheFailingOne(t *testing.T) {
	dist := build(t, pg{})
	srv := serve(t, liveSite{pages: map[string]livePg{livePath: {html: livePage(pg{})}, "/": {html: livePage(pg{title: "Stale", description: "Recipes."})}}, sitemap: []string{livePath, "/"}})
	entries := append(entryFor(srv.URL), LiveEntry{URL: srv.URL + "/"})
	r := checkAll(t, entries, dist)
	if len(r.Pages) != 2 || !r.Pages[0].Meta.OK || r.Pages[1].Meta.OK || len(r.Failed) != 1 || r.Failed[0].URL != srv.URL+"/" || r.Failed[0].Item != "meta" {
		t.Fatalf("%+v", r)
	}
}

func TestAURLWithNoPageInTheBuildIsAnInputError(t *testing.T) {
	dist := build(t, pg{})
	if _, err := DistFile(dist, "https://cookbook.example/blog/nothing-here/"); err == nil || !strings.Contains(err.Error(), "产物") {
		t.Fatal(err)
	}
	for _, u := range []string{"https://cookbook.example/", "https://cookbook.example/blog/weeknight-dinners", "https://cookbook.example/blog/weeknight-dinners/?utm=x#top"} {
		f, err := DistFile(dist, u)
		if err != nil || !strings.HasSuffix(f, "index.html") {
			t.Errorf("%s: %v %v", u, f, err)
		}
	}
}

func TestParseURLsReadsOneURLAndItsKeywordPerLineWhateverBulletOrBracketsTheWriterUsed(t *testing.T) {
	text := `
https://cookbook.example/blog/a/ 目标词：weeknight dinner ideas
- https://cookbook.example/blog/b/ 目标词: easy lunches
* <https://cookbook.example/blog/c/> 目标词：meal prep for two
- [ ] https://cookbook.example/blog/d/
这行不是网址
`
	got := ParseURLs(text)
	want := [][2]string{{"https://cookbook.example/blog/a/", "weeknight dinner ideas"}, {"https://cookbook.example/blog/b/", "easy lunches"}, {"https://cookbook.example/blog/c/", "meal prep for two"}, {"https://cookbook.example/blog/d/", ""}}
	if len(got) != len(want) {
		t.Fatal(got)
	}
	for i, w := range want {
		k := ""
		if got[i].Keyword != nil {
			k = *got[i].Keyword
		}
		if got[i].URL != w[0] || k != w[1] || (w[1] == "") != (got[i].Keyword == nil) {
			t.Errorf("%d: %+v", i, got[i])
		}
	}
	if len(ParseURLs("")) != 0 {
		t.Fatal("no text, no URL")
	}
}

func TestFactsReadsTitleDescriptionAndRobotsWhateverTheAttributeOrderAndQuoteStyle(t *testing.T) {
	f := Facts(`<title> A &amp; B </title><meta content='Desc &quot;x&quot;' name='description'><meta content="noindex" name="robots">`)
	if str1(f.Title) != "A & B" || str1(f.Description) != `Desc "x"` || !f.Noindex {
		t.Fatalf("%+v", f)
	}
	e := Facts("<html></html>")
	if e.Title != nil || e.Description != nil || e.Noindex {
		t.Fatalf("%+v", e)
	}
}

func TestForbidsIndexReadsNoindexAndNoneWhereverTheyStandInARobotsValue(t *testing.T) {
	for v, want := range map[string]bool{
		"noindex": true, "noindex, follow": true, "googlebot: noindex": true, "none": true, "NOINDEX": true, "index, none": true,
		"max-snippet:50": false, "noindexed": false, "nonexistent": false, "index,follow": false, "": false, "x-noindex": false,
	} {
		if got := forbidsIndex(v); got != want {
			t.Errorf("%q: %v", v, got)
		}
	}
}

func fakeServed(html func() string) Fetch {
	return func(string) Response { return Response{Status: 200, Body: html()} }
}

func TestWaitLiveNotLiveUntilEveryPageServesTheBuildLiveAsSoonAsTheyAllDo(t *testing.T) {
	dist := build(t, pg{})
	polls, clock := 0, 0.0
	r, err := WaitLive(entryFor("https://cookbook.example"), dist, WaitOpts{
		Fetch: fakeServed(func() string {
			polls++
			if polls > 2 {
				return livePage(pg{})
			}
			return livePage(pg{title: "Old title"})
		}),
		IntervalMs: 60_000, MaxMs: 30 * 60_000, Sleep: func(ms float64) { clock += ms }, Now: func() float64 { return clock },
	})
	if err != nil || !r.Live || r.WaitedMs != 120_000 {
		t.Fatalf("polled at 0, 1 and 2 minutes; the third poll matched: %+v %v", r, err)
	}
}

func TestWaitLiveAfterTheWaitThePagesStillNotServingTheBuildAreListed(t *testing.T) {
	dist := build(t, pg{})
	clock, sleeps := 0.0, 0
	r, err := WaitLive(entryFor("https://cookbook.example"), dist, WaitOpts{
		Fetch:      fakeServed(func() string { return livePage(pg{title: "Old title"}) }),
		IntervalMs: 60_000, MaxMs: 5 * 60_000, Sleep: func(ms float64) { sleeps++; clock += ms }, Now: func() float64 { return clock },
	})
	if err != nil || r.Live || !reflect.DeepEqual(r.Pending, []string{"https://cookbook.example/blog/weeknight-dinners/"}) || r.WaitedMs != 5*60_000 || sleeps != 5 {
		t.Fatalf("once a minute, five minutes: %+v %v %d", r, err, sleeps)
	}
}

func TestWaitLiveATitleThatMatchesWhileTheDescriptionIsStillOldIsNotLiveYet(t *testing.T) {
	dist := build(t, pg{})
	clock := 0.0
	r, err := WaitLive(entryFor("https://cookbook.example"), dist, WaitOpts{
		Fetch:      fakeServed(func() string { return livePage(pg{description: "Something older."}) }),
		IntervalMs: 60_000, MaxMs: 60_000, Sleep: func(ms float64) { clock += ms }, Now: func() float64 { return clock },
	})
	if err != nil || r.Live {
		t.Fatalf("%+v %v", r, err)
	}
}

func TestLiveResultJSONKeepsTheOldKeyOrder(t *testing.T) {
	minutes, limit := 0.0, 30.0
	k := "kw"
	out := dump(LiveResult{Verdict: "fail", WaitedMinutes: &minutes, LimitMinutes: &limit, Pages: []LivePage{{URL: "u", Keyword: &k, Status: pass("200"), Noindex: fail("x"), Meta: pass(""), Sitemap: pass("")}}, Failed: []FailedItem{{"u", "noindex", "x"}}})
	want := "{\n  \"verdict\": \"fail\",\n  \"waitedMinutes\": 0,\n  \"limitMinutes\": 30,\n  \"pages\": [\n    {\n      \"url\": \"u\",\n      \"keyword\": \"kw\",\n      \"status\": {\n        \"ok\": true,\n        \"detail\": \"200\"\n      },\n      \"noindex\": {\n        \"ok\": false,\n        \"detail\": \"x\"\n      },"
	if !strings.HasPrefix(out, want) {
		t.Fatal(out)
	}
	notLive := dump(LiveResult{Verdict: "not-live", WaitedMinutes: &minutes, LimitMinutes: &limit, Pending: []string{"u"}, Pages: []LivePage{}, Failed: []FailedItem{}})
	if notLive != "{\n  \"verdict\": \"not-live\",\n  \"waitedMinutes\": 0,\n  \"limitMinutes\": 30,\n  \"pending\": [\n    \"u\"\n  ],\n  \"pages\": [],\n  \"failed\": []\n}" {
		t.Fatal(notLive)
	}
}

// ---- the record a passed check leaves on its issue ----

func okItem() *Obj {
	o := NewObj()
	o.Set("ok", true)
	o.Set("detail", "")
	return o
}

func resultOf(verdict string, keyword0 any) any {
	mk := func(url string, kw any) any {
		o := NewObj()
		o.Set("url", url)
		o.Set("keyword", kw)
		for _, k := range LiveItems {
			o.Set(k, okItem())
		}
		return o
	}
	r := NewObj()
	r.Set("verdict", verdict)
	r.Set("pages", []any{mk("https://cookbook.example/blog/weeknight-dinners/", keyword0), mk("https://cookbook.example/blog/meal-prep/", "meal prep for two")})
	r.Set("failed", []any{})
	return r
}

func TestTheMarkerWrittenIntoTheCommentReadsBack(t *testing.T) {
	body, err := LiveComment(resultOf("pass", "weeknight dinner ideas"), "2026-11-16", "321")
	if err != nil {
		t.Fatal(err)
	}
	recs := ParseMarkers(body)
	if len(recs) != 1 || recs[0].Get("mergedOn") != "2026-11-16" {
		t.Fatal(recs)
	}
	want := `{"mergedOn":"2026-11-16","pages":[{"url":"https://cookbook.example/blog/weeknight-dinners/","keyword":"weeknight dinner ideas","status":true,"noindex":true,"meta":true,"sitemap":true},{"url":"https://cookbook.example/blog/meal-prep/","keyword":"meal prep for two","status":true,"noindex":true,"meta":true,"sitemap":true}]}`
	if stringify(recs[0]) != want {
		t.Fatal(stringify(recs[0]))
	}
}

func TestTheCommentSaysTheCheckAndShowsEachURLForAPersonTheMarkerIsAHiddenHTMLComment(t *testing.T) {
	body, _ := LiveComment(resultOf("pass", "weeknight dinner ideas"), "2026-11-16", "321")
	for _, want := range []string{"上线自查", "#321", "weeknight dinner ideas", "<!-- seo-live-check: {"} {
		if !strings.Contains(body, want) {
			t.Errorf("%q missing from\n%s", want, body)
		}
	}
	if strings.Count(body, "-->") != 1 {
		t.Fatal("only one comment terminator: the JSON cannot close it early")
	}
	if !strings.HasPrefix(body, "上线自查：全过（2 个网址，合并日 2026-11-16，PR #321）\n\n| 网址 | 目标词 |") {
		t.Fatal(body)
	}
}

func TestAValueThatWouldCloseTheHTMLCommentCannotTheMarkerStillReadsBack(t *testing.T) {
	kw := `a --> b <script> & "quotes"`
	body, err := LiveComment(resultOf("pass", kw), "2026-11-16", "")
	if err != nil {
		t.Fatal(err)
	}
	pages := ParseMarkers(body)[0].Get("pages").([]any)
	if get(pages[0], "keyword") != kw {
		t.Fatal(get(pages[0], "keyword"))
	}
	if strings.Contains(body[strings.Index(body, "<!-- seo-live-check"):len(body)-3], "-->") {
		t.Fatal("the marker's JSON holds a bare -->")
	}
}

func TestATargetWordThatWasNotWrittenReadsBackAsNull(t *testing.T) {
	body, _ := LiveComment(resultOf("pass", nil), "2026-11-16", "")
	pages := ParseMarkers(body)[0].Get("pages").([]any)
	if get(pages[0], "keyword") != nil {
		t.Fatal(get(pages[0], "keyword"))
	}
}

func TestTextWithoutAMarkerAndAMarkerThatIsNotJSONReadAsNothing(t *testing.T) {
	for _, s := range []string{"🤖 idea-loop：上线自查没做", "<!-- seo-live-check: {not json} -->", ""} {
		if got := ParseMarkers(s); len(got) != 0 {
			t.Errorf("%q: %v", s, got)
		}
	}
}

func TestRecordOfOnlyTakesAPassedCheck(t *testing.T) {
	for _, v := range []string{"fail", "not-live"} {
		if _, err := RecordOf(resultOf(v, "x"), "2026-11-16"); err == nil || !strings.Contains(err.Error(), "全过") {
			t.Errorf("%s: %v", v, err)
		}
	}
	if _, err := RecordOf(resultOf("pass", "x"), "16 Nov"); err == nil || !strings.Contains(err.Error(), "YYYY-MM-DD") {
		t.Fatal(err)
	}
}

func TestLiveChangesListsEachPageOfEachClosedIssueThatCarriesTheMarkerOneRowPerURL(t *testing.T) {
	body, _ := LiveComment(resultOf("pass", "weeknight dinner ideas"), "2026-11-16", "")
	rows := LiveChanges([]IssueWithComments{
		{12, "SEO（已有页面优化）：改标题", []string{"🤖 idea-loop：开工了", "🤖 idea-loop：\n" + body}},
		{13, "没有自查", []string{"随便说两句"}},
		{14, "没有评论", nil},
	}, "")
	if len(rows) != 2 {
		t.Fatal(rows)
	}
	want := `{"issue":12,"title":"SEO（已有页面优化）：改标题","url":"https://cookbook.example/blog/weeknight-dinners/","keyword":"weeknight dinner ideas","mergedOn":"2026-11-16","status":true,"noindex":true,"meta":true,"sitemap":true}`
	if stringify(rows[0]) != want {
		t.Fatal(stringify(rows[0]))
	}
}

func TestLiveChangesSinceKeepsTheChangesMergedOnOrAfterThatDay(t *testing.T) {
	old, _ := LiveComment(resultOf("pass", "x"), "2026-10-01", "")
	fresh, _ := LiveComment(resultOf("pass", "x"), "2026-11-10", "")
	rows := LiveChanges([]IssueWithComments{{1, "a", []string{old}}, {2, "b", []string{fresh}}}, "2026-11-01")
	seen := map[float64]bool{}
	for _, r := range rows {
		seen[r.Get("issue").(float64)] = true
	}
	if !reflect.DeepEqual(seen, map[float64]bool{2: true}) {
		t.Fatal(seen)
	}
}

func TestMarkerIsTheSameTextTheCommentPutsInTheComment(t *testing.T) {
	rec, _ := RecordOf(resultOf("pass", "x"), "2026-11-16")
	body, _ := LiveComment(resultOf("pass", "x"), "2026-11-16", "")
	if !strings.Contains(body, Marker(rec)) {
		t.Fatal(body)
	}
}

func TestAnIssueWhoseBodyCarriesTheRollbackSentenceCameFromARollback(t *testing.T) {
	if RollbackLine != "由上线自查回滚而来" {
		t.Fatal(RollbackLine)
	}
	for body, want := range map[string]bool{
		"## 问题\n\n改了 /blog/meal-prep/ 的 title，上线后带了 noindex\n\n## 从哪发现\n\n合并后的上线自查，" + RollbackLine + "。原 issue #12。": true,
		RollbackLine: true,
		"## 背景\n\n原 issue 改的是 /blog/meal-prep/ 的 title；上线自查查的是状态码、noindex、meta、sitemap\n\n## 问题\n\n上线后带了 noindex\n\n## 从哪发现\n\n" + RollbackLine: true,
		"## 问题\n\n/blog/meal-prep/ 的 title 太长，被截断": false,
		"由上线自查回退而来":                                false,
		"":                                         false,
	} {
		if got := CameFromRollback(body); got != want {
			t.Errorf("%q: %v", body, got)
		}
	}
}

func TestFromRollbackReadsTheIssueBodyThroughGhAndDoesNotGuess(t *testing.T) {
	var calls [][]string
	gh := func(body string) func([]string) (string, error) {
		return func(args []string) (string, error) {
			calls = append(calls, args)
			return `{"body":` + stringify(body) + `}`, nil
		}
	}
	if got, err := FromRollback(gh("从哪发现：上线自查。"+RollbackLine), "12"); err != nil || !got {
		t.Fatal(got, err)
	}
	if !reflect.DeepEqual(calls[0], []string{"issue", "view", "12", "--json", "body"}) {
		t.Fatal(calls[0])
	}
	if got, _ := FromRollback(gh("## 问题\n\n页面 title 太长"), "13"); got {
		t.Fatal("an ordinary body")
	}
	nullBody := func(args []string) (string, error) { return `{"body":null}`, nil }
	if got, err := FromRollback(nullBody, "14"); err != nil || got {
		t.Fatal("an issue with no body is an ordinary one")
	}
	if _, err := FromRollback(nullBody, "ENG-123"); err == nil || !strings.Contains(err.Error(), "issue 号") {
		t.Fatal(err)
	}
	if _, err := FromRollback(func([]string) (string, error) { return "", fmt.Errorf("gh: not found") }, "12"); err == nil || !strings.Contains(err.Error(), "not found") {
		t.Fatal(err)
	}
}
