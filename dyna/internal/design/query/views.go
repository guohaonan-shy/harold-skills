package query

import (
	"os"
	"path"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/design/archive"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/frontmatter"
)

// ---------- views of edges and states ----------

func idOf(e archive.Edge) any {
	if e.HasID {
		return e.ID
	}
	return nil
}

// edgeView is an edge as the caller sees it: only the fields its kind uses. An edge with `shot` also says
// whether that image is in the `assets/` next to its state (`shotExists`); an edge without has neither key.
func edgeView(a *archive.Archive, e archive.Edge) *frontmatter.Map {
	var shotExists any
	if s, ok := e.Shot.(string); ok {
		shotExists = assetOf(a, a.Objects[e.From], s).exists
	}
	var blocked any
	if archive.HasBlocked(e) {
		blocked = e.Blocked
	}
	return clean(obj(
		"id", idOf(e),
		"from", nilIf(e.From),
		"to", nilIf(e.To),
		"kind", e.Kind,
		"component", nilIf(e.Component),
		"locate", e.Locate,
		"shot", e.Shot,
		"shotExists", shotExists,
		"fromSection", nilIf(e.FromSection),
		"toSection", nilIf(e.ToSection),
		"when", e.When,
		"action", e.Action,
		"trigger", e.Trigger,
		"how", e.How,
		"motion", nilIf(e.Motion),
		"blocked", blocked,
	))
}

func edgeViews(a *archive.Archive, edges []archive.Edge) []any {
	out := make([]any, len(edges))
	for i, e := range edges {
		out[i] = edgeView(a, e)
	}
	return out
}

func trimmed(s *archive.Section) any {
	if s == nil {
		return nil
	}
	return strings.TrimSpace(s.Text)
}

func shouldSeeOf(o *archive.Object) any { return trimmed(archive.SectionOf(o.Body, "应看到什么")) }
func screenOf(o *archive.Object) any    { return trimmed(archive.SectionOf(o.Body, "这一屏")) }

var (
	mediaRe  = regexp.MustCompile(`(?i)\.(png|jpe?g|gif|webp|svg|webm|mp4)$`)
	imageRe  = regexp.MustCompile(`!\[[^\]]*\]\(([^)\s]+)\)`)
	schemeRe = regexp.MustCompile(`(?i)^[a-z]+://`)
)

// decodeURI is JavaScript's decodeURI: percent escapes are decoded except the ones that stand for a reserved character.
func decodeURI(s string) string {
	if !strings.Contains(s, "%") {
		return s
	}
	hexByte := func(i int) (byte, bool) {
		if i+2 >= len(s) {
			return 0, false
		}
		v, err := strconv.ParseUint(s[i+1:i+3], 16, 8)
		return byte(v), err == nil
	}
	var b strings.Builder
	for i := 0; i < len(s); {
		if s[i] != '%' {
			b.WriteByte(s[i])
			i++
			continue
		}
		first, ok := hexByte(i)
		if !ok {
			b.WriteByte(s[i])
			i++
			continue
		}
		if first < 0x80 {
			if strings.IndexByte(";/?:@&=+$,#", first) >= 0 {
				b.WriteString(s[i : i+3])
			} else {
				b.WriteByte(first)
			}
			i += 3
			continue
		}
		n := 0
		switch {
		case first >= 0xF0:
			n = 4
		case first >= 0xE0:
			n = 3
		case first >= 0xC0:
			n = 2
		}
		raw := []byte{first}
		j := i + 3
		for len(raw) < n && j < len(s) && s[j] == '%' {
			c, ok := hexByte(j)
			if !ok {
				break
			}
			raw = append(raw, c)
			j += 3
		}
		if n == 0 || len(raw) != n || !utf8.Valid(raw) {
			b.WriteString(s[i : i+3])
			i += 3
			continue
		}
		b.Write(raw)
		i = j
	}
	return b.String()
}

// mediaOf is the screenshot / GIF paths a state's body shows: `![[file]]` embeds and `![alt](path)` images.
func mediaOf(a *archive.Archive, state *archive.Object) []any {
	var found []string
	for _, r := range a.Refs {
		if r.From == state.ID && r.Embed && mediaRe.MatchString(r.Target) {
			if fs := a.Files[r.Target]; len(fs) > 0 {
				found = append(found, fs[0])
			} else {
				found = append(found, r.Target)
			}
		}
	}
	for _, m := range imageRe.FindAllStringSubmatch(state.Body, -1) {
		if schemeRe.MatchString(m[1]) || !mediaRe.MatchString(m[1]) {
			continue
		}
		found = append(found, strings.ReplaceAll(path.Join(path.Dir(state.File), decodeURI(m[1])), `\`, "/"))
	}
	seen := map[string]bool{}
	out := []any{}
	for _, f := range found {
		if !seen[f] {
			seen[f] = true
			out = append(out, f)
		}
	}
	return out
}

// ---------- 进入方式 ----------

// EnterState is how to get into a state: the shortest path from any entry node, skipping `blocked` edges.
//
// Reachable → { state, reachable: true, entry: { state, url, preconditions }, steps: [edge…], shouldSee }.
// Not → { state, reachable: false, verdict: '进不去', blocked: [edge + missing + tried…], undeclared }:
// every `blocked` edge on a way in (the state's own in-edges and those upstream, up to where the graph is
// reachable again), and `undeclared: true` when there is none — nothing explains why.
// Ties go to the entry with the smaller id, then to the edge written first.
func EnterState(a *archive.Archive, id string) (*frontmatter.Map, error) {
	target, err := need(a, id, "state")
	if err != nil {
		return nil, err
	}
	var usable []archive.Edge
	for _, e := range a.Edges {
		if e.To == "" {
			continue
		}
		if _, ok := a.Objects[e.To]; !ok {
			continue
		}
		if from, ok := a.Objects[e.From]; ok && from.Kind == "state" {
			usable = append(usable, e)
		}
	}

	// multi-source BFS over edges that are not blocked
	var entries []string
	for _, s := range archive.ObjectsOfKind(a, "state") {
		if archive.IsEntry(s) {
			entries = append(entries, s.ID)
		}
	}
	sort.Strings(entries)
	via := map[string]*archive.Edge{} // state → edge that first reached it
	origin := map[string]string{}
	for _, s := range entries {
		via[s] = nil
		origin[s] = s
	}
	queue := append([]string(nil), entries...)
	for i := 0; i < len(queue); i++ {
		at := queue[i]
		for k := range usable {
			e := &usable[k]
			if e.From != at || archive.HasBlocked(*e) {
				continue
			}
			if _, has := via[e.To]; has {
				continue
			}
			via[e.To] = e
			origin[e.To] = origin[at]
			queue = append(queue, e.To)
		}
	}

	shouldSee := shouldSeeOf(target)
	if _, ok := via[id]; ok {
		var steps []any
		for at := id; via[at] != nil; at = via[at].From {
			steps = append([]any{edgeView(a, *via[at])}, steps...)
		}
		if steps == nil {
			steps = []any{}
		}
		first := a.Objects[origin[id]]
		entry, _ := first.FM.Get("entry").(*frontmatter.Map)
		return obj(
			"state", id,
			"reachable", true,
			"entry", clean(obj("state", first.ID, "url", fmGet(entry, "url"), "preconditions", fmGet(entry, "preconditions"))),
			"steps", steps,
			"shouldSee", shouldSee,
		), nil
	}

	// walk upstream from the target through any edge; blocked ones are the answer, and a state the
	// entries can reach needs no further digging (whatever feeds it is not why the target is out of reach)
	blocked := []any{}
	seen := map[string]bool{id: true}
	order := []string{id}
	for i := 0; i < len(order); i++ {
		at := order[i]
		for _, e := range usable {
			if e.To != at {
				continue
			}
			if archive.HasBlocked(e) {
				b, _ := e.Blocked.(*frontmatter.Map)
				plain := e
				plain.Blocked = nil
				item := edgeView(a, plain)
				item.Set("missing", nn(fmGet(b, "missing")))
				item.Set("tried", asList(fmGet(b, "tried")))
				blocked = append(blocked, item)
			}
			if _, reached := via[e.From]; !reached && !seen[e.From] {
				seen[e.From] = true
				order = append(order, e.From)
			}
		}
	}
	return obj("state", id, "reachable", false, "verdict", "进不去", "blocked", blocked, "undeclared", len(blocked) == 0, "shouldSee", shouldSee), nil
}

// ---------- 分段 ----------

// asset says where an image next to an object's file is, and whether it is there.
type asset struct {
	path   string
	exists bool
}

// assetOf is the image `name` in the `assets/` next to `owner`'s file (a state's screenshot, a slice, an edge's
// `shot`). Reading with a requirement's delta laid over, an image only `prod/` has is still the image (the delta
// re-shoots only what changed); `exists` says whether the file is there, and when it is not, `path` is where it goes.
func assetOf(a *archive.Archive, owner *archive.Object, name string) asset {
	home := strings.ReplaceAll(path.Join(path.Dir(owner.File), "assets", name), `\`, "/")
	candidates := []string{home}
	if owner.Source == "delta" && a.Delta != nil {
		candidates = append(candidates, strings.Replace(home, "docs/design/tmp/"+a.Delta.Slug+"/delta/", "docs/design/prod/", 1))
	}
	for _, c := range candidates {
		if _, err := os.Stat(filepath.Join(a.Root, filepath.FromSlash(c))); err == nil {
			return asset{c, true}
		}
	}
	return asset{home, false}
}

// sectionData is one section of a page as the queries show it. `id` is the full `<page>#<section>`.
type sectionData struct {
	id          string
	page        string
	typ         string
	qualifier   string
	locate      any
	locateBy    string
	declaredBy  string
	scrollDrive bool
	outgoing    []archive.Edge
	incoming    []archive.Edge
	states      []string
	screenshot  string
	shotExists  bool
	a           *archive.Archive
}

func (s sectionData) view() *frontmatter.Map {
	m := obj(
		"id", s.id,
		"page", s.page,
		"type", nilIf(s.typ),
		"qualifier", nilIf(s.qualifier),
		"locate", s.locate,
		"locateBy", nilIf(s.locateBy),
		"declaredBy", s.declaredBy,
	)
	if s.scrollDrive {
		m.Set("scrollDriven", true)
	}
	m.Set("outgoing", edgeViews(s.a, s.outgoing))
	m.Set("incoming", edgeViews(s.a, s.incoming))
	m.Set("states", strList(append([]string{}, s.states...)))
	m.Set("screenshot", s.screenshot)
	m.Set("screenshotExists", s.shotExists)
	return m
}

func sectionOf(a *archive.Archive, pageID string, entry *archive.Object, x archive.StateSection) sectionData {
	ref := pageID + "#" + x.ID
	slice := assetOf(a, entry, entry.ID+"@"+x.ID+".png")
	d := sectionData{id: ref, page: pageID, typ: x.Type, qualifier: x.Qualifier, locate: x.Locate, declaredBy: entry.ID, screenshot: slice.path, shotExists: slice.exists, a: a}
	if x.By != nil {
		d.locateBy = x.By.Kind
	}
	d.scrollDrive = x.ScrollDrivenSet && x.ScrollDriven == true
	for _, e := range a.Edges {
		if e.FromSection == ref {
			d.outgoing = append(d.outgoing, e)
		}
		if e.ToSection == ref {
			d.incoming = append(d.incoming, e)
		}
	}
	var inside []*archive.Object
	for _, s := range archive.StatesOfPage(a, pageID) {
		if v, ok := s.FM.Get("section").(string); ok && v == ref {
			inside = append(inside, s)
		}
	}
	for _, s := range sortObjects(inside) {
		d.states = append(d.states, s.ID)
	}
	return d
}

// sectionDatas are the sections of a page, in page order (empty when its entry state declares none).
func sectionDatas(a *archive.Archive, pageID string) []sectionData {
	entries := archive.SectionEntries(a, pageID)
	if len(entries) == 0 {
		return nil
	}
	var out []sectionData
	for _, x := range archive.SectionsOfState(entries[0]) {
		if x.HasID {
			out = append(out, sectionOf(a, pageID, entries[0], x))
		}
	}
	return out
}

func sectionViews(a *archive.Archive, pageID string) []any {
	out := []any{}
	for _, d := range sectionDatas(a, pageID) {
		out = append(out, d.view())
	}
	return out
}

func allSectionDatas(a *archive.Archive) []sectionData {
	var out []sectionData
	for _, p := range sortObjects(archive.ObjectsOfKind(a, "page")) {
		out = append(out, sectionDatas(a, p.ID)...)
	}
	return out
}
