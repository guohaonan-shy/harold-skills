package critic

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/design/jsx"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/frontmatter"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/nexterr"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/registry"
)

const usage = "用法：dyna design critic round <round.json> [--json]   # { findings, score, history }"

// Command is `design critic round <round.json>`: the refine loop calls it each round with one JSON file
// { findings, score, history }. Exit 0 = a valid round (the stop decision is printed), 2 = an invalid round
// (start another critic), 1 = no file or it cannot be read.
func Command() *cobra.Command {
	c := &cobra.Command{
		Use:           "round <round.json>",
		Short:         "评委这一轮：校验 findings 的形状和分数，判停（方向 / 通过 / 瓶颈 / 继续）；输入文件是 { findings, score, history }",
		Args:          cobra.ArbitraryArgs,
		SilenceUsage:  true,
		SilenceErrors: true,
	}
	c.Flags().Bool("json", false, "输出 JSON")
	c.SetFlagErrorFunc(func(_ *cobra.Command, err error) error { return &nexterr.Exit{Code: 1, Msg: usage} })
	registry.Mark(c, registry.CallerSession, "dyna design critic round <round.json>")
	c.RunE = func(cmd *cobra.Command, args []string) error {
		asJSON, _ := cmd.Flags().GetBool("json")
		if len(args) == 0 {
			return &nexterr.Exit{Code: 1, Msg: usage}
		}
		file := args[0]
		raw, err := os.ReadFile(file)
		var round any
		if err == nil {
			round, err = jsx.ParseJSON(raw)
		}
		if err != nil {
			reason := err.Error()
			if pe, ok := err.(*os.PathError); ok {
				reason = pe.Err.Error()
			}
			return &nexterr.Exit{Code: 1, Msg: fmt.Sprintf("design critic round: cannot read %s: %s", file, reason)}
		}
		var findings, score, history any
		scorePresent := false
		if m, ok := round.(*frontmatter.Map); ok {
			findings = m.Get("findings")
			scorePresent = m.Has("score")
			score = m.Get("score")
			history = m.Get("history")
		}
		res := CheckRound(findings, scorePresent, score, history)
		out := cmd.OutOrStdout()
		if asJSON {
			fmt.Fprintln(out, resultJSON(res))
		} else {
			fmt.Fprintln(out, Render(res, file, score))
		}
		if !res.Valid {
			return &nexterr.Exit{Code: 2}
		}
		return nil
	}
	return c
}

func resultJSON(r Result) string {
	m := frontmatter.NewMap()
	m.Set("valid", r.Valid)
	errs := make([]any, len(r.Errors))
	for i, e := range r.Errors {
		errs[i] = e
	}
	m.Set("errors", errs)
	if r.Stop == "" {
		m.Set("stop", nil)
	} else {
		m.Set("stop", r.Stop)
	}
	s, _ := frontmatter.JSON(m, 2)
	return s
}
