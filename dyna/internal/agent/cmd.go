// Package agent is the `agent` module: it wraps the Codex and Claude command lines. `codex exec` and `claude -p`
// are started directly as child processes with their input closed and a time limit, and when they exit or run out
// of time the whole process tree they started is ended with them (see package proctree). The Codex plugin's
// companion script, which leaves a resident broker behind on every call, is not used.
package agent

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/spf13/cobra"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/home"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/nexterr"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/registry"
)

// EnvPluginRoot is the plugin's directory, set by the plugin's launcher; the prompt templates are read from it.
const EnvPluginRoot = "IDEA_LOOP_PLUGIN_ROOT"

// Exit codes beyond 0 (done) and 1 (failed).
const (
	// ExitTimeout is "ran out of time", the code timeout(1) uses.
	ExitTimeout = 124
	// ExitInterrupted is dyna itself being stopped while the child ran.
	ExitInterrupted = 130
	// ExitStopped is a `claude run --stop-on-escalation` run stopped because the session started an agent or opened a browser.
	ExitStopped = 3
)

// Deps is what the commands reach outside the process through.
type Deps struct {
	Env    home.Env
	Stdout io.Writer
	Stderr io.Writer
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

// Command is the `agent` module.
func Command(d Deps) *cobra.Command {
	root := registry.Group("agent", "包装 Codex 与 Claude 命令行：起子进程、关掉 stdin、带超时，退出或超时时连子进程树一起结束")

	codex := registry.Group("codex", "Codex：填 prompt 模板、只读跑一轮、生图")
	codex.AddCommand(promptCommand(d), codexRunCommand(d), codexImageCommand(d))

	claude := registry.Group("claude", "Claude：无头跑一个会话，读它的事件流")
	claude.AddCommand(claudeRunCommand(d))

	root.AddCommand(codex, claude)
	return root
}

func leaf(use, short string, next string, args cobra.PositionalArgs, run func(cmd *cobra.Command, args []string) error) *cobra.Command {
	c := &cobra.Command{Use: use, Short: short, Args: args, SilenceUsage: true, SilenceErrors: true, RunE: run}
	registry.Mark(c, registry.CallerSession, next)
	return c
}

// promptCommand fills one of pr-review's fixed Codex prompt templates.
func promptCommand(d Deps) *cobra.Command {
	return leaf("prompt <spec|standards> <out-file> [key=value...]",
		"把 pr-review 固定的 Codex prompt 模板（Spec 轴或 Standards 轴）填好写进 <out-file>：模板与 review-standards 的路径从插件目录读，用户规则取 ~/.claude/CLAUDE.md（不在就填「无」），key=value 是这一轮不一样的引用；没填的占位或模板里没有的 key 都拒绝（退出 1）",
		"dyna agent codex prompt --help",
		cobra.ArbitraryArgs,
		func(cmd *cobra.Command, args []string) error {
			if len(args) < 2 {
				return fmt.Errorf("用法：dyna agent codex prompt <spec|standards> <out-file> key=value...")
			}
			root := d.env()(EnvPluginRoot)
			if root == "" {
				return nexterr.New("经插件的 bin/dyna 调用，或设 "+EnvPluginRoot+"=<插件目录> 再重跑", "没设 %s：prompt 模板放在插件目录里，读不到", EnvPluginRoot)
			}
			if err := FillPrompt(root, userHomeDir(d.env()), args[0], args[1], args[2:]); err != nil {
				return err
			}
			fmt.Fprintln(d.out(), args[1])
			return nil
		})
}

// userHomeDir is the user's home directory as the session sees it; "" when there is none (then there are no user rules).
func userHomeDir(env home.Env) string {
	if h := env("HOME"); h != "" {
		return h
	}
	h, _ := os.UserHomeDir()
	return h
}

// parseTimeout reads --timeout ("20m", "90s", "1h30m").
func parseTimeout(s string) (time.Duration, error) {
	t, err := time.ParseDuration(s)
	if err != nil || t <= 0 {
		return 0, fmt.Errorf("--timeout 要写成时长，如 20m、90s、1h30m；收到「%s」", s)
	}
	return t, nil
}

// promptOf reads the prompt from --prompt or --prompt-file (exactly one).
func promptOf(cmd *cobra.Command) (string, error) {
	text, _ := cmd.Flags().GetString("prompt")
	file, _ := cmd.Flags().GetString("prompt-file")
	switch {
	case text != "" && file != "":
		return "", fmt.Errorf("--prompt 和 --prompt-file 只能给一个")
	case file != "":
		b, err := os.ReadFile(file)
		if err != nil {
			return "", fmt.Errorf("读不到 --prompt-file：%v", err)
		}
		if strings.TrimSpace(string(b)) == "" {
			return "", fmt.Errorf("--prompt-file %s 是空的", file)
		}
		return string(b), nil
	case strings.TrimSpace(text) != "":
		return text, nil
	}
	return "", fmt.Errorf("要给 --prompt-file <文件> 或 --prompt <文字>")
}

// workDir is --cwd made absolute ("" means where dyna runs).
func workDir(cmd *cobra.Command) (string, error) {
	dir, _ := cmd.Flags().GetString("cwd")
	if dir == "" {
		return os.Getwd()
	}
	abs, err := filepath.Abs(dir)
	if err != nil {
		return "", err
	}
	if st, err := os.Stat(abs); err != nil || !st.IsDir() {
		return "", fmt.Errorf("--cwd %s 不是目录", dir)
	}
	return abs, nil
}

// tail is the last n lines of the text, for an error that points at a log.
func tail(text string, n int) string {
	lines := strings.Split(strings.TrimRight(text, "\n"), "\n")
	if len(lines) > n {
		lines = lines[len(lines)-n:]
	}
	return strings.Join(lines, "\n")
}
