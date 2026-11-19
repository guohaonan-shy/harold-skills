package query

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/design/fixture"
)

// The last part of the old design-archive-query.test.mjs: from a commit, which states the code changes reach.

// codeFiles are the source files the fixture's `code:` fields point at, some of them importing other files.
var codeFiles = map[string]string{
	"src/pages/cookbook.tsx":         "import recipes from '../data/recipes.json';\nimport './cookbook.css';\nimport { fmt } from '../lib/format';\nimport React from 'react';\nimport Icon from '@/icons/star';\nexport default 1;\n",
	"src/pages/pantry.tsx":           "export default 2;\n",
	"src/components/SearchBox.tsx":   "import '../styles/search.css';\nconst Lazy = () => import('./SearchHints');\n",
	"src/components/NavBar.tsx":      "const logo = require('../assets/logo.svg');\n",
	"src/components/RecipeCard.tsx":  "export { star } from './star.js';\nimport tokens from '../tokens';\n",
	"src/components/SaveButton.tsx":  "import '../styles/save.css';\n",
	"src/components/RetryButton.tsx": "// retry\n",
	// imported by the cookbook page; what *it* imports is two hops from the page
	"src/lib/format.ts": "import units from './units.json';\n",
}

// withCode is the compliant fixture plus the code files and any extra files; the names in gone are left out
// (a registered file that is deleted from disk).
func withCode(extra fixture.Files, gone ...string) fixture.Files {
	f := fixture.Compliant()
	for k, v := range codeFiles {
		f[k] = v
	}
	for k, v := range extra {
		f[k] = v
	}
	for _, k := range gone {
		delete(f, k)
	}
	return f
}

func affected(t *testing.T, files []string, extra fixture.Files, gone ...string) any {
	t.Helper()
	root := repoOf(t, withCode(extra, gone...))
	a, err := archiveLoad(root)
	if err != nil {
		t.Fatal(err)
	}
	return norm(t, AffectedByFiles(a, files, ""))
}

func stateIDs(r any) []any { return pick(g(r, "states"), "id") }

var (
	cookbookStates = strs("cookbook--list", "cookbook--recipe-saved", "cookbook--search-failed", "cookbook--search-loading", "cookbook--search-results")
	pantryStates   = strs("pantry--empty", "pantry--overview")
)

func concat(xs ...[]any) []any {
	out := []any{}
	for _, x := range xs {
		out = append(out, x...)
	}
	return out
}

func TestAffectedAPagesRegisteredCodePutsEveryStateOfThatPageInAndOnlyThatPage(t *testing.T) {
	r := affected(t, []string{"src/pages/pantry.tsx"}, nil)
	eq(t, stateIDs(r), pantryStates)
	eq(t, g(r, "matched"), js(t, `[{"object":"pantry","kind":"page","file":"src/pages/pantry.tsx","rule":"code"}]`))
	eq(t, g(r, "states", 0), js(t, `{"id":"pantry--empty","page":"pantry","via":["pantry"]}`))
	eq(t, g(r, "totalStates"), 7.0)
}

func TestAffectedAComponentsRegisteredCodePutsInTheStatesThatUseIt(t *testing.T) {
	// SaveButton sits on the edges of one state
	eq(t, stateIDs(affected(t, []string{"src/components/SaveButton.tsx"}, nil)), strs("cookbook--search-results"))
	// Toast is listed by one state and laid out by no page
	toast := fixture.Files{
		P("components/Toast/Toast.md"):     strings.ReplaceAll(fixture.Compliant()[P("components/RetryButton/RetryButton.md")], "RetryButton", "Toast"),
		P("pages/pantry/pantry--empty.md"): strings.Replace(fixture.Compliant()[P("pages/pantry/pantry--empty.md")], "edges: []", "components: [\"[[Toast]]\"]\nedges: []", 1),
		"src/components/Toast.tsx":         "// toast\n",
	}
	eq(t, stateIDs(affected(t, []string{"src/components/Toast.tsx"}, toast)), strs("pantry--empty"))
	r := affected(t, []string{"src/components/RetryButton.tsx"}, nil)
	eq(t, stateIDs(r), strs("cookbook--search-failed"))
	eq(t, g(r, "matched"), js(t, `[{"object":"RetryButton","kind":"component","file":"src/components/RetryButton.tsx","rule":"code"}]`))
}

func TestAffectedAComponentAPageLaysOutAsARegionIsInEveryStateOfThatPage(t *testing.T) {
	eq(t, stateIDs(affected(t, []string{"src/components/NavBar.tsx"}, nil)), concat(cookbookStates, pantryStates))
	eq(t, stateIDs(affected(t, []string{"src/components/RecipeCard.tsx"}, nil)), concat(cookbookStates, pantryStates))
}

func TestAffectedAFileAPagesCodeImportsDirectlyCountsAsThePageChanging(t *testing.T) {
	data := affected(t, []string{"src/data/recipes.json"}, nil)
	eq(t, stateIDs(data), cookbookStates)
	eq(t, g(data, "matched"), js(t, `[{"object":"cookbook","kind":"page","file":"src/data/recipes.json","rule":"import","via":"src/pages/cookbook.tsx"}]`))
	eq(t, stateIDs(affected(t, []string{"src/pages/cookbook.css"}, nil)), cookbookStates)
}

func TestAffectedAFileAComponentsCodeImportsDirectlyCountsAsThatComponentChanging(t *testing.T) {
	r1 := affected(t, []string{"src/styles/save.css"}, nil)
	eq(t, stateIDs(r1), strs("cookbook--search-results"))
	eq(t, g(r1, "matched"), js(t, `[{"object":"SaveButton","kind":"component","file":"src/styles/save.css","rule":"import","via":"src/components/SaveButton.tsx"}]`))
	// SearchBox is a region of the cookbook page
	eq(t, stateIDs(affected(t, []string{"src/styles/search.css"}, nil)), cookbookStates)
	// NavBar, through require()
	r := affected(t, []string{"src/assets/logo.svg"}, nil)
	eq(t, g(r, "matched", 0, "object"), "NavBar")
	eq(t, len(list(g(r, "states"))), 7)
}

func TestAffectedImportsAreFollowedOneHopOnly(t *testing.T) {
	eq(t, stateIDs(affected(t, []string{"src/lib/units.json"}, nil)), []any{})
	eq(t, stateIDs(affected(t, []string{"src/lib/format.ts"}, nil)), cookbookStates) // the imported file itself does
}

func TestAffectedAnImportWithoutAnExtensionResolvesToTheFileOrItsIndexAndJsToTs(t *testing.T) {
	page := fixture.Files{"src/pages/pantry.tsx": "import a from './pantry-data';\nimport b from './widgets';\nimport c from './util.js';\n"}
	for _, changed := range []string{"src/pages/pantry-data.ts", "src/pages/widgets/index.tsx", "src/pages/util.ts"} {
		eq(t, stateIDs(affected(t, []string{changed}, page)), pantryStates, changed)
	}
	eq(t, stateIDs(affected(t, []string{"src/pages/other.ts"}, page)), []any{})
}

func TestAffectedPackagesAndAliasedPathsAreNotFollowedUnregisteredFilesChangeNothing(t *testing.T) {
	eq(t, stateIDs(affected(t, []string{"node_modules/react/index.js", "src/icons/star.tsx", "README.md", "docs/index.md"}, nil)), []any{})
}

func TestAffectedARegisteredFileGoneFromDiskStillCounts(t *testing.T) {
	r := affected(t, []string{"src/components/SaveButton.tsx"}, nil, "src/components/SaveButton.tsx")
	eq(t, stateIDs(r), strs("cookbook--search-results"))
}

func TestAffectedAStateSeveralChangesReachListsAllOfThem(t *testing.T) {
	r := affected(t, []string{"src/pages/cookbook.tsx", "src/components/SaveButton.tsx", "src/data/recipes.json"}, nil)
	eq(t, stateIDs(r), cookbookStates)
	for _, s := range list(g(r, "states")) {
		if g(s, "id") == "cookbook--search-results" {
			eq(t, g(s, "via"), strs("cookbook", "SaveButton"))
		}
	}
	eq(t, len(list(g(r, "matched"))), 3)
}

func TestAffectedNoChangedFilesIsAnEmptyAnswerThatStillSaysHowManyStates(t *testing.T) {
	r := affected(t, []string{}, nil)
	eq(t, g(r, "states"), []any{})
	eq(t, g(r, "matched"), []any{})
	eq(t, g(r, "totalStates"), 7.0)
}

func TestAffectedAPathWrittenWithDotSlashIsTheSameFile(t *testing.T) {
	eq(t, stateIDs(affected(t, []string{"./src/pages/pantry.tsx"}, nil)), pantryStates)
}

// ---------- from a commit: git underneath ----------

func git(t *testing.T, root string, args ...string) string {
	t.Helper()
	full := append([]string{"-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false"}, args...)
	cmd := exec.Command("git", full...)
	cmd.Dir = root
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git %s: %v\n%s", strings.Join(args, " "), err, out)
	}
	return strings.TrimSpace(string(out))
}

func writeFile(t *testing.T, root, rel, text string) {
	t.Helper()
	abs := filepath.Join(root, filepath.FromSlash(rel))
	if err := os.MkdirAll(filepath.Dir(abs), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(abs, []byte(text), 0o644); err != nil {
		t.Fatal(err)
	}
}

// twoCommits is the fixture with its code as a repository of two commits, `change(root)` being the second.
func twoCommits(t *testing.T, change func(root string)) (root, first string) {
	t.Helper()
	root = repoOf(t, withCode(nil))
	git(t, root, "init", "-q")
	git(t, root, "add", "-A")
	git(t, root, "commit", "-q", "-m", "one")
	first = git(t, root, "rev-parse", "HEAD")
	change(root)
	git(t, root, "add", "-A")
	git(t, root, "commit", "-q", "-m", "two")
	return
}

func TestAffectedFromACommitTheFilesChangedSincePickTheStates(t *testing.T) {
	root, first := twoCommits(t, func(r string) {
		writeFile(t, r, "src/components/SaveButton.tsx", "// restyled\n")
		writeFile(t, r, "src/data/recipes.json", "{}\n")
		writeFile(t, r, "docs/notes.md", "unrelated\n")
	})
	v, err := Query(root, "affected", first[:8], Options{}) // an abbreviated sha is fine; it comes back resolved
	r := norm(t, v)
	if err != nil {
		t.Fatal(err)
	}
	eq(t, g(r, "since"), first[:8])
	eq(t, g(r, "commit"), first)
	eq(t, g(r, "changedFileCount"), 3.0)
	eq(t, stateIDs(r), cookbookStates)
	eq(t, g(r, "totalStates"), 7.0)

	out, errText, code := cliRun(root, "affected", first)
	eq(t, code, 0, errText)
	eq(t, g(js(t, out), "states"), g(r, "states"))
}

func TestAffectedHeadTildeOneWorksAndNothingChangedSinceHeadIsEmpty(t *testing.T) {
	root, _ := twoCommits(t, func(r string) { writeFile(t, r, "src/pages/pantry.tsx", "export default 3;\n") })
	v, err := Query(root, "affected", "HEAD~1", Options{})
	eq(t, stateIDs(norm(t, v)), pantryStates)
	if err != nil {
		t.Fatal(err)
	}
	v, err = Query(root, "affected", "HEAD", Options{})
	if err != nil {
		t.Fatal(err)
	}
	eq(t, stateIDs(norm(t, v)), []any{})
}

func TestAffectedARenameCountsTheOldPathAsChangedToo(t *testing.T) {
	root, first := twoCommits(t, func(r string) { git(t, r, "mv", "src/components/RetryButton.tsx", "src/components/RetryButton2.tsx") })
	v, err := Query(root, "affected", first, Options{})
	if err != nil {
		t.Fatal(err)
	}
	eq(t, stateIDs(norm(t, v)), strs("cookbook--search-failed"))
}

func TestAffectedACommitThatIsNotThereOrLooksLikeAnOptionIsAnErrorThatSaysSo(t *testing.T) {
	root, _ := twoCommits(t, func(r string) { writeFile(t, r, "src/pages/pantry.tsx", "x\n") })
	_, err := Query(root, "affected", "no-such-commit", Options{})
	qe(t, err, "not-found", "no-such-commit")
	_, err = Query(root, "affected", "--output=x", Options{})
	qe(t, err, "usage", "")
	out, errText, code := cliRun(root, "affected", "no-such-commit")
	eq(t, code, 1)
	match(t, errText, "no-such-commit")
	eq(t, out, "")
}

func TestAffectedADirectoryThatIsNotAGitRepositorySaysSo(t *testing.T) {
	root := repoOf(t, withCode(nil))
	_, err := Query(root, "affected", "HEAD", Options{})
	qe(t, err, "", "git")
}
