package home_test

import (
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/home"
)

// Ported from idea-loop/scripts/project-map.test.mjs: the SessionStart map (`home map`), `where`, and the
// lookups behind them. The test names of the old file are in each comment.

func TestMapInAWorktreeOfARepositoryRegisteredUnderItsHTTPSRemote(t *testing.T) { // "a worktree of a repository registered under its https remote…"
	w := newWorld(t, opts{})
	worktree := filepath.Join(w.root, "worktrees", "feature")
	gitIn(t, w.code, "worktree", "add", "-q", "-b", "feature", worktree)
	r := w.run(worktree, "home", "map").ok(t)
	if !strings.Contains(r.out, strings.TrimSpace(mapText)) || strings.Contains(r.out, home.TruncatedNotice) || strings.Contains(r.out, "other-app") {
		t.Fatal(r.out)
	}
}

func TestMapInTheMainCheckoutAndASubdirectory(t *testing.T) { // "the main checkout and a subdirectory of it get the map too"
	w := newWorld(t, opts{})
	if !strings.Contains(w.run(w.code, "home", "map").out, strings.TrimSpace(mapText)) {
		t.Fatal("main checkout")
	}
	sub := filepath.Join(w.code, "src")
	if err := os.Mkdir(sub, 0o755); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(w.run(sub, "home", "map").out, strings.TrimSpace(mapText)) {
		t.Fatal("subdirectory")
	}
}

func TestMapPrintsNothingWhereThereIsNothingToSay(t *testing.T) {
	// "opened in home itself", "a repository whose remote is not in the list", "a repository with no origin",
	// "a directory that is not in a git repository", "a device with no home directory"
	w := newWorld(t, opts{})
	plain := filepath.Join(w.root, "plain")
	if err := os.Mkdir(plain, 0o755); err != nil {
		t.Fatal(err)
	}
	unreg := newWorld(t, opts{origin: "git@github.com:acme/unregistered.git"})
	cases := map[string]result{
		"in home":       w.run(w.home, "home", "map"),
		"unregistered":  unreg.run(unreg.code, "home", "map"),
		"no origin":     w.run(repo(t, filepath.Join(w.root, "code", "local-only"), ""), "home", "map"),
		"not a repo":    w.run(plain, "home", "map"),
		"no home":       w.runWith(w.code, "", map[string]string{"IDEA_LOOP_HOME": filepath.Join(w.root, "no-such-home")}, "home", "map"),
		"no section":    newWorld(t, opts{agents: "# 设备\n\n没有项目一节。\n"}).runNoSection(t),
		"escaping name": newWorld(t, opts{agents: "## 项目\n\n" + listLine("../escape", remote)}).runNoSection(t),
	}
	for name, r := range cases {
		if r.code != 0 || r.out != "" {
			t.Errorf("%s: exit %d, stdout %q, stderr %q", name, r.code, r.out, r.err)
		}
	}
}

func (w world) runNoSection(t *testing.T) result { return w.run(w.code, "home", "map") }

func TestMapOfAHomeWithoutAgentsMdOrWithAnEmptyOne(t *testing.T) { // "a home without AGENTS.md, or with one that has no project section"
	w := newWorld(t, opts{})
	if err := os.WriteFile(filepath.Join(w.home, "AGENTS.md"), nil, 0o644); err != nil {
		t.Fatal(err)
	}
	if r := w.run(w.code, "home", "map"); r.code != 0 || r.out != "" {
		t.Fatal(r)
	}
	if err := os.Remove(filepath.Join(w.home, "AGENTS.md")); err != nil {
		t.Fatal(err)
	}
	if r := w.run(w.code, "home", "map"); r.code != 0 || r.out != "" {
		t.Fatal(r)
	}
}

func TestMapOf2500CharactersIsCutAt2000WithOneNoticeLine(t *testing.T) { // "a project map of 2500 characters…"
	w := newWorld(t, opts{mapMD: strings.Repeat("字", 2500)})
	r := w.run(w.code, "home", "map").ok(t)
	if r.out != strings.Repeat("字", 2000)+"\n"+home.TruncatedNotice+"\n" || home.TruncatedNotice != "项目地图超过 2000 字，已截断" {
		t.Fatal(r.out)
	}
}

func TestMapTextCountsUnicodeCharactersNotBytesOrUTF16Units(t *testing.T) { // "a project map of exactly 2000 characters is injected whole…"
	if got := home.MapText(strings.Repeat("字", home.MapLimit)); got != strings.Repeat("字", home.MapLimit)+"\n" {
		t.Fatal("2000 CJK characters are whole")
	}
	if got := home.MapText(strings.Repeat("😀", home.MapLimit)); got != strings.Repeat("😀", home.MapLimit)+"\n" {
		t.Fatal("2000 emoji are whole")
	}
	if got := home.MapText(strings.Repeat("😀", home.MapLimit+1)); got != strings.Repeat("😀", home.MapLimit)+"\n"+home.TruncatedNotice+"\n" {
		t.Fatal("2001 emoji are cut")
	}
}

func TestMapWhoseFileIsNotThereIsOneLineSayingSo(t *testing.T) { // "registered, but the map file is not there…"
	w := newWorld(t, opts{noMap: true})
	r := w.run(w.code, "home", "map").ok(t)
	if len(strings.Split(strings.TrimSpace(r.out), "\n")) != 1 || !strings.Contains(r.out, filepath.Join(w.home, "projects", "example-app")) || !strings.Contains(r.out, "还没写") {
		t.Fatal(r.out)
	}
}

func TestMapOfAnUnreadableHomeIsNothingAndExitZero(t *testing.T) { // "an unreadable home (AGENTS.md is a directory)"
	w := newWorld(t, opts{})
	agents := filepath.Join(w.home, "AGENTS.md")
	if err := os.Remove(agents); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(agents, 0o755); err != nil {
		t.Fatal(err)
	}
	if r := w.run(w.code, "home", "map"); r.code != 0 || r.out != "" {
		t.Fatal(r)
	}
}

func TestMapInAMovedProjectStartsWithTheProjectDirectoryLine(t *testing.T) { // "the hook in a moved project…", "…whose map is not written"
	w := moved(t, opts{})
	r := w.run(w.code, "home", "map").ok(t)
	if strings.Split(r.out, "\n")[0] != "项目目录："+filepath.Join(w.home, "projects", "example-app") || !strings.Contains(r.out, strings.TrimSpace(mapText)) {
		t.Fatal(r.out)
	}
	w = moved(t, opts{noMap: true})
	r = w.run(w.code, "home", "map").ok(t)
	if strings.Split(r.out, "\n")[0] != "项目目录："+filepath.Join(w.home, "projects", "example-app") || !strings.Contains(r.out, "还没写") {
		t.Fatal(r.out)
	}
}

func TestMapOfAProjectThatHasNotMovedIsTheMigrationSentenceAlone(t *testing.T) { // "the hook in a project that has not moved…", "…only a plain docs/…", "…no home directory… not moved"
	w := moved(t, opts{})
	if err := os.RemoveAll(filepath.Join(w.home, docsRel)); err != nil {
		t.Fatal(err)
	}
	write(t, w.code, "DEVELOPMENT.md", "# dev\n")
	if r := w.run(w.code, "home", "map").ok(t); r.out != home.NotMoved+"\n" {
		t.Fatal(r.out)
	}
	if r := w.runWith(w.code, "", map[string]string{"IDEA_LOOP_HOME": filepath.Join(w.root, "no-such-home")}, "home", "map").ok(t); r.out != "" {
		t.Fatal("no home directory: nothing, even in a repository that has not moved:", r.out)
	}

	w = newWorld(t, opts{})
	if err := os.MkdirAll(filepath.Join(w.code, "docs", "guides"), 0o755); err != nil {
		t.Fatal(err)
	}
	if r := w.run(w.code, "home", "map").ok(t); r.out != mapText {
		t.Fatal("a plain docs/ is not idea-loop's, the map alone:", r.out)
	}
	if err := os.MkdirAll(filepath.Join(w.code, "docs", "spec"), 0o755); err != nil {
		t.Fatal(err)
	}
	if r := w.run(w.code, "home", "map").ok(t); r.out != home.NotMoved+"\n" {
		t.Fatal("with a docs/spec/:", r.out)
	}
}

func TestMapInHomeItselfPrintsNothingEvenThoughHomeHasAProjectWithDocs(t *testing.T) { // "the hook opened in home itself…"
	w := moved(t, opts{})
	if r := w.run(w.home, "home", "map").ok(t); r.out != "" {
		t.Fatal(r.out)
	}
}

func TestNormalizeRemoteKeepsCaseOfOwnerAndRepoAndRefusesNonsense(t *testing.T) { // "normalizeRemote: the owner and repository keep their case…" (the spelling table is in home_test.go)
	if got := home.NormalizeRemote("https://github.com/Acme/Example-App.git"); got != "github.com/Acme/Example-App" {
		t.Fatal(got)
	}
	if home.NormalizeRemote("https://github.com/acme/example-app") == home.NormalizeRemote("https://github.com/acme/example-app2") ||
		home.NormalizeRemote("https://github.com/acme/example-app") == home.NormalizeRemote("https://gitlab.com/acme/example-app") {
		t.Fatal("different repositories stay different")
	}
	for _, in := range []string{"", "   ", "/local/path/repo", "https://github.com/"} {
		if got := home.NormalizeRemote(in); got != "" {
			t.Errorf("%q → %q", in, got)
		}
	}
	for _, in := range []string{"http://github.com/acme/example-app.git", "https://user:token@github.com/acme/example-app.git", "git@GITHUB.COM:acme/example-app.git", "ssh://git@github.com:22/acme/example-app.git", "  git@github.com:acme/example-app.git\n"} {
		if got := home.NormalizeRemote(in); got != "github.com/acme/example-app" {
			t.Errorf("%q → %q", in, got)
		}
	}
}

func TestParseProjectsOfNothingIsNothing(t *testing.T) { // "parseProjects… (empty and undefined)"
	if got := home.ParseProjects(""); len(got) != 0 {
		t.Fatal(got)
	}
}

type whereJSON struct {
	Project    string `json:"project"`
	ProjectDir string `json:"projectDir"`
	Docs       string `json:"docs"`
	Repo       string `json:"repo"`
	Clone      string `json:"clone"`
	CloneDir   string `json:"cloneDir"`
	InHome     bool   `json:"inHome"`
}

func TestWhereFromAWorktreeIsTheProjectDirectoryInHome(t *testing.T) { // "where, from a worktree of the code repository…"
	w := moved(t, opts{})
	worktree := filepath.Join(w.root, "worktrees", "feature")
	gitIn(t, w.code, "worktree", "add", "-q", "-b", "feature", worktree)
	r := w.run(worktree, "home", "where").ok(t)
	var got whereJSON
	if err := json.Unmarshal([]byte(r.out), &got); err != nil {
		t.Fatal(err)
	}
	want := whereJSON{"example-app", filepath.Join(w.home, "projects", "example-app"), filepath.Join(w.home, docsRel), "acme/example-app", "~/projects/example-app", filepath.Join(w.root, "projects", "example-app"), true}
	if got != want {
		t.Fatalf("%+v", got)
	}
	if !strings.HasPrefix(r.out, "{\n  \"project\": \"example-app\",\n") {
		t.Fatal("two-space indent, project first:", r.out)
	}
}

func TestLocateByDocsOfADocsInHomeIsWhatWhereProjectGives(t *testing.T) { // "locateByDocs: the docs/ of a project directory in home names its project…"
	w := moved(t, opts{})
	env := func(k string) string { return map[string]string{"IDEA_LOOP_HOME": w.home, "HOME": w.root}[k] }
	found := home.LocateByDocs(filepath.Join(w.home, docsRel), env)
	if !found.OK || found.Project != "example-app" || found.Repo != "acme/example-app" || found.ProjectDir != filepath.Join(w.home, "projects", "example-app") || found.CloneDir != filepath.Join(w.root, "projects", "example-app") {
		t.Fatalf("%+v", found)
	}
	if byName := home.Locate("", env, "example-app"); byName != found {
		t.Fatalf("%+v vs %+v", byName, found)
	}
}

func TestLocateByDocsThroughASymlinkIsStillThatProject(t *testing.T) { // "locateByDocs: a path that reaches the docs/ of home through a symlink…"
	w := moved(t, opts{})
	link := filepath.Join(w.root, "link")
	if err := os.Symlink(w.home, link); err != nil {
		t.Fatal(err)
	}
	env := func(k string) string { return map[string]string{"IDEA_LOOP_HOME": w.home, "HOME": w.root}[k] }
	if found := home.LocateByDocs(filepath.Join(link, docsRel), env); !found.OK || found.Project != "example-app" {
		t.Fatalf("%+v", found)
	}
}

func TestWhereProjectFromAnywhereAndBareInHomeIsRefused(t *testing.T) { // "where --project from home gives the same directory…"
	w := moved(t, opts{})
	var fromCode, named, elsewhere whereJSON
	for _, c := range []struct {
		into *whereJSON
		r    result
	}{
		{&fromCode, w.run(w.code, "home", "where").ok(t)},
		{&named, w.run(w.home, "home", "where", "--project", "example-app").ok(t)},
		{&elsewhere, w.run(w.root, "home", "where", "--project", "example-app").ok(t)},
	} {
		if err := json.Unmarshal([]byte(c.r.out), c.into); err != nil {
			t.Fatal(err)
		}
	}
	if named.ProjectDir != fromCode.ProjectDir || elsewhere.ProjectDir != fromCode.ProjectDir {
		t.Fatal(named, elsewhere, fromCode)
	}
	bare := w.run(w.home, "home", "where")
	if bare.code != 1 || strings.TrimSpace(bare.err) != "当前目录是 home 本身，要带 --project <名字>" || bare.out != "" {
		t.Fatalf("%+v", bare)
	}
}

func TestWhereProjectWithAnUnlistedOrEscapingNameFails(t *testing.T) { // "where --project with a name that is not in the list, or that would leave projects/…"
	w := moved(t, opts{})
	for _, name := range []string{"nope", "..", "a/b"} {
		r := w.run(w.home, "home", "where", "--project", name)
		if r.code == 0 || r.out != "" || !strings.Contains(r.err, home.NotConnected) {
			t.Errorf("%s: %+v", name, r)
		}
	}
	if r := w.run(w.home, "home", "where", "--project"); r.code == 0 {
		t.Error("--project without a name")
	}
}

func TestWhereOfAProjectThatHasNotMoved(t *testing.T) { // "where, projects/<名字>/docs/ gone and a DEVELOPMENT.md…", "where: any one bootstrap file…"
	w := moved(t, opts{})
	if err := os.RemoveAll(filepath.Join(w.home, docsRel)); err != nil {
		t.Fatal(err)
	}
	write(t, w.code, "DEVELOPMENT.md", "# dev\n")
	r := w.run(w.code, "home", "where")
	if r.code == 0 || r.out != "" || strings.TrimSpace(r.err) != "这个项目还没搬进 home，先跑 `/idea-loop:setup` 迁移" || home.NotMoved != "这个项目还没搬进 home，先跑 `/idea-loop:setup` 迁移" {
		t.Fatalf("%+v", r)
	}
	for _, file := range []string{"DEVELOPMENT.md", "REVIEW.md", "CODING_STANDARDS.md", "PRODUCT.md", "ISSUE_TRACKER.md", "GLOSSARY.md", "DESIGN.md", "SEO.md", "docs/spec/", "docs/adr/"} {
		w := newWorld(t, opts{})
		if strings.HasSuffix(file, "/") {
			if err := os.MkdirAll(filepath.Join(w.code, file), 0o755); err != nil {
				t.Fatal(err)
			}
		} else {
			write(t, w.code, file, "x\n")
		}
		if r := w.run(w.code, "home", "where"); r.code == 0 || !strings.Contains(r.err, home.NotMoved) {
			t.Errorf("%s: %+v", file, r)
		}
	}
	u := newWorld(t, opts{origin: "git@github.com:acme/unregistered.git"})
	write(t, u.code, "REVIEW.md", "x\n")
	if r := u.run(u.code, "home", "where"); !strings.Contains(r.err, home.NotMoved) {
		t.Fatal("an unregistered repository with a bootstrap file too:", r)
	}
}

func TestWhereOfARepositoryThatIsNotConnected(t *testing.T) { // "where for a repository that is not in the project list, has no origin, or is no repository…"
	u := newWorld(t, opts{origin: "git@github.com:acme/unregistered.git"})
	plain := filepath.Join(u.root, "plain")
	if err := os.Mkdir(plain, 0o755); err != nil {
		t.Fatal(err)
	}
	for _, cwd := range []string{u.code, repo(t, filepath.Join(u.root, "code", "local-only"), ""), plain} {
		r := u.run(cwd, "home", "where")
		if r.code == 0 || r.out != "" || strings.TrimSpace(r.err) != "这个仓库没接上 idea-loop，先跑 `/idea-loop:setup`" {
			t.Errorf("%s: %+v", cwd, r)
		}
	}
	if home.NotConnected != "这个仓库没接上 idea-loop，先跑 `/idea-loop:setup`" || !strings.Contains(home.InHome, "--project") {
		t.Fatal("the sentences")
	}
	// a listed project with no docs/ in home and nothing to migrate in the clone: not connected, not "not moved"
	w := newWorld(t, opts{})
	if r := w.run(w.code, "home", "where"); !strings.Contains(r.err, home.NotConnected) {
		t.Fatal(r)
	}
}

func TestWhereOfARepositoryWithAPlainDocsIsNotConnectedAndWithASpecIsNotMoved(t *testing.T) { // "where: a repository whose docs/ is plain…"
	for _, origin := range []string{"git@github.com:acme/example-app.git", "git@github.com:acme/unregistered.git"} {
		w := newWorld(t, opts{origin: origin})
		write(t, w.code, "docs/README.md", "x\n")
		if err := os.MkdirAll(filepath.Join(w.code, "docs", "guides"), 0o755); err != nil {
			t.Fatal(err)
		}
		if r := w.run(w.code, "home", "where"); r.code == 0 || r.out != "" || strings.TrimSpace(r.err) != home.NotConnected {
			t.Errorf("%s: %+v", origin, r)
		}
		if err := os.MkdirAll(filepath.Join(w.code, "docs", "spec"), 0o755); err != nil {
			t.Fatal(err)
		}
		if r := w.run(w.code, "home", "where"); !strings.Contains(r.err, home.NotMoved) {
			t.Errorf("%s with a spec/: %+v", origin, r)
		}
	}
}

func TestAnUnknownHomeCommandIsRefusedAndListsTheCommands(t *testing.T) { // "an unknown command: usage on stderr, exit non-zero"
	w := moved(t, opts{})
	r := w.run(w.home, "home", "frobnicate")
	if r.code == 0 || !strings.Contains(r.err, "不认识的命令「frobnicate」") || !strings.Contains(r.err, "commit") {
		t.Fatalf("%+v", r)
	}
}

func TestMapAndWhereAreTheOldScriptsOutput(t *testing.T) { // the SessionStart text and `where`'s JSON are the old project-map.mjs's, byte for byte
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node is needed to run the old script")
	}
	script, _ := filepath.Abs(filepath.Join("..", "..", "..", "idea-loop", "scripts", "project-map.mjs"))
	old := func(w world, cwd string, args ...string) (string, int) {
		cmd := exec.Command(node, append([]string{script}, args...)...)
		cmd.Dir = cwd
		cmd.Env = []string{"PATH=" + os.Getenv("PATH"), "HOME=" + w.root, "IDEA_LOOP_HOME=" + w.home}
		out, _ := cmd.Output()
		return string(out), cmd.ProcessState.ExitCode()
	}
	worlds := map[string]world{
		"moved":     moved(t, opts{}),
		"no map":    moved(t, opts{noMap: true}),
		"long map":  moved(t, opts{mapMD: strings.Repeat("字", 2500)}),
		"not moved": newWorld(t, opts{}),
		"unlisted":  newWorld(t, opts{origin: "git@github.com:acme/unregistered.git"}),
	}
	// not moved / unlisted: a bootstrap file in the code repository says it has not moved yet
	write(t, worlds["not moved"].code, "DEVELOPMENT.md", "x\n")
	write(t, worlds["unlisted"].code, "DEVELOPMENT.md", "x\n")
	for name, w := range worlds {
		wantOut, _ := old(w, w.code)
		if got := w.run(w.code, "home", "map").ok(t).out; got != wantOut {
			t.Errorf("%s map:\nold: %q\ndyna: %q", name, wantOut, got)
		}
		wantOut, wantCode := old(w, w.code, "where")
		r := w.run(w.code, "home", "where")
		if r.out != wantOut || (r.code == 0) != (wantCode == 0) {
			t.Errorf("%s where:\nold (%d): %q\ndyna (%d): %q", name, wantCode, wantOut, r.code, r.out)
		}
	}
}
