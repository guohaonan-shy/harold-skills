package home

import (
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

// The rules of a project's docs/ that only a whole-directory look can judge (wiki-conventions, 「slug 与链接」):
// every slug is unique, and every `[[…]]` points at a file that exists.

// Duplicate is one slug that two or more files of docs/ answer to.
type Duplicate struct {
	Slug  string
	Files []string // relative to the docs directory
}

// DeadLink is one `[[…]]` that points at no file.
type DeadLink struct {
	File string // relative to the docs directory
	Line int
	Slug string
}

// DocsReport is what CheckDocs found.
type DocsReport struct {
	Duplicates []Duplicate
	DeadLinks  []DeadLink
}

// OK is true when nothing was found.
func (r DocsReport) OK() bool { return len(r.Duplicates) == 0 && len(r.DeadLinks) == 0 }

var (
	wikiLink   = regexp.MustCompile(`\[\[([^\[\]\n]+?)\]\]`)
	fenceStart = regexp.MustCompile("^\\s*(`{3,}|~{3,})")
)

// isTicket tells docs/spec/<slug>/tickets/<file>.md: a ticket is only ever named by its path.
func isTicket(rel string) bool {
	parts := strings.Split(filepath.ToSlash(rel), "/")
	return len(parts) >= 4 && parts[0] == "spec" && parts[2] == "tickets"
}

// CheckDocs reads the whole docs directory. A slug is a file name without `.md`; tickets and index.md files are
// exempt from being unique (they are named by path, and every layer has an index.md). A `[[…]]` inside inline code
// or a code block is not a link. Hidden directories are not part of docs/.
func CheckDocs(docs string) (DocsReport, error) {
	var rep DocsReport
	type file struct{ rel, abs string }
	var mds []file
	names := map[string]bool{} // every file's base name, lower-cased, for links that carry an extension
	err := filepath.WalkDir(docs, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			if p != docs && strings.HasPrefix(d.Name(), ".") {
				return filepath.SkipDir
			}
			return nil
		}
		rel, _ := filepath.Rel(docs, p)
		names[strings.ToLower(d.Name())] = true
		if strings.HasSuffix(d.Name(), ".md") {
			mds = append(mds, file{rel, p})
		}
		return nil
	})
	if err != nil {
		return rep, err
	}
	sort.Slice(mds, func(i, j int) bool { return mds[i].rel < mds[j].rel })

	bySlug := map[string][]string{}
	slugs := map[string]bool{}
	for _, f := range mds {
		base := filepath.Base(f.rel)
		slug := strings.ToLower(strings.TrimSuffix(base, ".md"))
		slugs[slug] = true
		if base == "index.md" || isTicket(f.rel) {
			continue
		}
		bySlug[slug] = append(bySlug[slug], filepath.ToSlash(f.rel))
	}
	var dupSlugs []string
	for s, files := range bySlug {
		if len(files) > 1 {
			dupSlugs = append(dupSlugs, s)
		}
	}
	sort.Strings(dupSlugs)
	for _, s := range dupSlugs {
		// show the slug as the first file spells it
		spelled := strings.TrimSuffix(filepath.Base(bySlug[s][0]), ".md")
		rep.Duplicates = append(rep.Duplicates, Duplicate{Slug: spelled, Files: bySlug[s]})
	}

	for _, f := range mds {
		b, err := os.ReadFile(f.abs)
		if err != nil {
			return rep, err
		}
		for _, l := range linksOf(string(b)) {
			if !resolves(l.target, slugs, names) {
				rep.DeadLinks = append(rep.DeadLinks, DeadLink{File: filepath.ToSlash(f.rel), Line: l.line, Slug: l.target})
			}
		}
	}
	return rep, nil
}

// resolves: a slug names a markdown file; a target that carries another extension names a file of that name.
func resolves(target string, slugs, names map[string]bool) bool {
	t := strings.ToLower(target)
	if strings.HasSuffix(t, ".md") {
		return slugs[strings.TrimSuffix(t, ".md")]
	}
	if ext := filepath.Ext(t); ext != "" && len(ext) <= 6 && !strings.ContainsAny(ext, " ") {
		if names[t] {
			return true
		}
	}
	return slugs[t]
}

type link struct {
	line   int
	target string // the slug (or file name) a link points at, without folder, `#heading` or `|alias`
}

// linksOf is every `[[…]]` of a markdown text that is a link: not inside inline code, not inside a fenced code
// block (the closing fence is not required to be indented like the opening one).
func linksOf(text string) []link {
	var out []link
	var fence string // the opening fence while inside a code block
	for i, line := range strings.Split(text, "\n") {
		if fence != "" {
			trimmed := strings.TrimSpace(line)
			if strings.HasPrefix(trimmed, fence) && strings.Trim(trimmed, fence[:1]) == "" {
				fence = ""
			}
			continue
		}
		if m := fenceStart.FindStringSubmatch(line); m != nil {
			fence = m[1]
			continue
		}
		for _, m := range wikiLink.FindAllStringSubmatch(stripInlineCode(line), -1) {
			if t := targetOf(m[1]); t != "" {
				out = append(out, link{line: i + 1, target: t})
			}
		}
	}
	return out
}

// stripInlineCode blanks the code spans of a line: a run of backticks closes at the next run of the same length.
func stripInlineCode(line string) string {
	if !strings.Contains(line, "`") {
		return line
	}
	var sb strings.Builder
	rs := []rune(line)
	for i := 0; i < len(rs); {
		if rs[i] != '`' {
			sb.WriteRune(rs[i])
			i++
			continue
		}
		j := i
		for j < len(rs) && rs[j] == '`' {
			j++
		}
		n := j - i
		closeAt := -1
		for k := j; k < len(rs); {
			if rs[k] != '`' {
				k++
				continue
			}
			e := k
			for e < len(rs) && rs[e] == '`' {
				e++
			}
			if e-k == n {
				closeAt = e
				break
			}
			k = e
		}
		if closeAt < 0 { // no closing run: the backticks are plain text
			for ; i < j; i++ {
				sb.WriteRune('`')
			}
			continue
		}
		sb.WriteString(strings.Repeat(" ", closeAt-i))
		i = closeAt
	}
	return sb.String()
}

// targetOf is the file a link text points at: `slug`, `slug#heading`, `slug|alias`, `folder/slug`, `slug\|alias`
// (in a table cell). A link to a heading of the same note (`#heading`) has no target.
func targetOf(inner string) string {
	t := inner
	if i := strings.IndexAny(t, "|#"); i >= 0 {
		t = t[:i]
	}
	t = strings.TrimSpace(strings.TrimRight(t, `\`))
	if i := strings.LastIndex(t, "/"); i >= 0 {
		t = t[i+1:]
	}
	return strings.TrimSpace(t)
}

// Describe is the refusal's text: which rule failed, where.
func (r DocsReport) Describe(prefix string) string {
	var sb strings.Builder
	if len(r.Duplicates) > 0 {
		fmt.Fprintf(&sb, "docs 里有 %d 个 slug 重名（slug 全局唯一；工单和 index.md 不在此列）：\n", len(r.Duplicates))
		for _, d := range r.Duplicates {
			fmt.Fprintf(&sb, "  %s：%s\n", d.Slug, strings.Join(prefixAll(prefix, d.Files), "、"))
		}
	}
	if len(r.DeadLinks) > 0 {
		fmt.Fprintf(&sb, "docs 里有 %d 处死链（[[…]] 指到的文件不存在）：\n", len(r.DeadLinks))
		for _, d := range r.DeadLinks {
			fmt.Fprintf(&sb, "  %s:%d  [[%s]]\n", prefix+d.File, d.Line, d.Slug)
		}
	}
	return strings.TrimRight(sb.String(), "\n")
}

func prefixAll(prefix string, files []string) []string {
	out := make([]string, len(files))
	for i, f := range files {
		out[i] = prefix + f
	}
	return out
}
