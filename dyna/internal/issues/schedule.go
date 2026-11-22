package issues

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// ---------- dispatch periods (ISSUE_TRACKER.md「调度」) ----------

// Dispatches are what the dispatch loop hands out in a period: a triage session or a todo one.
var Dispatches = []string{"triage", "todo"}

// PeriodsHeading is the section of ISSUE_TRACKER.md that holds the table.
const PeriodsHeading = "调度"

// Period is one row of the table.
type Period struct {
	Start    string `json:"start"`
	End      string `json:"end"`
	Dispatch string `json:"dispatch"`
	Limit    int    `json:"limit"`
}

// DefaultPeriods are what a project that wrote no「调度」section runs on: triage by day, todo by night, nothing in between.
func DefaultPeriods() []Period {
	return []Period{
		{"09:00", "19:00", "triage", 3},
		{"22:00", "08:00", "todo", 1},
	}
}

var clockRe = regexp.MustCompile(`^(\d{1,2}):(\d{2})$`)

// minutesOf reads `H:MM` / `HH:MM` as minutes after midnight; false when it is no time of day.
func minutesOf(hhmm string) (int, bool) {
	m := clockRe.FindStringSubmatch(hhmm)
	if m == nil {
		return 0, false
	}
	h, _ := strconv.Atoi(m[1])
	mi, _ := strconv.Atoi(m[2])
	if h > 23 || mi > 59 {
		return 0, false
	}
	return h*60 + mi, true
}

func clock(min int) string { return fmt.Sprintf("%02d:%02d", min/60, min%60) }

var (
	rowRe   = regexp.MustCompile(`^\s*\|`)
	rangeRe = regexp.MustCompile(`\s*[–—-]\s*`)
	sepRe   = regexp.MustCompile(`^:?-{2,}:?$`)
	posInt  = regexp.MustCompile(`^\d+$`)
)

func cells(line string) []string {
	line = strings.TrimPrefix(line, "|")
	line = strings.TrimSuffix(line, "|")
	parts := strings.Split(line, "|")
	for i, p := range parts {
		parts[i] = strings.ReplaceAll(strings.TrimSpace(p), "`", "")
	}
	return parts
}

// ParsePeriods reads the periods in the「## 调度」section of ISSUE_TRACKER.md: one table row each,
// `开始–结束 | 派什么 | 上限` (the range may be joined by `–`, `—` or `-`; the middle cell is `triage` or `todo`;
// the limit a positive integer; further columns are notes). The text around the table is ignored. Nil when the
// section is missing; a row that does not read is an error naming its line in the file and quoting it.
func ParsePeriods(md string) ([]Period, error) {
	lines := strings.Split(md, "\n")
	start := -1
	for i, l := range lines {
		if strings.TrimSpace(l) == "## "+PeriodsHeading {
			start = i
			break
		}
	}
	if start < 0 {
		return nil, nil
	}
	type row struct {
		no   int
		line string
	}
	var rows []row
	for i := start + 1; i < len(lines); i++ {
		if hdrRe.MatchString(lines[i]) {
			break
		}
		if rowRe.MatchString(lines[i]) {
			rows = append(rows, row{i + 1, strings.TrimSpace(lines[i])})
		}
	}
	fail := func(r row, why string) error {
		return fmt.Errorf("ISSUE_TRACKER.md 第 %d 行（「%s」一节）：%s：%s", r.no, PeriodsHeading, why, r.line)
	}
	if len(rows) == 0 {
		return nil, fmt.Errorf("ISSUE_TRACKER.md 的「%s」一节没有表：每个时段一行，列是 开始–结束 | 派什么 | 上限", PeriodsHeading)
	}
	isSep := len(rows) >= 2
	if isSep {
		for _, c := range cells(rows[1].line) {
			if !sepRe.MatchString(c) {
				isSep = false
			}
		}
	}
	if !isSep {
		return nil, fail(rows[0], "表头下面要有分隔行（|---|---|---|）")
	}
	data := rows[2:]
	if len(data) == 0 {
		return nil, fmt.Errorf("ISSUE_TRACKER.md 的「%s」一节没有时段行：每个时段一行，列是 开始–结束 | 派什么 | 上限", PeriodsHeading)
	}
	var out []Period
	for _, r := range data {
		c := cells(r.line)
		if len(c) < 3 {
			return nil, fail(r, "要三列：开始–结束、派什么、上限")
		}
		rng, dispatch, limit := c[0], c[1], c[2]
		ends := rangeRe.Split(rng, -1)
		if len(ends) != 2 {
			return nil, fail(r, fmt.Sprintf("时段「%s」要写成 开始–结束，例如 09:00–19:00", rng))
		}
		from, ok1 := minutesOf(ends[0])
		to, ok2 := minutesOf(ends[1])
		if !ok1 || !ok2 {
			return nil, fail(r, fmt.Sprintf("「%s」里有不是时刻的（要 HH:MM，00:00 到 23:59）", rng))
		}
		if from == to {
			return nil, fail(r, fmt.Sprintf("「%s」开始和结束是同一时刻", rng))
		}
		if !contains(Dispatches, dispatch) {
			return nil, fail(r, fmt.Sprintf("派什么要写 %s，不是「%s」", strings.Join(Dispatches, " 或 "), dispatch))
		}
		n, _ := strconv.Atoi(limit)
		if !posInt.MatchString(limit) || n < 1 {
			return nil, fail(r, fmt.Sprintf("上限要是正整数，不是「%s」", limit))
		}
		out = append(out, Period{clock(from), clock(to), dispatch, n})
	}
	return out, nil
}

// periodAt is the first period that covers minutes after midnight. Left-closed, right-open; a period that starts
// after it ends crosses midnight.
func periodAt(periods []Period, minutes int) *Period {
	for i, p := range periods {
		from, _ := minutesOf(p.Start)
		to, _ := minutesOf(p.End)
		in := minutes >= from || minutes < to
		if from < to {
			in = minutes >= from && minutes < to
		}
		if in {
			return &periods[i]
		}
	}
	return nil
}

// Span is the start and end of the period a moment is in.
type Span struct {
	Start string `json:"start"`
	End   string `json:"end"`
}

// Dispatched is what `queues` prints.
type Dispatched struct {
	At       string   `json:"at"`
	Period   *Span    `json:"period"`
	Dispatch *string  `json:"dispatch"`
	Limit    int      `json:"limit"`
	Periods  []Period `json:"periods"`
	Sections []string `json:"sections"`
}

// Dispatch is what the dispatch loop reads from one place, for the moment at (`HH:MM`; the clock now when nil):
// the period that moment is in (null in a gap), what to hand out in it and how many sessions at most (0 in a gap),
// the whole table (the project's「调度」section, or the defaults), and the sidebar sections. md is the project's
// ISSUE_TRACKER.md.
func Dispatch(md string, at *string, now time.Time) (Dispatched, error) {
	var minutes int
	if at == nil {
		minutes = now.Hour()*60 + now.Minute()
	} else {
		m, ok := minutesOf(*at)
		if !ok {
			return Dispatched{}, fmt.Errorf("--at 要写成 HH:MM（00:00 到 23:59），不是「%s」", *at)
		}
		minutes = m
	}
	periods, err := ParsePeriods(md)
	if err != nil {
		return Dispatched{}, err
	}
	if periods == nil {
		periods = DefaultPeriods()
	}
	out := Dispatched{At: clock(minutes), Periods: periods, Sections: append([]string{}, Working...)}
	if p := periodAt(periods, minutes); p != nil {
		out.Period = &Span{p.Start, p.End}
		d := p.Dispatch
		out.Dispatch = &d
		out.Limit = p.Limit
	}
	return out, nil
}
