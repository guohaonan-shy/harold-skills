package home_test

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/registry"
)

func TestRegistryJSONHasEveryHomeCommandWithItsCallerAndItsArguments(t *testing.T) {
	w := newWorld(t, opts{})
	var reg registry.Registry
	if err := json.Unmarshal([]byte(w.run(w.root, "registry", "--json").ok(t).out), &reg); err != nil {
		t.Fatal(err)
	}
	// who may call each one: the two the hooks run are marked so, the rest are for sessions
	want := map[string]string{
		"home adr new":        registry.CallerSession,
		"home commit":         registry.CallerSession,
		"home config apply":   registry.CallerSession,
		"home config plan":    registry.CallerSession,
		"home glossary check": registry.CallerHook,
		"home index":          registry.CallerSession,
		"home map":            registry.CallerHook,
		"home memory check":   registry.CallerSession,
		"home where":          registry.CallerSession,
		"home projects":       registry.CallerSession,
		"home dispatch":       registry.CallerSession,
	}
	have := map[string]registry.Command{}
	for _, c := range reg.Commands {
		if strings.HasPrefix(c.Command, "home ") {
			have[c.Command] = c
		}
	}
	if len(have) != len(want) {
		t.Fatalf("the registry has %d home commands, want %d: %v", len(have), len(want), have)
	}
	for name, caller := range want {
		c, ok := have[name]
		if !ok || c.Caller != caller || c.Module != "home" || c.Summary == "" {
			t.Errorf("%s: %+v", name, c)
		}
	}
	argNames := func(name string) string {
		var out []string
		for _, a := range have[name].Args {
			out = append(out, a.Name+":"+a.Kind)
		}
		return strings.Join(out, ",")
	}
	for name, args := range map[string]string{
		"home commit":         "message:positional,file:positional",
		"home adr new":        "name:positional,project:flag",
		"home config plan":    "json:flag,only:flag",
		"home config apply":   "only:flag",
		"home glossary check": "file:positional,hook:flag,json:flag",
		"home index":          "layer:flag,project:flag",
		"home memory check":   "dir:positional",
		"home where":          "project:flag",
		"home map":            "hook:flag",
		"home projects":       "",
		"home dispatch":       "at:flag",
	} {
		if got := argNames(name); got != args {
			t.Errorf("%s takes %q, want %q", name, got, args)
		}
	}
}
