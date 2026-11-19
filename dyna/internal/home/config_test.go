package home_test

import (
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/home"
)

// Ported from idea-loop/scripts/home-config.test.mjs (`home config plan` / `apply`). Every test runs under a
// temporary HOME, so the machine's real ~/.claude and ~/home are never touched.

const (
	claudeMD  = "# 我的规矩\n\n- 用中文回复\n- 先说结论\n\n## 沟通\n\n别用缩写。\n"
	homeAgent = "# AGENTS\n\n## 设备地图\n\n去 projects/ 查项目事实。\n\n## 项目\n\n- example-app（示例）: ~/code/example-app. Clone from https://example.test/acme/example-app if missing.\n"
	key       = "idea-loop@test-market"
)

var baseSettings = `{
  "env": { "SOME_TOKEN": "secret-value", "OTHER": "1" },
  "enabledPlugins": { "other@somewhere": true, "off@somewhere": false },
  "model": "opus",
  "permissions": { "allow": ["Bash(ls:*)"] }
}
`

type rigT struct {
	world
	HOME, claude, settings, claudeMd, plugin string
}

type rigOpts struct {
	settings *string // nil: the base one; pointer to "" : no file
	claudeMd *string // nil: the base one; pointer to "": no file
	homeDir  string
}

func ptr(s string) *string { return &s }

func newRig(t *testing.T, o rigOpts) rigT {
	t.Helper()
	root := realDir(t)
	user := filepath.Join(root, "user")
	dir := o.homeDir
	if dir == "" {
		dir = "home"
	}
	r := rigT{HOME: user, claude: filepath.Join(user, ".claude")}
	r.world = world{root: root, home: filepath.Join(user, dir), code: root}
	r.settings = filepath.Join(r.claude, "settings.json")
	r.claudeMd = filepath.Join(r.claude, "CLAUDE.md")
	r.plugin = filepath.Join(root, ".claude", "plugins", "cache", "test-market", "idea-loop", "1.0.0")
	write(t, r.plugin, ".claude-plugin/plugin.json", `{"name":"idea-loop"}`)
	if o.settings == nil || *o.settings != "" {
		s := baseSettings
		if o.settings != nil {
			s = *o.settings
		}
		write(t, r.claude, "settings.json", s)
	} else if err := os.MkdirAll(r.claude, 0o755); err != nil {
		t.Fatal(err)
	}
	if o.claudeMd == nil || *o.claudeMd != "" {
		c := claudeMD
		if o.claudeMd != nil {
			c = *o.claudeMd
		}
		write(t, r.claude, "CLAUDE.md", c)
	}
	write(t, r.home, "AGENTS.md", homeAgent)
	gitIn(t, r.home, "init", "-q", "-b", "main")
	gitIn(t, r.home, "add", "-A")
	gitIn(t, r.home, "commit", "-q", "-m", "init")
	return r
}

func (r rigT) cfg(args ...string) result {
	return r.cfgWith(nil, args...)
}

func (r rigT) cfgWith(extra map[string]string, args ...string) result {
	vars := map[string]string{"HOME": r.HOME, "IDEA_LOOP_HOME": r.home, "IDEA_LOOP_PLUGIN_ROOT": r.plugin}
	for k, v := range extra {
		vars[k] = v
	}
	return r.world.runWith(r.root, "", vars, append([]string{"home", "config"}, args...)...)
}

// snapshot is every file and symlink under dir (not .git), as path → content or `link:<target>`.
func snapshot(t *testing.T, dir string) map[string]string {
	t.Helper()
	out := map[string]string{}
	_ = filepath.WalkDir(dir, func(p string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() && d.Name() == ".git" {
			return filepath.SkipDir
		}
		rel, _ := filepath.Rel(dir, p)
		switch {
		case d.Type()&os.ModeSymlink != 0:
			target, _ := os.Readlink(p)
			out[rel] = "link:" + target
		case d.IsDir():
			out[rel+"/"] = "dir"
		default:
			b, _ := os.ReadFile(p)
			out[rel] = string(b)
		}
		return nil
	})
	return out
}

func backups(t *testing.T, r rigT) []string {
	entries, err := os.ReadDir(filepath.Join(r.home, ".backup"))
	if err != nil {
		return nil
	}
	var out []string
	for _, e := range entries {
		out = append(out, e.Name())
	}
	return out
}

func settingsOf(t *testing.T, r rigT) map[string]any {
	var m map[string]any
	if err := json.Unmarshal([]byte(readFile(t, r.settings)), &m); err != nil {
		t.Fatal(err)
	}
	return m
}

func isLink(p string) bool {
	st, err := os.Lstat(p)
	return err == nil && st.Mode()&os.ModeSymlink != 0
}

func TestConfigPlanListsBeforeAndAfterAndWritesNothing(t *testing.T) { // "plan lists before and after for the three places and writes nothing"
	r := newRig(t, rigOpts{})
	before := snapshot(t, r.root)
	res := r.cfg("plan").ok(t)
	for _, want := range []string{key, "autoMemoryDirectory", filepath.Join(r.home, "memory"), filepath.Join(r.home, "AGENTS.md")} {
		if !strings.Contains(res.out, want) {
			t.Errorf("plan lacks %q:\n%s", want, res.out)
		}
	}
	if !reflect.DeepEqual(snapshot(t, r.root), before) {
		t.Fatal("plan wrote something")
	}
}

func TestConfigApplyBacksUpSettingsAndClaudeMdByteForByte(t *testing.T) { // "apply backs up settings.json and CLAUDE.md byte for byte…"
	r := newRig(t, rigOpts{})
	r.cfg("apply").ok(t)
	dirs := backups(t, r)
	if len(dirs) != 1 || dirs[0] != "2026-11-19T10-20-30Z" {
		t.Fatal(dirs)
	}
	if readFile(t, filepath.Join(r.home, ".backup", dirs[0], "settings.json")) != baseSettings || readFile(t, filepath.Join(r.home, ".backup", dirs[0], "CLAUDE.md")) != claudeMD {
		t.Fatal("the backup is not the original")
	}
}

func TestConfigApplyChangesSettingsByTwoKeysOnly(t *testing.T) { // "apply changes settings.json by two keys only…"
	r := newRig(t, rigOpts{})
	r.cfg("apply").ok(t)
	var want map[string]any
	if err := json.Unmarshal([]byte(baseSettings), &want); err != nil {
		t.Fatal(err)
	}
	want["enabledPlugins"].(map[string]any)[key] = true
	want["autoMemoryDirectory"] = filepath.Join(r.home, "memory")
	if got := settingsOf(t, r); !reflect.DeepEqual(got, want) {
		t.Fatalf("%v", got)
	}
}

func TestConfigApplyKeepsTheKeyOrderOfSettingsAndAddsNewKeysAtTheEnd(t *testing.T) { // not in the old tests: JS kept insertion order, so does this
	r := newRig(t, rigOpts{})
	r.cfg("apply").ok(t)
	text := readFile(t, r.settings)
	order := []string{`"env"`, `"enabledPlugins"`, `"model"`, `"permissions"`, `"autoMemoryDirectory"`}
	last := -1
	for _, k := range order {
		i := strings.Index(text, k)
		if i <= last {
			t.Fatalf("%s out of order in:\n%s", k, text)
		}
		last = i
	}
	if strings.Index(text, `"off@somewhere"`) > strings.Index(text, `"`+key+`"`) {
		t.Fatal("the new plugin key is appended after the existing ones")
	}
}

func TestConfigApplyTurnsClaudeMdIntoALinkAndMovesItsTextBeforeBothIdeaLoopSections(t *testing.T) { // "apply turns CLAUDE.md into a symlink…"
	r := newRig(t, rigOpts{})
	r.cfg("apply").ok(t)
	if !isLink(r.claudeMd) {
		t.Fatal("not a link")
	}
	if target, _ := os.Readlink(r.claudeMd); target != filepath.Join(r.home, "AGENTS.md") {
		t.Fatal(target)
	}
	agents := readFile(t, filepath.Join(r.home, "AGENTS.md"))
	rest := homeAgent[strings.Index(homeAgent, "## 设备地图"):]
	if !strings.Contains(agents, claudeMD) || !strings.HasSuffix(agents, rest) || strings.Index(agents, claudeMD) > strings.Index(agents, "## 设备地图") {
		t.Fatalf("%s", agents)
	}
	if readFile(t, r.claudeMd) != agents {
		t.Fatal("reading the link gives the home file")
	}
}

func TestConfigApplyMakesHomeIgnoreItsBackups(t *testing.T) { // "home .gitignore ignores .backup/…", "an existing .gitignore keeps its lines…"
	r := newRig(t, rigOpts{})
	r.cfg("apply").ok(t)
	if !strings.Contains("\n"+readFile(t, filepath.Join(r.home, ".gitignore")), "\n.backup/\n") {
		t.Fatal("no .backup/ line")
	}
	status := gitIn(t, r.home, "status", "--porcelain", "-uall")
	if strings.Contains(status, ".backup") || !strings.Contains(status, "AGENTS.md") {
		t.Fatal(status)
	}
	r = newRig(t, rigOpts{})
	write(t, r.home, ".gitignore", "node_modules/\n")
	r.cfg("apply").ok(t)
	if got := readFile(t, filepath.Join(r.home, ".gitignore")); got != "node_modules/\n.backup/\n" {
		t.Fatal(got)
	}
}

func TestConfigApplyAgainChangesNoFileAndMakesNoBackup(t *testing.T) { // "running apply again…"
	r := newRig(t, rigOpts{})
	r.cfg("apply").ok(t)
	before := snapshot(t, r.root)
	if got := strings.Count(r.cfg("plan").ok(t).out, "已是"); got != 3 {
		t.Fatalf("plan says 已是 %d times", got)
	}
	again := r.cfg("apply").ok(t)
	if !strings.Contains(again.out, "没有要改的项") || !reflect.DeepEqual(snapshot(t, r.root), before) || len(backups(t, r)) != 1 {
		t.Fatal("not a no-op")
	}
}

func TestConfigOnlyItemsOneAndThree(t *testing.T) { // "only items 1 and 3…", "the second run of a subset…"
	r := newRig(t, rigOpts{})
	if plan := r.cfg("plan", "--only", "1,3").ok(t); strings.Contains(plan.out, "autoMemoryDirectory") {
		t.Fatal(plan.out)
	}
	r.cfg("apply", "--only", "1,3").ok(t)
	got := settingsOf(t, r)
	if got["enabledPlugins"].(map[string]any)[key] != true || got["autoMemoryDirectory"] != nil || !isLink(r.claudeMd) {
		t.Fatalf("%v", got)
	}
	before := snapshot(t, r.root)
	if n := strings.Count(r.cfg("plan", "--only", "1,3").ok(t).out, "已是"); n != 2 {
		t.Fatal(n)
	}
	r.cfg("apply", "--only", "1,3").ok(t)
	if !reflect.DeepEqual(snapshot(t, r.root), before) {
		t.Fatal("the second run of a subset changed something")
	}
	r.cfg("apply", "--only", "2").ok(t)
	if settingsOf(t, r)["autoMemoryDirectory"] != filepath.Join(r.home, "memory") {
		t.Fatal("the left-out item did not go through later")
	}
}

func TestConfigClaudeMdLinkedElsewhereIsLeftForAHuman(t *testing.T) { // "CLAUDE.md already a symlink somewhere else…"
	r := newRig(t, rigOpts{claudeMd: ptr("")})
	elsewhere := filepath.Join(r.root, "elsewhere.md")
	write(t, r.root, "elsewhere.md", "not ours\n")
	if err := os.Symlink(elsewhere, r.claudeMd); err != nil {
		t.Fatal(err)
	}
	if plan := r.cfg("plan").ok(t); !strings.Contains(plan.out, "已是别处的软链，要人处理") {
		t.Fatal(plan.out)
	}
	agentsBefore := readFile(t, filepath.Join(r.home, "AGENTS.md"))
	res := r.cfg("apply").ok(t)
	if target, _ := os.Readlink(r.claudeMd); target != elsewhere || readFile(t, elsewhere) != "not ours\n" || readFile(t, filepath.Join(r.home, "AGENTS.md")) != agentsBefore {
		t.Fatal("touched what is not ours")
	}
	if settingsOf(t, r)["enabledPlugins"].(map[string]any)[key] != true || !strings.Contains(res.out, "要人处理") {
		t.Fatal("the other two still go ahead, and the output says what is left:", res.out)
	}
}

func TestConfigWithNoClaudeMdTheLinkIsCreatedAndAgentsIsUntouched(t *testing.T) { // "no CLAUDE.md at all…"
	r := newRig(t, rigOpts{claudeMd: ptr("")})
	r.cfg("apply").ok(t)
	if !isLink(r.claudeMd) || readFile(t, filepath.Join(r.home, "AGENTS.md")) != homeAgent {
		t.Fatal("link or AGENTS.md")
	}
	if _, err := os.Stat(filepath.Join(r.home, ".backup", backups(t, r)[0], "CLAUDE.md")); err == nil {
		t.Fatal("nothing to back up")
	}
}

func TestConfigValuesAlreadyInPlaceNeedNoChangeAndNoBackup(t *testing.T) { // "values already in place are 已是…"
	r := newRig(t, rigOpts{})
	s := strings.Replace(baseSettings, `"off@somewhere": false`, `"off@somewhere": false, "`+key+`": true`, 1)
	s = strings.Replace(s, `"model": "opus",`, `"model": "opus", "autoMemoryDirectory": "`+filepath.Join(r.home, "memory")+`",`, 1)
	write(t, r.claude, "settings.json", s)
	var plan []home.ConfigItem
	if err := json.Unmarshal([]byte(r.cfg("plan", "--json").ok(t).out), &plan); err != nil {
		t.Fatal(err)
	}
	if plan[0].Status != "already" || plan[1].Status != "already" || plan[2].Status != "todo" {
		t.Fatalf("%+v", plan)
	}
	r.cfg("apply", "--only", "1,2").ok(t)
	if len(backups(t, r)) != 0 {
		t.Fatal("a backup was made for nothing")
	}
}

func TestConfigIdeaLoopHomeMovesTheHomeButNotTheUserLevelConfig(t *testing.T) { // "IDEA_LOOP_HOME moves the home…"
	r := newRig(t, rigOpts{homeDir: "elsewhere-home"})
	r.cfg("apply").ok(t)
	if settingsOf(t, r)["autoMemoryDirectory"] != filepath.Join(r.home, "memory") || len(backups(t, r)) != 1 {
		t.Fatal("home or backup")
	}
	if _, err := os.Stat(filepath.Join(r.HOME, "home")); err == nil {
		t.Fatal("the default location was created")
	}
}

func TestConfigSettingsKeepIndentationAndTrailingNewline(t *testing.T) { // "settings.json keeps its indentation and trailing newline"
	r := newRig(t, rigOpts{settings: ptr("{\n    \"env\": {\n        \"A\": 1\n    },\n    \"model\": \"opus\"\n}")})
	r.cfg("apply").ok(t)
	text := readFile(t, r.settings)
	if !strings.Contains(text, "\n    \"env\"") || !strings.Contains(text, "\n        \"A\": 1") || strings.HasSuffix(text, "\n") {
		t.Fatalf("%q", text)
	}
}

func TestConfigPlanJSONHasOneRecordPerSelectedItemInItemOrder(t *testing.T) { // "--json on plan gives one record per selected item"
	r := newRig(t, rigOpts{})
	var plan []home.ConfigItem
	out := r.cfg("plan", "--json", "--only", "3,1").ok(t).out
	if err := json.Unmarshal([]byte(out), &plan); err != nil {
		t.Fatal(err)
	}
	if len(plan) != 2 || plan[0].ID != "plugin" || plan[1].ID != "claude-md" {
		t.Fatalf("%+v", plan)
	}
	for _, i := range plan {
		if i.Status != "todo" || i.Before == "" || i.After == "" {
			t.Fatalf("%+v", i)
		}
	}
	if !strings.HasPrefix(out, "[\n  {\n    \"id\": \"plugin\",\n    \"label\"") {
		t.Fatal("JSON.stringify shape:", out)
	}
}

func TestConfigRefusesWithoutWritingAnything(t *testing.T) { // "refuses without writing: home missing, unknown --only item, unparsable settings.json, unknown command"
	r := newRig(t, rigOpts{})
	before := snapshot(t, r.root)
	for _, args := range [][]string{{"apply", "--only", "4"}, {"bogus"}} {
		if res := r.cfg(args...); res.code != 1 || res.err == "" {
			t.Errorf("%v: %+v", args, res)
		}
	}
	nowhere := r.cfgWith(map[string]string{"HOME": filepath.Join(r.root, "nowhere"), "IDEA_LOOP_HOME": ""}, "apply")
	if nowhere.code != 1 || nowhere.err == "" {
		t.Errorf("home missing: %+v", nowhere)
	}
	if !reflect.DeepEqual(snapshot(t, r.root), before) {
		t.Fatal("a refusal wrote something")
	}
	write(t, r.claude, "settings.json", "{ not json")
	before = snapshot(t, r.root)
	if res := r.cfg("apply"); res.code != 1 || !reflect.DeepEqual(snapshot(t, r.root), before) {
		t.Fatalf("unparsable settings: %+v", res)
	}
}

func TestConfigWithoutAPluginRootSaysSo(t *testing.T) { // the plugin's own name came from the script's place; now it comes from the launcher
	r := newRig(t, rigOpts{})
	res := r.cfgWith(map[string]string{"IDEA_LOOP_PLUGIN_ROOT": ""}, "plan")
	if res.code != 1 || !strings.Contains(res.err, "IDEA_LOOP_PLUGIN_ROOT") {
		t.Fatalf("%+v", res)
	}
}

func TestPluginKeyIsReadOffTheInstallPathNeverHardCoded(t *testing.T) { // "pluginKey: <plugin>@<marketplace>…"
	root := realDir(t)
	at := func(parts ...string) string {
		dir := filepath.Join(append([]string{root}, parts...)...)
		write(t, dir, ".claude-plugin/plugin.json", `{"name":"widget"}`)
		return dir
	}
	for dir, want := range map[string]string{
		at(".claude", "plugins", "cache", "acme-market", "widget", "1.2.3"): "widget@acme-market",
		at(".claude", "plugins", "marketplaces", "acme-market", "widget"):   "widget@acme-market",
	} {
		if got, err := home.PluginKey(dir); err != nil || got != want {
			t.Errorf("%s → %q, %v", dir, got, err)
		}
	}
	checkout := at("checkout", "widget")
	write(t, root, "checkout/.claude-plugin/marketplace.json", `{"name":"checkout-market"}`)
	if got, err := home.PluginKey(checkout); err != nil || got != "widget@checkout-market" {
		t.Errorf("a checkout: %q, %v", got, err)
	}
	if _, err := home.PluginKey(at("loose", "widget")); err == nil || !strings.Contains(err.Error(), "marketplace") {
		t.Errorf("nothing says which marketplace: %v", err)
	}
}

func TestMergeAgentsPutsTheTextBeforeTheFirstIdeaLoopSectionOnce(t *testing.T) { // "mergeAgents: …"
	merged := home.MergeAgents(homeAgent, claudeMD)
	if want := "# AGENTS\n\n" + claudeMD + "\n" + homeAgent[strings.Index(homeAgent, "## 设备地图"):]; merged != want {
		t.Fatalf("%q", merged)
	}
	if home.MergeAgents(merged, claudeMD) != merged {
		t.Fatal("added twice")
	}
	if got := home.MergeAgents("# AGENTS\n", claudeMD); got != "# AGENTS\n\n"+claudeMD {
		t.Fatalf("%q", got)
	}
	if home.MergeAgents(homeAgent, "") != homeAgent {
		t.Fatal("empty text")
	}
}

func TestConfigPlanAndJSONAreTheOldScriptsOutput(t *testing.T) { // the old script and dyna print the same plan for the same machine
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node is needed to run the old script")
	}
	r := newRig(t, rigOpts{})
	// the old script finds its plugin name from where it lives: run a copy of it inside a fake plugin directory
	scripts := filepath.Join(r.plugin, "scripts")
	oldScript := filepath.Join("..", "..", "..", "idea-loop", "scripts", "home-config.mjs")
	write(t, scripts, "home-config.mjs", readFile(t, oldScript))
	for _, args := range [][]string{{"plan"}, {"plan", "--json"}, {"plan", "--only", "3,1"}} {
		cmd := exec.Command(node, append([]string{filepath.Join(scripts, "home-config.mjs")}, args...)...)
		cmd.Env = []string{"PATH=" + os.Getenv("PATH"), "HOME=" + r.HOME, "IDEA_LOOP_HOME=" + r.home}
		old, err := cmd.Output()
		if err != nil {
			t.Fatalf("%v: %v", args, err)
		}
		if got := r.cfg(args...).ok(t).out; got != string(old) {
			t.Errorf("%v:\nold:\n%s\ndyna:\n%s", args, old, got)
		}
	}
}
