---
type: raw
source_type: conversation
captured: 2026-11-16
title: 讨论 —— #192 设计档案浏览器测试在全量套件里「卡住」，怎么修
tags: [issue-workflow, sections-browser-test-out-of-full-suite]
related: ["[[sections-browser-test-out-of-full-suite]]"]
---

> 格式约定：`## U<n>` 是人的发言，逐字保留；`## A<n>` 只保留结论与发现。末尾一张「本轮决议」表。
>
> 本场讨论在 harold-skills#192 的 triage 会话里进行。复现输出在 worktree 的 `.tmp/192/`（`single.log`、`rest.log`）。

## A1

复现（2026-11-16，对着 main `a032e45`，darwin，node 22）：`design-archive-sections-browser.test.mjs` 单跑 55 例全过，用时 5 分 49 秒，CPU 只占 14%，时间花在真实等待上；其余 92 个测试文件（1256 例）合跑 53 秒。不是卡死，是慢。摆了三种修法：移出全量命令并加每例超时；留在全量里只加超时；瘦身最慢的用例。推荐第一种。

## U1

移出全量 + 加超时（推荐）

## 本轮决议

| 议题 | 决议 |
|---|---|
| 修法 | 浏览器测试移出全量测试命令，另给一条单独的命令；每个用例加超时，真卡住时失败而不是挂着 |
