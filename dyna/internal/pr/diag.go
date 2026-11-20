package pr

// Keep only the tool diagnostics that sit on lines this PR changed.
//
// pr-review's Standards axis folds the repository's own checks (lint, typecheck, declared check commands) into
// its answer, but only for code this PR wrote: a whole-repo lint dumps the existing debt into the review, and
// that debt is not this PR's to fix. So the reviewer runs the checks, pipes their output through here, and only
// diagnostics on added or changed lines of `git diff <base>...HEAD` become candidates. Rules:
// skills/engineering/pr-review/references/review-standards.md, section 机械检查, of the plugin.
//
// Tools must print one diagnostic per line with its location: `path:line[:col]` (ruff, mypy, eslint -f unix,
// most compilers) or `path(line,col)` (tsc). Paths may be absolute or relative to a sub-project; they are matched
// against the diff by path suffix.

import (
	"regexp"
	"strconv"
	"strings"
)

// ChangedLines is, per file of a unified diff (any -U), the new-side line numbers that were added or changed,
// files in the order the diff names them.
type ChangedLines struct {
	Files []string
	Lines map[string]map[int]bool
}

var hunkRe = regexp.MustCompile(`\+(\d+)`)

// ParseChangedLines reads a unified diff. Deleted files are ignored.
func ParseChangedLines(diff string) ChangedLines {
	out := ChangedLines{Lines: map[string]map[int]bool{}}
	path, inFile := "", false
	line := 0
	for _, raw := range strings.Split(diff, "\n") {
		switch {
		case strings.HasPrefix(raw, "+++ "):
			if raw == "+++ /dev/null" {
				path, inFile = "", false
				break
			}
			path, inFile = strings.TrimPrefix(raw[4:], "b/"), true
			if _, ok := out.Lines[path]; !ok {
				out.Files = append(out.Files, path)
				out.Lines[path] = map[int]bool{}
			}
		case strings.HasPrefix(raw, "@@"):
			line = 0
			if m := hunkRe.FindStringSubmatch(raw); m != nil {
				line, _ = strconv.Atoi(m[1])
			}
		case inFile && strings.HasPrefix(raw, "+"):
			out.Lines[path][line] = true
			line++
		case inFile && strings.HasPrefix(raw, " "):
			line++
		}
	}
	return out
}

var locateRe = regexp.MustCompile(`^[` + spaceSet + `]*([^` + spaceSet + `:()]+?\.[A-Za-z0-9]+)(?::(\d+)(?::\d+)?|\((\d+),\d+\))`)

// Location is where a diagnostic line points.
type Location struct {
	Path string
	Line int
}

// Locate reads the location of a diagnostic line; ok is false when it has none.
func Locate(text string) (Location, bool) {
	m := locateRe.FindStringSubmatch(text)
	if m == nil {
		return Location{}, false
	}
	n := m[2]
	if n == "" {
		n = m[3]
	}
	line, _ := strconv.Atoi(n)
	return Location{Path: strings.TrimPrefix(m[1], "./"), Line: line}, true
}

func sameFile(a, b string) bool {
	return a == b || strings.HasSuffix(a, "/"+b) || strings.HasSuffix(b, "/"+a)
}

// Filtered is the diagnostics sorted by whether they are on a changed line.
type Filtered struct {
	OnChanged []string `json:"onChanged"`
	Elsewhere int      `json:"elsewhere"`
	Unlocated int      `json:"unlocated"`
}

// FilterDiagnostics keeps the diagnostics on changed lines; the rest is counted, not dropped silently.
func FilterDiagnostics(output string, changed ChangedLines) Filtered {
	res := Filtered{OnChanged: []string{}}
	for _, text := range strings.Split(output, "\n") {
		if trim(text) == "" {
			continue
		}
		loc, ok := Locate(text)
		if !ok {
			res.Unlocated++
			continue
		}
		file := ""
		for _, p := range changed.Files {
			if sameFile(p, loc.Path) {
				file = p
				break
			}
		}
		if file != "" && changed.Lines[file][loc.Line] {
			res.OnChanged = append(res.OnChanged, trim(text))
		} else {
			res.Elsewhere++
		}
	}
	return res
}
