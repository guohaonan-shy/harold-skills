package pr

import (
	"reflect"
	"sort"
	"testing"
)

// The assertions of the old changed-lines.test.mjs.

const sampleDiff = `diff --git a/app/src/player.ts b/app/src/player.ts
--- a/app/src/player.ts
+++ b/app/src/player.ts
@@ -10,0 +11,2 @@ export function play() {
+  const retry = 3;
+  let x = 1;
@@ -40 +42 @@ function stop() {
-  old();
+  next();
diff --git a/api/routes.py b/api/routes.py
new file mode 100644
--- /dev/null
+++ b/api/routes.py
@@ -0,0 +1,2 @@
+import os
+def handler(): pass
diff --git a/gone.ts b/gone.ts
--- a/gone.ts
+++ /dev/null
@@ -1 +0,0 @@
-x
`

func lines(c ChangedLines, path string) []int {
	var out []int
	for n := range c.Lines[path] {
		out = append(out, n)
	}
	sort.Ints(out)
	return out
}

func TestAddedAndChangedNewSideLinesAreCollectedPerFileDeletedFilesAreIgnored(t *testing.T) {
	c := ParseChangedLines(sampleDiff)
	if got := lines(c, "app/src/player.ts"); !reflect.DeepEqual(got, []int{11, 12, 42}) {
		t.Fatal(got)
	}
	if got := lines(c, "api/routes.py"); !reflect.DeepEqual(got, []int{1, 2}) {
		t.Fatal(got)
	}
	if _, has := c.Lines["gone.ts"]; has {
		t.Fatal("a deleted file has no new lines")
	}
	if !reflect.DeepEqual(c.Files, []string{"app/src/player.ts", "api/routes.py"}) {
		t.Fatal(c.Files)
	}
}

func TestCommonDiagnosticFormatsAreLocated(t *testing.T) {
	for in, want := range map[string]Location{
		"api/routes.py:1:1: F401 `os` imported but unused":                        {"api/routes.py", 1},
		"src/player.ts(12,7): error TS6133: x is declared but never read.":        {"src/player.ts", 12},
		"/abs/repo/app/src/player.ts:42:3: Unexpected call [Error/no-restricted]": {"/abs/repo/app/src/player.ts", 42},
		"./lib/a.go:7: vet: unreachable code":                                     {"lib/a.go", 7},
	} {
		got, ok := Locate(in)
		if !ok || got != want {
			t.Errorf("%q: %v %v", in, got, ok)
		}
	}
	if _, ok := Locate("Found 3 errors."); ok {
		t.Fatal("no location")
	}
}

func TestOnlyDiagnosticsOnChangedLinesSurviveTheRestIsCountedNotDroppedSilently(t *testing.T) {
	output := "api/routes.py:1:1: F401 `os` imported but unused\n" + // changed
		"src/player.ts(12,7): error TS6133: x is declared but never read.\n" + // changed, path relative to a sub-project
		"app/src/player.ts:5:1: old debt\n" + // same file, unchanged line
		"lib/other.ts:3:1: elsewhere\n" + // untouched file
		"Found 4 errors."
	r := FilterDiagnostics(output, ParseChangedLines(sampleDiff))
	if len(r.OnChanged) != 2 || r.Elsewhere != 2 || r.Unlocated != 1 {
		t.Fatalf("%+v", r)
	}
	if r.OnChanged[0] != "api/routes.py:1:1: F401 `os` imported but unused" {
		t.Fatal(r.OnChanged)
	}
}
