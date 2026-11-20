package issues

import (
	"encoding/json"
	"fmt"
	"os"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/spec"
)

// ---------- PRs ----------

// refsRe finds `Refs <owner>/<repo>#<n>` and a bare `Refs #<n>` (the digits are checked for length by the caller).
var refsRe = regexp.MustCompile(`(?i)\bRefs\s+(?:([\w.-]+/[\w.-]+))?#(\d+)`)

// RefsIssue: whether a PR body attaches the PR to issue #n of issueRepo: `Refs <owner>/<repo>#n`, or a bare
// `Refs #n` in the issue's own repo.
func RefsIssue(body string, n int, issueRepo, prRepo string) bool {
	for _, m := range refsRe.FindAllStringSubmatchIndex(body, -1) {
		// RE2 has no lookahead: a longer number (`#2420` for n=242) is read whole by \d+ above, so compare it whole.
		repo := ""
		if m[2] >= 0 {
			repo = body[m[2]:m[3]]
		}
		var num int
		fmt.Sscanf(body[m[4]:m[5]], "%d", &num)
		if num != n {
			continue
		}
		if repo != "" {
			if strings.EqualFold(repo, issueRepo) {
				return true
			}
		} else if strings.EqualFold(prRepo, issueRepo) {
			return true
		}
	}
	return false
}

// PRState is draft / ready / merged, or closed for a PR closed without merging.
func PRState(state string, isDraft bool) string {
	switch {
	case state == "MERGED":
		return "merged"
	case state == "CLOSED":
		return "closed"
	case isDraft:
		return "draft"
	}
	return "ready"
}

type prRow struct {
	Number  int     `json:"number"`
	Title   string  `json:"title"`
	Body    string  `json:"body"`
	State   string  `json:"state"`
	IsDraft bool    `json:"isDraft"`
	URL     *string `json:"url"`
}

func listPRs(gh GH, repo, search, fields string) ([]prRow, error) {
	out, err := gh([]string{"pr", "list", "--repo", repo, "--state", "all", "--search", search, "--json", fields, "--limit", "100"})
	if err != nil {
		return nil, err
	}
	var rows []prRow
	if err := decode(out, &rows); err != nil {
		return nil, err
	}
	return rows, nil
}

// PRsOf is the PRs of repo that attach to issue #n of that repo.
func PRsOf(gh GH, n int, repo string) ([]PR, error) {
	rows, err := listPRs(gh, repo, fmt.Sprintf("%d in:body", n), "number,body,state,isDraft,url")
	if err != nil {
		return nil, err
	}
	out := []PR{}
	for _, p := range rows {
		if RefsIssue(p.Body, n, repo, repo) {
			out = append(out, PR{Repo: repo, Number: p.Number, URL: p.URL, State: PRState(p.State, p.IsDraft)})
		}
	}
	return out, nil
}

// RefsLinear: whether a PR belongs to the Linear issue key: its title starts with `[<key>]`, or its body has a
// line `Linear: <key>`.
func RefsLinear(title, body, key string) bool {
	k := regexp.QuoteMeta(key)
	return regexp.MustCompile(`(?i)^\s*\[`+k+`\]`).MatchString(title) || regexp.MustCompile(`(?im)^\s*Linear:\s*`+k+`\s*$`).MatchString(body)
}

// PRsOfLinear is the PRs of repo that belong to the Linear issue key.
func PRsOfLinear(gh GH, key, repo string) ([]PR, error) {
	out := []PR{}
	seen := map[int]bool{}
	for _, where := range []string{"title", "body"} {
		rows, err := listPRs(gh, repo, fmt.Sprintf("%s in:%s", key, where), "number,title,body,state,isDraft,url")
		if err != nil {
			return nil, err
		}
		for _, p := range rows {
			if seen[p.Number] || !RefsLinear(p.Title, p.Body, key) {
				continue
			}
			seen[p.Number] = true
			out = append(out, PR{Repo: repo, Number: p.Number, URL: p.URL, State: PRState(p.State, p.IsDraft)})
		}
	}
	return out, nil
}

// prsFor are the PRs of issue ref (a number, or a Linear key): by `Refs` for a GitHub number, by title / `Linear:`
// line for a key, in the one repository of the project. issueRepo is the repo the issue was read from.
func prsFor(gh GH, ref spec.IssueRef, issueRepo, repo string) ([]PR, error) {
	where := issueRepo
	if where == "" {
		where = repo
	}
	if where == "" {
		return nil, fmt.Errorf("没给项目的仓库，没法核 %s 的 PR", ref.Label())
	}
	if ref.IsKey() {
		return PRsOfLinear(gh, ref.Key, where)
	}
	return PRsOf(gh, ref.Num, where)
}

// ---------- plans ----------

// Row is an open issue as the plans see it.
type Row struct {
	Number   int
	Labels   []string
	SubTotal int
	Body     string
}

// Action is one flip that needs no one's judgement.
type Action struct {
	N        int
	From, To string
	Why      string
}

func prList(prs []PR) string {
	var parts []string
	for _, p := range prs {
		parts = append(parts, fmt.Sprintf("%s#%d", p.Repo, p.Number))
	}
	return strings.Join(parts, "、")
}

// ReconcilePlan is the flips that need no one's judgement. An issue in in-progress or in-review whose PRs (closed
// ones aside) are all merged goes to done; one in in-progress whose PRs are all ready or merged goes to in-review.
// An issue with a label outside the states, or two status:* labels, is a problem.
func ReconcilePlan(issues []Row, prs map[int][]PR) (actions []Action, problems []string) {
	for _, it := range issues {
		cur := StateOf(it.Labels, true, "")
		if !contains(States, cur) {
			n := 0
			for _, l := range it.Labels {
				if strings.HasPrefix(l, Prefix) {
					n++
				}
			}
			if n > 1 {
				problems = append(problems, fmt.Sprintf("#%d 有两个 status:* label（%s）：留一个，其余去掉", it.Number, cur))
			} else {
				problems = append(problems, fmt.Sprintf("#%d 的 label「%s」不是 issue 的状态（旧状态机留下的先跑 dyna issues migrate）", it.Number, cur))
			}
			continue
		}
		if cur != "in-progress" && cur != "in-review" {
			continue
		}
		var live []PR
		for _, p := range prs[it.Number] {
			if p.State != "closed" {
				live = append(live, p)
			}
		}
		if len(live) == 0 {
			continue
		}
		allMerged, noDraft := true, true
		for _, p := range live {
			if p.State != "merged" {
				allMerged = false
			}
			if p.State == "draft" {
				noDraft = false
			}
		}
		if allMerged {
			actions = append(actions, Action{N: it.Number, From: cur, To: "done", Why: "PR " + prList(live) + " 都已合并"})
		} else if cur == "in-progress" && noDraft {
			actions = append(actions, Action{N: it.Number, From: cur, To: "in-review", Why: "PR " + prList(live) + " 都已 ready"})
		}
	}
	return actions, problems
}

// OldStates are the old Chinese status labels and what each becomes. 实现中 is in-review when it has a ready PR.
var OldStates = map[string]string{"验证中": "triage", "审核中": "triage", "待设计": "triage", "设计中": "triage", "待实现": "todo", "实现中": "in-progress", "搁置": "backlog"}

// Relabel is one old label becoming a new one.
type Relabel struct {
	N        int
	From, To string
	Remove   []string
	Add      []string
	Comment  string
}

// Unlink is a sub-issue link to remove.
type Unlink struct {
	Parent, Child int
	ChildID       int64
}

// ChildGroup is the sub-issues of one parent.
type ChildGroup struct {
	Parent int
	Kids   []Issue
}

// MigratePlan is how the old labels would change.
func MigratePlan(issues []Row, prs map[int][]PR, children []ChildGroup) (relabels []Relabel, unlinks []Unlink, problems []string) {
	for _, it := range issues {
		var own []string
		for _, l := range it.Labels {
			if strings.HasPrefix(l, Prefix) {
				own = append(own, strings.TrimPrefix(l, Prefix))
			}
		}
		var old, unknown []string
		for _, s := range own {
			if _, ok := OldStates[s]; ok {
				old = append(old, s)
			} else if !contains(Labeled, s) {
				unknown = append(unknown, s)
			}
		}
		if len(unknown) > 0 {
			problems = append(problems, fmt.Sprintf("#%d 的 label「%s」既不是旧状态也不是新状态，不动", it.Number, strings.Join(unknown, "、")))
		}
		if len(old) == 0 {
			continue
		}
		if len(own) > 1 {
			problems = append(problems, fmt.Sprintf("#%d 有多个 status:* label（%s），先留一个再迁移", it.Number, strings.Join(own, "、")))
			continue
		}
		from := old[0]
		to := OldStates[from]
		if from == "实现中" {
			var live []PR
			for _, p := range prs[it.Number] {
				if p.State != "closed" {
					live = append(live, p)
				}
			}
			anyReady, noDraft := false, true
			for _, p := range live {
				if p.State == "ready" {
					anyReady = true
				}
				if p.State == "draft" {
					noDraft = false
				}
			}
			if len(live) > 0 && anyReady && noDraft {
				to = "in-review"
			}
		}
		r := Relabel{N: it.Number, From: from, To: to, Remove: []string{Label(from)}, Add: []string{}}
		if to != "backlog" {
			r.Add = []string{Label(to)}
		}
		if from == "搁置" {
			r.Comment = "从搁置迁回 backlog（issue 状态模型换了：先放着 = backlog，停在哪看这条之前的评论）。"
		}
		relabels = append(relabels, r)
	}
	for _, g := range children {
		for _, k := range g.Kids {
			unlinks = append(unlinks, Unlink{Parent: g.Parent, Child: k.Number, ChildID: k.ID})
		}
	}
	return relabels, unlinks, problems
}

var statusBlock = regexp.MustCompile(`(?s)^(---\n)(.*?)(\n---)(.*)$`)
var statusLine = regexp.MustCompile(`(?m)^status:`)

// WithoutStatus drops the `status:` line left in a spec's frontmatter.
func WithoutStatus(md string) string {
	m := statusBlock.FindStringSubmatch(md)
	if m == nil || !statusLine.MatchString(m[2]) {
		return md
	}
	var kept []string
	for _, l := range strings.Split(m[2], "\n") {
		if !strings.HasPrefix(l, "status:") {
			kept = append(kept, l)
		}
	}
	return m[1] + strings.Join(kept, "\n") + m[3] + m[4]
}

// ---------- the writes ----------

func relabel(gh GH, n int, labels []string, state string) error {
	var want []string
	if contains(Labeled, state) {
		want = []string{Label(state)}
	}
	var add, remove []string
	for _, l := range want {
		if !contains(labels, l) {
			add = append(add, l)
		}
	}
	for _, l := range labels {
		if strings.HasPrefix(l, Prefix) && !contains(want, l) {
			remove = append(remove, l)
		}
	}
	return editLabels(gh, n, add, remove)
}

// move moves #n to state. done / canceled close first (the comment goes with the close) and drop the label only
// once the close went through: a gh call that fails then leaves the issue as it was, not open with no label,
// which reads as backlog. The open states relabel, then comment.
func move(gh GH, it Issue, state, comment string) error {
	body := ""
	if comment != "" {
		body = withMarker(comment)
	}
	if reason, ok := Closed[state]; ok {
		args := []string{"issue", "close", fmt.Sprint(it.Number), "--reason", reason}
		if body != "" {
			args = append(args, "--comment", body)
		}
		if _, err := gh(args); err != nil {
			return err
		}
		return relabel(gh, it.Number, it.Labels, state)
	}
	if err := relabel(gh, it.Number, it.Labels, state); err != nil {
		return err
	}
	if body != "" {
		if _, err := gh([]string{"issue", "comment", fmt.Sprint(it.Number), "--body", body}); err != nil {
			return err
		}
	}
	return nil
}

// SpecFor is the spec under docs whose `issues:` lists ref.
func SpecFor(docs string, ref spec.IssueRef) (slug, md string, ok bool) {
	return spec.Covering(docs, ref)
}

// Ensured is what EnsureLabels did.
type Ensured struct {
	Made    []string
	Surplus []Surplus
	Deleted []string
}

// Surplus is a label outside the kept set, with how many open issues carry it.
type Surplus struct {
	Name       string `json:"name"`
	OpenIssues int    `json:"openIssues"`
}

// EnsureLabels creates the missing status:*, priority:*, kind:* and type:* labels, and returns the labels outside
// the kept set with how many open issues carry each; with prune they are deleted. Without categories nothing is
// pruned: the keep-list lives in the same section, so every project label would look surplus.
func EnsureLabels(gh GH, types *Types, prune bool) (Ensured, error) {
	var res Ensured
	raw, err := gh([]string{"label", "list", "--limit", "500", "--json", "name"})
	if err != nil {
		return res, err
	}
	var listed []struct {
		Name string `json:"name"`
	}
	if err := decode(raw, &listed); err != nil {
		return res, err
	}
	have := map[string]bool{}
	for _, l := range listed {
		have[l.Name] = true
	}
	var want []LabelSpec
	for _, s := range Labeled {
		want = append(want, LabelSpec{Label(s), colors[s], "idea-loop：" + about[s]})
	}
	for _, p := range Priorities {
		want = append(want, LabelSpec{PriorityPrefix + p, priorityColors[p], "idea-loop：优先级 " + p})
	}
	for _, k := range Kinds {
		want = append(want, LabelSpec{KindPrefix + k, kindColors[k], "idea-loop：类型 " + k})
	}
	want = append(want, TypeLabels(types)...)
	for _, l := range want {
		if have[l.Name] {
			continue
		}
		desc := l.About
		if desc == "" {
			desc = "idea-loop：分类"
		}
		if _, err := gh([]string{"label", "create", l.Name, "--color", l.Color, "--description", desc}); err != nil {
			return res, err
		}
		res.Made = append(res.Made, l.Name)
	}
	if types == nil {
		if prune {
			return res, fmt.Errorf("没有「%s」一节，不知道该留哪些 label，不清理", TypesHeading)
		}
		return res, nil
	}
	kept := KeptLabels(types)
	uses := map[string]int{}
	open, err := OpenIssues(gh, "")
	if err != nil {
		return res, err
	}
	for _, i := range open {
		for _, l := range i.Labels {
			uses[l]++
		}
	}
	var names []string
	for l := range have {
		if !kept[l] {
			names = append(names, l)
		}
	}
	sort.Strings(names)
	for _, name := range names {
		res.Surplus = append(res.Surplus, Surplus{Name: name, OpenIssues: uses[name]})
	}
	if prune {
		for _, s := range res.Surplus {
			if _, err := gh([]string{"label", "delete", s.Name, "--yes"}); err != nil {
				return res, err
			}
			res.Deleted = append(res.Deleted, s.Name)
		}
	}
	return res, nil
}

// SetTypes leaves #n carrying exactly the type:* labels of values.
func SetTypes(gh GH, types *Types, n int, values []string) ([]string, error) {
	want, err := TypeSet(types, values)
	if err != nil {
		return nil, err
	}
	have, err := labelsOf(gh, n)
	if err != nil {
		return nil, err
	}
	var add, remove []string
	for _, l := range want {
		if !contains(have, l) {
			add = append(add, l)
		}
	}
	for _, l := range have {
		if strings.HasPrefix(l, TypePrefix) && !contains(want, l) {
			remove = append(remove, l)
		}
	}
	return want, editLabels(gh, n, add, remove)
}

// inStateSince is when #n last got the `status:<state>` label (an ISO time), from the issue's events; "" when
// the events never show it.
func inStateSince(gh GH, n int, state string) (string, error) {
	since := ""
	for page := 1; ; page++ {
		raw, err := gh([]string{"api", fmt.Sprintf("repos/{owner}/{repo}/issues/%d/events?per_page=%d&page=%d", n, pageSize, page)})
		if err != nil {
			return "", err
		}
		var rows []struct {
			Event string `json:"event"`
			Label *struct {
				Name string `json:"name"`
			} `json:"label"`
			CreatedAt string `json:"created_at"`
		}
		if err := decode(raw, &rows); err != nil {
			return "", err
		}
		for _, e := range rows {
			if e.Event == "labeled" && e.Label != nil && e.Label.Name == Label(state) && (since == "" || e.CreatedAt > since) {
				since = e.CreatedAt
			}
		}
		if len(rows) < pageSize {
			return since, nil
		}
	}
}

// DispatchStates are the states a dispatch round hands out.
var DispatchStates = []string{"todo", "triage"}

// Candidate is an issue a dispatch round may hand out.
type Candidate struct {
	Number   int     `json:"number"`
	Title    string  `json:"title"`
	Priority *string `json:"priority"`
	Assignee *string `json:"assignee"`
}

// Candidates are the issues of one state (`todo` by default, or `triage`) a dispatch round may hand out, in the
// order to take them: none an open issue still blocks. Whose it is decides first. Those assigned to me (the login
// gh runs as) come alone, P0 → P1 → P2 → none, the lower number first within a priority; someone else's are never
// handed out. Only when none of mine can go do the unassigned ones, by priority first as well and, within a
// priority, the longest in the state first (since its `status:<state>` was last added; the creation time when the
// events never show it), the lower number on a tie. The login is read only when an issue has an assignee, and
// the events only for the unassigned ones that share a priority with another unassigned one.
func Candidates(gh GH, limit int, state string) ([]Candidate, error) {
	if !contains(DispatchStates, state) {
		return nil, fmt.Errorf("--state 只能是 %s，不是「%s」", strings.Join(DispatchStates, " / "), state)
	}
	all, err := OpenIssues(gh, "")
	if err != nil {
		return nil, err
	}
	var free []Issue
	for _, i := range all {
		if i.State == state && !(i.BlockedBy > 0) {
			free = append(free, i)
		}
	}
	me := ""
	anyAssigned := false
	for _, i := range free {
		if len(i.Assignees) > 0 {
			anyAssigned = true
		}
	}
	if anyAssigned {
		raw, err := gh([]string{"api", "user"})
		if err != nil {
			return nil, err
		}
		var u struct {
			Login string `json:"login"`
		}
		if err := decode(raw, &u); err != nil {
			return nil, err
		}
		me = u.Login
	}
	var mine []Issue
	for _, i := range free {
		if me != "" && contains(i.Assignees, me) {
			mine = append(mine, i)
		}
	}
	sort.SliceStable(mine, func(a, b int) bool {
		ra, rb := priorityRank(mine[a].Labels), priorityRank(mine[b].Labels)
		if ra != rb {
			return ra < rb
		}
		return mine[a].Number < mine[b].Number
	})
	pick := mine
	if len(mine) == 0 {
		var unassigned []Issue
		for _, i := range free {
			if len(i.Assignees) == 0 {
				unassigned = append(unassigned, i)
			}
		}
		since := map[int]string{}
		for _, i := range unassigned {
			shares := false
			for _, o := range unassigned {
				if o.Number != i.Number && priorityRank(o.Labels) == priorityRank(i.Labels) {
					shares = true
				}
			}
			if !shares {
				continue
			}
			s, err := inStateSince(gh, i.Number, state)
			if err != nil {
				return nil, err
			}
			if s == "" && i.CreatedAt != nil {
				s = *i.CreatedAt
			}
			since[i.Number] = s
		}
		sort.SliceStable(unassigned, func(a, b int) bool {
			x, y := unassigned[a], unassigned[b]
			if rx, ry := priorityRank(x.Labels), priorityRank(y.Labels); rx != ry {
				return rx < ry
			}
			if sx, sy := since[x.Number], since[y.Number]; sx != sy {
				return sx < sy
			}
			return x.Number < y.Number
		})
		pick = unassigned
	}
	if limit >= 0 && len(pick) > limit {
		pick = pick[:limit]
	}
	out := make([]Candidate, 0, len(pick))
	for _, i := range pick {
		c := Candidate{Number: i.Number, Title: i.Title}
		if p := PriorityOf(i.Labels); p != "" {
			c.Priority = &p
		}
		if len(mine) > 0 {
			me := "me"
			c.Assignee = &me
		}
		out = append(out, c)
	}
	return out, nil
}

const minute = time.Minute

func lastComment(gh GH, n int) (body, createdAt string, found bool, err error) {
	for page := 1; ; page++ {
		raw, err := gh([]string{"api", fmt.Sprintf("repos/{owner}/{repo}/issues/%d/comments?per_page=%d&page=%d", n, pageSize, page)})
		if err != nil {
			return "", "", false, err
		}
		var rows []struct {
			Body      string `json:"body"`
			CreatedAt string `json:"created_at"`
		}
		if err := decode(raw, &rows); err != nil {
			return "", "", false, err
		}
		if len(rows) > 0 {
			last := rows[len(rows)-1]
			body, createdAt, found = last.Body, last.CreatedAt, true
		}
		if len(rows) < pageSize {
			return body, createdAt, found, nil
		}
	}
}

// BacklogRow is an issue the weekly triage should look at.
type BacklogRow struct {
	Number    int      `json:"number"`
	Title     string   `json:"title"`
	Labels    []string `json:"labels"`
	CreatedAt *string  `json:"createdAt"`
}

// Backlog are the open issues with no status:* label, oldest first, at most limit. One whose newest comment is
// triage's 「还要你补」 and that has not been updated since (up to a minute after the comment, which the comment
// itself causes) is left out and does not use up the limit: nobody has answered, asking again is noise. Comments
// are read only for the issues that would otherwise be listed.
func Backlog(gh GH, limit int) ([]BacklogRow, error) {
	all, err := OpenIssues(gh, "")
	if err != nil {
		return nil, err
	}
	var waiting []Issue
	for _, i := range all {
		if i.State == "backlog" {
			waiting = append(waiting, i)
		}
	}
	sort.SliceStable(waiting, func(a, b int) bool { return waiting[a].Number < waiting[b].Number })
	out := []BacklogRow{}
	for _, it := range waiting {
		if len(out) >= limit {
			break
		}
		body, created, found, err := lastComment(gh, it.Number)
		if err != nil {
			return nil, err
		}
		if found && IsIdeaLoopComment(body) && strings.Contains(body, "还要你补") {
			upd, e1 := time.Parse(time.RFC3339, deref(it.UpdatedAt))
			cr, e2 := time.Parse(time.RFC3339, created)
			if e1 == nil && e2 == nil && upd.Sub(cr) <= minute {
				continue
			}
		}
		out = append(out, BacklogRow{Number: it.Number, Title: it.Title, Labels: it.Labels, CreatedAt: it.CreatedAt})
	}
	return out, nil
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

var repoArg = regexp.MustCompile(`^[\w.-]+/[\w.-]+$`)
var createdRe = regexp.MustCompile(`/issues/(\d+)$`)

// NewIssueOpts is what `new` takes.
type NewIssueOpts struct {
	Title, Body string
	State       string
	Priority    string
	Kind        string
	Types       []string
	Repo        string
}

// NewIssue opens an issue after checking it: the body has its five sections, the categories exist, `todo` comes
// with a priority, and no open issue has the same title. Labels: `status:todo` for todo (backlog has none),
// `priority:*`, `kind:*`, `type:*`. Returns the new number. Nothing is created unless every check passed.
func NewIssue(gh GH, types *Types, o NewIssueOpts) (int, error) {
	if strings.TrimSpace(o.Title) == "" {
		return 0, fmt.Errorf("没给标题")
	}
	state := o.State
	if state == "" {
		state = "backlog"
	}
	if state != "backlog" && state != "todo" {
		return 0, fmt.Errorf("--state 只能是 backlog 或 todo（给的是「%s」）", state)
	}
	if o.Priority != "" && !contains(Priorities, o.Priority) {
		return 0, fmt.Errorf("--priority 只能是 %s（给的是「%s」）", strings.Join(Priorities, " / "), o.Priority)
	}
	if o.Kind != "" && !contains(Kinds, o.Kind) {
		return 0, fmt.Errorf("--kind 只能是 %s（给的是「%s」）", strings.Join(Kinds, " / "), o.Kind)
	}
	if state == "todo" && o.Priority == "" {
		return 0, fmt.Errorf("开成 todo 要带 --priority（P0 / P1 / P2）")
	}
	if errs := BodyErrors(o.Body); len(errs) > 0 {
		return 0, fmt.Errorf("正文不合格，没开：%s", strings.Join(errs, "；"))
	}
	typeLabelsOf, err := TypeSet(types, o.Types)
	if err != nil {
		return 0, err
	}
	if o.Repo != "" && !repoArg.MatchString(o.Repo) {
		return 0, fmt.Errorf("--repo 要写成 owner/name（给的是「%s」）", o.Repo)
	}
	open, err := OpenIssues(gh, o.Repo)
	if err != nil {
		return 0, err
	}
	for _, i := range open {
		if strings.TrimSpace(i.Title) == strings.TrimSpace(o.Title) {
			return 0, fmt.Errorf("已经有同标题的 open issue #%d，没开", i.Number)
		}
	}
	var labels []string
	if state == "todo" {
		labels = append(labels, Label("todo"))
	}
	if o.Priority != "" {
		labels = append(labels, PriorityPrefix+o.Priority)
	}
	if o.Kind != "" {
		labels = append(labels, KindPrefix+o.Kind)
	}
	labels = append(labels, typeLabelsOf...)
	args := []string{"issue", "create"}
	if o.Repo != "" {
		args = append(args, "-R", o.Repo)
	}
	args = append(args, "--title", strings.TrimSpace(o.Title), "--body", o.Body)
	for _, l := range labels {
		args = append(args, "--label", l)
	}
	out, err := gh(args)
	if err != nil {
		return 0, err
	}
	out = strings.TrimSpace(out)
	m := createdRe.FindStringSubmatch(out)
	if m == nil {
		return 0, fmt.Errorf("gh issue create 没返回 issue 地址：%s", out)
	}
	var n int
	fmt.Sscanf(m[1], "%d", &n)
	return n, nil
}

// SetPriority leaves #n carrying `priority:<p>` (none: no priority label); returns the labels it ends with.
func SetPriority(gh GH, n int, p string) ([]string, error) {
	if p != "none" && !contains(Priorities, p) {
		return nil, fmt.Errorf("优先级只能是 %s / none（给的是「%s」）", strings.Join(Priorities, " / "), p)
	}
	have, err := labelsOf(gh, n)
	if err != nil {
		return nil, err
	}
	var want []string
	if p != "none" {
		want = []string{PriorityPrefix + p}
	}
	var add, remove []string
	for _, l := range want {
		if !contains(have, l) {
			add = append(add, l)
		}
	}
	for _, l := range have {
		if strings.HasPrefix(l, PriorityPrefix) && !contains(want, l) {
			remove = append(remove, l)
		}
	}
	return want, editLabels(gh, n, add, remove)
}

var urlRe = regexp.MustCompile(`https?://\S+`)

// NoteIssue comments on #n with the AI marker (the old prefix dropped, the marker not doubled). Returns the
// comment's URL (what `gh issue comment` prints), or "".
func NoteIssue(gh GH, n int, text string) (string, error) {
	t := strings.TrimSpace(text)
	if t == "" {
		return "", fmt.Errorf("评论是空的")
	}
	out, err := gh([]string{"issue", "comment", fmt.Sprint(n), "--body", withMarker(t)})
	if err != nil {
		return "", err
	}
	return urlRe.FindString(out), nil
}

// branchesOf are the branches of #n: `issue/<n>-<slug>`, local or remote, in the project's local clone.
func branchesOf(git GH, key string) []string {
	out, err := git([]string{"branch", "-a", "--format=%(refname:short)"})
	if err != nil {
		return nil
	}
	var res []string
	seen := map[string]bool{}
	for _, s := range strings.Split(out, "\n") {
		b := strings.TrimPrefix(strings.TrimSpace(s), "origin/")
		if b != "" && strings.HasPrefix(b, "issue/"+key+"-") && !seen[b] {
			seen[b] = true
			res = append(res, b)
		}
	}
	return res
}

// ShowPR is a PR of an issue as `show` prints it.
type ShowPR struct {
	Repo   string  `json:"repo"`
	Number int     `json:"number"`
	URL    *string `json:"url"`
	State  string  `json:"state"`
}

// Shown is what `show` prints.
type Shown struct {
	Number     any      `json:"number"`
	Title      *string  `json:"title"`
	State      *string  `json:"state"`
	Open       *bool    `json:"open"`
	Categories []string `json:"categories"`
	Kind       *string  `json:"kind"`
	PRs        []ShowPR `json:"prs"`
	Spec       *string  `json:"spec"`
	Branch     *string  `json:"branch"`
}

func showPRs(prs []PR) []ShowPR {
	out := make([]ShowPR, 0, len(prs))
	for _, p := range prs {
		out = append(out, ShowPR{p.Repo, p.Number, p.URL, p.State})
	}
	return out
}

// Show is #n with what a session needs to know where it is: state, categories, PRs, the spec that covers it, its
// branch. In a Linear project the issue is not read (state null, no title or categories): ref is its key. git runs
// in the project's clone (no branch without it); repo is the project's repository, which a Linear key needs.
func Show(gh GH, docs string, ref spec.IssueRef, git GH, repo string) (Shown, error) {
	slug, _, hasSpec := SpecFor(docs, ref)
	var specSlug *string
	if hasSpec {
		specSlug = &slug
	}
	var branch *string
	if git != nil {
		if b := branchesOf(git, ref.String()); len(b) > 0 {
			branch = &b[0]
		}
	}
	if PlatformOf(ReadTracker(docs)) == "linear" || ref.IsKey() {
		prs, err := prsFor(gh, ref, "", repo)
		if err != nil {
			return Shown{}, err
		}
		return Shown{Number: numberOf(ref), Categories: []string{}, PRs: showPRs(prs), Spec: specSlug, Branch: branch}, nil
	}
	it, err := ReadIssue(gh, ref.Num)
	if err != nil {
		return Shown{}, err
	}
	var prs []PR
	if it.Repo != "" {
		if prs, err = PRsOf(gh, ref.Num, it.Repo); err != nil {
			return Shown{}, err
		}
	}
	cats := []string{}
	var kind *string
	for _, l := range it.Labels {
		if strings.HasPrefix(l, TypePrefix) {
			cats = append(cats, l)
		}
		if kind == nil && strings.HasPrefix(l, KindPrefix) {
			k := strings.TrimPrefix(l, KindPrefix)
			kind = &k
		}
	}
	title, state, open := it.Title, it.State, it.Open
	return Shown{Number: it.Number, Title: &title, State: &state, Open: &open, Categories: cats, Kind: kind, PRs: showPRs(prs), Spec: specSlug, Branch: branch}, nil
}

func numberOf(ref spec.IssueRef) any {
	if ref.IsKey() {
		return ref.Key
	}
	return ref.Num
}

// FlipOpts are the options of a flip.
type FlipOpts struct {
	Comment    string
	SkipDesign bool
	From       *string // the state the caller says the issue is in; the issue is then not read
	Repo       string  // the project's repository
}

type flip struct {
	it  *Issue
	cur string
	prs []PR
}

// checkFlip is everything that can refuse the flip of #n to state, nothing written. With From the issue is not
// read: From is the state the caller says it is in, and ref may be a Linear key; the PRs are then looked for in
// the project's repository.
func checkFlip(gh GH, docs, state string, ref spec.IssueRef, o FlipOpts) (flip, error) {
	var f flip
	f.cur = ""
	if o.From == nil {
		it, err := ReadIssue(gh, ref.Num)
		if err != nil {
			return f, err
		}
		f.it = &it
		f.cur = it.State
		if !it.Open {
			return f, fmt.Errorf("#%d 已关闭（%s），done / canceled 之后不再翻；重开是人的事", ref.Num, f.cur)
		}
	} else {
		f.cur = *o.From
	}
	tracker := ReadTracker(docs)
	issueRepo := ""
	if f.it != nil {
		issueRepo = f.it.Repo
	}
	if state == "done" && (o.From != nil || issueRepo != "") {
		prs, err := prsFor(gh, ref, issueRepo, o.Repo)
		if err != nil {
			return f, err
		}
		f.prs = prs
	}
	t := Transition{PRs: f.prs, Comment: o.Comment, SkipDesign: o.SkipDesign, SkipTriage: SkipsTriage(tracker)}
	if _, md, ok := SpecFor(docs, ref); ok {
		t.Spec = &md
	}
	if why := TransitionError(f.cur, state, t); why != "" {
		return f, fmt.Errorf("%s：%s", ref.Label(), why)
	}
	return f, nil
}

// CheckState is whether #n may flip to state: the reason when it may not, nothing written either way.
func CheckState(gh GH, docs, state string, ref spec.IssueRef, o FlipOpts) (line string, err error) {
	f, err := checkFlip(gh, docs, state, ref, o)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%s: %s → %s 可以翻", ref.Label(), f.cur, state), nil
}

// SetState makes checked flips: every one is checked before any is made, so one refusal leaves them all where
// they were. A flip to done opens its comment with the PRs that were merged (「合并的 PR：o/r#10、o/api#20。」); a
// comment the caller gave follows.
func SetState(gh GH, docs, state string, numbers []int, o FlipOpts) ([]string, error) {
	o.From = nil // a flip that writes always reads the issue
	var flips []flip
	for _, n := range numbers {
		f, err := checkFlip(gh, docs, state, spec.IssueRef{Num: n}, o)
		if err != nil {
			return nil, err
		}
		flips = append(flips, f)
	}
	var lines []string
	for _, f := range flips {
		prefix := ""
		if state == "done" {
			var merged []PR
			for _, p := range f.prs {
				if p.State == "merged" {
					merged = append(merged, p)
				}
			}
			if len(merged) > 0 {
				prefix = "合并的 PR：" + prList(merged) + "。"
			}
		}
		if err := move(gh, *f.it, state, prefix+o.Comment); err != nil {
			return lines, err
		}
		suffix := ""
		if reason, ok := Closed[state]; ok {
			suffix = fmt.Sprintf("（关闭，%s）", reason)
		}
		lines = append(lines, fmt.Sprintf("#%d: %s → %s%s", f.it.Number, f.cur, state, suffix))
	}
	return lines, nil
}

// Reconcile flips what needs no judgement: every PR merged → done; every PR ready → in-review.
func Reconcile(gh GH) (done, problems []string, err error) {
	open, err := OpenIssues(gh, "")
	if err != nil {
		return nil, nil, err
	}
	prs := map[int][]PR{}
	rows := make([]Row, 0, len(open))
	for _, it := range open {
		rows = append(rows, Row{Number: it.Number, Labels: it.Labels})
		if (it.State == "in-progress" || it.State == "in-review") && it.Repo != "" {
			p, err := PRsOf(gh, it.Number, it.Repo)
			if err != nil {
				return nil, nil, err
			}
			prs[it.Number] = p
		}
	}
	actions, problems := ReconcilePlan(rows, prs)
	byNumber := map[int]Issue{}
	for _, i := range open {
		byNumber[i.Number] = i
	}
	for _, a := range actions {
		if err := move(gh, byNumber[a.N], a.To, fmt.Sprintf("%s，翻成 %s。", a.Why, a.To)); err != nil {
			return done, problems, err
		}
		done = append(done, fmt.Sprintf("#%d: %s → %s（%s）", a.N, a.From, a.To, a.Why))
	}
	return done, problems, nil
}

const consolidationMark = "由整合定时任务开出"

// IsConsolidationRoot is true for a root the old consolidation task opened: it has sub-issues and line 1 of its
// body names that task. Roots a human split are not.
func IsConsolidationRoot(it Issue) bool {
	return it.SubTotal > 0 && strings.HasPrefix(strings.TrimSpace(strings.Split(it.Body, "\n")[0]), consolidationMark)
}

// Migrate plans, and with apply makes, the move off the old model: the old Chinese status labels become the new
// ones (搁置 also gets a comment), `status:` lines leave the specs' frontmatter, and the sub-issue links under the
// roots the consolidation task opened are removed; those roots, which existed only to group, are closed as not
// planned with a comment (one already carrying a status:* label is being worked on: unlinked, not closed).
// Parent-child links a human made are left alone. Without apply nothing is written.
func Migrate(gh GH, docs string, apply bool) (lines []string, err error) {
	open, err := OpenIssues(gh, "")
	if err != nil {
		return nil, err
	}
	prs := map[int][]PR{}
	rows := make([]Row, 0, len(open))
	for _, it := range open {
		rows = append(rows, Row{Number: it.Number, Labels: it.Labels})
		if contains(it.Labels, Label("实现中")) && it.Repo != "" {
			p, err := PRsOf(gh, it.Number, it.Repo)
			if err != nil {
				return nil, err
			}
			prs[it.Number] = p
		}
	}
	var roots, closing []Issue
	for _, it := range open {
		if IsConsolidationRoot(it) {
			roots = append(roots, it)
		}
	}
	var children []ChildGroup
	for _, r := range roots {
		kids, err := SubIssues(gh, r.Number)
		if err != nil {
			return nil, err
		}
		children = append(children, ChildGroup{Parent: r.Number, Kids: kids})
		hasStatus := false
		for _, l := range r.Labels {
			if strings.HasPrefix(l, Prefix) {
				hasStatus = true
			}
		}
		if !hasStatus {
			closing = append(closing, r)
		}
	}
	relabels, unlinks, problems := MigratePlan(rows, prs, children)
	var statusSpecs []spec.Spec
	for _, s := range spec.Scan(docs) {
		b, err := os.ReadFile(s.File)
		if err != nil {
			continue
		}
		if _, has := spec.Frontmatter(string(b))["status"]; has {
			statusSpecs = append(statusSpecs, s)
		}
	}
	for _, r := range relabels {
		target := "回 backlog（去掉 status:*）"
		if len(r.Add) > 0 {
			target = r.Add[0]
		}
		line := fmt.Sprintf("#%d: %s → %s", r.N, Label(r.From), target)
		if r.Comment != "" {
			line += "，补评论"
		}
		lines = append(lines, line)
	}
	for _, s := range statusSpecs {
		lines = append(lines, fmt.Sprintf("spec %s: 删掉 frontmatter 的 status 行", s.Slug))
	}
	for _, u := range unlinks {
		lines = append(lines, fmt.Sprintf("#%d: 解除 #%d 的子 issue 关系", u.Child, u.Parent))
	}
	for _, r := range roots {
		isClosing := false
		for _, c := range closing {
			if c.Number == r.Number {
				isClosing = true
			}
		}
		if isClosing {
			lines = append(lines, fmt.Sprintf("#%d: 整合开出的根，解除后关成 not planned（补评论）", r.Number))
		} else {
			lines = append(lines, fmt.Sprintf("#%d: 整合开出的根，但已有 status:* label（有人在做），解除关系后不关", r.Number))
		}
	}
	for _, p := range problems {
		lines = append(lines, "问题："+p)
	}
	if !apply {
		return lines, nil
	}
	if _, err := EnsureLabels(gh, nil, false); err != nil {
		return lines, err
	}
	for _, r := range relabels {
		if err := editLabels(gh, r.N, r.Add, r.Remove); err != nil {
			return lines, err
		}
		if r.Comment != "" {
			if _, err := gh([]string{"issue", "comment", fmt.Sprint(r.N), "--body", withMarker(r.Comment)}); err != nil {
				return lines, err
			}
		}
	}
	for _, s := range statusSpecs {
		b, err := os.ReadFile(s.File)
		if err != nil {
			return lines, err
		}
		if err := os.WriteFile(s.File, []byte(WithoutStatus(string(b))), 0o644); err != nil {
			return lines, err
		}
	}
	for _, u := range unlinks {
		if _, err := gh([]string{"api", "-X", "DELETE", fmt.Sprintf("repos/{owner}/{repo}/issues/%d/sub_issue", u.Parent), "-F", fmt.Sprintf("sub_issue_id=%d", u.ChildID)}); err != nil {
			return lines, err
		}
	}
	for _, r := range closing {
		if err := move(gh, r, "canceled", "整合定时任务开出的归组 issue；issue 模型换了，不再用父子关系归组，子 issue 已解除关系，关成 not planned。"); err != nil {
			return lines, err
		}
	}
	return lines, nil
}

// Dump marshals v as JS `JSON.stringify(v, null, 2)` does (no HTML escaping).
func Dump(v any) string {
	var sb strings.Builder
	enc := json.NewEncoder(&sb)
	enc.SetEscapeHTML(false)
	enc.SetIndent("", "  ")
	_ = enc.Encode(v)
	return strings.TrimRight(sb.String(), "\n")
}
