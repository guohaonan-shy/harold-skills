package home

import (
	"encoding/json"
	"fmt"
	"reflect"
	"strings"
	"testing"
	"time"
)

// The period tests moved here from `issues queues` (internal/issues/schedule_test.go) when the table moved from the
// project's ISSUE_TRACKER.md to home's DISPATCH.md; the cases are the same, the table now reads
// `时段 | 派什么 | 每轮最多新开`.

var time0 = time.Date(2026, 11, 18, 12, 0, 0, 0, time.Local)

func ptr(s string) *string { return &s }

func periodsMD(rows ...string) string {
	return "# 调度表\n\n这张表给调度读：每一行是一个时段。\n\n| 时段 | 派什么 | 每轮最多新开 |\n|---|---|---|\n" +
		strings.Join(rows, "\n") + "\n\n## 其他\n\n别的说明。\n"
}

func picks(t *testing.T, md, at string) (string, int) {
	t.Helper()
	q, err := ReadDispatch(md, ptr(at), time0)
	if err != nil {
		t.Fatalf("%s: %v", at, err)
	}
	d := "<none>"
	if q.Dispatch != nil {
		d = *q.Dispatch
	}
	return d, q.PerRound
}

func TestDispatchDefaultsWhenThereIsNoFileOrNoTable(t *testing.T) {
	for _, md := range []string{"", "# 调度表\n\n什么表都没写。\n"} {
		for at, want := range map[string]string{"23:30": "todo 1", "10:00": "triage 3", "20:00": "<none> 0", "08:30": "<none> 0"} {
			d, n := picks(t, md, at)
			if got := fmt.Sprint(d, " ", n); got != want {
				t.Errorf("%s: %s want %s", at, got, want)
			}
		}
	}
}

func TestDispatchPeriodsAreLeftClosedRightOpenAndCrossMidnight(t *testing.T) {
	for at, want := range map[string]string{
		"22:00": "todo 1", "21:59": "<none> 0", "08:00": "<none> 0", "07:59": "todo 1", "09:00": "triage 3",
		"19:00": "<none> 0", "18:59": "triage 3", "00:00": "todo 1", "8:05": "<none> 0",
	} {
		d, n := picks(t, "", at)
		if got := fmt.Sprint(d, " ", n); got != want {
			t.Errorf("%s: %s want %s", at, got, want)
		}
	}
}

func TestDispatchOutputHasTheWholeTableTheCapsAndTheSections(t *testing.T) {
	q, err := ReadDispatch("", ptr("23:30"), time0)
	if err != nil {
		t.Fatal(err)
	}
	if q.At != "23:30" || q.Period == nil || *q.Period != (Span{"22:00", "08:00"}) || *q.Dispatch != "todo" || q.PerRound != 1 {
		t.Fatalf("%+v", q)
	}
	if !reflect.DeepEqual(q.Periods, defaultPeriods()) || !reflect.DeepEqual(q.Sections, []string{"triage", "in-progress", "in-review"}) {
		t.Fatalf("%+v", q)
	}
	if q.Caps.Triage == nil || *q.Caps.Triage != 6 || q.Caps.InProgress != nil || q.Caps.InReview != nil || q.Skip == nil || len(q.Skip) != 0 {
		t.Fatalf("%+v", q)
	}
	idle, _ := ReadDispatch("", ptr("20:00"), time0)
	if idle.Period != nil || idle.Dispatch != nil || idle.PerRound != 0 || len(idle.Periods) != 2 {
		t.Fatalf("%+v", idle)
	}
	raw, _ := json.Marshal(idle)
	for _, want := range []string{`"period":null`, `"dispatch":null`, `"perRound":0`, `"caps":{"triage":6,"in-progress":null,"in-review":null}`, `"skip":[]`} {
		if !strings.Contains(string(raw), want) {
			t.Errorf("%s not in %s", want, raw)
		}
	}
	for _, gone := range []string{`"limit"`, `"cap"`} {
		if strings.Contains(string(raw), gone) {
			t.Errorf("%s in the output", gone)
		}
	}
}

func TestDispatchFollowsAWrittenTableOnly(t *testing.T) {
	md := periodsMD("| 10:00–12:00 | triage | 2 |")
	for at, want := range map[string]string{"11:00": "triage 2", "13:00": "<none> 0", "23:30": "<none> 0"} {
		d, n := picks(t, md, at)
		if got := fmt.Sprint(d, " ", n); got != want {
			t.Errorf("%s: %s want %s", at, got, want)
		}
	}
	q, _ := ReadDispatch(md, ptr("11:00"), time0)
	if !reflect.DeepEqual(q.Periods, []Period{{"10:00", "12:00", "triage", 2}}) || *q.Period != (Span{"10:00", "12:00"}) {
		t.Fatalf("%+v", q)
	}
	// the cap table was not written: the default caps
	if q.Caps.Triage == nil || *q.Caps.Triage != 6 {
		t.Fatalf("%+v", q.Caps)
	}
}

func TestDispatchReadsHyphensBackticksExtraColumnsFirstRowWins(t *testing.T) {
	md := periodsMD("| 6:30 - 12:00 | `todo` | 4 | 备注 |", "| 11:00–13:00 | triage | 1 |", "| 23:00—01:00 | todo | 2 |")
	for at, want := range map[string]string{"06:30": "todo 4", "11:30": "todo 4", "12:30": "triage 1", "00:30": "todo 2"} {
		d, n := picks(t, md, at)
		if got := fmt.Sprint(d, " ", n); got != want {
			t.Errorf("%s: %s want %s", at, got, want)
		}
	}
}

func TestDispatchRefusesABrokenPeriodRowNamingTheLineTheCellAndHowToWriteIt(t *testing.T) {
	bad := map[string][2]string{ // row -> the cell it names, a word of the advice
		"| 25:00–08:00 | todo | 3 |":     {"第 1 格（时段）", "25:00"},
		"| 09:00–19:61 | triage | 3 |":   {"第 1 格（时段）", "19:61"},
		"| 09:00–19:00 | review | 3 |":   {"第 2 格（派什么）", "triage 或 todo"},
		"| 09:00–19:00 | done | 3 |":     {"第 2 格（派什么）", "done"},
		"| 09:00–19:00 | triage | 0 |":   {"第 3 格（每轮最多新开）", "正整数"},
		"| 09:00–19:00 | triage | abc |": {"第 3 格（每轮最多新开）", "abc"},
		"| 09:00–19:00 | triage | -2 |":  {"第 3 格（每轮最多新开）", "-2"},
		"| 09:00–19:00 | triage | 2.5 |": {"第 3 格（每轮最多新开）", "2.5"},
		"| 09:00 | triage | 3 |":         {"第 1 格（时段）", "开始–结束"},
		"| 09:00–09:00 | triage | 3 |":   {"第 1 格（时段）", "同一时刻"},
		"| 09:00–19:00 | triage |":       {"三列", "每轮最多新开"},
	}
	for row, want := range bad {
		md := periodsMD("| 01:00–02:00 | todo | 1 |", row)
		line := 0
		for i, l := range strings.Split(md, "\n") {
			if l == row {
				line = i + 1
			}
		}
		_, err := ReadDispatch(md, ptr("10:00"), time0)
		if err == nil {
			t.Errorf("%s: accepted", row)
			continue
		}
		m := err.Error()
		for _, must := range []string{"DISPATCH.md", fmt.Sprintf("第 %d 行", line), want[0], want[1], row} {
			if !strings.Contains(m, must) {
				t.Errorf("%s: the error lacks %q: %s", row, must, m)
			}
		}
	}
}

func TestDispatchRefusesATableWithoutRowsOrWithoutASeparator(t *testing.T) {
	for md, want := range map[string]string{
		periodsMD(): "没有数据行",
		"| 时段 | 派什么 | 每轮最多新开 |\n| 09:00–19:00 | triage | 3 |\n":                "分隔行",
		"| 时段 | 派什么 |\n|---|---|\n| 09:00–19:00 | triage |\n":                  "表头要写成",
		"| 状态 | 同时开着最多 |\n|---|---|\n":                                         "没有数据行",
		"| 时间 | 派什么 | 每轮最多新开 |\n|---|---|---|\n| 09:00–19:00 | triage | 3 |\n": "表头",
	} {
		_, err := ParseDispatch(md)
		if err == nil || !strings.Contains(err.Error(), want) || !strings.Contains(err.Error(), "DISPATCH.md 第 ") {
			t.Errorf("%q: %v (want %s)", md, err, want)
		}
	}
	two := periodsMD("| 09:00–19:00 | triage | 3 |") + "\n" + periodsMD("| 22:00–08:00 | todo | 3 |")
	if _, err := ParseDispatch(two); err == nil || !strings.Contains(err.Error(), "两张") {
		t.Fatal(err)
	}
}

func TestDispatchAtMustBeHHMM(t *testing.T) {
	for _, at := range []string{"25:00", "abc", "10:60", "1000", "10:5", "-1:00", "10:00:00", ""} {
		if _, err := ReadDispatch("", ptr(at), time0); err == nil || !strings.Contains(err.Error(), "--at") {
			t.Errorf("%q: %v", at, err)
		}
	}
}

func TestDispatchWithoutAtReadsTheClock(t *testing.T) {
	q, _ := ReadDispatch("", nil, time.Date(2026, 11, 18, 23, 30, 0, 0, time.Local))
	if *q.Dispatch != "todo" {
		t.Fatal(q)
	}
	q, _ = ReadDispatch("", nil, time.Date(2026, 11, 18, 7, 5, 0, 0, time.Local))
	if q.At != "07:05" {
		t.Fatal(q.At)
	}
}

const capsAndSkipMD = `# 调度表

| 状态 | 同时开着最多 |
|---|---|
| triage | 6 |
| in-progress | 4 |
| in-review | 不设 |

不调度的项目：Foo, bar
`

func TestDispatchReadsTheCapTableAndTheSkipLine(t *testing.T) {
	q, err := ReadDispatch(capsAndSkipMD, ptr("10:00"), time0)
	if err != nil {
		t.Fatal(err)
	}
	if *q.Caps.Triage != 6 || *q.Caps.InProgress != 4 || q.Caps.InReview != nil || !reflect.DeepEqual(q.Skip, []string{"Foo", "bar"}) {
		t.Fatalf("%+v %v", q.Caps, q.Skip)
	}
	// the period table was not written: the defaults
	if !reflect.DeepEqual(q.Periods, defaultPeriods()) {
		t.Fatal(q.Periods)
	}
	raw, _ := json.Marshal(q)
	if !strings.Contains(string(raw), `"caps":{"triage":6,"in-progress":4,"in-review":null}`) || !strings.Contains(string(raw), `"skip":["Foo","bar"]`) {
		t.Fatal(string(raw))
	}
}

func TestDispatchCapTableOnlyChangesTheStatesItNamesAndSetsTheOthersByDefault(t *testing.T) {
	q, err := ReadDispatch("| 状态 | 同时开着最多 |\n|---|---|\n| in-progress | 4 |\n| triage | 不设 |\n", ptr("10:00"), time0)
	if err != nil {
		t.Fatal(err)
	}
	if q.Caps.Triage != nil || *q.Caps.InProgress != 4 || q.Caps.InReview != nil {
		t.Fatalf("%+v", q.Caps)
	}
	q, _ = ReadDispatch("| 状态 | 同时开着最多 |\n|---|---|\n| in-progress | 4 |\n", ptr("10:00"), time0)
	if *q.Caps.Triage != 6 {
		t.Fatalf("a state the table leaves out keeps its default cap: %+v", q.Caps)
	}
}

func TestDispatchSkipLineSpellings(t *testing.T) {
	for md, want := range map[string][]string{
		"不调度的项目：":                 {},
		"不调度的项目:  ":               {},
		"不调度的项目：Foo":              {"Foo"},
		"不调度的项目：Foo，bar、baz, qux": {"Foo", "bar", "baz", "qux"},
		"  不调度的项目：Foo,":           {"Foo"},
		"没有这一行":                   {},
	} {
		s, err := ParseDispatch(md)
		if err != nil || !reflect.DeepEqual(s.Skip, want) {
			t.Errorf("%q: %v %v want %v", md, s.Skip, err, want)
		}
	}
	if _, err := ParseDispatch("不调度的项目：a\n不调度的项目：b\n"); err == nil || !strings.Contains(err.Error(), "第 2 行") {
		t.Fatal(err)
	}
}

func TestDispatchRefusesABrokenCapRowNamingTheLineTheCellAndHowToWriteIt(t *testing.T) {
	bad := map[string][2]string{
		"| nap | 3 |":          {"第 1 格（状态）", "triage、in-progress、in-review"},
		"| in-progress | 0 |":  {"第 2 格（同时开着最多）", "正整数或「不设」"},
		"| in-progress | -1 |": {"第 2 格（同时开着最多）", "-1"},
		"| in-progress | 几个 |": {"第 2 格（同时开着最多）", "几个"},
		"| in-progress |":      {"两列", "同时开着最多"},
		"| triage | 5 |":       {"写了两行", "第 5 行"},
	}
	for row, want := range bad {
		md := "# 调度表\n\n| 状态 | 同时开着最多 |\n|---|---|\n| triage | 6 |\n" + row + "\n"
		_, err := ParseDispatch(md)
		if err == nil {
			t.Errorf("%s: accepted", row)
			continue
		}
		for _, must := range []string{"DISPATCH.md", "第 6 行", want[0], want[1], row} {
			if !strings.Contains(err.Error(), must) {
				t.Errorf("%s: the error lacks %q: %s", row, must, err)
			}
		}
	}
}

func TestDispatchSectionsAreTheOnesTheCapsAreWrittenFor(t *testing.T) {
	var c Caps
	for _, s := range Sections {
		if c.slot(s) == nil {
			t.Errorf("no cap slot for %s", s)
		}
	}
	if c.slot("todo") != nil {
		t.Fatal("todo has no cap")
	}
}
