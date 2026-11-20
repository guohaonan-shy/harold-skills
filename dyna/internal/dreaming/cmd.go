package dreaming

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"os"

	"github.com/spf13/cobra"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/nexterr"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/registry"
)

// Deps is what the commands reach outside the process through.
type Deps struct {
	Stdout io.Writer
}

func (d Deps) out() io.Writer {
	if d.Stdout == nil {
		return os.Stdout
	}
	return d.Stdout
}

func leaf(use, short string, run func(cmd *cobra.Command, args []string) error) *cobra.Command {
	c := &cobra.Command{Use: use, Short: short, Args: cobra.ArbitraryArgs, SilenceUsage: true, SilenceErrors: true, RunE: run}
	registry.Mark(c, registry.CallerSession, "")
	return c
}

// read reads the table named by the first argument.
func read(args []string, use string) (file, markdown string, err error) {
	if len(args) == 0 || args[0] == "" {
		return "", "", fmt.Errorf("usage: dyna dreaming table %s", use)
	}
	b, err := os.ReadFile(args[0])
	if err != nil {
		return "", "", fmt.Errorf("proposal-table-check: cannot read %s: %v", args[0], err)
	}
	return args[0], string(b), nil
}

// report prints a result as the report or as JSON, and ends with exit 2 when the table is not valid.
func (d Deps) report(cmd *cobra.Command, res Result, file string) error {
	if asJSON, _ := cmd.Flags().GetBool("json"); asJSON {
		var b bytes.Buffer
		enc := json.NewEncoder(&b)
		enc.SetEscapeHTML(false)
		enc.SetIndent("", "  ")
		if err := enc.Encode(res); err != nil {
			return err
		}
		if _, err := d.out().Write(b.Bytes()); err != nil {
			return err
		}
	} else {
		fmt.Fprintln(d.out(), Report(res, file))
	}
	if !res.Valid {
		return &nexterr.Exit{Code: 2}
	}
	return nil
}

// Command is the `dreaming` module: the gate on the proposal table a dreaming run writes, and the split of the
// rows that go to the human.
func Command(d Deps) *cobra.Command {
	root := registry.Group("dreaming", "dreaming 对账：提议表的校验，和把要问人的行拆出来")
	table := registry.Group("table", "提议表")

	submit := leaf("submit <proposal-table.md>", "校验提议表的形状：行类型、每类的建议处置、证据里该有的图和原文旧新；不对就说出哪一条（退出 2），校验过了才算交回", func(cmd *cobra.Command, args []string) error {
		file, md, err := read(args, "submit <proposal-table.md> [--json]")
		if err != nil {
			return err
		}
		return d.report(cmd, Check(md), file)
	})
	submit.Flags().Bool("json", false, "输出 JSON（valid、empty、errors、counts）")

	split := leaf("split <proposal-table.md>", "把要问人的行拆成一张同样格式的小表：打印出来，或用 --out 写到文件；表本身不合格就照 submit 的样子报错（退出 2），不拆", func(cmd *cobra.Command, args []string) error {
		file, md, err := read(args, "split <proposal-table.md> [--out <小表文件>] [--json]")
		if err != nil {
			return err
		}
		out, _ := cmd.Flags().GetString("out")
		if cmd.Flags().Changed("out") && out == "" {
			return fmt.Errorf("usage: dyna dreaming table split <proposal-table.md> [--out <小表文件>] [--json]")
		}
		res := Check(md)
		if !res.Valid {
			return d.report(cmd, res, file)
		}
		small, count := SplitAskRows(md)
		switch {
		case count == 0:
			fmt.Fprintf(d.out(), "proposal-table: 无问人的行 ✓ (%s) —— 每一行都自动执行\n", file)
		case out != "":
			if err := os.WriteFile(out, []byte(small), 0o644); err != nil {
				return err
			}
			fmt.Fprintf(d.out(), "proposal-table: %d 行问人，小表写到 %s\n", count, out)
		default:
			fmt.Fprint(d.out(), small)
		}
		return nil
	})
	split.Flags().String("out", "", "小表写到这个文件；不给就打印到标准输出")
	split.Flags().Bool("json", false, "表不合格时输出 JSON（同 submit）")

	table.AddCommand(submit, split)
	root.AddCommand(table)
	return root
}
