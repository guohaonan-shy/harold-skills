---
type: adr
status: 生效
tags: [design, uiux-imagine, agent, handoff]
summary: imagine 的执行抽成专职 uiux-imaginer，会话只编排；选中的变种导成交接画布给 refine 接着做
related: ["[[0002-design-loop-v2-imagine-refine]]"]
---

# ADR-0015 — uiux-imagine 抽成专职 agent，并把「重建」改成「交接画布」

> 由 spec `uiux-imagine-agent` 蒸馏而来，该 spec 已删除。
> 本 ADR 取代 [[0002-design-loop-v2-imagine-refine]] 的 §2.3 里「方向说明写进 spec §4、变种渲染不往下传」，和 §2.4 里「绝不从 imagine 的渲染物继续」；那份 ADR 的其余小节仍然生效。

## 1 背景（why）

2026-10-18 对两场真实的 imagine → refine 会话（#47）做了统计，出了三类问题：

1. **会话被撑爆。** imagine 一段，会话亲自做了 140–160 次工具调用，上下文从约 14–18 万涨到约 40 万；refine 因为已经拆给 designer，会话这边只有 22–39 次调用、上下文涨 3–6 万。imagine 没跟着拆，是因为它一直写成「调用会话自己执行」的 skill。
2. **没有恢复点。** 方向说明只在收工时写，每轮人选了什么没有落盘位置；会话压缩或重开后接不上。
3. **交接有损。** 方向说明的构成清单写到像素级，refine 的 designer 却只读文字、从零重建：两场各花 15–17 分钟重抓线上组件才出第一版画布，关闭按钮被评委拉离了人选的右上角，人选的失败标记被改成短弧版，约一半的 refine 意见在改方向说明本身。

## 2 决策（how）

- **新增执行者 `uiux-imaginer`，会话当编排者。** 照 refine 的 designer 写法：会话起静态服务、起一个 uiux-imaginer、每轮在内嵌浏览器里摆变种板、把人的意见分类后用 SendMessage 转给同一个执行者；uiux-imagine 的 SKILL 只写调用机制，设计的活搬进 agent 定义。模型钉 `opus` · high（与 designer 一致，防止被悄悄降级）。
- **每轮交回追加进 `rounds.md`，作为恢复点**；会话重开后新起的执行者读它和变种板接着做。
- **方向说明不写回 spec**（备选是写回 spec，会把一份中间产物变成 spec 常驻内容），照旧只放设计过程目录，收工由执行者跑校验。
- **生图**：项目有生图 MCP 工具时 agent 自己调；只有走 `codex exec` 的才交回编排者代办（子代理里它会被权限拦）。
- **种子子代理**照旧每个随机种子独立派一个（理由与谁来派无关：避免第三套是前两套的平均）。
- **交接改成交画**：收工时把人选中的那一版导成独立页面 `handoff/index.html`，refine 的第一版画布从它来，不再重抓线上组件；没有交接画布的旧 spec 退回从方向说明重建，并明说。
- **人选定的项不被悄悄改掉**：方向说明构成清单每项行末标 `（人选定）` 或 `（模型代填）`，由 `direction-note-check.mjs` 校验；refine 里评委的意见若要动人选定项，编排者摆给人判「保留 / 改」，人说保留则记进方向说明与 ledger，之后同一项不再重复问。
- **方向定下后的执行层意见**：人明说「这里改一下给我看」时，改在选中的那一版上并记成人选定；其余照旧进待打磨清单。
- 原定的两处后来被取代，不算偏离：
  - 「人保留」排除集原计划加在 `critic-score.mjs` 的计分里（从分数里扣掉）；PR #70 重构评委后，改成起评委时把人保留的项作为输入告诉它「不算差距」（`critic-score.mjs` 只校验格式和停止判定）。
  - 原计划给 imagine / refine 补 baseline eval 并加一格 agent 直跑；同一天稍晚整个 `idea-loop/evals/` baseline 被撤（PR #52），合并时这些断言已不在。
  - 原定「uiux-imaginer 自己起调研 agent」被 `ADR-0016` 取代：调研改由人调。

## 3 结果（result）

- 插件有 agent `idea-loop:uiux-imaginer`（`opus`、high）；skill `uiux-imagine` 是编排者说明（只能人调），含分流表、收工、中断与恢复。
- 设计过程目录 `imagine/` 下有 `board.html`、`rounds.md`、`direction-note.md`、`handoff/`；写法在 imagine 的 `references/imagine-canvas.md` 与 `direction-note.md`。
- `uiux-refine` 开工前置检查交接画布，designer 把它接成第一版画布；没有交接画布走从方向说明重建的退路。refine 的 SKILL 有「碰到人选定项的意见」一节与 `pinned-findings.md`。
- 脚本：`direction-note-check.mjs` 校验来源标记（有对应单测）。
- 没有对应的 eval：imagine / refine 的 baseline 已撤，`idea-loop/evals/` 现在只有 retro 回放和 `uiux-research`。
