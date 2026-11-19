package seo

import (
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strconv"
	"strings"
	"testing"
)

// A key page's new title or description that a merged PR introduced between the two audits is a deliberate change,
// not a regression. The history is a real temporary git repository; dates are pinned with GIT_AUTHOR_DATE and
// GIT_COMMITTER_DATE.

const (
	prevAt = "2026-11-01T10:00:00Z"
	curAt  = "2026-11-08T10:00:00Z"
	urlA   = "https://cookbook.example/pricing"
	urlB   = "https://cookbook.example/about"
)

type repoT struct {
	t   *testing.T
	dir string
}

func (r repoT) git(when string, args ...string) {
	r.t.Helper()
	cmd := exec.Command("git", append([]string{"-C", r.dir, "-c", "commit.gpgsign=false"}, args...)...)
	cmd.Env = append(os.Environ(), "GIT_AUTHOR_DATE="+when, "GIT_COMMITTER_DATE="+when, "GIT_CONFIG_GLOBAL=/dev/null")
	if out, err := cmd.CombinedOutput(); err != nil {
		r.t.Fatalf("git %v: %v\n%s", args, err, out)
	}
}

func (r repoT) write(file, text string) {
	r.t.Helper()
	p := filepath.Join(r.dir, file)
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		r.t.Fatal(err)
	}
	if err := os.WriteFile(p, []byte(text), 0o644); err != nil {
		r.t.Fatal(err)
	}
}

func (r repoT) commitAll(when, msg string) {
	r.git(when, "add", "-A")
	r.git(when, "commit", "-q", "-m", msg)
}

// mergePR lands file on a feature branch (commit at commitAt), then merges it as PR #n at mergeAt.
func (r repoT) mergePR(n int, file, text, commitAt, mergeAt string) {
	branch := "pr-" + strconv.Itoa(n)
	r.git(commitAt, "checkout", "-q", "-b", branch)
	r.write(file, text)
	r.commitAll(commitAt, "edit "+file)
	r.git(mergeAt, "checkout", "-q", "main")
	r.git(mergeAt, "merge", "--no-ff", "-q", "-m", "Merge pull request #"+strconv.Itoa(n)+" from user/"+branch, branch)
}

func makeRepo(t *testing.T) repoT {
	t.Helper()
	r := repoT{t: t, dir: t.TempDir()}
	r.git("2026-10-20T09:00:00Z", "init", "-q", "-b", "main")
	r.git("2026-10-20T09:00:00Z", "config", "user.email", "t@example.com")
	r.git("2026-10-20T09:00:00Z", "config", "user.name", "t")
	r.write("pricing.md", "title: Old pricing\ndescription: Old plans\n")
	r.write("about.md", "title: About us\ndescription: Who we are\n")
	r.commitAll("2026-10-20T09:00:00Z", "base")
	return r
}

func auditPair(prevPages, curPages []any) (any, any) {
	return audit(map[string]any{"auditId": "old", "completedAt": prevAt}, prevPages...), audit(map[string]any{"auditId": "new", "completedAt": curAt}, curPages...)
}

func ap(url string, over map[string]any) any { return auditPage(url, over) }

var provSeo = func() *SeoMd { s, _ := ParseSeoMd("## 重点页面\n- `" + urlA + "`\n- `" + urlB + "`\n"); return s }()

func metaFindingOf(t *testing.T, prev, cur any) any {
	t.Helper()
	out, err := Regressions(provSeo, prev, cur, fixedNow)
	if err != nil {
		t.Fatal(err)
	}
	for _, f := range out {
		if f.Kind == "key-page-meta-changed" {
			// the findings file the compare command printed, read back
			return jsonOf(t, stringify(f))
		}
	}
	t.Fatal("no meta-changed finding")
	return nil
}

func judgeIt(t *testing.T, repo repoT, prev, cur any, findings ...any) *ProvenanceResult {
	t.Helper()
	res, err := Judge(ProvenanceInput{Repo: repo.dir, Branch: "main", Previous: prev, Current: cur, Findings: findings, Since: prevAt, Until: curAt, Now: fixedNow})
	if err != nil {
		t.Fatal(err)
	}
	return res
}

func TestANewTitleThatAPRMergedBetweenTheAuditsIntroducedIsDeliberate(t *testing.T) {
	repo := makeRepo(t)
	repo.mergePR(42, "pricing.md", "title: Pricing that fits any kitchen\ndescription: Old plans\n", "2026-11-03T09:00:00Z", "2026-11-04T09:00:00Z")
	prev, cur := auditPair(
		[]any{ap(urlA, map[string]any{"title": "Old pricing", "metaDescription": "Old plans"}), ap(urlB, map[string]any{"title": "About us", "metaDescription": "Who we are"})},
		[]any{ap(urlA, map[string]any{"title": "Pricing that fits any kitchen", "metaDescription": "Old plans"}), ap(urlB, map[string]any{"title": "About us", "metaDescription": "Who we are"})},
	)
	f := metaFindingOf(t, prev, cur)
	if !reflect.DeepEqual(get(f, "targets"), []any{urlA}) {
		t.Fatal(get(f, "targets"))
	}
	out := judgeIt(t, repo, prev, cur, f)
	if len(out.Findings) != 0 || len(out.Intentional) != 1 || out.Intentional[0].URL != urlA || !reflect.DeepEqual(out.Intentional[0].PRs, []int{42}) || out.Log == nil || *out.Log != "有意改动："+urlA+" → #42" {
		t.Fatalf("%+v", out)
	}
}

func TestATitleFoundNowhereInTheHistoryStaysAFindingUntouched(t *testing.T) {
	repo := makeRepo(t)
	repo.mergePR(42, "pricing.md", "title: Something else entirely\ndescription: Old plans\n", "2026-11-03T09:00:00Z", "2026-11-04T09:00:00Z")
	prev, cur := auditPair([]any{ap(urlA, map[string]any{"title": "Old pricing", "metaDescription": "Old plans"})}, []any{ap(urlA, map[string]any{"title": "A title nobody ever committed", "metaDescription": "Old plans"})})
	f := metaFindingOf(t, prev, cur)
	out := judgeIt(t, repo, prev, cur, f)
	if len(out.Findings) != 1 || out.Findings[0] != f || len(out.Intentional) != 0 || out.Log != nil {
		t.Fatalf("%+v", out)
	}
}

func TestAPRMergedOutsideTheTwoAuditsDoesNotCount(t *testing.T) {
	repo := makeRepo(t)
	repo.mergePR(10, "pricing.md", "title: Early title\ndescription: Old plans\n", "2026-10-25T09:00:00Z", "2026-10-26T09:00:00Z")
	repo.mergePR(11, "about.md", "title: Late title\ndescription: Who we are\n", "2026-11-09T09:00:00Z", "2026-11-10T09:00:00Z")
	prev, cur := auditPair([]any{ap(urlA, map[string]any{"title": "Old pricing"}), ap(urlB, map[string]any{"title": "About us"})}, []any{ap(urlA, map[string]any{"title": "Early title"}), ap(urlB, map[string]any{"title": "Late title"})})
	f := metaFindingOf(t, prev, cur)
	out := judgeIt(t, repo, prev, cur, f)
	if len(out.Findings) != 1 || out.Findings[0] != f || len(out.Intentional) != 0 {
		t.Fatalf("%+v", out)
	}
}

func TestAPRThatMergesInsideTheWindowCountsEvenWhenItsCommitWasAuthoredBeforeTheEarlierAudit(t *testing.T) {
	repo := makeRepo(t)
	repo.mergePR(7, "pricing.md", "title: Long-lived branch title\ndescription: Old plans\n", "2026-10-28T09:00:00Z", "2026-11-05T09:00:00Z")
	prev, cur := auditPair([]any{ap(urlA, map[string]any{"title": "Old pricing"})}, []any{ap(urlA, map[string]any{"title": "Long-lived branch title"})})
	out := judgeIt(t, repo, prev, cur, metaFindingOf(t, prev, cur))
	if len(out.Findings) != 0 || !reflect.DeepEqual(out.Intentional[0].PRs, []int{7}) {
		t.Fatalf("%+v", out)
	}
}

func TestOnlyThePagesWithAProvenanceDropOutAndTheFindingIsRebuiltForTheRest(t *testing.T) {
	repo := makeRepo(t)
	repo.mergePR(42, "pricing.md", "title: Pricing that fits any kitchen\ndescription: Old plans\n", "2026-11-03T09:00:00Z", "2026-11-04T09:00:00Z")
	prev, cur := auditPair([]any{ap(urlA, map[string]any{"title": "Old pricing"}), ap(urlB, map[string]any{"title": "About us"})}, []any{ap(urlA, map[string]any{"title": "Pricing that fits any kitchen"}), ap(urlB, map[string]any{"title": "Mystery new title"})})
	f := metaFindingOf(t, prev, cur)
	if !reflect.DeepEqual(get(f, "targets"), []any{urlA, urlB}) {
		t.Fatal(get(f, "targets"))
	}
	out := judgeIt(t, repo, prev, cur, f)
	if len(out.Findings) != 1 {
		t.Fatalf("%+v", out)
	}
	left := out.Findings[0].(Finding)
	if left.Kind != "key-page-meta-changed" || !reflect.DeepEqual(left.Targets, []string{urlB}) || !strings.HasPrefix(left.Title, "1 个重点页面") ||
		!strings.Contains(left.Evidence.Values, "Mystery new title") || strings.Contains(left.Evidence.Values, urlA) || !reflect.DeepEqual(left.Acceptance, []string{urlB + " 的 title 和 description 是有意写下的版本"}) {
		t.Fatalf("%+v", left)
	}
	if len(out.Intentional) != 1 || out.Intentional[0].URL != urlA {
		t.Fatal(out.Intentional)
	}
}

func TestAPageWhoseTitleAndDescriptionBothChangedIsDeliberateOnlyIfBothStringsHaveAProvenance(t *testing.T) {
	repo := makeRepo(t)
	repo.mergePR(42, "pricing.md", "title: New title here\ndescription: Old plans\n", "2026-11-03T09:00:00Z", "2026-11-04T09:00:00Z")
	prev, cur := auditPair([]any{ap(urlA, map[string]any{"title": "Old pricing", "metaDescription": "Old plans"})}, []any{ap(urlA, map[string]any{"title": "New title here", "metaDescription": "A description nobody committed"})})
	out := judgeIt(t, repo, prev, cur, metaFindingOf(t, prev, cur))
	if len(out.Findings) != 1 || len(out.Intentional) != 0 {
		t.Fatalf("%+v", out)
	}
	repo.mergePR(43, "pricing.md", "title: New title here\ndescription: Brand new plans copy\n", "2026-11-05T09:00:00Z", "2026-11-06T09:00:00Z")
	_, cur2 := auditPair(nil, []any{ap(urlA, map[string]any{"title": "New title here", "metaDescription": "Brand new plans copy"})})
	out2 := judgeIt(t, repo, prev, cur2, metaFindingOf(t, prev, cur2))
	if len(out2.Findings) != 0 || !reflect.DeepEqual(out2.Intentional[0].PRs, []int{42, 43}) || *out2.Log != "有意改动："+urlA+" → #42、#43" {
		t.Fatalf("%+v", out2)
	}
}

func TestASquashMergedCommitOnMainWhoseSubjectEndsInPRNumberNamesThatPR(t *testing.T) {
	repo := makeRepo(t)
	repo.write("pricing.md", "title: Squashed title\ndescription: Old plans\n")
	repo.commitAll("2026-11-04T09:00:00Z", "Rewrite pricing title (#51)")
	prev, cur := auditPair([]any{ap(urlA, map[string]any{"title": "Old pricing"})}, []any{ap(urlA, map[string]any{"title": "Squashed title"})})
	out := judgeIt(t, repo, prev, cur, metaFindingOf(t, prev, cur))
	if len(out.Findings) != 0 || !reflect.DeepEqual(out.Intentional[0].PRs, []int{51}) {
		t.Fatalf("%+v", out)
	}
}

func TestADirectCommitToMainWithNoPRNumberIsNotAProvenance(t *testing.T) {
	repo := makeRepo(t)
	repo.write("pricing.md", "title: Pushed straight\ndescription: Old plans\n")
	repo.commitAll("2026-11-04T09:00:00Z", "tweak pricing title")
	prev, cur := auditPair([]any{ap(urlA, map[string]any{"title": "Old pricing"})}, []any{ap(urlA, map[string]any{"title": "Pushed straight"})})
	f := metaFindingOf(t, prev, cur)
	if out := judgeIt(t, repo, prev, cur, f); len(out.Findings) != 1 || out.Findings[0] != f {
		t.Fatalf("%+v", out)
	}
}

func TestOtherFindingsPassThroughAndATitleLaterRemovedIsFoundByTheCommitThatAddedIt(t *testing.T) {
	repo := makeRepo(t)
	repo.mergePR(42, "pricing.md", "title: Pricing that fits any kitchen\ndescription: Old plans\n", "2026-11-03T09:00:00Z", "2026-11-04T09:00:00Z")
	prev, cur := auditPair([]any{ap(urlA, map[string]any{"title": "Old pricing"})}, []any{ap(urlA, map[string]any{"title": "Pricing that fits any kitchen"})})
	other := jsonOf(t, `{"direction":"technical","kind":"key-page-regression","title":"x","targets":["`+urlB+`"]}`)
	out := judgeIt(t, repo, prev, cur, other, metaFindingOf(t, prev, cur))
	if len(out.Findings) != 1 || out.Findings[0] != other {
		t.Fatalf("%+v", out)
	}
	if got := dump(out); !strings.Contains(got, `"kind": "key-page-regression"`) || !strings.HasSuffix(got, "\"log\": \"有意改动："+urlA+" → #42\"\n}") {
		t.Fatal(got)
	}
}

func TestNotARepoAndABadTimeAreErrors(t *testing.T) {
	prev, cur := auditPair(nil, nil)
	if _, err := Judge(ProvenanceInput{Repo: t.TempDir(), Branch: "main", Previous: prev, Current: cur, Since: prevAt, Until: curAt}); err == nil {
		t.Fatal("a directory that is no repository")
	}
	repo := makeRepo(t)
	if _, err := Judge(ProvenanceInput{Repo: repo.dir, Branch: "main", Previous: prev, Current: cur, Since: "yesterday", Until: curAt}); err == nil || !strings.Contains(err.Error(), "ISO") {
		t.Fatal(err)
	}
}
