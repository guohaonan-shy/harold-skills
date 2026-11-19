package claudestream

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"strings"
	"testing"
)

// These are the assertions of the old claude-stream.test.mjs, one for one. The samples are made up; the shapes
// follow what Claude Code 2.1.x really emits.

func toolUse(name string, parent any) map[string]any {
	return map[string]any{
		"type":               "assistant",
		"parent_tool_use_id": parent,
		"message":            map[string]any{"content": []any{map[string]any{"type": "tool_use", "id": "id-" + name, "name": name, "input": map[string]any{}}}},
	}
}

func stream(events ...map[string]any) string {
	var lines []string
	for _, e := range events {
		b, _ := json.Marshal(e)
		lines = append(lines, string(b))
	}
	return strings.Join(lines, "\n")
}

func ptr(f float64) *float64 { return &f }

func TestDigestSeparatesTheCallingSessionFromSubagentsAndCountsReferoCalls(t *testing.T) {
	d := DigestText(stream(
		toolUse("Agent", nil),
		toolUse("mcp__refero__refero_search_screens", "a"),
		toolUse("Bash", "a"),
		map[string]any{"type": "result", "result": "done", "total_cost_usd": 1.5, "num_turns": 3, "duration_ms": 10, "modelUsage": map[string]any{"claude-opus": map[string]any{}}},
	))
	if d.Session.ReferoCalls != 0 || d.Subagents.ReferoCalls != 1 {
		t.Fatalf("refero calls: session %d, subagents %d", d.Session.ReferoCalls, d.Subagents.ReferoCalls)
	}
	if want := map[string]int{"Agent": 1}; !reflect.DeepEqual(d.Session.Tools, want) {
		t.Errorf("session tools = %v", d.Session.Tools)
	}
	if want := map[string]int{"mcp__refero__refero_search_screens": 1, "Bash": 1}; !reflect.DeepEqual(d.Subagents.Tools, want) {
		t.Errorf("subagent tools = %v", d.Subagents.Tools)
	}
	want := &Result{Text: "done", Cost: ptr(1.5), Turns: ptr(3), DurationMs: ptr(10), IsError: false, Models: []string{"claude-opus"}}
	if !reflect.DeepEqual(d.Result, want) {
		t.Errorf("result = %+v, want %+v", d.Result, want)
	}
}

func TestDigestSkipsALastLineCutOffByATimeoutAndBlankLines(t *testing.T) {
	text := stream(toolUse("Read", nil)) + "\n\n" + `{"type":"assistant","message":{"content":[{"type":"tool_u`
	d := DigestText(text)
	if want := map[string]int{"Read": 1}; !reflect.DeepEqual(d.Session.Tools, want) {
		t.Errorf("tools = %v", d.Session.Tools)
	}
	if d.Result != nil {
		t.Errorf("result = %+v, want none", d.Result)
	}
}

func TestDigestTakesAnyIterableOfLinesNotOnlyText(t *testing.T) {
	b, _ := json.Marshal(toolUse("Read", nil))
	d := DigestLines(slices.Values([]string{string(b), string(b)}))
	if want := map[string]int{"Read": 2}; !reflect.DeepEqual(d.Session.Tools, want) {
		t.Errorf("tools = %v", d.Session.Tools)
	}
}

func TestLinesYieldsAFileLineByLineIncludingALastLineWithNoNewline(t *testing.T) {
	a, _ := json.Marshal(toolUse("Read", nil))
	b, _ := json.Marshal(toolUse("Edit", nil))
	f := filepath.Join(t.TempDir(), "s.jsonl")
	if err := os.WriteFile(f, []byte(string(a)+"\n"+string(b)), 0o644); err != nil {
		t.Fatal(err)
	}
	h, err := os.Open(f)
	if err != nil {
		t.Fatal(err)
	}
	defer h.Close()
	lines := slices.Collect(Lines(h))
	if len(lines) != 2 {
		t.Fatalf("lines = %d, want 2", len(lines))
	}
	d := DigestLines(slices.Values(lines))
	if want := map[string]int{"Read": 1, "Edit": 1}; !reflect.DeepEqual(d.Session.Tools, want) {
		t.Errorf("tools = %v", d.Session.Tools)
	}
}

func TestDetectEscalationReportsNothingForARunThatOnlyReadsAndWritesFiles(t *testing.T) {
	text := stream(toolUse("Read", nil), toolUse("Bash", nil), toolUse("Skill", nil))
	if e := DetectEscalation(slices.Values(strings.Split(text, "\n"))); e != nil {
		t.Errorf("escalation = %+v, want none", e)
	}
}

func TestDetectEscalationReportsTheFirstAgentTheSessionStarted(t *testing.T) {
	text := stream(toolUse("Read", nil), toolUse("Agent", nil), toolUse("mcp__playwright__browser_navigate", nil))
	e := DetectEscalation(slices.Values(strings.Split(text, "\n")))
	if want := (&Escalation{Kind: "agent", Tool: "Agent"}); !reflect.DeepEqual(e, want) {
		t.Errorf("escalation = %+v, want %+v", e, want)
	}
}

func TestDetectEscalationReportsABrowserWhicheverBrowserToolFamilyOpenedIt(t *testing.T) {
	for _, name := range []string{"mcp__playwright__browser_navigate", "mcp__Claude_Browser__navigate", "mcp__claude-in-chrome__navigate", "mcp__plugin_idea-loop_playwright__browser_snapshot"} {
		e := DetectEscalation(slices.Values(strings.Split(stream(toolUse(name, nil)), "\n")))
		if want := (&Escalation{Kind: "browser", Tool: name}); !reflect.DeepEqual(e, want) {
			t.Errorf("%s: escalation = %+v, want %+v", name, e, want)
		}
	}
}

func TestAToolThatMerelyHasAgentOrBrowserInItsNameIsNotAnEscalation(t *testing.T) {
	text := stream(toolUse("Bash", nil), toolUse("mcp__refero__refero_search_screens", nil), toolUse("mcp__x__reagent_check", nil))
	if e := DetectEscalation(slices.Values(strings.Split(text, "\n"))); e != nil {
		t.Errorf("escalation = %+v, want none", e)
	}
}

func TestEscalationOfEventReadsOneEventSoARunnerCanStopARunMidStream(t *testing.T) {
	line := func(e map[string]any) *Event {
		b, _ := json.Marshal(e)
		return ParseEvent(string(b))
	}
	if e := EscalationOfEvent(line(toolUse("Read", nil))); e != nil {
		t.Errorf("Read: %+v", e)
	}
	if e := EscalationOfEvent(line(toolUse("Task", nil))); !reflect.DeepEqual(e, &Escalation{Kind: "agent", Tool: "Task"}) {
		t.Errorf("Task: %+v", e)
	}
	if e := EscalationOfEvent(line(map[string]any{"type": "result", "result": "x"})); e != nil {
		t.Errorf("result: %+v", e)
	}
	if e := EscalationOfEvent(nil); e != nil {
		t.Errorf("nil: %+v", e)
	}
}

// Beyond the old assertions: the digest is what the runners write into digest.json, so its JSON keeps the old names.
func TestDigestJSONKeepsTheNamesTheRunnersWrite(t *testing.T) {
	d := DigestText(stream(toolUse("Read", nil)) + "\n" + `{"type":"result","result":"ok","modelUsage":{"b":1,"a":2}}`)
	b, err := json.Marshal(d)
	if err != nil {
		t.Fatal(err)
	}
	var got map[string]any
	if err := json.Unmarshal(b, &got); err != nil {
		t.Fatal(err)
	}
	res := got["result"].(map[string]any)
	for _, k := range []string{"text", "cost", "turns", "durationMs", "isError", "models"} {
		if _, ok := res[k]; !ok {
			t.Errorf("result has no %q: %s", k, b)
		}
	}
	if res["cost"] != nil {
		t.Errorf("a missing cost is null, got %v", res["cost"])
	}
	if !reflect.DeepEqual(d.Result.Models, []string{"b", "a"}) {
		t.Errorf("models keep the order they were written in: %v", d.Result.Models)
	}
	if _, ok := got["session"].(map[string]any)["referoCalls"]; !ok {
		t.Errorf("session has no referoCalls: %s", b)
	}
}

func TestAnEventWithAFieldOfTheWrongTypeStillCounts(t *testing.T) {
	// a user event's content is a string, not a list; the event is not a tool call, and nothing breaks
	text := `{"type":"user","message":{"content":"hello"}}` + "\n" + `{"type":"assistant","parent_tool_use_id":null,"message":{"content":"text only"}}`
	d := DigestText(text)
	if len(d.Session.Tools) != 0 || len(d.Subagents.Tools) != 0 {
		t.Errorf("tools = %v / %v", d.Session.Tools, d.Subagents.Tools)
	}
}
