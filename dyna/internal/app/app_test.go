package app

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/registry"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/version"
)

func envOf(m map[string]string) func(string) string { return func(k string) string { return m[k] } }

func TestGateSaysWhatToRunWhenTheVersionIsNotInTheRange(t *testing.T) {
	env := envOf(map[string]string{EnvRange: ">=0.4.0 <1.0.0"})
	if got := Gate(env, "0.5.0"); got != "" {
		t.Fatal(got)
	}
	low := Gate(env, "0.3.2")
	for _, want := range []string{"0.3.2", ">=0.4.0 <1.0.0", "/idea-loop:setup", "升级"} {
		if !strings.Contains(low, want) {
			t.Errorf("low version message lacks %q: %s", want, low)
		}
	}
	high := Gate(env, "1.0.0")
	for _, want := range []string{"1.0.0", ">=0.4.0 <1.0.0", "/plugin", "更新插件"} {
		if !strings.Contains(high, want) {
			t.Errorf("high version message lacks %q: %s", want, high)
		}
	}
	if strings.Contains(high, "/idea-loop:setup") {
		t.Error("a binary newer than the plugin wants the plugin updated, not itself")
	}
	if got := Gate(envOf(nil), "0.0.1"); got != "" {
		t.Fatal("no range, no gate")
	}
	if got := Gate(envOf(map[string]string{EnvRange: "wat"}), "0.5.0"); !strings.Contains(got, "wat") {
		t.Fatal(got)
	}
}

func run(env map[string]string, args ...string) (stdout, stderr string, code int) {
	var out, errb bytes.Buffer
	code = Run(args, IO{Stdin: strings.NewReader(""), Stdout: &out, Stderr: &errb, Env: envOf(env)})
	return out.String(), errb.String(), code
}

func TestARangeThisBinaryIsNotInStopsTheCommandAHookJustLeavesALine(t *testing.T) {
	env := map[string]string{EnvRange: ">=9.0.0 <10.0.0"}
	out, errs, code := run(env, "version")
	if code != 1 || out != "" || !strings.Contains(errs, "/idea-loop:setup") {
		t.Fatal(out, errs, code)
	}
	out, errs, code = run(env, "issues", "guard", "--hook")
	if code != 0 || out != "" || strings.Count(strings.TrimSpace(errs), "\n") != 0 || errs == "" {
		t.Fatalf("a hook is never stopped by a version mismatch: %q %q %d", out, errs, code)
	}
	out, _, code = run(map[string]string{EnvRange: ">=0.1.0 <1.0.0"}, "version")
	if code != 0 || strings.TrimSpace(out) != version.Version {
		t.Fatal(out, code)
	}
}

func TestRegistryJSONHasEveryIssuesCommandWithItsParts(t *testing.T) {
	out, errs, code := run(nil, "registry", "--json")
	if code != 0 {
		t.Fatal(errs)
	}
	var reg registry.Registry
	if err := json.Unmarshal([]byte(out), &reg); err != nil {
		t.Fatal(err)
	}
	if reg.Version != version.Version {
		t.Fatal(reg.Version)
	}
	want := []string{"backlog", "block add", "block list", "block remove", "body", "candidates", "check", "guard", "labels", "migrate", "new", "note", "priority", "queues", "read", "reconcile", "set", "show", "type"}
	have := map[string]registry.Command{}
	for _, c := range reg.Commands {
		have[c.Command] = c
	}
	for _, w := range want {
		c, ok := have["issues "+w]
		if !ok {
			t.Errorf("issues %s missing", w)
			continue
		}
		if c.Summary == "" || c.Caller == "" || len(c.Args) == 0 {
			t.Errorf("issues %s is not complete: %+v", w, c)
		}
	}
	set := have["issues set"]
	if set.Caller != registry.CallerSession || set.Next == "" {
		t.Fatalf("%+v", set)
	}
	var flags []string
	for _, a := range set.Args {
		if a.Kind == "flag" {
			flags = append(flags, a.Name)
		}
	}
	if strings.Join(flags, ",") != "comment,skip-design" {
		t.Fatal(flags)
	}
	if have["issues guard"].Caller != registry.CallerHook {
		t.Fatal("guard is only for hooks")
	}
}

func TestEveryCommandIsMarkedAndDescribed(t *testing.T) {
	reg := registry.Export(NewRoot(IO{Stdout: &bytes.Buffer{}, Stderr: &bytes.Buffer{}}), version.Version)
	for _, c := range reg.Commands {
		if c.Caller == "" || c.Summary == "" {
			t.Errorf("%s: no caller or summary", c.Command)
		}
	}
}

// The stored registry of the version in version.go must be what the command tree says now: a command or flag
// changed without raising the version (or without storing the new registry) goes red here.
func TestTheStoredRegistryOfThisVersionIsTheCommandTree(t *testing.T) {
	stored, err := os.ReadFile(filepath.Join("..", "..", "registry", version.Version+".json"))
	if err != nil {
		t.Fatalf("no stored registry for %s: run `dyna registry --json > dyna/registry/%s.json` (%v)", version.Version, version.Version, err)
	}
	now := registry.Export(NewRoot(IO{Stdout: &bytes.Buffer{}, Stderr: &bytes.Buffer{}}), version.Version).JSON()
	if string(stored) != string(now) {
		t.Fatalf("dyna/registry/%s.json is out of date: a command changed, so raise the version in internal/version/version.go and store the new registry", version.Version)
	}
}

func TestAnUnknownModuleAndCommandAreRefused(t *testing.T) {
	_, errs, code := run(nil, "frobnicate")
	if code != 1 || !strings.Contains(errs, "不认识的模块「frobnicate」") {
		t.Fatal(errs, code)
	}
	_, errs, code = run(nil, "issues", "frobnicate", "x")
	if code != 1 || !strings.Contains(errs, "不认识的命令「frobnicate」") {
		t.Fatal(errs, code)
	}
	out, _, code := run(nil, "issues", "--help")
	if code != 0 || !strings.Contains(out, "set") || !strings.Contains(out, "guard") {
		t.Fatal(out, code)
	}
}
