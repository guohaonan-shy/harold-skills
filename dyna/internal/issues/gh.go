package issues

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os/exec"
	"regexp"
	"strings"
)

// GH runs `gh <args>` and returns what it printed. Commands take it as a value so tests can answer
// the reads and record the writes; the real one starts the gh program.
type GH func(args []string) (string, error)

// GHError is a failed gh call. Its message is what gh said on stderr.
type GHError struct {
	Stderr string
	Err    error
}

func (e *GHError) Error() string {
	if s := strings.TrimSpace(e.Stderr); s != "" {
		return s
	}
	if e.Err != nil {
		return e.Err.Error()
	}
	return "gh failed"
}

func (e *GHError) Unwrap() error { return e.Err }

// ExecRunner runs a program in dir with stdin closed and returns its stdout.
func ExecRunner(name, dir string) GH {
	return func(args []string) (string, error) {
		cmd := exec.Command(name, args...)
		cmd.Dir = dir
		var out, errb bytes.Buffer
		cmd.Stdout = &out
		cmd.Stderr = &errb
		if err := cmd.Run(); err != nil {
			return out.String(), &GHError{Stderr: errb.String(), Err: err}
		}
		return out.String(), nil
	}
}

// InRepo aims gh at one repository, wherever it runs: `{owner}/{repo}` in an api path becomes repo, and an
// `issue`, `label` or `pr` command gets `-R <repo>` unless it already names a repository (`-R`, `--repo`).
// `api user` and the like have no repository and pass through.
func InRepo(gh GH, repo string) GH {
	return func(args []string) (string, error) {
		if len(args) == 0 {
			return gh(args)
		}
		noun := args[0]
		if noun == "api" {
			out := make([]string, len(args))
			for i, a := range args {
				out[i] = strings.ReplaceAll(a, "{owner}/{repo}", repo)
			}
			return gh(out)
		}
		named := false
		for _, a := range args {
			if a == "-R" || a == "--repo" || strings.HasPrefix(a, "--repo=") {
				named = true
			}
		}
		if (noun == "issue" || noun == "label" || noun == "pr") && !named && len(args) >= 2 {
			out := append([]string{noun, args[1], "-R", repo}, args[2:]...)
			return gh(out)
		}
		return gh(args)
	}
}

// Issue is one issue as read from the REST API.
type Issue struct {
	Number    int
	ID        int64
	Title     string
	Body      string
	Open      bool
	Reason    string
	Labels    []string
	Assignees []string
	State     string
	Repo      string
	CreatedAt *string
	UpdatedAt *string
	SubTotal  int
	BlockedBy int
	IsPull    bool
}

type restIssue struct {
	Number      int               `json:"number"`
	ID          int64             `json:"id"`
	Title       string            `json:"title"`
	Body        *string           `json:"body"`
	State       string            `json:"state"`
	StateReason *string           `json:"state_reason"`
	Labels      []json.RawMessage `json:"labels"`
	Assignees   []struct {
		Login string `json:"login"`
	} `json:"assignees"`
	RepositoryURL string  `json:"repository_url"`
	CreatedAt     *string `json:"created_at"`
	UpdatedAt     *string `json:"updated_at"`
	SubIssues     *struct {
		Total int `json:"total"`
	} `json:"sub_issues_summary"`
	Dependencies *struct {
		BlockedBy int `json:"blocked_by"`
	} `json:"issue_dependencies_summary"`
	PullRequest json.RawMessage `json:"pull_request"`
}

var repoURLRe = regexp.MustCompile(`repos/([^/]+/[^/]+)$`)

func labelNames(raw []json.RawMessage) []string {
	out := []string{}
	for _, r := range raw {
		var s string
		if json.Unmarshal(r, &s) == nil {
			out = append(out, s)
			continue
		}
		var o struct {
			Name string `json:"name"`
		}
		if json.Unmarshal(r, &o) == nil {
			out = append(out, o.Name)
		}
	}
	return out
}

func rowOf(i restIssue) Issue {
	open := i.State == "open" || i.State == "OPEN"
	labels := labelNames(i.Labels)
	reason := ""
	if i.StateReason != nil {
		reason = *i.StateReason
	}
	it := Issue{
		Number: i.Number, ID: i.ID, Title: i.Title, Open: open, Reason: reason, Labels: labels,
		CreatedAt: i.CreatedAt, UpdatedAt: i.UpdatedAt, Assignees: []string{},
		State:  StateOf(labels, open, reason),
		IsPull: len(i.PullRequest) > 0 && string(i.PullRequest) != "null",
	}
	if i.Body != nil {
		it.Body = *i.Body
	}
	for _, a := range i.Assignees {
		it.Assignees = append(it.Assignees, a.Login)
	}
	if m := repoURLRe.FindStringSubmatch(i.RepositoryURL); m != nil {
		it.Repo = m[1]
	}
	if i.SubIssues != nil {
		it.SubTotal = i.SubIssues.Total
	}
	if i.Dependencies != nil {
		it.BlockedBy = i.Dependencies.BlockedBy
	}
	return it
}

func decode(out string, v any) error {
	if err := json.Unmarshal([]byte(out), v); err != nil {
		return fmt.Errorf("gh 的回答读不懂：%v", err)
	}
	return nil
}

// ReadIssue reads issue n from the repository gh is aimed at.
func ReadIssue(gh GH, n int) (Issue, error) {
	out, err := gh([]string{"api", fmt.Sprintf("repos/{owner}/{repo}/issues/%d", n)})
	if err != nil {
		return Issue{}, err
	}
	var r restIssue
	if err := decode(out, &r); err != nil {
		return Issue{}, err
	}
	return rowOf(r), nil
}

const pageSize = 100

// OpenIssues is every open issue (pull requests left out) from the repo-wide REST list, page by page; of repo
// (owner/name) when given.
func OpenIssues(gh GH, repo string) ([]Issue, error) {
	var out []Issue
	where := "{owner}/{repo}"
	if repo != "" {
		where = repo
	}
	for page := 1; ; page++ {
		raw, err := gh([]string{"api", fmt.Sprintf("repos/%s/issues?state=open&per_page=%d&page=%d", where, pageSize, page)})
		if err != nil {
			return nil, err
		}
		var rows []restIssue
		if err := decode(raw, &rows); err != nil {
			return nil, err
		}
		for _, r := range rows {
			it := rowOf(r)
			if !it.IsPull {
				out = append(out, it)
			}
		}
		if len(rows) < pageSize {
			return out, nil
		}
	}
}

// SubIssues are the sub-issues of issue n.
func SubIssues(gh GH, n int) ([]Issue, error) {
	raw, err := gh([]string{"api", fmt.Sprintf("repos/{owner}/{repo}/issues/%d/sub_issues?per_page=100", n)})
	if err != nil {
		return nil, err
	}
	var rows []restIssue
	if err := decode(raw, &rows); err != nil {
		return nil, err
	}
	out := make([]Issue, 0, len(rows))
	for _, r := range rows {
		out = append(out, rowOf(r))
	}
	return out, nil
}

// labelsOf reads the labels of issue n with `gh issue view`.
func labelsOf(gh GH, n int) ([]string, error) {
	raw, err := gh([]string{"issue", "view", fmt.Sprint(n), "--json", "labels"})
	if err != nil {
		return nil, err
	}
	var v struct {
		Labels []struct {
			Name string `json:"name"`
		} `json:"labels"`
	}
	if err := decode(raw, &v); err != nil {
		return nil, err
	}
	out := []string{}
	for _, l := range v.Labels {
		out = append(out, l.Name)
	}
	return out, nil
}

// editLabels adds, then removes, in two calls. One `gh issue edit` carrying both sends the removals first: when
// the add then fails (a label the repo lacks, a dropped connection) the issue is left with neither label, which
// reads as backlog.
func editLabels(gh GH, n int, add, remove []string) error {
	if len(add) > 0 {
		args := []string{"issue", "edit", fmt.Sprint(n)}
		for _, l := range add {
			args = append(args, "--add-label", l)
		}
		if _, err := gh(args); err != nil {
			return err
		}
	}
	if len(remove) > 0 {
		args := []string{"issue", "edit", fmt.Sprint(n)}
		for _, l := range remove {
			args = append(args, "--remove-label", l)
		}
		if _, err := gh(args); err != nil {
			return err
		}
	}
	return nil
}

func withoutAny(labels []string, drop []string) []string {
	var out []string
	for _, l := range labels {
		if !contains(drop, l) {
			out = append(out, l)
		}
	}
	return out
}
