package report

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"

	"github.com/spf13/cobra"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/design/jsx"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/frontmatter"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/nexterr"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/registry"
)

const usage = "usage: dyna design report --judge <critic.json> --research <research-light.json> --diff <canvas-diff.json> --thoughts <thoughts.md> --canvas <address> [--previous <address>] [--dissatisfied <marks.json>] [--self-check <self-check.json>] --out <report.html>"

const prefix = "design-review-report: "

// required are the flags without which there is no report, in the order the usage names them.
var required = []string{"judge", "research", "diff", "thoughts", "canvas", "out"}

// Command is `design report`: the refine session builds each round's design review report with it. Exit 0 = the page
// is written to --out and the short text for the conversation is printed; 2 = an input cannot make a sound report
// (every problem is named); 1 = called wrong, or an input file cannot be read.
func Command() *cobra.Command {
	c := &cobra.Command{
		Use:           "report --judge <critic.json> --research <research-light.json> --diff <canvas-diff.json> --thoughts <thoughts.md> --canvas <address> --out <report.html>",
		Short:         "把设计收敛的一轮拼成一页设计评审报告（没声明却变了的地方、评委意见配用户路径和参考图、对人思路的评估、分数），图都内嵌；打印给对话用的摘要。输入不对退出 2 并逐条说哪一份、哪一项",
		Args:          cobra.NoArgs,
		SilenceUsage:  true,
		SilenceErrors: true,
	}
	f := c.Flags()
	f.String("judge", "", "评委的 JSON（dyna design critic round 校验过的）")
	f.String("research", "", "调研员轻用法交回的 research-light.json；其中的图按它所在的目录解析")
	f.String("diff", "", "dyna ui measure 在 canvas-diff 模式、带改动集跑出的 --json 输出")
	f.String("thoughts", "", "这一轮的 thoughts.md：一条一行，<编号> | <人的原话>")
	f.String("canvas", "", "这一版画布页的地址")
	f.String("previous", "", "上一版画布页的地址")
	f.String("dissatisfied", "", "人的不满标记 [{ opinion, quote }]，只对 direction 意见")
	f.String("self-check", "", "designer 的自检说明 [{ state, anchor, what, why }]；不传，报告不提理由")
	f.String("out", "", "报告写到这个文件")
	c.SetFlagErrorFunc(func(_ *cobra.Command, err error) error { return &nexterr.Exit{Code: 1, Msg: usage} })
	c.Args = func(cmd *cobra.Command, args []string) error {
		if len(args) > 0 {
			return &nexterr.Exit{Code: 1, Msg: usage}
		}
		return nil
	}
	registry.Mark(c, registry.CallerSession, "dyna design report --judge <critic.json> --research <research-light.json> --diff <canvas-diff.json> --thoughts <thoughts.md> --canvas <address> --self-check <self-check.json> --out <report.html>")
	c.RunE = func(cmd *cobra.Command, _ []string) error {
		flag := func(name string) string { v, _ := cmd.Flags().GetString(name); return v }
		var need []string
		for _, k := range required {
			if flag(k) == "" {
				need = append(need, "--"+k)
			}
		}
		if len(need) > 0 {
			return &nexterr.Exit{Code: 1, Msg: usage + "\n  missing: " + strings.Join(need, " ")}
		}
		researchFile, err := filepath.Abs(flag("research"))
		if err != nil {
			return &nexterr.Exit{Code: 1, Msg: prefix + err.Error()}
		}
		research, err := readJSON(researchFile)
		if err != nil {
			return err
		}
		// The researcher writes image paths relative to its own file; the area shots from ui measure are absolute.
		resolveImages(research, filepath.Dir(researchFile))
		judge, err := readJSON(flag("judge"))
		if err != nil {
			return err
		}
		diff, err := readJSON(flag("diff"))
		if err != nil {
			return err
		}
		text, err := os.ReadFile(flag("thoughts"))
		if err != nil {
			return &nexterr.Exit{Code: 1, Msg: prefix + "cannot read " + flag("thoughts") + ": " + reason(err)}
		}
		in := Inputs{Judge: judge, Research: research, Diff: diff, Canvas: Canvas{Current: flag("canvas"), Previous: flag("previous")}, ReadImage: readImage}
		if p := flag("dissatisfied"); p != "" {
			if in.Dissatisfied, err = readJSON(p); err != nil {
				return err
			}
			if in.Dissatisfied == nil {
				in.Dissatisfied = "null" // a JSON null is not an array: refused like any other non-array
			}
		}
		if p := flag("self-check"); p != "" {
			if in.SelfCheck, err = readJSON(p); err != nil {
				return err
			}
			in.HasSelfCheck = true
		}
		thoughts, err := ParseThoughts(string(text))
		if err != nil {
			return &nexterr.Exit{Code: 2, Msg: prefix + err.Error()}
		}
		in.Thoughts = thoughts
		rep, err := Build(in)
		if err != nil {
			return &nexterr.Exit{Code: 2, Msg: prefix + err.Error()}
		}
		if err := os.WriteFile(flag("out"), []byte(rep.HTML), 0o644); err != nil {
			return &nexterr.Exit{Code: 2, Msg: prefix + err.Error()}
		}
		for _, c := range rep.UnmatchedSelfCheck {
			fmt.Fprintf(cmd.ErrOrStderr(), "%sself-check entry %s · %s matches neither an undeclared nor a declared change, so it is not on the page\n", prefix, c.State, c.Anchor)
		}
		fmt.Fprintln(cmd.OutOrStdout(), rep.Summary)
		return nil
	}
	return c
}

func reason(err error) string {
	var pe *fs.PathError
	if errors.As(err, &pe) {
		return pe.Err.Error()
	}
	return err.Error()
}

func readJSON(path string) (any, error) {
	raw, err := os.ReadFile(path)
	var v any
	if err == nil {
		v, err = jsx.ParseJSON(raw)
	}
	if err != nil {
		return nil, &nexterr.Exit{Code: 1, Msg: prefix + "cannot read " + path + ": " + reason(err)}
	}
	return v, nil
}

func readImage(path string) ([]byte, error) {
	if _, err := os.Stat(path); err != nil {
		return nil, errors.New("file does not exist")
	}
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, errors.New(reason(err))
	}
	return b, nil
}

// resolveImages makes each relative picture path of the researcher's steps relative to dir.
func resolveImages(research any, dir string) {
	items, _ := asList(get(research, "items"))
	for _, item := range items {
		path, _ := asList(get(item, "path"))
		for _, s := range path {
			sm, ok := frontmatter.AsMap(s)
			if !ok {
				continue
			}
			images, ok := asList(sm.Get("images"))
			if !ok {
				if !sm.Has("images") || sm.Get("images") == nil {
					sm.Set("images", []any{})
				}
				continue
			}
			out := make([]any, len(images))
			for i, p := range images {
				if s, isStr := p.(string); isStr && !filepath.IsAbs(s) {
					out[i] = filepath.Join(dir, s)
				} else {
					out[i] = p
				}
			}
			sm.Set("images", out)
		}
	}
}
