---
type: adr
status: 生效
tags: [idea-loop, implement, explorer, explorer-reads-impl-decisions]
summary: explorer 读 spec 从只读「测试决策」放宽到再读「实现决策」，只拿它点名的模块当找位置的起点
related: ["[[0039-implementer-reuse-and-compact]]", "[[0058-skill-edit-acceptance]]", "[[161]]", "[[2026-11-16-explorer-reads-impl-decisions]]"]
---

# ADR-0068 — explorer 加读 spec 的「实现决策」，只当找位置的起点

> 由 spec `explorer-reads-impl-decisions` 蒸馏而来，该 spec 已删除。

## 1 背景（why）

explorer 是 `implement` 并行派工前起的探路子代理（`idea-loop/agents/explorer.md`）：替接下来几个并行的 implementer 把大家都要重复找的位置和命令先找一遍，写成只含指针（`路径:行号`、命令、URL）的共享笔记。

两边对同一份 spec 的读法曾经不一致。2026-11-16 对着 origin/main `a032e45` 核：explorer 的「你收到」写「spec 只读「测试决策」」，implementer 的「输入」写 spec 任何一节都可以读。来由是 2026-10-14 加 explorer 时两边都只读「测试决策」，explorer 照抄；2026-10-28 `adcf0f5`（#147，决定见 [[0039-implementer-reuse-and-compact]]）把 implementer 放开成全文可读，explorer 不在那份 spec 的范围里，没跟着改。

后果的例子：spec 的「实现决策」写「改 timer 模块和提交接口」，三个并行的 implementer 各自去搜一遍 timer 在哪，explorer 读不到这句，只能从工单行为描述里猜关键词，没把这份重复的活先做掉。没查到哪次实现因此出过错（只有 git 历史可查，没有运行记录）。

## 2 决策（how）

决定记录 [[161]] 与 [[2026-11-16-explorer-reads-impl-decisions]]：人在三个选项里选了「加读实现决策」。

- **读「测试决策」+「实现决策」两节，不全放开。** 笔记只含指针，其余节（问题陈述、方案、前端交互、User Stories）产生不了位置指针，读了只多上下文；explorer 跑在较小的模型上，读到方案更可能往笔记里写结论。
- **「实现决策」只当起点，不当结论。** 读到的模块名只用来 grep，笔记里不复述它的决定；「不写行为结论、只写位置」的规矩不变。
- 只改 explorer 的定义，不动 frontmatter（description 只路由）；implementer 的读法、explorer 的模型、工具和交回格式都不动。implement 派 explorer 那句只给 spec 路径、不规定读哪节，不用改。

取舍（没做）：不验 explorer 实际运行时笔记质量是否变好（要回放，成本不对等）；只验定义文字。

## 3 结果（result）

- `idea-loop/agents/explorer.md`「你收到」的 spec 一条写读「测试决策」和「实现决策」两节、「实现决策」只用来 grep，其余节不读并带理由；「读什么」表里「每张工单描述的现状在代码里对应哪几处」一行加了「spec『实现决策』点名的模块与接口」。
- 合并在 PR #384（explorer 加读 spec 的「实现决策」）；issue #161 已 CLOSED（2026-11-19）；决定记录 [[161]]。
- 守护：`idea-loop/scripts/explorer-reads-impl-decisions-doc.test.mjs`，断言「你收到」不再写「只读测试决策」、两节都在、「起点」用法与不读其余节的理由在。
