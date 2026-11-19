// Package git is the `git` module: landing work in a code repository — add only the files you name, commit,
// push — in place of hand-written `git add` / `git commit` / `git push` and `git -C <dir>`.
package git

import (
	"errors"
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
	Stdout io.Writer
}

func (d Deps) out() io.Writer {
	if d.Stdout == nil {
		return os.Stdout
	}
	return d.Stdout
}

func leaf(use, short, next string, run func(cmd *cobra.Command, args []string) error) *cobra.Command {
	c := &cobra.Command{Use: use, Short: short, SilenceUsage: true, SilenceErrors: true, RunE: run}
	registry.Mark(c, registry.CallerSession, next)
	return c
}

// Command is the `git` module.
func Command(d Deps) *cobra.Command {
	root := registry.Group("git", "在代码仓库里落地：只 add 给定的文件、提交、推送（--repo 代替手写 git -C）")
	root.AddCommand(commitCommand(d), pushCommand(d))
	return root
}

const repoUsage = "仓库目录（相当于 git -C <目录>）；不给就用当前目录"

func commitCommand(d Deps) *cobra.Command {
	c := leaf("commit <文件>...", "只 add 给定的文件并提交，工作区和暂存区里别的改动不进这个提交；打印新提交的完整 SHA",
		"dyna git commit --repo <目录> -m <说明> <文件>...", func(cmd *cobra.Command, args []string) error {
			repo, _ := cmd.Flags().GetString("repo")
			msgs, _ := cmd.Flags().GetStringArray("message")
			return commit(d, repo, msgs, args)
		})
	c.Args = cobra.MinimumNArgs(1)
	c.Flags().String("repo", "", repoUsage)
	c.Flags().StringArrayP("message", "m", nil, "提交说明；可重复，每个 -m 一段（跟 git commit 一样，末尾的署名行单独一段）")
	return c
}

func commit(d Deps, repo string, msgs, files []string) error {
	empty := true
	for _, m := range msgs {
		if strings.TrimSpace(m) != "" {
			empty = false
		}
	}
	if empty {
		return nexterr.New("dyna git commit --repo <目录> -m <说明> <文件>...", "没有提交说明：-m 要给，而且不能是空的")
	}
	for _, f := range files {
		if err := mustExist(repo, f); err != nil {
			return err
		}
	}
	if _, err := gitrun.Run(repo, append([]string{"add", "--"}, files...)...); err != nil {
		return err
	}
	staged, err := gitrun.Run(repo, append([]string{"diff", "--cached", "--name-only", "--"}, files...)...)
	if err != nil {
		return err
	}
	if strings.TrimSpace(staged) == "" {
		return nexterr.New("dyna git commit --repo <目录> -m <说明> <有改动的文件>...",
			"%s 没有要提交的改动，没有产生提交", strings.Join(files, "、"))
	}
	// `commit -- <paths>` takes only those paths, whatever else is staged.
	cargs := []string{"commit", "-q"}
	for _, m := range msgs {
		cargs = append(cargs, "-m", m)
	}
	cargs = append(cargs, "--")
	if _, err := gitrun.Run(repo, append(cargs, files...)...); err != nil {
		return err
	}
	sha, err := gitrun.Run(repo, "rev-parse", "HEAD")
	if err != nil {
		return err
	}
	subject, _ := gitrun.Run(repo, "log", "-1", "--format=%s")
	fmt.Fprintf(d.out(), "%s %s\n", strings.TrimSpace(sha), strings.TrimSpace(subject))
	return nil
}

// mustExist checks a file the caller named is in the working tree or tracked (a deletion to commit).
func mustExist(repo, f string) error {
	p := f
	if !filepath.IsAbs(p) {
		p = filepath.Join(repo, f)
	}
	if _, err := os.Lstat(p); err == nil {
		return nil
	}
	if _, err := gitrun.Run(repo, "ls-files", "--error-unmatch", "--", f); err == nil {
		return nil
	}
	return nexterr.New("dyna git commit --repo <目录> -m <说明> <文件>...", "%s 不存在，也不是已跟踪的文件，没有产生提交", f)
}

func pushCommand(d Deps) *cobra.Command {
	c := leaf("push [branch]", "把分支推到远端并记下它跟踪的远端分支；不给分支就推当前分支；不强推",
		"dyna git push --repo <目录>", func(cmd *cobra.Command, args []string) error {
			repo, _ := cmd.Flags().GetString("repo")
			remote, _ := cmd.Flags().GetString("remote")
			branch := ""
			if len(args) > 0 {
				branch = args[0]
			}
			return push(d, repo, remote, branch)
		})
	c.Args = cobra.MaximumNArgs(1)
	c.Flags().String("repo", "", repoUsage)
	c.Flags().String("remote", "origin", "远端名")
	return c
}

func push(d Deps, repo, remote, branch string) error {
	if branch == "" {
		out, err := gitrun.Run(repo, "rev-parse", "--abbrev-ref", "HEAD")
		if err != nil {
			return err
		}
		branch = strings.TrimSpace(out)
		if branch == "HEAD" {
			return nexterr.New("dyna git push --repo <目录> <分支>", "当前是游离的 HEAD，不知道推哪个分支")
		}
	}
	if _, err := gitrun.Run(repo, "push", "-q", "-u", remote, branch); err != nil {
		var ge *gitrun.Error
		if errors.As(err, &ge) && strings.Contains(ge.Stderr, "rejected") {
			dir := repo
			if dir == "" {
				dir = "."
			}
			return nexterr.New(fmt.Sprintf("git -C %s fetch %s && git -C %s merge %s/%s（解决冲突、提交后再跑 dyna git push）", dir, remote, dir, remote, branch),
				"远端 %s/%s 有本地没有的提交，推送被拒绝，远端没有变化", remote, branch)
		}
		return err
	}
	fmt.Fprintf(d.out(), "已推送 %s → %s/%s\n", branch, remote, branch)
	return nil
}
