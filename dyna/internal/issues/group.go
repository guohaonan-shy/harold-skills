package issues

// A group is a parent issue and its sub-issues (GitHub sub-issues): the issues that change the same thing, or
// whose plans would overturn one another, discussed and specced together in the parent's session. The parent's
// body gathers each sub-issue's problem (ParentSections); its priority is the highest of its open sub-issues.

import (
	"fmt"
	"strings"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/registry"
	"github.com/spf13/cobra"
)

// SubIssue is one row of `sub list`.
type SubIssue struct {
	Number   int     `json:"number"`
	Title    string  `json:"title"`
	State    string  `json:"state"`
	Open     bool    `json:"open"`
	Priority *string `json:"priority"`
}

// AddSub hangs #child under #parent, moving it off any parent it had.
func AddSub(gh GH, parent, child int) error {
	c, err := ReadIssue(gh, child)
	if err != nil {
		return err
	}
	_, err = gh([]string{"api", "-X", "POST", fmt.Sprintf("repos/{owner}/{repo}/issues/%d/sub_issues", parent), "-F", fmt.Sprintf("sub_issue_id=%d", c.ID), "-F", "replace_parent=true"})
	return err
}

// RemoveSub takes #child off #parent.
func RemoveSub(gh GH, parent, child int) error {
	c, err := ReadIssue(gh, child)
	if err != nil {
		return err
	}
	_, err = gh([]string{"api", "-X", "DELETE", fmt.Sprintf("repos/{owner}/{repo}/issues/%d/sub_issue", parent), "-F", fmt.Sprintf("sub_issue_id=%d", c.ID)})
	return err
}

// ListSubs are the sub-issues of #parent, open and closed.
func ListSubs(gh GH, parent int) ([]SubIssue, error) {
	kids, err := SubIssues(gh, parent)
	if err != nil {
		return nil, err
	}
	out := make([]SubIssue, 0, len(kids))
	for _, k := range kids {
		row := SubIssue{Number: k.Number, Title: k.Title, State: k.State, Open: k.Open}
		if p := PriorityOf(k.Labels); p != "" {
			row.Priority = &p
		}
		out = append(out, row)
	}
	return out, nil
}

// SyncParentPriority leaves #parent carrying the highest priority among its open sub-issues (none when none of
// them has one); returns that priority, "none" for none.
func SyncParentPriority(gh GH, parent int) (string, error) {
	kids, err := SubIssues(gh, parent)
	if err != nil {
		return "", err
	}
	best := len(Priorities)
	for _, k := range kids {
		if k.Open {
			if r := priorityRank(k.Labels); r < best {
				best = r
			}
		}
	}
	p := "none"
	if best < len(Priorities) {
		p = Priorities[best]
	}
	_, err = SetPriority(gh, parent, p)
	return p, err
}

// NewParent opens a parent issue over subs: the body has the parent's four sections, every sub-issue is open, and
// no open issue has the same title. It opens in triage (or backlog), hangs the sub-issues under it and gives it
// their highest priority. Nothing is created unless every check passed.
func NewParent(gh GH, title, body, state string, subs []int) (int, error) {
	if strings.TrimSpace(title) == "" {
		return 0, fmt.Errorf("没给标题")
	}
	if state == "" {
		state = "triage"
	}
	if state != "backlog" && state != "triage" {
		return 0, fmt.Errorf("父 issue 的 --state 只能是 backlog 或 triage（给的是「%s」）", state)
	}
	if errs := ParentBodyErrors(body); len(errs) > 0 {
		return 0, fmt.Errorf("父 issue 的正文不合格，没开：%s", strings.Join(errs, "；"))
	}
	open, err := OpenIssues(gh, "")
	if err != nil {
		return 0, err
	}
	byNumber := map[int]Issue{}
	for _, i := range open {
		byNumber[i.Number] = i
		if strings.TrimSpace(i.Title) == strings.TrimSpace(title) {
			return 0, fmt.Errorf("已经有同标题的 open issue #%d，没开", i.Number)
		}
	}
	for _, n := range subs {
		if _, ok := byNumber[n]; !ok {
			return 0, fmt.Errorf("#%d 不是开着的 issue，没开", n)
		}
	}
	args := []string{"issue", "create", "--title", strings.TrimSpace(title), "--body", body}
	if state == "triage" {
		args = append(args, "--label", Label("triage"))
	}
	out, err := gh(args)
	if err != nil {
		return 0, err
	}
	m := createdRe.FindStringSubmatch(strings.TrimSpace(out))
	if m == nil {
		return 0, fmt.Errorf("gh issue create 没返回 issue 地址：%s", out)
	}
	var n int
	fmt.Sscanf(m[1], "%d", &n)
	for _, c := range subs {
		if err := AddSub(gh, n, c); err != nil {
			return n, fmt.Errorf("开了 #%d，挂 #%d 时出错（之后用 dyna issues sub add 补）：%v", n, c, err)
		}
	}
	if _, err := SyncParentPriority(gh, n); err != nil {
		return n, fmt.Errorf("开了 #%d 并挂好子 issue，同步优先级时出错（之后用 dyna issues sub add 重挂一个会再同步）：%v", n, err)
	}
	return n, nil
}

func subCommand(d Deps) *cobra.Command {
	group := registry.Group("sub", "父子 issue：挂、摘、列（包 GitHub 的 sub-issues）；挂和摘之后父 issue 的优先级取开着的子 issue 里最高的")
	many := func(name string, args []string) (*session, int, []int, error) {
		s, err := d.open("sub", arg(args, 0), "")
		if err != nil {
			return nil, 0, nil, err
		}
		if len(args) < 3 {
			return nil, 0, nil, fmt.Errorf("usage: dyna issues sub %s <docs> <父 issue 号> <子 issue 号>...", name)
		}
		p, err := num(args[1], "父 issue")
		if err != nil {
			return nil, 0, nil, err
		}
		var kids []int
		for _, a := range args[2:] {
			k, err := num(a, "子 issue")
			if err != nil {
				return nil, 0, nil, err
			}
			kids = append(kids, k)
		}
		return s, p, kids, nil
	}
	run := func(name, verb string, op func(GH, int, int) error) func(*cobra.Command, []string) error {
		return func(cmd *cobra.Command, args []string) error {
			s, p, kids, err := many(name, args)
			if err != nil {
				return err
			}
			for _, k := range kids {
				if err := op(s.gh, p, k); err != nil {
					return err
				}
				s.println(fmt.Sprintf("#%d: %s #%d", k, verb, p))
			}
			got, err := SyncParentPriority(s.gh, p)
			if err != nil {
				return err
			}
			s.println(fmt.Sprintf("#%d: 优先级 %s", p, got))
			return nil
		}
	}
	add := leaf("add <docs> <parent> <child>...", "挂：子 issue 挂到父 issue 下（原来挂在别处的移过来），再同步父 issue 的优先级", registry.CallerSession, "dyna issues sub list <docs> <parent>",
		run("add", "挂到", AddSub))
	remove := leaf("remove <docs> <parent> <child>...", "摘：子 issue 从父 issue 下摘掉，再同步父 issue 的优先级", registry.CallerSession, "dyna issues sub list <docs> <parent>",
		run("remove", "摘离", RemoveSub))
	list := leaf("list <docs> <parent>", "列：JSON，父 issue 下的子 issue（开着的和关了的）", registry.CallerSession, "dyna issues show <docs> <n>",
		func(cmd *cobra.Command, args []string) error {
			s, err := d.open("sub", arg(args, 0), "")
			if err != nil {
				return err
			}
			if len(args) < 2 {
				return fmt.Errorf("usage: dyna issues sub list <docs> <父 issue 号>")
			}
			p, err := num(args[1], "父 issue")
			if err != nil {
				return err
			}
			rows, err := ListSubs(s.gh, p)
			if err != nil {
				return err
			}
			s.json(rows)
			return nil
		})
	group.AddCommand(add, remove, list)
	return group
}
