// Package query reads the design archive: seven entries (page, state, journey, diff, refs, keyword, affected)
// that answer in plain data. The command line prints the data as JSON and the MCP server forwards it, so a tool
// call and the command line cannot drift apart.
//
// The engine is file reading and text matching: no embedding, no model, no clock. A name that matches nothing is
// a *QueryError whose message says what exists instead.
//
// Results are *miniyaml.Map (keys in the order the answer lists them), []any and scalars, so they marshal to the
// same JSON the previous script printed. A value that is Undefined is a key that is left out of the output.
package query

import (
	"sort"
	"strings"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/design/archive"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/miniyaml"
)

// QueryError is an expected failure: the caller prints its message. Code says which kind: "not-found" (the
// default), "usage" (the question itself is wrong) or "no-repo" (nothing to read the answer from).
type QueryError struct {
	Msg  string
	Code string
}

func (e *QueryError) Error() string { return e.Msg }

func qerr(msg string) *QueryError           { return &QueryError{Msg: msg, Code: "not-found"} }
func qerrCode(msg, code string) *QueryError { return &QueryError{Msg: msg, Code: code} }

// Undefined marks a value that is not there at all (as opposed to null): an object key holding it is left out.
type Undefined struct{}

var undef = Undefined{}

func isNull(v any) bool { return v == nil || v == undef }

// nn is `v ?? null`.
func nn(v any) any {
	if isNull(v) {
		return nil
	}
	return v
}

// nilIf is the text, or null when it is empty (the archive writes "no value" as the empty string).
func nilIf(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func nilIfPtr(s *string) any {
	if s == nil {
		return nil
	}
	return *s
}

// obj builds a mapping from key, value pairs; a value that is undef leaves its key out.
func obj(kv ...any) *miniyaml.Map {
	m := miniyaml.NewMap()
	for i := 0; i+1 < len(kv); i += 2 {
		if kv[i+1] == undef {
			continue
		}
		m.Set(kv[i].(string), kv[i+1])
	}
	return m
}

// clean drops the keys whose value is null or undefined.
func clean(m *miniyaml.Map) *miniyaml.Map {
	out := miniyaml.NewMap()
	for _, k := range m.Keys() {
		if v := m.Get(k); !isNull(v) {
			out.Set(k, v)
		}
	}
	return out
}

// fmGet is `o.fm[key]`: undef when the key is not written.
func fmGet(fm *miniyaml.Map, key string) any {
	if !fm.Has(key) {
		return undef
	}
	return fm.Get(key)
}

// member is `v?.key`: undef unless v is a mapping that has the key.
func member(v any, key string) any {
	m, ok := v.(*miniyaml.Map)
	if !ok || m == nil {
		return undef
	}
	return fmGet(m, key)
}

// asList is the value as a list: a list is itself, null or undefined is empty, anything else is a list of one.
func asList(v any) []any {
	switch x := v.(type) {
	case nil:
		return []any{}
	case Undefined:
		return []any{}
	case []any:
		return x
	}
	return []any{v}
}

func strList(xs []string) []any {
	out := make([]any, len(xs))
	for i, x := range xs {
		out[i] = x
	}
	return out
}

func containsStr(xs []string, x string) bool {
	for _, e := range xs {
		if e == x {
			return true
		}
	}
	return false
}

func sortObjects(list []*archive.Object) []*archive.Object {
	out := append([]*archive.Object(nil), list...)
	sort.SliceStable(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out
}

func sortMapsByID(list []*miniyaml.Map) {
	sort.SliceStable(list, func(i, j int) bool {
		a, _ := list[i].Get("id").(string)
		b, _ := list[j].Get("id").(string)
		return a < b
	})
}

func mapsToList(list []*miniyaml.Map) []any {
	out := make([]any, len(list))
	for i, m := range list {
		out[i] = m
	}
	return out
}

// text is `String(v)`.
func text(v any) string {
	if v == undef {
		return "undefined"
	}
	return miniyaml.Text(v)
}

// wikilinkOrText is `wikilinkTarget(x) ?? String(x)`.
func wikilinkOrText(v any) string {
	if t, ok := archive.WikilinkTarget(v); ok {
		return t
	}
	return text(v)
}

func idsOf(list any) []any {
	items := asList(list)
	out := make([]any, len(items))
	for i, x := range items {
		out[i] = wikilinkOrText(x)
	}
	return out
}

func listHas(list []any, s string) bool {
	for _, x := range list {
		if t, ok := x.(string); ok && t == s {
			return true
		}
	}
	return false
}

// normalizeCode is a code path written the one way: trimmed, forward slashes, no leading `./`.
func normalizeCode(v any) string {
	s := strings.TrimSpace(text(v))
	s = strings.ReplaceAll(s, `\`, "/")
	return strings.TrimPrefix(s, "./")
}

var kindName = map[string]string{"page": "页面", "state": "状态", "component": "组件", "motion": "动效", "journey": "用户路径"}

// need is the object `name` of the wanted kind, or a QueryError that says what it is instead / what exists.
func need(a *archive.Archive, name, kind string) (*archive.Object, error) {
	if o, ok := a.Objects[name]; ok {
		if o.Kind == kind {
			return o, nil
		}
		return nil, qerr("「" + name + "」是" + kindName[o.Kind] + "，不是" + kindName[kind])
	}
	var known []string
	for _, x := range archive.ObjectsOfKind(a, kind) {
		known = append(known, x.ID)
	}
	sort.Strings(known)
	msg := "找不到" + kindName[kind] + "「" + name + "」"
	if len(known) > 0 {
		msg += "；现有" + kindName[kind] + "：" + strings.Join(known, "、")
	} else {
		msg += "；档案里还没有这一类对象"
	}
	return nil, qerr(msg)
}

// summaryOf is `o.fm.summary ?? null`.
func summaryOf(o *archive.Object) any { return nn(fmGet(o.FM, "summary")) }
