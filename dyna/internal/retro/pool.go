package retro

import (
	"fmt"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/gitrun"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/jsstr"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/miniyaml"
)

// `retro` puts a rule candidate the human approved but did not yet send into a skill into a pool
// (docs/records/retro-candidates/, one file per candidate). dreaming and retro need to know how many times each one
// has occurred, and "is this the same kind" is a judgement the retro session makes and the human checks when the
// line is written; what is left is arithmetic, so it lives here.
//
// A candidate file has the shape: frontmatter (type, captured, title, tags); bullets 信号 / 落点 / 旧文 / 新文 /
// 归并 / 验证 / 例子 (归并 and 验证 are not checked, older files lack them); one bullet
// `- 状态：<在池里 | 已开 issue（<链接>） | 驳回（<理由>）>`; then a `## 出现` section, one bullet per occurrence:
//
//	- <repo>#<number>（<date>）：「<verbatim words>」；决定记录：<link>
//	- <repo>#<number>（<date>）：「<verbatim words>」；决定记录：<link>（已推翻：「<words that overturned it>」）

// Threshold is how many distinct sessions make a candidate pass: the human's words in the grill behind this
// ("出现超过两次") put it at 3.
const Threshold = 3

var (
	overturnedRe = regexp.MustCompile(`[（(]已推翻[：:]`)
	sessionRe    = regexp.MustCompile(`^[-*]` + jsstr.WS + `+([\w./-]+#\d+)`)
	occurrenceRe = regexp.MustCompile(`^##` + jsstr.WS + `+出现` + jsstr.WS + `*$`)
	headingRe    = regexp.MustCompile(`^#{1,2}` + jsstr.WS)
	bulletStart  = regexp.MustCompile(`^[-*]` + jsstr.WS)
	rejectedRe   = regexp.MustCompile(`(?m)^[-*]` + jsstr.WS + `*状态[：:]` + jsstr.WS + `*驳回[（(]`)
)

var statusForms = []struct {
	kind string
	re   *regexp.Regexp
}{
	{"在池里", regexp.MustCompile(`^在池里$`)},
	{"已开 issue", regexp.MustCompile(`^已开 issue（(.+)）$`)},
	{"驳回", regexp.MustCompile(`^驳回（(.+)）$`)},
}

// bullet is the text of the first `- <label>：…` bullet, or nil.
func bullet(body, label string) *string {
	re := regexp.MustCompile(`(?m)^[-*]` + jsstr.WS + `*` + regexp.QuoteMeta(label) + `[：:]` + jsstr.WS + `*(.+?)` + jsstr.WS + `*$`)
	if m := re.FindStringSubmatch(body); m != nil {
		return &m[1]
	}
	return nil
}

// occurrenceLines are the bullet lines under the `## 出现` heading, or nil when there is no such heading.
func occurrenceLines(body string) ([]string, bool) {
	all := strings.Split(body, "\n")
	start := -1
	for i, l := range all {
		if occurrenceRe.MatchString(l) {
			start = i
			break
		}
	}
	if start < 0 {
		return nil, false
	}
	out := []string{}
	for _, l := range all[start+1:] {
		if headingRe.MatchString(l) {
			break
		}
		if bulletStart.MatchString(l) {
			out = append(out, l)
		}
	}
	return out, true
}

// splitFrontmatter splits `---\n<yaml>\n---\n<body>` and reads the title. problem is what is wrong with the
// frontmatter itself ("" when nothing); title is nil when there is none or it is not a string.
func splitFrontmatter(md string) (title *string, body string, problem string) {
	sp := miniyaml.SplitFrontmatter(md)
	if sp.FM != nil {
		if t, ok := miniyaml.AsString(sp.FM.Get("title")); ok {
			if trimmed := jsstr.Trim(t); trimmed != "" {
				title = &trimmed
			}
		}
	}
	return title, sp.Body, sp.Error
}

// Candidate is what the pool needs to know about one candidate file.
type Candidate struct {
	File         string  `json:"file"`
	Title        *string `json:"title"`
	Landing      *string `json:"landing"`
	Status       *string `json:"status"`
	StatusDetail *string `json:"statusDetail"`
	Count        int     `json:"count"`
	Passes       bool    `json:"passes"`
}

// Problem is one thing wrong with one candidate file.
type Problem struct {
	File    string `json:"file"`
	Message string `json:"message"`
}

// Pool is the count of a whole pool.
type Pool struct {
	Threshold  int         `json:"threshold"`
	Candidates []Candidate `json:"candidates"`
	Problems   []Problem   `json:"problems"`
}

// ParseCandidate reads one candidate file. The count is the number of distinct sessions (`<repo>#<number>`) among
// the occurrence lines that are not marked 已推翻: two lines from one session are one occurrence, and an overturned
// line stays in the file but does not count. A file whose shape is wrong (no 出现 section or an empty one, an
// occurrence line naming no session, no 状态 line or one outside the closed set, no 落点, no title) is a problem: a
// count read off a broken file would be a quiet wrong number.
func ParseCandidate(md, file string) (Candidate, []Problem) {
	var problems []string
	title, body, fmProblem := splitFrontmatter(md)
	if fmProblem != "" {
		problems = append(problems, "frontmatter 读不了："+fmProblem)
	}
	if title == nil {
		problems = append(problems, "frontmatter 缺 title")
	}

	landing := bullet(body, "落点")
	if landing == nil {
		problems = append(problems, "缺「落点」")
	}

	var status, detail *string
	if text := bullet(body, "状态"); text == nil {
		problems = append(problems, "缺「状态」")
	} else {
		found := false
		for _, f := range statusForms {
			if m := f.re.FindStringSubmatch(*text); m != nil {
				kind := f.kind
				status = &kind
				if len(m) > 1 {
					d := m[1]
					detail = &d
				}
				found = true
				break
			}
		}
		if !found {
			problems = append(problems, "「状态」不在闭集里（在池里 / 已开 issue（链接） / 驳回（理由））："+*text)
		}
	}

	count := 0
	lines, ok := occurrenceLines(body)
	switch {
	case !ok:
		problems = append(problems, "缺「出现」一节")
	case len(lines) == 0:
		problems = append(problems, "「出现」一节里没有一行")
	default:
		standing := map[string]bool{}
		for _, l := range lines {
			m := sessionRe.FindStringSubmatch(l)
			if m == nil {
				problems = append(problems, "「出现」里有一行认不出会话（该以 <仓库>#<号> 开头）："+firstUnits(l, 40))
				continue
			}
			if !overturnedRe.MatchString(l) {
				standing[m[1]] = true
			}
		}
		count = len(standing)
	}

	out := make([]Problem, len(problems))
	for i, p := range problems {
		out[i] = Problem{File: file, Message: p}
	}
	return Candidate{File: file, Title: title, Landing: landing, Status: status, StatusDetail: detail, Count: count, Passes: len(problems) == 0 && count >= Threshold}, out
}

// firstUnits is `s.slice(0, n)`: the first n UTF-16 code units.
func firstUnits(s string, n int) string {
	var b strings.Builder
	units := 0
	for _, r := range s {
		w := 1
		if r > 0xffff {
			w = 2
		}
		if units+w > n {
			break
		}
		b.WriteRune(r)
		units += w
	}
	return b.String()
}

// PoolFile is one candidate file as read from disk.
type PoolFile struct{ File, MD string }

// CountPool reads every file of a pool.
func CountPool(files []PoolFile) Pool {
	pool := Pool{Threshold: Threshold, Candidates: []Candidate{}, Problems: []Problem{}}
	for _, f := range files {
		c, p := ParseCandidate(f.MD, f.File)
		pool.Candidates = append(pool.Candidates, c)
		pool.Problems = append(pool.Problems, p...)
	}
	return pool
}

// sessionSets are the sessions named in a candidate's 出现 section: all of them, and those with a line not marked
// 已推翻 (standing), each in the order they appear.
type sessionSets struct {
	all      map[string]bool
	standing []string
}

func sessionsOf(md string) sessionSets {
	sets := sessionSets{all: map[string]bool{}}
	lines := strings.Split(md, "\n")
	start := -1
	for i, l := range lines {
		if occurrenceRe.MatchString(l) {
			start = i
			break
		}
	}
	if start < 0 {
		return sets
	}
	seen := map[string]bool{}
	for _, l := range lines[start+1:] {
		if headingRe.MatchString(l) {
			break
		}
		m := sessionRe.FindStringSubmatch(l)
		if m == nil {
			continue
		}
		sets.all[m[1]] = true
		if !overturnedRe.MatchString(l) && !seen[m[1]] {
			seen[m[1]] = true
			sets.standing = append(sets.standing, m[1])
		}
	}
	return sets
}

// Reopened is the answer of `retro pool reopened`.
type Reopened struct {
	File           string   `json:"file"`
	RejectedIn     string   `json:"rejectedIn"`
	Reopened       bool     `json:"reopened"`
	NewOccurrences []string `json:"newOccurrences"`
}

// Unanswerable is a question the history cannot answer; the message says why.
type Unanswerable string

func (u Unanswerable) Error() string { return string(u) }

// CheckReopened answers whether a rejected candidate has come up again since it was last rejected, from git
// history. The date of the rejection is not written in the file, and dates are not compared either: a rejection and
// a new occurrence on the same day cannot be told apart by date. Order is the order of commits.
//
//   - The rejection that counts is the latest commit that touched a `- 状态：驳回（` line, whatever it did to it
//     (set it, changed its reason, replaced it): `git log -G`, not `-S`, because `-S` only fires when the number of
//     matching lines changes and a second rejection with a new reason does not change it.
//   - A session is new when it stands in the file now (an occurrence line not marked 已推翻) and was not named by
//     any occurrence line, overturned or not, in the file as of that commit.
//   - Rejecting a second time therefore has to leave a commit: the reason is rewritten (it names the occurrence it
//     answers). A rejection that leaves the file byte for byte the same cannot be seen here.
//
// A file whose status is not 驳回, or whose rejection is not in the history (never committed), cannot be answered:
// a guess here would either hide a candidate or put it on the table every week.
func CheckReopened(file string, read func(string) (string, error)) (Reopened, error) {
	abs, err := filepath.Abs(file)
	if err != nil {
		return Reopened{}, err
	}
	dir := filepath.Dir(abs)
	now, err := read(abs)
	if err != nil {
		return Reopened{}, err
	}
	if !rejectedRe.MatchString(now) {
		return Reopened{}, Unanswerable(file + " 的状态不是驳回：不该来问它有没有重新出现")
	}

	base := filepath.Base(abs)
	prefix, err := gitrun.Run(dir, "rev-parse", "--show-prefix")
	var sha string
	if err == nil {
		var out string
		out, err = gitrun.Run(dir, "log", "--topo-order", "--format=%H", "-G^- 状态：驳回（", "--", base) // newest first; no -n1: git counts before the -G filter
		if err == nil {
			sha = strings.TrimSpace(strings.SplitN(out, "\n", 2)[0])
		}
	}
	if err != nil {
		msg := strings.TrimSpace(err.Error())
		return Reopened{}, Unanswerable(fmt.Sprintf("%s 不在 git 仓库里或读不了历史：%s", file, msg))
	}
	if sha == "" {
		return Reopened{}, Unanswerable(file + " 的历史里没有「状态：驳回（」这一行的提交（驳回还没提交？）：取不到驳回的提交")
	}

	path := strings.TrimSpace(prefix) + base
	old, err := gitrun.Run(dir, "show", sha+":"+path)
	if err != nil {
		return Reopened{}, Unanswerable(fmt.Sprintf("%s 不在 git 仓库里或读不了历史：%s", file, strings.TrimSpace(err.Error())))
	}
	before := sessionsOf(old).all
	fresh := []string{}
	for _, s := range sessionsOf(now).standing {
		if !before[s] {
			fresh = append(fresh, s)
		}
	}
	return Reopened{File: file, RejectedIn: sha, Reopened: len(fresh) > 0, NewOccurrences: fresh}, nil
}
