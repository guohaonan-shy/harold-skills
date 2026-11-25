package spec_test

import (
	"encoding/json"
	"path/filepath"
	"strings"
	"testing"
)

const sevenSections = "## 问题陈述\n\n现状。\n\n## 方案\n\n做法。\n\n## User Stories\n\n1. 作为用户，我想要……\n\n## 实现决策\n\n无。\n\n## 测试决策\n\n无。\n\n## Out of scope\n\n无。\n\n## 关联\n\n无。\n"

func specText(extraFrontmatter, body string) string {
	return "---\ntype: spec\nsummary: 重试不消耗配额\nissues: [3]\n" + extraFrontmatter + "---\n\n# 重试不消耗配额\n\n" + body
}

// checkHook writes the file and feeds the PostToolUse event of that write to `spec check --hook`.
func checkHook(t *testing.T, path, text string) (string, int) {
	t.Helper()
	writeFile(t, path, text)
	out, errs, code := runWith(t, event(path), nil, "spec", "check", "--hook")
	if out != "" {
		t.Fatalf("a hook prints nothing on stdout: %q", out)
	}
	if code == 0 && errs != "" {
		t.Fatalf("a clean or out-of-scope file is silent: %q", errs)
	}
	return errs, code
}

func specPath(t *testing.T) (docs, spec string) {
	t.Helper()
	docs = filepath.Join(realDir(t), "docs")
	return docs, filepath.Join(docs, "spec", "practice-retry", "practice-retry.md")
}

func TestCheckHookIsSilentOnASpecWithTheSevenSectionsInOrder(t *testing.T) {
	_, f := specPath(t)
	if errs, code := checkHook(t, f, specText("", sevenSections)); code != 0 || errs != "" {
		t.Fatalf("%d %q", code, errs)
	}
}

func TestCheckHookReportsTheOrderWhenPlanAndUserStoriesAreSwapped(t *testing.T) {
	_, f := specPath(t)
	body := strings.Replace(sevenSections, "## 方案", "## @@", 1)
	body = strings.Replace(body, "## User Stories", "## 方案", 1)
	body = strings.Replace(body, "## @@", "## User Stories", 1)
	errs, code := checkHook(t, f, specText("", body))
	if code != 2 || !strings.Contains(errs, "顺序错") || !strings.Contains(errs, "照 idea-loop:to-spec 的模板补") || !strings.Contains(errs, f) {
		t.Fatalf("%d %q", code, errs)
	}
}

func TestCheckHookReportsAMissingSection(t *testing.T) {
	_, f := specPath(t)
	errs, code := checkHook(t, f, specText("", strings.Replace(sevenSections, "## 关联\n\n无。\n", "", 1)))
	if code != 2 || !strings.Contains(errs, "缺 「关联」 节") || !strings.Contains(errs, "照 idea-loop:to-spec 的模板补") {
		t.Fatalf("%d %q", code, errs)
	}
}

func TestCheckHookNeedsTheDiagnosisSectionOnlyWhenTheSpecChangesAgentDocs(t *testing.T) {
	_, f := specPath(t)
	marked := "changes_agent_docs: true\n"
	errs, code := checkHook(t, f, specText(marked, sevenSections))
	if code != 2 || !strings.Contains(errs, "杠杆诊断") || !strings.Contains(errs, "照 idea-loop:to-spec 的模板补") {
		t.Fatalf("%d %q", code, errs)
	}
	withSection := strings.Replace(sevenSections, "## User Stories", "### 杠杆诊断\n\n改一处。验证：检查。\n\n## User Stories", 1)
	if errs, code := checkHook(t, f, specText(marked, withSection)); code != 0 || errs != "" {
		t.Fatalf("a ### 杠杆诊断 section is enough: %d %q", code, errs)
	}
	if errs, code := checkHook(t, f, specText("", sevenSections)); code != 0 || errs != "" {
		t.Fatalf("no marker and no section: %d %q", code, errs)
	}
}

func TestCheckHookIsSilentForARawDiscussionAndForATicketUnderTheSpec(t *testing.T) {
	docs, spec := specPath(t)
	broken := specText("changes_agent_docs: true\n", "## 方案\n\n只有一节。\n")
	for _, f := range []string{
		filepath.Join(docs, "raw", "discussions", "practice-retry", "practice-retry.md"),
		filepath.Join(docs, "raw", "decisions", "451.md"),
		filepath.Join(filepath.Dir(spec), "tickets", "01-retry.md"),
		filepath.Join(filepath.Dir(spec), "notes.md"),
		filepath.Join(docs, "spec", "index.md"),
	} {
		if errs, code := checkHook(t, f, broken); code != 0 || errs != "" {
			t.Errorf("%s: %d %q", f, code, errs)
		}
	}
}

func TestCheckHookIsSilentForAnEventItCannotReadAndForAFileThatIsGone(t *testing.T) {
	_, f := specPath(t)
	for name, stdin := range map[string]string{
		"not json":     "not json",
		"no file_path": `{"tool_input":{}}`,
		"not a string": `{"tool_input":{"file_path":3}}`,
		"gone":         string(mustJSON(t, map[string]any{"tool_input": map[string]any{"file_path": f}})),
	} {
		out, errs, code := runWith(t, stdin, nil, "spec", "check", "--hook")
		if out != "" || errs != "" || code != 0 {
			t.Errorf("%s: %q %q %d", name, out, errs, code)
		}
	}
}

func mustJSON(t *testing.T, v any) []byte {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func TestCheckOfTheWholeDocsReportsTheSameTwoProblemsWithoutTheHookFlag(t *testing.T) {
	docs, f := specPath(t)
	writeFile(t, f, specText("changes_agent_docs: true\n", strings.Replace(sevenSections, "## 关联\n\n无。\n", "", 1)))
	out, errs, code := runWith(t, "", nil, "spec", "check", docs)
	if code != 0 || errs != "" {
		t.Fatalf("%d %q", code, errs)
	}
	var got struct{ Problems []string }
	if err := json.Unmarshal([]byte(out), &got); err != nil {
		t.Fatal(err, out)
	}
	if len(got.Problems) != 2 || !strings.Contains(got.Problems[0], "缺 「关联」 节") || !strings.Contains(got.Problems[1], "杠杆诊断") {
		t.Fatalf("%v", got.Problems)
	}
}

func TestTheRegistryHasSpecCheckWithAHookFlagForSessionsToo(t *testing.T) {
	out, errs, code := run(t, "registry", "--json")
	if code != 0 {
		t.Fatal(errs)
	}
	var reg struct {
		Commands []struct {
			Command, Caller string
			Args            []struct{ Name, Kind string }
		}
	}
	if err := json.Unmarshal([]byte(out), &reg); err != nil {
		t.Fatal(err)
	}
	for _, c := range reg.Commands {
		if c.Command != "spec check" {
			continue
		}
		var names []string
		for _, a := range c.Args {
			names = append(names, a.Kind+":"+a.Name)
		}
		// sessions run it too (to-spec, to-ticket, implement read it), so it is not a hook-only command
		if c.Caller != "session" || strings.Join(names, ",") != "positional:docs,flag:hook" {
			t.Fatalf("%+v", c)
		}
		return
	}
	t.Fatal("spec check is not in the registry")
}
