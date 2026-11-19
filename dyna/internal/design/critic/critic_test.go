package critic

import (
	"bytes"
	"errors"
	"os"
	"path/filepath"
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

// gap is one finding as JSON text; extra is more members (`"severity":"P1"`) and replacements are made on the text.
func gap(kind string, extra ...string) string {
	members := []string{`"kind":"` + kind + `"`, `"where":"首页 · 默认态 · 顶部卡片"`, `"detail":"标题和数字一样重"`, `"why":"眼睛落不到要看的数字上"`}
	return "{" + strings.Join(append(members, extra...), ",") + "}"
}

func findings(gaps ...string) string { return "[" + strings.Join(gaps, ",") + "]" }

func validate(t *testing.T, text string) []string { return ValidateFindings(parse(t, text)) }

func round(t *testing.T, fs string, score string, history string) Result {
	t.Helper()
	var s any
	present := score != ""
	if present {
		s = parse(t, score)
	}
	var h any
	if history != "" {
		h = parse(t, history)
	}
	return CheckRound(parse(t, fs), present, s, h)
}

func TestAFindingIsExactlyKindWhereDetailWhyWithAKnownKind(t *testing.T) {
	if errs := validate(t, findings(gap("craft"), gap("pattern"), gap("direction"))); len(errs) != 0 {
		t.Fatal(errs)
	}
	has := func(errs []string, part string) bool { return strings.Contains(strings.Join(errs, "\n"), part) }
	if errs := validate(t, findings(strings.Replace(gap("craft"), "}", `,"severity":"P1"}`, 1))); !has(errs, `unknown field "severity"`) {
		t.Fatal(errs)
	}
	if errs := validate(t, `[{"kind":"craft","where":"x","detail":"y"}]`); !has(errs, `missing field "why"`) {
		t.Fatal(errs)
	}
	if errs := validate(t, findings(gap("taste"))); !has(errs, `kind "taste"`) {
		t.Fatal(errs)
	}
	if errs := validate(t, findings(strings.Replace(gap("craft"), `"where":"首页 · 默认态 · 顶部卡片"`, `"where":null`, 1))); !has(errs, "where must be a string") {
		t.Fatal(errs)
	}
	if errs := validate(t, `"x"`); !has(errs, "must be an array") {
		t.Fatal(errs)
	}
	if errs := validate(t, `[3, null, []]`); len(errs) != 3 || errs[0] != "findings[0]: must be an object" {
		t.Fatal(errs)
	}
}

func TestADirectionGapStopsTheLoopWhateverTheScore(t *testing.T) {
	if r := round(t, findings(gap("direction")), "9", ""); r.Stop != "方向" {
		t.Fatal(r)
	}
}

func TestNineAndUpPassesBelowItContinues(t *testing.T) {
	if r := round(t, findings(gap("craft")), "9", ""); r.Stop != "通过" {
		t.Fatal(r)
	}
	if r := round(t, `[]`, "10", ""); r.Stop != "通过" {
		t.Fatal(r)
	}
	if r := round(t, findings(gap("craft")), "8", "[6,7]"); r.Stop != "继续" {
		t.Fatal(r)
	}
}

func TestThreeRoundsInARowWithoutBeatingTheBestBeforeThemIsABottleneck(t *testing.T) {
	for _, c := range []struct {
		scores []float64
		want   bool
	}{{[]float64{6, 6, 6}, false}, {[]float64{6, 6, 6, 6}, true}, {[]float64{5, 7, 7, 6, 7}, true}, {[]float64{5, 7, 7, 6, 8}, false}} {
		if got := IsPlateau(c.scores); got != c.want {
			t.Errorf("%v: %v", c.scores, got)
		}
	}
	if r := round(t, findings(gap("craft")), "7", "[5,7,7,6]"); r.Stop != "瓶颈" {
		t.Fatal(r)
	}
	if r := round(t, findings(gap("craft")), "8", "[5,7,7,6]"); r.Stop != "继续" {
		t.Fatal(r)
	}
}

func TestAnOutOfRangeScoreOrAMalformedHistoryIsAnInvalidRound(t *testing.T) {
	for _, score := range []string{"0", "11", "7.5", `"8"`, "null", ""} {
		if r := round(t, findings(gap("craft")), score, ""); r.Valid {
			t.Errorf("score %q should be invalid", score)
		}
	}
	r := round(t, findings(gap("craft")), "7", `["P1"]`)
	if r.Valid || r.Stop != "" {
		t.Fatal(r)
	}
}

func TestTheScoreInTheMessageIsWrittenAsJSONWouldWriteIt(t *testing.T) {
	cases := map[string]string{"7.5": "7.5", `"8"`: `"8"`, "null": "null", "": "undefined", "[1]": "[1]"}
	for score, want := range cases {
		r := round(t, findings(gap("craft")), score, "")
		if len(r.Errors) != 1 || !strings.HasSuffix(r.Errors[0], ", got "+want) {
			t.Errorf("%q: %v", score, r.Errors)
		}
	}
}

func TestAHistoryThatIsNotAnArrayCountsAsNoHistory(t *testing.T) {
	if r := round(t, findings(gap("craft")), "7", `"x"`); !r.Valid || r.Stop != "继续" {
		t.Fatal(r)
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

func TestTheCommandExits2OnAnInvalidRoundAndPrintsTheStopOnAValidOne(t *testing.T) {
	dir := t.TempDir()
	ok := filepath.Join(dir, "ok.json")
	bad := filepath.Join(dir, "bad.json")
	os.WriteFile(ok, []byte(`{"findings":`+findings(gap("craft"))+`,"score":9,"history":[7,8]}`), 0o644)
	os.WriteFile(bad, []byte(`{"findings":`+findings(gap("taste"))+`,"score":9}`), 0o644)
	out, _, code := run(ok)
	if code != 0 || !strings.Contains(out, "通过") || !strings.Contains(out, "分数：9　停止判定：通过") {
		t.Fatal(code, out)
	}
	out, _, code = run(bad)
	if code != 2 || !strings.Contains(out, "本轮无效") || !strings.Contains(out, `kind "taste"`) {
		t.Fatal(code, out)
	}
}

func TestTheCommandWithNoFileOrABrokenFileIsAUsageError(t *testing.T) {
	if _, _, code := run(); code != 1 {
		t.Fatal(code)
	}
	if _, _, code := run(filepath.Join(t.TempDir(), "nope.json")); code != 1 {
		t.Fatal(code)
	}
	broken := filepath.Join(t.TempDir(), "x.json")
	os.WriteFile(broken, []byte(`{"findings":`), 0o644)
	if _, errs, code := run(broken); code != 1 || !strings.Contains(errs, "cannot read") {
		t.Fatal(code, errs)
	}
}

func TestTheJSONOutputKeepsItsKeysInOrder(t *testing.T) {
	dir := t.TempDir()
	ok := filepath.Join(dir, "ok.json")
	os.WriteFile(ok, []byte(`{"findings":[],"score":6}`), 0o644)
	out, _, _ := run(ok, "--json")
	if out != "{\n  \"valid\": true,\n  \"errors\": [],\n  \"stop\": \"继续\"\n}\n" {
		t.Fatalf("%q", out)
	}
	bad := filepath.Join(dir, "bad.json")
	os.WriteFile(bad, []byte(`[]`), 0o644)
	out, _, code := run(bad, "--json")
	if code != 2 || !strings.HasPrefix(out, "{\n  \"valid\": false,\n  \"errors\": [\n    \"findings must be an array\",") || !strings.HasSuffix(out, "\"stop\": null\n}\n") {
		t.Fatal(code, out)
	}
}

// ---- the old script, on the same rounds ----
