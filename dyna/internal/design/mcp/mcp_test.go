package mcp

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"regexp"
	"sort"
	"strings"
	"testing"

	"github.com/spf13/cobra"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/design/fixture"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/design/query"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/frontmatter"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/home"
)

// The assertions of the old design-archive-mcp.test.mjs, in its order, run in-process: the same messages go in
// as lines and the responses come back as lines.

var toolNames = []string{"design_page", "design_state", "design_journey", "design_diff", "design_refs", "design_keyword", "design_affected"}

const remote = "https://github.com/acme/example-app"

func git(t *testing.T, cwd string, args ...string) (string, error) {
	t.Helper()
	full := append([]string{"-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false"}, args...)
	cmd := exec.Command("git", full...)
	cmd.Dir = cwd
	out, err := cmd.CombinedOutput()
	return strings.TrimSpace(string(out)), err
}

func mustGit(t *testing.T, cwd string, args ...string) string {
	t.Helper()
	out, err := git(t, cwd, args...)
	if err != nil {
		t.Fatalf("git %s: %v\n%s", strings.Join(args, " "), err, out)
	}
	return out
}

// world is a fake world: a home that registers example-app, the compliant fixture (plus optionally more files)
// as the registered project's directory in home, and a code repository (the worktree a session opens in) whose
// origin is the registered remote. Nothing here is the machine's own home: the server gets an environment that
// points at the fake one.
type world struct {
	base, home, projectDir, code string
}

func gitRepo(t *testing.T, extra fixture.Files) world {
	t.Helper()
	base, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	h := filepath.Join(base, "home")
	projectDir := filepath.Join(h, "projects", "example-app")
	if err := os.MkdirAll(projectDir, 0o755); err != nil {
		t.Fatal(err)
	}
	agents := "# 设备\n\n## 项目\n\nexample-app（一个例子）: ~/projects/example-app. Clone from " + remote + " if missing.\n"
	if err := os.WriteFile(filepath.Join(h, "AGENTS.md"), []byte(agents), 0o644); err != nil {
		t.Fatal(err)
	}
	files := fixture.Compliant()
	for k, v := range extra {
		files[k] = v
	}
	if _, err := fixture.WriteRepo(files, projectDir); err != nil {
		t.Fatal(err)
	}
	mustGit(t, h, "init", "-q", "-b", "main") // a real home is a git repository
	code := filepath.Join(base, "code", "example-app")
	if err := os.MkdirAll(code, 0o755); err != nil {
		t.Fatal(err)
	}
	mustGit(t, code, "init", "-q", "-b", "main")
	mustGit(t, code, "remote", "add", "origin", "git@github.com:acme/example-app.git")
	return world{base: base, home: h, projectDir: projectDir, code: code}
}

var initMsg = map[string]any{"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": map[string]any{"protocolVersion": "2025-06-18", "capabilities": map[string]any{}, "clientInfo": map[string]any{"name": "test", "version": "0"}}}
var listMsg = map[string]any{"jsonrpc": "2.0", "id": 2, "method": "tools/list"}

func call(id int, name string, args map[string]any) map[string]any {
	return map[string]any{"jsonrpc": "2.0", "id": id, "method": "tools/call", "params": map[string]any{"name": name, "arguments": args}}
}

type reply struct {
	out  []map[string]any
	byID map[string]map[string]any
}

func (r reply) id(n int) map[string]any { return r.byID[fmt.Sprint(float64(n))] }

// session runs the server against these messages (objects or raw lines); responses by id. cwd is where the
// session was opened and homeDir where IDEA_LOOP_HOME points (empty: no home at all).
func session(t *testing.T, cwd, homeDir string, messages ...any) reply {
	t.Helper()
	var in strings.Builder
	for _, m := range messages {
		if s, ok := m.(string); ok {
			in.WriteString(s + "\n")
			continue
		}
		b, err := json.Marshal(m)
		if err != nil {
			t.Fatal(err)
		}
		in.Write(b)
		in.WriteString("\n")
	}
	env := map[string]string{"HOME": filepath.Dir(cwd)}
	if homeDir != "" {
		env["IDEA_LOOP_HOME"] = homeDir
	}
	var out bytes.Buffer
	if err := Serve(strings.NewReader(in.String()), &out, Deps{Env: func(k string) string { return env[k] }, Cwd: cwd}); err != nil {
		t.Fatal(err)
	}
	r := reply{byID: map[string]map[string]any{}}
	for _, line := range strings.Split(out.String(), "\n") {
		if line == "" {
			continue
		}
		var m map[string]any
		if err := json.Unmarshal([]byte(line), &m); err != nil {
			t.Fatalf("a response that is not JSON: %q", line)
		}
		r.out = append(r.out, m)
		r.byID[fmt.Sprint(m["id"])] = m
	}
	return r
}

func (w world) session(t *testing.T, messages ...any) reply {
	return session(t, w.code, w.home, messages...)
}

func get(v any, path ...any) any {
	for _, p := range path {
		switch k := p.(type) {
		case string:
			m, ok := v.(map[string]any)
			if !ok {
				return nil
			}
			v = m[k]
		case int:
			l, ok := v.([]any)
			if !ok || k >= len(l) {
				return nil
			}
			v = l[k]
		}
	}
	return v
}

func textOf(res map[string]any) string {
	var b strings.Builder
	for _, c := range get(res, "result", "content").([]any) {
		b.WriteString(get(c, "text").(string))
	}
	return b.String()
}

func isError(res map[string]any) bool { return get(res, "result", "isError") == true }

func eq(t *testing.T, got, want any, msg ...string) {
	t.Helper()
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("%s\n got  %#v\n want %#v", strings.Join(msg, " "), got, want)
	}
}

func match(t *testing.T, s, pattern string, msg ...string) {
	t.Helper()
	if !regexp.MustCompile(pattern).MatchString(s) {
		t.Fatalf("%s: %q does not match /%s/", strings.Join(msg, " "), s, pattern)
	}
}

// cliJSON is what `dyna design archive query` would print for these arguments, parsed.
func cliJSON(t *testing.T, root, entry, arg string, opts query.Options) any {
	t.Helper()
	v, err := query.Query(root, entry, arg, opts)
	if err != nil {
		t.Fatal(err)
	}
	text, err := frontmatter.JSON(v, 2)
	if err != nil {
		t.Fatal(err)
	}
	var out any
	if err := json.Unmarshal([]byte(text), &out); err != nil {
		t.Fatal(err)
	}
	return out
}

func parse(t *testing.T, text string) any {
	t.Helper()
	var out any
	if err := json.Unmarshal([]byte(text), &out); err != nil {
		t.Fatalf("not JSON: %q", text)
	}
	return out
}

func sortedNames(tools any) []string {
	var out []string
	for _, x := range tools.([]any) {
		out = append(out, get(x, "name").(string))
	}
	sort.Strings(out)
	return out
}

func sortedCopy(xs []string) []string {
	out := append([]string(nil), xs...)
	sort.Strings(out)
	return out
}

func propNames(tool any) []string {
	var out []string
	for k := range get(tool, "inputSchema", "properties").(map[string]any) {
		out = append(out, k)
	}
	return sortedCopy(out)
}

func toolOf(tools any, name string) any {
	for _, x := range tools.([]any) {
		if get(x, "name") == name {
			return x
		}
	}
	return nil
}

// ---------- initialize and tools/list ----------

func TestStdioInitializeAnswersWithTheToolsCapabilityAndToolsListReturnsTheSevenTools(t *testing.T) {
	s := gitRepo(t, nil).session(t, initMsg, map[string]any{"jsonrpc": "2.0", "method": "notifications/initialized"}, listMsg)
	eq(t, get(s.id(1), "result", "protocolVersion"), "2025-06-18")
	if get(s.id(1), "result", "capabilities", "tools") == nil {
		t.Fatal("no tools capability")
	}
	if get(s.id(1), "result", "serverInfo", "name") == "" {
		t.Fatal("no server name")
	}
	eq(t, len(s.out), 2, "the initialized notification gets no reply")

	tools := get(s.id(2), "result", "tools")
	eq(t, sortedNames(tools), sortedCopy(toolNames))
	required := func(name string) any { return get(toolOf(tools, name), "inputSchema", "required") }
	for _, x := range tools.([]any) {
		name := get(x, "name").(string)
		eq(t, get(x, "inputSchema", "type"), "object", name)
		if !contains(propNames(x), "project") {
			t.Fatalf("%s takes an optional project", name)
		}
		for _, r := range get(x, "inputSchema", "required").([]any) {
			if r == "project" {
				t.Fatalf("%s: project is optional", name)
			}
		}
	}
	for name, want := range map[string]string{"design_page": "name", "design_state": "name", "design_journey": "name", "design_refs": "name", "design_keyword": "text", "design_diff": "spec", "design_affected": "commit"} {
		eq(t, required(name), []any{want}, name)
	}
	// every entry but the requirement diff can read "after the change"; the diff compares by itself
	for _, n := range []string{"design_page", "design_state", "design_journey", "design_refs", "design_keyword", "design_affected"} {
		if !contains(propNames(toolOf(tools, n)), "delta") {
			t.Fatalf("%s has no delta", n)
		}
	}
	eq(t, propNames(toolOf(tools, "design_diff")), []string{"project", "spec"})
}

func contains(xs []string, x string) bool {
	for _, e := range xs {
		if e == x {
			return true
		}
	}
	return false
}

func TestToolsListEachDescriptionSaysWhenToReachForTheTool(t *testing.T) {
	s := gitRepo(t, nil).session(t, initMsg, listMsg)
	tools := get(s.id(2), "result", "tools")
	d := func(n string) string { return get(toolOf(tools, n), "description").(string) }
	for _, name := range toolNames {
		match(t, d(name), "什么时候用|用于|当你|要.*时", name)
	}
	match(t, d("design_state"), "复现|测试")
	match(t, d("design_diff"), "(?i)需求|spec")
	match(t, d("design_refs"), "组件|动效")
	match(t, d("design_keyword"), "不知道|不确定|模糊|关键词")
	match(t, d("design_affected"), "提交")
}

func TestPingIsAnsweredAnUnknownMethodIsAJSONRPCErrorNotACrash(t *testing.T) {
	s := gitRepo(t, nil).session(t, initMsg,
		map[string]any{"jsonrpc": "2.0", "id": 2, "method": "ping"},
		map[string]any{"jsonrpc": "2.0", "id": 3, "method": "resources/list"},
		map[string]any{"jsonrpc": "2.0", "id": 4, "method": "tools/list"})
	eq(t, get(s.id(2), "result"), map[string]any{})
	eq(t, get(s.id(3), "error", "code"), float64(-32601))
	eq(t, len(get(s.id(4), "result", "tools").([]any)), 7)
}

// ---------- tools/call equals the command line ----------

const (
	deltaDir = "docs/design/tmp/" + fixture.SpecSlug + "/delta"
	share    = deltaDir + "/pages/cookbook/cookbook--share-sheet.md"
)

const shareSheet = "---\ntype: design-state\ntags: [cookbook]\nsummary: 分享面板\npage: \"[[cookbook]]\"\nedges: []\n---\n\n## 这一屏\n\n分享面板。\n\n## 应看到什么\n\n- 看到分享面板\n"

func TestToolsCallReturnsWhatTheCommandLinePrintsForTheSixLookupsThatNeedNoHistory(t *testing.T) {
	w := gitRepo(t, fixture.Files{share: shareSheet})
	type c struct {
		tool  string
		args  map[string]any
		entry string
		arg   string
	}
	cases := []c{
		{"design_page", map[string]any{"name": "cookbook"}, "page", "cookbook"},
		{"design_state", map[string]any{"name": "cookbook--search-results"}, "state", "cookbook--search-results"},
		{"design_journey", map[string]any{"name": "save-a-recipe"}, "journey", "save-a-recipe"},
		{"design_diff", map[string]any{"spec": fixture.SpecSlug}, "diff", fixture.SpecSlug},
		{"design_refs", map[string]any{"name": "NavBar"}, "refs", "NavBar"},
		{"design_keyword", map[string]any{"text": "保存"}, "keyword", "保存"},
	}
	msgs := []any{initMsg}
	for i, k := range cases {
		msgs = append(msgs, call(10+i, k.tool, k.args))
	}
	s := w.session(t, msgs...)
	for i, k := range cases {
		res := s.id(10 + i)
		if isError(res) {
			t.Fatalf("%s: %v", k.tool, res)
		}
		eq(t, parse(t, textOf(res)), cliJSON(t, w.projectDir, k.entry, k.arg, query.Options{}), k.tool)
	}
}

func TestToolsCallDesignAffectedReadsTheCodeRepositoryHistoryThoughTheArchiveIsInHome(t *testing.T) {
	w := gitRepo(t, nil)
	if err := os.MkdirAll(filepath.Join(w.code, "src", "pages"), 0o755); err != nil {
		t.Fatal(err)
	}
	page := filepath.Join(w.code, "src", "pages", "pantry.tsx")
	os.WriteFile(page, []byte("one\n"), 0o644)
	mustGit(t, w.code, "add", "-A")
	mustGit(t, w.code, "commit", "-q", "-m", "one")
	first := mustGit(t, w.code, "rev-parse", "HEAD")
	os.WriteFile(page, []byte("two\n"), 0o644)
	mustGit(t, w.code, "add", "-A")
	mustGit(t, w.code, "commit", "-q", "-m", "two")
	s := w.session(t, initMsg, call(2, "design_affected", map[string]any{"commit": first}), call(3, "design_affected", map[string]any{"commit": "no-such-commit"}))
	if isError(s.id(2)) {
		t.Fatalf("%v", s.id(2))
	}
	answer := parse(t, textOf(s.id(2)))
	eq(t, answer, cliJSON(t, w.projectDir, "affected", first, query.Options{CodeRoot: w.code}))
	var ids []any
	for _, x := range get(answer, "states").([]any) {
		ids = append(ids, get(x, "id"))
	}
	eq(t, ids, []any{"pantry--empty", "pantry--overview"})
	eq(t, isError(s.id(3)), true)
	match(t, textOf(s.id(3)), "no-such-commit")
}

func TestToolsCallRefsWithASectionIDOrTypeReturnsWhatTheCommandLinePrints(t *testing.T) {
	w := gitRepo(t, fixture.Marketing())
	type c struct {
		tool  string
		args  map[string]any
		entry string
		arg   string
	}
	cases := []c{
		{"design_refs", map[string]any{"name": "mkt-pricing#hero"}, "refs", "mkt-pricing#hero"},
		{"design_refs", map[string]any{"name": "mkt-pricing#feature-b"}, "refs", "mkt-pricing#feature-b"},
		{"design_refs", map[string]any{"name": "#feature"}, "refs", "#feature"},
		{"design_page", map[string]any{"name": "mkt-pricing"}, "page", "mkt-pricing"},
		{"design_state", map[string]any{"name": "mkt-pricing--feature-b-expanded"}, "state", "mkt-pricing--feature-b-expanded"},
	}
	msgs := []any{initMsg}
	for i, k := range cases {
		msgs = append(msgs, call(10+i, k.tool, k.args))
	}
	s := w.session(t, msgs...)
	for i, k := range cases {
		res := s.id(10 + i)
		if isError(res) {
			t.Fatalf("%s %v: %v", k.tool, k.args, res)
		}
		eq(t, parse(t, textOf(res)), cliJSON(t, w.projectDir, k.entry, k.arg, query.Options{}), k.tool)
	}
	eq(t, len(get(parse(t, textOf(s.id(13))), "sections").([]any)), 5)
}

func TestToolsCallASectionThatIsNotThereIsAnErrorResultThatListsTheExistingOnes(t *testing.T) {
	s := gitRepo(t, fixture.Marketing()).session(t, initMsg, call(2, "design_refs", map[string]any{"name": "mkt-pricing#nowhere"}))
	eq(t, isError(s.id(2)), true)
	match(t, textOf(s.id(2)), "hero")
}

func TestToolsListDesignPageAndDesignRefsSayTheyKnowAboutSectionsAndHowToAsk(t *testing.T) {
	s := gitRepo(t, nil).session(t, initMsg, listMsg)
	tools := get(s.id(2), "result", "tools")
	match(t, get(toolOf(tools, "design_page"), "description").(string), "分段")
	match(t, get(toolOf(tools, "design_refs"), "description").(string), "分段")
	name := get(toolOf(tools, "design_refs"), "inputSchema", "properties", "name", "description").(string)
	match(t, name, "<页面>#<段>")
	match(t, name, "#<段类型>")
}

func TestToolsCallWithDeltaReadsTheArchiveAsItWillBeAfterTheRequirement(t *testing.T) {
	w := gitRepo(t, fixture.Files{share: shareSheet})
	s := w.session(t, initMsg,
		call(2, "design_state", map[string]any{"name": "cookbook--share-sheet"}),
		call(3, "design_state", map[string]any{"name": "cookbook--share-sheet", "delta": fixture.SpecSlug}),
		call(4, "design_page", map[string]any{"name": "cookbook", "delta": fixture.SpecSlug}))
	eq(t, isError(s.id(2)), true) // not in prod/
	eq(t, isError(s.id(3)), false)
	eq(t, parse(t, textOf(s.id(3))), cliJSON(t, w.projectDir, "state", "cookbook--share-sheet", query.Options{Delta: fixture.SpecSlug}))
	eq(t, parse(t, textOf(s.id(4))), cliJSON(t, w.projectDir, "page", "cookbook", query.Options{Delta: fixture.SpecSlug}))
}

func TestTheArchiveIsTheProjectDirectoryInHomeAlsoFromASubdirectoryOfTheWorktree(t *testing.T) {
	w := gitRepo(t, nil)
	sub := filepath.Join(w.code, "src")
	os.MkdirAll(sub, 0o755)
	s := session(t, sub, w.home, initMsg, call(2, "design_state", map[string]any{"name": "cookbook--list"}))
	if isError(s.id(2)) {
		t.Fatalf("%v", s.id(2))
	}
	eq(t, parse(t, textOf(s.id(2))), cliJSON(t, w.projectDir, "state", "cookbook--list", query.Options{}))
}

func TestAWorktreeOfTheCodeRepositoryReadsTheSameArchiveInHome(t *testing.T) {
	w := gitRepo(t, nil)
	os.WriteFile(filepath.Join(w.code, "README.md"), []byte("x\n"), 0o644)
	mustGit(t, w.code, "add", "-A")
	mustGit(t, w.code, "commit", "-q", "-m", "init")
	tree := filepath.Join(w.base, "worktrees", "feature")
	mustGit(t, w.code, "worktree", "add", "-q", "-b", "feature", tree)
	s := session(t, tree, w.home, initMsg, call(2, "design_page", map[string]any{"name": "cookbook"}))
	if isError(s.id(2)) {
		t.Fatalf("%v", s.id(2))
	}
	eq(t, parse(t, textOf(s.id(2))), cliJSON(t, w.projectDir, "page", "cookbook", query.Options{}))
}

func TestOpenedInHomeItselfACallWithTheProjectNameReadsThatProjectsArchive(t *testing.T) {
	w := gitRepo(t, nil)
	s := session(t, w.home, w.home, initMsg,
		call(2, "design_page", map[string]any{"name": "cookbook", "project": "example-app"}),
		call(3, "design_page", map[string]any{"name": "cookbook"}),
		call(4, "design_page", map[string]any{"name": "cookbook", "project": "nope"}))
	if isError(s.id(2)) {
		t.Fatalf("%v", s.id(2))
	}
	eq(t, parse(t, textOf(s.id(2))), cliJSON(t, w.projectDir, "page", "cookbook", query.Options{}))
	eq(t, isError(s.id(3)), true)
	eq(t, textOf(s.id(3)), home.InHome)
	eq(t, isError(s.id(4)), true)
	match(t, textOf(s.id(4)), "nope")
}

func TestOpenedInHomeItselfDesignAffectedReadsTheProjectsCloneNamedInTheProjectList(t *testing.T) {
	w := gitRepo(t, nil)
	// the list says the clone is at ~/projects/example-app; HOME is the fake <base>, so that is <base>/projects/example-app
	clone := filepath.Join(w.base, "projects", "example-app")
	os.MkdirAll(filepath.Join(clone, "src", "pages"), 0o755)
	mustGit(t, clone, "init", "-q", "-b", "main")
	page := filepath.Join(clone, "src", "pages", "pantry.tsx")
	os.WriteFile(page, []byte("one\n"), 0o644)
	mustGit(t, clone, "add", "-A")
	mustGit(t, clone, "commit", "-q", "-m", "one")
	first := mustGit(t, clone, "rev-parse", "HEAD")
	os.WriteFile(page, []byte("two\n"), 0o644)
	mustGit(t, clone, "add", "-A")
	mustGit(t, clone, "commit", "-q", "-m", "two")

	var in strings.Builder
	for _, m := range []any{initMsg, call(2, "design_affected", map[string]any{"commit": first, "project": "example-app"})} {
		b, _ := json.Marshal(m)
		in.Write(b)
		in.WriteString("\n")
	}
	env := map[string]string{"HOME": w.base, "IDEA_LOOP_HOME": w.home}
	var out bytes.Buffer
	if err := Serve(strings.NewReader(in.String()), &out, Deps{Env: func(k string) string { return env[k] }, Cwd: w.home}); err != nil {
		t.Fatal(err)
	}
	var res map[string]any
	for _, line := range strings.Split(out.String(), "\n") {
		var m map[string]any
		if json.Unmarshal([]byte(line), &m) == nil && m["id"] == float64(2) {
			res = m
		}
	}
	if res == nil || isError(res) {
		t.Fatalf("%v", res)
	}
	var ids []any
	for _, x := range get(parse(t, textOf(res)), "states").([]any) {
		ids = append(ids, get(x, "id"))
	}
	eq(t, ids, []any{"pantry--empty", "pantry--overview"})
}

func allTools(id0 int) []any {
	var msgs []any
	for i, n := range toolNames {
		msgs = append(msgs, call(id0+i, n, map[string]any{"name": "x", "text": "x", "spec": "x", "commit": "x"}))
	}
	return msgs
}

func TestAProjectThatHasNotMovedIntoHomeGetsTheMigrationSentenceFromEveryTool(t *testing.T) {
	w := gitRepo(t, nil)
	// the project directory in home has no docs/, the code repository has one with a spec/ in it: not moved yet
	os.RemoveAll(filepath.Join(w.projectDir, "docs"))
	os.MkdirAll(filepath.Join(w.code, "docs", "spec"), 0o755)
	os.WriteFile(filepath.Join(w.code, "docs", "spec", "x.md"), []byte("x\n"), 0o644)
	s := w.session(t, append([]any{initMsg}, allTools(10)...)...)
	for i, n := range toolNames {
		res := s.id(10 + i)
		eq(t, isError(res), true, n)
		eq(t, textOf(res), home.NotMoved, n)
	}
}

// ---------- errors come back as results, the process stays up ----------

func TestAnUnknownObjectIsAnErrorResultThatSaysWhatExistsAndTheNextCallStillWorks(t *testing.T) {
	s := gitRepo(t, nil).session(t, initMsg,
		call(2, "design_page", map[string]any{"name": "no-such-page"}),
		call(3, "design_page", map[string]any{"name": "NavBar"}), // a component, not a page
		call(4, "design_keyword", map[string]any{"text": "zzzqqq"}),
		call(5, "design_diff", map[string]any{"spec": "no-such-spec"}),
		call(6, "design_state", map[string]any{"name": "cookbook--list"}))
	for _, id := range []int{2, 3, 4, 5} {
		eq(t, isError(s.id(id)), true, fmt.Sprint("id ", id))
		if len([]rune(textOf(s.id(id)))) <= 5 {
			t.Fatalf("id %d: %q", id, textOf(s.id(id)))
		}
	}
	match(t, textOf(s.id(3)), "NavBar")
	eq(t, isError(s.id(6)), false)
}

func TestOutsideAGitRepositoryEveryToolReturnsAClearErrorResultInsteadOfCrashing(t *testing.T) {
	bare, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	s := session(t, bare, filepath.Join(bare, "no-home"), append([]any{initMsg, listMsg}, allTools(10)...)...)
	eq(t, len(get(s.id(2), "result", "tools").([]any)), 7, "listing needs no repository")
	for i, n := range toolNames {
		res := s.id(10 + i)
		eq(t, isError(res), true, n)
		eq(t, textOf(res), home.NotConnected, n)
	}
}

func TestAGitRepositoryTheProjectListDoesNotKnowIsReportedNotCrashedOn(t *testing.T) {
	w := gitRepo(t, nil)
	mustGit(t, w.code, "remote", "set-url", "origin", "git@github.com:acme/unlisted.git")
	s := w.session(t, initMsg, call(2, "design_page", map[string]any{"name": "x"}))
	eq(t, isError(s.id(2)), true)
	eq(t, textOf(s.id(2)), home.NotConnected)
}

func TestBadInputMissingArgumentIsAnErrorResultUnknownToolIsAProtocolErrorGarbageIsAParseError(t *testing.T) {
	s := gitRepo(t, nil).session(t, initMsg,
		call(2, "design_page", map[string]any{}),
		call(3, "design_page", map[string]any{"name": 7}),
		call(4, "design_diff", map[string]any{"spec": fixture.SpecSlug, "delta": fixture.SpecSlug}),
		call(5, "write_design", map[string]any{"name": "x"}),
		"{ not json",
		map[string]any{"jsonrpc": "2.0", "id": 6, "method": "tools/call", "params": map[string]any{}},
		call(7, "design_state", map[string]any{"name": "cookbook--list"}))
	eq(t, isError(s.id(2)), true)
	match(t, textOf(s.id(2)), "name")
	eq(t, isError(s.id(3)), true)
	eq(t, isError(s.id(4)), true) // diff does not take a delta
	eq(t, get(s.id(5), "error", "code"), float64(-32602))
	var parseErr map[string]any
	for _, o := range s.out {
		if o["id"] == nil {
			parseErr = o
		}
	}
	eq(t, get(parseErr, "error", "code"), float64(-32700))
	eq(t, get(s.id(6), "error", "code"), float64(-32602))
	eq(t, isError(s.id(7)), false, "still serving after the bad lines")
}

func TestReadOnlyNothingButTheSevenLookupsIsOfferedAndAWriteShapedCallIsRefused(t *testing.T) {
	w := gitRepo(t, nil)
	s := w.session(t, initMsg, listMsg, call(3, "design_write", map[string]any{"path": "docs/design/prod/x.md", "content": "x"}))
	eq(t, sortedNames(get(s.id(2), "result", "tools")), sortedCopy(toolNames))
	if s.id(3)["error"] == nil {
		t.Fatal("a write-shaped call was not refused")
	}
	if _, err := os.Stat(filepath.Join(w.projectDir, "docs/design/prod/x.md")); err == nil {
		t.Fatal("the call wrote a file")
	}
}

// ---------- through the command, with the process's streams ----------

func TestCommandServesOnItsInputAndOutput(t *testing.T) {
	w := gitRepo(t, nil)
	env := map[string]string{"HOME": filepath.Dir(w.code), "IDEA_LOOP_HOME": w.home}
	var cmd *cobra.Command = CommandWith(Deps{Env: func(k string) string { return env[k] }, Cwd: w.code})
	var out bytes.Buffer
	cmd.SetIn(strings.NewReader(`{"jsonrpc":"2.0","id":9,"method":"ping"}` + "\n"))
	cmd.SetOut(&out)
	cmd.SetArgs([]string{})
	if err := cmd.Execute(); err != nil {
		t.Fatal(err)
	}
	eq(t, strings.TrimSpace(out.String()), `{"jsonrpc":"2.0","id":9,"result":{}}`)
}
