package query

import (
	"regexp"
	"sort"
	"strings"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/design/archive"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/miniyaml"
)

var sectionRefRe = regexp.MustCompile(`^[^#]+#[^#]+$`)

func sectionTypeList() string {
	names := make([]string, len(archive.SectionTypes))
	for i, t := range archive.SectionTypes {
		names[i] = t.Name
	}
	return strings.Join(names, "、")
}

// Refs is who refers to a component (given by name or by code path) or to a motion: the edges that go through
// it, the states that list it or have such an edge (`via`: components / motions / edges), the journeys whose
// steps use it, and every page that uses it. `<page>#<section>` and `#<type>` ask about sections instead.
func Refs(a *archive.Archive, name string) (*miniyaml.Map, error) {
	key := normalizeCode(name)
	if strings.HasPrefix(key, "#") {
		return refsOfSectionType(a, key[1:])
	}
	if sectionRefRe.MatchString(key) {
		return refsOfSection(a, key)
	}
	target := a.Objects[key]
	matchedBy := "name"
	if target != nil && target.Kind != "component" && target.Kind != "motion" {
		return nil, qerr("「" + name + "」是" + kindName[target.Kind] + "；反查只接组件、动效（名字）或组件的代码路径")
	}
	if target == nil {
		matchedBy = "code"
		for _, c := range sortObjects(archive.ObjectsOfKind(a, "component")) {
			for _, p := range asList(fmGet(c.FM, "code")) {
				if normalizeCode(p) == key {
					target = c
					break
				}
			}
			if target != nil {
				break
			}
		}
	}
	if target == nil {
		list := func(kind string) string {
			var ids []string
			for _, o := range archive.ObjectsOfKind(a, kind) {
				ids = append(ids, o.ID)
			}
			sort.Strings(ids)
			if len(ids) == 0 {
				return "无"
			}
			return strings.Join(ids, "、")
		}
		return nil, qerr("找不到组件或动效「" + name + "」，也没有组件的代码路径是它；现有组件：" + list("component") + "；现有动效：" + list("motion"))
	}

	isComponent := target.Kind == "component"
	listField := "motions"
	if isComponent {
		listField = "components"
	}
	uses := func(e archive.Edge) bool {
		if isComponent {
			return e.Component == target.ID
		}
		return e.Motion == target.ID
	}
	lists := func(s *archive.Object) bool { return listHas(idsOf(fmGet(s.FM, listField)), target.ID) }

	var edges []archive.Edge
	for _, e := range a.Edges {
		if uses(e) {
			edges = append(edges, e)
		}
	}
	type viaEntry struct {
		id  string
		via []string
	}
	var viaOf []*viaEntry
	mark := func(id, via string) {
		for _, v := range viaOf {
			if v.id == id {
				v.via = append(v.via, via)
				return
			}
		}
		viaOf = append(viaOf, &viaEntry{id: id, via: []string{via}})
	}
	for _, s := range archive.ObjectsOfKind(a, "state") {
		if lists(s) {
			mark(s.ID, listField)
		}
		for _, e := range edges {
			if e.From == s.ID {
				mark(s.ID, "edges")
				break
			}
		}
	}

	var journeys []*archive.Object
	for _, j := range archive.ObjectsOfKind(a, "journey") {
		for _, s := range journeySteps(a, j) {
			if (s.edge != nil && uses(*s.edge)) || (s.object != nil && lists(s.object)) {
				journeys = append(journeys, j)
				break
			}
		}
	}
	journeys = sortObjects(journeys)

	states := make([]*miniyaml.Map, 0, len(viaOf))
	for _, v := range viaOf {
		states = append(states, obj("id", v.id, "page", nilIf(archive.PageOfState(a.Objects[v.id])), "via", strList(v.via)))
	}
	sortMapsByID(states)

	used := archive.ComputeUsedBy(a)
	pagesMap := used.Motions
	if isComponent {
		pagesMap = used.Components
	}
	pages, ok := pagesMap[target.ID]
	if !ok {
		pages = []string{}
	}
	return obj(
		"target", clean(obj("id", target.ID, "kind", target.Kind, "code", nn(fmGet(target.FM, "code")))),
		"matchedBy", matchedBy,
		"edges", edgeViews(a, edges),
		"states", mapsToList(states),
		"journeys", journeyRefs(journeys),
		"pages", strList(pages),
	), nil
}

func journeyRefs(journeys []*archive.Object) []any {
	out := []any{}
	for _, j := range journeys {
		out = append(out, obj("id", j.ID, "intent", nn(fmGet(j.FM, "intent"))))
	}
	return out
}

// refsOfSectionType is `#<type>`: every section of that type on every page.
func refsOfSectionType(a *archive.Archive, typ string) (*miniyaml.Map, error) {
	known := false
	for _, t := range archive.SectionTypes {
		if t.Name == typ {
			known = true
		}
	}
	if !known {
		return nil, qerr("「#" + typ + "」不是分段类型；类型表：" + sectionTypeList())
	}
	all := allSectionDatas(a)
	var sections []sectionData
	for _, x := range all {
		if x.typ == typ {
			sections = append(sections, x)
		}
	}
	if len(sections) == 0 {
		msg := "档案里没有 " + typ + " 类的段；"
		if len(all) > 0 {
			ids := make([]string, len(all))
			for i, x := range all {
				ids[i] = x.id
			}
			msg += "现有分段：" + strings.Join(ids, "、")
		} else {
			msg += "档案里还没有任何分段"
		}
		return nil, qerr(msg)
	}
	out := []any{}
	for _, x := range sections {
		m := obj("page", x.page, "id", x.id, "type", nilIf(x.typ), "qualifier", nilIf(x.qualifier), "locate", x.locate, "declaredBy", x.declaredBy)
		if x.scrollDrive {
			m.Set("scrollDriven", true)
		}
		out = append(out, m)
	}
	return obj("target", obj("kind", "section-type", "type", typ), "matchedBy", "type", "sections", out), nil
}

// refsOfSection is `<page>#<section>`: what leaves it, lands on it, happens inside it, and the journeys through those.
func refsOfSection(a *archive.Archive, ref string) (*miniyaml.Map, error) {
	parts := strings.Split(ref, "#")
	pageID, id := parts[0], parts[1]
	if _, err := need(a, pageID, "page"); err != nil {
		return nil, err
	}
	here := archive.SectionsOfPage(a, pageID)
	if len(here) == 0 {
		return nil, qerr("页面「" + pageID + "」没有声明分段（它的入口状态没有 sections）")
	}
	var view *sectionData
	for _, d := range sectionDatas(a, pageID) {
		if d.id == ref {
			d := d
			view = &d
			break
		}
	}
	if view == nil {
		ids := make([]string, len(here))
		for i, x := range here {
			ids[i] = x.ID
		}
		return nil, qerr("找不到分段「" + id + "」；" + pageID + " 现有分段：" + strings.Join(ids, "、"))
	}

	keyOf := func(e archive.Edge) string { return e.From + "/" + e.ID }
	through := map[string]bool{}
	for _, e := range view.outgoing {
		through[keyOf(e)] = true
	}
	for _, e := range view.incoming {
		through[keyOf(e)] = true
	}
	var journeys []*archive.Object
	for _, j := range archive.ObjectsOfKind(a, "journey") {
		for _, s := range journeySteps(a, j) {
			inside := false
			if s.object != nil {
				if v, ok := s.object.FM.Get("section").(string); ok && v == ref {
					inside = true
				}
			}
			if (s.edge != nil && through[keyOf(*s.edge)]) || inside {
				journeys = append(journeys, j)
				break
			}
		}
	}
	journeys = sortObjects(journeys)

	var scroll any
	if view.scrollDrive {
		scroll = true
	}
	states := []any{}
	for _, sid := range view.states {
		states = append(states, obj("id", sid, "page", pageID, "via", []any{"section"}))
	}
	return obj(
		"target", clean(obj("id", view.id, "kind", "section", "page", pageID, "type", nilIf(view.typ), "qualifier", nilIf(view.qualifier), "locate", view.locate, "declaredBy", view.declaredBy, "scrollDriven", scroll)),
		"matchedBy", "section",
		"outgoing", edgeViews(a, view.outgoing),
		"incoming", edgeViews(a, view.incoming),
		"states", states,
		"journeys", journeyRefs(journeys),
		"pages", []any{pageID},
	), nil
}
