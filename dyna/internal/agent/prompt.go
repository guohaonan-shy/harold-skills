package agent

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

// The fixed Codex prompts of pr-review are text that changes with the skill, so they stay in the plugin and are
// read from there (IDEA_LOOP_PLUGIN_ROOT); the command only fills them in.
const (
	templateDir     = "skills/engineering/pr-review/references"
	standardsPath   = "skills/engineering/pr-review/references/review-standards.md"
	decisionRulesMD = "skills/productivity/decision-rules/SKILL.md"
)

// Axes are the two prompt templates, one per review axis.
var Axes = []string{"spec", "standards"}

var placeholder = regexp.MustCompile(`\{\{(\w+)\}\}`)

// Builtin is the values the command fills in itself, from the plugin's own layout: the paths of review-standards
// and decision-rules under pluginRoot. Keys in the order they are listed in messages.
func Builtin(pluginRoot string) (keys []string, values map[string]string) {
	return []string{"standards", "decision_rules"}, map[string]string{
		"standards":      filepath.Join(pluginRoot, standardsPath),
		"decision_rules": filepath.Join(pluginRoot, decisionRulesMD),
	}
}

// TemplatePath is where the template of one axis is.
func TemplatePath(pluginRoot, axis string) string {
	return filepath.Join(pluginRoot, templateDir, "codex-"+axis+".md")
}

// Render fills `{{key}}` in template from values (keys in the order they were given). It refuses, naming every
// placeholder left empty and every key the template does not use, so a prompt never goes out half-written.
// builtin names the keys the command fills in itself: those may go unused.
func Render(template string, keys []string, values map[string]string, builtin []string) (string, error) {
	var used []string
	seen := map[string]bool{}
	for _, m := range placeholder.FindAllStringSubmatch(template, -1) {
		if !seen[m[1]] {
			seen[m[1]] = true
			used = append(used, m[1])
		}
	}
	var missing, unknown []string
	for _, k := range used {
		if values[k] == "" {
			missing = append(missing, k)
		}
	}
	isBuiltin := map[string]bool{}
	for _, k := range builtin {
		isBuiltin[k] = true
	}
	for _, k := range keys {
		if !seen[k] && !isBuiltin[k] {
			unknown = append(unknown, k)
		}
	}
	sort.Strings(unknown) // keys come from a map: the refusal must read the same every time
	if len(missing) > 0 || len(unknown) > 0 {
		var why []string
		if len(missing) > 0 {
			why = append(why, "没给："+strings.Join(missing, ", "))
		}
		if len(unknown) > 0 {
			why = append(why, "模板里没有："+strings.Join(unknown, ", "))
		}
		return "", fmt.Errorf("拒绝：%s", strings.Join(why, "；"))
	}
	return placeholder.ReplaceAllStringFunc(template, func(m string) string {
		return values[placeholder.FindStringSubmatch(m)[1]]
	}), nil
}

// FillPrompt reads the template of axis from the plugin, fills it from pairs (`key=value`) and the built-in
// paths, and writes it to out.
func FillPrompt(pluginRoot, axis, out string, pairs []string) error {
	ok := false
	for _, a := range Axes {
		ok = ok || a == axis
	}
	if !ok || out == "" {
		return fmt.Errorf("用法：dyna agent codex prompt <spec|standards> <out-file> key=value...")
	}
	keys, values := Builtin(pluginRoot)
	builtin := append([]string{}, keys...)
	for _, p := range pairs {
		i := strings.Index(p, "=")
		if i < 1 {
			return fmt.Errorf("「%s」不是 key=value", p)
		}
		k := p[:i]
		if _, had := values[k]; !had {
			keys = append(keys, k)
		}
		values[k] = p[i+1:]
	}
	template, err := os.ReadFile(TemplatePath(pluginRoot, axis))
	if err != nil {
		return fmt.Errorf("读不到 %s 的 prompt 模板：%v", axis, err)
	}
	text, err := Render(string(template), keys, values, builtin)
	if err != nil {
		return err
	}
	return os.WriteFile(out, []byte(text), 0o644)
}
