---
type: adr
status: 生效
tags: [issue-workflow, subagent-handback-lost-turn, idea-loop]
summary: 子 agent 交回后卡住是那一轮模型请求丢了，属于网络与平台侧；idea-loop 不加任何恢复机制（未采纳）
related: ["[[292]]", "[[2026-11-16-handback-lost-turn]]"]
---

# ADR-0086 — 子 agent 交回后卡住：根因在平台那一侧，idea-loop 不加机制（未采纳）

> 由 spec `subagent-handback-lost-turn` 蒸馏而来，该 spec 已删除。

## 1 背景（why）

编排者（跑 implement、pr-review 的 issue 会话）把工单、review 交给后台子 agent，交回作为一条消息送进会话，本该让模型核对、落地、汇报。卡住时，这一轮之后只有一句「No response requested.」，没有东西再叫醒会话，人回来问才接上。#292（及并入它的 #221）起初的说法是「模型读了交回、把它当成不用回的通知结束了这一轮」，提议加 Stop 钩子等机制。

2026-11-16 扫本机全部 Claude 会话记录，按交回消息自带的标记（`origin.handback: true`）认出去重后 1967 次交回，其中 39 次（约 2%，分布在 2026-10-19 到 11-15）交回之后的第一条回复就是那句话；来自 implementer 21 次、pr-reviewer 11 次，其余 7 次来自 designer、explorer、ui-master、ui-reviewer 等。39 次按痕迹分：15 次记录了 `Connection dropped (ECONNRESET)`，20 次请求发出后一条记录都没有、直到进程重启，4 次请求都没发出进程就没了。「No response requested.」全部 123 条里 122 条是 `model: <synthetic>`，输出 0 token，是平台在进程重启时合成的；39 次里 Stop 钩子一次都没触发。

结论：不是模型读了交回不往下走，是处理交回的那一轮模型请求没成，模型没被调起来。这也解释了为什么「收到交回必须处理」的各种指令一直拦不住：模型没看到那一轮。

## 2 决策（how）

- **idea-loop 不改，#292 关成 canceled（NOT_PLANNED）。** 人 2026-11-16 在 triage 会话定的：「看起来核心是网络的问题，修改spec，然后关闭issue吧」。
- 撤掉的三个候选及原因：
  - Stop 钩子（结束一轮前读会话记录，挡没调工具就结束的交回轮）：那一轮没有模型运行，Stop 事件不触发，39 次里 0 次。
  - 交回最后一行写明接收方下一步、implement / pr-review 每个出口交固定结果块：模型没读到交回，写得再清楚也没人读；也没找到「读了交回却不往下走」的实例。
  - 在 hooks.json 加检查、在人下次开口或会话恢复时指出漏掉的交回，或派活时定兜底唤醒：能缩短人发现的时间，但不碰网络这个根因，人定了不做。
- **已知限制：** 交回后卡住照旧约 2%，照旧要人回来开口才接上；看到过期的「stopped」通知时，子 agent 的交回可能早已在会话里。

## 3 结果（result）

- 无代码改动。`idea-loop/hooks/hooks.json` 里只有 SessionStart 与 PostToolUse、PreToolUse 钩子，没有 Stop 钩子（2026-11-22 核对）。
- #292 与 #221 都以 NOT_PLANNED 关闭；订正根因的 spec 修改合并在 PR #342（docs: #292 交回后卡住的根因订正（不做）），决定记录 [[292]]，调查原始记录 [[2026-11-16-handback-lost-turn]]。
