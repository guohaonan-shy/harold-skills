package retro

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"

	"github.com/spf13/cobra"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/home"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/nexterr"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/registry"
)

// EnvPluginRoot is the plugin's directory, set by the plugin's own `bin/dyna`; `install` copies the runner from it.
const EnvPluginRoot = "IDEA_LOOP_PLUGIN_ROOT"

// Deps is what the commands reach outside the process through.
type Deps struct {
	Env    home.Env
	Stdout io.Writer
}

func (d Deps) out() io.Writer {
	if d.Stdout == nil {
		return os.Stdout
	}
	return d.Stdout
}

func (d Deps) env(k string) string {
	if d.Env == nil {
		return os.Getenv(k)
	}
	return d.Env(k)
}

func (d Deps) homeDir() string {
	if h := d.env("HOME"); h != "" {
		return h
	}
	h, _ := os.UserHomeDir()
	return h
}

func leaf(use, short string, run func(cmd *cobra.Command, args []string) error) *cobra.Command {
	c := &cobra.Command{Use: use, Short: short, Args: cobra.ArbitraryArgs, SilenceUsage: true, SilenceErrors: true, RunE: run}
	registry.Mark(c, registry.CallerSession, "")
	return c
}

func writeJSON(w io.Writer, v any) error {
	var b bytes.Buffer
	enc := json.NewEncoder(&b)
	enc.SetEscapeHTML(false)
	enc.SetIndent("", "  ")
	if err := enc.Encode(v); err != nil {
		return err
	}
	_, err := w.Write(b.Bytes())
	return err
}

// Command is the `retro` module.
func Command(d Deps) *cobra.Command {
	root := registry.Group("retro", "retro：候选池的计数与重新出现、会话记录的摘要与定位、回放 runner 的固定路径安装")

	root.AddCommand(d.installCommand())

	pool := registry.Group("pool", "候选池（docs/records/retro-candidates/）")
	pool.AddCommand(
		leaf("count <pool-dir>", "数候选池里每个候选出现过几次（不同会话数，已推翻的不算），到 3 次算过线；文件格式不对就列出来（退出 2）", func(cmd *cobra.Command, args []string) error {
			if len(args) == 0 || args[0] == "" {
				return fmt.Errorf("usage: dyna retro pool count <pool-dir>")
			}
			dir := args[0]
			entries, err := os.ReadDir(dir)
			if err != nil {
				return fmt.Errorf("retro-pool-count: cannot read %s: %v", dir, err)
			}
			var names []string
			for _, e := range entries {
				if strings.HasSuffix(e.Name(), ".md") && e.Name() != "index.md" {
					names = append(names, e.Name())
				}
			}
			sort.Strings(names)
			var files []PoolFile
			for _, n := range names {
				b, err := os.ReadFile(filepath.Join(dir, n))
				if err != nil {
					return fmt.Errorf("retro-pool-count: cannot read %s: %v", dir, err)
				}
				files = append(files, PoolFile{File: n, MD: string(b)})
			}
			res := CountPool(files)
			if err := writeJSON(d.out(), res); err != nil {
				return err
			}
			if len(res.Problems) > 0 {
				return &nexterr.Exit{Code: 2}
			}
			return nil
		}),
		leaf("reopened <candidate-file>", "被驳回的候选自上次驳回以来有没有新的会话出现：从 git 历史答（候选文件要在 git 仓库里）；答不了（状态不是驳回、驳回还没提交）退出 2", func(cmd *cobra.Command, args []string) error {
			if len(args) == 0 || args[0] == "" {
				return fmt.Errorf("usage: dyna retro pool reopened <candidate-file>")
			}
			res, err := CheckReopened(args[0], func(p string) (string, error) {
				b, err := os.ReadFile(p)
				return string(b), err
			})
			var un Unanswerable
			switch {
			case errors.As(err, &un):
				return &nexterr.Exit{Code: 2, Msg: "retro-pool-reopened: " + un.Error()}
			case err != nil && os.IsNotExist(err):
				return &nexterr.Exit{Code: 2, Msg: "retro-pool-reopened: " + err.Error()}
			case err != nil:
				return err
			}
			return writeJSON(d.out(), res)
		}),
	)
	root.AddCommand(pool)

	digest := leaf("digest <transcript.jsonl>", "把一份会话记录压成人的发言，每条带上它前一条 AI 回复的结论（不含工具调用、工具输出、压缩摘要）", func(cmd *cobra.Command, args []string) error {
		if len(args) == 0 || args[0] == "" {
			return fmt.Errorf("usage: dyna retro digest <transcript.jsonl> [--ai-max N]")
		}
		b, err := os.ReadFile(args[0])
		if err != nil {
			return fmt.Errorf("读不到会话记录「%s」：%v", args[0], err)
		}
		max := AIMaxDefault
		if v, _ := cmd.Flags().GetString("ai-max"); v != "" {
			n, err := strconv.ParseFloat(v, 64)
			if err != nil {
				return fmt.Errorf("--ai-max 要是数字：%s", v)
			}
			max = int(n)
		}
		fmt.Fprintln(d.out(), Render(Squeeze(ParseJSONL(string(b)), max)))
		return nil
	})
	digest.Flags().String("ai-max", "", fmt.Sprintf("每条保留 AI 结论的最后多少字（默认 %d）", AIMaxDefault))

	locate := leaf("locate", "找出这场会话自己的记录文件：先按会话 id，再按开场第一句人话里的标记；只认唯一的一份，零份或多份退出 2", func(cmd *cobra.Command, args []string) error {
		q := LocateQuery{Home: d.homeDir(), Marker: "", SessionID: d.env("CLAUDE_CODE_SESSION_ID")}
		if cmd.Flags().Changed("session") {
			q.SessionID, _ = cmd.Flags().GetString("session")
		}
		q.Marker, _ = cmd.Flags().GetString("marker")
		q.Dir, _ = cmd.Flags().GetString("dir")
		found := Locate(q)
		if found.OK {
			fmt.Fprintln(d.out(), found.Path)
			return nil
		}
		return &nexterr.Exit{Code: 2, Msg: found.Why()}
	})
	locate.Flags().String("session", "", "会话 id（记录文件名去掉 .jsonl）；不给就用环境变量 CLAUDE_CODE_SESSION_ID")
	locate.Flags().String("marker", "", "开场第一句人话里的一段话；没有 id 或按 id 找不到时用")
	locate.Flags().String("dir", "", "只在这一个目录里找（不给就找 ~/.claude/projects 下所有项目目录）")

	root.AddCommand(digest, locate)
	return root
}

func (d Deps) installCommand() *cobra.Command {
	use := "usage: dyna retro install [--dest <dir>]"
	c := leaf("install", "把回放 runner 装到固定路径（默认 ~/.idea-loop/bin），打印要加进权限设置的允许规则；不改任何权限设置", func(cmd *cobra.Command, args []string) error {
		dest, _ := cmd.Flags().GetString("dest")
		home := d.homeDir()
		if dest == "" {
			dest = filepath.Join(home, ".idea-loop", "bin")
		} else if abs, err := filepath.Abs(dest); err == nil {
			dest = abs
		}
		root := d.env(EnvPluginRoot)
		if root == "" {
			return fmt.Errorf("retro install 要从插件目录取 runner，环境变量 %s 没设：经插件自带的 dyna 调用，或把它设成插件目录", EnvPluginRoot)
		}
		entry, err := Install(dest, root)
		if err != nil {
			return err
		}
		fmt.Fprintf(d.out(), "runner 已装到 %s\n", entry)
		fmt.Fprintf(d.out(), "允许规则（请你自己加进运行环境的 permissions.allow，位置见 idea-loop:runtime 的『装与设置』，这个脚本不改权限设置）：\n  %s\n", AllowRule(dest, home))
		return nil
	})
	// a bad argument is a usage error with exit 2, as the old script ended
	c.Args = func(cmd *cobra.Command, args []string) error {
		if len(args) > 0 {
			return &nexterr.Exit{Code: 2, Msg: use}
		}
		return nil
	}
	c.SetFlagErrorFunc(func(cmd *cobra.Command, err error) error { return &nexterr.Exit{Code: 2, Msg: use} })
	c.Flags().String("dest", "", "装到哪个目录（默认 ~/.idea-loop/bin）")
	return c
}
