---
type: raw
source_type: conversation
captured: 2026-10-31
title: #180 writing-for-agents 审 spec：按作用域分能带什么，retro 候选要写怎么结合、怎么验证
tags: [idea-loop-decisions, writing-for-agents-pruning-layers]
related: ["[[writing-for-agents-pruning-layers]]"]
---

U 是人的原话，逐字保留；A 是 AI 的结论，只留结论与发现。

## A1

spec 起草完，#155、#156 原有一道「照 retro 原文各加一段，还是改写已有原则」的待定。PR #203 合并后「加内容之前先归并」已是 `writing-for-agents` 的规则，照它定成改写已有原则。#80 会话转来一条 retro 候选：写给所有项目的文档（用户级 `~/.claude/CLAUDE.md`），例子不带具体项目；它建议并进的「内容放在它适用的那一层」在 `writing-for-agents` 里不存在，最接近的是「剪枝」的相关性一条。问人是否并进这份 spec。

## U1

我觉得#80的核心我觉得是要区分什么纬度的文件可以带项目纬度的信息和few shot，什么不能。比如idea-loop我理解属于通用工作流，不能带有一丝项目相关的信息；全局纬度的claude.md也是一样的。而且内容尽可能的精简，retro新来一个case不能直接append，而是要结合candidate分析，这个内容到底可以和现有的skill怎么结合，以及这块内容要如何验证这个改动确实对于之前的问题解决了。

## A2

- 并进 spec，作为问题 5：按作用域分两级。通用（插件的 skill、agent、参考，用户级 CLAUDE.md）不带任何项目信息；项目级（项目根的 AGENTS.md / CLAUDE.md、项目 docs/）才带项目信息和 few-shot。按「先归并」写进相关性一条。
- 现状：插件里还有两处 Toeflair 场景例子（`to-spec` 的 User Story 示例、`glossary` 的术语示例）和 README 一处点名；仓库 `AGENTS.md` 写着「Toeflair 只作为举例出现」。一并改掉。
- 「结合」已有一栏：PR #203 给 retro 候选加了「归并」。缺的是「验证」：并成问题 6，retro 候选加一栏写回放用例或检查。

## 本轮决议

| 议题 | 决议 |
|---|---|
| #155、#156 加新条还是改写已有原则 | 改写已有原则（照 `writing-for-agents`「先归并」，人未推翻） |
| #80 候选并不并进来 | 并进来，扩成按作用域分能带什么（U1） |
| 插件里现有的项目例子 | 本次换成通用的，仓库 `AGENTS.md` 同步改（U1「不能带有一丝项目相关的信息」） |
| retro 候选怎么验证 | 加「验证」一栏（U1） |
