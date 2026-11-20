package report

// The assertions of design-review-report.test.mjs, one for one.

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/url"
	"os"
	"path/filepath"
	"reflect"
	"regexp"
	"strconv"
	"strings"
	"testing"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/design/jsx"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/nexterr"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/research"
)

// A 1x1 PNG; every picture in these fixtures is this one, which is enough to see it inlined.
var pixel, _ = base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==")

func fakeImage(path string) ([]byte, error) {
	if !strings.HasSuffix(path, ".png") && !strings.HasSuffix(path, ".jpg") {
		return nil, errors.New("not an image")
	}
	return pixel, nil
}

var canvas = Canvas{Current: "http://127.0.0.1:4173/v3.html", Previous: "http://127.0.0.1:4173/v2.html"}

// J is a JSON value written as Go values; marshalled and read back as the command reads a file.
type J = map[string]any
type L = []any

func parsed(t *testing.T, v any) any {
	t.Helper()
	var b bytes.Buffer
	enc := json.NewEncoder(&b)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(v); err != nil {
		t.Fatal(err)
	}
	p, err := jsx.ParseJSON(b.Bytes())
	if err != nil {
		t.Fatal(err)
	}
	return p
}

// Four judge opinions: a direction one, a pattern one, and two craft ones the researcher merged / could not cover.
func fixtureJudge() J {
	return J{
		"findings": L{
			J{"kind": "direction", "state": "quiz-exit", "where": "退出入口", "detail": "退出入口应该整个挪进二级菜单", "why": "一级入口太抢眼", "reference": "练习页里退出要多走一步的画面"},
			J{"kind": "pattern", "state": "quiz-exit", "where": "确认窗", "detail": "确认窗的主按钮应该是留下", "why": "防止误退出", "reference": "确认窗里默认动作是留下"},
			J{"kind": "craft", "state": "results", "where": "分数卡", "detail": "分数字号比标题小", "why": "层级倒了", "reference": "结果页分数最大"},
			J{"kind": "craft", "state": "results", "where": "空状态", "detail": "空状态没有重试按钮", "why": "用户走不下去", "reference": "空状态下的重试"},
		},
		"reasoning": L{
			J{"id": "1", "verdict": "成立", "why": "保持一级入口符合人的意图"},
			J{"id": "2", "verdict": "存疑", "why": "卡片阴影与整体扁平不一致"},
		},
		"score": 7,
		"note":  "整体接近，退出入口的取舍要人定",
	}
}

// What the human wrote this round: the two thoughts the critic assessed, and one kept after discussion (not assessed).
const thoughtsMD = "1 | 退出入口我想保持在一级，不要藏起来\n2 | 卡片阴影可以留一点，\n但不要太重\n3 | 三卡布局我就要这样\n"

func fixtureThoughts(t *testing.T) []Thought {
	th, err := ParseThoughts(thoughtsMD)
	if err != nil {
		t.Fatal(err)
	}
	return th
}

func fixtureResearch() J {
	return J{
		"mode": "light", "mobbin": "connected",
		"items": L{
			J{
				"covers":    L{1},
				"path":      L{J{"source": "Acme 练习", "saw": "右上角有一个 X", "did": "点 X", "then": "弹出确认窗", "images": L{"shots/acme-1.jpg"}, "reading": "先确认再退出"}},
				"intent":    "退出入口留在右上角，点后先弹确认",
				"overturns": L{J{"ledger": "1.2", "why": "Acme 把退出放在第一屏，用户一步就找到"}},
			},
			J{
				"covers": L{2, 3},
				"path":   L{J{"source": "Acme 练习", "saw": "确认窗", "did": "点「继续」", "then": "回到练习页", "images": L{"shots/acme-2.jpg", "shots/acme-3.jpg"}, "reading": "默认动作是留下"}},
				"intent": "确认窗里「继续」是主按钮，分数最大",
			},
		},
		"uncovered": L{J{"opinion": 4, "why": "搜了两个角度，没有能呈现空状态重试的画面"}},
	}
}

func defaultUndeclared() L {
	return L{
		J{"cell": "quiz-exit", "state": "quiz-exit", "anchor": "footer", "kind": "changed",
			"changes":      L{J{"property": "backgroundColor", "before": "rgb(255, 255, 255)", "after": "rgb(240, 240, 240)", "delta": nil}},
			"pixelPercent": 3.5, "shots": J{"before": "/shots/quiz-exit--footer--before.png", "after": "/shots/quiz-exit--footer--after.png"}},
		J{"cell": "results", "state": "results", "anchor": "badge", "kind": "added", "changes": L{}, "pixelPercent": nil, "shots": nil},
	}
}

func fixtureDiff(undeclared L) J {
	if undeclared == nil {
		undeclared = defaultUndeclared()
	}
	return J{"mode": "canvas-diff", "classified": true, "changed": L{}, "declared": L{}, "declaredUnchanged": L{}, "unchecked": L{}, "humanReviewCells": L{}, "undeclared": undeclared}
}

type over struct {
	judge, research, diff, dissatisfied, selfCheck any
	hasSelfCheck                                   bool
	thoughts                                       []Thought
	noThoughts                                     bool
	canvas                                         *Canvas
	readImage                                      func(string) ([]byte, error)
}

func buildWith(t *testing.T, o over) (Report, error) {
	t.Helper()
	in := Inputs{Judge: parsed(t, fixtureJudge()), Research: parsed(t, fixtureResearch()), Diff: parsed(t, fixtureDiff(nil)), Canvas: canvas, Thoughts: fixtureThoughts(t), ReadImage: fakeImage}
	if o.judge != nil {
		in.Judge = parsed(t, o.judge)
	}
	if o.research != nil {
		in.Research = parsed(t, o.research)
	}
	if o.diff != nil {
		in.Diff = parsed(t, o.diff)
	}
	if o.dissatisfied != nil {
		in.Dissatisfied = parsed(t, o.dissatisfied)
	}
	if o.hasSelfCheck {
		in.SelfCheck, in.HasSelfCheck = parsed(t, o.selfCheck), true
	}
	if o.thoughts != nil {
		in.Thoughts = o.thoughts
	}
	if o.noThoughts {
		in.Thoughts = nil
	}
	if o.canvas != nil {
		in.Canvas = *o.canvas
	}
	if o.readImage != nil {
		in.ReadImage = o.readImage
	}
	return Build(in)
}

func build(t *testing.T, o over) Report {
	t.Helper()
	r, err := buildWith(t, o)
	if err != nil {
		t.Fatal(err)
	}
	return r
}

func refused(t *testing.T, o over, re string) {
	t.Helper()
	_, err := buildWith(t, o)
	if err == nil || !regexp.MustCompile(re).MatchString(err.Error()) {
		t.Errorf("want an error matching %s, got %v", re, err)
	}
}

func article(html string, n int) string {
	return regexp.MustCompile(`<article id="r` + itoa(n) + `"[\s\S]*?</article>`).FindString(html)
}

func itoa(n int) string { return strconv.Itoa(n) }

func sectionOrder(html string) []string {
	var out []string
	for _, m := range regexp.MustCompile(`<section data-section="([a-z]+)"`).FindAllStringSubmatch(html, -1) {
		out = append(out, m[1])
	}
	return out
}

func match(t *testing.T, s, re string) {
	t.Helper()
	if !regexp.MustCompile(re).MatchString(s) {
		t.Errorf("%s does not match:\n%s", re, s)
	}
}

func count(s, re string) int { return len(regexp.MustCompile(re).FindAllStringIndex(s, -1)) }

func entryOf(entries []Entry, pred func(Entry) bool) Entry {
	for _, e := range entries {
		if pred(e) {
			return e
		}
	}
	return Entry{}
}

func byOpinion(n int) func(Entry) bool { return func(e Entry) bool { return e.Opinion == n } }

func TestTheFourSectionsComeInOrderTheUndeclaredChangesFirst(t *testing.T) {
	html := build(t, over{}).HTML
	if got := sectionOrder(html); !reflect.DeepEqual(got, []string{"undeclared", "opinions", "reasoning", "score"}) {
		t.Fatal(got)
	}
	a, b, c, d := strings.Index(html, "没声明却变了的地方"), strings.Index(html, "评委的意见"), strings.Index(html, "评委对你这一轮思路的评估"), strings.Index(html, "分数与评委的总评")
	if !(a < b && b < c && c < d) {
		t.Fatal(a, b, c, d)
	}
}

func TestWithoutUndeclaredChangesTheFirstSectionIsNotThere(t *testing.T) {
	r := build(t, over{diff: fixtureDiff(L{})})
	if got := sectionOrder(r.HTML); !reflect.DeepEqual(got, []string{"opinions", "reasoning", "score"}) || strings.Contains(r.HTML, "没声明却变了的地方") {
		t.Fatal(got)
	}
	if r.Entries[0].N != 1 || r.Entries[0].Section != "opinions" {
		t.Fatal(r.Entries[0])
	}
}

func TestEachUndeclaredChangeShowsBeforeAndAfterAndAsksKeepOrUndo(t *testing.T) {
	html := build(t, over{}).HTML
	first := article(html, 1)
	for _, re := range []string{`quiz-exit · footer`, `改前`, `改后`, `留，还是撤`, `backgroundColor：rgb\(255, 255, 255\) → rgb\(240, 240, 240\)`, `区域像素差 3\.50%`} {
		match(t, first, re)
	}
	if count(first, `<img `) != 2 {
		t.Fatal(first)
	}
	second := article(html, 2)
	match(t, second, `新增了这个锚点`)
	if count(second, `<img `) != 0 {
		t.Fatal(second)
	}
}

func TestNumbersAreUniqueAcrossSectionsAndConsecutiveFrom1(t *testing.T) {
	r := build(t, over{})
	var numbers []int
	for _, m := range regexp.MustCompile(`<article id="r(\d+)" data-n="(\d+)"`).FindAllStringSubmatch(r.HTML, -1) {
		if m[1] != m[2] {
			t.Fatal(m)
		}
		numbers = append(numbers, len(numbers)+1)
		if m[1] != itoa(len(numbers)) {
			t.Fatalf("not consecutive: %v", m)
		}
	}
	if len(numbers) != 2+4+2 || len(r.Entries) != len(numbers) {
		t.Fatal(len(numbers), len(r.Entries))
	}
	for i, e := range r.Entries {
		if e.N != i+1 {
			t.Fatal(r.Entries)
		}
	}
}

func hrefs(t *testing.T, html string) []*url.URL {
	var out []*url.URL
	for _, m := range regexp.MustCompile(`<a href="([^"]+)"`).FindAllStringSubmatch(html, -1) {
		u, err := url.Parse(strings.ReplaceAll(m[1], "&amp;", "&"))
		if err != nil {
			t.Fatal(err)
		}
		out = append(out, u)
	}
	return out
}

func TestEveryOpinionLinksToThisVersionAndItsOwnStateUndeclaredChangesToBothVersions(t *testing.T) {
	r := build(t, over{})
	for _, e := range r.Entries {
		if e.Section != "opinions" {
			continue
		}
		hs := hrefs(t, article(r.HTML, e.N))
		if len(hs) != 1 || hs[0].Path != "/v3.html" || hs[0].Query().Get("state") != e.State {
			t.Fatalf("opinion #%d: %v", e.N, hs)
		}
	}
	hs := hrefs(t, article(r.HTML, 1))
	if len(hs) != 2 || hs[0].Path != "/v3.html" || hs[1].Path != "/v2.html" || hs[0].Query().Get("state") != "quiz-exit" || hs[1].Query().Get("state") != "quiz-exit" {
		t.Fatal(hs)
	}
}

func TestCanvasLinkAndVersionLabelFollowTheCanvasShellsWayOfAddressing(t *testing.T) {
	if got := CanvasLink("http://127.0.0.1:4173/v3.html", "quiz-exit"); got != "http://127.0.0.1:4173/v3.html?state=quiz-exit" {
		t.Fatal(got)
	}
	if got := VersionLabel("http://127.0.0.1:4173/v3.html"); got != "v3" {
		t.Fatal(got)
	}
	if got := VersionLabel("http://127.0.0.1:4173/"); got != "127.0.0.1:4173" {
		t.Fatal(got)
	}
	if got := CanvasLink("http://h/p?lang=zh&state=old", "new"); got != "http://h/p?lang=zh&state=new" {
		t.Fatal(got)
	}
}

func TestNoPictureIsAReferenceToAnOutsideFileEveryImageIsInlined(t *testing.T) {
	html := build(t, over{}).HTML
	sources := regexp.MustCompile(`<img [^>]*src="([^"]*)"`).FindAllStringSubmatch(html, -1)
	if len(sources) != 5 {
		t.Fatalf("two area shots + the researcher's three pictures: %d", len(sources))
	}
	for _, s := range sources {
		if !strings.HasPrefix(s[1], "data:image/") {
			t.Fatal(s[1])
		}
	}
	if regexp.MustCompile(`(?i)<link[^>]+href`).MatchString(html) || regexp.MustCompile(`(?i)<script[^>]+src`).MatchString(html) || regexp.MustCompile(`url\(\s*['"]?(https?:|/|\.)`).MatchString(html) {
		t.Fatal("an outside reference")
	}
}

func TestADirectionOpinionTheHumanWasUnhappyAboutRecommendsReopeningWithTheirWords(t *testing.T) {
	r := build(t, over{dissatisfied: L{J{"opinion": 1, "quote": "退出入口放二级菜单我不要，找不到"}}})
	e := entryOf(r.Entries, byOpinion(1))
	if e.Recommend != RecommendReopen {
		t.Fatal(e)
	}
	card := article(r.HTML, e.N)
	match(t, card, `推荐：`+RecommendReopen)
	match(t, card, `退出入口放二级菜单我不要，找不到`)
}

func TestADirectionOpinionWithNoMarkRecommendsKeeping(t *testing.T) {
	r := build(t, over{})
	e := entryOf(r.Entries, byOpinion(1))
	card := article(r.HTML, e.N)
	if e.Recommend != RecommendKeep || strings.Contains(card, RecommendReopen) {
		t.Fatal(e)
	}
	match(t, card, `推荐：`+RecommendKeep)
}

func TestAMarkOnAnOpinionThatIsNotADirectionOneOrOutOfRangeIsRefused(t *testing.T) {
	refused(t, over{dissatisfied: L{J{"opinion": 2, "quote": "不满意"}}}, `not a direction opinion`)
	refused(t, over{dissatisfied: L{J{"opinion": 9, "quote": "不满意"}}}, `opinion numbers 1–4`)
	refused(t, over{dissatisfied: L{J{"opinion": 1, "quote": " "}}}, `human's own words`)
}

func TestAnOverturnOfTheLedgerIsMarkedOnItsOpinion(t *testing.T) {
	r := build(t, over{})
	e := entryOf(r.Entries, byOpinion(1))
	if !reflect.DeepEqual(e.Overturns, []Overturn{{Ledger: "1.2", Why: "Acme 把退出放在第一屏，用户一步就找到"}}) {
		t.Fatal(e.Overturns)
	}
	match(t, article(r.HTML, e.N), `class="overturn"[^>]*>推翻 ledger 1\.2（报告 #3）：Acme 把退出放在第一屏，用户一步就找到`)
	if strings.Contains(article(r.HTML, 4), `class="overturn"`) {
		t.Fatal("the other items are not marked")
	}
	match(t, r.Summary, `#3 提议推翻 ledger 1\.2`)
}

func TestOpinionsTheResearcherMergedShowThePathOnceAndPointTheOthersAtIt(t *testing.T) {
	r := build(t, over{})
	second, third := entryOf(r.Entries, byOpinion(2)), entryOf(r.Entries, byOpinion(3))
	match(t, article(r.HTML, second.N), `用户路径`)
	match(t, article(r.HTML, second.N), `新的设计意图：</strong>确认窗里「继续」是主按钮`)
	match(t, article(r.HTML, third.N), `跟 #`+itoa(second.N)+` 是同一件事`)
	if strings.Contains(article(r.HTML, third.N), "新的设计意图：") {
		t.Fatal("intent shown twice")
	}
	match(t, article(r.HTML, entryOf(r.Entries, byOpinion(4)).N), `没有找到能呈现这一点的参考：搜了两个角度`)
}

func TestWithMobbinNotConnectedTheReportStillComesOutAndSaysThereAreNoReferencePictures(t *testing.T) {
	r := build(t, over{research: J{"mode": "light", "mobbin": "unavailable", "message": NoReferenceMessage, "reason": "search_screens 返回要先登录", "items": L{}}})
	opinions := regexp.MustCompile(`<section data-section="opinions">[\s\S]*?</section>`).FindString(r.HTML)
	if count(opinions, NoReferenceMessage) != 4 || strings.Contains(opinions, "<img") || strings.Contains(opinions, "新的设计意图") {
		t.Fatal(opinions)
	}
	if entryOf(r.Entries, byOpinion(2)).Recommend != "收下评委的意见" {
		t.Fatal(r.Entries)
	}
	if !reflect.DeepEqual(sectionOrder(r.HTML), []string{"undeclared", "opinions", "reasoning", "score"}) {
		t.Fatal(sectionOrder(r.HTML))
	}
}

func TestTheConversationTextHoldsTheScoreAndTheItemsNeedingAttentionAndNothingElse(t *testing.T) {
	s := build(t, over{dissatisfied: L{J{"opinion": 1, "quote": "退出入口放二级菜单我不要，找不到"}}}).Summary
	match(t, s, `7 分`)
	match(t, s, `没声明却变了的地方 2 处：#1、#2`)
	match(t, s, `提议推翻 ledger 1\.2`)
	match(t, s, `#3 方向性意见（quiz-exit），推荐回 imagine 重开这一块`)
	for _, body := range []string{"退出入口应该整个挪进二级菜单", "确认窗里「继续」是主按钮", "保持一级入口符合人的意图", "整体接近", "http", "data:", "<"} {
		if strings.Contains(s, body) {
			t.Errorf("summary must not carry: %s", body)
		}
	}
	if n := len(strings.Split(s, "\n")); n != 1+1+3 {
		t.Fatalf("title, the heading, three attention lines: %d\n%s", n, s)
	}
}

func TestAQuietRoundSaysThereIsNothingSpecialToLookAt(t *testing.T) {
	judge := J{"findings": L{J{"kind": "craft", "state": "results", "where": "分数卡", "detail": "d", "why": "w", "reference": "r"}}, "reasoning": L{}, "score": 9, "note": nil}
	research := J{"mode": "light", "mobbin": "connected", "items": L{J{"covers": L{1}, "path": L{J{"source": "S", "saw": "a", "did": "b", "then": "c", "images": L{"shots/x.png"}, "reading": "r"}}, "intent": "i"}}}
	r := build(t, over{judge: judge, research: research, diff: fixtureDiff(L{})})
	match(t, r.Summary, `9 分`)
	match(t, r.Summary, `没有要特别注意的项`)
	match(t, r.HTML, `这一轮没有要评估的思路`)
	match(t, r.HTML, `评委没有写总评`)
}

func TestEachAssessedThoughtShowsTheHumansOwnWordsThenTheVerdictAndReason(t *testing.T) {
	r := build(t, over{})
	var reasoning []Entry
	for _, e := range r.Entries {
		if e.Section == "reasoning" {
			reasoning = append(reasoning, e)
		}
	}
	one := article(r.HTML, reasoning[0].N)
	match(t, one, `你说：「退出入口我想保持在一级，不要藏起来」`)
	match(t, one, `→ 评委：<span class="tag">成立</span>，理由：保持一级入口符合人的意图`)
	match(t, article(r.HTML, reasoning[1].N), `你说：「卡片阴影可以留一点，<br>但不要太重」`)
	match(t, article(r.HTML, reasoning[1].N), `存疑`)
	if strings.Contains(r.HTML, "三卡布局我就要这样") || reasoning[0].Quote != "退出入口我想保持在一级，不要藏起来" {
		t.Fatal("the thought nobody assessed is not shown")
	}
}

func TestAThoughtTheCriticAssessedWithNoWordsIsRefusedEveryMissingOneListed(t *testing.T) {
	refused(t, over{thoughts: []Thought{{ID: "1", Quote: "退出入口我想保持在一级"}}}, `no words from the human[\s\S]*: 2$`)
	refused(t, over{thoughts: []Thought{}}, `thoughts the critic assessed: 1, 2`)
	refused(t, over{thoughts: []Thought{{ID: "1", Quote: "  "}, {ID: "2", Quote: "有"}}}, `: 1$`)
	refused(t, over{noThoughts: true}, `thoughts must be an array`)
}

func TestThoughtsMdIsReadOneThoughtPerLineWithContinuationLines(t *testing.T) {
	got, err := ParseThoughts("1 | 甲\n\n1.2 | 乙\n丙\n")
	if err != nil || !reflect.DeepEqual(got, []Thought{{"1", "甲"}, {"1.2", "乙\n丙"}}) {
		t.Fatal(got, err)
	}
	if _, err := ParseThoughts("开头没有编号\n1 | 甲"); err == nil || !strings.Contains(err.Error(), "line 1: expected") {
		t.Fatal(err)
	}
	if _, err := ParseThoughts("1 | 甲\n1 | 乙"); err == nil || !strings.Contains(err.Error(), "thought 1 appears twice") {
		t.Fatal(err)
	}
}

func TestScoreAndNoteCloseThePage(t *testing.T) {
	score := regexp.MustCompile(`<section data-section="score">[\s\S]*?</section>`).FindString(build(t, over{}).HTML)
	match(t, score, `<strong>7</strong> / 10`)
	match(t, score, `整体接近，退出入口的取舍要人定`)
}

func TestTextFromTheInputsIsEscaped(t *testing.T) {
	judge := fixtureJudge()
	judge["findings"].(L)[0].(J)["detail"] = `<script>alert(1)</script> & "x"`
	html := build(t, over{judge: judge}).HTML
	if strings.Contains(html, "<script>alert(1)") {
		t.Fatal("not escaped")
	}
	match(t, html, `&lt;script&gt;alert\(1\)&lt;/script&gt; &amp; &quot;x&quot;`)
}

func TestInputsThatCannotMakeASoundReportAreRefusedWithEveryProblemNamed(t *testing.T) {
	unclassified := fixtureDiff(nil)
	unclassified["classified"] = false
	refused(t, over{diff: unclassified}, `without a change set`)
	r := fixtureResearch()
	r["uncovered"] = L{}
	refused(t, over{research: r}, `opinion 4 has neither a research item nor an entry in research.uncovered`)
	dup := fixtureResearch()
	dup["items"].(L)[1].(J)["covers"] = L{1, 2, 3}
	refused(t, over{research: dup}, `opinion 1 is covered by two research items`)
	stray := fixtureResearch()
	stray["items"].(L)[0].(J)["covers"] = L{7}
	refused(t, over{research: stray}, `opinion 7, which the critic did not give`)
	refused(t, over{canvas: &Canvas{Current: "not a url"}}, `canvas.current`)
	bad := fixtureJudge()
	bad["findings"].(L)[0].(J)["kind"] = "other"
	bad["score"] = 11
	refused(t, over{judge: bad}, `kind must be one of[\s\S]*score must be an integer`)
}

func TestAPictureThatCannotBeReadStopsTheReport(t *testing.T) {
	refused(t, over{readImage: func(string) ([]byte, error) { return nil, errors.New("ENOENT") }}, `cannot read image .*ENOENT`)
	r := fixtureResearch()
	r["items"].(L)[0].(J)["path"].(L)[0].(J)["images"] = L{"shots/acme-1.svg"}
	refused(t, over{research: r, readImage: func(string) ([]byte, error) { return pixel, nil }}, `cannot inline`)
}

func TestOpinionNumbersMayBeWritten1OrQuoted1LikeTheReturnCheckDoes(t *testing.T) {
	asText := fixtureResearch()
	asText["items"].(L)[0].(J)["covers"] = L{"1"}
	asText["items"].(L)[1].(J)["covers"] = L{"2", 3}
	asText["uncovered"] = L{J{"opinion": "4", "why": "搜了两个角度，没有能呈现空状态重试的画面"}}
	verdict := research.CheckLight(parsed(t, asText), research.LightContext{FileExists: func(string) bool { return true }, Opinions: []string{"1", "2", "3", "4"}})
	if !verdict.Valid {
		t.Fatal(verdict.Errors)
	}
	plain := build(t, over{})
	text := build(t, over{research: asText})
	if !reflect.DeepEqual(text.Entries, plain.Entries) {
		t.Fatalf("%+v\n%+v", text.Entries, plain.Entries)
	}
	match(t, article(text.HTML, 3), `退出入口留在右上角，点后先弹确认`)
	match(t, article(text.HTML, 3), `推翻 ledger 1\.2`)
	match(t, article(text.HTML, 6), `没有找到能呈现这一点的参考：搜了两个角度`)
	match(t, article(text.HTML, 5), `跟 #4 是同一件事`)
}

func TestTheSameOpinionWrittenBothWaysIsCoveredTwiceAndOddNumbersAreNoOpinion(t *testing.T) {
	dup := fixtureResearch()
	dup["items"].(L)[1].(J)["covers"] = L{"1", 3}
	refused(t, over{research: dup}, `opinion 1 is covered by two research items`)
	for _, bad := range []any{"01", "x", 0, "0"} {
		r := fixtureResearch()
		r["items"].(L)[0].(J)["covers"] = L{bad}
		refused(t, over{research: r}, `covers opinion `+jsString(parsed(t, bad))+`, which the critic did not give`)
	}
}

func TestThePageAsksForAResponseToEveryOpinion(t *testing.T) {
	html := build(t, over{}).HTML
	match(t, html, `每一条都请回应，没回的会话会接着问`)
	if strings.Contains(html, "没提到") || strings.Contains(html, "照各条的推荐处理") {
		t.Fatal("old wording")
	}
}

func selfCheck() L {
	return L{
		J{"state": "quiz-exit", "anchor": "footer", "what": "页脚底色从白改成浅灰", "why": "页脚和正文没有层次，自检时觉得糊在一起"},
		J{"state": "results", "anchor": "sidebar", "what": "删掉侧栏的装饰线", "why": "纯装饰，自检时按减法删了"},
	}
}

var sidebar = SelfCheckEntry{State: "results", Anchor: "sidebar", What: "删掉侧栏的装饰线", Why: "纯装饰，自检时按减法删了"}

func TestASelfCheckReasonIsWrittenBesideTheUndeclaredChangeItMatches(t *testing.T) {
	r := build(t, over{selfCheck: selfCheck(), hasSelfCheck: true})
	footer := article(r.HTML, 1)
	match(t, footer, `designer 自检：</strong>页脚和正文没有层次，自检时觉得糊在一起`)
	match(t, footer, `designer 写的改动：页脚底色从白改成浅灰`)
	if strings.Contains(footer, "designer 没说明为什么改") {
		t.Fatal(footer)
	}
	badge := article(r.HTML, 2)
	match(t, badge, `designer 没说明为什么改`)
	if strings.Contains(badge, "designer 自检：") {
		t.Fatal(badge)
	}
	if r.Entries[0].SelfCheck == nil || *r.Entries[0].SelfCheck != "页脚和正文没有层次，自检时觉得糊在一起" || r.Entries[1].SelfCheck != nil || !r.Entries[1].HasSelfCheck {
		t.Fatal(r.Entries[:2])
	}
	if !reflect.DeepEqual(r.UnmatchedSelfCheck, []SelfCheckEntry{sidebar}) {
		t.Fatal(r.UnmatchedSelfCheck)
	}
	if strings.Index(footer, "designer 自检") > strings.Index(footer, "<img") {
		t.Fatal("the reason sits before the pictures")
	}
}

// A decision changed the score card's font size; the designer's self-check also removed a badge inside the same card.
// The comparison counts the whole card as declared, so the self-check edit is not in `undeclared`.
func scoreCard() J {
	return J{"cell": "results", "state": "results", "anchor": "score-card", "kind": "changed", "decisions": L{"2.1"},
		"changes": L{J{"property": "font-size", "before": "20px", "after": "28px", "delta": nil}}, "pixelPercent": 31,
		"shots": J{"before": "/shots/results--score-card--before.png", "after": "/shots/results--score-card--after.png"}}
}

func overlapSelfCheck() J {
	return J{"state": "results", "anchor": "score-card", "what": "删掉分数卡右上角的装饰徽章", "why": "多余的装饰"}
}

func overlapDiff() J {
	d := fixtureDiff(nil)
	d["declared"] = L{scoreCard()}
	return d
}

func TestASelfCheckEditInsideADeclaredBlockIsListedWithTheBlocksPicturesTheReasonAndTheDecision(t *testing.T) {
	r := build(t, over{diff: overlapDiff(), selfCheck: append(selfCheck(), overlapSelfCheck()), hasSelfCheck: true})
	if !reflect.DeepEqual(sectionOrder(r.HTML), []string{"undeclared", "opinions", "reasoning", "score"}) {
		t.Fatal(sectionOrder(r.HTML))
	}
	card := article(r.HTML, 3)
	if card == "" || strings.Index(r.HTML, `data-n="3"`) > strings.Index(r.HTML, `data-section="opinions"`) {
		t.Fatal("the third entry is the hidden self-check edit, in the first section")
	}
	for _, re := range []string{`results · score-card`, `designer 自检：</strong>多余的装饰`, `删掉分数卡右上角的装饰徽章`, `决策 2\.1`, `留，还是撤`, `v3\.html\?state=results`} {
		match(t, card, re)
	}
	if count(card, `<img `) != 2 {
		t.Fatal(card)
	}
	why := "多余的装饰"
	if e := entryOf(r.Entries, func(e Entry) bool { return e.N == 3 }); !reflect.DeepEqual(e, Entry{N: 3, Section: "undeclared", State: "results", Anchor: "score-card", HasSelfCheck: true, SelfCheck: &why, AlsoDeclaredBy: []string{"2.1"}}) {
		t.Fatalf("%+v", e)
	}
	if entryOf(r.Entries, func(e Entry) bool { return e.Section == "opinions" }).N != 4 {
		t.Fatal("the opinions keep counting on")
	}
	if !reflect.DeepEqual(r.UnmatchedSelfCheck, []SelfCheckEntry{sidebar}) {
		t.Fatal(r.UnmatchedSelfCheck)
	}
	match(t, r.Summary, `没声明却变了的地方 3 处：#1、#2、#3`)
}

func undeclaredCount(r Report) int {
	n := 0
	for _, e := range r.Entries {
		if e.Section == "undeclared" {
			n++
		}
	}
	return n
}

func TestASelfCheckEntryThatMatchesNeitherIsLeftOffThePageAndHandedBack(t *testing.T) {
	r := build(t, over{diff: overlapDiff(), selfCheck: L{J{"state": "results", "anchor": "nowhere", "what": "w", "why": "y"}}, hasSelfCheck: true})
	if undeclaredCount(r) != 2 || strings.Contains(r.HTML, "nowhere") || len(r.UnmatchedSelfCheck) != 1 {
		t.Fatal(r.Entries, r.UnmatchedSelfCheck)
	}
}

func TestADeclaredChangeWithNoSelfCheckEntryIsNotListed(t *testing.T) {
	noEntry := build(t, over{diff: overlapDiff(), selfCheck: selfCheck(), hasSelfCheck: true})
	if undeclaredCount(noEntry) != 2 || strings.Contains(noEntry.HTML, "score-card") {
		t.Fatal(noEntry.Entries)
	}
	if strings.Contains(build(t, over{diff: overlapDiff()}).HTML, "score-card") {
		t.Fatal("without a self-check input nothing is added")
	}
}

func TestAPlaceInBothTheUndeclaredAndTheDeclaredListIsShownOnce(t *testing.T) {
	d := fixtureDiff(nil)
	sc := scoreCard()
	sc["state"], sc["anchor"] = "quiz-exit", "footer"
	d["declared"] = L{sc}
	if n := undeclaredCount(build(t, over{diff: d, selfCheck: selfCheck(), hasSelfCheck: true})); n != 2 {
		t.Fatal(n)
	}
}

func TestWithoutASelfCheckInputThePageSaysNothingAboutReasons(t *testing.T) {
	none := build(t, over{}).HTML
	if strings.Contains(none, "designer 自检") || strings.Contains(none, "designer 没说明") {
		t.Fatal("reasons mentioned")
	}
	if n := count(build(t, over{selfCheck: L{}, hasSelfCheck: true}).HTML, `designer 没说明为什么改`); n != 2 {
		t.Fatal(n)
	}
}

func TestASelfCheckInputOfTheWrongShapeOrRepeatingAPlaceIsRefused(t *testing.T) {
	refused(t, over{selfCheck: J{"state": "a"}, hasSelfCheck: true}, `selfCheck must be an array`)
	refused(t, over{selfCheck: L{J{"state": "results", "anchor": "x", "what": "w"}}, hasSelfCheck: true}, `selfCheck\[0\]\.why must be a non-empty string`)
	refused(t, over{selfCheck: L{selfCheck()[0], selfCheck()[0]}, hasSelfCheck: true}, `written twice`)
}

// ---- the command line ----

func run(args ...string) (stdout, stderr string, code int) {
	c := Command()
	var o, e bytes.Buffer
	c.SetArgs(args)
	c.SetOut(&o)
	c.SetErr(&e)
	if err := c.Execute(); err != nil {
		var ex *nexterr.Exit
		if errors.As(err, &ex) {
			if ex.Msg != "" {
				e.WriteString(ex.Msg + "\n")
			}
			return o.String(), e.String(), ex.Code
		}
		return o.String(), e.String() + err.Error(), 1
	}
	return o.String(), e.String(), 0
}

type cliFiles struct {
	research any
	thoughts *string
}

func runCli(t *testing.T, files cliFiles, extra ...string) (stdout, stderr string, code int, out string) {
	t.Helper()
	dir := t.TempDir()
	put := func(name string, v any) string {
		p := filepath.Join(dir, name)
		os.MkdirAll(filepath.Dir(p), 0o755)
		var b []byte
		switch x := v.(type) {
		case string:
			b = []byte(x)
		case []byte:
			b = x
		default:
			b, _ = json.Marshal(x)
		}
		if err := os.WriteFile(p, b, 0o644); err != nil {
			t.Fatal(err)
		}
		return p
	}
	for _, n := range []string{"acme-1", "acme-2", "acme-3"} {
		put("research/shots/"+n+".jpg", pixel)
	}
	before := put("shots/quiz-exit--footer--before.png", pixel)
	after := put("shots/quiz-exit--footer--after.png", pixel)
	thoughts := thoughtsMD
	if files.thoughts != nil {
		thoughts = *files.thoughts
	}
	diff := fixtureDiff(nil)
	diff["undeclared"].(L)[0].(J)["shots"] = J{"before": before, "after": after}
	res := any(fixtureResearch())
	if files.research != nil {
		res = files.research
	}
	out = filepath.Join(dir, "report.html")
	args := []string{"--judge", put("judge.json", fixtureJudge()), "--research", put("research/research-light.json", res), "--diff", put("diff.json", diff),
		"--thoughts", put("thoughts.md", thoughts), "--canvas", canvas.Current, "--previous", canvas.Previous, "--out", out}
	stdout, stderr, code = run(append(args, extra...)...)
	return
}

func TestTheCommandLineResolvesThePicturesWritesOneFileAndPrintsTheShortText(t *testing.T) {
	stdout, stderr, code, out := runCli(t, cliFiles{})
	if code != 0 {
		t.Fatal(code, stderr)
	}
	html, _ := os.ReadFile(out)
	sources := regexp.MustCompile(`<img [^>]*src="([^"]*)"`).FindAllStringSubmatch(string(html), -1)
	if len(sources) != 5 {
		t.Fatal(len(sources))
	}
	for _, s := range sources {
		if !strings.HasPrefix(s[1], "data:image/") {
			t.Fatal(s[1])
		}
	}
	match(t, stdout, `7 分`)
	match(t, stdout, `没声明却变了的地方 2 处`)
}

func TestTheCommandLineExits2WhenAnInputIsUnsoundAnd1WhenCalledWrong(t *testing.T) {
	r := fixtureResearch()
	r["items"].(L)[0].(J)["path"].(L)[0].(J)["images"] = L{"shots/missing.jpg"}
	_, stderr, code, _ := runCli(t, cliFiles{research: r})
	if code != 2 {
		t.Fatal(code, stderr)
	}
	match(t, stderr, `design-review-report: cannot read image .*missing\.jpg: file does not exist`)
	only2 := "2 | 只写了第二条"
	_, stderr, code, _ = runCli(t, cliFiles{thoughts: &only2})
	if code != 2 {
		t.Fatal(code, stderr)
	}
	match(t, stderr, `no words from the human[\s\S]*: 1`)
	_, stderr, code = run()
	if code != 1 {
		t.Fatal(code)
	}
	match(t, stderr, `usage: dyna design report`)
	match(t, stderr, `missing: --judge --research --diff --thoughts --canvas --out`)
	if _, _, code := run("--judge", filepath.Join(t.TempDir(), "nope.json"), "--research", "r", "--diff", "d", "--thoughts", "t", "--canvas", "c", "--out", "o"); code != 1 {
		t.Fatal("an unreadable input file exits 1:", code)
	}
	if _, _, code := run("--nope"); code != 1 {
		t.Fatal("an unknown flag exits 1:", code)
	}
}

func writeSelfCheck(t *testing.T, v any) string {
	p := filepath.Join(t.TempDir(), "self-check.json")
	b, _ := json.Marshal(v)
	os.WriteFile(p, b, 0o644)
	return p
}

func TestTheCommandLineTakesSelfCheckShowsTheReasonsAndSaysWhichEntriesMatchedNothing(t *testing.T) {
	_, stderr, code, out := runCli(t, cliFiles{}, "--self-check", writeSelfCheck(t, selfCheck()))
	if code != 0 {
		t.Fatal(code, stderr)
	}
	html, _ := os.ReadFile(out)
	match(t, string(html), `designer 自检：</strong>页脚和正文没有层次`)
	match(t, stderr, `self-check entry results · sidebar matches neither an undeclared nor a declared change`)
	_, stderr, code, _ = runCli(t, cliFiles{}, "--self-check", writeSelfCheck(t, L{J{"state": "a"}}))
	if code != 2 {
		t.Fatal(code)
	}
	match(t, stderr, `selfCheck\[0\]\.anchor`)
}
