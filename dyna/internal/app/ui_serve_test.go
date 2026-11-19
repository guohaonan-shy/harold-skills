package app

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/registry"
)

// `dyna registry --json` lists every command of the ui and serve modules, each marked as one a session may call,
// each with the words and flags the old scripts took (renamed for the actions: no old script name is left in a
// command).
func TestRegistryJSONHasEveryUIAndServeCommandWithItsCaller(t *testing.T) {
	out, errs, code := run(nil, "registry", "--json")
	if code != 0 {
		t.Fatal(errs)
	}
	var reg registry.Registry
	if err := json.Unmarshal([]byte(out), &reg); err != nil {
		t.Fatal(err)
	}
	want := map[string][]string{
		"ui measure":      {"matrix.json", "concurrency", "json"},
		"ui compare":      {"archive.png", "fresh.png", "antialias", "pixel", "json"},
		"ui lock acquire": {"lock-dir", "owner", "stale-min", "wait-min"},
		"ui lock release": {"lock-dir", "owner", "force"},
		"ui lock status":  {"lock-dir", "stale-min"},
		"serve start":     {"目录", "port"},
		"serve stop":      {"地址"},
	}
	have := map[string]registry.Command{}
	for _, c := range reg.Commands {
		have[c.Command] = c
		if (c.Module == "ui" || c.Module == "serve") && want[c.Command] == nil {
			t.Errorf("%s is in the registry but is not one of the module's commands", c.Command)
		}
		for _, old := range []string{"ui-measure", "ui-png-compare", "browser-lock", "ui-compare", "concurrency.mjs"} {
			if strings.Contains(c.Command, old) {
				t.Errorf("%s: an old script name is left in the command", c.Command)
			}
		}
	}
	for name, args := range want {
		c, ok := have[name]
		if !ok {
			t.Errorf("%s missing", name)
			continue
		}
		if c.Caller != registry.CallerSession || c.Summary == "" {
			t.Errorf("%s: %+v", name, c)
		}
		names := map[string]bool{}
		for _, a := range c.Args {
			names[a.Name] = true
		}
		for _, a := range args {
			if !names[a] {
				t.Errorf("%s has no %q (it has %v)", name, a, c.Args)
			}
		}
	}
	if _, hidden := have["serve run"]; hidden {
		t.Error("the server process's own command is internal and not listed")
	}
	if m := have["ui measure"]; len(m.Args) == 0 || m.Args[0].Name != "matrix.json" || !m.Args[0].Variadic || !m.Args[0].Required {
		t.Errorf("measure takes one or more matrix files: %+v", m.Args)
	}
}

func TestTheUIAndServeModulesAnswerHelpAndRefuseAnUnknownCommand(t *testing.T) {
	out, _, code := run(nil, "ui", "--help")
	if code != 0 || !strings.Contains(out, "measure") || !strings.Contains(out, "compare") || !strings.Contains(out, "lock") {
		t.Fatal(out, code)
	}
	out, _, code = run(nil, "serve", "--help")
	if code != 0 || !strings.Contains(out, "start") || !strings.Contains(out, "stop") || strings.Contains(out, "run ") {
		t.Fatal(out, code)
	}
	_, errs, code := run(nil, "ui", "frobnicate")
	if code != 1 || !strings.Contains(errs, "不认识的命令「frobnicate」") {
		t.Fatal(errs, code)
	}
}
