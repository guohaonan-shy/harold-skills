package research

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"

	"github.com/spf13/cobra"

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
		Use:           "submit <index.html>",
		Short:         "校验调研页的骨架：章节齐、顺序对、每步截图有说明且能点开、图都是落图目录内的相对路径；不对就说出哪一条（退出 2），校验过了才算交回",
		Args:          cobra.ArbitraryArgs,
		SilenceUsage:  true,
		SilenceErrors: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			if len(args) == 0 || args[0] == "" {
				return fmt.Errorf("usage: dyna research submit <index.html> [--json]")
			}
			file := args[0]
			html, err := os.ReadFile(file)
			if err != nil {
				return fmt.Errorf("research-check: cannot read %s: %v", file, err)
			}
			base := filepath.Dir(file)
			res := Check(string(html), func(rel string) bool {
				_, err := os.Stat(filepath.Join(base, rel))
				return err == nil
			})
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
		},
	}
	submit.Flags().Bool("json", false, "输出 JSON（valid、errors、sources）")
	registry.Mark(submit, registry.CallerSession, "")
	root.AddCommand(submit)
	return root
}
