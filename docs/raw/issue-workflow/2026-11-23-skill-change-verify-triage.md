---
type: raw
source_type: conversation
captured: 2026-11-23
title: "#456 triage：改了 skill 怎么验"
tags: [issue-workflow, skill-change-verify]
related: ["[[skill-change-verify]]"]
---

U 是人的原话，A 是 AI 的结论。会话是 #456 的 triage 会话，人用选项卡片回答。

## A1

调度从 `main` 开的分支；issue 正文写「随 idea-loop 0.2.0，父 issue #331」，引用的 `dyna spec skill-edit` 只在 `release/idea-loop-0.2.0` 上。问分支和 PR 基于哪条，推荐 release。

## U1

release/idea-loop-0.2.0 (Recommended)

## A2

spec 草稿 `skill-change-verify`：每处 skill 改动在杠杆诊断里写一行「验证：」五选一；新增「目标用例」，来源是 spec 的一条预期行为，跟回放同格式、同 runner、Codex 评委；工单照抄、`dyna spec skill-edit` 核。问目标用例只跑改后（A）还是改前改后都跑、判法同回放（B），推荐 B：能抓住加了跟没加一样的规则，即 2026-11-20 原话的第二部分。

## U2

B

## 本轮决议

| 议题 | 决议 |
|---|---|
| 分支基准 | `release/idea-loop-0.2.0`，#456 挂成 #331 的子 issue |
| 目标用例跑法 | 改前、改后都跑，判法同回放：改前否、改后是才过；改前就是记成不过 |
