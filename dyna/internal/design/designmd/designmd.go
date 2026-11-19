// Package designmd is `dyna design md`: the official DESIGN.md tool (`@google/design.md`, run at @latest) behind two
// commands. Format and structure checks belong entirely to Google's CLI, so the check tracks the newest spec; this
// package only decides whether a write is a DESIGN.md, calls the CLI, and turns its JSON into feedback.
//
//   - `md lint` is the PostToolUse hook (with --hook): not a DESIGN.md, or the file is gone, is silent exit 0 (it must
//     never slow normal work); lint errors are findings on stderr + exit 2, which Claude Code feeds back to the model;
//     warnings alone are silent (the writer's closing `md diff` step judges regressions); a CLI that cannot be reached
//     (offline, registry down, non-JSON output) leaves a note on stderr and exits 0, since a lint that could not run is
//     not a lint failure and blocking every write while offline would be.
//   - `md diff <before> <after>` shows what changed between two versions of a DESIGN.md.
//
// DESIGN_MD_CLI overrides the CLI: a script that node runs in its place (tests point it at a fake instead of the
// network).
package designmd

import (
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/spf13/cobra"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/design/jsx"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/home"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/miniyaml"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/nexterr"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/registry"
)

// EnvCLI is the environment variable that replaces the official CLI.
const EnvCLI = "DESIGN_MD_CLI"

const timeout = 120 * time.Second

// Result is one run of the official CLI.
type Result struct {
	Stdout, Stderr string
	Code           int
	// Err is why it could not run at all (not installed, timed out); empty when it ran, whatever its exit code.
	Err string
}

// CLI runs the official CLI with these arguments (`lint <file>`, `diff <a> <b>`).
type CLI func(args ...string) Result

// Deps is what a command reaches outside the process for.
type Deps struct {
	Env home.Env
	// CLI is the official tool; nil means the real one (or the DESIGN_MD_CLI stand-in).
	CLI CLI
}

func (d Deps) cli() CLI {
	if d.CLI != nil {
		return d.CLI
	}
	env := d.Env
	if env == nil {
		env = home.OSEnv
	}
	return func(args ...string) Result {
		name, pre := "npx", []string{"-y", "@google/design.md@latest"}
		if stub := env(EnvCLI); stub != "" {
			name, pre = "node", []string{stub}
		}
		path, err := exec.LookPath(name)
		if err != nil {
			return Result{Err: err.Error()}
		}
		ctx, cancel := context.WithTimeout(context.Background(), timeout)
		defer cancel()
		cmd := exec.CommandContext(ctx, path, append(pre, args...)...)
		var out, errb strings.Builder
		cmd.Stdout, cmd.Stderr = &out, &errb
		err = cmd.Run()
		res := Result{Stdout: out.String(), Stderr: errb.String()}
		if ctx.Err() != nil {
			res.Err = "timed out after " + timeout.String()
		} else if ee, ok := err.(*exec.ExitError); ok {
			res.Code = ee.ExitCode()
		} else if err != nil {
			res.Err = err.Error()
		}
		return res
	}
}

// IsDesignMd is whether a path names a file called exactly DESIGN.md.
func IsDesignMd(path string) bool { return path != "" && filepath.Base(path) == "DESIGN.md" }

// RenderErrors is the lint report's errors as the text the model is told, or "" when there are none. The report is
// `{ findings: [{ severity, path?, message, rule }], summary: { errors, ... } }`.
func RenderErrors(report any, path string) string {
	findings, _ := prop(report, "findings").([]any)
	var lines []string
	for _, f := range findings {
		if prop(f, "severity") != "error" {
			continue
		}
		line := "- [" + text(f, "rule") + "]"
		if p := prop(f, "path"); miniyaml.Truthy(p) {
			line += " " + miniyaml.Text(p) + ":"
		}
		line += " " + text(f, "message")
		lines = append(lines, line)
	}
	if len(lines) == 0 {
		return ""
	}
	return strings.Join(append(append([]string{fmt.Sprintf("@google/design.md lint found %d error(s) in %s:", len(lines), path)}, lines...),
		"\nFix these before continuing. Format and structure follow the official spec (`npx -y @google/design.md@latest spec`)."), "\n")
}

// text is `${f[k]}`: a missing key reads "undefined".
func text(v any, k string) string {
	if m, ok := miniyaml.AsMap(v); ok && m.Has(k) {
		return miniyaml.Text(m.Get(k))
	}
	return "undefined"
}

func prop(v any, k string) any {
	if m, ok := miniyaml.AsMap(v); ok {
		return m.Get(k)
	}
	return nil
}

// Command is the `design md` group.
func Command(d Deps) *cobra.Command {
	g := registry.Group("md", "项目的 DESIGN.md：包官方 @google/design.md 工具（lint、diff）")
	g.AddCommand(lintCommand(d), diffCommand(d))
	return g
}

func lintCommand(d Deps) *cobra.Command {
	c := &cobra.Command{
		Use:           "lint [DESIGN.md]",
		Short:         "官方 DESIGN.md lint：直接跑是打印官方报告、有 error 退出 1；--hook 从 PostToolUse 事件取被写的文件，只管叫 DESIGN.md 的，有 error 退出 2 并写到 stderr，工具跑不起来只留一行说明、退出 0",
		Args:          cobra.ArbitraryArgs,
		SilenceUsage:  true,
		SilenceErrors: true,
	}
	c.Flags().Bool("hook", false, "从标准输入读 PostToolUse 事件")
	registry.Mark(c, registry.CallerSession, "")
	c.RunE = func(cmd *cobra.Command, args []string) error {
		if hook, _ := cmd.Flags().GetBool("hook"); hook {
			return lintHook(d, cmd.InOrStdin(), cmd.ErrOrStderr())
		}
		if len(args) != 1 {
			return &nexterr.Exit{Code: 1, Msg: "用法：dyna design md lint <DESIGN.md>（hook 里用 dyna design md lint --hook）"}
		}
		res := d.cli()("lint", args[0])
		if res.Err != "" {
			return &nexterr.Exit{Code: 1, Msg: "design md lint: could not run @google/design.md lint (" + firstLine(res.Err) + ")"}
		}
		fmt.Fprint(cmd.OutOrStdout(), res.Stdout)
		fmt.Fprint(cmd.ErrOrStderr(), res.Stderr)
		report, err := jsx.ParseJSON([]byte(res.Stdout))
		if err == nil && RenderErrors(report, args[0]) != "" {
			return &nexterr.Exit{Code: 1}
		}
		if err != nil && res.Code != 0 {
			return &nexterr.Exit{Code: res.Code}
		}
		return nil
	}
	return c
}

func firstLine(s string) string {
	s = jsx.Trim(s)
	if i := strings.IndexByte(s, '\n'); i >= 0 {
		return s[:i]
	}
	return s
}

func lintHook(d Deps, stdin io.Reader, errw io.Writer) error {
	if stdin == nil {
		return nil
	}
	raw, _ := io.ReadAll(stdin)
	event, err := jsx.ParseJSON(raw)
	if err != nil {
		return nil
	}
	path, _ := prop(prop(event, "tool_input"), "file_path").(string)
	if !IsDesignMd(path) {
		return nil
	}
	if st, err := os.Stat(path); err != nil || st == nil {
		return nil
	}
	res := d.cli()("lint", path)
	report, perr := jsx.ParseJSON([]byte(res.Stdout))
	if perr != nil {
		why := res.Err
		if why == "" {
			why = strings.TrimSpace(res.Stderr)
		}
		if why == "" {
			why = "no JSON output"
		}
		fmt.Fprintln(errw, "design-md-hook: could not run @google/design.md lint ("+firstLine(why)+"); skipped.")
		return nil
	}
	if msg := RenderErrors(report, path); msg != "" {
		return &nexterr.Exit{Code: 2, Msg: msg}
	}
	return nil
}

func diffCommand(d Deps) *cobra.Command {
	c := &cobra.Command{
		Use:           "diff <before> <after>",
		Short:         "官方 DESIGN.md diff：比较改前（备份）和改后的 DESIGN.md，判是否退化（新增了 error 或 warning）；输出与退出码照官方工具",
		Args:          cobra.ArbitraryArgs,
		SilenceUsage:  true,
		SilenceErrors: true,
	}
	registry.Mark(c, registry.CallerSession, "")
	c.RunE = func(cmd *cobra.Command, args []string) error {
		if len(args) != 2 {
			return &nexterr.Exit{Code: 1, Msg: "用法：dyna design md diff <改前的 DESIGN.md> <改后的 DESIGN.md>"}
		}
		res := d.cli()("diff", args[0], args[1])
		if res.Err != "" {
			return &nexterr.Exit{Code: 1, Msg: "design md diff: could not run @google/design.md diff (" + firstLine(res.Err) + ")"}
		}
		fmt.Fprint(cmd.OutOrStdout(), res.Stdout)
		fmt.Fprint(cmd.ErrOrStderr(), res.Stderr)
		if res.Code != 0 {
			return &nexterr.Exit{Code: res.Code}
		}
		return nil
	}
	return c
}
