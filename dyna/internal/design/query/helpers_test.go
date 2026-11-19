package query

import (
	"bytes"
	"encoding/json"
	"errors"
	"reflect"
	"regexp"
	"strings"
	"testing"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/design/archive"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/design/fixture"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/frontmatter"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/nexterr"
)

const base = fixture.Base

func P(rel string) string { return base + "/" + rel }

// archiveOf writes the files and loads them (with a delta when given).
func archiveOf(t *testing.T, files fixture.Files, delta ...string) *archive.Archive {
	t.Helper()
	root, err := fixture.WriteRepo(files, t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	opts := archive.Options{}
	if len(delta) > 0 {
		opts.Delta = delta[0]
	}
	a, err := archive.Load(root, opts)
	if err != nil {
		t.Fatal(err)
	}
	return a
}

const fixtureSlug = fixture.SpecSlug

func archiveLoad(root string) (*archive.Archive, error) { return archive.Load(root, archive.Options{}) }

// archiveWith loads a written root, with a delta laid over when slug is not empty.
func archiveWith(t *testing.T, root, slug string) *archive.Archive {
	t.Helper()
	a, err := archive.Load(root, archive.Options{Delta: slug})
	if err != nil {
		t.Fatal(err)
	}
	return a
}

func jsonText(v any, err error) (string, error) {
	if err != nil {
		return "", err
	}
	return frontmatter.JSON(v, 2)
}

func repoOf(t *testing.T, files fixture.Files) string {
	t.Helper()
	root, err := fixture.WriteRepo(files, t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	return root
}

// norm turns a result into what its JSON says: maps, slices, strings, float64, bool, nil.
func norm(t *testing.T, v any) any {
	t.Helper()
	s, err := frontmatter.JSON(v, 0)
	if err != nil {
		t.Fatal(err)
	}
	var out any
	if err := json.Unmarshal([]byte(s), &out); err != nil {
		t.Fatal(err)
	}
	return out
}

// okMap unwraps a result that must not be an error and normalises it: okMap(t)(Page(a, "x")).
func okMap(t *testing.T) func(*frontmatter.Map, error) any {
	return func(v *frontmatter.Map, err error) any {
		t.Helper()
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		return norm(t, v)
	}
}

// g walks a normalised value: a string steps into a map, an int into a list. nil when it is not there.
func g(v any, path ...any) any {
	for _, p := range path {
		switch k := p.(type) {
		case string:
			m, isMap := v.(map[string]any)
			if !isMap {
				return nil
			}
			v = m[k]
		case int:
			l, isList := v.([]any)
			if !isList {
				return nil
			}
			if k < 0 {
				k += len(l)
			}
			if k < 0 || k >= len(l) {
				return nil
			}
			v = l[k]
		}
	}
	return v
}

func has(v any, key string) bool {
	m, isMap := v.(map[string]any)
	if !isMap {
		return false
	}
	_, found := m[key]
	return found
}

func list(v any) []any {
	l, _ := v.([]any)
	return l
}

// pick is the string field of every item of a list.
func pick(v any, key string) []any {
	out := []any{}
	for _, x := range list(v) {
		out = append(out, g(x, key))
	}
	return out
}

func strs(xs ...string) []any {
	out := make([]any, len(xs))
	for i, x := range xs {
		out[i] = x
	}
	return out
}

func eq(t *testing.T, got, want any, msg ...string) {
	t.Helper()
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("%s\n got  %#v\n want %#v", strings.Join(msg, " "), got, want)
	}
}

// js parses expected JSON text.
func js(t *testing.T, text string) any {
	t.Helper()
	var out any
	if err := json.Unmarshal([]byte(text), &out); err != nil {
		t.Fatalf("bad expectation %q: %v", text, err)
	}
	return out
}

func match(t *testing.T, got any, pattern string, msg ...string) {
	t.Helper()
	s, _ := got.(string)
	if !regexp.MustCompile(pattern).MatchString(s) {
		t.Fatalf("%s: %q does not match /%s/", strings.Join(msg, " "), s, pattern)
	}
}

// qe asserts the error is a *QueryError with a code (when not empty) and a message matching the pattern.
func qe(t *testing.T, err error, code, pattern string) {
	t.Helper()
	var e *QueryError
	if !errors.As(err, &e) {
		t.Fatalf("want a QueryError, got %v", err)
	}
	if code != "" && e.Code != code {
		t.Fatalf("code %q, want %q (%s)", e.Code, code, e.Msg)
	}
	if pattern != "" && !regexp.MustCompile(pattern).MatchString(e.Msg) {
		t.Fatalf("message %q does not match /%s/", e.Msg, pattern)
	}
}

// cliRun runs the query command with these arguments the way the process would: stdout, what goes to stderr, exit code.
func cliRun(args ...string) (stdout, stderr string, code int) {
	c := Command()
	var out bytes.Buffer
	c.SetOut(&out)
	c.SetErr(&bytes.Buffer{})
	c.SetArgs(append([]string{}, args...))
	err := c.Execute()
	if err == nil {
		return out.String(), "", 0
	}
	var exit *nexterr.Exit
	if errors.As(err, &exit) {
		return out.String(), exit.Msg, exit.Code
	}
	return out.String(), err.Error(), 1
}
