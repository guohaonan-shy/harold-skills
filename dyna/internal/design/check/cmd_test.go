package check

import (
	"bytes"
	"encoding/json"
	"errors"
	"regexp"
	"strings"
	"testing"

	"github.com/spf13/cobra"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/design/fixture"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/nexterr"
)

// cli runs the command the way the command tree does: stdout, stderr, and the exit code a nexterr.Exit asks for.
func cli(args ...string) (string, string, int) {
	root := &cobra.Command{Use: "dyna", SilenceErrors: true, SilenceUsage: true}
	root.AddCommand(Command())
	var out, errOut bytes.Buffer
	root.SetOut(&out)
	root.SetErr(&errOut)
	root.SetArgs(append([]string{"check"}, args...))
	err := root.Execute()
	if err == nil {
		return out.String(), errOut.String(), 0
	}
	var exit *nexterr.Exit
	if errors.As(err, &exit) {
		if exit.Msg != "" {
			errOut.WriteString(exit.Msg + "\n")
		}
		return out.String(), errOut.String(), exit.Code
	}
	errOut.WriteString(err.Error() + "\n")
	return out.String(), errOut.String(), 1
}

func TestCLIExit0OnACleanArchive1OnViolationsNamingFileAndField0WithLegacyNotes(t *testing.T) {
	stdout, _, code := cli(repo(t, fixture.Compliant()))
	if code != 0 {
		t.Fatalf("code %d", code)
	}
	matches(t, `通过`, stdout)

	stdout, _, code = cli(repo(t, bend(t, map[string]edit{LIST: sub("  failure: \"[[cookbook--search-failed]]\"\n", "")}, nil)))
	if code != 1 {
		t.Fatalf("code %d", code)
	}
	matches(t, `规则 2.*cookbook--list\.md · async\.failure`, stdout)

	stdout, _, code = cli(repo(t, bend(t, nil, map[string]string{"docs/design/old-spec/old-spec-design.md": "# 旧\n"})))
	if code != 0 {
		t.Fatalf("code %d", code)
	}
	matches(t, `提示：.*旧布局`, stdout)
}

func TestCLIRule8PrintsTheViolationAndExits1(t *testing.T) {
	root := repo(t, bendShot(t, map[string]edit{fixture.ShotStateFile: sub(fixture.ShotState+"@save-all.png", fixture.ShotState+"@nowhere.png")}))
	stdout, _, code := cli(root)
	if code != 1 {
		t.Fatalf("code %d", code)
	}
	matches(t, `违规 \[规则 8 边的截图\] .*cookbook--search-results\.md · edges\[2\]\.shot：`, stdout)
}

func TestCLIDeltaOverlaysARequirementAndJSONReportsMachineReadableViolations(t *testing.T) {
	root := repo(t, deltaFiles())
	if _, _, code := cli(root, "--delta", slug); code != 0 {
		t.Fatalf("code %d", code)
	}
	files := deltaFiles()
	delete(files, D("pages/pantry/pantry--overview.md"))
	stdout, _, code := cli(repo(t, files), "--delta", slug, "--json")
	if code != 1 {
		t.Fatalf("code %d", code)
	}
	var j struct {
		Ok         bool `json:"ok"`
		Violations []struct {
			Rule    int     `json:"rule"`
			File    string  `json:"file"`
			Field   *string `json:"field"`
			Message string  `json:"message"`
		} `json:"violations"`
	}
	if err := json.Unmarshal([]byte(stdout), &j); err != nil {
		t.Fatalf("%v\n%s", err, stdout)
	}
	if j.Ok || len(j.Violations) == 0 {
		t.Fatalf("%+v", j)
	}
	for _, x := range j.Violations {
		if x.Rule == 0 || x.File == "" || x.Message == "" {
			t.Fatalf("%+v", x)
		}
	}
}

func TestCLINoUsedByJudgesADeltaWhoseNewComponentsAndMotionsHaveNoUsedByYet(t *testing.T) {
	files := deltaFiles()
	k := D("components/ShareButton/ShareButton.md")
	files[k] = subRe(`(?m)^usedBy:.*\n`, "")(files[k])
	root := repo(t, files)
	stdout, _, code := cli(root, "--delta", slug)
	if code != 1 {
		t.Fatalf("code %d", code)
	}
	matches(t, `规则 6.*usedBy.*未生成`, stdout)
	stdout, _, code = cli(root, "--delta", slug, "--no-used-by")
	if code != 0 {
		t.Fatalf("code %d\n%s", code, stdout)
	}
	// only the usedBy half is skipped: other rules still judge the delta
	broken := deltaFiles()
	delete(broken, D("pages/pantry/pantry--overview.md"))
	if _, _, code := cli(repo(t, broken), "--delta", slug, "--no-used-by"); code != 1 {
		t.Fatalf("code %d", code)
	}
}

func TestCLIANewPageThatReusesAnExistingComponentFailsWithoutNoUsedByAndPassesWithIt(t *testing.T) {
	// the delta adds a page using RecipeCard, whose usedBy (written by the archive writer, not by hand) still lists the old pages
	files := fixture.Compliant()
	files[D("pages/history/history.md")] = "---\ntype: design-page\ntags: [history]\nsummary: 浏览历史\ncode: [src/pages/history.tsx]\nregions:\n  - { name: 历史卡片, component: \"[[RecipeCard]]\" }\n---\n\n# 浏览历史\n\n页面描述。\n\n## 决定\n\n无\n\n## 设计法候选\n\n无\n"
	files[D("pages/history/history--list.md")] = "---\ntype: design-state\ntags: [history]\nsummary: 浏览历史默认一屏\npage: \"[[history]]\"\nentry:\n  url: /history\n  preconditions: { account: 已登录的测试账号, data: 至少 1 条浏览记录 }\ncomponents: [\"[[RecipeCard]]\"]\nedges: []\n---\n\n## 这一屏\n\n历史卡片列表。\n\n## 应看到什么\n\n- 看到历史卡片\n"
	root := repo(t, files)
	stdout, _, code := cli(root, "--delta", slug)
	if code != 1 {
		t.Fatalf("code %d", code)
	}
	matches(t, `规则 6.*RecipeCard.*usedBy`, stdout)
	stdout, _, code = cli(root, "--delta", slug, "--no-used-by")
	if code != 0 {
		t.Fatalf("code %d\n%s", code, stdout)
	}
}

func TestCLIUsageErrorsAndADirectoryThatIsNotARepositoryRootExit2(t *testing.T) {
	if _, _, code := cli(); code != 2 {
		t.Fatalf("no args: %d", code)
	}
	if _, _, code := cli(repo(t, fixture.Files{"README.md": "x"})); code != 2 {
		t.Fatalf("not a repo: %d", code)
	}
	if _, _, code := cli(repo(t, fixture.Compliant()), "--delta", "nope"); code != 2 {
		t.Fatalf("unknown delta: %d", code)
	}
}

func TestCLIRule7PrintsTheViolationAndTheHintsAndExits1OnlyForViolations(t *testing.T) {
	root := repo(t, bendMkt(t, map[string]edit{mktFile: sub("from: mkt-pricing#header", "from: mkt-pricing#nowhere")}))
	stdout, _, code := cli(root)
	if code != 1 {
		t.Fatalf("code %d", code)
	}
	matches(t, `规则 7 分段`, stdout)
	hint := repo(t, bendMkt(t, nil, [2]string{"feature-a", "content"}))
	stdout, _, code = cli(hint)
	if code != 0 {
		t.Fatalf("code %d\n%s", code, stdout)
	}
	matches(t, `提示：.*content`, stdout)
}

func TestCLIWorkspacesIsTheSameAsDeclaringThemAndABadValueExits2(t *testing.T) {
	root := repo(t, fixture.Compliant())
	stdout, _, code := cli(root, "--workspaces", "mkt,app")
	if code != 1 {
		t.Fatalf("code %d", code)
	}
	matches(t, `前缀`, stdout)
	if _, _, code := cli(root, "--workspaces", "Mkt!"); code != 2 {
		t.Fatalf("bad value: %d", code)
	}
	if _, _, code := cli(root, "--workspaces"); code != 2 {
		t.Fatalf("no value: %d", code)
	}
	if _, _, code := cli(root); code != 0 {
		t.Fatalf("plain: %d", code)
	}
}

func TestCLIPrintsTheSummaryLine(t *testing.T) {
	stdout, _, _ := cli(repo(t, fixture.Compliant()))
	if !regexp.MustCompile(`^通过（18 个对象）\n$`).MatchString(stdout) {
		t.Fatalf("%q", stdout)
	}
	stdout, _, _ = cli(repo(t, bend(t, map[string]edit{LIST: sub("  failure: \"[[cookbook--search-failed]]\"\n", "")}, nil)))
	if !strings.HasSuffix(stdout, "1 条违规\n") {
		t.Fatalf("%q", stdout)
	}
}
