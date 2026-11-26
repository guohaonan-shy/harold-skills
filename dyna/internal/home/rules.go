package home

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

// The fixed text: three sections of <home>/AGENTS.md that idea-loop writes, the same on every device. The plugin
// holds the one copy (RulesFile); `home config` writes it into home and the session start says when home's copy
// has fallen behind.

// RulesFile is the plugin's copy of the three sections, relative to the plugin directory, and nothing else.
const RulesFile = "skills/engineering/setup/references/home-rules.md"

// RuleSections are the names of the three sections, in the order they are written.
var RuleSections = []string{"思考与决策", "沟通", "证据"}

// LagLine is what a session starts with when home's three sections differ from the plugin's.
const LagLine = "home 的固定文案落后于插件，跑 `/idea-loop:setup`"

var sectionHeadRe = regexp.MustCompile(`^##\s+(.*?)\s*$`)

// chunk is a stretch of a Markdown file: the lines before the first `## ` heading (name ""), or one section from
// its heading to the line before the next one.
type chunk struct {
	name string
	text string
}

// chunks splits text at its `## ` headings; a `## ` inside a fenced code block is not a heading.
func chunks(text string) []chunk {
	var out []chunk
	cur := chunk{}
	fenced := false
	for _, line := range strings.SplitAfter(text, "\n") {
		bare := strings.TrimRight(line, "\r\n")
		if strings.HasPrefix(strings.TrimSpace(bare), "```") || strings.HasPrefix(strings.TrimSpace(bare), "~~~") {
			fenced = !fenced
		}
		if m := sectionHeadRe.FindStringSubmatch(bare); m != nil && !fenced {
			if cur.text != "" || cur.name != "" {
				out = append(out, cur)
			}
			cur = chunk{name: m[1]}
		}
		cur.text += line
	}
	if cur.text != "" || cur.name != "" {
		out = append(out, cur)
	}
	return out
}

// RuleSectionNames are the section names of the plugin's text; an error when it is not exactly the three.
func RuleSectionNames(rules string) ([]string, error) {
	var names []string
	for i, c := range chunks(rules) {
		if c.name == "" {
			if strings.TrimSpace(c.text) != "" {
				return nil, fmt.Errorf("固定文案的开头有 ## 标题之前的内容（第 %d 段）：只能是 %s 三节", i+1, strings.Join(RuleSections, "、"))
			}
			continue
		}
		names = append(names, c.name)
	}
	if strings.Join(names, "\x00") != strings.Join(RuleSections, "\x00") {
		return nil, fmt.Errorf("固定文案要正好是 %s 三节、按这个顺序，读到的是：%s", strings.Join(RuleSections, "、"), strings.Join(names, "、"))
	}
	return names, nil
}

// ruleChunks are the plugin's three sections, trimmed.
func ruleChunks(rules string) ([]chunk, error) {
	if _, err := RuleSectionNames(rules); err != nil {
		return nil, err
	}
	var out []chunk
	for _, c := range chunks(rules) {
		if c.name != "" {
			out = append(out, chunk{c.name, strings.TrimSpace(c.text)})
		}
	}
	return out, nil
}

func isRule(name string) bool {
	for _, n := range RuleSections {
		if n == name {
			return true
		}
	}
	return false
}

// trailing is the whitespace at the end of s.
func trailing(s string) string { return s[len(strings.TrimRight(s, " \t\r\n")):] }

// ApplyRules is agents with the three sections of rules in it: a section already there is replaced when its text
// differs, one that is missing is added (after the section before it in the plugin's order, else before the one
// after it, else before idea-loop's own 设备地图 / 项目, else at the end). Everything else is untouched; when the
// three are already the plugin's, the result is agents itself.
func ApplyRules(agents, rules string) (string, error) {
	want, err := ruleChunks(rules)
	if err != nil {
		return "", err
	}
	list := chunks(agents)
	indexOf := func(name string) int {
		for i, c := range list {
			if c.name == name {
				return i
			}
		}
		return -1
	}
	for _, w := range want {
		if i := indexOf(w.name); i >= 0 && strings.TrimSpace(list[i].text) != w.text {
			end := trailing(list[i].text)
			if end == "" {
				end = "\n"
			}
			list[i].text = w.text + end
		}
	}
	for k, w := range want {
		if indexOf(w.name) >= 0 {
			continue
		}
		at := len(list)
		prev, next := -1, -1
		for j := k - 1; j >= 0 && prev < 0; j-- {
			prev = indexOf(want[j].name)
		}
		for j := k + 1; j < len(want) && next < 0; j++ {
			next = indexOf(want[j].name)
		}
		switch {
		case prev >= 0:
			at = prev + 1
		case next >= 0:
			at = next
		default:
			for i, c := range list {
				if c.name == "设备地图" || c.name == "项目" {
					at = i
					break
				}
			}
		}
		// a blank line between what is before and the new section
		if at > 0 {
			end := trailing(list[at-1].text)
			switch {
			case strings.Count(end, "\n") >= 2:
			case strings.HasSuffix(end, "\n"):
				list[at-1].text += "\n"
			default:
				list[at-1].text += "\n\n"
			}
		}
		text := w.text + "\n"
		if at < len(list) {
			text += "\n"
		}
		list = append(list[:at], append([]chunk{{w.name, text}}, list[at:]...)...)
	}
	var b strings.Builder
	for _, c := range list {
		b.WriteString(c.text)
	}
	return b.String(), nil
}

// rulesDiff reads home's AGENTS.md against the plugin's text: what is missing and what differs.
func rulesDiff(agents, rules string) (missing, differs []string, err error) {
	want, err := ruleChunks(rules)
	if err != nil {
		return nil, nil, err
	}
	have := map[string]string{}
	for _, c := range chunks(agents) {
		if isRule(c.name) {
			if _, seen := have[c.name]; !seen {
				have[c.name] = strings.TrimSpace(c.text)
			}
		}
	}
	for _, w := range want {
		got, ok := have[w.name]
		switch {
		case !ok:
			missing = append(missing, w.name)
		case got != w.text:
			differs = append(differs, w.name)
		}
	}
	return missing, differs, nil
}

func readRules(pluginRoot string) (string, error) {
	b, err := os.ReadFile(filepath.Join(pluginRoot, filepath.FromSlash(RulesFile)))
	if err != nil {
		return "", fmt.Errorf("读不到插件里的固定文案 %s：%v", RulesFile, err)
	}
	return string(b), nil
}

// RulesLagLine is LagLine + "\n" when home's AGENTS.md lacks one of the three sections or has one that differs
// from the plugin's; "" when they match, and also when there is nothing to compare (no plugin directory, no plugin
// text, no AGENTS.md in home): a session must not be bothered by what it cannot check.
func RulesLagLine(env Env) string {
	root := env("IDEA_LOOP_PLUGIN_ROOT")
	if root == "" {
		return ""
	}
	rules, err := readRules(root)
	if err != nil {
		return ""
	}
	b, err := os.ReadFile(filepath.Join(Dir(env), "AGENTS.md"))
	if err != nil {
		return ""
	}
	missing, differs, err := rulesDiff(string(b), rules)
	if err != nil || len(missing)+len(differs) == 0 {
		return ""
	}
	return LagLine + "\n"
}
