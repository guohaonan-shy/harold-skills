package spec

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strings"

	"github.com/spf13/cobra"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/ledger"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/nexterr"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/registry"
)

// Deps is what the commands reach outside the process through.
type Deps struct {
	Stdout io.Writer
	// Dir is where git runs; empty is the directory dyna was started in.
	Dir string
	// Home is where `dyna home` keeps the personal repository (the package that knows it imports this one, so the
	// caller says it); nil means there is none, and only plugin roots count for skill-lint.
	Home func() string
}

func (d Deps) homeDir() string {
	if d.Home == nil {
		return ""
	}
	return d.Home()
}

func (d Deps) out() io.Writer {
	if d.Stdout == nil {
		return os.Stdout
	}
	return d.Stdout
}

func (d Deps) git(args ...string) (string, error) {
	cmd := exec.Command("git", args...)
	cmd.Dir = d.Dir
	var out, errb bytes.Buffer
	cmd.Stdout, cmd.Stderr = &out, &errb
	if err := cmd.Run(); err != nil {
		if msg := strings.TrimSpace(errb.String()); msg != "" {
			return "", fmt.Errorf("%s", msg)
		}
		return "", err
	}
	return out.String(), nil
}

// leaf makes a command of the module and marks who may call it.
func leaf(use, short, next string, run func(args []string) error) *cobra.Command {
	c := &cobra.Command{
		Use: use, Short: short, Args: cobra.ArbitraryArgs, SilenceUsage: true, SilenceErrors: true,
		RunE: func(cmd *cobra.Command, args []string) error { return run(args) },
	}
	registry.Mark(c, registry.CallerSession, next)
	return c
}

func usage(use string) error { return fmt.Errorf("usage: dyna spec %s", use) }

// Command is the `spec` module: what a spec says, and which tickets of a spec have landed.
func Command(d Deps) *cobra.Command {
	root := registry.Group("spec", "spec 的目录检查与索引，工单落地账本（从提交里的 Ticket 行读）、skill 改动的交回核对和 skill 文件的结构检查")

	root.AddCommand(
		leaf("index <docs>", "按 docs/spec/ 下的 spec 重写 docs/spec/index.md 的表，表外的字不动", "dyna spec check <docs>",
			func(args []string) error {
				if len(args) < 1 || args[0] == "" {
					return usage("index <docs>")
				}
				return Reindex(args[0])
			}),
		checkCommand(d),
		leaf("landed <base-ref>", "列出集成分支上自与 <base-ref> 分叉以来已落地的工单（JSON：提交和工单名，旧的在前）", "",
			func(args []string) error {
				if len(args) < 1 || args[0] == "" {
					return usage("landed <base-ref>")
				}
				base, err := d.git("merge-base", "HEAD", args[0])
				if err != nil {
					return err
				}
				raw, err := d.git("log", "--reverse", "--format="+ledger.LogFormat, strings.TrimSpace(base)+"..HEAD")
				if err != nil {
					return err
				}
				var buf bytes.Buffer
				enc := json.NewEncoder(&buf)
				enc.SetEscapeHTML(false)
				enc.SetIndent("", "  ")
				_ = enc.Encode(ledger.ParseLog(raw))
				_, err = d.out().Write(buf.Bytes())
				return err
			}),
		leaf("ticket-of <commit>", "打印一个提交属于哪张工单；提交里没有 Ticket 行时不打印，退出 2", "",
			func(args []string) error {
				if len(args) < 1 || args[0] == "" {
					return usage("ticket-of <commit>")
				}
				msg, err := d.git("log", "-1", "--format=%B", args[0])
				if err != nil {
					return err
				}
				ticket, ok := ledger.TicketOf(msg)
				if !ok {
					return &nexterr.Exit{Code: 2}
				}
				fmt.Fprintln(d.out(), ticket)
				return nil
			}),
		leaf("skill-edit <commit> <handback-file>", "核对交回文件有没有覆盖这个提交改到的 skill、agent 定义、skill 参考文件：写法规范行、杠杆行、验证行（含用例目录在提交里、结果是过或大用例待跑）；不够时每条原因一行，退出 2", "",
			func(args []string) error {
				if len(args) < 2 || args[0] == "" || args[1] == "" {
					return usage("skill-edit <commit> <handback-file>")
				}
				raw, err := d.git("diff-tree", "-r", "--root", "--no-commit-id", "--name-only", args[0])
				if err != nil {
					return err
				}
				var files []string
				for _, f := range strings.Split(raw, "\n") {
					if f != "" {
						files = append(files, f)
					}
				}
				handback, err := os.ReadFile(args[1])
				if err != nil {
					return fmt.Errorf("读不到交回文件「%s」：%v", args[1], err)
				}
				reasons := ledger.CheckSkillEdit(files, string(handback))
				if len(ledger.SkillEditFiles(files)) > 0 {
					tree, err := d.git("ls-tree", "-r", "--name-only", args[0])
					if err != nil {
						return err
					}
					reasons = append(reasons, ledger.CheckVerify(files, string(handback), strings.Split(tree, "\n"))...)
				}
				if len(reasons) == 0 {
					if n := len(ledger.SkillEditFiles(files)); n > 0 {
						fmt.Fprintf(d.out(), "ok: %d 个 skill、agent 定义或 skill 参考文件，写法规范、杠杆行、验证行都齐\n", n)
					} else {
						fmt.Fprintln(d.out(), "ok: 没改到 skill、agent 定义或 skill 参考文件")
					}
					return nil
				}
				for _, r := range reasons {
					fmt.Fprintf(d.out(), "- %s\n", r)
				}
				return &nexterr.Exit{Code: 2}
			}),
		skillLintCommand(d),
	)
	return root
}
