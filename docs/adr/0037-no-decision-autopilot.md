---
type: adr
status: 生效
tags: [idea-loop, issue-session, to-ticket, implement, pr-review]
summary: 实现阶段没有决定题就不停，只在生产操作和合并前停；交一份写给不知情者的审核报告
related: ["[[2026-10-30-issue-consolidation-grill]]"]
---

# ADR-0037 — 实现阶段没有决定题就一路做到 PR，只在生产操作和合并前停

> 由 spec `no-decision-autopilot` 蒸馏而来，该 spec 已删除。

## 1 背景（why）

实现阶段有四处写死的「停下等人」，而人在这些点上历来原样放行：

- `to-ticket` 切完工单要把切法摆给人、迭代到点头才落盘；已查到的记录里，人按推荐放行 9 次（Toeflair 3 次，本仓库 6 次），没有反例。
- `implement` 每次「没活了」都写停下汇报等批示，`review-loop.mjs` 的处理完判定对停下条目写死「总要人批示」；0 件要人定、无人验素材的汇报，人回「可以」至少 4 次。
- `pr-review` 一轮没有修复时「等人说合并或再跑一轮」。
- 「spec 翻完成、删工单」的 docs 提交在人说合并之后才推；workflow 的 `paths` 对 pull_request 按整个 PR 的 diff 判，这个只改 docs 的提交让整条 PR 的 CI 重跑，在一个 PR 里造成过三轮「CI 绿了，合并」→「其实还在跑」的往返。

## 2 决策（how）

- **停与不停照 `decision-rules` 的护栏**：只在有要人定的决定题、动生产（例：推迁移）、合并改了代码的 PR 时停；设计相关的停点（冻结、`ui-measure` 瓶颈、归档草稿过目）不在范围，照旧。
- **四处都加「没有要人定的就继续」的分支**：`to-ticket` 直接落盘，切法清单随交回进最后的审核报告；`implement` 的停下汇报无决定题时在条目末尾记「做了什么」，直接 `gh pr ready` 进 `pr-review`；`review-loop.mjs` 的停下条目与 review 轮一致，无「要你决定」且有「做了什么」即处理完；`pr-review` 一轮无修复、无要人定的事就不等人，交审核报告。
- **docs 提交提前**：删工单的提交在交报告之前推，等 CI 绿再交，人说合并就直接合。
- **范围放宽到所有 spec，包括碰 UI 的**：设计冻结之后的切票、实现都不停。人验素材不再中途停，收进审核报告：停下汇报仍列但不勾，`pr-review` 交报告时把没勾的素材按 evidence 的交付证据贴进 PR 描述，「要你做的事」逐项列出，人说不对就回工单，直接说合并视为看过。人的原话：「人验素材收进最终审核报告，实现中途不停」。
- **审核报告写进 PR 描述**，读者设定为没跟过这件事的人：问题、怎么修（照规则定的及依据）、怎么验证、顺带开的 issue、要你做的事。
- **顺带把 `pr-review` 规则按 `writing-for-agents` 精简**（行为不变）：这份改动给它加了「不等人」，正文已约 1.6 万字符且同一套动作写了几遍，放进同一个 PR 免得再冲突。
- 曾定的「根会话 / 子会话分工」随后作废：改为一个根一份 spec、一个会话从审核做到合并，本决策的结论不变（依据改成「审核时 grill 完」）。

## 3 结果（result）

- `idea-loop/skills/engineering/to-ticket/SKILL.md` 有「切法直接落盘，不停下」一节。
- `idea-loop/skills/engineering/implement/SKILL.md` 的停下步骤里，「都没有」分支不停、不推送通知，直接往下走。
- `idea-loop/scripts/review-loop.mjs` 对无「要你决定」的条目只看「做了什么」，由 `review-loop.test.mjs` 钉住。
- `idea-loop/skills/engineering/pr-review/SKILL.md` 的「一轮之后往哪走」有「不等人，交审核报告」，具体做法在 `references/deliver.md`（先推删工单的 docs 提交并等 CI 绿，再写审核报告），`references/merge.md` 不再等 CI。
- 回放用例 `implement-no-stop-without-decision`、`to-ticket-no-nod`、`review-no-decision-report` 在 `idea-loop/evals/retro/cases/`。
- 合并为 PR #171。

## 取代线索

- 实现阶段的会话结构（根 / 子会话）已被 issue 整合的决定改写，见 `ADR-0021`；不影响本 ADR 的停点结论。
- 与 ADR-0001、ADR-0002 无冲突。
