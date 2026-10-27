---
type: raw
source_type: conversation
captured: 2026-10-27
title: #125 design-archive 精简：主体以图的实体为中心，命令行走 references
tags: [idea-loop-decisions, design-archive-skill-length]
related: ["[[design-archive-skill-length]]"]
---

U 是人的原话，逐字保留；A 是 AI 的结论，只留结论与发现。

## U1

你用writing-for-agent 这个skill扫design-archive这个skill，你觉得问题在哪？

## A1

超长是表象。按 writing-for-agents：主体按数据主题组织、没按调用分支组织，几乎全在文件内参考一级；同一个概念散在多处（分段 7 处、`blocked` 8 处、`usedBy` 4 处）；文件内外有重复（校验规则 0 重抄必填字段，「`prod/` 只由脚本写」4 遍，`tmp/` 生命周期与 wiki-conventions 重复，查询表与 MCP description、`--help` 重复）；缺一个引导词「派生」统一进入方式、`usedBy`、`prod/index.md`、截图；唯一的完成条件「写完 `delta/` 的标志」埋在校验一节中间。起草的 spec「只换位置」只解决第一条。

## U2

这个skill目前是给谁引用的

## A2

调 skill 读正文的 4 个：implementer、ui-reviewer、dreaming 初扫（都写对象）、dreaming 对账（读档案加校验归档）。只点名的：design-steward、design-modeling、wiki-conventions、uiux-refine 动效协议、ui-measure。不经 skill、直接跑脚本或 MCP 工具的：pr-review 合并、dreaming 漏归档兜底、增量范围、审阅页。

## U3

他们普遍需要这个skill其实是作为mcp一个使用说明？

## A3

不完全是。调用方要三样：写对象的格式规范（最大，MCP 只读帮不上）、图的模型（读写都要，用来看懂查询结果）、查询怎么用。第三样 MCP 七个工具的 description 已经写了「查什么」和「什么时候用」，主体里的查询表是第三份副本。

## U4

如果按照标准这个skill你会怎么修改

## A4

提了一版：主体约 3200 字，图的模型、目录与命名、进入方式，加按写对象 / 读档案 / 校验 / 归档四个分支各一节的路由；写对象的规范按对象就近归置进一份 references；查询以 MCP description 为准。

## U5

写档案和读档案的对象不是一个吗？我倾向于将节点、边关联以及图实体描述清楚就行。

校验和归档其实都是一些命令行，不同分支的内容走对应的reference，渐进式纰漏即可。

## A5

照此改 spec：主体以图的实体与关联为中心（读写共用，每种实体一小节，定义、关联、字段名就近放），加目录与命名、进入方式推导、一张按需读的指针表；写对象文件的格式细节、校验、查询、归档的命令行各走对应 references。

## U6

我感觉这样应该能把这个skill简化很多吧

## A6

主体能从 11386 降到约 3300，但多半是挪位置，真删的约 2500–3000 字；写对象的人读的总量少约 30%。最重的是 `references/sections.md`（15534 字），这次没碰。

## U7

section.md我觉得也应该简化

## A7

`sections.md` 混着写分段的规范（约 5000）和拍档案截图的步骤（约 10000）；拍图一半大量缓存脚本内部实现，同句重复三四遍，真实步骤散在长编号里。提议拆成两半：写分段的规范并进实体与写法，拍图单成一份按情形排步骤的参考，约 15534 → 8000。改为倾向并进这次。

## U8

把 sections.md 的精简并进 #125，先改 spec 和工单

## 本轮决议

| 议题 | 决议 |
|---|---|
| 主体组织 | 以图的实体与关联为中心，读写共用一处，不按写 / 读拆分支 |
| 校验、查询、归档 | 都是命令行，各走对应 references，主体一行指针 |
| 写对象文件的格式细节 | 外置成一份 references |
| 查询用法 | 以 MCP 工具的 description 为单一事实来源 |
| 「只换位置」的限制 | 放开：就近归置、去重；字段名、规则编号、命令、退出码不改 |
| `sections.md` | 并进 #125：写分段的规范归实体与写法，拍档案截图单成一份参考，脚本内部实现留给源码 |
