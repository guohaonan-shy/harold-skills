---
type: adr
status: 生效
tags: [idea-loop, issue-dispatch, retro]
summary: 调度只数标题为「仓库名#号」的 issue 会话，子会话不占位；曾设计的 retro 整合当天撤回
related: ["[[2026-10-26-retro-merge-grill]]"]
---

# ADR-0029 — 调度只数 issue 会话；retro 整合设计与撤回

> 由 spec `retro-batch-dispatch` 蒸馏而来，该 spec 已删除。

## 1 背景（why）

- **#106**：`issue-dispatch` 把侧边栏 section 里没归档的会话全数进占位。issue 会话自己开出的子会话（如设计阶段并行开的 imagine 会话）也待在同一个 section，实测把主队列算成 10/10，其中真正的 issue 会话只有 5，调度十多小时没出卡片。
- **#108**：retro 批了的候选开成的 issue 有 15 个，和普通需求抢同一个有上限的队列，且没有任何机器可认的标记；一条一个会话、一个 PR，会让 skill 越补越长。

## 2 决策（how）

- **只数标题匹配「<仓库名>#<号> …」的会话**（任何仓库名都算，section 跨项目共用），子会话不占位，汇报里单列「子会话 N 个（不占位）」。判别用标题而不用 `startedBy`，因为点调度卡片开出的 issue 会话 `startedBy` 也是调度会话，分不出来。已知限制：人手动改了标题的 issue 会话不会被数到，队列可能多出一张卡片，代价小，接受。
- **retro 整合（#108）当时的决定**：retro 开的 issue 打保留 label `retro`，不进候选；调度每天每仓库至多出一张整合卡片，取同一 plugin 最早至多 5 个，整合会话合成一份 spec 走到 PR，不停下等人，第二天人决定合不合。
- **整合部分合并当天（2026-10-26）撤回**，原因是人认为 retro 批的候选应先进 docs 里的候选池、由 dreaming 判断能不能进 skill，进池还是直接开 issue 由人在 retro 里定（见 ADR-0030）。

## 3 结果（result）

- 保留并落地的只有 #106：`issue-dispatch` 第 3 步写明子会话不占位并记下个数；各运行环境的「怎么数开着的会话」（桌面端 `runtime` 的 `claude-desktop.md` 按标题匹配、`magi.md` 按 slug 前缀）写了同样的规则和已知限制；汇报每个队列一行带「子会话 N 个（不占位）」。
- 撤回的部分在树上已无痕迹：没有 `retro` 保留 label（仓库 `AGENTS.md`「保留的 label：无」）、没有 retro-merge skill、没有整合卡片。

## 取代线索

- retro 整合设想被 `retro-candidate-pool` 的决定取代（ADR-0030）。
- 调度分 todo、triage 两份数的做法是后来 issue 模型重做时加的，数会话的规则本身不变。
