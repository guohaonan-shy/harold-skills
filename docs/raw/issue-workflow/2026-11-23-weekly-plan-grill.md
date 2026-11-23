---
type: raw
source_type: conversation
captured: 2026-11-23
title: issue 规划层与每周发版 grill（#334 triage 会话，2026-11-19 至 11-23）
tags: [issue-workflow, weekly-plan]
related: ["[[weekly-plan]]"]
---

# issue 规划层与每周发版 grill

#334 的 triage 会话。起点是「父 issue 带子 issue、子 PR 进集成分支」的草稿（`ffc3334c`），人在讨论中把范围扩成整个规划层。

## 过程

1. 草稿摆了三道题（父 issue 何时开进 main 的 PR、那个 PR 审多深、多仓库要不要拆子 issue）。人要求先调研 Matt Pocock、poteto 等人的做法。
2. 调研结论（子代理，2026-11-19 查）：Matt 的集成分支只在一个 spec 内部（多张工单合进一条分支、第一次合并后开 draft PR、最后跑完整 review）；poteto 的 pstack 不用集成分支，用 stacked PR 自底向上逐个合进 trunk；trunk-based 与 Fowler 反对长寿分支（语义冲突只在大合并时暴露）；没有一家写过「一个仓库一张子单」。
3. 人指出缺的是更前面的一层：前后相关、会冲突的 issue 要早点并在一起；版本、长期功能这类集中管理怎么用；issue 之间的 blocked、related、要不要一起实现。「issue 的管理 → 实现，中间缺一块」。
4. 人：选扩 #334（不另开 issue），「也不需要我审批，让 LLM 自己决定如何做 milestone（版本）、project（feature）的管理，甚至 issue 是否能合并，按照依赖关系、相关性管理」。
5. 查 Linear 文档：milestone 只在 Project 内部、不能跨 Project 共用；Releases 要 Business 套餐并接 CI。
6. 人：project 给「一个 issue 无法承载的改动（issue 之间有相关性、依赖关系）」和长期类（如线上问题）；milestone 看起来没用；单独的 issue 照常单独处理。0.2.0、0.2.1 这类是为了一次性发版；listen & repeat 重构会在讨论中长出新的依赖 issue（重构提示词需要重建样本、期望标注）。
7. 人：harold-skills 从 0.2.0 以后按周定一个版本；Toeflair 每周或两周一个发布节点；每个发布节点开始前由定时任务做合并、依赖、相关的整理。
8. 人：Toeflair、harold-skills 和公司项目都以 GitHub / Linear issue 为主，每周一早上根据分配给自己的 issue 整理本周的 project / milestone，再按这些 issue 调度。急修走单独的 issue 调度逻辑，不进集成分支。一版装多少：当前所有 issue 全放进本周，但有一个很大的上限（10 或 15）。
9. 查公司项目的 Linear（只看指派给人的，2026-11-23）：团队用两周一个的 Cycle，指派给人的 issue 大多挂在当前 Cycle 里；Project 内用 milestone 分主题；父子关系既有真拆分（Epic），也有「做那个时发现的」。
10. 人：GitHub 没有 cycle 吗？自己的项目发版都走集成分支，所有 issue 完成之后合进主干；上限每个项目 10 或 15；公司项目和自己的项目都这么处理，在调度时再具体判断。

## 决议

| 事 | 决定 | 出处 |
|---|---|---|
| 谁定 | 合并、依赖、相关、归 project、圈本周都由 LLM 自己做，不等人批；每一步留评论写依据，每次规划推送清单，人一句话推翻 | 过程 4、10 |
| project | 一个 issue 装不下的（有相关、依赖）和长期类（线上问题）；单个 issue 照常单独做 | 过程 6 |
| 版本 | 按周：每周一整理本周要做的 issue，调度只从本周里派 | 过程 7、8 |
| 发版 | 自己的项目每周一条集成分支，本周 issue 全部完成后合进主分支；其余项目照同样处理，具体在规划、调度时判断 | 过程 10 |
| 急修 | 单独调度，不进集成分支 | 过程 8 |
| 上限 | 当前能做的全放进本周，每个项目上限 10 或 15 | 过程 8、10 |
| 父子 issue | 平台上照常读，不当成组（公司 Linear 实例里父子关系既有真拆分也有「顺带发现」） | 过程 9 |
