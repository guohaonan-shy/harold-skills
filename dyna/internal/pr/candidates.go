package pr

// Admission check for one pr-review round's candidates — quotes must exist, code must be in the diff.
//
// A review that is free to assert things finds something every time, and some of it is invented: a rule the
// repository never wrote, a spec line nobody said, code that is not in this PR. So every candidate the two Codex
// reviewers return carries what it stands on, and this file checks that ground mechanically before anything
// reaches Harold:
//
//	spec      — quote.text appears in quote.file (the spec or a ticket); a behavioural finding (behavior: true)
//	            carries its reproduction as evidence — a figure in the round's evidence dir named rN-…, or an
//	            inline table / worked example — because a behaviour that was not reproduced is not a finding.
//	            Which form is the reviewer's call: whatever lets the reader see it fastest. A non-behavioural one
//	            (an extra file, a path that differs from the spec) needs no evidence beyond the diff.
//	            A behavioural finding also says whether it shows on screen (on_screen). One that does must carry a
//	            screenshot taken from the implementation (before / after, a screenshot flow, a gif) — a table or a
//	            timeline in words leaves the decider guessing what the student saw — unless no_screenshot says why
//	            it could not be shot; that is a shape problem (rewrite), not a discard.
//	standards — rule.text appears in rule.file; every non-blank line of code.snippet is an added line of
//	            code.path in `git diff <base>...HEAD`
//
// Every candidate also carries a disposition. Absent or 要你决定 is the old shape — the human decides. 照规则 is
// a finding whose handling the written rules already settle (skills/productivity/decision-rules/SKILL.md of the
// plugin): it carries a basis ({ kind, file, text, summary } — kind is one of the three things a decision may
// stand on: the text of a written rule, the human's own words from this spec or PR, an existing practice with an
// instance; text must be found in file, else the candidate is discarded like any ungrounded quote) and an action
// (修 / 同步改 / 接受并补记 / 恢复 / 开 issue), and has no decide block — no options, no recommendation. A
// Standards finding stands on its own rule, so its basis is optional. A Standards finding about code that was
// not added in this diff (existing: true) is admitted only as a ruled fix with a `pollutes` sentence — a stock
// problem that spoils this change's input or conclusion or turns CI red; its snippet is then looked up in the file
// as it is now, not in the diff.
//
// Whitespace is normalized; nothing else is fuzzy. A failed candidate is discarded with its reason; the round's
// report lists discards in one folded line each.
//
// Admitted candidates are then checked for the shape the round's report is written in, because it is read by the
// person who decides, not by the person who fixes: a finding has a title that states the consequence, the
// situation now, the impact, and, unless it is ruled, a decision (options that each say what they do, what they
// cost and whether they can be undone, and a recommendation) - the same on both axes; and none of that
// reader-facing text may carry a code-level reference — backticks, file:line, a path, a snake_case name, a commit
// hash, a section number like §4.7. Those belong in `locations`, which only the fixer sees. Shape problems are
// not discards: the finding stands, its wording has to be redone (`rewrite`). Rules:
// skills/engineering/pr-review/references/review-standards.md and skills/engineering/pr/references/review-report.md
// of the plugin.
//
// A candidate is whatever JSON the reviewer wrote, so it is read the way the old script read it: a field is
// "there" when its key is, a text is "filled" when it is a string with something in it, a flag counts only when
// it is a real boolean.

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
)

// Dispositions, actions and the three kinds of basis a ruled finding may stand on.
var (
	Actions      = []string{"修", "同步改", "接受并补记", "恢复", "开 issue"}
	BasisKinds   = []string{"规则原文", "人的决定", "现有做法"}
	Dispositions = []string{"照规则", "要你决定"}
)

type obj = map[string]any

// Candidate is one finding as the reviewer wrote it.
type Candidate struct {
	M   obj
	Raw json.RawMessage
}

// NewCandidate reads one candidate; what is not a JSON object has no fields.
func NewCandidate(raw json.RawMessage) Candidate {
	c := Candidate{Raw: raw, M: obj{}}
	var m obj
	if json.Unmarshal(raw, &m) == nil && m != nil {
		c.M = m
	}
	return c
}

// Candidates are the two axes' findings.
type Candidates struct {
	Spec      []Candidate
	Standards []Candidate
}

// ParseCandidates reads the file a round's reviewers wrote: { "spec": [...], "standards": [...] }.
func ParseCandidates(data []byte) (Candidates, error) {
	var in struct {
		Spec      []json.RawMessage `json:"spec"`
		Standards []json.RawMessage `json:"standards"`
	}
	if err := json.Unmarshal(data, &in); err != nil {
		return Candidates{}, err
	}
	var out Candidates
	for _, r := range in.Spec {
		out.Spec = append(out.Spec, NewCandidate(r))
	}
	for _, r := range in.Standards {
		out.Standards = append(out.Standards, NewCandidate(r))
	}
	return out, nil
}

// MarshalJSON writes the finding as it was read.
func (c Candidate) MarshalJSON() ([]byte, error) {
	if len(c.Raw) > 0 {
		return c.Raw, nil
	}
	return marshalPlain(c.M)
}

// field is v?.key: the field of an object, nothing for anything else.
func field(v any, key string) any {
	if m, ok := v.(obj); ok {
		return m[key]
	}
	return nil
}

func hasKey(m obj, key string) bool {
	_, ok := m[key]
	return ok
}

// filled is a string with something in it.
func filled(v any) bool {
	s, ok := v.(string)
	return ok && normalize(s) != ""
}

// truthy is JavaScript's truthiness.
func truthy(v any) bool {
	switch x := v.(type) {
	case nil:
		return false
	case bool:
		return x
	case string:
		return x != ""
	case float64:
		return x != 0
	}
	return true
}

func isBool(v any) bool { _, ok := v.(bool); return ok }

func (c Candidate) str(key string) string {
	if s, ok := c.M[key].(string); ok {
		return s
	}
	return ""
}

func (c Candidate) isRuled() bool { return c.M["disposition"] == "照规则" }

// ID is the candidate's id as it was written, for output.
func (c Candidate) rawField(key string) json.RawMessage {
	v, ok := c.M[key]
	if !ok {
		return nil
	}
	b, _ := marshalPlain(v)
	return b
}

// ruledProblems is what is wrong with the shape of a 照规则 finding: its basis, its action, and that it asks the human nothing.
func ruledProblems(c Candidate, axis string) []string {
	var problems []string
	action := c.M["action"]
	if s, ok := action.(string); !ok || !oneOf(Actions, s) {
		if !hasKey(c.M, "action") || action == "" {
			problems = append(problems, fmt.Sprintf("缺动作（%s 之一）", strings.Join(Actions, " / ")))
		} else {
			problems = append(problems, fmt.Sprintf("动作只能是 %s 之一，不是「%s」", strings.Join(Actions, " / "), jsString(action)))
		}
	}
	if hasKey(c.M, "decide") {
		problems = append(problems, "照规则的条目不写「要你决定」：没有选项、没有建议，依据不成立就改成「要你决定」")
	}
	if !hasKey(c.M, "basis") {
		if axis == "spec" {
			problems = append(problems, "缺依据（规则原文 / 人的决定 / 现有做法，三选一，带原文和出处）")
		}
	} else {
		b := c.M["basis"]
		if k, ok := field(b, "kind").(string); !ok || !oneOf(BasisKinds, k) {
			problems = append(problems, "依据只认三种："+strings.Join(BasisKinds, " / "))
		}
		if !filled(field(b, "file")) || !filled(field(b, "text")) {
			problems = append(problems, "依据缺出处或原文（file 和 text 都要给）")
		}
		if !filled(field(b, "summary")) {
			problems = append(problems, "缺一句依据（给人读的一句话，说清依据是什么）")
		} else {
			for _, hit := range codeRefs(field(b, "summary").(string)) {
				problems = append(problems, "「依据」里有代码层面的指称："+hit)
			}
		}
	}
	if truthy(c.M["existing"]) {
		if c.M["action"] != "修" {
			problems = append(problems, "存量问题照规则处理时，动作只能是「修」")
		}
		if !filled(c.M["pollutes"]) {
			problems = append(problems, "缺一句它怎么影响这次的输入、结论或 CI（pollutes）：说不出，就是与这次无关的存量，不报")
		} else {
			for _, hit := range codeRefs(c.str("pollutes")) {
				problems = append(problems, "「它怎么影响这次」里有代码层面的指称："+hit)
			}
		}
	}
	return problems
}

// decideProblems is what is wrong with the 要你决定 block of a finding: options (each with its cost and whether
// it can be undone) and a recommendation.
func decideProblems(decide any) []string {
	var problems []string
	options, isList := field(decide, "options").([]any)
	if !isList || len(options) < 2 {
		problems = append(problems, "「要你决定」至少要列两个选项")
	}
	for i, opt := range options {
		at := fmt.Sprintf("选项 %c", rune('A'+i))
		var o obj
		switch x := opt.(type) {
		case obj:
			o = x
		case []any:
			o = obj{}
		default:
			problems = append(problems, at+"：选项要写成 { do, cost, rollback }：做法、代价、能否回滚")
			continue
		}
		for _, f := range [][2]string{{"do", "做法"}, {"cost", "代价"}, {"rollback", "能否回滚"}} {
			if !filled(o[f[0]]) {
				problems = append(problems, fmt.Sprintf("%s：缺%s", at, f[1]))
			} else {
				for _, hit := range codeRefs(o[f[0]].(string)) {
					problems = append(problems, fmt.Sprintf("%s「%s」里有代码层面的指称：%s", at, f[1], hit))
				}
			}
		}
	}
	rec := field(decide, "recommend")
	if !filled(rec) {
		problems = append(problems, "「要你决定」没给建议")
	} else {
		for _, hit := range codeRefs(rec.(string)) {
			problems = append(problems, "「要你决定」的建议里有代码层面的指称："+hit)
		}
	}
	return problems
}

// ShapeProblems is what is wrong with the wording of one admitted finding; empty when it can be posted as is. A
// 要你决定 item has one shape whichever axis it comes from: title, now (what it is and where it is from: a
// Standards finding puts the rule's words here), impact, evidence, options, recommendation.
func ShapeProblems(c Candidate, axis string) []string {
	var problems []string
	impact := "影响"
	if axis == "spec" {
		impact = "对用户的影响"
	}
	for _, f := range [][2]string{{"title", "标题"}, {"now", "现状"}, {"impact", impact}, {"example", "例子"}} {
		if f[0] == "example" && !filled(c.M[f[0]]) {
			continue // optional: a figure may carry the evidence instead
		}
		if !filled(c.M[f[0]]) {
			problems = append(problems, fmt.Sprintf("缺「%s」", f[1]))
		} else {
			for _, hit := range codeRefs(c.str(f[0])) {
				problems = append(problems, fmt.Sprintf("「%s」里有代码层面的指称：%s——说行为和后果，位置放进 locations", f[1], hit))
			}
		}
	}
	if hasKey(c.M, "disposition") {
		if d, ok := c.M["disposition"].(string); !ok || !oneOf(Dispositions, d) {
			problems = append(problems, fmt.Sprintf("处置只能是「%s」，不是「%s」", strings.Join(Dispositions, "」或「"), jsString(c.M["disposition"])))
		}
	}
	if c.isRuled() {
		problems = append(problems, ruledProblems(c, axis)...)
	} else if truthy(c.M["existing"]) {
		problems = append(problems, "改动行以外的存量问题只在它污染了这次改动、或让 CI 变红时才报，处置必须是「照规则」（动作：修）")
	}
	if axis == "spec" {
		behavior, isB := c.M["behavior"].(bool)
		switch {
		case !isB:
			problems = append(problems, "没标 behavior（是不是行为问题决定要不要配图）")
		case !behavior && truthy(c.M["figure"]):
			problems = append(problems, "不是行为问题（多了 / 少了文件、路径不一致这类）不配图，去掉 figure")
		case behavior && !isBool(c.M["on_screen"]):
			problems = append(problems, "没标 on_screen（这个问题在界面上看不看得到，决定证据要不要用截图）")
		case behavior && c.M["on_screen"] == true && !truthy(c.M["figure"]) && !filled(c.M["no_screenshot"]):
			problems = append(problems, "界面上看得到的问题要配取自实现的截图：单点差别用之前 / 之后截图，多步流程用截图拼的流程，动起来的用动图；表格、时序图、例子只能补充。确实拍不到（比如只有真机能复现），在 no_screenshot 里写一句为什么")
		}
		if filled(c.M["no_screenshot"]) {
			for _, hit := range codeRefs(c.str("no_screenshot")) {
				problems = append(problems, fmt.Sprintf("「为什么没有截图」里有代码层面的指称：%s", hit))
			}
		}
	}
	if !c.isRuled() {
		problems = append(problems, decideProblems(c.M["decide"])...)
	}
	return problems
}

// Discard is a candidate that was thrown out and why.
type Discard struct {
	ID     json.RawMessage `json:"id,omitempty"`
	Title  json.RawMessage `json:"title,omitempty"`
	Reason string          `json:"reason"`
}

// Rewrite is an admitted candidate whose wording has to be redone.
type Rewrite struct {
	ID       json.RawMessage `json:"id,omitempty"`
	Problems []string        `json:"problems"`
}

// Result is what a round's candidates came to.
type Result struct {
	Spec      []Candidate `json:"spec"`
	Standards []Candidate `json:"standards"`
	Discarded []Discard   `json:"discarded"`
	Rewrite   []Rewrite   `json:"rewrite"`
}

// IO is what Admit looks things up in; the CLI answers from the working tree, the diff and the round's evidence dir.
type IO struct {
	// Read is the text of a file, or ok=false when there is none.
	Read func(path string) (string, bool)
	// Exists says whether an evidence file of this name is in the round's evidence directory.
	Exists func(name string) bool
	// Added is the added lines of one file in `git diff <base>...HEAD`, normalized.
	Added func(path string) []string
}

// AddedLines is the added lines of one file in a unified diff, as normalized strings.
func AddedLines(diff, path string) []string {
	var out []string
	current, set := "", false
	for _, raw := range strings.Split(diff, "\n") {
		if strings.HasPrefix(raw, "+++ ") {
			current, set = strings.TrimPrefix(raw[4:], "b/"), true
		} else if set && current == path && strings.HasPrefix(raw, "+") {
			out = append(out, normalize(raw[1:]))
		}
	}
	return out
}

// SnippetInDiff is true when every non-blank line of snippet is among the added lines.
func SnippetInDiff(snippet string, added []string) bool {
	pool := map[string]bool{}
	for _, l := range added {
		pool[l] = true
	}
	n := 0
	for _, l := range strings.Split(snippet, "\n") {
		l = normalize(l)
		if l == "" {
			continue
		}
		n++
		if !pool[l] {
			return false
		}
	}
	return n > 0
}

// Admit checks what each candidate stands on, discards the ungrounded ones with their reason, and lists the
// admitted ones whose wording has to be redone.
func Admit(cands Candidates, io IO, round int) Result {
	res := Result{Spec: []Candidate{}, Standards: []Candidate{}, Discarded: []Discard{}, Rewrite: []Rewrite{}}
	drop := func(c Candidate, reason string) {
		res.Discarded = append(res.Discarded, Discard{ID: c.rawField("id"), Title: c.rawField("title"), Reason: reason})
	}
	read := func(path any) (string, bool) {
		p, ok := path.(string)
		if !ok || p == "" {
			return "", false
		}
		return io.Read(p)
	}
	// a basis that names a file and a text must be telling the truth; one that names neither is a shape problem
	basisProblem := func(c Candidate) string {
		b := c.M["basis"]
		if !c.isRuled() || !truthy(b) || !filled(field(b, "file")) || !filled(field(b, "text")) {
			return ""
		}
		kind := "没标种类"
		if k := field(b, "kind"); k != nil {
			kind = jsString(k)
		}
		file, ok := read(field(b, "file"))
		if !ok || file == "" {
			return fmt.Sprintf("依据（%s）引用的文件不存在：%s", kind, jsString(field(b, "file")))
		}
		if !contains(file, text(field(b, "text"))) {
			return fmt.Sprintf("依据（%s）：%s 里找不到引用的原文", kind, jsString(field(b, "file")))
		}
		return ""
	}
	figurePrefix := "r" + strconv.Itoa(round) + "-"
	for _, c := range cands.Spec {
		qfile := field(c.M["quote"], "file")
		file, ok := read(qfile)
		switch {
		case !ok || file == "":
			shown := "（没给）"
			if qfile != nil {
				shown = jsString(qfile)
			}
			drop(c, "引用的文件不存在："+shown)
		case !contains(file, text(field(c.M["quote"], "text"))):
			drop(c, fmt.Sprintf("%s 里找不到引用的原文", jsString(qfile)))
		case basisProblem(c) != "":
			drop(c, basisProblem(c))
		case c.M["behavior"] != false && !truthy(c.M["figure"]) && !filled(c.M["example"]):
			drop(c, "行为问题没有复现证据（图、表格或例子都没有）：没复现的不算问题")
		case truthy(c.M["figure"]) && !strings.HasPrefix(jsString(c.M["figure"]), figurePrefix):
			drop(c, fmt.Sprintf("配图 %s 不以 r%d- 开头", jsString(c.M["figure"]), round))
		case truthy(c.M["figure"]) && !io.Exists(jsString(c.M["figure"])):
			drop(c, fmt.Sprintf("配图 %s 不在证据目录里", jsString(c.M["figure"])))
		default:
			res.Spec = append(res.Spec, c)
		}
	}
	for _, c := range cands.Standards {
		rfile := field(c.M["rule"], "file")
		rule, ok := read(rfile)
		switch {
		case !ok || rule == "":
			shown := "（没给）"
			if rfile != nil {
				shown = jsString(rfile)
			}
			drop(c, "规则文件不存在："+shown)
		case !contains(rule, text(field(c.M["rule"], "text"))):
			drop(c, fmt.Sprintf("%s 里找不到引用的规则原文", jsString(rfile)))
		case basisProblem(c) != "":
			drop(c, basisProblem(c))
		case c.M["existing"] == true:
			path := field(c.M["code"], "path")
			now, ok := read(path)
			var lines []string
			for _, l := range strings.Split(now, "\n") {
				lines = append(lines, normalize(l))
			}
			if !ok || now == "" || !SnippetInDiff(text(field(c.M["code"], "snippet")), lines) {
				shown := "没给路径"
				if truthy(path) {
					shown = jsString(path)
				}
				drop(c, fmt.Sprintf("存量代码片段在现在的文件里找不到（%s）", shown))
			} else {
				res.Standards = append(res.Standards, c)
			}
		default:
			path := field(c.M["code"], "path")
			if !truthy(path) || !SnippetInDiff(text(field(c.M["code"], "snippet")), io.Added(jsString(path))) {
				shown := "没给路径"
				if truthy(path) {
					shown = jsString(path)
				}
				drop(c, fmt.Sprintf("代码片段不在这次 diff 新增的行里（%s）", shown))
			} else {
				res.Standards = append(res.Standards, c)
			}
		}
	}
	for _, ax := range []struct {
		name string
		list []Candidate
	}{{"spec", res.Spec}, {"standards", res.Standards}} {
		for _, c := range ax.list {
			if problems := ShapeProblems(c, ax.name); len(problems) > 0 {
				res.Rewrite = append(res.Rewrite, Rewrite{ID: c.rawField("id"), Problems: problems})
			}
		}
	}
	return res
}
