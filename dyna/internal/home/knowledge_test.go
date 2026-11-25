package home_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/home"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/issues"
)

// `home config` has a fifth item, knowledge: it moves one project's bootstrap files and docs/ into home. These
// tests run it the way a person does, in the project's repository, against a fake home, a fake code repository and
// a fake `gh`, under a temporary HOME.

const (
	lfsRule  = "docs/design/prod/** filter=lfs diff=lfs merge=lfs -text"
	noGH     = "[]"
	prsJSON  = `[{"number":12,"title":"docs: weekly retro","files":[{"path":"docs/records/weekly/x.md"}]},{"number":13,"title":"fix the parser","files":[{"path":"src/parse.go"}]}]`
	agentsMd = "# example-app\n\n## issue 分类\n\nissue 带分类 label。\n\n- `tools`：工具类\n  - `cli`：命令行\n\n保留的 label：无\n\n## 别的\n\n别的内容。\n"
	tracker  = "# Issue tracker：GitHub\n\n## 仓库\n\nacme/example-app\n\n## 调度\n\n每小时一轮。\n\n## 分类 label\n\n见 AGENTS.md 的「issue 分类」。\n\n## 优先级\n\nP0 到 P2。\n"
)

type kRig struct {
	world
	bin, plugin string
}

// newKnowledgeRig: home registers example-app at ~/code/example-app, the code repository tracks the bootstrap
// files and two docs files, and a fake gh (that prints ghOut, or fails when ghOut is empty) is on the PATH.
func newKnowledgeRig(t *testing.T, ghOut string) kRig {
	t.Helper()
	w := newWorld(t, opts{})
	write(t, w.home, "AGENTS.md", "# 设备\n\n## 项目\n\n"+listLine("example-app", remote)[:0]+"- example-app（一个例子）: ~/code/example-app. Clone from "+remote+" if missing.\n")
	gitIn(t, w.home, "config", "user.name", "t")
	gitIn(t, w.home, "config", "user.email", "t@example.com")
	gitIn(t, w.home, "config", "commit.gpgsign", "false")
	gitIn(t, w.home, "add", "-A")
	gitIn(t, w.home, "commit", "-q", "-m", "register")

	c := w.code
	write(t, c, "DEVELOPMENT.md", "# 开发\n")
	write(t, c, "EVAL.md", "# eval\n")
	write(t, c, "NOTES.txt", "笔记\n")
	write(t, c, "AGENTS.md", agentsMd)
	write(t, c, "ISSUE_TRACKER.md", tracker)
	write(t, c, ".gitattributes", lfsRule+"\n*.png -text\n")
	write(t, c, ".gitignore", "docs/draft.md\nnode_modules/\n")
	write(t, c, "docs/a.md", "# a\n")
	write(t, c, "docs/spec/b.md", "# b\n")
	write(t, c, "docs/draft.md", "ignored\n")
	write(t, c, "scripts/weekly.sh", "#!/bin/sh\nls docs/records/weekly/\n")
	write(t, c, "scripts/fetch.sh", "#!/bin/sh\ncurl https://example.com/docs/registry\n")
	gitIn(t, c, "add", "DEVELOPMENT.md", "EVAL.md", "NOTES.txt", "AGENTS.md", "ISSUE_TRACKER.md", ".gitattributes", ".gitignore", "docs/a.md", "docs/spec/b.md", "scripts/weekly.sh", "scripts/fetch.sh")
	gitIn(t, c, "commit", "-q", "-m", "files")

	bin := filepath.Join(w.root, "bin")
	script := "#!/bin/sh\ncat <<'EOF'\n" + ghOut + "\nEOF\n"
	if ghOut == "" {
		script = "#!/bin/sh\necho 'gh: not logged in' >&2\nexit 1\n"
	}
	write(t, bin, "gh", script)
	if err := os.Chmod(filepath.Join(bin, "gh"), 0o755); err != nil {
		t.Fatal(err)
	}

	plugin := filepath.Join(w.root, "plugin")
	tpl, err := os.ReadFile("../../../idea-loop/skills/engineering/setup/references/issue-tracker.md")
	if err != nil {
		t.Fatal(err)
	}
	write(t, plugin, home.TrackerTemplateFile, string(tpl))
	return kRig{world: w, bin: bin, plugin: plugin}
}

func (k kRig) run(args ...string) result {
	extra := map[string]string{"PATH": k.bin + string(os.PathListSeparator) + os.Getenv("PATH"), "IDEA_LOOP_PLUGIN_ROOT": k.plugin}
	return k.world.runWith(k.code, "", extra, append([]string{"home", "config"}, args...)...)
}

type planOut struct {
	Items     []home.ConfigItem   `json:"items"`
	Project   string              `json:"project"`
	Inventory []home.InventoryRow `json:"inventory"`
	Hardcoded []home.HardRow      `json:"hardcoded"`
	PRs       []home.PRRow        `json:"prs"`
	PRsError  string              `json:"prsError"`
}

func (k kRig) plan(t *testing.T) planOut {
	t.Helper()
	res := k.run("plan", "--only", "knowledge", "--project", "example-app", "--json").ok(t)
	var p planOut
	if err := json.Unmarshal([]byte(res.out), &p); err != nil {
		t.Fatalf("%v\n%s", err, res.out)
	}
	return p
}

func (p planOut) row(t *testing.T, path string) home.InventoryRow {
	t.Helper()
	for _, r := range p.Inventory {
		if r.Path == path {
			return r
		}
	}
	t.Fatalf("no row %q in %+v", path, p.Inventory)
	return home.InventoryRow{}
}

// planFile saves the plan with every empty 「去哪」 filled in, except the files in keepEmpty.
func (k kRig) planFile(t *testing.T, p planOut, keepEmpty ...string) string {
	t.Helper()
	for i, r := range p.Inventory {
		if r.Dest != "" {
			continue
		}
		keep := false
		for _, e := range keepEmpty {
			keep = keep || e == r.Path
		}
		if !keep {
			p.Inventory[i].Dest = home.DestStay
		}
	}
	b, err := json.MarshalIndent(map[string]any{"project": p.Project, "inventory": p.Inventory}, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(k.root, "plan.json")
	if err := os.WriteFile(path, b, 0o644); err != nil {
		t.Fatal(err)
	}
	return path
}

func (k kRig) apply(planPath string) result {
	return k.run("apply", "--only", "knowledge", "--project", "example-app", "--plan", planPath)
}

func TestKnowledgePlanWritesNothingAndSortsTheTrackedFiles(t *testing.T) {
	k := newKnowledgeRig(t, noGH)
	before := snapshot(t, k.root)
	p := k.plan(t)
	if !reflect.DeepEqual(snapshot(t, k.root), before) {
		t.Fatal("plan wrote something")
	}
	if got := p.row(t, "DEVELOPMENT.md"); got.Class != home.ClassInstalled || got.Dest != home.DestProject {
		t.Errorf("DEVELOPMENT.md: %+v", got)
	}
	if got := p.row(t, "EVAL.md"); got.Class != home.ClassTools || got.Dest != home.DestStay {
		t.Errorf("EVAL.md: %+v", got)
	}
	for _, name := range []string{".gitattributes", ".gitignore"} {
		if got := p.row(t, name); got.Class != home.ClassTools || got.Dest != home.DestStay {
			t.Errorf("%s stays in the repository (apply rewrites its docs/ lines by itself): %+v", name, got)
		}
	}
	if got := p.row(t, "NOTES.txt"); got.Dest != "" {
		t.Errorf("NOTES.txt should be left for a person: %+v", got)
	}
	if got := p.row(t, "docs/spec/"); got.Class != home.ClassKnowledge || got.Dest != home.DestProject || got.Files != 1 {
		t.Errorf("docs/spec/: %+v", got)
	}
	if got := p.row(t, "scripts/"); got.Dest != home.DestStay || got.Files != 2 {
		t.Errorf("scripts/: %+v", got)
	}
	for _, r := range p.Inventory {
		if strings.Contains(r.Path, "draft") {
			t.Errorf("an ignored file is in the table: %+v", r)
		}
	}
	if len(p.Items) != 1 || p.Items[0].ID != "knowledge" || p.Items[0].Status != "todo" {
		t.Errorf("%+v", p.Items)
	}
	table := k.run("plan", "--only", "knowledge", "--project", "example-app").ok(t).out
	for _, want := range []string{"| 文件 | 文件数 | 归类 | 去哪 |", "NOTES.txt", "### 写死 docs/ 的文件", "### 开着且改了 docs/ 的 PR"} {
		if !strings.Contains(table, want) {
			t.Errorf("table lacks %q:\n%s", want, table)
		}
	}
}

func TestKnowledgeApplyRefusesWhileAWhereIsEmptyThenCopiesWhatTheTableSays(t *testing.T) {
	k := newKnowledgeRig(t, noGH)
	// home already has one of the lines the code repository's .gitattributes would add
	write(t, k.home, ".gitattributes", "projects/example-app/"+lfsRule+"\n")
	gitIn(t, k.home, "add", ".gitattributes")
	gitIn(t, k.home, "commit", "-q", "-m", "attrs")
	codeBefore := snapshot(t, k.code)
	p := k.plan(t)

	homeBefore := snapshot(t, k.home)
	res := k.apply(k.planFile(t, p, "NOTES.txt"))
	if res.code == 0 || !strings.Contains(res.err, "NOTES.txt") || strings.Contains(res.err, "EVAL.md") {
		t.Fatalf("an empty 去哪 should be refused by name: %+v", res)
	}
	if !reflect.DeepEqual(snapshot(t, k.home), homeBefore) {
		t.Fatal("the refusal wrote something")
	}

	commits := len(subjects(t, k.home))
	k.apply(k.planFile(t, p)).ok(t)
	proj := filepath.Join(k.home, "projects", "example-app")
	for _, f := range []string{"DEVELOPMENT.md", "docs/a.md", "docs/spec/b.md"} {
		if _, err := os.Stat(filepath.Join(proj, f)); err != nil {
			t.Errorf("%s was not copied: %v", f, err)
		}
	}
	for _, f := range []string{"docs/draft.md", "EVAL.md", "NOTES.txt", ".docs-moving"} {
		if _, err := os.Stat(filepath.Join(proj, f)); err == nil {
			t.Errorf("%s should not be in the project directory", f)
		}
	}
	attrs := readFile(t, filepath.Join(k.home, ".gitattributes"))
	if strings.Count(attrs, "projects/example-app/"+lfsRule) != 1 {
		t.Errorf("the prefixed rule should be there once:\n%s", attrs)
	}
	if !strings.Contains(readFile(t, filepath.Join(k.home, ".gitignore")), "projects/example-app/docs/draft.md") {
		t.Errorf(".gitignore: %q", readFile(t, filepath.Join(k.home, ".gitignore")))
	}
	if got := subjects(t, k.home); len(got) != commits+1 || got[0] != "chore: 搬入 example-app 的知识库" {
		t.Errorf("commits: %v", got)
	}
	if st := gitIn(t, k.home, "status", "--porcelain"); st != "" {
		t.Errorf("home has left-overs: %s", st)
	}
	var plans int
	_ = filepath.WalkDir(filepath.Join(k.home, ".backup"), func(p string, d os.DirEntry, err error) error {
		if err == nil && !d.IsDir() && d.Name() == "plan.json" {
			plans++
		}
		return nil
	})
	if plans != 1 {
		t.Errorf("the plan file should be backed up once, found %d", plans)
	}
	if !reflect.DeepEqual(snapshot(t, k.code), codeBefore) {
		t.Error("the code repository changed")
	}
}

func TestKnowledgeAFailureHalfWayLeavesNoDocsAndARerunFinishes(t *testing.T) {
	if os.Geteuid() == 0 {
		t.Skip("root reads anything")
	}
	k := newKnowledgeRig(t, noGH)
	plan := k.planFile(t, k.plan(t))
	second := filepath.Join(k.code, "docs", "spec", "b.md") // the second tracked docs file, in the order they are copied
	if err := os.Chmod(second, 0); err != nil {
		t.Fatal(err)
	}
	res := k.apply(plan)
	if res.code == 0 || !strings.Contains(res.err, "docs/spec/b.md") {
		t.Fatalf("the copy should have failed on the second file: %+v", res)
	}
	proj := filepath.Join(k.home, "projects", "example-app")
	for _, f := range []string{"docs", ".docs-moving"} {
		if _, err := os.Stat(filepath.Join(proj, f)); err == nil {
			t.Fatalf("%s is left in the project directory after a failure", f)
		}
	}
	if err := os.Chmod(second, 0o644); err != nil {
		t.Fatal(err)
	}
	k.apply(plan).ok(t)
	for _, f := range []string{"docs/a.md", "docs/spec/b.md"} {
		if _, err := os.Stat(filepath.Join(proj, f)); err != nil {
			t.Errorf("%s: %v", f, err)
		}
	}
}

func TestKnowledgeIssueTrackerLosesItsRepoSectionAndTakesTheCategories(t *testing.T) {
	k := newKnowledgeRig(t, noGH)
	codeBefore := map[string]string{"AGENTS.md": readFile(t, filepath.Join(k.code, "AGENTS.md")), "ISSUE_TRACKER.md": readFile(t, filepath.Join(k.code, "ISSUE_TRACKER.md"))}
	k.apply(k.planFile(t, k.plan(t))).ok(t)

	text := readFile(t, filepath.Join(k.home, "projects", "example-app", "ISSUE_TRACKER.md"))
	if strings.Contains(text, "## 仓库") || strings.Contains(text, "acme/example-app") {
		t.Errorf("the 仓库 section is still there:\n%s", text)
	}
	for _, want := range []string{"## 调度", "每小时一轮。", "## 优先级", "模块的写法"} {
		if !strings.Contains(text, want) {
			t.Errorf("lost %q:\n%s", want, text)
		}
	}
	types, err := issues.ParseTypes(text)
	if err != nil || types == nil || len(types.Parents) != 1 || types.Parents[0].Name != "tools" || len(types.Parents[0].Children) != 1 || types.Parents[0].Children[0].Name != "cli" || len(types.Keep) != 0 {
		t.Fatalf("ParseTypes: %+v, %v\n%s", types, err, text)
	}
	for f, want := range codeBefore {
		if got := readFile(t, filepath.Join(k.code, f)); got != want {
			t.Errorf("the code repository's %s changed", f)
		}
	}
}

func TestKnowledgeLeavesTheCategoriesAloneWhenTheRepositoryHasNone(t *testing.T) {
	k := newKnowledgeRig(t, noGH)
	write(t, k.code, "AGENTS.md", "# example-app\n\n没有分类一节。\n")
	gitIn(t, k.code, "commit", "-q", "-am", "no categories")
	k.apply(k.planFile(t, k.plan(t))).ok(t)
	text := readFile(t, filepath.Join(k.home, "projects", "example-app", "ISSUE_TRACKER.md"))
	if strings.Contains(text, "## 仓库") || !strings.Contains(text, "见 AGENTS.md 的「issue 分类」。") {
		t.Errorf("only 仓库 goes:\n%s", text)
	}
}

func TestKnowledgeHardcodedDocsPathsAndOpenPRs(t *testing.T) {
	k := newKnowledgeRig(t, prsJSON)
	p := k.plan(t)
	var files []string
	for _, h := range p.Hardcoded {
		files = append(files, h.File)
	}
	if !reflect.DeepEqual(files, []string{"scripts/weekly.sh"}) {
		t.Errorf("hard-coded: %v (a URL's /docs/ is not ours)", files)
	}
	if len(p.Hardcoded) == 1 && (p.Hardcoded[0].Lines[0].Line != 2 || !strings.Contains(p.Hardcoded[0].Lines[0].Text, "docs/records/weekly/")) {
		t.Errorf("%+v", p.Hardcoded[0])
	}
	if len(p.PRs) != 1 || p.PRs[0].Number != 12 || p.PRs[0].Title != "docs: weekly retro" {
		t.Errorf("PRs: %+v", p.PRs)
	}
	if !strings.Contains(k.run("plan", "--only", "knowledge", "--project", "example-app").ok(t).out, "#12 | docs: weekly retro") {
		t.Error("the PR is not in the table")
	}
}

func TestKnowledgePlanSurvivesAFailingGH(t *testing.T) {
	k := newKnowledgeRig(t, "")
	p := k.plan(t)
	if p.PRsError == "" || !strings.Contains(p.PRsError, "not logged in") || len(p.PRs) != 0 {
		t.Errorf("%+v", p)
	}
	if !strings.Contains(k.run("plan", "--only", "knowledge", "--project", "example-app").ok(t).out, "查不到：gh: not logged in") {
		t.Error("the table should say it could not look")
	}
}

func TestKnowledgeSecondApplyChangesNothingAndLocateSeesTheProjectAsMoved(t *testing.T) {
	k := newKnowledgeRig(t, noGH)
	plan := k.planFile(t, k.plan(t))
	if got := k.world.run(k.code, "home", "where").code; got == 0 {
		t.Fatal("before the move `where` should stop")
	}
	k.apply(plan).ok(t)
	head, before := gitIn(t, k.home, "rev-parse", "HEAD"), snapshot(t, k.home)

	res := k.apply(plan).ok(t)
	if !strings.Contains(res.out, "已搬") || gitIn(t, k.home, "rev-parse", "HEAD") != head || !reflect.DeepEqual(snapshot(t, k.home), before) {
		t.Errorf("the second apply changed something: %+v", res)
	}
	var where struct {
		Project string `json:"project"`
		InHome  bool   `json:"inHome"`
	}
	if err := json.Unmarshal([]byte(k.world.run(k.code, "home", "where").ok(t).out), &where); err != nil || where.Project != "example-app" || !where.InHome {
		t.Errorf("where: %+v, %v", where, err)
	}
	var rows []home.ProjectRow
	if err := json.Unmarshal([]byte(k.world.run(k.code, "home", "projects").ok(t).out), &rows); err != nil || len(rows) != 1 || !rows[0].InHome {
		t.Errorf("projects: %+v, %v", rows, err)
	}
	if st := k.plan(t).Items[0].Status; st != "already" {
		t.Errorf("the plan should say 已是, got %s", st)
	}
}

func TestKnowledgeIsOnlyDoneWhenNamed(t *testing.T) {
	r := newRig(t, rigOpts{})
	if got, err := home.ParseOnly("", false); err != nil || !reflect.DeepEqual(got, home.ConfigItems) || len(got) != 4 {
		t.Errorf("default: %v, %v", got, err)
	}
	if _, err := home.ParseOnly("5", true); err == nil {
		t.Error("the number 5 is not an item")
	}
	if got, err := home.ParseOnly("knowledge,2", true); err != nil || !reflect.DeepEqual(got, []string{"memory", "knowledge"}) {
		t.Errorf("by name: %v, %v", got, err)
	}
	out := r.cfg("plan").ok(t).out
	rows := 0
	for _, l := range strings.Split(out, "\n") {
		if strings.HasPrefix(l, "| ") {
			rows++
		}
	}
	if rows != 5 || strings.Contains(out, "盘点") { // the header and four items
		t.Errorf("the default plan should be the four rows only:\n%s", out)
	}
}
