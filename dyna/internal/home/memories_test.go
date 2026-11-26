package home_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"regexp"
	"strings"
	"testing"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/home"
)

// `home config` has a memories item: it copies the per-project memories (~/.claude/projects/<目录>/memory/) into
// <home>/memory/ and merges their indexes. These tests run it under a temporary HOME with fake memory directories,
// fake session records and real git.

const memCommitMsg = "chore: 合并各项目的记忆"

type mRig struct {
	rigT
	registered, other string // the code directories the two session records name
}

// newMemoriesRig: the config rig (home registers example-app), identity for the commits to home, and two
// repositories: one whose origin is the registered remote, one that is not on the list.
func newMemoriesRig(t *testing.T) mRig {
	t.Helper()
	r := newRig(t, rigOpts{})
	gitIn(t, r.home, "config", "user.name", "t")
	gitIn(t, r.home, "config", "user.email", "t@example.com")
	gitIn(t, r.home, "config", "commit.gpgsign", "false")
	m := mRig{rigT: r}
	m.registered = repo(t, filepath.Join(r.root, "code", "example-app"), "https://example.test/acme/example-app")
	m.other = repo(t, filepath.Join(r.root, "code", "Mixed-Case"), "git@github.com:acme/elsewhere.git")
	return m
}

// memDir makes ~/.claude/projects/<name>/memory/ with an index and the given files; cwd "" writes no session record.
func (m mRig) memDir(t *testing.T, name, cwd, index string, files map[string]string) string {
	t.Helper()
	dir := filepath.Join(m.claude, "projects", name)
	if err := os.MkdirAll(filepath.Join(dir, "memory"), 0o755); err != nil {
		t.Fatal(err)
	}
	if index != "" {
		write(t, dir, "memory/MEMORY.md", index)
	}
	for f, text := range files {
		write(t, dir, "memory/"+f, text)
	}
	if cwd != "" {
		// a record whose first line says nothing about the directory, as real ones start
		write(t, dir, "0aa.jsonl", `{"type":"queue-operation","operation":"enqueue"}`+"\n"+`{"type":"user","cwd":"`+cwd+`","sessionId":"x"}`+"\n")
	}
	return dir
}

// two is the rig of the ticket: two memory directories with one memory each, one of them the registered project,
// and a third with an empty memory/.
func (m mRig) two(t *testing.T) {
	t.Helper()
	m.memDir(t, "-code-example-app", m.registered, "- [Alpha rule](alpha.md) — alpha hook\n- [Beta](./beta.md) — second line\n", map[string]string{"alpha.md": "alpha\n", "beta.md": "beta\n"})
	m.memDir(t, "-code-Mixed-Case", m.other, "- [Gamma](gamma.md) — only line\n", map[string]string{"gamma.md": "gamma\n"})
	if err := os.MkdirAll(filepath.Join(m.claude, "projects", "-code-empty", "memory"), 0o755); err != nil {
		t.Fatal(err)
	}
}

type memPlan struct {
	Items    []home.ConfigItem `json:"items"`
	Memories []home.MemoryDir  `json:"memories"`
}

func (m mRig) plan(t *testing.T) memPlan {
	t.Helper()
	var p memPlan
	out := m.cfg("plan", "--only", "memories", "--json").ok(t).out
	if err := json.Unmarshal([]byte(out), &p); err != nil {
		t.Fatalf("%v\n%s", err, out)
	}
	return p
}

func memCommits(t *testing.T, dir string) int {
	return len(strings.Split(gitIn(t, dir, "log", "--format=%H"), "\n"))
}

func TestMemoriesPlanListsEachDirectoryWithItsPrefixAndLeavesEmptyOnesOut(t *testing.T) {
	m := newMemoriesRig(t)
	m.two(t)
	before := snapshot(t, m.root)

	p := m.plan(t)
	if len(p.Memories) != 2 {
		t.Fatalf("two directories have memories, got %+v", p.Memories)
	}
	a, b := p.Memories[1], p.Memories[0] // ordered by directory name: -code-Mixed-Case, -code-example-app
	if a.Dir != "-code-example-app" || a.Prefix != "example-app" || a.Files != 2 || a.IndexLines != 2 || a.Status != "todo" {
		t.Errorf("registered project: %+v", a)
	}
	if b.Dir != "-code-Mixed-Case" || b.Prefix != "mixed-case" || b.Files != 1 || b.IndexLines != 1 || b.ProjectPath != m.other {
		t.Errorf("unlisted project takes the last segment in lower case: %+v", b)
	}
	if len(p.Items) != 1 || p.Items[0].ID != "memories" || p.Items[0].Status != "todo" {
		t.Errorf("one item: %+v", p.Items)
	}

	table := m.cfg("plan", "--only", "memories").ok(t).out
	for _, want := range []string{"-code-example-app", "example-app", "-code-Mixed-Case", "mixed-case"} {
		if !strings.Contains(table, want) {
			t.Errorf("the table lacks %q:\n%s", want, table)
		}
	}
	if strings.Contains(table, "-code-empty") {
		t.Errorf("a directory with an empty memory/ is not listed:\n%s", table)
	}
	if !reflect.DeepEqual(snapshot(t, m.root), before) {
		t.Fatal("plan wrote something")
	}
}

func TestMemoriesDirectoryWithOnlyAnIndexIsNotListed(t *testing.T) {
	m := newMemoriesRig(t)
	m.memDir(t, "-code-index-only", m.registered, "- nothing here\n", nil)
	if p := m.plan(t); len(p.Memories) != 0 || p.Items[0].Status != "already" {
		t.Errorf("only MEMORY.md is no memory: %+v", p)
	}
}

func TestMemoriesApplyCopiesWithPrefixMergesTheIndexAndCommits(t *testing.T) {
	m := newMemoriesRig(t)
	m.two(t)
	oldA := snapshot(t, filepath.Join(m.claude, "projects"))
	commits := memCommits(t, m.home)

	out := m.cfg("apply", "--only", "memories").ok(t).out
	if !strings.Contains(out, "已复制 2 个项目目录的记忆（3 个文件）") {
		t.Errorf("apply should say what it copied:\n%s", out)
	}
	mem := filepath.Join(m.home, "memory")
	for name, want := range map[string]string{"example-app--alpha.md": "alpha\n", "example-app--beta.md": "beta\n", "mixed-case--gamma.md": "gamma\n"} {
		if got := readFile(t, filepath.Join(mem, name)); got != want {
			t.Errorf("%s = %q", name, got)
		}
	}
	index := readFile(t, filepath.Join(mem, "MEMORY.md"))
	// sections follow the order of the directories' names
	wantIndex := "## mixed-case\n" +
		"- [Gamma](mixed-case--gamma.md) — only line\n" +
		"\n## example-app\n" +
		"- [Alpha rule](example-app--alpha.md) — alpha hook\n- [Beta](example-app--beta.md) — second line\n"
	if index != wantIndex {
		t.Errorf("index:\n%s\nwant:\n%s", index, wantIndex)
	}
	if !reflect.DeepEqual(snapshot(t, filepath.Join(m.claude, "projects")), oldA) {
		t.Error("the old directories changed")
	}
	if memCommits(t, m.home) != commits+1 || subjects(t, m.home)[0] != memCommitMsg {
		t.Errorf("home should have one more commit %q: %v", memCommitMsg, subjects(t, m.home))
	}
	if st := gitIn(t, m.home, "status", "--porcelain"); st != "" {
		t.Errorf("nothing should be left uncommitted:\n%s", st)
	}
	// the merged index is what `dyna home memory check` measures, and it takes it
	res := m.world.runWith(m.root, "", map[string]string{"HOME": m.HOME, "IDEA_LOOP_HOME": m.home}, "home", "memory", "check")
	if res.code != 0 {
		t.Errorf("memory check refuses the merged index (exit %d):\n%s%s", res.code, res.out, res.err)
	}
	if bs := backups(t, m.rigT); len(bs) != 0 {
		t.Errorf("home had no MEMORY.md, so nothing is backed up: %v", bs)
	}
}

func TestMemoriesSecondApplyChangesNothing(t *testing.T) {
	m := newMemoriesRig(t)
	m.two(t)
	m.cfg("apply", "--only", "memories").ok(t)
	before := snapshot(t, m.root)
	commits := memCommits(t, m.home)

	out := m.cfg("apply", "--only", "memories").ok(t).out
	if !strings.Contains(out, "什么都没写") {
		t.Errorf("second apply should say it wrote nothing:\n%s", out)
	}
	if !reflect.DeepEqual(snapshot(t, m.root), before) || memCommits(t, m.home) != commits {
		t.Error("second apply changed something")
	}
	for _, d := range m.plan(t).Memories {
		if d.Status != "already" {
			t.Errorf("plan should say 已是: %+v", d)
		}
	}
	if !strings.Contains(m.cfg("plan", "--only", "memories").ok(t).out, "已是") {
		t.Error("the table should say 已是")
	}
}

func TestMemoriesApplyRefusesAFileWithOtherContentAndWritesNothing(t *testing.T) {
	m := newMemoriesRig(t)
	m.two(t)
	write(t, m.home, "memory/mixed-case--gamma.md", "someone else's text\n")
	gitIn(t, m.home, "add", "-A")
	gitIn(t, m.home, "commit", "-q", "-m", "stray")
	before := snapshot(t, m.root)
	commits := memCommits(t, m.home)

	res := m.cfg("apply", "--only", "memories")
	if res.code == 0 {
		t.Fatalf("apply should refuse:\n%s", res.out)
	}
	if !strings.Contains(res.err+res.out, "mixed-case--gamma.md") {
		t.Errorf("the refusal should name the file:\n%s%s", res.out, res.err)
	}
	if !reflect.DeepEqual(snapshot(t, m.root), before) || memCommits(t, m.home) != commits {
		t.Error("a refused apply wrote something")
	}
	if got := m.cfg("plan", "--only", "memories").ok(t).out; !strings.Contains(got, "冲突") {
		t.Errorf("plan should flag the conflict:\n%s", got)
	}
}

func TestMemoriesAnIdenticalFileAlreadyThereCountsAsCopied(t *testing.T) {
	m := newMemoriesRig(t)
	m.two(t)
	write(t, m.home, "memory/mixed-case--gamma.md", "gamma\n")
	m.cfg("apply", "--only", "memories").ok(t)
	got := readFile(t, filepath.Join(m.home, "memory", "MEMORY.md"))
	if !strings.Contains(got, "## example-app") || strings.Contains(got, "## mixed-case") {
		t.Errorf("the directory that was already there gets no section, the other one does:\n%s", got)
	}
	if readFile(t, filepath.Join(m.home, "memory", "mixed-case--gamma.md")) != "gamma\n" || !memIsFile(filepath.Join(m.home, "memory", "example-app--alpha.md")) {
		t.Error("the other files still go in")
	}
}

func TestMemoriesAnExistingIndexStaysFirstAndIsBackedUp(t *testing.T) {
	m := newMemoriesRig(t)
	m.two(t)
	old := "# 设备记忆\n\n- [Old](old.md) — kept\n"
	write(t, m.home, "memory/MEMORY.md", old)
	write(t, m.home, "memory/old.md", "old\n")
	gitIn(t, m.home, "add", "-A")
	gitIn(t, m.home, "commit", "-q", "-m", "old memory")

	m.cfg("apply", "--only", "memories").ok(t)
	index := readFile(t, filepath.Join(m.home, "memory", "MEMORY.md"))
	if !strings.HasPrefix(index, old+"\n## mixed-case\n") {
		t.Errorf("the old index comes first, untouched, and the sections follow:\n%s", index)
	}
	bs := backups(t, m.rigT)
	if len(bs) != 1 {
		t.Fatalf("one backup: %v", bs)
	}
	if got := readFile(t, filepath.Join(m.home, ".backup", bs[0], "MEMORY.md")); got != old {
		t.Errorf("the backup is the old index byte for byte: %q", got)
	}
	if !strings.Contains(readFile(t, filepath.Join(m.home, ".gitignore")), ".backup/") {
		t.Error("home must ignore its backups")
	}
	if st := gitIn(t, m.home, "status", "--porcelain"); st != "" {
		t.Errorf("nothing should be left uncommitted:\n%s", st)
	}
}

func TestMemoriesTwoDirectoriesOfOneProjectGetNumberedPrefixes(t *testing.T) {
	m := newMemoriesRig(t)
	m.memDir(t, "-code-example-app", m.registered, "- [A](a.md) — a\n", map[string]string{"a.md": "a\n"})
	m.memDir(t, "-code-example-app-wt", m.registered, "- [B](b.md) — b\n", map[string]string{"b.md": "b\n"})
	m.memDir(t, "-code-example-app-wt2", m.registered, "- [C](c.md) — c\n", map[string]string{"c.md": "c\n"})

	p := m.plan(t)
	var got []string
	for _, d := range p.Memories {
		got = append(got, d.Dir+"="+d.Prefix)
	}
	want := []string{"-code-example-app=example-app", "-code-example-app-wt=example-app-2", "-code-example-app-wt2=example-app-3"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("prefixes %v, want %v", got, want)
	}
	if !strings.Contains(m.cfg("plan", "--only", "memories").ok(t).out, "-2") {
		t.Error("the table should say the prefix got a number")
	}
	m.cfg("apply", "--only", "memories").ok(t)
	for _, f := range []string{"example-app--a.md", "example-app-2--b.md", "example-app-3--c.md"} {
		if !memIsFile(filepath.Join(m.home, "memory", f)) {
			t.Errorf("%s is missing", f)
		}
	}
}

func memIsFile(p string) bool {
	st, err := os.Stat(p)
	return err == nil && st.Mode().IsRegular()
}

func TestMemoriesWithoutASessionRecordTheNameIsReadBackOffTheDirectoryName(t *testing.T) {
	m := newMemoriesRig(t)
	enc := regexp.MustCompile(`[^A-Za-z0-9]`).ReplaceAllString(m.HOME, "-")
	// Design-Lib is on disk under projects/; gone-app is not; the third is not under the home directory at all
	if err := os.MkdirAll(filepath.Join(m.HOME, "projects", "Design-Lib"), 0o755); err != nil {
		t.Fatal(err)
	}
	m.memDir(t, enc+"-projects-Design-Lib", "", "- [A](a.md) — a\n", map[string]string{"a.md": "a\n"})
	m.memDir(t, enc+"-projects-gone-app", "", "- [B](b.md) — b\n", map[string]string{"b.md": "b\n"})
	m.memDir(t, "-elsewhere-Thing", "", "- [C](c.md) — c\n", map[string]string{"c.md": "c\n"})

	got := map[string]home.MemoryDir{}
	for _, d := range m.plan(t).Memories {
		got[d.Prefix] = d
	}
	if d, ok := got["design-lib"]; !ok || d.ProjectPath != filepath.Join(m.HOME, "projects", "Design-Lib") {
		t.Errorf("a project directory that is on disk: %+v", got)
	}
	if d, ok := got["gone-app"]; !ok || d.ProjectPath != "" {
		t.Errorf("a project that is gone keeps what is left after the directories that exist: %+v", got)
	}
	if _, ok := got["elsewhere-thing"]; !ok {
		t.Errorf("outside the home directory the whole name is the prefix: %+v", got)
	}
	if len(got) != 3 {
		t.Errorf("three directories: %+v", got)
	}
}

func TestMemoriesNamedAloneNotWithKnowledgeOrSkills(t *testing.T) {
	m := newMemoriesRig(t)
	m.two(t)
	for _, other := range []string{"knowledge", "skills"} {
		for _, verb := range []string{"plan", "apply"} {
			res := m.cfg(verb, "--only", "memories,"+other)
			if res.code == 0 || !strings.Contains(res.err+res.out, "memories") {
				t.Errorf("%s memories,%s should be refused (exit %d): %s%s", verb, other, res.code, res.out, res.err)
			}
		}
	}
	if memIsFile(filepath.Join(m.home, "memory", "example-app--alpha.md")) {
		t.Error("a refused apply wrote something")
	}
}

func TestMemoriesIsOnlyDoneWhenNamed(t *testing.T) {
	m := newMemoriesRig(t)
	m.two(t)
	if got, err := home.ParseOnly("memories,2", true); err != nil || !reflect.DeepEqual(got, []string{"memory", "memories"}) {
		t.Errorf("by name: %v, %v", got, err)
	}
	out := m.cfg("plan").ok(t).out
	rows := 0
	for _, l := range strings.Split(out, "\n") {
		if strings.HasPrefix(l, "| ") {
			rows++
		}
	}
	if rows != 5 || strings.Contains(out, "记忆：") {
		t.Errorf("the default plan should be the four rows only:\n%s", out)
	}
	m.cfg("apply", "--only", "1,2,3,4").ok(t)
	if _, err := os.Stat(filepath.Join(m.home, "memory", "example-app--alpha.md")); err == nil {
		t.Error("the default four items must not copy memories")
	}
}

func TestMemoriesWithAnEmptyHomeStartsTheIndexWithoutALeadingBlankLine(t *testing.T) {
	m := newMemoriesRig(t)
	m.memDir(t, "-code-example-app", m.registered, "\n- [A](a.md) — a\n\n", map[string]string{"a.md": "a\n"})
	m.cfg("apply", "--only", "memories").ok(t)
	if got := readFile(t, filepath.Join(m.home, "memory", "MEMORY.md")); got != "## example-app\n- [A](example-app--a.md) — a\n" {
		t.Errorf("index %q", got)
	}
}

// A directory merged once stays merged: the list in <home>/memory/ is what says so, not whether its files are
// still there or what its prefix would be today.

func TestMemoriesMergedDirectoryStaysAlreadyAfterItsFilesAreCompressedAway(t *testing.T) {
	m := newMemoriesRig(t)
	m.two(t)
	m.cfg("apply", "--only", "memories").ok(t)
	if !strings.Contains(readFile(t, filepath.Join(m.home, "memory", ".merged-sources.json")), "-code-Mixed-Case") {
		t.Fatal("apply should record the directories it merged in <home>/memory/.merged-sources.json")
	}

	// the memory pass compresses: one memory is deleted from home and the index is rewritten without it
	if err := os.Remove(filepath.Join(m.home, "memory", "example-app--beta.md")); err != nil {
		t.Fatal(err)
	}
	write(t, m.home, "memory/MEMORY.md", "## example-app\n- [Alpha rule](example-app--alpha.md) — alpha hook\n\n## mixed-case\n- [Gamma](mixed-case--gamma.md) — only line\n")
	gitIn(t, m.home, "add", "-A")
	gitIn(t, m.home, "commit", "-q", "-m", "compress")
	before := snapshot(t, m.root)
	commits := memCommits(t, m.home)

	for _, d := range m.plan(t).Memories {
		if d.Status != "already" {
			t.Errorf("a merged directory is 已是 even with a file gone: %+v", d)
		}
	}
	if !strings.Contains(m.cfg("plan", "--only", "memories").ok(t).out, "已是") {
		t.Error("the table should say 已是")
	}
	out := m.cfg("apply", "--only", "memories").ok(t).out
	if !strings.Contains(out, "什么都没写") {
		t.Errorf("apply should say it wrote nothing:\n%s", out)
	}
	if !reflect.DeepEqual(snapshot(t, m.root), before) || memCommits(t, m.home) != commits {
		t.Error("apply brought back what the compression took out")
	}
	if memIsFile(filepath.Join(m.home, "memory", "example-app--beta.md")) {
		t.Error("the deleted memory is back")
	}
}

func TestMemoriesMergedDirectoryStaysAlreadyWhenItsProjectIsRegisteredUnderANewName(t *testing.T) {
	m := newMemoriesRig(t)
	m.two(t)
	m.cfg("apply", "--only", "memories").ok(t)

	// the project of the second directory is put on the list now: its prefix would be "renamed", not "mixed-case"
	agents := readFile(t, filepath.Join(m.home, "AGENTS.md"))
	write(t, m.home, "AGENTS.md", agents+listLine("renamed", "https://github.com/acme/elsewhere"))
	gitIn(t, m.home, "add", "-A")
	gitIn(t, m.home, "commit", "-q", "-m", "register")
	before := snapshot(t, m.root)
	commits := memCommits(t, m.home)

	var renamed bool
	for _, d := range m.plan(t).Memories {
		if d.Prefix == "renamed" {
			renamed = true
		}
		if d.Status != "already" {
			t.Errorf("a new prefix must not make a merged directory todo: %+v", d)
		}
	}
	if !renamed {
		t.Error("the plan should show the prefix the project has now")
	}
	m.cfg("apply", "--only", "memories").ok(t)
	if !reflect.DeepEqual(snapshot(t, m.root), before) || memCommits(t, m.home) != commits {
		t.Error("apply copied the directory again under its new prefix")
	}
	if memIsFile(filepath.Join(m.home, "memory", "renamed--gamma.md")) {
		t.Error("renamed--gamma.md was copied")
	}
}

func TestMemoriesAnotherDirectoryAddedLaterIsStillMergedAndTheListKeepsTheFirstOnes(t *testing.T) {
	m := newMemoriesRig(t)
	m.two(t)
	m.cfg("apply", "--only", "memories").ok(t)
	m.memDir(t, "-code-new", m.other, "- [N](n.md) — n\n", map[string]string{"n.md": "n\n"})
	m.cfg("apply", "--only", "memories").ok(t)
	if !memIsFile(filepath.Join(m.home, "memory", "mixed-case-2--n.md")) {
		t.Error("a directory not on the list is merged")
	}
	list := readFile(t, filepath.Join(m.home, "memory", ".merged-sources.json"))
	for _, want := range []string{"-code-example-app", "-code-Mixed-Case", "-code-new"} {
		if !strings.Contains(list, want) {
			t.Errorf("the list lacks %s:\n%s", want, list)
		}
	}
	if st := gitIn(t, m.home, "status", "--porcelain"); st != "" {
		t.Errorf("the list is committed with the rest:\n%s", st)
	}
}
