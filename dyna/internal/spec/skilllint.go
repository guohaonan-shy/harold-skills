package spec

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/spf13/cobra"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/nexterr"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/registry"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/skilldoc"
)

// MaxSkillBodyChars is the line for the body of a SKILL.md or an agent definition (frontmatter stripped, UTF-8
// characters): a body of more characters than this is too long. This is the only place the line is written down.
const MaxSkillBodyChars = 4500

const idealoopPlugin = "idea-loop"

// adapterLayer lists the files that may spell out `gh` / `git` commands: the adapter layer, the one place that says
// how an operation is done on one tracker or host. Paths are relative to the idea-loop plugin root; each carries the
// reason it is on the list. Judged by the current tree, as no-project-leak.test.mjs and runtime-tripwire.test.mjs
// judge theirs: a file whose whole job is to name those commands is exempt, a file that merely uses one is not.
var adapterLayer = map[string]string{
	"skills/engineering/issues/references/github.md":         "how each issue operation is done on GitHub: the adapter of the issues skill",
	"skills/engineering/setup/references/issue-tracker.md":   "the template of a project's ISSUE_TRACKER.md: it names the tracker's commands",
	"skills/engineering/setup/references/preflight-table.md": "the template of the preflight table: it names the host commands that probe a setup",
	"skills/engineering/setup/references/development.md":     "the template of a project's DEVELOPMENT.md: it names the git commands of a worktree's setup",
}

var (
	skillFile  = regexp.MustCompile(`(^|/)skills/(.+/)?SKILL\.md$`)
	agentFile  = regexp.MustCompile(`(^|/)agents/[^/]+\.md$`)
	inlineCode = regexp.MustCompile("`([^`\n]+)`")
	// hostCommand is an inline code span that starts as a `gh <subcommand>` or `git <subcommand>` command. Options
	// (each with at most one value: `-C <dir>`, `--repo <repo>`, `-c k=v`, `--no-pager`) may sit between the command
	// name and the subcommand, as in `git -C <dir> pull`; options with nothing after them (`git --version`) are not.
	hostCommand = regexp.MustCompile(`^(?:gh|git)(?: +-{1,2}[A-Za-z][\w-]*(?:=\S+)?(?: +[^\s-]\S*)?)* +[a-z]`)
)

// IsLintedFile: is this path a SKILL.md under a skills/ directory, or an agent definition directly under agents/?
// Reference files and AGENTS.md / CLAUDE.md are not.
func IsLintedFile(path string) bool {
	p := filepath.ToSlash(path)
	return skillFile.MatchString(p) || agentFile.MatchString(p)
}

// Problem is one thing the lint found in a file: the sentence to say, and where.
type Problem struct {
	File string
	Line int // 0 for a whole-file problem
	Text string
}

// pluginRootOf is the nearest directory at or above the file's own directory that is a plugin (has
// .claude-plugin/plugin.json), with the plugin's name; "" when there is none.
func pluginRootOf(path string) (root, name string) {
	for dir := filepath.Dir(path); ; dir = filepath.Dir(dir) {
		raw, err := os.ReadFile(filepath.Join(dir, ".claude-plugin", "plugin.json"))
		if err == nil {
			var pj struct {
				Name string `json:"name"`
			}
			_ = json.Unmarshal(raw, &pj)
			return dir, pj.Name
		}
		if filepath.Dir(dir) == dir {
			return "", ""
		}
	}
}

func realPath(p string) string {
	abs, err := filepath.Abs(p)
	if err != nil {
		return p
	}
	if r, err := filepath.EvalSymlinks(abs); err == nil {
		return r
	}
	return abs
}

func within(dir, path string) bool {
	if dir == "" {
		return false
	}
	rel, err := filepath.Rel(dir, path)
	return err == nil && rel != "." && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator))
}

// lintScope says whether the file is one the lint covers, and which plugin it belongs to. A file is covered when it
// is a SKILL.md or an agent definition and sits either under home (the directory `dyna home` knows), or, for the
// time before the projects have moved into home, under a plugin root. Anything else is let through silently.
func lintScope(path, homeDir string) (ok bool, pluginRoot, pluginName string) {
	if !IsLintedFile(path) {
		return false, "", ""
	}
	real := realPath(path)
	if root, name := pluginRootOf(real); root != "" {
		return true, root, name
	}
	if homeDir != "" && within(realPath(homeDir), real) {
		return true, "", ""
	}
	return false, "", ""
}

// LintText is what the lint says about the text of one file. relToPlugin is the file's path under the plugin root,
// which tells the adapter layer from other files; inIdeaLoop switches the inline-command tripwire on.
func LintText(display, text, relToPlugin string, inIdeaLoop bool) []Problem {
	var out []Problem
	body := skilldoc.Body(text)
	if n := skilldoc.Chars(text); n > MaxSkillBodyChars {
		out = append(out, Problem{File: display, Text: fmt.Sprintf("%s 主体 %d 字，线 %d。调 idea-loop:writing-for-agents 精简这份文件", display, n, MaxSkillBodyChars)})
	}
	if !inIdeaLoop {
		return out
	}
	if _, adapter := adapterLayer[relToPlugin]; adapter {
		return out
	}
	// the frontmatter is not body, so its allowed-tools line is never scanned; the line numbers are the file's
	first := strings.Count(text[:len(text)-len(body)], "\n") + 1
	fenced := false
	for i, line := range strings.Split(body, "\n") {
		if strings.HasPrefix(strings.TrimSpace(line), "```") {
			fenced = !fenced
			continue
		}
		if fenced || strings.Contains(line, "坑") {
			continue
		}
		for _, m := range inlineCode.FindAllStringSubmatch(line, -1) {
			cmd := strings.TrimSpace(m[1])
			if hostCommand.MatchString(cmd) {
				out = append(out, Problem{File: display, Line: first + i, Text: fmt.Sprintf("%s:%d 写了行内命令 %s。调 idea-loop:writing-for-agents，照它的命令归类改写；确实是坑就在同一行标「坑」", display, first+i, cmd)})
			}
		}
	}
	return out
}

// lintFile lints one file when it is in scope; checked says whether it was.
func lintFile(display, path, homeDir string) (problems []Problem, checked bool, err error) {
	ok, root, name := lintScope(path, homeDir)
	if !ok {
		return nil, false, nil
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, false, fmt.Errorf("读不到「%s」：%v", display, err)
	}
	rel := ""
	if root != "" {
		if r, err := filepath.Rel(root, realPath(path)); err == nil {
			rel = filepath.ToSlash(r)
		}
	}
	return LintText(display, string(raw), rel, name == idealoopPlugin), true, nil
}

func skillLintCommand(d Deps) *cobra.Command {
	c := &cobra.Command{
		Use:           "skill-lint [file]...",
		Short:         "skill 与 agent 定义的结构检查：主体（去掉 frontmatter）超过 4500 字报；idea-loop 插件的文件正文里写行内 gh / git 命令报；--hook 从 PostToolUse 事件取被写的文件，--changed <base-ref> 只查 <base-ref>...HEAD 里改到的",
		Args:          cobra.ArbitraryArgs,
		SilenceUsage:  true,
		SilenceErrors: true,
	}
	c.Flags().Bool("hook", false, "从标准输入读 PostToolUse 事件；有问题时退出码 2、报错写到 stderr，不在范围内或干净时静默")
	c.Flags().String("changed", "", "只查 <base-ref>...HEAD 里改到的（没删掉的）、在范围内的文件")
	registry.Mark(c, registry.CallerHook, "")
	c.RunE = func(cmd *cobra.Command, args []string) error {
		if hook, _ := cmd.Flags().GetBool("hook"); hook {
			return skillLintHook(cmd.InOrStdin(), d.homeDir())
		}
		var files []lintTarget
		for _, a := range args {
			files = append(files, lintTarget{display: a, path: a})
		}
		base, _ := cmd.Flags().GetString("changed")
		if base != "" {
			changed, err := d.changedFiles(base)
			if err != nil {
				return err
			}
			files = append(files, changed...)
		}
		if len(files) == 0 && base == "" {
			return &nexterr.Exit{Code: 1, Msg: "用法：dyna spec skill-lint <文件>... | --changed <base-ref>（hook 里用 dyna spec skill-lint --hook，事件从标准输入读）"}
		}
		var all []Problem
		checked := 0
		for _, f := range files {
			ps, ok, err := lintFile(f.display, f.path, d.homeDir())
			if err != nil {
				return &nexterr.Exit{Code: 1, Msg: err.Error()}
			}
			if ok {
				checked++
			}
			all = append(all, ps...)
		}
		out := d.out()
		for _, p := range all {
			fmt.Fprintln(out, p.Text)
		}
		if len(all) > 0 {
			return &nexterr.Exit{Code: 1}
		}
		fmt.Fprintf(out, "ok: 查了 %d 份 skill 或 agent 定义\n", checked)
		return nil
	}
	return c
}

// lintTarget is a file to lint: the path it opens at, and the name the report calls it.
type lintTarget struct{ display, path string }

// changedFiles are the files <base-ref>...HEAD changed and did not delete, in scope by name; reported by their path
// in the repository.
func (d Deps) changedFiles(base string) ([]lintTarget, error) {
	top, err := d.git("rev-parse", "--show-toplevel")
	if err != nil {
		return nil, err
	}
	raw, err := d.git("diff", "--name-only", "--diff-filter=d", base+"...HEAD")
	if err != nil {
		return nil, err
	}
	var out []lintTarget
	for _, f := range strings.Split(raw, "\n") {
		if f != "" && IsLintedFile(f) {
			out = append(out, lintTarget{display: f, path: filepath.Join(strings.TrimSpace(top), f)})
		}
	}
	return out, nil
}

// skillLintHook is the PostToolUse hook: the file a Write or Edit just wrote is linted when it is in scope, and the
// problems go back to the model (stderr, exit 2). Silent for any other file, and for an event it cannot read: this
// hook must never slow normal work down.
func skillLintHook(stdin io.Reader, homeDir string) error {
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
	if !ok || path == "" {
		return nil
	}
	problems, _, err := lintFile(path, path, homeDir)
	if err != nil || len(problems) == 0 {
		return nil
	}
	lines := make([]string, len(problems))
	for i, p := range problems {
		lines[i] = p.Text
	}
	return &nexterr.Exit{Code: 2, Msg: strings.Join(lines, "\n")}
}
