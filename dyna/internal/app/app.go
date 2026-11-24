// Package app puts the modules' commands into one command tree (`dyna <module> <command>`), checks that this
// binary is a version the plugin accepts, and turns a command's error into what is printed and the exit code.
package app

import (
	"errors"
	"fmt"
	"io"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/spf13/cobra"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/agent"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/design"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/design/designmd"
	designmcp "github.com/guohaonan-shy/harold-skills/dyna/internal/design/mcp"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/dreaming"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/git"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/home"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/issues"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/nexterr"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/pr"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/registry"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/research"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/retro"
	rt "github.com/guohaonan-shy/harold-skills/dyna/internal/runtime"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/semver"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/seo"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/serve"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/spec"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/testcmd"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/ui"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/version"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/worktree"
)

// Environment variables the plugin's small script sets before it hands over to this binary.
const (
	// EnvRange is the dyna version range the plugin accepts, such as ">=0.0.1 <1.0.0".
	EnvRange = "IDEA_LOOP_CLI_RANGE"
	// EnvPluginRoot is the plugin's directory; commands read the plugin's own data files from it.
	EnvPluginRoot = "IDEA_LOOP_PLUGIN_ROOT"
)

// IO is everything the process touches, so tests can run it in memory.
type IO struct {
	Stdin  io.Reader
	Stdout io.Writer
	Stderr io.Writer
	Env    home.Env
	GH     func(dir string) issues.GH
	Git    func(dir string) issues.GH
	// Cwd is the directory the session runs in; empty means the process's. Now is the clock; nil means time.Now.
	Cwd string
	Now func() time.Time
	// PR is the pr module's outside world (gh, git, GitHub's token endpoint); a field left nil is the real one.
	PR pr.Deps
	// DesignMD is the official DESIGN.md tool `design md` runs; nil means the real one.
	DesignMD designmd.CLI
}

// OSIO is the real process.
func OSIO() IO {
	return IO{Stdin: os.Stdin, Stdout: os.Stdout, Stderr: os.Stderr, Env: home.OSEnv}
}

// NewRoot is the command tree.
func NewRoot(io IO) *cobra.Command {
	root := &cobra.Command{
		Use:           "dyna",
		Short:         "idea-loop 的命令行：skill 里写 dyna <模块> <命令>，参数用 --help 查",
		SilenceUsage:  true,
		SilenceErrors: true,
	}
	root.CompletionOptions.DisableDefaultCmd = true
	root.SetOut(io.Stdout)
	root.SetErr(io.Stderr)
	if io.Stdin != nil {
		root.SetIn(io.Stdin)
	}
	root.Args = func(cmd *cobra.Command, args []string) error {
		if len(args) == 0 {
			return nil
		}
		var names []string
		for _, c := range cmd.Commands() {
			if c.Name() != "help" {
				names = append(names, c.Name())
			}
		}
		return fmt.Errorf("不认识的模块「%s」（%s）", args[0], strings.Join(names, " / "))
	}
	root.RunE = func(cmd *cobra.Command, args []string) error { return cmd.Help() }
	root.SetFlagErrorFunc(flagError)

	root.AddCommand(issues.Command(issues.Deps{Env: io.Env, Stdin: io.Stdin, Stdout: io.Stdout, GH: io.GH, Git: io.Git}))
	root.AddCommand(design.CommandWith(design.Deps{Env: io.Env, DesignMD: io.DesignMD}), mcpCommand(io), testcmd.CommandWith(testcmd.Deps{Env: io.Env, Cwd: io.Cwd}))
	root.AddCommand(home.Command(home.Deps{Env: io.Env, Stdin: io.Stdin, Stdout: io.Stdout, Cwd: io.Cwd, Now: io.Now}))
	root.AddCommand(spec.Command(spec.Deps{Stdout: io.Stdout, Home: func() string { return home.Dir(io.Env) }}))
	root.AddCommand(git.Command(git.Deps{Stdout: io.Stdout}))
	root.AddCommand(worktree.Command(worktree.Deps{Stdin: io.Stdin, Stdout: io.Stdout}))
	root.AddCommand(ui.Command(ui.Deps{Env: io.Env, Stdout: io.Stdout, Stderr: io.Stderr}))
	root.AddCommand(serve.Command(serve.Deps{Stdout: io.Stdout}))
	root.AddCommand(pr.Command(prDeps(io)))
	root.AddCommand(research.Command(research.Deps{Stdout: io.Stdout}))
	root.AddCommand(dreaming.Command(dreaming.Deps{Stdout: io.Stdout}))
	root.AddCommand(retro.Command(retro.Deps{Env: io.Env, Stdout: io.Stdout}))
	root.AddCommand(agent.Command(agent.Deps{Env: io.Env, Stdout: io.Stdout, Stderr: io.Stderr}))
	root.AddCommand(seo.Command(seo.Deps{Env: io.Env, Stdin: io.Stdin, Stdout: io.Stdout, GH: io.GH, Cwd: io.Cwd, Now: io.Now}))
	root.AddCommand(rt.Command(rt.Deps{Env: io.Env, Stdout: io.Stdout, Stderr: io.Stderr, Now: io.Now, Cwd: io.Cwd}))
	root.AddCommand(registryCommand(io), versionCommand(io))
	return root
}

// mcpCommand is the `mcp` module: servers the plugin's .mcp.json starts.
func mcpCommand(io IO) *cobra.Command {
	g := registry.Group("mcp", "MCP 服务器：插件的 .mcp.json 起它们，走标准输入输出")
	env := io.Env
	if env == nil {
		env = home.OSEnv
	}
	g.AddCommand(designmcp.CommandWith(designmcp.Deps{Env: env}))
	return g
}

// prDeps is the pr module's dependencies: what the process already has, and what a test put in IO.PR.
func prDeps(io IO) pr.Deps {
	d := io.PR
	d.Env, d.Stdin, d.Stdout = io.Env, io.Stdin, io.Stdout
	return d
}

var needsValue = regexp.MustCompile(`^flag needs an argument: (--[\w-]+)`)

// flagError says a flag missing its value the way dyna always has.
func flagError(cmd *cobra.Command, err error) error {
	if m := needsValue.FindStringSubmatch(err.Error()); m != nil {
		return fmt.Errorf("%s 要带值：%s=<…>", m[1], m[1])
	}
	return err
}

func registryCommand(io IO) *cobra.Command {
	c := &cobra.Command{
		Use:           "registry",
		Short:         "打印命令登记表：每条命令的名字、参数、说明、谁能调、出错时提示的下一条命令",
		SilenceUsage:  true,
		SilenceErrors: true,
		Args:          cobra.NoArgs,
	}
	c.RunE = func(cmd *cobra.Command, args []string) error {
		reg := registry.Export(cmd.Root(), version.Version)
		if asJSON, _ := cmd.Flags().GetBool("json"); asJSON {
			_, err := io.Stdout.Write(reg.JSON())
			return err
		}
		for _, r := range reg.Commands {
			fmt.Fprintf(io.Stdout, "dyna %s\t%s\t%s\n", r.Command, r.Caller, r.Summary)
		}
		return nil
	}
	c.Flags().Bool("json", false, "输出 JSON（每版发布时存进 dyna/registry/<版本>.json）")
	registry.Mark(c, registry.CallerSession, "")
	return c
}

func versionCommand(io IO) *cobra.Command {
	c := &cobra.Command{
		Use:           "version",
		Short:         "打印这个 dyna 的版本号",
		SilenceUsage:  true,
		SilenceErrors: true,
		Args:          cobra.NoArgs,
	}
	c.RunE = func(cmd *cobra.Command, args []string) error {
		fmt.Fprintln(io.Stdout, version.Version)
		return nil
	}
	registry.Mark(c, registry.CallerSession, "")
	return c
}

// Gate checks this binary against the range the plugin wrote down. It returns "" when the call may go ahead,
// or the sentence that says what is wrong and what to run next. With no range set (dyna run by hand, outside the
// plugin) every version passes.
func Gate(env home.Env, own string) string {
	text := env(EnvRange)
	if text == "" {
		return ""
	}
	r, err := semver.ParseRange(text)
	if err != nil {
		return fmt.Sprintf("插件写的命令行版本范围「%s」读不懂：%v。下一步：去 /plugin 更新插件。", text, err)
	}
	v, err := semver.Parse(own)
	if err != nil {
		return fmt.Sprintf("本机 dyna 的版本号「%s」读不懂：%v", own, err)
	}
	switch r.Where(v) {
	case semver.Below:
		return fmt.Sprintf("命令行版本不对：本机 dyna %s，插件要 %s。下一步：跑 /idea-loop:setup 升级命令行。", v, r)
	case semver.Above:
		return fmt.Sprintf("命令行版本不对：本机 dyna %s，插件要 %s，插件比命令行旧。下一步：去 /plugin 更新插件。", v, r)
	}
	return ""
}

func hasHookFlag(args []string) bool {
	for _, a := range args {
		if a == "--" {
			return false
		}
		if a == "--hook" || strings.HasPrefix(a, "--hook=") {
			return true
		}
	}
	return false
}

// Run runs one command line and returns the exit code.
func Run(args []string, io IO) int {
	if io.Env == nil {
		io.Env = home.OSEnv
	}
	if msg := Gate(io.Env, version.Version); msg != "" {
		fmt.Fprintln(io.Stderr, msg)
		if hasHookFlag(args) {
			return 0 // a hook must never break the session over a version mismatch
		}
		return 1
	}
	root := NewRoot(io)
	root.SetArgs(args)
	cmd, err := root.ExecuteC()
	if err == nil {
		return 0
	}
	var exit *nexterr.Exit
	if errors.As(err, &exit) {
		if exit.Msg != "" {
			fmt.Fprintln(io.Stderr, exit.Msg)
		}
		return exit.Code
	}
	msg := err.Error()
	var ne *nexterr.Error
	switch {
	case errors.As(err, &ne):
		if ne.Next != "" {
			msg += "\n下一条：" + ne.Next
		}
	case cmd != nil && registry.NextOf(cmd) != "":
		msg += "\n下一条：" + registry.NextOf(cmd)
	}
	fmt.Fprintln(io.Stderr, msg)
	return 1
}
