package pr

// The review loop of one PR — kept in a local markdown file, archived to the PR when it merges.
//
// Harold reviews and decides in his Claude session, not on GitHub: a PR thread is built for
// many people answering asynchronously, and moving each of his answers from GitHub back into the session took a
// bot identity, round markers, a background watcher and a wake-up — all to carry one person's words to the
// session he was already in. So every report the loop makes (a Review 汇报: implement's stops and pr-review's
// rounds are one kind of report) is shown in the session and appended, in the same words, to one file per PR;
// his rulings and what was done about them are appended under it. The file is the loop's memory: a session that
// was compacted or reopened reads it and carries on. When Harold says merge, each report is posted to the PR as
// one plain comment — a record, not a conversation — and the local file is deleted. Layout and wording:
// skills/engineering/pr-review/references/review-loop.md and review-report.md of the plugin.
//
// File: <worktree root>/.tmp/review-loop/<PR>.md
//
//	# PR #<N> 的 review loop
//
//	<!-- idea-loop-entry {"kind":"review","round":1,"from":"impl"} -->
//	## 第 1 次 · 来自实现 · …    ← the report, exactly as shown in the session
//	### 你的批示（<time>）         ← Harold's words, verbatim
//	### 做了什么                   ← what was done, with commit links
//
// Kinds: `review` is the one report the human reads, `from` says where it came from ("impl": written while
// implementing, e.g. a ticket stuck; absent or "review": a review round). Rounds count per source, so the first
// review round is round 1 whatever came before it. `pause` is the older kind for what is now a `review` with
// from=impl: files already written keep reading, and so do the comments already archived under its marker.
// `replay` is the replay runner's.
//
// An entry is settled once every 你的批示 has a 做了什么 after it. An entry that asks the human nothing has no
// ruling to wait for and is settled by its 做了什么 alone: a report with no 要你决定 section in it (every finding
// handled by rule). Unticked boxes under 要你看的 do not hold a report: the human checks them in the PR
// description's 要你做的事, not mid-implementation. A report that does ask waits for the human's ruling.
// Overturning a handled-by-rule item is just one more 你的批示 in the same entry. `check` lists the unsettled
// ones so the orchestrator can say so before a merge; it does not block the merge — Harold decides that.
//
// Figures in the file are local paths (the evidence directories under .tmp/): in the session they are sent as
// files, because a chat cannot load images from a private repository. Archiving uploads every local figure an
// entry uses to the PR's evidence branch (evidence.go) and rewrites the path to the address that opens full size
// on GitHub.
//
// Identity for the archive: the repository's GitHub App when configured, else the gh login; the body carries no
// signature either way (package githubapp). Archiving is idempotent: an entry whose marker is already on the PR is
// not posted again.

import (
	"encoding/json"
	"fmt"
	"math"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
)

// Kinds an entry may have, and where a report may come from.
var (
	Kinds = []string{"pause", "review", "replay"}
	Froms = []string{"impl", "review"}
)

const maxComment = 65000

func oneOf(list []string, s string) bool {
	for _, x := range list {
		if x == s {
			return true
		}
	}
	return false
}

// sourceOf is where an entry's report came from. The older `pause` kind was always written during implementation.
func sourceOf(kind, from string) string {
	switch kind {
	case "review":
		if from == "" {
			return "review"
		}
		return from
	case "pause":
		return "impl"
	}
	return kind
}

var (
	entryRe    = regexp.MustCompile(`^<!-- idea-loop-entry (\{[^\n\r\x{2028}\x{2029}]*?\}) -->$`)
	archivedRe = regexp.MustCompile(`<!-- idea-loop-archive (\{[^\n\r\x{2028}\x{2029}]*?\}) -->`)
	rulingRe   = regexp.MustCompile(`(?m)^### 你的批示`)
	actedRe    = regexp.MustCompile(`(?m)^### 做了什么`)
	asksRe     = regexp.MustCompile(`(?m)^#{2,4}[` + spaceSet + `]*(?:需要|要)你决定|\*\*要你决定\*\*`)
)

// Entry is one report of a review loop file.
type Entry struct {
	Kind    string
	Round   int
	Source  string
	Body    string
	Rulings int
	Settled bool
}

type marker struct {
	kind  string
	round float64
	from  string
	hasFr bool
}

// readMarker reads the JSON of an entry or archive marker. ok is false when it is not an object.
func readMarker(text string) (marker, bool) {
	var raw map[string]any
	if err := json.Unmarshal([]byte(text), &raw); err != nil {
		return marker{}, false
	}
	var m marker
	m.kind, _ = raw["kind"].(string)
	m.round, _ = raw["round"].(float64)
	if v, has := raw["from"]; has {
		m.hasFr = true
		m.from, _ = v.(string)
		if _, isStr := v.(string); !isStr {
			m.from = "\x00"
		}
	}
	if r, isNum := raw["round"].(float64); !isNum || r != math.Trunc(r) || math.Abs(r) > 9007199254740991 {
		m.round = math.NaN()
	}
	if _, isStr := raw["kind"].(string); !isStr {
		m.kind = "\x00"
	}
	return m, true
}

// ParseLoop is the entries of a review-loop file, in order. Lines before the first entry (the title) are ignored.
func ParseLoop(text string) ([]Entry, error) {
	type draft struct {
		kind   string
		round  int
		source string
		lines  []string
	}
	var drafts []draft
	for _, line := range strings.Split(text, "\n") {
		if m := entryRe.FindStringSubmatch(line); m != nil {
			rec, ok := readMarker(m[1])
			if !ok || !oneOf(Kinds, rec.kind) || math.IsNaN(rec.round) || (rec.hasFr && !oneOf(Froms, rec.from)) {
				return nil, fmt.Errorf("bad entry marker: %s", line)
			}
			drafts = append(drafts, draft{kind: rec.kind, round: int(rec.round), source: sourceOf(rec.kind, rec.from)})
		} else if len(drafts) > 0 {
			d := &drafts[len(drafts)-1]
			d.lines = append(d.lines, line)
		}
	}
	entries := make([]Entry, 0, len(drafts))
	for _, d := range drafts {
		body := trim(strings.Join(d.lines, "\n"))
		rulings := len(rulingRe.FindAllStringIndex(body, -1))
		// An entry that asks the human nothing has no ruling to wait for: it is settled once it says what was
		// done. A report asks when it carries a 要你决定 section (its unticked 要你看的 items wait for the PR
		// description's 要你做的事 instead); a replay asks when something failed (it carries a 要你决定 until the
		// human has ruled). Older files marked it with a bold **要你决定** inside an item, or, for a stop report,
		// a 需要你决定 heading: still read.
		asksHuman := asksRe.MatchString(body)
		askedNothing := rulings == 0 && !asksHuman
		var settled bool
		if rulings > 0 {
			settled = actedRe.MatchString(body[strings.LastIndex(body, "### 你的批示"):])
		} else {
			settled = askedNothing && actedRe.MatchString(body)
		}
		entries = append(entries, Entry{Kind: d.kind, Round: d.round, Source: d.source, Body: body, Rulings: rulings, Settled: settled})
	}
	return entries, nil
}

// NextRound is the next round number. `review` counts review rounds, `review` with from=impl counts the reports
// written while implementing (the older `pause` entries included), `replay` counts replays.
func NextRound(entries []Entry, kind, from string) int {
	source := sourceOf(kind, from)
	if kind == "pause" {
		source = sourceOf("review", "impl")
	}
	top := 0
	for _, e := range entries {
		if e.Source == source && e.Round > top {
			top = e.Round
		}
	}
	return top + 1
}

// Ref names an entry.
type Ref struct {
	Kind  string `json:"kind"`
	Round int    `json:"round"`
}

// Unsettled lists the entries still waiting for a ruling or for what was done about it.
func Unsettled(entries []Entry) []Ref {
	out := []Ref{}
	for _, e := range entries {
		if !e.Settled {
			out = append(out, Ref{e.Kind, e.Round})
		}
	}
	return out
}

// An entry is told apart by what it is (kind), where it came from and its round, so that review round 2 and
// implementation report 2 are two entries, and a marker written before the kinds were merged still matches.
func keyOf(kind, from string, round float64) string {
	return fmt.Sprintf("%s:%s:%s", kind, sourceOf(kind, from), strconv.FormatFloat(round, 'f', -1, 64))
}

// ArchiveMarker is the line that marks a comment as the archive of one entry.
func ArchiveMarker(kind string, round int, from string) string {
	k, _ := json.Marshal(kind)
	if from != "" {
		f, _ := json.Marshal(from)
		return fmt.Sprintf("<!-- idea-loop-archive {\"kind\":%s,\"round\":%d,\"from\":%s} -->", k, round, f)
	}
	return fmt.Sprintf("<!-- idea-loop-archive {\"kind\":%s,\"round\":%d} -->", k, round)
}

// ToArchive is the entries not yet posted to the PR, judged by the markers on its existing comments (their bodies).
func ToArchive(entries []Entry, comments []string) []Entry {
	posted := map[string]bool{}
	for _, c := range comments {
		m := archivedRe.FindStringSubmatch(c)
		if m == nil {
			continue
		}
		rec, ok := readMarker(m[1])
		if !ok {
			continue
		}
		from := ""
		if rec.hasFr {
			from = rec.from
		}
		posted[keyOf(rec.kind, from, rec.round)] = true
	}
	var out []Entry
	for _, e := range entries {
		from := ""
		if e.Source == "impl" && e.Kind == "review" {
			from = "impl"
		}
		if !posted[keyOf(e.Kind, from, float64(e.Round))] {
			out = append(out, e)
		}
	}
	return out
}

var figureRe = regexp.MustCompile(`!\[([^\]]*)\]\(([^)` + spaceSet + `]+)\)`)

// LocalFigures are the figure paths an entry uses that are not already a web address, each once.
func LocalFigures(body string) []string {
	var out []string
	seen := map[string]bool{}
	for _, m := range figureRe.FindAllStringSubmatch(body, -1) {
		p := m[2]
		if strings.HasPrefix(p, "http://") || strings.HasPrefix(p, "https://") || seen[p] {
			continue
		}
		seen[p] = true
		out = append(out, p)
	}
	return out
}

// WithFigureUrls replaces local figure paths with their uploaded addresses, keyed by file name.
func WithFigureUrls(body string, urls map[string]string) string {
	return figureRe.ReplaceAllStringFunc(body, func(all string) string {
		m := figureRe.FindStringSubmatch(all)
		if u := urls[filepath.Base(m[2])]; u != "" {
			return fmt.Sprintf("![%s](%s)", m[1], u)
		}
		return all
	})
}

// ArchiveBody is the comment that archives one entry. It carries no signature, whoever posts it (the repository's
// GitHub App or the gh login).
func ArchiveBody(e Entry) (string, error) {
	impl := e.Kind == "review" && e.Source == "impl"
	var label string
	switch {
	case impl:
		label = fmt.Sprintf("实现阶段第 %d 次汇报", e.Round)
	case e.Kind == "pause":
		label = fmt.Sprintf("第 %d 次停下", e.Round)
	case e.Kind == "review":
		label = fmt.Sprintf("review 第 %d 轮", e.Round)
	default:
		label = fmt.Sprintf("规则回放第 %d 次", e.Round)
	}
	from := ""
	if impl {
		from = "impl"
	}
	body := ArchiveMarker(e.Kind, e.Round, from) + "\n" + fmt.Sprintf("> 记录：%s在会话里进行，下面是原样的汇报、批示和处理结果。\n\n%s", label, e.Body)
	if n := jsLen(body); n > maxComment {
		return "", fmt.Errorf("%s is %d characters (limit %d); fold detail in the file before archiving", label, n, maxComment)
	}
	return body, nil
}
