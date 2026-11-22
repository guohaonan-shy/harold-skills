// Package issues is the one way an issue's status changes. The issue's status is the only record of how far a
// piece of work has got: a spec is a document without a status of its own, and is done once every issue its
// frontmatter lists (`issues: [12]`) is closed.
//
// Seven states. The four open ones each have a `status:<name>` label: triage (verified, a human is assessing
// it), todo (ready for dispatch), in-progress (a session is on it), in-review (the PRs are ready, waiting for the
// human). backlog is open with no `status:*` label. done and canceled are the closed states and carry no label:
// GitHub's close reason says which. `set` checks every flip against Next and, where the flip depends on
// something outside the issue, against that.
//
// A PR belongs to an issue when its body says `Refs <owner>/<repo>#<n>` (a bare `Refs #<n>` counts for a PR in
// the issue's own repo). Only the project's own repository is searched.
//
// <docs> is `<home>/projects/<名字>/docs`, the project's knowledge base in home. The project's repository and
// its local clone come from the project list in home, never from the directory the command runs in.
package issues

import (
	"fmt"
	"sort"
	"strings"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/home"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/spec"
)

// Prefix of every status label.
const Prefix = "status:"

// Label is the status label of a state.
func Label(state string) string { return Prefix + state }

// States is every state, in the order work goes through them.
var States = []string{"backlog", "triage", "todo", "in-progress", "in-review", "done", "canceled"}

// Labeled are the four open states that carry a label.
var Labeled = []string{"triage", "todo", "in-progress", "in-review"}

// Closed maps the closed states to GitHub's close reason.
var Closed = map[string]string{"done": "completed", "canceled": "not planned"}

// Working are the states a session works in: each has a sidebar section of that name.
var Working = home.Sections

var about = map[string]string{
	"triage":      "验证过，要人评估（grill、设计）",
	"todo":        "可以被调度派成会话",
	"in-progress": "会话在做，spec 提交后开 draft PR",
	"in-review":   "PR 都转 ready，等人看",
}

var colors = map[string]string{"triage": "1d76db", "todo": "0e8a16", "in-progress": "fbca04", "in-review": "d93f0b"}

// Kinds and their labels.
var Kinds = []string{"bug", "feature", "improvement"}

const KindPrefix = "kind:"

var kindColors = map[string]string{"bug": "d73a4a", "feature": "a2eeef", "improvement": "7057ff"}

// Priorities and their labels.
var Priorities = []string{"P0", "P1", "P2"}

const PriorityPrefix = "priority:"

var priorityColors = map[string]string{"P0": "b60205", "P1": "d93f0b", "P2": "fbca04"}

func indexOf(list []string, s string) int {
	for i, x := range list {
		if x == s {
			return i
		}
	}
	return -1
}

func contains(list []string, s string) bool { return indexOf(list, s) >= 0 }

// PriorityOf is the priority an issue carries (the highest when it wrongly has several); "" when none.
func PriorityOf(labels []string) string {
	var own []string
	for _, l := range labels {
		if strings.HasPrefix(l, PriorityPrefix) {
			own = append(own, strings.TrimPrefix(l, PriorityPrefix))
		}
	}
	for _, p := range Priorities {
		if contains(own, p) {
			return p
		}
	}
	return ""
}

func priorityRank(labels []string) int {
	p := PriorityOf(labels)
	if p == "" {
		return len(Priorities)
	}
	return indexOf(Priorities, p)
}

// Next are the flips `set` allows. done and canceled are final: reopening is the human's call.
var Next = map[string][]string{
	"backlog":     {"triage", "todo", "canceled"},
	"triage":      {"todo", "backlog", "canceled"},
	"todo":        {"in-progress", "backlog", "canceled"},
	"in-progress": {"in-review", "triage", "backlog", "canceled"},
	"in-review":   {"in-progress", "done", "backlog", "canceled"},
	"done":        {},
	"canceled":    {},
}

// NeedsComment are the flips that must say, in a comment on the issue, where the work stopped.
var NeedsComment = map[string]bool{"backlog": true}

// AIMarker is the first line of every comment idea-loop writes on an issue: an HTML comment, which GitHub does not
// render.
const AIMarker = "<!-- idea-loop -->"

// legacyPrefix is the visible prefix idea-loop used to put on its comments; comments already posted keep it, so it
// is still recognised.
const legacyPrefix = "🤖 idea-loop："

// IsIdeaLoopComment says whether a comment was written by idea-loop: it carries the marker, or starts with the old
// prefix.
func IsIdeaLoopComment(body string) bool {
	return strings.Contains(body, AIMarker) || strings.HasPrefix(body, legacyPrefix)
}

// withMarker is the text of a comment as posted: the marker on its own first line, then the text; the old prefix is
// dropped, a marker already there is not doubled.
func withMarker(text string) string {
	t := strings.TrimSpace(text)
	if strings.HasPrefix(t, AIMarker) {
		return t
	}
	if strings.HasPrefix(t, legacyPrefix) {
		t = strings.TrimSpace(strings.TrimPrefix(t, legacyPrefix))
	}
	return AIMarker + "\n" + t
}

// StateOf is an issue's state: closed ones by their close reason (not planned = canceled, anything else = done),
// open ones by the status:* label, backlog when there is none. A label that is not a state, or two status
// labels, come back as that text, so callers can tell the issue is outside the machine.
func StateOf(labels []string, open bool, reason string) string {
	if !open {
		if reason == "not_planned" || reason == "not planned" {
			return "canceled"
		}
		return "done"
	}
	var own []string
	for _, l := range labels {
		if strings.HasPrefix(l, Prefix) {
			own = append(own, strings.TrimPrefix(l, Prefix))
		}
	}
	switch len(own) {
	case 0:
		return "backlog"
	case 1:
		return own[0]
	}
	return strings.Join(own, " + ")
}

// PR is a pull request of the project's repository that is attached to an issue.
type PR struct {
	Repo   string
	Number int
	URL    *string
	State  string // draft | ready | merged | closed
}

// Transition is what TransitionError needs besides the two states.
type Transition struct {
	Spec       *string // the text of the spec that covers the issue; nil when there is none
	PRs        []PR    // needed only for → done
	Comment    string
	SkipDesign bool
	SkipTriage bool
}

// TransitionError is why flipping an issue from `from` to `to` is refused; "" when it may be flipped.
func TransitionError(from, to string, t Transition) string {
	if !contains(States, to) {
		return fmt.Sprintf("「%s」不是 issue 的状态（%s）", to, strings.Join(States, " / "))
	}
	if !contains(States, from) {
		return fmt.Sprintf("issue 现在的状态「%s」不在状态机里（旧状态机留下的先跑 dyna issues migrate）", from)
	}
	if from == to {
		return fmt.Sprintf("issue 已经是「%s」", to)
	}
	var choices []string
	for _, s := range Next[from] {
		if !(t.SkipTriage && s == "triage") {
			choices = append(choices, s)
		}
	}
	list := strings.Join(choices, " / ")
	if list == "" {
		list = "无"
	}
	if to == "triage" && t.SkipTriage {
		return fmt.Sprintf("项目文档（ISSUE_TRACKER.md）写了跳过 triage：不翻 triage，backlog 直接翻 todo（能翻成：%s）", list)
	}
	if !contains(Next[from], to) {
		return fmt.Sprintf("「%s」不能翻成「%s」（能翻成：%s）", from, to, list)
	}
	if NeedsComment[to] && strings.TrimSpace(t.Comment) == "" {
		return "翻「backlog」要带 --comment：写清停在哪个阶段、分支叫什么，下一个会话靠它接上"
	}
	if from == "triage" && to == "todo" {
		if t.Spec == nil {
			return "没有 spec 的 issues: 列着这个 issue——triage 的产出是 spec，写好才翻 todo"
		}
		if human := spec.ForHuman(*t.Spec); len(human) > 0 {
			return "spec 里还有等人定的：" + strings.Join(human, "；")
		}
		if spec.TouchesUI(*t.Spec) && !spec.HasFreezeSummary(*t.Spec) && !t.SkipDesign {
			return "spec 碰 UI，「实现决策」里还没有「冻结摘要」——先设计；没装 design 插件时带 --skip-design，并在汇报里写明跳过了设计"
		}
	}
	if to == "done" {
		var live, open []PR
		for _, p := range t.PRs {
			if p.State != "closed" {
				live = append(live, p)
				if p.State != "merged" {
					open = append(open, p)
				}
			}
		}
		if len(live) == 0 {
			return "没有 PR 挂在这个 issue 上（PR 正文要有 `Refs <owner>/<repo>#<号>`）——全部 PR 合并才能翻 done"
		}
		if len(open) > 0 {
			var parts []string
			for _, p := range open {
				parts = append(parts, fmt.Sprintf("%s#%d（%s）", p.Repo, p.Number, p.State))
			}
			return "还有 PR 没合并：" + strings.Join(parts, "、")
		}
	}
	return ""
}

// sortedKeys is the keys of a set, sorted.
func sortedKeys(m map[string]bool) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}
