package home

import (
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/spec"
)

// The layers whose index.md is generated from the files' frontmatter. A layer's index is its title, its one-line
// contract and a table; the table is rewritten, everything above and below it stays as a person left it.
//
//	spec  docs/spec/<slug>/<slug>.md            文件 | summary            (a spec has no status of its own)
//	adr   docs/adr/<编号>-<名字>.md              文件 | status | summary
//	raw   docs/raw/**.md                         文件 | source_type | captured | summary
var Layers = []string{"spec", "adr", "raw"}

type layerSpec struct {
	header  []string
	initial string // the index of a layer that has none yet
}

var layerSpecs = map[string]layerSpec{
	"spec": {
		header:  []string{"文件", "summary"},
		initial: "# spec\n> 契约：还没了结的规格，一份一个目录（`<slug>/<slug>.md`，工单在 `<slug>/tickets/`）——做完整个目录删（删前必须先写 ADR）。\n\n",
	},
	"adr": {
		header:  []string{"文件", "status", "summary"},
		initial: "# adr\n> 契约：spec 的归档总结——永久。做了的记 why/how/result，决定不做的记 why-not。取代默认是 section 级，不是整份作废。\n\n",
	},
	"raw": {
		header:  []string{"文件", "source_type", "captured", "summary"},
		initial: "# raw\n> 契约：素材与事实——忠实，不编辑。\n\n",
	},
}

type indexRow struct {
	slug  string
	cells []string // the columns after the first
	sort  string
}

var headerLine = regexp.MustCompile(`^\|\s*文件\s*\|`)

func unquote(s string) string {
	s = strings.TrimSpace(s)
	if len(s) >= 2 && (s[0] == '"' && s[len(s)-1] == '"' || s[0] == '\'' && s[len(s)-1] == '\'') {
		return s[1 : len(s)-1]
	}
	return s
}

func cell(s string) string { return strings.ReplaceAll(strings.ReplaceAll(s, "\n", " "), "|", `\|`) }

// RenderIndex replaces the index table of existing (the whole file when it has none) with rows, keeping what is
// above and below it. A table that has the wrong columns for the layer, a status column on a spec, say, is
// rewritten. Rows of the old table that a stray line cut off from it are dropped too.
func RenderIndex(layer, existing string, rows []indexRow) string {
	ls := layerSpecs[layer]
	if strings.TrimSpace(existing) == "" {
		existing = ls.initial
	}
	lines := strings.Split(existing, "\n")
	header := -1
	for i, l := range lines {
		if headerLine.MatchString(l) {
			header = i
			break
		}
	}
	var before, after []string
	if header < 0 {
		before = append(strings.Split(strings.TrimRight(existing, "\n"), "\n"), "")
	} else {
		end := header + 2
		for end < len(lines) && strings.HasPrefix(lines[end], "|") {
			end++
		}
		before = lines[:header]
		for _, l := range lines[min(end, len(lines)):] {
			if strings.HasPrefix(l, "| [") { // a row of the table that something cut off
				continue
			}
			after = append(after, l)
		}
	}
	sort.SliceStable(rows, func(i, j int) bool { return rows[i].sort < rows[j].sort })
	out := append([]string{}, before...)
	out = append(out, "| "+strings.Join(ls.header, " | ")+" |", "|"+strings.Repeat("---|", len(ls.header)))
	for _, r := range rows {
		cells := []string{"[[" + r.slug + "]]"}
		for _, c := range r.cells {
			cells = append(cells, cell(c))
		}
		out = append(out, "| "+strings.Join(cells, " | ")+" |")
	}
	out = append(out, after...)
	text := strings.Join(out, "\n")
	if !strings.HasSuffix(text, "\n") {
		text += "\n"
	}
	return text
}

func summaryOf(fm map[string]string) string {
	if s := unquote(fm["summary"]); s != "" {
		return s
	}
	return unquote(fm["title"])
}

func readFM(path string) (map[string]string, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	return spec.Frontmatter(string(b)), nil
}

func slugOf(path string) string { return strings.TrimSuffix(filepath.Base(path), ".md") }

// rowsOf reads the files of a layer into table rows. A layer whose directory is not there has none (ok false).
func rowsOf(docs, layer string) (rows []indexRow, ok bool, err error) {
	dir := filepath.Join(docs, layer)
	if !isDir(dir) {
		return nil, false, nil
	}
	switch layer {
	case "spec":
		entries, err := os.ReadDir(dir)
		if err != nil {
			return nil, true, err
		}
		for _, e := range entries {
			file := filepath.Join(dir, e.Name(), e.Name()+".md")
			if !e.IsDir() || !exists(file) {
				continue
			}
			fm, err := readFM(file)
			if err != nil {
				return nil, true, err
			}
			rows = append(rows, indexRow{slug: e.Name(), cells: []string{summaryOf(fm)}, sort: e.Name()})
		}
	case "adr", "raw":
		err = filepath.WalkDir(dir, func(p string, d fs.DirEntry, err error) error {
			if err != nil {
				return err
			}
			if d.IsDir() {
				if p != dir && (layer == "adr" || strings.HasPrefix(d.Name(), ".")) {
					return filepath.SkipDir
				}
				return nil
			}
			if !strings.HasSuffix(d.Name(), ".md") || d.Name() == "index.md" {
				return nil
			}
			fm, err := readFM(p)
			if err != nil {
				return err
			}
			if layer == "adr" {
				rows = append(rows, indexRow{slug: slugOf(p), cells: []string{fm["status"], summaryOf(fm)}, sort: d.Name()})
			} else {
				rows = append(rows, indexRow{slug: slugOf(p), cells: []string{fm["source_type"], fm["captured"], summaryOf(fm)}, sort: fm["captured"] + " " + d.Name()})
			}
			return nil
		})
	}
	return rows, true, err
}

// WriteIndexes regenerates the index.md of the given layers (all of them when none is given) under docs and
// says, one line per layer, what it did. A file whose text would not change is not written.
func WriteIndexes(docs string, layers []string) ([]string, error) {
	if len(layers) == 0 {
		layers = Layers
	}
	var lines []string
	for _, layer := range layers {
		if _, known := layerSpecs[layer]; !known {
			return lines, fmt.Errorf("层「%s」没有生成的索引（%s）", layer, strings.Join(Layers, " / "))
		}
		rows, ok, err := rowsOf(docs, layer)
		if err != nil {
			return lines, err
		}
		if !ok {
			lines = append(lines, fmt.Sprintf("%s：没有 docs/%s/，跳过", layer, layer))
			continue
		}
		file := filepath.Join(docs, layer, "index.md")
		old, _ := os.ReadFile(file)
		text := RenderIndex(layer, string(old), rows)
		if text == string(old) {
			lines = append(lines, fmt.Sprintf("%s：%d 条，索引没有变化", layer, len(rows)))
			continue
		}
		if err := os.WriteFile(file, []byte(text), 0o644); err != nil {
			return lines, err
		}
		lines = append(lines, fmt.Sprintf("%s：%d 条，已写入 %s", layer, len(rows), file))
	}
	return lines, nil
}
