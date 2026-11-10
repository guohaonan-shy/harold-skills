---
type: adr
status: 生效
tags: [design, pr-review, dreaming, canvas-truth]
summary: 冻结后画布是唯一设计真相、设计变更由 designer 改；删合并前钩子；dreaming 拆成编排者加钉模型的专职 agent
related: ["[[0002-design-loop-v2-imagine-refine]]", "[[2026-10-23-design-truth-after-freeze]]"]
---

# ADR-0010 — 冻结后画布是唯一设计真相；dreaming 只编排，对账交给专职 agent

> 由 spec `canvas-truth-dreaming-agents` 蒸馏而来，该 spec 已删除。

## 1 背景（why）

issue #55 的原方向是「ui-reviewer 每轮照实现改写档案差异 `delta/`」。审核会话里被人推翻：ui-reviewer 本来就是设计师式的走查，只报问题；真相不是代码，而是冻结的设计。要解决的是冻结之后设计变了、没人更新设计稿：冻结时同时交出画布 `canvas/` 和照画布抄出来的 `delta/`，之后 designer 不再出现，人在 review 里接受了实现与设计的差异，由编排者手改 `delta/`，画布不动，三处各说各的。

另有三个问题：UI 审查与代码审查串行；合并前钩子守的是 pr-review 合并步骤里本来就有的归档，且拦不住网页上点合并；dreaming 在一个会话里自己做完所有对账，模型与思考强度钉不住，候选蒸馏与 `DESIGN.md` 对账又各自提改同一份文件。

## 2 决策（how）

- **冻结只交画布和冻结记录**，不再写 `delta/`（人原话：「不需要分的这么细……而不是维护多个真相源」）。冻结记录多一节「冻结后的变更」。`delta/` 只在合并前由 ui-reviewer 的归档模式从最终画布加实现整份写出；没有设计稿的 UI 改动没有画布，实现者仍在 `delta/` 记最小差异。
- **设计变更由 designer 改画布，ui-master 评分，编排者提交**。来源三种：review 里接受实现、实现者做不下去而人接受改法、人改主意。designer 复用同一份定义，多一种任务「设计变更」，只改受影响的格子；评分沿用 refine 的评分脚本与停止判定。人不再单独看新画的那几格，实现出来后在 review 里看到。
- **ui-reviewer 每轮只走查**，不改画布、不改 `delta/`、不判改哪边；跟 pr-reviewer 同时起，pr-reviewer 在同一个 20 分钟预算内等发现文件，到时没有就把 UI 一轴记为未完成。选项改成「改实现」与「接受实现，走设计变更」。
- **删合并前钩子**，归档是 pr-review 合并步骤里的一步；绕过 pr-review 的合并由 dreaming 的「漏归档」行兜底（已知缺口：网页上点合并会绕过）。
- **dreaming 拆成编排者 + 专职 agent**：三个互不依赖的只读 agent 并行起，对 `DESIGN.md` 的一切修改合成一个 agent，避免提互相打架的修改。模型与思考强度钉在各自定义里。`CLAUDE.md` 与 `AGENTS.md` 从扫描范围拿掉，`GLOSSARY.md` 与 `REVIEW.md` 纳入。
- **dreaming 定时跑，截图对账做增量**：只对上次成功执行以来代码动过的页面、组件与它们直接 import 的文件牵到的状态做；人说「全量」或没有基准点才全量；源码波每次全量。

## 3 结果（result）

- 钩子：`idea-loop/hooks/hooks.json` 的 PreToolUse 下只剩 SEO 检查钩子，合并前钩子脚本已不存在。
- 归档：`idea-loop:pr-review` 的 `references/merge.md` 把归档写为合并步骤，并写明网页合并的缺口由 dreaming 兜底。
- 设计变更：`idea-loop/agents/designer.md` 有任务「设计变更」；步骤抽成独立 skill `idea-loop:design-change-sync`，`implement` 与 `pr-review` 会话遇到设计变更都调它；`uiux-refine` 的 `references/freeze.md` 写明冻结不写 `delta/`。
- 走查：`idea-loop/agents/ui-reviewer.md` 三种模式为每轮走查、归档、对账（sonnet · high）；`pr-review` 同一条消息里起它与 pr-reviewer。
- dreaming：`skills/productivity/dreaming/SKILL.md` 只编排；agent 为 `idea-loop:adr-reconciler`（sonnet · high，spec → ADR 与文档过期）、`idea-loop:design-steward`（opus · high，候选蒸馏与 `DESIGN.md` 对账）、`idea-loop:ui-reviewer` 的对账模式（sonnet · high）。
- 漏归档：`dreaming/references/missed-archive.md`，提议表多一类行 `漏归档`（处置 补归档 · 丢弃），`scripts/proposal-table-check.mjs` 认它。
- 增量：`dreaming/references/incremental-scope.md`；档案查询多一种问法 `affected <提交>`（CLI 与 MCP 工具 `design_affected`）；定时任务由 `/idea-loop:setup` 建，见 `setup/references/weekly-dreaming.md`。
- 合并时（PR #90）「真实需求端到端跑一遍」没验成，留待下一个碰 UI 的需求；此后是否跑过本次未查。

## 4 与其他决策的关系

- 改掉了 ADR-0002 所描述的前向环里冻结产物的内容：冻结不再带 `delta/`（ADR-0002 本身没有写 `delta/`，不构成对某一节的取代）。
- 取代了 `ui-state-archive` 规划里「冻结时写 `delta/`、合并前钩子」两点。
- 后续 `design-change-sync` 抽成独立 skill，是对本决策「设计变更」步骤的搬迁，规则不变。
