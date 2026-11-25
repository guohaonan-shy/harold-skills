package retro_test

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/retro"
)

// The assertions of the old session-digest.test.mjs, one for one. All samples are made up. The record shapes
// (type / subtype / isMeta / isCompactSummary / message.content blocks) follow what Claude Code writes to
// ~/.claude/projects/<project>/<session>.jsonl.

type rec = retro.Record

func human(text string, extra ...rec) rec {
	r := rec{"type": "user", "timestamp": "2026-01-01T00:00:00Z", "message": map[string]any{"role": "user", "content": text}}
	for _, e := range extra {
		for k, v := range e {
			r[k] = v
		}
	}
	return r
}

func ai(blocks ...any) rec {
	return rec{"type": "assistant", "message": map[string]any{"role": "assistant", "model": "m", "content": blocks}}
}

func say(text string) rec { return ai(map[string]any{"type": "text", "text": text}) }
func call(id string) rec {
	return ai(map[string]any{"type": "tool_use", "id": id, "name": "Bash", "input": map[string]any{"command": "SECRET-TOOL-INPUT"}})
}
func result(id, text string) rec {
	return rec{"type": "user", "message": map[string]any{"role": "user", "content": []any{map[string]any{"type": "tool_result", "tool_use_id": id, "content": text}}}}
}

var (
	boundary = rec{"type": "system", "subtype": "compact_boundary", "content": "Conversation compacted", "compactMetadata": map[string]any{"trigger": "auto", "preTokens": float64(123456)}}
	summary  = rec{"type": "user", "isCompactSummary": true, "message": map[string]any{"role": "user", "content": "This session is being continued ... SUMMARY-TEXT"}}
)

func session() []rec {
	return []rec{
		human("第一句：先看看登录页"),
		say("我先去读代码。"),
		call("t1"),
		result("t1", "TOOL-OUTPUT-ONE"),
		say("登录页有两处问题：A 和 B。要先修哪个？"),
		human("先修 B，别动 A"),
		call("t2"),
		result("t2", "TOOL-OUTPUT-TWO"),
		boundary,
		summary,
		say("B 修好了，A 没动。"),
		human("A 为什么不用修？你没讲清楚"),
	}
}

func squeeze(records []rec, aiMax ...int) retro.Digest {
	max := retro.AIMaxDefault
	if len(aiMax) > 0 {
		max = aiMax[0]
	}
	return retro.Squeeze(records, max)
}

func humans(d retro.Digest) []string {
	var out []string
	for _, t := range d.Turns {
		out = append(out, t.Human)
	}
	return out
}

func TestKeepsEveryHumanUtteranceFromBeforeAndAfterACompactionMarker(t *testing.T) {
	if got := fmt.Sprint(humans(squeeze(session()))); got != "[第一句：先看看登录页 先修 B，别动 A A 为什么不用修？你没讲清楚]" {
		t.Fatal(got)
	}
}

func TestDropsToolCallsToolOutputsAndTheCompactionSummary(t *testing.T) {
	text := retro.Render(squeeze(session()))
	for _, leaked := range []string{"SECRET-TOOL-INPUT", "TOOL-OUTPUT-ONE", "TOOL-OUTPUT-TWO", "SUMMARY-TEXT", "Conversation compacted"} {
		if strings.Contains(text, leaked) {
			t.Fatal("leaked:", leaked)
		}
	}
}

func TestEachHumanUtteranceCarriesTheConclusionOfTheAIReplyBeforeItNotItsWorkingNotes(t *testing.T) {
	turns := squeeze(session()).Turns
	if turns[0].AI != "" || turns[1].AI != "登录页有两处问题：A 和 B。要先修哪个？" || turns[2].AI != "B 修好了，A 没动。" {
		t.Fatalf("%+v", turns)
	}
}

func TestWhenAReplyEndsOnAToolCallTheLastThingItSaidIsTheConclusion(t *testing.T) {
	turns := squeeze([]rec{human("go"), say("我会先改 X，再跑测试。"), call("t1"), result("t1", "ok"), human("好")}).Turns
	if turns[1].AI != "我会先改 X，再跑测试。" {
		t.Fatal(turns)
	}
}

func TestLongConclusionsKeepTheirTailWhereTheQuestionToTheHumanUsuallySits(t *testing.T) {
	long := strings.Repeat("前文。", 200) + "最后问你：选 A 还是 B？"
	turns := squeeze([]rec{say(long), human("A")}, 40).Turns
	if !strings.HasSuffix(turns[0].AI, "最后问你：选 A 还是 B？") || len([]rune(turns[0].AI)) >= 80 || !strings.Contains(turns[0].AI, "前略") {
		t.Fatal(turns[0].AI)
	}
}

func TestSlashCommandsBecomeNameArgsSystemOriginatedUserRecordsAreNotHuman(t *testing.T) {
	records := []rec{
		human("<command-message>idea-loop:issue-session</command-message>\n<command-name>/idea-loop:issue-session</command-name>\n<command-args>51</command-args>"),
		human("<task-notification>\n<task-id>x</task-id>\n</task-notification>"),
		human("<local-command-stdout>hi</local-command-stdout>"),
		human("<bash-input>ls</bash-input><bash-stdout>x</bash-stdout>"),
		human("skill body injected by the harness", rec{"isMeta": true}),
		human("sidechain chatter", rec{"isSidechain": true}),
		human("<system-reminder>\nnoise\n</system-reminder>真正的话"),
		{"type": "user", "message": map[string]any{"role": "user", "content": []any{map[string]any{"type": "text", "text": "带图的话"}, map[string]any{"type": "image", "source": map[string]any{}}}}},
	}
	if got := humans(squeeze(records)); fmt.Sprintf("%q", got) != `["/idea-loop:issue-session 51" "真正的话" "带图的话\n[图片]"]` {
		t.Fatalf("%q", got)
	}
}

func TestTheCompactionItselfIsNotedInOrderSoTheReaderKnowsWhereContextWasLost(t *testing.T) {
	d := squeeze(session())
	if d.Compactions != 1 {
		t.Fatal(d.Compactions)
	}
	var kinds []string
	for _, e := range d.Events {
		if e.Compact {
			kinds = append(kinds, "compact")
		} else {
			kinds = append(kinds, "turn")
		}
	}
	if fmt.Sprint(kinds) != "[turn turn compact turn]" || !strings.Contains(retro.Render(d), "压缩") {
		t.Fatal(kinds)
	}
}

func TestParseJSONLSkipsBlankAndBrokenLines(t *testing.T) {
	enc := func(r rec) string { b, _ := json.Marshal(r); return string(b) }
	text := enc(human("a")) + "\n\n{not json\n" + enc(human("b")) + "\n"
	if n := len(retro.ParseJSONL(text)); n != 2 {
		t.Fatal(n)
	}
}

func TestRenderedDigestListsUtterancesNumberedWithTheAIConclusionQuotedAboveEach(t *testing.T) {
	text := retro.Render(squeeze(session()))
	if !strings.Contains(text, "## 2 ") || !regexp.MustCompile(`> 登录页有两处问题：A 和 B。要先修哪个？\n[\s\S]*人：\n先修 B，别动 A`).MatchString(text) {
		t.Fatal(text)
	}
}

func TestExactlyOneCandidateIsTheAnswerHoweverManySessionsExistElsewhere(t *testing.T) {
	if p := retro.PickSession([]string{"mine"}); !p.OK || p.Path != "mine" {
		t.Fatal(p)
	}
}

func TestNoCandidateNoAnswer(t *testing.T) {
	if p := retro.PickSession(nil); p.OK || p.Reason != "none" || len(p.Candidates) != 0 {
		t.Fatal(p)
	}
}

func TestSeveralCandidatesNoAnswerAndNeverTheNewest(t *testing.T) {
	if p := retro.PickSession([]string{"old", "resumed"}); p.OK || p.Reason != "ambiguous" || fmt.Sprint(p.Candidates) != "[old resumed]" {
		t.Fatal(p)
	}
}

// ---------- command line ----------

func writeSession(t *testing.T, path string, records ...rec) {
	t.Helper()
	var lines []string
	for _, r := range records {
		b, _ := json.Marshal(r)
		lines = append(lines, string(b))
	}
	writeFile(t, path, strings.Join(lines, "\n")+"\n")
}

func TestCLILocateThenDigestOnADirectoryOfSessionFiles(t *testing.T) {
	dir := t.TempDir()
	writeSession(t, filepath.Join(dir, "a.jsonl"), human("an older session"), say("收到"))
	writeSession(t, filepath.Join(dir, "b.jsonl"), human("opening MARKER-51"), say("收到"), human("后来的话"))
	writeSession(t, filepath.Join(dir, "c.jsonl"), human("another session"))

	located := dyna(nil, "retro", "locate", "--dir", dir, "--marker", "MARKER-51")
	if located.code != 0 || strings.TrimSpace(located.stdout) != filepath.Join(dir, "b.jsonl") {
		t.Fatal(located)
	}
	out := dyna(nil, "retro", "digest", filepath.Join(dir, "b.jsonl"))
	if out.code != 0 || !strings.Contains(out.stdout, "后来的话") {
		t.Fatal(out)
	}
	missing := dyna(nil, "retro", "locate", "--dir", dir, "--marker", "NOT-THERE")
	if missing.code != 2 || !strings.Contains(missing.stderr, "export_transcript") {
		t.Fatal(missing)
	}
}

func TestDigestOfAFileThatIsNotThereOrNoFileIsAUsageErrorAndAiMaxMustBeANumber(t *testing.T) {
	if r := dyna(nil, "retro", "digest", filepath.Join(t.TempDir(), "gone.jsonl")); r.code != 1 {
		t.Fatal(r)
	}
	if r := dyna(nil, "retro", "digest"); r.code != 1 {
		t.Fatal(r)
	}
	f := filepath.Join(t.TempDir(), "s.jsonl")
	writeSession(t, f, say(strings.Repeat("前文。", 100)+"问你"), human("A"))
	if r := dyna(nil, "retro", "digest", f, "--ai-max", "abc"); r.code != 1 {
		t.Fatal(r)
	}
	r := dyna(nil, "retro", "digest", f, "--ai-max", "10")
	if r.code != 0 || !strings.Contains(r.stdout, "[前略 ") {
		t.Fatal(r)
	}
}

const (
	marker   = "issue-session，参数 87"
	cardTask = "用 Skill 工具调 idea-loop:issue-session，参数 87，按它从开场做起。"
)

// fakeHome is a HOME with ~/.claude/projects/<project>/<id>.jsonl files; put returns the path it wrote.
type fakeHome struct {
	t    *testing.T
	home string
}

func newFakeHome(t *testing.T) *fakeHome {
	root, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	return &fakeHome{t: t, home: filepath.Join(root, "home")}
}

func (h *fakeHome) put(project, id string, records ...rec) string {
	path := filepath.Join(h.home, ".claude", "projects", project, id+".jsonl")
	writeSession(h.t, path, records...)
	return path
}

func (h *fakeHome) projects(project string) string {
	return filepath.Join(h.home, ".claude", "projects", project)
}

func (h *fakeHome) locate(sessionID string, args ...string) outcome {
	env := map[string]string{"HOME": h.home}
	if sessionID != "" {
		env["CLAUDE_CODE_SESSION_ID"] = sessionID
	}
	return dyna(env, append([]string{"retro", "locate"}, args...)...)
}

// The dispatcher session: the marker is only inside a tool_use input (the card prompt the AI wrote).
var dispatcherRecords = []rec{
	human("/idea-loop:issue-dispatch"),
	ai(map[string]any{"type": "tool_use", "id": "x", "name": "start_session", "input": map[string]any{"prompt": cardTask}}),
}

func TestCLIAfterCdToTheDispatcherProjectDirectoryTheMarkerStillFindsThisSessionNotTheDispatcher(t *testing.T) {
	h := newFakeHome(t)
	own := h.put("-wt", "self-id", human(cardTask), say("收到"))
	h.put("-main", "dispatch-id", dispatcherRecords...)
	r := h.locate("", "--marker", marker)
	if r.code != 0 || strings.TrimSpace(r.stdout) != own {
		t.Fatal(r)
	}
}

func TestCLITheSessionIDComesFirstFromTheEnvironmentOrSessionWhereverTheCurrentDirectoryIs(t *testing.T) {
	h := newFakeHome(t)
	own := h.put("-wt", "self-id", human(cardTask))
	h.put("-main", "dispatch-id", dispatcherRecords...)
	fromEnv := h.locate("self-id")
	if fromEnv.code != 0 || strings.TrimSpace(fromEnv.stdout) != own {
		t.Fatal(fromEnv)
	}
	explicit := h.locate("", "--session", "self-id")
	if explicit.code != 0 || strings.TrimSpace(explicit.stdout) != own {
		t.Fatal(explicit)
	}
}

func TestCLITheIDWinsOverAMarkerThatPointsAtAnotherFile(t *testing.T) {
	h := newFakeHome(t)
	own := h.put("-wt", "self-id", human("something else entirely"))
	h.put("-other", "other-id", human(cardTask))
	r := h.locate("self-id", "--marker", marker)
	if r.code != 0 || strings.TrimSpace(r.stdout) != own {
		t.Fatal(r)
	}
}

func TestCLIAnIDWithNoFileFallsBackToTheMarker(t *testing.T) {
	h := newFakeHome(t)
	own := h.put("-wt", "self-id", human(cardTask))
	r := h.locate("gone-id", "--marker", marker)
	if r.code != 0 || strings.TrimSpace(r.stdout) != own {
		t.Fatal(r)
	}
}

func TestCLITheSameIDInTwoProjectDirectoriesIsNotAnAnswer(t *testing.T) {
	h := newFakeHome(t)
	a := h.put("-one", "dup-id", human("x"))
	b := h.put("-two", "dup-id", human("x"))
	r := h.locate("dup-id")
	if r.code != 2 || !strings.Contains(r.stderr, "dup-id") || !strings.Contains(r.stderr, a) || !strings.Contains(r.stderr, b) || !strings.Contains(r.stderr, "export_transcript") {
		t.Fatal(r)
	}
}

func TestCLITwoProjectDirectoriesWhoseFirstHumanUtteranceHoldsTheMarkerExitTwoBothListed(t *testing.T) {
	h := newFakeHome(t)
	a := h.put("-one", "id-a", human(cardTask))
	b := h.put("-two", "id-b", human(cardTask))
	r := h.locate("", "--marker", marker)
	if r.code != 2 || !strings.Contains(r.stderr, "export_transcript") || !strings.Contains(r.stderr, a) || !strings.Contains(r.stderr, b) || !strings.Contains(r.stderr, "marker") {
		t.Fatal(r)
	}
}

func TestCLIAResumedSessionIsAmbiguousNotTheNewestWins(t *testing.T) {
	h := newFakeHome(t)
	old := h.put("-wt", "old-id", human(cardTask), say("收到"))
	resumed := h.put("-wt", "resumed-id", human(cardTask), say("收到"), human("后来的话"))
	past, later := time.Unix(1_000_000, 0), time.Unix(2_000_000, 0)
	_ = os.Chtimes(old, past, past)
	_ = os.Chtimes(resumed, later, later)
	for _, extra := range [][]string{nil, {"--dir", h.projects("-wt")}} {
		r := h.locate("", append([]string{"--marker", marker}, extra...)...)
		if r.code != 2 || !strings.Contains(r.stderr, "export_transcript") || !strings.Contains(r.stderr, old) || !strings.Contains(r.stderr, resumed) {
			t.Fatal(r)
		}
	}
}

func TestCLINothingMatchesTheIDAndNothingMatchesTheMarkerExitTwoAndTheMessageSaysWhatWasLookedFor(t *testing.T) {
	h := newFakeHome(t)
	h.put("-wt", "self-id", human("unrelated"))
	r := h.locate("gone-id", "--marker", marker)
	if r.code != 2 || !strings.Contains(r.stderr, "gone-id") || !strings.Contains(r.stderr, marker) || !strings.Contains(r.stderr, "export_transcript") {
		t.Fatal(r)
	}
	if h.locate("gone-id").code != 2 {
		t.Fatal("an id alone, with no file, is exit 2")
	}
}

func TestCLIWithNeitherAnIDNorAMarkerThereIsNothingToLookForExitTwo(t *testing.T) {
	h := newFakeHome(t)
	h.put("-wt", "self-id", human("hello"))
	r := h.locate("")
	if r.code != 2 || !strings.Contains(r.stderr, "export_transcript") {
		t.Fatal(r)
	}
}

func TestCLIOnlyTheFirstHumanUtteranceCountsForTheMarker(t *testing.T) {
	h := newFakeHome(t)
	h.put("-later", "later-id", human("开场白"), say("好"), human(cardTask))
	h.put("-reminder", "reminder-id", human("<system-reminder>\n"+cardTask+"\n</system-reminder>开场白"))
	h.put("-notice", "notice-id", human("<task-notification>"+cardTask+"</task-notification>"), human("开场白"))
	h.put("-tool", "tool-id", human("开场白"), call("t1"), result("t1", cardTask))
	if h.locate("", "--marker", marker).code != 2 {
		t.Fatal("none of those is a first utterance holding the marker")
	}
	// ... and the first human utterance is the first one that is not injected by the harness:
	own := h.put("-own", "own-id", human("<task-notification>x</task-notification>"), human("<local-command-stdout>y</local-command-stdout>"), human(cardTask))
	r := h.locate("", "--marker", marker)
	if r.code != 0 || strings.TrimSpace(r.stdout) != own {
		t.Fatal(r)
	}
}

func TestCLITheFirstHumanUtteranceIsFoundEvenWhenTheLinesAroundItAreHuge(t *testing.T) {
	h := newFakeHome(t)
	big := strings.Repeat("x", 300_000)
	own := h.put("-big", "big-id", ai(map[string]any{"type": "text", "text": big}), human(cardTask), ai(map[string]any{"type": "text", "text": big}))
	r := h.locate("", "--marker", marker)
	if r.code != 0 || strings.TrimSpace(r.stdout) != own {
		t.Fatal(r)
	}
}

func TestCLIDirKeepsTheSearchToThatOneDirectory(t *testing.T) {
	h := newFakeHome(t)
	inside := h.put("-in", "in-id", human(cardTask))
	h.put("-out", "out-id", human(cardTask))
	r := h.locate("", "--dir", h.projects("-in"), "--marker", marker)
	if r.code != 0 || strings.TrimSpace(r.stdout) != inside {
		t.Fatal(r)
	}
}

// ---------- the old script answers the same ----------

func TestDigestAndLocateAnswerLikeTheOldScript(t *testing.T) {
	node, script := oldScript(t, "session-digest.mjs")
	h := newFakeHome(t)
	full := h.put("-wt", "self-id", session()...)
	h.put("-one", "id-a", human(cardTask))
	h.put("-two", "id-b", human(cardTask))
	h.put("-dispatch", "dispatch-id", dispatcherRecords...)
	emoji := h.put("-emoji", "emoji-id", say(strings.Repeat("😀前文。", 40)+"问你：选哪个？"), human("A"), human("B", rec{"timestamp": nil}))

	oldEnv := func(id string) map[string]string {
		env := map[string]string{"HOME": h.home}
		if id != "" {
			env["CLAUDE_CODE_SESSION_ID"] = id
		}
		return env
	}
	same := func(name string, want outcome, got outcome) {
		t.Helper()
		if want.stdout != got.stdout || want.stderr != got.stderr || want.code != got.code {
			t.Errorf("%s: old (%d)\n%s%s\nnew (%d)\n%s%s", name, want.code, want.stdout, want.stderr, got.code, got.stdout, got.stderr)
		}
	}
	for _, file := range []string{full, emoji} {
		same("digest "+filepath.Base(file), runOld(t, node, oldEnv(""), script, "digest", file), dyna(nil, "retro", "digest", file))
		same("digest --ai-max "+filepath.Base(file), runOld(t, node, oldEnv(""), script, "digest", file, "--ai-max", "30"), dyna(nil, "retro", "digest", file, "--ai-max", "30"))
	}
	for name, c := range map[string]struct {
		id   string
		args []string
	}{
		"by id":           {"self-id", nil},
		"by session flag": {"", []string{"--session", "self-id"}},
		"id then marker":  {"gone-id", []string{"--marker", marker}},
		"two by marker":   {"", []string{"--marker", marker}},
		"nothing":         {"", nil},
		"none by id":      {"gone-id", nil},
		"dir":             {"", []string{"--dir", h.projects("-dispatch"), "--marker", marker}},
	} {
		same("locate "+name, runOld(t, node, oldEnv(c.id), append([]string{script, "locate"}, c.args...)...), dyna(oldEnv(c.id), append([]string{"retro", "locate"}, c.args...)...))
	}
}
