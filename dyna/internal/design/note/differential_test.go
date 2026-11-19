package note

import (
	"bytes"
	"encoding/json"
	"math/rand"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// The old script stays until the commands replace it; until then this runs both on the same notes and holds the
// verdict (the JSON, and the text a person reads) the same.

func TestDifferentialNoteSaysWhatTheOldScriptSaid(t *testing.T) {
	if _, err := exec.LookPath("node"); err != nil {
		t.Skip("node is not on PATH")
	}
	script, err := filepath.Abs(filepath.Join("..", "..", "..", "..", "idea-loop", "scripts", "direction-note-check.mjs"))
	if err != nil {
		t.Fatal(err)
	}

	good := note(nil)
	var corpus []string
	corpus = append(corpus, "", "# 只有一个标题\n", good, strings.ReplaceAll(good, "\n", "\r\n"))
	for _, dropped := range Sections {
		var parts []string
		for _, s := range Sections {
			if s != dropped {
				parts = append(parts, "## "+s+"\n\n"+body(s))
			}
		}
		corpus = append(corpus, strings.Join(parts, "\n\n"))
	}
	for _, c := range Composition {
		corpus = append(corpus, note(map[string]string{"变种裁决": "- **B** —— **选中**。\n" + composition(c)}))
	}
	corpus = append(corpus,
		note(map[string]string{"变种裁决": "- **B** —— **选中**。人说就这个。"}),
		note(map[string]string{"变种裁决": composition() + "\n- **C** —— **选中**。\n" + composition("颜色", "指向")}),
		note(map[string]string{"变种裁决": strings.Replace(composition(), "（模型代填）", "（待定）", 1)}),
		note(map[string]string{"变种裁决": strings.Replace(composition(), "（人选定）", "", 2)}),
		note(map[string]string{"变种裁决": strings.Replace(composition(), "指向：指向 的写法（模型代填）", "指向：", 1)}),
		note(map[string]string{"变种裁决": strings.Replace(composition(), "**构成**（B）：", "- **构成（A）**", 1)}),
		note(map[string]string{"待打磨清单": ""}),
		note(nil)+"\n\n## 结构\n\n又写了一遍。",
		note(nil)+"\n\n## 参考图\n\n贴了进来。",
		"## 参考图\n\n前面的\n\n"+note(nil),
		strings.Replace(note(nil), "## 高度记录\n\n高度记录 的正文。", "## 高度记录\n\n高度记录 的正文。\n\n## 夹在中间\n\n不该在这里。", 1),
		strings.Replace(note(nil), "## 意图 ", "## 意图 ##", 1),
		strings.Replace(note(nil), "## 结构", "###  结构  ###", 1),
		strings.Replace(note(nil), "## 结构", "## 结构", 1),
		note(nil)+"\n\n```md\n## 意图\n## 结构\n```\n",
		"~~~\n"+note(nil)+"\n~~~\n",
		"```\n"+note(nil),
	)
	var demoted []string
	for _, s := range Sections {
		demoted = append(demoted, "### "+s+"\n\n"+body(s))
	}
	corpus = append(corpus, strings.Join(demoted, "\n\n"))
	mixed := append([]string{}, demoted...)
	mixed[3] = strings.Replace(mixed[3], "###", "##", 1)
	corpus = append(corpus, strings.Join(mixed, "\n\n"))
	swapped := append([]string{}, demoted...)
	swapped[0], swapped[6] = swapped[6], swapped[0]
	corpus = append(corpus, strings.Join(swapped, "\n\n"))

	// and the good note with lines taken out and put back in the wrong place
	rng := rand.New(rand.NewSource(11))
	lines := strings.Split(good, "\n")
	for i := 0; i < 300; i++ {
		l := append([]string{}, lines...)
		for k := rng.Intn(4); k >= 0; k-- {
			j := rng.Intn(len(l))
			switch rng.Intn(3) {
			case 0:
				l = append(l[:j], l[j+1:]...)
			case 1:
				at := rng.Intn(len(l))
				l[at], l[j] = l[j], l[at]
			default:
				l = append(l[:j+1], append([]string{l[rng.Intn(len(l))]}, l[j+1:]...)...)
			}
		}
		corpus = append(corpus, strings.Join(l, "\n"))
	}

	in, _ := json.Marshal(corpus)
	dir := t.TempDir()
	corpusFile := filepath.Join(dir, "corpus.json")
	if err := os.WriteFile(corpusFile, in, 0o644); err != nil {
		t.Fatal(err)
	}
	const runner = `
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const { checkDirectionNote, renderReport } = await import(pathToFileURL(process.env.OLD_SCRIPT).href);
const corpus = JSON.parse(readFileSync(process.env.CORPUS, 'utf8'));
process.stdout.write(JSON.stringify(corpus.map((md) => { const r = checkDirectionNote(md); return { text: renderReport(r, 'n.md'), json: JSON.stringify(r, null, 2) }; })));
`
	cmd := exec.Command("node", "--input-type=module", "-e", runner)
	cmd.Env = append(os.Environ(), "OLD_SCRIPT="+script, "CORPUS="+corpusFile)
	var out, errb bytes.Buffer
	cmd.Stdout, cmd.Stderr = &out, &errb
	if err := cmd.Run(); err != nil {
		t.Fatalf("%v\n%s", err, errb.String())
	}
	var want []struct{ Text, JSON string }
	if err := json.Unmarshal(out.Bytes(), &want); err != nil {
		t.Fatal(err)
	}
	bad := 0
	for i, md := range corpus {
		got := Check(md)
		if text := Report(got, "n.md"); text != want[i].Text {
			bad++
			if bad <= 3 {
				t.Errorf("text differs for %q\n--- old\n%s\n--- new\n%s", md, want[i].Text, text)
			}
		} else if j := resultJSON(got); j != want[i].JSON {
			bad++
			if bad <= 3 {
				t.Errorf("json differs for %q\n--- old\n%s\n--- new\n%s", md, want[i].JSON, j)
			}
		}
	}
	if bad > 0 {
		t.Errorf("%d of %d notes differ", bad, len(corpus))
	}
}
