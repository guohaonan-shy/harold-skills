package issues

import (
	"fmt"
	"io"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/spf13/cobra"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/home"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/registry"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/spec"
)

// Deps is what the commands reach outside the process through, so tests can stand in for gh, git and the
// environment.
type Deps struct {
	Env    home.Env
	Stdin  io.Reader
	Stdout io.Writer
	// GH and Git make a runner that runs in dir; nil means the real gh / git.
	GH  func(dir string) GH
	Git func(dir string) GH
}

func (d Deps) env() home.Env {
	if d.Env == nil {
		return home.OSEnv
	}
	return d.Env
}

func (d Deps) out() io.Writer {
	if d.Stdout == nil {
		return os.Stdout
	}
	return d.Stdout
}

func (d Deps) runGH(dir string) GH {
	if d.GH != nil {
		return d.GH(dir)
	}
	return ExecRunner("gh", dir)
}

func (d Deps) runGit(dir string) GH {
	if d.Git != nil {
		return d.Git(dir)
	}
	return ExecRunner("git", dir)
}

// session is what one command works with once its <docs> is known to be a project directory in home.
type session struct {
	docs    string
	project home.Found
	linear  bool
	gh      GH
	git     GH
	out     io.Writer
}

func (s *session) println(lines ...string) {
	for _, l := range lines {
		fmt.Fprintln(s.out, l)
	}
}

func (s *session) json(v any) { s.println(Dump(v)) }

const commandList = "labels|type|show|check|set|new|body|priority|backlog|note|candidates|reconcile|queues|migrate|read|block|guard"

// open resolves <docs> the way every command does: it must exist and be a project directory of home; a project
// whose issues are on Linear refuses the commands that write GitHub.
func (d Deps) open(cmd string, docs string, repoFlag string) (*session, error) {
	if docs == "" {
		return nil, fmt.Errorf("usage: dyna issues <%s> <docs> …（没给 docs）", commandList)
	}
	if _, err := os.Stat(docs); err != nil {
		return nil, fmt.Errorf("usage: dyna issues <%s> <docs> …（%s 不存在）", commandList, docs)
	}
	project := home.LocateByDocs(docs, d.env())
	if !project.OK {
		return nil, project.Err()
	}
	linear := PlatformOf(ReadTracker(docs)) == "linear"
	// `new --repo=…` names a GitHub repository itself (retro opens plugin issues that way), so a Linear project may use it
	if linear && GithubOnly[cmd] && !(cmd == "new" && repoFlag != "") {
		return nil, fmt.Errorf("%s", LinearRefusal(cmd))
	}
	return &session{
		docs:    docs,
		project: project,
		linear:  linear,
		gh:      InRepo(d.runGH(docs), project.Repo),
		git:     d.runGit(project.CloneDir),
		out:     d.out(),
	}, nil
}

var digitsOnly = regexp.MustCompile(`^\d+$`)
var linearKey = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9]*-\d+$`)

func num(v, what string) (int, error) {
	if !digitsOnly.MatchString(v) {
		return 0, fmt.Errorf("%s「%s」不是数字", what, v)
	}
	n, _ := strconv.Atoi(v)
	return n, nil
}

// ref is an issue reference: a GitHub number, or a Linear key such as FA-577.
func ref(v, what string) (spec.IssueRef, error) {
	if digitsOnly.MatchString(v) {
		n, _ := strconv.Atoi(v)
		return spec.IssueRef{Num: n}, nil
	}
	if linearKey.MatchString(v) {
		return spec.IssueRef{Key: v}, nil
	}
	return spec.IssueRef{}, fmt.Errorf("%s「%s」不是 GitHub 的号（12）也不是 Linear 的号（FA-577）", what, v)
}

func bodyFile(file string) (string, error) {
	if file == "" {
		return "", fmt.Errorf("没有正文文件「」")
	}
	b, err := os.ReadFile(file)
	if err != nil {
		return "", fmt.Errorf("没有正文文件「%s」", file)
	}
	return string(b), nil
}

func arg(args []string, i int) string {
	if i < len(args) {
		return args[i]
	}
	return ""
}

// leaf makes a command of the module and marks who may call it.
func leaf(use, short, caller, next string, run func(cmd *cobra.Command, args []string) error) *cobra.Command {
	c := &cobra.Command{Use: use, Short: short, Args: cobra.ArbitraryArgs, SilenceUsage: true, SilenceErrors: true, RunE: run}
	registry.Mark(c, caller, next)
	return c
}

// Command is the `issues` module.
func Command(d Deps) *cobra.Command {
	root := registry.Group("issues", "issue 的状态、标签、挡路关系和读写（状态只从这里改）")
	const sess = registry.CallerSession

	labels := leaf("labels <docs>", "建出缺的 status / priority / kind / type label，列出多余的（--prune 删掉）", sess,
		"dyna issues show <docs> <n>", func(cmd *cobra.Command, args []string) error {
			s, err := d.open("labels", arg(args, 0), "")
			if err != nil {
				return err
			}
			prune, _ := cmd.Flags().GetBool("prune")
			types, err := ReadTypes(s.docs)
			if err != nil {
				return err
			}
			res, err := EnsureLabels(s.gh, types, prune)
			if err != nil {
				return err
			}
			for _, l := range res.Made {
				s.println("created " + l)
			}
			if prune {
				for _, l := range res.Deleted {
					s.println("deleted " + l)
				}
				return nil
			}
			if len(res.Surplus) > 0 {
				s.println("不在状态、优先级、类型、分类和保留清单里的 label（--prune 删掉它们，issue 上的也一起去掉）：")
				for _, x := range res.Surplus {
					s.println(fmt.Sprintf("  %s（%d 个 open issue 在用）", x.Name, x.OpenIssues))
				}
			}
			return nil
		})
	labels.Flags().Bool("prune", false, "删掉状态、优先级、类型、分类和保留清单之外的 label")

	typ := leaf("type <docs> <n> <parent[/child]>...", "把 #n 的 type:* label 设成项目分类里的给定值", sess,
		"dyna issues labels <docs>", func(cmd *cobra.Command, args []string) error {
			s, err := d.open("type", arg(args, 0), "")
			if err != nil {
				return err
			}
			if len(args) < 3 {
				return fmt.Errorf("usage: dyna issues type <docs> <issue 号> <父类[/子类]>...")
			}
			n, err := num(args[1], "issue")
			if err != nil {
				return err
			}
			types, err := ReadTypes(s.docs)
			if err != nil {
				return err
			}
			got, err := SetTypes(s.gh, types, n, args[2:])
			if err != nil {
				return err
			}
			s.println(fmt.Sprintf("#%d: %s", n, strings.Join(got, " ")))
			return nil
		})

	show := leaf("show <docs> <n>", "JSON：#n 的状态、标题、分类、PR（仓库、draft / ready / merged）、覆盖它的 spec、分支", sess,
		"dyna issues check <docs> <状态> <n>", func(cmd *cobra.Command, args []string) error {
			s, err := d.open("show", arg(args, 0), "")
			if err != nil {
				return err
			}
			if len(args) < 2 {
				return fmt.Errorf("usage: dyna issues show <docs> <issue 号>")
			}
			var r spec.IssueRef
			if s.linear {
				r, err = ref(args[1], "issue")
			} else {
				var n int
				n, err = num(args[1], "issue")
				r = spec.IssueRef{Num: n}
			}
			if err != nil {
				return err
			}
			v, err := Show(s.gh, s.docs, r, s.git, s.project.Repo)
			if err != nil {
				return err
			}
			s.json(v)
			return nil
		})

	check := leaf("check <docs> <state> <n>", "只核对翻状态的前提，不写任何东西（--from：不读 issue，n 可以是 Linear 的号）", sess,
		"dyna issues show <docs> <n>", func(cmd *cobra.Command, args []string) error {
			s, err := d.open("check", arg(args, 0), "")
			if err != nil {
				return err
			}
			if len(args) < 3 {
				return fmt.Errorf("usage: dyna issues check <docs> <状态> <issue 号> [--from=<现在的状态>] [--comment=<文字>] [--skip-design]")
			}
			opts, err := flipOpts(cmd, s)
			if err != nil {
				return err
			}
			var r spec.IssueRef
			if opts.From == nil {
				if s.linear {
					return fmt.Errorf("这个项目的 issue 在 Linear 上，check 读不到它的状态：带 --from=<它现在的状态>（从 Linear 读），做法见 idea-loop:issues 的 references/linear.md")
				}
				n, err := num(args[2], "issue")
				if err != nil {
					return err
				}
				r = spec.IssueRef{Num: n}
			} else if r, err = ref(args[2], "issue"); err != nil {
				return err
			}
			line, err := CheckState(s.gh, s.docs, args[1], r, opts)
			if err != nil {
				return err
			}
			s.println(line)
			return nil
		})
	check.Flags().String("from", "", "issue 现在的状态（给了就不读 issue）")
	check.Flags().String("comment", "", "翻状态时的评论")
	check.Flags().Bool("skip-design", false, "没装 design 插件时跳过「设计已冻结」的核对")

	set := leaf("set <docs> <state> <n>...", "翻 issue 的状态：先逐个核对，再写；done / canceled 先关 issue 再去 label", sess,
		"dyna issues check <docs> <状态> <n>", func(cmd *cobra.Command, args []string) error {
			s, err := d.open("set", arg(args, 0), "")
			if err != nil {
				return err
			}
			if len(args) < 3 {
				return fmt.Errorf("usage: dyna issues set <docs> <状态> <issue 号>... [--comment=<文字>] [--skip-design]")
			}
			opts, err := flipOpts(cmd, s)
			if err != nil {
				return err
			}
			var numbers []int
			for _, x := range args[2:] {
				n, err := num(x, "issue")
				if err != nil {
					return err
				}
				numbers = append(numbers, n)
			}
			lines, err := SetState(s.gh, s.docs, args[1], numbers, opts)
			s.println(lines...)
			return err
		})
	set.Flags().String("comment", "", "翻状态时的评论（翻 backlog 必须写清停在哪）")
	set.Flags().Bool("skip-design", false, "没装 design 插件时跳过「设计已冻结」的核对")

	newCmd := leaf("new <docs> <title> <body-file>", "开 issue：先核正文的五节和同标题的 open issue；打印新号", sess,
		"dyna issues body <docs> <body-file>", func(cmd *cobra.Command, args []string) error {
			repo, _ := cmd.Flags().GetString("repo")
			s, err := d.open("new", arg(args, 0), repo)
			if err != nil {
				return err
			}
			if len(args) < 3 {
				return fmt.Errorf("usage: dyna issues new <docs> <标题> <正文文件> [--state=backlog|todo] [--priority=P0|P1|P2] [--kind=bug|feature|improvement] [--type=<分类>]... [--repo=<owner/repo>]")
			}
			body, err := bodyFile(args[2])
			if err != nil {
				return err
			}
			types, err := ReadTypes(s.docs)
			if err != nil {
				return err
			}
			flags := cmd.Flags()
			state, _ := flags.GetString("state")
			priority, _ := flags.GetString("priority")
			kind, _ := flags.GetString("kind")
			typeValues, _ := flags.GetStringArray("type")
			n, err := NewIssue(s.gh, types, NewIssueOpts{Title: args[1], Body: body, State: state, Priority: priority, Kind: kind, Types: typeValues, Repo: repo})
			if err != nil {
				return err
			}
			s.println(strconv.Itoa(n))
			return nil
		})
	newCmd.Flags().String("state", "", "backlog（默认）或 todo")
	newCmd.Flags().String("priority", "", "P0 / P1 / P2（开成 todo 必须带）")
	newCmd.Flags().String("kind", "", "bug / feature / improvement")
	newCmd.Flags().StringArray("type", nil, "分类，如 seo/blog，可重复")
	newCmd.Flags().String("repo", "", "开在别的仓库：owner/repo")

	body := leaf("body <docs> <body-file>", "只核对正文的五节", sess,
		"dyna issues new <docs> <title> <body-file>", func(cmd *cobra.Command, args []string) error {
			s, err := d.open("body", arg(args, 0), "")
			if err != nil {
				return err
			}
			if len(args) < 2 {
				return fmt.Errorf("usage: dyna issues body <docs> <body-file>")
			}
			text, err := bodyFile(args[1])
			if err != nil {
				return err
			}
			if errs := BodyErrors(text); len(errs) > 0 {
				return fmt.Errorf("正文不合格：%s", strings.Join(errs, "；"))
			}
			s.println("正文齐了")
			return nil
		})

	priority := leaf("priority <docs> <P0|P1|P2|none> <n>...", "换 issue 的 priority:* label（none：只去掉）", sess,
		"dyna issues show <docs> <n>", func(cmd *cobra.Command, args []string) error {
			s, err := d.open("priority", arg(args, 0), "")
			if err != nil {
				return err
			}
			if len(args) < 3 {
				return fmt.Errorf("usage: dyna issues priority <docs> <P0|P1|P2|none> <issue 号>...")
			}
			var lines []string
			for _, x := range args[2:] {
				n, err := num(x, "issue")
				if err != nil {
					return err
				}
				got, err := SetPriority(s.gh, n, args[1])
				if err != nil {
					return err
				}
				l := "没有优先级"
				if len(got) > 0 {
					l = strings.Join(got, " ")
				}
				lines = append(lines, fmt.Sprintf("#%d: %s", n, l))
			}
			s.println(lines...)
			return nil
		})

	backlog := leaf("backlog <docs> [limit]", "JSON：没有 status:* 的 open issue，最老的在前；等人补而没人答的不列", sess,
		"dyna issues show <docs> <n>", func(cmd *cobra.Command, args []string) error {
			s, err := d.open("backlog", arg(args, 0), "")
			if err != nil {
				return err
			}
			limit := 100
			if a := arg(args, 1); a != "" {
				if limit, err = num(a, "limit"); err != nil {
					return err
				}
			}
			rows, err := Backlog(s.gh, limit)
			if err != nil {
				return err
			}
			s.json(rows)
			return nil
		})

	note := leaf("note <docs> <n> <body-file>", "在 #n 上评论，第一行是 idea-loop 的标记（HTML 注释，GitHub 不显示）", sess,
		"dyna issues show <docs> <n>", func(cmd *cobra.Command, args []string) error {
			s, err := d.open("note", arg(args, 0), "")
			if err != nil {
				return err
			}
			if len(args) < 3 {
				return fmt.Errorf("usage: dyna issues note <docs> <issue 号> <正文文件>")
			}
			n, err := num(args[1], "issue")
			if err != nil {
				return err
			}
			text, err := bodyFile(args[2])
			if err != nil {
				return err
			}
			url, err := NoteIssue(s.gh, n, text)
			if err != nil {
				return err
			}
			if url != "" {
				url = " " + url
			}
			s.println(fmt.Sprintf("#%d: 已评论%s", n, url))
			return nil
		})

	candidates := leaf("candidates <docs> [limit]", "JSON：没被挡路的 todo（或 triage）issue，按「我的优先、再按优先级、再按等得久」排好", sess,
		"dyna issues show <docs> <n>", func(cmd *cobra.Command, args []string) error {
			s, err := d.open("candidates", arg(args, 0), "")
			if err != nil {
				return err
			}
			limit := 100
			if a := arg(args, 1); a != "" {
				if limit, err = num(a, "limit"); err != nil {
					return err
				}
			}
			state, _ := cmd.Flags().GetString("state")
			rows, err := Candidates(s.gh, limit, state)
			if err != nil {
				return err
			}
			s.json(rows)
			return nil
		})
	candidates.Flags().String("state", "todo", "todo 或 triage")

	reconcile := leaf("reconcile <docs>", "PR 全合并 → done；PR 全 ready → in-review；旧 label、两个 status label 报问题", sess,
		"dyna issues show <docs> <n>", func(cmd *cobra.Command, args []string) error {
			s, err := d.open("reconcile", arg(args, 0), "")
			if err != nil {
				return err
			}
			done, problems, err := Reconcile(s.gh)
			s.println(done...)
			if err != nil {
				return err
			}
			for _, p := range problems {
				s.println("问题：" + p)
			}
			return nil
		})

	queues := leaf("queues <docs>", "JSON：这一刻调度该派什么、最多几个（读 ISSUE_TRACKER.md 的「调度」表，没有就用默认）、整张表和侧栏的分区", sess, "",
		func(cmd *cobra.Command, args []string) error {
			s, err := d.open("queues", arg(args, 0), "")
			if err != nil {
				return err
			}
			var at *string
			if cmd.Flags().Changed("at") {
				v, _ := cmd.Flags().GetString("at")
				at = &v
			}
			q, err := Dispatch(ReadTracker(s.docs), at, time.Now())
			if err != nil {
				return err
			}
			s.json(q)
			return nil
		})
	queues.Flags().String("at", "", "按这一刻（HH:MM）算，不给就用本机的钟")

	migrate := leaf("migrate <docs>", "列出旧的中文状态 label 怎么换（--apply 才写）", sess,
		"dyna issues labels <docs>", func(cmd *cobra.Command, args []string) error {
			s, err := d.open("migrate", arg(args, 0), "")
			if err != nil {
				return err
			}
			apply, _ := cmd.Flags().GetBool("apply")
			lines, err := Migrate(s.gh, s.docs, apply)
			s.println(lines...)
			return err
		})
	migrate.Flags().Bool("apply", false, "真的改")

	root.AddCommand(labels, typ, show, check, set, newCmd, body, priority, backlog, note, candidates, reconcile, queues, migrate)
	root.AddCommand(readCommand(d), blockCommand(d), guardCommand(d))
	return root
}

// flipOpts reads --from, --comment and --skip-design.
func flipOpts(cmd *cobra.Command, s *session) (FlipOpts, error) {
	o := FlipOpts{Repo: s.project.Repo}
	o.Comment, _ = cmd.Flags().GetString("comment")
	o.SkipDesign, _ = cmd.Flags().GetBool("skip-design")
	if cmd.Flags().Changed("from") {
		from, _ := cmd.Flags().GetString("from")
		o.From = &from
	}
	return o, nil
}
