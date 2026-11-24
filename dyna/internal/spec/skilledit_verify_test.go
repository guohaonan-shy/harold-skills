package spec_test

import (
	"path/filepath"
	"strings"
	"testing"
)

// A repository whose one commit has the shape of the real commit b6e55944 (the rule on what a drafted spec hands to
// the person): two skill-like files and a ticket file, no case directory. A second commit adds the same two files
// again together with a retro case directory, so a hand-back can name a case the tree holds.
func verifyRepo(t *testing.T) (dir, plain, withCase string) {
	t.Helper()
	dir = t.TempDir()
	git(t, dir, "init", "-q", "-b", "main")
	writeFile(t, filepath.Join(dir, "README.md"), "0\n")
	git(t, dir, "add", ".")
	git(t, dir, "commit", "-q", "-m", "init")
	write := func(extra map[string]string, msg string) string {
		writeFile(t, filepath.Join(dir, "idea-loop/skills/engineering/to-spec/SKILL.md"), msg+"\n")
		writeFile(t, filepath.Join(dir, "idea-loop/skills/engineering/issue-session/references/draft-spec.md"), msg+"\n")
		writeFile(t, filepath.Join(dir, "docs/spec/edge-case-known-limit/tickets/02-delete-decision-rules.md"), msg+"\n")
		for p, text := range extra {
			writeFile(t, filepath.Join(dir, p), text)
		}
		git(t, dir, "add", ".")
		git(t, dir, "commit", "-q", "-m", msg+"\n\nTicket: 02-delete-decision-rules")
		return git(t, dir, "rev-parse", "HEAD")
	}
	plain = write(nil, "plain")
	withCase = write(map[string]string{"idea-loop/evals/retro/cases/to-spec-verify-line/case.json": "{}\n"}, "with case")
	return dir, plain, withCase
}

const (
	vStandards = "读了哪几份写法规范 | 调 | writing-for-agents\n"
	vLeverA    = "杠杆 | idea-loop/skills/engineering/issue-session/references/draft-spec.md | 就近归置\n"
	vLeverB    = "杠杆 | idea-loop/skills/engineering/to-spec/SKILL.md | 就近归置\n"
	vRowA      = "验证 | idea-loop/skills/engineering/issue-session/references/draft-spec.md | 不改行为 | 只改措辞 | 过\n"
)

func TestSkillEditOnAHandBackWithOnlyLeverRowsExitsTwoNamingEachFileWithNoVerifyRow(t *testing.T) {
	dir, plain, _ := verifyRepo(t)
	t.Chdir(dir)
	hb := filepath.Join(t.TempDir(), "handback.txt")
	// the shape of every hand-back before the verify line: standards line, one lever row per file, 「不涉及：只改措辞」
	writeFile(t, hb, "verified:\n  - "+vStandards+"  - "+vLeverA+"  - "+vLeverB+"  - 不涉及 | 只改措辞 | 行为没变\n")
	out, errs, code := run(t, "spec", "skill-edit", plain, hb)
	if code != 2 || errs != "" {
		t.Fatalf("%q %q %d", out, errs, code)
	}
	lines := strings.Split(strings.TrimSpace(out), "\n")
	if len(lines) != 2 ||
		!strings.Contains(lines[0], "idea-loop/skills/engineering/issue-session/references/draft-spec.md 没有验证行") ||
		!strings.Contains(lines[1], "idea-loop/skills/engineering/to-spec/SKILL.md 没有验证行") {
		t.Fatalf("%q", out)
	}
}

func TestSkillEditOnTheSameCommitPassesOnceEveryChangedFileHasItsVerifyRow(t *testing.T) {
	dir, plain, _ := verifyRepo(t)
	t.Chdir(dir)
	hb := filepath.Join(t.TempDir(), "handback.txt")
	writeFile(t, hb, vStandards+vLeverA+vLeverB+vRowA+
		"验证 | idea-loop/skills/engineering/to-spec/SKILL.md | 判不了 | 没有历史原话可回放 | 无\n")
	out, errs, code := run(t, "spec", "skill-edit", plain, hb)
	if code != 0 || errs != "" || out != "ok: 2 个 skill、agent 定义或 skill 参考文件，写法规范、杠杆行、验证行都齐\n" {
		t.Fatalf("%q %q %d", out, errs, code)
	}
}

func TestSkillEditChecksTheCaseDirectoryAgainstTheTreeOfTheCommitItIsGiven(t *testing.T) {
	dir, plain, withCase := verifyRepo(t)
	t.Chdir(dir)
	hb := filepath.Join(t.TempDir(), "handback.txt")
	writeFile(t, hb, vStandards+vLeverA+vLeverB+vRowA+
		"验证 | idea-loop/skills/engineering/to-spec/SKILL.md | 目标用例 | to-spec-verify-line | 过\n")
	out, _, code := run(t, "spec", "skill-edit", plain, hb)
	if code != 2 || !strings.Contains(out, "「to-spec-verify-line」") || !strings.Contains(out, "仓库树里没有") {
		t.Fatalf("%q %d", out, code)
	}
	out, errs, code := run(t, "spec", "skill-edit", withCase, hb)
	if code != 0 || errs != "" || !strings.HasPrefix(out, "ok: 2 个") {
		t.Fatalf("%q %q %d", out, errs, code)
	}
}

func TestSkillEditHelpSaysItAlsoChecksTheVerifyRows(t *testing.T) {
	out, _, code := run(t, "registry", "--json")
	if code != 0 || !strings.Contains(out, "验证行") {
		t.Fatalf("%d %q", code, out)
	}
}
