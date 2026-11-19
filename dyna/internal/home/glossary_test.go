package home_test

import (
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"regexp"
	"strings"
	"testing"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/home"
)

// Ported from idea-loop/scripts/glossary-check.test.mjs (`home glossary check`), plus the PostToolUse hook that
// had no test of its own (glossary-check-hook.mjs): `--hook` answers the same as it did.

// glossaryGood is a well-formed glossary; every test starts from this and bends one thing.
const glossaryGood = `# Acme Shop

在线商店，顾客下单、查看账单。

## 术语

### 学生应用

**Practice**：
学生可以做的一条练习，属于四种题型之一。
_Avoid_: exercise, drill

**Speaking band**：
口语题统一用的分数量纲，1–6、0.5 步进。
_Avoid_: legacy score（迁移前的旧量纲）

**Cause layer**：
一个订单被归到的处理环节。
三层之一：仓储、物流、配送。
_Avoid_: error type, category（Issue 上另有一个也叫 category 的分类）

## 歧义词

- **status**：代码里有至少六套互不相关的 status。单独说不成立，必须带上实体名。
`

func bend(from, to string) string { return strings.Replace(glossaryGood, from, to, 1) }

func hasErr(md string, re string) bool {
	r := regexp.MustCompile(re)
	for _, e := range home.CheckGlossary(md).Errors {
		if r.MatchString(e) {
			return true
		}
	}
	return false
}

func TestGlossaryWellFormedIsValidAndItsTermsAreParsed(t *testing.T) { // "a well-formed glossary is valid and its terms are parsed"
	r := home.CheckGlossary(glossaryGood)
	if len(r.Errors) != 0 || !r.Valid {
		t.Fatal(r.Errors)
	}
	var names []string
	for _, term := range r.Terms {
		names = append(names, term.Name)
	}
	if !reflect.DeepEqual(names, []string{"Practice", "Speaking band", "Cause layer"}) || !reflect.DeepEqual(r.Terms[0].Avoid, []string{"exercise", "drill"}) {
		t.Fatalf("%+v", r.Terms)
	}
	if !reflect.DeepEqual(r.Ambiguous, []home.GlossaryAmbiguous{{Word: "status", Line: 24}}) {
		t.Fatalf("%+v", r.Ambiguous)
	}
}

func TestGlossaryAmbiguousSectionIsOptional(t *testing.T) { // "the 歧义词 section is optional"
	if !home.CheckGlossary(strings.Split(glossaryGood, "## 歧义词")[0]).Valid {
		t.Fatal("invalid")
	}
}

func TestGlossaryDecimalsAndVersionNumbersDoNotSplitSentences(t *testing.T) { // "decimals and version numbers do not split sentences"
	for text, want := range map[string]int{"1–6、0.5 步进，v2.0 起生效。": 1, "一句。两句！三句？": 3, "One. Two. Three": 3, "没有句号也算一句": 1} {
		if got := home.CountSentences(text); got != want {
			t.Errorf("%q → %d, want %d", text, got, want)
		}
	}
}

func TestGlossaryAvoidListsSplitOnAnySeparatorAndDropParentheticals(t *testing.T) { // "avoid lists split on any separator and drop parentheticals"
	if got := home.AvoidWords("a, b，c、d（说明，带逗号）"); !reflect.DeepEqual(got, []string{"a", "b", "c", "d"}) {
		t.Fatal(got)
	}
}

func TestGlossaryForbiddenShapesAreRefused(t *testing.T) { // the six "… in a definition are refused" cases
	for _, c := range []struct{ name, line, re string }{
		{"backticks", "学生的一次提交，存在 `recordings` 表。", "反引号"},
		{"links", "见 [domain](docs/domain/x.md)。", "链接"},
		{"bare URLs", "见 https://example.com。", "链接"},
		{"file paths", "以 backend/app/scoring.py 为准。", "文件路径"},
		{"relative paths", "见 ./docs 下的说明。", "文件路径"},
		{"value mappings", "四种之一：2=listen_repeat、3=interview。", "取值映射"},
	} {
		if !hasErr(bend("学生可以做的一条练习，属于四种题型之一。", c.line), c.re) {
			t.Errorf("%s not refused", c.name)
		}
	}
}

func TestGlossaryValueMappingLookbehindStillHolds(t *testing.T) { // the JS regex had a lookbehind (?<![\w.]); RE2 has none, so it is done by hand
	for line, want := range map[string]bool{
		"2=a": true, "类型 2=a": true, "x1=2": false, "v1.2=3": false, "a_1=b": false, "x1=2=3": true, "没有 12 ＝ 好": true, "key=value": false,
	} {
		md := bend("学生可以做的一条练习，属于四种题型之一。", line)
		if got := hasErr(md, "取值映射"); got != want {
			t.Errorf("%q: refused %v, want %v", line, got, want)
		}
	}
}

func TestGlossaryASlashBetweenWordsIsNotAPath(t *testing.T) { // "a slash between words is not a path"
	if !home.CheckGlossary(bend("属于四种题型之一。", "属于听/说/读/写四种之一。")).Valid {
		t.Fatal("refused")
	}
}

func TestGlossaryStructureErrors(t *testing.T) { // the structure tests of the old file
	cases := []struct{ name, md, re string }{
		{"missing H1", strings.Replace(glossaryGood, "# Acme Shop\n", "", 1), "缺一级标题"},
		{"a second H1", glossaryGood + "\n# Another\n", "一级标题只能有一个"},
		{"content before the H1", "> note\n\n" + glossaryGood, "一级标题之前不能有内容"},
		{"no description", bend("在线商店，顾客下单、查看账单。", ""), "缺一到两句描述"},
		{"description too long", bend("在线商店，顾客下单、查看账单。", "一。二。三。"), "描述超过 2 句"},
		{"an H2 outside the closed set", glossaryGood + "\n## Flagged ambiguities\n", "不能是「Flagged ambiguities」"},
		{"no 术语 section", bend("## 术语", "## Language"), "缺「## 术语」"},
		{"歧义词 before 术语", "# T\n\n描述。\n\n## 歧义词\n\n- **status**：说明。\n\n## 术语\n\n**A**：\n定义。\n", "顺序不对"},
		{"H4", bend("### 学生应用", "#### 学生应用"), "不允许 #### 级标题"},
	}
	for _, c := range cases {
		if !hasErr(c.md, c.re) {
			t.Errorf("%s: %v", c.name, home.CheckGlossary(c.md).Errors)
		}
	}
}

func TestGlossaryTermEntryErrors(t *testing.T) { // the term-entry tests of the old file
	cases := []struct{ name, md, re string }{
		{"a definition over two sentences", bend("学生可以做的一条练习，属于四种题型之一。", "一。二。三。"), "「Practice」的定义超过 2 句"},
		{"an empty definition", bend("学生可以做的一条练习，属于四种题型之一。\n", ""), "「Practice」缺定义"},
		{"anything after _Avoid_", bend("_Avoid_: exercise, drill", "_Avoid_: exercise, drill\n多写的一段机制说明。"), "多余内容"},
		{"a paragraph after a blank line", bend("属于四种题型之一。\n", "属于四种题型之一。\n\n另起一段。\n"), "多余内容"},
		{"a stray line under 术语", bend("### 学生应用\n", "### 学生应用\n\n这一组讲学生侧。\n"), "不属于任何词条"},
		{"two _Avoid_ lines", bend("_Avoid_: exercise, drill", "_Avoid_: exercise\n_Avoid_: drill"), "两行 _Avoid_"},
		{"an empty _Avoid_", bend("_Avoid_: exercise, drill", "_Avoid_:"), "_Avoid_ 是空的"},
		{"a duplicate term, case-insensitively", strings.Replace(glossaryGood, "## 歧义词", "**practice**：\n重复。\n\n## 歧义词", 1), "「practice」重复"},
		{"a term that is also someone's _Avoid_", bend("_Avoid_: exercise, drill", "_Avoid_: exercise, Speaking band"), "既是标准叫法又被弃用"},
	}
	for _, c := range cases {
		if !hasErr(c.md, c.re) {
			t.Errorf("%s: %v", c.name, home.CheckGlossary(c.md).Errors)
		}
	}
	if got := home.CheckGlossary(glossaryGood).Terms[2].Definition; got != "一个订单被归到的处理环节。 三层之一：仓储、物流、配送。" {
		t.Fatalf("a definition wrapped across lines is joined before counting: %q", got)
	}
}

func TestGlossaryAmbiguousItemErrors(t *testing.T) { // the 歧义词 tests of the old file
	if !hasErr(bend("- **status**：", `- **"status" 单独出现** —— `), "只放列表项") {
		t.Error("not a list item")
	}
	if !home.CheckGlossary(bend("单独说不成立，必须带上实体名。", "\n  单独说不成立。")).Valid {
		t.Error("an indented continuation line belongs to the item above")
	}
	if !hasErr(bend("单独说不成立，必须带上实体名。", "二。三。"), "「status」的说明超过 2 句") {
		t.Error("over two sentences")
	}
	if !hasErr(glossaryGood+"- **Status**：又一条。\n", "「Status」重复") {
		t.Error("duplicated")
	}
}

// ---- the command and the hook ----

func (w world) glossaryFile(t *testing.T, name, text string) string {
	write(t, w.root, name, text)
	return filepath.Join(w.root, name)
}

func TestGlossaryCommandExitCodesAndOutput(t *testing.T) {
	w := newWorld(t, opts{})
	good := w.glossaryFile(t, "good/GLOSSARY.md", glossaryGood)
	bad := w.glossaryFile(t, "bad/GLOSSARY.md", bend("学生可以做的一条练习，属于四种题型之一。", "存在 `recordings` 表。"))
	if r := w.run(w.root, "home", "glossary", "check", good); r.code != 0 || r.out != "glossary-check: green ✓ ("+good+")\n" {
		t.Fatalf("%+v", r)
	}
	r := w.run(w.root, "home", "glossary", "check", bad)
	if r.code != 2 || !strings.HasPrefix(r.out, "glossary-check: 1 处不符合 skills/productivity/glossary/SKILL.md 的「文件与格式」 ("+bad+")：\n  - 第 ") || r.err != "" {
		t.Fatalf("%+v", r)
	}
	var parsed home.GlossaryResult
	j := w.run(w.root, "home", "glossary", "check", bad, "--json")
	if j.code != 2 || json.Unmarshal([]byte(j.out), &parsed) != nil || parsed.Valid || len(parsed.Terms) != 3 {
		t.Fatalf("%+v", j)
	}
	if w.run(w.root, "home", "glossary", "check").code != 1 || w.run(w.root, "home", "glossary", "check", filepath.Join(w.root, "no-such")).code != 1 {
		t.Fatal("no file / unreadable file exit 1")
	}
}

func hookEvent(path string) string {
	b, _ := json.Marshal(map[string]any{"tool_name": "Write", "tool_input": map[string]any{"file_path": path}})
	return string(b)
}

func TestGlossaryHookRepliesOnlyForABrokenGlossaryMd(t *testing.T) {
	w := newWorld(t, opts{})
	good := w.glossaryFile(t, "good/GLOSSARY.md", glossaryGood)
	bad := w.glossaryFile(t, "bad/GLOSSARY.md", bend("学生可以做的一条练习，属于四种题型之一。", "存在 `recordings` 表。"))
	other := w.glossaryFile(t, "bad/NOTES.md", "`x`\n")
	for name, stdin := range map[string]string{
		"a valid glossary": hookEvent(good), "another file": hookEvent(other), "no file": hookEvent(filepath.Join(w.root, "no", "GLOSSARY.md")),
		"not JSON": "not json", "empty": "", "no tool_input": `{"tool_name":"Write"}`,
	} {
		if r := w.runWith(w.root, stdin, nil, "home", "glossary", "check", "--hook"); r.code != 0 || r.out != "" || r.err != "" {
			t.Errorf("%s: %+v", name, r)
		}
	}
	r := w.runWith(w.root, hookEvent(bad), nil, "home", "glossary", "check", "--hook")
	if r.code != 2 || r.out != "" || !strings.Contains(r.err, "改到通过再继续") || !strings.Contains(r.err, "出现反引号") {
		t.Fatalf("%+v", r)
	}
}

func TestGlossaryHookAnswersTheSameAsTheOldHook(t *testing.T) { // acceptance: the reply to one hook event is the old hook's
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node is needed to run the old script")
	}
	w := newWorld(t, opts{})
	good := w.glossaryFile(t, "good/GLOSSARY.md", glossaryGood)
	bad := w.glossaryFile(t, "bad/GLOSSARY.md", bend("学生可以做的一条练习，属于四种题型之一。", "存在 `recordings` 表。\n见 https://example.com。"))
	other := w.glossaryFile(t, "bad/NOTES.md", "`x`\n")
	for _, event := range []string{hookEvent(good), hookEvent(bad), hookEvent(other), hookEvent(filepath.Join(w.root, "gone", "GLOSSARY.md")), "not json", `{"tool_name":"Write"}`} {
		cmd := exec.Command(node, filepath.Join("..", "..", "..", "idea-loop", "scripts", "glossary-check-hook.mjs"))
		cmd.Stdin = strings.NewReader(event)
		var stderr strings.Builder
		cmd.Stderr = &stderr
		oldOut, _ := cmd.Output()
		oldCode := cmd.ProcessState.ExitCode()
		r := w.runWith(w.root, event, nil, "home", "glossary", "check", "--hook")
		if r.code != oldCode || r.err != stderr.String() || r.out != string(oldOut) {
			t.Errorf("%s:\nold (%d): %q\ndyna (%d): %q", event, oldCode, stderr.String(), r.code, r.err)
		}
	}
}

func TestGlossaryCheckIsTheOldScriptsOutputOnTheSameFile(t *testing.T) {
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node is needed to run the old script")
	}
	w := newWorld(t, opts{})
	mess := "前面有内容\n# T\n\n一。二。三。\n\n## 术语\n\n**A**：\n定义 `x` 路径 a/b.md 2=b。\n_Avoid_:\n多余\n\n#### 深\n\n## 歧义词\n\n- **w**：\n乱写\n"
	for name, text := range map[string]string{"good": glossaryGood, "mess": mess, "empty": ""} {
		file := w.glossaryFile(t, name+"/GLOSSARY.md", text)
		for _, extra := range [][]string{nil, {"--json"}} {
			cmd := exec.Command(node, append([]string{filepath.Join("..", "..", "..", "idea-loop", "scripts", "glossary-check.mjs"), file}, extra...)...)
			old, _ := cmd.Output()
			oldCode := cmd.ProcessState.ExitCode()
			r := w.run(w.root, append([]string{"home", "glossary", "check", file}, extra...)...)
			if r.out != string(old) || r.code != oldCode {
				t.Errorf("%s %v:\nold (%d):\n%s\ndyna (%d):\n%s", name, extra, oldCode, old, r.code, r.out)
			}
		}
	}
	_ = os.Stdout
}
