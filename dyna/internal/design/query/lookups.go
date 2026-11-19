package query

import (
	"sort"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/design/archive"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/miniyaml"
)

// journeyStop is one item of a journey's `path`: `"[[state]]"` or `{ state, via }`.
type journeyStop struct {
	state string
	via   any // null when absent
}

func journeyPath(j *archive.Object) []journeyStop {
	items := asList(fmGet(j.FM, "path"))
	out := make([]journeyStop, len(items))
	for i, item := range items {
		switch x := item.(type) {
		case *miniyaml.Map:
			out[i] = journeyStop{state: wikilinkOrText(fmGet(x, "state")), via: nn(fmGet(x, "via"))}
		case []any:
			out[i] = journeyStop{state: "undefined"}
		default:
			out[i] = journeyStop{state: wikilinkOrText(item)}
		}
	}
	return out
}

// decisionsAndCandidates are an object's 「决定」 and 「设计法候选」 entries, each tagged with whose they are.
func decisionsAndCandidates(o *archive.Object) (decisions, candidates []any) {
	of := obj("id", o.ID, "kind", o.Kind)
	decisions, candidates = []any{}, []any{}
	for _, d := range archive.ParseDecisions(archive.SectionOf(o.Body, "决定")).Entries {
		decisions = append(decisions, obj("of", of, "n", float64(d.N), "title", d.Title, "why", nilIfPtr(d.Why), "rejected", nilIfPtr(d.Rejected), "source", nilIfPtr(d.Source)))
	}
	for _, c := range archive.ParseCandidates(archive.SectionOf(o.Body, "设计法候选")).Entries {
		candidates = append(candidates, obj("of", of, "rule", c.Rule, "merge", nilIfPtr(c.Merge), "why", nilIfPtr(c.Why), "evidence", nilIfPtr(c.Evidence)))
	}
	return
}

// Page is a page: its object, regions (area → component), the components and motions it uses (with every page
// that uses each), every state with the edges leaving and entering it, the journeys that pass through it, and the
// decisions and candidates of the page and of what it uses, each tagged `of`.
func Page(a *archive.Archive, name string) (*miniyaml.Map, error) {
	page, err := need(a, name, "page")
	if err != nil {
		return nil, err
	}
	used := archive.ComputeUsedBy(a)

	type around struct {
		id      string
		summary any
		code    any
		usedBy  []string
		object  *archive.Object
	}
	collect := func(kind string, m map[string][]string) []around {
		var out []around
		for id, pages := range m {
			if !containsStr(pages, page.ID) {
				continue
			}
			x := around{id: id, usedBy: m[id]}
			if o, ok := a.Objects[id]; ok {
				x.object = o
				x.summary = summaryOf(o)
				x.code = nn(fmGet(o.FM, "code"))
			} else {
				x.summary = nil
				x.code = nil
			}
			out = append(out, x)
		}
		sort.SliceStable(out, func(i, j int) bool { return out[i].id < out[j].id })
		return out
	}
	components := collect("component", used.Components)
	motions := collect("motion", used.Motions)
	aroundView := func(xs []around) []any {
		out := []any{}
		for _, x := range xs {
			out = append(out, clean(obj("id", x.id, "summary", x.summary, "code", x.code, "usedBy", strList(x.usedBy))))
		}
		return out
	}

	var journeys []*archive.Object
	for _, j := range archive.ObjectsOfKind(a, "journey") {
		for _, p := range journeyPath(j) {
			if s, ok := a.Objects[p.state]; ok && archive.PageOfState(s) == page.ID {
				journeys = append(journeys, j)
				break
			}
		}
	}
	journeys = sortObjects(journeys)

	surround := []*archive.Object{page}
	for _, c := range components {
		if c.object != nil {
			surround = append(surround, c.object)
		}
	}
	for _, m := range motions {
		if m.object != nil {
			surround = append(surround, m.object)
		}
	}
	surround = append(surround, journeys...)
	decisions, candidates := []any{}, []any{}
	for _, o := range surround {
		d, c := decisionsAndCandidates(o)
		decisions = append(decisions, d...)
		candidates = append(candidates, c...)
	}

	regions := []any{}
	for _, r := range asList(fmGet(page.FM, "regions")) {
		comp, hasComp := archive.WikilinkTarget(member(r, "component"))
		var code any
		var compV any
		if hasComp {
			compV = comp
			if o, ok := a.Objects[comp]; ok {
				code = nn(fmGet(o.FM, "code"))
			}
		}
		regions = append(regions, obj("name", nn(member(r, "name")), "component", compV, "code", code))
	}

	states := []any{}
	for _, s := range sortObjects(archive.StatesOfPage(a, page.ID)) {
		var entry any
		if archive.IsEntry(s) {
			e, _ := s.FM.Get("entry").(*miniyaml.Map)
			entry = obj("url", fmGet(e, "url"), "preconditions", nn(fmGet(e, "preconditions")))
		}
		m := obj(
			"id", s.ID,
			"summary", summaryOf(s),
			"entry", entry,
			"components", idsOf(fmGet(s.FM, "components")),
			"motions", idsOf(fmGet(s.FM, "motions")),
			"outgoing", edgeViews(a, archive.OutgoingEdges(a, s.ID)),
			"incoming", edgeViews(a, archive.IncomingEdges(a, s.ID)),
		)
		if sec := fmGet(s.FM, "section"); miniyaml.Truthy(sec) && sec != undef {
			m.Set("section", text(sec))
		}
		states = append(states, m)
	}

	journeyViews := []any{}
	for _, j := range journeys {
		ids := []any{}
		for _, p := range journeyPath(j) {
			ids = append(ids, p.state)
		}
		journeyViews = append(journeyViews, obj("id", j.ID, "intent", nn(fmGet(j.FM, "intent")), "states", ids))
	}

	return obj(
		"page", clean(obj("id", page.ID, "file", page.File, "summary", summaryOf(page), "code", nn(fmGet(page.FM, "code")))),
		"regions", regions,
		"components", aroundView(components),
		"motions", aroundView(motions),
		"states", states,
		"sections", sectionViews(a, page.ID),
		"journeys", journeyViews,
		"decisions", decisions,
		"candidates", candidates,
	), nil
}

// State is a state: its way in (`enter`), what to see there, the screen's description and screenshot paths.
func State(a *archive.Archive, name string) (*miniyaml.Map, error) {
	state, err := need(a, name, "state")
	if err != nil {
		return nil, err
	}
	full, err := EnterState(a, name)
	if err != nil {
		return nil, err
	}
	enter := miniyaml.NewMap()
	for _, k := range full.Keys() {
		if k != "shouldSee" {
			enter.Set(k, full.Get(k))
		}
	}
	var section any
	if v := fmGet(state.FM, "section"); !isNull(v) {
		section = text(v)
	}
	return obj(
		"state", clean(obj("id", state.ID, "page", nilIf(archive.PageOfState(state)), "file", state.File, "summary", summaryOf(state), "section", section)),
		"enter", enter,
		"shouldSee", full.Get("shouldSee"),
		"screen", screenOf(state),
		"screenshots", mediaOf(a, state),
	), nil
}

// journeyStep is one step of a journey, with the edge that gets to it.
type journeyStep struct {
	n         int
	state     string
	object    *archive.Object // the state, nil when the archive has none of that name
	edge      *archive.Edge
	noEdge    bool
	ambiguous []string
}

// journeySteps walks a journey's path: for each step after the first, the edge that gets from the previous state
// to this one. `via` on the previous item picks one when several run between the two; without it the first is
// taken and the rest are listed in `ambiguous`. No edge at all → `noEdge`.
func journeySteps(a *archive.Archive, j *archive.Object) []journeyStep {
	path := journeyPath(j)
	out := make([]journeyStep, len(path))
	for i, item := range path {
		step := journeyStep{n: i + 1, state: item.state}
		if o, ok := a.Objects[item.state]; ok && o.Kind == "state" {
			step.object = o
		}
		if i > 0 {
			prev := path[i-1]
			var between []archive.Edge
			for _, e := range a.Edges {
				if e.From == prev.state && e.To == item.state {
					between = append(between, e)
				}
			}
			var chosen *archive.Edge
			if miniyaml.Truthy(prev.via) {
				for k := range between {
					if v, ok := prev.via.(string); ok && between[k].HasID && between[k].ID == v {
						chosen = &between[k]
						break
					}
				}
			} else if len(between) > 0 {
				chosen = &between[0]
			}
			if chosen == nil {
				step.noEdge = true
			} else {
				step.edge = chosen
				if !miniyaml.Truthy(prev.via) && len(between) > 1 {
					for _, e := range between {
						step.ambiguous = append(step.ambiguous, e.ID)
					}
				}
			}
		}
		out[i] = step
	}
	return out
}

// Journey is a journey: its intent, how its first state is entered (`start`), and every step in order.
func Journey(a *archive.Archive, name string) (*miniyaml.Map, error) {
	journey, err := need(a, name, "journey")
	if err != nil {
		return nil, err
	}
	steps := journeySteps(a, journey)
	var start any
	if len(steps) > 0 && steps[0].object != nil {
		s, err := EnterState(a, steps[0].object.ID)
		if err != nil {
			return nil, err
		}
		start = s
	}
	views := []any{}
	for _, s := range steps {
		m := obj("n", float64(s.n), "state", s.state)
		if s.object != nil {
			m.Set("page", nilIf(archive.PageOfState(s.object)))
		} else {
			m.Set("page", nil)
			m.Set("missing", true)
		}
		if s.edge != nil {
			m.Set("trigger", edgeView(a, *s.edge))
		} else {
			m.Set("trigger", nil)
		}
		if s.ambiguous != nil {
			m.Set("ambiguous", strList(s.ambiguous))
		}
		if s.noEdge {
			m.Set("noEdge", true)
		}
		if s.object != nil {
			m.Set("shouldSee", shouldSeeOf(s.object))
		} else {
			m.Set("shouldSee", nil)
		}
		views = append(views, m)
	}
	return obj(
		"journey", clean(obj("id", journey.ID, "file", journey.File, "intent", nn(fmGet(journey.FM, "intent")), "summary", summaryOf(journey))),
		"start", start,
		"steps", views,
	), nil
}
