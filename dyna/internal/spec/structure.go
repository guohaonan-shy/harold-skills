package spec

import (
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/spf13/cobra"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/nexterr"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/registry"
)

// SpecSections are the seven sections of a spec, in the order the template writes them. They are level-2
// headings; a spec reads them by name.
var SpecSections = []string{"问题陈述", "方案", "User Stories", "实现决策", "测试决策", "Out of scope", "关联"}

// DiagnosisSection is the section a spec that changes agent documents must have, at level 2 or 3, anywhere
// between the seven.
const DiagnosisSection = "杠杆诊断"

const fixHint = "照 idea-loop:to-spec 的模板补"

var headingText = regexp.MustCompile(`^(#{1,6})\s+(.*?)\s*#*\s*$`)

// heading is a markdown heading outside code fences.
type heading struct {
	level int
	text  string
}

func headingsOutsideFences(md string) []heading {
	var out []heading
	fenced := false
	for _, l := range strings.Split(md, "\n") {
		t := strings.TrimSpace(l)
		if strings.HasPrefix(t, "```") || strings.HasPrefix(t, "~~~") {
			fenced = !fenced
			continue
		}
		if fenced {
			continue
		}
		if m := headingText.FindStringSubmatch(l); m != nil {
			out = append(out, heading{level: len(m[1]), text: m[2]})
		}
	}
	return out
}

func sameName(a, b string) bool { return strings.EqualFold(strings.TrimSpace(a), b) }

func quoteAll(names []string) string {
	q := make([]string, len(names))
	for i, n := range names {
		q[i] = "「" + n + "」"
	}
	return strings.Join(q, "")
}

// StructureProblems is what is wrong with the shape of one spec's text: a section of the seven missing, the
// seven out of order, or `changes_agent_docs: true` without a 「杠杆诊断」 section. Each problem is one sentence
// that ends with the next step; empty when the spec is fine.
func StructureProblems(md string) []string {
	var problems []string
	hs := headingsOutsideFences(md)

	// the first level-2 heading of each section
	pos := map[string]bool{}
	var found []string // the sections that are there, in the order the text has them
	for _, h := range hs {
		if h.level != 2 {
			continue
		}
		for _, s := range SpecSections {
			if sameName(h.text, s) {
				if !pos[s] {
					pos[s] = true
					found = append(found, s)
				}
				break
			}
		}
	}
	var missing []string
	for _, s := range SpecSections {
		if !pos[s] {
			missing = append(missing, s)
		}
	}
	if len(missing) > 0 {
		problems = append(problems, "缺 "+quoteAll(missing)+" 节（七节按顺序：「"+strings.Join(SpecSections, "」「")+"」，都用 ## 标题）。"+fixHint)
	}
	var want []string // the sections that are there, in template order
	for _, s := range SpecSections {
		if pos[s] {
			want = append(want, s)
		}
	}
	for i := range want {
		if want[i] != found[i] {
			problems = append(problems, "七节顺序错：现在是 "+quoteAll(found)+"，应是 "+quoteAll(want)+"（「"+DiagnosisSection+"」可插在任意两节之间）。"+fixHint)
			break
		}
	}

	if Frontmatter(md)["changes_agent_docs"] == "true" {
		has := false
		for _, h := range hs {
			if (h.level == 2 || h.level == 3) && sameName(h.text, DiagnosisSection) {
				has = true
				break
			}
		}
		if !has {
			problems = append(problems, "frontmatter 写了 changes_agent_docs: true，但没有标题为「"+DiagnosisSection+"」的一节（## 或 ###）。"+fixHint)
		}
	}
	return problems
}

// IsSpecFile: is this path a spec file, <spec dir>/<slug>/<slug>.md? A raw discussion, a ticket under
// <slug>/tickets/, the index and any other file are not.
func IsSpecFile(path string) bool {
	p := filepath.ToSlash(path)
	parts := strings.Split(p, "/")
	if len(parts) < 3 {
		return false
	}
	file, slug, dir := parts[len(parts)-1], parts[len(parts)-2], parts[len(parts)-3]
	return dir == "spec" && slug != "tickets" && file == slug+".md"
}

// specCheckHook is the PostToolUse hook of `spec check`: the file a Write or Edit just wrote is checked when it
// is a spec, and what is wrong with its shape goes back to the model (stderr, exit 2). Silent for any other
// file, for a spec that is fine and for an event it cannot read: this hook must never slow normal work down.
func specCheckHook(stdin io.Reader) error {
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
	if !ok || !IsSpecFile(path) {
		return nil
	}
	text, err := os.ReadFile(path)
	if err != nil {
		return nil
	}
	problems := StructureProblems(string(text))
	if len(problems) == 0 {
		return nil
	}
	lines := make([]string, len(problems))
	for i, p := range problems {
		lines[i] = path + " " + p
	}
	return &nexterr.Exit{Code: 2, Msg: strings.Join(lines, "\n")}
}

func checkCommand(d Deps) *cobra.Command {
	c := &cobra.Command{
		Use:           "check <docs>",
		Short:         "列出 docs/spec/ 下的 spec（JSON），报旧平铺布局、缺 spec 文件、还留着 status 行、七节缺了或顺序错、改 agent 文档却没有「杠杆诊断」的问题；--hook 从 PostToolUse 事件取被写的文件，只查它是不是 spec、结构对不对",
		Args:          cobra.ArbitraryArgs,
		SilenceUsage:  true,
		SilenceErrors: true,
	}
	c.Flags().Bool("hook", false, "从标准输入读 PostToolUse 事件；被写的是 spec 且结构有问题时退出码 2、报错写到 stderr，不是 spec 或干净时静默")
	registry.Mark(c, registry.CallerSession, "")
	c.RunE = func(cmd *cobra.Command, args []string) error {
		if hook, _ := cmd.Flags().GetBool("hook"); hook {
			return specCheckHook(cmd.InOrStdin())
		}
		if len(args) < 1 || args[0] == "" {
			return usage("check <docs>")
		}
		_, err := io.WriteString(d.out(), Check(args[0]).JSON())
		return err
	}
	return c
}
