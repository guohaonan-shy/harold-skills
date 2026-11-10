---
type: adr
status: 生效
tags: [idea-loop, implement, implementer, issue-session]
summary: 保留 implementer 只改定义：按工单挑 skill、读写法规范、卡住的工单叫回原执行方；进实现前压缩已撤
related: ["[[149]]"]
---

# ADR-0039 — implementer：按工单挑 skill、读写法规范、复用原执行方

> 由 spec `implementer-reuse-and-compact` 蒸馏而来，该 spec 已删除。

## 1 背景（why）

三件事指向同一个执行方 `idea-loop:implementer`：

- 它的定义写死开工先调 `wiki-conventions`、`tdd`、`decision-rules` 三个 skill，并规定 spec「只读测试决策」。工单要用别的 skill（写站点文章调 `seo-writing`、改 skill 文档调 `writing-for-agents`），只能切票时手写进工单；内容 brief 在 spec 的「方案」里，工单要补一句「可以读 brief」。本机会话记录里它调那三个固定 skill 各约 215 次，调 `writing-for-agents` 32 次、`seo-writing` 4 次。
- 它不读目标仓库的 `CODING_STANDARDS.md` 和该文件链接到的写法规范，要等 review 的 Standards 轴审出来，再派一次修。
- 工单卡住、人做完决定后，接着做的是一个新执行方：上一个为什么卡住、看过哪些代码都得重新摸；原执行方的 id 也没记在任何地方。

另有一个提议是编排者进 implement 时背着整段审核历史（中位约 23 万 token），要求进实现前压缩上下文。

## 2 决策（how）

- **保留 implementer，只改它的定义。** issue 原提议删掉这个 agent、改派通用子代理加薄提示词；人的原话：「算了，我觉得先不删除implementer吧」。模型、思考强度和派工方式不动。
- **开工调哪些 skill**：只留 `decision-rules` 为必调（「停，还是延后」整节引用它）；`wiki-conventions`、`tdd` 等改成看工单挑，定义里写一句怎么挑并给几个例子，例子不是清单。
- **spec 全文可读，范围以工单为准**：spec 里有、工单没要的不做；越界有 review 的 Spec 轴兜底。
- **开工前读写法规范**：照 review 的 Standards 轴同一套读法（`CODING_STANDARDS.md`、`REVIEW.md`、`AGENTS.md` / `CLAUDE.md` 及其链接的文档，`@` 导入要显式去读），并先在 `CODING_STANDARDS.md` 的「链接」里找出管这张工单所改文件类型的那一条，链接指到 skill 目录就读或调它。
- **卡住的工单：原执行方联系得上就叫回。** `pending.md` 每条多记原执行方的 agent id；人回复并把决定写进工单后，先用 `SendMessage` 只给指针叫回它，并让它先合进集成分支的最新提交；报错或没记 id 才新起一个执行方、从半成品分支接上。已知代价（人知情后选的）：叫回来的执行方带着旧上下文，隔很久缓存过期可能比新起更贵，所以新起的分支保留作兜底。已经落地的工单（人验反馈、review 的「修」）照旧新起，因为那时 worktree 已回收、返工往往隔几小时。
- **to-ticket 落盘后把工单和 spec 提交进当前分支**：执行方的 worktree 从这条分支切出，不提交就读不到工单（人的决定：在同一个 PR 里修，不另开 issue）。
- **进实现前压缩上下文：先定了（停点放在切完工单之后、让人复制一条填好的 `/compact`），随后撤销。** 依据是当时「实现放子会话」的结构；该结构被推翻后，人定下全在一个会话里，上下文问题等真的碰到再说，#153 关成 not planned。

## 3 结果（result）

- `idea-loop/agents/implementer.md` 仍在树上，开工只必调 `decision-rules`，其余 skill 看工单挑，「输入」里写 spec 全文可读，「开工前」第 5 步读写法规范，并说明可能被 `SendMessage` 叫回。
- `idea-loop/skills/engineering/implement/SKILL.md` 的 pending 账本记 agent id，「重派」先叫回原执行方、叫不回再新起。
- `idea-loop/skills/engineering/to-ticket/SKILL.md` 落盘后提交工单和 spec；`issue-session` 里没有压缩停点。
- 文本断言：`idea-loop/scripts/implementer-standards-doc.test.mjs`、`implement-reuse-blocked-doc.test.mjs`；回放用例 `idea-loop/evals/retro/cases/implementer-reads-standards`。
- 合并为 PR #162。

## 取代线索

- 对应 issue 标题仍写「去掉 implementer agent」，已被本决定改写为保留；以本 ADR 和树上的 `idea-loop/agents/implementer.md` 为准。
- 压缩停点的撤销依据来自 issue 整合的决定，见 `ADR-0021`。
- 与 ADR-0001、ADR-0002 无冲突。
