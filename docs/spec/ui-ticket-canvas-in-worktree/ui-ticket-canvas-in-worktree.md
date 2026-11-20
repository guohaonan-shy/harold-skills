---
type: spec
tags: [idea-loop, implement, design]
summary: UI 工单参考里画布在不在执行方 worktree 的两处说法统一：画布在，delta 不在，都走 tmp 绝对路径
related: []
issues: [375]
---

# UI 工单参考：画布在不在执行方 worktree 里，两处说法统一

> #375 存在：`ui-tickets.md` 一处说画布「worktree 里就有」，另一处说 `tmp/`「你自己的 worktree 里没有它」，详情在「问题陈述」

## 问题陈述

### 1. 执行方读到两句互相矛盾的话

implementer（执行方）做 UI 工单时读 implement skill 的参考 `idea-loop/skills/engineering/implement/references/ui-tickets.md`。2026-11-20 对着 origin/main（`1e0c2b92`）核：

- 「输入」节第 9 行：画布「冻结时它提交在这个工作分支上，worktree 里就有」。
- 「设计档案与最小差异」节第 102 行：「`tmp/` 不进版本库，你自己的 worktree 里没有它，画布和最小差异都用这个绝对路径读写」。

哪句对：冻结时画布被强制提交在需求分支上（`uiux-refine/references/after-freeze.md` 第 6 行、`design-change-sync/SKILL.md` 第 56 行都是 `git add -f docs/design/tmp/<spec-slug>/canvas…`）；执行方的 worktree 对齐到派工时集成分支的起点 SHA（`agents/implementer.md`「起点」一步），所以 `canvas/` 在执行方 worktree 里**有**。最小差异 `delta/` 不提交，只在集成 worktree 里，执行方那里**没有**。第 102 行把两样混成一句，对 `canvas/` 说错了。

例子：PR #371 工单 02 的执行方（2026-11-18）在交回里指出这两句冲突，问自己 worktree 里到底有没有画布；行为没出错，因为两种读法下它都走派工给的 tmp 绝对路径。分拣证据见 issue #375 的「🤖 idea-loop：」评论（2026-11-19）。

### 根因

第 102 行是从精简前的执行方定义原样挪来的，写于画布还不提交的时候；冻结改成 `git add -f` 提交画布后，第 9 行跟着改了，这一句没改。

## 方案

改完，执行方读这份参考只得到一种说法：画布在自己 worktree 里也有一份，`delta/` 只在集成 worktree 里；两样都用派工给的 tmp 绝对路径读写。不改任何组件之间的消息，不画时序图。

- 第 102 行改成分开说两样：画布冻结时已提交，你的 worktree 里也有；`delta/` 和 `tmp/` 下其余没提交的东西只在集成 worktree 里。仍然要求画布和最小差异都用 tmp 绝对路径读写，理由写明：两样在同一处，读到的画布是集成分支上最新的那份（冻结后 `design-change-sync` 推上去的新版本不会自动进执行方已开好的 worktree）。
- 第 9 行「worktree 里就有」保留（它是对的），补半句指向「设计档案与最小差异」：读写仍用 tmp 绝对路径。

同一说法的其他入口：

- `agents/implementer.md` 的「输入」只列「tmp 绝对路径（UI 工单用）」，不说 worktree 里有没有：纳入核对，不用改。
- `implement/SKILL.md` 派工那句（「集成 worktree 里 `docs/design/tmp/<spec-slug>/` 的绝对路径」）：纳入核对，不用改。
- `wiki-conventions` 里 `tmp/` 的约定：不说执行方 worktree，排除。

## User Stories

只修问题，不加能力：

1. 期望行为（对应问题 1）：`ui-tickets.md` 里没有一句说执行方 worktree 里没有画布；画布在 worktree 里、`delta/` 不在，两处说法一致；画布和最小差异都用 tmp 绝对路径读写，并写明为什么。

## 实现决策

- **保留「都用绝对路径」，只改错的那半句**：依据是现有做法——`implement/SKILL.md` 派工时总给 tmp 绝对路径，`delta/` 只能写在集成 worktree 里（ui-tickets.md 同节「只写 tmp 路径下的 `delta/`」）。让画布也走同一路径，执行方不用分两处找；不选「删掉第 9 行『worktree 里就有』」，因为那句是事实。
- **改的是给 agent 读的参考**：对的杠杆是「输入」的准确性（读者是 implementer），不动 frontmatter、不动流程。
- **版本**：修说明里前后不一致，idea-loop `plugin.json` 升 patch（`REVIEW.md`「额外要求」）。

## 测试决策

| 变的是什么 | 仪器 | 本次 |
|---|---|---|
| 纯逻辑、数据转换、状态机 | TDD 单元测试 | 不涉及 |
| API 契约（路由、schema、序列化） | TDD API 测试 | 不涉及 |
| DB schema、迁移、并发与事务语义 | 真 DB 测试 | 不涉及 |
| LLM 输出质量（prompt 改动） | eval（确定性断言） | 改的是参考里的一句事实陈述，能机械判定（禁用的旧写法、必含的新写法），走文档检查，不做回放 |
| 视觉正确性 | UI 实现环 | 不涉及 |
| 端到端用户流程 | 浏览器端到端测试 | 不涉及 |

- **seam**：`ui-tickets.md` 的文字本身，用一个文档检查读它。能抓到：又写回「worktree 里没有」画布、两样混成一句、丢了理由；漏掉：执行方实际跑时是否还糊涂（要回放，不在这次验）。
- **增量功能测试**：
  - 前置：origin/main 上的 `ui-tickets.md`。步骤：跑新加的文档检查。期望：失败，报「仍说 worktree 里没有」。覆盖：期望行为 1。
  - 前置：改后的 `ui-tickets.md`。步骤：同上。期望：通过——全文不再有「worktree 里没有它」；「设计档案与最小差异」节同时写到画布已提交、`delta/` 只在集成 worktree、都用绝对路径读写及理由。覆盖：期望行为 1。
- **照着谁写**：`idea-loop/scripts/explorer-reads-impl-decisions-doc.test.mjs`。

## Out of scope

- 不改执行方读写画布的实际路径，也不改冻结时提交哪些文件。

## 关联

- 来源：PR #371 工单 02 的执行方交回；issue #375 分拣评论。
- 相邻未完成的 spec 与 issue：2026-11-20 查，`docs/spec/` 里提到 `ui-tickets.md` 的只有 implementer-start-point-non-destructive，它已合进 main、不改这两句，没有重叠；`gh issue list --state open --search ui-tickets` 只返回 #375。
