package issues

import (
	"encoding/json"
	"fmt"
	"io"
	"regexp"
	"strings"

	"github.com/spf13/cobra"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/nexterr"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/registry"
)

// ---------- read: gh issue view ----------

// Comment is one comment on an issue.
type Comment struct {
	Author    string `json:"author"`
	CreatedAt string `json:"createdAt"`
	Body      string `json:"body"`
}

// Read is what `read` prints.
type Read struct {
	Number    int       `json:"number"`
	Title     string    `json:"title"`
	State     string    `json:"state"`
	Open      bool      `json:"open"`
	URL       string    `json:"url"`
	Labels    []string  `json:"labels"`
	Assignees []string  `json:"assignees"`
	Body      string    `json:"body"`
	Comments  []Comment `json:"comments"`
}

// ReadView reads issue n with its comments (`gh issue view`).
func ReadView(gh GH, n int) (Read, error) {
	raw, err := gh([]string{"issue", "view", fmt.Sprint(n), "--json", "number,title,body,state,stateReason,url,labels,assignees,comments"})
	if err != nil {
		return Read{}, err
	}
	var v struct {
		Number      int    `json:"number"`
		Title       string `json:"title"`
		Body        string `json:"body"`
		State       string `json:"state"`
		StateReason string `json:"stateReason"`
		URL         string `json:"url"`
		Labels      []struct {
			Name string `json:"name"`
		} `json:"labels"`
		Assignees []struct {
			Login string `json:"login"`
		} `json:"assignees"`
		Comments []struct {
			Author struct {
				Login string `json:"login"`
			} `json:"author"`
			CreatedAt string `json:"createdAt"`
			Body      string `json:"body"`
		} `json:"comments"`
	}
	if err := decode(raw, &v); err != nil {
		return Read{}, err
	}
	r := Read{Number: v.Number, Title: v.Title, URL: v.URL, Body: v.Body, Labels: []string{}, Assignees: []string{}, Comments: []Comment{}}
	r.Open = strings.EqualFold(v.State, "open")
	for _, l := range v.Labels {
		r.Labels = append(r.Labels, l.Name)
	}
	for _, a := range v.Assignees {
		r.Assignees = append(r.Assignees, a.Login)
	}
	for _, c := range v.Comments {
		r.Comments = append(r.Comments, Comment{c.Author.Login, c.CreatedAt, c.Body})
	}
	r.State = StateOf(r.Labels, r.Open, strings.ToLower(v.StateReason))
	return r, nil
}

func readCommand(d Deps) *cobra.Command {
	return leaf("read <docs> <n>", "JSON：#n 的标题、状态、label、负责人、正文和全部评论（包 gh issue view）", registry.CallerSession,
		"dyna issues show <docs> <n>", func(cmd *cobra.Command, args []string) error {
			s, err := d.open("read", arg(args, 0), "")
			if err != nil {
				return err
			}
			if len(args) < 2 {
				return fmt.Errorf("usage: dyna issues read <docs> <issue 号>")
			}
			n, err := num(args[1], "issue")
			if err != nil {
				return err
			}
			r, err := ReadView(s.gh, n)
			if err != nil {
				return err
			}
			s.json(r)
			return nil
		})
}

// ---------- block: GitHub's "blocked by" relation ----------

// Blocker is an issue that blocks another.
type Blocker struct {
	Number int    `json:"number"`
	Title  string `json:"title"`
	State  string `json:"state"`
	Open   bool   `json:"open"`
}

// AddBlocker makes #n blocked by #blocker.
func AddBlocker(gh GH, n, blocker int) error {
	b, err := ReadIssue(gh, blocker)
	if err != nil {
		return err
	}
	_, err = gh([]string{"api", "-X", "POST", fmt.Sprintf("repos/{owner}/{repo}/issues/%d/dependencies/blocked_by", n), "-F", fmt.Sprintf("issue_id=%d", b.ID)})
	return err
}

// RemoveBlocker makes #n no longer blocked by #blocker.
func RemoveBlocker(gh GH, n, blocker int) error {
	b, err := ReadIssue(gh, blocker)
	if err != nil {
		return err
	}
	_, err = gh([]string{"api", "-X", "DELETE", fmt.Sprintf("repos/{owner}/{repo}/issues/%d/dependencies/blocked_by/%d", n, b.ID)})
	return err
}

// ListBlockers are the issues #n is blocked by.
func ListBlockers(gh GH, n int) ([]Blocker, error) {
	raw, err := gh([]string{"api", fmt.Sprintf("repos/{owner}/{repo}/issues/%d/dependencies/blocked_by?per_page=100", n)})
	if err != nil {
		return nil, err
	}
	var rows []restIssue
	if err := decode(raw, &rows); err != nil {
		return nil, err
	}
	out := make([]Blocker, 0, len(rows))
	for _, r := range rows {
		it := rowOf(r)
		out = append(out, Blocker{Number: it.Number, Title: it.Title, State: it.State, Open: it.Open})
	}
	return out, nil
}

func blockCommand(d Deps) *cobra.Command {
	group := registry.Group("block", "挡路关系：标、去、列（包 GitHub 的 blocked_by）")
	two := func(name string) func(cmd *cobra.Command, args []string) (*session, int, int, error) {
		return func(cmd *cobra.Command, args []string) (*session, int, int, error) {
			s, err := d.open("block", arg(args, 0), "")
			if err != nil {
				return nil, 0, 0, err
			}
			if len(args) < 3 {
				return nil, 0, 0, fmt.Errorf("usage: dyna issues block %s <docs> <被挡的 issue 号> <挡路的 issue 号>", name)
			}
			n, err := num(args[1], "issue")
			if err != nil {
				return nil, 0, 0, err
			}
			b, err := num(args[2], "挡路的 issue")
			return s, n, b, err
		}
	}
	add := leaf("add <docs> <n> <blocker>", "标：#n 被 #blocker 挡着", registry.CallerSession, "dyna issues block list <docs> <n>",
		func(cmd *cobra.Command, args []string) error {
			s, n, b, err := two("add")(cmd, args)
			if err != nil {
				return err
			}
			if err := AddBlocker(s.gh, n, b); err != nil {
				return err
			}
			s.println(fmt.Sprintf("#%d: 被 #%d 挡着", n, b))
			return nil
		})
	remove := leaf("remove <docs> <n> <blocker>", "去：#n 不再被 #blocker 挡着", registry.CallerSession, "dyna issues block list <docs> <n>",
		func(cmd *cobra.Command, args []string) error {
			s, n, b, err := two("remove")(cmd, args)
			if err != nil {
				return err
			}
			if err := RemoveBlocker(s.gh, n, b); err != nil {
				return err
			}
			s.println(fmt.Sprintf("#%d: 不再被 #%d 挡着", n, b))
			return nil
		})
	list := leaf("list <docs> <n>", "列：JSON，挡着 #n 的 issue", registry.CallerSession, "dyna issues show <docs> <n>",
		func(cmd *cobra.Command, args []string) error {
			s, err := d.open("block", arg(args, 0), "")
			if err != nil {
				return err
			}
			if len(args) < 2 {
				return fmt.Errorf("usage: dyna issues block list <docs> <issue 号>")
			}
			n, err := num(args[1], "issue")
			if err != nil {
				return err
			}
			rows, err := ListBlockers(s.gh, n)
			if err != nil {
				return err
			}
			s.json(rows)
			return nil
		})
	group.AddCommand(add, remove, list)
	return group
}

// ---------- guard: no hand-edited status labels ----------

var (
	ghEdit    = regexp.MustCompile(`\bgh\s+(?:-R\s+\S+\s+)?issue\s+edit\b`)
	labelFlag = regexp.MustCompile(`--(?:add|remove)-label(?:\s+|=)["']?([^\s"']+)`)
	cmdSplit  = regexp.MustCompile(`&&|\|\||[;|\n]`)
)

// HandEditsStatus reports whether a shell command line adds or removes a status:* label with `gh issue edit`.
func HandEditsStatus(command string) bool {
	for _, seg := range cmdSplit.Split(command, -1) {
		if !ghEdit.MatchString(seg) {
			continue
		}
		for _, m := range labelFlag.FindAllStringSubmatch(seg, -1) {
			for _, l := range strings.Split(m[1], ",") {
				if strings.HasPrefix(strings.TrimSpace(l), Prefix) {
					return true
				}
			}
		}
	}
	return false
}

// GuardMessage is what a blocked command is told.
const GuardMessage = "不要用 gh issue edit 手改 status:* label：issue 的状态只从一个地方改，用 `dyna issues set <docs> <状态> <issue 号>`（先 `dyna issues check` 核对翻得了；`--help` 看参数）。别的 label（kind:、priority:、type:）照常用 gh issue edit。"

func guardCommand(d Deps) *cobra.Command {
	c := leaf("guard [command]", "拦下手写的 gh issue edit 加或去 status:* label，提示改用 dyna issues set；别的 label 放行", registry.CallerHook,
		"dyna issues set <docs> <状态> <issue 号>", func(cmd *cobra.Command, args []string) error {
			hook, _ := cmd.Flags().GetBool("hook")
			command := arg(args, 0)
			if hook {
				var stdin io.Reader = d.Stdin
				if stdin == nil {
					return nil
				}
				raw, _ := io.ReadAll(stdin)
				var ev struct {
					ToolName  string `json:"tool_name"`
					ToolInput struct {
						Command string `json:"command"`
					} `json:"tool_input"`
				}
				if json.Unmarshal(raw, &ev) != nil || (ev.ToolName != "" && ev.ToolName != "Bash") {
					return nil // not something this guard reads: let it through
				}
				command = ev.ToolInput.Command
			}
			if !HandEditsStatus(command) {
				return nil
			}
			if hook {
				return &nexterr.Exit{Code: 2, Msg: GuardMessage}
			}
			return nexterr.Plain("%s", GuardMessage)
		})
	c.Flags().Bool("hook", false, "从 stdin 读 PreToolUse 事件；被拦时退出码 2、理由写到 stderr")
	return c
}
