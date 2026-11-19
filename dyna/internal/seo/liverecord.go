package seo

import (
	"fmt"
	"regexp"
	"sort"
	"strings"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/issues"
)

// RollbackLine is the sentence in the body of every issue a failed check opened after a rollback. A change that is
// rolled back, redone and fails again points at something the change did not cause (a site that was `noindex` all
// along), so a failed check on an issue whose body carries it is rolled back too but goes to the human, not back to
// the queue.
const RollbackLine = "由上线自查回滚而来"

var (
	liveMarkerRe = regexp.MustCompile(`(?s)<!-- seo-live-check: (\{.*?\}) -->`)
	dateRe       = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)
)

// LiveRecord is what a passed post-deploy check leaves on its issue: the merge date, and for each URL its target word
// and the four results.
type LiveRecord struct {
	MergedOn string          `json:"mergedOn"`
	Pages    []LiveRecordRow `json:"pages"`
}

// LiveRecordRow is one URL of a record.
type LiveRecordRow struct {
	URL     string `json:"url"`
	Keyword any    `json:"keyword"`
	Status  bool   `json:"status"`
	Noindex bool   `json:"noindex"`
	Meta    bool   `json:"meta"`
	Sitemap bool   `json:"sitemap"`
}

func (r LiveRecordRow) ok(item string) bool {
	switch item {
	case "status":
		return r.Status
	case "noindex":
		return r.Noindex
	case "meta":
		return r.Meta
	}
	return r.Sitemap
}

// RecordOf is the record of a passed check result (the JSON the verify-live command printed).
func RecordOf(result any, mergedOn string) (*LiveRecord, error) {
	if get(result, "verdict") != "pass" {
		return nil, fmt.Errorf("只有全过的自查结果才留记录（未上线、失败的不是一次上线的改动）")
	}
	if !dateRe.MatchString(mergedOn) {
		return nil, fmt.Errorf("合并日期「%s」不是 YYYY-MM-DD", mergedOn)
	}
	pages, err := arrayOf(get(result, "pages"), "pages")
	if err != nil {
		return nil, err
	}
	rec := &LiveRecord{MergedOn: mergedOn, Pages: []LiveRecordRow{}}
	for _, p := range pages {
		row := LiveRecordRow{URL: orEmpty(get(p, "url")), Keyword: orNil(get(p, "keyword"))}
		for _, item := range LiveItems {
			it := get(p, item)
			if _, isObj := it.(*Obj); !isObj {
				return nil, fmt.Errorf("Cannot read properties of undefined (reading 'ok')")
			}
			ok := get(it, "ok") == true
			switch item {
			case "status":
				row.Status = ok
			case "noindex":
				row.Noindex = ok
			case "meta":
				row.Meta = ok
			case "sitemap":
				row.Sitemap = ok
			}
		}
		rec.Pages = append(rec.Pages, row)
	}
	return rec, nil
}

// Marker is the hidden comment that carries a record. Its JSON has `<` and `>` escaped, so no value (a target word
// with `-->` in it) can end the comment early.
func Marker(rec *LiveRecord) string {
	s := stringify(rec)
	s = strings.ReplaceAll(s, "<", "\\u003c")
	s = strings.ReplaceAll(s, ">", "\\u003e")
	return "<!-- seo-live-check: " + s + " -->"
}

// ParseMarkers is every record in a text, in order; markers that are not JSON are skipped.
func ParseMarkers(text string) []*Obj {
	var out []*Obj
	for _, m := range liveMarkerRe.FindAllStringSubmatch(text, -1) {
		v, err := ParseJSON([]byte(m[1]))
		if err != nil {
			continue
		}
		rec, ok := v.(*Obj)
		if !ok {
			continue
		}
		if _, isArr := rec.Get("pages").([]any); isArr {
			out = append(out, rec)
		}
	}
	return out
}

func cell(v any) string {
	s := strings.ReplaceAll(orEmpty(v), "|", `\|`)
	return strings.ReplaceAll(s, "\n", " ")
}

// LiveComment is the comment for a passed check: a table for a person, the marker for the scripts. pr is the merged
// PR's number as written on the command line ("" for none).
func LiveComment(result any, mergedOn, pr string) (string, error) {
	rec, err := RecordOf(result, mergedOn)
	if err != nil {
		return "", err
	}
	prText := ""
	if n := jsNumber(pr); pr != "" && isFinite(n) && n != 0 {
		prText = "，PR #" + numText(n)
	}
	lines := []string{
		fmt.Sprintf("上线自查：全过（%d 个网址，合并日 %s%s）", len(rec.Pages), mergedOn, prText),
		"",
		"| 网址 | 目标词 | 能打开 | 没有 noindex | title 与 description 同产物 | 在 sitemap 里 |",
		"|---|---|---|---|---|---|",
	}
	for _, p := range rec.Pages {
		var marks []string
		for _, item := range LiveItems {
			if p.ok(item) {
				marks = append(marks, "✓")
			} else {
				marks = append(marks, "✗")
			}
		}
		lines = append(lines, fmt.Sprintf("| %s | %s | %s |", cell(p.URL), cell(p.Keyword), strings.Join(marks, " | ")))
	}
	lines = append(lines, "", Marker(rec))
	return strings.Join(lines, "\n"), nil
}

// LiveChanges lists the changes recorded in issues' comments, one row per URL. since keeps the changes merged on or
// after that day.
func LiveChanges(issueRows []IssueWithComments, since string) []*Obj {
	rows := []*Obj{}
	for _, issue := range issueRows {
		for _, body := range issue.Comments {
			for _, rec := range ParseMarkers(body) {
				if since != "" && toString(rec.Get("mergedOn")) < since {
					continue
				}
				for _, p := range rec.Get("pages").([]any) {
					row := NewObj()
					row.Set("issue", float64(issue.Number))
					row.Set("title", issue.Title)
					row.Set("url", get(p, "url"))
					row.Set("keyword", orNil(get(p, "keyword")))
					row.Set("mergedOn", rec.Get("mergedOn"))
					for _, item := range LiveItems {
						row.Set(item, get(p, item))
					}
					rows = append(rows, row)
				}
			}
		}
	}
	return rows
}

// IssueWithComments is a closed issue and the text of its comments.
type IssueWithComments struct {
	Number   int
	Title    string
	Comments []string
}

// ClosedSeoIssues is the closed `type:seo` issues with their comments, oldest first.
func ClosedSeoIssues(gh issues.GH) ([]IssueWithComments, error) {
	out, err := gh([]string{"issue", "list", "--state", "closed", "--label", "type:seo", "--limit", "1000", "--json", "number,title,comments"})
	if err != nil {
		return nil, err
	}
	v, err := ParseJSON([]byte(out))
	if err != nil {
		return nil, fmt.Errorf("gh 的回答读不懂：%v", err)
	}
	rows, err := arrayOf(v, "issue list")
	if err != nil {
		return nil, err
	}
	res := []IssueWithComments{}
	for _, r := range rows {
		n, _ := get(r, "number").(float64)
		it := IssueWithComments{Number: int(n), Title: orEmpty(get(r, "title"))}
		comments, _ := get(r, "comments").([]any)
		for _, c := range comments {
			it.Comments = append(it.Comments, orEmpty(get(c, "body")))
		}
		res = append(res, it)
	}
	sort.SliceStable(res, func(i, j int) bool { return res[i].Number < res[j].Number })
	return res, nil
}

// CameFromRollback is whether an issue body carries RollbackLine.
func CameFromRollback(body string) bool { return strings.Contains(body, RollbackLine) }

var digitsOnlyRe = regexp.MustCompile(`^\d+$`)

// FromRollback reads issue n through gh and says whether it came from a rollback; an issue number it cannot read is an error.
func FromRollback(gh issues.GH, n string) (bool, error) {
	if !digitsOnlyRe.MatchString(n) {
		return false, fmt.Errorf("「%s」不是 issue 号，读不到正文", n)
	}
	out, err := gh([]string{"issue", "view", n, "--json", "body"})
	if err != nil {
		return false, err
	}
	v, err := ParseJSON([]byte(out))
	if err != nil {
		return false, fmt.Errorf("gh 的回答读不懂：%v", err)
	}
	return CameFromRollback(orEmpty(get(v, "body"))), nil
}
