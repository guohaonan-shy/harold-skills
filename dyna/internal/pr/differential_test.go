package pr_test

import (
	"bytes"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/app"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/githubapp"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/pr"
)

// The old scripts and dyna are asked the same question over the same inputs and must answer the same: the
// description a `body set` writes, the JSON `candidates submit` and `diagnostics filter` print and the exit
// codes they end with, the calls evidence and the archive make to GitHub, the JWT a GitHub App signs. The old
// scripts stay in the repository until the last ticket removes them; node runs them, and without node (or once
// they are gone) these tests are skipped.

func oldScript(t *testing.T, name string) (node, script string) {
	t.Helper()
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node is not installed")
	}
	script, _ = filepath.Abs(filepath.Join("..", "..", "..", "idea-loop", "scripts", name))
	if _, err := os.Stat(script); err != nil {
		t.Skip("the old script is gone")
	}
	return node, script
}

// outcome is what a process did.
type outcome struct {
	stdout, stderr string
	code           int
}

func runOld(t *testing.T, dir, stdin string, env []string, node string, args ...string) outcome {
	t.Helper()
	cmd := exec.Command(node, args...)
	cmd.Dir = dir
	cmd.Env = append(os.Environ(), env...)
	cmd.Stdin = strings.NewReader(stdin)
	var out, errb bytes.Buffer
	cmd.Stdout, cmd.Stderr = &out, &errb
	err := cmd.Run()
	code := 0
	if err != nil {
		ee, ok := err.(*exec.ExitError)
		if !ok {
			t.Fatal(err)
		}
		code = ee.ExitCode()
	}
	return outcome{out.String(), errb.String(), code}
}

func runNew(t *testing.T, stdin string, env map[string]string, deps pr.Deps, args ...string) outcome {
	t.Helper()
	var out, errb bytes.Buffer
	code := app.Run(args, app.IO{
		Stdin: strings.NewReader(stdin), Stdout: &out, Stderr: &errb,
		Env: func(k string) string { return env[k] }, PR: deps,
	})
	return outcome{out.String(), errb.String(), code}
}

// fakeGHScript is a gh that answers from a directory and logs every call (its arguments and its stdin).
const fakeGHScript = `#!/bin/sh
d="$FAKE_GH_DIR"
in=""
case " $* " in *" --input - "*) in="$(cat)";; esac
{ printf 'ARGS %s\n' "$*"; printf 'IN %s\n' "$in"; } >> "$d/log"
case "$*" in
  "api repos/o/r/pulls/5 --method PATCH --input -") printf '%s' "$in" > "$d/patched.json"; echo '{}';;
  "api repos/o/r/pulls/5"*) cat "$d/pr.json";;
  "api repos/o/r/issues/5/comments?per_page=100 --method GET --paginate --slurp") echo '[[]]';;
  "api repos/o/r/issues/5/comments --method POST --input -") echo '{"html_url":"https://x/1"}';;
  "api repos/o/r/git/ref/heads/idea-loop-evidence-pr-7 --method GET") if [ -f "$d/branch" ]; then echo '{"object":{"sha":"old"}}'; else echo "Not Found" >&2; exit 1; fi;;
  "api repos/o/r/git/commits/old --method GET") echo '{"tree":{"sha":"oldtree"}}';;
  "api repos/o/r/git/trees/old --method GET") echo '{"tree":[{"path":"a.png","type":"blob"},{"path":"sub","type":"tree"}]}';;
  "api repos/o/r/git/blobs --method POST --input -") echo '{"sha":"blobsha"}';;
  "api repos/o/r/git/trees --method POST --input -") echo '{"sha":"treesha"}';;
  "api repos/o/r/git/commits --method POST --input -") echo '{"sha":"commitsha"}';;
  "api repos/o/r/git/refs --method POST --input -"|"api repos/o/r/git/refs/heads/idea-loop-evidence-pr-7 --method PATCH --input -"|"api repos/o/r/git/refs/heads/idea-loop-evidence-pr-7 --method DELETE") echo '{}';;
  "release view"*) echo '{"isDraft":true}';;
  "release delete"*) echo '';;
  *) echo "fake gh: no route for $*" >&2; exit 1;;
esac
`

// installFakeGH installs the script as `gh` on PATH for this test and returns its data directory.
func installFakeGH(t *testing.T) (dir string, env []string) {
	t.Helper()
	bin := t.TempDir()
	data := t.TempDir()
	write(t, filepath.Join(bin, "gh"), fakeGHScript)
	if err := os.Chmod(filepath.Join(bin, "gh"), 0o755); err != nil {
		t.Fatal(err)
	}
	path := bin + string(os.PathListSeparator) + os.Getenv("PATH")
	t.Setenv("PATH", path)
	t.Setenv("FAKE_GH_DIR", data)
	return data, []string{"PATH=" + path, "FAKE_GH_DIR=" + data}
}

type logged struct {
	args string
	in   any
}

func readLog(t *testing.T, data string) []logged {
	t.Helper()
	raw, _ := os.ReadFile(filepath.Join(data, "log"))
	var out []logged
	for _, chunk := range strings.Split(strings.TrimRight(string(raw), "\n"), "ARGS ")[1:] {
		args, rest, _ := strings.Cut(chunk, "\nIN ")
		var in any
		if s := strings.TrimSpace(rest); s != "" {
			if err := json.Unmarshal([]byte(s), &in); err != nil {
				t.Fatalf("stdin of %q is not JSON: %v", args, err)
			}
		}
		out = append(out, logged{strings.TrimSpace(args), in})
	}
	os.Remove(filepath.Join(data, "log"))
	return out
}

// ---- pr body set ----

func TestBodySetWritesTheSameDescriptionAsTheOldScriptAndRefusesTheSameWays(t *testing.T) {
	node, script := oldScript(t, "pr-body.mjs")
	data, env := installFakeGH(t)
	human := "Refs o/r#3\n\n人手写的说明\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)"
	legacy := "<!-- idea-loop:section issues -->\n## 顺带开的 issue\n\n- [旧报告缓存不清](https://github.com/o/r/issues/12)：不是这次引入的\n<!-- /idea-loop:section issues -->\n\n" + human
	old := "<!-- idea-loop:section changes -->\n## 改了什么\n\n### 重试页\n\n之前 → 之后\n<!-- /idea-loop:section changes -->\n\n<!-- idea-loop:section review -->\n## Review · 第 1 轮\n<!-- /idea-loop:section review -->\n\n" + human
	full := "<!-- idea-loop:section summary -->\n## 一句话\n\nS\n<!-- /idea-loop:section summary -->\n\n<!-- idea-loop:section rollback -->\n## 能否回滚\n\n**能不能撤回**：能。\n\n**顺带开的 issue**\n\n- [旧报告缓存不清](https://github.com/o/r/issues/12)\n<!-- /idea-loop:section rollback -->\n\n" + human
	cases := []struct {
		name, body, section, content string
	}{
		{"into an empty description", "", "summary", "学生重试失败的题不再扣次数"},
		{"beside hand-written text", human, "problem", "重试失败的题多扣两次"},
		{"the heading written by the writer is not doubled", human, "your-todo", "## 要你做的事\n\n- [ ] Harold：改 Railway 根目录"},
		{"an old issues section is folded into 能否回滚", legacy, "summary", "S"},
		{"the folded list outlives a rewrite of 能否回滚", full, "rollback", "**能不能撤回**：能，撤销合并即可。"},
		{"a rewrite that brings its own list", full, "rollback", "**能不能撤回**：能。\n\n**顺带开的 issue**\n\n- [另一个](https://github.com/o/r/issues/13)"},
		{"the old 改了什么 heading and the legacy review section", old, "problem", "重试多扣次数"},
		{"empty content removes the section", full, "summary", ""},
		{"a heading alone removes the section", full, "summary", "## 一句话\n"},
		{"live URLs are not code references", human, "live-check", "https://cookbook.example/blog/weeknight-dinners 目标词：weeknight dinner ideas"},
		{"the night sections", human, "night-decided", "- **要不要保留旧入口**：选了保留，因为老用户还在用；另一种是直接删掉"},
		{"a reference may carry code words", human, "reference", "01 · 缓存 | a1b2c3d | src/cache.ts:42 | `x`"},
		{"a backtick is refused", human, "changes", "重试时不再调 `retryAnalysis`"},
		{"a path with a line is refused", human, "your-todo", "- [ ] 看 src/report/player.tsx:42"},
		{"a commit hash is refused", human, "rollback", "- 见 a1b2c3d 的提交"},
		{"snake_case and a call and a section number are refused", human, "problem", "fail_text_analysis 和 submit() 见 §4.7"},
		{"a body over the limit is refused", human, "reference", strings.Repeat("x", 70000)},
		{"emoji count as two characters toward the limit", human, "reference", strings.Repeat("😀", 33000)},
		{"CJK counts as one", human, "reference", strings.Repeat("好", 60000)},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			prJSON, _ := json.Marshal(map[string]string{"body": c.body})
			write(t, filepath.Join(data, "pr.json"), string(prJSON))
			content := write(t, filepath.Join(t.TempDir(), "c.md"), c.content)
			os.Remove(filepath.Join(data, "patched.json"))
			want := runOld(t, "", "", env, node, script, "set", "o/r", "5", c.section, content)
			wantPatch, _ := os.ReadFile(filepath.Join(data, "patched.json"))
			os.Remove(filepath.Join(data, "patched.json"))
			got := runNew(t, "", nil, pr.Deps{}, "pr", "body", "set", "o/r", "5", c.section, content)
			gotPatch, _ := os.ReadFile(filepath.Join(data, "patched.json"))
			if got.code != want.code || got.stdout != want.stdout || got.stderr != want.stderr {
				t.Fatalf("old %+v\nnew %+v", want, got)
			}
			if string(gotPatch) != string(wantPatch) {
				var a, b map[string]string
				_ = json.Unmarshal(wantPatch, &a)
				_ = json.Unmarshal(gotPatch, &b)
				if !reflect.DeepEqual(a, b) {
					t.Fatalf("the written descriptions differ\nold: %q\nnew: %q", a["body"], b["body"])
				}
			}
			// and `get` reads back what `set` wrote
			if want.code == 0 && len(wantPatch) > 0 && c.content != "" {
				var w map[string]string
				_ = json.Unmarshal(wantPatch, &w)
				prJSON, _ := json.Marshal(map[string]string{"body": w["body"]})
				write(t, filepath.Join(data, "pr.json"), string(prJSON))
				oldGet := runOld(t, "", "", env, node, script, "get", "o/r", "5", c.section)
				newGet := runNew(t, "", nil, pr.Deps{}, "pr", "body", "get", "o/r", "5", c.section)
				if oldGet != newGet {
					t.Fatalf("get: old %+v\nnew %+v", oldGet, newGet)
				}
			}
		})
	}
}

// ---- pr candidates submit, pr diagnostics filter ----

func git(t *testing.T, dir string, args ...string) {
	t.Helper()
	cmd := exec.Command("git", append([]string{"-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false"}, args...)...)
	cmd.Dir = dir
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("git %v: %v: %s", args, err, out)
	}
}

// reviewRepo is a repository with a main and a feature branch that adds src/api/handler.ts, the spec and rule files
// the candidates quote, and an evidence directory with one figure of round 1.
func reviewRepo(t *testing.T) (repo string) {
	t.Helper()
	repo = t.TempDir()
	git(t, repo, "init", "-q", "-b", "main")
	write(t, filepath.Join(repo, "docs/spec/practice-retry/tickets/03-retry.md"), "- [x] 失败后点「重试」，只重新分析这一题，  不消耗配额")
	write(t, filepath.Join(repo, "docs/reference/code-layering.md"), "路由层不直接访问数据库，\n统一经过 service 层。")
	write(t, filepath.Join(repo, "docs/reference/wording.md"), "界面文案里的按钮名称统一用两个字的动词。")
	write(t, filepath.Join(repo, "src/api/legacy.ts"), "export const quota = readQuota();\nexport function readQuota() {\n  return db.query('select quota');\n}\n")
	write(t, filepath.Join(repo, "evidence/r1-retry-quota.png"), "PNG")
	git(t, repo, "add", ".")
	git(t, repo, "commit", "-q", "-m", "base")
	git(t, repo, "checkout", "-q", "-b", "feature")
	write(t, filepath.Join(repo, "src/api/handler.ts"), "import { db } from '../db/client';\nexport async function handler(req) {\n  return db.query('select 1');\n}\n")
	git(t, repo, "add", ".")
	git(t, repo, "commit", "-q", "-m", "feature")
	return repo
}

func TestCandidatesSubmitSaysWhatTheOldReviewCheckSaidOverTheSameRound(t *testing.T) {
	node, script := oldScript(t, "review-check.mjs")
	repo := reviewRepo(t)
	t.Chdir(repo)
	opts := []any{
		map[string]any{"do": "修：重试不扣次数", "cost": "重试路径要多一次判断", "rollback": "能，改回去即可，没有数据迁移"},
		map[string]any{"do": "不修：改工单，承认重试要扣次数", "cost": "学生失败一次就少一次机会", "rollback": "能，工单可以再改回来"},
	}
	decide := map[string]any{"options": opts, "recommend": "修，这是用户能感到的损失。"}
	spec := func(over map[string]any) map[string]any {
		m := map[string]any{
			"id": "S1", "title": "连续失败的学生会提前用完当天的每日额度", "behavior": true, "on_screen": true,
			"quote":  map[string]any{"file": "docs/spec/practice-retry/tickets/03-retry.md", "text": "只重新分析这一题， 不消耗配额"},
			"figure": "r1-retry-quota.png",
			"now":    "工单要求重试不消耗次数；现在分析失败后点重试，每次都扣一次当天的每日额度。", "impact": "连续失败几次的学生会提前用完当天的每日额度。", "decide": decide,
		}
		for k, v := range over {
			if v == nil {
				delete(m, k)
			} else {
				m[k] = v
			}
		}
		return m
	}
	std := func(over map[string]any) map[string]any {
		m := map[string]any{
			"id": "C1", "title": "接口直接查数据库",
			"rule": map[string]any{"file": "docs/reference/code-layering.md", "text": "路由层不直接访问数据库"},
			"code": map[string]any{"path": "src/api/handler.ts", "snippet": "import { db } from '../db/client';"}, "locations": []any{"src/api/handler.ts:2"},
			"now": "分层规则写明路由层不直接访问数据库；分析接口直接查了数据库。", "impact": "以后换存储时这一处会被漏掉。",
			"decide": map[string]any{"options": []any{
				map[string]any{"do": "修：把查询挪进业务层", "cost": "多一个函数", "rollback": "能，纯代码改动"},
				map[string]any{"do": "开 issue：这次不动", "cost": "规则在这一处继续不成立", "rollback": "能，随时可以再改"},
			}, "recommend": "修，改动很小。"},
		}
		for k, v := range over {
			if v == nil {
				delete(m, k)
			} else {
				m[k] = v
			}
		}
		return m
	}
	basis := map[string]any{"kind": "规则原文", "file": "docs/reference/wording.md", "text": "按钮名称统一用两个字的动词", "summary": "仓库的文案规定写明按钮名称统一用两个字的动词。"}
	ruledS := spec(map[string]any{"id": "S3", "disposition": "照规则", "basis": basis, "action": "同步改", "decide": nil})
	ruledC := std(map[string]any{"disposition": "照规则", "action": "修", "decide": nil})
	stock := std(map[string]any{"id": "C2", "disposition": "照规则", "action": "修", "decide": nil,
		"code": map[string]any{"path": "src/api/legacy.ts", "snippet": "export const quota = readQuota();"}, "existing": true, "pollutes": "这次的每日额度统计读的就是这个值，它错了，统计就跟着错。"})
	table := "| 第几步 | 麦克风 |\n|---|---|\n| 示范还在播 | 已打开 |"
	rounds := map[string]map[string]any{
		"all grounded and in shape":                     {"spec": []any{spec(nil)}, "standards": []any{std(nil)}},
		"ruled findings":                                {"spec": []any{ruledS}, "standards": []any{ruledC, stock}},
		"a table where a screenshot is due":             {"spec": []any{spec(map[string]any{"figure": nil, "example": table})}},
		"no screenshot, and says why":                   {"spec": []any{spec(map[string]any{"figure": nil, "example": table, "no_screenshot": "只有戴蓝牙耳机的真机才复现得出来"})}},
		"an inline example for something not on screen": {"spec": []any{spec(map[string]any{"on_screen": false, "figure": nil, "example": "| 次数 | main | 本分支 |\n|---|---|---|\n| 1 | 5 | 4 |"})}},
		"non-behavioural, with and without a figure": {"spec": []any{
			spec(map[string]any{"id": "S2", "behavior": false, "figure": nil}), spec(map[string]any{"id": "S4", "behavior": false})}},
		"missing parts and code words": {"spec": []any{spec(map[string]any{"impact": "", "now": "spec §4.7 写的是…", "decide": map[string]any{"options": []any{map[string]any{"do": "修", "cost": "", "rollback": "能"}}}})},
			"standards": []any{std(map[string]any{"now": "`handler` 里 import 了 db"})}},
		"ruled with a broken basis": {"spec": []any{
			spec(map[string]any{"id": "S5", "disposition": "照规则", "decide": nil, "action": "修"}),
			spec(map[string]any{"id": "S6", "disposition": "照规则", "decide": decide, "basis": basis, "action": "改一改"}),
			spec(map[string]any{"id": "S7", "disposition": "照规则", "decide": nil, "action": "修", "basis": map[string]any{"kind": "我觉得", "summary": "见 docs/reference/wording.md"}}),
			spec(map[string]any{"id": "S8", "disposition": "随便"}),
		}},
		"ungrounded, every way": {
			"spec": []any{
				spec(map[string]any{"id": "D1", "quote": map[string]any{"file": "docs/spec/practice-retry/tickets/03-retry.md", "text": "重试最多三次"}}),
				spec(map[string]any{"id": "D2", "figure": nil}),
				spec(map[string]any{"id": "D3", "figure": "r0-x.png"}),
				spec(map[string]any{"id": "D4", "figure": "r1-missing.png"}),
				spec(map[string]any{"id": "D5", "quote": nil}),
				spec(map[string]any{"id": "D6", "quote": map[string]any{"file": "docs/nope.md", "text": "x"}}),
				spec(map[string]any{"id": "D7", "disposition": "照规则", "decide": nil, "action": "修", "basis": map[string]any{"kind": "规则原文", "file": "docs/reference/wording.md", "text": "按钮名称一律写英文", "summary": "x"}}),
				spec(map[string]any{"id": "D8", "disposition": "照规则", "decide": nil, "action": "修", "basis": map[string]any{"file": "docs/reference/missing.md", "text": "x", "summary": "x"}}),
			},
			"standards": []any{
				std(map[string]any{"id": "D9", "rule": map[string]any{"file": "docs/reference/code-layering.md", "text": "禁止使用 any"}}),
				std(map[string]any{"id": "D10", "code": map[string]any{"path": "src/api/handler.ts", "snippet": "legacyCall();"}}),
				std(map[string]any{"id": "D11", "rule": map[string]any{"file": "CODING.md", "text": "x"}}),
				std(map[string]any{"id": "D12", "code": nil}),
				stockWith(stock, map[string]any{"id": "D13", "code": map[string]any{"path": "src/api/legacy.ts", "snippet": "not there();"}}),
				stockWith(stock, map[string]any{"id": "D14", "existing": nil}),
				stockWith(stock, map[string]any{"id": "D15", "pollutes": ""}),
				stockWith(stock, map[string]any{"id": "D16", "disposition": nil}),
			},
		},
		"an empty round": {},
	}
	for name, cands := range rounds {
		t.Run(name, func(t *testing.T) {
			raw, _ := json.Marshal(cands)
			file := write(t, filepath.Join(t.TempDir(), "candidates.json"), string(raw))
			want := runOld(t, repo, "", nil, node, script, file, "main", "evidence", "1")
			got := runNew(t, "", nil, pr.Deps{}, "pr", "candidates", "submit", file, "main", "evidence", "1")
			if got.code != want.code {
				t.Fatalf("exit: old %d new %d\n%s", want.code, got.code, got.stderr)
			}
			var a, b any
			if err := json.Unmarshal([]byte(want.stdout), &a); err != nil {
				t.Fatalf("old: %v\n%s %s", err, want.stdout, want.stderr)
			}
			if err := json.Unmarshal([]byte(got.stdout), &b); err != nil {
				t.Fatalf("new: %v\n%s %s", err, got.stdout, got.stderr)
			}
			if !reflect.DeepEqual(a, b) {
				t.Fatalf("old:\n%s\nnew:\n%s", want.stdout, got.stdout)
			}
			if want.code == 2 && !strings.Contains(got.stderr, "dyna pr candidates submit") {
				t.Fatalf("a refusal says what to do: %q", got.stderr)
			}
		})
	}
}

func stockWith(base map[string]any, over map[string]any) map[string]any {
	m := map[string]any{}
	for k, v := range base {
		m[k] = v
	}
	for k, v := range over {
		if v == nil {
			delete(m, k)
		} else {
			m[k] = v
		}
	}
	return m
}

func TestCandidatesSubmitAndTheOldScriptAgreeOnWhatIsAnError(t *testing.T) {
	node, script := oldScript(t, "review-check.mjs")
	repo := reviewRepo(t)
	t.Chdir(repo)
	good := write(t, filepath.Join(t.TempDir(), "c.json"), "{}")
	for name, args := range map[string][]string{
		"no round":           {good, "main", "evidence"},
		"round not a number": {good, "main", "evidence", "one"},
		"unknown base":       {good, "nope", "evidence", "1"},
		"missing file":       {filepath.Join(t.TempDir(), "none.json"), "main", "evidence", "1"},
	} {
		want := runOld(t, repo, "", nil, node, append([]string{script}, args...)...)
		got := runNew(t, "", nil, pr.Deps{}, append([]string{"pr", "candidates", "submit"}, args...)...)
		if want.code != 1 || got.code != 1 || want.stdout != "" || got.stdout != "" {
			t.Errorf("%s: old %+v new %+v", name, want, got)
		}
	}
}

func TestDiagnosticsFilterPrintsWhatTheOldScriptPrinted(t *testing.T) {
	node, script := oldScript(t, "changed-lines.mjs")
	repo := reviewRepo(t)
	t.Chdir(repo)
	input := "src/api/handler.ts:1:1: unused import\nsrc/api/handler.ts(3,5): error TS2304: x\n" + repo + "/src/api/handler.ts:4:1: closing brace\nsrc/api/legacy.ts:2:1: old debt\n./lib/x.ts:9: elsewhere\nFound 5 errors.\n\n  \n"
	want := runOld(t, repo, input, nil, node, script, "main")
	got := runNew(t, input, nil, pr.Deps{}, "pr", "diagnostics", "filter", "main")
	if want != got || want.code != 0 {
		t.Fatalf("old %+v\nnew %+v", want, got)
	}
	want = runOld(t, repo, input, nil, node, script, "nope")
	got = runNew(t, input, nil, pr.Deps{}, "pr", "diagnostics", "filter", "nope")
	if want.code != 1 || got.code != 1 {
		t.Fatalf("old %+v\nnew %+v", want, got)
	}
}

// ---- pr loop ----

func TestLoopNextAndCheckPrintWhatTheOldScriptPrinted(t *testing.T) {
	node, script := oldScript(t, "review-loop.mjs")
	dir := t.TempDir()
	file := write(t, filepath.Join(dir, "5.md"), `# PR #5 的 review loop

<!-- idea-loop-entry {"kind":"pause","round":1} -->
## 第 1 次停下
### 你的批示（2026-10-13 09:10）
> 03 选 A
### 做了什么
- 继续

<!-- idea-loop-entry {"kind":"review","round":1} -->
## Review 第 1 轮
### 要你决定
#### S1 · 标题

<!-- idea-loop-entry {"kind":"review","round":2,"from":"impl"} -->
## 第 3 次 · 来自实现
### 做了什么
- 继续下一批

<!-- idea-loop-entry {"kind":"replay","round":1} -->
## 规则回放 第 1 次
### 做了什么
- 全部用例都过
`)
	none := filepath.Join(dir, "none.md")
	bad := write(t, filepath.Join(dir, "bad.md"), `<!-- idea-loop-entry {"kind":"note","round":1} -->`)
	for _, args := range [][]string{
		{"check", file}, {"check", none}, {"check", bad},
		{"next", file, "review"}, {"next", file, "review", "impl"}, {"next", file, "pause"}, {"next", file, "replay"},
		{"next", none, "review"}, {"next", none, "replay"}, {"next", file, "bogus"},
	} {
		want := runOld(t, "", "", nil, node, append([]string{script}, args...)...)
		newArgs := append([]string{"pr", "loop"}, args...)
		got := runNew(t, "", nil, pr.Deps{}, newArgs...)
		if got.code != want.code || got.stdout != want.stdout {
			t.Errorf("%v: old %+v\nnew %+v", args, want, got)
		}
		if want.code != 0 && got.stderr == "" {
			t.Errorf("%v: a refusal says why", args)
		}
	}
}

func TestLoopArchivePostsTheSameCommentsAsTheOldScript(t *testing.T) {
	node, script := oldScript(t, "review-loop.mjs")
	data, env := installFakeGH(t)
	home := t.TempDir() // no ~/.idea-loop/github-apps.json here: the gh login speaks
	env = append(env, "HOME="+home)
	file := write(t, filepath.Join(t.TempDir(), "5.md"), `# PR #5 的 review loop

<!-- idea-loop-entry {"kind":"pause","round":1} -->
## 第 1 次停下
### 做了什么
- 继续

<!-- idea-loop-entry {"kind":"review","round":1} -->
## Review 第 1 轮
### 你的批示（2026-10-13 14:02）
> S1 接受
### 做了什么
- S1 写回 spec 😀

<!-- idea-loop-entry {"kind":"review","round":2,"from":"impl"} -->
## 第 3 次 · 来自实现
### 做了什么
- 继续下一批
`)
	want := runOld(t, "", "", env, node, script, "archive", file, "o/r", "5")
	wantLog := readLog(t, data)
	got := runNew(t, "", map[string]string{"HOME": home}, pr.Deps{}, "pr", "loop", "archive", file, "o/r", "5")
	gotLog := readLog(t, data)
	if want.code != 0 || got.code != 0 {
		t.Fatalf("old %+v\nnew %+v", want, got)
	}
	if want.stdout != got.stdout {
		t.Fatalf("old %s\nnew %s", want.stdout, got.stdout)
	}
	if len(wantLog) != 4 || !reflect.DeepEqual(wantLog, gotLog) {
		t.Fatalf("old calls %+v\nnew calls %+v", wantLog, gotLog)
	}
}

// ---- pr evidence ----

func TestEvidenceTalksToGitHubInTheSameOrderWithTheSameBodiesAsTheOldScript(t *testing.T) {
	node, script := oldScript(t, "evidence.mjs")
	data, env := installFakeGH(t)
	dir := t.TempDir()
	a := write(t, filepath.Join(dir, "r1-s1-flow.png"), "PNG-A")
	b := write(t, filepath.Join(dir, "t03-dwell.gif"), "GIF-B")
	for _, withBranch := range []bool{false, true} {
		os.Remove(filepath.Join(data, "branch"))
		if withBranch {
			write(t, filepath.Join(data, "branch"), "x")
		}
		for _, args := range [][]string{
			{"publish", "o/r", "7", a, b}, {"list", "o/r", "7"}, {"cleanup", "o/r", "7"},
			{"publish", "o/r", "7", filepath.Join(dir, "flow.png")}, {"publish", "o/r", "7"},
		} {
			want := runOld(t, "", "", env, node, append([]string{script}, args...)...)
			wantLog := readLog(t, data)
			got := runNew(t, "", nil, pr.Deps{}, append([]string{"pr", "evidence"}, args...)...)
			gotLog := readLog(t, data)
			if got.code != want.code || got.stdout != want.stdout {
				t.Errorf("branch=%v %v: old %+v\nnew %+v", withBranch, args, want, got)
			}
			if !reflect.DeepEqual(wantLog, gotLog) {
				t.Errorf("branch=%v %v: calls differ\nold %+v\nnew %+v", withBranch, args, wantLog, gotLog)
			}
			if want.code == 2 && got.stderr == "" {
				t.Errorf("%v: refusals say why", args)
			}
		}
	}
}

// ---- the GitHub App's JWT ----

func TestTheJWTIsByteForByteTheOneTheOldScriptSigns(t *testing.T) {
	node, _ := oldScript(t, "github-app.mjs")
	_, script := oldScript(t, "github-app.mjs")
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	der, _ := x509.MarshalPKCS8PrivateKey(key)
	pemBytes := pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: der})
	pemPath := write(t, filepath.Join(t.TempDir(), "app.pem"), string(pemBytes))
	prog := `import { appJwt } from ` + jsString(script) + `; import { readFileSync } from 'node:fs'; console.log(appJwt(4948428, readFileSync(process.argv[1], 'utf8'), 1000000))`
	want := runOld(t, "", "", nil, node, "--input-type=module", "-e", prog, pemPath)
	if want.code != 0 {
		t.Fatal(want.stderr)
	}
	got, err := githubapp.JWT(4948428, pemBytes, 1000000)
	if err != nil {
		t.Fatal(err)
	}
	if strings.TrimSpace(want.stdout) != got {
		t.Fatalf("old %s\nnew %s", want.stdout, got)
	}
}

func jsString(s string) string {
	b, _ := json.Marshal(s)
	return string(b)
}
