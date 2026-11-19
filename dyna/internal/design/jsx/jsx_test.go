package jsx

import (
	"strings"
	"testing"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/miniyaml"
)

var (
	nbsp = string(rune(0xa0))
	bom  = string(rune(0xfeff))
	ideo = string(rune(0x3000))
	ls   = string(rune(0x2028))
)

func TestSpaceIsWhatJSCallsSpace(t *testing.T) {
	if got := Trim(nbsp + bom + " a b " + ideo + "\n"); got != "a b" {
		t.Fatalf("%q", got)
	}
	if got := TrimEnd(" a " + ls); got != " a" {
		t.Fatalf("%q", got)
	}
	re := Re(`^a\s+b$`, "")
	if !re.MatchString("a"+nbsp+ideo+"b") || re.MatchString("ab") {
		t.Fatal(`\s must match the non-ASCII spaces JS matches`)
	}
	if !Re(`^[^\s\[\]]+$`, "").MatchString("page--state") || Re(`^[^\s\[\]]+$`, "").MatchString("a"+nbsp+"b") {
		t.Fatal(`[^\s…] must exclude them too`)
	}
	if !Re(`^<a[\s\S]*?</a>$`, "").MatchString("<a>\n x\n</a>") {
		t.Fatal(`[\s\S] is any character`)
	}
}

func TestStringsAreMeasuredInUTF16Units(t *testing.T) {
	s := "a😀b"
	if Len16(s) != 4 {
		t.Fatal(Len16(s))
	}
	if Head(s, 3) != "a😀" || Slice(s, 1, 3) != "😀" || Head(s, 99) != s || Slice(s, 3, 1) != "" {
		t.Fatalf("%q %q", Head(s, 3), Slice(s, 1, 3))
	}
	if Index16(s, strings.Index(s, "b")) != 3 {
		t.Fatal("b is at 3 in JS")
	}
}

func TestParseJSONKeepsKeyOrderAndTellsNullFromMissing(t *testing.T) {
	v, err := ParseJSON([]byte(`{"z":1,"a":null,"m":[1,{"k":"v"}]}`))
	if err != nil {
		t.Fatal(err)
	}
	m, _ := miniyaml.AsMap(v)
	if strings.Join(m.Keys(), ",") != "z,a,m" || !m.Has("a") || m.Get("a") != nil || m.Has("q") {
		t.Fatal(m.Keys())
	}
	for _, bad := range []string{``, `{"a":`, `{"a":1} x`, `[1,]`, `nope`} {
		if _, err := ParseJSON([]byte(bad)); err == nil {
			t.Errorf("%q should not parse", bad)
		}
	}
	if got := Stringify(v); got != `{"z":1,"a":null,"m":[1,{"k":"v"}]}` {
		t.Fatal(got)
	}
}
