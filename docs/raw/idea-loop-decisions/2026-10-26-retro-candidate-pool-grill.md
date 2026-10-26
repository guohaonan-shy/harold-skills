---
type: raw
source_type: conversation
captured: 2026-10-26
title: grill —— retro 候选池放在哪个仓库、哪个目录
tags: [idea-loop-decisions, retro-candidate-pool]
related: ["[[retro-candidate-pool]]"]
---

> 格式：U 是人的原话，逐字保留；A 是 AI 的结论与发现，取证过程略去。讨论发生在 harold-skills#115 的 issue 会话里，审核阶段。#115 正文与 Tofelair#538 的评论已定下的方向（批时人选去处、dreaming 数超过两次、dreaming 不改 skill 而开 issue）不在这里重复。

## A0

复现：retro 第 5 步把批了的候选一律开 issue，dreaming 不读 `docs/raw/retro-candidates/` 下已有的 20 份。起草 spec，照人的原话和现存实例定下：批拆成「批·进候选池 / 批·开 issue」且不给推荐；一条候选一份文件、「出现」一行一次、推翻的不算，次数由脚本数；门槛 ≥3 次；dreaming 提议表加一节「retro 候选」，人批了才开 issue。留给人一题：候选池放在哪个仓库（按落点分 / 都留当前仓库 / 用户主目录），哪个目录（移到 `docs/records/` / 留在 `raw/` 开例外）。

## U1

候选池按落点分：插件的进 harold-skills，目标仓库的进目标仓库；目录移到 docs/records/retro-candidates/。

## 本轮决议

| 议题 | 决议 |
|---|---|
| 候选池在哪个仓库 | 按落点分：插件的进 harold-skills，目标仓库的进目标仓库；跨仓库时 retro 多开一个 harold-skills 的 `docs/` PR |
| 候选池在哪个目录 | `docs/records/retro-candidates/`，文件 `type: record`；已有 20 份移过去 |
