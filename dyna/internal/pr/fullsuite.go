package pr

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/nexterr"
)

var headRe = regexp.MustCompile(`^[0-9a-fA-F]{4,64}$`)

// fullSuiteRecord is what one local run of the full test suite left behind for one head.
type fullSuiteRecord struct {
	Head     string `json:"head"`
	ExitCode int    `json:"exitCode"`
	Log      string `json:"log"`
	At       string `json:"at"`
}

// fullSuiteFile is where the record of head lives: the current worktree's .tmp/full-suite/.
func (d Deps) fullSuiteFile(head string) (string, error) {
	top, err := d.git("rev-parse", "--show-toplevel")
	if err != nil {
		return "", err
	}
	return filepath.Join(strings.TrimSpace(top), ".tmp", "full-suite", head+".json"), nil
}

// recordFullSuite writes the result of the local full run for head; a later run of the same head replaces it.
func (d Deps) recordFullSuite(head string, exitCode int, log string) error {
	file, err := d.fullSuiteFile(head)
	if err != nil {
		return err
	}
	now := time.Now
	if d.Now != nil {
		now = d.Now
	}
	if abs, err := filepath.Abs(log); err == nil {
		log = abs
	}
	rec := fullSuiteRecord{Head: head, ExitCode: exitCode, Log: log, At: now().UTC().Format(time.RFC3339)}
	if err := os.MkdirAll(filepath.Dir(file), 0o755); err != nil {
		return err
	}
	f, err := os.Create(file)
	if err != nil {
		return err
	}
	defer f.Close()
	if err := writeJSON(f, rec); err != nil {
		return err
	}
	d.println(fmt.Sprintf("已记下 %s 的本机全量结果（退出码 %d）：%s", head, exitCode, file))
	return nil
}

// showFullSuite prints the record of head, or ends with exit 2 when there is none.
func (d Deps) showFullSuite(head string) error {
	file, err := d.fullSuiteFile(head)
	if err != nil {
		return err
	}
	b, err := os.ReadFile(file)
	if err != nil {
		if os.IsNotExist(err) {
			return &nexterr.Exit{Code: 2, Msg: fmt.Sprintf("没有 %s 的本机全量记录", head)}
		}
		return err
	}
	_, err = d.out().Write(b)
	return err
}

func parseExitCode(s string) (int, bool) {
	n, err := strconv.Atoi(s)
	return n, err == nil && n >= 0
}
