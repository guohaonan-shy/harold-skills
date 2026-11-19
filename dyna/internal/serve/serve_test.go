package serve

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"testing"
	"time"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/nexterr"
)

var (
	builtOnce sync.Once
	builtPath string
	builtErr  error
	builtDir  string
)

// buildDyna compiles the dyna binary once: the seam of these tests is the command line, so the server is a real
// process that outlives the command that started it.
func buildDyna(t *testing.T) string {
	t.Helper()
	builtOnce.Do(func() {
		builtDir, builtErr = os.MkdirTemp("", "dyna-serve-test-")
		if builtErr != nil {
			return
		}
		builtPath = filepath.Join(builtDir, "dyna")
		if out, err := exec.Command("go", "build", "-o", builtPath, "../../cmd/dyna").CombinedOutput(); err != nil {
			builtErr = fmt.Errorf("go build: %w\n%s", err, out)
		}
	})
	if builtErr != nil {
		t.Fatal(builtErr)
	}
	return builtPath
}

func TestMain(m *testing.M) {
	code := m.Run()
	if builtDir != "" {
		_ = os.RemoveAll(builtDir)
	}
	os.Exit(code)
}

func site(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	for name, text := range map[string]string{
		"index.html":       "<h1>home</h1>",
		"canvas/v3.html":   "<p data-anchor=hero>canvas v3</p>",
		"assets/app.css":   "body{color:red}",
		"assets/data.json": `{"ok":true}`,
	} {
		p := filepath.Join(dir, name)
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, []byte(text), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	return dir
}

func get(t *testing.T, url string) (int, string, http.Header) {
	t.Helper()
	resp, err := http.Get(url)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, string(b), resp.Header
}

func dyna(t *testing.T, args ...string) (stdout, stderr string, code int) {
	t.Helper()
	cmd := exec.Command(buildDyna(t), args...)
	var out, errb bytes.Buffer
	cmd.Stdout, cmd.Stderr = &out, &errb
	err := cmd.Run()
	var ee *exec.ExitError
	switch {
	case err == nil:
	case errors.As(err, &ee):
		code = ee.ExitCode()
	default:
		t.Fatal(err)
	}
	return out.String(), errb.String(), code
}

func portClosed(addr string) bool {
	u := strings.TrimPrefix(addr, "http://")
	conn, err := net.DialTimeout("tcp", u, 300*time.Millisecond)
	if err != nil {
		return true
	}
	_ = conn.Close()
	return false
}

// A started server answers for the files of the directory at the address `start` printed; after `stop` the port
// is free. The server is a separate process: the command that started it has already exited when it is asked.
func TestStartPrintsAnAddressThatServesTheDirectoryAndStopFreesThePort(t *testing.T) {
	dir := site(t)
	out, errs, code := dyna(t, "serve", "start", dir)
	if code != 0 {
		t.Fatal(code, errs)
	}
	addr := strings.TrimSpace(out)
	if !strings.HasPrefix(addr, "http://127.0.0.1:") || strings.Count(out, "\n") != 1 {
		t.Fatalf("one line, the address: %q", out)
	}
	t.Cleanup(func() { dyna(t, "serve", "stop", addr) })

	status, body, header := get(t, addr+"/index.html")
	if status != 200 || body != "<h1>home</h1>" {
		t.Fatal(status, body)
	}
	if _, body, _ = get(t, addr+"/canvas/v3.html"); body != "<p data-anchor=hero>canvas v3</p>" {
		t.Fatal(body)
	}
	if status, body, _ = get(t, addr+"/"); status != 200 || body != "<h1>home</h1>" {
		t.Fatal("a directory serves its index.html:", status, body)
	}
	if status, body, _ = get(t, addr+"/assets/"); status != 200 || !strings.Contains(body, "app.css") {
		t.Fatal("a directory without an index lists its files:", status, body)
	}
	if status, _, _ = get(t, addr+"/nope.html"); status != 404 {
		t.Fatal(status)
	}
	if ct := func() string { _, _, h := get(t, addr+"/assets/app.css"); return h.Get("Content-Type") }(); !strings.HasPrefix(ct, "text/css") {
		t.Fatal(ct)
	}
	pid, err := strconv.Atoi(header.Get(Header))
	if err != nil || pid <= 1 || pid == os.Getpid() {
		t.Fatalf("the server names its process: %q", header.Get(Header))
	}

	// a page changed on disk shows on the next load
	if err := os.WriteFile(filepath.Join(dir, "index.html"), []byte("<h1>changed</h1>"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, body, _ = get(t, addr+"/index.html"); body != "<h1>changed</h1>" {
		t.Fatal(body)
	}

	out, errs, code = dyna(t, "serve", "stop", addr)
	if code != 0 || !strings.Contains(out, "已停") {
		t.Fatal(code, out, errs)
	}
	if !portClosed(addr) {
		t.Fatal("the port is still listening after stop")
	}
	gone := false
	for i := 0; i < 80 && !gone; i++ { // the process ends a moment after it closes the port
		gone = syscall.Kill(pid, 0) != nil
		time.Sleep(25 * time.Millisecond)
	}
	if !gone {
		t.Fatalf("process %d is still running after stop", pid)
	}
	// stopping again is not an error: it is already stopped
	if out, errs, code = dyna(t, "serve", "stop", addr); code != 0 || !strings.Contains(out, "已经停") {
		t.Fatal(code, out, errs)
	}
}

func TestTwoServersGetTwoPortsAndEachStopsOnItsOwn(t *testing.T) {
	a, b := site(t), t.TempDir()
	if err := os.WriteFile(filepath.Join(b, "index.html"), []byte("other"), 0o644); err != nil {
		t.Fatal(err)
	}
	outA, errs, code := dyna(t, "serve", "start", a)
	if code != 0 {
		t.Fatal(errs)
	}
	outB, errs, code := dyna(t, "serve", "start", b)
	if code != 0 {
		t.Fatal(errs)
	}
	addrA, addrB := strings.TrimSpace(outA), strings.TrimSpace(outB)
	t.Cleanup(func() { dyna(t, "serve", "stop", addrA); dyna(t, "serve", "stop", addrB) })
	if addrA == addrB {
		t.Fatal("two servers on one address")
	}
	if _, body, _ := get(t, addrB+"/"); body != "other" {
		t.Fatal(body)
	}
	if _, _, code := dyna(t, "serve", "stop", addrA); code != 0 || !portClosed(addrA) {
		t.Fatal("A did not stop")
	}
	if _, body, _ := get(t, addrB+"/"); body != "other" {
		t.Fatal("stopping A stopped B", body)
	}
}

func TestStartOnAGivenPortAndStopByTheBarePortNumber(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	port := ln.Addr().(*net.TCPAddr).Port
	_ = ln.Close()
	out, errs, code := dyna(t, "serve", "start", site(t), "--port", strconv.Itoa(port))
	if code != 0 || strings.TrimSpace(out) != fmt.Sprintf("http://127.0.0.1:%d", port) {
		t.Fatal(code, out, errs)
	}
	if _, _, code := dyna(t, "serve", "stop", strconv.Itoa(port)); code != 0 || !portClosed(strings.TrimSpace(out)) {
		t.Fatal("not stopped by the port number")
	}
}

func TestStartRefusesABusyPortAndAMissingDirectory(t *testing.T) {
	busy := httptest.NewServer(http.NotFoundHandler())
	defer busy.Close()
	port := busy.Listener.Addr().(*net.TCPAddr).Port
	if _, errs, code := dyna(t, "serve", "start", site(t), "--port", strconv.Itoa(port)); code != 1 || !strings.Contains(errs, strconv.Itoa(port)) {
		t.Fatal(code, errs)
	}
	dir := site(t)
	if _, errs, code := dyna(t, "serve", "start", filepath.Join(dir, "nope")); code != 1 || !strings.Contains(errs, "不是一个目录") {
		t.Fatal(code, errs)
	}
	if _, errs, code := dyna(t, "serve", "start", filepath.Join(dir, "index.html")); code != 1 || !strings.Contains(errs, "不是一个目录") {
		t.Fatal("a file is not a directory:", code, errs)
	}
}

// stop moves only a dyna server: another program on the port is left alone.
func TestStopLeavesAServerThatIsNotDynasAlone(t *testing.T) {
	other := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { _, _ = io.WriteString(w, "not dyna") }))
	defer other.Close()
	_, errs, code := dyna(t, "serve", "stop", other.URL)
	if code != 1 || !strings.Contains(errs, "不是 dyna serve 起的") {
		t.Fatal(code, errs)
	}
	if _, body, _ := get(t, other.URL); body != "not dyna" {
		t.Fatal("it was stopped")
	}
}

func TestStopOnAPortNobodyListensOnIsAlreadyStopped(t *testing.T) {
	ln, _ := net.Listen("tcp", "127.0.0.1:0")
	port := ln.Addr().(*net.TCPAddr).Port
	_ = ln.Close()
	out, errs, code := dyna(t, "serve", "stop", strconv.Itoa(port))
	if code != 0 || !strings.Contains(out, "已经停") {
		t.Fatal(code, out, errs)
	}
}

func TestStopTakesTheAddressStartPrintedInEveryShape(t *testing.T) {
	for in, want := range map[string]int{"http://127.0.0.1:4317": 4317, "127.0.0.1:4317": 4317, "localhost:4317": 4317, "http://localhost:4317/": 4317, "4317": 4317} {
		if got, err := portOf(in); err != nil || got != want {
			t.Errorf("%s: %d %v", in, got, err)
		}
	}
	for _, in := range []string{"", "nothing", "http://127.0.0.1", "0", "70000", "-1"} {
		var ne *nexterr.Error
		if _, err := portOf(in); !errors.As(err, &ne) {
			t.Errorf("%q should be refused: %v", in, err)
		}
	}
}

func TestTheHandlerSaysWhichProcessItIsOnEveryAnswerAndAnswersTheProbe(t *testing.T) {
	srv := httptest.NewServer(Handler(site(t)))
	defer srv.Close()
	for _, p := range []string{"/index.html", "/missing", probePath} {
		_, _, h := get(t, srv.URL+p)
		if h.Get(Header) != strconv.Itoa(os.Getpid()) {
			t.Errorf("%s: %q", p, h.Get(Header))
		}
	}
	if status, body, _ := get(t, srv.URL+probePath); status != 204 || body != "" {
		t.Fatal(status, body)
	}
	if pid, ok := probe(srv.Listener.Addr().(*net.TCPAddr).Port, time.Second); !ok || pid != os.Getpid() {
		t.Fatal(pid, ok)
	}
}

// With the server's own binary missing the start says why and leaves nothing running.
func TestStartSaysWhyWhenTheServerProcessDoesNotCome(t *testing.T) {
	var out bytes.Buffer
	d := Deps{Stdout: &out, Wait: 500 * time.Millisecond, Exe: func() (string, error) { return exec.LookPath("false") }}
	c := Command(d)
	c.SetArgs([]string{"start", site(t)})
	c.SetOut(io.Discard)
	c.SetErr(io.Discard)
	err := c.Execute()
	if err == nil || !strings.Contains(err.Error(), "起来就退出了") {
		t.Fatal(err)
	}
	if out.Len() != 0 {
		t.Fatal("nothing printed when it did not start:", out.String())
	}
}

// waitClosed waits for the address to stop listening, up to the time given.
func waitClosed(addr string, within time.Duration) bool {
	deadline := time.Now().Add(within)
	for time.Now().Before(deadline) {
		if portClosed(addr) {
			return true
		}
		time.Sleep(20 * time.Millisecond)
	}
	return portClosed(addr)
}

// A server nobody asks anything of quits on its own after the idle time: the port is free, the process is gone,
// and `stop` on it afterwards is still not an error.
func TestAServerNobodyAsksAnythingOfQuitsAfterTheIdleTimeAndStopStillSucceeds(t *testing.T) {
	out, errs, code := dyna(t, "serve", "start", site(t), "--idle", "400ms")
	if code != 0 {
		t.Fatal(code, errs)
	}
	addr := strings.TrimSpace(out)
	t.Cleanup(func() { dyna(t, "serve", "stop", addr) })
	_, _, header := get(t, addr+"/index.html")
	pid, _ := strconv.Atoi(header.Get(Header))
	if !waitClosed(addr, 5*time.Second) {
		t.Fatal("the server is still listening long after the idle time")
	}
	gone := false
	for i := 0; i < 80 && !gone; i++ {
		gone = syscall.Kill(pid, 0) != nil
		time.Sleep(25 * time.Millisecond)
	}
	if !gone {
		t.Fatalf("process %d is still running after the idle exit", pid)
	}
	if out, errs, code = dyna(t, "serve", "stop", addr); code != 0 || !strings.Contains(out, "已经停") {
		t.Fatal(code, out, errs)
	}
}

// Every request starts the idle time again, so a page being looked at stays up; dyna's own question of who is
// listening (what `stop` asks) is not a request of the page's.
func TestARequestStartsTheIdleTimeAgainButTheProbeDoesNot(t *testing.T) {
	out, errs, code := dyna(t, "serve", "start", site(t), "--idle", "700ms")
	if code != 0 {
		t.Fatal(code, errs)
	}
	addr := strings.TrimSpace(out)
	t.Cleanup(func() { dyna(t, "serve", "stop", addr) })
	port, _ := portOf(addr)
	for i := 0; i < 10; i++ { // 1.5 s in all, twice the idle time, a request every 150 ms
		if status, _, _ := get(t, addr+"/index.html"); status != 200 {
			t.Fatalf("round %d: the server went away while it was being asked: %d", i, status)
		}
		time.Sleep(150 * time.Millisecond)
	}
	for i := 0; i < 10 && !portClosed(addr); i++ { // only probes now
		probe(port, time.Second)
		time.Sleep(150 * time.Millisecond)
	}
	if !waitClosed(addr, 3*time.Second) {
		t.Fatal("probes kept the server up")
	}
}

// 0 means never quit; the default is thirty minutes; a negative time is refused.
func TestIdleZeroNeverQuitsTheDefaultIsThirtyMinutesAndNegativeIsRefused(t *testing.T) {
	out, errs, code := dyna(t, "serve", "start", site(t), "--idle", "0")
	if code != 0 {
		t.Fatal(code, errs)
	}
	addr := strings.TrimSpace(out)
	t.Cleanup(func() { dyna(t, "serve", "stop", addr) })
	time.Sleep(1200 * time.Millisecond)
	if status, _, _ := get(t, addr+"/index.html"); status != 200 {
		t.Fatal("--idle 0 server quit")
	}

	start, _, err := Command(Deps{}).Find([]string{"start"})
	if err != nil {
		t.Fatal(err)
	}
	if def := start.Flags().Lookup("idle").DefValue; def != "30m0s" {
		t.Fatalf("default idle time: %s", def)
	}

	_, errs, code = dyna(t, "serve", "start", site(t), "--idle", "-5m")
	if code != 1 || !strings.Contains(errs, "idle") {
		t.Fatal(code, errs)
	}
}
