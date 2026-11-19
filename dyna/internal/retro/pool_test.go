package retro_test

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

// The assertions of the old retro-pool-count.test.mjs and retro-pool-reopened.test.mjs, one for one. The seam is
// the command line: a candidate-pool directory (or one candidate file in a git repository) in, the JSON and the
// exit code out. All candidates are invented (a fictional "checkout" product's rules).

type cand struct {
	title       string
	landing     *string // nil drops the bullet
	status      *string
	occurrences []string
	section     *string
}

func sp(s string) *string { return &s }

func candidate(over ...func(*cand)) string {
	c := cand{
		title:       "结算页：折扣码输入框失焦后再校验",
		landing:     sp("- 落点：插件 `checkout-skill` 的「折扣」一节"),
		status:      sp("- 状态：在池里"),
		occurrences: []string{"- shop-app#12（2026-10-01）：「折扣码填错了要等提交才报错」；决定记录：[[12]]"},
		section:     sp("## 出现"),
	}
	for _, f := range over {
		f(&c)
	}
	lines := []string{"---", "type: record", "captured: 2026-10-26", fmt.Sprintf(`title: "%s"`, c.title), "tags: [retro-candidates]", "---", "", "- 信号：纠正与追问"}
	if c.landing != nil {
		lines = append(lines, *c.landing)
	}
	lines = append(lines, "- 旧文：提交时才校验", "- 新文：失焦时校验", "- 例子：输入 SAVE0 后离开输入框，当场提示无效")
	if c.status != nil {
		lines = append(lines, *c.status)
	}
	lines = append(lines, "")
	if c.section != nil {
		lines = append(lines, *c.section, "")
		lines = append(lines, c.occurrences...)
		lines = append(lines, "")
	}
	return strings.Join(lines, "\n")
}

func withOcc(lines ...string) func(*cand) { return func(c *cand) { c.occurrences = lines } }

type poolResult struct {
	Threshold  int
	Candidates []struct {
		File         string
		Title        *string
		Landing      *string
		Status       *string
		StatusDetail *string
		Count        int
		Passes       bool
	}
	Problems []struct{ File, Message string }
}

func (p poolResult) by(name string) (c struct {
	File         string
	Title        *string
	Landing      *string
	Status       *string
	StatusDetail *string
	Count        int
	Passes       bool
}) {
	for _, x := range p.Candidates {
		if x.File == name {
			return x
		}
	}
	return c
}

func countPool(t *testing.T, files map[string]string) (int, poolResult, string) {
	t.Helper()
	dir := t.TempDir()
	for name, md := range files {
		writeFile(t, filepath.Join(dir, name), md)
	}
	r := dyna(nil, "retro", "pool", "count", dir)
	var res poolResult
	if strings.HasPrefix(strings.TrimSpace(r.stdout), "{") {
		jsonOf(t, r.stdout, &res)
	}
	return r.code, res, r.all()
}

func line(session, text string, extra ...string) string {
	return fmt.Sprintf("- %s（2026-10-01）：「%s」；决定记录：[[x]]%s", session, text, strings.Join(extra, ""))
}

func TestThreeOccurrencesOneOverturnedLaterCountsTwoAndDoesNotPass(t *testing.T) {
	code, res, _ := countPool(t, map[string]string{"a.md": candidate(withOcc(line("shop-app#1", "第一次"),
		line("shop-app#2", "第二次", "（已推翻：「当时选错了」）"),
		line("shop-app#3", "第三次")))})
	a := res.by("a.md")
	if code != 0 || a.Count != 2 || a.Passes {
		t.Fatal(code, a)
	}
}

func TestThreeOccurrencesThatAllStandCountThreeAndPass(t *testing.T) {
	code, res, _ := countPool(t, map[string]string{"a.md": candidate(withOcc(line("shop-app#1", "一"), line("shop-app#2", "二"), line("admin-app#7", "三")))})
	a := res.by("a.md")
	if code != 0 || a.Count != 3 || !a.Passes || res.Threshold != 3 {
		t.Fatal(code, a, res.Threshold)
	}
}

func TestTwoLinesFromTheSameSessionCountOnceTheSameNumberInAnotherRepoIsAnotherSession(t *testing.T) {
	_, res, _ := countPool(t, map[string]string{
		"same.md":       candidate(withOcc(line("shop-app#5", "一"), line("shop-app#5", "同一场里又一句"), line("shop-app#6", "三"))),
		"other-repo.md": candidate(withOcc(line("shop-app#5", "一"), line("admin-app#5", "另一个仓库的 5 号"))),
	})
	if res.by("same.md").Count != 2 || res.by("other-repo.md").Count != 2 {
		t.Fatal(res)
	}
}

func TestASessionWithOneOverturnedLineAndOneStandingLineStillCountsOnce(t *testing.T) {
	_, res, _ := countPool(t, map[string]string{"a.md": candidate(withOcc(line("shop-app#5", "这句后来推翻了", "（已推翻：「选错了」）"),
		line("shop-app#5", "这句仍成立"),
		line("shop-app#6", "另一场里被推翻", "（已推翻：「也选错了」）")))})
	if res.by("a.md").Count != 1 {
		t.Fatal(res)
	}
}

func TestAQuoteThatMerelyContainsTheWordOverturnedIsNotAnOverturn(t *testing.T) {
	_, res, _ := countPool(t, map[string]string{"a.md": candidate(withOcc(line("shop-app#1", "那条规则已推翻过一次，现在照旧")))})
	if res.by("a.md").Count != 1 {
		t.Fatal(res)
	}
}

func TestReportsTitleLandingAndTheStatusKindWithItsDetail(t *testing.T) {
	_, res, _ := countPool(t, map[string]string{
		"open.md":    candidate(func(c *cand) { c.status = sp("- 状态：已开 issue（https://example.test/o/r/issues/9）") }),
		"dropped.md": candidate(func(c *cand) { c.status = sp("- 状态：驳回（只在一个页面出现）") }),
		"pool.md":    candidate(),
	})
	pool := res.by("pool.md")
	if *pool.Title != "结算页：折扣码输入框失焦后再校验" || *pool.Landing != "插件 `checkout-skill` 的「折扣」一节" || *pool.Status != "在池里" || pool.StatusDetail != nil {
		t.Fatalf("%+v", pool)
	}
	open := res.by("open.md")
	if *open.Status != "已开 issue" || *open.StatusDetail != "https://example.test/o/r/issues/9" {
		t.Fatalf("%+v", open)
	}
	dropped := res.by("dropped.md")
	if *dropped.Status != "驳回" || *dropped.StatusDetail != "只在一个页面出现" {
		t.Fatalf("%+v", dropped)
	}
}

func TestACleanPoolExitsZeroWithNoProblemsFilesOtherThanMdAreIgnored(t *testing.T) {
	code, res, raw := countPool(t, map[string]string{"a.md": candidate(), "b.md": candidate(), "notes.txt": "not a candidate", "index.md": "# not a candidate either"})
	if code != 0 || len(res.Problems) != 0 || len(res.Candidates) != 2 || !strings.Contains(raw, `"problems": []`) {
		t.Fatal(code, res, raw)
	}
}

func TestMissingTheOccurrenceSectionIsAProblemNamingTheFileNonZeroExit(t *testing.T) {
	code, res, _ := countPool(t, map[string]string{"good.md": candidate(), "bad.md": candidate(func(c *cand) { c.section = nil })})
	if code == 0 || len(res.Problems) != 1 || res.Problems[0].File != "bad.md" || !strings.Contains(res.Problems[0].Message, "出现") || res.by("bad.md").Passes {
		t.Fatal(code, res)
	}
}

func TestAnOccurrenceSectionWithNoLineInItIsAProblemToo(t *testing.T) {
	code, res, _ := countPool(t, map[string]string{"bad.md": candidate(withOcc())})
	if code == 0 || !strings.Contains(res.Problems[0].Message, "出现") {
		t.Fatal(code, res)
	}
}

func TestMissingTheStatusLineIsAProblem(t *testing.T) {
	code, res, _ := countPool(t, map[string]string{"bad.md": candidate(func(c *cand) { c.status = nil })})
	if code == 0 || res.Problems[0].File != "bad.md" || !strings.Contains(res.Problems[0].Message, "状态") {
		t.Fatal(code, res)
	}
}

func TestAStatusOutsideTheClosedSetIsAProblemThatShowsTheOffendingText(t *testing.T) {
	for _, status := range []string{"- 状态：待定", "- 状态：已开 issue", "- 状态：驳回", "- 状态：已开 issue（）"} {
		s := status
		code, res, _ := countPool(t, map[string]string{"bad.md": candidate(func(c *cand) { c.status = &s })})
		if code == 0 || !strings.Contains(res.Problems[0].Message, "状态") {
			t.Fatal(status, code, res)
		}
	}
	_, res, _ := countPool(t, map[string]string{"bad.md": candidate(func(c *cand) { c.status = sp("- 状态：待定") })})
	if !strings.Contains(res.Problems[0].Message, "待定") {
		t.Fatal(res)
	}
}

func TestAnOccurrenceLineThatNamesNoSessionIsAProblemNotASilentZero(t *testing.T) {
	code, res, _ := countPool(t, map[string]string{"bad.md": candidate(withOcc("- 上周某次会话里：「折扣码填错了」"))})
	if code == 0 || !strings.Contains(res.Problems[0].Message, "出现") {
		t.Fatal(code, res)
	}
}

func TestMissingTheTitleOrTheLandingIsAProblem(t *testing.T) {
	code, res, _ := countPool(t, map[string]string{"a.md": candidate(func(c *cand) { c.landing = nil })})
	if code == 0 || !strings.Contains(res.Problems[0].Message, "落点") {
		t.Fatal(code, res)
	}
	noTitle := regexp.MustCompile(`(?m)^title: .*\n`).ReplaceAllString(candidate(), "")
	code, res, _ = countPool(t, map[string]string{"a.md": noTitle})
	if code == 0 || !strings.Contains(res.Problems[0].Message, "title") {
		t.Fatal(code, res)
	}
}

func TestPoolCountUsageNoDirectoryOrOneThatDoesNotExistExitsOne(t *testing.T) {
	if r := dyna(nil, "retro", "pool", "count"); r.code != 1 {
		t.Fatal(r)
	}
	if r := dyna(nil, "retro", "pool", "count", filepath.Join(t.TempDir(), "no-such-retro-pool-dir")); r.code != 1 {
		t.Fatal(r)
	}
}

// Cases the old tests did not spell out: a frontmatter that is not readable, or not a mapping, or not a string title.

func TestAFrontmatterThatIsNotYAMLNotAMappingOrWithoutAStringTitleIsAProblemNotACrash(t *testing.T) {
	body := candidate()
	rest := body[strings.Index(body, "\n---\n")+5:]
	cases := map[string]string{
		"broken yaml":    "---\ntitle: \"未闭合\ntags: [a\n---\n" + rest,
		"a list":         "---\n- a\n- b\n---\n" + rest,
		"number title":   "---\ntitle: 123\n---\n" + rest,
		"empty title":    "---\ntitle: \"  \"\n---\n" + rest,
		"no frontmatter": rest,
	}
	for name, md := range cases {
		code, res, raw := countPool(t, map[string]string{"x.md": md})
		if code != 2 || len(res.Problems) == 0 || res.by("x.md").Passes {
			t.Errorf("%s: %d %s", name, code, raw)
		}
	}
}

func TestADateLookingTitleIsStillAString(t *testing.T) {
	md := strings.Replace(candidate(), `title: "结算页：折扣码输入框失焦后再校验"`, "title: 2026-10-26", 1)
	code, res, raw := countPool(t, map[string]string{"x.md": md})
	if code != 0 || res.by("x.md").Title == nil || *res.by("x.md").Title != "2026-10-26" {
		t.Fatal(code, raw)
	}
}

// The old script answers the same over a pool that has a bit of everything.
func TestPoolCountAnswersLikeTheOldScript(t *testing.T) {
	node, script := oldScript(t, "retro-pool-count.mjs")
	dir := t.TempDir()
	files := map[string]string{
		"a.md":     candidate(withOcc(line("shop-app#1", "一"), line("shop-app#2", "二"), line("admin-app#7", "三"))),
		"b.md":     candidate(func(c *cand) { c.status = sp("- 状态：驳回（只在一个页面出现）") }),
		"c.md":     candidate(func(c *cand) { c.section = nil }),
		"d.md":     candidate(func(c *cand) { c.status = sp("- 状态：待定") }),
		"e.md":     candidate(withOcc("- 上周某次会话里：「折扣码填错了」")),
		"f.md":     candidate(func(c *cand) { c.landing = nil }),
		"g.md":     candidate(func(c *cand) { c.status = sp("- 状态：已开 issue（https://example.test/o/r/issues/9）") }),
		"index.md": "# x",
	}
	body := candidate()
	rest := body[strings.Index(body, "\n---\n")+5:]
	files["h.md"] = "---\ntitle: \"未闭合\ntags: [a\n---\n" + rest
	files["i.md"] = "---\n- a\n- b\n---\n" + rest
	files["j.md"] = "---\ntitle: 123\n---\n" + rest
	files["k.md"] = rest
	files["l.md"] = strings.Replace(body, `title: "结算页：折扣码输入框失焦后再校验"`, "title: 2026-10-26", 1)
	files["m.md"] = "---\n---\n" + rest
	for n, md := range files {
		writeFile(t, filepath.Join(dir, n), md)
	}
	want := runOld(t, node, nil, script, dir)
	got := dyna(nil, "retro", "pool", "count", dir)
	if got.stdout != want.stdout || got.code != want.code {
		t.Fatalf("old (%d)\n%s\nnew (%d)\n%s", want.code, want.stdout, got.code, got.stdout)
	}
	// the repository's own pool
	real := repoPath("docs", "records", "retro-candidates")
	if _, err := os.Stat(real); err == nil {
		want := runOld(t, node, nil, script, real)
		got := dyna(nil, "retro", "pool", "count", real)
		if got.stdout != want.stdout || got.code != want.code {
			t.Fatalf("the repository's pool: old (%d)\n%s\nnew (%d)\n%s", want.code, want.stdout, got.code, got.stdout)
		}
	}
}

// ---------- reopened ----------

var occs = map[string]string{
	"a": "- shop-app#12（2026-10-01）：「折扣码填错了要等提交才报错」；决定记录：[[12]]",
	"b": "- shop-app#15（2026-10-05）：「又是提交后才提示」；决定记录：[[15]]",
	"c": "- shop-app#18（2026-10-20）：「还是这样」；决定记录：[[18]]",
}

func rejectedCandidate(status string, lines ...string) string {
	return candidate(func(c *cand) { c.status = sp("- 状态：" + status); c.occurrences = lines })
}

// repo is a throwaway repository with one pool file; commit commits that content with a fixed commit time.
type repo struct {
	t    *testing.T
	dir  string
	file string
}

func newRepo(t *testing.T) *repo {
	t.Helper()
	dir := t.TempDir()
	r := &repo{t: t, dir: dir, file: filepath.Join(dir, "docs", "records", "retro-candidates", "retro-candidate-1.md")}
	r.git(nil, "init", "-q")
	r.git(nil, "config", "user.email", "t@example.com")
	r.git(nil, "config", "user.name", "t")
	r.git(nil, "config", "commit.gpgsign", "false")
	return r
}

func (r *repo) git(env []string, args ...string) {
	r.t.Helper()
	cmd := exec.Command("git", append([]string{"-C", r.dir}, args...)...)
	cmd.Env = append(os.Environ(), env...)
	if out, err := cmd.CombinedOutput(); err != nil {
		r.t.Fatalf("git %v: %v\n%s", args, err, out)
	}
}

func (r *repo) commit(md, when string) {
	r.t.Helper()
	writeFile(r.t, r.file, md)
	r.git(nil, "add", "-A")
	r.git([]string{"GIT_AUTHOR_DATE=" + when, "GIT_COMMITTER_DATE=" + when}, "commit", "-q", "-m", "c")
}

type reopenedResult struct {
	File           string
	RejectedIn     string
	Reopened       bool
	NewOccurrences []string
}

func (r *repo) ask() (outcome, reopenedResult) {
	o := dyna(nil, "retro", "pool", "reopened", r.file)
	var res reopenedResult
	if strings.HasPrefix(strings.TrimSpace(o.stdout), "{") {
		jsonOf(r.t, o.stdout, &res)
	}
	return o, res
}

func TestRejectedOnceNothingNewSinceNotReopened(t *testing.T) {
	r := newRepo(t)
	r.commit(rejectedCandidate("在池里", occs["a"], occs["b"], occs["c"]), "2026-02-01T09:00:00")
	r.commit(rejectedCandidate("驳回（人说这条太窄）", occs["a"], occs["b"], occs["c"]), "2026-03-01T09:00:00")
	o, res := r.ask()
	if o.code != 0 || res.Reopened || len(res.NewOccurrences) != 0 || !strings.Contains(o.stdout, `"newOccurrences": []`) {
		t.Fatal(o.all())
	}
}

func TestRejectedOnceANewSessionCameUpAfterwardsReopenedAndNamesTheSession(t *testing.T) {
	r := newRepo(t)
	r.commit(rejectedCandidate("驳回（人说这条太窄）", occs["a"], occs["b"]), "2026-02-01T09:00:00")
	r.commit(rejectedCandidate("驳回（人说这条太窄）", occs["a"], occs["b"], occs["c"]), "2026-03-01T09:00:00")
	o, res := r.ask()
	if o.code != 0 || !res.Reopened || fmt.Sprint(res.NewOccurrences) != "[shop-app#18]" {
		t.Fatal(o.all())
	}
}

func TestRejectedAgainWithANewReasonAfterThatOccurrenceTheSecondRejectionCounts(t *testing.T) {
	r := newRepo(t)
	r.commit(rejectedCandidate("驳回（太窄）", occs["a"], occs["b"]), "2026-02-01T09:00:00")
	r.commit(rejectedCandidate("驳回（太窄）", occs["a"], occs["b"], occs["c"]), "2026-03-01T09:00:00")
	r.commit(rejectedCandidate("驳回（shop-app#18 再次出现后仍驳回：折扣码规则由后端定）", occs["a"], occs["b"], occs["c"]), "2026-04-01T09:00:00")
	o, res := r.ask()
	if o.code != 0 || res.Reopened || len(res.NewOccurrences) != 0 {
		t.Fatal(o.all())
	}
}

func TestAfterTheSecondRejectionAThirdSessionComesUpReopenedAgainOnlyThatOneIsNew(t *testing.T) {
	r := newRepo(t)
	d := "- shop-app#21（2026-10-24）：「第四次了」；决定记录：[[21]]"
	r.commit(rejectedCandidate("驳回（太窄）", occs["a"], occs["b"]), "2026-02-01T09:00:00")
	r.commit(rejectedCandidate("驳回（再驳回的理由）", occs["a"], occs["b"], occs["c"]), "2026-04-01T09:00:00")
	r.commit(rejectedCandidate("驳回（再驳回的理由）", occs["a"], occs["b"], occs["c"], d), "2026-05-01T09:00:00")
	o, res := r.ask()
	if !res.Reopened || fmt.Sprint(res.NewOccurrences) != "[shop-app#21]" {
		t.Fatal(o.all())
	}
}

func TestSameDayRejectedAtNineANewSessionAddedAtThreeInTheAfternoonReopened(t *testing.T) {
	r := newRepo(t)
	r.commit(rejectedCandidate("驳回（太窄）", occs["a"], occs["b"]), "2026-10-26T09:00:00")
	r.commit(rejectedCandidate("驳回（太窄）", occs["a"], occs["b"], occs["c"]), "2026-10-26T15:00:00")
	o, res := r.ask()
	if !res.Reopened || fmt.Sprint(res.NewOccurrences) != "[shop-app#18]" {
		t.Fatal(o.all())
	}
}

func TestSameSecondCommitOrderAloneDecides(t *testing.T) {
	r := newRepo(t)
	r.commit(rejectedCandidate("驳回（太窄）", occs["a"], occs["b"]), "2026-10-26T09:00:00")
	r.commit(rejectedCandidate("驳回（太窄）", occs["a"], occs["b"], occs["c"]), "2026-10-26T09:00:00")
	o, res := r.ask()
	if !res.Reopened {
		t.Fatal(o.all())
	}
}

func TestANewLineForASessionThatWasAlreadyThereOrOneAlreadyMarkedOverturnedIsNotANewOccurrence(t *testing.T) {
	r := newRepo(t)
	again := "- shop-app#12（2026-10-30）：「同一场会话里又说了一次」；决定记录：[[12]]"
	overturned := occs["c"] + "（已推翻：「当时选错了」）"
	r.commit(rejectedCandidate("驳回（太窄）", occs["a"], occs["b"]), "2026-02-01T09:00:00")
	r.commit(rejectedCandidate("驳回（太窄）", occs["a"], occs["b"], again, overturned), "2026-03-01T09:00:00")
	o, res := r.ask()
	if res.Reopened || len(res.NewOccurrences) != 0 {
		t.Fatal(o.all())
	}
}

func TestRejectedPutBackInThePoolRejectedAgainTheLatestRejectionCounts(t *testing.T) {
	r := newRepo(t)
	r.commit(rejectedCandidate("驳回（太窄）", occs["a"], occs["b"]), "2026-02-01T09:00:00")
	r.commit(rejectedCandidate("在池里", occs["a"], occs["b"], occs["c"]), "2026-03-01T09:00:00")
	r.commit(rejectedCandidate("驳回（第二次的理由）", occs["a"], occs["b"], occs["c"]), "2026-04-01T09:00:00")
	o, res := r.ask()
	if res.Reopened {
		t.Fatal(o.all())
	}
}

func TestAStatusThatIsNotARejectionOrARejectionThatWasNeverCommittedIsReportedNotGuessed(t *testing.T) {
	r := newRepo(t)
	r.commit(rejectedCandidate("在池里", occs["a"]), "2026-02-01T09:00:00")
	if o, _ := r.ask(); o.code != 2 {
		t.Fatal(o.all())
	}

	r2 := newRepo(t)
	r2.commit(rejectedCandidate("在池里", occs["a"]), "2026-02-01T09:00:00")
	writeFile(t, r2.file, rejectedCandidate("驳回（还没提交）", occs["a"]))
	o, _ := r2.ask()
	if o.code != 2 || !strings.Contains(o.all(), "驳回") {
		t.Fatal(o.all())
	}
}

func TestReopenedNoArgumentIsAUsageErrorAFileThatIsNotThereOrNotInGitExitsTwo(t *testing.T) {
	if r := dyna(nil, "retro", "pool", "reopened"); r.code != 1 {
		t.Fatal(r)
	}
	if r := dyna(nil, "retro", "pool", "reopened", filepath.Join(t.TempDir(), "gone.md")); r.code != 2 || !strings.Contains(r.stderr, "retro-pool-reopened:") {
		t.Fatal(r)
	}
	// a rejected candidate outside any git repository: the history cannot be read
	loose := filepath.Join(t.TempDir(), "loose.md")
	writeFile(t, loose, rejectedCandidate("驳回（太窄）", occs["a"]))
	if r := dyna(nil, "retro", "pool", "reopened", loose); r.code != 2 || !strings.Contains(r.stderr, "git") {
		t.Fatal(r)
	}
}

func TestReopenedAnswersLikeTheOldScript(t *testing.T) {
	node, script := oldScript(t, "retro-pool-reopened.mjs")
	r := newRepo(t)
	r.commit(rejectedCandidate("驳回（太窄）", occs["a"], occs["b"]), "2026-02-01T09:00:00")
	r.commit(rejectedCandidate("驳回（太窄）", occs["a"], occs["b"], occs["c"]), "2026-03-01T09:00:00")
	check := func(name string) {
		want := runOld(t, node, nil, script, r.file)
		got := dyna(nil, "retro", "pool", "reopened", r.file)
		if got.stdout != want.stdout || got.code != want.code || got.stderr != want.stderr {
			t.Errorf("%s: old (%d)\n%s%s\nnew (%d)\n%s%s", name, want.code, want.stdout, want.stderr, got.code, got.stdout, got.stderr)
		}
	}
	check("reopened")
	r.commit(rejectedCandidate("驳回（再驳回）", occs["a"], occs["b"], occs["c"]), "2026-04-01T09:00:00")
	check("rejected again")
	writeFile(t, r.file, rejectedCandidate("在池里", occs["a"]))
	check("not rejected now")
	missing := filepath.Join(r.dir, "gone.md")
	want := runOld(t, node, nil, script, missing)
	got := dyna(nil, "retro", "pool", "reopened", missing)
	if got.code != want.code || !strings.HasPrefix(got.stderr, "retro-pool-reopened:") || !strings.HasPrefix(want.stderr, "retro-pool-reopened:") {
		t.Errorf("missing file: old (%d) %s new (%d) %s", want.code, want.stderr, got.code, got.stderr)
	}
}
