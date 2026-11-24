---
type: record
captured: 2026-11-23
title: "不做（暂缓）：每周计划，由 idea-loop 整理 issue 关系、圈出本周、每周一条集成分支发版"
tags: [out-of-scope, idea-loop]
---

- 是什么：每周一由定时任务整理全部开着的 issue（合并重复、标依赖和相关、归 project），圈出指派给人的本周 issue（有上限），开本周的集成分支和发版 issue；调度只派本周的 issue 加 P0；本周全部完成后由发版 issue 的会话把集成分支合进主分支。也包含它的前身「父 issue 带子 issue、子 PR 进集成分支」。
- 为什么不做：人的原话（2026-11-23，#334 的 triage 会话）：「我倾向于将这个issue 改成 not planned，之后有需求再说」。是暂缓，不是否决：再有同类需求时重开 #334，不另起。
- 已经做完、重开时不用重做的：spec 在分支 `issue/334-parent-child-integration-branch` 的 `docs/spec/weekly-plan/weekly-plan.md`（带时序图），决定记录在同一分支的 `docs/raw/issue-workflow/2026-11-23-weekly-plan-grill.md`。其中核过的平台事实：GitHub 没有 Cycle，本周用 milestone；Linear 的 milestone 只在 Project 内、不能跨 Project，Releases 要 Business 套餐并接 CI（Linear 文档，2026-11-20 查）。
- 相关 issue：harold-skills#334
