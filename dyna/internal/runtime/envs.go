package runtime

// Which environments dyna knows, and which one this session is in. Nothing is listed in code: an environment is a
// description file with a marker line, in the plugin's runtime/ directory or in <home>/runtime/.

import (
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"unicode/utf8"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/home"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/nexterr"
)

const (
	// DefaultName is where a session lands when nothing marks it and the human picked nothing: the command line and
	// IDE plugins have no reliable marker (ADR-0026).
	DefaultName = "claude-desktop"
	// SelectedFile is the plain-text file in <home>/runtime/ holding the environment the human picked.
	SelectedFile = "selected"

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

// Doc is one environment dyna knows.
type Doc struct {
	Name string
	// Marker is the environment variable that, when it has a value, says a session is in this environment; empty
	// when the description says there is none.
	Marker string
	// Path is the home file that is the whole description; empty when the description is the plugin's (the
	// device's own override of it, if any, is read separately).
	Path string
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

func mdNames(dir string) ([]string, bool) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, false
	}
	var out []string
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".md") {
			out = append(out, strings.TrimSuffix(e.Name(), ".md"))
		}
	}
	return out, true
}

// Known are the environments: the plugin's runtime/<name>.md with a marker line, and the home runtime/<name>.md
// with a marker line that the plugin has no file of the same name for; sorted by name.
func (p Plugin) Known(env home.Env) ([]Doc, error) {
	names, ok := mdNames(filepath.Join(p.Root, DataDir))
	if !ok {
		return nil, nexterr.Plain("读不到插件里的数据：%s", filepath.Join(p.Root, DataDir))
	}
	inPlugin := map[string]bool{strings.TrimSuffix(CapabilitiesFile, ".md"): true}
	var docs []Doc
	for _, n := range names {
		inPlugin[n] = true
		if n == strings.TrimSuffix(CapabilitiesFile, ".md") {
			continue
		}
		b, err := os.ReadFile(filepath.Join(p.Root, DataDir, n+".md"))
		if err != nil {
			continue
		}
		if m, ok := MarkerOf(string(b)); ok {
			docs = append(docs, Doc{Name: n, Marker: m})
		}
	}
	if dir := homeRuntimeDir(env); dir != "" {
		hn, _ := mdNames(dir)
		for _, n := range hn {
			if inPlugin[n] {
				continue
			}
			path := filepath.Join(dir, n+".md")
			b, err := os.ReadFile(path)
			if err != nil || !utf8.Valid(b) {
				continue
			}
			if m, ok := MarkerOf(string(b)); ok {
				docs = append(docs, Doc{Name: n, Marker: m, Path: path})
			}
		}
	}
	sort.Slice(docs, func(i, j int) bool { return docs[i].Name < docs[j].Name })
	return docs, nil
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
	Name string
	// Path is the home file that is the whole description, when the environment is one only home has.
	Path string
	// Notes are lines `inject reference` puts before everything else.
	Notes []string
}

// Detect is the environment this session is in, in this order: a forced name (IDEA_LOOP_RUNTIME) that is a known
// one; the first known environment, by name, whose marker variable has a value; the one the human picked in
// <home>/runtime/selected; the default. A forced name that is not known is an error, never a guess.
func Detect(env home.Env) (Detection, error) {
	p, err := PluginFrom(env)
	if err != nil {
		return Detection{}, err
	}
	docs, err := p.Known(env)
	if err != nil {
		return Detection{}, err
	}
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

	if dir := homeRuntimeDir(env); dir != "" {
		if b, err := os.ReadFile(filepath.Join(dir, SelectedFile)); err == nil {
			if sel := strings.TrimSpace(string(b)); sel != "" {
				if d, ok := find(sel); ok {
					return pick(d), nil
				}
				d, _ := find(DefaultName)
				d.Name = DefaultName
				return pick(d, "home 里 runtime/"+SelectedFile+" 写的「"+sel+"」不是认识的运行环境，当作没选，用了 "+DefaultName+"；认识的："+docNames(docs)+"。"), nil
			}
		}
	}
	d, _ := find(DefaultName)
	d.Name = DefaultName
	return pick(d), nil
}
