package critic

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"

	"github.com/spf13/cobra"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/design/jsx"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/nexterr"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/registry"
)

const usage = "用法：dyna design critic round <critic.json> --context <context.json> [--json]   # context: { states, thoughts }"

// Command is `design critic round <critic.json> --context <context.json>`: the refine session calls it each round with
// the critic's JSON file and the context file { states, thoughts }. Exit 0 = a well-formed round (the score and the
// direction findings are printed), 2 = a malformed round (throw it away and run the critic again), 1 = no file, no
// context, a file that cannot be read, or a context that is not { states, thoughts }.
func Command() *cobra.Command {
	c := &cobra.Command{
		Use:           "round <critic.json> --context <context.json>",
		Short:         "评委这一轮：校验评委交回的形状（findings、对人思路的评估、分数），点出方向性意见；不判停，停不停由人定。--context 是 { states, thoughts }",
		Args:          cobra.ArbitraryArgs,
		SilenceUsage:  true,
		SilenceErrors: true,
	}
	c.Flags().String("context", "", "本轮的上下文文件 { states: 这一版的状态名, thoughts: 要评估的人的思路 id }")
	c.Flags().Bool("json", false, "输出 JSON（valid、errors、score、direction）")
	c.SetFlagErrorFunc(func(_ *cobra.Command, err error) error { return &nexterr.Exit{Code: 1, Msg: usage} })
	registry.Mark(c, registry.CallerSession, "dyna design critic round <critic.json> --context <context.json>")
	c.RunE = func(cmd *cobra.Command, args []string) error {
		asJSON, _ := cmd.Flags().GetBool("json")
		contextFile, _ := cmd.Flags().GetString("context")
		if len(args) == 0 || args[0] == "" || contextFile == "" {
			return &nexterr.Exit{Code: 1, Msg: usage}
		}
		file := args[0]
		round, err := readJSON(file)
		if err != nil {
			return err
		}
		context, err := readJSON(contextFile)
		if err != nil {
			return err
		}
		if _, cerrs := ValidateContext(context); len(cerrs) > 0 {
			return &nexterr.Exit{Code: 1, Msg: fmt.Sprintf("design critic round: bad context %s: %s", contextFile, joinSemi(cerrs))}
		}
		res, err := CheckRound(round, context)
		if err != nil {
			return &nexterr.Exit{Code: 1, Msg: err.Error()}
		}
		out := cmd.OutOrStdout()
		if asJSON {
			var b bytes.Buffer
			enc := json.NewEncoder(&b)
			enc.SetEscapeHTML(false)
			enc.SetIndent("", "  ")
			if err := enc.Encode(res); err != nil {
				return err
			}
			fmt.Fprint(out, b.String())
		} else {
			fmt.Fprintln(out, Render(res, file))
		}
		if !res.Valid {
			return &nexterr.Exit{Code: 2}
		}
		return nil
	}
	return c
}

func readJSON(path string) (any, error) {
	raw, err := os.ReadFile(path)
	var v any
	if err == nil {
		v, err = jsx.ParseJSON(raw)
	}
	if err != nil {
		reason := err.Error()
		if pe, ok := err.(*os.PathError); ok {
			reason = pe.Err.Error()
		}
		return nil, &nexterr.Exit{Code: 1, Msg: fmt.Sprintf("design critic round: cannot read %s: %s", path, reason)}
	}
	return v, nil
}

func joinSemi(xs []string) string {
	out := ""
	for i, x := range xs {
		if i > 0 {
			out += "; "
		}
		out += x
	}
	return out
}
