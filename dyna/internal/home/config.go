package home

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf16"
)

// Setup's four user-level changes, so setup can show them once and do them in one go:
//
//	1 plugin     user-level settings.json: enabledPlugins["<plugin>@<marketplace>"] = true
//	2 memory     user-level settings.json: autoMemoryDirectory = <home>/memory
//	3 claude-md  user-level CLAUDE.md becomes a symlink to <home>/AGENTS.md; a plain file's text moves into
//	             <home>/AGENTS.md first, before the idea-loop sections, verbatim
//	4 rules      <home>/AGENTS.md holds the plugin's fixed text as the sections 思考与决策, 沟通, 证据 (rules.go)
//
// `plan` shows each item's before and after and writes nothing. `apply` backs up first, then does the items that
// are still to do; items already in place are left alone, and when none is left nothing is written at all.

// ConfigItems are the four items, in order.
var ConfigItems = []string{"plugin", "memory", "claude-md", "rules"}

// the sections idea-loop owns in <home>/AGENTS.md; moved text goes before the first of them
var ownedSections = []string{"## 思考与决策", "## 沟通", "## 证据", "## 设备地图", "## 项目"}

func claudeDir(env Env) string { return filepath.Join(userHome(env), ".claude") }

var (
	cacheRe  = regexp.MustCompile(`[\\/]plugins[\\/]cache[\\/]([^\\/]+)[\\/][^\\/]+[\\/][^\\/]+$`)
	listedRe = regexp.MustCompile(`[\\/]plugins[\\/]marketplaces[\\/]([^\\/]+)[\\/]`)
)

// PluginKey is `<plugin>@<marketplace>`, read off the path the plugin is installed at.
func PluginKey(pluginRoot string) (string, error) {
	manifest := filepath.Join(pluginRoot, ".claude-plugin", "plugin.json")
	b, err := os.ReadFile(manifest)
	if err != nil {
		return "", fmt.Errorf("no .claude-plugin/plugin.json under %s: cannot tell the plugin's name", pluginRoot)
	}
	var m struct {
		Name string `json:"name"`
	}
	if err := json.Unmarshal(b, &m); err != nil {
		return "", fmt.Errorf("%s is not valid JSON: %v", manifest, err)
	}
	if mm := cacheRe.FindStringSubmatch(pluginRoot); mm != nil {
		return m.Name + "@" + mm[1], nil
	}
	if mm := listedRe.FindStringSubmatch(pluginRoot); mm != nil {
		return m.Name + "@" + mm[1], nil
	}
	if cb, err := os.ReadFile(filepath.Join(filepath.Dir(pluginRoot), ".claude-plugin", "marketplace.json")); err == nil {
		var c struct {
			Name string `json:"name"`
		}
		if err := json.Unmarshal(cb, &c); err != nil {
			return "", err
		}
		return m.Name + "@" + c.Name, nil
	}
	return "", fmt.Errorf("cannot tell which marketplace %s was installed from (not under plugins/cache or plugins/marketplaces, no marketplace.json beside it)", pluginRoot)
}

// MergeAgents is <home>/AGENTS.md with text added before the first idea-loop section (at the end when there is
// none). Unchanged when the text is empty or already in the file, so a run that stopped half-way can be repeated.
func MergeAgents(agents, text string) string {
	if strings.TrimSpace(text) == "" || strings.Contains(agents, text) {
		return agents
	}
	at := -1
	for _, h := range ownedSections {
		re := regexp.MustCompile(`(?m)^` + regexp.QuoteMeta(h) + `\s*$`)
		if loc := re.FindStringIndex(agents); loc != nil && (at < 0 || loc[0] < at) {
			at = loc[0]
		}
	}
	head, rest := agents, ""
	if at >= 0 {
		head, rest = agents[:at], agents[at:]
	}
	body := text
	if !strings.HasSuffix(body, "\n") {
		body += "\n"
	}
	gap := ""
	switch {
	case head == "" || strings.HasSuffix(head, "\n\n"):
	case strings.HasSuffix(head, "\n"):
		gap = "\n"
	default:
		gap = "\n\n"
	}
	tail := ""
	if rest != "" {
		tail = "\n" + rest
	}
	return head + gap + body + tail
}

type settingsFile struct {
	data    *jnode
	indent  string
	newline bool
}

var indentRe = regexp.MustCompile(`(?m)^([ \t]+)"`)

func readSettings(path string) (settingsFile, error) {
	b, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return settingsFile{data: newObject(), indent: "  ", newline: true}, nil
	}
	if err != nil {
		return settingsFile{}, err
	}
	text := string(b)
	data, err := parseJSON(b)
	if err != nil {
		return settingsFile{}, fmt.Errorf("%s is not valid JSON (%v); nothing was written", path, err)
	}
	if !data.isObject() {
		return settingsFile{}, fmt.Errorf("%s is not a JSON object", path)
	}
	if ep := data.get("enabledPlugins"); ep != nil && !ep.isObject() {
		return settingsFile{}, fmt.Errorf("%s: enabledPlugins is not an object", path)
	}
	indent := "  "
	if m := indentRe.FindStringSubmatch(text); m != nil {
		indent = m[1]
	}
	return settingsFile{data: data, indent: indent, newline: strings.HasSuffix(text, "\n")}, nil
}

// claudeMdState: "missing", "file", or the absolute target of a symlink.
func claudeMdState(path string) (state, link string) {
	st, err := os.Lstat(path)
	if err != nil {
		return "missing", ""
	}
	if st.Mode()&os.ModeSymlink == 0 {
		return "file", ""
	}
	target, _ := os.Readlink(path)
	if !filepath.IsAbs(target) {
		target = filepath.Join(filepath.Dir(path), target)
	}
	return "link", filepath.Clean(target)
}

// ConfigItem is one of the four changes: what it is, whether it is done, and how it reads before and after.
type ConfigItem struct {
	ID     string `json:"id"`
	Label  string `json:"label"`
	Status string `json:"status"` // todo | already | manual
	Before string `json:"before"`
	After  string `json:"after"`
}

func jsLen(s string) int { return len(utf16.Encode([]rune(s))) }

// PlanConfig is the state of the selected items, in item order.
func PlanConfig(env Env, pluginRoot string, only []string) ([]ConfigItem, error) {
	h := Dir(env)
	settings, err := readSettings(filepath.Join(claudeDir(env), "settings.json"))
	if err != nil {
		return nil, err
	}
	key, err := PluginKey(pluginRoot)
	if err != nil {
		return nil, err
	}
	memory := filepath.Join(h, "memory")
	agents := filepath.Join(h, "AGENTS.md")
	claudeMd := filepath.Join(claudeDir(env), "CLAUDE.md")

	all := map[string]ConfigItem{}
	var enabled *jnode
	if ep := settings.data.get("enabledPlugins"); ep != nil {
		enabled = ep.get(key)
	}
	item := ConfigItem{Label: "settings.json 的 enabledPlugins 启用 " + key, Status: "todo", After: `"` + key + `": true`}
	if enabled != nil && enabled.kind == jScalar && enabled.scalar == "true" {
		item.Status = "already"
	}
	if enabled == nil {
		item.Before = "没有这一项"
	} else {
		item.Before = `"` + key + `": ` + enabled.String("")
	}
	all["plugin"] = item

	mem := settings.data.get("autoMemoryDirectory")
	item = ConfigItem{Label: "settings.json 的 autoMemoryDirectory", Status: "todo", After: marshalString(memory)}
	if mem != nil && mem.kind == jScalar && mem.scalar == marshalString(memory) {
		item.Status = "already"
	}
	if mem != nil {
		item.Before = mem.String("")
	} else {
		item.Before = "没设"
	}
	all["memory"] = item

	state, link := claudeMdState(claudeMd)
	item = ConfigItem{Label: claudeMd + " 软链到 home 的 AGENTS.md", Status: "todo", After: "软链 → " + agents}
	switch state {
	case "link":
		item.Before = "软链 → " + link
		if link == filepath.Clean(agents) {
			item.Status = "already"
		} else {
			item.Status = "manual"
		}
	case "file":
		b, _ := os.ReadFile(claudeMd)
		item.Before = fmt.Sprintf("普通文件（%d 字）", jsLen(string(b)))
		item.After += "；原文件全文搬进 AGENTS.md（idea-loop 的两节之前）"
	default:
		item.Before = "不存在"
	}
	all["claude-md"] = item

	// the plugin's text is read only when the item is asked for: --only plugin works without it
	for _, id := range only {
		if id != "rules" {
			continue
		}
		rules, err := readRules(pluginRoot)
		if err != nil {
			return nil, err
		}
		agentsText := ""
		if b, err := os.ReadFile(agents); err == nil {
			agentsText = string(b)
		}
		missing, differs, err := rulesDiff(agentsText, rules)
		if err != nil {
			return nil, err
		}
		var headings []string
		for _, n := range RuleSections {
			headings = append(headings, "## "+n)
		}
		item = ConfigItem{Label: agents + " 里 idea-loop 管的三节固定文案", Status: "todo", After: strings.Join(headings, "、") + "（插件里那一份，逐字）"}
		switch {
		case len(missing)+len(differs) == 0:
			item.Status = "already"
			item.Before = "三节与插件一致"
		case len(missing) == len(RuleSections):
			item.Before = "没有这三节"
		default:
			var parts []string
			if len(missing) > 0 {
				parts = append(parts, "缺 "+strings.Join(missing, "、"))
			}
			if len(differs) > 0 {
				parts = append(parts, strings.Join(differs, "、")+" 与插件不一致")
			}
			item.Before = strings.Join(parts, "；")
		}
		all["rules"] = item
	}

	var out []ConfigItem
	for _, id := range only {
		it := all[id]
		it.ID = id
		out = append(out, it)
	}
	return out, nil
}

var statusText = map[string]string{"todo": "待改", "already": "已是", "manual": "已是别处的软链，要人处理"}

// ConfigTable is the plan as a Markdown table.
func ConfigTable(items []ConfigItem) string {
	esc := func(s string) string { return strings.ReplaceAll(s, "|", `\|`) }
	rows := []string{"| # | 改什么 | 改前 | 改后 | 状态 |", "|---|---|---|---|---|"}
	for _, i := range items {
		n := 0
		for k, id := range ConfigItems {
			if id == i.ID {
				n = k + 1
			}
		}
		num := "-"
		if n > 0 {
			num = strconv.Itoa(n)
		}
		rows = append(rows, fmt.Sprintf("| %s | %s | %s | %s | %s |", num, esc(i.Label), esc(i.Before), esc(i.After), statusText[i.Status]))
	}
	return strings.Join(rows, "\n") + "\n"
}

// ConfigJSON is the plan as `plan --json` prints it.
func ConfigJSON(items []ConfigItem) string {
	if items == nil {
		items = []ConfigItem{}
	}
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	enc.SetIndent("", "  ")
	_ = enc.Encode(items)
	return buf.String()
}

// ParseOnly turns `1,3` or `plugin,claude-md` into item ids in item order; "" is all of them.
func ParseOnly(value string, given bool) ([]string, error) {
	if !given {
		return ConfigItems, nil
	}
	var ids, unknown []string
	for _, s := range strings.Split(value, ",") {
		s = strings.TrimSpace(s)
		if s == "" {
			continue
		}
		if len(s) == 1 && s >= "1" && s <= "4" {
			n, _ := strconv.Atoi(s)
			s = ConfigItems[n-1]
		}
		ids = append(ids, s)
	}
	knowledge, skills := false, false
	for _, id := range ids {
		known := id == KnowledgeItem || id == SkillsItem
		knowledge = knowledge || id == KnowledgeItem
		skills = skills || id == SkillsItem
		for _, k := range ConfigItems {
			known = known || k == id
		}
		if !known {
			unknown = append(unknown, id)
		}
	}
	if len(ids) == 0 || len(unknown) > 0 {
		got := strings.Join(unknown, ", ")
		if got == "" {
			got = "nothing"
		}
		return nil, fmt.Errorf("--only takes items from 1 plugin, 2 memory, 3 claude-md, 4 rules (numbers or names, comma-separated), or knowledge (by name, with --project) or skills (by name); got %s", got)
	}
	var out []string
	for _, k := range ConfigItems {
		for _, id := range ids {
			if id == k {
				out = append(out, k)
				break
			}
		}
	}
	if knowledge {
		out = append(out, KnowledgeItem)
	}
	if skills {
		out = append(out, SkillsItem)
	}
	return out, nil
}

// ConfigDone is what apply did.
type ConfigDone struct {
	Backup  string // "" when nothing was changed
	Changed []string
	Manual  []string
}

func stamp(now time.Time) string {
	return now.UTC().Format("2006-01-02T15-04-05Z")
}

// newBackupDir makes a fresh <home>/.backup/<time>/ and returns it.
func newBackupDir(h string, now time.Time) (string, error) {
	backup := filepath.Join(h, ".backup", stamp(now))
	for n := 1; exists(backup); n++ {
		backup = filepath.Join(h, ".backup", fmt.Sprintf("%s-%d", stamp(now), n))
	}
	return backup, os.MkdirAll(backup, 0o755)
}

// ensureBackupIgnored puts `.backup/` in home's .gitignore: settings.json can hold secrets in env.
func ensureBackupIgnored(h string) error {
	ignorePath := filepath.Join(h, ".gitignore")
	ignore, _ := os.ReadFile(ignorePath)
	for _, l := range strings.Split(string(ignore), "\n") {
		if strings.TrimSpace(l) == ".backup/" {
			return nil
		}
	}
	text := string(ignore)
	if text != "" && !strings.HasSuffix(text, "\n") {
		text += "\n"
	}
	return os.WriteFile(ignorePath, []byte(text+".backup/\n"), 0o644)
}

// ApplyConfig does the selected items that are still to do.
func ApplyConfig(env Env, pluginRoot string, only []string, now time.Time) (ConfigDone, error) {
	h := Dir(env)
	agentsPath := filepath.Join(h, "AGENTS.md")
	if !exists(agentsPath) {
		return ConfigDone{}, fmt.Errorf("%s has no AGENTS.md: build home first (setup's first step); nothing was written", h)
	}
	items, err := PlanConfig(env, pluginRoot, only)
	if err != nil {
		return ConfigDone{}, err
	}
	var todo, manual []string
	for _, i := range items {
		switch i.Status {
		case "todo":
			todo = append(todo, i.ID)
		case "manual":
			manual = append(manual, i.ID)
		}
	}
	if len(todo) == 0 {
		return ConfigDone{Manual: manual}, nil
	}
	has := func(id string) bool {
		for _, t := range todo {
			if t == id {
				return true
			}
		}
		return false
	}

	settingsPath := filepath.Join(claudeDir(env), "settings.json")
	claudeMd := filepath.Join(claudeDir(env), "CLAUDE.md")
	settings, err := readSettings(settingsPath)
	if err != nil {
		return ConfigDone{}, err
	}
	var original []byte
	if st, _ := claudeMdState(claudeMd); st == "file" {
		original, _ = os.ReadFile(claudeMd)
	}

	// the backup comes first, and .backup/ must never reach git: settings.json can hold secrets in env
	backup, err := newBackupDir(h, now)
	if err != nil {
		return ConfigDone{}, err
	}
	if b, err := os.ReadFile(settingsPath); err == nil {
		if err := os.WriteFile(filepath.Join(backup, "settings.json"), b, 0o644); err != nil {
			return ConfigDone{}, err
		}
	}
	if original != nil {
		if err := os.WriteFile(filepath.Join(backup, "CLAUDE.md"), original, 0o644); err != nil {
			return ConfigDone{}, err
		}
	}
	if err := ensureBackupIgnored(h); err != nil {
		return ConfigDone{}, err
	}

	if has("plugin") || has("memory") {
		if has("plugin") {
			key, err := PluginKey(pluginRoot)
			if err != nil {
				return ConfigDone{}, err
			}
			ep := settings.data.get("enabledPlugins")
			if ep == nil {
				ep = newObject()
			}
			ep.set(key, jtrue)
			settings.data.set("enabledPlugins", ep)
		}
		if has("memory") {
			settings.data.set("autoMemoryDirectory", jstring(filepath.Join(h, "memory")))
		}
		text := settings.data.String(settings.indent)
		if settings.newline {
			text += "\n"
		}
		if err := os.MkdirAll(filepath.Dir(settingsPath), 0o755); err != nil {
			return ConfigDone{}, err
		}
		if err := os.WriteFile(settingsPath, []byte(text), 0o644); err != nil {
			return ConfigDone{}, err
		}
	}

	if has("claude-md") {
		if original != nil {
			cur, err := os.ReadFile(agentsPath)
			if err != nil {
				return ConfigDone{}, err
			}
			if err := os.WriteFile(agentsPath, []byte(MergeAgents(string(cur), string(original))), 0o644); err != nil {
				return ConfigDone{}, err
			}
		}
		// link beside the file and rename over it, so CLAUDE.md is never missing half-way
		if err := os.MkdirAll(claudeDir(env), 0o755); err != nil {
			return ConfigDone{}, err
		}
		tmp := claudeMd + ".tmp-" + strconv.Itoa(os.Getpid())
		_ = os.Remove(tmp)
		if err := os.Symlink(agentsPath, tmp); err != nil {
			return ConfigDone{}, err
		}
		if err := os.Rename(tmp, claudeMd); err != nil {
			return ConfigDone{}, err
		}
	}
	if has("rules") {
		rules, err := readRules(pluginRoot)
		if err != nil {
			return ConfigDone{}, err
		}
		cur, err := os.ReadFile(agentsPath)
		if err != nil {
			return ConfigDone{}, err
		}
		next, err := ApplyRules(string(cur), rules)
		if err != nil {
			return ConfigDone{}, err
		}
		if next != string(cur) {
			if err := os.WriteFile(agentsPath, []byte(next), 0o644); err != nil {
				return ConfigDone{}, err
			}
		}
	}
	return ConfigDone{Backup: backup, Changed: todo, Manual: manual}, nil
}
