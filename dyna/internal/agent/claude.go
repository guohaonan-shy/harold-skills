package agent

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/spf13/cobra"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/claudestream"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/nexterr"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/proctree"
)

// DefaultClaudeTimeout is how long `claude run` waits for a session.
const DefaultClaudeTimeout = 20 * time.Minute

// maxStderr is how much of the session's standard error the summary keeps.
const maxStderr = 1 << 20

// ClaudeSummary is what `claude run --json` prints: how the session ended and the digest of what it did. The field
// names of the digest are the ones the eval runners have always written to digest.json.
type ClaudeSummary struct {
	ExitCode   int                      `json:"exitCode"`
	TimedOut   bool                     `json:"timedOut"`
	Escalation *claudestream.Escalation `json:"escalation"`
	Stderr     string                   `json:"stderr"`
	Stream     string                   `json:"stream"`
	Digest     claudestream.Digest      `json:"digest"`
}

func claudeRunCommand(d Deps) *cobra.Command {
	c := leaf("run",
		"起 claude -p 无头跑一个会话并等它结束：stdin 关掉，默认 20 分钟超时，退出或超时时结束整个进程组；事件流（stream-json）存进 --stream，边跑边读，不带 --json 时打印会话最后说的话，带 --json 时打印退出情况和做了什么（调了哪些工具、有没有起 agent 或开浏览器、花了多少）；超时退出 124，因 --stop-on-escalation 中止退出 3，其余失败退出 1",
		"dyna agent claude run --help",
		cobra.NoArgs,
		func(cmd *cobra.Command, args []string) error { return claudeRun(d, cmd) })
	f := c.Flags()
	f.String("prompt-file", "", "prompt 所在的文件（与 --prompt 二选一）")
	f.String("prompt", "", "prompt 文字（与 --prompt-file 二选一）")
	f.String("cwd", "", "会话的工作目录（默认当前目录）")
	f.StringArray("plugin-dir", nil, "加载这个目录里的插件（可重复；指向工作树的 idea-loop/ 而不是已装的那份）")
	f.String("model", "", "模型别名")
	f.Bool("skip-permissions", false, "跳过权限检查（无人值守的跑要它）")
	f.String("stream", "", "事件流存到这个文件（默认不存）")
	f.Bool("stop-on-escalation", false, "会话一起 agent 或一开浏览器就结束它（退出 3，summary 里写是哪个工具）")
	f.Bool("json", false, "打印 JSON：退出码、是否超时、escalation、stderr、digest（session / subagents / result）；不带时只打印会话最后说的话")
	f.String("timeout", DefaultClaudeTimeout.String(), "超过这个时长就结束它（如 20m、90s）")
	f.String("bin", "", "claude 命令（默认 PATH 上的 claude；测试放假的）")
	return c
}

// lineWriter hands each complete line to fn; Close hands over the last one, if the stream did not end on a newline.
type lineWriter struct {
	mu  sync.Mutex
	buf []byte
	fn  func(string)
}

func (w *lineWriter) Write(p []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.buf = append(w.buf, p...)
	for {
		i := bytes.IndexByte(w.buf, '\n')
		if i < 0 {
			break
		}
		w.fn(string(w.buf[:i]))
		w.buf = w.buf[i+1:]
	}
	return len(p), nil
}

func (w *lineWriter) Close() {
	w.mu.Lock()
	defer w.mu.Unlock()
	if len(w.buf) > 0 {
		w.fn(string(w.buf))
		w.buf = nil
	}
}

// capWriter keeps the first max bytes written to it.
type capWriter struct {
	mu  sync.Mutex
	buf bytes.Buffer
	max int
}

func (w *capWriter) Write(p []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	if room := w.max - w.buf.Len(); room > 0 {
		w.buf.Write(p[:min(room, len(p))])
	}
	return len(p), nil
}

func claudeRun(d Deps, cmd *cobra.Command) error {
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
	binName, _ := cmd.Flags().GetString("bin")
	if binName == "" {
		binName = "claude"
	}
	bin, err := exec.LookPath(binName)
	if err != nil {
		return nexterr.New("装好 Claude Code 命令行后重跑同一条命令", "没找到 %s 命令（PATH 上没有）", binName)
	}

	args := []string{"-p", prompt}
	dirs, _ := cmd.Flags().GetStringArray("plugin-dir")
	for _, dir := range dirs {
		args = append(args, "--plugin-dir", dir)
	}
	if skip, _ := cmd.Flags().GetBool("skip-permissions"); skip {
		args = append(args, "--dangerously-skip-permissions")
	}
	args = append(args, "--output-format", "stream-json", "--verbose")
	if model, _ := cmd.Flags().GetString("model"); model != "" {
		args = append(args, "--model", model)
	}

	streamPath, _ := cmd.Flags().GetString("stream")
	var streamFile *os.File
	if streamPath != "" {
		if streamPath, err = filepath.Abs(streamPath); err != nil {
			return err
		}
		if err := os.MkdirAll(filepath.Dir(streamPath), 0o755); err != nil {
			return err
		}
		if streamFile, err = os.Create(streamPath); err != nil {
			return err
		}
		defer streamFile.Close()
	}

	stop, _ := cmd.Flags().GetBool("stop-on-escalation")
	digester := claudestream.NewDigester()
	var proc *proctree.Proc
	started := make(chan struct{}) // closed once proc is set: output can arrive before Start has returned
	var escalation *claudestream.Escalation
	var escMu sync.Mutex
	lines := &lineWriter{fn: func(line string) {
		ev := claudestream.ParseEvent(line)
		if ev == nil {
			return
		}
		digester.AddEvent(ev)
		if !stop {
			return
		}
		escMu.Lock()
		defer escMu.Unlock()
		if escalation == nil {
			if hit := claudestream.EscalationOfEvent(ev); hit != nil {
				escalation = hit
				<-started
				proc.Kill()
			}
		}
	}}
	var stdout io.Writer = lines
	if streamFile != nil {
		stdout = io.MultiWriter(streamFile, lines)
	}
	stderr := &capWriter{max: maxStderr}

	proc, err = proctree.Start(bin, args, proctree.Options{Dir: cwd, Stdout: stdout, Stderr: stderr, Timeout: timeout})
	close(started)
	if err != nil {
		return fmt.Errorf("起不来 %s：%v", bin, err)
	}
	res := proc.Wait()
	lines.Close()

	sum := ClaudeSummary{
		ExitCode:   res.ExitCode,
		TimedOut:   res.TimedOut,
		Escalation: escalation,
		Stderr:     strings.TrimRight(stderr.buf.String(), "\n"),
		Stream:     streamPath,
		Digest:     digester.Digest(),
	}
	if asJSON, _ := cmd.Flags().GetBool("json"); asJSON {
		var b bytes.Buffer
		enc := json.NewEncoder(&b)
		enc.SetEscapeHTML(false)
		enc.SetIndent("", "  ")
		if err := enc.Encode(sum); err != nil {
			return err
		}
		if _, err := d.out().Write(b.Bytes()); err != nil {
			return err
		}
	} else if sum.Digest.Result != nil {
		fmt.Fprintln(d.out(), sum.Digest.Result.Text)
	}

	partial := ""
	if streamPath != "" {
		partial = fmt.Sprintf("已写出的事件流：%s", streamPath)
	}
	switch {
	case escalation != nil:
		what := "起了 agent"
		if escalation.Kind == "browser" {
			what = "开了浏览器"
		}
		return &nexterr.Exit{Code: ExitStopped, Msg: fmt.Sprintf("claude 中止：会话%s（%s）。已结束它和它起的所有子进程。%s", what, escalation.Tool, partial)}
	case res.Interrupted || res.TimedOut:
		return endingError("claude", res, timeout, partial)
	case res.ExitCode != 0:
		msg := fmt.Sprintf("claude 退出码 %d。%s", res.ExitCode, partial)
		if sum.Stderr != "" {
			msg += "\n" + tail(sum.Stderr, 10)
		}
		return nexterr.Plain("%s", msg)
	case sum.Digest.Result == nil:
		return nexterr.Plain("claude 退出码 0，但事件流里没有 result。%s", partial)
	}
	return nil
}
