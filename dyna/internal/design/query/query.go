package query

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/spf13/cobra"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/design/archive"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/miniyaml"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/nexterr"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/registry"
)

// Entry is one way of asking, with what its argument is called in the usage text.
type entry struct {
	name string
	arg  string
}

// Entries are the ways of asking, in the order the usage lists them.
var entries = []entry{
	{"page", "页面名"},
	{"state", "状态名"},
	{"journey", "用户路径名"},
	{"refs", "组件名、组件代码路径、动效名、<页面>#<段> 或 #<段类型>"},
	{"keyword", "一段文字"},
	{"affected", "提交（SHA、分支名、HEAD~N）：自它以来改过的代码牵到的状态"},
	{"diff", "spec 名"},
}

// EntryNames are the entries of Query.
func EntryNames() []string {
	out := make([]string, len(entries))
	for i, e := range entries {
		out[i] = e.name
	}
	return out
}

func hasEntry(name string) bool {
	for _, e := range entries {
		if e.name == name {
			return true
		}
	}
	return false
}

// Options of Query. Delta lays that requirement's `delta/` over `prod/` first (not for `diff`, which compares the
// two itself). CodeRoot is the code repository, for the one entry that reads code and its git history
// (`affected`), when that is not the same directory as the archive (the archive in a project's directory in home).
type Options struct {
	Delta    string
	CodeRoot string
}

// Query is one call for every entry: Query(root, "page", "cookbook", Options{}). `root` is the directory that
// holds the archive's `docs/`. The result marshals to the JSON the command line prints.
func Query(root, entryName, arg string, opts Options) (any, error) {
	if !hasEntry(entryName) {
		return nil, qerrCode("没有「"+entryName+"」这个入口；可用："+strings.Join(EntryNames(), "、"), "usage")
	}
	if entryName == "diff" {
		if opts.Delta != "" {
			return nil, qerrCode("diff 自己比较 delta/ 与 prod/，不接 --delta", "usage")
		}
		return Diff(root, arg)
	}
	a, err := archive.Load(root, archive.Options{Delta: opts.Delta})
	if err != nil {
		return nil, qerr(err.Error())
	}
	switch entryName {
	case "page":
		return Page(a, arg)
	case "state":
		return State(a, arg)
	case "journey":
		return Journey(a, arg)
	case "refs":
		return Refs(a, arg)
	case "keyword":
		return Keyword(a, arg)
	default:
		return Affected(a, arg, opts.CodeRoot)
	}
}

// Usage is what the command prints when it is called wrong.
func Usage() string {
	var b strings.Builder
	b.WriteString("用法：dyna design archive query <repo-root> <入口> <参数> [--delta <spec-slug>] [--code-root <代码仓库>]\n")
	b.WriteString("<repo-root> 是放着 docs/ 的目录；档案不在代码仓库里时，affected 用 --code-root 指出代码仓库。\n")
	b.WriteString("入口：\n")
	for _, e := range entries {
		b.WriteString("  " + e.name + strings.Repeat(" ", max(0, 8-len([]rune(e.name)))) + e.arg + "\n")
	}
	b.WriteString("输出 JSON；找不到对象退出码 1（原因在 stderr），用法错误或不是仓库根退出码 2。")
	return b.String()
}

// Command is `query <repo-root> <entry> <arg>`: the entries as one command line. It reads its arguments itself
// (an option may come before or after the others), so a word that starts with `-` is an argument like any other.
func Command() *cobra.Command {
	c := &cobra.Command{
		Use:                "query <repo-root> <entry> <arg>",
		Short:              "查设计档案：page / state / journey / refs / keyword / affected / diff 七种问法，输出 JSON（--delta 读某需求改完之后的样子，--code-root 给 affected 指代码仓库）",
		Args:               cobra.ArbitraryArgs,
		SilenceUsage:       true,
		SilenceErrors:      true,
		DisableFlagParsing: true,
	}
	c.Flags().String("delta", "", "某个需求（spec）的名字：把它的 docs/design/tmp/<spec>/delta/ 叠在线上档案上读")
	c.Flags().String("code-root", "", "代码仓库：档案不在代码仓库里时，affected 从这里读 git 历史")
	registry.Mark(c, registry.CallerSession, "dyna design archive check <repo-root>")
	c.RunE = func(cmd *cobra.Command, args []string) error {
		return run(cmd, args)
	}
	return c
}

func indexOf(args []string, s string) int {
	for i, a := range args {
		if a == s {
			return i
		}
	}
	return -1
}

func run(cmd *cobra.Command, args []string) error {
	usage := &nexterr.Exit{Code: 2, Msg: Usage()}
	di, ci := indexOf(args, "--delta"), indexOf(args, "--code-root")
	delta := ""
	if di >= 0 && di+1 < len(args) {
		delta = args[di+1]
	}
	codeRoot := ""
	if ci >= 0 && ci+1 < len(args) && args[ci+1] != "" {
		abs, err := filepath.Abs(args[ci+1])
		if err != nil {
			return usage
		}
		codeRoot = abs
	}
	var positional []string
	for i, a := range args {
		if a == "--delta" || a == "--code-root" || (i > 0 && (args[i-1] == "--delta" || args[i-1] == "--code-root")) {
			continue
		}
		positional = append(positional, a)
	}
	if len(positional) != 3 || (di >= 0 && delta == "") || (ci >= 0 && codeRoot == "") || !hasEntry(positional[1]) {
		return usage
	}
	entryName, arg := positional[1], positional[2]
	root, err := filepath.Abs(positional[0])
	if err != nil {
		return usage
	}
	if st, err := os.Stat(filepath.Join(root, "docs")); err != nil || st == nil {
		return &nexterr.Exit{Code: 2, Msg: root + " 下没有 docs/：这不是目标仓库的根"}
	}
	result, err := Query(root, entryName, arg, Options{Delta: delta, CodeRoot: codeRoot})
	if err != nil {
		var qe *QueryError
		if !errors.As(err, &qe) {
			return err
		}
		code := 1
		if qe.Code == "usage" {
			code = 2
		}
		return &nexterr.Exit{Code: code, Msg: qe.Msg}
	}
	if entryName == "keyword" {
		if m, ok := result.(*miniyaml.Map); ok {
			if matches, _ := m.Get("matches").([]any); len(matches) == 0 {
				return &nexterr.Exit{Code: 1, Msg: fmt.Sprintf("没有对象匹配「%s」", m.Get("query"))}
			}
		}
	}
	out, err := miniyaml.JSON(result, 2)
	if err != nil {
		return err
	}
	fmt.Fprintln(cmd.OutOrStdout(), out)
	return nil
}
