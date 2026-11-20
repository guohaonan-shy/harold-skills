// Package critic is `dyna design critic round`: one round of the design critic, checking the shape of what the critic
// (`idea-loop:ui-master`) handed back.
//
// The critic is an advisor. It lists the gaps it sees, assesses each of the human's lines of reasoning for this round,
// and puts a 1–10 score on the version. The score is its opinion; whether the loop goes on or stops is the human's
// call, so this package decides nothing about that. It does two things:
//
//   - holds the output to a closed shape: every field present, no unknown field, enums in range, every `state` a name
//     from this version's state list (the report opens that state by name), and exactly the human's reasoning ids
//     assessed, each once;
//   - points out the `direction` findings, which the human is told about before signing.
//
// What the critic hands back:
//
//	{
//	  findings:  [{ kind: direction | pattern | craft, state, where, detail, why, reference }],
//	  reasoning: [{ id, verdict: 成立 | 存疑, why }],
//	  score:     1–10,
//	  note:      string | null
//	}
//
// The state list and the reasoning ids to assess come from the session, as a second input (`{ states, thoughts }`):
// thoughts the human kept after discussion are left out of it.
//
// Pure: no browser, no model, no clock, no filesystem.
package critic

import (
	"errors"
	"fmt"
	"math"
	"strings"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/design/jsx"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/frontmatter"
)

// Kinds are what a gap asks for. Closed set; each routes to a different place in the loop.
var Kinds = []string{"direction", "pattern", "craft"}

// FindingFields is what every finding carries, exactly.
var FindingFields = []string{"kind", "state", "where", "detail", "why", "reference"}

// Verdicts are the critic's verdicts on one of the human's lines of reasoning.
var Verdicts = []string{"成立", "存疑"}

// ReasoningFields is what every reasoning item carries, exactly.
var ReasoningFields = []string{"id", "verdict", "why"}

// RoundFields is the top level of the critic's output.
var RoundFields = []string{"findings", "reasoning", "score", "note"}

func contains(xs []string, x string) bool {
	for _, y := range xs {
		if y == x {
			return true
		}
	}
	return false
}

func isInteger(v any) bool {
	f, ok := v.(float64)
	return ok && !math.IsInf(f, 0) && !math.IsNaN(f) && f == math.Trunc(f)
}

// isText is a string with something other than whitespace in it.
func isText(v any) bool {
	s, ok := v.(string)
	return ok && strings.TrimSpace(s) != ""
}

// idKey is a reasoning id as text: ids may be written as 1 or "1" and are compared as text. ok is false for anything
// that is neither a string nor an integer.
func idKey(id any) (string, bool) {
	if s, ok := id.(string); ok {
		return s, true
	}
	if isInteger(id) {
		return frontmatter.Text(id), true
	}
	return "", false
}

// Context is what the session supplies with every round: the state names of this version and the reasoning ids to
// assess (as text).
type Context struct {
	States   []string
	Thoughts []string
}

// ValidateContext reads `{ states, thoughts }`; the errors say what is wrong with it (none when it is well-formed).
func ValidateContext(v any) (Context, []string) {
	m, ok := v.(*frontmatter.Map)
	if !ok || m == nil {
		return Context{}, []string{"context must be an object { states, thoughts }"}
	}
	var c Context
	var errs []string
	states, ok := m.Get("states").([]any)
	for _, s := range states {
		if !isText(s) {
			ok = false
			break
		}
		c.States = append(c.States, s.(string))
	}
	if !ok {
		errs = append(errs, "context.states must be an array of state names")
	}
	thoughts, ok := m.Get("thoughts").([]any)
	for _, t := range thoughts {
		k, isID := idKey(t)
		if !isID {
			ok = false
			break
		}
		c.Thoughts = append(c.Thoughts, k)
	}
	if !ok {
		errs = append(errs, "context.thoughts must be an array of reasoning ids (strings or integers)")
	}
	return c, errs
}

// ValidateFindings is one human-readable error per violation, none when the findings are well-formed. findings is a
// value read from JSON (a []any of *frontmatter.Map).
func ValidateFindings(findings any, states []string) []string {
	list, ok := findings.([]any)
	if !ok {
		return []string{"findings must be an array"}
	}
	errs := []string{}
	for i, f := range list {
		at := fmt.Sprintf("findings[%d]", i)
		m, ok := f.(*frontmatter.Map)
		if !ok || m == nil {
			errs = append(errs, at+": must be an object")
			continue
		}
		for _, field := range FindingFields {
			if !m.Has(field) {
				errs = append(errs, fmt.Sprintf("%s: missing field \"%s\"", at, field))
			}
		}
		for _, field := range m.Keys() {
			if !contains(FindingFields, field) {
				errs = append(errs, fmt.Sprintf("%s: unknown field \"%s\"", at, field))
			}
		}
		if m.Has("kind") {
			if s, isStr := m.Get("kind").(string); !isStr || !contains(Kinds, s) {
				errs = append(errs, fmt.Sprintf("%s: kind \"%s\" is not one of %s", at, frontmatter.Text(m.Get("kind")), strings.Join(Kinds, " / ")))
			}
		}
		for _, field := range []string{"state", "where", "detail", "why", "reference"} {
			if m.Has(field) && !isText(m.Get(field)) {
				errs = append(errs, fmt.Sprintf("%s: %s must be a non-empty string", at, field))
			}
		}
		if st := m.Get("state"); isText(st) && !contains(states, st.(string)) {
			errs = append(errs, fmt.Sprintf("%s: state \"%s\" is not in this version's state list (%s)", at, st.(string), strings.Join(states, " / ")))
		}
	}
	return errs
}

// ValidateReasoning checks that the reasoning items cover exactly the ids the human wrote this round, each once.
func ValidateReasoning(reasoning any, thoughts []string) []string {
	list, ok := reasoning.([]any)
	if !ok {
		return []string{"reasoning must be an array"}
	}
	errs := []string{}
	var seen []string
	for i, r := range list {
		at := fmt.Sprintf("reasoning[%d]", i)
		m, ok := r.(*frontmatter.Map)
		if !ok || m == nil {
			errs = append(errs, at+": must be an object")
			continue
		}
		for _, field := range ReasoningFields {
			if !m.Has(field) {
				errs = append(errs, fmt.Sprintf("%s: missing field \"%s\"", at, field))
			}
		}
		for _, field := range m.Keys() {
			if !contains(ReasoningFields, field) {
				errs = append(errs, fmt.Sprintf("%s: unknown field \"%s\"", at, field))
			}
		}
		if m.Has("verdict") {
			if s, isStr := m.Get("verdict").(string); !isStr || !contains(Verdicts, s) {
				errs = append(errs, fmt.Sprintf("%s: verdict \"%s\" is not one of %s", at, frontmatter.Text(m.Get("verdict")), strings.Join(Verdicts, " / ")))
			}
		}
		if m.Has("why") && !isText(m.Get("why")) {
			errs = append(errs, at+": why must be a non-empty string")
		}
		if m.Has("id") {
			key, ok := idKey(m.Get("id"))
			switch {
			case !ok:
				errs = append(errs, at+": id must be a string or an integer")
			case !contains(thoughts, key):
				none := strings.Join(thoughts, " / ")
				if none == "" {
					none = "none"
				}
				errs = append(errs, fmt.Sprintf("%s: id \"%s\" is not one of this round's reasoning (%s)", at, key, none))
			case contains(seen, key):
				errs = append(errs, fmt.Sprintf("%s: id \"%s\" is assessed twice", at, key))
			default:
				seen = append(seen, key)
			}
		}
	}
	for _, id := range thoughts {
		if !contains(seen, id) {
			errs = append(errs, fmt.Sprintf("reasoning: id \"%s\" has no assessment", id))
		}
	}
	return errs
}

// Direction is one direction finding; N is its 1-based place in `findings`.
type Direction struct {
	N      int    `json:"n"`
	State  string `json:"state"`
	Where  string `json:"where"`
	Detail string `json:"detail"`
}

// Result is one round checked. Score is nil and Direction empty on an invalid round.
type Result struct {
	Valid     bool        `json:"valid"`
	Errors    []string    `json:"errors"`
	Score     *float64    `json:"score"`
	Direction []Direction `json:"direction"`
}

// CheckRound checks one round. round is the critic's JSON, parsed (missing is true when there was no value at all);
// context is `{ states, thoughts }` from the session. A malformed context is the caller's error, not an invalid round.
func CheckRound(round any, context any) (Result, error) {
	c, cerrs := ValidateContext(context)
	if len(cerrs) > 0 {
		return Result{}, errors.New(strings.Join(cerrs, "; "))
	}
	m, ok := round.(*frontmatter.Map)
	if !ok || m == nil {
		return Result{Errors: []string{"the critic output must be a JSON object"}, Direction: []Direction{}}, nil
	}
	errs := []string{}
	for _, field := range RoundFields {
		if !m.Has(field) {
			errs = append(errs, fmt.Sprintf("missing field \"%s\"", field))
		}
	}
	for _, field := range m.Keys() {
		if !contains(RoundFields, field) {
			errs = append(errs, fmt.Sprintf("unknown field \"%s\"", field))
		}
	}
	errs = append(errs, ValidateFindings(m.Get("findings"), c.States)...)
	errs = append(errs, ValidateReasoning(m.Get("reasoning"), c.Thoughts)...)
	score := m.Get("score")
	n, _ := score.(float64)
	if !isInteger(score) || n < 1 || n > 10 {
		got := "undefined"
		if m.Has("score") {
			got = jsx.Stringify(score)
		}
		errs = append(errs, "score must be an integer 1–10, got "+got)
	}
	if m.Has("note") {
		if note := m.Get("note"); note != nil {
			if _, isStr := note.(string); !isStr {
				errs = append(errs, "note must be a string or null")
			}
		}
	}
	if len(errs) > 0 {
		return Result{Errors: errs, Direction: []Direction{}}, nil
	}
	direction := []Direction{}
	for i, f := range m.Get("findings").([]any) {
		fm := f.(*frontmatter.Map)
		if fm.Get("kind") == "direction" {
			direction = append(direction, Direction{N: i + 1, State: fm.Get("state").(string), Where: fm.Get("where").(string), Detail: fm.Get("detail").(string)})
		}
	}
	return Result{Valid: true, Errors: []string{}, Score: &n, Direction: direction}, nil
}

// Render is the round as the text a person reads.
func Render(r Result, file string) string {
	at := ""
	if file != "" {
		at = " (" + file + ")"
	}
	if !r.Valid {
		lines := []string{"critic-round: 不合格，作废这一轮、重新评" + at + "："}
		for _, e := range r.Errors {
			lines = append(lines, "  - "+e)
		}
		return strings.Join(lines, "\n")
	}
	direction := "无"
	if len(r.Direction) > 0 {
		parts := make([]string, len(r.Direction))
		for i, d := range r.Direction {
			parts[i] = fmt.Sprintf("#%d %s · %s", d.N, d.State, d.Where)
		}
		direction = fmt.Sprintf("%d 条：%s", len(r.Direction), strings.Join(parts, "；"))
	}
	return "critic-round: 合格" + at + "\n  分数：" + frontmatter.Text(*r.Score) + "　方向性意见：" + direction
}
