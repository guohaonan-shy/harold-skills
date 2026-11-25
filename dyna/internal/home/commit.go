package home

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/nexterr"
)

// CommitResult is what Commit did: whether a commit was made, its SHA, and the lines to tell the caller.
type CommitResult struct {
	Committed bool
	SHA       string
	Lines     []string
}

type gitRun struct {
	out, err string
	code     int
}

func git(dir string, timeout time.Duration, args ...string) gitRun {
	ctx := context.Background()
	if timeout > 0 {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, timeout)
		defer cancel()
	}
	cmd := exec.CommandContext(ctx, "git", args...)
	cmd.Dir = dir
	cmd.Env = append(os.Environ(), "GIT_TERMINAL_PROMPT=0")
	var so, se bytes.Buffer
	cmd.Stdout, cmd.Stderr = &so, &se
	err := cmd.Run()
	r := gitRun{out: so.String(), err: se.String()}
	if err != nil {
		var ee *exec.ExitError
		if errors.As(err, &ee) {
			r.code = ee.ExitCode()
		} else {
			r.code = -1
			r.err += err.Error()
		}
	}
	return r
}

func (r gitRun) text() string {
	if s := strings.TrimSpace(r.err); s != "" {
		return s
	}
	return strings.TrimSpace(r.out)
}

// gitRetry waits a second and tries once more when another session holds the index.
func gitRetry(dir string, args ...string) gitRun {
	r := git(dir, 0, args...)
	if r.code != 0 && strings.Contains(r.err, "index.lock") {
		time.Sleep(time.Second)
		r = git(dir, 0, args...)
	}
	return r
}

func must(r gitRun, what string) (string, error) {
	if r.code != 0 {
		return "", fmt.Errorf("%s失败：%s", what, r.text())
	}
	return strings.TrimSpace(r.out), nil
}

// Commit commits exactly files (relative to cwd, or absolute) to the branch checked out in home, then pulls
// --rebase and pushes when home has an origin. It refuses, and commits nothing, when a file is not inside home,
// home is not a git repository, git refuses, or the docs/ of a project the files belong to breaks one of the
// two rules of CheckDocs (a slug two files share, a `[[…]]` that points at no file).
func Commit(message string, files []string, cwd string, env Env) (CommitResult, error) {
	h := Dir(env)
	if message == "" {
		return CommitResult{}, errors.New("commit 要带提交消息：commit <消息> <文件>...")
	}
	if len(files) == 0 {
		return CommitResult{}, errors.New("commit 要列出文件：commit <消息> <文件>...")
	}
	if !exists(h) {
		return CommitResult{}, fmt.Errorf("home 不存在：%s", h)
	}
	realHome, err := filepath.EvalSymlinks(h)
	if err != nil {
		return CommitResult{}, err
	}
	var paths []string
	for _, f := range files {
		p := f
		if !filepath.IsAbs(p) {
			p = filepath.Join(cwd, p)
		}
		real := realish(p)
		if !strings.HasPrefix(real, realHome+string(filepath.Separator)) {
			return CommitResult{}, fmt.Errorf("%s 不在 home（%s）里，什么都没提交", f, h)
		}
		paths = append(paths, real[len(realHome)+1:])
	}
	if git(realHome, 0, "rev-parse", "--git-dir").code != 0 {
		return CommitResult{}, fmt.Errorf("%s 不是 git 仓库", h)
	}
	if err := guardDocs(realHome, paths); err != nil {
		return CommitResult{}, err
	}

	if _, err := must(gitRetry(realHome, append([]string{"add", "--"}, paths...)...), "git add "); err != nil {
		return CommitResult{}, err
	}
	var lines []string
	sha := ""
	status, err := must(git(realHome, 0, append([]string{"status", "--porcelain", "--"}, paths...)...), "git status ")
	if err != nil {
		return CommitResult{}, err
	}
	if status == "" {
		lines = append(lines, "列出的文件没有改动，没提交")
	} else {
		if _, err := must(gitRetry(realHome, append([]string{"commit", "-q", "-m", message, "--"}, paths...)...), "git commit "); err != nil {
			return CommitResult{}, err
		}
		if sha, err = must(git(realHome, 0, "rev-parse", "HEAD"), "git rev-parse "); err != nil {
			return CommitResult{}, err
		}
		lines = append(lines, fmt.Sprintf("已提交到 home：%s %s", sha[:7], strings.SplitN(message, "\n", 2)[0]))
	}

	if git(realHome, 0, "remote", "get-url", "origin").code == 0 {
		notPushed := func(why string) { lines = append(lines, "home 没推上去："+why) }
		branch := strings.TrimSpace(git(realHome, 0, "symbolic-ref", "--short", "HEAD").out)
		if branch == "" {
			notPushed("home 不在任何分支上")
		} else {
			onRemote := git(realHome, time.Minute, "ls-remote", "--exit-code", "--heads", "origin", branch)
			ok := true
			switch {
			case onRemote.code == 0:
				if pulled := git(realHome, time.Minute, "pull", "--rebase", "--autostash", "origin", branch); pulled.code != 0 {
					git(realHome, 0, "rebase", "--abort")
					notPushed("pull --rebase 失败：" + pulled.text())
					ok = false
				}
			case onRemote.code != 2:
				// 2 = reachable, no such branch yet: nothing to rebase onto, just push
				notPushed(onRemote.text())
				ok = false
			}
			if ok {
				if pushed := git(realHome, time.Minute, "push", "-u", "origin", branch); pushed.code == 0 {
					lines = append(lines, "已推送到 origin")
				} else {
					notPushed(pushed.text())
				}
			}
		}
	}
	return CommitResult{Committed: sha != "", SHA: sha, Lines: lines}, nil
}

// guardDocs refuses when the docs/ of a project that one of the files (relative to home) belongs to has a
// duplicate slug or a dead link. It judges the directory as it is on disk now, so a deleted file counts as gone.
func guardDocs(realHome string, rels []string) error {
	seen := map[string]bool{}
	var report []string
	for _, rel := range rels {
		parts := strings.Split(filepath.ToSlash(rel), "/")
		if len(parts) < 3 || parts[0] != "projects" || parts[2] != "docs" {
			continue
		}
		docs := filepath.Join(realHome, "projects", parts[1], "docs")
		if seen[docs] || !isDir(docs) {
			continue
		}
		seen[docs] = true
		rep, err := CheckDocs(docs)
		if err != nil {
			return err
		}
		if !rep.OK() {
			report = append(report, rep.Describe("projects/"+parts[1]+"/docs/"))
		}
	}
	if len(report) == 0 {
		return nil
	}
	return nexterr.New("改掉上面列出的重名文件或链接（或把被链的文件放回去），再跑 dyna home commit <消息> <文件>...",
		"home commit 拒绝：知识库没过检查，什么都没提交\n%s", strings.Join(report, "\n"))
}
