package flow

import (
	"bytes"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// The old script stays until the commands replace it; until then this runs both on the same flows and holds what the
// check says (every message, in order), the page it renders (byte for byte) and the state map and name the same.

func deep(t *testing.T, f obj) obj {
	t.Helper()
	b, _ := json.Marshal(f)
	var out obj
	if err := json.Unmarshal(b, &out); err != nil {
		t.Fatal(err)
	}
	return out
}

func TestDifferentialFlowSaysAndDrawsWhatTheOldScriptDid(t *testing.T) {
	if _, err := exec.LookPath("node"); err != nil {
		t.Skip("node is not on PATH")
	}
	script, err := filepath.Abs(filepath.Join("..", "..", "..", "..", "idea-loop", "scripts", "flow-compose.mjs"))
	if err != nil {
		t.Fatal(err)
	}

	var corpus []any // each is the flow as a JSON value
	add := func(f obj) { corpus = append(corpus, deep(t, f)) }
	mutate := func(from func() obj, m func(f obj)) {
		f := deep(t, from())
		m(f)
		corpus = append(corpus, f)
	}
	corpus = append(corpus, nil, 5, "x", true, []any{}, obj{}, obj{"rows": "x"}, obj{"title": "t", "rows": []any{}})
	add(base())
	add(withStates())
	for _, from := range []func() obj{base, withStates} {
		mutate(from, func(f obj) { delete(f, "title") })
		mutate(from, func(f obj) { f["title"] = "   " })
		mutate(from, func(f obj) { f["title"] = 3 })
		for _, scale := range []any{0, 3, "x", 1, 0.25, 2, -1, nil, 0.1, 1.5} {
			s := scale
			mutate(from, func(f obj) { f["scale"] = s })
		}
		mutate(from, func(f obj) { f["note"] = "<b>&\"x\"</b>" })
		mutate(from, func(f obj) { f["note"] = "   " })
		mutate(from, func(f obj) { delete(f, "note") })
		mutate(from, func(f obj) { f["title"] = "a<b>&\"c\"" })
		mutate(from, func(f obj) { delete(rowOf(f, 0), "steps") })
		mutate(from, func(f obj) { rowOf(f, 0)["steps"] = []any{} })
		mutate(from, func(f obj) { rowOf(f, 0)["steps"] = "x" })
		mutate(from, func(f obj) { delete(rowOf(f, 2), "label") })
		mutate(from, func(f obj) { rowOf(f, 2)["label"] = "  " })
		mutate(from, func(f obj) { rowOf(f, 2)["label"] = "a & <b>" })
		mutate(from, func(f obj) { rowOf(f, 0)["label"] = "第一行也有标题" })
		mutate(from, func(f obj) { rowOf(f, 1)["connected"] = false })
		mutate(from, func(f obj) { rowOf(f, 0)["connected"] = false })
		mutate(from, func(f obj) { rowOf(f, 0)["connected"] = "no" })
		for _, bf := range []any{obj{"row": 0, "step": 7}, obj{"row": 1, "step": 0}, obj{"row": -1, "step": 0}, obj{"row": 0, "step": -1},
			obj{"row": "0", "step": 0}, obj{"row": 0.5, "step": 0}, nil, "x", 5, obj{}, obj{"row": 0}, obj{"row": 0, "step": 0}, obj{"row": 0, "step": 2}} {
			b := bf
			mutate(from, func(f obj) { rowOf(f, 1)["branchFrom"] = b })
		}
		mutate(from, func(f obj) { rowOf(f, 0)["branchFrom"] = obj{"row": 0, "step": 0} })
		mutate(from, func(f obj) { delete(stepOf(f, 1, 0), "trigger") })
		mutate(from, func(f obj) { stepOf(f, 1, 0)["trigger"] = "  " })
		mutate(from, func(f obj) { stepOf(f, 0, 0)["trigger"] = "打开" })
		mutate(from, func(f obj) { stepOf(f, 2, 0)["trigger"] = "x" })
		mutate(from, func(f obj) { stepOf(f, 0, 1)["trigger"] = "a<b>\"&" })
		mutate(from, func(f obj) { delete(stepOf(f, 0, 0), "image") })
		mutate(from, func(f obj) { stepOf(f, 0, 0)["image"] = "" })
		mutate(from, func(f obj) { stepOf(f, 0, 0)["image"] = "missing/a.png" })
		mutate(from, func(f obj) { stepOf(f, 0, 0)["image"] = "a b&c.png" })
		mutate(from, func(f obj) { delete(stepOf(f, 0, 0), "caption") })
		mutate(from, func(f obj) { stepOf(f, 0, 0)["caption"] = 7 })
		mutate(from, func(f obj) { stepOf(f, 0, 0)["caption"] = "<i>&</i>" })
		for _, st := range []any{"", "  ", "a b", "[[x]]", "x[", "ok--a", "missing--a", 7, nil, true, "页面--状态", "a\u00a0b"} {
			s := st
			mutate(from, func(f obj) { stepOf(f, 0, 0)["state"] = s })
			mutate(from, func(f obj) { stepOf(f, 1, 0)["state"] = s })
		}
		for _, cs := range []any{
			[]any{obj{"x": 1, "y": 2}}, []any{obj{"x": 1, "y": 2, "r": 0}}, []any{obj{"x": 1, "y": 2, "r": -3}}, []any{obj{"x": "1", "y": 2, "r": 3}},
			[]any{nil}, []any{5}, []any{}, nil,
			[]any{obj{"x": 40.5, "y": 10.25, "r": 3.3}, obj{"x": 1, "y": 1, "r": 1}},
			[]any{obj{"x": 0.1, "y": 0.2, "r": 0.3}},
		} {
			c := cs
			mutate(from, func(f obj) { stepOf(f, 0, 1)["circles"] = c })
		}
		mutate(from, func(f obj) { f["scale"] = 0.3; stepOf(f, 0, 1)["circles"] = []any{obj{"x": 33, "y": 77, "r": 11}} })
	}
	// a bigger grid: a branch off a branch, a second label, a third row of steps
	deepFlow := obj{"title": "多层分支", "rows": []any{
		obj{"steps": []any{obj{"image": "a.png", "caption": "a"}, obj{"image": "b.png", "trigger": "t1", "caption": "b"}, obj{"image": "c.png", "trigger": "t2", "caption": "c"}}},
		obj{"label": "分支一", "branchFrom": obj{"row": 0, "step": 0}, "steps": []any{obj{"image": "d.png", "trigger": "t3", "caption": "d"}, obj{"image": "e.png", "trigger": "t4", "caption": "e", "state": "p--e"}}},
		obj{"branchFrom": obj{"row": 1, "step": 1}, "steps": []any{obj{"image": "f.png", "trigger": "t5", "caption": "f"}}},
		obj{"label": "同一规则", "connected": false, "steps": []any{obj{"image": "g.png", "caption": "g"}, obj{"image": "h.png", "caption": "h"}}},
	}}
	add(deepFlow)

	in, _ := json.Marshal(corpus)
	dir := t.TempDir()
	corpusFile := filepath.Join(dir, "corpus.json")
	if err := os.WriteFile(corpusFile, in, 0o644); err != nil {
		t.Fatal(err)
	}
	const runner = `
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const m = await import(pathToFileURL(process.env.OLD_SCRIPT).href);
const corpus = JSON.parse(readFileSync(process.env.CORPUS, 'utf8'));
const exists = (p) => !p.startsWith('missing');
const hasState = (id) => id.startsWith('ok') || id.startsWith('p--');
process.stdout.write(JSON.stringify(corpus.map((flow) => {
  const plain = m.checkFlow(flow, exists);
  const withArchive = m.checkFlow(flow, exists, hasState);
  const out = { plain: plain.errors, withArchive: withArchive.errors };
  if (plain.valid) {
    out.html = m.renderHtml(flow, (p) => 'x/' + p);
    out.states = m.stateMap(flow);
    out.name = m.flowFileName(flow, 3);
  }
  return out;
})));
`
	cmd := exec.Command("node", "--input-type=module", "-e", runner)
	cmd.Env = append(os.Environ(), "OLD_SCRIPT="+script, "CORPUS="+corpusFile)
	var out, errb bytes.Buffer
	cmd.Stdout, cmd.Stderr = &out, &errb
	if err := cmd.Run(); err != nil {
		t.Fatalf("%v\n%s", err, errb.String())
	}
	var want []struct {
		Plain, WithArchive []string
		HTML               *string
		States             []struct {
			Row, Step      int
			State, Caption string
		}
		Name *string
	}
	if err := json.Unmarshal(out.Bytes(), &want); err != nil {
		t.Fatal(err)
	}
	if len(want) != len(corpus) {
		t.Fatalf("%d results for %d flows", len(want), len(corpus))
	}
	exists := func(p string) bool { return !strings.HasPrefix(p, "missing") }
	hasState := func(id string) bool { return strings.HasPrefix(id, "ok") || strings.HasPrefix(id, "p--") }
	rendered, bad := 0, 0
	fail := func(i int, what string, old, got any) {
		bad++
		if bad <= 4 {
			b, _ := json.Marshal(corpus[i])
			t.Errorf("%s differs for %s\n--- old\n%v\n--- new\n%v", what, b, old, got)
		}
	}
	for i, c := range corpus {
		v := fromObj(t, c)
		plain := Check(v, exists, nil)
		if strings.Join(plain, "\n") != strings.Join(want[i].Plain, "\n") {
			fail(i, "errors", want[i].Plain, plain)
			continue
		}
		if with := Check(v, exists, hasState); strings.Join(with, "\n") != strings.Join(want[i].WithArchive, "\n") {
			fail(i, "errors with the archive", want[i].WithArchive, with)
			continue
		}
		if len(plain) > 0 {
			if want[i].HTML != nil {
				fail(i, "validity", "valid", "invalid")
			}
			continue
		}
		rendered++
		f := From(v)
		if html := RenderHTML(f, func(p string) string { return "x/" + p }); want[i].HTML == nil || html != *want[i].HTML {
			fail(i, "page", "(old page)", "(new page)")
			if want[i].HTML != nil {
				for n := 0; n < len(html) && n < len(*want[i].HTML); n++ {
					if html[n] != (*want[i].HTML)[n] {
						lo := max(0, n-60)
						t.Logf("first difference at byte %d:\nold: %q\nnew: %q", n, (*want[i].HTML)[lo:min(len(*want[i].HTML), n+60)], html[lo:min(len(html), n+60)])
						break
					}
				}
			}
			continue
		}
		states := StateMap(f)
		if len(states) != len(want[i].States) {
			fail(i, "state map", want[i].States, states)
			continue
		}
		for k, s := range states {
			w := want[i].States[k]
			if s.Row != w.Row || s.Step != w.Step || s.State != w.State || s.Caption != w.Caption {
				fail(i, "state map", w, s)
			}
		}
		name := FileName(f, 3)
		if (want[i].Name == nil) != (name == "") || (want[i].Name != nil && *want[i].Name != name) {
			fail(i, "file name", want[i].Name, name)
		}
	}
	if rendered < 40 {
		t.Fatalf("only %d of %d flows were valid enough to render: the corpus is not testing the page", rendered, len(corpus))
	}
	if bad > 0 {
		t.Errorf("%d of %d flows differ", bad, len(corpus))
	}
}
