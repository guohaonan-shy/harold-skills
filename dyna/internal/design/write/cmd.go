package write

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/spf13/cobra"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/design/check"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/frontmatter"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/nexterr"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/registry"
)

const usage = "用法：dyna design archive write <repo-root> <spec-slug> [--dry-run] [--json]"

func strs(xs []string) []any {
	out := make([]any, len(xs))
	for i, x := range xs {
		out[i] = x
	}
	return out
}

// JSON is the result as the JSON the command prints.
func (r Result) JSON() *frontmatter.Map {
	m := frontmatter.NewMap()
	m.Set("ok", r.OK)
	if !r.OK {
		m.Set("stage", r.Stage)
		if r.Violations != nil {
			m.Set("violations", check.ViolationsJSON(r.Violations))
		}
		if r.Errors != nil {
			m.Set("errors", strs(r.Errors))
		}
		return m
	}
	m.Set("dryRun", r.DryRun)
	s := frontmatter.NewMap()
	s.Set("slug", r.Summary.Slug)
	s.Set("added", strs(r.Summary.Added))
	s.Set("changed", strs(r.Summary.Changed))
	s.Set("removed", strs(r.Summary.Removed))
	s.Set("usedBy", strs(r.Summary.UsedBy))
	figures := []any{}
	for _, f := range r.Summary.Figures {
		fm := frontmatter.NewMap()
		fm.Set("from", f.From)
		fm.Set("to", f.To)
		fm.Set("page", f.Page)
		fm.Set("reason", f.Reason)
		figures = append(figures, fm)
	}
	s.Set("figures", figures)
	specLinks := []any{}
	for _, l := range r.Summary.SpecLinks {
		lm := frontmatter.NewMap()
		lm.Set("file", l.File)
		lm.Set("from", l.From)
		lm.Set("to", l.To)
		specLinks = append(specLinks, lm)
	}
	s.Set("specLinks", specLinks)
	m.Set("summary", s)
	hints := []any{}
	for _, h := range r.Hints {
		hm := frontmatter.NewMap()
		hm.Set("kind", h.Kind)
		hm.Set("message", h.Message)
		hints = append(hints, hm)
	}
	m.Set("hints", hints)
	return m
}

// RenderSummary is the readable summary of a result.
func RenderSummary(r Result) string {
	var lines []string
	if !r.OK {
		lines = append(lines, fmt.Sprintf("拒绝归档（%s）：什么都没写。", r.Stage))
		for _, x := range r.Violations {
			lines = append(lines, check.Format(x))
		}
		for _, e := range r.Errors {
			lines = append(lines, "冲突："+e)
		}
		return strings.Join(lines, "\n")
	}
	s := r.Summary
	if r.DryRun {
		lines = append(lines, fmt.Sprintf("dry-run：%s 可以归档，没有写任何文件。归档会做：", s.Slug))
	} else {
		lines = append(lines, fmt.Sprintf("已归档 %s：", s.Slug))
	}
	list := func(label string, ids []string) {
		body := "无"
		if len(ids) > 0 {
			body = strings.Join(ids, "、")
		}
		lines = append(lines, label+"："+body)
	}
	list("新增", s.Added)
	list("改动", s.Changed)
	list("删除", s.Removed)
	list("usedBy 重新生成", s.UsedBy)
	lines = append(lines, Prod+"/index.md：重新生成")
	if len(s.Figures) > 0 {
		lines = append(lines, "交互图：")
	} else {
		lines = append(lines, "交互图：无")
	}
	for _, f := range s.Figures {
		lines = append(lines, fmt.Sprintf("  %s → %s（%s）", f.From, f.To, f.Reason))
	}
	if len(s.SpecLinks) > 0 {
		lines = append(lines, "spec 链接改写：")
	} else {
		lines = append(lines, "spec 链接改写：无")
	}
	for _, c := range s.SpecLinks {
		lines = append(lines, fmt.Sprintf("  %s：%s → %s", c.File, c.From, c.To))
	}
	if r.DryRun {
		lines = append(lines, fmt.Sprintf("%s/%s/：不动（dry-run）", Tmp, s.Slug))
	} else {
		lines = append(lines, fmt.Sprintf("%s/%s/：已清空", Tmp, s.Slug))
	}
	for _, h := range r.Hints {
		lines = append(lines, "提示："+h.Message)
	}
	return strings.Join(lines, "\n")
}

func usageError(msg string) error {
	if msg == "" {
		msg = usage
	}
	return &nexterr.Exit{Code: 2, Msg: msg}
}

// Command is `write <repo-root> <spec-slug>`: fold the requirement's delta into prod/, or refuse and write nothing.
// Exit 0 = archived (or a dry run passed), 1 = refused (violations / conflicts listed; nothing written),
// 2 = usage error / nothing to archive.
func Command() *cobra.Command {
	c := &cobra.Command{
		Use:           "write <repo-root> <spec-slug>",
		Short:         "把需求的 delta/ 归档进 prod/（唯一写 prod/ 的入口；校验不过就什么都不写；--dry-run 只演练）",
		Args:          cobra.ArbitraryArgs,
		SilenceUsage:  true,
		SilenceErrors: true,
	}
	c.Flags().Bool("dry-run", false, "只校验和报告，不写任何文件")
	c.Flags().Bool("json", false, "输出 JSON")
	c.SetFlagErrorFunc(func(_ *cobra.Command, err error) error { return usageError(usage + "\n" + err.Error()) })
	registry.Mark(c, registry.CallerSession, "dyna design archive check <repo-root> --delta <spec-slug>")
	c.RunE = func(cmd *cobra.Command, args []string) error {
		if len(args) != 2 {
			return usageError("")
		}
		dryRun, _ := cmd.Flags().GetBool("dry-run")
		asJSON, _ := cmd.Flags().GetBool("json")
		root, err := filepath.Abs(args[0])
		if err != nil {
			return usageError(err.Error())
		}
		if _, err := os.Stat(filepath.Join(root, "docs")); err != nil {
			return usageError(fmt.Sprintf("%s 下没有 docs/：这不是目标仓库的根", root))
		}
		res, err := ArchiveSpec(root, args[1], dryRun)
		if err != nil {
			var ue *UsageError
			if errors.As(err, &ue) || strings.HasPrefix(err.Error(), "没有 ") {
				return usageError(err.Error())
			}
			return err
		}
		out := cmd.OutOrStdout()
		if asJSON {
			text, err := frontmatter.JSON(res.JSON(), 2)
			if err != nil {
				return err
			}
			fmt.Fprintln(out, text)
		} else {
			fmt.Fprintln(out, RenderSummary(res))
		}
		if !res.OK {
			return &nexterr.Exit{Code: 1}
		}
		return nil
	}
	return c
}
