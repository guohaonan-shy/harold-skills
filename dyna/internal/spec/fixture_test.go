package spec

import (
	"strings"
)

// opts shapes the spec text built by doc: the current template (the seven sections in order, the front-end
// interaction a sub-section of 方案 and left out when the spec touches no UI) and the older one (Legacy: the
// sub-sections under 技术方案总览 with 「不涉及」 spelled out).
type opts struct {
	Status string
	UI     string
	Freeze bool
	Grill  bool
	Fork   bool
	Issues string
	Legacy bool
	// ChangesAgentDocs writes `changes_agent_docs: true` into the frontmatter; Diagnosis adds a level-3
	// 「杠杆诊断」 section under 方案.
	ChangesAgentDocs bool
	Diagnosis        bool
}

func doc(o opts) string {
	ui := ""
	if o.UI != "" {
		ui = "\n### 前端交互\n" + o.UI + "\n"
	}
	diagnosis := ""
	if o.Diagnosis {
		diagnosis = "\n### 杠杆诊断\n改一处 skill。验证：检查。\n"
	}
	plan := "## 问题陈述\n\n重试会多扣一次配额。\n\n## 方案\n\n重试不再扣配额。\n" + ui + diagnosis + "\n## User Stories\n\n1. 作为用户，我想要重试不扣配额。\n\n"
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
	if o.ChangesAgentDocs {
		b.WriteString("\nchanges_agent_docs: true")
	}
	b.WriteString("\n---\n\n# 重试不消耗配额\n")
	if o.Grill {
		b.WriteString("\n> 需要 grill：要不要给重试单独的配额，条目里没定。\n")
	}
	b.WriteString("\n")
	if o.Legacy {
		b.WriteString("## 问题陈述\n\n重试会多扣一次配额。\n\n")
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
	if !o.Legacy {
		b.WriteString("\n- 重试不扣配额：单元测试。\n\n## Out of scope\n\n- 配额上限。\n\n## 关联\n\n- 无。\n")
	}
	return b.String()
}

const uiBlock = "> 待补图：`uiux-refine` 冻结时按冻结画布补交互图，替换本节文字\n\n- 点重试 → 只重跑这一题"

func replaceOnce(s, old, repl string) string { return strings.Replace(s, old, repl, 1) }
