package runtime_test

// Ported from the old scripts' behavior tests: runtime-detect.test.mjs (which environment this is) and
// session-start-inject.test.mjs (the sections the SessionStart hook injects). What was not ported, and why:
//   - "hooks.json registers three SessionStart commands that run runtime-detect.mjs --inject" and "SessionStart has
//     no matcher" / "three commands, the project map beside them": they read hooks.json, whose rewrite to
//     `dyna runtime inject …` is ticket 15; the registry test below checks the other half (inject is hook-only).
//   - "the plugin reached through a symlinked path still injects": that was about a Node script mistaking itself for
//     an import; dyna has no such check, and the test below only keeps the part that matters (a symlinked plugin
//     directory reads fine).

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

// noHome is a home that does not exist, so a local override on the machine running the tests cannot leak in.
const noHome = "/nonexistent-dyna-test-home"

func env(kv ...string) map[string]string {
	m := map[string]string{rt.EnvPluginRoot: pluginRoot(), "IDEA_LOOP_HOME": noHome}
	for i := 0; i+1 < len(kv); i += 2 {
		m[kv[i]] = kv[i+1]
	}
	return m
}

func TestNoVariableSetIsClaudeDesktop(t *testing.T) {
	r := dyna(env(), "runtime", "name")
	if r.code != 0 || r.stdout != "claude-desktop\n" {
		t.Fatal(r)
	}
}

func TestMagiSessionIDMeansMagi(t *testing.T) {
	r := dyna(env(envMagiSession, "abc"), "runtime", "name")
	if r.code != 0 || r.stdout != "magi\n" {
		t.Fatal(r)
	}
}

func TestForcedKnownNameWinsOverWhatTheEnvironmentSays(t *testing.T) {
	if r := dyna(env(rt.EnvRuntime, "claude-desktop", envMagiSession, "abc"), "runtime", "name"); r.stdout != "claude-desktop\n" {
		t.Fatal(r)
	}
	if r := dyna(env(rt.EnvRuntime, "magi"), "runtime", "name"); r.stdout != "magi\n" {
		t.Fatal(r)
	}
}

func TestAnEmptyForcedNameCountsAsUnset(t *testing.T) {
	if r := dyna(env(rt.EnvRuntime, "", envMagiSession, "abc"), "runtime", "name"); r.stdout != "magi\n" {
		t.Fatal(r)
	}
}

func TestAnUnknownForcedNameExitsNonZeroPrintsNothingAndListsTheKnownOnes(t *testing.T) {
	r := dyna(env(rt.EnvRuntime, "foo", envMagiSession, "abc"), "runtime", "name")
	if r.code != 1 || r.stdout != "" {
		t.Fatal(r)
	}
	for _, want := range []string{"foo", "claude-desktop", "magi"} {
		if !strings.Contains(r.stderr, want) {
			t.Errorf("stderr lacks %q: %s", want, r.stderr)
		}
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
	if r := dyna(map[string]string{rt.EnvPluginRoot: t.TempDir()}, "runtime", "inject", "runtime"); r.code != 1 || r.stdout != "" || !strings.Contains(r.stderr, "读不到插件里的数据") {
		t.Fatalf("a plugin directory without the data: %+v", r)
	}
}

// The limit Claude Code puts on one hook's output; past it the session keeps only a 2,000-character preview.
const hookOutputLimit = 10000

func TestTwoSectionsEachUnderTheHookLimitInOrderRuntimeReference(t *testing.T) {
	for _, tc := range []struct {
		label string
		vars  []string
		name  string
	}{{"MAGI_SESSION_ID not set", nil, "claude-desktop"}, {"MAGI_SESSION_ID set", []string{envMagiSession, "abc"}, "magi"}} {
		t.Run(tc.label, func(t *testing.T) {
			var got [2]string
			for i, section := range rt.Sections {
				r := dyna(env(tc.vars...), "runtime", "inject", section)
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
			if lines[0] != "当前运行环境："+tc.name {
				t.Errorf("first line: %s", lines[0])
			}
			if !strings.HasPrefix(lines[1], "以下是运行环境的能力清单，开场注入，不必再取") {
				t.Errorf("second line: %s", lines[1])
			}
			if !strings.Contains(runtime, "## 能力清单") || strings.Contains(runtime, "\nname: ") {
				t.Error("runtime: the capability list, no frontmatter")
			}

			// reference: the whole data of this runtime, and not the other one's
			if !strings.HasPrefix(reference, "以下是运行环境「") || !strings.Contains(strings.SplitN(reference, "\n", 2)[0], tc.name) {
				t.Errorf("reference header: %s", strings.SplitN(reference, "\n", 2)[0])
			}
			own := strings.TrimSpace(strings.ReplaceAll(readFile(t, filepath.Join(pluginRoot(), rt.DataDir, tc.name+".md")), "${CLAUDE_PLUGIN_ROOT}", pluginRoot()))
			if !strings.Contains(reference, own) {
				t.Error("reference: the whole file of this runtime")
			}
			other := "magi"
			if tc.name == "magi" {
				other = "claude-desktop"
			}
			if strings.Contains(reference, strings.TrimSpace(readFile(t, filepath.Join(pluginRoot(), rt.DataDir, other+".md")))) {
				t.Error("reference: not the other runtime's")
			}
		})
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

// The runtime and browser skills are deleted and their content lives in the data: nothing in the data points back
// at them, at SKILL.md, or at an old script (the lock is `dyna ui lock …`, the dispatch bookkeeping `dyna runtime record`).
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
	e := env(rt.EnvRuntime, "magi")
	if r := dyna(e, "runtime", "inject", "runtime"); strings.SplitN(r.stdout, "\n", 2)[0] != "当前运行环境：magi" {
		t.Fatal(r.stdout)
	}
	if r := dyna(e, "runtime", "inject", "reference"); !strings.Contains(r.stdout, "magi sessions") {
		t.Fatal(r.stdout)
	}
}

func TestAPluginDirectoryReachedThroughASymlinkStillInjects(t *testing.T) {
	link := filepath.Join(t.TempDir(), "idea-loop")
	if err := os.Symlink(pluginRoot(), link); err != nil {
		t.Skip(err)
	}
	for _, section := range rt.Sections {
		r := dyna(map[string]string{rt.EnvPluginRoot: link}, "runtime", "inject", section)
		if r.code != 0 || !strings.Contains(r.stdout, "开场注入") {
			t.Fatalf("%s: %+v", section, r)
		}
	}
}

// The old script's output, byte for byte: runtime is the same text moved (the data was
// copied from the skill); reference is the same except the 浏览器 section, which now also holds the three rules
// of the old browser skill.
func TestInjectIsWhatTheOldScriptInjectedForTheSameEnvironment(t *testing.T) {
	node, script := oldScript(t, "runtime-detect.mjs")
	for _, name := range shipped {
		for _, section := range rt.Sections {
			old := runOld(t, node, script, map[string]string{rt.EnvRuntime: name}, "--inject", section)
			now := dyna(env(rt.EnvRuntime, name), "runtime", "inject", section)
			if old.code != 0 || now.code != 0 {
				t.Fatalf("%s %s: %+v %+v", name, section, old, now)
			}
			if section == "reference" {
				if withoutSection(now.stdout, "浏览器") != withoutSection(old.stdout, "浏览器") {
					t.Errorf("%s reference: differs outside 浏览器", name)
				}
				continue
			}
			if now.stdout != old.stdout {
				t.Errorf("%s %s: differs from the old script", name, section)
			}
		}
	}
}

func TestNameIsWhatTheOldScriptPrinted(t *testing.T) {
	node, script := oldScript(t, "runtime-detect.mjs")
	for _, vars := range []map[string]string{{}, {envMagiSession: "abc"}, {rt.EnvRuntime: "magi"}, {rt.EnvRuntime: "claude-desktop", envMagiSession: "abc"}, {rt.EnvRuntime: "", envMagiSession: "abc"}, {rt.EnvRuntime: "foo"}} {
		old := runOld(t, node, script, vars)
		e := env()
		for k, v := range vars {
			e[k] = v
		}
		now := dyna(e, "runtime", "name")
		if old.stdout != now.stdout || old.code != now.code {
			t.Errorf("%v: old %+v, now %+v", vars, old, now)
		}
		if old.code != 0 && strings.TrimSpace(old.stderr) != strings.TrimSpace(now.stderr) {
			t.Errorf("%v: stderr old %q, now %q", vars, old.stderr, now.stderr)
		}
	}
}

// ---- the data: one section per capability, the browser rules in each ----

func TestEveryDescriptionWithAMarkerIsAnEnvironmentAndTheOtherFilesAreNot(t *testing.T) {
	entries, err := os.ReadDir(filepath.Join(pluginRoot(), rt.DataDir))
	if err != nil {
		t.Fatal(err)
	}
	// capabilities.md and <environment>-<topic>.md (a detail file one of that environment's sections points at: the
	// injected data has a size cap, so a long procedure lives beside it) have no marker line: not environments.
	var withMarker []string
	for _, e := range entries {
		n := strings.TrimSuffix(e.Name(), ".md")
		if _, ok := rt.MarkerOf(readFile(t, filepath.Join(pluginRoot(), rt.DataDir, e.Name()))); ok {
			withMarker = append(withMarker, n)
		}
	}
	if !reflect.DeepEqual(withMarker, shipped) {
		t.Fatalf("files with a marker line: %v, want %v", withMarker, shipped)
	}
	r := dyna(env(rt.EnvRuntime, "zzz"), "runtime", "name")
	if !strings.Contains(r.stderr, "known: "+strings.Join(shipped, ", ")) {
		t.Fatalf("the known names are the files with a marker line: %s", r.stderr)
	}
}

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

func TestEveryEnvironmentHasASectionForEveryCapability(t *testing.T) {
	for _, name := range shipped {
		for _, c := range capabilities(t) {
			r := dyna(env(rt.EnvRuntime, name), "runtime", "show", c)
			if r.code != 0 || !strings.HasPrefix(r.stdout, "## "+c+"\n") {
				t.Errorf("%s / %s: %+v", name, c, r)
			}
		}
	}
}

func TestShowBrowserPrintsTheEnvironmentsSectionWithTheThreeRulesOfTheOldBrowserSkill(t *testing.T) {
	for _, tc := range []struct {
		name  string
		extra []string
	}{
		{"magi", []string{"magi browser", "window new"}},
		{"claude-desktop", []string{"mcp__playwright__browser_", "dyna ui lock acquire", "dyna ui lock release", "30 分钟"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r := dyna(env(rt.EnvRuntime, tc.name), "runtime", "show", "浏览器")
			if r.code != 0 {
				t.Fatal(r.stderr)
			}
			out := r.stdout
			if !strings.HasPrefix(out, "## 浏览器\n") {
				t.Errorf("starts with the section's heading: %q", out[:20])
			}
			// the three rules: 给人看, 无头, 并行时
			for _, want := range append(tc.extra,
				"### 给人看", "### 无头", "### 并行时抢锁",
				"python3 -m http.server",        // 给人看：本地 HTML 先起静态服务器
				"测试账号", "DEVELOPMENT.md", "静止态", // 无头：登录、把页面带到对的状态
				"自己起 chromium 的命令", // 并行时：自己起浏览器的命令不用
			) {
				if !strings.Contains(out, want) {
					t.Errorf("the 浏览器 section lacks %q", want)
				}
			}
			for _, notThis := range []string{"## 人的浏览器", "## 向人提问"} {
				if strings.Contains(out, notThis) {
					t.Errorf("only the one section, but found %q", notThis)
				}
			}
			if strings.Contains(out, "${CLAUDE_PLUGIN_ROOT}") {
				t.Error("the placeholder is expanded")
			}
			if strings.Contains(out, ".mjs") {
				t.Error("no old script is named in the 浏览器 section")
			}
		})
	}
}

func TestShowBrowserForMagiIsNotDesktopsAndTheOtherWayRound(t *testing.T) {
	magi := dyna(env(rt.EnvRuntime, "magi"), "runtime", "show", "浏览器").stdout
	desk := dyna(env(rt.EnvRuntime, "claude-desktop"), "runtime", "show", "浏览器").stdout
	if strings.Contains(magi, "mcp__playwright__") || strings.Contains(desk, "magi browser") {
		t.Fatal("each environment's own tools")
	}
}

func TestShowFollowsTheDetectionRulesAndHonoursAnUnknownForcedName(t *testing.T) {
	if r := dyna(env(envMagiSession, "x"), "runtime", "show", "浏览器"); r.code != 0 || !strings.Contains(r.stdout, "magi browser") {
		t.Fatalf("a magi session: %+v", r)
	}
	r := dyna(env(rt.EnvRuntime, "foo"), "runtime", "show", "推送")
	if r.code != 1 || r.stdout != "" || !strings.Contains(r.stderr, "foo") {
		t.Fatalf("unknown forced name: %+v", r)
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

func TestShowWithNoCapabilityPrintsTheCapabilityListAndTheFallbacks(t *testing.T) {
	for _, name := range shipped {
		r := dyna(env(rt.EnvRuntime, name), "runtime", "show")
		if r.code != 0 {
			t.Fatal(r)
		}
		for _, want := range []string{"## 能力清单", "| 浏览器 |", "## 退路", "例外一", "改在对话里问"} {
			if !strings.Contains(r.stdout, want) {
				t.Errorf("%s: lacks %q", name, want)
			}
		}
		if strings.Contains(r.stdout, "## 怎么用") || strings.Contains(r.stdout, "## 浏览器") {
			t.Errorf("%s: the list and the fallbacks only", name)
		}
	}
	// the list does not depend on the environment, so a bad forced name does not stop it
	if r := dyna(env(rt.EnvRuntime, "foo"), "runtime", "show"); r.code != 0 || !strings.Contains(r.stdout, "## 退路") {
		t.Fatalf("%+v", r)
	}
}

// A small plugin of the same shape, to pin how `show` cuts a section: from its heading to the next `## `, its `###`
// subsections inside, lines in a code fence never headings.
func TestShowCutsASectionAtTheNextTopLevelHeading(t *testing.T) {
	root := t.TempDir()
	writeFile(t, filepath.Join(root, "runtime", "capabilities.md"), "说明\n\n## 能力清单\n\n| 能力 | 做什么 |\n|---|---|\n| 甲 | x |\n| 乙 | y |\n\n## 退路\n\n交给人。\n")
	writeFile(t, filepath.Join(root, "runtime", "claude-desktop.md"), "# claude-desktop\n\n## 甲\n\n甲的正文\n\n### 子节\n\n```\n## 不是标题\n```\n\n## 乙\n\n乙的正文，路径 ${CLAUDE_PLUGIN_ROOT}/x\n")
	e := map[string]string{rt.EnvPluginRoot: root}
	r := dyna(e, "runtime", "show", "甲")
	want := "## 甲\n\n甲的正文\n\n### 子节\n\n```\n## 不是标题\n```\n"
	if r.code != 0 || r.stdout != want {
		t.Fatalf("%+v want %q", r, want)
	}
	if r := dyna(e, "runtime", "show", "乙"); r.stdout != "## 乙\n\n乙的正文，路径 "+root+"/x\n" {
		t.Fatalf("%+v", r)
	}
	// a data file that lacks a capability's section says so
	writeFile(t, filepath.Join(root, "runtime", "magi.md"), "标记：`MAGI_SESSION_ID`\n\n## 甲\n\nm\n")
	r = dyna(map[string]string{rt.EnvPluginRoot: root, rt.EnvRuntime: "magi"}, "runtime", "show", "乙")
	if r.code != 1 || !strings.Contains(r.stderr, "没有「乙」一节") || !strings.Contains(r.stderr, "magi") {
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

func TestHelpSaysHowToAddARuntime(t *testing.T) {
	r := dyna(env(), "runtime", "--help")
	if r.code != 0 {
		t.Fatal(r)
	}
	for _, want := range []string{"加一种运行环境", "runtime/<环境名>.md", "capabilities.md", "标记", "selected", "IDEA_LOOP_RUNTIME", "只升插件", "runtime check", "能力模板"} {
		if !strings.Contains(r.stdout, want) {
			t.Errorf("--help lacks %q", want)
		}
	}
	bare := dyna(env(), "runtime")
	if bare.code != 0 || !strings.Contains(bare.stdout, "record") || strings.Contains(bare.stdout, "handoff") {
		t.Fatalf("a bare module prints its commands: %+v", bare)
	}
}
