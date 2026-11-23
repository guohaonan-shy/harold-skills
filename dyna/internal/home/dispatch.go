package home

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// ---------- DISPATCH.md: the device's dispatch table ----------
//
// ~/home/DISPATCH.md is two tables and a line:
//
//	| 时段 | 派什么 | 每轮最多新开 |         when to hand out what, and how many sessions a round may open
//	| 状态 | 同时开着最多 |                  how many sessions each state may have open at once
//	不调度的项目：Foo, bar                  projects the dispatch leaves alone
//
// A table that is not written, and a file that does not exist, read as the defaults.

// DispatchFile is the file's name in home.
const DispatchFile = "DISPATCH.md"

// Dispatches are what the dispatch loop hands out in a period: a triage session or a todo one.
var Dispatches = []string{"triage", "todo"}

// Sections are the sidebar sections the dispatch counts open sessions in: one per state with a cap.
var Sections = []string{"triage", "in-progress", "in-review"}

// Period is one row of the period table.
type Period struct {
	Start    string `json:"start"`
	End      string `json:"end"`
	Dispatch string `json:"dispatch"`
	PerRound int    `json:"perRound"`
}

// Caps is how many sessions each state may have open at once; nil is「不设」.
type Caps struct {
	Triage     *int `json:"triage"`
	InProgress *int `json:"in-progress"`
	InReview   *int `json:"in-review"`
}

func (c *Caps) slot(state string) **int {
	switch state {
	case "triage":
		return &c.Triage
	case "in-progress":
		return &c.InProgress
	case "in-review":
		return &c.InReview
	}
	return nil
}

// Schedule is what DISPATCH.md says.
type Schedule struct {
	Periods []Period
	Caps    Caps
	Skip    []string
}

func intPtr(n int) *int { return &n }

// DefaultSchedule is what a device with no DISPATCH.md runs on: triage by day (3 a round), todo by night (1 a round,
// the human's decision of 2026-11-22), nothing in between;
// at most 6 triage sessions open, no cap on the other two; every project dispatched.
func DefaultSchedule() Schedule {
	return Schedule{Periods: defaultPeriods(), Caps: defaultCaps(), Skip: []string{}}
}

func defaultPeriods() []Period {
	return []Period{
		{"09:00", "19:00", "triage", 3},
		{"22:00", "08:00", "todo", 1},
	}
}

func defaultCaps() Caps { return Caps{Triage: intPtr(6)} }

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
	skipRe  = regexp.MustCompile(`^\s*不调度的项目\s*[:：]\s*(.*?)\s*$`)
	namesRe = regexp.MustCompile(`[,，、]`)
)

func cells(line string) []string {
	line = strings.TrimSpace(line)
	line = strings.TrimPrefix(line, "|")
	line = strings.TrimSuffix(line, "|")
	parts := strings.Split(line, "|")
	for i, p := range parts {
		parts[i] = strings.ReplaceAll(strings.TrimSpace(p), "`", "")
	}
	return parts
}

const (
	periodsHeader = "时段 | 派什么 | 每轮最多新开"
	capsHeader    = "状态 | 同时开着最多"
)

type tableRow struct {
	no   int
	line string
}

// ParseDispatch reads DISPATCH.md. The period table's header starts with 时段, the cap table's with 状态; each row
// of the first is `开始–结束 | triage 或 todo | 每轮最多新开`, each row of the second `状态 | 正整数或「不设」`
// (further columns are notes), and `不调度的项目：<名字，逗号分隔>` is the third. Text around them is ignored. A
// table that is missing reads as its default; a state the cap table leaves out keeps its default cap. A row that
// does not read is an error naming its line in the file, the cell, and how to write it.
func ParseDispatch(md string) (Schedule, error) {
	out := DefaultSchedule()
	lines := strings.Split(md, "\n")
	var seenPeriods, seenCaps, seenSkip int
	for i := 0; i < len(lines); i++ {
		if m := skipRe.FindStringSubmatch(lines[i]); m != nil {
			if seenSkip > 0 {
				return Schedule{}, rowErr(tableRow{i + 1, strings.TrimSpace(lines[i])}, 0, "", fmt.Sprintf("「不调度的项目」写了两行（第 %d 行已有一行），合成一行，名字用逗号分隔", seenSkip))
			}
			seenSkip = i + 1
			out.Skip = []string{}
			for _, n := range namesRe.Split(strings.ReplaceAll(m[1], "`", ""), -1) {
				if n = strings.TrimSpace(n); n != "" {
					out.Skip = append(out.Skip, n)
				}
			}
			continue
		}
		if !rowRe.MatchString(lines[i]) {
			continue
		}
		var rows []tableRow
		for ; i < len(lines) && rowRe.MatchString(lines[i]); i++ {
			rows = append(rows, tableRow{i + 1, strings.TrimSpace(lines[i])})
		}
		i--
		head := cells(rows[0].line)
		switch head[0] {
		case "时段":
			if seenPeriods > 0 {
				return Schedule{}, rowErr(rows[0], 1, "表头", fmt.Sprintf("时段表写了两张（第 %d 行已有一张），合成一张", seenPeriods))
			}
			seenPeriods = rows[0].no
			data, err := tableData(rows, len(head), 3, periodsHeader, "时段")
			if err != nil {
				return Schedule{}, err
			}
			if out.Periods, err = parsePeriods(data); err != nil {
				return Schedule{}, err
			}
		case "状态":
			if seenCaps > 0 {
				return Schedule{}, rowErr(rows[0], 1, "表头", fmt.Sprintf("状态表写了两张（第 %d 行已有一张），合成一张", seenCaps))
			}
			seenCaps = rows[0].no
			data, err := tableData(rows, len(head), 2, capsHeader, "状态")
			if err != nil {
				return Schedule{}, err
			}
			if err := parseCaps(data, &out.Caps); err != nil {
				return Schedule{}, err
			}
		default:
			return Schedule{}, rowErr(rows[0], 1, "表头", fmt.Sprintf("读不出这张表：时段表的表头写「%s」，状态表的表头写「%s」", periodsHeader, capsHeader))
		}
	}
	return out, nil
}

func rowErr(r tableRow, cell int, name, how string) error {
	where := fmt.Sprintf("%s 第 %d 行", DispatchFile, r.no)
	if cell > 0 {
		where += fmt.Sprintf("第 %d 格（%s）", cell, name)
	}
	return fmt.Errorf("%s：%s：%s", where, how, r.line)
}

// tableData checks the header's width and the separator line under it, and gives the rows below.
func tableData(rows []tableRow, width, want int, header, name string) ([]tableRow, error) {
	if width < want {
		return nil, rowErr(rows[0], 0, "", fmt.Sprintf("%s表的表头要写成「%s」", name, header))
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
		return nil, rowErr(rows[0], 0, "", "表头下面要有分隔行（|---|---|---|）")
	}
	if len(rows) == 2 {
		return nil, rowErr(rows[0], 0, "", fmt.Sprintf("%s表没有数据行，表头是「%s」", name, header))
	}
	return rows[2:], nil
}

func parsePeriods(data []tableRow) ([]Period, error) {
	var out []Period
	for _, r := range data {
		c := cells(r.line)
		if len(c) < 3 {
			return nil, rowErr(r, 0, "", "时段表要三列：开始–结束、派什么、每轮最多新开")
		}
		ends := rangeRe.Split(c[0], -1)
		if len(ends) != 2 {
			return nil, rowErr(r, 1, "时段", fmt.Sprintf("「%s」要写成 开始–结束，例如 09:00–19:00", c[0]))
		}
		from, ok1 := minutesOf(ends[0])
		to, ok2 := minutesOf(ends[1])
		if !ok1 || !ok2 {
			return nil, rowErr(r, 1, "时段", fmt.Sprintf("「%s」里有不是时刻的（要 HH:MM，00:00 到 23:59）", c[0]))
		}
		if from == to {
			return nil, rowErr(r, 1, "时段", fmt.Sprintf("「%s」开始和结束是同一时刻", c[0]))
		}
		if !contains(Dispatches, c[1]) {
			return nil, rowErr(r, 2, "派什么", fmt.Sprintf("要写 %s，不是「%s」", strings.Join(Dispatches, " 或 "), c[1]))
		}
		n, _ := strconv.Atoi(c[2])
		if !posInt.MatchString(c[2]) || n < 1 {
			return nil, rowErr(r, 3, "每轮最多新开", fmt.Sprintf("要写正整数，不是「%s」", c[2]))
		}
		out = append(out, Period{clock(from), clock(to), c[1], n})
	}
	return out, nil
}

func parseCaps(data []tableRow, caps *Caps) error {
	seen := map[string]int{}
	for _, r := range data {
		c := cells(r.line)
		if len(c) < 2 {
			return rowErr(r, 0, "", "状态表要两列：状态、同时开着最多")
		}
		slot := caps.slot(c[0])
		if slot == nil {
			return rowErr(r, 1, "状态", fmt.Sprintf("要写 %s，不是「%s」", strings.Join(Sections, "、"), c[0]))
		}
		if first, dup := seen[c[0]]; dup {
			return rowErr(r, 1, "状态", fmt.Sprintf("「%s」写了两行（第 %d 行已有一行）", c[0], first))
		}
		seen[c[0]] = r.no
		if c[1] == "不设" {
			*slot = nil
			continue
		}
		n, _ := strconv.Atoi(c[1])
		if !posInt.MatchString(c[1]) || n < 1 {
			return rowErr(r, 2, "同时开着最多", fmt.Sprintf("要写正整数或「不设」，不是「%s」", c[1]))
		}
		*slot = intPtr(n)
	}
	return nil
}

func contains(list []string, s string) bool {
	for _, x := range list {
		if x == s {
			return true
		}
	}
	return false
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

// Dispatched is what `home dispatch` prints.
type Dispatched struct {
	At       string   `json:"at"`
	Period   *Span    `json:"period"`
	Dispatch *string  `json:"dispatch"`
	PerRound int      `json:"perRound"`
	Caps     Caps     `json:"caps"`
	Skip     []string `json:"skip"`
	Periods  []Period `json:"periods"`
	Sections []string `json:"sections"`
}

// ReadDispatch is what the dispatch loop reads from one place, for the moment at (`HH:MM`; the clock now when
// nil): the period that moment is in (null in a gap), what to hand out in it and how many sessions a round may
// open (0 in a gap), the cap of each state, the projects to leave alone, the whole period table, and the sidebar
// sections. md is DISPATCH.md ("" when there is none).
func ReadDispatch(md string, at *string, now time.Time) (Dispatched, error) {
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
	s, err := ParseDispatch(md)
	if err != nil {
		return Dispatched{}, err
	}
	out := Dispatched{At: clock(minutes), Caps: s.Caps, Skip: s.Skip, Periods: s.Periods, Sections: append([]string{}, Sections...)}
	if p := periodAt(s.Periods, minutes); p != nil {
		out.Period = &Span{p.Start, p.End}
		d := p.Dispatch
		out.Dispatch = &d
		out.PerRound = p.PerRound
	}
	return out, nil
}

// ReadDispatchFile reads home's DISPATCH.md; a device without one gets "" and so the defaults.
func ReadDispatchFile(env Env) (string, error) {
	path := filepath.Join(Dir(env), DispatchFile)
	b, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return "", nil
		}
		return "", fmt.Errorf("读不了 %s：%v", path, err)
	}
	return string(b), nil
}
