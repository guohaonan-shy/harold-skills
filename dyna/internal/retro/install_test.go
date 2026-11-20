package retro_test

import (
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"testing"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/retro"
)

// The assertions of the old retro-install.test.mjs (the script is gone): the fixed-path install of the replay runner, what it puts
// where, what it prints, and that the installed copy works from there. It is the file the permission rule points at.
// Every test points HOME at a temporary directory; none touches the real ~/.idea-loop.

func fresh(t *testing.T) string { return filepath.Join(t.TempDir(), "bin") }

func installEnv(t *testing.T) map[string]string {
	return map[string]string{"HOME": t.TempDir(), retro.EnvPluginRoot: pluginRoot()}
}

func node(t *testing.T) string {
	p, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node is not installed")
	}
	return p
}

func runEntry(t *testing.T, entry string, args ...string) outcome {
	t.Helper()
	return runOld(t, node(t), nil, append([]string{entry}, args...)...)
}

func TestThePermissionRuleBeginsWithTheRunnerPathWrittenWithTildeUnderTheHomeDirectory(t *testing.T) {
	home := "/Users/someone"
	if got := retro.AllowRule("/Users/someone/.idea-loop/bin", home); got != "Bash(node ~/.idea-loop/bin/retro-replay.mjs:*)" {
		t.Fatal(got)
	}
	if got := retro.DisplayPath("/elsewhere/bin/x.mjs", home); got != "/elsewhere/bin/x.mjs" {
		t.Fatal(got)
	}
	if got := retro.DisplayPath("/Users/someone-else/x", home); got != "/Users/someone-else/x" {
		t.Fatalf("a directory that only starts with the home name is not under it: %s", got)
	}
}

func TestInstalledRunnerHasNoPluginOfItsOwnToTestAndSaysWhichFlagToGive(t *testing.T) {
	entry, err := retro.Install(fresh(t), pluginRoot())
	if err != nil {
		t.Fatal(err)
	}
	r := runEntry(t, entry, "--case", "whatever")
	if r.code != 2 || !strings.Contains(r.stderr, "--worktree") {
		t.Fatal(r)
	}
}

// The runner starts its Claude sessions and its Codex judge through `dyna agent`, and asks `dyna` which runtime it is
// in, so the plugin's scripts are not installed with it: only the runner's own files are.
func TestTheInstalledCopyCarriesTheRunnersOwnFilesAndNoneOfThePluginsScripts(t *testing.T) {
	dest := fresh(t)
	entry, err := retro.Install(dest, pluginRoot())
	if err != nil {
		t.Fatal(err)
	}
	for _, f := range []string{"retro-replay.mjs", "queue.mjs", "replay.mjs", "cases.mjs", "home-projects.mjs"} {
		if _, err := os.Stat(filepath.Join(dest, "runtime", "evals", "retro", f)); err != nil {
			t.Fatal(f, err)
		}
	}
	if _, err := os.Stat(filepath.Join(dest, "runtime", "scripts")); err == nil {
		t.Fatal("the plugin's scripts are installed with the runner")
	}
	r := runEntry(t, entry, "--bogus")
	if r.code != 2 || !strings.Contains(r.stderr, "unknown argument") { // it starts (every import resolves) and rejects the argument itself
		t.Fatal(r)
	}
}

func TestInstalledRunnerDoesNotKnowTheQueueFlagsAnyMore(t *testing.T) {
	entry, err := retro.Install(fresh(t), pluginRoot())
	if err != nil {
		t.Fatal(err)
	}
	for _, flag := range []string{"--queue", "--enqueue", "--notify"} {
		r := runEntry(t, entry, flag)
		if r.code != 2 || !strings.Contains(r.stderr, "unknown argument") {
			t.Fatal(flag, r)
		}
	}
}

func TestInstallingAgainReplacesTheCopyAStrayOldFileDoesNotSurvive(t *testing.T) {
	dest := fresh(t)
	if _, err := retro.Install(dest, pluginRoot()); err != nil {
		t.Fatal(err)
	}
	stray := filepath.Join(dest, "runtime", "evals", "retro", "old-file.mjs")
	writeFile(t, stray, "// from an older version")
	if _, err := retro.Install(dest, pluginRoot()); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(stray); !os.IsNotExist(err) {
		t.Fatal("the stray file survived")
	}
	b, _ := os.ReadFile(filepath.Join(dest, "retro-replay.mjs"))
	if !strings.Contains(string(b), "main(process.argv.slice(2))") {
		t.Fatal(string(b))
	}
}

func TestTheCommandInstallsTheRunnerPrintsThePermissionRuleAndNothingAboutAScheduledTask(t *testing.T) {
	dest := fresh(t)
	env := installEnv(t)
	r := dyna(env, "retro", "install", "--dest", dest)
	rule := retro.AllowRule(dest, env["HOME"])
	if r.code != 0 || !strings.Contains(r.stdout, filepath.Join(dest, "retro-replay.mjs")) || !strings.Contains(r.stdout, rule) || !strings.Contains(r.stdout, "不改权限设置") {
		t.Fatal(r)
	}
	for _, word := range []string{"计划任务", "定时任务", "回放结果", "--queue", "--notify", "run_in_background"} {
		if strings.Contains(r.stdout, word) {
			t.Fatalf("no scheduled task prompt, found %s", word)
		}
	}
	entries, _ := os.ReadDir(dest)
	var names []string
	for _, e := range entries {
		names = append(names, e.Name())
	}
	sort.Strings(names)
	if strings.Join(names, ",") != "retro-replay.mjs,runtime" {
		t.Fatal(names)
	}
	for _, bad := range [][]string{{"--bogus"}, {"extra"}, {"--dest"}} {
		if r := dyna(env, append([]string{"retro", "install"}, bad...)...); r.code != 2 {
			t.Fatal(bad, r)
		}
	}
}

func TestTheDefaultDestinationIsUnderHomeAndNeverTheRealOne(t *testing.T) {
	env := installEnv(t)
	r := dyna(env, "retro", "install")
	want := filepath.Join(env["HOME"], ".idea-loop", "bin", "retro-replay.mjs")
	if r.code != 0 || !strings.Contains(r.stdout, want) || !strings.Contains(r.stdout, "Bash(node ~/.idea-loop/bin/retro-replay.mjs:*)") {
		t.Fatal(r)
	}
	if _, err := os.Stat(want); err != nil {
		t.Fatal(err)
	}
}

func TestWithoutThePluginDirectoryTheCommandSaysWhatToSet(t *testing.T) {
	r := dyna(map[string]string{"HOME": t.TempDir()}, "retro", "install", "--dest", fresh(t))
	if r.code != 1 || !strings.Contains(r.stderr, retro.EnvPluginRoot) {
		t.Fatal(r)
	}
}

// The old installer and dyna put the same files in the same layout, print the same, and end the same.
func TestInstallAnswersLikeTheOldScript(t *testing.T) {
	nodeBin, script := oldScript(t, "retro-install.mjs")
	oldDest, newDest := fresh(t), fresh(t)
	home := t.TempDir()
	want := runOld(t, nodeBin, map[string]string{"HOME": home}, script, "--dest", oldDest)
	got := dyna(map[string]string{"HOME": home, retro.EnvPluginRoot: pluginRoot()}, "retro", "install", "--dest", newDest)
	norm := func(s, dest string) string { return strings.ReplaceAll(s, dest, "DEST") }
	if want.code != got.code || norm(want.stdout, oldDest) != norm(got.stdout, newDest) {
		t.Fatalf("old (%d)\n%s\nnew (%d)\n%s", want.code, want.stdout, got.code, got.stdout)
	}
	tree := func(dir string) map[string]string {
		out := map[string]string{}
		_ = filepath.Walk(dir, func(p string, info os.FileInfo, err error) error {
			if err != nil || info.IsDir() {
				return err
			}
			rel, _ := filepath.Rel(dir, p)
			b, _ := os.ReadFile(p)
			out[rel] = info.Mode().String() + "\n" + string(b)
			return nil
		})
		return out
	}
	a, b := tree(oldDest), tree(newDest)
	// The one deliberate difference: the runner starts its sessions through `dyna agent` now, so the old stream reader and
	// Codex companion finder it imported are not copied any more (the old installer still copies them until it is removed).
	for _, gone := range []string{"claude-stream.mjs", "codex-companion.mjs"} {
		delete(a, filepath.Join("runtime", "scripts", gone))
	}
	if len(a) != len(b) || len(a) == 0 {
		t.Fatalf("%d files vs %d", len(a), len(b))
	}
	for name, content := range a {
		if b[name] != content {
			t.Errorf("%s differs", name)
		}
	}
	for _, bad := range [][]string{{"--bogus"}, {"extra"}, {"--dest"}} {
		old := runOld(t, nodeBin, map[string]string{"HOME": home}, append([]string{script}, bad...)...)
		now := dyna(map[string]string{"HOME": home, retro.EnvPluginRoot: pluginRoot()}, append([]string{"retro", "install"}, bad...)...)
		if old.code != now.code {
			t.Errorf("%v: old exit %d, new exit %d", bad, old.code, now.code)
		}
	}
}
