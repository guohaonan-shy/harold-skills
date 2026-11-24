package runtime_test

// `dyna runtime check [<file>]`: a runtime description is checked against the capability template in
// capabilities.md. The fake plugin below has a three-capability list and template, so the tests do not move when
// the plugin's real list grows; the last tests run the real plugin.

import (
	"path/filepath"
	"strings"
	"testing"

	rt "github.com/guohaonan-shy/harold-skills/dyna/internal/runtime"
)

const checkCapabilities = `这是能力清单。

## 能力清单

| 能力 | 通用流程要它做什么 | 做不到时 |
|---|---|---|
| 定时任务 | 按时间开会话 | 退路 |
| 会话管理 | 开会话 | 退路 |
| 推送 | 提醒人 | 退路 |

## 退路

走退路。

## 能力模板

写说明时用。

### 定时任务

- **列出**：传入：无；拿回：任务；做不到时：退路。
- **创建**：传入：id；拿回：已建；做不到时：退路。

### 会话管理

- **开一个 issue 会话**：传入：worktree；拿回：会话 id；做不到时：停下。
- **分组**：传入：分组名；拿回：已归位；做不到时：跳过。

### 推送

- **推一句话**：传入：一句话；拿回：已推出；做不到时：退路。
`

const fakeGood = "# fake\n\n标记：`FAKE_SESSION`\n\n" +
	"## 定时任务\n\n- **列出**：`fake cron list`\n- **创建**：`fake cron create`\n\n" +
	"## 会话管理\n\n- **开一个 issue 会话**：`fake start`\n- **分组：没有**。\n\n" +
	"## 推送\n\n- **推一句话**：`fake push`\n"

// fakePlugin is a plugin directory with the fake capability list and these descriptions (name -> content).
func fakePlugin(t *testing.T, docs map[string]string) string {
	t.Helper()
	root := t.TempDir()
	writeFile(t, filepath.Join(root, rt.DataDir, rt.CapabilitiesFile), checkCapabilities)
	for name, content := range docs {
		writeFile(t, filepath.Join(root, rt.DataDir, name+".md"), content)
	}
	return root
}

// checkEnv is the environment for a check against a fake plugin; home "" means a home that does not exist.
func checkEnv(root, home string) map[string]string {
	if home == "" {
		home = noHome
	}
	return map[string]string{rt.EnvPluginRoot: root, "IDEA_LOOP_HOME": home}
}

func lines(s string) []string {
	var out []string
	for _, l := range strings.Split(strings.TrimSpace(s), "\n") {
		if l != "" {
			out = append(out, l)
		}
	}
	return out
}

func TestCheckPassesAFullDescriptionWithOneLine(t *testing.T) {
	root := fakePlugin(t, nil)
	file := filepath.Join(t.TempDir(), "fake.md")
	writeFile(t, file, fakeGood)
	r := dyna(checkEnv(root, ""), "runtime", "check", file)
	if r.code != 0 || len(lines(r.stdout)) != 1 || !strings.Contains(r.stdout, "通过") || r.stderr != "" {
		t.Fatalf("%+v", r)
	}
}

func TestCheckReportsAMissingSectionAndAnEmptyItemEachOnItsOwnLineWithTheSectionName(t *testing.T) {
	bad := "# fake\n\n标记：`FAKE_SESSION`\n\n" +
		"## 定时任务\n\n- **列出**：`fake cron list`\n- **创建**：\n\n" +
		"## 会话管理\n\n- **开一个 issue 会话**：`fake start`\n- **分组：没有**。\n"
	root := fakePlugin(t, nil)
	file := filepath.Join(t.TempDir(), "fake.md")
	writeFile(t, file, bad)
	r := dyna(checkEnv(root, ""), "runtime", "check", file)
	if r.code != 1 {
		t.Fatalf("exit code: %+v", r)
	}
	got := lines(r.all())
	if len(got) != 2 {
		t.Fatalf("want two lines, got %d: %q", len(got), got)
	}
	var push, empty string
	for _, l := range got {
		switch {
		case strings.Contains(l, "「推送」"):
			push = l
		case strings.Contains(l, "「定时任务」"):
			empty = l
		}
	}
	if push == "" || !strings.Contains(push, "缺") {
		t.Errorf("no line for the missing 推送 section: %q", got)
	}
	if empty == "" || !strings.Contains(empty, "「创建」") || !strings.Contains(empty, "没有") {
		t.Errorf("no line for the empty 创建 item under 定时任务: %q", got)
	}
}

func TestCheckReportsAMissingItemNameInASection(t *testing.T) {
	bad := strings.Replace(fakeGood, "- **列出**：`fake cron list`\n", "- 列出：`fake cron list`\n", 1)
	root := fakePlugin(t, nil)
	file := filepath.Join(t.TempDir(), "fake.md")
	writeFile(t, file, bad)
	r := dyna(checkEnv(root, ""), "runtime", "check", file)
	got := lines(r.all())
	if r.code != 1 || len(got) != 1 || !strings.Contains(got[0], "「定时任务」") || !strings.Contains(got[0], "「列出」") {
		t.Fatalf("%+v", r)
	}
}

func TestCheckReportsAFileWithoutAMarkerLine(t *testing.T) {
	bad := strings.Replace(fakeGood, "标记：`FAKE_SESSION`\n\n", "", 1)
	root := fakePlugin(t, nil)
	file := filepath.Join(t.TempDir(), "fake.md")
	writeFile(t, file, bad)
	r := dyna(checkEnv(root, ""), "runtime", "check", file)
	got := lines(r.all())
	if r.code != 1 || len(got) != 1 || !strings.Contains(got[0], "标记") {
		t.Fatalf("%+v", r)
	}
}

func TestCheckReportsAMisnamedSectionAndTheOneItShouldHaveBeen(t *testing.T) {
	bad := strings.Replace(fakeGood, "## 会话管理\n", "## 会话管理器\n", 1)
	root := fakePlugin(t, nil)
	file := filepath.Join(t.TempDir(), "fake.md")
	writeFile(t, file, bad)
	r := dyna(checkEnv(root, ""), "runtime", "check", file)
	if r.code != 1 {
		t.Fatalf("%+v", r)
	}
	var wrong, missing bool
	for _, l := range lines(r.all()) {
		wrong = wrong || (strings.Contains(l, "「会话管理器」") && strings.Contains(l, "能力清单"))
		missing = missing || (strings.Contains(l, "「会话管理」") && strings.Contains(l, "缺"))
	}
	if !wrong || !missing {
		t.Fatalf("misnamed section not reported: %+v", r)
	}
}

func TestCheckTakesASectionThatIsOnlyNoAsEveryItemNo(t *testing.T) {
	for _, body := range []string{"**没有**。走退路。", "没有。", "没有：这个环境做不到。"} {
		doc := strings.Replace(fakeGood, "- **推一句话**：`fake push`", body, 1)
		root := fakePlugin(t, nil)
		file := filepath.Join(t.TempDir(), "fake.md")
		writeFile(t, file, doc)
		if r := dyna(checkEnv(root, ""), "runtime", "check", file); r.code != 0 {
			t.Errorf("%q: %+v", body, r)
		}
	}
	// 「没有」 as the start of a sentence that then says how it is done is not a whole-section no
	doc := strings.Replace(fakeGood, "- **推一句话**：`fake push`", "没有专门的工具，在对话里说。", 1)
	root := fakePlugin(t, nil)
	file := filepath.Join(t.TempDir(), "fake.md")
	writeFile(t, file, doc)
	r := dyna(checkEnv(root, ""), "runtime", "check", file)
	if r.code != 1 || !strings.Contains(r.all(), "「推送」") {
		t.Errorf("%+v", r)
	}
}

func TestCheckAcceptsTheWayToDoItOnTheLinesAfterTheItemName(t *testing.T) {
	doc := strings.Replace(fakeGood, "- **创建**：`fake cron create`", "- **创建**：\n  `fake cron create`，传入 id", 1)
	root := fakePlugin(t, nil)
	file := filepath.Join(t.TempDir(), "fake.md")
	writeFile(t, file, doc)
	if r := dyna(checkEnv(root, ""), "runtime", "check", file); r.code != 0 {
		t.Fatalf("%+v", r)
	}
	// but the next item is not the body of an empty one
	doc = strings.Replace(fakeGood, "- **创建**：`fake cron create`\n", "- **创建**：\n", 1)
	file2 := filepath.Join(t.TempDir(), "fake.md")
	writeFile(t, file2, doc)
	if r := dyna(checkEnv(root, ""), "runtime", "check", file2); r.code != 1 {
		t.Fatalf("%+v", r)
	}
}

func TestCheckFindsItemsInSubsectionsAndIgnoresHeadingsInsideCodeFences(t *testing.T) {
	doc := strings.Replace(fakeGood, "## 推送\n\n- **推一句话**：`fake push`\n",
		"## 推送\n\n### 怎么推\n\n- **推一句话**：`fake push`\n\n```\n## 不是节\n```\n", 1)
	root := fakePlugin(t, nil)
	file := filepath.Join(t.TempDir(), "fake.md")
	writeFile(t, file, doc)
	if r := dyna(checkEnv(root, ""), "runtime", "check", file); r.code != 0 {
		t.Fatalf("%+v", r)
	}
}

func TestCheckOfAFileThatCannotBeReadSaysSo(t *testing.T) {
	root := fakePlugin(t, nil)
	r := dyna(checkEnv(root, ""), "runtime", "check", filepath.Join(t.TempDir(), "nope.md"))
	if r.code == 0 || !strings.Contains(r.all(), "nope.md") {
		t.Fatalf("%+v", r)
	}
}

func TestCheckWithNoFileChecksEveryDescriptionWithAMarkerInThePluginAndInHome(t *testing.T) {
	root := fakePlugin(t, map[string]string{"fake": fakeGood, "notes": "# 细节文件，没有标记行\n\n## 随便\n"})
	// a home environment with a problem, a home file with no marker (not a description), and a home file that is
	// the override of the plugin's fake
	zed := "# zed\n\n标记：`ZED_SESSION`\n\n## 定时任务\n\n- **列出**：zed\n"
	h := homeWith(t, map[string]string{"zed.md": zed, "plain.md": "# 随手记\n"})
	r := dyna(checkEnv(root, h), "runtime", "check")
	if r.code != 1 {
		t.Fatalf("%+v", r)
	}
	out := r.all()
	if !strings.Contains(out, "zed") || !strings.Contains(out, "「推送」") || !strings.Contains(out, "「会话管理」") {
		t.Errorf("the home environment's problems are not reported: %s", out)
	}
	for _, l := range lines(out) {
		if strings.Contains(l, "fake") || strings.Contains(l, "plain") || strings.Contains(l, "notes") {
			t.Errorf("a good description or a file that is not one is mentioned: %s", l)
		}
	}
}

func TestCheckWithNoFileChecksTheMergeOfThePluginsFileAndTheLocalOverride(t *testing.T) {
	root := fakePlugin(t, map[string]string{"fake": fakeGood})
	// the override takes the 推送 section over with one that has no item name
	h := homeWith(t, map[string]string{"fake.md": "## 推送\n\n只有一句话，没有加粗的项名。\n"})
	r := dyna(checkEnv(root, h), "runtime", "check")
	if r.code != 1 || !strings.Contains(r.all(), "「推送」") || !strings.Contains(r.all(), "「推一句话」") {
		t.Fatalf("the merged result is what is checked: %+v", r)
	}
	// and an override that keeps it complete passes
	h2 := homeWith(t, map[string]string{"fake.md": "## 推送\n\n- **推一句话**：`local push`\n"})
	if r := dyna(checkEnv(root, h2), "runtime", "check"); r.code != 0 || !strings.Contains(r.stdout, "fake") {
		t.Fatalf("%+v", r)
	}
}

func TestCheckWithNoFileAndNoDescriptionAtAllIsAnError(t *testing.T) {
	root := fakePlugin(t, nil)
	if r := dyna(checkEnv(root, ""), "runtime", "check"); r.code == 0 {
		t.Fatalf("%+v", r)
	}
}

func TestCheckWithoutATemplateInCapabilitiesSaysSo(t *testing.T) {
	root := t.TempDir()
	writeFile(t, filepath.Join(root, rt.DataDir, rt.CapabilitiesFile), strings.SplitN(checkCapabilities, "## 能力模板", 2)[0])
	file := filepath.Join(t.TempDir(), "x.md")
	writeFile(t, file, fakeGood)
	r := dyna(checkEnv(root, ""), "runtime", "check", file)
	if r.code == 0 || !strings.Contains(r.all(), "能力模板") {
		t.Fatalf("%+v", r)
	}
}

// ---- the real plugin ----

func TestTheRealTemplateHasASectionPerCapabilityAndEveryItemSaysWhatGoesInWhatComesBackAndWhatIfNot(t *testing.T) {
	p := rt.Plugin{Root: pluginRoot()}
	caps, err := p.Capabilities()
	if err != nil {
		t.Fatal(err)
	}
	tmpl, err := p.Template()
	if err != nil {
		t.Fatal(err)
	}
	if len(tmpl) != len(caps) {
		t.Errorf("template has %d capabilities, list has %d", len(tmpl), len(caps))
	}
	for _, c := range caps {
		items := tmpl[c]
		if len(items) == 0 {
			t.Errorf("%s: no items in the template", c)
		}
		for _, it := range items {
			for _, part := range []string{"传入：", "拿回：", "做不到时："} {
				if !strings.Contains(it.Line, part) {
					t.Errorf("%s / %s: no 「%s」 in %q", c, it.Name, part, it.Line)
				}
			}
		}
	}
}

func TestTheRealPluginsOwnDescriptionsPassWithNoHome(t *testing.T) {
	r := dyna(env(), "runtime", "check")
	if r.code != 0 || len(lines(r.stdout)) != 1 || !strings.Contains(r.stdout, "claude-desktop") || !strings.Contains(r.stdout, "magi") {
		t.Fatalf("%+v", r)
	}
	for _, name := range shipped {
		if r := dyna(env(), "runtime", "check", filepath.Join(pluginRoot(), rt.DataDir, name+".md")); r.code != 0 {
			t.Errorf("%s: %+v", name, r)
		}
	}
}

func TestACheckWithAHomeEnvironmentThatHasAProblemReportsItAndNamesIt(t *testing.T) {
	h := homeWith(t, map[string]string{"zed.md": zedDoc})
	r := dyna(env("IDEA_LOOP_HOME", h), "runtime", "check")
	if r.code != 1 || !strings.Contains(r.all(), "zed") || !strings.Contains(r.all(), "「会话管理」") {
		t.Fatalf("%+v", r)
	}
}

// ---- the injected capability list carries no template ----

func TestInjectRuntimeLeavesTheTemplateOutAndShowKeepsListAndFallbacks(t *testing.T) {
	r := dyna(env(), "runtime", "inject", "runtime")
	if r.code != 0 {
		t.Fatal(r)
	}
	for _, gone := range []string{"能力模板", "\n### ", "传入："} {
		if strings.Contains(r.stdout, gone) {
			t.Errorf("inject runtime still has %q", gone)
		}
	}
	for _, kept := range []string{"## 能力清单", "## 退路", "例外一", "例外二"} {
		if !strings.Contains(r.stdout, kept) {
			t.Errorf("inject runtime lost %q", kept)
		}
	}
	s := dyna(env(), "runtime", "show")
	if s.code != 0 || strings.Contains(s.stdout, "能力模板") || !strings.Contains(s.stdout, "## 能力清单") || !strings.Contains(s.stdout, "## 退路") {
		t.Fatalf("%+v", s)
	}
}

func TestTheCapabilityTableAndTheFallbacksAreTheOnesThatWereThereBeforeTheTemplate(t *testing.T) {
	// the table and the fallbacks are checked word for word by the plugin's own test (runtime-data-doc.test.mjs);
	// here the part that matters to the commands: the capability list is still the closed set of eleven
	if got := capabilities(t); len(got) != 11 {
		t.Fatalf("%v", got)
	}
}
