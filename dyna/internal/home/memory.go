package home

import (
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

// The measuring step of dreaming's memory pass. One device has one memory, <home>/memory/, whose root index
// MEMORY.md Claude Code loads on every turn: past 140 lines a write is refused, past 25,000 bytes the tail is cut.
// Entries that belong to one project live under <home>/projects/<name>/memory/, with an index of their own that
// is not loaded every turn and has no size limit. This measures and never judges content.
const (
	MemoryMaxLines = 140
	MemoryMaxBytes = 25000

	projectSection    = "项目"
	projectIndexShape = "projects/<名字>/memory/MEMORY.md"
)

var (
	projectIndexPath = regexp.MustCompile(`^projects/[^/]+/memory/MEMORY\.md$`)
	mdLink           = regexp.MustCompile(`\[[^\]]*\]\(\s*([^)\s]+)[^)]*\)`)
	schemeRe         = regexp.MustCompile(`(?i)^[a-z][a-z0-9+.-]*:`)
	h2Re             = regexp.MustCompile(`^##\s`)
	bulletRe         = regexp.MustCompile(`^\s*[-*]\s`)
)

// MeasureIndex is the lines and bytes of an index text; a final newline does not add a line.
func MeasureIndex(text string) (lines, bytes int) {
	if text == "" {
		return 0, 0
	}
	return len(strings.Split(strings.TrimSuffix(text, "\n"), "\n")), len(text)
}

// LocalLinks are the local link targets of a text, in order: `[x](target)` without a scheme, `#anchor` or query.
func LocalLinks(text string) []string {
	var out []string
	for _, m := range mdLink.FindAllStringSubmatch(text, -1) {
		t := m[1]
		if schemeRe.MatchString(t) || strings.HasPrefix(t, "#") {
			continue
		}
		t = strings.SplitN(strings.SplitN(t, "#", 2)[0], "?", 2)[0]
		if u, err := url.PathUnescape(t); err == nil {
			t = u
		}
		out = append(out, t)
	}
	return out
}

// sectionLines are the lines of one `## <title>` section (up to the next `## ` heading), or none.
func sectionLines(text, title string) []string {
	lines := strings.Split(text, "\n")
	start := -1
	for i, l := range lines {
		if strings.TrimRight(l, " \t\r") == "## "+title {
			start = i
			break
		}
	}
	if start < 0 {
		return nil
	}
	rest := lines[start+1:]
	for i, l := range rest {
		if h2Re.MatchString(l) {
			return rest[:i]
		}
	}
	return rest
}

func isFile(p string) bool {
	st, err := os.Stat(p)
	return err == nil && st.Mode().IsRegular()
}

func resolveFrom(dir, target string) string {
	if filepath.IsAbs(target) {
		return filepath.Clean(target)
	}
	return filepath.Join(dir, target)
}

// MemoryReport is what CheckMemory found.
type MemoryReport struct {
	Problems []string
	Lines    int
	Bytes    int
}

// OK is true when nothing is wrong.
func (r MemoryReport) OK() bool { return len(r.Problems) == 0 }

// CheckMemory checks a memory directory: the root index is within 140 lines and 25,000 bytes; every link of the
// root index and of each project index points at a file that exists; every entry file of the root directory is
// listed in the root index; every line of the root index's 项目 section points at an existing project memory index
// that sits where such an index belongs.
func CheckMemory(dir string) (MemoryReport, error) {
	root := filepath.Join(dir, "MEMORY.md")
	if !isFile(root) {
		return MemoryReport{Problems: []string{dir + " 里没有 MEMORY.md"}}, nil
	}
	b, err := os.ReadFile(root)
	if err != nil {
		return MemoryReport{}, err
	}
	text := string(b)
	lines, bytes := MeasureIndex(text)
	rep := MemoryReport{Lines: lines, Bytes: bytes}
	add := func(format string, a ...any) { rep.Problems = append(rep.Problems, fmt.Sprintf(format, a...)) }
	if lines > MemoryMaxLines {
		add("根索引 %s 有 %d 行，超 %d 行", root, lines, MemoryMaxLines)
	}
	if bytes > MemoryMaxBytes {
		add("根索引 %s 有 %d 字节，超 25,000 字节", root, bytes)
	}

	// the project-pointer lines are judged as pointers, so the plain link check skips them
	var projectLines []string
	projectSet := map[string]bool{}
	for _, l := range sectionLines(text, projectSection) {
		if bulletRe.MatchString(l) {
			projectLines = append(projectLines, l)
			projectSet[l] = true
		}
	}
	rootLinked := map[string]bool{}
	var projectIndexes []string

	for _, line := range strings.Split(text, "\n") {
		if projectSet[line] {
			continue
		}
		for _, t := range LocalLinks(line) {
			p := resolveFrom(dir, t)
			if isFile(p) {
				rootLinked[p] = true
			} else {
				add("根索引的链接 %s 指到的文件不存在", t)
			}
		}
	}

	for _, line := range projectLines {
		targets := LocalLinks(line)
		if len(targets) == 0 {
			l := strings.TrimSpace(line)
			if r := []rune(l); len(r) > 60 {
				l = string(r[:60])
			}
			add("「## %s」的这一行没有指到项目记忆索引的链接：%s", projectSection, l)
			continue
		}
		for _, t := range targets {
			p := resolveFrom(dir, t)
			if !isFile(p) {
				add("「## %s」的一行指到 %s，项目记忆索引不存在", projectSection, t)
				continue
			}
			rel, err := filepath.Rel(filepath.Dir(dir), p)
			if err != nil || !projectIndexPath.MatchString(filepath.ToSlash(rel)) {
				add("「## %s」的一行指到 %s，不在 %s 这个位置", projectSection, t, projectIndexShape)
			} else {
				projectIndexes = append(projectIndexes, p)
			}
		}
	}

	seen := map[string]bool{}
	for _, index := range projectIndexes {
		if seen[index] {
			continue
		}
		seen[index] = true
		ib, err := os.ReadFile(index)
		if err != nil {
			return rep, err
		}
		for _, t := range LocalLinks(string(ib)) {
			if !isFile(resolveFrom(filepath.Dir(index), t)) {
				add("项目索引 %s 的链接 %s 指到的文件不存在", index, t)
			}
		}
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		return rep, err
	}
	names := make([]string, 0, len(entries))
	for _, e := range entries {
		names = append(names, e.Name())
	}
	sort.Strings(names)
	for _, name := range names {
		p := filepath.Join(dir, name)
		if name == "MEMORY.md" || !strings.HasSuffix(name, ".md") || !isFile(p) {
			continue
		}
		if !rootLinked[p] {
			add("根目录的条目文件 %s 没进根索引", name)
		}
	}
	return rep, nil
}
