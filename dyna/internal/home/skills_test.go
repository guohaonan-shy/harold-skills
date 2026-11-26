package home_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/home"
)

// `home config` has a skills item: it decides, row by row, which of ~/.claude/skills/ stay, moves those into
// <home>/skills/ and turns ~/.claude/skills into a symlink there. These tests run it the way a person does,
// against a fake home and a temporary HOME. The names below are made up; the plugin itself names none.

type sRig struct {
	world
	skills, external string
}

func skillLine(at, skill string) string {
	return `{"type":"assistant","timestamp":"` + at + `","message":{"role":"assistant","content":[{"type":"tool_use","id":"t","name":"Skill","input":{"skill":"` + skill + `"}}]}}` + "\n"
}

// newSkillsRig: HOME holds a ~/.claude/skills/ with a kept symlink, a kept directory and two to drop (one a
// symlink), and session records: real-keep called once 9 days before the clock, linked-keep once 40 days before.
func newSkillsRig(t *testing.T) sRig {
	t.Helper()
	w := newWorld(t, opts{})
	gitIn(t, w.home, "config", "user.name", "t")
	gitIn(t, w.home, "config", "user.email", "t@example.com")
	gitIn(t, w.home, "config", "commit.gpgsign", "false")
	skills := filepath.Join(w.root, ".claude", "skills")
	ext := filepath.Join(w.root, "elsewhere")
	write(t, ext, "linked-keep/SKILL.md", "linked body\n")
	write(t, ext, "linked-keep/references/r.md", "ref\n")
	write(t, ext, "drop-two/SKILL.md", "drop two body\n")
	write(t, skills, "real-keep/SKILL.md", "real body\n")
	write(t, skills, "drop-one/SKILL.md", "drop one body\n")
	if err := os.Symlink(filepath.Join(ext, "linked-keep"), filepath.Join(skills, "linked-keep")); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(filepath.Join(ext, "drop-two"), filepath.Join(skills, "drop-two")); err != nil {
		t.Fatal(err)
	}
	write(t, skills, ".DS_Store", "junk")
	write(t, w.root, ".claude/projects/-tmp-a/s1.jsonl",
		skillLine("2026-11-10T08:00:00.000Z", "real-keep")+
			skillLine("2026-10-10T08:00:00.000Z", "linked-keep")+
			`{"type":"assistant","timestamp":"2026-11-11T08:00:00.000Z","message":{"content":[{"type":"tool_use","name":"Read","input":{"skill":"drop-one"}}]}}`+"\n"+
			`{"type":"user","timestamp":"2026-11-11T08:00:00.000Z","message":{"content":"mentions \"Skill\" in text"}}`+"\n"+
			skillLine("2026-11-11T08:00:00.000Z", "plugin:real-keep"))
	return sRig{w, skills, ext}
}

func (r sRig) cfg(args ...string) result {
	return r.world.run(r.root, append([]string{"home", "config"}, args...)...)
}

type skillsOut struct {
	Items  []home.ConfigItem `json:"items"`
	Skills []home.SkillRow   `json:"skills"`
}

func (r sRig) plan(t *testing.T) skillsOut {
	t.Helper()
	var p skillsOut
	res := r.cfg("plan", "--only", "skills", "--json").ok(t)
	if err := json.Unmarshal([]byte(res.out), &p); err != nil {
		t.Fatalf("%v\n%s", err, res.out)
	}
	return p
}

// planFile saves the plan with the decisions given by name; the rest stay empty.
func (r sRig) planFile(t *testing.T, p skillsOut, decide map[string]string) string {
	t.Helper()
	for i, s := range p.Skills {
		p.Skills[i].Decision = decide[s.Name]
	}
	b, err := json.MarshalIndent(map[string]any{"items": p.Items, "skills": p.Skills}, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(r.root, "skills-plan.json")
	if err := os.WriteFile(path, b, 0o644); err != nil {
		t.Fatal(err)
	}
	return path
}

func (r sRig) apply(planPath string) result {
	return r.cfg("apply", "--only", "skills", "--plan", planPath)
}

func exists(p string) bool {
	_, err := os.Lstat(p)
	return err == nil
}

func TestSkillsPlanListsEveryEntryWithItsLinkAndItsCallsOfTheLast30Days(t *testing.T) {
	r := newSkillsRig(t)
	before := snapshot(t, r.root)
	p := r.plan(t)
	if !reflect.DeepEqual(snapshot(t, r.root), before) {
		t.Error("plan wrote something")
	}
	want := []home.SkillRow{
		{Name: "drop-one"},
		{Name: "drop-two", Link: true, Target: filepath.Join(r.external, "drop-two")},
		{Name: "linked-keep", Link: true, Target: filepath.Join(r.external, "linked-keep")},
		{Name: "real-keep", Calls: 1},
	}
	if !reflect.DeepEqual(p.Skills, want) {
		t.Errorf("rows:\n%+v\nwant\n%+v", p.Skills, want)
	}
	if len(p.Items) != 1 || p.Items[0].ID != "skills" || p.Items[0].Status != "todo" {
		t.Errorf("items: %+v", p.Items)
	}
	out := r.cfg("plan", "--only", "skills").ok(t).out
	for _, w := range []string{"| real-keep | 否 |  | 1 |", "| linked-keep | 是 | " + filepath.Join(r.external, "linked-keep") + " | 0 |"} {
		if !strings.Contains(out, w) {
			t.Errorf("the table lacks %q:\n%s", w, out)
		}
	}
}

func TestSkillsApplyKeepsAndDropsThenSwapsWhenEveryRowIsDecided(t *testing.T) {
	r := newSkillsRig(t)
	head := gitIn(t, r.home, "rev-parse", "HEAD")
	commits := len(subjects(t, r.home))

	// two to keep, one to drop, one left empty
	first := r.planFile(t, r.plan(t), map[string]string{"linked-keep": "留", "real-keep": "留", "drop-one": "删"})
	res := r.apply(first).ok(t)
	if !strings.Contains(res.out, "drop-two") || !strings.Contains(res.out, "还没换") {
		t.Errorf("the undecided row should be reported:\n%s", res.out)
	}
	backups, _ := filepath.Glob(filepath.Join(r.home, ".backup", "*"))
	if len(backups) != 1 {
		t.Fatalf("backups: %v", backups)
	}
	for _, n := range []string{"linked-keep", "real-keep", "drop-one", "drop-two"} {
		if !exists(filepath.Join(backups[0], "skills", n)) {
			t.Errorf("the backup lacks %s", n)
		}
	}
	if !isLink(filepath.Join(backups[0], "skills", "drop-two")) || !exists(filepath.Join(backups[0], "skills", ".DS_Store")) {
		t.Error("the backup keeps a symlink as a symlink and holds the whole directory")
	}
	if !exists(filepath.Join(backups[0], "skills-plan.json")) {
		t.Error("the plan file is backed up with it")
	}
	if isLink(filepath.Join(r.home, "skills", "linked-keep")) || readFile(t, filepath.Join(r.home, "skills", "linked-keep", "references", "r.md")) != "ref\n" {
		t.Error("a kept symlink becomes a real directory in home")
	}
	if readFile(t, filepath.Join(r.home, "skills", "real-keep", "SKILL.md")) != "real body\n" {
		t.Error("a kept directory is copied")
	}
	if exists(filepath.Join(r.skills, "drop-one")) || !exists(filepath.Join(r.skills, "drop-two")) {
		t.Error("the dropped row is gone and the undecided one stays")
	}
	if isLink(r.skills) {
		t.Error("~/.claude/skills must not change while a row is undecided")
	}
	if gitIn(t, r.home, "rev-parse", "HEAD") != head {
		t.Error("nothing is committed before the swap")
	}

	// the last row becomes 删: the swap and the commit
	second := r.planFile(t, r.plan(t), map[string]string{"linked-keep": "留", "real-keep": "留", "drop-two": "删"})
	r.apply(second).ok(t)
	if !isLink(r.skills) {
		t.Fatal("~/.claude/skills should be a symlink now")
	}
	if got, _ := os.Readlink(r.skills); got != filepath.Join(r.home, "skills") {
		t.Errorf("it points to %s", got)
	}
	if left, _ := filepath.Glob(r.skills + ".*"); len(left) != 0 {
		t.Errorf("the swap left %v behind", left)
	}
	if readFile(t, filepath.Join(r.skills, "real-keep", "SKILL.md")) != "real body\n" || exists(filepath.Join(r.skills, "drop-two")) {
		t.Error("through the link: the kept skill reads, the dropped one is gone")
	}
	if subs := subjects(t, r.home); len(subs) != commits+1 || subs[0] != "chore: 用户级 skill 搬进 home" {
		t.Errorf("home commits: %v", subs)
	}
	if st := gitIn(t, r.home, "status", "--porcelain", "--", "skills"); st != "" {
		t.Errorf("home/skills is dirty after the commit:\n%s", st)
	}
	for _, n := range []string{"drop-two/SKILL.md", "linked-keep/SKILL.md"} {
		if readFile(t, filepath.Join(r.external, n)) == "" {
			t.Errorf("what a symlink pointed to must stay: %s", n)
		}
	}

	// a third run changes nothing
	head, before := gitIn(t, r.home, "rev-parse", "HEAD"), snapshot(t, r.root)
	res = r.apply(second).ok(t)
	if !strings.Contains(res.out, "已是") || gitIn(t, r.home, "rev-parse", "HEAD") != head || !reflect.DeepEqual(snapshot(t, r.root), before) {
		t.Errorf("the third apply changed something:\n%s", res.out)
	}
	if p := r.plan(t); p.Items[0].Status != "already" || len(p.Skills) != 0 {
		t.Errorf("the plan should say 已是: %+v", p)
	}
}

func TestSkillsApplyRefusesBeforeWritingWhenAnAnswerIsWrongOrACopyIsImpossible(t *testing.T) {
	r := newSkillsRig(t)
	bad := r.planFile(t, r.plan(t), map[string]string{"real-keep": "keep"})
	if res := r.apply(bad); res.code == 0 || !strings.Contains(res.err, "只认") {
		t.Errorf("an unknown answer: %+v", res)
	}
	if res := r.cfg("apply", "--only", "skills"); res.code == 0 || !strings.Contains(res.err, "--plan") {
		t.Errorf("no plan file: %+v", res)
	}
	if err := os.RemoveAll(filepath.Join(r.external, "drop-two")); err != nil {
		t.Fatal(err)
	}
	dangling := r.planFile(t, r.plan(t), map[string]string{"drop-two": "留"})
	before := snapshot(t, r.root)
	if res := r.apply(dangling); res.code == 0 || !strings.Contains(res.err, "drop-two") {
		t.Errorf("a dangling link cannot be kept: %+v", res)
	}
	if !reflect.DeepEqual(snapshot(t, r.root), before) {
		t.Error("a refused apply wrote something")
	}
}

func TestSkillsADanglingLinkCanBeDropped(t *testing.T) {
	r := newSkillsRig(t)
	if err := os.RemoveAll(filepath.Join(r.external, "drop-two")); err != nil {
		t.Fatal(err)
	}
	r.apply(r.planFile(t, r.plan(t), map[string]string{"drop-two": "删", "drop-one": "删", "real-keep": "留", "linked-keep": "留"})).ok(t)
	if !isLink(r.skills) || exists(filepath.Join(r.home, "skills", "drop-two")) {
		t.Error("the dangling link is dropped and the swap is done")
	}
}

func TestSkillsDropEverythingStillSwapsAndCommitsNothingBroken(t *testing.T) {
	r := newSkillsRig(t)
	all := map[string]string{"drop-one": "删", "drop-two": "删", "linked-keep": "删", "real-keep": "删"}
	r.apply(r.planFile(t, r.plan(t), all)).ok(t)
	if !isLink(r.skills) {
		t.Error("an empty home skills/ is still the link's target")
	}
	if entries, _ := os.ReadDir(filepath.Join(r.home, "skills")); len(entries) != 0 {
		t.Errorf("home skills/: %v", entries)
	}
}

func TestSkillsAMissingDirectoryJustGetsTheLinkAndASymlinkElsewhereIsLeftToAPerson(t *testing.T) {
	r := newSkillsRig(t)
	if err := os.RemoveAll(r.skills); err != nil {
		t.Fatal(err)
	}
	if p := r.plan(t); p.Items[0].Status != "todo" || p.Items[0].Before != "不存在" {
		t.Errorf("missing: %+v", p.Items)
	}
	r.apply(r.planFile(t, r.plan(t), nil)).ok(t)
	if !isLink(r.skills) {
		t.Error("a missing ~/.claude/skills becomes the link")
	}

	r = newSkillsRig(t)
	if err := os.RemoveAll(r.skills); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(r.external, r.skills); err != nil {
		t.Fatal(err)
	}
	if p := r.plan(t); p.Items[0].Status != "manual" || len(p.Skills) != 0 {
		t.Errorf("a link to somewhere else: %+v", p)
	}
	res := r.apply(r.planFile(t, r.plan(t), nil)).ok(t)
	if got, _ := os.Readlink(r.skills); got != r.external || !strings.Contains(res.out, "没动") {
		t.Errorf("a link to somewhere else must stay:\n%s", res.out)
	}
}

func TestSkillsIsOnlyDoneWhenNamedAndNotWithKnowledge(t *testing.T) {
	r := newSkillsRig(t)
	if got, err := home.ParseOnly("skills,2", true); err != nil || !reflect.DeepEqual(got, []string{"memory", "skills"}) {
		t.Errorf("by name: %v, %v", got, err)
	}
	if got, err := home.ParseOnly("", false); err != nil || len(got) != 4 {
		t.Errorf("default: %v, %v", got, err)
	}
	if out := r.cfg("plan", "--only", "skills,knowledge").err; !strings.Contains(out, "分开跑") {
		t.Errorf("the two cannot share a run: %q", out)
	}
	if res := r.cfg("apply", "--only", "skills,knowledge"); res.code == 0 || !strings.Contains(res.err, "分开跑") {
		t.Errorf("apply: %+v", res)
	}
}
