package spec

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"unicode"
)

// Listed is one spec found under docs/spec/, as `check` reports it.
type Listed struct {
	Slug    string  `json:"slug"`
	File    string  `json:"file"`
	Issues  []any   `json:"issues"` // a GitHub issue as a number, a Linear one as its key
	Summary *string `json:"summary,omitempty"`
	Tickets int     `json:"tickets"`
}

// Report is what `check` prints: the specs, and what is wrong with the layout.
type Report struct {
	Specs    []Listed `json:"specs"`
	Problems []string `json:"problems"`
}

func isDir(p string) bool {
	st, err := os.Stat(p)
	return err == nil && st.IsDir()
}

func readOrEmpty(p string) string {
	b, err := os.ReadFile(p)
	if err != nil {
		return ""
	}
	return string(b)
}

// Check reads docs/spec/: the specs there, and the problems with the layout (the old flat layout, a spec
// directory without its spec file, a status line left over from the old state machine).
func Check(docs string) Report {
	r := Report{Specs: []Listed{}, Problems: []string{}}
	root := filepath.Join(docs, "spec")
	if !isDir(root) {
		return r
	}
	entries, err := os.ReadDir(root)
	if err != nil {
		return r
	}
	for _, e := range entries {
		name := e.Name()
		p := filepath.Join(root, name)
		switch {
		case name == "tickets" && isDir(p):
			r.Problems = append(r.Problems, "docs/spec/tickets/ 是旧的平铺布局，按 wiki-conventions 的「从平铺布局迁移」迁移")
		case strings.HasSuffix(name, ".md") && name != "index.md":
			r.Problems = append(r.Problems, "docs/spec/"+name+" 是旧的平铺布局，按 wiki-conventions 的「从平铺布局迁移」迁移")
		case isDir(p):
			file := filepath.Join(p, name+".md")
			if _, err := os.Stat(file); err != nil {
				r.Problems = append(r.Problems, "docs/spec/"+name+"/ 里没有 "+name+".md")
				continue
			}
			md := readOrEmpty(file)
			fm := Frontmatter(md)
			tickets := 0
			if tdir := filepath.Join(p, "tickets"); isDir(tdir) {
				files, _ := os.ReadDir(tdir)
				for _, f := range files {
					if strings.HasSuffix(f.Name(), ".md") {
						tickets++
					}
				}
			}
			if _, has := fm["status"]; has {
				r.Problems = append(r.Problems, fmt.Sprintf("docs/spec/%s/%s.md 的 frontmatter 还有 status 行（spec 没有状态了，删掉这一行；进度看 issue 的 label）", name, name))
			}
			l := Listed{Slug: name, File: file, Issues: []any{}, Tickets: tickets}
			for _, ref := range IssuesOf(md) {
				if ref.IsKey() {
					l.Issues = append(l.Issues, ref.Key)
				} else {
					l.Issues = append(l.Issues, ref.Num)
				}
			}
			if s, ok := fm["summary"]; ok {
				l.Summary = &s
			}
			r.Specs = append(r.Specs, l)
		}
	}
	return r
}

// JSON is the report the way the old script printed it: two-space indent, a newline at the end.
func (r Report) JSON() string {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	enc.SetIndent("", "  ")
	_ = enc.Encode(r)
	// JSON.stringify leaves these two line separators as they are; Go always escapes them
	return strings.NewReplacer(` `, " ", ` `, " ").Replace(buf.String())
}

const defaultIndex = "# spec\n> 契约：还没了结的规格，一份一个目录（`<slug>/<slug>.md`，工单在 `<slug>/tickets/`）——做完整个目录删（删前必须先写 ADR）。\n\n| 文件 | summary |\n|---|---|\n"

// RenderIndex replaces the index table, keeping everything above and below it. There is no status column: a spec
// has no status, and its issues' labels change on every stage, so a column here would make branches running side
// by side conflict on this file. An old table with a status column is rewritten, and so are rows of the old table
// that a stray line cut off from it. A `|` or a line break in a summary cannot break the table. This is the one
// place the spec layer's index is written: `spec index` and `home index` both come here.
func RenderIndex(existing string, specs []Listed) string {
	if existing == "" {
		existing = defaultIndex
	}
	lines := strings.Split(existing, "\n")
	header := -1
	for i, l := range lines {
		if isIndexHeader(l) {
			header = i
			break
		}
	}
	if header < 0 {
		return RenderIndex(defaultIndex+"\n"+strings.TrimSpace(existing)+"\n", specs)
	}
	end := header + 2
	for end < len(lines) && strings.HasPrefix(lines[end], "|") {
		end++
	}
	sorted := append([]Listed(nil), specs...)
	sortSlugs(sorted)
	out := append([]string{}, lines[:header]...)
	out = append(out, "| 文件 | summary |", "|---|---|")
	for _, s := range sorted {
		cell := ""
		if s.Summary != nil {
			cell = strings.ReplaceAll(strings.ReplaceAll(*s.Summary, "\n", " "), "|", `\|`)
		}
		out = append(out, "| [["+s.Slug+"]] | "+cell+" |")
	}
	if end <= len(lines) {
		for _, l := range lines[end:] {
			if !strings.HasPrefix(l, "| [") { // a row of the table that something cut off
				out = append(out, l)
			}
		}
	}
	return strings.Join(out, "\n")
}

// isIndexHeader: a line that starts the table, `| 文件 | …`.
func isIndexHeader(l string) bool {
	if !strings.HasPrefix(l, "|") {
		return false
	}
	rest := strings.TrimLeftFunc(l[1:], unicode.IsSpace)
	if !strings.HasPrefix(rest, "文件") {
		return false
	}
	rest = strings.TrimLeftFunc(rest[len("文件"):], unicode.IsSpace)
	return strings.HasPrefix(rest, "|")
}

// IndexText is docs/spec/index.md as it should read: the table rewritten from the specs on disk, the text around it as
// it is in existing, and how many specs the table has. A spec's cell is its summary without quotes, or its title when
// it has no summary.
func IndexText(docs, existing string) (string, int) {
	specs := Check(docs).Specs
	for i := range specs {
		fm := Frontmatter(readOrEmpty(specs[i].File))
		cell := unquote(fm["summary"])
		if cell == "" {
			cell = unquote(fm["title"])
		}
		specs[i].Summary = &cell
	}
	return RenderIndex(existing, specs), len(specs)
}

func unquote(s string) string {
	s = strings.TrimSpace(s)
	if len(s) >= 2 && (s[0] == '"' && s[len(s)-1] == '"' || s[0] == '\'' && s[len(s)-1] == '\'') {
		return s[1 : len(s)-1]
	}
	return s
}

// Reindex rewrites docs/spec/index.md from the specs on disk.
func Reindex(docs string) error {
	file := filepath.Join(docs, "spec", "index.md")
	text, _ := IndexText(docs, readOrEmpty(file))
	return os.WriteFile(file, []byte(text), 0o644)
}
