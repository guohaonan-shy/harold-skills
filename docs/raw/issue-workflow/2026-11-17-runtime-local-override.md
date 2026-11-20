---
type: raw
source_type: conversation
captured: 2026-11-17
title: "#295 runtime 的本机覆盖：放进 home，同名小节整段替换"
tags: [issue-workflow, runtime-local-override]
related: ["[[runtime-local-override]]"]
---

U 是人的原话（这里是人在两道选择题上点的选项），A 是 AI 的结论与发现，取证过程略去。

## A1

开场核了 0.2.0 的 home（#252、#331）：本机 `~/home` 已经建好（2026-11-17 13:50 两个提交：建 home 登记 harold-skills、搬入原 `~/.claude/CLAUDE.md` 并软链），#252 的 PR #360 开在 `release/idea-loop-0.2.0` 上还没合；home 是一台设备一份、进 git 的私有仓库，有设备地图，但没给 runtime 的本机做法留位置。`idea-loop:runtime` 读 reference 的路径只有一条：主会话由 SessionStart hook 跑 `runtime-detect.mjs --inject reference` 注入，子 agent 照 SKILL.md 自己读 `references/<运行环境>.md`，两条都不碰本机文件。

摆了两道题：本机做法放哪、谁读（home 里一份 runtime 去读 / 现在就做放 `~/.idea-loop/` / 不改插件把指针放调用方）；本机和 reference 同写一个能力时怎么合（同名小节整段替换 / 只能补充）。

## U1

「home 里一份，runtime 去读 (推荐)」

## U2

「同名小节整段替换 (推荐)」

## 本轮决议

| 议题 | 决议 |
|---|---|
| 落点 | home 里，按运行环境一份：`~/home/runtime/<运行环境>.md`；`idea-loop:runtime` 读完 reference 再合进它 |
| 粒度 | 本机文件里出现的标题（`##` 能力或 `###` 子节）整段替换 reference 里同级同名的那段，没写的照 reference |
| 基准分支 | #295 跟 home 走，挂到 0.2.0 下，PR 开到 `release/idea-loop-0.2.0` |
