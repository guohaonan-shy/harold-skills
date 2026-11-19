package seo

import (
	"fmt"
	"io"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/home"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/jsstr"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/nexterr"
)

// EnvHookDir is where the PreToolUse half leaves the time a command started, keyed by the tool call.
const EnvHookDir = "IDEA_LOOP_SEO_HOOK_DIR"

// CheckOpts are what one run of the check is asked for.
type CheckOpts struct {
	Dist   string
	Strict bool
	Filter string
	T      Thresholds
}

var numFlags = map[string]string{"--title-min": "titleMin", "--title-max": "titleMax", "--desc-min": "descMin", "--desc-max": "descMax"}
var onlyDigits = regexp.MustCompile(`^\d+$`)

// ParseCheckArgs reads a check's arguments the way the old script did; the hook passes SEO.md's 检查参数 through it.
func ParseCheckArgs(argv []string) (CheckOpts, error) {
	opts := CheckOpts{T: DefaultThresholds}
	haveDist := false
	for _, a := range argv {
		switch {
		case a == "--strict":
			opts.Strict = true
		case strings.HasPrefix(a, "--filter="):
			opts.Filter = a[len("--filter="):]
		case strings.HasPrefix(a, "--"):
			parts := strings.Split(a, "=")
			field, ok := numFlags[parts[0]]
			if !ok || len(parts) < 2 || !onlyDigits.MatchString(parts[1]) {
				return opts, fmt.Errorf("不认识的参数「%s」", a)
			}
			n, _ := strconv.Atoi(parts[1])
			switch field {
			case "titleMin":
				opts.T.TitleMin = n
			case "titleMax":
				opts.T.TitleMax = n
			case "descMin":
				opts.T.DescMin = n
			case "descMax":
				opts.T.DescMax = n
			}
		case !haveDist:
			opts.Dist, haveDist = a, true
		default:
			return opts, fmt.Errorf("多余的参数「%s」", a)
		}
	}
	if !haveDist {
		return opts, fmt.Errorf("usage: dyna seo check <产物目录> [--strict] [--filter=<路由片段>] [--title-min=N --title-max=N --desc-min=N --desc-max=N]")
	}
	return opts, nil
}

// RunCheck runs the check: the report for stdout, the reason for stderr, and the exit code (0 no error, 1 errors, 2
// bad arguments or no such directory).
func RunCheck(opts CheckOpts) (stdout, stderr string, code int) {
	distRoot, err := filepath.Abs(opts.Dist)
	if err != nil {
		return "", err.Error(), 2
	}
	if _, err := os.Stat(distRoot); err != nil {
		return "", fmt.Sprintf("✗ 产物目录不存在：%s（先构建）", distRoot), 2
	}
	res, err := Check(distRoot, opts.Filter, opts.T)
	if err != nil {
		return "", err.Error(), 1
	}
	if opts.Filter != "" && len(res.Reported) == 0 {
		return "", fmt.Sprintf("✗ --filter=%s 在 %s 下没匹配到任何路由", opts.Filter, distRoot), 2
	}
	text, c := Render(distRoot, res, opts.Strict, opts.Filter)
	return text, "", c
}

// TouchedSince reports whether any file under dir was modified after since (ms). It stops at the first one.
func TouchedSince(dir string, since float64) bool {
	if _, err := os.Stat(dir); err != nil {
		return false
	}
	stack := []string{dir}
	for len(stack) > 0 {
		d := stack[len(stack)-1]
		stack = stack[:len(stack)-1]
		entries, err := os.ReadDir(d)
		if err != nil {
			continue
		}
		for _, e := range entries {
			p := filepath.Join(d, e.Name())
			st, err := os.Stat(p)
			if err != nil {
				continue
			}
			if st.IsDir() {
				stack = append(stack, p)
			} else if float64(st.ModTime().UnixNano())/1e6 > since {
				return true
			}
		}
	}
	return false
}

var errorLine = regexp.MustCompile(`^ {2}` + notWS)

// ErrorsOnly is a report cut down to the error lines, each under its route, so the feedback stays short.
func ErrorsOnly(report string) string {
	var out []string
	route := ""
	for _, line := range strings.Split(report, "\n") {
		switch {
		case errorLine.MatchString(line):
			route = jsstr.Trim(line)
		case strings.Contains(line, "[ERROR]"):
			if route != "" {
				out = append(out, route)
				route = ""
			}
			out = append(out, line)
		case strings.HasPrefix(line, "Summary:"):
			out = append(out, line)
		}
	}
	return strings.Join(out, "\n")
}

// HookDeps is what the hook reaches outside the process through.
type HookDeps struct {
	Env   home.Env
	Stdin io.Reader
	Now   func() time.Time
}

func (h HookDeps) env() home.Env {
	if h.Env == nil {
		return home.OSEnv
	}
	return h.Env
}

func (h HookDeps) nowMs() float64 {
	if h.Now != nil {
		return float64(h.Now().UnixMilli())
	}
	return float64(time.Now().UnixMilli())
}

func (h HookDeps) stampDir() string {
	if v := h.env()(EnvHookDir); v != "" {
		return v
	}
	return filepath.Join(os.TempDir(), "idea-loop-seo-check")
}

var unsafeID = regexp.MustCompile(`[^A-Za-z0-9_-]`)

func (h HookDeps) stampFile(id string) string {
	return filepath.Join(h.stampDir(), unsafeID.ReplaceAllString(id, "_"))
}

type hookTarget struct {
	root, dist string
	args       []string
}

// target is the build output directory and check arguments SEO.md declares for the project around cwd, or nil. SEO.md
// is in the project's directory in home; the output directory it names is relative to the code repository (the
// worktree the build ran in). A project that has not moved into home, or one that cannot be recognised, has no SEO.md
// to read: nil, and every command passes untouched.
func (h HookDeps) target(cwd string) *hookTarget {
	if cwd == "" {
		return nil
	}
	if st, err := os.Stat(cwd); err != nil || !st.IsDir() {
		return nil
	}
	cmd := exec.Command("git", "rev-parse", "--show-toplevel")
	cmd.Dir = cwd
	out, err := cmd.Output()
	if err != nil {
		return nil
	}
	root := jsstr.Trim(string(out))
	found := home.Locate(cwd, h.env(), "")
	if !found.OK {
		return nil
	}
	seo, err := ReadSeoMd(filepath.Join(found.ProjectDir, "SEO.md"))
	if err != nil || seo.Build.DistDir == nil {
		return nil
	}
	return &hookTarget{root: root, dist: filepath.Join(root, *seo.Build.DistDir), args: seo.Build.CheckArgs}
}

// numberOf is Number(v) for a value read from JSON.
func numberOf(v any) float64 {
	switch t := v.(type) {
	case nil:
		return 0
	case float64:
		return t
	case string:
		return jsNumber(t)
	case bool:
		if t {
			return 1
		}
		return 0
	}
	return math.NaN()
}

// startedAt is when the command started: the PreToolUse record, else now minus PostToolUse's duration_ms.
func (h HookDeps) startedAt(payload *Obj, id string) (float64, bool) {
	file := h.stampFile(id)
	if b, err := os.ReadFile(file); err == nil {
		_ = os.Remove(file)
		if t := jsNumber(string(b)); isFinite(t) {
			return t, true
		}
	}
	ms := numberOf(payload.Get("duration_ms"))
	if payload.Get("duration_ms") == undef {
		ms = math.NaN()
	}
	if isFinite(ms) && ms >= 0 {
		return h.nowMs() - ms - 1000, true
	}
	return 0, false
}

// Run is the hook: PreToolUse leaves a record of when a command started; PostToolUse, after a command that rebuilt
// the site, runs the check. The command has already run, so this cannot stop it: on errors it exits 2 and the error
// lines go back to the model as feedback. Warnings pass, the same bar CI uses without --strict. Anything it cannot
// read passes.
func (h HookDeps) Run() error {
	if h.Stdin == nil {
		return nil
	}
	raw, _ := io.ReadAll(h.Stdin)
	v, err := ParseJSON(raw)
	if err != nil {
		return nil
	}
	payload, ok := v.(*Obj)
	if !ok {
		return nil
	}
	id, _ := payload.Get("tool_use_id").(string)
	if id == "" {
		return nil
	}
	cwd, _ := payload.Get("cwd").(string)
	event, _ := payload.Get("hook_event_name").(string)
	if event == "PreToolUse" {
		if h.target(cwd) == nil {
			return nil
		}
		if os.MkdirAll(h.stampDir(), 0o755) == nil {
			_ = os.WriteFile(h.stampFile(id), []byte(numText(h.nowMs())), 0o644)
		}
		return nil
	}
	if event != "PostToolUse" {
		return nil
	}
	since, ok := h.startedAt(payload, id)
	if !ok {
		return nil
	}
	t := h.target(cwd)
	if t == nil || !TouchedSince(t.dist, since) {
		return nil
	}
	opts, err := ParseCheckArgs(append([]string{t.dist}, t.args...))
	var stdout, stderr string
	code := 2
	if err != nil {
		stderr = err.Error()
	} else {
		stdout, stderr, code = RunCheck(opts)
	}
	if code == 0 {
		return nil
	}
	if code != 1 {
		reason := jsstr.Trim(stderr)
		if reason == "" {
			reason = jsstr.Trim(stdout)
		}
		return &nexterr.Exit{Code: 2, Msg: fmt.Sprintf("seo-check 没跑起来（退出码 %d）：%s", code, reason)}
	}
	return &nexterr.Exit{Code: 2, Msg: strings.Join([]string{
		fmt.Sprintf("构建产物 %s 有 SEO error（idea-loop:seo-check）：", t.dist),
		ErrorsOnly(stdout),
		"改完重新构建；每条规则的理由见 idea-loop:seo-check。",
	}, "\n")}
}
