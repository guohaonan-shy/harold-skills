package flow

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/design/fixture"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/design/jsx"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/nexterr"
)

type obj = map[string]any

// base is a well-formed flow: a main row, a branch off its second step, an unconnected 「同一规则」 row.
func base() obj {
	return obj{
		"title": "点一段还没下完的音频",
		"scale": 0.5,
		"rows": []any{
			obj{"steps": []any{
				obj{"image": "idle.png", "caption": "可播放"},
				obj{"image": "loading.png", "trigger": "点播放", "caption": "图标原位换成转圈", "circles": []any{obj{"x": 40, "y": 40, "r": 36}}},
				obj{"image": "playing.png", "trigger": "下载完成", "caption": "自动开始播放"},
			}},
			obj{"branchFrom": obj{"row": 0, "step": 1}, "steps": []any{obj{"image": "failed.png", "trigger": "下载失败", "caption": "换成重试"}}},
			obj{"label": "同一规则 · 后台预取失败", "connected": false, "steps": []any{obj{"image": "failed-bg.png", "caption": "只换按钮"}}},
		},
		"note": "每个失败只有一个可点的重试目标。",
	}
}

// withStates is the same flow, with the archive state each step shows.
func withStates() obj {
	f := base()
	step := func(r, s int) obj { return f["rows"].([]any)[r].(obj)["steps"].([]any)[s].(obj) }
	step(0, 0)["state"] = "player--idle"
	step(0, 1)["state"] = "player--loading"
	step(0, 2)["state"] = "player--playing"
	step(1, 0)["state"] = "player--failed"
	return f
}

func rowsOf(f obj) []any            { return f["rows"].([]any) }
func stepsOf(f obj, r int) []any    { return rowsOf(f)[r].(obj)["steps"].([]any) }
func stepOf(f obj, r, s int) obj    { return stepsOf(f, r)[s].(obj) }
func rowOf(f obj, r int) obj        { return rowsOf(f)[r].(obj) }
func anyExists(string) bool         { return true }
func anyState(string) bool          { return true }
func value(t *testing.T, f obj) any { return fromObj(t, f) }

func fromObj(t *testing.T, f any) any {
	t.Helper()
	b, err := json.Marshal(f)
	if err != nil {
		t.Fatal(err)
	}
	v, err := jsx.ParseJSON(b)
	if err != nil {
		t.Fatal(err)
	}
	return v
}

func check(t *testing.T, f obj, exists func(string) bool, hasState func(string) bool) []string {
	t.Helper()
	if exists == nil {
		exists = anyExists
	}
	return Check(value(t, f), exists, hasState)
}

func mention(errs []string, parts ...string) bool {
	for _, e := range errs {
		ok := true
		for _, p := range parts {
			ok = ok && strings.Contains(e, p)
		}
		if ok {
			return true
		}
	}
	return false
}

func TestAWellFormedFlowIsValid(t *testing.T) {
	if errs := check(t, base(), nil, nil); len(errs) != 0 {
		t.Fatal(errs)
	}
}

func TestAStepWithAnArrowIntoItMustSayWhatTriggersIt(t *testing.T) {
	f := base()
	delete(stepOf(f, 0, 2), "trigger")
	if errs := check(t, f, nil, nil); len(errs) == 0 || !mention(errs, "第 1 行第 3 步", "trigger") {
		t.Fatal(errs)
	}
}

func TestEveryStepNeedsItsCaption(t *testing.T) {
	f := base()
	delete(stepOf(f, 1, 0), "caption")
	if errs := check(t, f, nil, nil); !mention(errs, "caption") {
		t.Fatal(errs)
	}
}

func TestABranchMustForkFromAStepThatExistsInARowAboveIt(t *testing.T) {
	f := base()
	rowOf(f, 1)["branchFrom"] = obj{"row": 0, "step": 7}
	if errs := check(t, f, nil, nil); !mention(errs, "branchFrom.step") {
		t.Fatal(errs)
	}
	rowOf(f, 1)["branchFrom"] = obj{"row": 1, "step": 0}
	if errs := check(t, f, nil, nil); !mention(errs, "branchFrom.row") {
		t.Fatal(errs)
	}
}

func TestAnUnconnectedRowMustCarryItsLabel(t *testing.T) {
	f := base()
	delete(rowOf(f, 2), "label")
	if errs := check(t, f, nil, nil); !mention(errs, "label") {
		t.Fatal(errs)
	}
}

func TestATriggerOnARowStartWithNothingPointingInIsFlaggedNotSilentlyDropped(t *testing.T) {
	f := base()
	stepOf(f, 0, 0)["trigger"] = "打开"
	if errs := check(t, f, nil, nil); !mention(errs, "第 1 行第 1 步", "画不出来") {
		t.Fatal(errs)
	}
}

func TestRingsNeedNumericXYRInSourcePixels(t *testing.T) {
	f := base()
	stepOf(f, 0, 1)["circles"] = []any{obj{"x": 1, "y": 2}}
	if errs := check(t, f, nil, nil); !mention(errs, "光圈") {
		t.Fatal(errs)
	}
}

func TestAMissingScreenshotIsNamed(t *testing.T) {
	if errs := check(t, base(), func(p string) bool { return p != "failed.png" }, nil); !mention(errs, "failed.png") {
		t.Fatal(errs)
	}
}

func TestABranchStartsOneColumnRightOfTheStepItForksFrom(t *testing.T) {
	placed, cols := layout(From(value(t, base())))
	if placed[1].start != 2 || cols != 3 || placed[2].labelRow == 0 {
		t.Fatal(placed, cols)
	}
}

func fromBase(t *testing.T, f obj) Flow { return From(value(t, f)) }

func TestTheHTMLCarriesEveryTriggerCaptionAndRingScaled(t *testing.T) {
	html := RenderHTML(fromBase(t, base()), func(p string) string { return "x/" + p })
	for _, want := range []string{"点播放", "下载完成", "下载失败", "可播放", "同一规则 · 后台预取失败", "每个失败只有一个可点的重试目标。",
		`src="x/loading.png"`, "left:2px;top:2px;width:36px;height:36px", `data-branch="1"`} {
		if !strings.Contains(html, want) {
			t.Errorf("no %s", want)
		}
	}
}

func TestTextIsEscaped(t *testing.T) {
	f := base()
	f["title"] = "<script>"
	if strings.Contains(RenderHTML(fromBase(t, f), func(p string) string { return p }), "<title><script>") {
		t.Fatal("the title went in unescaped")
	}
}

// ---- state ids: each step may name the design-archive state it shows ----

func TestWithoutStateIDsTheHTMLIsByteForByteWhatItWasBeforeStateIDsExisted(t *testing.T) {
	// sha256 of renderHtml(flow(), p => `x/${p}`) taken from the old script before the state field was added.
	html := RenderHTML(fromBase(t, base()), func(p string) string { return "x/" + p })
	sum := sha256.Sum256([]byte(html))
	if hex.EncodeToString(sum[:]) != "0acdd9cb7ededd34f42dcfc9f4ca9bc165f22c70242b87e2f8cde84130c3a4ca" || strings.Contains(html, "data-state") {
		t.Fatalf("%x", sum)
	}
}

func TestAFlowWhoseStepsCarryStateIDsIsValidAndIDsAreOptionalPerStep(t *testing.T) {
	if errs := check(t, withStates(), nil, nil); len(errs) != 0 {
		t.Fatal(errs)
	}
	f := withStates()
	delete(stepOf(f, 0, 1), "state")
	if errs := check(t, f, nil, nil); len(errs) != 0 {
		t.Fatal(errs)
	}
}

func TestAStateIDIsOneArchiveNameNoSpacesNoBracketsNotEmpty(t *testing.T) {
	for _, bad := range []any{"", "  ", "player loading", "[[player--loading]]", 7} {
		f := withStates()
		stepOf(f, 0, 1)["state"] = bad
		if errs := check(t, f, nil, nil); !mention(errs, "第 1 行第 2 步", "state") {
			t.Errorf("%v: %v", bad, errs)
		}
	}
}

func TestWhenTheArchiveIsSuppliedAStateIDItDoesNotKnowIsNamed(t *testing.T) {
	known := map[string]bool{"player--idle": true, "player--loading": true, "player--playing": true}
	errs := check(t, withStates(), nil, func(id string) bool { return known[id] })
	if len(errs) != 1 || !strings.Contains(errs[0], "第 2 行第 1 步") || !strings.Contains(errs[0], "player--failed") {
		t.Fatal(errs)
	}
	if errs := check(t, withStates(), nil, anyState); len(errs) != 0 {
		t.Fatal(errs)
	}
}

func TestStateIDsAreNotCheckedAgainstTheArchiveUnlessOneIsSupplied(t *testing.T) {
	f := withStates()
	stepOf(f, 0, 0)["state"] = "no-such--state"
	if errs := check(t, f, nil, nil); len(errs) != 0 {
		t.Fatal(errs)
	}
}

func TestTheHTMLKeepsTheCorrespondenceEveryFigureCarriesItsStateIDShownUnderTheCaption(t *testing.T) {
	html := RenderHTML(fromBase(t, withStates()), func(p string) string { return "x/" + p })
	for _, id := range []string{"player--idle", "player--loading", "player--playing", "player--failed"} {
		if !strings.Contains(html, `data-state="`+id+`"`) || !strings.Contains(html, `<div class="state">`+id+`</div>`) {
			t.Errorf("%s", id)
		}
	}
	if strings.Count(html, "data-state=") != 4 {
		t.Fatal("the step without one gets none")
	}
}

func TestStateIDsAreEscapedInTheHTML(t *testing.T) {
	f := withStates()
	stepOf(f, 0, 0)["state"] = `a"b`
	if strings.Contains(RenderHTML(fromBase(t, f), func(p string) string { return p }), `data-state="a"b"`) {
		t.Fatal("unescaped")
	}
}

func TestStateMapListsTheStepsThatNameAStateInReadingOrder(t *testing.T) {
	if got := StateMap(fromBase(t, base())); len(got) != 0 {
		t.Fatal(got)
	}
	got := StateMap(fromBase(t, withStates()))
	want := []StateRef{
		{1, 1, "player--idle", "可播放"},
		{1, 2, "player--loading", "图标原位换成转圈"},
		{1, 3, "player--playing", "自动开始播放"},
		{2, 1, "player--failed", "换成重试"},
	}
	if len(got) != len(want) {
		t.Fatal(got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("%d: %+v", i, got[i])
		}
	}
}

func TestFileNameIsNamedAfterTheStateItsFirstCellShowsPageIncluded(t *testing.T) {
	if got := FileName(fromBase(t, withStates()), 2); got != "flow-2-player--idle.png" {
		t.Fatal(got)
	}
	if got := FileName(fromBase(t, base()), 2); got != "" {
		t.Fatal("no state ids, no state in the name")
	}
	f := withStates()
	delete(stepOf(f, 0, 0), "state")
	if got := FileName(fromBase(t, f), 1); got != "flow-1-player--loading.png" {
		t.Fatal(got)
	}
}

// ---- the command: --archive checks the ids against the design archive, a sidecar keeps the map ----

type cliCase struct{ repo, work string }

func run(t *testing.T, work string, args ...string) (out, errs string, code int) {
	t.Helper()
	t.Chdir(work) // no node_modules up this chain, so no playwright: the run stops after writing the html
	t.Setenv("NODE_PATH", "")
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

// newCase is a repo with the fixture archive and a one-row flow whose steps name cookbook states.
func newCase(t *testing.T, states [2]string) cliCase {
	t.Helper()
	repo, err := fixture.WriteRepo(fixture.Compliant(), t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	work := t.TempDir()
	os.WriteFile(filepath.Join(work, "a.png"), []byte("png"), 0o644)
	os.WriteFile(filepath.Join(work, "b.png"), []byte("png"), 0o644)
	first := obj{"image": "a.png", "caption": "列表"}
	second := obj{"image": "b.png", "trigger": "搜索", "caption": "搜索中"}
	if states[0] != "" {
		first["state"] = states[0]
	}
	if states[1] != "" {
		second["state"] = states[1]
	}
	b, _ := json.Marshal(obj{"title": "搜索菜谱", "rows": []any{obj{"steps": []any{first, second}}}})
	os.WriteFile(filepath.Join(work, "flow.json"), b, 0o644)
	return cliCase{repo, work}
}

func (c cliCase) compose(t *testing.T, name string, extra ...string) (string, string, int) {
	return run(t, c.work, append([]string{filepath.Join(c.work, "flow.json"), filepath.Join(c.work, name)}, extra...)...)
}

func TestCommandWithArchiveKnownStateIDsPassAndTheMapIsWrittenNextToTheFigure(t *testing.T) {
	c := newCase(t, [2]string{"cookbook--list", "cookbook--search-loading"})
	out, errs, code := c.compose(t, "flow-1.png", "--archive", c.repo)
	if code != 0 {
		t.Fatal(out, errs)
	}
	if !strings.Contains(out, "解析不到 playwright") {
		t.Fatalf("with no playwright in the project the run says how to take the shot itself:\n%s", out)
	}
	html, _ := os.ReadFile(filepath.Join(c.work, "flow-1.html"))
	if !strings.Contains(string(html), `data-state="cookbook--search-loading"`) {
		t.Fatal("no state in the html")
	}
	states, _ := os.ReadFile(filepath.Join(c.work, "flow-1.states.json"))
	want := "[\n  {\n    \"row\": 1,\n    \"step\": 1,\n    \"state\": \"cookbook--list\",\n    \"caption\": \"列表\"\n  },\n  {\n    \"row\": 1,\n    \"step\": 2,\n    \"state\": \"cookbook--search-loading\",\n    \"caption\": \"搜索中\"\n  }\n]\n"
	if string(states) != want {
		t.Fatalf("%q", states)
	}
}

func TestCommandWithArchiveAnIDTheArchiveDoesNotHaveStopsTheRunWithExit2(t *testing.T) {
	c := newCase(t, [2]string{"cookbook--list", "cookbook--nowhere"})
	_, errs, code := c.compose(t, "flow-1.png", "--archive", c.repo)
	if code != 2 || !strings.Contains(errs, "cookbook--nowhere") {
		t.Fatal(code, errs)
	}
	if _, err := os.Stat(filepath.Join(c.work, "flow-1.html")); err == nil {
		t.Fatal("nothing is written for an invalid flow")
	}
}

func TestCommandDeltaLaysTheRequirementOnTopSoAStateThatOnlyExistsThereIsFound(t *testing.T) {
	c := newCase(t, [2]string{"cookbook--list", "cookbook--share-sheet"})
	if _, _, code := c.compose(t, "flow-1.png", "--archive", c.repo); code != 2 {
		t.Fatal("not in prod/")
	}
	delta := filepath.Join(c.repo, "docs/design/tmp/demo-spec/delta/pages/cookbook")
	os.MkdirAll(delta, 0o755)
	os.WriteFile(filepath.Join(delta, "cookbook--share-sheet.md"),
		[]byte("---\ntype: design-state\ntags: [cookbook]\nsummary: 分享面板\npage: \"[[cookbook]]\"\nedges: []\n---\n\n## 这一屏\n\n分享面板。\n\n## 应看到什么\n\n- 看到分享面板\n"), 0o644)
	if out, errs, code := c.compose(t, "flow-1.png", "--archive", c.repo, "--delta", "demo-spec"); code != 0 {
		t.Fatal(out, errs)
	}
}

func TestCommandAFigureNamedFlowNWithStateIDsMustCarryItsFirstStateInTheName(t *testing.T) {
	c := newCase(t, [2]string{"cookbook--list", "cookbook--search-loading"})
	_, errs, code := c.compose(t, "flow-1-cookbook--search-loading.png")
	if code != 2 || !strings.Contains(errs, "flow-1-cookbook--list.png") {
		t.Fatal(code, errs)
	}
	if _, errs, code := c.compose(t, "flow-1-cookbook--list.png"); code != 0 {
		t.Fatal(errs)
	}
	if _, _, code := c.compose(t, "anything.png"); code != 0 {
		t.Fatal("only the flow-<n>- convention is enforced")
	}
}

func TestCommandWithoutStateIDsAndWithoutArchiveNothingExtraIsWritten(t *testing.T) {
	c := newCase(t, [2]string{"", ""})
	if _, errs, code := c.compose(t, "flow-1.png"); code != 0 {
		t.Fatal(errs)
	}
	if _, err := os.Stat(filepath.Join(c.work, "flow-1.states.json")); err == nil {
		t.Fatal("a map was written")
	}
}

func TestCommandArchiveThatIsNotARepositoryRootIsAUsageError(t *testing.T) {
	c := newCase(t, [2]string{"cookbook--list", "cookbook--search-loading"})
	if _, _, code := c.compose(t, "flow-1.png", "--archive", filepath.Join(c.work, "nope")); code != 1 {
		t.Fatal(code)
	}
}

func TestCommandUsageErrors(t *testing.T) {
	c := newCase(t, [2]string{"", ""})
	flow := filepath.Join(c.work, "flow.json")
	for name, args := range map[string][]string{
		"no arguments":          {},
		"no output":             {flow},
		"three paths":           {flow, "a.png", "b.png"},
		"delta without archive": {flow, "a.png", "--delta", "x"},
		"archive with no value": {flow, "a.png", "--archive", "--delta", "x"},
		"unknown flag":          {flow, "a.png", "--frobnicate"},
	} {
		if _, errs, code := run(t, c.work, args...); code != 1 || !strings.Contains(errs, "用法") {
			t.Errorf("%s: %d %q", name, code, errs)
		}
	}
	if _, _, code := run(t, c.work, filepath.Join(c.work, "nope.json"), "a.png"); code != 1 {
		t.Fatal("an unreadable flow is an io error")
	}
}

func TestCommandAnInvalidFlowIsReportedWithExit2(t *testing.T) {
	c := newCase(t, [2]string{"", ""})
	os.WriteFile(filepath.Join(c.work, "flow.json"), []byte(`{"rows":[{"steps":[{"image":"a.png"}]}]}`), 0o644)
	_, errs, code := c.compose(t, "out.png")
	if code != 2 || !strings.Contains(errs, "flow-compose: 这张图的描述不合规") || !strings.Contains(errs, "  - 缺 title") || !strings.Contains(errs, "第 1 行第 1 步缺 caption") {
		t.Fatal(code, errs)
	}
}
