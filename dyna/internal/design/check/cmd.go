package check

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/spf13/cobra"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/frontmatter"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/nexterr"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/registry"
)

const usage = "用法：dyna design archive check <repo-root> [--delta <spec-slug>] [--no-used-by] [--workspaces <前缀,前缀>] [--json]"

// usageError is a wrong command line: it ends the process with exit code 2.
func usageError(msg string) error {
	if msg == "" {
		msg = usage
	}
	return &nexterr.Exit{Code: 2, Msg: msg}
}

// Command is `check <repo-root>`: validate the archive and print what is wrong. Exit 0 = no violations,
// 1 = violations, 2 = usage error or the directory cannot be read.
func Command() *cobra.Command {
	c := &cobra.Command{
		Use:           "check <repo-root>",
		Short:         "校验设计档案的八条规则（--delta 把某个需求的 delta/ 叠在 prod/ 上再判；--json 机器可读）",
		Args:          cobra.ArbitraryArgs,
		SilenceUsage:  true,
		SilenceErrors: true,
	}
	c.Flags().String("delta", "", "把这个 spec 的 tmp/<spec-slug>/delta/ 叠在 prod/ 上再判")
	c.Flags().Bool("no-used-by", false, "跳过 usedBy 那一半（归档命令重新生成 usedBy 之前判 delta/ 用）")
	c.Flags().String("workspaces", "", "组件文件名的工作区前缀，逗号分隔（prod/index.md 还没有时用）")
	c.Flags().Bool("json", false, "输出 JSON")
	c.SetFlagErrorFunc(func(_ *cobra.Command, err error) error { return usageError(usage + "\n" + err.Error()) })
	registry.Mark(c, registry.CallerSession, "dyna design archive check <repo-root> --json")
	c.RunE = runCheck
	return c
}

func runCheck(cmd *cobra.Command, args []string) error {
	out := cmd.OutOrStdout()
	flags := cmd.Flags()
	asJSON, _ := flags.GetBool("json")
	noUsedBy, _ := flags.GetBool("no-used-by")
	delta, _ := flags.GetString("delta")
	wsRaw, _ := flags.GetString("workspaces")
	if len(args) != 1 || (flags.Changed("delta") && delta == "") || (flags.Changed("workspaces") && (wsRaw == "" || strings.HasPrefix(wsRaw, "--"))) {
		return usageError("")
	}
	opts := Options{Delta: delta, UsedBy: !noUsedBy}
	if wsRaw != "" {
		for _, p := range strings.Split(wsRaw, ",") {
			opts.Workspaces = append(opts.Workspaces, strings.TrimSpace(p))
		}
		if !ParseWorkspacePrefixes(opts.Workspaces) {
			return usageError(fmt.Sprintf("--workspaces 要是小写 kebab-case 的前缀、逗号分隔（如 mkt,app），现在是「%s」", wsRaw))
		}
	}
	root, err := filepath.Abs(args[0])
	if err != nil {
		return usageError(err.Error())
	}
	if st, err := os.Stat(filepath.Join(root, "docs")); err != nil || st == nil {
		return usageError(fmt.Sprintf("%s 下没有 docs/：这不是目标仓库的根", root))
	}
	res, err := Run(root, opts)
	if err != nil {
		return usageError(err.Error())
	}
	if asJSON {
		m := frontmatter.NewMap()
		m.Set("ok", len(res.Violations) == 0)
		m.Set("violations", ViolationsJSON(res.Violations))
		notes := make([]any, len(res.Notes))
		for i, n := range res.Notes {
			notes[i] = n
		}
		m.Set("notes", notes)
		m.Set("objects", len(res.Archive.Objects))
		text, err := frontmatter.JSON(m, 2)
		if err != nil {
			return err
		}
		fmt.Fprintln(out, text)
	} else {
		for _, n := range res.Notes {
			fmt.Fprintf(out, "提示：%s\n", n)
		}
		for _, x := range res.Violations {
			fmt.Fprintln(out, Format(x))
		}
		if len(res.Violations) > 0 {
			fmt.Fprintf(out, "%d 条违规\n", len(res.Violations))
		} else {
			fmt.Fprintf(out, "通过（%d 个对象）\n", len(res.Archive.Objects))
		}
	}
	if len(res.Violations) > 0 {
		return &nexterr.Exit{Code: 1}
	}
	return nil
}
