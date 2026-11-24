package runtime

// `runtime record`: the one line of bookkeeping after a dispatcher opened an issue session.
//
// The session itself is opened with the environment's own commands, written in its description (the section
// 「会话管理」, item 「开一个 issue 会话」); this command does not know which environment that was. It only appends
// {issue, sessionId, openedAt, period} to <records-dir>/<repo>.json, which is what the morning summary reads
// to find the sessions opened overnight.

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

var repoName = regexp.MustCompile(`^\w[\w.-]*$`)

// record is one entry in <records-dir>/<repo>.json. The field names and their order are what the morning summary
// reads; `sessionId` holds the id of the session that was opened, as the environment that opened it reports it.
type record struct {
	Issue     int    `json:"issue"`
	SessionID string `json:"sessionId"`
	OpenedAt  string `json:"openedAt"`
	Period    string `json:"period"`
}

// appendRecord appends one entry to <dir>/<repo>.json (an array); an unreadable existing file is left untouched.
func appendRecord(dir, repo string, entry any) error {
	if !repoName.MatchString(repo) {
		return fmt.Errorf("仓库名不能当文件名：%s", repo)
	}
	file := filepath.Join(dir, repo+".json")
	var list []json.RawMessage
	if b, err := os.ReadFile(file); err == nil {
		if err := json.Unmarshal(b, &list); err != nil {
			var anything any
			if json.Unmarshal(b, &anything) == nil {
				return fmt.Errorf("%s 不是一个数组，没动它", file)
			}
			return fmt.Errorf("%s 读不出来，没动它", file)
		}
	} else if !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("%s 读不出来，没动它", file)
	}
	raw, err := json.Marshal(entry)
	if err != nil {
		return err
	}
	list = append(list, raw)
	if err := os.MkdirAll(filepath.Dir(file), 0o755); err != nil {
		return err
	}
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	enc.SetIndent("", "  ")
	if err := enc.Encode(list); err != nil {
		return err
	}
	tmp := fmt.Sprintf("%s.%d.tmp", file, os.Getpid())
	if err := os.WriteFile(tmp, buf.Bytes(), 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, file)
}

// RecordOptions are the flags of `runtime record`.
type RecordOptions struct {
	Issue, Repo, Period, Session, Dir string
}

// Record validates the options, appends the entry and returns the one JSON line to print.
func Record(o RecordOptions, env func(string) string, now func() time.Time) (string, error) {
	if !regexp.MustCompile(`^\d+$`).MatchString(o.Issue) {
		return "", errors.New("--issue 要给 issue 号（数字）")
	}
	if strings.TrimSpace(o.Repo) == "" {
		return "", errors.New("--repo 要给仓库名")
	}
	if o.Period != "todo" && o.Period != "triage" {
		return "", errors.New("--period 要是 todo 或 triage")
	}
	if strings.TrimSpace(o.Session) == "" {
		return "", errors.New("--session 要给会话 id")
	}
	dir := o.Dir
	if dir == "" {
		dir = env("IDEA_LOOP_DISPATCH_DIR")
	}
	if dir == "" {
		h := env("HOME")
		if h == "" {
			h, _ = os.UserHomeDir()
		}
		dir = filepath.Join(h, ".idea-loop", "dispatch")
	}
	n, _ := strconv.Atoi(o.Issue)
	entry := record{Issue: n, SessionID: o.Session, OpenedAt: now().UTC().Format("2006-01-02T15:04:05.000Z"), Period: o.Period}
	if err := appendRecord(dir, o.Repo, entry); err != nil {
		return "", err
	}
	b, err := json.Marshal(entry)
	if err != nil {
		return "", err
	}
	return string(b), nil
}
