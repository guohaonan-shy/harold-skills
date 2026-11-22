---
type: spec
tags: [idea-loop, issue-dispatch]
summary: 白天的 triage 也按每轮新开表里的上限个，triage 分组总数另设上限（表里新一列，默认 10）
issues: [398]
related: ["[[2026-11-22-dispatch-triage-per-round]]", "[[0065-dispatch-day-night-modes]]", "[[0025-dispatch-triage-cards]]"]
---

# 调度的 triage 上限改成每轮新开几个，triage 分组总数另设上限

> #398 存在：白天的调度把 `limit` 当成 triage 分组里同时开着的会话上限，分组里会话够多时整轮一个不开，详情在「问题陈述」

## 问题陈述

### 1. triage 分组开着的会话够多，白天一轮一个都不开

#398 报的是调度把「上限」当成开着的会话总数。夜里 todo 那一半 11-20 已在 main 上改掉（提交 500fa23c：每轮固定派 `limit` 个，不看 in-progress 开着几个），当时写明「triage 的算法不变」，所以白天这一半还在。

现在的规则（2026-11-22 对着 origin/main 68495e91 核过）：`issue-dispatch` 第 5 步写「`triage`：空位 = `limit` − triage 分组里的会话数。空位 ≤ 0 就跳过」；本仓库 `ISSUE_TRACKER.md`「调度」一节写「triage 行的上限是同时开着的 triage 会话最多几个」。

真实例子：2026-11-22 12:10，triage 分组里开着 6 个会话（harold-skills#365、#361、#334、#288、#398，Tofelair#541），本仓库白天上限 6。下一轮算出空位 6 − 6 = 0，一个都不开，而人要的是「每轮新开几个」。

### 根因

triage 的上限沿用了 ADR-0025 的「triage 单独上限 3，数 triage section 里的会话」：上限是同时开着的总数，不是每轮新开数。

## 方案

改完：白天每一轮最多新开「调度」表 triage 行的上限个 triage 会话；triage 分组里的会话总数到「分组上限」（表里新加的一列，不写就是 10）就不再开。拿上面的例子：下一轮新开 min(6, 10 − 6) = 4 个。

做法：

- **一轮新开几个** = min(`limit`, 分组上限 − triage 分组里的会话数)，≤ 0 就跳过。triage 分组里的会话照现在的数法数（只数标题匹配「<仓库名>#<号> …」的，跨项目都算：分组本来就是几个项目共用的）。
- **「调度」表加第四列「分组上限」**：只在 triage 行有意义；不写、留空就是 10；写了要是正整数。todo 行这一格留空（写了就报错，说 todo 不数分组）。`issues queues` 的输出多一个字段给出它（triage 时段是数字，todo 时段和空档是 null）。
- **「一轮最多 3 个」改成「一轮最多 `limit` 个」**：现在桌面端、magi 两份参考和 README 都写着每轮最多 3 个，跟「每轮新开 `limit` 个」冲突（本仓库白天上限 6）。

模块之间的消息不变（调度 → `issues queues` → 列分组 → 交出），只改数法，不配时序图。

同一行为的其他入口：

- 夜里 todo：**排除**，500fa23c 已改成每轮固定派 `limit` 个。
- magi：**纳入**，`magi.md`「怎么数开着的会话」「怎么交出 issue」照同一个公式改（magi 没有分组，按状态是 triage 的会话数）。
- `setup` 的两份 `ISSUE_TRACKER.md` 模板、本仓库 `ISSUE_TRACKER.md`：**纳入**，表头加「分组上限」列、说明改成「每轮最多新开几个；triage 分组里的会话总数不超过分组上限」。

## User Stories

1. 期望行为（对应问题 1）：白天的一轮，triage 分组里已有 N 个会话、表里 triage 上限 L、分组上限 C，调度新开 min(L, C − N) 个（不足就有几个开几个，≤ 0 不开）；汇报写「这一轮新开几个 / `limit`，triage 分组 N / C」。

## 实现决策

- **口径照人的原话**：「triage 也按照每轮开一个，但是triage这个section下面的总会话不能超过10个」；随后人选了「每轮取表里的上限」（例子新开 4 个）和「表里加一列，默认 10」（2026-11-22，raw `2026-11-22-dispatch-triage-per-round`）。
- **去掉「一轮最多 3 个」**：人选的例子是一轮新开 4 个，与 3 的硬上限矛盾，按人选的走，统一成 `limit`。
- **`issues.mjs`**：`parsePeriods` 读第四列（现在「further columns are notes」，改成第四列是分组上限、再往后才是备注；本机各项目的「调度」表都只有三列，不影响已有配置）；`DEFAULT_PERIODS` 的 triage 行带分组上限 10；`queues` 输出新字段 `sectionLimit`。不用 `cap` 这个词：`dispatch-by-period-doc.test.mjs` 禁止文档里再出现旧的 `cap`。
- **文档改动**：`issue-dispatch` 第 2、3、5 步与「汇报」；`claude-desktop.md`「怎么数开着的会话」「怎么交出 issue」；`magi.md` 同两条；两份 setup 模板、本仓库 `ISSUE_TRACKER.md`；README 的 `issue-dispatch` 一行。ADR-0065（原 spec `dispatch-day-night-modes`，11-22 已转成 ADR）里「派 triage 的时段」的订正跟 ADR-0025 一样，由 `/idea-loop:dreaming` 对账时标被取代。
- **插件版本**：idea-loop patch 一档（`REVIEW.md`：0.x 时改已有流程的行为升 patch，见 ADR-0089）。

## 测试决策

| 变的是什么 | 仪器 | 本次 |
|---|---|---|
| 纯逻辑、数据转换、状态机 | TDD 单元测试 | `parsePeriods` 读第四列、默认 10、todo 行写了报错；`queues` 给出 `sectionLimit` |
| API 契约（路由、schema、序列化） | TDD API 测试 | 不涉及 |
| DB schema、迁移、并发与事务语义 | 真 DB 测试 | 不涉及 |
| LLM 输出质量（prompt 改动） | eval | 改的是给 agent 读的规则，用文档测试钉住公式（见下）；不加 eval |
| 视觉正确性 | UI 实现环 | 不涉及 |
| 端到端用户流程 | 浏览器端到端测试 | 不涉及 |

- **seam**：两个。`issues.mjs` 的 `parsePeriods` / `queues`（`issues.test.mjs` 调）：抓得到列解析与默认值写错，漏掉调度会话照文档怎么算。调度正文与两份运行环境参考的文本（`dispatch-by-period-doc.test.mjs` 读）：抓得到公式、「一轮最多 `limit` 个」写错或旧写法残留，漏掉真实一轮的结果。
- **增量功能测试**：
  - 前置：表里 triage 行 `09:00–19:00 | triage | 6 |`（无第四列）。步骤：`issues queues docs --at=10:00`。期望：`limit` 6、`sectionLimit` 10。覆盖：期望行为 1。
  - 前置：triage 行第四列写 8。期望：`sectionLimit` 8。todo 行第四列写 5：报错，指出行号。
  - 文档测试：正文、桌面端、magi 里不再出现「空位 = `limit` − triage 分组里的会话数」「一轮最多 3 个」「每轮最多开 3 个」，出现 min(`limit`, 分组上限 − …) 的写法；用 main 上的文本会红。
- **照着谁写**：`issues.test.mjs` 里现有的 `parsePeriods` / `queues` 测试；`dispatch-by-period-doc.test.mjs` 里 500fa23c 改 todo 时加的断言。

## Out of scope

- 夜里 todo 的派法（500fa23c 已定）。
- 一个调度管所有项目（#386）。
- ADR-0025 里「triage 单独上限 3」、ADR-0065 里「派 triage 的时段」的订正：由 `/idea-loop:dreaming` 对账时标被取代。

## 关联

- raw：`2026-11-22-dispatch-triage-per-round`（本次的口径）。
- ADR-0065（`dispatch-day-night-modes`）：定了按时段派；本 spec 改它「派 triage 的时段」的空位算法。
- ADR-0025：triage 单独上限的来源，本 spec 取代其中「数 triage section 里的会话当上限」。
- 旧 PR #400：按 11-19 的口径两半一起改，main 后来另做了 todo 一半，跟 main 冲突；本分支已重做在 origin/main 68495e91 上，旧提交 76194736 留在本地分支 `backup/398-old-76194736`。
- #386：前提「几个项目共用夜里名额」已随 500fa23c 消失；白天分组上限 10 仍是跨项目共用的，先跑的项目先开，不另做协调（跟 ADR-0065 的「没做：跨项目协调 triage 上限」一样）。
