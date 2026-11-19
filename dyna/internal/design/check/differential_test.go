package check

import (
	"bytes"
	"os/exec"
	"path/filepath"
	"testing"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/design/fixture"
)

// The old script stays until the commands replace it; until then this runs both on the same trees and holds
// their output (stdout, byte for byte, with and without --json) and exit code the same.

func oldScript(t *testing.T) string {
	t.Helper()
	if _, err := exec.LookPath("node"); err != nil {
		t.Skip("node is not on PATH")
	}
	p, err := filepath.Abs(filepath.Join("..", "..", "..", "..", "idea-loop", "scripts", "design-archive-check.mjs"))
	if err != nil {
		t.Fatal(err)
	}
	return p
}

func runOld(t *testing.T, script string, args ...string) (string, int) {
	t.Helper()
	cmd := exec.Command("node", append([]string{script}, args...)...)
	var out bytes.Buffer
	cmd.Stdout = &out
	err := cmd.Run()
	code := 0
	if err != nil {
		ee, ok := err.(*exec.ExitError)
		if !ok {
			t.Fatal(err)
		}
		code = ee.ExitCode()
	}
	return out.String(), code
}

func TestDifferentialCheckIsTheSameAsTheOldScript(t *testing.T) {
	script := oldScript(t)
	clone := func(f fixture.Files) fixture.Files { return f.Clone() }
	cases := map[string]fixture.Files{
		"compliant":     fixture.Compliant(),
		"marketing":     fixture.Marketing(),
		"shot":          fixture.Shot(),
		"lonely":        bend(t, nil, map[string]string{P("pages/pantry/pantry--lonely.md"): lonelyState}),
		"badtype":       bend(t, map[string]edit{SPINNER: sub("type: design-motion", "type: design-moton")}, nil),
		"badkind":       bend(t, map[string]edit{LIST: sub("    kind: user\n    component: \"[[SearchBox]]\"", "    kind: usr\n    component: \"[[SearchBox]]\"")}, nil),
		"async":         bend(t, map[string]edit{LIST: sub("  failure: \"[[cookbook--search-failed]]\"\n", "")}, nil),
		"asyncprose":    bend(t, map[string]edit{LIST: sub("empty: 不适用", "empty: 暂时没有")}, nil),
		"asynckind":     bend(t, map[string]edit{LIST: sub("empty: 不适用", "empty: \"[[RecipeCard]]\"")}, nil),
		"body-link":     bend(t, map[string]edit{COOKBOOK: sub("页面描述。", "页面描述，见 [[no-such-note]]。")}, nil),
		"fm-link":       bend(t, map[string]edit{LIST: sub("components: [\"[[RecipeCard]]\"]", "components: [\"[[RecipeCrad]]\"]")}, nil),
		"edge-comp":     bend(t, map[string]edit{LIST: sub("component: \"[[SearchBox]]\"", "component: \"[[save-pop]]\"")}, nil),
		"dup-name":      bend(t, nil, map[string]string{"docs/reference/RecipeCard.md": "# 另一份同名文件\n"}),
		"journey-gap":   bend(t, map[string]edit{SAVE_JOUR: sub("  - \"[[cookbook--search-loading]]\"\n", "")}, nil),
		"journey-via":   bend(t, map[string]edit{SAVE_JOUR: sub("via: save }", "via: nope }")}, nil),
		"journey-novia": bend(t, map[string]edit{SAVE_JOUR: sub("{ state: \"[[cookbook--search-results]]\", via: save }", "\"[[cookbook--search-results]]\"")}, nil),
		"state-decision": bend(t, map[string]edit{LIST: func(s string) string {
			return s + "\n## 决定\n\n### 决定 1：x\n- 为什么：y\n- 否掉过：无\n- 来源：[[" + slug + "]]\n"
		}}, nil),
		"decision-missing": bend(t, map[string]edit{RECIPE_CARD: subRe(`(?m)^- 为什么：.*\n?`, "")}, nil),
		"decision-empty":   bend(t, map[string]edit{RECIPE_CARD: sub("- 否掉过：无", "- 否掉过：")}, nil),
		"candidate":        bend(t, map[string]edit{SAVE_POP: subRe(`(?m)^  - 证据：.*\n?`, "")}, nil),
		"no-candidates":    bend(t, map[string]edit{COOKBOOK: sub("## 设计法候选\n\n无", "")}, nil),
		"decision-dup":     bend(t, map[string]edit{RECIPE_CARD: sub("## 设计法候选", "\n### 决定 1：再来一条\n- 为什么：y\n- 否掉过：无\n- 来源：[["+slug+"]]\n\n## 设计法候选")}, nil),
		"deviates":         bend(t, map[string]edit{SAVE_POP: subRe(`(?m)^deviates:.*\n`, "")}, nil),
		"usedby-missing":   bend(t, map[string]edit{P("components/SearchBox/SearchBox.md"): subRe(`(?m)^usedBy:.*\n`, "")}, nil),
		"usedby-stale":     bend(t, map[string]edit{P("components/NavBar/NavBar.md"): sub(`usedBy: ["[[cookbook]]", "[[pantry]]"]`, `usedBy: ["[[cookbook]]"]`)}, nil),
		"usedby-gone":      bend(t, map[string]edit{SPINNER: sub(`usedBy: ["[[cookbook]]"]`, `usedBy: ["[[cookbook]]", "[[gone]]"]`)}, nil),
		"legacy": bend(t, nil, map[string]string{
			"docs/design/old-spec-a/old-spec-a-design.md": "---\ntype: [broken\n---\n乱七八糟 [[nowhere]]\n",
			"docs/design/old-spec-b/canvas.html":          "<html></html>\n",
		}),
		"when-empty":     bend(t, map[string]edit{LIST: sub(searchEdge, searchEdge+"\n    when: \"\"")}, nil),
		"locate-text":    bend(t, map[string]edit{LIST: sub(searchEdge, "locate: { text: 搜索菜谱, role: searchbox }")}, nil),
		"workspaces":     bend(t, map[string]edit{INDEX_FILE: withWorkspaces("[mkt, app]")}, nil),
		"workspaces-bad": bend(t, map[string]edit{INDEX_FILE: withWorkspaces("[Mkt]")}, nil),
		"mkt-nowhere":    bendMkt(t, map[string]edit{mktFile: sub("from: mkt-pricing#header", "from: mkt-pricing#nowhere")}),
		"mkt-wikilink":   bendMkt(t, map[string]edit{mktFile: sub("from: mkt-pricing#header", "from: \"[[mkt-pricing#header]]\"")}),
		"mkt-content":    bendMkt(t, map[string]edit{mktFile: sub("{ role: heading, name: 食材库同步 }", "{ position: 2 }")}, [2]string{"feature-a", "content"}),
		"mkt-scroll":     bendMkt(t, scrollDriven("false")),
		"mkt-notentry":   bendMkt(t, map[string]edit{MKT_FEAT_B: sub("edges: []", "sections:\n  - { id: hero, locate: { position: 1 } }\nedges: []")}),
		"mkt-badtype":    bendMkt(t, nil, [2]string{"feature-b", "closing-band"}),
		"mkt-qualifier":  bendMkt(t, nil, [2]string{"feature-a", "feature"}),
		"mkt-section":    bendMkt(t, map[string]edit{MKT_FEAT_B: sub("section: mkt-pricing#feature-b", "section: mkt-pricing#faq")}),
		"mkt-bad-id":     bendMkt(t, map[string]edit{mktFile: sub("id: hero,", "id: Hero,")}),
		"mkt-locate":     bendMkt(t, map[string]edit{mktFile: sub("{ role: contentinfo }", "{ position: 1.5 }")}),
		"shot-other":     bendShot(t, map[string]edit{fixture.ShotStateFile: sub(SHOT_SAVE, "shot: cookbook--list@save.png")}),
		"shot-nowhere":   bendShot(t, map[string]edit{fixture.ShotStateFile: sub(fixture.ShotState+"@save-all.png", fixture.ShotState+"@nowhere.png")}),
		"shot-3":         bendShot(t, map[string]edit{fixture.ShotStateFile: sub("shot: "+fixture.ShotState+"@save-all.png", "shot: 3")}),
		"shot-system":    bendShot(t, map[string]edit{LOADING: sub("    trigger: 搜索请求完成", "    shot: cookbook--search-loading@done.png\n    trigger: 搜索请求完成")}),
		"delta-files":    deltaFiles(),
	}
	for name, files := range cases {
		files := clone(files)
		t.Run(name, func(t *testing.T) {
			root := repo(t, files)
			variants := [][]string{{root}, {root, "--json"}, {root, "--no-used-by"}}
			if _, ok := files[D("removed.md")]; ok {
				variants = append(variants, []string{root, "--delta", slug}, []string{root, "--delta", slug, "--json"})
			}
			for _, args := range variants {
				wantOut, wantCode := runOld(t, script, args...)
				gotOut, _, gotCode := cli(args...)
				if gotCode != wantCode || gotOut != wantOut {
					t.Fatalf("%v\nold (%d):\n%s\nnew (%d):\n%s", args[1:], wantCode, wantOut, gotCode, gotOut)
				}
			}
		})
	}
	t.Run("usage", func(t *testing.T) {
		root := repo(t, fixture.Compliant())
		for _, args := range [][]string{{}, {root, "--delta", "nope"}, {root, "--workspaces"}, {root, "--workspaces", "Mkt!"}, {root, "--workspaces", "mkt,app"}, {repo(t, fixture.Files{"README.md": "x"})}} {
			wantOut, wantCode := runOld(t, script, args...)
			gotOut, _, gotCode := cli(args...)
			if gotCode != wantCode || gotOut != wantOut {
				t.Fatalf("%v\nold (%d):\n%s\nnew (%d):\n%s", args, wantCode, wantOut, gotCode, gotOut)
			}
		}
	})
}
