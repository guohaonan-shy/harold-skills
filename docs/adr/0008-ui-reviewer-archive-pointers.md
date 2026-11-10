---
type: adr
status: 生效
tags: [idea-loop, ui-archive, ui-reviewer]
summary: ui-reviewer 指向设计档案的写法改成「能力名加节名」，不再用 references 文件路径
related: ["[[2026-10-23-design-truth-after-freeze]]", "[[0002-design-loop-v2-imagine-refine]]"]
---

# ADR-0008 — ui-reviewer 指向设计档案的写法：能力名加节名

> 由 spec `ui-reviewer-archive-pointers` 蒸馏而来，该 spec 已删除。
> 这份 spec 本身只是一次验证：issue #91 说的两处，已被别的改动顺带做掉。

## 1 背景（why）

`idea-loop/agents/ui-reviewer.md` 的开工一节和对账模式曾用文件路径指向设计档案里分段的写法（「长页面再读它的 `references/sections.md`」）。agent 定义里指向另一个 skill 的东西，写法规则是用能力名加节名，不写文件路径，因为路径一变（skill 拆分、改名）指针就断。issue #91 要求改掉这两处。

## 2 决策（how）

- 开工一节改成：用 Skill 工具调 `idea-loop:design-archive`，看它的「图的实体」「目录与命名」「进入方式从图上推导」，再按它的「按需读」表读各自指到的那份。
- 对账模式的拍图步骤改成照 `idea-loop:design-archive` 的「拍档案截图」里对应情形的小节。
- 归档模式那一处，在 spec `canvas-truth-dreaming-agents`（PR #90）里改成同样的写法。
- 这些都是随 `design-archive` 的 SKILL.md 瘦身（主体只讲图的实体，写法、校验、查询、归档走 `references/`，`sections.md` 并入 `references/` 下的其它文件后删除）一起做的，没有为 #91 单独起实现；issue 以 NOT_PLANNED 关闭，实际是被那次瘦身顺带做掉。
- 验证里留了一个没在这里判的点：ui-reviewer 里还剩一处指向 `pr-review` 的 `references/review-standards.md` 的文件路径，指的不是设计档案；同样写法在十来个 agent 定义里都有，算不算违反「引用另一个 skill」的写作规则，留给别处判。

## 3 结果（result）

- 2026-10-31 的核对是：`idea-loop/agents/ui-reviewer.md` 里已无 `sections.md`，整个 `idea-loop/` 下也没有文件再提它。本次对账（`origin/main` 92fa448）重新核：ui-reviewer 中该词 0 处；剩下提到它的只有 `idea-loop/evals/retro/` 两个用例的批注。
- 开工一节、对账模式、归档模式现在都以「用 Skill 工具调 `idea-loop:design-archive`，按它的『按需读』读 UI 审查的归档模式 / 对账模式那一份」的形式指到设计档案。
