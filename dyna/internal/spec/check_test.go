package spec

import (
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"testing"
)

func ptr(s string) *string { return &s }

// project is a docs directory with one spec, practice-retry, and an empty index.
func project(t *testing.T, md string) string {
	t.Helper()
	docs := filepath.Join(t.TempDir(), "docs")
	write(t, filepath.Join(docs, "spec", "practice-retry", "tickets", ".keep"), "")
	write(t, filepath.Join(docs, "spec", "index.md"), "# spec\n> 契约：x\n\n| 文件 | summary |\n|---|---|\n")
	write(t, filepath.Join(docs, "spec", "practice-retry", "practice-retry.md"), md)
	return docs
}

func write(t *testing.T, path, text string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(text), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestRenderIndexReplacesTheTableWithoutAStatusColumnKeepingTheTextAroundIt(t *testing.T) {
	old := "# spec\n> 契约：x\n\n| 文件 | status | summary |\n|---|---|---|\n| [[gone]] | 在飞 | 旧的 |\n\n> 当前为空。\n"
	out := RenderIndex(old, []Listed{{Slug: "b", Summary: ptr("B")}, {Slug: "a", Summary: ptr("A")}})
	want := "# spec\n> 契约：x\n\n| 文件 | summary |\n|---|---|\n| [[a]] | A |\n| [[b]] | B |\n\n> 当前为空。\n"
	if out != want {
		t.Fatalf("got %q", out)
	}
	again := RenderIndex(out, []Listed{{Slug: "a", Summary: ptr("A")}})
	if again != "# spec\n> 契约：x\n\n| 文件 | summary |\n|---|---|\n| [[a]] | A |\n\n> 当前为空。\n" {
		t.Fatalf("got %q", again)
	}
	if !strings.Contains(RenderIndex("", nil), "| 文件 | summary |") {
		t.Fatal("an empty index starts from the default one")
	}
}

func TestRenderIndexKeepsTheTextOfAFileWithNoTable(t *testing.T) {
	out := RenderIndex("随手写的几行\n", []Listed{{Slug: "a", Summary: ptr("A")}})
	if !strings.HasPrefix(out, "# spec\n") || !strings.Contains(out, "| [[a]] | A |") || !strings.Contains(out, "随手写的几行") {
		t.Fatalf("got %q", out)
	}
}

func TestASpecWithNoSummaryGetsAnEmptyCell(t *testing.T) {
	out := RenderIndex("", []Listed{{Slug: "a"}})
	if !strings.Contains(out, "| [[a]] |  |") {
		t.Fatalf("got %q", out)
	}
}

// Slugs sort the way the old script's localeCompare sorted them. The expected order below is what node printed
// for the same list (ICU root collation): punctuation first (`_` before `-` before `.`), then digits, then letters
// without regard to case, a lowercase letter before the same uppercase one.
func TestSlugsSortTheWayLocaleCompareSortsThem(t *testing.T) {
	want := []string{"a", "A", "a_b", "a-1", "a-10", "a-2", "a-b", "a.b", "a1", "ab", "B"}
	got := append([]string(nil), want...)
	for i, j := 0, len(got)-1; i < j; i, j = i+1, j-1 {
		got[i], got[j] = got[j], got[i]
	}
	sort.Slice(got, func(i, j int) bool { return slugBefore(got[i], got[j]) })
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %v", got)
	}
}

func TestIndexWritesTheTableFromTheSpecsOnDisk(t *testing.T) {
	docs := project(t, doc(opts{}))
	if err := Reindex(docs); err != nil {
		t.Fatal(err)
	}
	b, _ := os.ReadFile(filepath.Join(docs, "spec", "index.md"))
	if !strings.Contains(string(b), "| [[practice-retry]] | 重试不消耗配额 |") {
		t.Fatalf("got %q", b)
	}
}

func TestIndexOfADocsWithoutASpecDirectoryFails(t *testing.T) {
	if err := Reindex(t.TempDir()); err == nil {
		t.Fatal("there is no docs/spec/ to write the index into")
	}
}

func TestCheckReportsAStatusLineLeftOverFromTheOldStateMachine(t *testing.T) {
	r := Check(project(t, doc(opts{Status: "实现中", Issues: "[3]"})))
	if len(r.Specs) != 1 || r.Specs[0].Slug != "practice-retry" || !reflect.DeepEqual(r.Specs[0].Issues, []any{3}) {
		t.Fatalf("%+v", r.Specs)
	}
	if len(r.Problems) != 1 || !strings.Contains(r.Problems[0], "还有 status 行") {
		t.Fatalf("%v", r.Problems)
	}
	if got := Check(project(t, doc(opts{}))).Problems; len(got) != 0 {
		t.Fatalf("%v", got)
	}
}

func TestCheckReportsTheOldFlatLayout(t *testing.T) {
	docs := project(t, doc(opts{}))
	write(t, filepath.Join(docs, "spec", "old-spec.md"), doc(opts{}))
	write(t, filepath.Join(docs, "spec", "tickets", ".keep"), "")
	r := Check(docs)
	var slugs []string
	for _, s := range r.Specs {
		slugs = append(slugs, s.Slug)
	}
	if !reflect.DeepEqual(slugs, []string{"practice-retry"}) {
		t.Fatal(slugs)
	}
	if len(r.Problems) != 2 {
		t.Fatalf("%v", r.Problems)
	}
	for _, p := range r.Problems {
		if !strings.Contains(p, "从平铺布局迁移") {
			t.Fatal(p)
		}
	}
}

func TestCheckReportsASpecDirectoryWithoutItsSpecFileAndCountsTickets(t *testing.T) {
	docs := project(t, doc(opts{Issues: "[12, ENG-123]"}))
	write(t, filepath.Join(docs, "spec", "practice-retry", "tickets", "01-a.md"), "x")
	write(t, filepath.Join(docs, "spec", "practice-retry", "tickets", "02-b.md"), "x")
	write(t, filepath.Join(docs, "spec", "empty", "notes.md"), "x")
	r := Check(docs)
	if len(r.Problems) != 1 || r.Problems[0] != "docs/spec/empty/ 里没有 empty.md" {
		t.Fatalf("%v", r.Problems)
	}
	if len(r.Specs) != 1 || r.Specs[0].Tickets != 2 || !reflect.DeepEqual(r.Specs[0].Issues, []any{12, "ENG-123"}) {
		t.Fatalf("%+v", r.Specs)
	}
}

func TestCheckPrintsTheReportAsIndentedJSONWithEmptyListsAsBrackets(t *testing.T) {
	got := Check(t.TempDir()).JSON()
	if got != "{\n  \"specs\": [],\n  \"problems\": []\n}\n" {
		t.Fatalf("got %q", got)
	}
	docs := project(t, doc(opts{Issues: "[12, ENG-123]"}))
	got = Check(docs).JSON()
	if !strings.Contains(got, "\"issues\": [\n        12,\n        \"ENG-123\"\n      ]") || !strings.Contains(got, "\"summary\": \"重试不消耗配额\"") {
		t.Fatalf("got %s", got)
	}
}
