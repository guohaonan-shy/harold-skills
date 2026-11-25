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
	root := registry.Group("git", "在代码仓库里落地：只 add 给定的文件、提交、推送、合并（--repo 代替手写 git -C）")
	root.AddCommand(commitCommand(d), pushCommand(d), mergeCommand(d))
	return root
}

const repoUsage = "仓库目录（相当于 git -C <目录>）；不给就用当前目录"

func commitCommand(d Deps) *cobra.Command {
	c := leaf("commit [文件]...", "只 add 给定的文件并提交，工作区和暂存区里别的改动不进这个提交；--empty 提没有文件改动的提交；打印新提交的完整 SHA",
		"dyna git commit --repo <目录> -m <说明> <文件>...", func(cmd *cobra.Command, args []string) error {
			repo, _ := cmd.Flags().GetString("repo")
			msgs, _ := cmd.Flags().GetStringArray("message")
			if empty, _ := cmd.Flags().GetBool("empty"); empty {
				return commitEmpty(d, repo, msgs, args)
			}
			if len(args) == 0 {
				return nexterr.New("dyna git commit --repo <目录> -m <说明> <文件>...（要提没有文件改动的提交，加 --empty、不给文件）", "没有给文件：要提交哪些文件得写出来")
			}
			return commit(d, repo, msgs, args)
		})
	c.Args = cobra.ArbitraryArgs
	c.Flags().String("repo", "", repoUsage)
	c.Flags().Bool("empty", false, "提一个没有文件改动的提交：只给 -m，不给文件；暂存区里别的改动不进这个提交")
	c.Flags().StringArrayP("message", "m", nil, "提交说明；可重复，每个 -m 一段（跟 git commit 一样，末尾的署名行单独一段）")
	return c
}

// hasMessage reports whether at least one -m holds text.
func hasMessage(msgs []string) bool {
	for _, m := range msgs {
		if strings.TrimSpace(m) != "" {
			return true
		}
	}
	return false
}

// commitEmpty makes a commit that changes no file. It is `commit --only` with nothing named, so what is staged
// for other work stays staged and out of the commit, as in the file form.
func commitEmpty(d Deps, repo string, msgs, files []string) error {
	if len(files) > 0 {
		return nexterr.New("dyna git commit"+repoArg(repo)+" -m <说明> "+strings.Join(files, " "),
			"--empty 提的是没有文件改动的提交，不能再给文件（%s）：要提交文件就去掉 --empty", strings.Join(files, "、"))
	}
	if !hasMessage(msgs) {
		return nexterr.New("dyna git commit --empty"+repoArg(repo)+" -m <说明>", "没有提交说明：-m 要给，而且不能是空的")
	}
	if merging(repo) {
		return nexterr.New(commitNext(repo, "<说明>"), "合并还没提交，先把它提交，再提空提交")
	}
	cargs := []string{"commit", "-q", "--allow-empty", "--only"}
	for _, m := range msgs {
		cargs = append(cargs, "-m", m)
	}
	if _, err := gitrun.Run(repo, cargs...); err != nil {
		return err
	}
	return printHead(d, repo)
}

func commit(d Deps, repo string, msgs, files []string) error {
	if !hasMessage(msgs) {
		return nexterr.New("dyna git commit --repo <目录> -m <说明> <文件>...", "没有提交说明：-m 要给，而且不能是空的")
	}
	for _, f := range files {
		if err := mustExist(repo, f); err != nil {
			return err
		}
	}
	if merging(repo) {
		if left := withConflictMarkers(repo, files); len(left) > 0 {
			return nexterr.New(commitNext(repo, "<说明>"),
				"这些文件里还留着冲突标记（<<<<<<<），合并没有提交：%s", strings.Join(left, "、"))
		}
	}
	if _, err := gitrun.Run(repo, append([]string{"add", "--"}, files...)...); err != nil {
		return err
	}
	if merging(repo) {
		return concludeMerge(d, repo, msgs, files)
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
	return printHead(d, repo)
}

// printHead prints the full SHA of HEAD and its subject line.
func printHead(d Deps, repo string) error {
	sha, err := gitrun.Run(repo, "rev-parse", "HEAD")
	if err != nil {
		return err
	}
	subject, _ := gitrun.Run(repo, "log", "-1", "--format=%s")
	fmt.Fprintf(d.out(), "%s %s\n", strings.TrimSpace(sha), strings.TrimSpace(subject))
	return nil
}

// merging reports whether a merge is waiting to be concluded in repo.
func merging(repo string) bool {
	_, err := gitrun.Run(repo, "rev-parse", "-q", "--verify", "MERGE_HEAD")
	return err == nil
}

// unmerged lists the files a merge left in conflict.
func unmerged(repo string) []string {
	out, _ := gitrun.Run(repo, "diff", "--name-only", "--diff-filter=U")
	var fs []string
	for _, l := range strings.Split(out, "\n") {
		if l = strings.TrimSpace(l); l != "" {
			fs = append(fs, l)
		}
	}
	return fs
}

// withConflictMarkers returns the files that still hold a line starting with the conflict-start marker, because
// `git add` would take such a file as resolved.
func withConflictMarkers(repo string, files []string) []string {
	var left []string
	for _, f := range files {
		p := f
		if !filepath.IsAbs(p) {
			p = filepath.Join(repo, f)
		}
		data, err := os.ReadFile(p)
		if err != nil {
			continue
		}
		if strings.HasPrefix(string(data), "<<<<<<< ") || strings.Contains(string(data), "\n<<<<<<< ") {
			left = append(left, f)
		}
	}
	return left
}

// concludeMerge commits a merge that stopped on conflicts. Git refuses a commit limited to some paths while a
// merge is open, so the files named are added and the merge is committed whole: everything the merge brought in
// goes into this one commit.
func concludeMerge(d Deps, repo string, msgs, files []string) error {
	if left := unmerged(repo); len(left) > 0 {
		return nexterr.New(commitNext(repo, "<说明>")+"（先把这些文件里的冲突标记解决掉）",
			"合并还没完成，这些文件还有冲突：%s", strings.Join(left, "、"))
	}
	cargs := []string{"commit", "-q"}
	for _, m := range msgs {
		cargs = append(cargs, "-m", m)
	}
	if _, err := gitrun.Run(repo, cargs...); err != nil {
		return err
	}
	return printHead(d, repo)
}

// commitNext is the `dyna git commit` line to run after fixing conflicts.
func commitNext(repo, msg string) string {
	return "dyna git commit" + repoArg(repo) + " -m " + msg + " <冲突文件>..."
}

func repoArg(repo string) string {
	if repo == "" {
		return ""
	}
	return " --repo " + repo
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
			return nexterr.New(fmt.Sprintf("dyna git merge%s %s/%s（有冲突就解决后用 dyna git commit 提交；合并完再跑 dyna git push）", repoArg(repo), remote, branch),
				"远端 %s/%s 有本地没有的提交，推送被拒绝，远端没有变化", remote, branch)
		}
		return err
	}
	fmt.Fprintf(d.out(), "已推送 %s → %s/%s\n", branch, remote, branch)
	return nil
}

func mergeCommand(d Deps) *cobra.Command {
	c := leaf("merge <提交或远端分支>", "把给定的提交或远端分支（如 origin/main）合进当前分支；远端分支先取最新；有冲突就停下，列出冲突文件，不自动解决",
		"dyna git merge --repo <目录> <提交或远端分支>", func(cmd *cobra.Command, args []string) error {
			repo, _ := cmd.Flags().GetString("repo")
			return merge(d, repo, args[0])
		})
	c.Args = cobra.ExactArgs(1)
	c.Flags().String("repo", "", repoUsage)
	return c
}

func merge(d Deps, repo, ref string) error {
	if merging(repo) {
		return nexterr.New(commitNext(repo, "<说明>"), "上一次合并还没完成，先把它提交，或用 git merge --abort 放弃")
	}
	if remote, branch, ok := remoteBranch(repo, ref); ok {
		if _, err := gitrun.Run(repo, "fetch", "-q", remote, branch); err != nil {
			return err
		}
	}
	before, err := gitrun.Run(repo, "rev-parse", "HEAD")
	if err != nil {
		return err
	}
	if _, err := gitrun.Run(repo, "merge", "--no-edit", "-q", ref); err != nil {
		if left := unmerged(repo); len(left) > 0 {
			return nexterr.New(commitNext(repo, "<说明>")+"（先解决这些文件里的冲突；不想合就 git merge --abort）",
				"合并 %s 有冲突，没有自动解决，冲突的文件：%s", ref, strings.Join(left, "、"))
		}
		return err
	}
	after, err := gitrun.Run(repo, "rev-parse", "HEAD")
	if err != nil {
		return err
	}
	if strings.TrimSpace(before) == strings.TrimSpace(after) {
		fmt.Fprintf(d.out(), "%s 已经在当前分支里，没有产生新提交\n", ref)
		return nil
	}
	return printHead(d, repo)
}

// remoteBranch splits "origin/main" into the remote and the branch when its first part is a remote of repo.
func remoteBranch(repo, ref string) (remote, branch string, ok bool) {
	i := strings.Index(ref, "/")
	if i <= 0 || i == len(ref)-1 {
		return "", "", false
	}
	out, err := gitrun.Run(repo, "remote")
	if err != nil {
		return "", "", false
	}
	for _, r := range strings.Fields(out) {
		if r == ref[:i] {
			return r, ref[i+1:], true
		}
	}
	return "", "", false
}
