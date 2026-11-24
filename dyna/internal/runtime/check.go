package runtime

// The capability template (the 「能力模板」 section of capabilities.md) and `runtime check`: a runtime description is
// checked against it. The template is the plugin's data, like the capability list; nothing about it is written in
// code except how it is read.
//
// Template: under `## 能力模板`, one `### <capability>` per capability; under it one list line per item, starting
// with the item's name in bold (`- **开一个 issue 会话**：传入：…；拿回：…；做不到时：…`).
// Description: under each capability's `## <capability>` section, every template item has a bold name of the same
// text, and after it (on its line, or the lines under it) either how it is done here or 「没有」.

import (
	"fmt"
	"os"
	"regexp"
	"strings"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/home"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/nexterr"
)

// TemplateTitle is the section of capabilities.md that holds the template.
const TemplateTitle = "能力模板"

// TemplateItem is one thing a workflow asks of a capability.
type TemplateItem struct {
	Name string
	// Line is the template's whole line for the item: what goes in, what comes back, what to do when it cannot be done.
	Line string
}

var (
	boldSpan     = regexp.MustCompile(`\*\*([^*\n]+)\*\*`)
	templateItem = regexp.MustCompile(`^\s*[-*]\s+\*\*([^*\n]+)\*\*`)
	itemStart    = regexp.MustCompile(`^\s*(?:[-*]\s+|\d+\.\s+)?\*\*`)
	headingStart = regexp.MustCompile(`^#{1,6}\s`)
)

// nameOf is the item name a bold text gives: the text before a colon (「分组：没有」 is the item 分组, answered no).
func nameOf(bold string) (name, tail string) {
	name = strings.TrimSpace(bold)
	for _, colon := range []string{"：", ":"} {
		if i := strings.Index(name, colon); i >= 0 {
			return strings.TrimSpace(name[:i]), strings.TrimSpace(name[i+len(colon):])
		}
	}
	return name, ""
}

// hasText is whether there is anything but punctuation and whitespace.
func hasText(s string) bool {
	return strings.Trim(s, " \t\r\n：:，,。.、；;（）()*·-—") != ""
}

// withoutSection is text without the `## <title>` section (its subsections included), the blank lines that
// followed it, and nothing else changed; text without that section comes back as it was.
func withoutSection(text, title string) string {
	lines := strings.Split(text, "\n")
	var out []string
	skip, fenced := false, false
	for _, line := range lines {
		if strings.HasPrefix(strings.TrimSpace(line), "```") {
			fenced = !fenced
		}
		if !fenced && strings.HasPrefix(line, "## ") {
			skip = strings.TrimSpace(line[3:]) == title
		}
		if !skip {
			out = append(out, line)
		}
	}
	return strings.TrimRight(strings.Join(out, "\n"), "\n") + "\n"
}

// Template is the items of each capability, in the order the template lists them.
func (p Plugin) Template() (map[string][]TemplateItem, error) {
	text, err := p.read(DataDir, CapabilitiesFile)
	if err != nil {
		return nil, err
	}
	caps, err := p.Capabilities()
	if err != nil {
		return nil, err
	}
	section, ok := sectionOf(text, TemplateTitle)
	if !ok {
		return nil, nexterr.Plain("%s/%s 里没有「%s」一节", DataDir, CapabilitiesFile, TemplateTitle)
	}
	out := map[string][]TemplateItem{}
	cur, fenced := "", false
	for _, line := range strings.Split(section, "\n") {
		if strings.HasPrefix(strings.TrimSpace(line), "```") {
			fenced = !fenced
		}
		if fenced {
			continue
		}
		if strings.HasPrefix(line, "### ") {
			cur = strings.TrimSpace(line[4:])
			if _, dup := out[cur]; !dup {
				out[cur] = nil
			}
			continue
		}
		if m := templateItem.FindStringSubmatch(line); m != nil && cur != "" {
			name, _ := nameOf(m[1])
			out[cur] = append(out[cur], TemplateItem{Name: name, Line: strings.TrimSpace(line)})
		}
	}
	for _, c := range caps {
		if _, ok := out[c]; !ok {
			return nil, nexterr.Plain("%s/%s 的「%s」里没有「%s」这个能力的 ### 小节", DataDir, CapabilitiesFile, TemplateTitle, c)
		}
	}
	return out, nil
}

// itemAnswer is what a description says about one item: Found when its bold name is there, Written when something
// follows it (how it is done, or 「没有」).
type itemAnswer struct{ Found, Written bool }

// itemsOf is every bold name in a section, wherever on a line it stands: a name that stands again keeps the
// better answer. A name written with a colon inside the bold (**分组：没有**) is answered by what follows the colon.
func itemsOf(section string) map[string]itemAnswer {
	lines := strings.Split(section, "\n")
	out := map[string]itemAnswer{}
	fenced := make([]bool, len(lines))
	in := false
	for i, l := range lines {
		if strings.HasPrefix(strings.TrimSpace(l), "```") {
			in = !in
			fenced[i] = true
			continue
		}
		fenced[i] = in
	}
	for i, line := range lines {
		if fenced[i] {
			continue
		}
		spans := boldSpan.FindAllStringSubmatchIndex(line, -1)
		for k, m := range spans {
			name, tail := nameOf(line[m[2]:m[3]])
			if name == "" {
				continue
			}
			end := len(line)
			if k+1 < len(spans) {
				end = spans[k+1][0]
			}
			written := hasText(tail) || hasText(line[m[1]:end])
			if !written && k == len(spans)-1 {
				for j := i + 1; j < len(lines); j++ {
					if fenced[j] || headingStart.MatchString(lines[j]) || itemStart.MatchString(lines[j]) {
						break
					}
					if hasText(lines[j]) {
						written = true
						break
					}
				}
			}
			a := out[name]
			out[name] = itemAnswer{Found: true, Written: a.Written || written}
		}
	}
	return out
}

// onlyNo is whether a section is, as a whole, 「没有」: its first line (headings not counted) starts with 没有 and
// the 没有 stops there, so 「没有专门的工具，……」 is not.
func onlyNo(section string) bool {
	for _, line := range strings.Split(section, "\n") {
		if headingStart.MatchString(line) || strings.TrimSpace(line) == "" {
			continue
		}
		s := strings.TrimSpace(strings.ReplaceAll(line, "**", ""))
		rest, ok := strings.CutPrefix(s, "没有")
		if !ok {
			return false
		}
		if rest == "" {
			return true
		}
		r := []rune(rest)[0]
		return strings.ContainsRune("。：:，,；;、（(.", r)
	}
	return false
}

// CheckDescription is what is wrong with one description, a line per problem, each naming its section (and item).
// label is how the description is called in the lines.
func CheckDescription(label, text string, caps []string, tmpl map[string][]TemplateItem) []string {
	var out []string
	add := func(format string, a ...any) { out = append(out, label+"："+fmt.Sprintf(format, a...)) }

	if _, ok := MarkerOf(text); !ok {
		add("开头没有标记行：第一个 ## 小节之前要有一行「标记：」，后面是用反引号包住的环境变量名，或写「没有」")
	}
	known := map[string]bool{}
	for _, c := range caps {
		known[c] = true
	}
	lines := strings.Split(text, "\n")
	for _, h := range headingsOf(lines) {
		if h.level == 2 && !known[h.title] {
			add("「%s」：节名不在能力清单里（能力清单：%s）", h.title, strings.Join(caps, " / "))
		}
	}
	for _, c := range caps {
		section, ok := sectionOf(text, c)
		if !ok {
			add("「%s」：缺这一节", c)
			continue
		}
		if onlyNo(section) {
			continue
		}
		answers := itemsOf(section)
		for _, it := range tmpl[c] {
			a := answers[it.Name]
			switch {
			case !a.Found:
				add("「%s」：缺项「%s」（没有加粗的项名 **%s**）", c, it.Name, it.Name)
			case !a.Written:
				add("「%s」：项「%s」既没写做法也没写「没有」", c, it.Name)
			}
		}
	}
	return out
}

// Checked is the result of `runtime check`: the descriptions that were looked at and what was wrong with them.
type Checked struct {
	Labels   []string
	Problems []string
}

// Check checks the description in file; with no file, every description with a marker line in the plugin and in
// home, each as it is used (the plugin's file with the local override merged in).
func Check(file string, env home.Env) (Checked, error) {
	p, err := PluginFrom(env)
	if err != nil {
		return Checked{}, err
	}
	caps, err := p.Capabilities()
	if err != nil {
		return Checked{}, err
	}
	tmpl, err := p.Template()
	if err != nil {
		return Checked{}, err
	}
	var res Checked
	if file != "" {
		b, err := os.ReadFile(file)
		if err != nil {
			return Checked{}, nexterr.Plain("读不到 %s：%v", file, err)
		}
		res.Labels = []string{file}
		res.Problems = CheckDescription(file, string(b), caps, tmpl)
		return res, nil
	}
	docs, err := p.Known(env)
	if err != nil {
		return Checked{}, err
	}
	if len(docs) == 0 {
		return Checked{}, nexterr.Plain("插件和 home 的 %s/ 里没有带标记行的运行环境说明", DataDir)
	}
	for _, d := range docs {
		label := d.Name
		var text string
		if d.Path != "" {
			label = d.Name + "（" + d.Path + "）"
			if text, err = p.readFile(d.Path); err != nil {
				return Checked{}, err
			}
		} else {
			if text, err = p.read(DataDir, d.Name+".md"); err != nil {
				return Checked{}, err
			}
			ov := loadOverride(d.Name, env)
			switch {
			case ov.failure != "":
				res.Problems = append(res.Problems, d.Name+"："+ov.failedLine())
			case ov.present:
				label = d.Name + "（合并了本机覆盖 " + ov.path + "）"
				text = merge(text, p.expand(ov.text)).text
			}
		}
		res.Labels = append(res.Labels, label)
		res.Problems = append(res.Problems, CheckDescription(label, text, caps, tmpl)...)
	}
	return res, nil
}
