package home

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func TestNormalizeRemoteMakesTheSSHAndHTTPSCloneOneProject(t *testing.T) {
	want := "github.com/acme/example-app"
	for _, in := range []string{
		"https://github.com/acme/example-app", "https://github.com/acme/example-app.git", "git@github.com:acme/example-app.git",
		"ssh://git@github.com/acme/example-app.git", "https://GitHub.com/acme/example-app/", "https://user@github.com:443/acme/example-app",
	} {
		if got := NormalizeRemote(in); got != want {
			t.Errorf("%q → %q", in, got)
		}
	}
	for _, in := range []string{"", "not a remote", "/local/path"} {
		if got := NormalizeRemote(in); got != "" {
			t.Errorf("%q → %q", in, got)
		}
	}
}

func TestParseProjectsReadsOnlyTheProjectSection(t *testing.T) {
	md := "# 设备\n\n## 别的\n\nx（y）: ~/nope. Clone from https://github.com/a/b if missing.\n\n## 项目\n\n- app（一个例子）: ~/code/app. Clone from https://github.com/acme/app.git if missing.\nnot a project line\nsite（站）: /abs/site. Clone from git@github.com:acme/site.git if missing.\n"
	want := []Entry{{"app", "~/code/app", "https://github.com/acme/app.git"}, {"site", "/abs/site", "git@github.com:acme/site.git"}}
	if got := ParseProjects(md); !reflect.DeepEqual(got, want) {
		t.Fatal(got)
	}
	if FindProject(want, "https://github.com/acme/site") == nil || FindProject(want, "https://github.com/acme/other") != nil {
		t.Fatal("FindProject")
	}
	if FindProject([]Entry{{"../x", "p", "https://github.com/acme/x"}}, "https://github.com/acme/x") != nil {
		t.Fatal("an unsafe name never matches")
	}
}

func fakeHome(t *testing.T) (env Env, home, root string) {
	t.Helper()
	root, _ = filepath.EvalSymlinks(t.TempDir())
	home = filepath.Join(root, "home")
	if err := os.MkdirAll(filepath.Join(home, "projects", "app", "docs"), 0o755); err != nil {
		t.Fatal(err)
	}
	md := "## 项目\n\napp（一个例子）: ~/code/app. Clone from https://github.com/acme/app if missing.\n"
	if err := os.WriteFile(filepath.Join(home, "AGENTS.md"), []byte(md), 0o644); err != nil {
		t.Fatal(err)
	}
	vars := map[string]string{"IDEA_LOOP_HOME": home, "HOME": root}
	return func(k string) string { return vars[k] }, home, root
}

func TestLocateByDocsFindsTheProjectOfADocsInHome(t *testing.T) {
	env, home, root := fakeHome(t)
	f := LocateByDocs(filepath.Join(home, "projects", "app", "docs"), env)
	if !f.OK || f.Project != "app" || f.Repo != "acme/app" || f.CloneDir != filepath.Join(root, "code", "app") || f.ProjectDir != filepath.Join(home, "projects", "app") {
		t.Fatalf("%+v", f)
	}
}

func TestLocateByDocsSaysNotMovedOrNotConnected(t *testing.T) {
	env, _, root := fakeHome(t)
	code := filepath.Join(root, "code", "app")
	if err := os.MkdirAll(filepath.Join(code, "docs"), 0o755); err != nil {
		t.Fatal(err)
	}
	if f := LocateByDocs(filepath.Join(code, "docs"), env); f.OK || f.Message != NotConnected {
		t.Fatalf("%+v", f)
	}
	if err := os.WriteFile(filepath.Join(code, "DEVELOPMENT.md"), []byte("# 开发\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if f := LocateByDocs(filepath.Join(code, "docs"), env); f.OK || f.Message != NotMoved || f.Code != "not-moved" {
		t.Fatalf("%+v", f)
	}
	stranger := filepath.Join(root, "home", "projects", "stranger", "docs")
	if err := os.MkdirAll(stranger, 0o755); err != nil {
		t.Fatal(err)
	}
	if f := LocateByDocs(stranger, env); f.OK || f.Code != "unlisted" {
		t.Fatalf("%+v", f)
	}
}
