package seo

import (
	"bytes"
	"fmt"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/jsstr"
)

// gitIn runs git in repo and returns what it printed; a failure is what git said on stderr.
func gitIn(repo string, args ...string) (string, error) {
	cmd := exec.Command("git", append([]string{"-C", repo}, args...)...)
	var out, errb bytes.Buffer
	cmd.Stdout, cmd.Stderr = &out, &errb
	if err := cmd.Run(); err != nil {
		msg := jsstr.Trim(errb.String())
		if msg == "" {
			msg = err.Error()
		}
		return "", fmt.Errorf("%s", msg)
	}
	return out.String(), nil
}

// mainLine is the remote's default branch if the repo knows it, else HEAD.
func mainLine(repo string) string {
	out, err := gitIn(repo, "symbolic-ref", "--short", "refs/remotes/origin/HEAD")
	if err != nil {
		return "HEAD"
	}
	return jsstr.Trim(out)
}

func lines(s string) []string {
	var out []string
	for _, l := range strings.Split(s, "\n") {
		if l != "" {
			out = append(out, l)
		}
	}
	return out
}

// introducedBy is the newest commit on branch that added text on a line of its own diff, or "".
func introducedBy(repo, branch, text string) (string, error) {
	if text == "" {
		return "", nil
	}
	out, err := gitIn(repo, "log", branch, "-S"+text, "--format=%H")
	if err != nil {
		return "", err
	}
	for _, sha := range lines(out) {
		patch, err := gitIn(repo, "show", "--format=", "--unified=0", sha)
		if err != nil {
			return "", err
		}
		for _, l := range strings.Split(patch, "\n") {
			if strings.HasPrefix(l, "+") && !strings.HasPrefix(l, "+++") && strings.Contains(l, text) {
				return sha, nil
			}
		}
	}
	return "", nil
}

var (
	squashPR = regexp.MustCompile(`\(#(\d+)\)` + ws + `*$`)
	mergePR  = regexp.MustCompile(`^Merge pull request #(\d+)`)
)

type prRef struct {
	pr int
	at string
}

// prOf is the PR that put sha on the main line, or nil: a `Merge pull request #N` merge commit, or a `(#N)` suffix on the
// subject of a squash-merged commit on the main line. A direct push with no PR number is not a provenance.
func prOf(repo, branch, sha string, firstParent map[string]bool) (*prRef, error) {
	split := func(line string) (string, string) {
		at, subject, _ := strings.Cut(line, "\t")
		return at, subject
	}
	if firstParent[sha] {
		out, err := gitIn(repo, "log", "-1", "--format=%cI%x09%s", sha)
		if err != nil {
			return nil, err
		}
		at, subject := split(jsstr.Trim(out))
		if m := squashPR.FindStringSubmatch(subject); m != nil {
			n, _ := strconv.Atoi(m[1])
			return &prRef{n, at}, nil
		}
		return nil, nil
	}
	out, err := gitIn(repo, "log", "--merges", "--first-parent", "--ancestry-path", "--reverse", "--format=%cI%x09%s", sha+".."+branch)
	if err != nil {
		return nil, err
	}
	ls := lines(out)
	if len(ls) == 0 {
		return nil, nil
	}
	at, subject := split(ls[0])
	if m := mergePR.FindStringSubmatch(subject); m != nil {
		n, _ := strconv.Atoi(m[1])
		return &prRef{n, at}, nil
	}
	return nil, nil
}

// parseISO is Date.parse for the ISO times list_site_audits gives, in ms; a time with no offset is local time, a date alone is UTC.
func parseISO(s string) (float64, bool) {
	s = jsstr.Trim(s)
	for _, layout := range []string{time.RFC3339Nano, "2006-01-02T15:04:05.999999999", "2006-01-02T15:04:05", "2006-01-02T15:04", "2006-01-02 15:04:05", "2006-01-02 15:04"} {
		if t, err := time.ParseInLocation(layout, s, time.Local); err == nil {
			return float64(t.UnixMilli()), true
		}
	}
	if t, err := time.Parse("2006-01-02", s); err == nil {
		return float64(t.UnixMilli()), true
	}
	return 0, false
}

// Intentional is a page whose new title or description a merged PR brought in.
type Intentional struct {
	URL    string `json:"url"`
	PRs    []int  `json:"prs"`
	Commit string `json:"commit"`
}

// ProvenanceResult is what the provenance command prints.
type ProvenanceResult struct {
	Findings    []any         `json:"findings"`
	Intentional []Intentional `json:"intentional"`
	Log         *string       `json:"log"`
}

// ProvenanceInput is what provenance judges.
type ProvenanceInput struct {
	Repo, Branch string
	Previous     any
	Current      any
	Findings     []any
	Since, Until string
	Now          time.Time
}

// Judge finds out which "title / description changed" findings were somebody's deliberate change. A key page's new
// title or description that a PR merged between the two audits introduced is deliberate, not a regression: every new
// string is searched for in the repo's history (`git log -S`), the commit that added it is mapped to the PR that
// brought it onto the main line, and if that PR was merged after the earlier audit and no later than the current
// one, the page is deliberate. A page with two changed strings is deliberate only when both have such a PR. The
// window is the PR's merge time, not the commit's authored time: a branch commit written before the earlier audit
// still went live when it merged.
func Judge(in ProvenanceInput) (*ProvenanceResult, error) {
	line := in.Branch
	if line == "" {
		line = mainLine(in.Repo)
	}
	if _, err := gitIn(in.Repo, "rev-parse", "--git-dir"); err != nil {
		return nil, err
	}
	fpOut, err := gitIn(in.Repo, "rev-list", "--first-parent", line)
	if err != nil {
		return nil, err
	}
	firstParent := map[string]bool{}
	for _, sha := range lines(fpOut) {
		firstParent[sha] = true
	}
	from, ok1 := parseISO(in.Since)
	to, ok2 := parseISO(in.Until)
	if !ok1 || !ok2 {
		return nil, fmt.Errorf("since / until 要是 ISO 时间（list_site_audits 的 completedAt）")
	}
	prev, err := auditPages(in.Previous)
	if err != nil {
		return nil, err
	}
	cur, err := auditPages(in.Current)
	if err != nil {
		return nil, err
	}

	// deliberate: the PRs and the first commit, when every changed string on this page came in through a PR merged inside the window
	deliberate := func(url string) (*Intentional, error) {
		p, hasP := prev[url]
		c, hasC := cur[url]
		if !hasP || !hasC {
			return nil, nil
		}
		var changed []any
		if !strictEqual(get(p, "title"), get(c, "title")) {
			changed = append(changed, get(c, "title"))
		}
		if !strictEqual(get(p, "metaDescription"), get(c, "metaDescription")) {
			changed = append(changed, get(c, "metaDescription"))
		}
		if len(changed) == 0 {
			return nil, nil
		}
		hit := &Intentional{URL: url, PRs: []int{}}
		for _, str := range changed {
			text := ""
			if truthy(str) {
				text = toString(str)
			}
			sha, err := introducedBy(in.Repo, line, text)
			if err != nil {
				return nil, err
			}
			if sha == "" {
				return nil, nil
			}
			pr, err := prOf(in.Repo, line, sha, firstParent)
			if err != nil {
				return nil, err
			}
			if pr == nil {
				return nil, nil
			}
			at, ok := parseISO(pr.at)
			if !ok || !(at > from && at <= to) {
				return nil, nil
			}
			if hit.Commit == "" {
				hit.Commit = sha
			}
			if !containsInt(hit.PRs, pr.pr) {
				hit.PRs = append(hit.PRs, pr.pr)
			}
		}
		return hit, nil
	}

	res := &ProvenanceResult{Findings: []any{}, Intentional: []Intentional{}}
	for _, f := range in.Findings {
		if get(f, "kind") != "key-page-meta-changed" || get(f, "direction") != "technical" {
			res.Findings = append(res.Findings, f)
			continue
		}
		targets, err := arrayOf(get(f, "targets"), "targets")
		if err != nil {
			return nil, err
		}
		var rows []urlLines
		for _, t := range targets {
			url := pageKey(t)
			hit, err := deliberate(url)
			if err != nil {
				return nil, err
			}
			if hit != nil {
				res.Intentional = append(res.Intentional, *hit)
				continue
			}
			p, hasP := prev[url]
			c, hasC := cur[url]
			rows = append(rows, urlLines{url, changesOf(p, c, hasP, hasC).warning})
		}
		switch {
		case len(rows) == len(targets):
			res.Findings = append(res.Findings, f)
		case len(rows) > 0:
			res.Findings = append(res.Findings, metaChangedFinding(rows, in.Previous, in.Current, in.Now))
		}
	}
	if len(res.Intentional) > 0 {
		parts := make([]string, len(res.Intentional))
		for i, it := range res.Intentional {
			prs := make([]string, len(it.PRs))
			for j, n := range it.PRs {
				prs[j] = "#" + strconv.Itoa(n)
			}
			parts[i] = it.URL + " → " + strings.Join(prs, "、")
		}
		s := "有意改动：" + strings.Join(parts, "；")
		res.Log = &s
	}
	return res, nil
}

func containsInt(xs []int, n int) bool {
	for _, x := range xs {
		if x == n {
			return true
		}
	}
	return false
}
