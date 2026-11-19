package agent

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// The assertions of the old codex-prompt.test.mjs, one for one, against the real templates in the plugin.

var pluginRoot = filepath.Join("..", "..", "..", "idea-loop")

func fill(t *testing.T, axis string, extra map[string]string) (string, error) {
	t.Helper()
	template, err := os.ReadFile(TemplatePath(pluginRoot, axis))
	if err != nil {
		t.Fatal(err)
	}
	keys, values := Builtin(pluginRoot)
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
	_, values := Builtin(pluginRoot)
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
	if err := FillPrompt(pluginRoot, "spec", out, pairs); err != nil {
		t.Fatal(err)
	}
	b, _ := os.ReadFile(out)
	if !strings.Contains(string(b), "docs/spec/a/a.md") || strings.Contains(string(b), "{{") {
		t.Errorf("the written prompt is not filled: %s", b)
	}
	if err := FillPrompt(pluginRoot, "spec", out, []string{"nokeyvalue"}); err == nil || !strings.Contains(err.Error(), "不是 key=value") {
		t.Errorf("a bad pair: %v", err)
	}
	if err := FillPrompt(pluginRoot, "other", out, nil); err == nil || !strings.Contains(err.Error(), "用法") {
		t.Errorf("a bad axis: %v", err)
	}
}

func TestAValueMayCarryDollarSignsAndBracesLiterally(t *testing.T) {
	got, err := Render("a {{x}} b", []string{"x"}, map[string]string{"x": "$1 ${y} {{z}}"}, nil)
	if err != nil || got != "a $1 ${y} {{z}} b" {
		t.Errorf("got %q, %v", got, err)
	}
}
