// Package worktree is the `worktree` module: make, list and remove the git worktrees sessions work in, and the
// guard that stops a hand-written `git worktree remove` (it neither unlocks nor deletes the branch).
//
// Where a worktree goes and which branch it gets follow runtime/magi.md at the plugin root (「会话管理」的「调度」
// 里的「怎么交出 issue」, and 「worktree 的清理」), which runtime/claude-desktop.md repeats: beside the main checkout, in
// `<main checkout's parent>/<repository name>-worktrees/<name>`, on `issue/<name>`, from `origin/<base>`.
package worktree

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/spf13/cobra"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/gitrun"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/nexterr"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/registry"
)

// Deps is what the commands reach outside the process through.
type Deps struct {
	Stdin  io.Reader
	Stdout io.Writer
}

func (d Deps) out() io.Writer {
	if d.Stdout == nil {
		return os.Stdout
	}
	return d.Stdout
}

func leaf(use, short, caller, next string, run func(cmd *cobra.Command, args []string) error) *cobra.Command {
	c := &cobra.Command{Use: use, Short: short, SilenceUsage: true, SilenceErrors: true, RunE: run}
	registry.Mark(c, caller, next)
	return c
}

// Command is the `worktree` module.
func Command(d Deps) *cobra.Command {
	root := registry.Group("worktree", "git worktree 的建、列、删（删时先解锁、再删 worktree、再删分支），和拦手写 git worktree remove 的护栏")
	root.AddCommand(addCommand(d), listCommand(d), removeCommand(d), guardCommand(d))
	return root
}

const repoUsage = "主 checkout 的目录（建和删用同一个路径）；不给就用当前目录"

// entry is one worktree as `git worktree list --porcelain` reports it.
type entry struct {
	Path     string
	Branch   string // short name; empty when detached
	Detached bool
	Locked   bool
}

func listEntries(repo string) ([]entry, error) {
	out, err := gitrun.Run(repo, "worktree", "list", "--porcelain")
	if err != nil {
		return nil, err
	}
	var all []entry
	var cur *entry
	for _, line := range strings.Split(out, "\n") {
		switch {
		case strings.HasPrefix(line, "worktree "):
			all = append(all, entry{Path: strings.TrimPrefix(line, "worktree ")})
			cur = &all[len(all)-1]
		case cur == nil:
		case strings.HasPrefix(line, "branch "):
			cur.Branch = strings.TrimPrefix(strings.TrimPrefix(line, "branch "), "refs/heads/")
		case line == "detached":
			cur.Detached = true
		case line == "locked" || strings.HasPrefix(line, "locked "):
			cur.Locked = true
		}
	}
	return all, nil
}

// realPath is p with symlinks resolved when it exists, so two spellings of one directory compare equal.
func realPath(p string) string {
	if abs, err := filepath.Abs(p); err == nil {
		p = abs
	}
	if r, err := filepath.EvalSymlinks(p); err == nil {
		return r
	}
	return p
}

// findEntry is the worktree at path, if the repository lists one there.
func findEntry(all []entry, path string) (entry, int, bool) {
	want := realPath(path)
	for i, e := range all {
		if realPath(e.Path) == want {
			return e, i, true
		}
	}
	return entry{}, -1, false
}

// mainCheckout is the main checkout of the repository that dir (or the current directory) belongs to. When dir
// is itself the main checkout it is returned as spelled, so adding and removing use the same path.
func mainCheckout(dir string) (string, error) {
	out, err := gitrun.Run(dir, "rev-parse", "--path-format=absolute", "--git-dir", "--git-common-dir", "--show-toplevel")
	if err != nil {
		return "", nexterr.New("dyna worktree list --repo <主 checkout>", "%s 不在一个 git 仓库里：%v", dirOrCwd(dir), err)
	}
	lines := strings.Split(strings.TrimSpace(out), "\n")
	if len(lines) < 3 {
		return "", fmt.Errorf("读不懂 git rev-parse 的输出：%q", out)
	}
	gitDir, common, top := lines[0], lines[1], lines[2]
	if realPath(gitDir) != realPath(common) { // inside a linked worktree
		return filepath.Dir(common), nil
	}
	if dir != "" && realPath(dir) == realPath(top) {
		abs, _ := filepath.Abs(dir)
		return abs, nil
	}
	return top, nil
}

func dirOrCwd(dir string) string {
	if dir != "" {
		return dir
	}
	wd, _ := os.Getwd()
	return wd
}

func refExists(repo, ref string) bool {
	_, err := gitrun.Run(repo, "show-ref", "--verify", "--quiet", ref)
	return err == nil
}

// ---------- add ----------

func addCommand(d Deps) *cobra.Command {
	c := leaf("add <名字>", "在主 checkout 旁边建 worktree（<上一级>/<仓库名>-worktrees/<名字>），打印它的路径；分支默认 issue/<名字>，已有就接上，路径上已经是这条分支的 worktree 就直接给回",
		registry.CallerSession, "dyna worktree add <名字> --repo <主 checkout> --base <基准分支>", func(cmd *cobra.Command, args []string) error {
			f := cmd.Flags()
			repo, _ := f.GetString("repo")
			base, _ := f.GetString("base")
			branch, _ := f.GetString("branch")
			path, _ := f.GetString("path")
			detach, _ := f.GetBool("detach")
			return add(d, addOpts{repo: repo, name: args[0], base: base, branch: branch, path: path, detach: detach})
		})
	c.Args = cobra.ExactArgs(1)
	c.Flags().String("repo", "", repoUsage)
	c.Flags().String("base", "", "基准分支（DEVELOPMENT.md「分支」节写的）；新建分支或游离 worktree 时从 origin/<基准分支> 起，必须给")
	c.Flags().String("branch", "", "分支名；不给就是 issue/<名字>（issue 已经有分支就写它）")
	c.Flags().String("path", "", "worktree 的路径；不给就是 <主 checkout 的上一级>/<仓库名>-worktrees/<名字>")
	c.Flags().Bool("detach", false, "不建分支，游离在 origin/<基准分支> 上（triage 会话用）")
	return c
}

type addOpts struct {
	repo, name, base, branch, path string
	detach                         bool
}

func add(d Deps, o addOpts) error {
	const next = "dyna worktree add <名字> --repo <主 checkout> --base <基准分支>"
	main, err := mainCheckout(o.repo)
	if err != nil {
		return err
	}
	path := o.path
	if path == "" {
		path = filepath.Join(filepath.Dir(main), filepath.Base(main)+"-worktrees", o.name)
	}
	if abs, err := filepath.Abs(path); err == nil {
		path = abs
	}
	branch := o.branch
	if branch == "" && !o.detach {
		branch = "issue/" + o.name
	}

	if _, err := os.Lstat(path); err == nil {
		all, err := listEntries(main)
		if err != nil {
			return err
		}
		e, _, ok := findEntry(all, path)
		switch {
		case ok && o.detach && e.Detached, ok && !o.detach && e.Branch == branch:
			fmt.Fprintln(d.out(), path)
			return nil
		case ok:
			return nexterr.New("dyna worktree list --repo "+main, "%s 已经是一个 worktree，但不是 %s", path, describe(o.detach, branch))
		}
		return nexterr.New("dyna worktree list --repo "+main, "%s 已经存在，不是这个仓库的 worktree，没有动它", path)
	}

	var gargs []string
	switch {
	case o.detach:
		ref, err := baseRef(main, o.base, next)
		if err != nil {
			return err
		}
		gargs = []string{"worktree", "add", "-q", "--detach", path, ref}
	case refExists(main, "refs/heads/"+branch):
		gargs = []string{"worktree", "add", "-q", path, branch}
	case refExists(main, "refs/remotes/origin/"+branch):
		gargs = []string{"worktree", "add", "-q", "--track", "-b", branch, path, "origin/" + branch}
	default:
		ref, err := baseRef(main, o.base, next)
		if err != nil {
			return err
		}
		gargs = []string{"worktree", "add", "-q", path, "-b", branch, ref}
	}
	if _, err := gitrun.Run(main, gargs...); err != nil {
		return err
	}
	fmt.Fprintln(d.out(), path)
	return nil
}

func describe(detach bool, branch string) string {
	if detach {
		return "游离的"
	}
	return "分支 " + branch + " 的"
}

// baseRef is origin/<base>, which must exist.
func baseRef(main, base, next string) (string, error) {
	if base == "" {
		return "", nexterr.New(next, "要新建分支（或游离 worktree），--base 要给：从 origin/<基准分支> 起；基准分支看 DEVELOPMENT.md「分支」节")
	}
	ref := "origin/" + base
	if !refExists(main, "refs/remotes/"+ref) {
		return "", nexterr.New("git -C "+main+" fetch origin，再重跑 dyna worktree add", "%s 不存在，没有建 worktree", ref)
	}
	return ref, nil
}

// ---------- list ----------

func listCommand(d Deps) *cobra.Command {
	c := leaf("list", "列出这个仓库的 worktree：路径、分支（游离的写 (detached)）、锁（locked），用制表符隔开",
		registry.CallerSession, "dyna worktree list --repo <主 checkout>", func(cmd *cobra.Command, args []string) error {
			repo, _ := cmd.Flags().GetString("repo")
			main, err := mainCheckout(repo)
			if err != nil {
				return err
			}
			all, err := listEntries(main)
			if err != nil {
				return err
			}
			for _, e := range all {
				br := e.Branch
				if br == "" {
					br = "(detached)"
				}
				lock := ""
				if e.Locked {
					lock = "locked"
				}
				fmt.Fprintf(d.out(), "%s\t%s\t%s\n", e.Path, br, lock)
			}
			return nil
		})
	c.Args = cobra.NoArgs
	c.Flags().String("repo", "", repoUsage)
	return c
}

// ---------- remove ----------

func removeCommand(d Deps) *cobra.Command {
	c := leaf("remove <路径>", "删 worktree：先解锁、再删 worktree、再删它的分支（--keep-branch 保留）；里面有没提交的改动就拒绝（--force 才删）",
		registry.CallerSession, "dyna worktree list --repo <主 checkout>", func(cmd *cobra.Command, args []string) error {
			f := cmd.Flags()
			repo, _ := f.GetString("repo")
			keep, _ := f.GetBool("keep-branch")
			force, _ := f.GetBool("force")
			return remove(d, repo, args[0], keep, force)
		})
	c.Args = cobra.ExactArgs(1)
	c.Flags().String("repo", "", repoUsage+"；不给就从 worktree 自己找到它的主 checkout")
	c.Flags().Bool("keep-branch", false, "不删分支（默认删，不论合并没合并：该不该删由调用方判断）")
	c.Flags().Bool("force", false, "里面有没提交的改动也删")
	return c
}

func remove(d Deps, repo, path string, keepBranch, force bool) error {
	const list = "dyna worktree list --repo <主 checkout>"
	if repo == "" {
		if _, err := os.Stat(path); err != nil {
			return nexterr.New(list, "%s 不存在，不知道它属于哪个仓库：给 --repo <主 checkout>", path)
		}
		repo = path
	}
	main, err := mainCheckout(repo)
	if err != nil {
		return err
	}
	all, err := listEntries(main)
	if err != nil {
		return err
	}
	e, idx, ok := findEntry(all, path)
	if !ok {
		return nexterr.New("dyna worktree list --repo "+main, "%s 不是 %s 的 worktree，没有删任何东西", path, main)
	}
	if idx == 0 {
		return nexterr.New("dyna worktree list --repo "+main, "%s 是主 checkout，不是能删的 worktree", path)
	}

	// Everything that can refuse is checked before anything is changed.
	if e.Branch != "" && !keepBranch {
		if isBase(main, e.Branch) {
			return nexterr.New("dyna worktree remove "+path+" --keep-branch", "分支 %s 是基准分支，不跟着 worktree 删；只删 worktree 就加 --keep-branch", e.Branch)
		}
	}
	if !force {
		status, err := gitrun.Run(e.Path, "status", "--porcelain")
		if err != nil {
			return err
		}
		if s := strings.TrimSpace(status); s != "" {
			return nexterr.New("先提交或丢掉这些改动再重跑；确定不要了就 dyna worktree remove "+path+" --force",
				"%s 里有没提交的改动，没有删任何东西：\n%s", e.Path, indent(s))
		}
	}

	if e.Locked {
		if _, err := gitrun.Run(main, "worktree", "unlock", e.Path); err != nil {
			return err
		}
	}
	rargs := []string{"worktree", "remove"}
	if force {
		rargs = append(rargs, "--force")
	}
	if _, err := gitrun.Run(main, append(rargs, e.Path)...); err != nil {
		if strings.Contains(err.Error(), "does not point back") {
			return nexterr.New(fmt.Sprintf("确认 git -C %s status --porcelain 没有输出后，删掉目录 %s，再 git -C %s worktree prune；之后要删分支就 git -C %s branch -D %s",
				e.Path, e.Path, main, main, e.Branch),
				"git 认为 %s 和主 checkout 互相对不上（同一个目录用了两个路径），没有删任何东西：%v", e.Path, err)
		}
		return err
	}
	fmt.Fprintf(d.out(), "已删除 worktree %s\n", e.Path)
	switch {
	case e.Branch == "":
	case keepBranch:
		fmt.Fprintf(d.out(), "保留分支 %s\n", e.Branch)
	default:
		if _, err := gitrun.Run(main, "branch", "-q", "-D", e.Branch); err != nil {
			return nexterr.Plain("worktree 已经删了，分支 %s 没删掉：%v", e.Branch, err)
		}
		fmt.Fprintf(d.out(), "已删除分支 %s\n", e.Branch)
	}
	return nil
}

// isBase says whether branch is one the repository's work is based on, which no worktree removal may delete.
func isBase(main, branch string) bool {
	if branch == "main" || branch == "master" {
		return true
	}
	out, err := gitrun.Run(main, "symbolic-ref", "--short", "refs/remotes/origin/HEAD")
	return err == nil && strings.TrimPrefix(strings.TrimSpace(out), "origin/") == branch
}

func indent(s string) string {
	lines := strings.Split(s, "\n")
	const max = 10
	if len(lines) > max {
		lines = append(lines[:max], fmt.Sprintf("…还有 %d 行", len(lines)-max))
	}
	return "  " + strings.Join(lines, "\n  ")
}
