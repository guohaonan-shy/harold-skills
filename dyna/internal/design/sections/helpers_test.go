package sections

import (
	"bytes"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"regexp"
	"strings"
	"testing"

	"github.com/spf13/cobra"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/design/fixture"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/miniyaml"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/nexterr"
)

// J reads a JSON literal (objects keep their key order).
func J(s string) any {
	v, err := parseJSON(s)
	if err != nil {
		panic(err)
	}
	return v
}

// plain turns values into maps, slices and float64 so reflect.DeepEqual can compare them.
func plain(v any) any {
	switch x := v.(type) {
	case *miniyaml.Map:
		out := map[string]any{}
		for _, k := range x.Keys() {
			if !isUndef(x.Get(k)) {
				out[k] = plain(x.Get(k))
			}
		}
		return out
	case []any:
		out := make([]any, len(x))
		for i, e := range x {
			out[i] = plain(e)
		}
		return out
	case []string:
		out := make([]any, len(x))
		for i, e := range x {
			out[i] = e
		}
		return out
	case int:
		return float64(x)
	case undefinedT:
		return "<undefined>"
	}
	return v
}

func eq(t *testing.T, got, want any, msg ...string) {
	t.Helper()
	if !reflect.DeepEqual(plain(got), plain(want)) {
		t.Fatalf("%s\ngot  %s\nwant %s", strings.Join(msg, " "), stringify(got, 0), stringify(want, 0))
	}
}

func is(t *testing.T, got, want any, msg ...string) {
	t.Helper()
	if !reflect.DeepEqual(plain(got), plain(want)) {
		t.Fatalf("%s: got %#v, want %#v", strings.Join(msg, " "), got, want)
	}
}

func match(t *testing.T, s, pattern string, msg ...string) {
	t.Helper()
	if !regexp.MustCompile(pattern).MatchString(s) {
		t.Fatalf("%s: %q does not match /%s/", strings.Join(msg, " "), clip(s), pattern)
	}
}

func noMatch(t *testing.T, s, pattern string, msg ...string) {
	t.Helper()
	if regexp.MustCompile(pattern).MatchString(s) {
		t.Fatalf("%s: %q matches /%s/", strings.Join(msg, " "), clip(s), pattern)
	}
}

func clip(s string) string {
	if len(s) > 300 {
		return s[:300] + "…"
	}
	return s
}

// col reads the same keys out of every mapping in a list: [[v1, v2], …] (a flat list for one key).
func col(l any, keys ...string) []any {
	out := []any{}
	for _, e := range list(l) {
		row := []any{}
		for _, k := range keys {
			row = append(row, get(e, k))
		}
		if len(keys) == 1 {
			out = append(out, row[0])
		} else {
			out = append(out, row)
		}
	}
	return out
}

// with is a copy of a mapping with some keys set.
func with(m any, kv ...any) Obj {
	out := clone(m.(Obj))
	for i := 0; i+1 < len(kv); i += 2 {
		out.Set(kv[i].(string), norm(kv[i+1]))
	}
	return out
}

// norm turns a Go integer into the float64 every number is held as.
func norm(v any) any {
	if i, ok := v.(int); ok {
		return float64(i)
	}
	return v
}

// findBy is the first mapping of a list whose key holds a value.
func findBy(l any, key string, value any) any {
	for _, e := range list(l) {
		if strictEq(get(e, key), value) {
			return e
		}
	}
	return Undefined
}

type cliResult struct {
	stdout, stderr string
	status         int
}

// run runs `sections <args>` the way dyna does and reports what it printed and the exit code.
func run(args ...string) cliResult {
	root := &cobra.Command{Use: "dyna", SilenceUsage: true, SilenceErrors: true}
	root.AddCommand(Command())
	var out, errb bytes.Buffer
	root.SetOut(&out)
	root.SetErr(&errb)
	root.SetArgs(append([]string{"sections"}, args...))
	status := 0
	if err := root.Execute(); err != nil {
		var exit *nexterr.Exit
		if errors.As(err, &exit) {
			status = exit.Code
			if exit.Msg != "" {
				errb.WriteString(exit.Msg + "\n")
			}
		} else {
			status = 1
			errb.WriteString(err.Error() + "\n")
		}
	}
	return cliResult{out.String(), errb.String(), status}
}

func repo(t *testing.T, files fixture.Files) string {
	t.Helper()
	root, err := fixture.WriteRepo(files, t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	return root
}

func writeFile(t *testing.T, dir, name, content string) string {
	t.Helper()
	f := filepath.Join(dir, name)
	if err := os.WriteFile(f, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
	return f
}

func writeJSONFile(t *testing.T, dir, name string, v any) string {
	t.Helper()
	return writeFile(t, dir, name, stringify(v, 0))
}

// jsKind says what the code is when a JavaScript engine evaluates it ("AsyncFunction" for the one `async (page) => …`
// the Playwright tool takes); the test is skipped when there is no node.
func jsKind(t *testing.T, code string) string {
	t.Helper()
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node is not on PATH: cannot evaluate the generated code")
	}
	cmd := exec.Command(node, "-e", "const fn = require('node:vm').runInNewContext(require('node:fs').readFileSync(0, 'utf8')); process.stdout.write(typeof fn === 'function' ? fn.constructor.name : typeof fn)")
	cmd.Stdin = strings.NewReader(code)
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("the generated code does not evaluate: %v\n%s", err, clip(string(out)))
	}
	return string(out)
}

func isAsyncFunction(t *testing.T, code string) {
	t.Helper()
	if k := jsKind(t, code); k != "AsyncFunction" {
		t.Fatalf("the code is a %q, want an AsyncFunction", k)
	}
}
