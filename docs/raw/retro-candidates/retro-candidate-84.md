---
type: raw
source_type: issue
captured: 2026-10-26
title: "retro 候选 #84：idea-loop retro：落点表加「人的全局偏好」一层，批了的直接写进全局 CLAUDE.md"
tags: [retro-candidates]
---

> 原文取自 guohaonan-shy/harold-skills#84（开于 2026-10-23，2026-10-26 随 retro 整合撤回关成 not planned）。正文与评论逐字保留；去处见 #115。

# idea-loop retro：落点表加「人的全局偏好」一层，批了的直接写进全局 CLAUDE.md

## 是什么

`retro` 的落点表只有三层：插件 skill、目标仓库的规则文件、确定性检查。讲话方式、跨所有项目都成立的偏好，该落到人的全局 `~/.claude/CLAUDE.md`，表里没有这一层；而且 retro 的第 5 步只有「批了的开成 issue」一条路，开到仓库的 issue 管不到人本机的文件。

例子：#51 收尾时第一次真实跑 retro，候选 1（机制第一次出现要讲清）、候选 2（后台工作不沉默）、候选 3（转述用人的语言）讲的都是说话方式。agent 第一反应把候选 1 落到插件的 `decision-rules`，是人问了「这个规则你准备加到哪里？用户纬度的agent.md?」才改落全局 CLAUDE.md。三条最后都是人在会话里批了、agent 直接写进去的，retro 的步骤里没写这条路。

## 落点（人在 #51 的 retro 里批的）

插件的 `retro`：

- 落点表加第四行：「讲话方式、跨所有项目都成立的偏好 → 人的全局 `~/.claude/CLAUDE.md`」。
- 第 5 步加一句：「落点是人的全局 CLAUDE.md 的，不开 issue：在会话里把要加的那条摆给人，人批了直接写进去，写完把新的一条念给人。」

## 相邻

- #80：`decision-rules` 和全局 CLAUDE.md 的内容怎么分，管的是内容；这条管的是 retro 知不知道有这一层。互不冲突。

## 会话里的原话（#51 issue 会话，2026-10-23）

「这个规则你准备加到哪里？用户纬度的agent.md?」

## 怎么证明生效

按 retro 的回放：取 #51 的会话记录作输入，让 retro 跑到候选写完停下；是/否题「讲话方式类的候选，落点是否写成人的全局 CLAUDE.md、且没有写成开 issue」。改前应「否」、改后应「是」。

## 为什么这次不做

retro 只出候选、不改规则文件；改插件 skill 走正常的审核与实现。
