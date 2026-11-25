package runtime_test

// The injection the SessionStart hook runs, the capability a session fetches with `show`, and the command tree.
// Which environment a session is in, and where its description is found, is envs_test.go. The descriptions here
// are written by the tests: the plugin carries none, only the capability list and the template.

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/registry"
	rt "github.com/guohaonan-shy/harold-skills/dyna/internal/runtime"
)

// noHome is a home that does not exist, so a description on the machine running the tests cannot leak in; noUser
// is the same for the user's root directory (it is under HOME).
const (
	noHome = "/nonexistent-dyna-test-home"
	noUser = "/nonexistent-dyna-test-user"
)

// env is what dyna reads: the real plugin directory (for the capability list), no home, no user root directory.
func env(kv ...string) map[string]string {
	m := map[string]string{rt.EnvPluginRoot: pluginRoot(), "IDEA_LOOP_HOME": noHome, "HOME": noUser}
	for i := 0; i+1 < len(kv); i += 2 {
		m[kv[i]] = kv[i+1]
	}
	return m
}

func TestWithNoDescriptionAnywhereTheEnvironmentCannotBeTold(t *testing.T) {
	r := dyna(env(), "runtime", "name")
	if r.code != 1 || r.stdout != "" || !strings.Contains(r.stderr, "认不出运行环境") || !strings.Contains(r.stderr, "/idea-loop:setup") {
		t.Fatalf("%+v", r)
	}
}

func TestInjectWithASectionItDoesNotKnowExitsNonZeroAndPrintsNothing(t *testing.T) {
	r := dyna(env(), "runtime", "inject", "nope")
	if r.code != 1 || r.stdout != "" || !strings.Contains(r.stderr, "nope") {
		t.Fatal(r)
	}
	if r := dyna(env(), "runtime", "inject"); r.code != 1 || r.stdout != "" {
		t.Fatalf("no section: %+v", r)
	}
}

func TestInjectWithoutAPluginDirectoryStopsAndSaysWhich(t *testing.T) {
	r := dyna(nil, "runtime", "inject", "runtime")
	if r.code != 1 || r.stdout != "" || !strings.Contains(r.stderr, rt.EnvPluginRoot) {
		t.Fatal(r)
	}
	if r := dyna(map[string]string{rt.EnvPluginRoot: t.TempDir()}, "runtime", "inject", "runtime"); r.code != 1 || r.stdout != "" || !strings.Contains(r.stderr, "读不到运行环境的数据") {
		t.Fatalf("a plugin directory without the data: %+v", r)
	}
}

// The limit Claude Code puts on one hook's output; past it the session keeps only a 2,000-character preview.
const hookOutputLimit = 10000

func TestTwoSectionsEachUnderTheHookLimitInOrderRuntimeReference(t *testing.T) {
	h := homeWith(t, map[string]string{"zed.md": zedDoc})
	var got [2]string
	for i, section := range rt.Sections {
		r := dyna(env("IDEA_LOOP_HOME", h, "ZED_SESSION", "1"), "runtime", "inject", section)
		if r.code != 0 {
			t.Fatalf("%s: %s", section, r.stderr)
		}
		if n := len([]rune(r.stdout)); n == 0 || n >= hookOutputLimit {
			t.Fatalf("%s: section length %d", section, n)
		}
		if strings.Contains(r.stdout, "${CLAUDE_PLUGIN_ROOT}") {
			t.Fatalf("%s: the placeholder is expanded to the real plugin path", section)
		}
		got[i] = r.stdout
	}
	runtime, reference := got[0], got[1]

	// runtime: first line is the runtime, then the header, then the body
	lines := strings.Split(runtime, "\n")
	if lines[0] != "当前运行环境：zed" {
		t.Errorf("first line: %s", lines[0])
	}
	if !strings.HasPrefix(lines[1], "以下是运行环境的能力清单，开场注入，不必再取") {
		t.Errorf("second line: %s", lines[1])
	}
	if !strings.Contains(runtime, "## 能力清单") || strings.Contains(runtime, "\nname: ") {
		t.Error("runtime: the capability list, no frontmatter")
	}

	// reference: the whole description of this environment
	if !strings.HasPrefix(reference, "以下是运行环境「zed」的做法全文，开场注入，不必再取。\n\n") {
		t.Errorf("reference header: %s", strings.SplitN(reference, "\n", 2)[0])
	}
	if !strings.Contains(reference, strings.TrimSpace(zedDoc)) {
		t.Error("reference: the whole file of this environment")
	}
}

func TestACapabilityListAndNoDescriptionStillInjectsTheListAndSaysSoOnTheFirstLine(t *testing.T) {
	r := dyna(env(), "runtime", "inject", "runtime")
	if r.code != 0 {
		t.Fatalf("%+v", r)
	}
	if firstLine(r.stdout) != "当前运行环境：没有（跑 /idea-loop:setup）" {
		t.Errorf("first line: %q", firstLine(r.stdout))
	}
	if !strings.Contains(r.stdout, "## 能力清单") || !strings.Contains(r.stdout, "## 退路") {
		t.Error("the capability list and the fallbacks are still there")
	}
	ref := dyna(env(), "runtime", "inject", "reference")
	if ref.code != 0 || ref.stdout != "没有运行环境说明，跑 `/idea-loop:setup`\n" {
		t.Fatalf("%+v", ref)
	}
}

func TestTheInjectedRuntimeTextNamesNeitherTheOldSkillNorTheOldScript(t *testing.T) {
	r := dyna(env(), "runtime", "inject", "runtime")
	// the skill is gone: nothing in the injected text sends the session to it or to the old detect script
	for _, bad := range []string{"idea-loop:runtime", "idea-loop:browser", "runtime-detect.mjs", "${CLAUDE_PLUGIN_ROOT}"} {
		if strings.Contains(r.stdout, bad) {
			t.Fatalf("the runtime body still names %q", bad)
		}
	}
	if !strings.Contains(r.stdout, "dyna runtime show") {
		t.Fatal("the runtime body says how a sub-agent fetches a capability")
	}
}

// The runtime and browser skills are deleted and their content lives in the data: nothing in the plugin's data
// points back at them, at SKILL.md, or at an old script (the lock is `dyna ui lock …`, the dispatch bookkeeping
// `dyna runtime record`).
func TestTheDataPointsAtNoDeletedSkillAndNoOldScript(t *testing.T) {
	entries, err := os.ReadDir(filepath.Join(pluginRoot(), rt.DataDir))
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range entries {
		text := readFile(t, filepath.Join(pluginRoot(), rt.DataDir, e.Name()))
		for _, bad := range []string{"idea-loop:runtime", "idea-loop:browser", "SKILL.md", ".mjs", "${CLAUDE_PLUGIN_ROOT}/scripts", "## 怎么用", "## 检测规则", "## 加一种运行环境"} {
			if strings.Contains(text, bad) {
				t.Errorf("%s still has %q", e.Name(), bad)
			}
		}
	}
}

func TestForcedUnknownNameFailsBothRuntimeSections(t *testing.T) {
	e := env(rt.EnvRuntime, "foo")
	for _, section := range []string{"runtime", "reference"} {
		r := dyna(e, "runtime", "inject", section)
		if r.code == 0 || r.stdout != "" || !strings.Contains(r.stderr, "foo") {
			t.Fatalf("%s: %+v", section, r)
		}
	}
}

// The user's rules (home's fixed text) are loaded by the host from ~/.claude/CLAUDE.md; the plugin no longer
// injects a skill body of its own, so the old section name is an error like any other unknown one.
func TestInjectKnowsOnlyRuntimeAndReference(t *testing.T) {
	if !reflect.DeepEqual(rt.Sections, []string{"runtime", "reference"}) {
		t.Fatal(rt.Sections)
	}
	old := "decision" + "-rules" // the removed section's name, written apart so the plugin carries no mention of it
	r := dyna(env(), "runtime", "inject", old)
	if r.code == 0 || r.stdout != "" || !strings.Contains(r.stderr, "unknown section "+old) || !strings.Contains(r.stderr, "runtime, reference") {
		t.Fatalf("%+v", r)
	}
}

func TestForcedNameForcesTheReferenceToo(t *testing.T) {
	h := homeWith(t, map[string]string{"zed.md": zedDoc, "plain.md": noMarkerDoc, "desk.md": deskDoc})
	e := env("IDEA_LOOP_HOME", h, rt.EnvRuntime, "zed")
	if r := dyna(e, "runtime", "inject", "runtime"); firstLine(r.stdout) != "当前运行环境：zed" {
		t.Fatal(r.stdout)
	}
	if r := dyna(e, "runtime", "inject", "reference"); !strings.Contains(r.stdout, "zed 的推送做法") || strings.Contains(r.stdout, "desk") {
		t.Fatal(r.stdout)
	}
}

func TestAPluginDirectoryReachedThroughASymlinkStillInjects(t *testing.T) {
	link := filepath.Join(t.TempDir(), "idea-loop")
	if err := os.Symlink(pluginRoot(), link); err != nil {
		t.Skip(err)
	}
	for _, section := range rt.Sections {
		r := dyna(map[string]string{rt.EnvPluginRoot: link, "IDEA_LOOP_HOME": noHome, "HOME": noUser}, "runtime", "inject", section)
		if r.code != 0 || !strings.Contains(r.stdout, "开场注入") && !strings.Contains(r.stdout, "没有运行环境说明") {
			t.Fatalf("%s: %+v", section, r)
		}
	}
}

// ---- the capability list ----

func capabilities(t *testing.T) []string {
	t.Helper()
	p := rt.Plugin{Root: pluginRoot()}
	caps, err := p.Capabilities()
	if err != nil {
		t.Fatal(err)
	}
	return caps
}

func TestTheCapabilityListIsTheClosedSetOfEleven(t *testing.T) {
	want := "定时任务 会话内循环 会话管理 浏览器 人的浏览器 向人提问 发布审阅页 推送 发文件给人 调用 MCP 装与设置"
	if got := strings.Join(capabilities(t), " "); got != want {
		t.Fatal(got)
	}
}

func TestShowPrintsTheSectionOfTheEnvironmentsDescriptionAndNoOtherSection(t *testing.T) {
	h := homeWith(t, map[string]string{"desk.md": deskDoc})
	r := dyna(env("IDEA_LOOP_HOME", h, rt.EnvRuntime, "desk"), "runtime", "show", "浏览器")
	want := "## 浏览器\n\n### 给人看\n\ndesk 的浏览器做法\n\n### 无头\n\ndesk 无头\n"
	if r.code != 0 || r.stdout != want {
		t.Fatalf("%+v want %q", r, want)
	}
}

func TestShowFollowsTheDetectionRulesAndHonoursAnUnknownForcedName(t *testing.T) {
	h := homeWith(t, map[string]string{"zed.md": zedDoc})
	if r := dyna(env("IDEA_LOOP_HOME", h, "ZED_SESSION", "x"), "runtime", "show", "推送"); r.code != 0 || !strings.Contains(r.stdout, "zed 的推送做法") {
		t.Fatalf("a zed session: %+v", r)
	}
	r := dyna(env("IDEA_LOOP_HOME", h, rt.EnvRuntime, "foo"), "runtime", "show", "推送")
	if r.code != 1 || r.stdout != "" || !strings.Contains(r.stderr, "foo") {
		t.Fatalf("unknown forced name: %+v", r)
	}
}

func TestShowOfACapabilityWhenTheEnvironmentCannotBeToldIsAnErrorThatPointsAtSetup(t *testing.T) {
	r := dyna(env(), "runtime", "show", "推送")
	if r.code != 1 || r.stdout != "" || !strings.Contains(r.stderr, "认不出运行环境") || !strings.Contains(r.stderr, "/idea-loop:setup") {
		t.Fatalf("%+v", r)
	}
}

func TestShowWithAnUnknownCapabilityListsTheKnownOnes(t *testing.T) {
	r := dyna(env(), "runtime", "show", "飞天")
	if r.code != 1 || r.stdout != "" {
		t.Fatal(r)
	}
	for _, want := range []string{"飞天", "定时任务", "装与设置"} {
		if !strings.Contains(r.stderr, want) {
			t.Errorf("stderr lacks %q: %s", want, r.stderr)
		}
	}
	if r := dyna(env(), "runtime", "show", "浏览器", "推送"); r.code != 1 {
		t.Fatalf("two capabilities: %+v", r)
	}
}

func TestShowWithNoCapabilityPrintsTheCapabilityListAndTheFallbacksWhateverTheEnvironment(t *testing.T) {
	// the list does not depend on the environment, so no description and a bad forced name do not stop it
	for _, e := range []map[string]string{env(), env(rt.EnvRuntime, "foo")} {
		r := dyna(e, "runtime", "show")
		if r.code != 0 {
			t.Fatal(r)
		}
		for _, want := range []string{"## 能力清单", "| 浏览器 |", "## 退路", "例外一", "改在对话里问"} {
			if !strings.Contains(r.stdout, want) {
				t.Errorf("lacks %q", want)
			}
		}
		if strings.Contains(r.stdout, "## 怎么用") || strings.Contains(r.stdout, "## 浏览器") {
			t.Error("the list and the fallbacks only")
		}
	}
}

// A small plugin and home of the same shape, to pin how `show` cuts a section: from its heading to the next `## `,
// its `###` subsections inside, lines in a code fence never headings; and the plugin path spelled out.
func TestShowCutsASectionAtTheNextTopLevelHeading(t *testing.T) {
	root := t.TempDir()
	writeFile(t, filepath.Join(root, "runtime", "capabilities.md"), "说明\n\n## 能力清单\n\n| 能力 | 做什么 |\n|---|---|\n| 甲 | x |\n| 乙 | y |\n\n## 退路\n\n交给人。\n")
	h := homeWith(t, map[string]string{"desk.md": "# desk\n\n标记：没有\n\n## 甲\n\n甲的正文\n\n### 子节\n\n```\n## 不是标题\n```\n\n## 乙\n\n乙的正文，路径 ${CLAUDE_PLUGIN_ROOT}/x\n"})
	e := map[string]string{rt.EnvPluginRoot: root, "IDEA_LOOP_HOME": h, "HOME": noUser, rt.EnvRuntime: "desk"}
	r := dyna(e, "runtime", "show", "甲")
	want := "## 甲\n\n甲的正文\n\n### 子节\n\n```\n## 不是标题\n```\n"
	if r.code != 0 || r.stdout != want {
		t.Fatalf("%+v want %q", r, want)
	}
	if r := dyna(e, "runtime", "show", "乙"); r.stdout != "## 乙\n\n乙的正文，路径 "+root+"/x\n" {
		t.Fatalf("%+v", r)
	}
	// a description that lacks a capability's section says so
	writeFile(t, filepath.Join(h, "runtime", "short.md"), "标记：没有\n\n## 甲\n\nm\n")
	e[rt.EnvRuntime] = "short"
	r = dyna(e, "runtime", "show", "乙")
	if r.code != 1 || !strings.Contains(r.stderr, "没有「乙」一节") || !strings.Contains(r.stderr, "short") {
		t.Fatalf("%+v", r)
	}
}

// ---- the command tree ----

func TestTheModulesCommandsAreInTheRegistryWithTheRightCallers(t *testing.T) {
	r := dyna(nil, "registry", "--json")
	if r.code != 0 {
		t.Fatal(r.stderr)
	}
	var reg registry.Registry
	if err := json.Unmarshal([]byte(r.stdout), &reg); err != nil {
		t.Fatal(err)
	}
	want := map[string]string{
		"runtime name":   registry.CallerSession,
		"runtime show":   registry.CallerSession,
		"runtime record": registry.CallerSession,
		"runtime check":  registry.CallerSession,
		"runtime inject": registry.CallerHook, // only the SessionStart hook runs it
	}
	for name, caller := range want {
		c, ok := reg.Find(name)
		if !ok {
			t.Errorf("%s is not in the registry", name)
			continue
		}
		if c.Caller != caller {
			t.Errorf("%s: caller %q, want %q", name, c.Caller, caller)
		}
		if c.Module != "runtime" || c.Summary == "" {
			t.Errorf("%s: %+v", name, c)
		}
	}
	for _, c := range reg.Commands {
		if c.Module == "runtime" {
			if _, ok := want[c.Command]; !ok {
				t.Errorf("%s is in the registry but not in this test", c.Command)
			}
			if strings.Contains(c.Command+c.Use+c.Summary, ".mjs") {
				t.Errorf("%s: the old script's name does not appear in a command", c.Command)
			}
		}
	}
	record, _ := reg.Find("runtime record")
	var flags []string
	for _, a := range record.Args {
		flags = append(flags, a.Name)
	}
	if strings.Join(flags, ",") != "dir,issue,period,repo,session" {
		t.Errorf("record flags: %v", flags)
	}
}

func TestHelpSaysWhereDescriptionsLiveAndHowToAddAnEnvironment(t *testing.T) {
	r := dyna(env(), "runtime", "--help")
	if r.code != 0 {
		t.Fatal(r)
	}
	for _, want := range []string{"加一种运行环境", "主 checkout", ".idea-loop/runtime/<名>.md", "<home>/runtime/<名>.md", "~/.idea-loop/runtime/<名>.md", "整份生效", "不合并", "capabilities.md", "标记", "selected", "IDEA_LOOP_RUNTIME", "认不出", "/idea-loop:setup", "runtime check", "能力模板", "不带「能力模板」一节"} {
		if !strings.Contains(r.stdout, want) {
			t.Errorf("--help lacks %q", want)
		}
	}
	for _, gone := range []string{"本机覆盖", "只升插件", "随插件发给所有人", "注入它的全文", "claude-desktop", "magi"} {
		if strings.Contains(r.stdout, gone) {
			t.Errorf("--help still says %q", gone)
		}
	}
	bare := dyna(env(), "runtime")
	if bare.code != 0 || !strings.Contains(bare.stdout, "record") || strings.Contains(bare.stdout, "handoff") {
		t.Fatalf("a bare module prints its commands: %+v", bare)
	}
}
