package miniyaml

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

func parse(t *testing.T, src string) *Map {
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
	m := parse(t, `type: design-state
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
	m := parse(t, `edges:
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
	m := parse(t, `entry:
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

func TestUnquotedLinkAndTokenStayStrings(t *testing.T) {
	m := parse(t, `page: [[report]]
duration: {motion.duration.base}
refs: [[[a]], "[[b]]"]`)
	if m.Get("page") != "[[report]]" {
		t.Fatalf("page: %#v", m.Get("page"))
	}
	if m.Get("duration") != "{motion.duration.base}" {
		t.Fatalf("duration: %#v", m.Get("duration"))
	}
	eq(t, m.Get("refs"), []any{"[[a]]", "[[b]]"})
}

func TestAFlowListMaySpanLines(t *testing.T) {
	m := parse(t, `code: [src/a.tsx,
  src/b.tsx]
x: 1`)
	eq(t, m.Get("code"), []any{"src/a.tsx", "src/b.tsx"})
	if m.Get("x") != 1.0 {
		t.Fatalf("x: %#v", m.Get("x"))
	}
}

func TestSplitFrontmatterSeparatesBodyAndReportsABadBlockInsteadOfFailing(t *testing.T) {
	ok := SplitFrontmatter("---\ntype: x\n---\n\n# Body\n")
	eq(t, ok.FM, map[string]any{"type": "x"})
	if !strings.Contains(ok.Body, "# Body") {
		t.Fatalf("body: %q", ok.Body)
	}
	if SplitFrontmatter("no frontmatter").FM != nil {
		t.Fatal("no frontmatter should give a nil map")
	}
	bad := SplitFrontmatter("---\nfoo: [unclosed\n---\nbody")
	if bad.FM != nil || bad.Error == "" {
		t.Fatalf("bad block: %#v", bad)
	}
}

func TestErrorsNameTheLine(t *testing.T) {
	for src, want := range map[string]string{
		"a: 1\n\tb: 2":  "第 2 行：不支持制表符缩进",
		"a: 1\n  b: 2":  "第 2 行：缩进对不上",
		"a: \"open":     "引号没有闭合",
		"a: [x y z] q":  "多余内容",
		"a: 1\nnot key": "第 2 行：读不出「键: 值」",
	} {
		_, err := Parse(src)
		if err == nil || !strings.Contains(err.Error(), want) {
			t.Fatalf("%q: got %v, want %q", src, err, want)
		}
	}
}
