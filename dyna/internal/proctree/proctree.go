// Package proctree starts a child process in a process group of its own and makes sure the whole group is gone
// when the child exits, times out, is stopped, or dyna itself is interrupted. A wrapped command line such as
// `codex exec` starts helper processes of its own; ending only the one dyna started leaves them running
// (the pile of Codex brokers this module replaces). The child's standard input is closed (/dev/null) unless the
// caller hands over text to write to it, so a child that waits for input gets an end of file instead of hanging.
package proctree

import (
	"bytes"
	"io"
	"os"
	"os/exec"
	"os/signal"
	"sync"
	"sync/atomic"
	"syscall"
	"time"
)

// DefaultGrace is how long a group that was asked to stop gets before it is killed outright.
const DefaultGrace = 3 * time.Second

// Options is how to run the child.
type Options struct {
	// Dir is the working directory ("" means dyna's).
	Dir string
	// Env is the child's environment (nil means dyna's own).
	Env []string
	// Stdin is text to write to the child's standard input and then close; nil means a closed input.
	Stdin []byte
	// Stdout and Stderr receive what the child prints; nil discards it.
	Stdout, Stderr io.Writer
	// Timeout ends the group when it has run this long; 0 means no limit.
	Timeout time.Duration
	// Grace is the time between asking the group to stop and killing it; 0 means DefaultGrace.
	Grace time.Duration
}

// Result is how the child ended.
type Result struct {
	// ExitCode is the child's exit code; -1 when a signal ended it.
	ExitCode int
	// TimedOut: Options.Timeout ran out and the group was ended.
	TimedOut bool
	// Killed: Kill was called and the group was ended.
	Killed bool
	// Interrupted: dyna itself got an interrupt or a terminate signal, and the group was ended.
	Interrupted bool
}

// Proc is a running child.
type Proc struct {
	cmd  *exec.Cmd
	opt  Options
	pgid int

	killed      atomic.Bool
	interrupted atomic.Bool
	exited      atomic.Bool

	copiers  sync.WaitGroup
	stdinW   *os.File
	readEnds []*os.File
	stopSig  func()
}

// Start starts bin with args.
func Start(bin string, args []string, o Options) (*Proc, error) {
	cmd := exec.Command(bin, args...)
	cmd.Dir = o.Dir
	if o.Env != nil {
		cmd.Env = o.Env
	}
	inGroup(cmd)
	p := &Proc{cmd: cmd, opt: o}

	var childEnds []*os.File
	fail := func(err error) (*Proc, error) {
		for _, f := range childEnds {
			f.Close()
		}
		for _, f := range p.readEnds {
			f.Close()
		}
		if p.stdinW != nil {
			p.stdinW.Close()
		}
		return nil, err
	}

	if o.Stdin != nil {
		r, w, err := os.Pipe()
		if err != nil {
			return fail(err)
		}
		cmd.Stdin = r
		childEnds = append(childEnds, r)
		p.stdinW = w
	}
	pipeFor := func(w io.Writer, set func(*os.File)) error {
		if w == nil {
			return nil
		}
		r, pw, err := os.Pipe()
		if err != nil {
			return err
		}
		set(pw)
		childEnds = append(childEnds, pw)
		p.readEnds = append(p.readEnds, r)
		p.copiers.Add(1)
		go func() {
			defer p.copiers.Done()
			_, _ = io.Copy(w, r)
		}()
		return nil
	}
	// Our own pipes, not exec's: exec's copy goroutines make Wait wait for every holder of the pipe, a helper
	// the child left behind included, so Wait could hang on exactly the process this package exists to end.
	if err := pipeFor(o.Stdout, func(f *os.File) { cmd.Stdout = f }); err != nil {
		return fail(err)
	}
	if err := pipeFor(o.Stderr, func(f *os.File) { cmd.Stderr = f }); err != nil {
		return fail(err)
	}

	if err := cmd.Start(); err != nil {
		return fail(err)
	}
	p.pgid = cmd.Process.Pid
	for _, f := range childEnds {
		f.Close()
	}
	if p.stdinW != nil {
		go func() {
			_, _ = io.Copy(p.stdinW, bytes.NewReader(o.Stdin))
			p.stdinW.Close()
		}()
	}

	// dyna itself being interrupted (the session stopped the command) must not leave the group behind.
	sigs := make(chan os.Signal, 1)
	signal.Notify(sigs, syscall.SIGINT, syscall.SIGTERM, syscall.SIGHUP)
	stop := make(chan struct{})
	p.stopSig = func() {
		signal.Stop(sigs)
		close(stop)
	}
	go func() {
		select {
		case <-sigs:
			p.interrupted.Store(true)
			p.terminate()
		case <-stop:
		}
	}()
	return p, nil
}

// Kill ends the whole group at once. It does nothing once the child has been waited for.
func (p *Proc) Kill() {
	if p.exited.Load() {
		return
	}
	p.killed.Store(true)
	killGroup(p.cmd, p.pgid, true)
}

// terminate asks the group to stop and kills it if it has not by the end of the grace period.
func (p *Proc) terminate() {
	if p.exited.Load() {
		return
	}
	killGroup(p.cmd, p.pgid, false)
	grace := p.opt.Grace
	if grace == 0 {
		grace = DefaultGrace
	}
	time.AfterFunc(grace, func() {
		if !p.exited.Load() {
			killGroup(p.cmd, p.pgid, true)
		}
	})
}

// Wait waits for the child to end (or for the timeout), ends whatever it left running in its group, and waits
// for its output to be delivered.
func (p *Proc) Wait() Result {
	done := make(chan error, 1)
	go func() { done <- p.cmd.Wait() }()

	var res Result
	var err error
	var timer <-chan time.Time
	if p.opt.Timeout > 0 {
		t := time.NewTimer(p.opt.Timeout)
		defer t.Stop()
		timer = t.C
	}
	select {
	case err = <-done:
	case <-timer:
		res.TimedOut = true
		p.terminate()
		err = <-done
	}
	p.exited.Store(true)
	p.stopSig()
	// the child is gone; anything it started that is still in the group goes now
	killGroup(p.cmd, p.pgid, true)

	res.Killed = p.killed.Load()
	res.Interrupted = p.interrupted.Load()
	res.ExitCode = exitCode(err)

	// Output the child's helpers held open ends when the group is killed. Give the copiers a moment, then close
	// the read ends so a helper that left the group cannot keep Wait from returning.
	copied := make(chan struct{})
	go func() {
		p.copiers.Wait()
		close(copied)
	}()
	select {
	case <-copied:
	case <-time.After(2 * time.Second):
		for _, f := range p.readEnds {
			f.Close()
		}
		<-copied
	}
	for _, f := range p.readEnds {
		f.Close()
	}
	if p.stdinW != nil {
		p.stdinW.Close()
	}
	return res
}

// Run starts the child and waits for it.
func Run(bin string, args []string, o Options) (Result, error) {
	p, err := Start(bin, args, o)
	if err != nil {
		return Result{}, err
	}
	return p.Wait(), nil
}

func exitCode(err error) int {
	if err == nil {
		return 0
	}
	if ee, ok := err.(*exec.ExitError); ok {
		return ee.ExitCode()
	}
	return -1
}
