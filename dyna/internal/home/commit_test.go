package home_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// Ported from idea-loop/scripts/project-map.test.mjs (`commit`), then the two guards `home commit` gained: a
// slug two files of docs/ share, and a [[…]] that points at no file.

func TestCommitTakesOnlyTheListedFiles(t *testing.T) { // "commit: two files written and a third staged by another session…"
	w := moved(t, opts{})
	write(t, w.home, docsRel+"/spec/a.md", "x\n")
	write(t, w.home, docsRel+"/spec/b.md", "x\n")
	write(t, w.home, docsRel+"/other-session.md", "x\n")
	gitIn(t, w.home, "add", docsRel+"/other-session.md")
	w.run(w.home, "home", "commit", "docs(spec): a", docsRel+"/spec/a.md").ok(t)
	if got := filesOf(t, w.home, "HEAD"); len(got) != 1 || got[0] != docsRel+"/spec/a.md" {
		t.Fatal(got)
	}
	if subjects(t, w.home)[0] != "docs(spec): a" {
		t.Fatal(subjects(t, w.home))
	}
	if got := gitIn(t, w.home, "diff", "--cached", "--name-only"); got != docsRel+"/other-session.md" {
		t.Fatal("the other session's staged file stays staged:", got)
	}
	if got := gitIn(t, w.home, "ls-files", "--others", "--exclude-standard"); got != docsRel+"/spec/b.md" {
		t.Fatal("the unlisted file stays untracked:", got)
	}
}

func TestCommitPathsAreRelativeToCwdAbsoluteWorkAndADeletionIsCommitted(t *testing.T) { // "commit: paths are relative to where it is run…"
	w := moved(t, opts{})
	docs := filepath.Join(w.home, docsRel)
	write(t, w.home, docsRel+"/gone.md", "x\n")
	gitIn(t, w.home, "add", "-A")
	gitIn(t, w.home, "commit", "-q", "-m", "add gone")
	if err := os.Remove(filepath.Join(docs, "gone.md")); err != nil {
		t.Fatal(err)
	}
	write(t, w.home, docsRel+"/new.md", "a different text, so git does not call this a rename\n")
	w.run(docs, "home", "commit", "tidy", "gone.md", filepath.Join(docs, "new.md")).ok(t)
	got := filesOf(t, w.home, "HEAD")
	if len(got) != 2 || got[0] != docsRel+"/gone.md" || got[1] != docsRel+"/new.md" {
		t.Fatal(got)
	}
	if s := gitIn(t, w.home, "status", "--porcelain"); s != "" {
		t.Fatal(s)
	}
}

func TestCommitOfAFileOutsideHomeIsRefusedAndNothingIsCommitted(t *testing.T) { // "commit: a file outside home is refused…"
	w := moved(t, opts{})
	write(t, w.home, docsRel+"/inside.md", "x\n")
	before := gitIn(t, w.home, "rev-parse", "HEAD")
	for _, bad := range []string{filepath.Join(w.root, "code", "example-app", "README.md"), "../outside.md", filepath.Join(w.root, "home-evil", "x.md")} {
		r := w.run(w.home, "home", "commit", "nope", docsRel+"/inside.md", bad)
		if r.code == 0 || !strings.Contains(r.err, "不在 home") {
			t.Errorf("%s: %+v", bad, r)
		}
	}
	if gitIn(t, w.home, "rev-parse", "HEAD") != before || gitIn(t, w.home, "diff", "--cached", "--name-only") != "" {
		t.Fatal("something was committed or staged")
	}
}

func TestCommitWithoutAMessageOrFilesIsRefused(t *testing.T) { // "commit without a message or without files: refused"
	w := moved(t, opts{})
	if w.run(w.home, "home", "commit").code == 0 || w.run(w.home, "home", "commit", "only a message").code == 0 {
		t.Fatal("accepted")
	}
}

func TestCommitOfAFileWithNoChangeMakesNoCommitAndExitsZero(t *testing.T) { // "commit: a listed file with no change…"
	w := moved(t, opts{})
	before := gitIn(t, w.home, "rev-parse", "HEAD")
	r := w.run(w.home, "home", "commit", "nothing", docsRel+"/index.md").ok(t)
	if gitIn(t, w.home, "rev-parse", "HEAD") != before || !strings.Contains(r.out, "没有改动") {
		t.Fatal(r.out)
	}
}

func TestCommitInAHomeWithoutOriginDoesNotComplainAboutPushing(t *testing.T) { // "commit: home without an origin…"
	w := moved(t, opts{})
	write(t, w.home, docsRel+"/a.md", "x\n")
	r := w.run(w.home, "home", "commit", "a", docsRel+"/a.md").ok(t)
	if strings.Contains(r.out, "没推上去") || subjects(t, w.home)[0] != "a" {
		t.Fatal(r.out)
	}
}

func TestCommitWithAnOriginThatCannotBeReachedSaysSoAndKeepsTheCommit(t *testing.T) { // "commit: home with an origin that cannot be reached…"
	w := moved(t, opts{})
	gitIn(t, w.home, "remote", "add", "origin", filepath.Join(w.root, "no-such-remote.git"))
	write(t, w.home, docsRel+"/a.md", "x\n")
	r := w.run(w.home, "home", "commit", "a", docsRel+"/a.md").ok(t)
	if !strings.Contains(r.out, "home 没推上去：") || subjects(t, w.home)[0] != "a" {
		t.Fatal(r.out)
	}
}

func bareRemote(t *testing.T, w world) string {
	remote := filepath.Join(w.root, "remote.git")
	gitIn(t, w.root, "init", "-q", "--bare", "-b", "main", remote)
	gitIn(t, w.home, "remote", "add", "origin", remote)
	return remote
}

func TestCommitPushesToAnOriginThatIsStillEmpty(t *testing.T) { // "commit: home with a working origin that is still empty: pushed"
	w := moved(t, opts{})
	remote := bareRemote(t, w)
	write(t, w.home, docsRel+"/a.md", "x\n")
	r := w.run(w.home, "home", "commit", "a", docsRel+"/a.md").ok(t)
	if strings.Contains(r.out, "没推上去") || subjects(t, remote, "main")[0] != "a" {
		t.Fatal(r.out)
	}
}

func TestCommitRebasesOnAMovedRemoteAndKeepsAnotherSessionsStagedFile(t *testing.T) { // "commit: the remote moved on meanwhile…"
	w := moved(t, opts{})
	remote := bareRemote(t, w)
	gitIn(t, w.home, "push", "-q", "-u", "origin", "main")
	other := filepath.Join(w.root, "other-device")
	gitIn(t, w.root, "clone", "-q", remote, other)
	write(t, other, docsRel+"/from-other-device.md", "x\n")
	gitIn(t, other, "add", "-A")
	gitIn(t, other, "commit", "-q", "-m", "other device")
	gitIn(t, other, "push", "-q", "origin", "main")

	write(t, w.home, docsRel+"/a.md", "x\n")
	write(t, w.home, docsRel+"/other-session.md", "x\n")
	gitIn(t, w.home, "add", docsRel+"/other-session.md")
	r := w.run(w.home, "home", "commit", "a", docsRel+"/a.md").ok(t)
	if strings.Contains(r.out, "没推上去") {
		t.Fatal(r.out)
	}
	if got := subjects(t, remote, "main"); got[0] != "a" || got[1] != "other device" {
		t.Fatal(got)
	}
	if _, err := os.Stat(filepath.Join(w.home, docsRel, "from-other-device.md")); err != nil {
		t.Fatal("the other device's file did not arrive")
	}
	if got := gitIn(t, w.home, "diff", "--cached", "--name-only"); got != docsRel+"/other-session.md" {
		t.Fatal(got)
	}
}

func TestCommitRetriesOnceOnAHeldIndexLock(t *testing.T) { // "commit: a held index.lock that is gone within a second…", "…that stays…"
	w := moved(t, opts{})
	write(t, w.home, docsRel+"/a.md", "x\n")
	lock := filepath.Join(w.home, ".git", "index.lock")
	if err := os.WriteFile(lock, nil, 0o644); err != nil {
		t.Fatal(err)
	}
	go func() {
		time.Sleep(300 * time.Millisecond)
		_ = os.Remove(lock)
	}()
	w.run(w.home, "home", "commit", "a", docsRel+"/a.md").ok(t)
	if subjects(t, w.home)[0] != "a" {
		t.Fatal("not committed after the lock went")
	}

	write(t, w.home, docsRel+"/b.md", "x\n")
	before := gitIn(t, w.home, "rev-parse", "HEAD")
	if err := os.WriteFile(lock, nil, 0o644); err != nil {
		t.Fatal(err)
	}
	r := w.run(w.home, "home", "commit", "b", docsRel+"/b.md")
	_ = os.Remove(lock)
	if r.code == 0 || !strings.Contains(r.err, "index.lock") || gitIn(t, w.home, "rev-parse", "HEAD") != before {
		t.Fatalf("%+v", r)
	}
}

func TestCommitInAHomeThatIsNotAGitRepositoryIsRefused(t *testing.T) { // "commit: a home that is not a git repository: refused"
	root := realDir(t)
	home := filepath.Join(root, "home")
	write(t, home, "a.md", "x\n")
	w := world{root: root, home: home, code: root}
	r := w.run(home, "home", "commit", "a", "a.md")
	if r.code == 0 || !strings.Contains(r.err, "不是 git 仓库") {
		t.Fatalf("%+v", r)
	}
}

// ---- the guards ----

func commitCount(t *testing.T, dir string) string {
	return gitIn(t, dir, "rev-list", "--count", "HEAD")
}

func TestCommitRefusesAFileThatLinksToADeletedSlugAndListsFileLineAndSlug(t *testing.T) {
	w := moved(t, opts{})
	write(t, w.home, docsRel+"/spec/a/a.md", "---\nsummary: 一份\n---\n\n正文。\n\n看这里 [[deleted-slug]] 已经没有了。\n")
	before := commitCount(t, w.home)
	r := w.run(w.home, "home", "commit", "docs: a", docsRel+"/spec/a/a.md")
	if r.code != 1 || r.out != "" {
		t.Fatalf("%+v", r)
	}
	for _, want := range []string{"home commit 拒绝", docsRel + "/spec/a/a.md:7", "[[deleted-slug]]", "下一条：", "dyna home commit"} {
		if !strings.Contains(r.err, want) {
			t.Errorf("stderr lacks %q:\n%s", want, r.err)
		}
	}
	if commitCount(t, w.home) != before || gitIn(t, w.home, "diff", "--cached", "--name-only") != "" {
		t.Fatal("a commit or a staged file came out of a refusal")
	}
	// the link fixed: the same command goes through
	write(t, w.home, docsRel+"/spec/a/a.md", "---\nsummary: 一份\n---\n\n看这里 [[index]]。\n")
	w.run(w.home, "home", "commit", "docs: a", docsRel+"/spec/a/a.md").ok(t)
}

func TestCommitFindsADeadLinkInAFileThatIsNotTheListedOne(t *testing.T) { // deleting a file leaves the others' links dead
	w := moved(t, opts{})
	write(t, w.home, docsRel+"/adr/0001-x.md", "见 [[0002-y]]。\n")
	write(t, w.home, docsRel+"/adr/0002-y.md", "y\n")
	gitIn(t, w.home, "add", "-A")
	gitIn(t, w.home, "commit", "-q", "-m", "two adrs")
	if err := os.Remove(filepath.Join(w.home, docsRel, "adr", "0002-y.md")); err != nil {
		t.Fatal(err)
	}
	r := w.run(w.home, "home", "commit", "rm y", docsRel+"/adr/0002-y.md")
	if r.code != 1 || !strings.Contains(r.err, docsRel+"/adr/0001-x.md:1  [[0002-y]]") {
		t.Fatalf("%+v", r)
	}
	if gitIn(t, w.home, "log", "-1", "--format=%s") != "two adrs" {
		t.Fatal("committed anyway")
	}
}

func TestCommitRefusesTwoFilesWithTheSameSlug(t *testing.T) {
	w := moved(t, opts{})
	write(t, w.home, docsRel+"/raw/same-name.md", "x\n")
	write(t, w.home, docsRel+"/adr/same-name.md", "y\n")
	before := commitCount(t, w.home)
	r := w.run(w.home, "home", "commit", "dup", docsRel+"/raw/same-name.md")
	if r.code != 1 {
		t.Fatalf("%+v", r)
	}
	for _, want := range []string{"slug 重名", "same-name", docsRel + "/raw/same-name.md", docsRel + "/adr/same-name.md"} {
		if !strings.Contains(r.err, want) {
			t.Errorf("stderr lacks %q:\n%s", want, r.err)
		}
	}
	if commitCount(t, w.home) != before {
		t.Fatal("committed anyway")
	}
}

func TestCommitDoesNotCountTicketsAndIndexFilesAsSharingASlug(t *testing.T) {
	w := moved(t, opts{})
	write(t, w.home, docsRel+"/spec/one/tickets/01-first.md", "# 01\n")
	write(t, w.home, docsRel+"/spec/two/tickets/01-first.md", "# 01\n")
	write(t, w.home, docsRel+"/spec/index.md", "# spec\n")
	write(t, w.home, docsRel+"/adr/index.md", "# adr\n")
	w.run(w.home, "home", "commit", "tickets", docsRel+"/spec/one/tickets/01-first.md", docsRel+"/spec/two/tickets/01-first.md", docsRel+"/spec/index.md", docsRel+"/adr/index.md").ok(t)
}

func TestCommitDoesNotCountLinksInInlineCodeOrCodeBlocks(t *testing.T) { // ADR 0042: formats shown as examples are not links
	w := moved(t, opts{})
	write(t, w.home, docsRel+"/raw/x.md", "写成 `[[<basename>]]` 这样。\n\n```\n[[not-a-file]]\n```\n\n  ~~~md\n  [[also-not]]\n  ~~~\n\n``两个 `[[tick]]` 反引号``\n\n[[index]] 和 [[index|别名]] 和 [[index#段]]。\n")
	w.run(w.home, "home", "commit", "examples", docsRel+"/raw/x.md").ok(t)
}

func TestCommitStillChecksLinksInFrontmatter(t *testing.T) { // ADR 0042: a "[[…]]" in frontmatter is a real link
	w := moved(t, opts{})
	write(t, w.home, docsRel+"/raw/x.md", "---\nrelated: [\"[[missing]]\"]\n---\nbody\n")
	r := w.run(w.home, "home", "commit", "fm", docsRel+"/raw/x.md")
	if r.code != 1 || !strings.Contains(r.err, docsRel+"/raw/x.md:2  [[missing]]") {
		t.Fatalf("%+v", r)
	}
}

func TestCommitOfAFileOutsideDocsIsNotHeldUpByTheDocs(t *testing.T) {
	w := moved(t, opts{})
	write(t, w.home, docsRel+"/raw/broken.md", "[[nowhere]]\n")
	write(t, w.home, "projects/example-app/AGENTS.md", "# map\n")
	w.run(w.home, "home", "commit", "map", "projects/example-app/AGENTS.md").ok(t)
}

func TestCommitChecksOnlyTheDocsOfTheProjectsItsFilesBelongTo(t *testing.T) {
	w := moved(t, opts{})
	write(t, w.home, "projects/other-app/docs/raw/broken.md", "[[nowhere]]\n")
	write(t, w.home, docsRel+"/raw/fine.md", "x\n")
	w.run(w.home, "home", "commit", "fine", docsRel+"/raw/fine.md").ok(t)
}

func TestAttachmentLinksResolveToAFileOfThatName(t *testing.T) {
	w := moved(t, opts{})
	write(t, w.home, docsRel+"/design/shot.png", "png")
	write(t, w.home, docsRel+"/raw/x.md", "![[shot.png]] 和 [[design/shot.png]]\n")
	w.run(w.home, "home", "commit", "img", docsRel+"/raw/x.md").ok(t)
	write(t, w.home, docsRel+"/raw/y.md", "![[lost.png]]\n")
	if r := w.run(w.home, "home", "commit", "img", docsRel+"/raw/y.md"); r.code != 1 || !strings.Contains(r.err, "[[lost.png]]") {
		t.Fatalf("%+v", r)
	}
}
