---
type: raw
source_type: conversation
captured: 2026-10-26
title: "retro 候选：读会话记录的脚本跳过开场的任务说明"
tags: [retro-candidates]
---

> 来自 harold-skills#108 的 retro（2026-10-26）。人批了，去处选「留在候选」。

- 信号：纠正与追问（推翻了 #51 题 11 当时的选择）
- 原话：「retro的问题，我理解应该要在读取会话的脚本跳过它，我当时的选择应该是有问题的」（当时在回看 #102 的依据）
- 落点：插件 `session-digest` 脚本（`digest digest` 压缩会话记录那一步），能机械判定，做成检查
- 旧文：无（#51 题 11 当时接受成已知限制：开场任务提示被当成人的发言）
- 新文：压缩会话记录时，跳过开场那条由别的会话写进来的任务说明（调度卡片的 prompt、起会话时的 background），不标成「人：」。
- 例子：#108 这场会话压缩出来的第 1 条是「人：Background (from the session that started this one)…你是 harold-skills#108 的 issue 会话…」，那是调度会话写的，不是人说的。
