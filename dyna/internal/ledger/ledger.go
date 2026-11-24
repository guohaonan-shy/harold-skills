// Package ledger answers which tickets have landed on the integration branch, from the `Ticket:` line of each
// commit, and checks a landed hand-back against its commit.
//
// implement keeps no state file: a ticket has landed when the integration branch holds a commit whose message
// carries `Ticket: <NN>-<slug>`. That line used to be read as a git trailer (`%(trailers:key=Ticket)`), but git
// only treats the message's LAST paragraph as trailers, and the environment an implementer commits from appends
// its own attribution paragraph (`Co-Authored-By: …`) after a blank line. The Ticket line then sits in the
// second-to-last paragraph and the trailer read comes back empty: the ledger silently loses a landed ticket. So
// the line is matched anywhere in the message, on a line of its own, wherever the attribution lands.
//
// It also checks a landed hand-back against its commit (skill-edit): a commit that changes skills, agent
// definitions or skill reference files must come with a hand-back whose 「读了哪几份写法规范」 line says it CALLED
// writing-for-agents (the template's own 「读 / 调」 left as is does not count), one 「杠杆」 line per changed
// file, and one 「验证」 line per changed file (CheckVerify: a way among the five, a name, and for a replay or a
// goal case a case directory the commit's tree holds and a result of 过 or 大用例待跑). Only the hand-back's own
// words are checked, not whether the lever or the way named is the right one (review judges that).
package ledger

import (
	"regexp"
	"strings"
	"unicode"
)

var ticketLine = regexp.MustCompile(`(?m)^Ticket:[ \t]*([0-9]{2}-[\w.-]+)[ \t]*\r?$`)

// TicketOf is the ticket a commit message names; ok is false when it names none. A `wip(<NN>):` commit names
// none, by design.
func TicketOf(message string) (ticket string, ok bool) {
	m := ticketLine.FindStringSubmatch(message)
	if m == nil {
		return "", false
	}
	return m[1], true
}

const (
	recordSep = "\x1e"
	fieldSep  = "\x1f"
)

// LogFormat is the `git log` format ParseLog reads: sha, a field separator, the whole message, a record separator.
const LogFormat = "%H" + fieldSep + "%B" + recordSep

// Landed is a commit on the integration branch that names a ticket.
type Landed struct {
	SHA    string `json:"sha"`
	Ticket string `json:"ticket"`
}

// ParseLog reads the output of `git log --format=LogFormat` into the commits that name a ticket, in log order.
func ParseLog(raw string) []Landed {
	out := []Landed{}
	for _, rec := range strings.Split(raw, recordSep) {
		rec = strings.TrimLeft(rec, "\n")
		if rec == "" {
			continue
		}
		i := strings.Index(rec, fieldSep)
		if i < 0 {
			continue
		}
		sha := strings.TrimSpace(rec[:i])
		ticket, ok := TicketOf(rec[i+len(fieldSep):])
		if sha != "" && ok {
			out = append(out, Landed{SHA: sha, Ticket: ticket})
		}
	}
	return out
}

var (
	ticketFile = regexp.MustCompile(`(^|/)docs/spec/[^/]+/tickets/`)
	skillMd    = regexp.MustCompile(`(^|/)SKILL\.md$`)
	underSkill = regexp.MustCompile(`(^|/)skills/.+\.md$`)
	underAgent = regexp.MustCompile(`(^|/)agents/[^/]+\.md$`)
)

// IsSkillEditFile: does this path count as a skill, an agent definition or a skill reference file? The same rule
// to-ticket writes into the ticket: a path ending in `SKILL.md`; or any `.md` under a `skills/` directory; or a
// `.md` directly under an `agents/` directory (`.claude/agents/` too). Ticket files
// (`docs/spec/<slug>/tickets/`) never count.
func IsSkillEditFile(path string) bool {
	p := strings.TrimPrefix(path, "./")
	if ticketFile.MatchString(p) {
		return false
	}
	return skillMd.MatchString(p) || underSkill.MatchString(p) || underAgent.MatchString(p)
}

// SkillEditFiles keeps the paths that count, in order.
func SkillEditFiles(paths []string) []string {
	out := []string{}
	for _, p := range paths {
		if IsSkillEditFile(p) {
			out = append(out, p)
		}
	}
	return out
}

// Standards is the hand-back's 「读了哪几份写法规范」 line: how (the second column) and which (the third).
type Standards struct{ Method, Names string }

// Lever is one 「杠杆」 line: the file and the lever named for it.
type Lever struct{ File, Lever string }

// Verify is one 「验证」 line: the file, the way it was verified (检查 / 回放 / 目标用例 / 不改行为 / 判不了), the
// case name, check name or reason, and the result.
type Verify struct{ File, Method, Name, Result string }

// HandBack is what a hand-back says about the writing standards, levers and verifications.
type HandBack struct {
	Standards *Standards
	Levers    []Lever
	Verifies  []Verify
}

var (
	standardsLine = regexp.MustCompile(`(?m)^\s*(?:[-*]\s*)?读了哪几份写法规范\s*\|([^|]*)\|(.*)$`)
	leverLine     = regexp.MustCompile(`(?m)^\s*(?:[-*]\s*)?杠杆\s*\|([^|]*)\|(.*)$`)
	verifyLine    = regexp.MustCompile(`(?m)^\s*(?:[-*]\s*)?验证\s*\|([^|]*)\|([^|]*)\|([^|]*)(?:\|(.*))?$`)
)

func unquote(s string) string {
	s = strings.TrimSpace(s)
	s = strings.TrimPrefix(s, "`")
	return strings.TrimSpace(strings.TrimSuffix(s, "`"))
}

// ParseHandback reads the 「读了哪几份写法规范」 line (nil when there is none), the 「杠杆」 lines and the
// 「验证」 lines.
func ParseHandback(text string) HandBack {
	var h HandBack
	if m := standardsLine.FindStringSubmatch(text); m != nil {
		h.Standards = &Standards{Method: strings.TrimSpace(m[1]), Names: strings.TrimSpace(m[2])}
	}
	for _, m := range leverLine.FindAllStringSubmatch(text, -1) {
		h.Levers = append(h.Levers, Lever{File: unquote(m[1]), Lever: strings.TrimSpace(m[2])})
	}
	for _, m := range verifyLine.FindAllStringSubmatch(text, -1) {
		h.Verifies = append(h.Verifies, Verify{
			File: unquote(m[1]), Method: strings.TrimSpace(m[2]), Name: strings.TrimSpace(m[3]), Result: strings.TrimSpace(m[4]),
		})
	}
	return h
}

// The hand-back template offers 「读 / 调」 as the method; copied unchanged it says nothing about what was done.
func isTemplateMethod(method string) bool {
	var b strings.Builder
	runes := []rune(method)
	for i := 0; i < len(runes); {
		if !isGap(runes[i]) {
			b.WriteRune(runes[i])
			i++
			continue
		}
		slash := false
		for i < len(runes) && isGap(runes[i]) {
			if runes[i] == '／' {
				slash = true
			}
			i++
		}
		if slash {
			b.WriteByte('/')
		}
	}
	return b.String() == "读/调"
}

func isGap(r rune) bool { return unicode.IsSpace(r) || r == 0xFEFF || r == '／' }

func sameFile(a, b string) bool {
	return a == b || strings.HasSuffix(a, "/"+b) || strings.HasSuffix(b, "/"+a)
}

// CheckSkillEdit says, for the writing-standards line and the 「杠杆」 lines only, why a hand-back does not cover the files its commit changed: empty when it does, or when
// no such file changed.
func CheckSkillEdit(files []string, handback string) []string {
	changed := SkillEditFiles(files)
	if len(changed) == 0 {
		return nil
	}
	h := ParseHandback(handback)
	var reasons []string
	if h.Standards == nil {
		reasons = append(reasons, "交回里没有「读了哪几份写法规范」那一行：改了 skill、agent 定义或 skill 参考文件，要用 Skill 工具调 writing-for-agents，并在这一行写明")
	} else {
		if !strings.Contains(h.Standards.Method, "调") {
			reasons = append(reasons, "「读了哪几份写法规范」那一行的方式是「"+h.Standards.Method+"」，没有「调」：改 skill、agent 定义、skill 参考文件的工单要用 Skill 工具调 writing-for-agents，读一句引文不算")
		} else if isTemplateMethod(h.Standards.Method) {
			reasons = append(reasons, "「读了哪几份写法规范」那一行的方式是模板原文「"+h.Standards.Method+"」，没改：调了写「调」（可以跟别的方式并列，如「调、读」），没调就别写「调」")
		}
		if !strings.Contains(h.Standards.Names, "writing-for-agents") {
			reasons = append(reasons, "「读了哪几份写法规范」那一行的名单里没有 writing-for-agents")
		}
	}
	for _, file := range changed {
		found := false
		for _, l := range h.Levers {
			if l.Lever != "" && sameFile(l.File, file) {
				found = true
				break
			}
		}
		if !found {
			reasons = append(reasons, file+" 没有杠杆行：要有一行「杠杆 | "+file+" | <对的哪条杠杆>」，第三栏不能空")
		}
	}
	return reasons
}

// VerifyMethods are the five ways a change to a skill-like file is verified (the spec's 「验证：」 line).
var VerifyMethods = []string{"检查", "回放", "目标用例", "不改行为", "判不了"}

const (
	resultPassed     = "过"
	resultLargeToRun = "大用例待跑"
	methodReplay     = "回放"
	methodGoalCase   = "目标用例"
)

var caseNameSep = regexp.MustCompile(`[,，、;；]+`)

func caseDirIn(tree []string, name string) bool {
	want := "evals/retro/cases/" + name + "/case.json"
	for _, p := range tree {
		p = strings.TrimPrefix(p, "./")
		if p == want || strings.HasSuffix(p, "/"+want) {
			return true
		}
	}
	return false
}

// CheckVerify says why a hand-back does not carry the 「验证」 line each changed skill-like file needs: empty when
// it does, or when no such file changed. tree is every path of the commit's tree (to find the case directories a
// replay or a goal case names). A file may have several lines; each one is judged, and at least one must exist.
func CheckVerify(files []string, handback string, tree []string) []string {
	changed := SkillEditFiles(files)
	if len(changed) == 0 {
		return nil
	}
	h := ParseHandback(handback)
	var reasons []string
	for _, file := range changed {
		found := false
		for _, v := range h.Verifies {
			if !sameFile(v.File, file) {
				continue
			}
			found = true
			known := false
			for _, m := range VerifyMethods {
				known = known || v.Method == m
			}
			if !known {
				reasons = append(reasons, file+" 的验证行方式是「"+v.Method+"」，不在五种里：要写 检查、回放、目标用例、不改行为、判不了 之一")
			}
			if v.Name == "" {
				reasons = append(reasons, file+" 的验证行第四栏是空的：写用例名、检查名或原因")
			}
			if v.Method != methodReplay && v.Method != methodGoalCase {
				continue
			}
			for _, name := range caseNameSep.Split(v.Name, -1) {
				if name = unquote(name); name != "" && !caseDirIn(tree, name) {
					reasons = append(reasons, file+" 的验证行（"+v.Method+"）写的用例「"+name+"」，这个提交的仓库树里没有它的目录：要有 <插件>/evals/retro/cases/"+name+"/case.json，写好用例并随提交一起提交")
				}
			}
			if v.Result != resultPassed && v.Result != resultLargeToRun {
				reasons = append(reasons, file+" 的验证行（"+v.Method+"）结果是「"+v.Result+"」，要写「过」或「大用例待跑」：小用例跑过写「过」，大用例写好没跑写「大用例待跑」")
			}
		}
		if !found {
			reasons = append(reasons, file+" 没有验证行：要有一行「验证 | "+file+" | <方式> | <用例名 / 检查名 / 原因> | <结果>」")
		}
	}
	return reasons
}
