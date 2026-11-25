package testcmd

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"

	"github.com/spf13/cobra"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/nexterr"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/proctree"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/registry"
)

// envTestBin is the dyna this run built from the repository, for the tests that need a real one
// (idea-loop/scripts/dyna-test-bin.mjs reads it). Not IDEA_LOOP_DYNA_BIN: the plugin's launcher honours that one,
// and the launcher's own tests would quietly run against it.
const envTestBin = "DYNA_TEST_BIN"

// runsDir is where every run keeps its directory: $TMPDIR/dyna-runs.
func runsDir() string { return filepath.Join(os.TempDir(), "dyna-runs") }

// run is one test or eval run's own directory: a pid file, the child's TMPDIR, and the dyna built for it.
type run struct {
	root, tmp, bin string
}

// openRun clears what earlier runs left behind (their pid is gone: killed, crashed), then makes this run's
// directory under runsDir and, when dir sits in a repository with dyna's source, builds dyna into it once.
func openRun(dir string, stderr io.Writer) (*run, error) {
	base := runsDir()
	sweepRuns(base, stderr)
	if err := os.MkdirAll(base, 0o755); err != nil {
		return nil, err
	}
	root, err := os.MkdirTemp(base, "run-")
	if err != nil {
		return nil, err
	}
	r := &run{root: root, tmp: filepath.Join(root, "tmp")}
	if err := os.WriteFile(filepath.Join(root, "pid"), []byte(strconv.Itoa(os.Getpid())+"\n"), 0o644); err != nil {
		r.close()
		return nil, err
	}
	if err := os.Mkdir(r.tmp, 0o755); err != nil {
		r.close()
		return nil, err
	}
	if src := dynaSource(dir); src != "" {
		bin := filepath.Join(root, "dyna")
		c := exec.Command("go", "build", "-o", bin, "./cmd/dyna")
		c.Dir = src
		if out, err := c.CombinedOutput(); err != nil {
			fmt.Fprintf(stderr, "dyna test：从 %s 编 dyna 没成（%v），要它的测试会自己再编一份：%s\n", src, err, strings.TrimSpace(string(out)))
		} else {
			r.bin = bin
		}
	}
	return r, nil
}

// env is base with TMPDIR pointed into the run (and the built dyna handed over).
func (r *run) env(base []string) []string {
	out := make([]string, 0, len(base)+2)
	for _, kv := range base {
		if strings.HasPrefix(kv, "TMPDIR=") || strings.HasPrefix(kv, envTestBin+"=") {
			continue
		}
		out = append(out, kv)
	}
	out = append(out, "TMPDIR="+r.tmp)
	if r.bin != "" {
		out = append(out, envTestBin+"="+r.bin)
	}
	return out
}

func (r *run) close() { _ = os.RemoveAll(r.root) }

// dynaSource is the repository's dyna/ directory when dir is inside a checkout that has dyna's source.
func dynaSource(dir string) string {
	for d := dir; ; d = filepath.Dir(d) {
		src := filepath.Join(d, "dyna")
		if isFile(filepath.Join(src, "go.mod")) && isFile(filepath.Join(src, "cmd", "dyna", "main.go")) {
			return src
		}
		if filepath.Dir(d) == d {
			return ""
		}
	}
}

// sweepRuns removes the run directories whose owner is no longer running.
func sweepRuns(base string, stderr io.Writer) {
	ents, err := os.ReadDir(base)
	if err != nil {
		return
	}
	n := 0
	for _, e := range ents {
		if !e.IsDir() || !strings.HasPrefix(e.Name(), "run-") {
			continue
		}
		p := filepath.Join(base, e.Name())
		b, err := os.ReadFile(filepath.Join(p, "pid"))
		pid, perr := strconv.Atoi(strings.TrimSpace(string(b)))
		if err == nil && perr == nil && pidAlive(pid) {
			continue
		}
		if err != nil && !os.IsNotExist(err) {
			continue
		}
		if os.RemoveAll(p) == nil {
			n++
		}
	}
	if n > 0 {
		fmt.Fprintf(stderr, "dyna test：删掉了 %d 个以前的运行留下的目录（%s）\n", n, base)
	}
}

func pidAlive(pid int) bool {
	if pid <= 0 {
		return false
	}
	p, err := os.FindProcess(pid)
	if err != nil {
		return false
	}
	err = p.Signal(syscall.Signal(0))
	return err == nil || errors.Is(err, syscall.EPERM)
}

// groupRunner runs the child in a process group of its own under proctree: when it ends, or dyna gets INT/TERM,
// everything it started goes too, and the run's directory is removed after.
func groupRunner(ctx context.Context, dir, name string, args, env []string, stdout, stderr io.Writer) (int, error) {
	res, err := proctree.Run(name, args, proctree.Options{Dir: dir, Env: env, Stdout: stdout, Stderr: stderr})
	if err != nil {
		return -1, err
	}
	switch {
	case res.Interrupted:
		return 130, nil
	case res.ExitCode < 0:
		return 1, nil
	}
	return res.ExitCode, nil
}

func execCommand(d Deps) *cobra.Command {
	c := &cobra.Command{
		Use:           "exec -- <命令> [参数…]",
		Short:         "在本次运行自己的临时目录里跑一条命令（测试、eval）：子进程的 TMPDIR 指到 $TMPDIR/dyna-runs/run-*/tmp，仓库里有 dyna 源码就先编一份经 DYNA_TEST_BIN 交给它；跑完、失败、被中断都停掉它起的进程、删掉这个目录；开始时先删以前被强停留下的；退出码照子进程的",
		Args:          cobra.MinimumNArgs(1),
		SilenceUsage:  true,
		SilenceErrors: true,
	}
	c.Flags().SetInterspersed(false)
	c.RunE = func(cmd *cobra.Command, args []string) error {
		cwd, err := d.cwd()
		if err != nil {
			return err
		}
		return inRun(d, cmd, cwd, args[0], args[1:])
	}
	registry.Mark(c, registry.CallerTest, "")
	return c
}

// startErr is a child that could not be started at all (the program is missing).
type startErr struct{ error }

// inRun runs name with args inside a fresh run directory and ends with the child's exit code.
func inRun(d Deps, cmd *cobra.Command, dir, name string, args []string) error {
	r, err := openRun(dir, cmd.ErrOrStderr())
	if err != nil {
		return fmt.Errorf("建不了本次运行的临时目录：%v", err)
	}
	defer r.close()
	ctx := cmd.Context()
	if ctx == nil {
		ctx = context.Background()
	}
	code, err := d.run()(ctx, dir, name, args, r.env(os.Environ()), cmd.OutOrStdout(), cmd.ErrOrStderr())
	if err != nil {
		return startErr{err}
	}
	if code != 0 {
		return &nexterr.Exit{Code: code}
	}
	return nil
}
