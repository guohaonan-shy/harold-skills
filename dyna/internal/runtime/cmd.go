package runtime

import (
	"fmt"
	"io"
	"os"
	"strings"
	"time"

	"github.com/spf13/cobra"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/home"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/nexterr"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/registry"
)

// Deps is what the commands reach outside the process through.
type Deps struct {
	Env    home.Env
	Stdout io.Writer
	Stderr io.Writer
	// Now is the clock `record` stamps entries with; nil means time.Now.
	Now func() time.Time
	// Cwd is the directory the session runs in (the project place is found from it); empty means the process's.
	Cwd string
}

func (d Deps) cwd() string {
	if d.Cwd != "" {
		return d.Cwd
	}
	wd, _ := os.Getwd()
	return wd
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

func (d Deps) errOut() io.Writer {
	if d.Stderr == nil {
		return os.Stderr
	}
	return d.Stderr
}

func leaf(use, short, caller string, run func(cmd *cobra.Command, args []string) error) *cobra.Command {
	c := &cobra.Command{Use: use, Short: short, Args: cobra.NoArgs, SilenceUsage: true, SilenceErrors: true, RunE: run}
	registry.Mark(c, caller, "")
	return c
}

const moduleLong = `运行环境：认环境、开场注入、按能力取这个环境的做法、记一笔开出的 issue 会话。

说明放在三处，dyna 按这个顺序找，先找到的那份整份生效，三处之间不合并：
  1. 项目：当前目录所在仓库的主 checkout（git 公共目录的上一级，worktree 里也指向主 checkout，不是 worktree 自己的根）下的 .idea-loop/runtime/<名>.md；不在 git 仓库里就跳过这一处。
  2. home：<home>/runtime/<名>.md（home 是 IDEA_LOOP_HOME，没设就是用户主目录下的 home）。
  3. 用户根目录：~/.idea-loop/runtime/<名>.md。
插件不带任何运行环境的说明，只带能力清单和能力模板（插件目录 runtime/capabilities.md，IDEA_LOOP_PLUGIN_ROOT，经插件的 bin/dyna 调用会自己设）：
  capabilities.md           能力清单、退路和能力模板（show 不带能力时打印清单和退路；inject runtime 注入清单和退路，不带「能力模板」一节）
  <环境名>.md               这个环境的说明（放在上面三处）：开头一行标记，然后每个能力一节（## <能力名>，名字与能力清单第一列一致）

认环境：认识的运行环境，是三处里带标记行的 <名>.md，同名的取顺序在前那一处。标记行写在说明开头、第一个 ## 小节之前：「标记：」后面跟用反引号包住的环境变量名，或写「没有」（没有标记）。没有标记行的文件不是说明。按顺序认：
  1. IDEA_LOOP_RUNTIME 有值：是认识的名字就用它；不认识就报错退出 1，不猜，报错里列出认识的名字。
  2. 按名字排序扫认识的说明，哪份的标记变量在环境里有值就是它。不止一份有值时取第一份，inject reference 最前面多一行说哪几份同时有值、用了哪份。
  3. 都没有：用人选的环境，记在三处里第一份有内容的 runtime/selected（纯文本，内容是一个环境名，首尾空白不算）。写的名字三处都没有说明时当作没选，inject reference 最前面多一行提示。
  4. 人也没选：认不出，不猜一个名字。inject runtime 头一行写「当前运行环境：没有（跑 /idea-loop:setup）」，inject reference 只写一行「没有运行环境说明」；两者退出 0（钩子不能失败）。name 和 show <能力> 报「认不出运行环境」退出 1，能力走退路。

加一种运行环境：多一份带标记行的说明，不改 dyna：
  1. 写 <名字>.md，开头一行标记（上面「认环境」），每个能力一节，小节名与 capabilities.md 的能力清单一一对应；某个能力这个环境做不到，那一节写「没有」和退路。
  2. 放进三处之一（跑 /idea-loop:setup 会照模板生成并问放哪）。
  3. 人要默认用它（它没有标记变量）：把名字写进同一处的 runtime/selected。
  4. 跑 dyna runtime check <文件>（不带文件就核三处找得到的全部说明）：缺哪一节、哪一项既没写做法也没写「没有」，每个问题一行。能力模板（每个能力下工作流要它做的几项，各写传入、拿回、做不到时）在 capabilities.md 的「能力模板」一节，写说明时照它；开场不注入这一节。
  5. 通用流程不动：流程只写能力，不写工具。`

// Command is the `runtime` module.
func Command(d Deps) *cobra.Command {
	root := registry.Group("runtime", "运行环境：认环境、开场注入、按能力取这个环境的做法、记一笔开出的 issue 会话")
	root.Long = moduleLong

	name := leaf("name", "打印当前运行环境的名字；IDEA_LOOP_RUNTIME 给了不认识的名字就报错退出 1（列出认识的名字），认不出运行环境（没有说明、没有标记有值、没人选）也报错退出 1 并提示跑 /idea-loop:setup，不猜", registry.CallerSession, func(cmd *cobra.Command, args []string) error {
		det, err := Detect(d.env(), d.cwd())
		if err != nil {
			return err
		}
		if det.None() {
			return det.Unknown()
		}
		fmt.Fprintln(d.out(), det.Name)
		return nil
	})

	inject := leaf("inject <runtime|reference>", "打印开场注入的一段（只由 SessionStart hook 调）：运行环境加能力清单、当前环境的说明全文；认不出运行环境时头一行写「当前运行环境：没有」、说明那段只写一行「没有运行环境说明，跑 /idea-loop:setup」，照常退出 0；每段一条命令，因为 hook 的输出超过一万字会被截", registry.CallerHook, func(cmd *cobra.Command, args []string) error {
		if len(args) != 1 {
			return fmt.Errorf("usage: dyna runtime inject <%s>", strings.Join(Sections, "|"))
		}
		text, err := Inject(args[0], d.env(), d.cwd())
		if err != nil {
			return err
		}
		_, err = io.WriteString(d.out(), text)
		return err
	})
	inject.Args = cobra.ArbitraryArgs
	inject.Flags().Bool("hook", false, "由 SessionStart hook 调：命令行版本不对或没装时只在 stderr 留一行、退出 0，不拦会话")

	show := leaf("show [capability]", "打印当前运行环境里这项能力的做法（说明里的那一节）；认不出运行环境时报错退出 1，提示跑 /idea-loop:setup，能力走退路；不带能力打印能力清单和做不到时的退路。子代理收不到开场注入，用它取", registry.CallerSession, func(cmd *cobra.Command, args []string) error {
		if len(args) > 1 {
			return fmt.Errorf("usage: dyna runtime show [能力]")
		}
		var text string
		var err error
		if len(args) == 0 {
			var p Plugin
			if p, err = PluginFrom(d.env()); err == nil {
				text, err = p.Overview()
			}
		} else {
			text, err = Show(args[0], d.env(), d.cwd())
		}
		if err != nil {
			return err
		}
		_, err = io.WriteString(d.out(), text)
		return err
	})
	show.Args = cobra.ArbitraryArgs

	recordCmd := leaf("record", "记一笔：调度用环境说明里的命令开出一个 issue 会话之后，往记录目录的 <仓库名>.json 追加一条 {issue, sessionId, openedAt, period}（早上汇总靠它找夜里开出的会话）；成功打印这一条的 JSON，参数缺或不对、仓库名当不了文件名、已有文件不是数组读不出来（不动它）都退出 1，stderr 说原因", registry.CallerSession, func(cmd *cobra.Command, args []string) error {
		f := cmd.Flags()
		var o RecordOptions
		for name, dst := range map[string]*string{"issue": &o.Issue, "repo": &o.Repo, "period": &o.Period, "session": &o.Session, "dir": &o.Dir} {
			*dst, _ = f.GetString(name)
		}
		now := d.Now
		if now == nil {
			now = time.Now
		}
		line, err := Record(o, d.env(), now)
		if err != nil {
			return err
		}
		fmt.Fprintln(d.out(), line)
		return nil
	})
	recordCmd.Flags().String("issue", "", "issue 号")
	recordCmd.Flags().String("repo", "", "仓库名，记录文件是 <记录目录>/<仓库名>.json")
	recordCmd.Flags().String("period", "", "时段，todo 或 triage，早上汇总靠它找夜里开出的会话")
	recordCmd.Flags().String("session", "", "开出的会话的 id，原样写进 sessionId")
	recordCmd.Flags().String("dir", "", "记录目录（环境变量 IDEA_LOOP_DISPATCH_DIR；默认 ~/.idea-loop/dispatch）")

	check := leaf("check [file]", "按能力模板核一份运行环境说明：开头有没有标记行、每个能力的一节在不在且节名对得上、模板里每一项有没有加粗项名并写了做法或「没有」；每个问题一行，带节名（和项名），有问题退出 1，全过打印一行通过。不带文件就核项目、home、用户根目录三处找得到的全部带标记行的说明", registry.CallerSession, func(cmd *cobra.Command, args []string) error {
		if len(args) > 1 {
			return fmt.Errorf("usage: dyna runtime check [文件]")
		}
		file := ""
		if len(args) == 1 {
			file = args[0]
		}
		res, err := Check(file, d.env(), d.cwd())
		if err != nil {
			return err
		}
		if len(res.Problems) > 0 {
			for _, p := range res.Problems {
				fmt.Fprintln(d.out(), p)
			}
			return &nexterr.Exit{Code: 1}
		}
		if file != "" {
			fmt.Fprintf(d.out(), "通过：%s 按能力模板核过了\n", file)
		} else {
			fmt.Fprintf(d.out(), "通过：核了 %d 份说明（%s）\n", len(res.Labels), strings.Join(res.Labels, "、"))
		}
		return nil
	})
	check.Args = cobra.ArbitraryArgs

	root.AddCommand(name, inject, show, check, recordCmd)
	return root
}
