---
type: raw
source_type: conversation
captured: 2026-11-18
title: "#356 skill 写死 gh / git 命令：怎么做、检查放哪"
tags: [idea-loop-decisions, skills-no-tool-commands]
related: ["[[skills-no-tool-commands]]"]
---

U 是人的原话（这里是人在选择题里选中的选项），A 是 AI 的结论。

## A1

#356 要改的 54 个文件（124 行行内 `gh` / `git` 命令，对着 main `f300d8f`）全在 #340 的逐份重写那一批里。摆了两道题：#356 并进 #340、单独先做、还是等 #340 合并后做；拦新命令的绊线检查并进 #341 的结构检查，还是单独一个测试文件。推荐都是「并进」。

## U1

并进 #340 (Recommended)

## U2

并进 #341 结构检查 (Recommended)

## 本轮决议

| 议题 | 决议 |
|---|---|
| #356 怎么做 | 并进 #340 的逐份重写；#356 挂到 #331 下，blocked by #340，随 #340 的 PR 关 |
| 绊线检查放哪 | 并进 #341 的结构检查，照 `no-project-leak.test.mjs` 写 |
