// Package testcmd is the `test` module: commands only tests, REVIEW.md and DEVELOPMENT.md call, for the people who
// change the plugin.
//
//   - `fixture design-archive` writes a small fictional design archive into a directory.
//   - `skill-doc` checks one skill: its SKILL.md body is short enough and every section other documents point at exists.
//   - `run` runs the plugin's own *.test.mjs files, all of them or the ones whose name contains a word.
package testcmd

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"

	"github.com/spf13/cobra"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/design/fixture"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/home"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/nexterr"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/registry"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/skilldoc"
)

// envPluginRoot is the plugin's directory, which the plugin's own small script sets (the same name app uses).
const envPluginRoot = "IDEA_LOOP_PLUGIN_ROOT"

// Runner runs one process in dir with the given streams and returns its exit code.
type Runner func(ctx context.Context, dir, name string, args []string, stdout, stderr io.Writer) (int, error)

// Deps is what the commands reach outside the process through; a field left nil is the real one.
type Deps struct {
	Env home.Env
	// Cwd is the directory the session runs in; empty means the process's.
	Cwd string
	// Run starts the test runner (node).
	Run Runner
}

func (d Deps) env(k string) string {
	if d.Env == nil {
		return os.Getenv(k)
	}
	return d.Env(k)
}

func (d Deps) cwd() (string, error) {
	if d.Cwd != "" {
		return d.Cwd, nil
	}
	return os.Getwd()
}

func (d Deps) run() Runner {
	if d.Run != nil {
		return d.Run
	}
	return execRunner
}

func execRunner(ctx context.Context, dir, name string, args []string, stdout, stderr io.Writer) (int, error) {
	c := exec.CommandContext(ctx, name, args...)
	c.Dir, c.Stdout, c.Stderr = dir, stdout, stderr
	err := c.Run()
	var ee *exec.ExitError
	switch {
	case err == nil:
		return 0, nil
	case errors.As(err, &ee):
		return ee.ExitCode(), nil
	default:
		return -1, err
	}
}

// Command is the `test` module with the real outside world.
func Command() *cobra.Command { return CommandWith(Deps{}) }

// CommandWith is the `test` module over the given dependencies.
func CommandWith(d Deps) *cobra.Command {
	root := registry.Group("test", "只给测试和改插件的人调的命令")
	fix := registry.Group("fixture", "写出测试用的虚构数据到给定目录")
	fix.AddCommand(designArchive())
	root.AddCommand(fix, skillDoc(d), runTests(d))
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

// pluginRootFrom is the nearest directory at or above start that is a plugin (has .claude-plugin/plugin.json).
// With strict false, a directory with an idea-loop/ plugin folder in it (the marketplace repo's root) counts too.
func pluginRootFrom(start string, strict bool) string {
	for dir := start; ; dir = filepath.Dir(dir) {
		if isFile(filepath.Join(dir, ".claude-plugin", "plugin.json")) {
			return dir
		}
		if sub := filepath.Join(dir, "idea-loop"); !strict && isFile(filepath.Join(sub, ".claude-plugin", "plugin.json")) {
			return sub
		}
		if filepath.Dir(dir) == dir {
			return ""
		}
	}
}

func isFile(p string) bool {
	st, err := os.Stat(p)
	return err == nil && !st.IsDir()
}

func skillDoc(d Deps) *cobra.Command {
	c := &cobra.Command{
		Use:           "skill-doc <skill目录> [--plugin <插件根>] [--min-pointers <n>]",
		Short:         "查一份 skill：SKILL.md 主体（去掉 frontmatter）不到 5000 字（UTF-8 字符），插件里每处指向它的小节（idea-loop:<skill> 的「某节」）都是它的 SKILL.md 或 references/ 的标题；不对退出 1",
		Args:          cobra.ArbitraryArgs,
		SilenceUsage:  true,
		SilenceErrors: true,
	}
	c.Flags().String("plugin", "", "插件根目录；不给就从 skill 目录往上找带 .claude-plugin/plugin.json 的那层，再不行用 "+envPluginRoot)
	c.Flags().Int("min-pointers", 0, "至少要查到这么多处指向；少了算红（防止写错 skill 名查了个空）")
	c.RunE = func(cmd *cobra.Command, args []string) error {
		if len(args) != 1 {
			return fmt.Errorf("usage: dyna test skill-doc <skill目录> [--plugin <插件根>] [--min-pointers <n>]")
		}
		skillDir, err := filepath.Abs(args[0])
		if err != nil {
			return err
		}
		if !isFile(filepath.Join(skillDir, "SKILL.md")) {
			return fmt.Errorf("「%s」里没有 SKILL.md：要给 skill 的目录", args[0])
		}
		root, _ := cmd.Flags().GetString("plugin")
		if root == "" {
			root = pluginRootFrom(skillDir, true)
		}
		if root == "" {
			root = d.env(envPluginRoot)
		}
		if root == "" {
			return fmt.Errorf("找不到插件根目录：「%s」往上没有 .claude-plugin/plugin.json，也没设 %s；用 --plugin 指一个", args[0], envPluginRoot)
		}
		if root, err = filepath.Abs(root); err != nil {
			return err
		}
		minPointers, _ := cmd.Flags().GetInt("min-pointers")
		name := filepath.Base(skillDir)

		n, err := skilldoc.BodyChars(skillDir)
		if err != nil {
			return err
		}
		ptr, err := skilldoc.DanglingSectionPointers(root, skillDir, name)
		if err != nil {
			return err
		}
		fmt.Fprintf(cmd.OutOrStdout(), "%s：SKILL.md 主体 %d 字（上限 %d），查了 %d 处指向它的小节\n", name, n, skilldoc.MaxBodyChars, ptr.Seen)

		var problems []string
		if n >= skilldoc.MaxBodyChars {
			problems = append(problems, fmt.Sprintf("SKILL.md 主体 %d 字，上限 %d：长的内容挪进 references/", n, skilldoc.MaxBodyChars))
		}
		if ptr.Seen < minPointers {
			problems = append(problems, fmt.Sprintf("只查到 %d 处指向 %s 的小节，要求至少 %d 处", ptr.Seen, name, minPointers))
		}
		if len(ptr.Bad) > 0 {
			problems = append(problems, fmt.Sprintf("这些 %s 的小节不存在（改了名或搬走了？）：\n%s", name, strings.Join(ptr.Bad, "\n")))
		}
		if len(problems) > 0 {
			return nexterr.Plain("%s", strings.Join(problems, "\n"))
		}
		return nil
	}
	registry.Mark(c, registry.CallerTest, "")
	return c
}

// testFiles are the plugin's own *.test.mjs under scripts/: all of them, and those whose name contains match, as
// paths relative to root.
func testFiles(root, match string) (all, picked []string, err error) {
	entries, err := os.ReadDir(filepath.Join(root, "scripts"))
	if err != nil {
		return nil, nil, fmt.Errorf("读不了 %s：%v", filepath.Join(root, "scripts"), err)
	}
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".test.mjs") {
			continue
		}
		rel := filepath.ToSlash(filepath.Join("scripts", e.Name()))
		all = append(all, rel)
		if strings.Contains(e.Name(), match) {
			picked = append(picked, rel)
		}
	}
	sort.Strings(picked)
	return all, picked, nil
}

func runTests(d Deps) *cobra.Command {
	c := &cobra.Command{
		Use:           "run [匹配] [--plugin <插件根>]",
		Short:         "跑插件自己的 scripts/*.test.mjs（node --test）；带匹配就只跑文件名含它的；结果和退出码照 node 的",
		Args:          cobra.ArbitraryArgs,
		SilenceUsage:  true,
		SilenceErrors: true,
	}
	c.Flags().String("plugin", "", "插件根目录；不给就从当前目录往上找（仓库根目录下的 idea-loop/ 也认），再不行用 "+envPluginRoot)
	c.RunE = func(cmd *cobra.Command, args []string) error {
		if len(args) > 1 {
			return fmt.Errorf("usage: dyna test run [匹配] [--plugin <插件根>]（匹配只给一个词）")
		}
		match := ""
		if len(args) == 1 {
			match = args[0]
		}
		root, _ := cmd.Flags().GetString("plugin")
		if root == "" {
			cwd, err := d.cwd()
			if err != nil {
				return err
			}
			root = pluginRootFrom(cwd, false)
		}
		if root == "" {
			root = d.env(envPluginRoot)
		}
		if root == "" {
			return fmt.Errorf("找不到插件根目录：当前目录往上没有 .claude-plugin/plugin.json，也没设 %s；用 --plugin 指一个", envPluginRoot)
		}
		root, err := filepath.Abs(root)
		if err != nil {
			return err
		}
		all, picked, err := testFiles(root, match)
		if err != nil {
			return err
		}
		if len(picked) == 0 {
			if match == "" {
				return nexterr.Plain("%s/scripts 下没有 *.test.mjs", root)
			}
			return nexterr.Plain("没有名字含「%s」的测试文件（%s/scripts 下共 %d 个）", match, root, len(all))
		}
		if match == "" {
			fmt.Fprintf(cmd.ErrOrStderr(), "dyna test run：跑 %s 的全部 %d 个测试文件\n", root, len(picked))
		} else {
			fmt.Fprintf(cmd.ErrOrStderr(), "dyna test run：跑 %s 里名字含「%s」的 %d 个测试文件\n", root, match, len(picked))
		}
		ctx := cmd.Context()
		if ctx == nil {
			ctx = context.Background()
		}
		code, err := d.run()(ctx, root, "node", append([]string{"--test"}, picked...), cmd.OutOrStdout(), cmd.ErrOrStderr())
		if err != nil {
			return fmt.Errorf("起不来 node：%v（跑插件的测试要装 Node）", err)
		}
		if code != 0 {
			return &nexterr.Exit{Code: code}
		}
		return nil
	}
	registry.Mark(c, registry.CallerTest, "")
	return c
}
