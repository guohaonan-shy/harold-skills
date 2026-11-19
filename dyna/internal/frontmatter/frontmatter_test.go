package frontmatter

import (
	"reflect"
	"strings"
	"testing"
)

// plain turns a parsed value into maps and slices so a test can compare it with reflect.DeepEqual.
func plain(v any) any {
	switch x := v.(type) {
	case *Map:
		out := map[string]any{}
		for _, k := range x.Keys() {
			out[k] = plain(x.Get(k))
		}
		return out
	case []any:
		out := make([]any, len(x))
		for i, e := range x {
			out[i] = plain(e)
		}
		return out
	}
	return v
}

func read(t *testing.T, src string) *Map {
	t.Helper()
	v, err := Parse(src)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	m, ok := v.(*Map)
	if !ok {
		t.Fatalf("not a mapping: %#v", v)
	}
	return m
}

func eq(t *testing.T, got, want any) {
	t.Helper()
	if !reflect.DeepEqual(plain(got), want) {
		t.Fatalf("got %#v\nwant %#v", plain(got), want)
	}
}

func TestScalarsFlowListsAndFlowMaps(t *testing.T) {
	m := read(t, `type: design-state
tags: [idea, "a, b"]
n: 12
ok: true
nothing:
loc: { role: button, name: 重新加载 }`)
	eq(t, m, map[string]any{
		"type":    "design-state",
		"tags":    []any{"idea", "a, b"},
		"n":       12.0,
		"ok":      true,
		"nothing": nil,
		"loc":     map[string]any{"role": "button", "name": "重新加载"},
	})
	if got := strings.Join(m.Keys(), ","); got != "type,tags,n,ok,nothing,loc" {
		t.Fatalf("keys are not in written order: %s", got)
	}
}

func TestBlockListsOfMapsContinueTheMappingOnFollowingLines(t *testing.T) {
	m := read(t, `edges:
  - id: retry
    to: "[[a]]"
    blocked: { missing: 一份数据, tried: [拦接口返回 500, 历史报告] }
  - id: done # trailing comment
    kind: system
list:
- x
- y: 1
  z: 2`)
	eq(t, m.Get("edges"), []any{
		map[string]any{"id": "retry", "to": "[[a]]", "blocked": map[string]any{"missing": "一份数据", "tried": []any{"拦接口返回 500", "历史报告"}}},
		map[string]any{"id": "done", "kind": "system"},
	})
	eq(t, m.Get("list"), []any{"x", map[string]any{"y": 1.0, "z": 2.0}})
}

func TestNestedBlockMappingsAndBlockScalars(t *testing.T) {
	m := read(t, `entry:
  url: /report/<id>
  preconditions:
    account: 已登录
    note: |
      line one
      line two
after: z`)
	entry := m.Get("entry").(*Map)
	if entry.Get("url") != "/report/<id>" {
		t.Fatalf("url: %#v", entry.Get("url"))
	}
	eq(t, entry.Get("preconditions"), map[string]any{"account": "已登录", "note": "line one\nline two"})
	if m.Get("after") != "z" {
		t.Fatalf("after: %#v", m.Get("after"))
	}
}

func TestAFlowListMaySpanLines(t *testing.T) {
	m := read(t, `code: [src/a.tsx,
  src/b.tsx]
x: 1`)
	eq(t, m.Get("code"), []any{"src/a.tsx", "src/b.tsx"})
	if m.Get("x") != 1.0 {
		t.Fatalf("x: %#v", m.Get("x"))
	}
}

func TestQuotedLinksAreStringsAndDatesStayAsWritten(t *testing.T) {
	m := read(t, `page: "[[report]]"
duration: "{motion.duration.base}"
refs: ["[[a]]", '[[b]]']
created: 2026-11-19
stamp: 2026-11-19T08:30:00Z
quoted: "12"
hex: 0x10
words: [yes, No, ON]
dup: 1
dup: 2`)
	eq(t, m, map[string]any{
		"page":     "[[report]]",
		"duration": "{motion.duration.base}",
		"refs":     []any{"[[a]]", "[[b]]"},
		"created":  "2026-11-19",
		"stamp":    "2026-11-19T08:30:00Z",
		"quoted":   "12",
		"hex":      "0x10",
		"words":    []any{"yes", "No", "ON"},
		"dup":      2.0,
	})
	if got := strings.Join(m.Keys(), ","); got != "page,duration,refs,created,stamp,quoted,hex,words,dup" {
		t.Fatalf("keys are not in written order: %s", got)
	}
}

func TestBlockScalarsDropTheirTrailingNewline(t *testing.T) {
	m := read(t, "keep: |\n  a\n  b\n\nfold: >\n  one\n  two\nstrip: |-\n  x\nnext: 1")
	eq(t, m, map[string]any{"keep": "a\nb", "fold": "one two", "strip": "x", "next": 1.0})
}

func TestAnUnquotedLinkIsAnErrorThatNamesTheLineAndSaysToQuoteIt(t *testing.T) {
	for _, src := range []string{"a: 1\npage: [[report]]", "a: 1\nrefs: [[[a]], \"[[b]]\"]", "a: 1\nrefs:\n  - x\n  - [[a, b]]"} {
		_, err := Parse(src)
		if err == nil || !strings.Contains(err.Error(), "引用要加引号") || !strings.Contains(err.Error(), "第 2 行") && !strings.Contains(err.Error(), "第 4 行") {
			t.Fatalf("%q: %v", src, err)
		}
	}
	// a real list of lists is not a link: it has more than one inner list, or spaces keep them apart in quotes
	m := read(t, `grid: [[1, 2], [3]]`)
	eq(t, m.Get("grid"), []any{[]any{1.0, 2.0}, []any{3.0}})
}

func TestATokenWithoutQuotesIsAnErrorThatNamesTheLineAndSaysToQuoteIt(t *testing.T) {
	_, err := Parse("a: 1\nb: 2\nduration: {motion.duration.base}")
	if err == nil || !strings.Contains(err.Error(), "第 3 行") || !strings.Contains(err.Error(), "引用要加引号") {
		t.Fatalf("got %v", err)
	}
}

func TestSplitSeparatesBodyAndReportsABadBlockInsteadOfFailing(t *testing.T) {
	ok := Split("---\ntype: x\n---\n\n# Body\n")
	eq(t, ok.FM, map[string]any{"type": "x"})
	if !strings.Contains(ok.Body, "# Body") {
		t.Fatalf("body: %q", ok.Body)
	}
	if Split("no frontmatter").FM != nil {
		t.Fatal("no frontmatter should give a nil map")
	}
	bad := Split("---\nfoo: [unclosed\n---\nbody")
	if bad.FM != nil || bad.Error == "" {
		t.Fatalf("bad block: %#v", bad)
	}
	if empty := Split("---\n# only a comment\n---\nbody"); empty.FM == nil || empty.FM.Len() != 0 || empty.Error != "" {
		t.Fatalf("empty block: %#v", empty)
	}
	if list := Split("---\n- a\n- b\n---\nbody"); list.FM != nil || list.Error == "" {
		t.Fatalf("list block: %#v", list)
	}
}

func TestSplitCountsErrorLinesFromTheTopOfTheFile(t *testing.T) {
	// line 1 `---`, line 2 type, line 3 the unquoted link
	sp := Split("---\ntype: x\npage: [[report]]\n---\nbody")
	if !strings.Contains(sp.Error, "第 3 行") || !strings.Contains(sp.Error, "引用要加引号") {
		t.Fatalf("got %q", sp.Error)
	}
	sp = Split("---\ntype: x\nbad: [a\nnext: 1\n---\nbody")
	if !strings.HasPrefix(sp.Error, "第 3 行：") { // the unclosed list begins on line 3 of the file
		t.Fatalf("a YAML error should lead with the line where the list began: %q", sp.Error)
	}
	sp = Split("---\ntype: x\n\tb: 2\n---\nbody")
	if !strings.Contains(sp.Error, "第 3 行") {
		t.Fatalf("got %q", sp.Error)
	}
}

func TestSyntaxErrorsFromUnquotedValuesSayToQuoteThem(t *testing.T) {
	cases := map[string]string{
		"colon in a value":    "---\ntype: x\ntitle: a: b\n---\nbody",
		"brace in a value":    "---\ntype: x\nlink: {token\n---\nbody",
		"unclosed list value": "---\ntype: x\nbad: [a\nnext: 1\n---\nbody",
	}
	for name, src := range cases {
		sp := Split(src)
		if !strings.HasPrefix(sp.Error, "第 ") || !strings.HasSuffix(sp.Error, "值里有冒号、问号或花括号时要加引号") {
			t.Errorf("%s: want the line, the library's words and the quote sentence, got %q", name, sp.Error)
		}
	}
	// an error that is not about a value's characters stays as the library said it
	sp := Split("---\ntype: x\n\tb: 2\n---\nbody")
	if sp.Error == "" || strings.Contains(sp.Error, "要加引号") {
		t.Errorf("a tab error should not carry the quote sentence: %q", sp.Error)
	}
}
