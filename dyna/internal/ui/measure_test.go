package ui

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/uicompare"
)

// The measuring loop around the browser, with a stand-in for the browser: the matrices read, how many walk at
// once, the memo of the last round that tells a plateau, and what is printed with which exit code. What the
// browser itself sees is covered by chrome_test.go, which drives a real Chrome.

// fakeBrowser answers each matrix from a table keyed by its canvas address, and records what it was asked.
type fakeBrowser struct {
	results map[string]MatrixResult
	diffs   map[string]DiffRun // canvas-diff matrices, keyed by their `before`
	err     map[string]error
	delay   time.Duration

	mu        sync.Mutex
	walked    []string
	shotsDirs []string
	running   atomic.Int32
	peak      atomic.Int32
	closed    atomic.Bool
}

func (f *fakeBrowser) Walk(ctx context.Context, m Matrix) (MatrixResult, error) {
	n := f.running.Add(1)
	defer f.running.Add(-1)
	for {
		p := f.peak.Load()
		if n <= p || f.peak.CompareAndSwap(p, n) {
			break
		}
	}
	f.mu.Lock()
	f.walked = append(f.walked, m.Canvas)
	f.mu.Unlock()
	if f.delay > 0 {
		select {
		case <-time.After(f.delay):
		case <-ctx.Done():
			return MatrixResult{}, ctx.Err()
		}
	}
	if err := f.err[m.Canvas]; err != nil {
		return MatrixResult{}, err
	}
	return f.results[m.Canvas], nil
}

func (f *fakeBrowser) Diff(ctx context.Context, m Matrix, shotsDir string) (DiffRun, error) {
	f.mu.Lock()
	f.walked = append(f.walked, m.Before)
	f.shotsDirs = append(f.shotsDirs, shotsDir)
	f.mu.Unlock()
	if err := f.err[m.Before]; err != nil {
		return DiffRun{}, err
	}
	return f.diffs[m.Before], nil
}

func (f *fakeBrowser) Close() { f.closed.Store(true) }

func (f *fakeBrowser) deps() Deps {
	return Deps{
		Browser: func(context.Context) (Browser, error) { return f, nil },
		Machine: func() (int, float64, float64) { return 12, 10, 8 << 30 },
	}
}

func str(s string) *string { return &s }

func finding(cell, id, anchor, prop string) uicompare.Finding {
	f := uicompare.Finding{ID: id, Severity: "P1", Cell: str(cell), Detail: "d " + anchor + "." + prop, Why: "w"}
	if anchor != "" {
		f.Anchor = str(anchor)
	}
	if prop != "" {
		f.Property = str(prop)
	}
	return f
}

func matrixFile(t *testing.T, dir, name, canvas string) string {
	t.Helper()
	return write(t, filepath.Join(dir, name), `{"canvas":"`+canvas+`","local":"http://l/","cells":[{"name":"a","viewport":{"width":390,"height":844}}]}`)
}

func TestAGreenMatrixPrintsGreenAndExits0AndRemembersARound(t *testing.T) {
	dir := t.TempDir()
	m := matrixFile(t, dir, "matrix.json", "http://c/1")
	fb := &fakeBrowser{results: map[string]MatrixResult{"http://c/1": {}}}
	r := run(fb.deps(), "measure", m)
	if r.code != 0 || strings.TrimSpace(r.out) != "ui-measure: green ✓" {
		t.Fatal(r.all())
	}
	if !fb.closed.Load() {
		t.Fatal("the browser is closed")
	}
	// `matrix.json` keeps the historical memo name, and the memo is the findings' fingerprints (none)
	if got, err := os.ReadFile(filepath.Join(dir, ".ui-measure-last.json")); err != nil || string(got) != "[]" {
		t.Fatalf("%q %v", got, err)
	}
	contains(t, r.err, "ui-measure: 同时跑 1 份矩阵")
}

func TestFindingsExit2AndTheSameDefectsTwiceRunningIsAPlateau(t *testing.T) {
	dir := t.TempDir()
	m := matrixFile(t, dir, "matrix.json", "http://c/1")
	fb := &fakeBrowser{results: map[string]MatrixResult{"http://c/1": {Findings: []uicompare.Finding{
		finding("mobile", "position-drift", "hero", "top"),
		finding("mobile", "pixel-mismatch", "", ""),
	}}}}

	first := run(fb.deps(), "measure", m)
	if first.code != 2 || !strings.Contains(first.out, "P1 (2):") || strings.Contains(first.out, "瓶颈") {
		t.Fatal(first.all())
	}
	memo, _ := os.ReadFile(filepath.Join(dir, ".ui-measure-last.json"))
	want := "[\n  \"mobile|position-drift|hero|top\",\n  \"mobile|pixel-mismatch|null|null\"\n]"
	if string(memo) != want {
		t.Fatalf("%q", memo)
	}

	second := run(fb.deps(), "measure", m)
	if second.code != 2 || !strings.Contains(second.out, "瓶颈：同一批 finding 连续两轮不变。停下，交给人。") {
		t.Fatal(second.all())
	}

	// a different set of defects is not a plateau
	fb.results["http://c/1"] = MatrixResult{Findings: []uicompare.Finding{finding("mobile", "position-drift", "hero", "left")}}
	third := run(fb.deps(), "measure", m)
	if third.code != 2 || strings.Contains(third.out, "瓶颈") {
		t.Fatal(third.all())
	}
	// and a green round is never a plateau
	fb.results["http://c/1"] = MatrixResult{}
	if r := run(fb.deps(), "measure", m); r.code != 0 || strings.Contains(r.out, "瓶颈") {
		t.Fatal(r.all())
	}
}

func TestOnlyHumanReviewCellsLeftIsNotRedAndIsSaidSo(t *testing.T) {
	dir := t.TempDir()
	m := matrixFile(t, dir, "matrix.json", "http://c/1")
	fb := &fakeBrowser{results: map[string]MatrixResult{"http://c/1": {HumanCells: []string{"hover", "focus"}}}}
	r := run(fb.deps(), "measure", m)
	if r.code != 0 {
		t.Fatal(r.all())
	}
	contains(t, r.out, "ui-measure: green ✓", "\nHUMAN REVIEW (not green, not checked): hover, focus")
}

func TestJSONOfOneMatrixKeepsTheHistoricalShape(t *testing.T) {
	dir := t.TempDir()
	m := matrixFile(t, dir, "matrix.json", "http://c/1")
	fb := &fakeBrowser{results: map[string]MatrixResult{"http://c/1": {
		Findings:   []uicompare.Finding{finding("mobile", "token-mismatch", "cta", "color")},
		HumanCells: []string{"hover"},
	}}}
	r := run(fb.deps(), "measure", m, "--json")
	if r.code != 2 {
		t.Fatal(r.all())
	}
	var got map[string]json.RawMessage
	if err := json.Unmarshal([]byte(r.out), &got); err != nil {
		t.Fatal(err, r.out)
	}
	if len(got) != 3 || got["findings"] == nil || got["瓶颈"] == nil || got["humanReviewCells"] == nil {
		t.Fatalf("findings, 瓶颈 and humanReviewCells, nothing else: %s", r.out)
	}
	if string(got["瓶颈"]) != "false" || string(got["humanReviewCells"]) != "[\n    \"hover\"\n  ]" {
		t.Fatalf("%s", r.out)
	}
	if !strings.HasPrefix(r.out, "{\n  \"findings\": [\n    {\n      \"id\": \"token-mismatch\"") {
		t.Fatalf("two-space indent, the findings first, each in the closed field order:\n%s", r.out)
	}
	// a green matrix prints empty arrays, not null
	fb.results["http://c/1"] = MatrixResult{}
	g := run(fb.deps(), "measure", m, "--json")
	if g.code != 0 || g.out != "{\n  \"findings\": [],\n  \"瓶颈\": false,\n  \"humanReviewCells\": []\n}\n" {
		t.Fatalf("%q", g.out)
	}
}

func TestSeveralMatricesAreWrappedOneEntryEachAndWalkedTogether(t *testing.T) {
	dir := t.TempDir()
	a := matrixFile(t, dir, "en-light.json", "http://c/en")
	b := matrixFile(t, dir, "zh-dark.json", "http://c/zh")
	fb := &fakeBrowser{delay: 150 * time.Millisecond, results: map[string]MatrixResult{
		"http://c/en": {},
		"http://c/zh": {Findings: []uicompare.Finding{finding("m", "missing-anchor", "hero", "")}},
	}}
	r := run(fb.deps(), "measure", a, b, "--json")
	if r.code != 2 {
		t.Fatal(r.all())
	}
	var got struct {
		Matrices []struct {
			Matrix   string
			Findings []json.RawMessage
		}
	}
	if err := json.Unmarshal([]byte(r.out), &got); err != nil || len(got.Matrices) != 2 {
		t.Fatal(err, r.out)
	}
	if got.Matrices[0].Matrix != a || got.Matrices[1].Matrix != b || len(got.Matrices[0].Findings) != 0 || len(got.Matrices[1].Findings) != 1 {
		t.Fatalf("one entry per matrix, in the order given: %s", r.out)
	}
	if fb.peak.Load() != 2 {
		t.Fatalf("both matrices walk at once on an idle machine, peak %d", fb.peak.Load())
	}
	// each matrix its own memo, named after the file
	for _, name := range []string{".ui-measure-last.en-light.json", ".ui-measure-last.zh-dark.json"} {
		if _, err := os.Stat(filepath.Join(dir, name)); err != nil {
			t.Error(name, err)
		}
	}
	contains(t, r.err, "同时跑 2 份矩阵")

	text := run(fb.deps(), "measure", a, b)
	contains(t, text.out, "\n== "+a+"\n", "\n== "+b+"\n", "ui-measure: green ✓", "[missing-anchor]")
}

func TestConcurrencyFlagWinsOverTheMachineButNotOverTheCap(t *testing.T) {
	dir := t.TempDir()
	var paths []string
	results := map[string]MatrixResult{}
	for _, n := range []string{"a", "b", "c", "d", "e", "f"} {
		paths = append(paths, matrixFile(t, dir, n+".json", "http://c/"+n))
		results["http://c/"+n] = MatrixResult{}
	}
	fb := &fakeBrowser{delay: 80 * time.Millisecond, results: results}
	r := run(fb.deps(), append([]string{"measure", "--concurrency", "1"}, paths...)...)
	if r.code != 0 || fb.peak.Load() != 1 {
		t.Fatalf("one at a time: peak %d\n%s", fb.peak.Load(), r.all())
	}
	contains(t, r.err, "--concurrency 1")

	fb2 := &fakeBrowser{delay: 80 * time.Millisecond, results: results}
	r = run(fb2.deps(), append([]string{"measure", "--concurrency", "9"}, paths...)...)
	if r.code != 0 || fb2.peak.Load() != 4 {
		t.Fatalf("capped at 4: peak %d\n%s", fb2.peak.Load(), r.all())
	}
	contains(t, r.err, "按上限 4 截断")

	// a busy machine runs them one at a time without being told to
	busy := fb2.deps()
	busy.Machine = func() (int, float64, float64) { return 12, 0.2, 1 << 30 }
	fb3 := &fakeBrowser{delay: 30 * time.Millisecond, results: results}
	busy.Browser = func(context.Context) (Browser, error) { return fb3, nil }
	if r := run(busy, append([]string{"measure"}, paths...)...); r.code != 0 || fb3.peak.Load() != 1 {
		t.Fatalf("peak %d\n%s", fb3.peak.Load(), r.all())
	}
}

func TestUsageErrorsExit1(t *testing.T) {
	dir := t.TempDir()
	m := matrixFile(t, dir, "matrix.json", "http://c/1")
	fb := &fakeBrowser{results: map[string]MatrixResult{"http://c/1": {}}}
	for _, args := range [][]string{
		{"measure"},
		{"measure", m, "--concurrency", "0"},
		{"measure", m, "--concurrency", "two"},
		{"measure", m, "--concurrency", "-1"},
		{"measure", m, "--nope"},
	} {
		if r := run(fb.deps(), args...); r.code != 1 || !strings.Contains(r.err, "usage: dyna ui measure") {
			t.Errorf("%v: %s", args, r.all())
		}
	}
	if len(fb.walked) != 0 {
		t.Fatal("a usage error walks nothing")
	}
	// the same matrix twice shares one memo
	if r := run(fb.deps(), "measure", m, m); r.code != 1 || !strings.Contains(r.err, "ui-measure: the same matrix was given twice") {
		t.Fatal(r.all())
	}
	// two files with the same name in different directories are two matrices
	other := matrixFile(t, filepath.Join(dir, "sub"), "matrix.json", "http://c/2")
	fb.results["http://c/2"] = MatrixResult{}
	if r := run(fb.deps(), "measure", m, other); r.code != 0 {
		t.Fatal(r.all())
	}
}

func TestAMatrixThatCannotBeReadOrWalkedExits1AndStopsTheRest(t *testing.T) {
	dir := t.TempDir()
	good := matrixFile(t, dir, "good.json", "http://c/good")
	bad := write(t, filepath.Join(dir, "bad.json"), "{not json")
	fb := &fakeBrowser{results: map[string]MatrixResult{"http://c/good": {}}}
	if r := run(fb.deps(), "measure", good, bad); r.code != 1 || !strings.Contains(r.err, "bad.json") || len(fb.walked) != 0 {
		t.Fatal(r.all())
	}
	if r := run(fb.deps(), "measure", filepath.Join(dir, "missing.json")); r.code != 1 || !strings.Contains(r.err, "missing.json") {
		t.Fatal(r.all())
	}

	boom := matrixFile(t, dir, "boom.json", "http://c/boom")
	fb = &fakeBrowser{delay: 20 * time.Millisecond, results: map[string]MatrixResult{"http://c/good": {}}, err: map[string]error{"http://c/boom": errors.New("打不开 http://c/boom")}}
	r := run(fb.deps(), "measure", good, boom)
	if r.code != 1 || !strings.Contains(r.err, "打不开 http://c/boom") || !fb.closed.Load() {
		t.Fatal(r.all())
	}
	if _, err := os.Stat(filepath.Join(dir, ".ui-measure-last.good.json")); err == nil {
		t.Fatal("a run that failed remembers no round")
	}

	// no browser to be had
	noBrowser := Deps{Browser: func(context.Context) (Browser, error) { return nil, errors.New("找不到 Chrome") }}
	if r := run(noBrowser, "measure", good); r.code != 1 || !strings.Contains(r.err, "找不到 Chrome") {
		t.Fatal(r.all())
	}
}

func TestTheMemoFileOfAMatrixIsNamedAfterIt(t *testing.T) {
	for in, want := range map[string]string{
		"/p/matrix.json":   "/p/.ui-measure-last.json",
		"/p/en-light.json": "/p/.ui-measure-last.en-light.json",
		"/p/Matrix.JSON":   "/p/.ui-measure-last.Matrix.json",
		"/p/a.b.json":      "/p/.ui-measure-last.a.b.json",
		"/p/noextension":   "/p/.ui-measure-last.noextension.json",
	} {
		if got, err := memoPath(in); err != nil || got != want {
			t.Errorf("%s: %s %v, want %s", in, got, err, want)
		}
	}
}

func TestTheStateGoesIntoTheURLTheWayURLSearchParamsWritesIt(t *testing.T) {
	for _, c := range []struct{ in, state, want string }{
		{"http://localhost:3000/login", "", "http://localhost:3000/login"},
		{"http://localhost:3000/login", "error", "http://localhost:3000/login?state=error"},
		{"http://localhost:3000", "empty", "http://localhost:3000/?state=empty"},
		{"http://localhost:3000/p?lang=zh&state=old&x=1", "new", "http://localhost:3000/p?lang=zh&state=new&x=1"},
		{"http://localhost:3000/p?state=a&state=b", "c", "http://localhost:3000/p?state=c"},
		{"http://localhost:3000/p?q=a+b%20c", "x y", "http://localhost:3000/p?q=a+b+c&state=x+y"},
		{"http://localhost:3000/p#top", "s", "http://localhost:3000/p?state=s#top"},
	} {
		if got, err := withState(c.in, c.state); err != nil || got != c.want {
			t.Errorf("%s + %q: %s %v, want %s", c.in, c.state, got, err, c.want)
		}
	}
}

func TestAMatrixFileReadsTheKnobsAMatrixAndACellMayHave(t *testing.T) {
	var m Matrix
	err := json.Unmarshal([]byte(`{
	  "canvas": "http://c/", "local": "http://l/", "dpr": 2,
	  "tolerance": {"position": 2, "pixel": 3},
	  "cells": [
	    {"name": "a", "viewport": {"width": 390, "height": 844}, "colorScheme": "dark", "state": "empty",
	     "tolerance": {"pixel": 0.5, "antialias": 0.2}, "byAnchor": {"hero": {"position": 4}}},
	    {"name": "b", "viewport": {"width": 1280, "height": 800}, "review": "human"}
	  ]}`), &m)
	if err != nil {
		t.Fatal(err)
	}
	if m.dpr() != 2 || (Matrix{}).dpr() != 1 {
		t.Fatal("dpr 1 unless it says otherwise")
	}
	pos, aa, px := m.resolve(m.Cells[0])
	if pos != 2 || aa != 0.2 || px != 0.5 {
		t.Fatalf("a cell's own knob wins, then the matrix's, then the default: %v %v %v", pos, aa, px)
	}
	pos, aa, px = m.resolve(m.Cells[1])
	if pos != 2 || aa != uicompare.DefaultAntialiasTolerance || px != 3 {
		t.Fatalf("%v %v %v", pos, aa, px)
	}
	if m.Cells[0].scheme() != "dark" || m.Cells[1].scheme() != "light" || m.Cells[1].Review != "human" || *m.Cells[0].ByAnchor["hero"].Position != 4 {
		t.Fatalf("%+v", m.Cells)
	}
}

// ---------- canvas-diff matrices ----------

func diffMatrix(t *testing.T, dir, name, before, extra string) string {
	t.Helper()
	return write(t, filepath.Join(dir, name), `{"mode":"canvas-diff","before":"`+before+`","after":"http://c/new"`+extra+
		`,"cells":[{"name":"mobile/default","viewport":{"width":390,"height":844},"state":"default"}]}`)
}

func TestACanvasDiffWithAChangeSetPutsTheUndeclaredFirstAndExits2OnlyForThose(t *testing.T) {
	dir := t.TempDir()
	set := `,"changeSet":[{"decision":"2.1","states":["default"],"anchors":["card"]},{"decision":"2.3","states":["empty"],"anchors":["cta"]}]`
	m := diffMatrix(t, dir, "diff.json", "http://c/old", set)
	card := change("default", "card")
	toggle := change("default", "card-toggle")
	toggle.Kind = "added"
	fb := &fakeBrowser{diffs: map[string]DiffRun{"http://c/old": {Changed: []Change{card, toggle}, States: []string{"default"}}}}
	r := run(fb.deps(), "measure", m)
	if r.code != 2 {
		t.Fatal(r.all())
	}
	contains(t, r.out, "没声明却变了的地方（1）：\n  desktop/default · card-toggle  新版新增的锚点", "改动集里声明过的（1）：", "（改动集 2.1）",
		"改动集声明了、但矩阵里没有这个状态的格，没比（1）：\n  2.3  empty")
	if fb.shotsDirs[0] != filepath.Join(dir, "ui-measure-shots") {
		t.Fatalf("the shots go next to the matrix: %s", fb.shotsDirs[0])
	}
	if _, err := os.Stat(filepath.Join(dir, ".ui-measure-last.diff.json")); err == nil {
		t.Fatal("a canvas-diff remembers no round")
	}

	// only declared changes: nothing for a human to look at
	fb.diffs["http://c/old"] = DiffRun{Changed: []Change{card}, States: []string{"default"}}
	if r := run(fb.deps(), "measure", m); r.code != 0 {
		t.Fatal(r.all())
	}
}

func TestACanvasDiffWithoutAChangeSetListsEveryChangeAndAnyChangeExits2(t *testing.T) {
	dir := t.TempDir()
	m := diffMatrix(t, dir, "diff.json", "http://c/old", `,"shotsDir":"shots"`)
	p := 1.5
	c := change("default", "card")
	c.PixelPercent = &p
	c.Shots = &Shots{Before: "/x/b.png", After: "/x/a.png"}
	fb := &fakeBrowser{diffs: map[string]DiffRun{"http://c/old": {Changed: []Change{c}, States: []string{"default"}, HumanCells: []string{"hover"}}}}
	r := run(fb.deps(), "measure", m)
	if r.code != 2 {
		t.Fatal(r.all())
	}
	contains(t, r.out, "变了的锚点（1）：", "区域像素差 1.50%", "\n区域截图（两版各一张）在 "+filepath.Join(dir, "shots")+"\n", "HUMAN REVIEW (not green, not checked): hover")
	if strings.Contains(r.out, "没声明") {
		t.Fatal(r.out)
	}
	fb.diffs["http://c/old"] = DiffRun{States: []string{"default"}}
	if r := run(fb.deps(), "measure", m); r.code != 0 || strings.TrimSpace(r.out) != "ui-measure: 两版没有变化 ✓" {
		t.Fatal(r.all())
	}
}

func TestTheJSONOfACanvasDiffHasTheFieldsInOrderAndNothingInternal(t *testing.T) {
	dir := t.TempDir()
	m := diffMatrix(t, dir, "diff.json", "http://c/old", `,"changeSet":[]`)
	fb := &fakeBrowser{diffs: map[string]DiffRun{"http://c/old": {Changed: []Change{change("default", "card")}, States: []string{"default"}}}}
	r := run(fb.deps(), "measure", m, "--json")
	if r.code != 2 {
		t.Fatal(r.all())
	}
	var keys []string
	dec := json.NewDecoder(strings.NewReader(r.out))
	dec.Token()
	for dec.More() {
		k, _ := dec.Token()
		keys = append(keys, k.(string))
		var skip json.RawMessage
		dec.Decode(&skip)
	}
	if strings.Join(keys, ",") != "mode,classified,changed,declared,undeclared,declaredUnchanged,unchecked,humanReviewCells" {
		t.Fatalf("%v\n%s", keys, r.out)
	}
	contains(t, r.out, `"pixelPercent": null`, `"shots": null`, `"classified": true`)
	if strings.Contains(r.out, "decisions") {
		t.Fatalf("an undeclared change has no decisions: %s", r.out)
	}

	// with an ordinary matrix: wrapped, each with its own matrix path
	plain := matrixFile(t, dir, "plain.json", "http://c/plain")
	fb.results = map[string]MatrixResult{"http://c/plain": {}}
	both := run(fb.deps(), "measure", plain, m, "--json")
	var got struct {
		Matrices []map[string]json.RawMessage
	}
	if err := json.Unmarshal([]byte(both.out), &got); err != nil || len(got.Matrices) != 2 || both.code != 2 {
		t.Fatal(err, both.all())
	}
	if string(got.Matrices[1]["mode"]) != `"canvas-diff"` || string(got.Matrices[1]["matrix"]) != `"`+m+`"` || got.Matrices[1]["shotsDir"] != nil || got.Matrices[1]["attention"] != nil {
		t.Fatalf("%s", both.out)
	}
	if got.Matrices[0]["findings"] == nil {
		t.Fatalf("%s", both.out)
	}
}

func TestACanvasDiffWithoutTwoAddressesOrWithABadChangeSetExits1BeforeABrowserStarts(t *testing.T) {
	dir := t.TempDir()
	started := false
	d := Deps{Browser: func(context.Context) (Browser, error) { started = true; return &fakeBrowser{}, nil }}
	noAfter := write(t, filepath.Join(dir, "a.json"), `{"mode":"canvas-diff","before":"http://c/old","cells":[]}`)
	if r := run(d, "measure", noAfter); r.code != 1 || !strings.Contains(r.err, `ui-measure: a canvas-diff matrix needs "before" and "after"`) {
		t.Fatal(r.all())
	}
	for raw, want := range map[string]string{`{}`: "changeSet 必须是数组", `[{"decision":"x","states":["a"],"anchors":["b"]}]`: "changeSet[0].decision", `null`: "changeSet 必须是数组"} {
		bad := diffMatrix(t, dir, "b.json", "http://c/old", `,"changeSet":`+raw)
		if r := run(d, "measure", bad); r.code != 1 || !strings.Contains(r.err, want) {
			t.Errorf("%s: %s", raw, r.all())
		}
	}
	if started {
		t.Fatal("a browser started")
	}
}

func TestACanvasDiffMatrixReadsItsToleranceWithAPixelOfZeroUnlessToldOtherwise(t *testing.T) {
	var m Matrix
	if err := json.Unmarshal([]byte(`{"mode":"canvas-diff","tolerance":{"position":2},"cells":[{"name":"a"},{"name":"b","tolerance":{"pixel":0.5}}]}`), &m); err != nil {
		t.Fatal(err)
	}
	if pos, aa, px := m.resolveDiff(m.Cells[0]); pos != 2 || aa != uicompare.DefaultAntialiasTolerance || px != 0 {
		t.Fatal(pos, aa, px)
	}
	if _, _, px := m.resolveDiff(m.Cells[1]); px != 0.5 {
		t.Fatal(px)
	}
	if m.ChangeSet != nil {
		t.Fatal("no changeSet key is no change set")
	}
}
