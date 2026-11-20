// Package skilldoc checks a skill whose SKILL.md body is kept short and whose sections other documents point at
// by name (`idea-loop:<skill>` 的「X」).
//
//   - BodyChars: the SKILL.md body (frontmatter stripped) in UTF-8 characters. The repo rule is
//     "SKILL.md 主体 < 5000 字" (AGENTS.md); long material lives in the skill's own references/.
//   - DanglingSectionPointers: every title quoted right after a `idea-loop:<skill>` mention, anywhere in the
//     plugin (every .md and every script under it, not only skills and agents), must be a heading of the
//     skill's SKILL.md or of one of its references/ files.
package skilldoc

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"unicode/utf8"
)

// MaxBodyChars is the limit: a body of this many characters or more is too long.
const MaxBodyChars = 5000

// namePrefix is the plugin name a pointer starts with.
const namePrefix = "idea-loop:"

var frontmatter = regexp.MustCompile(`(?s)^---\n.*?\n---\n`)

// Body is everything after the closing --- of the frontmatter.
func Body(text string) string {
	if loc := frontmatter.FindStringIndex(text); loc != nil {
		return text[loc[1]:]
	}
	return text
}

// BodyChars is the number of UTF-8 characters in the body of <skillDir>/SKILL.md.
func BodyChars(skillDir string) (int, error) {
	b, err := os.ReadFile(filepath.Join(skillDir, "SKILL.md"))
	if err != nil {
		return 0, err
	}
	return utf8.RuneCountInString(Body(string(b))), nil
}

var heading = regexp.MustCompile(`^#{1,6}\s+(.+?)\s*$`)

// Headings are the titles of the Markdown headings in text, skipping what sits inside code fences.
func Headings(text string) []string {
	var out []string
	fenced := false
	for _, line := range strings.Split(text, "\n") {
		if strings.HasPrefix(line, "```") {
			fenced = !fenced
		}
		if fenced {
			continue
		}
		if m := heading.FindStringSubmatch(line); m != nil {
			out = append(out, m[1])
		}
	}
	return out
}

func dirEntries(dir string) []string {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil
	}
	names := make([]string, 0, len(entries))
	for _, e := range entries {
		names = append(names, e.Name())
	}
	sort.Strings(names)
	return names
}

func isDir(p string) bool {
	st, err := os.Stat(p)
	return err == nil && st.IsDir()
}

// MDFiles is every .md file under dir.
func MDFiles(dir string) []string {
	var out []string
	for _, name := range dirEntries(dir) {
		p := filepath.Join(dir, name)
		if isDir(p) {
			out = append(out, MDFiles(p)...)
		} else if strings.HasSuffix(name, ".md") {
			out = append(out, p)
		}
	}
	return out
}

var scriptExt = regexp.MustCompile(`\.(?:md|mjs|cjs|js|sh)$`)

// SourceFiles is every .md and script file under dir (node_modules and dot-directories skipped).
func SourceFiles(dir string) []string {
	var out []string
	for _, name := range dirEntries(dir) {
		if name == "node_modules" || strings.HasPrefix(name, ".") {
			continue
		}
		p := filepath.Join(dir, name)
		if isDir(p) {
			out = append(out, SourceFiles(p)...)
		} else if scriptExt.MatchString(name) {
			out = append(out, p)
		}
	}
	return out
}

// space is what JavaScript's \s matches; the pointer pattern was written for it.
const space = `[\s\x0b\x{00a0}\x{1680}\x{2000}-\x{200a}\x{2028}\x{2029}\x{202f}\x{205f}\x{3000}\x{feff}]*`

// Pointers is what a pointer scan found.
type Pointers struct {
	// Seen is how many quoted section titles the scan checked.
	Seen int
	// Bad lists the ones that are not a heading, each as "<file relative to the plugin>:<line>  「<title>」".
	Bad []string
}

// DanglingSectionPointers scans the plugin for sections quoted after `idea-loop:<skillName>` and reports the ones
// that are not a heading of the skill's SKILL.md or of one of its references/ files.
func DanglingSectionPointers(pluginRoot, skillDir, skillName string) (Pointers, error) {
	known := map[string]bool{}
	var titles []string
	for _, f := range append([]string{filepath.Join(skillDir, "SKILL.md")}, MDFiles(filepath.Join(skillDir, "references"))...) {
		b, err := os.ReadFile(f)
		if err != nil {
			return Pointers{}, err
		}
		for _, h := range Headings(string(b)) {
			known[h] = true
			titles = append(titles, h)
		}
	}
	exists := func(title string) bool {
		if known[title] {
			return true
		}
		for _, h := range titles {
			if strings.HasPrefix(h, title+"：") || strings.HasPrefix(h, title+"（") {
				return true
			}
		}
		return false
	}

	// `idea-loop:<skill>` 的「A」「B」 / ，看它的「A」到「B」 / （看它的「A」 / 的 `references/x.md`「A」 / 的「A」里的「B」
	name := regexp.QuoteMeta(namePrefix + skillName)
	pointer := regexp.MustCompile("`" + name + "`(?:，看它的|（看它的|" + space + "的" + space + "(?:`references/[\\w.-]+\\.md`)?)((?:「[^」]+」(?:里的|的|、|到|和)?)+)")
	quoted := regexp.MustCompile(`「([^」]+)」`)

	var res Pointers
	for _, file := range SourceFiles(pluginRoot) {
		b, err := os.ReadFile(file)
		if err != nil {
			return Pointers{}, err
		}
		rel, err := filepath.Rel(pluginRoot, file)
		if err != nil {
			rel = file
		}
		for i, line := range strings.Split(string(b), "\n") {
			for _, m := range pointer.FindAllStringSubmatch(line, -1) {
				for _, q := range quoted.FindAllStringSubmatch(m[1], -1) {
					res.Seen++
					if !exists(q[1]) {
						res.Bad = append(res.Bad, fmt.Sprintf("%s:%d  「%s」", rel, i+1, q[1]))
					}
				}
			}
		}
	}
	return res, nil
}
