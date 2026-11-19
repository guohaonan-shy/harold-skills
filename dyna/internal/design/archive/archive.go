// Package archive reads the design archive: the reusable layer under validation, queries, the MCP server and
// archiving.
//
// `docs/design/prod/` is a graph (the design-archive skill describes it): page states are the nodes, the `edges`
// written in each state file are the edges, and pages / components / motions / journeys are objects the nodes
// and edges point at. This package reads a repository root and returns every object, edge and reference in one
// structure; the checker, the queries, the MCP server and the archiver all reuse the same functions rather than
// re-reading files.
//
// Load with a spec slug overlays `docs/design/tmp/<slug>/delta/` on `prod/`: objects in `delta/` replace the
// `prod/` object with the same id (they hold the full file), ids listed in `delta/removed.md` are dropped. What
// comes back is the archive "as it will be after the change", with Archive.Delta recording which ids were
// added / changed / removed.
//
// Pure apart from reading files: no clock, no network, no model.
//
// Frontmatter values are untyped (miniyaml: nil, bool, float64, string, []any, *Map). Where the archive treats
// "absent" and "null" the same, a text field here is the empty string for both.
package archive

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/miniyaml"
)

// TypeKinds maps a frontmatter `type` to the kind of object, in the order the messages list them.
var TypeKinds = []struct{ Type, Kind string }{
	{"design-page", "page"},
	{"design-state", "state"},
	{"design-component", "component"},
	{"design-motion", "motion"},
	{"design-journey", "journey"},
}

// KindOfType is the kind a frontmatter `type` stands for ("" when it is not an archive type).
func KindOfType(t any) string {
	s, ok := t.(string)
	if !ok {
		return ""
	}
	for _, tk := range TypeKinds {
		if tk.Type == s {
			return tk.Kind
		}
	}
	return ""
}

// Kinds are the kinds of object.
var Kinds = []string{"page", "state", "component", "motion", "journey"}

// KindDir is the directory under prod/ (and delta/) that holds each kind. States live with their page.
var KindDir = map[string]string{"page": "pages", "state": "pages", "component": "components", "motion": "motions", "journey": "journeys"}

var objectDirs = []string{"pages", "components", "motions", "journeys"}

// Posix writes a path with forward slashes.
func Posix(p string) string { return filepath.ToSlash(p) }

// ---------- wikilinks ----------

var wholeLink = regexp.MustCompile(`^\[\[([^\[\]]+)\]\]$`)

// WikilinkTarget turns `"[[a]]"`, `[[a|alias]]`, `[[a#heading]]` into `a`. False when the whole value is not one link.
func WikilinkTarget(v any) (string, bool) {
	s, ok := v.(string)
	if !ok {
		return "", false
	}
	m := wholeLink.FindStringSubmatch(strings.TrimSpace(s))
	if m == nil {
		return "", false
	}
	return TargetOf(m[1]), true
}

// TargetOf is the file a link's inner text points at: the part before `|` and before `#`.
func TargetOf(inner string) string {
	inner = strings.SplitN(inner, "|", 2)[0]
	inner = strings.SplitN(inner, "#", 2)[0]
	return strings.TrimSpace(inner)
}

// Wikilink is one `[[...]]` found in a text.
type Wikilink struct {
	Target string
	Raw    string
	Line   int
}

var (
	fenceLine  = regexp.MustCompile("^\\s*(`{3,}|~{3,})")
	inlineCode = regexp.MustCompile("`[^`]*`")
	linkInText = regexp.MustCompile(`!?\[\[([^\[\]]+)\]\]`)
)

// WikilinksIn is every `[[...]]` in a text, skipping fenced code and inline code.
func WikilinksIn(text string) []Wikilink {
	var out []Wikilink
	var fence byte
	for i, line := range strings.Split(text, "\n") {
		if m := fenceLine.FindStringSubmatch(line); m != nil {
			if fence == 0 {
				fence = m[1][0]
			} else if m[1][0] == fence {
				fence = 0
			}
			continue
		}
		if fence != 0 {
			continue
		}
		plain := inlineCode.ReplaceAllString(line, "")
		for _, m := range linkInText.FindAllStringSubmatch(plain, -1) {
			out = append(out, Wikilink{Target: TargetOf(m[1]), Raw: m[0], Line: i + 1})
		}
	}
	return out
}

// FieldRef is a wikilink found inside a frontmatter value, with its field path (`edges[0].to`).
type FieldRef struct {
	Path   string
	Target string
}

// RefsIn is every string wikilink inside a frontmatter value.
func RefsIn(value any, path string) []FieldRef {
	switch x := value.(type) {
	case string:
		if t, ok := WikilinkTarget(x); ok {
			return []FieldRef{{Path: path, Target: t}}
		}
	case []any:
		var out []FieldRef
		for i, v := range x {
			out = append(out, RefsIn(v, fmt.Sprintf("%s[%d]", path, i))...)
		}
		return out
	case *miniyaml.Map:
		var out []FieldRef
		for _, k := range x.Keys() {
			p := k
			if path != "" {
				p = path + "." + k
			}
			out = append(out, RefsIn(x.Get(k), p)...)
		}
		return out
	}
	return nil
}

// ---------- body sections ----------

// Heading is an ATX heading.
type Heading struct {
	Level int
	Title string
	Line  int
}

var headingLine = regexp.MustCompile(`^(#{1,6})\s+(.+?)\s*#*\s*$`)

// Headings are the ATX headings outside fenced code.
func Headings(markdown string) []Heading {
	var out []Heading
	var fence byte
	for i, raw := range strings.Split(markdown, "\n") {
		line := strings.TrimRight(raw, " \t\r\n\f\v")
		if m := fenceLine.FindStringSubmatch(line); m != nil {
			if fence == 0 {
				fence = m[1][0]
			} else if m[1][0] == fence {
				fence = 0
			}
			continue
		}
		if fence != 0 {
			continue
		}
		if m := headingLine.FindStringSubmatch(line); m != nil {
			out = append(out, Heading{Level: len(m[1]), Title: strings.TrimSpace(m[2]), Line: i + 1})
		}
	}
	return out
}

// Section is the text under a heading.
type Section struct {
	Level int
	Title string
	Line  int
	Text  string
}

// SectionOf is the section under the first heading titled title: text up to the next heading of the same or a
// higher level. Nil when there is no such heading.
func SectionOf(markdown, title string) *Section {
	lines := strings.Split(markdown, "\n")
	hs := Headings(markdown)
	at := -1
	for i, h := range hs {
		if h.Title == title {
			at = i
			break
		}
	}
	if at < 0 {
		return nil
	}
	h := hs[at]
	end := len(lines)
	for _, x := range hs[at+1:] {
		if x.Level <= h.Level {
			end = x.Line - 1
			break
		}
	}
	return &Section{Level: h.Level, Title: h.Title, Line: h.Line, Text: strings.Join(lines[h.Line:end], "\n")}
}

var noneText = regexp.MustCompile(`^无[。.]?$`)

func isNone(text string) bool { return noneText.MatchString(strings.TrimSpace(text)) }

// Decision is one `### 决定 N：标题` entry. A missing item is nil.
type Decision struct {
	N        int
	Title    string
	Line     int
	Why      *string
	Rejected *string
	Source   *string
}

// Decisions is a parsed 「决定」 section.
type Decisions struct {
	None     bool
	Entries  []Decision
	Problems []string
}

var decisionTitle = regexp.MustCompile(`^决定\s*(\d+)\s*[：:]\s*(.+)$`)

// ParseDecisions reads a 「决定」 section: each entry is `### 决定 N：标题` with 为什么 / 否掉过 / 来源 items.
// Problems are shape errors (a heading that is not 决定 N, a duplicated N); a missing item is recorded on the
// entry (nil) so the caller decides what to name.
func ParseDecisions(sec *Section) Decisions {
	out := Decisions{}
	if sec == nil {
		return out
	}
	var hs []Heading
	for _, h := range Headings(sec.Text) {
		if h.Level == sec.Level+1 {
			hs = append(hs, h)
		}
	}
	lines := strings.Split(sec.Text, "\n")
	preEnd := len(lines)
	if len(hs) > 0 {
		preEnd = hs[0].Line - 1
	}
	if isNone(strings.Join(lines[:preEnd], "\n")) {
		out.None = true
	}
	seen := map[int]bool{}
	for idx, h := range hs {
		m := decisionTitle.FindStringSubmatch(h.Title)
		end := len(lines)
		if idx+1 < len(hs) {
			end = hs[idx+1].Line - 1
		}
		body := strings.Join(lines[h.Line:end], "\n")
		if m == nil {
			out.Problems = append(out.Problems, fmt.Sprintf("「%s」不是「决定 N：标题」的形状", h.Title))
			continue
		}
		n, _ := strconv.Atoi(m[1])
		if seen[n] {
			out.Problems = append(out.Problems, fmt.Sprintf("决定 %d 的编号重复", n))
		}
		seen[n] = true
		items := labelled(body, []string{"为什么", "否掉过", "来源"})
		out.Entries = append(out.Entries, Decision{N: n, Title: strings.TrimSpace(m[2]), Line: sec.Line + h.Line, Why: items["为什么"], Rejected: items["否掉过"], Source: items["来源"]})
	}
	return out
}

// Candidate is one design-rule candidate. A missing item is nil.
type Candidate struct {
	Rule     string
	Line     int
	Merge    *string
	Why      *string
	Evidence *string
}

// Candidates is a parsed 「设计法候选」 section.
type Candidates struct {
	None     bool
	Entries  []Candidate
	Problems []string
}

var (
	topBullet = regexp.MustCompile(`^[-*]\s+(.+)$`)
	boldWhole = regexp.MustCompile(`^\*\*(.*)\*\*$`)
	labelItem = regexp.MustCompile(`^\s*[-*]\s*(\S+?)\s*[：:]\s*(.*)$`)
	indented  = regexp.MustCompile(`^\s+\S`)
	anyBullet = regexp.MustCompile(`^\s*[-*]\s`)
)

// ParseCandidates reads a 「设计法候选」 section: each is a top-level bullet (the rule, one sentence) with
// 并进 / 为什么 / 证据 items underneath. 「无」 alone means there are none.
func ParseCandidates(sec *Section) Candidates {
	out := Candidates{}
	if sec == nil {
		return out
	}
	lines := strings.Split(sec.Text, "\n")
	if isNone(sec.Text) {
		out.None = true
		return out
	}
	type cur struct {
		rule  string
		line  int
		lines []string
	}
	var c *cur
	flush := func() {
		if c == nil {
			return
		}
		items := labelled(strings.Join(c.lines, "\n"), []string{"并进", "为什么", "证据"})
		out.Entries = append(out.Entries, Candidate{Rule: c.rule, Line: c.line, Merge: items["并进"], Why: items["为什么"], Evidence: items["证据"]})
	}
	for i, l := range lines {
		if m := topBullet.FindStringSubmatch(l); m != nil {
			flush()
			rule := m[1]
			if b := boldWhole.FindStringSubmatch(rule); b != nil {
				rule = b[1]
			}
			c = &cur{rule: strings.TrimSpace(rule), line: sec.Line + 1 + i}
		} else if c != nil {
			c.lines = append(c.lines, l)
		}
	}
	flush()
	if len(out.Entries) == 0 && strings.TrimSpace(sec.Text) != "" {
		out.Problems = append(out.Problems, "既不是「无」，也没有一条候选")
	}
	return out
}

// labelled reads `- 标签：内容` items (and their indented continuation lines).
func labelled(text string, labels []string) map[string]*string {
	out := map[string]*string{}
	for _, l := range labels {
		out[l] = nil
	}
	cur := ""
	for _, line := range strings.Split(text, "\n") {
		m := labelItem.FindStringSubmatch(line)
		switch {
		case m != nil && contains(labels, m[1]):
			cur = m[1]
			s := strings.TrimSpace(m[2])
			out[cur] = &s
		case cur != "" && indented.MatchString(line) && !anyBullet.MatchString(line):
			s := strings.TrimSpace(*out[cur] + " " + strings.TrimSpace(line))
			out[cur] = &s
		case cur != "" && anyBullet.MatchString(line):
			// a differently-labelled or nested bullet: the previous item ends here
			cur = ""
		}
	}
	return out
}

func contains(xs []string, x string) bool {
	for _, e := range xs {
		if e == x {
			return true
		}
	}
	return false
}

// ---------- reading a tree ----------

// Walk lists every file under dir (sorted, depth-first), skipping what skip(path, name) rejects.
func Walk(dir string, skip func(path, name string) bool) []string {
	var out []string
	entries, err := os.ReadDir(dir)
	if err != nil {
		return out
	}
	names := make([]string, 0, len(entries))
	for _, e := range entries {
		names = append(names, e.Name())
	}
	sort.Strings(names)
	for _, name := range names {
		p := filepath.Join(dir, name)
		if skip != nil && skip(p, name) {
			continue
		}
		if st, err := os.Stat(p); err == nil && st.IsDir() {
			out = append(out, Walk(p, skip)...)
		} else {
			out = append(out, p)
		}
	}
	return out
}

// objectFiles are the object files under a prod/-shaped tree (prod/ itself or a delta/). Skips assets/ and index.md.
func objectFiles(treeRoot string) []string {
	var out []string
	for _, d := range objectDirs {
		for _, p := range Walk(filepath.Join(treeRoot, d), func(_, name string) bool { return name == "assets" }) {
			if strings.HasSuffix(p, ".md") {
				out = append(out, p)
			}
		}
	}
	return out
}

// Object is one file of the archive.
type Object struct {
	ID     string
	Kind   string // page / state / component / motion / journey
	Type   string
	File   string // path from the repository root, forward slashes
	Source string // "prod" or "delta"
	FM     *miniyaml.Map
	Body   string
}

// Problem is a file that could not be read as an object.
type Problem struct {
	File    string
	Message string
}

func readObject(root, abs, source string, problems *[]Problem) *Object {
	rel, _ := filepath.Rel(root, abs)
	file := Posix(rel)
	id := strings.TrimSuffix(filepath.Base(abs), ".md")
	b, _ := os.ReadFile(abs)
	sp := miniyaml.SplitFrontmatter(string(b))
	if sp.Error != "" {
		*problems = append(*problems, Problem{File: file, Message: "frontmatter 读不出来：" + sp.Error})
		return nil
	}
	if sp.FM == nil {
		*problems = append(*problems, Problem{File: file, Message: "没有 frontmatter"})
		return nil
	}
	t := sp.FM.Get("type")
	kind := KindOfType(t)
	if kind == "" {
		shown := "缺失"
		if t != nil {
			shown = miniyaml.Text(t)
		}
		var types []string
		for _, tk := range TypeKinds {
			types = append(types, tk.Type)
		}
		*problems = append(*problems, Problem{File: file, Message: fmt.Sprintf("type 不是档案对象的类型（%s）；应是 %s", shown, strings.Join(types, " / "))})
		return nil
	}
	return &Object{ID: id, Kind: kind, Type: t.(string), File: file, Source: source, FM: sp.FM, Body: sp.Body}
}

var (
	bulletLine = regexp.MustCompile(`^\s*[-*]\s+(.*)$`)
	linkInline = regexp.MustCompile(`\[\[([^\[\]]+)\]\]`)
	idSplit    = regexp.MustCompile("[\\s：:—–-]+")
)

// ParseRemoved reads `removed.md`: one object id per bullet line, `- [[id]]` or `- id`, anything after is a note.
func ParseRemoved(text string) []string {
	var ids []string
	for _, line := range strings.Split(text, "\n") {
		m := bulletLine.FindStringSubmatch(line)
		if m == nil {
			continue
		}
		var id string
		if link := linkInline.FindStringSubmatch(m[1]); link != nil {
			id = TargetOf(link[1])
		} else {
			id = idSplit.Split(strings.TrimSpace(strings.ReplaceAll(m[1], "`", "")), -1)[0]
		}
		if id != "" {
			ids = append(ids, id)
		}
	}
	return ids
}

// PageOfState is the state's page id: its `page` field, else the part of the id before `--` ("" for neither).
func PageOfState(state *Object) string {
	if t, ok := WikilinkTarget(state.FM.Get("page")); ok {
		return t
	}
	if strings.Contains(state.ID, "--") {
		return strings.SplitN(state.ID, "--", 2)[0]
	}
	return ""
}

// Edge is one edge written in a state file, normalised. Text fields are "" when absent.
type Edge struct {
	From      string // the state it leaves
	File      string
	Index     int
	ID        string
	HasID     bool
	To        string // the target state id, "" when `to` is not one wikilink
	ToRaw     any
	Kind      any
	Component string
	Motion    string
	Locate    any
	Shot      any
	// FromSection and ToSection are the `from` and `section` fields: the section an edge leaves from and arrives at.
	FromSection string
	ToSection   string
	// HasFromSection and HasToSection say whether those fields were written at all (an empty one counts as written).
	HasFromSection bool
	HasToSection   bool
	When           any
	Action         any
	Trigger        any
	How            any
	Blocked        any
	// Malformed is true when the list item was not a mapping.
	Malformed bool
}

// HasBlocked says whether an edge says why it cannot be walked.
func HasBlocked(e Edge) bool { return e.Blocked != nil && e.Blocked != false }

func nonNullText(v any) string {
	if v == nil {
		return ""
	}
	return miniyaml.Text(v)
}

func targetOrText(v any) string {
	if v == nil {
		return ""
	}
	if t, ok := WikilinkTarget(v); ok {
		return t
	}
	return miniyaml.Text(v)
}

func normalizeEdges(state *Object) []Edge {
	raw, _ := state.FM.Get("edges").([]any)
	out := make([]Edge, 0, len(raw))
	for index, e := range raw {
		edge, isMap := e.(*miniyaml.Map)
		if !isMap || edge == nil {
			edge = miniyaml.NewMap()
		}
		to, _ := WikilinkTarget(edge.Get("to"))
		out = append(out, Edge{
			From:        state.ID,
			File:        state.File,
			Index:       index,
			ID:          nonNullText(edge.Get("id")),
			HasID:       edge.Get("id") != nil,
			To:          to,
			ToRaw:       edge.Get("to"),
			Kind:        edge.Get("kind"),
			Component:   targetOrText(edge.Get("component")),
			Motion:      targetOrText(edge.Get("motion")),
			Locate:      edge.Get("locate"),
			Shot:        edge.Get("shot"),
			FromSection: nonNullText(edge.Get("from")),
			ToSection:   nonNullText(edge.Get("section")),

			HasFromSection: edge.Get("from") != nil,
			HasToSection:   edge.Get("section") != nil,
			When:           edge.Get("when"),
			Action:         edge.Get("action"),
			Trigger:        edge.Get("trigger"),
			How:            edge.Get("how"),
			Blocked:        edge.Get("blocked"),
			Malformed:      !isMap,
		})
	}
	return out
}

// Ref is a wikilink inside an object: in its frontmatter (Where is the field path) or its body.
type Ref struct {
	From   string
	File   string
	Where  string
	Target string
	Embed  bool
}

// Duplicate is an object id that more than one file claims.
type Duplicate struct {
	ID    string
	Files []string
}

// DeltaInfo records what a delta changed.
type DeltaInfo struct {
	Slug    string
	Added   []string
	Changed []string
	Removed []string
}

// Archive is a repository's design archive, read.
type Archive struct {
	Root       string
	Objects    map[string]*Object
	order      []string
	Edges      []Edge              // every state's edges, in file order
	Refs       []Ref               // every wikilink in an object
	Files      map[string][]string // basename -> paths in docs/ (md without extension, assets with it)
	Duplicates []Duplicate         // object ids that more than one file claims, in the order they were first claimed
	Index      *miniyaml.Map       // prod/index.md frontmatter (viewport / theme / locale / motion / workspaces); nil when none
	Problems   []Problem           // files that could not be read as objects
	Legacy     []string            // docs/design/ entries other than tmp, prod, index.md
	Delta      *DeltaInfo
}

// All are the objects in the order they were read (prod first, then a delta's additions).
func (a *Archive) All() []*Object {
	out := make([]*Object, 0, len(a.order))
	for _, id := range a.order {
		out = append(out, a.Objects[id])
	}
	return out
}

func (a *Archive) put(o *Object) {
	if _, ok := a.Objects[o.ID]; !ok {
		a.order = append(a.order, o.ID)
	}
	a.Objects[o.ID] = o
}

func (a *Archive) remove(id string) {
	delete(a.Objects, id)
	for i, x := range a.order {
		if x == id {
			a.order = append(a.order[:i], a.order[i+1:]...)
			break
		}
	}
}

// Options for Load.
type Options struct {
	// Delta is the spec slug whose `tmp/<slug>/delta/` is laid over `prod/`.
	Delta string
}

var specTickets = regexp.MustCompile(`(^|/)spec/[^/]+/tickets$`)

// Load reads a repository root (the directory that holds `docs/`).
func Load(root string, opts Options) (*Archive, error) {
	docs := filepath.Join(root, "docs")
	designDir := filepath.Join(docs, "design")
	prodDir := filepath.Join(designDir, "prod")
	a := &Archive{Root: root, Objects: map[string]*Object{}}
	var claimOrder []string
	claims := map[string][]string{}
	claim := func(id, file string) {
		if _, ok := claims[id]; !ok {
			claimOrder = append(claimOrder, id)
		}
		claims[id] = append(claims[id], file)
	}
	unclaim := func(id string) {
		delete(claims, id)
		for i, x := range claimOrder {
			if x == id {
				claimOrder = append(claimOrder[:i], claimOrder[i+1:]...)
				break
			}
		}
	}

	for _, abs := range objectFiles(prodDir) {
		o := readObject(root, abs, "prod", &a.Problems)
		if o == nil {
			continue
		}
		claim(o.ID, o.File)
		if _, ok := a.Objects[o.ID]; !ok {
			a.put(o)
		}
	}

	// every file under docs/ except the scratch area and the legacy per-spec design records
	if entries, err := os.ReadDir(designDir); err == nil {
		for _, e := range entries {
			if st, err := os.Stat(filepath.Join(designDir, e.Name())); err == nil && st.IsDir() && e.Name() != "tmp" && e.Name() != "prod" {
				a.Legacy = append(a.Legacy, e.Name())
			}
		}
		sort.Strings(a.Legacy)
	}
	skipDocs := func(p, name string) bool {
		rel, _ := filepath.Rel(designDir, p)
		rel = Posix(rel)
		if rel == "tmp" || strings.HasPrefix(rel, "tmp/") {
			return true
		}
		if contains(a.Legacy, strings.SplitN(rel, "/", 2)[0]) {
			return true
		}
		// ticket files repeat names across specs by design (wiki-conventions, section slug 与链接)
		relDocs, _ := filepath.Rel(docs, p)
		return specTickets.MatchString(Posix(relDocs)) && name == "tickets"
	}
	a.Files = map[string][]string{}
	for _, abs := range Walk(docs, skipDocs) {
		name := filepath.Base(abs)
		if name == "index.md" {
			continue
		}
		key := strings.TrimSuffix(name, ".md")
		rel, _ := filepath.Rel(root, abs)
		a.Files[key] = append(a.Files[key], Posix(rel))
	}

	if opts.Delta != "" {
		deltaDir := filepath.Join(designDir, "tmp", opts.Delta, "delta")
		if _, err := os.Stat(deltaDir); err != nil {
			rel, _ := filepath.Rel(root, deltaDir)
			return nil, fmt.Errorf("没有 %s：这个需求没有设计差异", Posix(rel))
		}
		info := &DeltaInfo{Slug: opts.Delta, Added: []string{}, Changed: []string{}, Removed: []string{}}
		a.Delta = info
		for _, abs := range objectFiles(deltaDir) {
			o := readObject(root, abs, "delta", &a.Problems)
			if o == nil {
				continue
			}
			prior, has := a.Objects[o.ID]
			if has {
				info.Changed = append(info.Changed, o.ID)
				swapFile(a.Files, o.ID, prior.File, o.File)
			} else {
				info.Added = append(info.Added, o.ID)
				a.Files[o.ID] = append(a.Files[o.ID], o.File)
			}
			if _, ok := claims[o.ID]; !ok {
				claimOrder = append(claimOrder, o.ID)
			}
			claims[o.ID] = []string{o.File}
			a.put(o)
		}
		sort.Strings(info.Added)
		sort.Strings(info.Changed)
		if b, err := os.ReadFile(filepath.Join(deltaDir, "removed.md")); err == nil {
			for _, id := range ParseRemoved(string(b)) {
				o, has := a.Objects[id]
				info.Removed = append(info.Removed, id)
				if !has {
					continue
				}
				a.remove(id)
				unclaim(id)
				swapFile(a.Files, id, o.File, "")
			}
		}
	}

	for _, id := range claimOrder {
		if fs := claims[id]; len(fs) > 1 {
			a.Duplicates = append(a.Duplicates, Duplicate{ID: id, Files: fs})
		}
	}

	for _, o := range a.All() {
		if o.Kind == "state" {
			a.Edges = append(a.Edges, normalizeEdges(o)...)
		}
		for _, r := range RefsIn(o.FM, "") {
			a.Refs = append(a.Refs, Ref{From: o.ID, File: o.File, Where: r.Path, Target: r.Target})
		}
		for _, l := range WikilinksIn(o.Body) {
			a.Refs = append(a.Refs, Ref{From: o.ID, File: o.File, Where: fmt.Sprintf("正文第 %d 行", l.Line), Target: l.Target, Embed: strings.HasPrefix(l.Raw, "!")})
		}
	}

	if b, err := os.ReadFile(filepath.Join(prodDir, "index.md")); err == nil {
		a.Index = miniyaml.SplitFrontmatter(string(b)).FM
	}
	return a, nil
}

func swapFile(files map[string][]string, id, oldFile, newFile string) {
	var rest []string
	for _, f := range files[id] {
		if f != oldFile {
			rest = append(rest, f)
		}
	}
	if newFile != "" {
		rest = append(rest, newFile)
	}
	if len(rest) > 0 {
		files[id] = rest
	} else {
		delete(files, id)
	}
}

// ---------- sections of a long entry state ----------

// SectionType is one of the closed set of section types, shared by every project (the design-archive skill's
// writing reference, 分段 `sections`). A section id is `<type>` or `<type>-<qualifier>`; Meaning is the one-line
// meaning that decides which type a block of the page is. Growing the set means editing this table, its test and
// the reference.
type SectionType struct{ Name, Meaning string }

// SectionTypes in the order the reference lists them.
var SectionTypes = []SectionType{
	{"header", "页面顶栏：站点标识、主导航、顶部的登录与行动按钮"},
	{"hero", "首屏主视觉：一句主张加一个主行动"},
	{"social-proof", "多少人在用：用户数、客户 logo 墙、评分"},
	{"problem", "用户的痛点：为什么现有做法不够"},
	{"feature", "一项功能的展开说明"},
	{"feature-grid", "多项功能并排的宫格或列表"},
	{"demo", "产品的实际画面、可操作的示例或演示"},
	{"how-it-works", "分步骤说明怎么用"},
	{"value-prop", "价值主张：好处汇总，不绑具体功能"},
	{"trust", "为什么信你：安全、隐私、资质、保证"},
	{"testimonials", "用户的原话与案例"},
	{"comparison", "与别的做法或套餐的对比"},
	{"pricing", "价格与套餐"},
	{"stats", "一组数字"},
	{"faq", "常见问题"},
	{"related-content", "相关文章、延伸阅读"},
	{"final-cta", "页尾前最后一次行动号召"},
	{"footer", "页脚：站点链接、法务、版权"},
	{"content", "兜底：以上都不是的正文（多半说明该归进某一类）"},
}

var kebab = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)

// ParsedSectionID is a section id split into type and qualifier.
type ParsedSectionID struct {
	Type      string
	Qualifier string // "" when absent
	// Error is "format" (not kebab-case) or "type" (kebab-case, but no known type in front); "" when fine.
	Error string
}

// ParseSectionID splits a section id. The type is the longest entry of SectionTypes that is the whole id or its
// prefix before a `-`, so `feature-grid-pricing` is the type `feature-grid` with qualifier `pricing`.
func ParseSectionID(id string) ParsedSectionID {
	if !kebab.MatchString(id) {
		return ParsedSectionID{Error: "format"}
	}
	best := ""
	for _, t := range SectionTypes {
		if (id == t.Name || strings.HasPrefix(id, t.Name+"-")) && len(t.Name) > len(best) {
			best = t.Name
		}
	}
	if best == "" {
		return ParsedSectionID{Error: "type"}
	}
	if id == best {
		return ParsedSectionID{Type: best}
	}
	return ParsedSectionID{Type: best, Qualifier: id[len(best)+1:]}
}

// SectionRef is `<page>#<section>` written as a plain string.
type SectionRef struct{ Page, ID string }

var sectionRefRe = regexp.MustCompile(`^([^#\s\[\]|]+)#([^#\s\[\]|]+)$`)

// ParseSectionRef reads `<page>#<section>`; false for anything else (wikilinks included).
func ParseSectionRef(v any) (SectionRef, bool) {
	s, ok := v.(string)
	if !ok {
		return SectionRef{}, false
	}
	m := sectionRefRe.FindStringSubmatch(s)
	if m == nil {
		return SectionRef{}, false
	}
	return SectionRef{Page: m[1], ID: m[2]}, true
}

// SectionBy is how a section is found on the page.
type SectionBy struct {
	Kind     string // heading / landmark / position
	Role     string // heading and landmark
	Name     string // heading
	Position int    // position
}

// SectionLocate reads a section's `locate`; nil for any other shape.
func SectionLocate(locate any) *SectionBy {
	m, ok := miniyaml.AsMap(locate)
	if !ok {
		return nil
	}
	keys := m.Keys()
	sort.Strings(keys)
	joined := strings.Join(keys, ",")
	role, _ := m.Get("role").(string)
	switch joined {
	case "name,role":
		if name, ok := m.Get("name").(string); ok && role == "heading" && strings.TrimSpace(name) != "" {
			return &SectionBy{Kind: "heading", Role: "heading", Name: name}
		}
	case "role":
		if role == "banner" || role == "contentinfo" {
			return &SectionBy{Kind: "landmark", Role: role}
		}
	case "position":
		if p := m.Get("position"); miniyaml.IsInteger(p) && p.(float64) >= 1 {
			return &SectionBy{Kind: "position", Position: int(p.(float64))}
		}
	}
	return nil
}

// StateSection is one entry of a state's `sections`, normalised.
type StateSection struct {
	Index     int
	ID        string // "" when absent
	HasID     bool
	Type      string
	Qualifier string
	IDError   string // "format" / "type" / ""
	Locate    any
	By        *SectionBy
	// ScrollDriven is the declared value as written; ScrollDrivenSet says whether it was written at all.
	ScrollDriven    any
	ScrollDrivenSet bool
	State           string
}

// SectionsOfState are the `sections` a state declares, normalised and in page order.
func SectionsOfState(state *Object) []StateSection {
	raw, ok := state.FM.Get("sections").([]any)
	if !ok {
		return nil
	}
	out := make([]StateSection, 0, len(raw))
	for index, item := range raw {
		it, ok := item.(*miniyaml.Map)
		if !ok || it == nil {
			it = miniyaml.NewMap()
		}
		s := StateSection{Index: index, Locate: it.Get("locate"), By: SectionLocate(it.Get("locate")), ScrollDriven: it.Get("scrollDriven"), ScrollDrivenSet: it.Has("scrollDriven"), State: state.ID}
		if idv := it.Get("id"); idv != nil {
			s.HasID = true
			s.ID = miniyaml.Text(idv)
			p := ParseSectionID(s.ID)
			s.Type, s.Qualifier, s.IDError = p.Type, p.Qualifier, p.Error
		} else {
			s.IDError = "format"
		}
		out = append(out, s)
	}
	return out
}

// SectionEntries are the entry states of a page that declare `sections`, id order.
func SectionEntries(a *Archive, pageID string) []*Object {
	var out []*Object
	for _, s := range StatesOfPage(a, pageID) {
		if IsEntry(s) && s.FM.Has("sections") {
			out = append(out, s)
		}
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out
}

// SectionsOfPage are the sections of a page (those its entry state declares); empty for a page that has none.
func SectionsOfPage(a *Archive, pageID string) []StateSection {
	entries := SectionEntries(a, pageID)
	if len(entries) == 0 {
		return nil
	}
	return SectionsOfState(entries[0])
}

// ---------- reading the graph ----------

// ObjectsOfKind are the objects of one kind, in the order they were read.
func ObjectsOfKind(a *Archive, kind string) []*Object {
	var out []*Object
	for _, o := range a.All() {
		if o.Kind == kind {
			out = append(out, o)
		}
	}
	return out
}

// StatesOfPage are the states that belong to a page.
func StatesOfPage(a *Archive, pageID string) []*Object {
	var out []*Object
	for _, s := range ObjectsOfKind(a, "state") {
		if PageOfState(s) == pageID {
			out = append(out, s)
		}
	}
	return out
}

// OutgoingEdges are the edges that leave a state.
func OutgoingEdges(a *Archive, stateID string) []Edge {
	var out []Edge
	for _, e := range a.Edges {
		if e.From == stateID {
			out = append(out, e)
		}
	}
	return out
}

// IncomingEdges are the edges that arrive at a state.
func IncomingEdges(a *Archive, stateID string) []Edge {
	var out []Edge
	for _, e := range a.Edges {
		if e.To == stateID {
			out = append(out, e)
		}
	}
	return out
}

// IsEntry says whether a state is an entry state (it has an `entry` mapping).
func IsEntry(state *Object) bool {
	m, ok := state.FM.Get("entry").(*miniyaml.Map)
	return ok && m != nil
}

// Resolves says whether a wikilink target (a bare id, or an asset file name) resolves inside docs/.
func Resolves(a *Archive, target string) bool {
	_, ok := a.Files[target]
	return ok
}

// UsedBy says which pages use each component and motion: the value `usedBy` has to hold. A page uses a
// component when one of its regions names it, or one of its states lists it in `components`, or one of its edges
// goes through it; a motion likewise through a state's `motions` or an edge's `motion`. Pages are ids, sorted.
type UsedBy struct {
	Components map[string][]string
	Motions    map[string][]string
}

func asList(v any) []any {
	switch x := v.(type) {
	case nil:
		return nil
	case []any:
		return x
	}
	return []any{v}
}

// ComputeUsedBy works out UsedBy for the archive.
func ComputeUsedBy(a *Archive) UsedBy {
	components := map[string]map[string]bool{}
	motions := map[string]map[string]bool{}
	add := func(m map[string]map[string]bool, key, page string) {
		if key == "" || page == "" {
			return
		}
		if m[key] == nil {
			m[key] = map[string]bool{}
		}
		m[key][page] = true
	}
	for _, page := range ObjectsOfKind(a, "page") {
		for _, region := range asList(page.FM.Get("regions")) {
			rm, _ := region.(*miniyaml.Map)
			t, _ := WikilinkTarget(rm.Get("component"))
			add(components, t, page.ID)
		}
	}
	for _, s := range ObjectsOfKind(a, "state") {
		page := PageOfState(s)
		for _, c := range asList(s.FM.Get("components")) {
			t, _ := WikilinkTarget(c)
			add(components, t, page)
		}
		for _, m := range asList(s.FM.Get("motions")) {
			t, _ := WikilinkTarget(m)
			add(motions, t, page)
		}
	}
	for _, e := range a.Edges {
		page := PageOfState(a.Objects[e.From])
		add(components, e.Component, page)
		add(motions, e.Motion, page)
	}
	sorted := func(m map[string]map[string]bool) map[string][]string {
		out := map[string][]string{}
		for k, v := range m {
			for p := range v {
				out[k] = append(out[k], p)
			}
			sort.Strings(out[k])
		}
		return out
	}
	return UsedBy{Components: sorted(components), Motions: sorted(motions)}
}
