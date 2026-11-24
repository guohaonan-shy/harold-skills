package runtime_test

// `runtime record` writes one entry of the dispatch records after a session was opened with the environment's own
// commands. The file it writes is the one the morning summary reads, so its shape must not change.

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/app"
)

var fixedNow = time.Date(2026, 11, 24, 3, 7, 9, 123456789, time.UTC)

// record runs `dyna runtime record` with a fixed clock.
func record(t *testing.T, env map[string]string, args ...string) outcome {
	t.Helper()
	var out, errb strings.Builder
	code := app.Run(append([]string{"runtime", "record"}, args...), app.IO{
		Stdin: strings.NewReader(""), Stdout: &out, Stderr: &errb,
		Env: func(k string) string { return env[k] },
		Now: func() time.Time { return fixedNow },
	})
	return outcome{out.String(), errb.String(), code}
}

func readRecords(t *testing.T, path string) []map[string]any {
	t.Helper()
	var list []map[string]any
	if err := json.Unmarshal([]byte(readFile(t, path)), &list); err != nil {
		t.Fatal(err)
	}
	return list
}

func recordArgs(dir string) []string {
	return []string{"--issue", "471", "--repo", "harold-skills", "--period", "todo", "--session", "local_abc", "--dir", dir}
}

func TestRecordingIssue471AddsOneEntryWithTheFieldsTheMorningSummaryReads(t *testing.T) {
	dir := t.TempDir()
	r := record(t, nil, recordArgs(dir)...)
	if r.code != 0 {
		t.Fatal(r.all())
	}
	if strings.Count(strings.TrimSpace(r.stdout), "\n") != 0 {
		t.Fatalf("one line: %q", r.stdout)
	}
	var printed map[string]any
	if err := json.Unmarshal([]byte(r.stdout), &printed); err != nil {
		t.Fatalf("the line is JSON: %q", r.stdout)
	}
	list := readRecords(t, filepath.Join(dir, "harold-skills.json"))
	if len(list) != 1 {
		t.Fatalf("%+v", list)
	}
	e := list[0]
	if e["issue"] != float64(471) || e["desktopSessionId"] != "local_abc" || e["period"] != "todo" || e["openedAt"] != "2026-11-24T03:07:09.123Z" || len(e) != 4 {
		t.Fatalf("%+v", e)
	}
	// the file: a two-space-indented array, the keys in this order, a final newline
	want := "[\n  {\n    \"issue\": 471,\n    \"desktopSessionId\": \"local_abc\",\n    \"openedAt\": \"2026-11-24T03:07:09.123Z\",\n    \"period\": \"todo\"\n  }\n]\n"
	if got := readFile(t, filepath.Join(dir, "harold-skills.json")); got != want {
		t.Fatalf("file shape:\n%q\nwant\n%q", got, want)
	}
}

func TestASecondRecordIsAppendedAfterTheFirstAndTheOldEntriesStay(t *testing.T) {
	dir := t.TempDir()
	old := `[{"issue":1,"desktopSessionId":"local_old","openedAt":"2026-11-17T22:05:00.000Z","period":"todo"}]`
	writeFile(t, filepath.Join(dir, "harold-skills.json"), old)
	for _, n := range []string{"471", "472"} {
		if r := record(t, nil, "--issue", n, "--repo", "harold-skills", "--period", "triage", "--session", "s"+n, "--dir", dir); r.code != 0 {
			t.Fatal(r.all())
		}
	}
	list := readRecords(t, filepath.Join(dir, "harold-skills.json"))
	if len(list) != 3 || list[0]["desktopSessionId"] != "local_old" || list[1]["issue"] != float64(471) || list[2]["issue"] != float64(472) || list[2]["desktopSessionId"] != "s472" || list[2]["period"] != "triage" {
		t.Fatalf("%+v", list)
	}
	if entries, _ := os.ReadDir(dir); len(entries) != 1 {
		t.Errorf("a temporary file is left behind: %v", entries)
	}
}

func TestAFileThatIsNotAnArrayOrNotJSONIsLeftAloneAndTheCommandExitsOne(t *testing.T) {
	for name, content := range map[string]string{"object": `{"a":1}`, "garbage": "{not json"} {
		dir := t.TempDir()
		file := filepath.Join(dir, "harold-skills.json")
		writeFile(t, file, content)
		r := record(t, nil, recordArgs(dir)...)
		if r.code != 1 || r.stdout != "" || !strings.Contains(r.stderr, "没动它") {
			t.Fatalf("%s: %+v", name, r)
		}
		if readFile(t, file) != content {
			t.Errorf("%s: the file was touched", name)
		}
	}
}

func TestARepoNameThatCannotBeAFileNameIsRefusedAndNothingIsWrittenOutsideTheDirectory(t *testing.T) {
	root := t.TempDir()
	dir := filepath.Join(root, "records")
	r := record(t, nil, "--issue", "5", "--repo", "../escape", "--period", "todo", "--session", "x", "--dir", dir)
	if r.code != 1 || !strings.Contains(r.stderr, "仓库名不能当文件名") {
		t.Fatalf("%+v", r)
	}
	if _, err := os.Stat(filepath.Join(root, "escape.json")); err == nil {
		t.Error("written outside the records directory")
	}
}

func TestMissingOrWrongArgumentsExitOneAndSayWhich(t *testing.T) {
	dir := t.TempDir()
	cases := map[string][]string{
		"no issue":      {"--repo", "r", "--period", "todo", "--session", "s"},
		"no repo":       {"--issue", "5", "--period", "todo", "--session", "s"},
		"no period":     {"--issue", "5", "--repo", "r", "--session", "s"},
		"no session":    {"--issue", "5", "--repo", "r", "--period", "todo"},
		"issue not int": {"--issue", "abc", "--repo", "r", "--period", "todo", "--session", "s"},
		"period other":  {"--issue", "5", "--repo", "r", "--period", "night", "--session", "s"},
		"blank session": {"--issue", "5", "--repo", "r", "--period", "todo", "--session", " "},
	}
	for name, args := range cases {
		r := record(t, nil, append(args, "--dir", dir)...)
		if r.code != 1 || r.stdout != "" || strings.TrimSpace(r.stderr) == "" {
			t.Errorf("%s: %+v", name, r)
		}
	}
	if entries, _ := os.ReadDir(dir); len(entries) != 0 {
		t.Errorf("something was written: %v", entries)
	}
}

func TestTheRecordsDirectoryDefaultsUnderHOMEAndIDEA_LOOP_DISPATCH_DIROverridesIt(t *testing.T) {
	home, elsewhere := t.TempDir(), filepath.Join(t.TempDir(), "elsewhere")
	args := []string{"--issue", "5", "--repo", "demo", "--period", "triage", "--session", "s"}
	if r := record(t, map[string]string{"HOME": home}, args...); r.code != 0 {
		t.Fatal(r.all())
	}
	if _, err := os.Stat(filepath.Join(home, ".idea-loop", "dispatch", "demo.json")); err != nil {
		t.Fatal("under HOME:", err)
	}
	if r := record(t, map[string]string{"HOME": home, "IDEA_LOOP_DISPATCH_DIR": elsewhere}, args...); r.code != 0 {
		t.Fatal(r.all())
	}
	if _, err := os.Stat(filepath.Join(elsewhere, "demo.json")); err != nil {
		t.Fatal("under IDEA_LOOP_DISPATCH_DIR:", err)
	}
	// --dir wins over the environment variable
	flagDir := filepath.Join(t.TempDir(), "flag")
	if r := record(t, map[string]string{"IDEA_LOOP_DISPATCH_DIR": elsewhere}, append(args, "--dir", flagDir)...); r.code != 0 {
		t.Fatal(r.all())
	}
	if _, err := os.Stat(filepath.Join(flagDir, "demo.json")); err != nil {
		t.Fatal("under --dir:", err)
	}
}

func TestHandoffIsGoneFromTheRegistryAndTheHelp(t *testing.T) {
	reg := dyna(env(), "registry", "--json")
	if reg.code != 0 {
		t.Fatal(reg.all())
	}
	if strings.Contains(reg.stdout, "runtime handoff") {
		t.Error("the registry still lists runtime handoff")
	}
	help := dyna(env(), "runtime", "--help")
	if strings.Contains(help.stdout, "handoff") {
		t.Error("--help still lists handoff")
	}
	if r := dyna(env(), "runtime", "handoff"); r.code == 0 {
		t.Error("runtime handoff still runs")
	}
}
