// Package testcmd is the `test` module: commands only tests, REVIEW.md and DEVELOPMENT.md call, for the people who
// change the plugin. `fixture design-archive` writes a small fictional design archive into a directory.
package testcmd

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/spf13/cobra"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/design/fixture"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/registry"
)

// Command is the `test` module.
func Command() *cobra.Command {
	root := registry.Group("test", "只给测试和改插件的人调的命令")
	fix := registry.Group("fixture", "写出测试用的虚构数据到给定目录")
	fix.AddCommand(designArchive())
	root.AddCommand(fix)
	return root
}

func designArchive() *cobra.Command {
	c := &cobra.Command{
		Use:           "design-archive <目录>",
		Short:         "把一份虚构的两页设计档案（菜谱 App）写进一个空目录；写完 dyna design archive check <目录> 退出 0",
		Args:          cobra.ArbitraryArgs,
		SilenceUsage:  true,
		SilenceErrors: true,
	}
	c.RunE = func(cmd *cobra.Command, args []string) error {
		if len(args) != 1 {
			return fmt.Errorf("usage: dyna test fixture design-archive <空目录>")
		}
		dir, err := filepath.Abs(args[0])
		if err != nil {
			return err
		}
		entries, err := os.ReadDir(dir)
		if err != nil && !os.IsNotExist(err) {
			return fmt.Errorf("读不了目录「%s」：%v", args[0], err)
		}
		if len(entries) > 0 {
			return fmt.Errorf("「%s」不是空目录：夹具只写进空目录，免得盖掉别的东西", args[0])
		}
		files := fixture.Compliant()
		if _, err := fixture.WriteRepo(files, dir); err != nil {
			return err
		}
		fmt.Fprintf(cmd.OutOrStdout(), "写出 %d 个文件到 %s\n", len(files), dir)
		return nil
	}
	registry.Mark(c, registry.CallerTest, "")
	return c
}
