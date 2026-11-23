---
type: raw
source_type: conversation
captured: 2026-11-23
title: "#437 dyna 缺的五个命令：triage 会话里定的三件事"
tags: [idea-loop-decisions, dyna-missing-commands]
related: ["[[dyna-missing-commands]]"]
---

格式约定：U 是人的原话（这里是人在选择题里选中的那一项，逐字保留），A 是 AI 的结论。

## A1

spec 草稿（`dyna-missing-commands`）摆了三道题。空提交、按提交检出照「先扩展已在用的工具」做成已有命令的新参数；`issues kind` 照 `issues priority` 的写法。订正 issue 的一条说法：回放 worker 本来就不带 gh 登录，dyna 内部也调 gh，补命令救不了回放。

## U1

范围：「五个一起 (Recommended)」

等检查：「等 60 秒再判没有 (Recommended)」

命令名：「就这样 (Recommended)」

## 本轮决议

| 议题 | 决议 |
|---|---|
| 范围 | 五个命令一个 PR 合进 `release/idea-loop-0.2.0`，dyna 升到 0.0.7，插件对 dyna 的最低版本提到 0.0.7 |
| `pr checks` 没有检查时 | 推送后 60 秒还没有检查才判 `none`；默认等 30 分钟，超时退出 124；第一个失败就返回 `red` |
| 命令名 | `dyna issues list <docs> --state <状态>`、`dyna issues kind <docs> <号> <bug\|feature\|improvement>` |
