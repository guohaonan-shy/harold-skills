package runtime_test

// The local override: <home>/runtime/<environment>.md replaces, section by section, the plugin's data for that
// environment. `inject reference` and `show <capability>` both print the merged text.

import (
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	rt "github.com/guohaonan-shy/harold-skills/dyna/internal/runtime"
)

const introDesktop = "以下是运行环境「claude-desktop」的做法全文，开场注入，不必再取。\n\n"

const fakeCapabilities = "说明\n\n## 能力清单\n\n| 能力 | 做什么 |\n|---|---|\n| 甲 | x |\n| 乙 | y |\n| 丙 | z |\n\n## 退路\n\n交给人。\n"

const fakeData = `# claude-desktop

## 甲

甲原文

## 乙

乙原文

### 乙一

乙一原文

### 乙二

乙二原文

## 丙

丙原文
`

// scene is a fake plugin directory and a fake home; the override file is written only when local is not empty.
type scene struct {
	root, home string
}

func newScene(t *testing.T, data, local string) scene {
	t.Helper()
	s := scene{root: t.TempDir(), home: t.TempDir()}
	writeFile(t, filepath.Join(s.root, "runtime", "capabilities.md"), fakeCapabilities)
	writeFile(t, filepath.Join(s.root, "runtime", "claude-desktop.md"), data)
	if local != "" {
		writeFile(t, s.localPath(), local)
	}
	return s
}

func (s scene) localPath() string { return filepath.Join(s.home, "runtime", "claude-desktop.md") }

func (s scene) env() map[string]string {
	return map[string]string{rt.EnvPluginRoot: s.root, "IDEA_LOOP_HOME": s.home}
}

func (s scene) inject() outcome { return dyna(s.env(), "runtime", "inject", "reference") }
func (s scene) show(c string) outcome {
	return dyna(s.env(), "runtime", "show", c)
}

// plain is what the data alone gives, with no override: the intro, the trimmed file, a newline.
func plain(data string) string { return introDesktop + strings.TrimSpace(data) + "\n" }

func TestAnOverrideSectionReplacesThePluginsSameNamedSectionWhole(t *testing.T) {
	s := newScene(t, fakeData, "# 本机覆盖\n\n前言，不用。\n\n## 甲\n\n本机甲\n")
	want := "本机覆盖 " + s.localPath() + "：替换了「甲」。\n" + introDesktop +
		"# claude-desktop\n\n## 甲\n\n本机甲\n\n## 乙\n\n乙原文\n\n### 乙一\n\n乙一原文\n\n### 乙二\n\n乙二原文\n\n## 丙\n\n丙原文\n"
	if r := s.inject(); r.code != 0 || r.stdout != want {
		t.Fatalf("%+v\nwant %q", r, want)
	}
}

func TestATwoHashSectionBringsItsThreeHashSubsectionsAndReplacesTheOnesInThePlugin(t *testing.T) {
	s := newScene(t, fakeData, "## 乙\n\n本机乙\n\n### 乙一\n\n本机乙一\n\n## 丙\n\n本机丙\n")
	want := "本机覆盖 " + s.localPath() + "：替换了「乙」「丙」。\n" + introDesktop +
		"# claude-desktop\n\n## 甲\n\n甲原文\n\n## 乙\n\n本机乙\n\n### 乙一\n\n本机乙一\n\n## 丙\n\n本机丙\n"
	if r := s.inject(); r.code != 0 || r.stdout != want {
		t.Fatalf("%+v\nwant %q", r, want)
	}
}

func TestAThreeHashSectionAloneReplacesJustThatSubsection(t *testing.T) {
	s := newScene(t, fakeData, "### 乙二\n\n本机乙二\n")
	want := "本机覆盖 " + s.localPath() + "：替换了「乙二」。\n" + introDesktop +
		"# claude-desktop\n\n## 甲\n\n甲原文\n\n## 乙\n\n乙原文\n\n### 乙一\n\n乙一原文\n\n### 乙二\n\n本机乙二\n\n## 丙\n\n丙原文\n"
	if r := s.inject(); r.code != 0 || r.stdout != want {
		t.Fatalf("%+v\nwant %q", r, want)
	}
}

func TestATitleThePluginLacksIsReportedAndNeverAppended(t *testing.T) {
	s := newScene(t, fakeData, "## 不存在的能力\n\n本机写的\n\n### 乙一\n\n它在不存在的能力这一段里，跟着不用\n\n## 甲\n\n本机甲\n")
	want := "本机覆盖 " + s.localPath() + "：替换了「甲」；没对上、没用上：「不存在的能力」（插件里没有同级同名的一节）。\n" + introDesktop +
		"# claude-desktop\n\n## 甲\n\n本机甲\n\n## 乙\n\n乙原文\n\n### 乙一\n\n乙一原文\n\n### 乙二\n\n乙二原文\n\n## 丙\n\n丙原文\n"
	r := s.inject()
	if r.code != 0 || r.stdout != want {
		t.Fatalf("%+v\nwant %q", r, want)
	}
	if strings.Contains(r.stdout, "本机写的") {
		t.Error("an unmatched section is not appended")
	}
}

func TestALevelThatDoesNotMatchCountsAsNoMatch(t *testing.T) {
	// 甲 is a `##` in the plugin; the override writes it as `###`
	s := newScene(t, fakeData, "### 甲\n\n本机甲\n")
	want := "本机覆盖 " + s.localPath() + "：没替换任何一节；没对上、没用上：「甲」（插件里没有同级同名的一节）。\n" + introDesktop + strings.TrimSpace(fakeData) + "\n"
	if r := s.inject(); r.code != 0 || r.stdout != want {
		t.Fatalf("%+v\nwant %q", r, want)
	}
}

func TestATitleThePluginHasMoreThanOnceIsNotUsed(t *testing.T) {
	data := "## 甲\n\n### 子\n\n甲的子\n\n## 乙\n\n### 子\n\n乙的子\n\n## 丙\n\n丙原文\n"
	s := newScene(t, data, "### 子\n\n本机子\n")
	want := "本机覆盖 " + s.localPath() + "：没替换任何一节；没对上、没用上：「子」（插件里同级同名的有 2 处）。\n" + introDesktop + strings.TrimSpace(data) + "\n"
	if r := s.inject(); r.code != 0 || r.stdout != want {
		t.Fatalf("%+v\nwant %q", r, want)
	}
}

func TestAnOverrideWithOnlyAFirstLevelTitleAndAPreambleUsesNothing(t *testing.T) {
	s := newScene(t, fakeData, "# magi 本机覆盖\n\n只有前言，没有二级、三级标题。\n\n#### 四级的不算\n")
	want := "本机覆盖 " + s.localPath() + "：文件里没有 ## 或 ### 小节，没替换任何一节。\n" + introDesktop + strings.TrimSpace(fakeData) + "\n"
	if r := s.inject(); r.code != 0 || r.stdout != want {
		t.Fatalf("%+v\nwant %q", r, want)
	}
}

func TestAHashLineInsideACodeFenceIsNotAHeading(t *testing.T) {
	s := newScene(t, fakeData, "## 甲\n\n本机甲\n\n```\n## 乙\n# 注释\n```\n\n还是甲的\n")
	want := "本机覆盖 " + s.localPath() + "：替换了「甲」。\n" + introDesktop +
		"# claude-desktop\n\n## 甲\n\n本机甲\n\n```\n## 乙\n# 注释\n```\n\n还是甲的\n\n## 乙\n\n乙原文\n\n### 乙一\n\n乙一原文\n\n### 乙二\n\n乙二原文\n\n## 丙\n\n丙原文\n"
	if r := s.inject(); r.code != 0 || r.stdout != want {
		t.Fatalf("%+v\nwant %q", r, want)
	}
}

func TestASectionEndsAtAFirstLevelHeading(t *testing.T) {
	s := newScene(t, fakeData, "## 甲\n\n本机甲\n\n# 另起一篇\n\n这段不属于甲，不用\n")
	r := s.inject()
	if r.code != 0 || strings.Contains(r.stdout, "这段不属于甲") || !strings.Contains(r.stdout, "## 甲\n\n本机甲\n\n## 乙") {
		t.Fatalf("%+v", r)
	}
}

func TestTheSecondCopyOfATitleInTheOverrideIsNotUsed(t *testing.T) {
	s := newScene(t, fakeData, "## 甲\n\n本机甲一\n\n## 甲\n\n本机甲二\n")
	r := s.inject()
	first := strings.SplitN(r.stdout, "\n", 2)[0]
	if first != "本机覆盖 "+s.localPath()+"：替换了「甲」；没对上、没用上：「甲」（本机文件里重复，用的是第一段）。" || !strings.Contains(r.stdout, "本机甲一") || strings.Contains(r.stdout, "本机甲二") {
		t.Fatalf("%+v", r)
	}
}

func TestAThreeHashSectionInsideAReplacedTwoHashSectionOfThePluginIsCovered(t *testing.T) {
	// 乙二 sits inside the plugin's 乙; the override gives 乙 whole and, after a first-level heading, 乙二 on its own
	s := newScene(t, fakeData, "## 乙\n\n本机乙\n\n# 分隔\n\n### 乙二\n\n本机乙二\n")
	r := s.inject()
	first := strings.SplitN(r.stdout, "\n", 2)[0]
	want := "本机覆盖 " + s.localPath() + "：替换了「乙」；没对上、没用上：「乙二」（已被同文件里更大的一节「乙」整段换掉）。"
	if first != want || strings.Contains(r.stdout, "本机乙二") {
		t.Fatalf("first %q\nwant  %q", first, want)
	}
}

func TestWithNoHomeThereIsNoHeaderAndTheTextIsThePlugins(t *testing.T) {
	s := newScene(t, fakeData, "")
	for label, vars := range map[string]map[string]string{
		"home does not exist": {"IDEA_LOOP_HOME": filepath.Join(s.home, "nowhere")},
		"HOME without a home": {"HOME": s.home},
		"nothing at all":      {},
	} {
		e := map[string]string{rt.EnvPluginRoot: s.root}
		for k, v := range vars {
			e[k] = v
		}
		if r := dyna(e, "runtime", "inject", "reference"); r.code != 0 || r.stdout != plain(fakeData) {
			t.Errorf("%s: %+v", label, r)
		}
		if r := dyna(e, "runtime", "show", "甲"); r.code != 0 || r.stdout != "## 甲\n\n甲原文\n" {
			t.Errorf("%s show: %+v", label, r)
		}
	}
}

func TestAHomeWithoutTheOverrideFileIsTheSameAsNoOverride(t *testing.T) {
	s := newScene(t, fakeData, "")
	writeFile(t, filepath.Join(s.home, "runtime", "magi.md"), "## 甲\n\n是 magi 的，不是这台环境的\n")
	if r := s.inject(); r.code != 0 || r.stdout != plain(fakeData) {
		t.Fatalf("%+v", r)
	}
	if r := s.show("甲"); r.code != 0 || r.stdout != "## 甲\n\n甲原文\n" {
		t.Fatalf("%+v", r)
	}
}

func TestAnOverrideThatCannotBeReadSaysSoAndTheTextIsThePlugins(t *testing.T) {
	for label, setup := range map[string]func(s scene){
		"a directory where the file should be": func(s scene) {
			if err := os.MkdirAll(s.localPath(), 0o755); err != nil {
				t.Fatal(err)
			}
		},
		"not UTF-8": func(s scene) { writeFile(t, s.localPath(), "## 甲\n\n\xff\xfe坏字节\n") },
	} {
		t.Run(label, func(t *testing.T) {
			s := newScene(t, fakeData, "")
			setup(s)
			r := s.inject()
			first, rest, _ := strings.Cut(r.stdout, "\n")
			if r.code != 0 || !strings.HasPrefix(first, "本机覆盖读取失败：") || !strings.Contains(first, s.localPath()) || rest != plain(fakeData) {
				t.Fatalf("%+v", r)
			}
			sh := s.show("甲")
			first, rest, _ = strings.Cut(sh.stdout, "\n")
			if sh.code != 0 || !strings.HasPrefix(first, "本机覆盖读取失败：") || rest != "## 甲\n\n甲原文\n" {
				t.Fatalf("show: %+v", sh)
			}
		})
	}
}

func TestAMergedTextOverTheInjectionLimitSaysSoOnTheFirstLineAndIsStillInjected(t *testing.T) {
	big := strings.Repeat("长", 12000)
	s := newScene(t, fakeData, "## 甲\n\n"+big+"\n")
	head := "本机覆盖 " + s.localPath() + "：替换了「甲」。"
	body := introDesktop + "# claude-desktop\n\n## 甲\n\n" + big + "\n\n## 乙\n\n乙原文\n\n### 乙一\n\n乙一原文\n\n### 乙二\n\n乙二原文\n\n## 丙\n\n丙原文\n"
	n := len([]rune(head + "\n" + body))
	sentence := "合并后 " + strconv.Itoa(n) + " 字，超过开场注入上限，后面被截断；完整的某一节跑 `dyna runtime show <能力>`。"
	want := head + sentence + "\n" + body
	if r := s.inject(); r.code != 0 || r.stdout != want {
		t.Fatalf("code %d\nfirst line %q\nwant       %q", r.code, strings.SplitN(r.stdout, "\n", 2)[0], head+sentence)
	}
	// a merged text that fits has no such sentence
	small := newScene(t, fakeData, "## 甲\n\n短\n")
	if strings.Contains(small.inject().stdout, "超过开场注入上限") {
		t.Error("the limit sentence appears only past the limit")
	}
}

// ---- show ----

func TestShowOfAReplacedCapabilityStartsWithTheOverrideLineAndPrintsTheLocalSection(t *testing.T) {
	s := newScene(t, fakeData, "## 甲\n\n本机甲\n")
	want := "本机覆盖 " + s.localPath() + "：这一节是本机写的\n## 甲\n\n本机甲\n"
	if r := s.show("甲"); r.code != 0 || r.stdout != want {
		t.Fatalf("%+v\nwant %q", r, want)
	}
	// the capabilities the override did not replace print exactly what they did before
	for c, text := range map[string]string{"乙": "## 乙\n\n乙原文\n\n### 乙一\n\n乙一原文\n\n### 乙二\n\n乙二原文\n", "丙": "## 丙\n\n丙原文\n"} {
		if r := s.show(c); r.code != 0 || r.stdout != text {
			t.Errorf("%s: %+v", c, r)
		}
	}
}

func TestShowOfACapabilityWithOneSubsectionReplacedSaysWhichPartIsLocal(t *testing.T) {
	s := newScene(t, fakeData, "### 乙二\n\n本机乙二\n")
	want := "本机覆盖 " + s.localPath() + "：这一节里「乙二」是本机写的\n## 乙\n\n乙原文\n\n### 乙一\n\n乙一原文\n\n### 乙二\n\n本机乙二\n"
	if r := s.show("乙"); r.code != 0 || r.stdout != want {
		t.Fatalf("%+v\nwant %q", r, want)
	}
}

func TestShowOfACapabilityTheOverrideOnlyMissedHasNoOverrideLine(t *testing.T) {
	s := newScene(t, fakeData, "## 不存在的能力\n\n本机写的\n")
	if r := s.show("甲"); r.code != 0 || r.stdout != "## 甲\n\n甲原文\n" {
		t.Fatalf("%+v", r)
	}
}

func TestTheOverrideNeverTouchesTheCapabilityListOrTheOtherInjectedSections(t *testing.T) {
	s := newScene(t, fakeData, "## 能力清单\n\n本机改清单\n\n## 甲\n\n本机甲\n")
	if r := dyna(s.env(), "runtime", "inject", "runtime"); r.code != 0 || strings.Contains(r.stdout, "本机") {
		t.Fatalf("%+v", r)
	}
	if r := dyna(s.env(), "runtime", "show"); r.code != 0 || strings.Contains(r.stdout, "本机") {
		t.Fatalf("%+v", r)
	}
	if r := dyna(s.env(), "runtime", "name"); r.stdout != "claude-desktop\n" {
		t.Fatalf("%+v", r)
	}
}

func TestTheOverrideOfAnotherEnvironmentIsNotRead(t *testing.T) {
	s := newScene(t, fakeData, "")
	writeFile(t, filepath.Join(s.root, "runtime", "magi.md"), "标记：`MAGI_SESSION_ID`\n\n## 甲\n\nmagi 甲\n")
	writeFile(t, filepath.Join(s.home, "runtime", "claude-desktop.md"), "## 甲\n\n桌面的本机甲\n")
	e := s.env()
	e[rt.EnvRuntime] = "magi"
	r := dyna(e, "runtime", "show", "甲")
	if r.code != 0 || r.stdout != "## 甲\n\nmagi 甲\n" {
		t.Fatalf("%+v", r)
	}
}

func TestHelpTellsWhereTheOverrideLivesAndHowItMerges(t *testing.T) {
	r := dyna(env(), "runtime", "--help")
	for _, want := range []string{"本机覆盖", "<home>/runtime/<环境名>.md", "IDEA_LOOP_HOME", "整段替换", "没对上"} {
		if !strings.Contains(r.stdout, want) {
			t.Errorf("--help lacks %q", want)
		}
	}
}

// ---- no override: byte for byte what the plugin's data gave before ----

// beforeInject is what `inject reference` printed before the override existed.
func beforeInject(t *testing.T, name string) string {
	t.Helper()
	text := readFile(t, filepath.Join(pluginRoot(), rt.DataDir, name+".md"))
	if strings.HasPrefix(text, "---\n") {
		if end := strings.Index(text[4:], "\n---\n"); end >= 0 {
			text = text[4+end+5:]
		}
	}
	text = strings.ReplaceAll(strings.TrimSpace(text), "${CLAUDE_PLUGIN_ROOT}", pluginRoot())
	return "以下是运行环境「" + name + "」的做法全文，开场注入，不必再取。\n\n" + text + "\n"
}

// beforeShow is the `## <capability>` section as `show` printed it: up to the next `## ` heading, code fences opaque.
func beforeShow(t *testing.T, name, capability string) string {
	t.Helper()
	text := strings.ReplaceAll(readFile(t, filepath.Join(pluginRoot(), rt.DataDir, name+".md")), "${CLAUDE_PLUGIN_ROOT}", pluginRoot())
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
			in = strings.TrimSpace(line[3:]) == capability
		}
		if in {
			out = append(out, line)
		}
	}
	return strings.TrimSpace(strings.Join(out, "\n")) + "\n"
}

func TestWithNoOverrideTheRealDataOfEachEnvironmentComesOutByteForByteAsBefore(t *testing.T) {
	for _, name := range shipped {
		t.Run(name, func(t *testing.T) {
			home := t.TempDir() // a home that exists, with no runtime/ in it
			e := env(rt.EnvRuntime, name, "IDEA_LOOP_HOME", home)
			if r := dyna(e, "runtime", "inject", "reference"); r.code != 0 || r.stdout != beforeInject(t, name) {
				t.Errorf("inject reference differs from the plugin data alone (%d runes)", len([]rune(r.stdout)))
			}
			for _, c := range capabilities(t) {
				if r := dyna(e, "runtime", "show", c); r.code != 0 || r.stdout != beforeShow(t, name, c) {
					t.Errorf("show %s differs from the plugin data alone", c)
				}
			}
		})
	}
}
