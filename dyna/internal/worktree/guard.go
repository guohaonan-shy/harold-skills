package worktree

import (
	"encoding/json"
	"io"
	"regexp"

	"github.com/spf13/cobra"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/nexterr"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/registry"
)

// A git call with any options before its subcommand (`-C <dir>`, `-c k=v`, `--git-dir <dir>`, `--no-pager`),
// then `worktree remove`.
const (
	word    = `(?:"[^"]*"|'[^']*'|\S+)`
	gitOpts = `(?:\s+(?:-[Cc]\s+` + word + `|--(?:git-dir|work-tree|namespace)\s+` + word + `|--[\w-]+(?:=` + word + `)?))*`
)

var (
	handRemove = regexp.MustCompile(`(?:^|\s)git` + gitOpts + `\s+worktree\s+remove(?:\s|$)`)
	cmdSplit   = regexp.MustCompile(`&&|\|\||[;|\n]`)
)

// HandRemovesWorktree reports whether a shell command line runs `git worktree remove`.
func HandRemovesWorktree(command string) bool {
	for _, seg := range cmdSplit.Split(command, -1) {
		if handRemove.MatchString(seg) {
			return true
		}
	}
	return false
}

// GuardMessage is what a blocked command is told.
const GuardMessage = "不要手写 git worktree remove：它不解锁（上了锁的删不掉）、也不删分支。用 `dyna worktree remove <路径>`（保留分支加 --keep-branch；里面有没提交的改动会拒绝，确定不要了加 --force；`--help` 看参数）。"

func guardCommand(d Deps) *cobra.Command {
	c := leaf("guard [command]", "拦下手写的 git worktree remove，提示改用 dyna worktree remove；别的 git worktree 子命令放行",
		registry.CallerHook, "dyna worktree remove <路径>", func(cmd *cobra.Command, args []string) error {
			hook, _ := cmd.Flags().GetBool("hook")
			command := ""
			if len(args) > 0 {
				command = args[0]
			}
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
			if !HandRemovesWorktree(command) {
				return nil
			}
			if hook {
				return &nexterr.Exit{Code: 2, Msg: GuardMessage}
			}
			return nexterr.Plain("%s", GuardMessage)
		})
	c.Args = cobra.MaximumNArgs(1)
	c.Flags().Bool("hook", false, "从 stdin 读 PreToolUse 事件；被拦时退出码 2、理由写到 stderr")
	return c
}
