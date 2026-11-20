package sections

import (
	"os/exec"
	"strings"
	"testing"
)

func TestStringifyIsJSONStringifyOnTheValuesTheCommandHandles(t *testing.T) {
	inputs := []string{
		`{"a":1,"b":[1,2.5,-3,1e21,1e-7,0,-0.5],"c":{"d":null,"e":true,"f":"x\"y\\z\n\t\u0001é中 "},"g":[],"h":{}}`,
		`[{"z":1,"a":2},[[]],[{}],"<&>"]`,
		`"just a string"`,
		`12345678901234567890`,
		`{"k":{"k":{"k":[{"k":[1,{"k":2}]}]}}}`,
	}
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node is not on PATH")
	}
	for _, in := range inputs {
		v, err := parseJSON(in)
		if err != nil {
			t.Fatalf("%s: %v", in, err)
		}
		for _, indent := range []int{0, 2} {
			cmd := exec.Command(node, "-e", "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>process.stdout.write(JSON.stringify(JSON.parse(s),null,"+string(rune('0'+indent))+")))")
			cmd.Stdin = strings.NewReader(in)
			want, err := cmd.Output()
			if err != nil {
				t.Fatal(err)
			}
			if got := stringify(v, indent); got != string(want) {
				t.Errorf("indent %d of %s\ngot  %s\nwant %s", indent, in, got, want)
			}
		}
	}
}

func TestParseJSONRefusesWhatIsNotJSON(t *testing.T) {
	for _, bad := range []string{``, `{`, `[1,]`, `{"a":1,}`, `{a:1}`, `'x'`, `[1 2]`, `{"a" 1}`, `nul`, `01`, `1.`, `"open`, `[not json`, `{ not json`, `{} x`} {
		if v, err := parseJSON(bad); err == nil {
			t.Errorf("%q was read as %v", bad, v)
		}
	}
}

func TestRoundHalvesGoUpLikeMathRound(t *testing.T) {
	for in, want := range map[float64]float64{0.5: 1, 1.5: 2, 2.5: 3, -0.5: 0, -1.5: -1, -2.5: -2, 2.4: 2, -2.6: -3} {
		if got := jsRound(in); got != want {
			t.Errorf("round(%v) = %v, want %v", in, got, want)
		}
	}
}
