package pr

import (
	"encoding/base64"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/githubapp"
)

// The assertions of the old evidence.test.mjs.

func ok(path string) File { return File{Path: path, Size: 1000} }

func TestOneBranchPerPRNamedSoASweepCanFindIt(t *testing.T) {
	if EvidenceBranch("42") != "idea-loop-evidence-pr-42" {
		t.Fatal(EvidenceBranch("42"))
	}
}

func TestTheEmbedAddressOpensAsAnImageInTheBrowserNotAsAReleaseDownload(t *testing.T) {
	url := ImageURL("acme/app", "42", "r1-s1-sequence.png")
	if url != "https://github.com/acme/app/blob/idea-loop-evidence-pr-42/r1-s1-sequence.png?raw=true" {
		t.Fatal(url)
	}
	mustNotMatch(t, "releases/download", url)
}

func TestTicketAndReviewRoundFilesWithOwnerPrefixesAreValid(t *testing.T) {
	if errs := CheckAssets([]File{ok("/x/t03-flow-sentence-failed.png"), ok("t03-dwell.gif"), ok("r2-spec-1-quota.png"), ok("pr-before-after-retry.gif")}); len(errs) != 0 {
		t.Fatal(errs)
	}
}

func TestAFileWithoutAnOwnerPrefixIsRejectedAssetsAreFlatAndWouldOverwriteEachOther(t *testing.T) {
	errs := CheckAssets([]File{ok("flow.png")})
	if len(errs) == 0 {
		t.Fatal("accepted")
	}
	mustMatch(t, "归属", errs[0])
}

func TestOnlyImagesAreAccepted(t *testing.T) {
	if len(CheckAssets([]File{ok("t01-trace.zip")})) == 0 {
		t.Fatal("zip accepted")
	}
	if len(CheckAssets([]File{ok(strings.ToLower("t01-shot.PNG"))})) != 0 {
		t.Fatal("png refused")
	}
	// the extension is read the way the old script read it: case does not matter, a bare dot-file has none
	if len(CheckAssets([]File{ok("t01-shot.PNG")})) == 0 {
		t.Fatal("an upper-case name is not a name GitHub keeps: the name rule refuses it")
	}
}

func TestAnMp4RecordingIsAcceptedAndItsAddressHasTheSameShapeAsAnImages(t *testing.T) {
	if errs := CheckAssets([]File{ok("t03-checkout-flow.mp4"), ok("r2-spec-1-walkthrough.mp4"), ok("pr-before-after.mp4")}); len(errs) != 0 {
		t.Fatal(errs)
	}
	mp4 := ImageURL("acme/app", "42", "t03-checkout-flow.mp4")
	png := ImageURL("acme/app", "42", "t03-checkout-flow.png")
	if mp4 != "https://github.com/acme/app/blob/idea-loop-evidence-pr-42/t03-checkout-flow.mp4?raw=true" || strings.TrimSuffix(mp4, ".mp4?raw=true") != strings.TrimSuffix(png, ".png?raw=true") {
		t.Fatal(mp4, png)
	}
}

func TestAnMp4OverTheLimitIsRefusedWithTheAdviceToSplitItOneStepPerSegment(t *testing.T) {
	errs := CheckAssets([]File{{Path: "t01-flow.mp4", Size: MaxBytes + 1}})
	if len(errs) != 1 {
		t.Fatal(errs)
	}
	mustMatch(t, "超过 10MB", errs[0])
	mustMatch(t, "分段，一段讲一步", errs[0])
	// an image over the limit keeps the old advice and does not talk about segments
	img := CheckAssets([]File{{Path: "t01-flow.gif", Size: MaxBytes + 1}})
	if len(img) != 1 {
		t.Fatal(img)
	}
	mustMatch(t, "裁短、降帧率或缩小尺寸再传", img[0])
	mustNotMatch(t, "分段", img[0])
	// exactly 10MB still goes through, for a recording as for an image
	if errs := CheckAssets([]File{{Path: "t01-flow.mp4", Size: MaxBytes}, {Path: "t01-flow.gif", Size: MaxBytes}}); len(errs) != 0 {
		t.Fatal(errs)
	}
}

func TestOtherVideoTypesAreStillRefusedAndTheMessageListsMp4AmongTheAcceptedTypes(t *testing.T) {
	for _, name := range []string{"t01-flow.webm", "t01-flow.mov", "t01-flow.avi"} {
		errs := CheckAssets([]File{ok(name)})
		if len(errs) != 1 {
			t.Fatal(name, errs)
		}
		mustMatch(t, name+"：只收图片", errs[0])
		mustMatch(t, `\.mp4`, errs[0])
		for _, ext := range []string{".png", ".gif", ".jpg", ".jpeg", ".webp"} {
			mustMatch(t, regexpQuote(ext), errs[0])
		}
	}
}

func TestTheOwnerPrefixRuleAppliesToAnMp4Too(t *testing.T) {
	errs := CheckAssets([]File{ok("walkthrough.mp4")})
	if len(errs) != 1 {
		t.Fatal(errs)
	}
	mustMatch(t, "归属", errs[0])
	for _, name := range []string{"t03-a.mp4", "r12-a.mp4", "pr-a.mp4"} {
		if errs := CheckAssets([]File{ok(name)}); len(errs) != 0 {
			t.Fatal(name, errs)
		}
	}
	// a name GitHub would rewrite is refused for an mp4 as for an image
	if len(CheckAssets([]File{ok("t01-Walk Through.mp4")})) == 0 {
		t.Fatal("accepted")
	}
}

func regexpQuote(s string) string { return strings.ReplaceAll(s, ".", `\.`) }

func TestNamesGitHubWouldRewriteAreRejected(t *testing.T) {
	if len(CheckAssets([]File{ok("t01-下载失败.png")})) == 0 || len(CheckAssets([]File{ok("t01-Flow One.png")})) == 0 {
		t.Fatal("accepted")
	}
}

func TestDuplicatesEmptyAndOversizedFilesAreEachReported(t *testing.T) {
	errs := CheckAssets([]File{ok("t01-a.png"), ok("/other/t01-a.png"), {Path: "t01-b.gif", Size: 0}, {Path: "t01-c.gif", Size: MaxBytes + 1}})
	if len(errs) != 3 {
		t.Fatal(errs)
	}
}

func TestNothingToUploadIsAnErrorNotASilentSuccess(t *testing.T) {
	if len(CheckAssets(nil)) == 0 {
		t.Fatal("accepted")
	}
}

// ---- the publish, list and cleanup flows against a gh that remembers what it was asked ----

type call struct {
	args  []string
	stdin string
}

func (c call) is(args ...string) bool { return reflect.DeepEqual(c.args, args) }

func TestPublishCreatesTheOrphanBranchBlobFirstThenTreeCommitAndRef(t *testing.T) {
	dir := t.TempDir()
	png := filepath.Join(dir, "r1-s1-flow.png")
	must(t, os.WriteFile(png, []byte("PNGDATA"), 0o644))
	var calls []call
	run := func(args []string, stdin string, env []string) (string, error) {
		calls = append(calls, call{args, stdin})
		switch {
		case args[1] == "repos/o/r/git/ref/heads/idea-loop-evidence-pr-7":
			return "", &githubapp.GHError{Stderr: "Not Found"}
		case args[1] == "repos/o/r/git/blobs":
			return `{"sha":"blob1"}`, nil
		case args[1] == "repos/o/r/git/trees":
			return `{"sha":"tree1"}`, nil
		case args[1] == "repos/o/r/git/commits":
			return `{"sha":"commit1"}`, nil
		case args[1] == "repos/o/r/git/refs":
			return `{}`, nil
		}
		t.Fatalf("unexpected call %v", args)
		return "", nil
	}
	st := store{api: githubapp.AsGHLogin(run), run: run, repo: "o/r"}
	urls, err := st.publish("7", []string{png})
	if err != nil {
		t.Fatal(err)
	}
	if urls.URLs["r1-s1-flow.png"] != "https://github.com/o/r/blob/idea-loop-evidence-pr-7/r1-s1-flow.png?raw=true" {
		t.Fatal(urls)
	}
	var endpoints []string
	for _, c := range calls {
		endpoints = append(endpoints, c.args[3]+" "+c.args[1])
	}
	want := []string{
		"GET repos/o/r/git/ref/heads/idea-loop-evidence-pr-7", "POST repos/o/r/git/blobs", "POST repos/o/r/git/trees",
		"POST repos/o/r/git/commits", "POST repos/o/r/git/refs",
	}
	if !reflect.DeepEqual(endpoints, want) {
		t.Fatal(endpoints)
	}
	var blob map[string]string
	must(t, json.Unmarshal([]byte(calls[1].stdin), &blob))
	if blob["encoding"] != "base64" || blob["content"] != base64.StdEncoding.EncodeToString([]byte("PNGDATA")) {
		t.Fatal(blob)
	}
	var tree struct {
		BaseTree string `json:"base_tree"`
		Tree     []struct{ Path, Mode, Type, SHA string }
	}
	must(t, json.Unmarshal([]byte(calls[2].stdin), &tree))
	if tree.BaseTree != "" || len(tree.Tree) != 1 || tree.Tree[0].Path != "r1-s1-flow.png" || tree.Tree[0].Mode != "100644" || tree.Tree[0].SHA != "blob1" {
		t.Fatalf("%+v", tree)
	}
	var commit struct {
		Message string   `json:"message"`
		Tree    string   `json:"tree"`
		Parents []string `json:"parents"`
	}
	must(t, json.Unmarshal([]byte(calls[3].stdin), &commit))
	if commit.Tree != "tree1" || len(commit.Parents) != 0 || !strings.HasPrefix(commit.Message, "PR #7 交付证据：r1-s1-flow.png\n\nidea-loop 素材分支") {
		t.Fatalf("%+v", commit)
	}
	var ref map[string]string
	must(t, json.Unmarshal([]byte(calls[4].stdin), &ref))
	if ref["ref"] != "refs/heads/idea-loop-evidence-pr-7" || ref["sha"] != "commit1" {
		t.Fatal(ref)
	}
}

func TestPublishOnAnExistingBranchBuildsOnItAndMovesTheRefWithoutForce(t *testing.T) {
	dir := t.TempDir()
	png := filepath.Join(dir, "t01-a.png")
	must(t, os.WriteFile(png, []byte("x"), 0o644))
	var calls []call
	run := func(args []string, stdin string, env []string) (string, error) {
		calls = append(calls, call{args, stdin})
		switch args[1] {
		case "repos/o/r/git/ref/heads/idea-loop-evidence-pr-7":
			return `{"object":{"sha":"old"}}`, nil
		case "repos/o/r/git/commits/old":
			return `{"tree":{"sha":"oldtree"}}`, nil
		case "repos/o/r/git/blobs":
			return `{"sha":"b"}`, nil
		case "repos/o/r/git/trees":
			return `{"sha":"t"}`, nil
		case "repos/o/r/git/commits":
			return `{"sha":"c"}`, nil
		case "repos/o/r/git/refs/heads/idea-loop-evidence-pr-7":
			return `{}`, nil
		}
		t.Fatalf("unexpected call %v", args)
		return "", nil
	}
	st := store{api: githubapp.AsGHLogin(run), run: run, repo: "o/r"}
	if _, err := st.publish("7", []string{png}); err != nil {
		t.Fatal(err)
	}
	last := calls[len(calls)-1]
	if last.args[3] != "PATCH" || last.args[1] != "repos/o/r/git/refs/heads/idea-loop-evidence-pr-7" || !strings.Contains(last.stdin, `"force":false`) || !strings.Contains(last.stdin, `"sha":"c"`) {
		t.Fatal(last)
	}
	var tree map[string]any
	must(t, json.Unmarshal([]byte(calls[3].stdin), &tree))
	if tree["base_tree"] != "oldtree" {
		t.Fatal(tree)
	}
	var commit struct{ Parents []string }
	must(t, json.Unmarshal([]byte(calls[4].stdin), &commit))
	if !reflect.DeepEqual(commit.Parents, []string{"old"}) {
		t.Fatal(commit)
	}
}

func TestPublishRefusesBadFilesBeforeTouchingGitHub(t *testing.T) {
	run := func(args []string, stdin string, env []string) (string, error) {
		t.Fatalf("nothing may be sent: %v", args)
		return "", nil
	}
	st := store{api: githubapp.AsGHLogin(run), run: run, repo: "o/r"}
	_, err := st.publish("7", []string{filepath.Join(t.TempDir(), "flow.png")})
	inv, isInv := err.(*InvalidFilesError)
	if !isInv || len(inv.Problems) < 2 {
		t.Fatal(err)
	}
}

func TestCleanupDeletesTheBranchAndSweepsALeftOverDraftRelease(t *testing.T) {
	var calls []call
	run := func(args []string, stdin string, env []string) (string, error) {
		calls = append(calls, call{args, stdin})
		switch {
		case args[1] == "repos/o/r/git/ref/heads/idea-loop-evidence-pr-9":
			return `{"object":{"sha":"h"}}`, nil
		case args[1] == "repos/o/r/git/trees/h":
			return `{"tree":[{"path":"a.png","type":"blob"},{"path":"sub","type":"tree"},{"path":"b.gif","type":"blob"}]}`, nil
		case args[0] == "release" && args[1] == "view":
			return `{"isDraft":true}`, nil
		}
		return "", nil
	}
	st := store{api: githubapp.AsGHLogin(run), run: run, repo: "o/r"}
	said, err := st.cleanup("9")
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(said, []string{"已删除 idea-loop-evidence-pr-9（2 个文件）", "另删除了旧版留下的 draft release idea-loop-evidence-pr-9"}) {
		t.Fatal(said)
	}
	deleted := false
	for _, c := range calls {
		if c.is("api", "repos/o/r/git/refs/heads/idea-loop-evidence-pr-9", "--method", "DELETE") {
			deleted = true
		}
	}
	if !deleted {
		t.Fatal(calls)
	}
	if !calls[len(calls)-1].is("release", "delete", "idea-loop-evidence-pr-9", "--repo", "o/r", "--yes") {
		t.Fatal(calls[len(calls)-1])
	}
}

func TestCleanupOfABranchThatIsNotThereIsANoOp(t *testing.T) {
	run := func(args []string, stdin string, env []string) (string, error) {
		return "", &githubapp.GHError{Stderr: "Not Found"}
	}
	st := store{api: githubapp.AsGHLogin(run), run: run, repo: "o/r"}
	said, err := st.cleanup("9")
	if err != nil || !reflect.DeepEqual(said, []string{"idea-loop-evidence-pr-9 不存在，无需删除"}) {
		t.Fatal(said, err)
	}
}

func TestTheUrlListKeepsTheOrderTheFilesWereGiven(t *testing.T) {
	var sb strings.Builder
	must(t, writeJSON(&sb, urlsOf("o/r", "3", []string{"t02-b.png", "t01-a.png"})))
	want := "{\n  \"t02-b.png\": \"https://github.com/o/r/blob/idea-loop-evidence-pr-3/t02-b.png?raw=true\",\n  \"t01-a.png\": \"https://github.com/o/r/blob/idea-loop-evidence-pr-3/t01-a.png?raw=true\"\n}\n"
	if sb.String() != want {
		t.Fatalf("%q", sb.String())
	}
	sb.Reset()
	must(t, writeJSON(&sb, urlsOf("o/r", "3", nil)))
	if sb.String() != "{}\n" {
		t.Fatalf("%q", sb.String())
	}
}

func must(t *testing.T, err error) {
	t.Helper()
	if err != nil {
		t.Fatal(err)
	}
}
