package query

import (
	"regexp"
	"strings"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/design/archive"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/frontmatter"
)

func isPlain(v any) bool {
	m, ok := v.(*frontmatter.Map)
	return ok && m != nil
}

func isKeyedList(v any) bool {
	l, ok := v.([]any)
	if !ok || len(l) == 0 {
		return false
	}
	for _, x := range l {
		m, ok := x.(*frontmatter.Map)
		if !ok || m == nil {
			return false
		}
		if _, isStr := m.Get("id").(string); !isStr {
			return false
		}
	}
	return true
}

// deepEqual is "the same value": mappings compare by their keys, lists item by item, and a key that is not
// there (undef) is not the same as one that is null.
func deepEqual(a, b any) bool {
	switch x := a.(type) {
	case *frontmatter.Map:
		y, ok := b.(*frontmatter.Map)
		if !ok || x.Len() != y.Len() {
			return false
		}
		for _, k := range x.Keys() {
			if !y.Has(k) || !deepEqual(x.Get(k), y.Get(k)) {
				return false
			}
		}
		return true
	case []any:
		y, ok := b.([]any)
		if !ok || len(x) != len(y) {
			return false
		}
		for i := range x {
			if !deepEqual(x[i], y[i]) {
				return false
			}
		}
		return true
	case Undefined:
		_, ok := b.(Undefined)
		return ok
	case nil:
		return b == nil
	}
	if _, isMap := b.(*frontmatter.Map); isMap {
		return false
	}
	if _, isList := b.([]any); isList {
		return false
	}
	return a == b
}

// unlink turns wikilink strings into bare ids, the way every other entry reports references.
func unlink(v any) any {
	switch x := v.(type) {
	case string:
		if t, ok := archive.WikilinkTarget(x); ok {
			return t
		}
		return x
	case []any:
		out := make([]any, len(x))
		for i, e := range x {
			out[i] = unlink(e)
		}
		return out
	case *frontmatter.Map:
		if x == nil {
			return v
		}
		out := frontmatter.NewMap()
		for _, k := range x.Keys() {
			out.Set(k, unlink(x.Get(k)))
		}
		return out
	}
	return v
}

var atomicPath = regexp.MustCompile(`^sections\[[^\]]+\]\.locate$`)

func keyUnion(a, b *frontmatter.Map) []string {
	out := a.Keys()
	seen := map[string]bool{}
	for _, k := range out {
		seen[k] = true
	}
	for _, k := range b.Keys() {
		if !seen[k] {
			out = append(out, k)
		}
	}
	return out
}

// diffFields are the field-level differences between two frontmatter values. Objects are compared key by key,
// lists of items that carry an `id` (a state's edges) item by item as `edges[<id>]`; everything else is one
// field, before and after.
func diffFields(path string, a, b any, out *[]any) {
	if deepEqual(a, b) {
		return
	}
	// a section's locate is one thing: the heading, the landmark or the position it is found by
	atomic := atomicPath.MatchString(path)
	switch {
	case isPlain(a) && isPlain(b) && !atomic:
		ma, mb := a.(*frontmatter.Map), b.(*frontmatter.Map)
		for _, k := range keyUnion(ma, mb) {
			p := k
			if path != "" {
				p = path + "." + k
			}
			diffFields(p, fmGet(ma, k), fmGet(mb, k), out)
		}
	case isKeyedList(a) && isKeyedList(b):
		byID := func(l []any) ([]string, map[string]any) {
			var ids []string
			m := map[string]any{}
			for _, x := range l {
				id := x.(*frontmatter.Map).Get("id").(string)
				if _, ok := m[id]; !ok {
					ids = append(ids, id)
				}
				m[id] = x
			}
			return ids, m
		}
		idsA, ma := byID(a.([]any))
		idsB, mb := byID(b.([]any))
		union := append([]string(nil), idsA...)
		for _, id := range idsB {
			if _, ok := ma[id]; !ok {
				union = append(union, id)
			}
		}
		for _, id := range union {
			x, okA := ma[id]
			y, okB := mb[id]
			if !okA {
				x = undef
			}
			if !okB {
				y = undef
			}
			diffFields(path+"["+id+"]", x, y, out)
		}
	default:
		*out = append(*out, obj("field", path, "before", unlink(a), "after", unlink(b)))
	}
}

// bodySections is a body as ordered { title → text }: the text before the first `##` heading, then one entry per `##` section.
func bodySections(body string) ([]string, map[string]string) {
	lines := strings.Split(body, "\n")
	var marks []archive.Heading
	for _, h := range archive.Headings(body) {
		if h.Level == 2 {
			marks = append(marks, h)
		}
	}
	titles := []string{"（开头）"}
	m := map[string]string{}
	end := len(lines)
	if len(marks) > 0 {
		end = marks[0].Line - 1
	}
	m["（开头）"] = strings.TrimSpace(strings.Join(lines[:end], "\n"))
	for i, h := range marks {
		e := len(lines)
		if i+1 < len(marks) {
			e = marks[i+1].Line - 1
		}
		if _, ok := m[h.Title]; !ok {
			titles = append(titles, h.Title)
		}
		m[h.Title] = strings.TrimSpace(strings.Join(lines[h.Line:e], "\n"))
	}
	return titles, m
}

func diffSections(before, after string) []any {
	ta, a := bodySections(before)
	tb, b := bodySections(after)
	union := append([]string(nil), ta...)
	for _, t := range tb {
		if _, ok := a[t]; !ok {
			union = append(union, t)
		}
	}
	out := []any{}
	for _, title := range union {
		x, okA := a[title]
		y, okB := b[title]
		if okA && okB && x == y {
			continue
		}
		change := "changed"
		switch {
		case !okA:
			change = "added"
		case !okB:
			change = "removed"
		}
		m := obj("title", title, "change", change)
		if okA {
			m.Set("before", x)
		}
		if okB {
			m.Set("after", y)
		}
		out = append(out, m)
	}
	return out
}

func objectView(o *archive.Object) *frontmatter.Map {
	return obj("id", o.ID, "kind", o.Kind, "summary", summaryOf(o), "file", o.File)
}

// Diff is what a requirement changes: `docs/design/tmp/<slug>/delta/` against `prod/`. Added and removed are
// objects; changed carry the frontmatter fields that differ (`fields`) and the body sections that do
// (`sections`). A copy in `delta/` that equals the `prod/` object is not a change. Ids that `removed.md` lists
// but `prod/` never had are `unknownRemoved`.
func Diff(root, slug string) (*frontmatter.Map, error) {
	prod, err := archive.Load(root, archive.Options{})
	if err != nil {
		return nil, err
	}
	next, err := archive.Load(root, archive.Options{Delta: slug})
	if err != nil {
		return nil, qerr("找不到需求「" + slug + "」的设计差异：" + err.Error())
	}
	changed := []any{}
	for _, id := range next.Delta.Changed {
		before, after := prod.Objects[id], next.Objects[id]
		fields := []any{}
		diffFields("", before.FM, after.FM, &fields)
		sections := diffSections(before.Body, after.Body)
		if len(fields) > 0 || len(sections) > 0 {
			m := objectView(after)
			m.Set("fields", fields)
			m.Set("sections", sections)
			changed = append(changed, m)
		}
	}
	added := []any{}
	for _, id := range next.Delta.Added {
		added = append(added, objectView(next.Objects[id]))
	}
	removed := []any{}
	unknown := []any{}
	for _, id := range next.Delta.Removed {
		if o, ok := prod.Objects[id]; ok {
			removed = append(removed, objectView(o))
		} else {
			unknown = append(unknown, id)
		}
	}
	return obj("spec", slug, "added", added, "changed", changed, "removed", removed, "unknownRemoved", unknown), nil
}
