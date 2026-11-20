package ui

// #414 (spec ui-measure-matrix-gaps): the cell's reducedMotion reaches the browser like colorScheme, margin and gap
// are not measured, and the same color written as oklch on one side and hex on the other is not a finding.

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
)

func TestAReducedMotionThatIsNotReduceOrNoPreferenceIsRefusedNamingTheCell(t *testing.T) {
	var m Matrix
	if err := json.Unmarshal([]byte(`{"cells":[{"name":"a"},{"name":"b","reducedMotion":"reduce"},{"name":"c","reducedMotion":"no-preference"},{"name":"d","reducedMotion":"slow"},{"name":"e","reducedMotion":null},{"name":"f","reducedMotion":true}]}`), &m); err != nil {
		t.Fatal(err)
	}
	for _, c := range m.Cells[:3] {
		if err := c.checkReducedMotion(); err != nil {
			t.Errorf("%s: %v", c.Name, err)
		}
	}
	if m.Cells[0].reducedMotion() != "" || m.Cells[1].reducedMotion() != "reduce" {
		t.Fatal("a cell without the field has no emulation")
	}
	for name, got := range map[string]string{"d": `"slow"`, "e": "null", "f": "true"} {
		var c Cell
		for _, x := range m.Cells {
			if x.Name == name {
				c = x
			}
		}
		err := c.checkReducedMotion()
		if err == nil || err.Error() != `cell "`+name+`": reducedMotion must be "reduce" or "no-preference", got `+got {
			t.Errorf("%s: %v", name, err)
		}
	}
}

func TestMarginAndGapAreNotMeasured(t *testing.T) {
	for _, p := range measureStyles {
		if strings.HasPrefix(p, "margin") || strings.Contains(strings.ToLower(p), "gap") {
			t.Errorf("%s is measured", p)
		}
	}
}

func TestReducedMotionReachesThePageAndACellWithoutItDoesNotInheritIt(t *testing.T) {
	page := func(reduced string) string {
		return `<body style="margin:0"><style>.x{background:#111}@media (prefers-reduced-motion: reduce){.x{background:` + reduced + `}}</style>
<div class="x" data-anchor="x" style="position:absolute;top:10px;left:10px;width:50px;height:50px"></div></body>`
	}
	url := pages(t, map[string]string{"canvas.html": page("#0a0"), "local.html": page("#a00")})
	m := Matrix{Canvas: url + "/canvas.html", Local: url + "/local.html", Cells: []Cell{
		{Name: "reduce", Viewport: Viewport{Width: 200, Height: 200}, ReducedMotion: json.RawMessage(`"reduce"`)},
		{Name: "plain", Viewport: Viewport{Width: 200, Height: 200}},
	}}
	var got []string
	for _, f := range walk(t, m).Findings {
		got = append(got, *f.Cell+":"+f.ID)
	}
	if strings.Join(got, ",") != "reduce:token-mismatch,reduce:pixel-mismatch" {
		t.Fatalf("the reduce cell sees the reduced styles, the next cell is back to none: %v", got)
	}
	bad := Matrix{Canvas: url + "/canvas.html", Local: url + "/local.html", Cells: []Cell{{Name: "x", Viewport: Viewport{Width: 200, Height: 200}, ReducedMotion: json.RawMessage(`"fast"`)}}}
	if _, err := sharedChrome(t).Walk(context.Background(), bad); err == nil || !strings.Contains(err.Error(), `reducedMotion must be "reduce" or "no-preference"`) {
		t.Fatal(err)
	}
}

func TestTheSameColorAsOklchAndAsHexAndTheSameBoxWrittenWithMarginOrGapAreGreen(t *testing.T) {
	canvas := `<body style="margin:0"><div style="display:flex;flex-direction:column"><div style="height:40px"></div>
<div data-anchor="cta" style="margin-top:16px;height:40px;width:100px;background:#3b82f6"></div></div></body>`
	local := `<body style="margin:0"><div style="display:flex;flex-direction:column;gap:16px"><div style="height:40px"></div>
<div data-anchor="cta" style="height:40px;width:100px;background:oklch(0.6231 0.188 259.8)"></div></div></body>`
	url := pages(t, map[string]string{"canvas.html": canvas, "local.html": local})
	res := walk(t, Matrix{Canvas: url + "/canvas.html", Local: url + "/local.html", Cells: []Cell{{Name: "m", Viewport: Viewport{Width: 200, Height: 200}}}})
	if len(res.Findings) != 0 {
		t.Fatal(findingKeys(res))
	}
}
