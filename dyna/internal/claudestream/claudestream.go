// Package claudestream reads a `claude -p --output-format stream-json --verbose` event stream.
//
// `dyna agent claude run` and the two eval runners (uiux-research, retro replay) start headless Claude Code
// sessions and need to know what a session did: which tools it called, whether a sub-agent or a browser got
// involved, what it cost. That reading lives here once. Every event carries `parent_tool_use_id`: empty is the
// calling session, anything else is a sub-agent.
package claudestream

import (
	"bufio"
	"encoding/json"
	"errors"
	"io"
	"iter"
	"regexp"
	"strings"
)

// Event is the part of one stream event the readers look at.
type Event struct {
	Type            string          `json:"type"`
	ParentToolUseID any             `json:"parent_tool_use_id"`
	Message         json.RawMessage `json:"message"`
	Result          json.RawMessage `json:"result"`
	TotalCostUSD    *float64        `json:"total_cost_usd"`
	NumTurns        *float64        `json:"num_turns"`
	DurationMs      *float64        `json:"duration_ms"`
	IsError         *bool           `json:"is_error"`
	ModelUsage      json.RawMessage `json:"modelUsage"`
}

type block struct {
	Type string `json:"type"`
	Name string `json:"name"`
}

// ParseEvent reads one line of the stream. A blank line, and a line that is not a JSON object (the last line of a
// run cut off by a timeout), give nil.
func ParseEvent(line string) *Event {
	if strings.TrimSpace(line) == "" {
		return nil
	}
	var ev Event
	if err := json.Unmarshal([]byte(line), &ev); err != nil {
		// A field of an unexpected type leaves the rest readable; anything else is not an event.
		var te *json.UnmarshalTypeError
		if !errors.As(err, &te) {
			return nil
		}
	}
	return &ev
}

// toolUses is the tool_use blocks of an assistant event, in order.
func (ev *Event) toolUses() []block {
	if ev.Type != "assistant" || len(ev.Message) == 0 {
		return nil
	}
	var msg struct {
		Content json.RawMessage `json:"content"`
	}
	if json.Unmarshal(ev.Message, &msg) != nil || len(msg.Content) == 0 {
		return nil
	}
	var blocks []block
	if json.Unmarshal(msg.Content, &blocks) != nil {
		return nil
	}
	var out []block
	for _, b := range blocks {
		if b.Type == "tool_use" {
			out = append(out, b)
		}
	}
	return out
}

// fromSubagent is whether the event came from a sub-agent: its parent_tool_use_id is set (JavaScript truthiness,
// as the old reader had it).
func (ev *Event) fromSubagent() bool {
	switch v := ev.ParentToolUseID.(type) {
	case nil:
		return false
	case string:
		return v != ""
	case bool:
		return v
	case float64:
		return v != 0
	}
	return true
}

// Bucket counts what one party (the calling session, or its sub-agents) did.
type Bucket struct {
	Tools       map[string]int `json:"tools"`
	MobbinCalls int            `json:"mobbinCalls"`
}

// Result is what a session said at the end.
type Result struct {
	Text       string   `json:"text"`
	Cost       *float64 `json:"cost"`
	Turns      *float64 `json:"turns"`
	DurationMs *float64 `json:"durationMs"`
	IsError    bool     `json:"isError"`
	Models     []string `json:"models"`
}

// Digest is the facts about who did what. Result is nil when the stream has no result event.
type Digest struct {
	Session   Bucket  `json:"session"`
	Subagents Bucket  `json:"subagents"`
	Result    *Result `json:"result"`
}

var mobbinTool = regexp.MustCompile(`(?i)^mcp__.*mobbin`)

// Digester condenses a stream one line at a time, so a run can be digested while it is still going.
type Digester struct {
	d Digest
}

// NewDigester starts an empty digest.
func NewDigester() *Digester {
	return &Digester{d: Digest{
		Session:   Bucket{Tools: map[string]int{}},
		Subagents: Bucket{Tools: map[string]int{}},
	}}
}

// Add reads one line.
func (g *Digester) Add(line string) {
	ev := ParseEvent(line)
	if ev == nil {
		return
	}
	g.AddEvent(ev)
}

// AddEvent reads one parsed event.
func (g *Digester) AddEvent(ev *Event) {
	switch ev.Type {
	case "result":
		r := &Result{
			Text:       textOf(ev.Result),
			Cost:       ev.TotalCostUSD,
			Turns:      ev.NumTurns,
			DurationMs: ev.DurationMs,
			Models:     keysOf(ev.ModelUsage),
		}
		if ev.IsError != nil {
			r.IsError = *ev.IsError
		}
		g.d.Result = r
	case "assistant":
		b := &g.d.Session
		if ev.fromSubagent() {
			b = &g.d.Subagents
		}
		for _, t := range ev.toolUses() {
			name := t.Name
			if name == "" {
				name = "undefined"
			}
			b.Tools[name]++
			if mobbinTool.MatchString(name) {
				b.MobbinCalls++
			}
		}
	}
}

// Digest is the digest so far.
func (g *Digester) Digest() Digest { return g.d }

// DigestLines condenses a stream given as lines.
func DigestLines(lines iter.Seq[string]) Digest {
	g := NewDigester()
	for l := range lines {
		g.Add(l)
	}
	return g.Digest()
}

// DigestText condenses a stream given as text.
func DigestText(text string) Digest {
	return DigestLines(func(yield func(string) bool) {
		for _, l := range strings.Split(text, "\n") {
			if !yield(l) {
				return
			}
		}
	})
}

// textOf is a result's text: a string as it is, nothing as "", anything else as its JSON.
func textOf(raw json.RawMessage) string {
	if len(raw) == 0 || string(raw) == "null" {
		return ""
	}
	var s string
	if json.Unmarshal(raw, &s) == nil {
		return s
	}
	return string(raw)
}

// keysOf is an object's keys in the order they were written (a Go map would lose it).
func keysOf(raw json.RawMessage) []string {
	keys := []string{}
	if len(raw) == 0 {
		return keys
	}
	dec := json.NewDecoder(strings.NewReader(string(raw)))
	if tok, err := dec.Token(); err != nil || tok != json.Delim('{') {
		return keys
	}
	for dec.More() {
		tok, err := dec.Token()
		if err != nil {
			break
		}
		key, ok := tok.(string)
		if !ok {
			break
		}
		keys = append(keys, key)
		var skip json.RawMessage
		if dec.Decode(&skip) != nil {
			break
		}
	}
	return keys
}

// Escalation is a session starting a plugin agent or opening a browser.
type Escalation struct {
	Kind string `json:"kind"` // agent | browser
	Tool string `json:"tool"`
}

var browserTool = regexp.MustCompile(`(?i)^mcp__.*(playwright|browser|chrome)`)

// EscalationOfEvent is the first tool call in the event that starts an agent (Agent, or its older name Task) or
// opens a browser (an MCP tool of a playwright, browser or chrome server); nil when there is none.
func EscalationOfEvent(ev *Event) *Escalation {
	if ev == nil {
		return nil
	}
	for _, t := range ev.toolUses() {
		if t.Name == "Agent" || t.Name == "Task" {
			return &Escalation{Kind: "agent", Tool: t.Name}
		}
		if browserTool.MatchString(t.Name) {
			return &Escalation{Kind: "browser", Tool: t.Name}
		}
	}
	return nil
}

// DetectEscalation is the first escalation in a whole stream, or nil.
func DetectEscalation(lines iter.Seq[string]) *Escalation {
	for l := range lines {
		if e := EscalationOfEvent(ParseEvent(l)); e != nil {
			return e
		}
	}
	return nil
}

// Lines reads a possibly huge stream line by line without holding it in memory. The last line counts even
// without a newline. A read error ends the sequence.
func Lines(r io.Reader) iter.Seq[string] {
	return func(yield func(string) bool) {
		br := bufio.NewReaderSize(r, 1<<20)
		for {
			line, err := br.ReadString('\n')
			if len(line) > 0 {
				if !yield(strings.TrimSuffix(line, "\n")) {
					return
				}
			}
			if err != nil {
				return
			}
		}
	}
}
