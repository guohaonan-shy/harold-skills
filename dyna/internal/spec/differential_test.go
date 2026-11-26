package spec_test

import (
	"bytes"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

// The old scripts and dyna answer the same question about the same docs and the same repository: the same output
// byte for byte, the same exit code. The old scripts stay in the repository until the last ticket removes them;
// node is needed to run them, and without node (or without the scripts) these tests are skipped.

func oldScript(t *testing.T, name string) func(dir string, args ...string) (string, string, int) {
	t.Helper()
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node is not installed")
	}
	script, _ := filepath.Abs(filepath.Join("..", "..", "..", "idea-loop", "scripts", name))
	if _, err := os.Stat(script); err != nil {
		t.Skip("the old script is gone")
	}
	return func(dir string, args ...string) (string, string, int) {
		cmd := exec.Command(node, append([]string{script}, args...)...)
		cmd.Dir = dir
		var out, errb bytes.Buffer
		cmd.Stdout, cmd.Stderr = &out, &errb
		code := 0
		if err := cmd.Run(); err != nil {
			code = err.(*exec.ExitError).ExitCode()
		}
		return out.String(), errb.String(), code
	}
}

// a docs with every kind of thing check reports: specs with numbers, a Linear key, no summary, an empty summary, a
// status line, an issues list of several shapes, tickets, a directory without its file, the old flat layout.
func richDocs(t *testing.T) string {
	t.Helper()
	docs := filepath.Join(t.TempDir(), "docs")
	spec := func(slug, front string) {
		writeFile(t, filepath.Join(docs, "spec", slug, slug+".md"), "---\ntype: spec\n"+front+"---\n\n# "+slug+"\n\n## 方案\n\nx\n")
	}
	spec("practice-retry", "summary: 重试不消耗配额 <会> & 其他\nissues: [12, ENG-123]\n")
	spec("b-two", "summary: 第二份   # 起草 routine\nissues: [3]\nstatus: 实现中\n")
	spec("a_one", "summary:\n")
	spec("a-one", "tags: [x]\n")
	spec("ab", "summary: 没有 issues 行\nissues: []\n")
	spec("a1", "summary: 带引号\nissues: [ENG-9, 12, 7]\n")
	writeFile(t, filepath.Join(docs, "spec", "practice-retry", "tickets", "01-a.md"), "x")
	writeFile(t, filepath.Join(docs, "spec", "practice-retry", "tickets", "02-b.md"), "x")
	writeFile(t, filepath.Join(docs, "spec", "practice-retry", "tickets", "notes.txt"), "x")
	writeFile(t, filepath.Join(docs, "spec", "empty", "notes.md"), "x")
	writeFile(t, filepath.Join(docs, "spec", "old-flat.md"), "x")
	writeFile(t, filepath.Join(docs, "spec", "tickets", "01-old.md"), "x")
	writeFile(t, filepath.Join(docs, "spec", "index.md"), "# spec\n> 契约：x\n\n| 文件 | status | summary |\n|---|---|---|\n| [[gone]] | 在飞 | 旧的 |\n\n> 当前为空。\n")
	return docs
}

func TestCheckPrintsWhatTheOldScriptPrinted(t *testing.T) {
	old := oldScript(t, "spec.mjs")
	docs := richDocs(t)
	wantOut, _, wantCode := old(t.TempDir(), "check", docs)
	out, errs, code := run(t, "spec", "check", docs)
	if code != wantCode || errs != "" || out != wantOut {
		t.Fatalf("code %d (old %d)\nnew: %s\nold: %s", code, wantCode, out, wantOut)
	}
	// and for a docs with no spec directory at all
	empty := t.TempDir()
	wantOut, _, _ = old(t.TempDir(), "check", empty)
	if out, _, _ = run(t, "spec", "check", empty); out != wantOut {
		t.Fatalf("new: %s\nold: %s", out, wantOut)
	}
}

func TestIndexWritesWhatTheOldScriptWrote(t *testing.T) {
	old := oldScript(t, "spec.mjs")
	a, b := richDocs(t), richDocs(t)
	if _, _, code := old(t.TempDir(), "index", a); code != 0 {
		t.Fatal("the old script failed")
	}
	if _, errs, code := run(t, "spec", "index", b); code != 0 {
		t.Fatal(errs)
	}
	wantText, _ := os.ReadFile(filepath.Join(a, "spec", "index.md"))
	gotText, _ := os.ReadFile(filepath.Join(b, "spec", "index.md"))
	if string(gotText) != string(wantText) {
		t.Fatalf("new:\n%s\nold:\n%s", gotText, wantText)
	}
}

func TestIndexOfAFileWithNoTableAndOfNoFileIsWhatTheOldScriptWrote(t *testing.T) {
	old := oldScript(t, "spec.mjs")
	for _, existing := range []string{"随手写的几行\n", ""} {
		a, b := richDocs(t), richDocs(t)
		for _, docs := range []string{a, b} {
			if existing == "" {
				_ = os.Remove(filepath.Join(docs, "spec", "index.md"))
			} else {
				writeFile(t, filepath.Join(docs, "spec", "index.md"), existing)
			}
		}
		old(t.TempDir(), "index", a)
		run(t, "spec", "index", b)
		wantText, _ := os.ReadFile(filepath.Join(a, "spec", "index.md"))
		gotText, _ := os.ReadFile(filepath.Join(b, "spec", "index.md"))
		if string(gotText) != string(wantText) {
			t.Fatalf("existing %q\nnew:\n%s\nold:\n%s", existing, gotText, wantText)
		}
	}
}

func TestTheLedgerCommandsAnswerWhatTheOldScriptAnswered(t *testing.T) {
	old := oldScript(t, "ticket-ledger.mjs")
	dir, shas := repo(t)
	t.Chdir(dir)
	hbBad := filepath.Join(t.TempDir(), "bad.txt")
	writeFile(t, hbBad, "读了哪几份写法规范 | 读 / 调 | writing-for-agents\n")
	hbGood := filepath.Join(t.TempDir(), "good.txt")
	writeFile(t, hbGood, "读了哪几份写法规范 | 调、读 | writing-for-agents\n杠杆 | `idea-loop/skills/a/SKILL.md` | 剪枝\n")
	cases := []struct {
		name             string
		oldArgs, newArgs []string
	}{
		{"landed", []string{"landed", "main"}, []string{"landed", "main"}},
		{"landed nothing", []string{"landed", "HEAD"}, []string{"landed", "HEAD"}},
		{"of a ticket", []string{"of", shas[0]}, []string{"ticket-of", shas[0]}},
		{"of a wip commit", []string{"of", shas[1]}, []string{"ticket-of", shas[1]}},
		{"skill-edit refused", []string{"skill-edit", shas[2], hbBad}, []string{"skill-edit", shas[2], hbBad}},
		{"skill-edit ok", []string{"skill-edit", shas[2], hbGood}, []string{"skill-edit", shas[2], hbGood}},
		{"skill-edit nothing to cover", []string{"skill-edit", shas[0], hbBad}, []string{"skill-edit", shas[0], hbBad}},
	}
	for _, c := range cases {
		wantOut, _, wantCode := old(dir, c.oldArgs...)
		out, _, code := run(t, append([]string{"spec"}, c.newArgs...)...)
		if out != wantOut || code != wantCode {
			t.Errorf("%s: new %q (%d), old %q (%d)", c.name, out, code, wantOut, wantCode)
		}
	}
}
