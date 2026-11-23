package spec

import "testing"

// The adapter layer is exempt by its path under the plugin root, whatever the scope of the lint is today: these
// are reference files, which the lint does not reach yet; the list says what the tripwire would let through.
func TestLintTextLetsTheAdapterLayerNameHostCommandsAndNoOtherFile(t *testing.T) {
	text := "先看 `gh issue view 1` 再 `git checkout -B x`\n"
	for rel := range adapterLayer {
		if got := LintText(rel, text, rel, true); len(got) != 0 {
			t.Errorf("%s: %v", rel, got)
		}
	}
	if got := LintText("skills/x/SKILL.md", text, "skills/x/SKILL.md", true); len(got) != 2 {
		t.Errorf("a skill is not on the list: %v", got)
	}
	if len(adapterLayer) < 4 {
		t.Errorf("the issues GitHub reference and the three setup templates are on the list: %v", adapterLayer)
	}
	for rel, why := range adapterLayer {
		if why == "" {
			t.Errorf("%s has no reason", rel)
		}
	}
}
