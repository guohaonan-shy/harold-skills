package home_test

import (
	"encoding/json"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

type dispatchJSON struct {
	At     string `json:"at"`
	Period *struct {
		Start string `json:"start"`
		End   string `json:"end"`
	} `json:"period"`
	Dispatch *string `json:"dispatch"`
	PerRound int     `json:"perRound"`
	Caps     struct {
		Triage     *int `json:"triage"`
		InProgress *int `json:"in-progress"`
		InReview   *int `json:"in-review"`
	} `json:"caps"`
	Skip    []string `json:"skip"`
	Periods []map[string]any
	States  []string `json:"states"`
}

func (w world) dispatchAt(t *testing.T, at string) dispatchJSON {
	t.Helper()
	var d dispatchJSON
	if err := json.Unmarshal([]byte(w.run(w.root, "home", "dispatch", "--at="+at).ok(t).out), &d); err != nil {
		t.Fatal(err)
	}
	return d
}

func TestHomeDispatchWithNoFileGivesTheDefaultsForTheMomentAsked(t *testing.T) {
	w := newWorld(t, opts{})
	day := w.dispatchAt(t, "10:00")
	if day.At != "10:00" || *day.Dispatch != "triage" || day.PerRound != 3 || *day.Caps.Triage != 6 || day.Caps.InProgress != nil || day.Caps.InReview != nil {
		t.Fatalf("%+v", day)
	}
	night := w.dispatchAt(t, "23:30")
	if *night.Dispatch != "todo" || night.PerRound != 1 || night.Caps.InProgress != nil || night.Period.Start != "22:00" || night.Period.End != "08:00" {
		t.Fatalf("%+v", night)
	}
	gap := w.dispatchAt(t, "20:00")
	if gap.Dispatch != nil || gap.Period != nil || gap.PerRound != 0 {
		t.Fatalf("%+v", gap)
	}
	if len(day.Periods) != 2 || !reflect.DeepEqual(day.States, []string{"triage", "in-progress", "in-review"}) || day.Skip == nil || len(day.Skip) != 0 {
		t.Fatalf("%+v", day)
	}
	// the edges, one by one
	for at, want := range map[string]string{"08:00": "", "22:00": "todo", "19:00": "", "09:00": "triage"} {
		got := ""
		if d := w.dispatchAt(t, at).Dispatch; d != nil {
			got = *d
		}
		if got != want {
			t.Errorf("%s: %q want %q", at, got, want)
		}
	}
}

func TestHomeDispatchReadsTheCapsAndTheSkipLineFromDISPATCHmd(t *testing.T) {
	w := newWorld(t, opts{})
	write(t, w.home, "DISPATCH.md", "# 调度\n\n| 状态 | 同时开着最多 |\n|---|---|\n| triage | 6 |\n| in-progress | 4 |\n| in-review | 不设 |\n\n不调度的项目：Foo, bar\n")
	d := w.dispatchAt(t, "10:00")
	if *d.Caps.InProgress != 4 || d.Caps.InReview != nil || !reflect.DeepEqual(d.Skip, []string{"Foo", "bar"}) {
		t.Fatalf("%+v", d)
	}
	if !strings.Contains(w.run(w.root, "home", "dispatch", "--at=10:00").ok(t).out, `"in-review": null`) {
		t.Fatal("a cap written 不设 prints as null")
	}
}

func TestHomeDispatchRefusesAFileItCannotReadAndSaysWhere(t *testing.T) {
	w := newWorld(t, opts{})
	for row, cell := range map[string]string{
		"| 09:00–19:00 | done | 3 |":   "第 2 格（派什么）",
		"| 09:00–19:00 | triage | 0 |": "第 3 格（每轮最多新开）",
	} {
		write(t, w.home, "DISPATCH.md", "| 时段 | 派什么 | 每轮最多新开 |\n|---|---|---|\n"+row+"\n")
		r := w.run(w.root, "home", "dispatch", "--at=10:00")
		if r.code == 0 || r.out != "" || !strings.Contains(r.err, "DISPATCH.md 第 3 行") || !strings.Contains(r.err, cell) {
			t.Errorf("%s: exit %d, out %q, err %q", row, r.code, r.out, r.err)
		}
	}
	write(t, w.home, "DISPATCH.md", "| 状态 | 同时开着最多 |\n|---|---|\n| nap | 3 |\n")
	if r := w.run(w.root, "home", "dispatch"); r.code == 0 || !strings.Contains(r.err, "DISPATCH.md 第 3 行") || !strings.Contains(r.err, "nap") {
		t.Fatalf("%+v", r)
	}
	if r := w.run(w.root, "home", "dispatch", "--at=25:00"); r.code == 0 || !strings.Contains(r.err, "--at") {
		t.Fatalf("%+v", r)
	}
}

func TestHomeDispatchWithoutAtUsesTheClock(t *testing.T) {
	w := newWorld(t, opts{}) // the world's clock is 2026-11-19 10:20:30 UTC
	var d dispatchJSON
	if err := json.Unmarshal([]byte(w.run(w.root, "home", "dispatch").ok(t).out), &d); err != nil {
		t.Fatal(err)
	}
	if d.At != "10:20" || *d.Dispatch != "triage" {
		t.Fatalf("%+v", d)
	}
}

type projectJSON struct {
	Name       string `json:"name"`
	ProjectDir string `json:"projectDir"`
	Docs       string `json:"docs"`
	Repo       string `json:"repo"`
	Clone      string `json:"clone"`
	CloneDir   string `json:"cloneDir"`
	InHome     bool   `json:"inHome"`
	Code       string `json:"code"`
	Reason     string `json:"reason"`
}

func TestHomeProjectsListsTheListInOrderWithWhatIsInHomeAndWhyTheRestIsNot(t *testing.T) {
	w := moved(t, opts{}) // example-app has a docs/; other-app is listed with nothing in home
	var got []projectJSON
	if err := json.Unmarshal([]byte(w.run(w.root, "home", "projects").ok(t).out), &got); err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 || got[0].Name != "example-app" || got[1].Name != "other-app" {
		t.Fatalf("%+v", got)
	}
	want := projectJSON{
		Name: "example-app", ProjectDir: filepath.Join(w.home, "projects", "example-app"), Docs: filepath.Join(w.home, docsRel),
		Repo: "acme/example-app", Clone: "~/projects/example-app", CloneDir: filepath.Join(w.root, "projects", "example-app"), InHome: true,
	}
	if got[0] != want {
		t.Fatalf("%+v\nwant %+v", got[0], want)
	}
	other := got[1]
	if other.InHome || other.Code != "not-connected" || other.Reason != "这个仓库没接上 idea-loop，先跑 `/idea-loop:setup`" ||
		other.Repo != "acme/other-app" || other.Clone != "~/projects/other-app" || other.CloneDir != filepath.Join(w.root, "projects", "other-app") {
		t.Fatalf("%+v", other)
	}
}

func TestHomeProjectsSaysNotMovedWhenTheCloneStillHasTheBootstrapFiles(t *testing.T) {
	w := newWorld(t, opts{agents: "## 项目\n\n" + listLine("example-app", remote)})
	// the registered clone path is ~/projects/example-app under the world's HOME
	write(t, w.root, "projects/example-app/DEVELOPMENT.md", "x\n")
	var got []projectJSON
	if err := json.Unmarshal([]byte(w.run(w.root, "home", "projects").ok(t).out), &got); err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got[0].InHome || got[0].Code != "not-moved" || !strings.Contains(got[0].Reason, "搬进 home") {
		t.Fatalf("%+v", got)
	}
}

func TestHomeProjectsIsAnEmptyArrayWhenThereIsNothingToList(t *testing.T) {
	for name, o := range map[string]opts{
		"no section":    {agents: "# 设备\n\n没有项目一节。\n"},
		"empty section": {agents: "# 设备\n\n## 项目\n\n还没有项目。\n"},
	} {
		w := newWorld(t, o)
		r := w.run(w.root, "home", "projects")
		if r.code != 0 || strings.TrimSpace(r.out) != "[]" {
			t.Errorf("%s: exit %d, out %q, err %q", name, r.code, r.out, r.err)
		}
	}
	// no AGENTS.md at all, and no home directory at all
	w := newWorld(t, opts{})
	for name, extra := range map[string]map[string]string{"no home": {"IDEA_LOOP_HOME": filepath.Join(w.root, "no-such-home")}} {
		r := w.runWith(w.root, "", extra, "home", "projects")
		if r.code != 0 || strings.TrimSpace(r.out) != "[]" {
			t.Errorf("%s: exit %d, out %q, err %q", name, r.code, r.out, r.err)
		}
	}
	empty := realDir(t)
	r := w.runWith(w.root, "", map[string]string{"IDEA_LOOP_HOME": empty}, "home", "projects")
	if r.code != 0 || strings.TrimSpace(r.out) != "[]" {
		t.Errorf("no AGENTS.md: exit %d, out %q, err %q", r.code, r.out, r.err)
	}
}

func TestHomeProjectsWorksFromAnyDirectoryAndMarksAnEscapingNameUnlisted(t *testing.T) {
	w := moved(t, opts{agents: "## 项目\n\n" + listLine("example-app", remote) + listLine("../escape", "https://github.com/acme/escape")})
	for _, cwd := range []string{w.home, w.code, w.root} {
		var got []projectJSON
		if err := json.Unmarshal([]byte(w.run(cwd, "home", "projects").ok(t).out), &got); err != nil {
			t.Fatal(err)
		}
		if len(got) != 2 || !got[0].InHome || got[1].InHome || got[1].Code != "unlisted" || got[1].ProjectDir != "" {
			t.Fatalf("%s: %+v", cwd, got)
		}
	}
}
