package seo

import (
	"bytes"
	"fmt"
	"math"
	"regexp"
	"sort"
	"strings"
	"time"
)

// Shares are the three parts the week's credits are split into, in the order they are printed.
var Shares = []string{"排名追踪", "扫描", "起草与验证"}

const (
	dayMs  = 86_400_000.0
	weekMs = 7 * dayMs
)

var (
	dateOnlyRe = regexp.MustCompile(`^(\d{4})-(\d{2})-(\d{2})$`)
	dateHeadRe = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}`)
	dateAnyRe  = regexp.MustCompile(`\d{4}-\d{2}-\d{2}`)
	spendRe    = regexp.MustCompile(`^花费：(\d[\d,]*)` + ws + `*credits`)
	shareRe    = regexp.MustCompile(`份：(排名追踪|扫描|起草与验证)`)
)

// dayStart is the start (UTC, in ms) of a YYYY-MM-DD the way JavaScript's Date.parse reads it: a day that is not in
// the month rolls over into the next one; a month past 12 or a day past 31 is no date.
func dayStart(s string) (float64, bool) {
	m := dateOnlyRe.FindStringSubmatch(s)
	if m == nil {
		return 0, false
	}
	y, mo, d := atoi(m[1]), atoi(m[2]), atoi(m[3])
	if mo < 1 || mo > 12 || d < 1 || d > 31 {
		return 0, false
	}
	return float64(time.Date(y, time.Month(mo), d, 0, 0, 0, 0, time.UTC).UnixMilli()), true
}

func atoi(s string) int {
	n := 0
	for _, c := range s {
		n = n*10 + int(c-'0')
	}
	return n
}

func toMs(s string) (float64, error) {
	ms, ok := dayStart(s)
	if !ok {
		return 0, fmt.Errorf("「%s」不是 YYYY-MM-DD", s)
	}
	return ms, nil
}

func toDay(ms float64) string { return time.UnixMilli(int64(ms)).UTC().Format("2006-01-02") }

// resetOn is the reset day of a month (month is zero-based and may run past 11 or below 0); a day past the month's
// end is its last day.
func resetOn(year, month, day int) float64 {
	a := time.Date(year, time.Month(month+1), day, 0, 0, 0, 0, time.UTC)
	b := time.Date(year, time.Month(month+2), 0, 0, 0, 0, 0, time.UTC)
	if b.Before(a) {
		a = b
	}
	return float64(a.UnixMilli())
}

// Period is one billing period: it starts on a reset day and ends (exclusive) on the next.
type Period struct {
	Start string `json:"start"`
	End   string `json:"end"`
}

// BillingPeriod is the billing period holding today.
func BillingPeriod(resetDay int, today string) (Period, error) {
	ms, err := toMs(today)
	if err != nil {
		return Period{}, err
	}
	t := time.UnixMilli(int64(ms)).UTC()
	start := resetOn(t.Year(), int(t.Month())-1, resetDay)
	if start > ms {
		start = resetOn(t.Year(), int(t.Month())-2, resetDay)
	}
	s := time.UnixMilli(int64(start)).UTC()
	return Period{Start: toDay(start), End: toDay(resetOn(s.Year(), int(s.Month()), resetDay))}, nil
}

// Spending is one `花费` line of the research log.
type Spending struct {
	Date    string
	Share   string
	Credits float64
}

// entryDate is the date of a research log entry: its entryDate, else the first date in its first line.
func entryDate(entry any, summary string) string {
	if d := orEmpty(get(entry, "entryDate")); dateHeadRe.MatchString(d) {
		return jsSlice(d, 0, 10)
	}
	first, _, _ := strings.Cut(summary, "\n")
	return dateAnyRe.FindString(first)
}

// Spendings is every `花费` line of the research log. `未知` and entries with no date count as nothing.
func Spendings(log []any) []Spending {
	out := []Spending{}
	for _, entry := range log {
		summary := orEmpty(get(entry, "summary"))
		date := entryDate(entry, summary)
		if date == "" {
			continue
		}
		for _, line := range strings.Split(summary, "\n") {
			m := spendRe.FindStringSubmatch(line)
			if m == nil {
				continue
			}
			share := "扫描"
			if s := shareRe.FindStringSubmatch(line); s != nil {
				share = s[1]
			}
			out = append(out, Spending{Date: date, Share: share, Credits: number(m[1])})
		}
	}
	return out
}

var strictDateRe = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)

func loggedSince(log []any) *string {
	var dates []string
	for _, e := range log {
		d := jsSlice(orEmpty(get(e, "entryDate")), 0, 10)
		if d == "" {
			first, _, _ := strings.Cut(orEmpty(get(e, "summary")), "\n")
			d = dateAnyRe.FindString(first)
		}
		if strictDateRe.MatchString(d) {
			dates = append(dates, d)
		}
	}
	if len(dates) == 0 {
		return nil
	}
	sort.Strings(dates)
	return &dates[0]
}

// Share is one part of the week's budget: what it is, what was spent from it, what is left.
type Share struct {
	Quota float64 `json:"quota"`
	Spent float64 `json:"spent"`
	Left  float64 `json:"left"`
}

// ShareBooks are the three shares by name.
type ShareBooks struct {
	Tracking Share `json:"排名追踪"`
	Scan     Share `json:"扫描"`
	Drafting Share `json:"起草与验证"`
}

// Week is this week's books.
type Week struct {
	Period      Period     `json:"period"`
	WeekStart   string     `json:"weekStart"`
	WeeksLeft   int        `json:"weeksLeft"`
	PeriodSpent float64    `json:"periodSpent"`
	Budget      float64    `json:"budget"`
	Shares      ShareBooks `json:"shares"`
	LogKnown    bool       `json:"logKnown"`
	LogSince    *string    `json:"logSince"`
	FloorRoom   float64    `json:"floorRoom"`

	allocation func(direction string) float64
}

func ceilDiv(n, d float64) float64 {
	c := math.Ceil(n / d)
	if c == 0 {
		return 0
	}
	return c
}

// weekOf is this week's books: the budget, its three shares (quota, spent, left) and what the period has spent.
func weekOf(o OpenSEO, log []any, today string, gateSpent float64, logKnown bool) (*Week, error) {
	if o.Monthly == nil || o.ResetDay == nil || o.Weekly == nil {
		return nil, fmt.Errorf("SEO.md「OpenSEO」没写「套餐额度」和「每周分配」：跑 `/idea-loop:seo-setup` 补上")
	}
	period, err := BillingPeriod(*o.ResetDay, today)
	if err != nil {
		return nil, err
	}
	startMs, _ := toMs(period.Start)
	endMs, _ := toMs(period.End)
	todayMs, _ := toMs(today)
	weekStart := startMs + math.Floor((todayMs-startMs)/weekMs)*weekMs
	weeksLeft := int(math.Ceil((endMs - weekStart) / weekMs))
	var spent []Spending
	for _, s := range Spendings(log) {
		if s.Date >= period.Start && s.Date < period.End {
			spent = append(spent, s)
		}
	}
	before, periodSpent := 0.0, 0.0
	weekDay := toDay(weekStart)
	for _, s := range spent {
		periodSpent += s.Credits
		if s.Date < weekDay {
			before += s.Credits
		}
	}
	budget := math.Max(0, ceilDiv(*o.Monthly-before, float64(weeksLeft)))
	w := o.Weekly
	alloc := map[string]float64{"排名追踪": w.Tracking, "扫描": w.Scan.Total(), "起草与验证": w.Drafting}
	total := alloc["排名追踪"] + alloc["扫描"] + alloc["起草与验证"]
	shares := map[string]Share{}
	for _, name := range Shares {
		quota := 0.0
		if total != 0 {
			quota = math.Floor(budget * alloc[name] / total)
		}
		used := 0.0
		for _, s := range spent {
			if s.Share == name && s.Date >= weekDay {
				used += s.Credits
			}
		}
		if name == "扫描" {
			used += gateSpent
		}
		shares[name] = Share{Quota: quota, Spent: used, Left: math.Max(0, quota-used)}
	}
	return &Week{
		Period:      period,
		WeekStart:   weekDay,
		WeeksLeft:   weeksLeft,
		PeriodSpent: periodSpent,
		Budget:      budget,
		Shares:      ShareBooks{Tracking: shares["排名追踪"], Scan: shares["扫描"], Drafting: shares["起草与验证"]},
		LogKnown:    logKnown,
		LogSince:    loggedSince(log),
		allocation: func(direction string) float64 {
			if total == 0 {
				return 0
			}
			return math.Floor(budget * w.Scan.Get(direction) / total)
		},
	}, nil
}

// Skipped is a direction that does not run this week, and why.
type Skipped struct {
	Direction string `json:"direction"`
	Reason    string `json:"reason"`
}

// Allowed is the credits each asked direction may spend, in the order they were asked.
type Allowed struct {
	Keys []string
	Vals map[string]float64
}

func (a *Allowed) set(k string, v float64) {
	if _, ok := a.Vals[k]; !ok {
		a.Keys = append(a.Keys, k)
	}
	a.Vals[k] = v
}

// MarshalJSON writes the directions in the order they were asked.
func (a *Allowed) MarshalJSON() ([]byte, error) {
	var b bytes.Buffer
	b.WriteByte('{')
	for i, k := range a.Keys {
		if i > 0 {
			b.WriteByte(',')
		}
		kb, _ := marshalPlain(k)
		b.Write(kb)
		b.WriteByte(':')
		b.WriteString(numText(a.Vals[k]))
	}
	b.WriteByte('}')
	return b.Bytes(), nil
}

// BudgetPlan is what the allocate command prints.
type BudgetPlan struct {
	Allow   *Allowed  `json:"allow"`
	Skipped []Skipped `json:"skipped"`
	Week    *Week     `json:"week"`
}

// BudgetOpts are the parts of a budget run that are not the SEO.md and the balance.
type BudgetOpts struct {
	Log      []any
	Today    string
	Spent    float64
	LogKnown bool
}

// PlanBudget is how many credits each direction of one scan run may spend this week.
func PlanBudget(o OpenSEO, balance float64, directions []string, opts BudgetOpts) (*BudgetPlan, error) {
	for _, d := range directions {
		if !contains(ScanDirections, d) {
			return nil, fmt.Errorf("不认识的方向「%s」（只认 %s）", d, strings.Join(ScanDirections, " / "))
		}
	}
	week, err := weekOf(o, opts.Log, opts.Today, opts.Spent, opts.LogKnown)
	if err != nil {
		return nil, err
	}
	if isFinite(balance) && o.Floor != nil {
		week.FloorRoom = math.Max(0, balance-*o.Floor)
	}
	out := &BudgetPlan{Allow: &Allowed{Vals: map[string]float64{}}, Skipped: []Skipped{}, Week: week}
	if !isFinite(balance) {
		for _, d := range directions {
			out.Allow.set(d, 0)
			out.Skipped = append(out.Skipped, Skipped{d, "读不到余额，只做免费调用"})
		}
		return out, nil
	}
	if o.Floor == nil {
		return nil, fmt.Errorf("SEO.md「OpenSEO」没写余额下限")
	}
	floor := *o.Floor
	if balance < floor {
		for _, d := range directions {
			out.Allow.set(d, 0)
			out.Skipped = append(out.Skipped, Skipped{d, fmt.Sprintf("余额 %s 低于下限 %s，只做免费调用", numText(balance), numText(floor))})
		}
		return out, nil
	}
	scanLeft := week.Shares.Scan.Left
	roomLeft := week.FloorRoom
	for _, d := range directions {
		want := week.allocation(d)
		out.Allow.set(d, 0)
		if o.Weekly.Scan.Get(d) == 0 {
			continue
		}
		if want == 0 {
			out.Skipped = append(out.Skipped, Skipped{d, fmt.Sprintf("本周预算 %s 已没有（套餐额度 %s，本账期已花 %s），本周不跑，只做免费调用", numText(week.Budget), numText(*o.Monthly), numText(week.PeriodSpent))})
			continue
		}
		if want > scanLeft {
			out.Skipped = append(out.Skipped, Skipped{d, fmt.Sprintf("预估 %s 超过扫描这一份本周剩余 %s（本周预算 %s，扫描份 %s），本周不跑，只做免费调用", numText(want), numText(scanLeft), numText(week.Budget), numText(week.Shares.Scan.Quota))})
			continue
		}
		got := math.Min(want, roomLeft)
		out.Allow.set(d, got)
		scanLeft -= got
		roomLeft -= got
		if got < want {
			out.Skipped = append(out.Skipped, Skipped{d, fmt.Sprintf("只放行 %s/%s（余额下限 %s）", numText(got), numText(want), numText(floor))})
		}
	}
	return out, nil
}
