package retro

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/jsstr"
)

// Squeeze one Claude Code session transcript down to the conversation itself, for retro.
//
// A session transcript (~/.claude/projects/<project>/<session>.jsonl) is megabytes of tool calls and tool output
// around a few dozen human sentences. The file keeps everything from the first turn on, even after the session was
// compacted (the compaction writes a `compact_boundary` record and a summary, it does not remove what came before),
// so it is the one place that still holds the opening turns once the context has lost them.
//
// The digest is: every human utterance, each with the conclusion of the AI reply right before it, the text the AI
// said after its last tool call, i.e. what the human was actually answering. Nothing else: no tool calls, no tool
// output, no thinking, no compaction summary, no harness-injected messages (task notifications, skill bodies,
// local command echoes, `!` shell input).

// AIMaxDefault is how many characters of the AI's conclusion a digest keeps.
const AIMaxDefault = 1500

// notHumanPrefixes start the user-role records that a human did not type.
var notHumanPrefixes = []string{"<task-notification>", "<local-command-", "<bash-input>", "<bash-stdout>", "<bash-stderr>", "Another Claude session sent a message"}

var (
	reminderRe    = regexp.MustCompile(`(?s)<system-reminder>.*?</system-reminder>`)
	commandNameRe = regexp.MustCompile(`(?s)<command-name>(.*?)</command-name>`)
	commandArgsRe = regexp.MustCompile(`(?s)<command-args>(.*?)</command-args>`)
)

// Record is one line of a transcript.
type Record map[string]any

// ParseJSONL reads the records of a transcript, skipping blank lines, a half-written last line and noise.
func ParseJSONL(text string) []Record {
	var out []Record
	for _, line := range strings.Split(text, "\n") {
		if jsstr.Trim(line) == "" {
			continue
		}
		var r Record
		if err := json.Unmarshal([]byte(line), &r); err != nil || r == nil {
			continue
		}
		out = append(out, r)
	}
	return out
}

// truthy is JavaScript's truthiness of a decoded JSON value.
func truthy(v any) bool {
	switch x := v.(type) {
	case nil:
		return false
	case bool:
		return x
	case float64:
		return x != 0
	case string:
		return x != ""
	}
	return true
}

func str(v any) string {
	s, _ := v.(string)
	return s
}

func asMap(v any) map[string]any {
	m, _ := v.(map[string]any)
	return m
}

func humanText(content any) string {
	var parts []string
	switch c := content.(type) {
	case string:
		parts = append(parts, c)
	case []any:
		for _, b := range c {
			block := asMap(b)
			switch {
			case block["type"] == "text" && isString(block["text"]):
				parts = append(parts, str(block["text"]))
			case block["type"] == "image":
				parts = append(parts, "[图片]")
			}
		}
	}
	var cleaned []string
	for _, part := range parts {
		text := jsstr.Trim(reminderRe.ReplaceAllString(part, ""))
		if text == "" {
			continue
		}
		skip := false
		for _, p := range notHumanPrefixes {
			if strings.HasPrefix(text, p) {
				skip = true
			}
		}
		if skip {
			continue
		}
		if name := commandNameRe.FindStringSubmatch(text); name != nil {
			var fields []string
			if n := jsstr.Trim(name[1]); n != "" {
				fields = append(fields, n)
			}
			if args := commandArgsRe.FindStringSubmatch(text); args != nil {
				if a := jsstr.Trim(args[1]); a != "" {
					fields = append(fields, a)
				}
			}
			cleaned = append(cleaned, strings.Join(fields, " "))
		} else {
			cleaned = append(cleaned, text)
		}
	}
	return jsstr.Trim(strings.Join(cleaned, "\n"))
}

func isString(v any) bool { _, ok := v.(string); return ok }

// humanUtterance is the text a human typed in this record, or "" when the record is not a human utterance.
func humanUtterance(r Record) string {
	if r == nil || truthy(r["isSidechain"]) || r["type"] != "user" || truthy(r["isMeta"]) || truthy(r["isCompactSummary"]) {
		return ""
	}
	return humanText(asMap(r["message"])["content"])
}

func clip(text string, max int) string {
	if jsstr.Len(text) <= max {
		return text
	}
	tail := text
	if max != 0 { // slice(-0) is slice(0): the whole text
		tail = jsstr.Tail(text, max)
	}
	return fmt.Sprintf("[前略 %d 字] …%s", jsstr.Len(text)-max, tail)
}

// Turn is one human utterance with the conclusion of the AI reply before it.
type Turn struct {
	Index     int
	Timestamp string
	Human     string
	AI        string
}

// Event is a turn or a compaction marker, in file order.
type Event struct {
	Compact    bool
	Turn       Turn
	Trigger    string
	PreTokens  string // "" when the record had none
	HasTrigger bool
}

// Digest is the squeezed session.
type Digest struct {
	Turns       []Turn
	Events      []Event
	Compactions int
}

func scalarText(v any) string {
	switch x := v.(type) {
	case string:
		return x
	case float64:
		return strconv.FormatFloat(x, 'f', -1, 64)
	case nil:
		return ""
	}
	return fmt.Sprint(v)
}

// Squeeze turns records into a digest.
func Squeeze(records []Record, aiMax int) Digest {
	var d Digest
	var current []string // text said since the last tool call
	fallback := ""       // the last thing said before a tool call, for replies that end on one
	conclusion := func() string {
		if len(current) > 0 {
			return jsstr.Trim(strings.Join(current, "\n"))
		}
		return jsstr.Trim(fallback)
	}
	for _, r := range records {
		if r == nil || truthy(r["isSidechain"]) {
			continue
		}
		if r["type"] == "system" && r["subtype"] == "compact_boundary" {
			d.Compactions++
			meta := asMap(r["compactMetadata"])
			ev := Event{Compact: true}
			if t, ok := meta["trigger"]; ok && t != nil {
				ev.Trigger, ev.HasTrigger = scalarText(t), true
			}
			if p := meta["preTokens"]; truthy(p) {
				ev.PreTokens = scalarText(p)
			}
			d.Events = append(d.Events, ev)
			continue
		}
		if r["type"] == "assistant" {
			msg := asMap(r["message"])
			if msg["model"] == "<synthetic>" {
				continue
			}
			blocks, _ := msg["content"].([]any)
			for _, b := range blocks {
				block := asMap(b)
				switch block["type"] {
				case "tool_use":
					if len(current) > 0 {
						fallback = strings.Join(current, "\n")
					}
					current = nil
				case "text":
					if s, ok := block["text"].(string); ok && jsstr.Trim(s) != "" {
						current = append(current, s)
					}
				}
			}
			continue
		}
		text := humanUtterance(r)
		if text == "" {
			continue
		}
		turn := Turn{Index: len(d.Turns) + 1, Timestamp: str(r["timestamp"]), Human: text, AI: clip(conclusion(), aiMax)}
		current, fallback = nil, ""
		d.Turns = append(d.Turns, turn)
		d.Events = append(d.Events, Event{Turn: turn})
	}
	return d
}

func quote(text string) string {
	lines := strings.Split(text, "\n")
	for i, l := range lines {
		lines[i] = jsstr.TrimEnd("> " + l)
	}
	return strings.Join(lines, "\n")
}

// Render is the digest as text.
func Render(d Digest) string {
	lines := []string{fmt.Sprintf("# 会话摘要：人的发言 %d 条，会话压缩过 %d 次", len(d.Turns), d.Compactions), ""}
	for _, e := range d.Events {
		if e.Compact {
			trigger := "?"
			if e.HasTrigger {
				trigger = e.Trigger
			}
			extra := ""
			if e.PreTokens != "" {
				extra = "，压缩前约 " + e.PreTokens + " token"
			}
			lines = append(lines, fmt.Sprintf("--- 此处会话被压缩（%s%s）；压缩之前的发言上面都在 ---", trigger, extra), "")
			continue
		}
		lines = append(lines, jsstr.TrimEnd(fmt.Sprintf("## %d · %s", e.Turn.Index, e.Turn.Timestamp)), "")
		if e.Turn.AI != "" {
			lines = append(lines, "上一条 AI 回复的结论：", quote(e.Turn.AI), "")
		}
		lines = append(lines, "人：", e.Turn.Human, "")
	}
	return strings.Join(lines, "\n")
}

// Pick is the one file that matches, or why there is none: exactly one is the answer, never "the newest".
type Pick struct {
	OK         bool
	Path       string
	Reason     string // none | ambiguous
	Candidates []string
}

// PickSession judges the files that match.
func PickSession(paths []string) Pick {
	switch len(paths) {
	case 0:
		return Pick{Reason: "none"}
	case 1:
		return Pick{OK: true, Path: paths[0]}
	}
	return Pick{Reason: "ambiguous", Candidates: paths}
}

// FirstHumanUtterance is the first human utterance of a transcript file, reading only as far as it. "" when the
// file has none.
func FirstHumanUtterance(path string) string {
	f, err := os.Open(path)
	if err != nil {
		return ""
	}
	defer f.Close()
	in := func(line []byte) string {
		if jsstr.Trim(string(line)) == "" {
			return ""
		}
		var r Record
		if json.Unmarshal(line, &r) != nil {
			return "" // a half-written line, or noise: skip
		}
		return humanUtterance(r)
	}
	br := bufio.NewReaderSize(f, 64*1024)
	for {
		line, err := br.ReadBytes('\n')
		if t := in(line); t != "" {
			return t
		}
		if err != nil {
			return ""
		}
	}
}

// LocateQuery is what `retro locate` was asked.
type LocateQuery struct {
	Home      string
	SessionID string // --session, else CLAUDE_CODE_SESSION_ID
	Marker    string
	Dir       string // --dir: limits both searches to this one directory
}

// Located is the answer of Locate: the Pick, what was looked for, and where.
type Located struct {
	Pick
	Looked []string
	Where  string
}

func subdirectories(root string) []string {
	entries, err := os.ReadDir(root)
	if err != nil {
		return nil
	}
	var out []string
	for _, e := range entries {
		if e.IsDir() {
			out = append(out, filepath.Join(root, e.Name()))
		}
	}
	return out
}

// Locate names this session's own transcript, never "the newest one that looks right". By session id first: it
// looks for `<ID>.jsonl` in every project directory under ~/.claude/projects, wherever the current directory is.
// With no id, or no such file, it falls back to the marker: the files in every project directory whose first human
// utterance contains it (only the head of each file is read, up to that utterance; a marker that only sits in an AI
// tool call, as in the dispatcher session that wrote a card task, does not count).
func Locate(q LocateQuery) Located {
	root := filepath.Join(q.Home, ".claude", "projects")
	var dirs []string
	var where string
	if q.Dir != "" {
		dirs = []string{q.Dir}
		where = q.Dir
	} else {
		dirs = subdirectories(root)
		where = fmt.Sprintf("%d project directories under %s", len(dirs), root)
	}
	var looked []string
	if q.SessionID != "" {
		looked = append(looked, "session id "+q.SessionID)
		var byID []string
		for _, d := range dirs {
			p := filepath.Join(d, q.SessionID+".jsonl")
			if _, err := os.Stat(p); err == nil {
				byID = append(byID, p)
			}
		}
		if len(byID) > 0 || q.Marker == "" {
			return Located{Pick: PickSession(byID), Looked: looked, Where: where}
		}
	}
	if q.Marker != "" {
		looked = append(looked, fmt.Sprintf(`marker "%s" in the first human utterance`, q.Marker))
		var byMarker []string
		for _, d := range dirs {
			names, err := os.ReadDir(d)
			if err != nil {
				continue
			}
			var files []string
			for _, n := range names {
				if strings.HasSuffix(n.Name(), ".jsonl") {
					files = append(files, n.Name())
				}
			}
			sort.Strings(files)
			for _, n := range files {
				p := filepath.Join(d, n)
				if strings.Contains(FirstHumanUtterance(p), q.Marker) {
					byMarker = append(byMarker, p)
				}
			}
		}
		return Located{Pick: PickSession(byMarker), Looked: looked, Where: where}
	}
	return Located{Pick: Pick{Reason: "none"}, Looked: []string{"nothing (no session id in CLAUDE_CODE_SESSION_ID or --session, no --marker)"}, Where: where}
}

// Why is the sentence `retro locate` stops with when there is no single answer.
func (l Located) Why() string {
	looked := strings.Join(l.Looked, ", then ")
	if l.Reason == "none" {
		return fmt.Sprintf("no transcript found for %s in %s; fall back to export_transcript", looked, l.Where)
	}
	return fmt.Sprintf("%d transcripts match %s in %s: %s; fall back to export_transcript", len(l.Candidates), looked, l.Where, strings.Join(l.Candidates, ", "))
}
