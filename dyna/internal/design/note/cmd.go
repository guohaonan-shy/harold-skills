package note

import (
	"fmt"
	"os"
	"strings"

	"github.com/spf13/cobra"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/miniyaml"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/nexterr"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/registry"
)

const usage = "用法：dyna design note submit <direction-note.md> [--json]"

// Command is `design note submit <direction-note.md>`: the note counts as handed back only when it passes. Exit 0 =
// valid, 2 = the shape is wrong (every wrong thing is listed), 1 = no file or it cannot be read.
func Command() *cobra.Command {
	c := &cobra.Command{
		Use:           "submit <direction-note.md>",
		Short:         "交回方向说明：校验七节齐全、同一层级、按顺序、有正文，选中变种的构成清单六项全、每项标来源；不合格退出 2 并逐条说哪一条",
		Args:          cobra.ArbitraryArgs,
		SilenceUsage:  true,
		SilenceErrors: true,
	}
	c.Flags().Bool("json", false, "输出 JSON")
	c.SetFlagErrorFunc(func(_ *cobra.Command, err error) error { return &nexterr.Exit{Code: 1, Msg: usage} })
	registry.Mark(c, registry.CallerSession, "dyna design note submit <direction-note.md>")
	c.RunE = func(cmd *cobra.Command, args []string) error {
		asJSON, _ := cmd.Flags().GetBool("json")
		if len(args) == 0 {
			return &nexterr.Exit{Code: 1, Msg: usage}
		}
		file := args[0]
		raw, err := os.ReadFile(file)
		if err != nil {
			reason := err.Error()
			if pe, ok := err.(*os.PathError); ok {
				reason = pe.Err.Error()
			}
			return &nexterr.Exit{Code: 1, Msg: fmt.Sprintf("design note submit: cannot read %s: %s", file, reason)}
		}
		res := Check(string(raw))
		out := cmd.OutOrStdout()
		if asJSON {
			fmt.Fprintln(out, resultJSON(res))
		} else {
			fmt.Fprintln(out, Report(res, file))
		}
		if !res.Valid {
			return &nexterr.Exit{Code: 2}
		}
		return nil
	}
	return c
}

func resultJSON(r Result) string {
	m := miniyaml.NewMap()
	m.Set("valid", r.Valid)
	errs := make([]any, len(r.Errors))
	for i, e := range r.Errors {
		errs[i] = e
	}
	m.Set("errors", errs)
	missing := make([]any, len(r.Missing))
	for i, s := range r.Missing {
		missing[i] = s
	}
	m.Set("missing", missing)
	if r.Level == 0 {
		m.Set("level", nil)
	} else {
		m.Set("level", float64(r.Level))
	}
	s, _ := miniyaml.JSON(m, 2)
	return strings.TrimRight(s, "\n")
}
