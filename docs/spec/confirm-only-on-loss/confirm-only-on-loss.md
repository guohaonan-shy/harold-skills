---
type: spec
status: 实现中
tags: [idea-loop, design, uiux-refine, design-reference]
summary: 设计参考加一条可检查的规则：离开 / 结束入口只在会丢用户成果时才弹确认
related: []
issues: [56]
---

# 设计参考：只有会丢东西时才弹确认

## 验证

| issue | 结论 | 证据 |
|---|---|---|
| #56 idea-loop 设计参考：只有会丢东西时才弹确认 | 存在 | 设计参考里只有「该确认时要确认」的规则，没有「没东西可丢就不弹」的反向规则，详情在「问题」 |

## 问题

### 1. 设计评审只会问「有没有确认」，不会问「这个确认守护了什么」

2026-10-22 对着主分支 `96d66f2` 逐份读了 `uiux-refine` 的设计参考（`references/design/` 下 `ui-craft-checklist.md`、`heuristics-checklist.md`、`design-core.md`），并全文搜了 idea-loop 里所有「confirm / 确认 / unsaved / navigating away」的出现处。跟离开、结束、破坏性操作的确认有关的规则一共四条，方向全是「要加确认或撤销」：

| 位置 | 原文要点 | 方向 |
|---|---|---|
| `ui-craft-checklist.md`「Practical craft checklist」的 Forms | warn before navigating away from an unsaved form | 有未保存内容时提示 |
| 同一节的 Destructive actions | require explicit confirmation or provide an undo window | 破坏性操作要确认或撤销 |
| `design-core.md`「Copy construction」 | Prefer undo over a confirmation dialog when recovery is safe | 能撤销就用撤销代替确认 |
| `heuristics-checklist.md` 第 3、5 条与 Casey 视角 | undo/cancel/back path…；destructive action with no confirmation or undo | 缺确认算问题 |

没有任何一条说「没有东西会丢时，不该弹确认」。例子：一道口语题还没开始答、用户点左上角结束，照现有清单，designer 和 Gate 2 评审看到「结束 = 放弃整个任务」，最稳的做法是一律加确认框；清单里找不到一条能把这个确认框判成问题的依据。

这条原则在 TOEFLAIR 做题页（PR #478，2026-10-18 上线）已经落地：口语题交过至少一题或正在听题 / 录音、写作题输入框有非空白文字时才弹确认，其余直接离开。2026-10-20 dreaming 候选蒸馏时，Harold 判定它属于通用设计原则，不进项目 `DESIGN.md`，所以只能落在插件的设计参考里。

### 根因

设计参考把「确认」只当成防误操作的保险，只写了缺确认的失败，没写多余确认的失败：守护不了任何东西的确认框会训练用户不看就点，等真会丢东西的那次也拦不住。

## 方案

designer 和 Gate 2 评审拿到的 `ui-craft-checklist.md`「Practical craft checklist」里，多一条能对着画面逐个入口检查的条目：

- 每个离开 / 结束 / 关闭入口，先问「此刻点下去会丢掉用户的什么」：已交的答案、输入框里的非空白内容、进行中的录音或上传这类。
- 有会丢的东西：要确认（或能撤销就撤销，沿用 `design-core.md` 的 undo-over-confirm）。
- 没有会丢的东西：直接执行，不弹确认。弹了算一条 finding。
- 「会不会丢」按状态判，不按入口判：同一个入口在空状态和有内容的状态下表现不同，验收矩阵里两种状态都要看。

现有 Forms 那句「warn before navigating away from an unsaved form」是这条规则的一个特例，改成指向新条目，不再单独成句，免得两处说法以后走岔。

同类入口：

- **纳入** `ui-craft-checklist.md` 的 Practical craft checklist：已有 Forms 的离开提示和 Destructive actions 两条都在这一节，规则跟它们放在一起（依据：产品已有统一做法，这两条现存实例）。
- **排除** `heuristics-checklist.md`：它是按 Nielsen 十条打分的框架，第 3、5 条讲的是缺出路、缺预防，跟本条不冲突；同一条规则只落一处，改动最小。
- **排除** `design-core.md`：undo-over-confirm 讲「有东西可丢时用哪种保护」，本条讲「什么时候要保护」，前者原样保留，新条目引用它。
- **排除** `ui-master` / `ui-reviewer` 的定义：它们不逐条列清单内容，按参考文件判；改清单就够了。

## User Stories

只修问题、不加能力。

1. 期望行为（对应问题 1）：designer 在 Gate 2 照 `ui-craft-checklist.md` 过一个离开 / 结束入口时，清单要求它写出「此刻会丢什么」；什么都不丢却弹了确认的，清单能把它判成一条 finding，有东西会丢却没确认的，仍然判成 finding。

## 实现决策

- **只改一份参考文件**：`ui-craft-checklist.md` 的「Practical craft checklist」加一条 **Leave / end confirmations** 条目，内容即「方案」里四点，英文写，跟这份文件的其余条目一致（依据：该文件全文英文）。
- **Forms 那句改成引用**：「warn before navigating away from an unsaved form」改成指向新条目，语义不变。
- **Destructive actions 那条加一句交叉引用**：破坏性操作的确认同样只在会丢东西时才有意义；不改它原有的要求。
- **落点那一节按 `writing-for-agents` 重写**：新条目和它所在的 Practical craft checklist 一节（含 Forms、Destructive actions 等既有条目）照 `idea-loop:writing-for-agents` 的写法优化，语义不变；文件其余各节不动（依据：人的原话「ticket内部要写这块的规则要用/writing-for-agent 对对应的文件内容进行优化」，范围选「只改落点那一节」）。
- **不写 TOEFLAIR 的具体规则**：条目里举例用「已交的答案 / 非空白输入 / 进行中的录音」这类通用说法，不写「口语题交过至少一题」这样的产品细节（依据：仓库 `AGENTS.md`「不硬编码 Toeflair：Toeflair 只作为举例出现」）。
- **不加机械检查**：「会不会丢」要看状态和业务，`design-lint.mjs` 的正则判不了，只进模型判断的清单（依据：`ui-craft-checklist.md` 开头写明这份文件放的是 regex 判不了的部分）。

## 技术方案总览

### 后端

不涉及。

### 前端内部

不涉及。

### 前端交互

不涉及：改的是插件给设计 agent 读的参考文档，不碰任何界面。

## 测试决策

| 变的是什么 | 仪器 | 本次 |
|---|---|---|
| 纯逻辑、数据转换、状态机 | TDD 单元测试 | 不涉及 |
| API 契约（路由、schema、序列化） | TDD API 测试 | 不涉及 |
| DB schema、迁移、并发与事务语义 | 真 DB 测试 | 不涉及 |
| LLM 输出质量（prompt 改动） | eval（确定性断言） | 不涉及：本仓库 `AGENTS.md` §5 规定设计类 skill 跳过 quantitative eval |
| 视觉正确性 | UI 实现环 | 不涉及 |
| 端到端用户流程 | 浏览器端到端测试 | 不涉及 |

- **seam**：`ui-craft-checklist.md` 这份文件本身，读者是 designer 和 Gate 2 评审。它能抓到条目在不在、说法跟同节其他条目一致不一致；漏掉的是 agent 实际照着用时判得准不准，那只能在下一次真实设计会话里看。
- **增量功能测试**：
  - 前置：合并后的主分支。步骤：读 `ui-craft-checklist.md` 的 Practical craft checklist。期望：有一条 Leave / end confirmations，写明「先问会丢什么 → 有就确认或撤销 → 没有就直接执行，弹了算 finding → 按状态判」；Forms 那句指向它；`design-core.md` 的 undo-over-confirm 原样未动。覆盖：问题 1 的期望行为。
  - 步骤：`grep -rn 'Toeflair\|TOEFLAIR' idea-loop/skills/design/uiux-refine/references/design/ui-craft-checklist.md`。期望：无输出。
- **prompt / eval 变动**：无 prompt/eval 变动。
- **照着谁写**：同节已有的 Destructive actions 条目（一条规则 + 交叉引用 `design-core.md`）。

## Out of scope

- `heuristics-checklist.md`：打分框架，第 3、5 条与本条不冲突，规则只落一处。
- `design-core.md` 的 undo-over-confirm：讲的是保护方式，原样保留。
- `design-lint.mjs` 的机械检查：「会不会丢」regex 判不了。
- 确认框本身的文案、按钮写法：`design-core.md` 的「Copy construction」已覆盖（verb + object、destructive-confirm 语气）。

## 关联

- 覆盖的 issue：#56 idea-loop 设计参考：只有会丢东西时才弹确认。
- 相邻 issue：#57 idea-loop 设计参考：结束整个任务的入口用 X，不用后退箭头。同出 TOEFLAIR PR #478 与同一次 dreaming 蒸馏，讲的是结束入口的图标语义，跟本条没有规则重叠；它建议落在 `heuristics-checklist.md`，本条落在 `ui-craft-checklist.md`，不改同一处，先后无依赖。
- 相邻 spec：查过 `docs/spec/` 下未完成的七份。[[design-md-write-entry]]（实现中）也改 `ui-craft-checklist.md`，改的是「DESIGN.md drift check」一节里「经 `design-modeling`」的说法，不碰 Practical craft 一节，规则无重叠；两边先合的一方之后，另一方 rebase 即可。其余六份不碰这份文件。
- 相关 ADR：[[0002-design-loop-v2-imagine-refine]]（设计参考的来处），本条不改它定下的结构。
