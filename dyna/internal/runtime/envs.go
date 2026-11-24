package runtime

// Which environments dyna knows, and which one this session is in. Nothing is listed in code: an environment is a
// description file with a marker line, kept in one of three places (see Places). The plugin carries none.

import (
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"unicode/utf8"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/gitrun"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/home"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/nexterr"
)

const (
	// SelectedFile is the plain-text file in a runtime/ directory holding the environment the human picked.
	SelectedFile = "selected"

	// SetupHint is what a session is told when dyna cannot tell which environment it is in.
	SetupHint = "跑 `/idea-loop:setup`"

	markerPrefix = "标记："
)

var (
	markerVar  = regexp.MustCompile("`([A-Za-z_][A-Za-z0-9_]*)`")
	markerNone = "没有"
)

// MarkerOf reads the marker line of a description: the first line above the first `## ` section that starts with
// `标记：`. The variable inside backticks is the marker; 「没有」 means the environment has none (and ok is true
// with an empty marker). A text without such a line, or with one that is neither, is not a description.
func MarkerOf(text string) (marker string, ok bool) {
	text = frontmatter.ReplaceAllString(text, "")
	for _, line := range strings.Split(text, "\n") {
		if strings.HasPrefix(line, "## ") {
			return "", false
		}
		rest, found := strings.CutPrefix(strings.TrimSpace(line), markerPrefix)
		if !found {
			continue
		}
		rest = strings.TrimSpace(rest)
		if strings.HasPrefix(rest, markerNone) {
			return "", true
		}
		if m := markerVar.FindStringSubmatch(rest); m != nil {
			return m[1], true
		}
		return "", false
	}
	return "", false
}

// Place is one of the three directories descriptions are looked for in.
type Place struct {
	// Label says which one it is, for the sentences that name a file's origin.
	Label string
	// Dir is the runtime/ directory itself.
	Dir string
}

// Places are where descriptions (and the `selected` file) are looked for, in this order; the first place that has
// one wins and its file is used whole, nothing is merged across places:
//  1. the project: <main checkout>/.idea-loop/runtime, where the main checkout is the parent of the repository's
//     common git directory (a worktree has the same main checkout as the repository it was made from); skipped
//     when cwd is not in a git repository;
//  2. home: <home>/runtime;
//  3. the user's root directory: ~/.idea-loop/runtime.
func Places(env home.Env, cwd string) []Place {
	var out []Place
	if main := mainCheckout(cwd); main != "" {
		out = append(out, Place{"项目", filepath.Join(main, ".idea-loop", DataDir)})
	}
	if dir := homeRuntimeDir(env); dir != "" {
		out = append(out, Place{"home", dir})
	}
	if u := home.UserHome(env); u != "" && filepath.IsAbs(u) {
		out = append(out, Place{"用户根目录", filepath.Join(u, ".idea-loop", DataDir)})
	}
	return out
}

// mainCheckout is the main checkout of the repository cwd is in, or empty when it is not in one. The common git
// directory of a worktree is the main checkout's .git, so the main checkout is its parent.
func mainCheckout(cwd string) string {
	out, err := gitrun.Run(cwd, "rev-parse", "--path-format=absolute", "--git-common-dir")
	if err != nil {
		return ""
	}
	common := strings.TrimSpace(out)
	if filepath.Base(common) != ".git" {
		return ""
	}
	return filepath.Dir(common)
}

// homeRuntimeDir is <home>/runtime, or empty when there is no usable home.
func homeRuntimeDir(env home.Env) string {
	h := home.Dir(env)
	if h == "" || !filepath.IsAbs(h) {
		return ""
	}
	if st, err := os.Stat(h); err != nil || !st.IsDir() {
		return ""
	}
	return filepath.Join(h, DataDir)
}

// Doc is one environment description dyna found.
type Doc struct {
	Name string
	// Marker is the environment variable that, when it has a value, says a session is in this environment; empty
	// when the description says there is none.
	Marker string
	// Path is the file that is the whole description.
	Path string
	// Place is where the file lives.
	Place Place
}

func mdNames(dir string) []string {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil
	}
	var out []string
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".md") {
			out = append(out, strings.TrimSuffix(e.Name(), ".md"))
		}
	}
	return out
}

// Found is every description with a marker line in the three places, the first place's files first. A name found
// in more than one place appears once per place; Known is the ones that are used.
func Found(env home.Env, cwd string) []Doc {
	var docs []Doc
	for _, pl := range Places(env, cwd) {
		names := mdNames(pl.Dir)
		sort.Strings(names)
		for _, n := range names {
			path := filepath.Join(pl.Dir, n+".md")
			b, err := os.ReadFile(path)
			if err != nil || !utf8.Valid(b) {
				continue
			}
			if m, ok := MarkerOf(string(b)); ok {
				docs = append(docs, Doc{Name: n, Marker: m, Path: path, Place: pl})
			}
		}
	}
	return docs
}

// Known are the environments: every description with a marker line, and for a name that more than one place has,
// the place that comes first; sorted by name.
func Known(env home.Env, cwd string) []Doc {
	seen := map[string]bool{}
	var docs []Doc
	for _, d := range Found(env, cwd) {
		if !seen[d.Name] {
			seen[d.Name] = true
			docs = append(docs, d)
		}
	}
	sort.Slice(docs, func(i, j int) bool { return docs[i].Name < docs[j].Name })
	return docs
}

func docNames(docs []Doc) string {
	names := make([]string, len(docs))
	for i, d := range docs {
		names[i] = d.Name
	}
	return strings.Join(names, ", ")
}

// Detection is the environment this session is in, and what is worth telling the session about how it was found.
type Detection struct {
	// Name is empty when dyna cannot tell: no description, no marker with a value, nothing picked.
	Name string
	// Path is the file that is the whole description.
	Path string
	// Notes are lines `inject reference` puts before everything else.
	Notes []string
}

// None is whether dyna could not tell which environment this is.
func (d Detection) None() bool { return d.Name == "" }

// Unknown is the error a command that needs a name stops with when there is none; Notes (a pick that matched no
// description) are said first.
func (d Detection) Unknown() error {
	msg := "认不出运行环境：没有运行环境说明对得上这个会话，也没人选过；" + SetupHint
	if len(d.Notes) > 0 {
		msg = strings.Join(d.Notes, "\n") + "\n" + msg
	}
	return nexterr.Plain("%s", msg)
}

// Detect is the environment this session is in, in this order: a forced name (IDEA_LOOP_RUNTIME) that is a known
// one; the first known environment, by name, whose marker variable has a value; the one the human picked in the
// first `selected` file of the three places; otherwise none. A forced name that is not known is an error, never
// a guess; a pick that matches no description is noted and counts as no pick.
func Detect(env home.Env, cwd string) (Detection, error) {
	docs := Known(env, cwd)
	find := func(name string) (Doc, bool) {
		for _, d := range docs {
			if d.Name == name {
				return d, true
			}
		}
		return Doc{}, false
	}
	pick := func(d Doc, notes ...string) Detection { return Detection{Name: d.Name, Path: d.Path, Notes: notes} }

	if forced := env(EnvRuntime); forced != "" {
		if d, ok := find(forced); ok {
			return pick(d), nil
		}
		if len(docs) == 0 {
			return Detection{}, nexterr.Plain("%s=%s is not a known runtime: there is no runtime description; %s", EnvRuntime, forced, SetupHint)
		}
		return Detection{}, nexterr.Plain("%s=%s is not a known runtime; known: %s", EnvRuntime, forced, docNames(docs))
	}

	var marked []Doc
	for _, d := range docs {
		if d.Marker != "" && env(d.Marker) != "" {
			marked = append(marked, d)
		}
	}
	if len(marked) > 0 {
		if len(marked) == 1 {
			return pick(marked[0]), nil
		}
		var parts []string
		for _, d := range marked {
			parts = append(parts, d.Name+"（"+d.Marker+"）")
		}
		return pick(marked[0], "运行环境说明的标记同时有值："+strings.Join(parts, "、")+"；按名字排序取第一份，用了 "+marked[0].Name+"。"), nil
	}

	for _, pl := range Places(env, cwd) {
		b, err := os.ReadFile(filepath.Join(pl.Dir, SelectedFile))
		if err != nil {
			continue
		}
		sel := strings.TrimSpace(string(b))
		if sel == "" {
			continue
		}
		if d, ok := find(sel); ok {
			return pick(d), nil
		}
		known := "没有任何运行环境说明"
		if len(docs) > 0 {
			known = "认识的：" + docNames(docs)
		}
		return Detection{Notes: []string{pl.Label + "的 runtime/" + SelectedFile + " 写的「" + sel + "」找不到运行环境说明，当作没选；" + known + "。"}}, nil
	}
	return Detection{}, nil
}
