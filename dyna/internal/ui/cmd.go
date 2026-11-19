// Package ui is the `ui` module: the UI implementation loop's judge (`ui measure`), the screenshot comparison the
// design archive's reconcile uses (`ui compare`), and the lock that makes parallel implementers take turns on the
// session's MCP browser (`ui lock`).
package ui

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/spf13/cobra"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/home"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/nexterr"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/registry"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/uicompare"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/uiconcurrency"
)

// Deps is what the commands reach outside the process through, so tests can stand in for the clock, the machine
// and the browser.
type Deps struct {
	Env    home.Env
	Stdout io.Writer
	Stderr io.Writer
	// Now is the clock; nil means time.Now. Sleep waits between two tries of `lock acquire`; nil means time.Sleep.
	Now   func() time.Time
	Sleep func(time.Duration)
	// Machine says how many cores, how many of them are idle and how much memory is free; nil reads this machine.
	Machine func() (cpus int, idleCores, availableBytes float64)
	// Browser opens the browser `measure` drives; nil launches Chrome.
	Browser func(ctx context.Context) (Browser, error)
}

func (d Deps) env() home.Env {
	if d.Env == nil {
		return home.OSEnv
	}
	return d.Env
}

func (d Deps) out() io.Writer {
	if d.Stdout == nil {
		return os.Stdout
	}
	return d.Stdout
}

func (d Deps) errOut() io.Writer {
	if d.Stderr == nil {
		return os.Stderr
	}
	return d.Stderr
}

func (d Deps) now() time.Time {
	if d.Now == nil {
		return time.Now()
	}
	return d.Now()
}

func (d Deps) sleep(t time.Duration) {
	if d.Sleep == nil {
		time.Sleep(t)
		return
	}
	d.Sleep(t)
}

func (d Deps) machine() (int, float64, float64) {
	if d.Machine == nil {
		return uiconcurrency.Machine()
	}
	return d.Machine()
}

func (d Deps) browser(ctx context.Context) (Browser, error) {
	if d.Browser != nil {
		return d.Browser(ctx)
	}
	path, err := FindChrome(d.env())
	if err != nil {
		return nil, err
	}
	return launchChrome(ctx, path)
}

// exit ends the command with a code; msg is printed to stderr when it is not empty.
func exit(code int, format string, a ...any) error {
	return &nexterr.Exit{Code: code, Msg: fmt.Sprintf(format, a...)}
}

func leaf(use, short, next string, run func(cmd *cobra.Command, args []string) error) *cobra.Command {
	c := &cobra.Command{Use: use, Short: short, SilenceUsage: true, SilenceErrors: true, RunE: run}
	registry.Mark(c, registry.CallerSession, next)
	return c
}

// Command is the `ui` module.
func Command(d Deps) *cobra.Command {
	root := registry.Group("ui", "UI 实现环的裁判：量设计画布和本地页面的差、比两张截图、给会话的 MCP 浏览器排队")
	lock := registry.Group("lock", "会话的 MCP 浏览器的锁：并行的实现者轮流用它，不然会点到对方的页面")
	lock.AddCommand(acquireCommand(d), releaseCommand(d), statusCommand(d))
	root.AddCommand(measureCommand(d), compareCommand(d), lock)
	return root
}

// ---------- compare ----------

const compareUsage = "usage: dyna ui compare <archive.png> <fresh.png> [--antialias 0.1] [--pixel 1] [--json]"

func compareCommand(d Deps) *cobra.Command {
	c := leaf("compare <archive.png> <fresh.png>",
		"比两张同一状态的截图（档案里的、新拍的），按 UI 环自己的容差：一致（退出 0）就不用重拍，超出（1）或读不了（2）",
		"dyna ui compare <archive.png> <fresh.png>", func(cmd *cobra.Command, args []string) error {
			antialias, _ := cmd.Flags().GetFloat64("antialias")
			pixel, _ := cmd.Flags().GetFloat64("pixel")
			asJSON, _ := cmd.Flags().GetBool("json")
			files := [2][]byte{}
			for i, f := range args {
				b, err := os.ReadFile(f)
				if err != nil {
					return exit(2, "ui-png-compare: %s", describeReadError(err))
				}
				files[i] = b
			}
			res, err := ComparePNGs(files[0], files[1], antialias, pixel)
			if err != nil {
				var pe *pngError
				if errors.As(err, &pe) {
					return exit(2, "ui-png-compare: %s", pe.msg)
				}
				return exit(2, "ui-png-compare: %v", err)
			}
			if asJSON {
				if err := writeJSON(d.out(), res); err != nil {
					return err
				}
			} else {
				fmt.Fprintf(d.out(), "ui-png-compare: %s\n", res.Reason)
			}
			if !res.Within {
				return &nexterr.Exit{Code: 1}
			}
			return nil
		})
	c.Args = func(cmd *cobra.Command, args []string) error {
		if len(args) != 2 {
			return exit(2, "%s", compareUsage)
		}
		return nil
	}
	c.SetFlagErrorFunc(func(cmd *cobra.Command, err error) error { return exit(2, "%s", compareUsage) })
	c.Flags().Float64("antialias", uicompare.DefaultAntialiasTolerance, "两个像素当作同一个颜色的感知色差（0 到 1）")
	c.Flags().Float64("pixel", uicompare.DefaultPixelThreshold, "允许不同的像素占比（百分数）")
	c.Flags().Bool("json", false, "输出 JSON：within、percent、threshold、antialias、reason")
	return c
}

func describeReadError(err error) string {
	if pe, ok := err.(*os.PathError); ok {
		return fmt.Sprintf("%s: %s", pe.Path, strings.TrimPrefix(pe.Err.Error(), "open "))
	}
	return err.Error()
}

// ---------- measure ----------

const measureUsage = "usage: dyna ui measure <matrix.json> [<matrix.json> …] [--json] [--concurrency N]"

func measureCommand(d Deps) *cobra.Command {
	c := leaf("measure <matrix.json>...",
		"把设计画布和本地页面逐格量一遍：先量锚点的位置和样式，再比整页像素；没有问题（或只剩要人看的格）退出 0，有 finding 退出 2",
		"dyna ui measure <matrix.json>...", func(cmd *cobra.Command, args []string) error {
			asJSON, _ := cmd.Flags().GetBool("json")
			var requested *int
			if cmd.Flags().Changed("concurrency") {
				n, _ := cmd.Flags().GetInt("concurrency")
				if n < 1 {
					return exit(1, "%s", measureUsage)
				}
				requested = &n
			}
			ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
			defer stop()
			return d.measure(ctx, measureOptions{Paths: args, JSON: asJSON, Requested: requested})
		})
	c.Args = func(cmd *cobra.Command, args []string) error {
		if len(args) == 0 {
			return exit(1, "%s", measureUsage)
		}
		return nil
	}
	c.SetFlagErrorFunc(func(cmd *cobra.Command, err error) error { return exit(1, "%s", measureUsage) })
	c.Flags().Bool("json", false, "输出 JSON：一份矩阵是 {findings, 瓶颈, humanReviewCells}，多份是 {matrices: […]}")
	c.Flags().Int("concurrency", 0, "同时跑几份矩阵（至多 4）；不给就按机器空闲的内存和 CPU 定")
	return c
}

// ---------- lock ----------

func lockMsg(format string, a ...any) string { return "browser-lock: " + fmt.Sprintf(format, a...) }

func acquireCommand(d Deps) *cobra.Command {
	c := leaf("acquire <lock-dir>", "取浏览器锁：被别人占着就等（--wait-min 分钟），等不到退出 1；占锁的人已经不在了（--stale-min 分钟）就接手",
		"dyna ui lock status <lock-dir>", func(cmd *cobra.Command, args []string) error {
			owner, _ := cmd.Flags().GetString("owner")
			waitMin, _ := cmd.Flags().GetFloat64("wait-min")
			staleMin, _ := cmd.Flags().GetFloat64("stale-min")
			if owner == "" {
				return exit(1, "usage: dyna ui lock acquire <lock-dir> --owner <id> [--wait-min N] [--stale-min N]")
			}
			dir := args[0]
			deadline := d.now().Add(time.Duration(waitMin * float64(time.Minute)))
			for {
				ok, err := TryAcquire(dir, owner, staleMin, d.now())
				if err != nil {
					return err
				}
				if ok {
					fmt.Fprintln(d.errOut(), lockMsg("acquired by %s", owner))
					return nil
				}
				if !d.now().Before(deadline) {
					return exit(1, "%s", lockMsg("still held by %s — gave up waiting", ownerName(dir)))
				}
				d.sleep(3 * time.Second)
			}
		})
	c.Args = lockDirArg
	c.Flags().String("owner", "", "谁在取锁（实现者的工单号、dreaming 之类）")
	c.Flags().Float64("wait-min", 30, "最多等多少分钟；0 就是试一次")
	c.Flags().Float64("stale-min", 45, "锁超过多少分钟没人放就当占锁的人已经不在了")
	return c
}

// ownerName is who holds the lock, the way the old script said it ("undefined" when owner.json says nobody).
func ownerName(dir string) string {
	if o := ReadOwner(dir); o != nil {
		return o.Owner
	}
	return "undefined"
}

func releaseCommand(d Deps) *cobra.Command {
	c := leaf("release <lock-dir>", "放浏览器锁：只有占锁的人放得掉，--force 谁的都放（编排者在实现者交回时用）",
		"dyna ui lock status <lock-dir>", func(cmd *cobra.Command, args []string) error {
			owner, _ := cmd.Flags().GetString("owner")
			force, _ := cmd.Flags().GetBool("force")
			if !force && owner == "" {
				return exit(1, "usage: dyna ui lock release <lock-dir> --owner <id> | --force")
			}
			if Release(args[0], owner, force) {
				return nil
			}
			return exit(1, "%s", lockMsg("held by %s, not %s — not released", ownerName(args[0]), owner))
		})
	c.Args = lockDirArg
	c.Flags().String("owner", "", "谁在放锁")
	c.Flags().Bool("force", false, "不管谁占着都放掉")
	return c
}

func statusCommand(d Deps) *cobra.Command {
	c := leaf("status <lock-dir>", "看浏览器锁：打印 JSON {held, owner, since, stale}", "", func(cmd *cobra.Command, args []string) error {
		staleMin, _ := cmd.Flags().GetFloat64("stale-min")
		fmt.Fprintln(d.out(), Status(args[0], staleMin, d.now()).JSON())
		return nil
	})
	c.Args = lockDirArg
	c.Flags().Float64("stale-min", 45, "锁超过多少分钟没人放就算 stale")
	return c
}

func lockDirArg(cmd *cobra.Command, args []string) error {
	if len(args) != 1 {
		return exit(1, "usage: dyna ui lock %s <lock-dir> …（锁是一个目录）", cmd.Name())
	}
	return nil
}
