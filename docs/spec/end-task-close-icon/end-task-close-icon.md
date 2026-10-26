---
type: spec
status: 完成
tags: [idea-loop, design, uiux-refine, design-reference]
summary: 设计参考加一条规则：结束整个任务的入口用 X 并写明结束什么，后退箭头只用于无害地回一步
related: ["[[confirm-only-on-loss]]"]
issues: [57]
---

# 设计参考：结束整个任务的入口用 X，不用后退箭头

## 验证

| issue | 结论 | 证据 |
|---|---|---|
| #57 idea-loop 设计参考：结束整个任务的入口用 X，不用后退箭头 | 存在 | 设计参考里没有任何一条讲结束入口该用什么图标，后退箭头和 X 的语义区别一处都没写，详情在「问题」 |

## 问题

### 1. 设计评审判不出「用后退箭头结束整个任务」是个问题

2026-10-26 对着主分支 `f5c569d`，全文搜了 `uiux-refine` 的设计参考（`references/design/` 下全部 16 份）和 `designer`、`ui-master`、`ui-reviewer` 三个 agent 定义里的 arrow / 箭头 / back / X / aria-label / tooltip。结果：

| 位置 | 现有说法 | 跟本条的关系 |
|---|---|---|
| `ui-craft-checklist.md` 的 Leave / end confirmations（#56 刚加的） | 每个 leave、end、close 入口（back、close、end session…）先问点下去会丢什么，再决定要不要确认 | 只管点下去之后要不要确认，不管入口长什么样 |
| `accessibility-baseline.md` 的 Text alternatives | icon-only 按钮要有 `aria-label` | 只要求有名字，没说名字要写明结束的是什么 |
| `heuristics-checklist.md` 第 3、4 条 | 每个流程都要有 undo / cancel / back 的出路；同义控件长得一样 | 没区分「回一步」和「结束整个任务」是两种含义 |

「arrow / 箭头」在这些文件里一次都没出现（唯一命中是 accessibility-baseline 里一句讲 icon toolbar 间距的话，无关）。例子：一个做题页左上角放一个后退箭头，点下去结束整场练习。照现有清单，designer 和 Gate 2 评审会检查它有没有无障碍名称、点下去会丢东西时有没有确认，这些都能过；清单里找不到一条依据把「这个箭头让人以为只是回上一页」判成 finding。

这条原则在 TOEFLAIR 做题页（PR #478，2026-10-18 上线）已经落地：左上角结束入口从返回箭头换成 X，悬停 / 聚焦提示「End practice」，无障碍名称同名。Harold 原话：「换成 x 符号，这样会让用户明白这是一个重视按钮而非后退按钮」。2026-10-20 dreaming 候选蒸馏时判定为通用设计原则，不进项目 `DESIGN.md`，所以只能落在插件的设计参考里。

复现材料：`.tmp/to-spec/end-task-close-icon/repro/grep.txt`（本地，不提交）。

### 根因

设计参考把离开 / 结束入口当成一类，只规定了点下去之后的保护（要不要确认），没规定入口图标承诺的是什么：后退箭头承诺「无害地回一步」，拿它结束整个任务，用户不会意识到这是一个要重视的按钮。

## 方案

designer 和 Gate 2 评审读的 `ui-craft-checklist.md`「Practical craft checklist」里，紧挨 Leave / end confirmations 多一条能对着画面逐个入口检查的条目：

- 先分清每个离开类入口点下去是「回一步」还是「结束整个任务」（放弃这场练习、退出整个流程、丢掉这次会话）。
- 结束整个任务的入口用关闭符号（X），不用后退箭头；用了后退箭头算一条 finding。
- 这个 X 配悬停 / 聚焦提示和无障碍名称，写明结束的是什么（如「End practice」），不只写「Close」。
- 后退箭头只留给真的回到上一步、且不放弃整个任务的入口。
- 点下去要不要确认，照旁边的 Leave / end confirmations 判，本条不重复。

同类入口：

- **纳入** `ui-craft-checklist.md` 的 Practical craft checklist：离开 / 结束入口的另一条规则 Leave / end confirmations 已经在这一节，图标语义跟它放在一起，评审过同一个入口时一次看完（依据：仓库已有做法，#56 定下的那条现存实例；审核时人看过设计参考的加载链和改放 `heuristics-checklist.md` Nielsen 第 4 条的另一选项后定下，原话「留在 ui-craft-checklist 的 Practical craft checklist，紧挨 Leave / end confirmations」）。两份清单都在 `static-ui-protocol` 的 G 阶段评审时才加载，落哪份都同样被读到，差别只在跟谁放一起。这一节开头那行目录同步加上。
- **排除** `heuristics-checklist.md`：issue 建议落在这里「和图标语义相关的条目放在一起」，但这份文件里没有图标语义的条目，它是 Nielsen 十条、认知负荷和五个视角的打分框架，第 3、4 条讲有没有出路、同义控件是否一致，跟本条不冲突；同一条规则只落一处，改动最小（依据：自己定的第 4 条；#56 的同类排除理由）。
- **排除** `accessibility-baseline.md`：它要求 icon-only 按钮有 `aria-label`，原样保留；「名称要写明结束的是什么」只对结束入口成立，写在新条目里。
- **排除** `ui-master` / `ui-reviewer` / `designer` 的定义：它们按参考文件判，不逐条列清单内容；改清单就够了。

## User Stories

只修问题、不加能力。

1. 期望行为（对应问题 1）：designer 在 Gate 2 照 `ui-craft-checklist.md` 过一个离开类入口时，清单要求它先判这个入口是回一步还是结束整个任务；结束整个任务却用后退箭头的，或 X 的提示和无障碍名称没写明结束什么的，清单能把它判成一条 finding；真的只回一步的后退箭头不算问题。

## 实现决策

- **只改一份参考文件**：`ui-craft-checklist.md` 的「Practical craft checklist」在 Leave / end confirmations 之前加一条 **End-task entries** 条目，内容即「方案」里五点，末尾一句 Why（箭头看起来像普通后退，用户不会意识到点下去会结束整场任务），格式照同节 Leave / end confirmations；英文写，跟这份文件其余条目一致（依据：该文件全文英文）。放在它之前，是因为评审过一个入口时先看它长什么样、再看点下去要不要确认。
- **节首目录同步**：这一节开头那行列举（Forms, touch, … leave / end confirmations, copy）加上 end-task entries。
- **不写 TOEFLAIR 的具体规则**：举例用「放弃这场练习 / 退出整个流程」「End practice」这类通用说法，不写做题页、不写 PR 号（依据：仓库 `AGENTS.md`「不硬编码 Toeflair：Toeflair 只作为举例出现」）。
- **不加机械检查**：一个入口是回一步还是结束整个任务，要看它点下去的行为，`design-lint.mjs` 的正则判不了，只进模型判断的清单（依据：`ui-craft-checklist.md` 开头写明这份文件放的是 regex 判不了的部分）。
- **不重写这一节的其它条目**：#56 已经按 `writing-for-agents` 重写过这一节，本条只加一条、改一行目录。

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
  - 前置：合并后的主分支。步骤：读 `ui-craft-checklist.md` 的 Practical craft checklist。期望：Leave / end confirmations 之前有一条 End-task entries，写明「先分清回一步还是结束整个任务 → 结束整个任务用 X、用箭头算 finding → X 的提示和无障碍名称写明结束什么 → 箭头只留给回一步 → 要不要确认看 Leave / end confirmations」；节首目录列了它；Leave / end confirmations 原文未动。覆盖：问题 1 的期望行为。
  - 步骤：`grep -rn 'Toeflair\|TOEFLAIR\|#478' idea-loop/skills/design/uiux-refine/references/design/ui-craft-checklist.md`。期望：无输出。
- **prompt / eval 变动**：无 prompt/eval 变动。
- **照着谁写**：同节的 Leave / end confirmations 条目（编号的检查步骤 + 一段 Why）。

## Out of scope

- `heuristics-checklist.md`：打分框架，没有图标语义的条目，规则只落一处。
- `accessibility-baseline.md` 的 icon-only `aria-label` 要求：原样保留。
- Leave / end confirmations 本身：要不要确认归它，本条不改。
- `design-lint.mjs` 的机械检查：回一步还是结束整个任务，regex 判不了。
- 设计 agent 的定义：按参考文件判，不用改。

## 关联

- 覆盖的 issue：#57 idea-loop 设计参考：结束整个任务的入口用 X，不用后退箭头。
- 相邻 spec：[[confirm-only-on-loss]]（完成，#56）同出 TOEFLAIR PR #478 与同一次 dreaming 蒸馏，已合进主分支，本条加在它那条之前、互相引用，不改它。[[design-md-write-entry]]（实现中）也改 `ui-craft-checklist.md`，改的是「DESIGN.md drift check」一节，不碰 Practical craft 一节，无重叠；两边先合的一方之后，另一方 rebase 即可。其余七份未完成的 spec（design-archive-sections、design-research-agent、dreaming-design-reconcile、idea-loop-seo、pr-review-report-followups、ui-state-archive、uiux-imagine-agent）都不提这份文件。
- 相邻 issue：查过 open 的 issue，没有别的讲结束入口或图标语义的。
- 相关 ADR：[[0002-design-loop-v2-imagine-refine]]（设计参考的来处），本条不改它定下的结构。
