package uicompare

import (
	"bytes"
	"encoding/json"
	"math/rand"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"testing"
)

// The old comparators and these answer the same question about the same data: for a few hundred seeded random
// pairs of measurements, and for random pairs of images, the findings (every field), their order, the rendered
// text and the mismatch percentage are the same. The old script stays in the repository until the last ticket
// removes it; node is needed to run it, and without node (or without the script) this test is skipped.

const driver = `
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const lib = await import(pathToFileURL(process.argv[2]).href);
const cases = JSON.parse(readFileSync(process.argv[3], 'utf8'));
const out = cases.map((c) => {
  if (c.images) {
    const mk = (i) => ({ width: i.width, height: i.height, data: Uint8ClampedArray.from(i.data) });
    return { percent: lib.comparePixels(mk(c.images[0]), mk(c.images[1]), { antialias: c.antialias }) };
  }
  const findings = lib.compareMeasurements(c.canvas ?? {}, c.local ?? {}, c.tolerance ?? {}, { cell: c.cell });
  const pixel = lib.pixelFinding(c.percent, { cell: c.cell, threshold: c.threshold });
  const all = lib.sortFindings(pixel ? [pixel, ...findings] : findings);
  return { findings: all, render: lib.renderFindings(all) };
});
console.log(JSON.stringify(out));
`

type diffCase struct {
	Canvas    map[string]map[string]any `json:"canvas,omitempty"`
	Local     map[string]map[string]any `json:"local,omitempty"`
	Tolerance map[string]any            `json:"tolerance,omitempty"`
	Cell      *string                   `json:"cell,omitempty"`
	Percent   float64                   `json:"percent"`
	Threshold float64                   `json:"threshold"`
	Images    []map[string]any          `json:"images,omitempty"`
	Antialias float64                   `json:"antialias"`
}

func TestTheComparatorsAnswerLikeTheOldScript(t *testing.T) {
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node is not installed")
	}
	lib, _ := filepath.Abs(filepath.Join("..", "..", "..", "idea-loop", "scripts", "ui-compare.mjs"))
	if _, err := os.Stat(lib); err != nil {
		t.Skip("the old script is gone")
	}

	rng := rand.New(rand.NewSource(7))
	names := []string{"hero", "Hero", "cta", "nav-bar", "nav_bar", "item2", "item10", "Card", "card", "z"}
	numeric := []string{"top", "left", "width", "height", "gap", "rowGap", "paddingTop", "marginLeft"}
	tokens := []string{"color", "backgroundColor", "fontSize", "fontWeight", "borderRadius", "boxShadow", "opacity", "lineHeight", "letterSpacing", "textTransform"}
	pick := func(list []string) string { return list[rng.Intn(len(list))] }
	value := func(prop string) any {
		isNum := false
		for _, n := range numeric {
			isNum = isNum || n == prop
		}
		switch {
		case isNum && rng.Intn(8) == 0:
			return "normal"
		case isNum:
			return float64(rng.Intn(40)) / 2
		case rng.Intn(2) == 0:
			return float64(10 + rng.Intn(3))
		default:
			return "rgb(" + string(rune('0'+rng.Intn(3))) + ", 0, 0)"
		}
	}
	box := func() map[string]any {
		b := map[string]any{}
		for _, p := range append(append([]string{}, numeric...), tokens...) {
			if rng.Intn(3) != 0 {
				b[p] = value(p)
			}
		}
		return b
	}

	var cases []diffCase
	for i := 0; i < 300; i++ {
		c := diffCase{Canvas: map[string]map[string]any{}, Local: map[string]map[string]any{}, Percent: float64(rng.Intn(5000)) / 1000, Threshold: []float64{1, 0.5, 2.5}[rng.Intn(3)]}
		for j, n := 0, 1+rng.Intn(6); j < n; j++ {
			name := pick(names)
			if _, dup := c.Canvas[name]; dup {
				continue
			}
			c.Canvas[name] = box()
			if rng.Intn(5) != 0 {
				// the port is the canvas with a few things moved
				l := map[string]any{}
				for k, v := range c.Canvas[name] {
					l[k] = v
					if rng.Intn(5) == 0 {
						l[k] = value(k)
					}
				}
				c.Local[name] = l
			}
		}
		if rng.Intn(2) == 0 {
			cell := pick([]string{"mobile/dark", "desktop/light/empty", "Mobile"})
			c.Cell = &cell
		}
		if rng.Intn(2) == 0 {
			c.Tolerance = map[string]any{"position": float64(rng.Intn(4))}
			if rng.Intn(2) == 0 {
				c.Tolerance["byAnchor"] = map[string]any{pick(names): map[string]any{"position": float64(rng.Intn(6))}}
			}
		}
		cases = append(cases, c)
	}
	for i := 0; i < 40; i++ {
		w, h := 1+rng.Intn(8), 1+rng.Intn(8)
		mk := func(base []float64) map[string]any {
			data := make([]float64, w*h*4)
			for p := 0; p < w*h; p++ {
				for k := 0; k < 3; k++ {
					data[p*4+k] = float64(rng.Intn(256))
					if base != nil && rng.Intn(3) != 0 {
						data[p*4+k] = base[p*4+k] + float64(rng.Intn(9)) - 4
						if data[p*4+k] < 0 {
							data[p*4+k] = 0
						}
					}
				}
				data[p*4+3] = []float64{255, 255, 128, 0}[rng.Intn(4)]
			}
			return map[string]any{"width": w, "height": h, "data": data}
		}
		a := mk(nil)
		b := mk(a["data"].([]float64))
		cases = append(cases, diffCase{Images: []map[string]any{a, b}, Antialias: []float64{0, 0.05, 0.1, 0.3}[rng.Intn(4)]})
	}

	dir := t.TempDir()
	in := filepath.Join(dir, "cases.json")
	raw, _ := json.Marshal(cases)
	if err := os.WriteFile(in, raw, 0o644); err != nil {
		t.Fatal(err)
	}
	script := filepath.Join(dir, "driver.mjs")
	if err := os.WriteFile(script, []byte(driver), 0o644); err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command(node, script, lib, in)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	oldOut, err := cmd.Output()
	if err != nil {
		t.Fatalf("%v: %s", err, stderr.String())
	}
	var old []struct {
		Findings []map[string]any `json:"findings"`
		Render   string           `json:"render"`
		Percent  *float64         `json:"percent"`
	}
	if err := json.Unmarshal(oldOut, &old); err != nil {
		t.Fatal(err)
	}

	for i, c := range cases {
		if c.Images != nil {
			a, b := toImage(c.Images[0]), toImage(c.Images[1])
			got, err := ComparePixels(a, b, c.Antialias)
			if err != nil || old[i].Percent == nil || got != *old[i].Percent {
				t.Fatalf("case %d: pixels %v (%v), old %v", i, got, err, old[i].Percent)
			}
			continue
		}
		canvas, local := Measurements{}, Measurements{}
		for k, v := range c.Canvas {
			canvas[k] = Box(v)
		}
		for k, v := range c.Local {
			local[k] = Box(v)
		}
		tol := Tolerance{}
		if p, ok := c.Tolerance["position"].(float64); ok {
			tol.Position = &p
		}
		if by, ok := c.Tolerance["byAnchor"].(map[string]any); ok {
			tol.ByAnchor = map[string]AnchorTolerance{}
			for k, v := range by {
				p := v.(map[string]any)["position"].(float64)
				tol.ByAnchor[k] = AnchorTolerance{Position: &p}
			}
		}
		fs := CompareMeasurements(canvas, local, tol, c.Cell)
		if pf := PixelFinding(c.Percent, c.Cell, c.Threshold); pf != nil {
			fs = SortFindings(append([]Finding{*pf}, fs...))
		}
		gotJSON, _ := json.Marshal(fs)
		var got []map[string]any
		_ = json.Unmarshal(gotJSON, &got)
		if got == nil {
			got = []map[string]any{}
		}
		want := old[i].Findings
		if want == nil {
			want = []map[string]any{}
		}
		if !reflect.DeepEqual(got, want) {
			t.Fatalf("case %d: findings differ\n go: %s\nold: %s", i, gotJSON, mustJSON(want))
		}
		if r := RenderFindings(fs); r != old[i].Render {
			t.Fatalf("case %d: render differs\n go: %q\nold: %q", i, r, old[i].Render)
		}
	}
}

func mustJSON(v any) string {
	b, _ := json.Marshal(v)
	return string(b)
}

func toImage(m map[string]any) Image {
	data := m["data"].([]float64)
	img := Image{Width: m["width"].(int), Height: m["height"].(int), Data: make([]byte, len(data))}
	for i, v := range data {
		img.Data[i] = byte(v)
	}
	return img
}

// The names a matrix gives anchors (and the property names) are put in order with localeCompare in the old
// script. For every pair of printable ASCII characters, and for short random strings, LocaleCompare gives the
// same sign as node's.
func TestLocaleCompareAgreesWithNodesLocaleCompare(t *testing.T) {
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node is not installed")
	}
	rng := rand.New(rand.NewSource(11))
	var alphabet []rune
	for r := rune(0x20); r < 0x7f; r++ {
		alphabet = append(alphabet, r)
	}
	var pairs [][2]string
	for _, a := range alphabet {
		for _, b := range alphabet {
			pairs = append(pairs, [2]string{string(a), string(b)})
		}
	}
	for i := 0; i < 600; i++ {
		mk := func() string {
			n := 1 + rng.Intn(5)
			var s []rune
			for j := 0; j < n; j++ {
				// mostly the letters, digits and separators names are made of
				pool := []rune("abcABC019-_. ")
				if rng.Intn(4) == 0 {
					pool = alphabet
				}
				s = append(s, pool[rng.Intn(len(pool))])
			}
			return string(s)
		}
		pairs = append(pairs, [2]string{mk(), mk()})
	}
	raw, _ := json.Marshal(pairs)
	in := filepath.Join(t.TempDir(), "pairs.json")
	if err := os.WriteFile(in, raw, 0o644); err != nil {
		t.Fatal(err)
	}
	out, err := exec.Command(node, "-e",
		`const p = JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8')); console.log(JSON.stringify(p.map(([a, b]) => Math.sign(a.localeCompare(b)))))`, in).Output()
	if err != nil {
		t.Fatal(err)
	}
	var want []int
	if err := json.Unmarshal(out, &want); err != nil {
		t.Fatal(err)
	}
	bad := 0
	for i, p := range pairs {
		if got := LocaleCompare(p[0], p[1]); got != want[i] {
			if bad++; bad <= 10 {
				t.Errorf("%q vs %q: go %d, node %d", p[0], p[1], got, want[i])
			}
		}
	}
}
