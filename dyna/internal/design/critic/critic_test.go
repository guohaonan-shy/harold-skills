package critic

import (
	"bytes"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/design/jsx"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/nexterr"
)

func parse(t *testing.T, text string) any {
	t.Helper()
	v, err := jsx.ParseJSON([]byte(text))
	if err != nil {
		t.Fatal(err)
	}
	return v
}

// The state list of this canvas version and the reasoning ids the human wrote this round.
const contextJSON = `{"states":["首页 · 默认态","首页 · 加载中","详情 · 默认态"],"thoughts":["1.1","1.2"]}`

var states = []string{"首页 · 默认态", "首页 · 加载中", "详情 · 默认态"}
var thoughts = []string{"1.1", "1.2"}

// obj builds a JSON object from key, raw-JSON-value pairs; a value of "" drops the key.
func obj(kv ...string) string {
	var parts []string
	for i := 0; i+1 < len(kv); i += 2 {
		if kv[i+1] == "" {
			continue
		}
		parts = append(parts, `"`+kv[i]+`":`+kv[i+1])
	}
	return "{" + strings.Join(parts, ",") + "}"
}

// override replaces or adds pairs in a base list.
func override(base []string, kv ...string) []string {
	out := append([]string(nil), base...)
	for i := 0; i+1 < len(kv); i += 2 {
		found := false
		for j := 0; j+1 < len(out); j += 2 {
			if out[j] == kv[i] {
				out[j+1] = kv[i+1]
				found = true
			}
		}
		if !found {
			out = append(out, kv[i], kv[i+1])
		}
	}
	return out
}

func finding(kind string, kv ...string) string {
	return obj(override([]string{"kind", `"` + kind + `"`, "state", `"首页 · 默认态"`, "where", `"顶部卡片"`, "detail", `"标题和数字一样重"`, "why", `"眼睛落不到要看的数字上"`, "reference", `"一张把数字放大到标题两倍的看板截图"`}, kv...)...)
}

func thought(id, verdict string, kv ...string) string {
	return obj(override([]string{"id", id, "verdict", `"` + verdict + `"`, "why", `"卡片确实是用户先看的东西"`}, kv...)...)
}

func arr(xs ...string) string { return "[" + strings.Join(xs, ",") + "]" }

func round(kv ...string) string {
	return obj(override([]string{"findings", arr(finding("craft")), "reasoning", arr(thought(`"1.1"`, "成立"), thought(`"1.2"`, "存疑")), "score", "7", "note", "null"}, kv...)...)
}

func check(t *testing.T, r string, ctx ...string) Result {
	t.Helper()
	c := contextJSON
	if len(ctx) > 0 {
		c = ctx[0]
	}
	res, err := CheckRound(parse(t, r), parse(t, c))
	if err != nil {
		t.Fatal(err)
	}
	return res
}

func joined(errs []string) string { return strings.Join(errs, ",") }

func match(t *testing.T, s, re string) {
	t.Helper()
	if !regexp.MustCompile(re).MatchString(s) {
		t.Errorf("%q does not match %s", s, re)
	}
}

func TestAWellFormedRoundIsValidAndSaysWhichFindingsAreDirection(t *testing.T) {
	ok := check(t, round())
	if !ok.Valid || len(ok.Errors) != 0 || ok.Score == nil || *ok.Score != 7 || len(ok.Direction) != 0 {
		t.Fatalf("%+v", ok)
	}
	withDirection := check(t, round("findings", arr(finding("craft"), finding("direction", "state", `"详情 · 默认态"`, "where", `"整页版式"`), finding("pattern"), finding("direction"))))
	if !withDirection.Valid {
		t.Fatal(withDirection.Errors)
	}
	want := []Direction{{2, "详情 · 默认态", "整页版式", "标题和数字一样重"}, {4, "首页 · 默认态", "顶部卡片", "标题和数字一样重"}}
	if len(withDirection.Direction) != 2 || withDirection.Direction[0] != want[0] || withDirection.Direction[1] != want[1] {
		t.Fatalf("%+v", withDirection.Direction)
	}
}

func TestNoGapsAndNoReasoningToAssessIsAValidRound(t *testing.T) {
	if r := check(t, `{"findings":[],"reasoning":[],"score":10,"note":"没有想动的地方"}`, `{"states":["首页 · 默认态"],"thoughts":[]}`); !r.Valid {
		t.Fatal(r.Errors)
	}
}

func TestAFindingMissingAFieldOrCarryingAnUnknownOneIsRejected(t *testing.T) {
	noReference := finding("craft", "reference", "")
	match(t, joined(ValidateFindings(parse(t, arr(noReference)), states)), `missing field "reference"`)
	match(t, joined(ValidateFindings(parse(t, arr(finding("craft", "state", ""))), states)), `missing field "state"`)
	match(t, joined(ValidateFindings(parse(t, arr(finding("craft", "severity", `"P1"`))), states)), `unknown field "severity"`)
	if check(t, round("findings", arr(noReference))).Valid {
		t.Error("a finding without reference made a valid round")
	}
	if e := ValidateFindings(parse(t, `"x"`), states); e[0] != "findings must be an array" {
		t.Error(e)
	}
}

func TestAFindingWithAnEmptyOrNonStringFieldIsRejected(t *testing.T) {
	match(t, joined(ValidateFindings(parse(t, arr(finding("craft", "reference", `""`))), states)), `reference must be a non-empty string`)
	match(t, joined(ValidateFindings(parse(t, arr(finding("craft", "reference", `"  "`))), states)), `reference must be a non-empty string`)
	match(t, joined(ValidateFindings(parse(t, arr(finding("craft", "where", `null`))), states)), `where must be a non-empty string`)
}

func TestAKindOutsideDirectionPatternCraftIsRejected(t *testing.T) {
	match(t, joined(ValidateFindings(parse(t, arr(finding("taste"))), states)), `kind "taste"`)
	if check(t, round("findings", arr(finding("taste")))).Valid {
		t.Error("valid")
	}
}

func TestAStateThatIsNotInTheStateListIsRejected(t *testing.T) {
	match(t, joined(ValidateFindings(parse(t, arr(finding("craft", "state", `"设置 · 默认态"`))), states)), `state "设置 · 默认态" is not in this version's state list`)
	if check(t, round("findings", arr(finding("craft", "state", `"设置 · 默认态"`)))).Valid {
		t.Error("valid")
	}
}

func TestAScoreOutside1To10OrNotAnIntegerIsRejected(t *testing.T) {
	for _, score := range []string{"0", "11", "7.5", `"8"`, "null"} {
		if check(t, round("score", score)).Valid {
			t.Errorf("score %s is valid", score)
		}
	}
	noScore := `{"findings":[],"reasoning":[{"id":"1.1","verdict":"成立","why":"x"},{"id":"1.2","verdict":"成立","why":"x"}],"note":null}`
	r := check(t, noScore)
	if r.Valid || !strings.Contains(joined(r.Errors), "score must be an integer 1–10, got undefined") {
		t.Errorf("%+v", r)
	}
	for _, score := range []string{"1", "10"} {
		if !check(t, round("score", score)).Valid {
			t.Errorf("score %s is invalid", score)
		}
	}
}

func TestAVerdictOutsideTheTwoIsRejected(t *testing.T) {
	match(t, joined(ValidateReasoning(parse(t, arr(thought(`"1.1"`, "同意"), thought(`"1.2"`, "成立"))), thoughts)), `verdict "同意"`)
	if check(t, round("reasoning", arr(thought(`"1.1"`, "同意"), thought(`"1.2"`, "成立")))).Valid {
		t.Error("valid")
	}
}

func TestAReasoningItemMissingAFieldOrCarryingAnUnknownOneIsRejected(t *testing.T) {
	match(t, joined(ValidateReasoning(parse(t, arr(thought(`"1.1"`, "成立", "why", ""), thought(`"1.2"`, "成立"))), thoughts)), `missing field "why"`)
	match(t, joined(ValidateReasoning(parse(t, arr(thought(`"1.1"`, "成立", "score", "3"), thought(`"1.2"`, "成立"))), thoughts)), `unknown field "score"`)
}

func TestAReasoningIdTheCriticSkippedIsRejected(t *testing.T) {
	match(t, joined(ValidateReasoning(parse(t, arr(thought(`"1.1"`, "成立"))), thoughts)), `id "1\.2" has no assessment`)
	if check(t, round("reasoning", arr(thought(`"1.1"`, "成立")))).Valid {
		t.Error("valid")
	}
}

func TestAReasoningIdTheHumanDidNotWriteThisRoundIsRejected(t *testing.T) {
	three := arr(thought(`"1.1"`, "成立"), thought(`"1.2"`, "成立"), thought(`"0.3"`, "成立"))
	match(t, joined(ValidateReasoning(parse(t, three), thoughts)), `id "0\.3" is not one of this round's reasoning`)
	if check(t, round("reasoning", three)).Valid {
		t.Error("valid")
	}
	match(t, joined(ValidateReasoning(parse(t, arr(thought(`"1.1"`, "成立"), thought(`"1.1"`, "成立"), thought(`"1.2"`, "成立"))), thoughts)), `id "1\.1" is assessed twice`)
}

func TestReasoningIdsCompareAsText(t *testing.T) {
	r := check(t, round("reasoning", arr(thought("1", "成立"), thought(`"2"`, "成立"))), `{"states":["首页 · 默认态"],"thoughts":["1",2]}`)
	if !r.Valid {
		t.Fatal(r.Errors)
	}
}

func TestAMissingOrUnknownTopLevelFieldIsRejected(t *testing.T) {
	match(t, joined(check(t, round("note", "")).Errors), `missing field "note"`)
	match(t, joined(check(t, round("history", "[6,7]")).Errors), `unknown field "history"`)
	if check(t, `"x"`).Valid || check(t, `null`).Valid {
		t.Error("a non-object round is valid")
	}
}

func TestAMalformedContextIsACallerErrorNotAnInvalidRound(t *testing.T) {
	if _, err := CheckRound(parse(t, round()), parse(t, `{"states":"x","thoughts":[]}`)); err == nil || !strings.Contains(err.Error(), "context.states") {
		t.Error(err)
	}
	if _, err := CheckRound(parse(t, round()), nil); err == nil || !strings.Contains(err.Error(), "context must be an object") {
		t.Error(err)
	}
}

// ---- the command ----

func run(args ...string) (out, errs string, code int) {
	c := Command()
	var o, e bytes.Buffer
	c.SetArgs(args)
	c.SetOut(&o)
	c.SetErr(&e)
	if err := c.Execute(); err != nil {
		var ex *nexterr.Exit
		if errors.As(err, &ex) {
			if ex.Msg != "" {
				e.WriteString(ex.Msg + "\n")
			}
			return o.String(), e.String(), ex.Code
		}
		return o.String(), e.String() + err.Error(), 1
	}
	return o.String(), e.String(), 0
}

func TestTheCommandExits0AndNamesTheDirectionFindingsOrExits2OnAnInvalidRound(t *testing.T) {
	dir := t.TempDir()
	put := func(name, text string) string {
		p := filepath.Join(dir, name)
		os.WriteFile(p, []byte(text), 0o644)
		return p
	}
	ctx := put("context.json", contextJSON)
	ok := put("ok.json", round("findings", arr(finding("craft"), finding("direction"))))
	bad := put("bad.json", round("findings", arr(finding("craft", "state", `"不存在"`))))

	out, _, code := run(ok, "--context", ctx)
	if code != 0 {
		t.Fatal(code, out)
	}
	match(t, out, `合格`)
	match(t, out, `分数：7`)
	match(t, out, `方向性意见：1 条：#2 首页 · 默认态 · 顶部卡片`)
	out, _, _ = run(ok, "--context", ctx, "--json")
	var parsed struct {
		Valid     bool
		Direction []struct{ N int }
	}
	if err := json.Unmarshal([]byte(out), &parsed); err != nil || !parsed.Valid || len(parsed.Direction) != 1 || parsed.Direction[0].N != 2 {
		t.Fatal(err, out)
	}

	out, _, code = run(put("none.json", round()), "--context", ctx)
	if code != 0 {
		t.Fatal(code)
	}
	match(t, out, `方向性意见：无`)

	out, _, code = run(bad, "--context", ctx)
	if code != 2 {
		t.Fatal(code, out)
	}
	match(t, out, `不合格`)
	match(t, out, `state "不存在"`)
}

func TestTheCommandExits1WithoutTheContextOrWithAnUnreadableOne(t *testing.T) {
	dir := t.TempDir()
	ok := filepath.Join(dir, "ok.json")
	os.WriteFile(ok, []byte(round()), 0o644)
	broken := filepath.Join(dir, "broken.json")
	os.WriteFile(broken, []byte(`{ not json`), 0o644)
	wrong := filepath.Join(dir, "wrong.json")
	os.WriteFile(wrong, []byte(`{"states":"x"}`), 0o644)
	if _, _, code := run(ok); code != 1 {
		t.Error("no context:", code)
	}
	if _, errs, code := run(ok, "--context", broken); code != 1 || !strings.Contains(errs, "cannot read") {
		t.Error("broken context:", code, errs)
	}
	if _, errs, code := run(ok, "--context", wrong); code != 1 || !strings.Contains(errs, "bad context") {
		t.Error("wrong context:", code, errs)
	}
	if _, _, code := run(); code != 1 {
		t.Error("nothing:", code)
	}
	if _, _, code := run(filepath.Join(dir, "nope.json"), "--context", ok); code != 1 {
		t.Error("missing file:", code)
	}
}

func TestTheCommandDecidesNothingAboutStopping(t *testing.T) {
	dir := t.TempDir()
	ctx := filepath.Join(dir, "context.json")
	os.WriteFile(ctx, []byte(contextJSON), 0o644)
	for name, score := range map[string]string{"hi": "10", "lo": "2", "bad": "99"} {
		f := filepath.Join(dir, name+".json")
		os.WriteFile(f, []byte(round("score", score)), 0o644)
		out, _, _ := run(f, "--context", ctx)
		if regexp.MustCompile(`通过|瓶颈|继续|停止`).MatchString(out) {
			t.Errorf("%s: %s", name, out)
		}
	}
}

func TestTheJSONOutputKeepsItsKeysInOrder(t *testing.T) {
	dir := t.TempDir()
	ctx := filepath.Join(dir, "context.json")
	os.WriteFile(ctx, []byte(`{"states":["首页 · 默认态"],"thoughts":[]}`), 0o644)
	ok := filepath.Join(dir, "ok.json")
	os.WriteFile(ok, []byte(`{"findings":[],"reasoning":[],"score":6,"note":null}`), 0o644)
	out, _, _ := run(ok, "--context", ctx, "--json")
	if out != "{\n  \"valid\": true,\n  \"errors\": [],\n  \"score\": 6,\n  \"direction\": []\n}\n" {
		t.Fatalf("%q", out)
	}
	bad := filepath.Join(dir, "bad.json")
	os.WriteFile(bad, []byte(`[]`), 0o644)
	out, _, code := run(bad, "--context", ctx, "--json")
	if code != 2 || out != "{\n  \"valid\": false,\n  \"errors\": [\n    \"the critic output must be a JSON object\"\n  ],\n  \"score\": null,\n  \"direction\": []\n}\n" {
		t.Fatal(code, out)
	}
}
