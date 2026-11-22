package seo

import (
	"regexp"
	"strings"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/jsstr"
)

// globRegex is one glob as a regular expression over a whole path: `*` stays inside one directory, `**` crosses
// directories, `?` is one character.
func globRegex(glob string) *regexp.Regexp {
	var out strings.Builder
	rs := []rune(glob)
	for i := 0; i < len(rs); i++ {
		c := rs[i]
		switch {
		case c == '*' && i+1 < len(rs) && rs[i+1] == '*':
			i++
			if i+1 < len(rs) && rs[i+1] == '/' {
				i++
				out.WriteString("(?:.*/)?") // `**/` also matches nothing: **/llms.txt is llms.txt too
			} else {
				out.WriteString(".*")
			}
		case c == '*':
			out.WriteString("[^/]*")
		case c == '?':
			out.WriteString("[^/]")
		default:
			out.WriteString(regexp.QuoteMeta(string(c)))
		}
	}
	return regexp.MustCompile("^" + out.String() + "$")
}

var leadingDotSlash = regexp.MustCompile(`^(?:\./)+`)

func cleanPath(p string) string { return leadingDotSlash.ReplaceAllString(jsstr.Trim(p), "") }

func climbs(p string) bool {
	if strings.HasPrefix(p, "/") {
		return true
	}
	for _, part := range strings.Split(p, "/") {
		if part == ".." {
			return true
		}
	}
	return false
}

// Matches reports whether file matches one of globs, itself or through a directory above it.
func Matches(file string, globs []string) bool {
	path := cleanPath(file)
	if climbs(path) {
		return false
	}
	parts := strings.Split(path, "/")
	candidates := make([]string, len(parts))
	for i := range parts {
		candidates[i] = strings.Join(parts[:i+1], "/")
	}
	for _, g := range globs {
		g = trailingSlashes.ReplaceAllString(cleanPath(g), "")
		if g == "" {
			continue
		}
		re := globRegex(g)
		for _, c := range candidates {
			if re.MatchString(c) {
				return true
			}
		}
	}
	return false
}

// ScopeVerdict is whether a change stays inside the content scope.
type ScopeVerdict struct {
	ContentOnly bool     `json:"contentOnly"`
	Files       int      `json:"files"`
	Outside     []string `json:"outside"`
	Reason      string   `json:"reason,omitempty"`
}

// JudgeScope says which of the changed files are outside the content scope. A change list with no files is not
// content-only: there is nothing to judge.
func JudgeScope(files, contentPaths []string) ScopeVerdict {
	var list []string
	seen := map[string]bool{}
	for _, f := range files {
		c := cleanPath(f)
		if c != "" && !seen[c] {
			seen[c] = true
			list = append(list, c)
		}
	}
	if len(list) == 0 {
		return ScopeVerdict{ContentOnly: false, Files: 0, Outside: []string{}, Reason: "没有改动文件"}
	}
	outside := []string{}
	for _, f := range list {
		if !Matches(f, contentPaths) {
			outside = append(outside, f)
		}
	}
	return ScopeVerdict{ContentOnly: len(outside) == 0, Files: len(list), Outside: outside}
}

// ImageDirVerdict says whether the directory images are written to is inside the content scope.
type ImageDirVerdict struct {
	InScope      bool     `json:"inScope"`
	Dir          string   `json:"dir"`
	Reason       string   `json:"reason,omitempty"`
	ContentPaths []string `json:"contentPaths"`
}

// ImageDirInScope says whether dir — the image directory the SEO module of setup is about to write into SEO.md's 配图 — is inside the
// content scope (内容路径 — not docs/: in 0.2.0 docs/ lives in the project directory, not in the code repository, as
// JudgeScope has it too): the directory itself, or a file placed straight into it (so `public/images/**`
// covers `public/images`).
func ImageDirInScope(dir string, contentPaths []string) ImageDirVerdict {
	paths := contentPaths
	if paths == nil {
		paths = []string{}
	}
	path := trailingSlashes.ReplaceAllString(cleanPath(dir), "")
	if path == "" {
		return ImageDirVerdict{Dir: dir, Reason: "没有图片目录", ContentPaths: paths}
	}
	if Matches(path, contentPaths) || Matches(path+"/_", contentPaths) {
		return ImageDirVerdict{InScope: true, Dir: path, ContentPaths: paths}
	}
	return ImageDirVerdict{Dir: path, Reason: "图片目录不在 SEO.md「构建与检查」的内容路径以内（内容路径之外的改动，SEO PR 不能自动合并）", ContentPaths: paths}
}
