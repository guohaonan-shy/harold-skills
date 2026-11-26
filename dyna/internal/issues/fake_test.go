package issues_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"testing"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/app"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/issues"
)

// ---------- a fake gh over an in-memory set of issues and PRs ----------

type event struct {
	Event string `json:"event"`
	Label struct {
		Name string `json:"name"`
	} `json:"label"`
	CreatedAt string `json:"created_at"`
}

type comment struct {
	Body      string `json:"body"`
	CreatedAt string `json:"created_at"`
}

type fIssue struct {
	Number    int
	Title     string
	Body      string
	Open      bool
	Labels    []string
	Reason    string // not_planned | completed
	SubOf     int
	BlockedBy []int
	Pull      bool
	Assignees []string
	CreatedAt string
	UpdatedAt string
	Events    []event
	Comments  []comment
}

type fPR struct {
	Number  int    `json:"number"`
	Title   string `json:"title"`
	Body    string `json:"body"`
	State   string `json:"state"`
	IsDraft bool   `json:"isDraft"`
	URL     string `json:"url"`
}

type fake struct {
	issues map[int]*fIssue
	labels []string
	prs    map[string][]*fPR
	strict bool
	login  string
	repo   string
	calls  [][]string // writes, with `-R <repo>` taken out
	raw    [][]string // everything, as given
	// fails makes a call fail (a dropped connection, say)
	fails func(args []string) bool
}

func newFake(issueList ...*fIssue) *fake {
	f := &fake{issues: map[int]*fIssue{}, prs: map[string][]*fPR{}, login: "me", repo: "o/r"}
	for _, i := range issueList {
		f.issues[i.Number] = i
	}
	return f
}

func open(n int, labels ...string) *fIssue {
	return &fIssue{Number: n, Title: fmt.Sprintf("issue %d", n), Open: true, Labels: labels}
}

func closed(n int) *fIssue {
	return &fIssue{Number: n, Title: fmt.Sprintf("issue %d", n), Labels: nil, Reason: "completed"}
}

func pr(number int, body, state string, draft bool) *fPR {
	return &fPR{Number: number, Body: body, State: state, IsDraft: draft, URL: fmt.Sprintf("https://github.com/pr/%d", number)}
}

func (f *fake) rest(i *fIssue) map[string]any {
	state, reason := "open", any(nil)
	if !i.Open {
		state = "closed"
		reason = i.Reason
		if reason == "" {
			reason = "completed"
		}
	}
	labels := []map[string]string{}
	for _, l := range i.Labels {
		labels = append(labels, map[string]string{"name": l})
	}
	assignees := []map[string]string{}
	for _, a := range i.Assignees {
		assignees = append(assignees, map[string]string{"login": a})
	}
	created := i.CreatedAt
	if created == "" {
		created = "2026-01-01T00:00:00Z"
	}
	updated := i.UpdatedAt
	if updated == "" {
		updated = created
	}
	subs, blockers := 0, 0
	for _, c := range f.issues {
		if c.SubOf == i.Number {
			subs++
		}
	}
	for _, b := range i.BlockedBy {
		if f.issues[b] != nil && f.issues[b].Open {
			blockers++
		}
	}
	m := map[string]any{
		"number": i.Number, "id": 1000 + i.Number, "title": i.Title, "body": i.Body, "state": state, "state_reason": reason,
		"labels": labels, "assignees": assignees, "created_at": created, "updated_at": updated,
		"repository_url":             "https://api.github.com/repos/" + f.repo,
		"sub_issues_summary":         map[string]int{"total": subs},
		"issue_dependencies_summary": map[string]int{"blocked_by": blockers, "total_blocked_by": len(i.BlockedBy)},
	}
	if i.SubOf != 0 {
		m["parent_issue_url"] = fmt.Sprintf("https://api.github.com/repos/%s/issues/%d", f.repo, i.SubOf)
	}
	if i.Pull {
		m["pull_request"] = map[string]any{}
	}
	return m
}

func js(v any) string {
	b, _ := json.Marshal(v)
	return string(b)
}

func ghErr(stderr string) error { return &issues.GHError{Stderr: stderr, Err: fmt.Errorf("exit 1")} }

var apiPath = regexp.MustCompile(`^repos/(\{owner\}|[^/]+)/(\{repo\}|[^/]+)/`)

func page(rows []any, q url.Values) []any {
	per, _ := strconv.Atoi(q.Get("per_page"))
	pg := 1
	if q.Get("page") != "" {
		pg, _ = strconv.Atoi(q.Get("page"))
	}
	lo, hi := (pg-1)*per, pg*per
	if lo > len(rows) {
		lo = len(rows)
	}
	if hi > len(rows) {
		hi = len(rows)
	}
	return rows[lo:hi]
}

func (f *fake) sortedIssues() []*fIssue {
	var out []*fIssue
	for n := 1; n < 100000 && len(out) < len(f.issues); n++ {
		if i, ok := f.issues[n]; ok {
			out = append(out, i)
		}
	}
	return out
}

func (f *fake) gh(given []string) (string, error) {
	f.raw = append(f.raw, append([]string{}, given...))
	var args []string
	for k, a := range given {
		if a == "-R" || (k > 0 && given[k-1] == "-R") {
			continue
		}
		args = append(args, a)
	}
	if f.fails != nil && f.fails(args) {
		return "", ghErr(`Post "https://api.github.com/graphql": EOF`)
	}
	noun, verb := args[0], ""
	if len(args) > 1 {
		verb = args[1]
	}
	third := ""
	if len(args) > 2 {
		third = args[2]
	}
	switch {
	case noun == "label" && verb == "list":
		rows := []map[string]string{}
		for _, l := range f.labels {
			rows = append(rows, map[string]string{"name": l})
		}
		return js(rows), nil
	case noun == "issue" && verb == "view":
		n, _ := strconv.Atoi(third)
		i := f.issues[n]
		labels := []map[string]string{}
		for _, l := range i.Labels {
			labels = append(labels, map[string]string{"name": l})
		}
		state, reason := "OPEN", ""
		if !i.Open {
			state, reason = "CLOSED", strings.ToUpper(i.Reason)
		}
		comments := []map[string]any{}
		for _, c := range i.Comments {
			comments = append(comments, map[string]any{"author": map[string]string{"login": "someone"}, "createdAt": c.CreatedAt, "body": c.Body})
		}
		return js(map[string]any{"number": i.Number, "title": i.Title, "body": i.Body, "state": state, "stateReason": reason, "url": "https://github.com/o/r/issues/" + third, "labels": labels, "assignees": []any{}, "comments": comments}), nil
	case noun == "pr" && verb == "list":
		repo := ""
		for k, a := range args {
			if a == "--repo" {
				repo = args[k+1]
			}
		}
		rows := f.prs[repo]
		if rows == nil {
			rows = []*fPR{}
		}
		return js(rows), nil
	case noun == "api" && verb != "-X":
		return f.apiRead(verb)
	}
	f.calls = append(f.calls, args)
	switch {
	case noun == "api":
		// api -X METHOD path [-F k=v]
		method, path := third, args[3]
		if m := regexp.MustCompile(`issues/(\d+)/sub_issue$`).FindStringSubmatch(path); m != nil && method == "DELETE" {
			id, _ := strconv.Atoi(strings.Split(args[5], "=")[1])
			for _, c := range f.issues {
				if 1000+c.Number == id {
					c.SubOf = 0
				}
			}
		}
		if m := regexp.MustCompile(`issues/(\d+)/dependencies/blocked_by`).FindStringSubmatch(path); m != nil {
			n, _ := strconv.Atoi(m[1])
			if method == "POST" {
				id, _ := strconv.Atoi(strings.Split(args[5], "=")[1])
				f.issues[n].BlockedBy = append(f.issues[n].BlockedBy, id-1000)
			}
		}
		return "{}", nil
	case noun == "label" && verb == "create":
		f.labels = append(f.labels, third)
	case noun == "label" && verb == "delete":
		var keep []string
		for _, l := range f.labels {
			if l != third {
				keep = append(keep, l)
			}
		}
		f.labels = keep
	case noun == "issue" && verb == "edit":
		n, _ := strconv.Atoi(third)
		i := f.issues[n]
		for k := 3; k < len(args); k += 2 {
			if args[k] == "--remove-label" {
				var keep []string
				for _, l := range i.Labels {
					if l != args[k+1] {
						keep = append(keep, l)
					}
				}
				i.Labels = keep
			}
		}
		for k := 3; k < len(args); k += 2 {
			if args[k] != "--add-label" {
				continue
			}
			if f.strict {
				have := false
				for _, l := range f.labels {
					if l == args[k+1] {
						have = true
					}
				}
				if !have {
					return "", ghErr(fmt.Sprintf("'%s' not found", args[k+1]))
				}
			}
			i.Labels = append(i.Labels, args[k+1])
		}
	case noun == "issue" && verb == "close":
		n, _ := strconv.Atoi(third)
		f.issues[n].Open = false
		f.issues[n].Reason = "completed"
		for k, a := range args {
			if a == "--reason" && args[k+1] == "not planned" {
				f.issues[n].Reason = "not_planned"
			}
		}
	case noun == "issue" && verb == "create":
		number := 1
		for n := range f.issues {
			if n >= number {
				number = n + 1
			}
		}
		all := func(flag string) []string {
			var out []string
			for k, a := range args {
				if a == flag {
					out = append(out, args[k+1])
				}
			}
			return out
		}
		f.issues[number] = &fIssue{Number: number, Title: all("--title")[0], Body: all("--body")[0], Open: true, Labels: all("--label")}
		return fmt.Sprintf("https://github.com/o/r/issues/%d\n", number), nil
	case noun == "issue" && verb == "comment":
		return fmt.Sprintf("https://github.com/o/r/issues/%s#issuecomment-%d\n", third, len(f.calls)), nil
	}
	return "", nil
}

func (f *fake) apiRead(raw string) (string, error) {
	u, _ := url.Parse("http://gh/" + raw)
	path := apiPath.ReplaceAllString(strings.TrimPrefix(u.Path, "/"), "")
	q := u.Query()
	switch {
	case path == "issues":
		if q.Get("state") != "open" {
			return "", fmt.Errorf("fake gh: expected state=open, got %s", raw)
		}
		var rows []any
		for _, i := range f.sortedIssues() {
			if i.Open {
				rows = append(rows, f.rest(i))
			}
		}
		out := page(rows, q)
		if out == nil {
			out = []any{}
		}
		return js(out), nil
	case path == "/user" || path == "user" || strings.HasSuffix(raw, "user") && !strings.Contains(raw, "/"):
		return js(map[string]string{"login": f.login}), nil
	}
	if m := regexp.MustCompile(`^issues/(\d+)/events$`).FindStringSubmatch(path); m != nil {
		n, _ := strconv.Atoi(m[1])
		var rows []any
		for _, e := range f.issues[n].Events {
			rows = append(rows, e)
		}
		out := page(rows, q)
		if out == nil {
			out = []any{}
		}
		return js(out), nil
	}
	if m := regexp.MustCompile(`^issues/(\d+)/comments$`).FindStringSubmatch(path); m != nil {
		n, _ := strconv.Atoi(m[1])
		var rows []any
		for _, c := range f.issues[n].Comments {
			rows = append(rows, c)
		}
		out := page(rows, q)
		if out == nil {
			out = []any{}
		}
		return js(out), nil
	}
	if m := regexp.MustCompile(`^issues/(\d+)/sub_issues$`).FindStringSubmatch(path); m != nil {
		n, _ := strconv.Atoi(m[1])
		rows := []any{}
		for _, c := range f.sortedIssues() {
			if c.SubOf == n {
				rows = append(rows, f.rest(c))
			}
		}
		return js(rows), nil
	}
	if m := regexp.MustCompile(`^issues/(\d+)/dependencies/blocked_by$`).FindStringSubmatch(path); m != nil {
		n, _ := strconv.Atoi(m[1])
		rows := []any{}
		for _, b := range f.issues[n].BlockedBy {
			rows = append(rows, f.rest(f.issues[b]))
		}
		return js(rows), nil
	}
	if m := regexp.MustCompile(`^issues/(\d+)$`).FindStringSubmatch(path); m != nil {
		n, _ := strconv.Atoi(m[1])
		if f.issues[n] == nil {
			return "", ghErr(fmt.Sprintf("no issue %d", n))
		}
		return js(f.rest(f.issues[n])), nil
	}
	return "", fmt.Errorf("fake gh: no route for %s", path)
}

// ---------- a fake home with one project ----------

type project struct {
	docs string
	env  map[string]string
}

// docsWith makes a fake home with a project `example-app` registered (remote https://github.com/<repo>, clone
// ~/code/example-app) and its directory with docs/ (holding the given specs) and, when tracker is not nil,
// ISSUE_TRACKER.md.
func docsWith(t *testing.T, specs map[string]string, tracker *string, repo string) project {
	t.Helper()
	if repo == "" {
		repo = "o/r"
	}
	root, _ := filepath.EvalSymlinks(t.TempDir())
	home := filepath.Join(root, "home")
	projectDir := filepath.Join(home, "projects", "example-app")
	docs := filepath.Join(projectDir, "docs")
	must(t, os.MkdirAll(docs, 0o755))
	must(t, os.WriteFile(filepath.Join(home, "AGENTS.md"), []byte("# 设备\n\n## 项目\n\nexample-app（一个例子）: ~/code/example-app. Clone from https://github.com/"+repo+" if missing.\n"), 0o644))
	for slug, md := range specs {
		must(t, os.MkdirAll(filepath.Join(docs, "spec", slug), 0o755))
		must(t, os.WriteFile(filepath.Join(docs, "spec", slug, slug+".md"), []byte(md), 0o644))
	}
	if tracker != nil {
		must(t, os.WriteFile(filepath.Join(projectDir, "ISSUE_TRACKER.md"), []byte(*tracker), 0o644))
	}
	return project{docs: docs, env: map[string]string{"IDEA_LOOP_HOME": home, "HOME": root}}
}

func must(t *testing.T, err error) {
	t.Helper()
	if err != nil {
		t.Fatal(err)
	}
}

func str(s string) *string { return &s }

type result struct {
	out  string
	err  string
	code int
}

func (r result) lines() []string {
	if strings.TrimSpace(r.out) == "" {
		return nil
	}
	return strings.Split(strings.TrimRight(r.out, "\n"), "\n")
}

// cli runs one command line through the whole program, with the fake gh (and `git` when given).
func cli(p project, f *fake, git func([]string) (string, error), argv ...string) result {
	var out, errb bytes.Buffer
	io := app.IO{Stdin: strings.NewReader(""), Stdout: &out, Stderr: &errb, Env: func(k string) string { return p.env[k] }}
	if f != nil {
		io.GH = func(string) issues.GH { return f.gh }
	} else {
		io.GH = func(string) issues.GH {
			return func([]string) (string, error) { return "", fmt.Errorf("gh was called") }
		}
	}
	if git != nil {
		io.Git = func(string) issues.GH { return git }
	} else {
		io.Git = func(string) issues.GH { return func([]string) (string, error) { return "", nil } }
	}
	code := app.Run(argv, io)
	return result{out.String(), errb.String(), code}
}

// run is cli for the issues module.
func run(p project, f *fake, argv ...string) result {
	return cli(p, f, nil, append([]string{"issues"}, argv...)...)
}

func writes(calls [][]string) [][]string {
	var out [][]string
	for _, c := range calls {
		if c[0] == "issue" || c[0] == "label" || c[0] == "api" {
			out = append(out, c)
		}
	}
	return out
}

// commentsOn are the comment bodies written on #n (by `issue comment`, or with `issue close --comment`).
func commentsOn(calls [][]string, n int) []string {
	var out []string
	for _, c := range calls {
		if len(c) > 2 && ((c[1] == "comment" && c[2] == fmt.Sprint(n)) || (c[1] == "close" && c[2] == fmt.Sprint(n))) {
			if c[1] == "close" && !contains(c, "--comment") {
				continue
			}
			out = append(out, c[len(c)-1])
		}
	}
	return out
}

func contains(l []string, s string) bool {
	for _, x := range l {
		if x == s {
			return true
		}
	}
	return false
}

func mustMatch(t *testing.T, re, s string) {
	t.Helper()
	if !regexp.MustCompile(re).MatchString(s) {
		t.Fatalf("want /%s/, got %q", re, s)
	}
}

func fileWith(t *testing.T, text string) string {
	t.Helper()
	f := filepath.Join(t.TempDir(), "body.md")
	must(t, os.WriteFile(f, []byte(text), 0o644))
	return f
}

func baseIO(p project, out, errb *bytes.Buffer) app.IO {
	return app.IO{
		Stdin: strings.NewReader(""), Stdout: out, Stderr: errb, Env: func(k string) string { return p.env[k] },
		GH: func(string) issues.GH {
			return func([]string) (string, error) { return "", fmt.Errorf("gh was called") }
		},
		Git: func(string) issues.GH { return func([]string) (string, error) { return "", nil } },
	}
}

func runIO(p project, mut func(*app.IO), argv ...string) result {
	var out, errb bytes.Buffer
	io := baseIO(p, &out, &errb)
	mut(&io)
	code := app.Run(argv, io)
	return result{out.String(), errb.String(), code}
}

// cliWithGH runs with a gh given as a plain function.
func cliWithGH(p project, gh issues.GH, argv ...string) result {
	return runIO(p, func(io *app.IO) { io.GH = func(string) issues.GH { return gh } }, argv...)
}

// cliWithDirs runs with the fake gh and tells where the version-control program was asked to run.
func cliWithDirs(p project, f *fake, dirOf func(string), argv ...string) result {
	return runIO(p, func(io *app.IO) {
		io.GH = func(string) issues.GH { return f.gh }
		io.Git = func(dir string) issues.GH { dirOf(dir); return func([]string) (string, error) { return "", nil } }
	}, argv...)
}

// cliStdin runs with text on stdin (a hook event).
func cliStdin(p project, stdin string, argv ...string) result {
	return runIO(p, func(io *app.IO) { io.Stdin = strings.NewReader(stdin) }, argv...)
}
