package seo_test

import (
	"bytes"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/app"
)

// The hook: the same hook event gets the same answer from the old hook script and from `seo check --hook`.
func TestTheHookAnswersTheSameEventTheSameAsTheOldHook(t *testing.T) {
	o := newOldNew(t)
	page := func(title string) string {
		return `<html lang="en"><head><title>` + title + `</title><meta name="description" content="Thirty quick weeknight dinners with a shopping list for each, tested in a small kitchen, plus what to swap when an ingredient is missing from the shelf."><link rel="canonical" href="https://cookbook.example/"></head><body><h1>x</h1></body></html>`
	}
	good := "Weeknight dinner ideas that take thirty minutes or less"
	world := func(moved, withSeoMd bool) (root string, env map[string]string) {
		base, err := filepath.EvalSymlinks(t.TempDir())
		if err != nil {
			t.Fatal(err)
		}
		home := filepath.Join(base, "home")
		put(t, home, "AGENTS.md", "# 设备\n\n## 项目\n\nexample-app（一个例子）: ~/projects/example-app. Clone from https://github.com/acme/example-app if missing.\n")
		if moved {
			if err := os.MkdirAll(filepath.Join(home, "projects", "example-app", "docs"), 0o755); err != nil {
				t.Fatal(err)
			}
			if withSeoMd {
				put(t, filepath.Join(home, "projects", "example-app"), "SEO.md", "# SEO\n\n## 构建与检查\n- 产物目录：`site/dist`\n- 检查参数：`--title-max=200`\n")
			}
		}
		root = filepath.Join(base, "code")
		if err := os.MkdirAll(root, 0o755); err != nil {
			t.Fatal(err)
		}
		for _, args := range [][]string{{"init", "-q"}, {"remote", "add", "origin", "git@github.com:acme/example-app.git"}} {
			cmd := exec.Command("git", args...)
			cmd.Dir = root
			if out, err := cmd.CombinedOutput(); err != nil {
				t.Fatalf("%v %s", err, out)
			}
		}
		put(t, root, "site/dist/index.html", page(good))
		return root, map[string]string{"IDEA_LOOP_HOME": home, "HOME": base}
	}
	event := func(name, id, cwd, extra string) string {
		return fmt.Sprintf(`{"hook_event_name":%q,"tool_name":"Bash","tool_use_id":%q,"cwd":%q,"tool_input":{"command":"npm run build"}%s}`, name, id, cwd, extra)
	}
	oldHook := func(env map[string]string, stdin string) result {
		cmd := exec.Command(o.node, filepath.Join(o.scripts, "seo-check-hook.mjs"))
		cmd.Stdin = strings.NewReader(stdin)
		cmd.Env = os.Environ()
		for k, v := range env {
			cmd.Env = append(cmd.Env, k+"="+v)
		}
		var out, errb bytes.Buffer
		cmd.Stdout, cmd.Stderr = &out, &errb
		code := 0
		if err := cmd.Run(); err != nil {
			code = err.(*exec.ExitError).ExitCode()
		}
		return result{out.String(), errb.String(), code}
	}
	newHook := func(env map[string]string, stdin string) result {
		var out, errb bytes.Buffer
		code := app.Run([]string{"seo", "check", "--hook"}, app.IO{Stdin: strings.NewReader(stdin), Stdout: &out, Stderr: &errb, Env: func(k string) string { return env[k] }})
		return result{out.String(), errb.String(), code}
	}
	type scenario struct {
		moved, seoMd bool
		title        string // what the "build" writes between the two events
		duration     string // PostToolUse's duration_ms, when the Pre record is left out
		skipPre      bool
	}
	for name, c := range map[string]scenario{
		"an error left by the build":         {true, true, "", "", false},
		"a clean build":                      {true, true, good, "", false},
		"a warning only":                     {true, true, "short", "", false},
		"a project that has not moved":       {false, false, "", "", false},
		"no SEO.md":                          {true, false, "", "", false},
		"no Pre record, a duration":          {true, true, "", `,"duration_ms":5000`, true},
		"no Pre record and no duration":      {true, true, "", "", true},
		"no Pre record, a zero duration":     {true, true, "", `,"duration_ms":0`, true},
		"no Pre record, a negative duration": {true, true, "", `,"duration_ms":-5`, true},
	} {
		rootOld, envOld := world(c.moved, c.seoMd)
		rootNew, envNew := world(c.moved, c.seoMd)
		envOld["IDEA_LOOP_SEO_HOOK_DIR"], envNew["IDEA_LOOP_SEO_HOOK_DIR"] = t.TempDir(), t.TempDir()
		var got [2]result
		for i, w := range []struct {
			root string
			env  map[string]string
			run  func(map[string]string, string) result
		}{{rootOld, envOld, oldHook}, {rootNew, envNew, newHook}} {
			index := filepath.Join(w.root, "site/dist/index.html")
			past := time.Now().Add(-time.Minute)
			if err := os.Chtimes(index, past, past); err != nil {
				t.Fatal(err)
			}
			if !c.skipPre {
				if r := w.run(w.env, event("PreToolUse", "t1", w.root, "")); r.code != 0 || r.stderr != "" {
					t.Fatalf("%s: the Pre half passes silently: %+v", name, r)
				}
			}
			put(t, w.root, "site/dist/index.html", page(c.title))
			got[i] = w.run(w.env, event("PostToolUse", "t1", w.root, c.duration))
			// the two worlds live in different temp directories; compare what is said with the directory taken out
			got[i].stderr = strings.ReplaceAll(got[i].stderr, w.root, "<repo>")
		}
		if got[0] != got[1] {
			t.Errorf("%s:\nold %+v\nnew %+v", name, got[0], got[1])
		}
		if name == "an error left by the build" && (got[1].code != 2 || !strings.Contains(got[1].stderr, "Missing <title>")) {
			t.Errorf("%s: the hook did not report the error: %+v", name, got[1])
		}
	}
	// input the hook cannot read passes
	_, env := world(true, true)
	for _, in := range []string{"", "not json", "null", `{"hook_event_name":"PostToolUse"}`, `{"tool_use_id":"x","hook_event_name":"SessionStart","cwd":"/"}`, `{"tool_use_id":"x","hook_event_name":"PostToolUse","cwd":"/no/such/dir","duration_ms":10}`} {
		if a, b := oldHook(env, in), newHook(env, in); a != b {
			t.Errorf("%q: old %+v new %+v", in, a, b)
		}
	}
}
