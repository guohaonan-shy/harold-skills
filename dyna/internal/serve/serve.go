// Package serve is the `serve` module: start and stop a static file server for a directory, on a free port it
// picks itself, in place of a hand-written `python -m http.server <port> &` and the `kill` after it.
//
// `serve start` runs the server as a separate process (the same binary, `serve run`, hidden) that outlives the
// command, and prints its address. The port is bound by the command itself and handed to that process, so there
// is no window between "found a free port" and "took it". The server quits by itself when no request has come for
// the idle time (30 minutes unless `--idle` says otherwise, 0 for never), so a forgotten one does not hold its port.
// Every answer the server gives carries the header
// X-Dyna-Serve: <its pid>; `serve stop <address>` asks the address who is there, and stops that process only
// when it says it is a dyna server, so no file of records is kept that could go stale or be cleaned away.
package serve

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/spf13/cobra"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/nexterr"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/registry"
)

// Header names the server on every response, with its process id.
const Header = "X-Dyna-Serve"

// probePath answers 204 and nothing else; `stop` and `start` use it to ask who is listening.
const probePath = "/__dyna_serve__"

// Deps is what the commands reach outside the process through.
type Deps struct {
	Stdout io.Writer
	// Exe is the dyna binary `start` runs as the server; nil means this process's own binary.
	Exe func() (string, error)
	// Wait is how long `start` waits for the server to answer and `stop` for the port to be free; 0 means 5 s.
	Wait time.Duration
}

func (d Deps) out() io.Writer {
	if d.Stdout == nil {
		return os.Stdout
	}
	return d.Stdout
}

func (d Deps) exe() (string, error) {
	if d.Exe != nil {
		return d.Exe()
	}
	return os.Executable()
}

func (d Deps) wait() time.Duration {
	if d.Wait == 0 {
		return 5 * time.Second
	}
	return d.Wait
}

func leaf(use, short, next string, run func(cmd *cobra.Command, args []string) error) *cobra.Command {
	c := &cobra.Command{Use: use, Short: short, SilenceUsage: true, SilenceErrors: true, RunE: run}
	registry.Mark(c, registry.CallerSession, next)
	return c
}

// Command is the `serve` module.
func Command(d Deps) *cobra.Command {
	root := registry.Group("serve", "起、停静态文件服务器：自己挑空闲端口，打印地址（代替手写 python -m http.server）")
	root.AddCommand(startCommand(d), stopCommand(d), runCommand(d))
	return root
}

// DefaultIdle is how long a server goes without a request before it quits.
const DefaultIdle = 30 * time.Minute

const host = "127.0.0.1"

func address(port int) string { return "http://" + net.JoinHostPort(host, strconv.Itoa(port)) }

// ---------- start ----------

func startCommand(d Deps) *cobra.Command {
	c := leaf("start <目录>",
		"在后台起一个静态服务器，服务这个目录；挑一个空闲端口（--port 指定也行），打印地址，用完用 serve stop <地址> 停",
		"dyna serve start <目录>", func(cmd *cobra.Command, args []string) error {
			port, _ := cmd.Flags().GetInt("port")
			idle, _ := cmd.Flags().GetDuration("idle")
			return d.start(args[0], port, idle)
		})
	c.Args = cobra.ExactArgs(1)
	c.Flags().Int("port", 0, "指定端口；不给就让系统挑一个空闲的")
	c.Flags().Duration("idle", DefaultIdle, "这么久没有请求，服务就自己退出（如 30m、2h）；0 表示不退")
	return c
}

func (d Deps) start(dir string, port int, idle time.Duration) error {
	if idle < 0 {
		return nexterr.New("dyna serve start <目录>", "--idle %v 不能是负的（0 表示不自动退出）", idle)
	}
	abs, err := filepath.Abs(dir)
	if err != nil {
		return err
	}
	if st, err := os.Stat(abs); err != nil || !st.IsDir() {
		return nexterr.New("dyna serve start <目录>", "%s 不是一个目录", dir)
	}
	if port < 0 || port > 65535 {
		return nexterr.New("dyna serve start <目录>", "端口 %d 不在 0 到 65535 之间", port)
	}
	ln, err := net.Listen("tcp", net.JoinHostPort(host, strconv.Itoa(port)))
	if err != nil {
		return nexterr.New("dyna serve start <目录>", "端口 %d 起不来：%v（不指定 --port 就会挑空闲的）", port, err)
	}
	defer ln.Close()
	tcp := ln.(*net.TCPListener)
	file, err := tcp.File() // a duplicate of the listening socket, for the server process
	if err != nil {
		return err
	}
	defer file.Close()
	bound := tcp.Addr().(*net.TCPAddr).Port

	exe, err := d.exe()
	if err != nil {
		return err
	}
	stderr, err := os.CreateTemp("", "dyna-serve-*.log")
	if err != nil {
		return err
	}
	defer os.Remove(stderr.Name())
	defer stderr.Close()

	child := exec.Command(exe, "serve", "run", abs, "--idle", idle.String())
	child.ExtraFiles = []*os.File{file} // becomes file descriptor 3 of the server process
	child.Stderr = stderr
	detach(child)
	if err := child.Start(); err != nil {
		return fmt.Errorf("起不了服务进程 %s：%w", exe, err)
	}
	exited := make(chan error, 1)
	go func() { exited <- child.Wait() }()

	deadline := time.Now().Add(d.wait())
	for {
		if who, ok := probe(bound, 250*time.Millisecond); ok && who == child.Process.Pid {
			fmt.Fprintln(d.out(), address(bound))
			return nil
		}
		select {
		case err := <-exited:
			log, _ := os.ReadFile(stderr.Name())
			return nexterr.New("dyna serve start <目录>", "服务进程起来就退出了（%v）：%s", err, strings.TrimSpace(string(log)))
		case <-time.After(25 * time.Millisecond):
		}
		if time.Now().After(deadline) {
			_ = child.Process.Kill()
			return nexterr.New("dyna serve start <目录>", "服务进程 %s 内没有应答，已经杀掉", d.wait())
		}
	}
}

// probe asks whoever listens on the port who it is: the pid it names, or false when nothing answers as a dyna
// server.
func probe(port int, within time.Duration) (pid int, ok bool) {
	client := &http.Client{Timeout: within, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	resp, err := client.Head(address(port) + probePath)
	if err != nil {
		return 0, false
	}
	defer resp.Body.Close()
	pid, err = strconv.Atoi(resp.Header.Get(Header))
	return pid, err == nil
}

// ---------- run: the server process ----------

func runCommand(d Deps) *cobra.Command {
	c := leaf("run <目录>", "（内部）服务进程本身：start 起它，不要直接调", "dyna serve start <目录>", func(cmd *cobra.Command, args []string) error {
		ln, err := net.FileListener(os.NewFile(3, "listener"))
		if err != nil {
			return fmt.Errorf("没有收到 start 交来的监听端口：%w", err)
		}
		idle, _ := cmd.Flags().GetDuration("idle")
		return Serve(cmd.Context(), ln, args[0], idle)
	})
	c.Args = cobra.ExactArgs(1)
	c.Flags().Duration("idle", DefaultIdle, "没有请求这么久就退出；0 表示不退")
	c.Hidden = true
	return c
}

// Handler serves the directory, and says on every answer which process it is.
func Handler(dir string) http.Handler {
	files := http.FileServer(http.Dir(dir))
	pid := strconv.Itoa(os.Getpid())
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set(Header, pid)
		if r.URL.Path == probePath {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		w.Header().Set("Cache-Control", "no-cache") // a page changed on disk shows on the next load
		files.ServeHTTP(w, r)
	})
}

// idleClock remembers when the last request of the page's own (not dyna's probe) was finished, and how many are
// being answered right now, so a long download is never cut off as idle.
type idleClock struct {
	mu     sync.Mutex
	last   time.Time
	active int
}

func (c *idleClock) begin() {
	c.mu.Lock()
	c.active++
	c.mu.Unlock()
}

func (c *idleClock) end() {
	c.mu.Lock()
	c.active--
	c.last = time.Now()
	c.mu.Unlock()
}

// remaining is how long is left before the server counts as idle; 0 or less means it is idle now.
func (c *idleClock) remaining(idle time.Duration) time.Duration {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.active > 0 {
		return idle
	}
	return idle - time.Since(c.last)
}

func (c *idleClock) track(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != probePath {
			c.begin()
			defer c.end()
		}
		next.ServeHTTP(w, r)
	})
}

// Serve serves dir on ln until the process is asked to stop (SIGTERM, SIGINT) or, when idle is more than 0, until
// no request has come for that long; then it finishes what is in flight and returns, which frees the port.
func Serve(ctx context.Context, ln net.Listener, dir string, idle time.Duration) error {
	if ctx == nil {
		ctx = context.Background()
	}
	ctx, stop := signal.NotifyContext(ctx, syscall.SIGTERM, os.Interrupt)
	defer stop()
	clock := &idleClock{last: time.Now()}
	srv := &http.Server{Handler: clock.track(Handler(dir)), ReadHeaderTimeout: 10 * time.Second}
	done := make(chan error, 1)
	go func() { done <- srv.Serve(ln) }()
	quiet := make(chan struct{})
	if idle > 0 {
		go func() {
			defer close(quiet)
			for {
				left := clock.remaining(idle)
				if left <= 0 {
					return
				}
				select {
				case <-time.After(left):
				case <-ctx.Done():
					return
				}
			}
		}()
	}
	select {
	case err := <-done:
		return err
	case <-ctx.Done():
	case <-quiet:
	}
	shutdown, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdown); err != nil {
		_ = srv.Close()
	}
	return nil
}

// ---------- stop ----------

func stopCommand(d Deps) *cobra.Command {
	c := leaf("stop <地址>", "停掉 serve start 起的服务器，等到端口放开才返回；地址就是 start 打印的那行（给端口号也行）。那个端口上没有服务就当已经停了",
		"dyna serve start <目录>", func(cmd *cobra.Command, args []string) error {
			return d.stop(args[0])
		})
	c.Args = cobra.ExactArgs(1)
	return c
}

// portOf reads the port out of "http://127.0.0.1:4317", "localhost:4317" or "4317".
func portOf(arg string) (int, error) {
	s := strings.TrimSpace(arg)
	if n, err := strconv.Atoi(s); err == nil {
		return checkPort(n, arg)
	}
	if !strings.Contains(s, "://") {
		s = "http://" + s
	}
	u, err := url.Parse(s)
	if err != nil || u.Port() == "" {
		return 0, nexterr.New("dyna serve start <目录>", "「%s」不是 serve start 打印的地址，也不是端口号", arg)
	}
	n, _ := strconv.Atoi(u.Port())
	return checkPort(n, arg)
}

func checkPort(n int, arg string) (int, error) {
	if n < 1 || n > 65535 {
		return 0, nexterr.New("dyna serve start <目录>", "「%s」不是端口号", arg)
	}
	return n, nil
}

func (d Deps) stop(arg string) error {
	port, err := portOf(arg)
	if err != nil {
		return err
	}
	pid, ok := probe(port, 2*time.Second)
	if !ok {
		if listening(port) {
			return nexterr.Plain("端口 %d 上有服务，但不是 dyna serve 起的，没有动它", port)
		}
		fmt.Fprintf(d.out(), "端口 %d 上没有服务（已经停了）\n", port)
		return nil
	}
	if pid <= 1 || pid == os.Getpid() {
		return nexterr.Plain("端口 %d 上的服务报的进程号 %d 不对，没有动它", port, pid)
	}
	proc, err := os.FindProcess(pid)
	if err != nil {
		return err
	}
	if err := proc.Signal(syscall.SIGTERM); err != nil && !errors.Is(err, os.ErrProcessDone) {
		return fmt.Errorf("停不了进程 %d：%w", pid, err)
	}
	if !freed(port, d.wait()) {
		_ = proc.Signal(syscall.SIGKILL)
		if !freed(port, d.wait()) {
			return nexterr.Plain("进程 %d 停不下来，端口 %d 还没放开", pid, port)
		}
	}
	fmt.Fprintf(d.out(), "已停：%s\n", address(port))
	return nil
}

// listening reports whether anything accepts connections on the port.
func listening(port int) bool {
	conn, err := net.DialTimeout("tcp", net.JoinHostPort(host, strconv.Itoa(port)), time.Second)
	if err != nil {
		return false
	}
	_ = conn.Close()
	return true
}

// freed waits until nothing listens on the port any more.
func freed(port int, within time.Duration) bool {
	deadline := time.Now().Add(within)
	for {
		if !listening(port) {
			return true
		}
		if time.Now().After(deadline) {
			return false
		}
		time.Sleep(25 * time.Millisecond)
	}
}
