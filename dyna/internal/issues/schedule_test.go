package issues

import (
	"fmt"
	"os"
	"reflect"
	"strings"
	"testing"
	"time"
)

var time0 = time.Date(2026, 11, 18, 12, 0, 0, 0, time.Local)

func ptr(s string) *string { return &s }

func schedule(rows ...string) string {
	return "# Issue tracker：GitHub\n\n## 状态\n\ntriage：用\n\n## 调度\n\n这张表给调度读：每一行是一个时段。\n\n| 时段 | 派什么 | 上限 |\n|---|---|---|\n" +
		strings.Join(rows, "\n") + "\n\n## 仓库\n\n| 仓库 | 本地路径 | 主分支 | 管什么 |\n|---|---|---|---|\n| `o/r` | . | main | 全部 |\n"
}

func picks(t *testing.T, md, at string) (string, int) {
	t.Helper()
	q, err := Dispatch(md, ptr(at), time0)
	if err != nil {
		t.Fatalf("%s: %v", at, err)
	}
	d := "<none>"
	if q.Dispatch != nil {
		d = *q.Dispatch
	}
	return d, q.Limit
}

func TestQueuesDefaults(t *testing.T) {
	for _, md := range []string{"", "# Issue tracker：GitHub\n\n## 仓库\n\n| 仓库 |\n|---|\n| `o/r` |\n"} {
		for at, want := range map[string]string{"23:30": "todo 3", "10:00": "triage 3", "20:00": "<none> 0", "08:30": "<none> 0"} {
			d, l := picks(t, md, at)
			if got := fmt.Sprint(d, " ", l); got != want {
				t.Errorf("%s: %s want %s", at, got, want)
			}
		}
	}
}

func TestQueuesPeriodsAreLeftClosedRightOpenAndCrossMidnight(t *testing.T) {
	for at, want := range map[string]string{
		"22:00": "todo 3", "21:59": "<none> 0", "08:00": "<none> 0", "07:59": "todo 3", "09:00": "triage 3",
		"19:00": "<none> 0", "18:59": "triage 3", "00:00": "todo 3", "8:05": "<none> 0",
	} {
		d, l := picks(t, "", at)
		if got := fmt.Sprint(d, " ", l); got != want {
			t.Errorf("%s: %s want %s", at, got, want)
		}
	}
}

func TestQueuesOutputHasTheWholeTableAndNoCap(t *testing.T) {
	q, err := Dispatch("", ptr("23:30"), time0)
	if err != nil {
		t.Fatal(err)
	}
	if q.At != "23:30" || q.Period == nil || *q.Period != (Span{"22:00", "08:00"}) || *q.Dispatch != "todo" || q.Limit != 3 {
		t.Fatalf("%+v", q)
	}
	if !reflect.DeepEqual(q.Periods, DefaultPeriods()) || !reflect.DeepEqual(q.Sections, []string{"triage", "in-progress", "in-review"}) {
		t.Fatalf("%+v", q)
	}
	idle, _ := Dispatch("", ptr("20:00"), time0)
	if idle.Period != nil || idle.Dispatch != nil || idle.Limit != 0 || len(idle.Periods) != 2 {
		t.Fatalf("%+v", idle)
	}
	json := Dump(q)
	for _, gone := range []string{"\"cap\"", "triageCap"} {
		if strings.Contains(json, gone) {
			t.Errorf("%s still in the output", gone)
		}
	}
	if !strings.Contains(Dump(idle), `"period": null`) || !strings.Contains(Dump(idle), `"dispatch": null`) {
		t.Fatal(Dump(idle))
	}
}

func TestQueuesFollowsAWrittenSectionOnly(t *testing.T) {
	md := schedule("| 10:00–12:00 | triage | 2 |")
	for at, want := range map[string]string{"11:00": "triage 2", "13:00": "<none> 0", "23:30": "<none> 0"} {
		d, l := picks(t, md, at)
		if got := fmt.Sprint(d, " ", l); got != want {
			t.Errorf("%s: %s want %s", at, got, want)
		}
	}
	q, _ := Dispatch(md, ptr("11:00"), time0)
	if !reflect.DeepEqual(q.Periods, []Period{{"10:00", "12:00", "triage", 2}}) || *q.Period != (Span{"10:00", "12:00"}) {
		t.Fatalf("%+v", q)
	}
}

func TestQueuesReadsHyphensBackticksExtraColumnsFirstRowWins(t *testing.T) {
	md := schedule("| 6:30 - 12:00 | `todo` | 4 | 备注 |", "| 11:00–13:00 | triage | 1 |", "| 23:00—01:00 | todo | 2 |")
	for at, want := range map[string]string{"06:30": "todo 4", "11:30": "todo 4", "12:30": "triage 1", "00:30": "todo 2"} {
		d, l := picks(t, md, at)
		if got := fmt.Sprint(d, " ", l); got != want {
			t.Errorf("%s: %s want %s", at, got, want)
		}
	}
}

func TestQueuesRefusesABrokenSectionNamingTheRow(t *testing.T) {
	bad := map[string]string{
		"| 25:00–08:00 | todo | 3 |":     "25:00",
		"| 09:00–19:61 | triage | 3 |":   "19:61",
		"| 09:00–19:00 | review | 3 |":   "review",
		"| 09:00–19:00 | triage | 0 |":   "| 09:00–19:00 | triage | 0 |",
		"| 09:00–19:00 | triage | abc |": "abc",
		"| 09:00–19:00 | triage | -2 |":  "-2",
		"| 09:00–19:00 | triage | 2.5 |": "2.5",
		"| 09:00 | triage | 3 |":         "| 09:00 | triage | 3 |",
		"| 09:00–09:00 | triage | 3 |":   "09:00–09:00",
		"| 09:00–19:00 | triage |":       "| 09:00–19:00 | triage |",
	}
	for row, why := range bad {
		_, err := Dispatch(schedule("| 01:00–02:00 | todo | 1 |", row), ptr("10:00"), time0)
		if err == nil {
			t.Errorf("%s: accepted", row)
			continue
		}
		m := err.Error()
		if !strings.Contains(m, "调度") || !strings.Contains(m, "第 ") || !strings.Contains(m, why) || !strings.Contains(m, row) {
			t.Errorf("%s: %s", row, m)
		}
	}
	// the line number is the line in ISSUE_TRACKER.md
	md := schedule("| 09:00–19:00 | triage | 3 |", "| 22:00–08:00 | nap | 3 |")
	line := 0
	for i, l := range strings.Split(md, "\n") {
		if strings.Contains(l, "nap") {
			line = i + 1
		}
	}
	if _, err := Dispatch(md, ptr("10:00"), time0); err == nil || !strings.Contains(err.Error(), fmt.Sprintf("第 %d 行", line)) {
		t.Fatal(err)
	}
	if _, err := Dispatch(schedule(), ptr("10:00"), time0); err == nil || !strings.Contains(err.Error(), "没有") {
		t.Fatal(err)
	}
	if _, err := ParsePeriods("## 调度\n\n| 时段 | 派什么 | 上限 |\n| 09:00–19:00 | triage | 3 |\n"); err == nil || !strings.Contains(err.Error(), "表头") {
		t.Fatal(err)
	}
}

func TestQueuesAtMustBeHHMM(t *testing.T) {
	for _, at := range []string{"25:00", "abc", "10:60", "1000", "10:5", "-1:00", "10:00:00", ""} {
		if _, err := Dispatch("", ptr(at), time0); err == nil || !strings.Contains(err.Error(), "--at") {
			t.Errorf("%q: %v", at, err)
		}
	}
}

func TestQueuesWithoutAtReadsTheClock(t *testing.T) {
	q, _ := Dispatch("", nil, time.Date(2026, 11, 18, 23, 30, 0, 0, time.Local))
	if *q.Dispatch != "todo" {
		t.Fatal(q)
	}
	q, _ = Dispatch("", nil, time.Date(2026, 11, 18, 7, 5, 0, 0, time.Local))
	if q.At != "07:05" {
		t.Fatal(q.At)
	}
}

func TestThisRepositorysTrackerReadsTriageByDayAndTodoByNightAndTheSetupTemplatesReadOutTheDefaults(t *testing.T) {
	for _, f := range []string{
		"../../../ISSUE_TRACKER.md",
		"../../../idea-loop/skills/engineering/setup/references/issue-tracker.md",
		"../../../idea-loop/skills/engineering/setup/references/issue-tracker-linear.md",
	} {
		b, err := os.ReadFile(f)
		if err != nil {
			t.Logf("skip %s: %v", f, err)
			continue
		}
		got, err := ParsePeriods(string(b))
		want := DefaultPeriods()
		if f == "../../../ISSUE_TRACKER.md" {
			// this repository sets its own limits; what it shares with the defaults is triage by day and todo by night
			for _, ps := range [][]Period{got, want} {
				for i := range ps {
					ps[i].Limit = 0
				}
			}
		}
		if err != nil || !reflect.DeepEqual(got, want) {
			t.Errorf("%s: %v %v", f, got, err)
		}
	}
}

func TestTheScheduleSectionDoesNotDisturbTheRestOfTheTracker(t *testing.T) {
	md := schedule("| 09:00–19:00 | triage | 3 |")
	if SkipsTriage(md) || !SkipsTriage(strings.Replace(md, "triage：用", "triage：跳过", 1)) || PlatformOf(md) != "github" {
		t.Fatal()
	}
}
