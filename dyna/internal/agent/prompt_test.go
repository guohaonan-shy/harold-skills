package agent

import (
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

// The assertions of the old codex-prompt.test.mjs, one for one, against the real templates in the plugin.

var pluginRoot = filepath.Join("..", "..", "..", "idea-loop")

// userHome is a HOME with (or without) ~/.claude/CLAUDE.md in it.
func userHome(t *testing.T, withRules bool) string {
	t.Helper()
	home := t.TempDir()
	if withRules {
		if err := os.MkdirAll(filepath.Join(home, ".claude"), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(home, ".claude", "CLAUDE.md"), []byte("# 我的规矩\n"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	return home
}

func fill(t *testing.T, axis string, extra map[string]string) (string, error) {
	t.Helper()
	template, err := os.ReadFile(TemplatePath(pluginRoot, axis))
	if err != nil {
		t.Fatal(err)
	}
	keys, values := Builtin(pluginRoot, userHome(t, true))
	builtin := append([]string{}, keys...)
	for _, k := range []string{"worktree", "base", "wontfix"} {
		keys = append(keys, k)
	}
	values["worktree"], values["base"], values["wontfix"] = "/w", "abc123", "无"
	for k, v := range extra {
		if _, had := values[k]; !had {
			keys = append(keys, k)
		}
		values[k] = v
	}
	return Render(string(template), keys, values, builtin)
}

func TestBothTemplatesFillCompletelyFromThePerRunReferences(t *testing.T) {
	spec, err := fill(t, "spec", map[string]string{"spec": "docs/spec/a/a.md", "tickets": "docs/spec/a/tickets/"})
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"git diff abc123...HEAD", "docs/spec/a/a.md"} {
		if !strings.Contains(spec, want) {
			t.Errorf("the Spec prompt has no %q", want)
		}
	}
	if strings.Contains(spec, "{{") {
		t.Error("a placeholder is left in the Spec prompt")
	}
	standards, err := fill(t, "standards", map[string]string{"rules": "`CODING_STANDARDS.md`、`REVIEW.md`", "checks": ".tmp/pr-review/7/round-1/checks.md"})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(standards, "CODING_STANDARDS.md") || strings.Contains(standards, "{{") {
		t.Errorf("the Standards prompt is not filled: %s", standards)
	}
}

func TestTheBuiltInPathsPointAtFilesThatExist(t *testing.T) {
	_, values := Builtin(pluginRoot, userHome(t, true))
	for k, p := range values {
		if _, err := os.Stat(p); err != nil {
			t.Errorf("%s: %v", k, err)
		}
	}
	for _, axis := range Axes {
		if _, err := os.Stat(TemplatePath(pluginRoot, axis)); err != nil {
			t.Error(err)
		}
	}
}

func TestAPlaceholderLeftEmptyOrAKeyTheTemplateDoesNotUseIsRefused(t *testing.T) {
	if _, err := fill(t, "spec", map[string]string{"tickets": "x"}); err == nil || !strings.Contains(err.Error(), "没给：spec") {
		t.Errorf("an unfilled placeholder: %v", err)
	}
	if _, err := fill(t, "spec", map[string]string{"spec": "x", "tickets": "x", "rules": "y"}); err == nil || !strings.Contains(err.Error(), "模板里没有：rules") {
		t.Errorf("an unused key: %v", err)
	}
}

func TestRefusalNamesEveryProblemAtOnce(t *testing.T) {
	_, err := fill(t, "spec", map[string]string{"extra1": "a", "extra2": "b"})
	if err == nil {
		t.Fatal("expected a refusal")
	}
	for _, want := range []string{"拒绝：", "没给：", "spec", "tickets", "模板里没有：extra1, extra2"} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("the refusal %q lacks %q", err.Error(), want)
		}
	}
}

func TestFillPromptWritesTheFileAndRefusesABadPair(t *testing.T) {
	out := filepath.Join(t.TempDir(), "p.md")
	pairs := []string{"worktree=/w", "base=abc123", "spec=docs/spec/a/a.md", "tickets=docs/spec/a/tickets/", "wontfix=无"}
	if err := FillPrompt(pluginRoot, userHome(t, true), "spec", out, pairs); err != nil {
		t.Fatal(err)
	}
	b, _ := os.ReadFile(out)
	if !strings.Contains(string(b), "docs/spec/a/a.md") || strings.Contains(string(b), "{{") {
		t.Errorf("the written prompt is not filled: %s", b)
	}
	if err := FillPrompt(pluginRoot, userHome(t, true), "spec", out, []string{"nokeyvalue"}); err == nil || !strings.Contains(err.Error(), "不是 key=value") {
		t.Errorf("a bad pair: %v", err)
	}
	if err := FillPrompt(pluginRoot, userHome(t, true), "other", out, nil); err == nil || !strings.Contains(err.Error(), "用法") {
		t.Errorf("a bad axis: %v", err)
	}
}

func TestTheCodexReviewerIsPointedAtTheReviewStandardsAndTheUsersRules(t *testing.T) {
	keys, values := Builtin(pluginRoot, userHome(t, true))
	if !reflect.DeepEqual(keys, []string{"standards", "review_standards", "user_rules"}) {
		t.Fatal(keys)
	}
	if _, old := values["decision_rules"]; old {
		t.Fatal("the old key is gone")
	}
	if values["review_standards"] != values["standards"] || !strings.HasSuffix(values["review_standards"], "skills/engineering/pr-review/references/review-standards.md") {
		t.Fatalf("review_standards: %s", values["review_standards"])
	}
	for axis, extra := range map[string]map[string]string{
		"spec":      {"spec": "docs/spec/a/a.md", "tickets": "docs/spec/a/tickets/"},
		"standards": {"rules": "r", "checks": "c"},
	} {
		prompt, err := fill(t, axis, extra)
		if err != nil {
			t.Fatalf("%s: %v", axis, err)
		}
		if strings.Contains(prompt, "decision") || !strings.Contains(prompt, values["review_standards"]) || !strings.Contains(prompt, ".claude/CLAUDE.md") {
			t.Errorf("%s prompt does not name the review standards and the user's rules:\n%s", axis, prompt)
		}
	}
}

func TestUserRulesIsThePathOfTheUsersClaudeMdOrNoneWhenItIsNotThere(t *testing.T) {
	home := userHome(t, true)
	_, values := Builtin(pluginRoot, home)
	if want := filepath.Join(home, ".claude", "CLAUDE.md"); values["user_rules"] != want {
		t.Fatalf("%s", values["user_rules"])
	}
	_, values = Builtin(pluginRoot, userHome(t, false))
	if values["user_rules"] != "无" {
		t.Fatalf("%q", values["user_rules"])
	}
	// no HOME at all is the same as no file
	if _, values = Builtin(pluginRoot, ""); values["user_rules"] != "无" {
		t.Fatalf("%q", values["user_rules"])
	}
	// and a prompt is still filled, not refused
	out := filepath.Join(t.TempDir(), "p.md")
	pairs := []string{"worktree=/w", "base=abc", "spec=docs/spec/a/a.md", "tickets=docs/spec/a/tickets/", "wontfix=无"}
	if err := FillPrompt(pluginRoot, userHome(t, false), "spec", out, pairs); err != nil {
		t.Fatal(err)
	}
	b, _ := os.ReadFile(out)
	if !strings.Contains(string(b), "用户规则：无") || strings.Contains(string(b), "{{") {
		t.Fatalf("%s", b)
	}
}

func TestAValueMayCarryDollarSignsAndBracesLiterally(t *testing.T) {
	got, err := Render("a {{x}} b", []string{"x"}, map[string]string{"x": "$1 ${y} {{z}}"}, nil)
	if err != nil || got != "a $1 ${y} {{z}} b" {
		t.Errorf("got %q, %v", got, err)
	}
}
