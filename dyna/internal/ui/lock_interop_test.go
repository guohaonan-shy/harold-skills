package ui

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// While the skills still call the old script (they move to dyna in later tickets), the old script and this
// command may meet at the same lock: each reads what the other wrote, and the status they print is the same.
// The old script stays in the repository until the last ticket removes it; without node the test is skipped.
func TestTheOldScriptAndTheCommandShareOneLock(t *testing.T) {
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node is not installed")
	}
	script, _ := filepath.Abs(filepath.Join("..", "..", "..", "idea-loop", "scripts", "browser-lock.mjs"))
	if _, err := os.Stat(script); err != nil {
		t.Skip("the old script is gone")
	}
	old := func(args ...string) (string, int) {
		out, err := exec.Command(node, append([]string{script}, args...)...).CombinedOutput()
		code := 0
		if ee, ok := err.(*exec.ExitError); ok {
			code = ee.ExitCode()
		}
		return string(out), code
	}

	// the old script holds it: the command sees the owner and is refused
	dir := lockDir(t)
	if _, code := old("acquire", dir, "--owner", "03"); code != 0 {
		t.Fatal("old script could not acquire")
	}
	if r := run(Deps{}, "lock", "status", dir); !strings.Contains(r.out, `"owner":"03"`) {
		t.Fatal(r.all())
	}
	if r := run(Deps{}, "lock", "acquire", dir, "--owner", "05", "--wait-min", "0"); r.code != 1 || !strings.Contains(r.err, "still held by 03") {
		t.Fatal(r.all())
	}
	if r := run(Deps{}, "lock", "release", dir, "--owner", "03"); r.code != 0 {
		t.Fatal(r.all())
	}

	// the command holds it: the old script sees the owner and is refused; the status lines are the same text
	if r := run(Deps{}, "lock", "acquire", dir, "--owner", "07"); r.code != 0 {
		t.Fatal(r.all())
	}
	oldStatus, _ := old("status", dir)
	if r := run(Deps{}, "lock", "status", dir); r.out != oldStatus {
		t.Fatalf("status differs:\n go: %q\nold: %q", r.out, oldStatus)
	}
	if out, code := old("acquire", dir, "--owner", "09", "--wait-min", "0"); code != 1 || !strings.Contains(out, "still held by 07") {
		t.Fatal(code, out)
	}
	if out, code := old("release", dir, "--owner", "07"); code != 0 {
		t.Fatal(code, out)
	}

	// a free lock reads the same, and usage errors exit the same
	if r := run(Deps{}, "lock", "status", dir); r.out != `{"held":false}`+"\n" {
		t.Fatal(r.out)
	}
	if _, code := old("acquire", dir); code != 1 {
		t.Fatal("old: no owner is a usage error")
	}
}
