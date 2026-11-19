// Package critic is `dyna design critic round`: one round of the design critic loop. It checks the critic's output
// and decides whether to stop.
//
// The critic (`idea-loop:ui-master`) is a senior designer from a top studio. It names the biggest gaps between this
// version and what such a studio would ship, and puts one score on the round: 10 when there is nothing it would
// touch, 9 and up when the studio would ship it as-is. The score is its judgement; this does not second-guess it.
// It only holds the output to a closed shape and turns the round into a stop decision:
//
//   - 方向 (direction): a gap is about the direction itself, so the next move is not another polish pass;
//   - 通过 (pass): the score reached the threshold;
//   - 瓶颈 (bottleneck): three rounds in a row without beating the best score before them;
//   - 继续 (continue): otherwise.
//
// Each gap carries a `kind` the loop routes on: direction → reopen the direction, pattern → judgment first, else a
// suggested research question, craft → fix in place. Items the human chose to keep are handed to the critic as input
// ("not a gap"), so they never reach the score in the first place.
package critic

import (
	"fmt"
	"math"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/design/jsx"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/miniyaml"
)

// Kinds are what a gap asks for. Closed set; each routes to a different place in the loop.
var Kinds = []string{"direction", "pattern", "craft"}

// FindingFields is what every finding carries, exactly.
var FindingFields = []string{"kind", "where", "detail", "why"}

// StopThreshold is the score from which a studio would ship it as-is. The critic is told this number.
const StopThreshold = 9

// Plateau is the number of rounds in a row without a new best before it is a bottleneck.
const Plateau = 3

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

// ValidateFindings is one human-readable error per violation, none when the findings are well-formed. findings is a
// value read from JSON (a []any of *miniyaml.Map).
func ValidateFindings(findings any) []string {
	list, ok := findings.([]any)
	if !ok {
		return []string{"findings must be an array"}
	}
	errs := []string{}
	for i, f := range list {
		at := fmt.Sprintf("findings[%d]", i)
		m, ok := f.(*miniyaml.Map)
		if !ok {
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
				errs = append(errs, fmt.Sprintf("%s: kind \"%s\" is not one of %s", at, miniyaml.Text(m.Get("kind")), "direction / pattern / craft"))
			}
		}
		for _, field := range []string{"where", "detail", "why"} {
			if m.Has(field) {
				if _, isStr := m.Get(field).(string); !isStr {
					errs = append(errs, fmt.Sprintf("%s: %s must be a string", at, field))
				}
			}
		}
	}
	return errs
}

// IsPlateau is three rounds in a row, each no better than the best score before it.
func IsPlateau(scores []float64) bool {
	if len(scores) < Plateau+1 {
		return false
	}
	for k := 0; k < Plateau; k++ {
		s := scores[len(scores)-Plateau+k]
		best := math.Inf(-1)
		for _, b := range scores[:len(scores)-Plateau+k] {
			best = math.Max(best, b)
		}
		if !(s <= best) {
			return false
		}
	}
	return true
}

// Result is one round judged. Stop is 方向 / 通过 / 瓶颈 / 继续, empty on an invalid round.
type Result struct {
	Valid  bool
	Errors []string
	Stop   string
}

// scoreText is JSON.stringify(score), "undefined" for a score that was not there.
func scoreText(present bool, score any) string {
	if !present {
		return "undefined"
	}
	return jsx.Stringify(score)
}

// CheckRound checks one round and decides. findings, score and history are the values of the round file (score
// present is false when the file had no score at all).
func CheckRound(findings any, scorePresent bool, score any, history any) Result {
	errs := ValidateFindings(findings)
	n, isNum := score.(float64)
	if !scorePresent || !isNum || !isInteger(score) || n < 1 || n > 10 {
		errs = append(errs, fmt.Sprintf("score must be an integer 1–10, got %s", scoreText(scorePresent, score)))
	}
	var past []float64
	badHistory := false
	if h, ok := history.([]any); ok {
		for _, s := range h {
			if !isInteger(s) {
				badHistory = true
				break
			}
			past = append(past, s.(float64))
		}
	}
	if badHistory {
		errs = append(errs, "history must be the previous rounds' scores, integers, oldest first")
	}
	if len(errs) > 0 {
		return Result{Errors: errs}
	}
	for _, f := range findings.([]any) {
		if f.(*miniyaml.Map).Get("kind") == "direction" {
			return Result{Valid: true, Errors: []string{}, Stop: "方向"}
		}
	}
	if n >= StopThreshold {
		return Result{Valid: true, Errors: []string{}, Stop: "通过"}
	}
	if IsPlateau(append(append([]float64{}, past...), n)) {
		return Result{Valid: true, Errors: []string{}, Stop: "瓶颈"}
	}
	return Result{Valid: true, Errors: []string{}, Stop: "继续"}
}

// Render is the round as the text a person reads. score is the score as the file had it.
func Render(r Result, file string, score any) string {
	at := ""
	if file != "" {
		at = " (" + file + ")"
	}
	if !r.Valid {
		lines := []string{"critic-round: 本轮无效" + at + "，重新起一个评委："}
		for _, e := range r.Errors {
			lines = append(lines, "  - "+e)
		}
		return joinLines(lines)
	}
	return "critic-round: 有效" + at + "\n  分数：" + miniyaml.Text(score) + "　停止判定：" + r.Stop
}

func joinLines(lines []string) string {
	out := ""
	for i, l := range lines {
		if i > 0 {
			out += "\n"
		}
		out += l
	}
	return out
}
