---
type: adr
status: 生效
tags: [idea-loop, readme, pr-review, agents]
summary: README 目录树里 agent 的模型与思考强度以 agents/ 下的定义为准，pr-reviewer 那一行改成 opus · high
related: ["[[89]]"]
---

# ADR-0041 — README 里 pr-reviewer 的模型与思考强度跟定义对齐

> 由 spec `readme-pr-reviewer-model` 蒸馏而来，该 spec 已删除。

## 1 背景（why）

`idea-loop/README.md` 目录树里 `agents/` 下每个 agent 一行，写着它的模型别名和思考强度。`pr-reviewer.md` 那一行写「`sonnet` alias, effort xhigh」，而 `idea-loop/agents/pr-reviewer.md` 的 frontmatter 是 `model: opus`、`effort: high`。当时逐个比对全部 15 个定义，只有这一行对不上。例子：想知道 review 用什么模型的人读 README 得到「sonnet、xhigh」，实际每轮 review 起的是 opus、high。

原因是一个提交（按 `writing-for-agents` 审查全部 skill 与 agent）把定义改成了 opus / high，同一提交改了 README 的 pr-review 一行，目录树里这一行漏了。

## 2 决策（how）

- **以定义为准，改 README。** 定义的 frontmatter 是运行时真相（Claude Code 起 agent 时读它），改动出自有意的提交；README 是落下的那一处。依据是仓库 AGENTS.md「改了 plugin 的 agent，同步改它自己的 README」。
- **只改这一行**：其余 14 行已核对一致，README 的 skill 表和「Why the refine models are pinned」一段不涉及。
- **不加机械检查防再漂移**：第一次出现、只一行，单独做检查的成本高于它防的东西；再出现时另开 issue。
- **不重开 pr-reviewer 的模型选择**，定义是有意定的。

## 3 结果（result）

- `idea-loop/README.md` 目录树里 `pr-reviewer.md` 一行现写 `opus` alias, effort high，与 `idea-loop/agents/pr-reviewer.md` 的 frontmatter 一致。
- 合并为 PR #193，issue #89 已关闭。

## 取代线索

无。
