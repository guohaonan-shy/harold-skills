package pr_test

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func gitIn(t *testing.T, dir string, args ...string) string {
	t.Helper()
	cmd := exec.Command("git", append([]string{"-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false"}, args...)...)
	cmd.Dir = dir
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git %v: %v: %s", args, err, out)
	}
	return strings.TrimSpace(string(out))
}

func commitAll(t *testing.T, dir, msg string) {
	t.Helper()
	gitIn(t, dir, "add", "-A")
	gitIn(t, dir, "commit", "-q", "-m", msg)
}

// A SKILL.md or agent definition whose body is `n` CJK characters (3 bytes each) under a heading line "# <title>\n".
func doc(frontmatter, title string, n int) string {
	return "---\n" + frontmatter + "\n---\n# " + title + "\n" + strings.Repeat("字", n) + "\n"
}

// skillGrowthRepo is a repository whose main holds two SKILL.md files, one reference file and one more SKILL.md;
// the branch grows the first, adds an agent definition, edits the reference file, rewrites only the frontmatter of
// the second, and deletes the third.
func skillGrowthRepo(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	gitIn(t, dir, "init", "-q", "-b", "main")
	write(t, filepath.Join(dir, "idea-loop/skills/a/SKILL.md"), doc("name: a", "a", 100))
	write(t, filepath.Join(dir, "idea-loop/skills/b/SKILL.md"), doc("name: b", "b", 100))
	write(t, filepath.Join(dir, "idea-loop/skills/c/SKILL.md"), doc("name: c", "c", 10))
	write(t, filepath.Join(dir, "idea-loop/skills/a/references/more.md"), "# more\n字\n")
	commitAll(t, dir, "init")
	gitIn(t, dir, "checkout", "-q", "-b", "issue/x")
	write(t, filepath.Join(dir, "idea-loop/skills/a/SKILL.md"), doc("name: a", "a", 400))
	write(t, filepath.Join(dir, "idea-loop/agents/new.md"), doc("name: new", "new", 50))
	write(t, filepath.Join(dir, "idea-loop/skills/a/references/more.md"), "# more\n"+strings.Repeat("字", 900)+"\n")
	write(t, filepath.Join(dir, "idea-loop/skills/b/SKILL.md"), doc("name: b\ndescription: a longer description than before", "b", 100))
	if err := os.Remove(filepath.Join(dir, "idea-loop/skills/c/SKILL.md")); err != nil {
		t.Fatal(err)
	}
	commitAll(t, dir, "grow")
	return dir
}

func TestSkillGrowthListsTheMainFilesWhoseBodyChangedAndNothingElse(t *testing.T) {
	dir := skillGrowthRepo(t)
	t.Chdir(dir)
	s := newSession(t)
	out, errs, code := s.run("pr", "skill-growth", "main")
	// a: "# a\n" + 100 字 + "\n" is 105 body characters, 405 after (+300); the agent is new ("# new\n" + 50 字 + "\n" is 57);
	// c is deleted (after 0); b changed its frontmatter only, the reference file is not a main file
	want := "idea-loop/agents/new.md 0 → 57（+57）\n" +
		"idea-loop/skills/a/SKILL.md 105 → 405（+300）\n" +
		"idea-loop/skills/c/SKILL.md 15 → 0（-15）\n"
	if code != 0 || errs != "" || out != want {
		t.Fatalf("%q %q %d", out, errs, code)
	}
}

func TestSkillGrowthSaysSoWhenNoMainFileChanged(t *testing.T) {
	dir := skillGrowthRepo(t)
	t.Chdir(dir)
	gitIn(t, dir, "checkout", "-q", "-b", "issue/y", "main")
	write(t, filepath.Join(dir, "idea-loop/skills/a/references/more.md"), "# more\n字字\n")
	commitAll(t, dir, "only a reference")
	out, errs, code := newSession(t).run("pr", "skill-growth", "main")
	if code != 0 || errs != "" || out != "没有 SKILL.md 或 agent 定义的主体字数变了\n" {
		t.Fatalf("%q %q %d", out, errs, code)
	}
}

func TestSkillGrowthMeasuresFromTheMergeBaseNotFromTheTipOfTheBase(t *testing.T) {
	dir := skillGrowthRepo(t)
	t.Chdir(dir)
	// main moves on after the branch left it; those changes are not this branch's growth
	gitIn(t, dir, "checkout", "-q", "main")
	write(t, filepath.Join(dir, "idea-loop/skills/b/SKILL.md"), doc("name: b", "b", 700))
	commitAll(t, dir, "main grows b")
	gitIn(t, dir, "checkout", "-q", "issue/x")
	out, _, code := newSession(t).run("pr", "skill-growth", "main")
	if code != 0 || strings.Contains(out, "skills/b/") {
		t.Fatalf("%q %d", out, code)
	}
}

func TestSkillGrowthNeedsABaseAndReportsGitFailures(t *testing.T) {
	dir := skillGrowthRepo(t)
	t.Chdir(dir)
	s := newSession(t)
	_, errs, code := s.run("pr", "skill-growth")
	if code != 1 || !strings.Contains(errs, "usage: dyna pr skill-growth <base-ref>") {
		t.Fatal(errs, code)
	}
	_, errs, code = s.run("pr", "skill-growth", "no-such-ref")
	if code != 1 || errs == "" {
		t.Fatal(errs, code)
	}
}
