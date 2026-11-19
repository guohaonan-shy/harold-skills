package agent

import (
	"bytes"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/spf13/cobra"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/nexterr"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/proctree"
)

const (
	// DefaultCodexTimeout is how long `codex run` waits: as long as the reviewer waited for the companion before.
	DefaultCodexTimeout = 20 * time.Minute
	// DefaultImageTimeout is for `codex image`: a measured run took 89 seconds.
	DefaultImageTimeout = 10 * time.Minute
	// maxArgPrompt is the longest prompt handed over as an argument; a longer one goes in on standard input.
	maxArgPrompt = 100_000
)

var effortWord = regexp.MustCompile(`^[a-z][a-z-]*$`)

// lookCodex finds the codex command: --bin when given, else codex on PATH.
func lookCodex(bin string) (string, error) {
	if bin == "" {
		bin = "codex"
	}
	path, err := exec.LookPath(bin)
	if err != nil {
		return "", nexterr.New("装好 Codex 命令行（brew install codex，或 npm install -g @openai/codex）后重跑同一条命令",
			"没找到 %s 命令（PATH 上没有）；不猜路径、不改 Codex 配置", bin)
	}
	return path, nil
}

func addCommonCodexFlags(c *cobra.Command) {
	c.Flags().String("prompt-file", "", "prompt 所在的文件（与 --prompt 二选一）")
	c.Flags().String("prompt", "", "prompt 文字（与 --prompt-file 二选一）")
	c.Flags().String("cwd", "", "Codex 的工作目录（默认当前目录）")
	c.Flags().String("model", "", "模型（默认用 Codex 配置里的）")
	c.Flags().String("bin", "", "codex 命令（默认 PATH 上的 codex；测试放假的）")
}

// interrupted and timed-out endings are the same for every wrapped command.
func endingError(what string, res proctree.Result, timeout time.Duration, partial string) error {
	switch {
	case res.Interrupted:
		return &nexterr.Exit{Code: ExitInterrupted, Msg: fmt.Sprintf("%s 被中断：已结束它和它起的所有子进程。%s", what, partial)}
	case res.TimedOut:
		return &nexterr.Exit{Code: ExitTimeout, Msg: fmt.Sprintf("%s 超时（%s）：已结束它和它起的所有子进程。%s", what, timeout, partial)}
	}
	return nil
}

// failedExit is a wrapped command that ended with a non-zero code: dyna ends with the same code (1 when a signal
// ended it), so a caller can tell what the command itself said from what dyna did.
func failedExit(what string, code int, partial, log string) error {
	exit := code
	if exit < 1 || exit == ExitTimeout || exit == ExitInterrupted || exit == ExitStopped {
		exit = 1
	}
	said := fmt.Sprintf("退出码 %d", code)
	if code < 0 {
		said = "被信号结束"
	}
	return &nexterr.Exit{Code: exit, Msg: fmt.Sprintf("%s %s，%s。日志末尾：\n%s", what, said, partial, tail(log, 15))}
}

func codexRunCommand(d Deps) *cobra.Command {
	c := leaf("run",
		"起 codex exec 跑一轮并等它结束：stdin 关掉，默认只读沙箱，默认 20 分钟超时，退出或超时时结束整个进程组；成功时把最终消息写进 --out 并打印；超时退出 124，报已写出的部分输出在哪（--out 的 .log）；codex 自己非零退出时 dyna 以同一个码退出，其余失败退出 1",
		"dyna agent codex run --help",
		cobra.NoArgs,
		func(cmd *cobra.Command, args []string) error { return codexRun(d, cmd) })
	addCommonCodexFlags(c)
	c.Flags().String("effort", "", "思考强度（low / medium / high 等，传给 model_reasoning_effort）")
	c.Flags().String("sandbox", "read-only", "沙箱：read-only（默认）或 workspace-write")
	c.Flags().String("out", "", "最终消息写到这个文件（默认在临时目录）；Codex 的过程日志写到 <out>.log")
	c.Flags().String("timeout", DefaultCodexTimeout.String(), "超过这个时长就结束它（如 20m、90s）")
	return c
}

func codexRun(d Deps, cmd *cobra.Command) error {
	prompt, err := promptOf(cmd)
	if err != nil {
		return err
	}
	cwd, err := workDir(cmd)
	if err != nil {
		return err
	}
	timeoutText, _ := cmd.Flags().GetString("timeout")
	timeout, err := parseTimeout(timeoutText)
	if err != nil {
		return err
	}
	sandbox, _ := cmd.Flags().GetString("sandbox")
	if sandbox != "read-only" && sandbox != "workspace-write" {
		return fmt.Errorf("--sandbox 只认 read-only 或 workspace-write；收到「%s」", sandbox)
	}
	effort, _ := cmd.Flags().GetString("effort")
	if effort != "" && !effortWord.MatchString(effort) {
		return fmt.Errorf("--effort 写成 low / medium / high 这样的词；收到「%s」", effort)
	}
	binFlag, _ := cmd.Flags().GetString("bin")
	bin, err := lookCodex(binFlag)
	if err != nil {
		return err
	}
	out, _ := cmd.Flags().GetString("out")
	if out == "" {
		f, err := os.CreateTemp("", "dyna-codex-*.md")
		if err != nil {
			return err
		}
		out = f.Name()
		f.Close()
	}
	if out, err = filepath.Abs(out); err != nil {
		return err
	}
	logPath := out + ".log"
	if err := os.MkdirAll(filepath.Dir(out), 0o755); err != nil {
		return err
	}
	_ = os.Remove(out) // whatever is there is from an earlier run; "written" must mean written by this one
	logFile, err := os.Create(logPath)
	if err != nil {
		return err
	}
	defer logFile.Close()

	args := []string{"exec", "--sandbox", sandbox, "--skip-git-repo-check", "--color", "never", "-C", cwd}
	if model, _ := cmd.Flags().GetString("model"); model != "" {
		args = append(args, "-m", model)
	}
	if effort != "" {
		args = append(args, "-c", fmt.Sprintf("model_reasoning_effort=%q", effort))
	}
	args = append(args, "-o", out)
	o := proctree.Options{Dir: cwd, Stdout: logFile, Stderr: logFile, Timeout: timeout}
	if len(prompt) <= maxArgPrompt {
		if strings.HasPrefix(prompt, "-") {
			args = append(args, "--")
		}
		args = append(args, prompt)
	} else {
		args = append(args, "-")
		o.Stdin = []byte(prompt) // written and closed: the end of the input is what lets codex go on
	}

	res, err := proctree.Run(bin, args, o)
	if err != nil {
		return fmt.Errorf("起不来 %s：%v", bin, err)
	}
	partial := fmt.Sprintf("已写出的部分输出：%s", logPath)
	if st, err := os.Stat(out); err == nil && st.Size() > 0 {
		partial += fmt.Sprintf("；最终消息 %s", out)
	} else {
		partial += fmt.Sprintf("（最终消息 %s 没有写出）", out)
	}
	if e := endingError("codex", res, timeout, partial); e != nil {
		return e
	}
	if res.ExitCode != 0 {
		log, _ := os.ReadFile(logPath)
		return failedExit("codex", res.ExitCode, partial, string(log))
	}
	final, err := os.ReadFile(out)
	if err != nil || len(bytes.TrimSpace(final)) == 0 {
		return nexterr.Plain("codex 退出码 0，但没有写出最终消息（%s）。%s", out, partial)
	}
	_, err = d.out().Write(final)
	return err
}

func codexImageCommand(d Deps) *cobra.Command {
	c := leaf("image",
		"起 codex exec 用它内置的生图工具出一张图，存到 --out（可写沙箱，工作目录是 --out 所在目录）；stdin 关掉，默认 10 分钟超时，退出或超时时结束整个进程组；成功打印图的路径，没出图报错退出 1，超时退出 124，codex 自己非零退出时 dyna 以同一个码退出",
		"dyna agent codex image --help",
		cobra.NoArgs,
		func(cmd *cobra.Command, args []string) error { return codexImage(d, cmd) })
	c.Flags().String("prompt-file", "", "生图要求所在的文件（与 --prompt 二选一）")
	c.Flags().String("prompt", "", "生图要求文字（与 --prompt-file 二选一）")
	c.Flags().String("out", "", "图存成这个文件，如 imagine/assets/hero.png（必填）")
	c.Flags().String("model", "", "模型（默认用 Codex 配置里的）")
	c.Flags().String("bin", "", "codex 命令（默认 PATH 上的 codex；测试放假的）")
	c.Flags().String("timeout", DefaultImageTimeout.String(), "超过这个时长就结束它（如 10m、90s）")
	return c
}

var pngMagic = []byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'}

func codexImage(d Deps, cmd *cobra.Command) error {
	prompt, err := promptOf(cmd)
	if err != nil {
		return err
	}
	out, _ := cmd.Flags().GetString("out")
	if out == "" {
		return fmt.Errorf("要给 --out <图的路径>")
	}
	if out, err = filepath.Abs(out); err != nil {
		return err
	}
	timeoutText, _ := cmd.Flags().GetString("timeout")
	timeout, err := parseTimeout(timeoutText)
	if err != nil {
		return err
	}
	binFlag, _ := cmd.Flags().GetString("bin")
	bin, err := lookCodex(binFlag)
	if err != nil {
		return err
	}
	dir := filepath.Dir(out)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	_ = os.Remove(out)
	logFile, err := os.CreateTemp("", "dyna-codex-image-*.log")
	if err != nil {
		return err
	}
	defer logFile.Close()

	ask := fmt.Sprintf("用你内置的生图工具生成一张图。要求：\n\n%s\n\n生成后把图存成这个路径：%s。只生成这一张，不要改动或新建别的文件。存好后只回复一句话，写明保存的路径。", strings.TrimSpace(prompt), out)
	args := []string{"exec", "--sandbox", "workspace-write", "--skip-git-repo-check", "--color", "never", "-C", dir}
	if model, _ := cmd.Flags().GetString("model"); model != "" {
		args = append(args, "-m", model)
	}
	args = append(args, ask)
	res, err := proctree.Run(bin, args, proctree.Options{Dir: dir, Stdout: logFile, Stderr: logFile, Timeout: timeout})
	if err != nil {
		return fmt.Errorf("起不来 %s：%v", bin, err)
	}
	partial := fmt.Sprintf("Codex 的过程日志：%s", logFile.Name())
	if e := endingError("codex 生图", res, timeout, partial); e != nil {
		return e
	}
	if res.ExitCode != 0 {
		log, _ := os.ReadFile(logFile.Name())
		return failedExit("codex 生图", res.ExitCode, partial, string(log))
	}
	data, err := os.ReadFile(out)
	missing := err != nil || len(data) == 0
	if !missing && strings.EqualFold(filepath.Ext(out), ".png") && !bytes.HasPrefix(data, pngMagic) {
		return nexterr.Plain("%s 写出来了，但不是 PNG 文件。%s", out, partial)
	}
	if missing {
		return nexterr.Plain("codex 退出码 0，但 %s 没有出图。%s。Codex 生图会在 ~/.codex/generated_images/ 留一份原图，可以去那里找", out, partial)
	}
	fmt.Fprintln(d.out(), out)
	return nil
}
