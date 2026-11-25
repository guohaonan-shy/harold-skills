// Package report is `dyna design report`: one round of design convergence, laid out as a single HTML page.
//
// Each round the human gets this page instead of a long text list: what changed without being declared, what the
// critic (the judge) said with the researcher's user path and reference pictures, how the critic assessed the
// human's own reasoning, and the score. The human reads it and answers in the conversation by number. The structure
// is the same every round and the pictures have to be inlined, which is why a command builds it and the session does
// not write it by hand.
//
// Everything is decided here, on plain data (values parsed from JSON: *frontmatter.Map, []any, float64, string, bool,
// nil), so it is unit-tested without a browser:
//
//   - judge: the critic's JSON (`dyna design critic round` shape): { findings, reasoning, score, note }. A finding's
//     number is its 1-based place in `findings` — the same number the researcher's `covers` / `uncovered` use.
//   - research: the researcher's light-use file (`research-light.json`, see uiux-research's
//     `references/light-return.md`), with its image paths resolved by the caller.
//   - diff: `dyna ui measure` in `canvas-diff` mode, run with `--json` and a change set (`classified: true`):
//     `undeclared` lists the anchors that changed without being declared, each with the two area screenshots.
//   - canvas: { current, previous? }: the address of this version's canvas page (and the previous one). A canvas
//     link can locate a version and a state, nothing finer: `<page>?state=<name>`.
//   - thoughts: [{ id, quote }]: what the human wrote down this round, one entry per thought, with their own words
//     (`round-<N>/thoughts.md`, read by ParseThoughts). Every thought the critic assessed (`judge.reasoning[].id`)
//     must have its words here, or the report is refused and the missing ones are listed; thoughts nobody assessed
//     (kept after discussion) are simply not shown.
//   - selfCheck: optional. [{ state, anchor, what, why }]: what the designer changed in its own pre-delivery
//     self-check, one entry per place. Self-check changes are not in the change set, so the comparison lists them as
//     undeclared; an undeclared change that matches an entry by `state` + `anchor` shows the designer's reason beside
//     it, one that matches nothing says the designer gave no reason. When the input is left out, the page says
//     nothing about reasons at all. An entry that matches no undeclared change but sits on the same `state` + `anchor`
//     as a declared change (`diff.declared`) is listed in the same first section, with the block's before / after
//     pictures, the designer's reason and the decisions that also changed this block, and asks keep or undo. Only an
//     entry that matches neither is left off the page.
//   - dissatisfied: [{ opinion, quote }]: the session's mark that the human, in this refine, already said they are
//     not satisfied with the block a `direction` opinion is about, with their own words.
//
// Order of the page: undeclared changes (only when there are some) → the critic's opinions → the assessment of the
// human's reasoning → score and the critic's note. Every entry in the first three sections has a number, unique
// across the page and consecutive from 1.
//
// Pure but for ReadImage, which the caller passes in: path → bytes.
package report

import (
	"encoding/base64"
	"errors"
	"fmt"
	"math"
	"net/url"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/design/jsx"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/frontmatter"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/jsnum"
)

// NoReferenceMessage is the sentence the page shows where reference pictures would be, when the researcher could not
// reach Mobbin.
const NoReferenceMessage = "这一轮没有参考图：Mobbin 没连上"

// The recommendations of a direction opinion.
const (
	RecommendKeep   = "保留"
	RecommendReopen = "回 imagine 重开这一块"
)

var kindLabel = map[string]string{"direction": "方向性意见", "pattern": "模式", "craft": "做工"}

var kindOrder = []string{"direction", "pattern", "craft"}

var mime = map[string]string{".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif"}

// ---------- JavaScript's view of a JSON value ----------

func asMap(v any) (*frontmatter.Map, bool) { return frontmatter.AsMap(v) }

func asList(v any) ([]any, bool) {
	l, ok := v.([]any)
	return l, ok
}

func isText(v any) bool {
	s, ok := v.(string)
	return ok && strings.TrimSpace(s) != ""
}

func isInteger(v any) bool {
	f, ok := v.(float64)
	return ok && !math.IsInf(f, 0) && !math.IsNaN(f) && f == math.Trunc(f)
}

// jsString is String(v) for a value read from JSON.
func jsString(v any) string {
	switch x := v.(type) {
	case nil:
		return "null"
	case bool:
		if x {
			return "true"
		}
		return "false"
	case float64:
		return jsnum.Format(x)
	case string:
		return x
	case []any:
		parts := make([]string, len(x))
		for i, e := range x {
			if e != nil {
				parts[i] = jsString(e)
			}
		}
		return strings.Join(parts, ",")
	}
	return "[object Object]"
}

// field is `${m.key}`: "undefined" when the key is not there.
func field(m *frontmatter.Map, key string) string {
	if m == nil || !m.Has(key) {
		return "undefined"
	}
	return jsString(m.Get(key))
}

// get is m.key, nil for a missing key or a non-object.
func get(v any, key string) any {
	m, ok := asMap(v)
	if !ok {
		return nil
	}
	return m.Get(key)
}

// idText is String(v ?? ”).
func idText(v any) string {
	if v == nil {
		return ""
	}
	return jsString(v)
}

var escaper = strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", `"`, "&quot;")

func esc(s string) string { return escaper.Replace(s) }

func placeKey(state, anchor any) string { return jsx.Stringify([]any{state, anchor}) }

// ---------- thoughts.md ----------

// Thought is one thought the human wrote down this round.
type Thought struct {
	ID    string `json:"id"`
	Quote string `json:"quote"`
}

var thoughtLine = regexp.MustCompile(`^(\S+) \| (.*)$`)

// ParseThoughts reads `thoughts.md`: one thought per line, `<id> | <the human's words>`; a line that does not start
// with `<id> | ` continues the previous thought (the human wrote more than one line). Blank lines are skipped. The
// error names the line when text comes before the first thought, or an id appears twice.
func ParseThoughts(text string) ([]Thought, error) {
	var thoughts []Thought
	for i, line := range regexp.MustCompile(`\r?\n`).Split(text, -1) {
		if strings.TrimSpace(line) == "" {
			continue
		}
		if m := thoughtLine.FindStringSubmatch(line); m != nil {
			for _, t := range thoughts {
				if t.ID == m[1] {
					return nil, fmt.Errorf("thoughts line %d: thought %s appears twice", i+1, m[1])
				}
			}
			thoughts = append(thoughts, Thought{ID: m[1], Quote: strings.TrimSpace(m[2])})
		} else if len(thoughts) > 0 {
			thoughts[len(thoughts)-1].Quote += "\n" + strings.TrimSpace(line)
		} else {
			return nil, fmt.Errorf("thoughts line %d: expected \"<id> | <the human's words>\", got %s", i+1, jsx.Stringify(line))
		}
	}
	if thoughts == nil {
		thoughts = []Thought{}
	}
	return thoughts, nil
}

// ---------- canvas addresses ----------

// absolute is whether s is an address `new URL(s)` takes on its own.
func absolute(s string) (*url.URL, bool) {
	u, err := url.Parse(s)
	if err != nil || u.Scheme == "" || !regexp.MustCompile(`^[A-Za-z][A-Za-z0-9+.-]*:`).MatchString(s) {
		return nil, false
	}
	if (u.Scheme == "http" || u.Scheme == "https") && u.Host == "" {
		return nil, false
	}
	return u, true
}

// formEscape is the application/x-www-form-urlencoded serialization URLSearchParams uses.
func formEscape(s string) string {
	var b strings.Builder
	for _, c := range []byte(s) {
		switch {
		case c >= 'a' && c <= 'z', c >= 'A' && c <= 'Z', c >= '0' && c <= '9', c == '*', c == '-', c == '.', c == '_':
			b.WriteByte(c)
		case c == ' ':
			b.WriteByte('+')
		default:
			fmt.Fprintf(&b, "%%%02X", c)
		}
	}
	return b.String()
}

// CanvasLink is `<page>?state=<name>`: the same way `dyna ui measure` addresses a state of a canvas (the other query
// parameters keep their order; a `state` already there is replaced).
func CanvasLink(raw, state string) string {
	u, ok := absolute(raw)
	if !ok {
		return raw
	}
	var pairs []string
	replaced := false
	for _, p := range strings.Split(u.RawQuery, "&") {
		if p == "" {
			continue
		}
		name, value, _ := strings.Cut(p, "=")
		n, _ := url.QueryUnescape(name)
		if n == "state" {
			if !replaced {
				pairs = append(pairs, "state="+formEscape(state))
				replaced = true
			}
			continue
		}
		v, _ := url.QueryUnescape(value)
		pairs = append(pairs, formEscape(n)+"="+formEscape(v))
	}
	if !replaced {
		pairs = append(pairs, "state="+formEscape(state))
	}
	u.RawQuery = strings.Join(pairs, "&")
	if u.Path == "" && u.Opaque == "" && u.Host != "" {
		u.Path = "/"
	}
	return u.String()
}

// VersionLabel is `v3.html` → `v3`; an address without a file name falls back to its host.
func VersionLabel(raw string) string {
	u, ok := absolute(raw)
	if !ok {
		return raw
	}
	var last string
	for _, p := range strings.Split(u.Path, "/") {
		if p != "" {
			last = p
		}
	}
	if last == "" {
		return u.Host
	}
	return regexp.MustCompile(`\.[^.]+$`).ReplaceAllString(last, "")
}

// ---------- inputs ----------

// Canvas is the address of this version's canvas page and, when given, the previous one's.
type Canvas struct {
	Current  string
	Previous string // "" = not given
}

// Inputs is everything one report is built from.
type Inputs struct {
	Judge        any
	Research     any
	Diff         any
	Canvas       Canvas
	Thoughts     []Thought // nil = not an array
	Dissatisfied any       // nil = none given ([])
	SelfCheck    any       // nil = not given
	HasSelfCheck bool
	ReadImage    func(path string) ([]byte, error)
}

func validate(in Inputs) []string {
	var errs []string
	add := func(format string, a ...any) { errs = append(errs, fmt.Sprintf(format, a...)) }

	judge, judgeOK := asMap(in.Judge)
	findings, findingsOK := asList(get(in.Judge, "findings"))
	reasoning, reasoningOK := asList(get(in.Judge, "reasoning"))
	if !judgeOK {
		add("judge must be the critic's JSON object")
	} else {
		if !findingsOK {
			add("judge.findings must be an array")
		} else {
			for i, f := range findings {
				at := fmt.Sprintf("judge.findings[%d]", i)
				fm, ok := asMap(f)
				if !ok {
					add("%s must be an object", at)
					continue
				}
				if k, _ := fm.Get("kind").(string); kindLabel[k] == "" {
					add("%s.kind must be one of %s", at, strings.Join(kindOrder, " / "))
				}
				for _, k := range []string{"state", "where", "detail", "why"} {
					if !isText(fm.Get(k)) {
						add("%s.%s must be a non-empty string", at, k)
					}
				}
			}
		}
		if !reasoningOK {
			add("judge.reasoning must be an array")
		} else {
			for i, r := range reasoning {
				rm, ok := asMap(r)
				if !ok || !isText(idText(rm.Get("id"))) || !isText(rm.Get("verdict")) || !isText(rm.Get("why")) {
					add("judge.reasoning[%d] needs id, verdict and why", i)
				}
			}
		}
		score := judge.Get("score")
		if n, _ := score.(float64); !isInteger(score) || n < 1 || n > 10 {
			add("judge.score must be an integer 1–10")
		}
	}

	if _, ok := asMap(in.Research); !ok || get(in.Research, "mode") != "light" {
		add("research must be the researcher's light-use file (mode \"light\")")
	} else if m := get(in.Research, "mobbin"); m != "connected" && m != "unavailable" {
		add("research.mobbin must be \"connected\" or \"unavailable\"")
	} else if _, ok := asList(get(in.Research, "items")); !ok {
		add("research.items must be an array")
	}

	if _, ok := asMap(in.Diff); !ok || get(in.Diff, "mode") != "canvas-diff" {
		add("diff must be the output of dyna ui measure in canvas-diff mode (--json)")
	} else if get(in.Diff, "classified") != true {
		add("diff was run without a change set (classified is not true): without one every change looks undeclared; run it with \"changeSet\" ([] in the first round)")
	} else if _, ok := asList(get(in.Diff, "undeclared")); !ok {
		add("diff.undeclared must be an array")
	} else if dm, _ := asMap(in.Diff); dm.Has("declared") {
		if _, ok := asList(dm.Get("declared")); !ok {
			add("diff.declared must be an array")
		}
	}

	if !isText(in.Canvas.Current) {
		add("canvas.current (the address of this version's canvas page) is required")
	} else {
		for _, kv := range [][2]string{{"current", in.Canvas.Current}, {"previous", in.Canvas.Previous}} {
			if kv[0] == "previous" && kv[1] == "" {
				continue
			}
			if _, ok := absolute(kv[1]); !ok {
				add("canvas.%s is not an absolute address: %s", kv[0], jsx.Stringify(kv[1]))
			}
		}
	}

	if in.Thoughts == nil {
		add("thoughts must be an array of { id, quote } (the round's thoughts.md, read with parseThoughts)")
	} else if reasoningOK {
		have := map[string]string{}
		for _, t := range in.Thoughts {
			have[t.ID] = t.Quote
		}
		var missing []string
		for _, r := range reasoning {
			id := jsString(get(r, "id"))
			if m, isMap := asMap(r); !isMap || !m.Has("id") {
				id = "undefined"
			}
			if !isText(have[id]) {
				missing = append(missing, id)
			}
		}
		if len(missing) > 0 {
			s := ""
			if len(missing) > 1 {
				s = "s"
			}
			add("thoughts has no words from the human for the thought%s the critic assessed: %s", s, strings.Join(missing, ", "))
		}
	}

	if in.HasSelfCheck {
		list, ok := asList(in.SelfCheck)
		if !ok {
			add("selfCheck must be an array of { state, anchor, what, why }")
		} else {
			seen := map[string]bool{}
			for i, c := range list {
				at := fmt.Sprintf("selfCheck[%d]", i)
				cm, ok := asMap(c)
				if !ok {
					add("%s must be an object", at)
					continue
				}
				for _, k := range []string{"state", "anchor", "what", "why"} {
					if !isText(cm.Get(k)) {
						add("%s.%s must be a non-empty string", at, k)
					}
				}
				id := placeKey(cm.Get("state"), cm.Get("anchor"))
				if seen[id] {
					add("%s: %s · %s is written twice", at, field(cm, "state"), field(cm, "anchor"))
				}
				seen[id] = true
			}
		}
	}

	count := len(findings)
	dis := in.Dissatisfied
	if dis == nil {
		dis = []any{}
	}
	if list, ok := asList(dis); !ok {
		add("dissatisfied must be an array of { opinion, quote }")
	} else {
		seen := map[int]bool{}
		for i, d := range list {
			at := fmt.Sprintf("dissatisfied[%d]", i)
			dm, ok := asMap(d)
			op, _ := get(d, "opinion").(float64)
			if !ok || !isInteger(dm.Get("opinion")) || op < 1 || op > float64(count) {
				add("%s.opinion must be one of the critic's opinion numbers 1–%d", at, count)
				continue
			}
			n := int(op)
			if !isText(dm.Get("quote")) {
				add("%s.quote must be the human's own words, non-empty", at)
			}
			if get(findings[n-1], "kind") != "direction" {
				add("%s: opinion %d is not a direction opinion; the mark only applies to those", at, n)
			}
			if seen[n] {
				add("%s: opinion %d is marked twice", at, n)
			}
			seen[n] = true
		}
	}
	return errs
}

var opinionDigits = regexp.MustCompile(`^[1-9]\d*$`)

// opinionNumber is an opinion number as the researcher wrote it, 1 or "1", as the number it means. The return check
// accepts both and compares them as text, so the report must too. Anything else (0, "01", "a") is no opinion number.
func opinionNumber(v any) (int, bool) {
	if isInteger(v) {
		return int(v.(float64)), true
	}
	if s, ok := v.(string); ok && opinionDigits.MatchString(s) {
		n, err := strconv.Atoi(s)
		return n, err == nil
	}
	return 0, false
}

type itemHit struct {
	item  *frontmatter.Map
	index int
}

// indexResearch is which research item speaks for each opinion number, and which opinions it explicitly left
// uncovered.
func indexResearch(research *frontmatter.Map, count int) (map[int]itemHit, map[int]any, []string) {
	itemOf := map[int]itemHit{}
	uncovered := map[int]any{}
	var errs []string
	items, _ := asList(research.Get("items"))
	for i, raw := range items {
		item, _ := asMap(raw)
		covers, _ := asList(get(raw, "covers"))
		for _, c := range covers {
			n, ok := opinionNumber(c)
			switch {
			case !ok || n < 1 || n > count:
				errs = append(errs, fmt.Sprintf("research.items[%d] covers opinion %s, which the critic did not give", i, jsString(c)))
			case itemOf[n].item != nil || hasKey(itemOf, n):
				errs = append(errs, fmt.Sprintf("opinion %d is covered by two research items", n))
			default:
				itemOf[n] = itemHit{item: item, index: i}
			}
		}
	}
	unc, _ := asList(research.Get("uncovered"))
	for _, u := range unc {
		if n, ok := opinionNumber(get(u, "opinion")); ok {
			uncovered[n] = get(u, "why")
		}
	}
	if research.Get("mobbin") == "connected" {
		for n := 1; n <= count; n++ {
			_, covered := itemOf[n]
			_, left := uncovered[n]
			if !covered && !left {
				errs = append(errs, fmt.Sprintf("opinion %d has neither a research item nor an entry in research.uncovered", n))
			}
		}
	}
	return itemOf, uncovered, errs
}

func hasKey(m map[int]itemHit, k int) bool {
	_, ok := m[k]
	return ok
}

// recommendation is what the page recommends for one opinion, and why.
type recommendation struct {
	action string
	quote  *string
}

func recommend(kind string, item *frontmatter.Map, mark *frontmatter.Map) recommendation {
	if kind == "direction" {
		if mark != nil {
			q := jsString(mark.Get("quote"))
			return recommendation{action: RecommendReopen, quote: &q}
		}
		return recommendation{action: RecommendKeep}
	}
	if item != nil {
		return recommendation{action: "照新的设计意图改"}
	}
	return recommendation{action: "收下评委的意见"}
}

// ---------- the report ----------

// Overturn is a proposal to overturn one ledger decision.
type Overturn struct {
	Ledger string `json:"ledger"`
	Why    string `json:"why"`
}

// Entry is one numbered entry of the page. Which fields are set depends on the section.
type Entry struct {
	N       int    `json:"n"`
	Section string `json:"section"` // undeclared | opinions | reasoning

	// undeclared
	State          string   `json:"state,omitempty"`
	Anchor         string   `json:"anchor,omitempty"`
	HasSelfCheck   bool     `json:"-"`
	SelfCheck      *string  `json:"selfCheck,omitempty"` // with HasSelfCheck: nil = the designer gave no reason
	AlsoDeclaredBy []string `json:"alsoDeclaredBy,omitempty"`

	// opinions
	Opinion   int        `json:"opinion,omitempty"`
	Kind      string     `json:"kind,omitempty"`
	Recommend string     `json:"recommend,omitempty"`
	Overturns []Overturn `json:"overturns,omitempty"`

	// reasoning
	ID      string `json:"id,omitempty"`
	Verdict string `json:"verdict,omitempty"`
	Quote   string `json:"quote,omitempty"`
}

// SelfCheckEntry is one place of the designer's self-check.
type SelfCheckEntry struct {
	State, Anchor, What, Why string
}

// Report is the page, the short text for the conversation, the numbered entries, and the self-check entries that
// matched neither an undeclared change nor a declared one (nothing to show for them).
type Report struct {
	HTML               string
	Summary            string
	Entries            []Entry
	UnmatchedSelfCheck []SelfCheckEntry
}

// Build builds the report. The error lists every problem with the inputs, one per line.
func Build(in Inputs) (Report, error) {
	if errs := validate(in); len(errs) > 0 {
		return Report{}, errors.New(strings.Join(errs, "\n"))
	}
	judge, _ := asMap(in.Judge)
	research, _ := asMap(in.Research)
	diff, _ := asMap(in.Diff)
	findings, _ := asList(judge.Get("findings"))
	reasoning, _ := asList(judge.Get("reasoning"))
	itemOf, uncovered, rerrs := indexResearch(research, len(findings))
	if len(rerrs) > 0 {
		return Report{}, errors.New(strings.Join(rerrs, "\n"))
	}

	var buildErr error
	imageURI := func(path string) string {
		if buildErr != nil {
			return ""
		}
		b, err := in.ReadImage(path)
		if err != nil {
			buildErr = fmt.Errorf("cannot read image %s: %v", path, err)
			return ""
		}
		m := mime[strings.ToLower(filepath.Ext(path))]
		if m == "" {
			buildErr = fmt.Errorf("image %s has an extension this report cannot inline (.png .jpg .jpeg .webp .gif)", path)
			return ""
		}
		return "data:" + m + ";base64," + base64.StdEncoding.EncodeToString(b)
	}
	figure := func(path any, caption string) string {
		return `<figure><img src="` + imageURI(jsString(path)) + `" alt="` + esc(caption) + `"><figcaption>` + esc(caption) + `</figcaption></figure>`
	}

	marks := map[int]*frontmatter.Map{}
	dis, _ := asList(in.Dissatisfied)
	for _, d := range dis {
		dm, _ := asMap(d)
		marks[int(dm.Get("opinion").(float64))] = dm
	}
	var selfList []any
	if in.HasSelfCheck {
		selfList, _ = asList(in.SelfCheck)
	}
	selfChecks := map[string]*frontmatter.Map{}
	for _, c := range selfList {
		cm, _ := asMap(c)
		selfChecks[placeKey(cm.Get("state"), cm.Get("anchor"))] = cm
	}
	used := map[string]bool{}
	n := 0
	var entries []Entry
	var sections []string
	canvas := in.Canvas

	// 1. changes nobody declared, then the designer's self-check edits hidden inside a declared block
	undeclared, _ := asList(diff.Get("undeclared"))
	declared, _ := asList(diff.Get("declared"))
	undeclaredKeys := map[string]bool{}
	for _, c := range undeclared {
		undeclaredKeys[placeKey(get(c, "state"), get(c, "anchor"))] = true
	}
	type listedChange struct {
		c         *frontmatter.Map
		decisions []string // nil = an undeclared change
	}
	var listed []listedChange
	for _, c := range undeclared {
		cm, _ := asMap(c)
		listed = append(listed, listedChange{c: cm})
	}
	for _, c := range declared {
		key := placeKey(get(c, "state"), get(c, "anchor"))
		if undeclaredKeys[key] || selfChecks[key] == nil {
			continue
		}
		cm, _ := asMap(c)
		ds := []string{}
		if list, ok := asList(cm.Get("decisions")); ok {
			for _, d := range list {
				ds = append(ds, jsString(d))
			}
		}
		listed = append(listed, listedChange{c: cm, decisions: ds})
	}
	if len(listed) > 0 {
		var cards []string
		for _, l := range listed {
			c := l.c
			n++
			number := n
			state := field(c, "state")
			anchor := field(c, "anchor")
			links := []string{`<a href="` + esc(CanvasLink(canvas.Current, state)) + `">打开 ` + esc(VersionLabel(canvas.Current)) + ` 的「` + esc(state) + `」</a>`}
			if canvas.Previous != "" {
				links = append(links, `<a href="`+esc(CanvasLink(canvas.Previous, state))+`">打开 `+esc(VersionLabel(canvas.Previous))+` 的「`+esc(state)+`」</a>`)
			}
			var what string
			switch get(c, "kind") {
			case "added":
				what = "这一版新增了这个锚点"
			case "removed":
				what = "这一版没有了这个锚点"
			default:
				var parts []string
				changes, _ := asList(c.Get("changes"))
				for _, x := range changes {
					xm, _ := asMap(x)
					parts = append(parts, field(xm, "property")+"："+field(xm, "before")+" → "+field(xm, "after"))
				}
				if p, ok := c.Get("pixelPercent").(float64); ok && p > 0 {
					parts = append(parts, "区域像素差 "+strconv.FormatFloat(p, 'f', 2, 64)+"%")
				}
				what = strings.Join(parts, "；")
			}
			shots := `<p class="muted">没有区域截图：这个区域在两版里都没有面积（两边都隐藏）。</p>`
			if s := c.Get("shots"); frontmatter.Truthy(s) {
				shots = `<div class="pair">` + figure(get(s, "before"), "改前") + figure(get(s, "after"), "改后") + `</div>`
			}
			selfKey := placeKey(c.Get("state"), c.Get("anchor"))
			said := selfChecks[selfKey]
			if said != nil {
				used[selfKey] = true
			}
			reason := ""
			if said != nil {
				reason = `<p class="selfcheck" data-reason="given"><strong>designer 自检：</strong>` + esc(field(said, "why")) + `<span class="muted">（designer 写的改动：` + esc(field(said, "what")) + `）</span></p>`
			} else if in.HasSelfCheck {
				reason = `<p class="selfcheck none" data-reason="none"><strong>designer 没说明为什么改。</strong></p>`
			}
			overlap := ""
			if l.decisions != nil {
				labels := make([]string, len(l.decisions))
				for i, d := range l.decisions {
					labels[i] = "决策 " + esc(d)
				}
				overlap = `<p class="overlap" data-overlap="true"><strong>这一块这一轮也按` + strings.Join(labels, "、") + `改过</strong>，比对把整块算成已声明，所以 designer 自检改的这一处没被单独挑出来。下面的改前改后是整块的，两处改动混在一起；自检那处是：` + esc(field(said, "what")) + `</p>`
			}
			e := Entry{N: number, Section: "undeclared", State: state, Anchor: anchor, HasSelfCheck: in.HasSelfCheck}
			if in.HasSelfCheck && said != nil {
				why := field(said, "why")
				e.SelfCheck = &why
			}
			if l.decisions != nil {
				e.AlsoDeclaredBy = append([]string{}, l.decisions...)
			}
			entries = append(entries, e)
			whatLine := `<p>` + esc(what) + `</p>`
			ask := "这处改动没有出现在改动集里。"
			if l.decisions != nil {
				whatLine = `<p class="muted">整块的比对差异：` + esc(what) + `</p>`
				ask = "designer 自检改的这一处没有出现在改动集里。"
			}
			cards = append(cards, fmt.Sprintf(`<article id="r%d" data-n="%d" data-kind="undeclared">
<h3><span class="num">#%d</span> %s · %s</h3>
%s
%s
%s
%s
<p class="ask">%s<strong>留，还是撤？</strong>（这一条要你定）</p>
<p class="links">%s</p>
</article>`, number, number, number, esc(state), esc(anchor), whatLine, overlap, reason, shots, ask, strings.Join(links, " · ")))
		}
		sections = append(sections, `<section data-section="undeclared"><h2>没声明却变了的地方</h2>
<p class="muted">设计师这一版动了下面这些地方，但改动集里没写（设计师交付前自检改的地方也在这里，包括落在这一轮按决策改过的同一块里的）。每一条回「留」或「撤」；撤的会写进 ledger，下一轮照撤。</p>
`+strings.Join(cards, "\n")+`</section>`)
	}

	// 2. the critic's opinions, one by one
	firstOfItem := map[int]int{} // research item index → report number of the first opinion it speaks for
	var opinionCards []string
	mobbin := research.Get("mobbin")
	for i, f := range findings {
		fm, _ := asMap(f)
		opinion := i + 1
		n++
		number := n
		hit, hasHit := itemOf[opinion]
		var item *frontmatter.Map
		if hasHit {
			item = hit.item
		}
		kind, _ := fm.Get("kind").(string)
		rec := recommend(kind, item, marks[opinion])
		isFirst := false
		if item != nil {
			if _, seen := firstOfItem[hit.index]; !seen {
				isFirst = true
				firstOfItem[hit.index] = number
			}
		}
		state := field(fm, "state")

		var reference string
		switch {
		case mobbin == "unavailable":
			reference = `<div class="ref none"><p>` + esc(NoReferenceMessage) + `</p></div>`
		case hasKeyAny(uncovered, opinion):
			reference = `<div class="ref none"><p>没有找到能呈现这一点的参考：` + esc(jsUndef(uncovered[opinion])) + `</p></div>`
		case !isFirst:
			first := firstOfItem[hit.index]
			reference = fmt.Sprintf(`<div class="ref"><p class="muted">跟 #%d 是同一件事：用户路径和设计意图见 #%d。</p></div>`, first, first)
		default:
			path, _ := asList(item.Get("path"))
			var steps []string
			for k, s := range path {
				sm, _ := asMap(s)
				images, _ := asList(get(s, "images"))
				var figs []string
				for j, p := range images {
					figs = append(figs, figure(p, fmt.Sprintf("%s 第 %d 步图 %d", field(sm, "source"), k+1, j+1)))
				}
				steps = append(steps, `<li>
<p><strong>`+esc(field(sm, "source"))+`</strong>　看到：`+esc(field(sm, "saw"))+`　做了：`+esc(field(sm, "did"))+`　接着看到：`+esc(field(sm, "then"))+`</p>
<div class="pair">`+strings.Join(figs, "")+`</div>
<p class="muted">`+esc(field(sm, "reading"))+`</p></li>`)
			}
			var overturns []string
			ots, _ := asList(item.Get("overturns"))
			for _, o := range ots {
				om, _ := asMap(o)
				overturns = append(overturns, fmt.Sprintf(`<p class="overturn">推翻 ledger %s（报告 #%d）：%s</p>`, esc(field(om, "ledger")), number, esc(field(om, "why"))))
			}
			reference = `<div class="ref"><h4>用户路径</h4><ol>` + strings.Join(steps, "\n") + `</ol>` + strings.Join(overturns, "\n") + `</div>`
		}
		intent := ""
		if item != nil && isFirst && frontmatter.Truthy(item.Get("intent")) {
			intent = `<p class="intent"><strong>新的设计意图：</strong>` + esc(field(item, "intent")) + `</p>`
		}
		recLine := `<p class="rec" data-action="` + esc(rec.action) + `"><strong>推荐：` + esc(rec.action) + `。</strong></p>`
		if rec.quote != nil {
			recLine = `<p class="rec" data-action="` + esc(rec.action) + `"><strong>推荐：` + esc(rec.action) + `。</strong>你这次说过：「` + esc(*rec.quote) + `」</p>`
		}
		e := Entry{N: number, Section: "opinions", Opinion: opinion, Kind: kind, State: state, Recommend: rec.action, Overturns: []Overturn{}}
		if isFirst {
			ots, _ := asList(item.Get("overturns"))
			for _, o := range ots {
				om, _ := asMap(o)
				e.Overturns = append(e.Overturns, Overturn{Ledger: field(om, "ledger"), Why: field(om, "why")})
			}
		}
		entries = append(entries, e)
		ref := ""
		if frontmatter.Truthy(fm.Get("reference")) {
			ref = `<p class="muted">评委想要的参考画面：` + esc(field(fm, "reference")) + `</p>`
		}
		opinionCards = append(opinionCards, fmt.Sprintf(`<article id="r%d" data-n="%d" data-kind="%s">
<h3><span class="num">#%d</span> <span class="tag">%s</span> %s · %s</h3>
<blockquote><p>%s</p><p class="muted">%s</p></blockquote>
%s
%s
%s
%s
<p class="links"><a href="%s">打开 %s 的「%s」</a></p>
</article>`, number, number, esc(kind), number, esc(kindLabel[kind]), esc(state), esc(field(fm, "where")), esc(field(fm, "detail")), esc(field(fm, "why")),
			ref, reference, intent, recLine, esc(CanvasLink(canvas.Current, state)), esc(VersionLabel(canvas.Current)), esc(state)))
	}
	opinionsBody := `<p class="muted">评委这一轮没有提意见。</p>`
	if len(opinionCards) > 0 {
		opinionsBody = strings.Join(opinionCards, "\n")
	}
	sections = append(sections, `<section data-section="opinions"><h2>评委的意见</h2>
<p class="muted">评委是顾问，意见不会自动改画布。每一条都请回应，没回的会话会接着问。</p>
`+opinionsBody+`</section>`)

	// 3. the assessment of the human's own reasoning
	saidBy := map[string]string{}
	for _, t := range in.Thoughts {
		saidBy[t.ID] = t.Quote // the last one wins, as a Map built from the list does
	}
	var reasoningCards []string
	for _, r := range reasoning {
		rm, _ := asMap(r)
		n++
		number := n
		id := jsString(rm.Get("id"))
		quote := saidBy[id]
		entries = append(entries, Entry{N: number, Section: "reasoning", ID: id, Verdict: field(rm, "verdict"), Quote: quote})
		reasoningCards = append(reasoningCards, fmt.Sprintf(`<article id="r%d" data-n="%d" data-kind="reasoning">
<h3><span class="num">#%d</span> 你的思路 %s</h3>
<blockquote class="said"><p>你说：「%s」</p></blockquote>
<p>→ 评委：<span class="tag">%s</span>，理由：%s</p>
</article>`, number, number, number, esc(id), strings.ReplaceAll(esc(quote), "\n", "<br>"), esc(field(rm, "verdict")), esc(field(rm, "why"))))
	}
	reasoningBody := `<p class="muted">这一轮没有要评估的思路。</p>`
	if len(reasoningCards) > 0 {
		reasoningBody = strings.Join(reasoningCards, "\n")
	}
	sections = append(sections, `<section data-section="reasoning"><h2>评委对你这一轮思路的评估</h2>
`+reasoningBody+`</section>`)

	// 4. score and the critic's own summary
	note := `<p class="muted">评委没有写总评。</p>`
	if frontmatter.Truthy(judge.Get("note")) {
		note = `<p>` + esc(field(judge, "note")) + `</p>`
	}
	sections = append(sections, `<section data-section="score"><h2>分数与评委的总评</h2>
<p class="score"><strong>`+field(judge, "score")+`</strong> / 10</p>
<p class="muted">分数只是评委的参考，不决定停不停；停由你定。</p>
`+note+`</section>`)

	if buildErr != nil {
		return Report{}, buildErr
	}

	html := pageHead + strings.Join(sections, "\n") + pageTail
	var unmatched []SelfCheckEntry
	for _, c := range selfList {
		cm, _ := asMap(c)
		if !used[placeKey(cm.Get("state"), cm.Get("anchor"))] {
			unmatched = append(unmatched, SelfCheckEntry{State: field(cm, "state"), Anchor: field(cm, "anchor"), What: field(cm, "what"), Why: field(cm, "why")})
		}
	}
	undeclaredCount := 0
	for _, e := range entries {
		if e.Section == "undeclared" {
			undeclaredCount++
		}
	}
	return Report{HTML: html, Summary: Summary(field(judge, "score"), entries, undeclaredCount), Entries: entries, UnmatchedSelfCheck: unmatched}, nil
}

func hasKeyAny(m map[int]any, k int) bool {
	_, ok := m[k]
	return ok
}

// jsUndef is `${v}` of a value that may be missing (nil from a missing key reads "undefined" in the old page; a
// JSON null reads "null" — both are rare, and both are text the human sees as a gap).
func jsUndef(v any) string {
	if v == nil {
		return "undefined"
	}
	return jsString(v)
}

// Summary is the short text for the conversation: the score and the items that need special attention — undeclared
// changes, overturn proposals against the ledger, direction opinions. Nothing else.
func Summary(score string, entries []Entry, undeclaredCount int) string {
	lines := []string{"设计评审报告：评委打了 " + score + " 分（只是参考）"}
	var attention []string
	var numbers []string
	for _, e := range entries {
		if e.Section == "undeclared" {
			numbers = append(numbers, fmt.Sprintf("#%d", e.N))
		}
	}
	if undeclaredCount > 0 {
		attention = append(attention, fmt.Sprintf("没声明却变了的地方 %d 处：%s，每处要你定留还是撤", undeclaredCount, strings.Join(numbers, "、")))
	}
	for _, e := range entries {
		for _, o := range e.Overturns {
			attention = append(attention, fmt.Sprintf("#%d 提议推翻 ledger %s：%s", e.N, o.Ledger, o.Why))
		}
	}
	for _, e := range entries {
		if e.Kind == "direction" {
			attention = append(attention, fmt.Sprintf("#%d 方向性意见（%s），推荐%s", e.N, e.State, e.Recommend))
		}
	}
	if len(attention) > 0 {
		lines = append(lines, "要特别注意：")
		for _, a := range attention {
			lines = append(lines, "- "+a)
		}
	} else {
		lines = append(lines, "没有要特别注意的项。")
	}
	return strings.Join(lines, "\n")
}

const pageHead = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>设计评审报告</title>
<style>
:root { --bg:#fff; --fg:#1d1d1f; --muted:#6b6b72; --line:#e2e2e6; --card:#f7f7f9; --accent:#0a5bd8; --warn-bg:#fff1d6; --warn-fg:#7a4a00; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg:#141416; --fg:#ececf0; --muted:#9a9aa3; --line:#2c2c31; --card:#1c1c20; --accent:#6aa3ff; --warn-bg:#3a2c0e; --warn-fg:#ffd58a; } }
:root[data-theme="dark"] { --bg:#141416; --fg:#ececf0; --muted:#9a9aa3; --line:#2c2c31; --card:#1c1c20; --accent:#6aa3ff; --warn-bg:#3a2c0e; --warn-fg:#ffd58a; }
body { margin:0; background:var(--bg); color:var(--fg); font:16px/1.6 system-ui, sans-serif; }
main { max-width:860px; margin:0 auto; padding:24px 16px 64px; }
h1 { font-size:24px; } h2 { font-size:20px; margin-top:40px; border-bottom:1px solid var(--line); padding-bottom:6px; } h3 { font-size:17px; margin:0 0 8px; } h4 { margin:12px 0 4px; }
article { background:var(--card); border:1px solid var(--line); border-radius:8px; padding:14px 16px; margin:14px 0; }
.num { color:var(--accent); font-variant-numeric:tabular-nums; } .tag { font-size:13px; border:1px solid var(--line); border-radius:4px; padding:0 6px; }
.muted { color:var(--muted); } blockquote { margin:8px 0; padding-left:12px; border-left:3px solid var(--line); }
.pair { display:flex; flex-wrap:wrap; gap:12px; } figure { margin:0; } figure img { max-width:100%; max-height:520px; width:auto; height:auto; border:1px solid var(--line); border-radius:4px; background:#fff; } figcaption { font-size:13px; color:var(--muted); }
.overturn { background:var(--warn-bg); color:var(--warn-fg); border-radius:6px; padding:8px 12px; font-weight:600; }
.ask, .rec, .selfcheck { margin:10px 0 4px; } .selfcheck.none { color:var(--warn-fg); } .score { font-size:32px; margin:8px 0 0; } a { color:var(--accent); } ol { padding-left:20px; }
</style>
</head>
<body>
<main>
<h1>设计评审报告</h1>
<p class="muted">每条有编号，在对话里按编号回你的决定。</p>
`

const pageTail = `
</main>
</body>
</html>
`
