package seo

import (
	"bytes"
	"fmt"
	"regexp"
	"strings"
	"time"
)

// Cadence is the days between runs of each direction, counted in calendar dates (the log's dates): a run last
// collected 7 dates ago is due, 6 is not. It is the plugin's, not the project's: SEO.md has no schedule in it.
var Cadence = map[string]float64{"technical": 7, "pages": 7, "keywords": 7, "backlinks": 7, "geo": 7, "results": 3}

// LastRuns is the date each direction last ran, in the order of ScanDirections; "" is never.
type LastRuns struct{ vals map[string]string }

// Get is the date of a direction's last run, "" when it never ran.
func (l LastRuns) Get(d string) string { return l.vals[d] }

// MarshalJSON writes every scan direction, null for one that never ran.
func (l LastRuns) MarshalJSON() ([]byte, error) {
	var b bytes.Buffer
	b.WriteByte('{')
	for i, d := range ScanDirections {
		if i > 0 {
			b.WriteByte(',')
		}
		k, _ := marshalPlain(d)
		b.Write(k)
		b.WriteByte(':')
		if v := l.vals[d]; v == "" {
			b.WriteString("null")
		} else {
			vb, _ := marshalPlain(v)
			b.Write(vb)
		}
	}
	b.WriteByte('}')
	return b.Bytes(), nil
}

var (
	scanHeadRe  = regexp.MustCompile(`^seo-scan (\d{4}-\d{2}-\d{2})`)
	collectedRe = regexp.MustCompile(`([a-z]+) \d+ 条`)
)

// LastRunsOf reads when each direction last ran from OpenSEO's research log, where every scan leaves one entry: its
// first line is `seo-scan <YYYY-MM-DD HH:MM>，方向：…`, its second `采集：<direction> <N> 条；…`. A direction counts as
// run only when it was collected: one skipped for budget or with its data source down is due again on the next run.
func LastRunsOf(log []any) LastRuns {
	l := LastRuns{vals: map[string]string{}}
	for _, entry := range log {
		summary := orEmpty(get(entry, "summary"))
		head := scanHeadRe.FindStringSubmatch(summary)
		if head == nil {
			continue
		}
		collected := ""
		for _, line := range strings.Split(summary, "\n") {
			if strings.HasPrefix(line, "采集：") {
				collected = line
				break
			}
		}
		for _, m := range collectedRe.FindAllStringSubmatch(collected, -1) {
			if contains(ScanDirections, m[1]) && (l.vals[m[1]] == "" || head[1] > l.vals[m[1]]) {
				l.vals[m[1]] = head[1]
			}
		}
	}
	return l
}

var looseDayRe = regexp.MustCompile(`^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$`)

// dayOf is Date.parse(`${s}T00:00:00Z`) in ms: the date as YYYY-MM-DD, or a year and month alone (the first of it).
func dayOf(s string) (float64, bool) {
	m := looseDayRe.FindStringSubmatch(s)
	if m == nil {
		return 0, false
	}
	mo, d := 1, 1
	if m[2] != "" {
		mo = atoi(m[2])
	}
	if m[3] != "" {
		d = atoi(m[3])
	}
	if mo < 1 || mo > 12 || d < 1 || d > 31 {
		return 0, false
	}
	return float64(time.Date(atoi(m[1]), time.Month(mo), d, 0, 0, 0, 0, time.UTC).UnixMilli()), true
}

// DuePlan is which directions a scan run without arguments should take, and when each last ran.
type DuePlan struct {
	Due  []string `json:"due"`
	Last LastRuns `json:"last"`
}

// Due says which directions are due on today: `results` (the effect report) every 3 days, the other five every 7.
// The context only holds the recent log, so a direction whose last entry fell off it reads as never run, which at
// worst runs it a little early.
func Due(context any, today string) (*DuePlan, error) {
	todayMs, ok := dayOf(today)
	if !ok {
		return nil, fmt.Errorf("「%s」不是 YYYY-MM-DD", today)
	}
	entries, err := arrayOf(get(context, "researchLog"), "researchLog")
	if err != nil {
		return nil, err
	}
	last := LastRunsOf(entries)
	out := []string{}
	for _, d := range ScanDirections {
		prev := last.Get(d)
		if prev == "" {
			out = append(out, d)
			continue
		}
		prevMs, _ := dayOf(prev)
		if (todayMs-prevMs)/dayMs >= Cadence[d] {
			out = append(out, d)
		}
	}
	return &DuePlan{Due: out, Last: last}, nil
}
