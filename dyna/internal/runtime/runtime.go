// Package runtime is the `runtime` module: which environment a session runs in (read from the descriptions' marker
// lines, see envs.go), what the SessionStart hook injects about it, and the per-capability how-to for that
// environment.
//
// There are two kinds of text. The plugin's data is <plugin>/runtime/capabilities.md (the capability list, the
// fallbacks and the template a description is written from); it is read from the plugin directory at call time
// (IDEA_LOOP_PLUGIN_ROOT, set by the plugin's bin/dyna), so changing it only needs a new plugin, not a new dyna.
// The descriptions of environments (one `## <capability>` section per capability) are the machine's own: the
// plugin ships none. dyna looks for them in three places, the project first, then home, then the user's root
// directory (see Places). A session that matches no description is told dyna does not recognise it, and the
// capability list's fallbacks apply.
package runtime

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/home"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/nexterr"
)

// Environment variables this module reads.
const (
	// EnvPluginRoot is the plugin's directory, set by the plugin's own `bin/dyna`.
	EnvPluginRoot = "IDEA_LOOP_PLUGIN_ROOT"
	// EnvRuntime forces an environment by name.
	EnvRuntime = "IDEA_LOOP_RUNTIME"
)

// DataDir is the directory that holds runtime data: under the plugin (the capability list) and, with descriptions
// in it, in each of the three places. CapabilitiesFile is the plugin's file in it.
const (
	DataDir          = "runtime"
	CapabilitiesFile = "capabilities.md"
)

// Sections is what `inject` can print, in the order the SessionStart hook runs them.
var Sections = []string{"runtime", "reference"}

var frontmatter = regexp.MustCompile(`^---\n[\s\S]*?\n---\n`)

// Plugin is a plugin directory the texts are read from.
type Plugin struct{ Root string }

// PluginFrom is the plugin directory the launcher told us about.
func PluginFrom(env home.Env) (Plugin, error) {
	root := env(EnvPluginRoot)
	if root == "" {
		return Plugin{}, nexterr.Plain("不知道插件装在哪：%s 没设（经插件的 bin/dyna 调用会自己设）", EnvPluginRoot)
	}
	return Plugin{Root: root}, nil
}

// read is a file under the plugin, without a leading frontmatter, with the plugin path spelled out where the text
// says ${CLAUDE_PLUGIN_ROOT} (the host does that for a skill it loads, not for hook output), trimmed.
func (p Plugin) read(rel ...string) (string, error) {
	return p.readFile(filepath.Join(append([]string{p.Root}, rel...)...))
}

// readFile is read for a file anywhere (a description in one of the three places), with the same trimming.
func (p Plugin) readFile(path string) (string, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return "", nexterr.Plain("读不到运行环境的数据：%v", err)
	}
	return p.expand(strings.TrimSpace(frontmatter.ReplaceAllString(string(b), ""))), nil
}

func (p Plugin) expand(text string) string {
	return strings.ReplaceAll(text, "${CLAUDE_PLUGIN_ROOT}", p.Root)
}

// Inject is one section of the SessionStart injection. The hook output is cut at 10,000 characters, so the two
// sections are two commands. An unknown section is an error; so is a forced name that is not known. An
// environment dyna cannot tell is not an error (a hook that fails leaves the session with nothing): the sections
// say so and point at setup.
func Inject(section string, env home.Env, cwd string) (string, error) {
	known := false
	for _, s := range Sections {
		known = known || s == section
	}
	if !known {
		return "", nexterr.Plain("unknown section %s; known: %s", section, strings.Join(Sections, ", "))
	}
	p, err := PluginFrom(env)
	if err != nil {
		return "", err
	}
	det, err := Detect(env, cwd)
	if err != nil {
		return "", err
	}
	if section == "runtime" {
		body, err := p.read(DataDir, CapabilitiesFile)
		if err != nil {
			return "", err
		}
		name := "没有（" + strings.ReplaceAll(SetupHint, "`", "") + "）"
		if !det.None() {
			name = det.Name
		}
		// the template is for writing a description, not for a session that uses one
		return "当前运行环境：" + name + "\n以下是运行环境的能力清单，开场注入，不必再取。\n\n" + strings.TrimSpace(withoutSection(body, TemplateTitle)) + "\n", nil
	}
	notes := ""
	for _, n := range det.Notes {
		notes += n + "\n"
	}
	if det.None() {
		return notes + "没有运行环境说明，" + SetupHint + "\n", nil
	}
	body, err := p.readFile(det.Path)
	if err != nil {
		return "", err
	}
	return notes + "以下是运行环境「" + det.Name + "」的做法全文，开场注入，不必再取。\n\n" + body + "\n", nil
}

// sectionOf is the `## <title>` section of a markdown text, heading line and its `###` subsections included, up
// to the next `## ` heading; false when there is none. Lines inside a code fence are never headings.
func sectionOf(text, title string) (string, bool) {
	var out []string
	in, fenced := false, false
	for _, line := range strings.Split(text, "\n") {
		if strings.HasPrefix(strings.TrimSpace(line), "```") {
			fenced = !fenced
		}
		if !fenced && strings.HasPrefix(line, "## ") {
			if in {
				break
			}
			in = strings.TrimSpace(line[3:]) == title
		}
		if in {
			out = append(out, line)
		}
	}
	if !in && len(out) == 0 {
		return "", false
	}
	return strings.TrimSpace(strings.Join(out, "\n")), true
}

// Capabilities are the names in the first column of the capability table in capabilities.md.
func (p Plugin) Capabilities() ([]string, error) {
	text, err := p.read(DataDir, CapabilitiesFile)
	if err != nil {
		return nil, err
	}
	table, ok := sectionOf(text, "能力清单")
	if !ok {
		return nil, nexterr.Plain("%s/%s 里没有「能力清单」一节", DataDir, CapabilitiesFile)
	}
	var names []string
	for _, line := range strings.Split(table, "\n") {
		if !strings.HasPrefix(line, "|") {
			continue
		}
		cells := strings.Split(line, "|")
		if len(cells) < 3 {
			continue
		}
		name := strings.TrimSpace(cells[1])
		if name == "" || name == "能力" || strings.Trim(name, "-: ") == "" {
			continue
		}
		names = append(names, name)
	}
	return names, nil
}

// Overview is the capability list and the fallbacks: what `show` prints with no capability.
func (p Plugin) Overview() (string, error) {
	text, err := p.read(DataDir, CapabilitiesFile)
	if err != nil {
		return "", err
	}
	var parts []string
	for _, title := range []string{"能力清单", "退路"} {
		s, ok := sectionOf(text, title)
		if !ok {
			return "", nexterr.Plain("%s/%s 里没有「%s」一节", DataDir, CapabilitiesFile, title)
		}
		parts = append(parts, s)
	}
	return strings.Join(parts, "\n\n") + "\n", nil
}

// Show is the section for one capability in the current environment's description. An environment dyna cannot tell
// is an error: the caller asked for a how-to and has none, so it takes the capability list's fallback.
func Show(capability string, env home.Env, cwd string) (string, error) {
	p, err := PluginFrom(env)
	if err != nil {
		return "", err
	}
	caps, err := p.Capabilities()
	if err != nil {
		return "", err
	}
	known := false
	for _, c := range caps {
		known = known || c == capability
	}
	if !known {
		return "", nexterr.Plain("没有「%s」这个能力；能力清单：%s（不带能力跑 `dyna runtime show` 看清单和退路）", capability, strings.Join(caps, " / "))
	}
	det, err := Detect(env, cwd)
	if err != nil {
		return "", err
	}
	if det.None() {
		return "", det.Unknown()
	}
	text, err := p.readFile(det.Path)
	if err != nil {
		return "", err
	}
	s, ok := sectionOf(text, capability)
	if !ok {
		return "", nexterr.Plain("运行环境 %s 的说明（%s）里没有「%s」一节", det.Name, det.Path, capability)
	}
	return s + "\n", nil
}
