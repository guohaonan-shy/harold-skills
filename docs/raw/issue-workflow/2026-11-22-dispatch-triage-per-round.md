---
type: raw
source_type: conversation
captured: 2026-11-22
title: "#398 triage：白天的 triage 也按每轮新开，triage 分组总数另设上限"
tags: [issue-workflow, dispatch-triage-per-round]
related: ["[[dispatch-triage-per-round]]"]
---

harold-skills#398 的 triage 会话（2026-11-22 12:10 起）。U 是 Harold 的原话，A 是 AI 的结论；取证过程略去。

## A1

#398 的夜里 todo 那一半，11-20 已经在 main 上做掉了（提交 500fa23c，每轮固定派 `limit` 个）；当时写了「triage 的算法不变」，`ISSUE_TRACKER.md` 也写明 triage 的上限是「同时开着的 triage 会话最多几个」。旧 PR #400 跟 main 冲突。问：白天的 triage 要不要也改成每轮新开 `limit` 个？例子：此刻 triage 分组开着 6 个会话（#365、#361、Tofelair#541、#334、#288、#398），本仓库白天上限 6，下一轮新开 0 个。

## U1

triage 也按照每轮开一个，但是triage这个section下面的总会话不能超过10个

## A2

两处要确认：「每轮开一个」是每轮取表里的上限，还是固定 1 个；「不超过 10」写进 `ISSUE_TRACKER.md` 的表（加一列，默认 10），还是插件里写死。

## U2

- 每轮取表里的上限（例子：下一轮新开 min(6, 10−6) = 4 个）
- 表里加一列，默认 10

## 本轮决议

| 议题 | 决议 |
|---|---|
| triage 的上限管什么 | 每轮最多新开几个，跟 todo 一个口径 |
| triage 分组总数 | 另设上限，写在「调度」表 triage 行新加的一列，不写就是 10；分组跨项目共用，数的是整个分组 |
| 旧 PR #400 | 分支重做在当前 main 上，只做 triage 这一半 |
