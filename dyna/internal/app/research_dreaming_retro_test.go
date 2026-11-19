package app

import (
	"encoding/json"
	"sort"
	"strings"
	"testing"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/registry"
)

// The registry lists every command of the research, dreaming and retro modules, each marked as a session's.
func TestRegistryHasEveryResearchDreamingAndRetroCommandMarkedForSessions(t *testing.T) {
	out, errs, code := run(nil, "registry", "--json")
	if code != 0 {
		t.Fatal(errs)
	}
	var reg registry.Registry
	if err := json.Unmarshal([]byte(out), &reg); err != nil {
		t.Fatal(err)
	}
	want := []string{
		"research submit",
		"dreaming table submit", "dreaming table split",
		"retro install", "retro pool count", "retro pool reopened", "retro digest", "retro locate",
	}
	have := map[string]registry.Command{}
	var module []string
	for _, c := range reg.Commands {
		have[c.Command] = c
		if strings.HasPrefix(c.Command, "research ") || strings.HasPrefix(c.Command, "dreaming ") || strings.HasPrefix(c.Command, "retro ") {
			module = append(module, c.Command)
		}
	}
	for _, w := range want {
		c, ok := have[w]
		if !ok {
			t.Errorf("%s is not in the registry", w)
			continue
		}
		if c.Caller != registry.CallerSession || c.Summary == "" || len(c.Args) == 0 {
			t.Errorf("%s: %+v", w, c)
		}
	}
	sort.Strings(module)
	sort.Strings(want)
	if strings.Join(module, ",") != strings.Join(want, ",") {
		t.Errorf("the modules hold %v, the ticket lists %v", module, want)
	}
	// the arguments the old scripts took are there
	flags := func(name string) string {
		var out []string
		for _, a := range have[name].Args {
			if a.Kind == "flag" {
				out = append(out, a.Name)
			}
		}
		sort.Strings(out)
		return strings.Join(out, ",")
	}
	for name, want := range map[string]string{
		"research submit":       "json",
		"dreaming table submit": "json",
		"dreaming table split":  "json,out",
		"retro install":         "dest",
		"retro digest":          "ai-max",
		"retro locate":          "dir,marker,session",
	} {
		if got := flags(name); got != want {
			t.Errorf("%s flags: %s, want %s", name, got, want)
		}
	}
}

// No command of these modules is named after the script it replaces.
func TestNoCommandOfTheseModulesCarriesAnOldScriptName(t *testing.T) {
	out, _, _ := run(nil, "registry")
	for _, old := range []string{"research-check", "proposal-table-check", "retro-install", "retro-pool-count", "retro-pool-reopened", "session-digest"} {
		for _, line := range strings.Split(out, "\n") {
			cmd := strings.SplitN(line, "\t", 2)[0]
			if strings.Contains(cmd, old) {
				t.Errorf("%q still carries %s", cmd, old)
			}
		}
	}
}
