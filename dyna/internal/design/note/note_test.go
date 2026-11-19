package note

import (
	"bytes"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/nexterr"
)

// composition is the list a chosen variant carries inside 「变种裁决」; every item ends in a provenance marker.
func composition(skip ...string) string {
	lines := []string{"  **构成**（B）："}
	for _, c := range Composition {
		if contains(skip, c) {
			continue
		}
		text := c + " 的写法"
		if c == "颜色" {
			text = "待打磨"
		}
		mark := "人选定"
		if c == "指向" {
			mark = "模型代填"
		}
		lines = append(lines, fmt.Sprintf("  - %s：%s（%s）", c, text, mark))
	}
	return strings.Join(lines, "\n")
}

var verdict = "- **B「对话气泡」** —— 赌的是说明贴着按钮出现。**选中**。\n" + composition() + "\n- **A「顶部横幅」** —— **落选**。"

// body is the default body for a section; 「变种裁决」 carries the composition list.
func body(s string) string {
	if s == "变种裁决" {
		return verdict
	}
	return s + " 的正文。"
}

// note is a well-formed note; every test starts from this and bends one thing.
func note(over map[string]string) string {
	var parts []string
	for _, s := range Sections {
		b, ok := over[s]
		if !ok {
			b = body(s)
		}
		parts = append(parts, "## "+s+"\n\n"+b)
	}
	return strings.Join(parts, "\n\n")
}

func TestTheSevenSectionsInOrderEachWithABodyIsAValidNote(t *testing.T) {
	r := Check(note(nil))
	if !r.Valid || len(r.Errors) != 0 || len(r.Missing) != 0 || r.Level != 2 {
		t.Fatalf("%+v", r)
	}
}

func TestDroppingASectionFailsTheCheckAndNamesIt(t *testing.T) {
	for _, dropped := range Sections {
		var parts []string
		for _, s := range Sections {
			if s != dropped {
				parts = append(parts, "## "+s+"\n\n"+s+" 的正文。")
			}
		}
		r := Check(strings.Join(parts, "\n\n"))
		named := false
		for _, e := range r.Errors {
			named = named || strings.Contains(e, dropped)
		}
		if r.Valid || len(r.Missing) != 1 || r.Missing[0] != dropped || !named {
			t.Errorf("dropping 「%s」: %+v", dropped, r)
		}
	}
}

func TestASectionWithAHeadingButNoBodyIsReportedEmpty(t *testing.T) {
	var parts []string
	for _, s := range Sections {
		if s == "待打磨清单" {
			parts = append(parts, "## "+s+"\n")
		} else {
			parts = append(parts, "## "+s+"\n\n"+body(s))
		}
	}
	r := Check(strings.Join(parts, "\n\n"))
	ok := false
	for _, e := range r.Errors {
		ok = ok || (strings.Contains(e, "待打磨清单") && strings.Contains(e, "空"))
	}
	if r.Valid || !ok {
		t.Fatalf("%+v", r)
	}
}

func TestTheNoteSurvivesBeingDemotedOneLevelIntoTheSpec(t *testing.T) {
	var parts []string
	for _, s := range Sections {
		parts = append(parts, "### "+s+"\n\n"+body(s))
	}
	r := Check(strings.Join(parts, "\n\n"))
	if !r.Valid || r.Level != 3 {
		t.Fatalf("%+v", r)
	}
}

func TestTheSevenMustSitAtOneLevel(t *testing.T) {
	var parts []string
	for i, s := range Sections {
		h := "##"
		if i == 3 {
			h = "###"
		}
		parts = append(parts, h+" "+s+"\n\n"+s+" 的正文。")
	}
	r := Check(strings.Join(parts, "\n\n"))
	ok := false
	for _, e := range r.Errors {
		ok = ok || strings.Contains(e, "同一层级")
	}
	if r.Valid || !ok {
		t.Fatalf("%+v", r)
	}
}

func TestOutOfOrderFails(t *testing.T) {
	swapped := append([]string{}, Sections...)
	swapped[1], swapped[2] = swapped[2], swapped[1]
	var parts []string
	for _, s := range swapped {
		parts = append(parts, "## "+s+"\n\n"+s+" 的正文。")
	}
	r := Check(strings.Join(parts, "\n\n"))
	ok := false
	for _, e := range r.Errors {
		ok = ok || strings.Contains(e, "顺序")
	}
	if r.Valid || !ok {
		t.Fatalf("%+v", r)
	}
}

func hasError(r Result, parts ...string) bool {
	for _, e := range r.Errors {
		all := true
		for _, p := range parts {
			all = all && strings.Contains(e, p)
		}
		if all {
			return true
		}
	}
	return false
}

func TestADuplicatedSectionIsAnErrorNotASecondChance(t *testing.T) {
	r := Check(note(nil) + "\n\n## 结构\n\n又写了一遍。")
	if r.Valid || !hasError(r, "结构", "重复") {
		t.Fatalf("%+v", r)
	}
}

func TestAStraySiblingSectionAmongTheSevenIsAnError(t *testing.T) {
	r := Check(note(nil) + "\n\n## 参考图\n\n把 contact sheet 贴了进来。")
	if r.Valid || !hasError(r, "参考图") {
		t.Fatalf("%+v", r)
	}
}

func TestSubHeadingsInsideASectionAreFree(t *testing.T) {
	r := Check(note(map[string]string{"变种裁决": "### A · 冷工具\n\n落选：人说太像后台。\n\n" + composition()}))
	if !r.Valid {
		t.Fatalf("%+v", r)
	}
}

func TestAnEmptyNoteReportsAllSevenMissingRatherThanCrashing(t *testing.T) {
	r := Check("")
	if r.Valid || strings.Join(r.Missing, ",") != strings.Join(Sections, ",") || r.Level != 0 {
		t.Fatalf("%+v", r)
	}
}

func TestHeadingsInsideAFencedCodeBlockAreNotSections(t *testing.T) {
	if r := Check(note(nil) + "\n\n```md\n## 意图\n```\n"); !r.Valid {
		t.Fatalf("%+v", r)
	}
}

func TestAChosenVariantWithNoCompositionListFails(t *testing.T) {
	r := Check(note(map[string]string{"变种裁决": "- **B** —— **选中**。人说就这个。"}))
	if r.Valid || !hasError(r, "构成") {
		t.Fatalf("%+v", r)
	}
}

func TestACompositionListWithoutAnItemFailsAndNamesIt(t *testing.T) {
	for _, dropped := range Composition {
		errs := CheckComposition("- **B** —— **选中**。\n" + composition(dropped))
		if len(errs) != 1 || !strings.Contains(errs[0], dropped) {
			t.Errorf("without 「%s」: %v", dropped, errs)
		}
	}
}

func TestParkedIsALegalValue(t *testing.T) {
	if errs := CheckComposition(composition()); len(errs) != 0 {
		t.Fatal(errs)
	}
}

func TestAnItemWithNothingAfterTheColonCountsAsMissing(t *testing.T) {
	errs := CheckComposition(strings.Replace(composition(), "指向：指向 的写法（模型代填）", "指向：", 1))
	if !hasErrIn(errs, "指向") {
		t.Fatal(errs)
	}
}

func hasErrIn(errs []string, parts ...string) bool { return hasError(Result{Errors: errs}, parts...) }

func TestEveryCompositionBlockIsCheckedNotJustTheFirst(t *testing.T) {
	errs := CheckComposition(composition() + "\n- **C** —— **选中**。\n" + composition("颜色"))
	if len(errs) != 1 || !strings.HasPrefix(errs[0], "第 2 份") {
		t.Fatal(errs)
	}
}

func TestEachProvenanceMarkerIsAccepted(t *testing.T) {
	for _, m := range Provenance {
		if errs := CheckComposition(strings.Replace(composition(), "（模型代填）", "（"+m+"）", 1)); len(errs) != 0 {
			t.Errorf("（%s）: %v", m, errs)
		}
	}
}

func TestAnItemWithoutAProvenanceMarkerFailsAndNamesIt(t *testing.T) {
	for _, item := range Composition {
		bare := regexp.MustCompile(`(`+item+`：[^\n]*?)（(?:人选定|模型代填)）`).ReplaceAllString(composition(), "$1")
		errs := CheckComposition("- **B** —— **选中**。\n" + bare)
		if len(errs) != 1 || !strings.Contains(errs[0], "缺来源标记") || !strings.Contains(errs[0], item) {
			t.Errorf("%s: %v", item, errs)
		}
	}
}

func TestAMarkerThatIsNeitherOfTheTwoFailsAndNamesTheItem(t *testing.T) {
	errs := CheckComposition(strings.Replace(composition(), "指向 的写法（模型代填）", "指向 的写法（待定）", 1))
	if len(errs) != 1 || !strings.Contains(errs[0], "来源标记不对") || !strings.Contains(errs[0], "指向（待定）") {
		t.Fatal(errs)
	}
}

func TestParkedWithoutAMarkerFailsToo(t *testing.T) {
	errs := CheckComposition(strings.Replace(composition(), "颜色：待打磨（人选定）", "颜色：待打磨", 1))
	if len(errs) != 1 || !strings.Contains(errs[0], "颜色") {
		t.Fatal(errs)
	}
}

func TestAMarkerInTheMiddleOfTheLineDoesNotCountItGoesAtTheEnd(t *testing.T) {
	errs := CheckComposition(strings.Replace(composition(), "指向：指向 的写法（模型代填）", "指向：（模型代填）指向 的写法", 1))
	if !hasErrIn(errs, "缺来源标记", "指向") {
		t.Fatal(errs)
	}
}

func TestANoteWhoseCompositionListLacksMarkersIsNotValid(t *testing.T) {
	bare := regexp.MustCompile(`（(?:人选定|模型代填)）`).ReplaceAllString(verdict, "")
	r := Check(note(map[string]string{"变种裁决": bare}))
	if r.Valid || !hasError(r, "缺来源标记") {
		t.Fatalf("%+v", r)
	}
}

func TestAHumanKeptLineWrittenUnderAnItemIsNotACompositionItem(t *testing.T) {
	kept := strings.Replace(composition(),
		"  - 容器形状：容器形状 的写法（人选定）",
		"  - 容器形状：容器形状 的写法（人选定）\n    - 人保留（2026-10-19）：评委要把关闭按钮挪到左上，人说保留右上", 1)
	if !strings.Contains(kept, "人保留（2026-10-19）") {
		t.Fatal("the fixture lost its line")
	}
	if errs := CheckComposition(kept); len(errs) != 0 {
		t.Fatal(errs)
	}
	v := "- **B「对话气泡」** —— **选中**。\n" + kept + "\n- **A「顶部横幅」** —— **落选**。"
	if r := Check(note(map[string]string{"变种裁决": v})); !r.Valid {
		t.Fatalf("%+v", r)
	}
}

// ---- the command, on the note's home: docs/design/tmp/<spec-slug>/imagine/direction-note.md ----

func submit(args ...string) (out, errs string, code int) {
	c := Command()
	var o, e bytes.Buffer
	c.SetArgs(args)
	c.SetOut(&o)
	c.SetErr(&e)
	if err := c.Execute(); err != nil {
		var ex *nexterr.Exit
		if errors.As(err, &ex) {
			if ex.Msg != "" {
				e.WriteString(ex.Msg + "\n")
			}
			return o.String(), e.String(), ex.Code
		}
		return o.String(), e.String() + err.Error(), 1
	}
	return o.String(), e.String(), 0
}

// noteAtHome puts a note where uiux-imagine leaves it, in a throwaway project root; returns its path.
func noteAtHome(t *testing.T, md string) string {
	t.Helper()
	file := filepath.Join(t.TempDir(), "docs/design/tmp/cookbook-redesign/imagine/direction-note.md")
	if err := os.MkdirAll(filepath.Dir(file), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(file, []byte(md), 0o644); err != nil {
		t.Fatal(err)
	}
	return file
}

func TestCommandACompleteNoteInTheImagineDirPasses(t *testing.T) {
	file := noteAtHome(t, note(nil))
	out, errs, code := submit(file)
	if code != 0 || !strings.Contains(out, "green") || !strings.Contains(out, "docs/design/tmp/cookbook-redesign/imagine/direction-note.md") {
		t.Fatal(code, out, errs)
	}
}

func TestCommandANoteMissingASectionFailsWithExit2AndNamesTheSection(t *testing.T) {
	file := noteAtHome(t, strings.Replace(note(nil), "## 验收矩阵", "## 别的", 1))
	out, _, code := submit(file, "--json")
	if code != 2 || !strings.Contains(out, "\"missing\": [\n    \"验收矩阵\"\n  ]") {
		t.Fatal(code, out)
	}
	// and says which rule in the words a person reads
	out, _, code = submit(file)
	if code != 2 || !strings.Contains(out, "收工校验失败") || !strings.Contains(out, "  - 缺「验收矩阵」这一节") {
		t.Fatal(code, out)
	}
}

func TestCommandNoPathOrAPathNobodyWroteIsAUsageError(t *testing.T) {
	if _, _, code := submit(); code != 1 {
		t.Fatal(code)
	}
	if _, _, code := submit(filepath.Join(t.TempDir(), "docs/design/tmp/nope/imagine/direction-note.md")); code != 1 {
		t.Fatal(code)
	}
}

func TestCommandJSONOfAValidNote(t *testing.T) {
	out, _, code := submit(noteAtHome(t, note(nil)), "--json")
	if code != 0 || out != "{\n  \"valid\": true,\n  \"errors\": [],\n  \"missing\": [],\n  \"level\": 2\n}\n" {
		t.Fatalf("%d %q", code, out)
	}
	out, _, _ = submit(noteAtHome(t, ""), "--json")
	if !strings.Contains(out, "\"level\": null") {
		t.Fatal(out)
	}
}
