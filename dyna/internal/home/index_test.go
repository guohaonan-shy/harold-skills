package home_test

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// `home index` (new: spec layer follows spec.mjs's `index`, raw and adr follow dreaming's hand-written format
// in skills/productivity/dreaming/references/index-md.md) and `home adr new` (new).

func docsOf(w world) string { return filepath.Join(w.home, docsRel) }

func TestIndexOfTheSpecLayerIsATableOfSlugAndSummaryKeepingTheTextAround(t *testing.T) {
	w := moved(t, opts{})
	write(t, w.home, docsRel+"/spec/b-spec/b-spec.md", "---\ntype: spec\nsummary: 第二份\nissues: [2]\n---\n# b\n")
	write(t, w.home, docsRel+"/spec/a-spec/a-spec.md", "---\ntype: spec\nsummary: 第一份 | 带竖线\nissues: [1]\n---\n# a\n")
	write(t, w.home, docsRel+"/spec/a-spec/tickets/01-x.md", "# 01\n")
	write(t, w.home, docsRel+"/spec/index.md", "# spec\n> 人写的契约\n\n| 文件 | status | summary |\n|---|---|---|\n| [[old]] | 草稿 | 旧的 |\n\n下面这句人写的话留着。\n")
	r := w.run(w.home, "home", "index", "--project", "example-app", "--layer", "spec").ok(t)
	want := "# spec\n> 人写的契约\n\n| 文件 | summary |\n|---|---|\n| [[a-spec]] | 第一份 \\| 带竖线 |\n| [[b-spec]] | 第二份 |\n\n下面这句人写的话留着。\n"
	if got := readFile(t, docsOf(w)+"/spec/index.md"); got != want {
		t.Fatalf("got:\n%s", got)
	}
	if !strings.Contains(r.out, "spec：2 条") {
		t.Fatal(r.out)
	}
	// again: no change, and it says so
	if r := w.run(w.home, "home", "index", "--project", "example-app", "--layer", "spec").ok(t); !strings.Contains(r.out, "没有变化") {
		t.Fatal(r.out)
	}
}

func TestIndexOfTheSpecLayerIsTheTextTheOldScriptWrites(t *testing.T) {
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node is needed to run the old script")
	}
	for _, existing := range []string{"", "# spec\n> 契约\n\n| 文件 | status | summary |\n|---|---|---|\n| [[x]] | 草稿 | y |\n\n尾巴\n"} {
		w := moved(t, opts{})
		write(t, w.home, docsRel+"/spec/b-spec/b-spec.md", "---\nsummary: 第二份\n---\n")
		write(t, w.home, docsRel+"/spec/a-spec/a-spec.md", "---\nsummary: 第一份\n---\n")
		idx := docsOf(w) + "/spec/index.md"
		if existing != "" {
			write(t, w.home, docsRel+"/spec/index.md", existing)
		}
		cmd := exec.Command(node, filepath.Join("..", "..", "..", "idea-loop", "scripts", "spec.mjs"), "index", docsOf(w))
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("%v\n%s", err, out)
		}
		old := readFile(t, idx)
		if existing == "" {
			_ = os.Remove(idx)
		} else {
			write(t, w.home, docsRel+"/spec/index.md", existing)
		}
		w.run(w.home, "home", "index", "--project", "example-app", "--layer", "spec").ok(t)
		if got := readFile(t, idx); got != old {
			t.Errorf("existing %q:\nold script:\n%s\ndyna:\n%s", existing, old, got)
		}
	}
}

func TestIndexOfTheAdrLayerHasFileStatusSummary(t *testing.T) {
	w := moved(t, opts{})
	write(t, w.home, docsRel+"/adr/0002-b.md", "---\ntype: adr\nstatus: 生效\nsummary: \"第二条\"\n---\n")
	write(t, w.home, docsRel+"/adr/0001-a.md", "---\ntype: adr\nstatus: 被取代\nsummary: 第一条\n---\n")
	w.run(w.home, "home", "index", "--project", "example-app", "--layer", "adr").ok(t)
	want := "# adr\n> 契约：spec 的归档总结——永久。做了的记 why/how/result，决定不做的记 why-not。取代默认是 section 级，不是整份作废。\n\n" +
		"| 文件 | status | summary |\n|---|---|---|\n| [[0001-a]] | 被取代 | 第一条 |\n| [[0002-b]] | 生效 | 第二条 |\n"
	if got := readFile(t, docsOf(w)+"/adr/index.md"); got != want {
		t.Fatalf("got:\n%s", got)
	}
}

func TestIndexOfTheRawLayerWalksTheBucketsAndHasSourceTypeAndCaptured(t *testing.T) {
	w := moved(t, opts{})
	write(t, w.home, docsRel+"/raw/2026-11-02-b.md", "---\ntype: raw\nsource_type: web\ncaptured: 2026-11-02\nsummary: 乙\n---\n")
	write(t, w.home, docsRel+"/raw/decisions/51.md", "---\ntype: raw\nsource_type: conversation\ncaptured: 2026-10-23\ntitle: 没有 summary 就用 title\n---\n")
	write(t, w.home, docsRel+"/raw/index.md", "# raw\n> 契约：素材\n\n| 文件 | source_type | captured | summary |\n|---|---|---|---|\n| [[stale]] | x | y | z |\n\n> 一段说明\n\n| [[stray]] | x | y | z |\n")
	w.run(w.home, "home", "index", "--project", "example-app", "--layer", "raw").ok(t)
	want := "# raw\n> 契约：素材\n\n| 文件 | source_type | captured | summary |\n|---|---|---|---|\n" +
		"| [[51]] | conversation | 2026-10-23 | 没有 summary 就用 title |\n| [[2026-11-02-b]] | web | 2026-11-02 | 乙 |\n\n> 一段说明\n\n"
	if got := readFile(t, docsOf(w)+"/raw/index.md"); got != want {
		t.Fatalf("got:\n%q\nwant:\n%q", got, want)
	}
}

func TestIndexWithNoLayerDoesTheLayersThatExistAndSkipsTheRest(t *testing.T) {
	w := moved(t, opts{})
	write(t, w.home, docsRel+"/adr/0001-a.md", "---\nstatus: 生效\nsummary: 一\n---\n")
	r := w.run(w.home, "home", "index", "--project", "example-app").ok(t)
	if !strings.Contains(r.out, "spec：没有 docs/spec/，跳过") || !strings.Contains(r.out, "raw：没有 docs/raw/，跳过") || !strings.Contains(r.out, "adr：1 条") {
		t.Fatal(r.out)
	}
	if _, err := os.Stat(docsOf(w) + "/spec/index.md"); err == nil {
		t.Fatal("wrote an index for a layer that is not there")
	}
	if r := w.run(w.home, "home", "index", "--project", "example-app", "--layer", "design"); r.code == 0 || !strings.Contains(r.err, "没有生成的索引") {
		t.Fatal(r)
	}
}

func TestIndexOfAProjectThatIsNotConnectedSaysSo(t *testing.T) {
	w := newWorld(t, opts{origin: "git@github.com:acme/unregistered.git"})
	if r := w.run(w.code, "home", "index"); r.code == 0 || !strings.Contains(r.err, "/idea-loop:setup") {
		t.Fatal(r)
	}
}

func TestADRNewGivesTheNextFourDigitNumber(t *testing.T) { // acceptance: with 0001 and 0003 there, 0004
	w := moved(t, opts{})
	write(t, w.home, docsRel+"/adr/0001-first.md", "x\n")
	write(t, w.home, docsRel+"/adr/0003-third.md", "x\n")
	write(t, w.home, docsRel+"/adr/index.md", "# adr\n")
	r := w.run(w.home, "home", "adr", "new", "--project", "example-app", "dyna-home").ok(t)
	if r.out != "0004-dyna-home.md\n" {
		t.Fatal(r.out)
	}
	// from a session in the code repository, with no --project, and a name that already ends in .md
	if r := w.run(w.code, "home", "adr", "new", "x.md").ok(t); r.out != "0004-x.md\n" {
		t.Fatal(r.out)
	}
	// the number is never handed back: the highest goes up, a gap stays a gap
	write(t, w.home, docsRel+"/adr/0004-dyna-home.md", "x\n")
	if r := w.run(w.code, "home", "adr", "new", "next").ok(t); r.out != "0005-next.md\n" {
		t.Fatal(r.out)
	}
}

func TestADRNewOfAnEmptyOrMissingAdrDirectoryIsNumberOne(t *testing.T) {
	w := moved(t, opts{})
	if r := w.run(w.home, "home", "adr", "new", "--project", "example-app", "first").ok(t); r.out != "0001-first.md\n" {
		t.Fatal(r.out)
	}
}

func TestADRNewRefusesNamesThatAreNotAName(t *testing.T) {
	w := moved(t, opts{})
	for _, bad := range []string{"", "a/b", "has space", ".hidden", "0007-already-numbered"} {
		if r := w.run(w.home, "home", "adr", "new", "--project", "example-app", bad); r.code == 0 || r.out != "" {
			t.Errorf("%q: %+v", bad, r)
		}
	}
}
