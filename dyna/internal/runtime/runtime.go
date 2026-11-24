// Package runtime is the `runtime` module: which environment a session runs in (read from the descriptions' marker
// lines, see envs.go), what the SessionStart hook injects about it, the per-capability how-to for that environment,
// and the hand-over of a `claude -p` session to the desktop app.
//
// The texts are the plugin's data, not code: <plugin>/runtime/capabilities.md (the capability list and the
// fallbacks) and <plugin>/runtime/<environment>.md (one `## <capability>` section per capability). They are read
// from the plugin directory at call time (IDEA_LOOP_PLUGIN_ROOT, set by the plugin's bin/dyna), so changing them
// only needs a new plugin, not a new dyna.
package runtime

import (
	"os"
	"path/filepath"
	"regexp"
	"strconv"
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

// DataDir is the directory under the plugin that holds the data, and the names of the files in it that are not an
// environment.
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

// readFile is read for a file anywhere (a description only home has), with the same trimming.
func (p Plugin) readFile(path string) (string, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return "", nexterr.Plain("读不到插件里的数据：%v", err)
	}
	return p.expand(strings.TrimSpace(frontmatter.ReplaceAllString(string(b), ""))), nil
}

func (p Plugin) expand(text string) string {
	return strings.ReplaceAll(text, "${CLAUDE_PLUGIN_ROOT}", p.Root)
}

// Inject is one section of the SessionStart injection. The hook output is cut at 10,000 characters, so the two
// sections are two commands. An unknown section is an error; so is an
// unknown environment.
func Inject(section string, env home.Env) (string, error) {
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
	det, err := Detect(env)
	if err != nil {
		return "", err
	}
	name := det.Name
	if section == "runtime" {
		body, err := p.read(DataDir, CapabilitiesFile)
		if err != nil {
			return "", err
		}
		// the template is for writing a description, not for a session that uses one
		return "当前运行环境：" + name + "\n以下是运行环境的能力清单，开场注入，不必再取。\n\n" + strings.TrimSpace(withoutSection(body, TemplateTitle)) + "\n", nil
	}
	notes := ""
	for _, n := range det.Notes {
		notes += n + "\n"
	}
	intro := "以下是运行环境「" + name + "」的做法全文，开场注入，不必再取。\n\n"
	if det.Path != "" {
		body, err := p.readFile(det.Path)
		if err != nil {
			return "", err
		}
		return notes + intro + body + "\n", nil
	}
	body, err := p.read(DataDir, name+".md")
	if err != nil {
		return "", err
	}
	ov := loadOverride(name, env)
	switch {
	case ov.failure != "":
		return notes + ov.failedLine() + "\n" + intro + body + "\n", nil
	case !ov.present:
		return notes + intro + body + "\n", nil
	}
	m := merge(body, p.expand(ov.text))
	head := ov.header(m)
	if n := runeCount(notes + head + "\n" + intro + m.text + "\n"); n > InjectLimit {
		head += "合并后 " + strconv.Itoa(n) + " 字，超过开场注入上限，后面被截断；完整的某一节跑 `dyna runtime show <能力>`。"
	}
	return notes + head + "\n" + intro + m.text + "\n", nil
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

// Show is the section for one capability in the current environment's data, with the device's local override
// merged in; when part of the section is the device's own, the first line says so.
func Show(capability string, env home.Env) (string, error) {
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
	det, err := Detect(env)
	if err != nil {
		return "", err
	}
	name := det.Name
	lead := ""
	var text string
	if det.Path != "" {
		if text, err = p.readFile(det.Path); err != nil {
			return "", err
		}
	} else {
		if text, err = p.read(DataDir, name+".md"); err != nil {
			return "", err
		}
		if ov := loadOverride(name, env); ov.failure != "" {
			lead = ov.failedLine() + "\n"
		} else if ov.present {
			m := merge(text, p.expand(ov.text))
			text = m.text
			lead = leadOf(ov, m, capability)
		}
	}
	s, ok := sectionOf(text, capability)
	if !ok {
		return "", nexterr.Plain("运行环境 %s 的数据（%s/%s.md）里没有「%s」一节", name, DataDir, name, capability)
	}
	return lead + s + "\n", nil
}
