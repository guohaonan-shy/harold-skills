package spec

import (
	"fmt"
	"regexp"
	"sort"
	"strings"
)

// opts shapes the spec text built by doc, the same shapes the old script's test built: the current template
// (verdicts are quoted lines right under the title, the front-end interaction is a sub-section of 方案 and left
// out when the spec touches no UI) and the older one (Legacy: a 「验证」 table, and the sub-sections under
// 技术方案总览 with 「不涉及」 spelled out).
type opts struct {
	Status  string
	UI      string
	Freeze  bool
	Grill   bool
	Fork    bool
	Issues  string
	Verdict map[string]string // issue as written ("12" or "FA-577") → 存在 / 不存在
	Legacy  bool
}

var plainNum = regexp.MustCompile(`^\d+$`)

func doc(o opts) string {
	keys := make([]string, 0, len(o.Verdict))
	for k := range o.Verdict {
		keys = append(keys, k)
	}
	// the old test listed verdicts in insertion order; numbers first (ascending), then keys, is the same for its cases
	sort.Slice(keys, func(i, j int) bool {
		ni, nj := plainNum.MatchString(keys[i]), plainNum.MatchString(keys[j])
		if ni != nj {
			return ni
		}
		return keys[i] < keys[j]
	})
	tag := func(n string) string {
		if plainNum.MatchString(n) {
			return "#" + n
		}
		return n
	}
	opening := ""
	if !o.Legacy {
		var lines []string
		for _, n := range keys {
			v := o.Verdict[n]
			why := "上周 #9 已修，对着 main 核过"
			if v == "存在" {
				why = "重试一次就扣一次配额"
			}
			lines = append(lines, fmt.Sprintf("> %s %s：%s", tag(n), v, why))
		}
		opening = strings.Join(lines, "\n")
	}
	var rows []string
	for _, n := range keys {
		rows = append(rows, fmt.Sprintf("| #%s | %s | 复现 |", n, o.Verdict[n]))
	}
	table := "## 验证\n\n| issue | 结论 | 证据 |\n|---|---|---|\n" + strings.Join(rows, "\n") + "\n\n"
	ui := ""
	if o.UI != "" {
		ui = "\n### 前端交互\n" + o.UI + "\n"
	}
	plan := "## 问题陈述\n\n重试会多扣一次配额。\n\n## 方案\n\n重试不再扣配额。\n" + ui + "\n"
	uiLegacy := "不涉及。"
	if o.UI != "" {
		uiLegacy = o.UI
	}
	overview := "\n## 技术方案总览\n\n### 后端\n不涉及。\n\n### 前端交互\n" + uiLegacy + "\n"

	var b strings.Builder
	b.WriteString("---\ntype: spec\n")
	if o.Status != "" {
		b.WriteString("status: " + o.Status + "\n")
	}
	b.WriteString("tags: [retry]\nsummary: 重试不消耗配额\nrelated: []")
	if o.Issues != "" {
		b.WriteString("\nissues: " + o.Issues)
	}
	b.WriteString("\n---\n\n# 重试不消耗配额\n")
	if o.Grill {
		b.WriteString("\n> 需要 grill：要不要给重试单独的配额，条目里没定。\n")
	}
	if opening != "" {
		b.WriteString("\n" + opening + "\n")
	}
	b.WriteString("\n")
	if o.Legacy {
		b.WriteString(table)
	} else {
		b.WriteString(plan)
	}
	b.WriteString("## 实现决策\n")
	if o.Freeze {
		b.WriteString("\n### 冻结摘要\n- 画布指针：docs/design/tmp/practice-retry/canvas/v3.html\n")
	} else {
		b.WriteString("\n无分歧。\n")
	}
	if o.Fork {
		b.WriteString("\n### 待定：重试要不要单独计配额\n- 选项 A：…\n")
	}
	if o.Legacy {
		b.WriteString(overview)
	}
	b.WriteString("\n## 测试决策\n")
	return b.String()
}

const uiBlock = "> 待补图：`uiux-refine` 冻结时按冻结画布补交互图，替换本节文字\n\n- 点重试 → 只重跑这一题"

func replaceOnce(s, old, repl string) string { return strings.Replace(s, old, repl, 1) }

func verdictMap(vs []Verdict) map[IssueRef]string {
	m := map[IssueRef]string{}
	for _, v := range vs {
		m[v.Ref] = v.Word
	}
	return m
}
