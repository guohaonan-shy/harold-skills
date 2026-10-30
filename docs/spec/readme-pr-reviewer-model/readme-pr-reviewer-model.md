---
type: spec
status: 完成
tags: [idea-loop, readme, pr-review, agents]
summary: idea-loop README 目录树里 pr-reviewer 的模型与思考强度改成跟定义一致（opus · high）
related: ["[[pr-review-report-followups]]"]
issues: [89]
---

# idea-loop README：pr-reviewer 的模型与思考强度跟定义对齐

## 验证

| issue | 结论 | 证据 |
|---|---|---|
| #89 | 存在 | README 目录树 `agents/pr-reviewer.md` 那一行写 `sonnet` alias、effort xhigh，定义的 frontmatter 是 `model: opus`、`effort: high`；详情在「问题」 |

## 问题

### 1 读 README 的人会以为 pr-reviewer 跑在 sonnet · xhigh 上

2026-10-31 对着 `origin/main`（2368079）核：`idea-loop/README.md` 目录树里 `agents/` 下每个 agent 一行，写着它的模型别名和思考强度。`pr-reviewer.md` 那一行写「`sonnet` alias, effort xhigh」；`idea-loop/agents/pr-reviewer.md` 的 frontmatter 是 `model: opus`、`effort: high`。逐个比对 `agents/` 下全部 15 个定义，只有这一行对不上，其余 14 行（uiux-imaginer、designer、uiux-researcher、ui-master、implementer、ui-reviewer、adr-reconciler、design-steward、explorer 和五个 seo 方向 agent）都跟定义一致。

例子：一个想知道 review 用什么模型的人读 README，得到「sonnet、xhigh」；实际每轮 review 起的是 opus、high。

复现材料：`.tmp/to-spec/readme-pr-reviewer-model/repro/compare.txt`

### 根因

定义在 ffa600e（2026-10-21，「按 writing-for-agents 审查全部 skill 与 agent」）里从 `sonnet` / `xhigh` 改成了 `opus` / `high`，同一个提交改了 README 的 pr-review 一行，但目录树里 `pr-reviewer.md` 那一行没跟着改。

## 方案

README 目录树里 `pr-reviewer.md` 那一行改成「`opus` alias, effort high」，这一行别的内容不动。读 README 的人得到的模型和思考强度，由 `agents/pr-reviewer.md` 的 frontmatter 决定。

同类入口：

- README 里其余 14 个 agent 的行：已核对一致，不改。
- README 的 skill 表里 `/idea-loop:pr-review` 那一行：不写模型，不涉及。
- README 末尾「Why the refine models are pinned」一段：只讲 ui-master 与 designer，不涉及。

## User Stories

只修问题，不画树。

1. 期望行为（对应问题 1）：README 目录树 `pr-reviewer.md` 那一行写的模型别名与思考强度，跟 `agents/pr-reviewer.md` 的 frontmatter 一致（`opus`、high）。

## 实现决策

### 以定义为准，改 README

定义是运行时真相（Claude Code 起 agent 时读的是 frontmatter），并且它的改动出自一个有意的提交（ffa600e 的提交说明写着按 writing-for-agents 审查全部 agent），README 是落下的那一处。依据：`idea-loop/AGENTS.md` 与仓库 AGENTS.md「改了某个 plugin 的 … agent … 同步改的是它自己的 README.md」。

## 技术方案总览

### 后端

不涉及。

### 前端内部

不涉及。

### 前端交互

不涉及。

## 测试决策

| 变的是什么 | 仪器 | 本次 |
|---|---|---|
| 纯逻辑、数据转换、状态机 | TDD 单元测试 | 不涉及 |
| API 契约（路由、schema、序列化） | TDD API 测试 | 不涉及 |
| DB schema、迁移、并发与事务语义 | 真 DB 测试 | 不涉及 |
| LLM 输出质量（prompt 改动） | eval（确定性断言） | 不涉及：README 不进任何 agent 的提示词 |
| 视觉正确性 | UI 实现环 | 不涉及 |
| 端到端用户流程 | 浏览器端到端测试 | 不涉及 |

- **seam**：README 目录树的文字本身。验证是一次逐个比对：对 `agents/` 下每个定义取 `model` / `effort`，跟 README 目录树里对应那一行的别名和 effort 比，全部一致才算过。能抓到任何一行对不上；抓不到目录树以外的段落里提到的模型。
- **增量功能测试**：前置：改完的分支。步骤：打开 `idea-loop/README.md` 目录树找 `pr-reviewer.md` 那一行，对照 `idea-loop/agents/pr-reviewer.md` 的 frontmatter。期望：都是 `opus`、high；另外 14 行照旧一致。覆盖：期望行为 1。
- **prompt / eval 变动**：无 prompt/eval 变动。
- **照着谁写**：不加测试，不需要先例。

## Out of scope

- 加一个机械检查，防 README 与 agent 定义再漂移：这是第一次出现、只一行，单独做检查的成本高于它防的东西；再出现时另开 issue。
- 改 pr-reviewer 的模型或思考强度本身：定义是有意定的，这份 spec 不重开它。

## 关联

- 覆盖的 issue：#89 idea-loop README：目录树里 pr-reviewer 的模型写成 sonnet · xhigh，定义是 opus · high
- 发现于 #55 的实现（spec canvas-truth-dreaming-agents，工单 03），与那张工单无关。
- 相邻还没完成的：[[pr-review-report-followups]]（实现中，#34）会同步 README 里 idea-loop 的描述，但不碰 agent 的模型行，无重叠，谁先合都不冲突；其余实现中的 spec（design-archive-sections、design-md-write-entry、design-research-agent、dreaming-design-reconcile、ui-state-archive、uiux-imagine-agent）与正式的 idea-loop-seo 都不碰这一行。没有开着的 PR 改 `idea-loop/README.md`。
