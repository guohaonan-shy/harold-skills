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
	// Cwd is where `handoff` runs claude when --worktree is not given; empty means the process's directory.
	Cwd string
	// Now is the clock; nil means time.Now.
	Now func() time.Time
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

const moduleLong = `运行环境：认环境、开场注入、按能力取这个环境的做法、开一个 issue 会话（桌面端交到桌面、magi 直接开）。

认环境：IDEA_LOOP_RUNTIME 有值就用它（必须是已知名字，不认识就报错，不猜）；否则有 MAGI_SESSION_ID 是 magi；否则是 claude-desktop。命令行、IDE 插件没有可靠的标记变量，落到 claude-desktop，缺的工具走退路。

数据在插件目录的 runtime/ 下（IDEA_LOOP_PLUGIN_ROOT，经插件的 bin/dyna 调用会自己设）：
  runtime/capabilities.md   能力清单和退路（show 不带能力时打印它们；inject runtime 注入它的全文）
  runtime/<环境名>.md       这个环境每个能力一节（## <能力名>，名字与能力清单第一列一致）；浏览器那一节含三条规矩（给人看、无头、并行时抢锁）
改数据只升插件，不用发新版 dyna。

本机覆盖：这台设备的做法跟插件数据不一样时，写 <home>/runtime/<环境名>.md（home 是 IDEA_LOOP_HOME，没设就是用户主目录下的 home；文件名与插件 runtime/ 下的同名）。inject reference 和 show <能力> 打印的都是合并后的：
  - 本机文件里每个 ## 或 ### 标题开一段，到下一个同级或更高级标题为止（## 段带着它的 ###；代码块里的 # 行不算标题）。第一个 ##/### 之前的内容（前言、# 标题）不用。要单独换插件里另一处的 ###，写在所有 ## 段之前，或前面隔一行 # 标题，否则它算进上面那个 ## 段里。
  - 插件数据里同级、标题文字完全相同、且只有一处的那段，被本机这段整段替换。没写的段照插件的。
  - 标题在插件里找不到同级同名的、或不止一处的，这段不用，不往末尾追加，只在头一行写「没对上、没用上」。
  - inject reference 最前面多一行：本机覆盖文件的路径、替换了哪几节、没对上的是哪几节。合并后超过 10000 字（开场注入的上限）时那一行再加一句，照样注入。
  - show <能力> 里那一节是本机写的，第一行写「本机覆盖 <路径>：这一节是本机写的」；只有其中的 ### 段是本机写的，第一行点出是哪几段。
  - 没有 home、没有这个文件：输出跟没有这项功能时逐字相同。文件读不了（权限、不是 UTF-8）：当作没有覆盖，头一行写「本机覆盖读取失败：<原因>」，命令照常成功。
  - 只管这个环境的做法；能力清单、退路不给本机改。

加一种运行环境：
  1. 在 runtime/ 下多写一份 <名字>.md，每个能力一节，小节名与 capabilities.md 的能力清单一一对应；某个能力这个环境做不到，那一节写「没有」和退路。
  2. 把名字加进 dyna 的已知名单（dyna/internal/runtime 的 Names），并在认环境的规则里写它怎么认（Detect）；这一步改了 dyna，要升 dyna 版本、存新登记表。
  3. 通用流程不动：流程只写能力，不写工具。`

// Command is the `runtime` module.
func Command(d Deps) *cobra.Command {
	root := registry.Group("runtime", "运行环境：认环境、开场注入、按能力取这个环境的做法、开一个 issue 会话（桌面端交到桌面、magi 直接开）")
	root.Long = moduleLong

	name := leaf("name", "打印当前运行环境的名字（claude-desktop / magi）；IDEA_LOOP_RUNTIME 给了不认识的名字就报错退出 1，不猜", registry.CallerSession, func(cmd *cobra.Command, args []string) error {
		n, err := Detect(d.env())
		if err != nil {
			return err
		}
		fmt.Fprintln(d.out(), n)
		return nil
	})

	inject := leaf("inject <runtime|reference>", "打印开场注入的一段（只由 SessionStart hook 调）：运行环境加能力清单、当前环境的数据全文；每段一条命令，因为 hook 的输出超过一万字会被截", registry.CallerHook, func(cmd *cobra.Command, args []string) error {
		if len(args) != 1 {
			return fmt.Errorf("usage: dyna runtime inject <%s>", strings.Join(Sections, "|"))
		}
		text, err := Inject(args[0], d.env())
		if err != nil {
			return err
		}
		_, err = io.WriteString(d.out(), text)
		return err
	})
	inject.Args = cobra.ArbitraryArgs
	inject.Flags().Bool("hook", false, "由 SessionStart hook 调：命令行版本不对或没装时只在 stderr 留一行、退出 0，不拦会话")

	show := leaf("show [capability]", "打印当前运行环境里这项能力的做法（数据里的那一节）；不带能力打印能力清单和做不到时的退路。子代理收不到开场注入，用它取", registry.CallerSession, func(cmd *cobra.Command, args []string) error {
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
			text, err = Show(args[0], d.env())
		}
		if err != nil {
			return err
		}
		_, err = io.WriteString(d.out(), text)
		return err
	})
	show.Args = cobra.ArbitraryArgs

	handoff := leaf("handoff", "开一个 issue 会话（调度用），命令自己认当前运行环境：桌面端先 claude -p 建会话、读 id，再 claude --desktop --resume <id> 交到桌面；magi 下跑 magi sessions start（要 --worktree、--issue、--repo、--period、--prompt-file）；成功打印一行 JSON，失败退出 1、stderr「交出失败：…」", registry.CallerSession, func(cmd *cobra.Command, args []string) error {
		f := cmd.Flags()
		o := HandoffOptions{Given: map[string]bool{}}
		for name, dst := range map[string]*string{
			"worktree": &o.Worktree, "issue": &o.Issue, "repo": &o.Repo, "period": &o.Period, "claude": &o.Claude,
			"timeout-sec": &o.Timeout, "p-timeout-sec": &o.PTimeout, "dir": &o.Dir,
			"prompt-file": &o.PromptFile, "magi": &o.Magi,
		} {
			*dst, _ = f.GetString(name)
			o.Given[name] = f.Changed(name)
		}
		o.Caps, _ = f.GetStringArray("cap")
		cwd := d.Cwd
		if cwd == "" {
			cwd, _ = os.Getwd()
		}
		now := d.Now
		if now == nil {
			now = time.Now
		}
		code := Handoff(o, d.env(), cwd, now, d.out(), d.errOut())
		if code != 0 {
			return &nexterr.Exit{Code: code}
		}
		return nil
	})
	handoff.Flags().String("worktree", "", "两次 claude 都在这个目录里跑（默认：当前目录）；接回的会话只能从它被建出来的目录找到")
	handoff.Flags().String("issue", "", "issue 号；和 --repo、--period 要么都给、要么都不给，给了就在成功后往记录目录追加一条")
	handoff.Flags().String("repo", "", "仓库名，记录文件是 <记录目录>/<仓库名>.json")
	handoff.Flags().String("period", "", "时段标签（todo 或 triage），早上汇总靠它找夜里开出的会话")
	handoff.Flags().String("claude", "", "claude 可执行文件（环境变量 DESKTOP_HANDOFF_CLAUDE；默认 claude）")
	handoff.Flags().String("timeout-sec", "", "claude --desktop 那一步最多等几秒，超了算失败（环境变量 DESKTOP_HANDOFF_TIMEOUT_SEC；默认 90）")
	handoff.Flags().String("p-timeout-sec", "", "claude -p 那一步最多等几秒（环境变量 DESKTOP_HANDOFF_P_TIMEOUT_SEC；默认 180）")
	handoff.Flags().String("dir", "", "记录目录（环境变量 IDEA_LOOP_DISPATCH_DIR；默认 ~/.idea-loop/dispatch）")

	handoff.Flags().StringArray("cap", nil, "magi：会话可以用的能力，可重复（如 magi、browser、issue 平台的 MCP 服务器名）；桌面端不读")
	handoff.Flags().String("prompt-file", "", "magi：会话的任务（prompt）写在这个文件里；magi 下必须给，桌面端不读，任务由调用方在归位之后发")
	handoff.Flags().String("magi", "", "magi 可执行文件（环境变量 IDEA_LOOP_HANDOFF_MAGI；默认 magi）")

	root.AddCommand(name, inject, show, handoff)
	return root
}
