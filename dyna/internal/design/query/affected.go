package query

import (
	"bytes"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/design/archive"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/miniyaml"
)

var sourceExts = []string{".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts", ".json", ".css", ".scss", ".sass", ".less", ".vue", ".svelte"}
var jsToTS = []struct {
	ext string
	to  []string
}{{".js", []string{".ts", ".tsx"}}, {".jsx", []string{".tsx"}}, {".mjs", []string{".mts"}}, {".cjs", []string{".cts"}}}

// A quote opens the specifier and the same quote closes it; the specifier holds neither quote nor a newline.
const specifier = `(?:'([^'"\n]+)'|"([^'"\n]+)")`

var importPatterns = []*regexp.Regexp{
	regexp.MustCompile(`\bfrom\s*` + specifier),         // import … from 'x' / export … from 'x'
	regexp.MustCompile(`\bimport\s*` + specifier),       // import 'x'
	regexp.MustCompile(`\bimport\s*\(\s*` + specifier),  // import('x')
	regexp.MustCompile(`\brequire\s*\(\s*` + specifier), // require('x')
}

// importCandidates are the repository paths a relative import in `source` (the text of `codeFile`) can mean: the
// path as written, with each source extension, as a directory's index, and — for a `.js` import — the `.ts` file
// it stands for. Packages and aliased paths (`react`, `@/x`) are not followed. In the order they were found.
func importCandidates(codeFile, source string) []string {
	var out []string
	seen := map[string]bool{}
	add := func(p string) {
		if !seen[p] {
			seen[p] = true
			out = append(out, p)
		}
	}
	for _, re := range importPatterns {
		for _, m := range re.FindAllStringSubmatch(source, -1) {
			spec := m[1]
			if spec == "" {
				spec = m[2]
			}
			if !strings.HasPrefix(spec, "./") && !strings.HasPrefix(spec, "../") {
				continue
			}
			if i := strings.IndexAny(spec, "?#"); i >= 0 {
				spec = spec[:i]
			}
			base := strings.ReplaceAll(path.Join(path.Dir(codeFile), spec), `\`, "/")
			add(base)
			for _, e := range sourceExts {
				add(base + e)
				add(base + "/index" + e)
			}
			for _, j := range jsToTS {
				if strings.HasSuffix(base, j.ext) {
					for _, t := range j.to {
						add(strings.TrimSuffix(base, j.ext) + t)
					}
					break
				}
			}
		}
	}
	return out
}

// readCode is the text of a registered code file, or "" when it is not a readable file (deleted, a directory).
func readCode(root, file string) string {
	b, err := os.ReadFile(filepath.Join(root, filepath.FromSlash(file)))
	if err != nil {
		return ""
	}
	return string(b)
}

// AffectedByFiles is which states a set of changed files reaches: the file is a page's registered code (every
// state of the page), a component's registered code (every state that uses it), or is imported directly by one of
// those code files (counts as that page or component having changed; one hop, relative imports only). `files`
// are paths relative to the repository root; the code is read from codeRoot (the archive's root when empty).
//
// `matched` is one entry per (object, file): `rule: 'code'`, or `rule: 'import'` with `via`, the registered code
// file that imports it. `states` carry `via`: the ids of the pages / components that put them in. `totalStates` is
// how many states the archive has, so a caller can say "n of m".
func AffectedByFiles(a *archive.Archive, files []string, codeRoot string) *miniyaml.Map {
	m := affectedByFiles(a, files, codeRoot)
	return obj("matched", m.matched, "states", m.states, "totalStates", float64(m.total))
}

type affectedResult struct {
	matched []any
	states  []any
	total   int
}

func affectedByFiles(a *archive.Archive, files []string, codeRoot string) affectedResult {
	if codeRoot == "" {
		codeRoot = a.Root
	}
	changed := map[string]bool{}
	for _, f := range files {
		changed[normalizeCode(f)] = true
	}
	matched := []any{}
	type matchKey struct{ object, file string }
	matchedKeys := map[matchKey]bool{}
	var stateOrder []string
	stateVia := map[string][]string{}
	put := func(stateID, objectID string) {
		if _, ok := stateVia[stateID]; !ok {
			stateOrder = append(stateOrder, stateID)
		}
		if !containsStr(stateVia[stateID], objectID) {
			stateVia[stateID] = append(stateVia[stateID], objectID)
		}
		if stateVia[stateID] == nil {
			stateVia[stateID] = []string{objectID}
		}
	}

	// claim records every changed file that is o's code or one of its code files' direct imports; true if any.
	claim := func(o *archive.Object) bool {
		var code []string
		for _, c := range asList(fmGet(o.FM, "code")) {
			code = append(code, normalizeCode(c))
		}
		var own []string
		for _, c := range code {
			if changed[c] {
				own = append(own, c)
			}
		}
		for _, f := range own {
			matched = append(matched, obj("object", o.ID, "kind", o.Kind, "file", f, "rule", "code"))
			matchedKeys[matchKey{o.ID, f}] = true
		}
		imported := false
		for _, codeFile := range code {
			for _, cand := range importCandidates(codeFile, readCode(codeRoot, codeFile)) {
				if !changed[cand] || containsStr(own, cand) {
					continue
				}
				if matchedKeys[matchKey{o.ID, cand}] {
					continue
				}
				matched = append(matched, obj("object", o.ID, "kind", o.Kind, "file", cand, "rule", "import", "via", codeFile))
				matchedKeys[matchKey{o.ID, cand}] = true
				imported = true
			}
		}
		return len(own) > 0 || imported
	}

	for _, page := range sortObjects(archive.ObjectsOfKind(a, "page")) {
		if claim(page) {
			for _, s := range archive.StatesOfPage(a, page.ID) {
				put(s.ID, page.ID)
			}
		}
	}

	regionPages := func(componentID string) []*archive.Object {
		var out []*archive.Object
		for _, p := range archive.ObjectsOfKind(a, "page") {
			for _, r := range asList(fmGet(p.FM, "regions")) {
				if t, ok := archive.WikilinkTarget(member(r, "component")); ok && t == componentID {
					out = append(out, p)
					break
				}
			}
		}
		return sortObjects(out)
	}
	for _, comp := range sortObjects(archive.ObjectsOfKind(a, "component")) {
		if !claim(comp) {
			continue
		}
		// the states that list it or have an edge through it (the reverse lookup), and every state of a
		// page that lays it out as a region
		if refs, err := Refs(a, comp.ID); err == nil {
			for _, s := range asList(refs.Get("states")) {
				put(s.(*miniyaml.Map).Get("id").(string), comp.ID)
			}
		}
		for _, p := range regionPages(comp.ID) {
			for _, s := range archive.StatesOfPage(a, p.ID) {
				put(s.ID, comp.ID)
			}
		}
	}

	sort.Strings(stateOrder)
	states := []any{}
	for _, id := range stateOrder {
		states = append(states, obj("id", id, "page", nilIf(archive.PageOfState(a.Objects[id])), "via", strList(stateVia[id])))
	}
	return affectedResult{matched: matched, states: states, total: len(archive.ObjectsOfKind(a, "state"))}
}

func gitRun(codeRoot string, args ...string) (string, string, error) {
	cmd := exec.Command("git", append([]string{"-C", codeRoot}, args...)...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout, cmd.Stderr = &stdout, &stderr
	err := cmd.Run()
	return stdout.String(), stderr.String(), err
}

// Affected is what changed since a commit, as the states to look at again: `git diff --name-only <commit> HEAD`
// (renames as a delete plus an add, so the old path counts too; paths relative to the code root), fed to
// AffectedByFiles. `since` is anything git resolves to a commit — a sha, a branch, `HEAD~3`; the answer carries
// the full sha it resolved to (`commit`) and how many files changed. The code lives in the code repository
// (codeRoot), which is not where the archive is once the archive is in home; empty means the archive's root.
func Affected(a *archive.Archive, since, codeRoot string) (*miniyaml.Map, error) {
	rev := strings.TrimSpace(since)
	if rev == "" {
		return nil, qerrCode("提交是空的", "usage")
	}
	if strings.HasPrefix(rev, "-") {
		return nil, qerrCode("「"+rev+"」不是提交", "usage")
	}
	if codeRoot == "" {
		codeRoot = a.Root
	}
	if _, err := os.Stat(codeRoot); err != nil {
		return nil, qerrCode("代码仓库 "+codeRoot+" 不存在：按提交挑状态要读它的 git 历史", "no-repo")
	}
	out, _, err := gitRun(codeRoot, "rev-parse", "--verify", "--quiet", rev+"^{commit}")
	if err != nil {
		if _, _, err2 := gitRun(codeRoot, "rev-parse", "--is-inside-work-tree"); err2 != nil {
			return nil, qerrCode(codeRoot+" 不在 git 仓库里：按提交挑状态要读 git 历史", "no-repo")
		}
		return nil, qerr("找不到提交「" + rev + "」")
	}
	commit := strings.TrimSpace(out)
	names, stderr, err := gitRun(codeRoot, "diff", "--name-only", "--no-renames", "--relative", "-z", commit, "HEAD", "--")
	if err != nil {
		msg := strings.TrimSpace(stderr)
		if msg == "" {
			msg = err.Error()
		}
		return nil, qerr("读不出 " + rev + " 到 HEAD 的改动：" + msg)
	}
	var files []string
	for _, f := range strings.Split(names, "\x00") {
		if f != "" {
			files = append(files, f)
		}
	}
	r := affectedByFiles(a, files, codeRoot)
	return obj("since", rev, "commit", commit, "changedFileCount", float64(len(files)), "matched", r.matched, "states", r.states, "totalStates", float64(r.total)), nil
}
