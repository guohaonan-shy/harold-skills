// Package write is the archive writer — the only way `docs/design/prod/` is written.
//
// A requirement's design lives in `docs/design/tmp/<spec-slug>/` of the project directory while it is in flight
// (home commits only the files a skill lists, so it never lands in git by accident). Before the PR merges, its
// `delta/` is folded into `prod/`: this package does that, in one call, and refuses to write anything unless the
// result would pass the archive's own validation.
//
//  1. validate the archive with `delta/` laid over it (usedBy consistency is skipped: it has not been
//     regenerated yet, so a new page that uses an existing component is always "inconsistent" here)
//  2. copy `delta/` over `prod/` at the same paths (assets included); drop what `removed.md` lists
//  3. regenerate every component's and motion's `usedBy`, and `prod/index.md` (four tables built from
//     frontmatter; the index's own viewport / theme / locale settings are kept)
//  4. move the requirement's interaction figures into `prod/pages/<page>/assets/flows/` and point the
//     spec's image links at the new place
//  5. look at the root's `.gitattributes` (Git LFS for png / gif / webm under prod assets); say what is
//     missing, change nothing
//  6. empty `tmp/<spec-slug>/`
//
// All of 2-4 is first built as a plan and applied to a throw-away copy of `docs/` (text files real, binaries as
// empty placeholders); the copy is validated in full. Only when that passes is the plan applied to the
// repository. So a failure at any point leaves `prod/`, the spec and `tmp/` untouched, and a dry run runs exactly
// this far and stops.
//
// Which images are "interaction figures": the pictures directly inside a `flows/` directory under `canvas/`, plus
// any picture the spec links that sits under `canvas/`. A figure belongs to the page of the state whose id its file
// name contains (the longest such id); one that names no state goes to the first page the delta touches (else the
// page of the first state it touches) and the output says so.
package write

import (
	"bytes"
	"fmt"
	"io"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"unicode/utf8"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/design/archive"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/design/check"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/frontmatter"
)

// Where the archive and the requirements' scratch area live.
const (
	Prod = "docs/design/prod"
	Tmp  = "docs/design/tmp"
)

var (
	figureRe = regexp.MustCompile(`(?i)\.(png|gif|webp|jpe?g|svg)$`)
	lfsExts  = []string{"png", "gif", "webm"}
	slugRe   = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]*$`)
)

func posix(p string) string { return filepath.ToSlash(p) }

func asList(v any) []any {
	switch x := v.(type) {
	case nil:
		return nil
	case []any:
		return x
	}
	return []any{v}
}

// UsageError is a request that cannot be carried out as asked: exit code 2, not "refused".
type UsageError struct{ Msg string }

func (e *UsageError) Error() string { return e.Msg }

// ---------- usedBy: edit one frontmatter field in place ----------

var (
	lineSplit    = regexp.MustCompile(`\r?\n`)
	closeFence   = regexp.MustCompile(`^---[ \t]*$`)
	usedByLine   = regexp.MustCompile(`^usedBy\s*:`)
	usedByPrefix = regexp.MustCompile(`^usedBy\s*:\s*`)
	trailingCmt  = regexp.MustCompile(`\s+#.*$`)
	quotedPart   = regexp.MustCompile(`"[^"]*"|'[^']*'`)
	blockItem    = regexp.MustCompile(`^(\s+\S|-\s)`)
)

// SetUsedBy sets `usedBy` in a file's frontmatter to the given pages, leaving every other byte alone. The field is
// written as a one-line flow list of quoted wikilinks; an existing value in any YAML shape (flow on one or
// several lines, block list, empty) is replaced; a missing field is appended.
func SetUsedBy(text string, pages []string) string {
	eol := "\n"
	if strings.Contains(text, "\r\n") {
		eol = "\r\n"
	}
	lines := lineSplit.Split(text, -1)
	if lines[0] != "---" {
		return text
	}
	closeAt := -1
	for i := 1; i < len(lines); i++ {
		if closeFence.MatchString(lines[i]) {
			closeAt = i
			break
		}
	}
	if closeAt < 0 {
		return text
	}
	quoted := make([]string, len(pages))
	for i, p := range pages {
		quoted[i] = `"[[` + p + `]]"`
	}
	next := "usedBy: [" + strings.Join(quoted, ", ") + "]"
	at := -1
	for i := 1; i < closeAt; i++ {
		if usedByLine.MatchString(lines[i]) {
			at = i
			break
		}
	}
	if at < 0 {
		lines = append(lines[:closeAt], append([]string{next}, lines[closeAt:]...)...)
		return strings.Join(lines, eol)
	}
	value := trailingCmt.ReplaceAllString(usedByPrefix.ReplaceAllString(lines[at], ""), "")
	end := at
	if strings.HasPrefix(value, "[") || strings.HasPrefix(value, "{") {
		depth := 0
		for i := at; i < closeAt; i++ {
			code := lines[i]
			if i == at {
				code = value
			}
			code = quotedPart.ReplaceAllString(code, "")
			for _, c := range code {
				switch c {
				case '[', '{':
					depth++
				case ']', '}':
					depth--
				}
			}
			end = i
			if depth <= 0 {
				break
			}
		}
	} else if value == "" {
		for end+1 < closeAt && blockItem.MatchString(lines[end+1]) {
			end++
		}
	}
	rest := append([]string{}, lines[end+1:]...)
	lines = append(append(lines[:at], next), rest...)
	return strings.Join(lines, eol)
}

// ---------- prod/index.md ----------

var (
	pipeRe     = regexp.MustCompile(`\|`)
	newlineRe  = regexp.MustCompile(`\s*\n\s*`)
	headFrontm = regexp.MustCompile(`^---\r?\n(?s:.*?)\r?\n---[ \t]*(?:\r?\n|$)`)
)

func cell(v any) string {
	s := ""
	if v != nil {
		s = frontmatter.Text(v)
	}
	s = pipeRe.ReplaceAllString(s, `\|`)
	s = newlineRe.ReplaceAllString(s, " ")
	return strings.TrimSpace(s)
}

func link(id string) string { return "[[" + id + "]]" }

func table(head []string, rows [][]string) string {
	if len(rows) == 0 {
		return "无\n"
	}
	seps := make([]string, len(head))
	for i := range head {
		seps[i] = "---"
	}
	lines := []string{"| " + strings.Join(head, " | ") + " |", "|" + strings.Join(seps, "|") + "|"}
	for _, r := range rows {
		cells := make([]string, len(r))
		for i, c := range r {
			cells[i] = c
		}
		lines = append(lines, "| "+strings.Join(cells, " | ")+" |")
	}
	return strings.Join(lines, "\n") + "\n"
}

func sortedObjects(a *archive.Archive, kind string) []*archive.Object {
	objs := archive.ObjectsOfKind(a, kind)
	sort.SliceStable(objs, func(i, j int) bool { return objs[i].ID < objs[j].ID })
	return objs
}

func links(ids []string) string {
	ls := make([]string, len(ids))
	for i, id := range ids {
		ls[i] = link(id)
	}
	return strings.Join(ls, "、")
}

// RenderIndex writes the four tables of `prod/index.md`, built from the archive's frontmatter, under the existing
// frontmatter (kept verbatim — it holds the project's main viewport / theme / locale). existing is nil when there
// is no index yet.
func RenderIndex(a *archive.Archive, existing *string) string {
	head := "---\ntype: design-index\ntags: [design]\nsummary: 设计档案索引\n---\n"
	if existing != nil {
		if m := headFrontm.FindString(*existing); m != "" {
			head = strings.TrimRight(strings.ReplaceAll(m, "\r\n", "\n"), "\n") + "\n"
		}
	}
	used := archive.ComputeUsedBy(a)

	var pages, components, motions, journeys [][]string
	for _, p := range sortedObjects(a, "page") {
		var ids []string
		for _, s := range archive.StatesOfPage(a, p.ID) {
			ids = append(ids, s.ID)
		}
		sort.Strings(ids)
		pages = append(pages, []string{link(p.ID), links(ids), cell(p.FM.Get("summary"))})
	}
	for _, o := range sortedObjects(a, "component") {
		components = append(components, []string{link(o.ID), links(used.Components[o.ID]), cell(o.FM.Get("summary"))})
	}
	for _, o := range sortedObjects(a, "motion") {
		motions = append(motions, []string{link(o.ID), links(used.Motions[o.ID]), cell(o.FM.Get("summary"))})
	}
	for _, j := range sortedObjects(a, "journey") {
		touched := map[string]bool{}
		for _, item := range asList(j.FM.Get("path")) {
			var ref any = item
			if m, ok := item.(*frontmatter.Map); ok {
				ref = m.Get("state")
			} else if _, ok := item.([]any); ok {
				ref = nil
			}
			t, ok := archive.WikilinkTarget(ref)
			if !ok {
				continue
			}
			if s := a.Objects[t]; s != nil && s.Kind == "state" {
				if page := archive.PageOfState(s); page != "" {
					touched[page] = true
				}
			}
		}
		var ps []string
		for p := range touched {
			ps = append(ps, p)
		}
		sort.Strings(ps)
		journeys = append(journeys, []string{link(j.ID), cell(j.FM.Get("intent")), links(ps)})
	}

	return strings.Join([]string{
		head,
		"# 设计档案\n",
		"> 本文件由归档脚本生成，表体取自各对象的 frontmatter，不手工维护。",
		"",
		"## 页面\n",
		table([]string{"页面", "状态", "说明"}, pages),
		"## 组件\n",
		table([]string{"组件", "用到它的页面", "说明"}, components),
		"## 动效\n",
		table([]string{"动效", "用到它的页面", "说明"}, motions),
		"## 用户路径\n",
		table([]string{"用户路径", "意图", "途经页面"}, journeys),
	}, "\n")
}

// ---------- LFS ----------

// attrMatches says whether one .gitattributes pattern matches a repo-relative path.
func attrMatches(pattern, p string) bool {
	anchored := strings.Contains(pattern, "/") && !strings.HasSuffix(pattern, "/")
	pattern = strings.TrimPrefix(pattern, "/")
	rs := []rune(pattern)
	var re strings.Builder
	for i := 0; i < len(rs); i++ {
		c := rs[i]
		switch {
		case c == '*' && i+1 < len(rs) && rs[i+1] == '*':
			if i+2 < len(rs) && rs[i+2] == '/' {
				re.WriteString("(?:.*/)?")
				i += 2
			} else {
				re.WriteString(".*")
				i++
			}
		case c == '*':
			re.WriteString("[^/]*")
		case c == '?':
			re.WriteString("[^/]")
		default:
			re.WriteString(regexp.QuoteMeta(string(c)))
		}
	}
	expr := "(^|/)" + re.String() + "$"
	if anchored {
		expr = "^" + re.String() + "$"
	}
	ok, err := regexp.MatchString("(?s)"+expr, p)
	return err == nil && ok
}

var filterAttr = regexp.MustCompile(`^-?!?filter(=|$)`)

// LFSCovers says whether `.gitattributes` text routes a path through Git LFS (the last matching line that sets
// `filter` wins).
func LFSCovers(attributes, p string) bool {
	covered := false
	for _, raw := range strings.Split(attributes, "\n") {
		line := strings.TrimSpace(raw)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		fields := strings.Fields(line)
		pattern, attrs := fields[0], fields[1:]
		hasFilter := false
		for _, a := range attrs {
			if filterAttr.MatchString(a) {
				hasFilter = true
			}
		}
		if !hasFilter || !attrMatches(pattern, p) {
			continue
		}
		covered = false
		for _, a := range attrs {
			if a == "filter=lfs" {
				covered = true
			}
		}
	}
	return covered
}

// Hint is something the archive noticed and did not change.
type Hint struct{ Kind, Message string }

func repoHints(root string) []Hint {
	hints := []Hint{}
	attrs := ""
	if b, err := os.ReadFile(filepath.Join(root, ".gitattributes")); err == nil {
		attrs = string(b)
	}
	var missing []string
	for _, ext := range lfsExts {
		if !LFSCovers(attrs, Prod+"/pages/x/assets/a."+ext) {
			missing = append(missing, ext)
		}
	}
	if len(missing) > 0 {
		var lines []string
		for _, ext := range missing {
			lines = append(lines, fmt.Sprintf("  %s/**/assets/**/*.%s filter=lfs diff=lfs merge=lfs -text", Prod, ext))
		}
		hints = append(hints, Hint{Kind: "lfs", Message: fmt.Sprintf(".gitattributes 还没有用 Git LFS 管 %s/**/assets/ 下的 %s；要加这几行（脚本不代改）：\n%s", Prod, strings.Join(missing, " / "), strings.Join(lines, "\n"))})
	}
	return hints
}

// ---------- the plan ----------

// Copy is a file the plan copies: From is an absolute path, To a repo path.
type Copy struct{ From, To string }

// FileWrite is a file the plan writes: a repo path and its text.
type FileWrite struct{ Path, Text string }

// Plan is everything the archive would do.
type Plan struct {
	Tmp     string
	Copies  []Copy
	Writes  []FileWrite
	Deletes []string
}

func (p *Plan) setWrite(path, text string) {
	for i := range p.Writes {
		if p.Writes[i].Path == path {
			p.Writes[i].Text = text
			return
		}
	}
	p.Writes = append(p.Writes, FileWrite{path, text})
}

func (p *Plan) getWrite(path string) (string, bool) {
	for _, w := range p.Writes {
		if w.Path == path {
			return w.Text, true
		}
	}
	return "", false
}

// Figure is an interaction figure moved to the page it belongs to.
type Figure struct{ From, To, Page, Reason string }

// SpecLink is a link in the spec that was rewritten.
type SpecLink struct{ File, From, To string }

// Summary is what the archive did (or, in a dry run, would do).
type Summary struct {
	Slug      string
	Added     []string
	Changed   []string
	Removed   []string
	UsedBy    []string
	Figures   []Figure
	SpecLinks []SpecLink
}

// Result is the outcome of archiving a requirement.
type Result struct {
	OK         bool
	DryRun     bool
	Stage      string // when refused: 校验 / 归档 / 归档后复核
	Violations []check.Violation
	Errors     []string
	Summary    *Summary
	Hints      []Hint
}

type planned struct {
	res  Result
	plan *Plan
}

func byLenDesc(a, b string) bool {
	la, lb := utf8.RuneCountInString(a), utf8.RuneCountInString(b)
	if la != lb {
		return la > lb
	}
	return a < b
}

func fileExists(p string) bool {
	_, err := os.Stat(p)
	return err == nil
}

var extRe = regexp.MustCompile(`\.[^.]+$`)

func sameSet(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for _, x := range a {
		found := false
		for _, y := range b {
			if x == y {
				found = true
				break
			}
		}
		if !found {
			return false
		}
	}
	return true
}

// planArchive works out everything the archive would do, without touching the repository.
func planArchive(root, slug string) (*planned, error) {
	if !slugRe.MatchString(slug) {
		return nil, &UsageError{fmt.Sprintf("spec 名「%s」不合法", slug)}
	}
	tmpRel := Tmp + "/" + slug
	tmpDir := filepath.Join(root, filepath.FromSlash(tmpRel))
	if !fileExists(tmpDir) {
		return nil, &UsageError{fmt.Sprintf("没有 %s/：这个需求没有可归档的内容", tmpRel)}
	}
	deltaDir := filepath.Join(tmpDir, "delta")
	hasDelta := fileExists(deltaDir)

	// 1 — validate (usedBy is regenerated below, so it is not judged yet)
	opts := check.Options{UsedBy: false}
	if hasDelta {
		opts.Delta = slug
	}
	checked, err := check.Run(root, opts)
	if err != nil {
		return nil, err
	}
	if len(checked.Violations) > 0 {
		return &planned{res: Result{Stage: "校验", Violations: checked.Violations}}, nil
	}
	a := checked.Archive
	delta := a.Delta
	if delta == nil {
		delta = &archive.DeltaInfo{Added: []string{}, Changed: []string{}, Removed: []string{}}
	}
	prod, err := archive.Load(root, archive.Options{})
	if err != nil {
		return nil, err
	}

	plan := &Plan{Tmp: tmpRel}
	deletes := map[string]bool{}
	var errs []string

	// 2 — delta over prod, removed.md out
	removed := map[string]bool{}
	for _, id := range delta.Removed {
		removed[id] = true
	}
	if hasDelta {
		for _, abs := range archive.Walk(deltaDir, nil) {
			rel, _ := filepath.Rel(deltaDir, abs)
			rel = posix(rel)
			if rel == "removed.md" || rel == "index.md" {
				continue
			}
			if strings.HasSuffix(rel, ".md") && removed[strings.TrimSuffix(path.Base(rel), ".md")] {
				continue
			}
			plan.Copies = append(plan.Copies, Copy{From: abs, To: Prod + "/" + rel})
		}
	}
	removedIDs := make([]string, 0, len(removed))
	for id := range removed {
		removedIDs = append(removedIDs, id)
	}
	sort.Strings(removedIDs)
	for _, id := range removedIDs {
		o := prod.Objects[id]
		if o == nil {
			continue
		}
		if o.Kind == "component" && path.Base(path.Dir(o.File)) == id {
			deletes[path.Dir(o.File)] = true
		} else {
			deletes[o.File] = true
		}
	}
	// a page / component folder left without any object file goes entirely, assets with it
	deletedFiles := map[string]bool{}
	for p := range deletes {
		deletedFiles[p] = true
	}
	dirs := map[string]bool{}
	for p := range deletes {
		if !deletes[path.Dir(p)] {
			dirs[path.Dir(p)] = true
		}
	}
	for dir := range dirs {
		if !strings.HasPrefix(dir, Prod+"/") || len(strings.Split(dir[len(Prod)+1:], "/")) != 2 || !fileExists(filepath.Join(root, filepath.FromSlash(dir))) {
			continue
		}
		entries, _ := os.ReadDir(filepath.Join(root, filepath.FromSlash(dir)))
		left := 0
		for _, e := range entries {
			if strings.HasSuffix(e.Name(), ".md") && !deletedFiles[dir+"/"+e.Name()] {
				left++
			}
		}
		incoming := false
		for _, c := range plan.Copies {
			if path.Dir(c.To) == dir && strings.HasSuffix(c.To, ".md") {
				incoming = true
			}
		}
		if left == 0 && !incoming {
			deletes[dir] = true
		}
	}

	// 3 — usedBy on every component and motion, then the index
	used := archive.ComputeUsedBy(a)
	usedByUpdated := []string{}
	all := a.All()
	sort.SliceStable(all, func(i, j int) bool { return all[i].ID < all[j].ID })
	for _, o := range all {
		if o.Kind != "component" && o.Kind != "motion" {
			continue
		}
		var want []string
		if o.Kind == "component" {
			want = used.Components[o.ID]
		} else {
			want = used.Motions[o.ID]
		}
		_, isList := o.FM.Get("usedBy").([]any)
		var have []string
		allTargets := true
		for _, x := range asList(o.FM.Get("usedBy")) {
			t, ok := archive.WikilinkTarget(x)
			if !ok || t == "" {
				allTargets = false
			}
			have = append(have, t)
		}
		if isList && allTargets && sameSet(have, want) {
			continue
		}
		target := o.File
		if o.Source == "delta" {
			target = strings.Replace(o.File, tmpRel+"/delta/", Prod+"/", 1)
		}
		b, _ := os.ReadFile(filepath.Join(root, filepath.FromSlash(o.File)))
		plan.setWrite(target, SetUsedBy(string(b), want))
		usedByUpdated = append(usedByUpdated, o.ID)
	}
	var existingIndex *string
	if b, err := os.ReadFile(filepath.Join(root, filepath.FromSlash(Prod), "index.md")); err == nil {
		s := string(b)
		existingIndex = &s
	}
	plan.setWrite(Prod+"/index.md", RenderIndex(a, existingIndex))

	// 4 — interaction figures
	specRel := "docs/spec/" + slug + "/" + slug + ".md"
	specDir := path.Dir(specRel)
	var specText *string
	if b, err := os.ReadFile(filepath.Join(root, filepath.FromSlash(specRel))); err == nil {
		s := string(b)
		specText = &s
	}
	canvasRel := tmpRel + "/canvas/"
	figures := map[string]bool{}
	if canvasDir := filepath.Join(tmpDir, "canvas"); fileExists(canvasDir) {
		for _, abs := range archive.Walk(canvasDir, nil) {
			if figureRe.MatchString(abs) && filepath.Base(filepath.Dir(abs)) == "flows" {
				rel, _ := filepath.Rel(root, abs)
				figures[posix(rel)] = true
			}
		}
	}
	if specText != nil {
		for _, lt := range linkTargets(*specText) {
			for _, c := range candidates(specDir, lt.Target) {
				if strings.HasPrefix(c.path, canvasRel) && figureRe.MatchString(c.path) && fileExists(filepath.Join(root, filepath.FromSlash(c.path))) {
					figures[c.path] = true
				}
			}
		}
	}
	var stateIDs []string
	for _, s := range archive.ObjectsOfKind(a, "state") {
		stateIDs = append(stateIDs, s.ID)
	}
	sort.SliceStable(stateIDs, func(i, j int) bool { return byLenDesc(stateIDs[i], stateIDs[j]) })
	deltaIDs := append(append([]string{}, delta.Added...), delta.Changed...)
	sort.Strings(deltaIDs)
	kindOf := func(id string) string {
		if o := a.Objects[id]; o != nil {
			return o.Kind
		}
		return ""
	}
	fallback := ""
	for _, id := range deltaIDs {
		if kindOf(id) == "page" {
			fallback = id
			break
		}
	}
	if fallback == "" {
		for _, id := range deltaIDs {
			if kindOf(id) == "state" {
				fallback = archive.PageOfState(a.Objects[id])
				break
			}
		}
	}
	moved := map[string]string{}
	placed := []Figure{}
	taken := map[string]string{}
	var figureList []string
	for f := range figures {
		figureList = append(figureList, f)
	}
	sort.Strings(figureList)
	for _, from := range figureList {
		name := path.Base(from)
		stem := extRe.ReplaceAllString(name, "")
		state := ""
		for _, id := range stateIDs {
			if strings.Contains(stem, id) {
				state = id
				break
			}
		}
		page := fallback
		if state != "" {
			page = archive.PageOfState(a.Objects[state])
		}
		if page == "" || a.Objects[page] == nil {
			errs = append(errs, fmt.Sprintf("交互图 %s 对应不上任何页面，delta 里也没有页面或状态可以放它", from))
			continue
		}
		to := Prod + "/pages/" + page + "/assets/flows/" + name
		if prev, ok := taken[to]; ok {
			errs = append(errs, fmt.Sprintf("交互图 %s 与 %s 同名，归档后会落到同一个位置 %s；改其中一个的文件名", from, prev, to))
		} else {
			taken[to] = from
		}
		toAbs := filepath.Join(root, filepath.FromSlash(to))
		if fileExists(toAbs) && !sameBytes(filepath.Join(root, filepath.FromSlash(from)), toAbs) {
			errs = append(errs, fmt.Sprintf("%s 已经存在且内容不同：%s 会盖掉它；改交互图的文件名再归档", to, from))
		}
		moved[from] = to
		plan.Copies = append(plan.Copies, Copy{From: filepath.Join(root, filepath.FromSlash(from)), To: to})
		reason := fmt.Sprintf("文件名里没有状态 id，放进 delta 里的第一个页面 %s", page)
		if state != "" {
			reason = "对应状态 " + state
		}
		placed = append(placed, Figure{From: from, To: to, Page: page, Reason: reason})
	}
	if len(errs) > 0 {
		return &planned{res: Result{Stage: "归档", Errors: errs}}, nil
	}

	specLinks := []SpecLink{}
	if specText != nil && len(moved) > 0 {
		text, changes := RewriteLinks(*specText, specDir, moved)
		for _, c := range changes {
			specLinks = append(specLinks, SpecLink{File: specRel, From: c.From, To: c.To})
		}
		if len(changes) > 0 {
			plan.setWrite(specRel, text)
		}
	}
	// 5 — repo hints
	hints := repoHints(root)
	if specText != nil {
		// links into the scratch area that are not archived would dangle once tmp/ is emptied
		after := *specText
		if w, ok := plan.getWrite(specRel); ok {
			after = w
		}
		var stray []string
		count := 0
		for _, lt := range linkTargets(after) {
			for _, c := range candidates(specDir, lt.Target) {
				if strings.HasPrefix(c.path, tmpRel+"/") {
					count++
					dup := false
					for _, s := range stray {
						if s == lt.Target {
							dup = true
						}
					}
					if !dup {
						stray = append(stray, lt.Target)
					}
					break
				}
			}
		}
		if count > 0 {
			hints = append(hints, Hint{Kind: "dangling", Message: fmt.Sprintf("spec 里还有 %d 处链接指向 %s/ 里不会被归档的文件，清空后会断：%s", count, tmpRel, strings.Join(stray, "、"))})
		}
	}
	missingSetting := a.Index == nil
	if !missingSetting {
		for _, k := range []string{"viewport", "theme", "locale"} {
			if !frontmatter.Truthy(a.Index.Get(k)) {
				missingSetting = true
			}
		}
	}
	if missingSetting {
		hints = append(hints, Hint{Kind: "index", Message: fmt.Sprintf("%s/index.md 的 frontmatter 还没有定主视口 / 主题 / 语言（viewport / theme / locale）；项目定一次，截图按它拍", Prod)})
	}

	for p := range deletes {
		plan.Deletes = append(plan.Deletes, p)
	}
	sort.Strings(plan.Deletes)
	return &planned{
		plan: plan,
		res: Result{OK: true, Hints: hints, Summary: &Summary{
			Slug:      slug,
			Added:     append([]string{}, delta.Added...),
			Changed:   append([]string{}, delta.Changed...),
			Removed:   append([]string{}, delta.Removed...),
			UsedBy:    usedByUpdated,
			Figures:   placed,
			SpecLinks: specLinks,
		}},
	}, nil
}

func sameBytes(a, b string) bool {
	x, err1 := os.ReadFile(a)
	y, err2 := os.ReadFile(b)
	return err1 == nil && err2 == nil && bytes.Equal(x, y)
}

// ---------- applying a plan ----------

func copyFile(from, to string) error {
	in, err := os.Open(from)
	if err != nil {
		return err
	}
	defer in.Close()
	mode := os.FileMode(0o644)
	if st, err := in.Stat(); err == nil {
		mode = st.Mode().Perm()
	}
	out, err := os.OpenFile(to, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, mode)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		return err
	}
	return out.Close()
}

// ApplyPlan applies a plan to a repository root. With placeholder, binary files are created empty (the throw-away
// copy used for the full re-validation only needs their names).
func ApplyPlan(root string, plan *Plan, placeholder bool) error {
	abs := func(rel string) string { return filepath.Join(root, filepath.FromSlash(rel)) }
	for _, rel := range plan.Deletes {
		if err := os.RemoveAll(abs(rel)); err != nil {
			return err
		}
	}
	for _, c := range plan.Copies {
		if err := os.MkdirAll(filepath.Dir(abs(c.To)), 0o755); err != nil {
			return err
		}
		var err error
		if placeholder && !strings.HasSuffix(c.To, ".md") {
			err = os.WriteFile(abs(c.To), nil, 0o644)
		} else {
			err = copyFile(c.From, abs(c.To))
		}
		if err != nil {
			return err
		}
	}
	for _, w := range plan.Writes {
		if err := os.MkdirAll(filepath.Dir(abs(w.Path)), 0o755); err != nil {
			return err
		}
		if err := os.WriteFile(abs(w.Path), []byte(w.Text), 0o644); err != nil {
			return err
		}
	}
	return nil
}

// stageDocs is a copy of `docs/` (minus the scratch area) that is cheap: text files real, everything else empty.
func stageDocs(root string) (string, error) {
	stage, err := os.MkdirTemp("", "design-archive-stage-")
	if err != nil {
		return "", err
	}
	docs := filepath.Join(root, "docs")
	skip := func(p, _ string) bool {
		rel, _ := filepath.Rel(root, p)
		return posix(rel) == Tmp
	}
	for _, file := range archive.Walk(docs, skip) {
		rel, _ := filepath.Rel(root, file)
		to := filepath.Join(stage, rel)
		if err := os.MkdirAll(filepath.Dir(to), 0o755); err != nil {
			return stage, err
		}
		if strings.HasSuffix(file, ".md") {
			err = copyFile(file, to)
		} else {
			err = os.WriteFile(to, nil, 0o644)
		}
		if err != nil {
			return stage, err
		}
	}
	return stage, os.MkdirAll(filepath.Join(stage, "docs"), 0o755)
}

// ArchiveSpec folds one requirement's delta into prod. With dryRun it validates and reports, and writes nothing.
func ArchiveSpec(root, slug string, dryRun bool) (Result, error) {
	p, err := planArchive(root, slug)
	if err != nil {
		return Result{}, err
	}
	if !p.res.OK {
		return p.res, nil
	}
	stage, err := stageDocs(root)
	defer os.RemoveAll(stage)
	if err != nil {
		return Result{}, err
	}
	if err := ApplyPlan(stage, p.plan, true); err != nil {
		return Result{}, err
	}
	after, err := check.Run(stage, check.Defaults())
	if err != nil {
		return Result{}, err
	}
	if len(after.Violations) > 0 {
		return Result{Stage: "归档后复核", Violations: after.Violations}, nil
	}
	if !dryRun {
		if err := ApplyPlan(root, p.plan, false); err != nil {
			return Result{}, err
		}
		if err := os.RemoveAll(filepath.Join(root, filepath.FromSlash(p.plan.Tmp))); err != nil {
			return Result{}, err
		}
	}
	res := p.res
	res.DryRun = dryRun
	return res, nil
}
