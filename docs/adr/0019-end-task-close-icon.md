---
type: adr
status: 生效
tags: [design, design-reference, uiux-refine, close-icon]
summary: 设计参考加规则：结束整个任务的入口用 X 并写明结束什么，后退箭头只用于无害地回一步
related: ["[[0002-design-loop-v2-imagine-refine]]", "[[57]]"]
---

# ADR-0019 — 设计参考：结束整个任务的入口用 X，不用后退箭头

> 由 spec `end-task-close-icon` 蒸馏而来，该 spec 已删除。

## 1 背景（why）

2026-10-26 对着当时主分支全文搜了 refine 设计参考（16 份）和 designer、ui-master、ui-reviewer 三个 agent 定义里的 arrow / back / X / aria-label / tooltip（#57）。已有的相关规则只有三条：Leave / end confirmations 只管点下去之后要不要确认；无障碍基线要求 icon-only 按钮有 `aria-label`，没说名字要写明结束什么；启发式第 3、4 条要求有出路、同义控件一致，没区分「回一步」与「结束整个任务」。「箭头」一次都没出现。

后果：做题页左上角放一个后退箭头、点下去结束整场练习，照旧清单能过（有无障碍名称、有确认），没有依据把「这个箭头让人以为只是回上一页」判成 finding。这条原则在某个产品里已落地（箭头换成 X，悬停和无障碍名称写明「End practice」），Harold 当时的话是换成 X 会让用户明白这是个要重视的按钮、不是后退。2026-10-20 dreaming 蒸馏时判定为通用原则、不进项目 `DESIGN.md`。

## 2 决策（how）

- **在设计参考的「Practical craft checklist」里加 End-task entries 一条**，放在 Leave / end confirmations 之前（评审先看入口长什么样，再看点下去要不要确认）：先分清入口是「回一步」还是「结束整个任务」；结束整个任务用 X，用后退箭头算 finding；X 配悬停 / 聚焦提示和无障碍名称，写明结束的是什么，不只写「Close」；后退箭头只留给真的回上一步、不放弃整个任务的入口；要不要确认归旁边那条，不重复。末尾一句 Why。节首的目录同步加上它。
- **落点的备选**：issue 建议放 `heuristics-checklist` 的 Nielsen 第 4 条（与图标语义相关的条目放一起）；被否——那份文件是打分框架，里面没有图标语义条目，规则只落一处。人在审 spec 时定为「留在 Practical craft checklist，紧挨 Leave / end confirmations」。
- **无障碍基线不改**（icon-only 要有 `aria-label` 原样保留，「名称要写明结束什么」只对结束入口成立，写在新条目里）；agent 定义不改。
- **不加机械检查、不写产品细节**：理由同 `ADR-0018`。

## 3 结果（result）

- 实现于 PR #105（2026-10-26 合并）。设计参考合成 6 份后（PR #253），这条规则在 refine 参考目录里的 `critique.md` 的「Practical craft checklist」一节，条目名 End-task entries，排在 Leave / end confirmations 之前（五个编号步骤加一段 Why），文件里没有出现产品名或 PR 号。
- 与 `ADR-0018` 的关系：两条同出一次 dreaming 蒸馏，互相引用；本条管入口长什么样，那条管点下去要不要确认。
- 没有测试：给模型读的清单，判得准不准只能在真实设计会话里看。
