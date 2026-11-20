package research

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/spf13/cobra"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/design/jsx"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/nexterr"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/registry"
)

// Deps is what the command reaches outside the process through.
type Deps struct {
	Stdout io.Writer
}

func (d Deps) out() io.Writer {
	if d.Stdout == nil {
		return os.Stdout
	}
	return d.Stdout
}

// Command is the `research` module: what a research agent hands back is checked before it counts as handed back.
func Command(d Deps) *cobra.Command {
	root := registry.Group("research", "调研：交回调研页前的校验")
	submit := &cobra.Command{
		Use:           "submit <index.html> | submit --light <research-light.json> --opinions=1,2,3 [--ledger=1.1,1.2]",
		Short:         "校验调研页的骨架：章节齐、顺序对、每步截图有说明且能点开、图都是落图目录内的相对路径；--light 校验轻用法交回的文件（每条评委意见有用户路径、配图、新的设计意图）；不对就说出哪一条（退出 2），校验过了才算交回",
		Args:          cobra.ArbitraryArgs,
		SilenceUsage:  true,
		SilenceErrors: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			if len(args) == 0 || args[0] == "" {
				return fmt.Errorf("usage: dyna research submit <index.html> [--json]\n       dyna research submit --light <research-light.json> --opinions=1,2,3 [--ledger=1.1,1.2] [--json]")
			}
			file := args[0]
			text, err := os.ReadFile(file)
			if err != nil {
				return fmt.Errorf("research-check: cannot read %s: %v", file, err)
			}
			base := filepath.Dir(file)
			fileExists := func(rel string) bool {
				_, err := os.Stat(filepath.Join(base, rel))
				return err == nil
			}
			var res any
			var valid bool
			var report string
			if light, _ := cmd.Flags().GetBool("light"); light {
				raw, _ := cmd.Flags().GetString("opinions")
				opinions := splitList(raw)
				if len(opinions) == 0 {
					return fmt.Errorf("research-check: --light needs --opinions=<the judge opinion numbers of this round>, e.g. --opinions=1,2,3")
				}
				data, err := jsx.ParseJSON(text)
				if err != nil {
					return fmt.Errorf("research-check: %s is not valid JSON: %v", file, err)
				}
				var ledger []string
				if cmd.Flags().Changed("ledger") {
					l, _ := cmd.Flags().GetString("ledger")
					ledger = append([]string{}, splitList(l)...)
				}
				r := CheckLight(data, LightContext{FileExists: fileExists, Opinions: opinions, Ledger: ledger})
				res, valid, report = r, r.Valid, LightReport(r, file)
			} else {
				r := Check(string(text), fileExists)
				res, valid, report = r, r.Valid, Report(r, file)
			}
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
				fmt.Fprintln(d.out(), report)
			}
			if !valid {
				return &nexterr.Exit{Code: 2}
			}
			return nil
		},
	}
	submit.Flags().Bool("json", false, "输出 JSON（valid、errors、sources；--light 时是 valid、errors、items）")
	submit.Flags().Bool("light", false, "校验轻用法交回的文件：位置参数是 research-light.json，要带 --opinions")
	submit.Flags().String("opinions", "", "--light：这一轮交给调研员的评委意见编号，逗号分隔，如 1,2,3")
	submit.Flags().String("ledger", "", "--light：这一轮交给调研员的 ledger 编号，逗号分隔，如 1.1,1.2；给了，推翻就只能指其中一条")
	registry.Mark(submit, registry.CallerSession, "")
	root.AddCommand(submit)
	return root
}

// splitList is a comma-separated flag value, each item trimmed, empty items dropped.
func splitList(v string) []string {
	var out []string
	for _, x := range strings.Split(v, ",") {
		if x = strings.TrimSpace(x); x != "" {
			out = append(out, x)
		}
	}
	return out
}
