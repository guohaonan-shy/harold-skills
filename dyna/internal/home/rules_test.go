package home_test

import (
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/home"
)

// The fixed text idea-loop writes into home's AGENTS.md (`home config` item 4, rules), and the line the session
// start leaves when home's copy has fallen behind the plugin's.

const lagLine = "home 的固定文案落后于插件，跑 `/idea-loop:setup`"

// homeWithRules is homeAgent with the plugin's three sections written in front of idea-loop's other two.
func homeWithRules(rules string) string {
	return "# AGENTS\n\n" + rules + "\n" + homeAgent[strings.Index(homeAgent, "## 设备地图"):]
}

func agentsOf(t *testing.T, r rigT) string { return readFile(t, filepath.Join(r.home, "AGENTS.md")) }

func TestRulesPlanListsAFourthItemOnAHomeWithoutTheThreeSections(t *testing.T) {
	r := newRig(t, rigOpts{})
	plan := r.cfg("plan", "--only", "rules").ok(t)
	for _, want := range []string{"| 4 |", "待改", "## 思考与决策", "## 沟通", "## 证据"} {
		if !strings.Contains(plan.out, want) {
			t.Errorf("plan lacks %q:\n%s", want, plan.out)
		}
	}
	if strings.Contains(plan.out, key) || strings.Contains(plan.out, "autoMemoryDirectory") {
		t.Errorf("--only rules lists other items:\n%s", plan.out)
	}
	if byNumber := r.cfg("plan", "--only", "4").ok(t); byNumber.out != plan.out {
		t.Errorf("--only 4 and --only rules differ:\n%s\n%s", byNumber.out, plan.out)
	}
	before := snapshot(t, r.root)
	r.cfg("plan").ok(t)
	if !reflect.DeepEqual(snapshot(t, r.root), before) {
		t.Fatal("plan wrote something")
	}
}

func TestRulesApplyWritesThePluginsThreeSectionsAndLeavesEverythingElseAlone(t *testing.T) {
	r := newRig(t, rigOpts{})
	r.cfg("apply", "--only", "rules").ok(t)
	if got := agentsOf(t, r); got != homeWithRules(rulesV1) {
		t.Fatalf("%q", got)
	}
	// the sections are the plugin's text word for word
	for _, sec := range []string{"## 思考与决策", "## 沟通", "## 证据"} {
		if !strings.Contains(agentsOf(t, r), sec+"\n") {
			t.Errorf("no %s", sec)
		}
	}
}

func TestRulesApplyAgainWritesNothingAndSaysAlready(t *testing.T) {
	r := newRig(t, rigOpts{})
	r.cfg("apply", "--only", "rules").ok(t)
	before := snapshot(t, r.root)
	plan := r.cfg("plan", "--only", "rules").ok(t)
	if !strings.Contains(plan.out, "已是") || strings.Contains(plan.out, "待改") {
		t.Fatal(plan.out)
	}
	again := r.cfg("apply", "--only", "rules").ok(t)
	if !strings.Contains(again.out, "没有要改的项") || !reflect.DeepEqual(snapshot(t, r.root), before) {
		t.Fatal("not a no-op:", again.out)
	}
}

func TestRulesWhenThePluginTextChangesOnlyTheThreeSectionsAreReplaced(t *testing.T) {
	r := newRig(t, rigOpts{})
	r.cfg("apply", "--only", "rules").ok(t)
	// a section the person wrote sits between idea-loop's, and another at the very top
	mine := "## 我的备忘\n\n手写的，一字不能动。\n\n"
	text := agentsOf(t, r)
	text = strings.Replace(text, "## 证据\n", mine+"## 证据\n", 1)
	text = strings.Replace(text, "# AGENTS\n", "# AGENTS\n\n我自己的开头。\n", 1)
	write(t, r.home, "AGENTS.md", text)

	newer := strings.Replace(rulesV1, "三句话", "两句话", 1)
	write(t, r.plugin, home.RulesFile, newer)
	plan := r.cfg("plan", "--only", "rules").ok(t)
	if !strings.Contains(plan.out, "待改") || !strings.Contains(plan.out, "沟通") {
		t.Fatalf("a changed word is not seen:\n%s", plan.out)
	}
	r.cfg("apply", "--only", "rules").ok(t)
	got := agentsOf(t, r)
	want := strings.Replace(text, "三句话", "两句话", 1)
	if got != want {
		t.Fatalf("only the one word moves:\n%s", got)
	}
	if !strings.Contains(got, mine) || !strings.Contains(got, "我自己的开头。") {
		t.Fatal("the person's sections moved")
	}
	if !strings.Contains(r.cfg("plan", "--only", "rules").ok(t).out, "已是") {
		t.Fatal("not 已是 after apply")
	}
}

func TestRulesAMissingSectionIsAddedWhereItBelongs(t *testing.T) {
	r := newRig(t, rigOpts{})
	r.cfg("apply", "--only", "rules").ok(t)
	full := agentsOf(t, r)
	cut := strings.Replace(full, "## 沟通\n\n三句话：问题、解法、要对方什么。\n\n", "", 1)
	if cut == full {
		t.Fatal("the fixture changed")
	}
	write(t, r.home, "AGENTS.md", cut)
	if !strings.Contains(r.cfg("plan", "--only", "rules").ok(t).out, "待改") {
		t.Fatal("a missing section is not 待改")
	}
	r.cfg("apply", "--only", "rules").ok(t)
	if got := agentsOf(t, r); got != full {
		t.Fatalf("the section did not come back in its place:\n%s", got)
	}
}

func TestRulesWithNoIdeaLoopSectionsAtAllTheyGoAtTheEnd(t *testing.T) {
	r := newRig(t, rigOpts{})
	write(t, r.home, "AGENTS.md", "# AGENTS\n\n我的话。\n")
	r.cfg("apply", "--only", "rules").ok(t)
	if got := agentsOf(t, r); got != "# AGENTS\n\n我的话。\n\n"+rulesV1 {
		t.Fatalf("%q", got)
	}
	if !strings.Contains(r.cfg("plan", "--only", "rules").ok(t).out, "已是") {
		t.Fatal("not 已是")
	}
}

func TestRulesApplyWithTheClaudeMdItemPutsTheMovedTextBeforeTheRules(t *testing.T) {
	r := newRig(t, rigOpts{})
	r.cfg("apply").ok(t)
	got := agentsOf(t, r)
	if !(strings.Index(got, claudeMD) < strings.Index(got, "## 思考与决策") && strings.Index(got, "## 证据") < strings.Index(got, "## 设备地图")) {
		t.Fatalf("order of the moved text, the rules and idea-loop's own sections:\n%s", got)
	}
	// running the whole of setup's step again changes nothing
	before := snapshot(t, r.root)
	r.cfg("apply").ok(t)
	if !reflect.DeepEqual(snapshot(t, r.root), before) {
		t.Fatal("the second apply wrote")
	}
}

func TestRulesAClaudeMdTextWithAnIdeaLoopSectionHeadingStillGoesBeforeTheRules(t *testing.T) {
	r := newRig(t, rigOpts{claudeMd: ptr("# 我的\n\n话。\n")})
	r.cfg("apply", "--only", "rules").ok(t)
	r.cfg("apply", "--only", "claude-md").ok(t)
	got := agentsOf(t, r)
	if strings.Index(got, "话。") > strings.Index(got, "## 思考与决策") {
		t.Fatalf("the moved text went after the rules:\n%s", got)
	}
}

func TestRulesThePluginsOwnFileIsExactlyTheThreeSections(t *testing.T) {
	b, err := os.ReadFile(filepath.Join("..", "..", "..", "idea-loop", filepath.FromSlash(home.RulesFile)))
	if err != nil {
		t.Fatal(err)
	}
	names, err := home.RuleSectionNames(string(b))
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(names, []string{"思考与决策", "沟通", "证据"}) {
		t.Fatal(names)
	}
	if !strings.HasPrefix(string(b), "## 思考与决策\n") {
		t.Fatal("the file starts with something that is not the first section")
	}
}

func TestRulesAFileThatIsNotThreeSectionsIsRefused(t *testing.T) {
	r := newRig(t, rigOpts{})
	write(t, r.plugin, home.RulesFile, "## 思考与决策\n\n只有一节。\n")
	before := snapshot(t, r.root)
	for _, args := range [][]string{{"plan", "--only", "rules"}, {"apply", "--only", "rules"}} {
		if res := r.cfg(args...); res.code != 1 || res.err == "" {
			t.Errorf("%v: %+v", args, res)
		}
	}
	if !reflect.DeepEqual(snapshot(t, r.root), before) {
		t.Fatal("a refusal wrote something")
	}
}

func (r rigT) mapAt(extra map[string]string) result {
	vars := map[string]string{"HOME": r.HOME, "IDEA_LOOP_HOME": r.home, "IDEA_LOOP_PLUGIN_ROOT": r.plugin}
	for k, v := range extra {
		vars[k] = v
	}
	return r.world.runWith(r.root, "", vars, "home", "map", "--hook")
}

func TestSessionStartLeavesOneLineWhenHomesThreeSectionsAreBehindThePlugin(t *testing.T) {
	r := newRig(t, rigOpts{})
	// none of the three sections yet
	res := r.mapAt(nil).ok(t)
	if strings.TrimSpace(res.out) != lagLine {
		t.Fatalf("a home without the sections: %q", res.out)
	}
	r.cfg("apply", "--only", "rules").ok(t)
	if res := r.mapAt(nil).ok(t); res.out != "" {
		t.Fatalf("up to date, the session start says something: %q", res.out)
	}
	// the plugin moves on
	write(t, r.plugin, home.RulesFile, strings.Replace(rulesV1, "三句话", "两句话", 1))
	if res := r.mapAt(nil).ok(t); strings.TrimSpace(res.out) != lagLine {
		t.Fatalf("a changed plugin text: %q", res.out)
	}
	r.cfg("apply", "--only", "rules").ok(t)
	if res := r.mapAt(nil).ok(t); res.out != "" {
		t.Fatalf("up to date again: %q", res.out)
	}
}

func TestSessionStartIsAsBeforeWhenThereIsNothingToCompare(t *testing.T) {
	r := newRig(t, rigOpts{})
	// no plugin root (run by hand), no plugin text, no home, no AGENTS.md: the same output as before this check existed
	cases := map[string]map[string]string{
		"no plugin root": {"IDEA_LOOP_PLUGIN_ROOT": ""},
		"no home":        {"IDEA_LOOP_HOME": filepath.Join(r.root, "no-such-home")},
	}
	for name, extra := range cases {
		if res := r.mapAt(extra); res.code != 0 || res.out != "" {
			t.Errorf("%s: %+v", name, res)
		}
	}
	if err := os.Remove(filepath.Join(r.plugin, filepath.FromSlash(home.RulesFile))); err != nil {
		t.Fatal(err)
	}
	if res := r.mapAt(nil); res.code != 0 || res.out != "" {
		t.Errorf("no plugin text: %+v", res)
	}
}

func TestSessionStartLineComesAfterTheProjectMap(t *testing.T) {
	w := newWorld(t, opts{})
	plugin := filepath.Join(w.root, "plugin")
	write(t, plugin, home.RulesFile, rulesV1)
	res := w.runWith(w.code, "", map[string]string{"IDEA_LOOP_PLUGIN_ROOT": plugin}, "home", "map", "--hook").ok(t)
	want := mapText + lagLine + "\n"
	if res.out != want {
		t.Fatalf("%q", res.out)
	}
}
