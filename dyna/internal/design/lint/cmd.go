package lint

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/spf13/cobra"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/design/jsx"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/frontmatter"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/nexterr"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/registry"
)

const usage = "用法：dyna design lint <file.html>... [--json]（hook 里用 dyna design lint --hook，事件从标准输入读）"

// Canvases live in docs/design/tmp/<spec-slug>/canvas/ (uiux-refine's home; they stay there until the requirement
// is archived). The two scratch dirs stay recognized for protocols run outside refine and for older projects. Only
// HTML directly inside canvas/ counts: canvas/assets/ holds captures, and imagine/ holds throwaway comparison pages,
// not canvases. The path is judged by its tail alone: it need not be inside the repository the session is in, so a
// canvas in a project's directory in home (`<home>/projects/<name>/docs/design/tmp/<spec-slug>/canvas/…`) counts the
// same.
var canvas = jsx.Re(`(?:(?:^|/)(?:design-preview|design-motion-preview)/[^/]*|(?:^|/)docs/design/tmp/[^/]+/canvas/[^/]*)\.html?$`, "")

// IsCanvas says whether a path names a design canvas the hook should lint.
func IsCanvas(path string) bool { return canvas.MatchString(path) }

// Command is `design lint`: run the rules over the given files, or (with --hook) over the file a PostToolUse event
// says was just written.
func Command() *cobra.Command {
	c := &cobra.Command{
		Use:           "lint [file.html]...",
		Short:         "设计画布的机械检查（AI 味特征）：P0/P1 退出 2；--hook 从 PostToolUse 事件里取被写的画布，只拦 docs/design/tmp/<spec-slug>/canvas/ 下的",
		Args:          cobra.ArbitraryArgs,
		SilenceUsage:  true,
		SilenceErrors: true,
	}
	c.Flags().Bool("json", false, "输出 JSON")
	c.Flags().Bool("hook", false, "从标准输入读 PostToolUse 事件；有 P0/P1 时退出码 2、报告写到 stderr，不是画布或干净时静默")
	registry.Mark(c, registry.CallerHook, "")
	c.RunE = func(cmd *cobra.Command, args []string) error {
		hook, _ := cmd.Flags().GetBool("hook")
		if hook {
			return runHook(cmd.InOrStdin())
		}
		asJSON, _ := cmd.Flags().GetBool("json")
		return runFiles(cmd.OutOrStdout(), args, asJSON)
	}
	return c
}

func runFiles(out io.Writer, files []string, asJSON bool) error {
	if len(files) == 0 {
		return &nexterr.Exit{Code: 1, Msg: usage}
	}
	var all []Finding
	for _, f := range files {
		raw, err := os.ReadFile(f)
		if err != nil {
			return &nexterr.Exit{Code: 1, Msg: fmt.Sprintf("design-lint: cannot read %s: %v", f, readReason(err))}
		}
		all = append(all, Lint(string(raw), f)...)
	}
	if asJSON {
		fmt.Fprintln(out, findingsJSON(all))
	} else {
		fmt.Fprintln(out, Render(all))
	}
	if Blocking(all) {
		return &nexterr.Exit{Code: 2}
	}
	return nil
}

// readReason is the part of a file error after the path ("no such file or directory").
func readReason(err error) string {
	if pe, ok := err.(*os.PathError); ok {
		return pe.Err.Error()
	}
	return err.Error()
}

func findingsJSON(all []Finding) string {
	list := make([]any, 0, len(all))
	for _, f := range all {
		m := frontmatter.NewMap()
		m.Set("file", f.File)
		m.Set("id", f.ID)
		m.Set("severity", f.Severity)
		m.Set("why", f.Why)
		m.Set("detail", f.Detail)
		if f.Line != 0 {
			m.Set("line", float64(f.Line))
		}
		list = append(list, m)
	}
	s, _ := frontmatter.JSON(list, 2)
	return s
}

// runHook is the PostToolUse hook: every Write/Edit that lands in a design canvas gets linted without anyone
// remembering to check, and findings go back to the model (stderr + exit 2). Silent for any other file: this hook
// must never slow normal work down.
func runHook(stdin io.Reader) error {
	if stdin == nil {
		return nil
	}
	raw, _ := io.ReadAll(stdin)
	var ev struct {
		ToolInput struct {
			FilePath any `json:"file_path"`
		} `json:"tool_input"`
	}
	if json.Unmarshal(raw, &ev) != nil {
		return nil
	}
	path, ok := ev.ToolInput.FilePath.(string)
	if !ok || !IsCanvas(path) {
		return nil
	}
	data, err := os.ReadFile(path)
	if err != nil || isDir(path) {
		return nil
	}
	findings := Lint(string(data), path)
	if !Blocking(findings) {
		return nil // clean: stay silent
	}
	report := strings.Join([]string{
		"design-lint on " + path + ":",
		Render(findings),
		"\nFix P0 before continuing (design-law.md, section Close-out protocol); P1 should be fixed or consciously justified in the review list.",
	}, "\n")
	return &nexterr.Exit{Code: 2, Msg: report}
}

func isDir(p string) bool {
	st, err := os.Stat(filepath.Clean(p))
	return err == nil && st.IsDir()
}
