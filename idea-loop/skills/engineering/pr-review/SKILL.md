---
name: pr-review
description: 在一个 open 的 PR 上跑一轮两轴 review（Spec / Standards）并处理人的批示，或在人说合并时归档并合并它。implement 全部落地后、人说再跑一轮、人说合并时用。
---

**一次调用跑一轮。** 一轮看这个 issue 的 PR（`prs.md` 里的那个）。调用这个 skill 的会话是**编排者**：自己跑审查、处理条目、在会话里给人看汇报、派修复、人说合并时合并。审查这一步只读，做法在 [`references/run-a-round.md`](references/run-a-round.md)；修复归 `idea-loop:implementer`。一轮问什么、什么算问题在 [`references/review-standards.md`](references/review-standards.md)。

开工先用 Skill 工具调 `idea-loop:pr`（review loop 文件、汇报与 PR 描述的写法）。哪些条目不等人，照 `idea-loop:decision-rules`。往来都在会话里，PR 上不开 thread，不和人往来。改 spec、工单的提交一律单独 `commit` 到 home（`docs(spec): …` / `docs(tickets): …`）。

review loop 文件是 `.tmp/review-loop/<PR 号>.md`。`<docs>` 指 `<项目目录>/docs/`（项目目录：`idea-loop:wiki-conventions` 的「项目目录」）。**设计产物**指 `<docs>/design/tmp/<spec-slug>/` 下除 `research/` 以外的东西。

## 什么时候跑

- `idea-loop:implement` 全部落地、全部 PR 刚转 ready：第 1 轮。
- 「一轮之后往哪走」判出自动起下一轮。
- 人调 `/idea-loop:pr-review` 或说「再跑一轮」：随时，不受自动轮数上限约束，计入轮次。
- 人说合并：照 [`references/merge.md`](references/merge.md)。

## 前提

- PR 是 **ready**（open、不是 draft）。是 draft，说明工单没落地完或有等决定的事，回 `idea-loop:implement`。
- 回放排队的事 implement 进 review 前已核过。之后 `dyna pr loop check` 列出未处理的 `replay` 条目（有用例没过），先交给人，批示处理完再起这一轮。
- **PR 先合入最新主分支**：`git fetch`，把基准分支（`<项目目录>/DEVELOPMENT.md`「分支」）的最新 merge 进 PR 分支，不 rebase；已是最新就什么都不做。有冲突就解决，命令生成的文件（例：spec 索引）重新生成、不手拼，判断不了保留哪边的照 `idea-loop:decision-rules` 停下问人；推送，再等下面的 CI。
- **PR 的 head 上 CI 全绿（或没有检查）**：`gh pr checks <PR 号> --watch` 等；红了用 Skill 工具调 `idea-loop:implement`，看它的「等 CI」，照它处理。
- 集成 worktree 工作区干净（`git status --short --untracked-files=no` 为空），HEAD 已推送且等于 PR 的 head。
- `command -v codex` 有输出。没有，开跑前告诉人缺 `codex` 命令。

## 跑一轮

1. 轮次取 `dyna pr loop next .tmp/review-loop/<PR 号>.md review`（下文 `<PR 号>` 是这个 PR 的号）；工作目录 `.tmp/pr-review/<PR 号>/round-<N>/`。
2. 自己跑这一轮：机械检查、并行起 Spec 与 Standards 两个 Codex 进程、核实候选、写汇报，照 [`references/run-a-round.md`](references/run-a-round.md)。有设计产物时，起 Codex 的同一条消息里多起 ui-reviewer，先读 [`references/ui-walkthrough.md`](references/ui-walkthrough.md)。
3. 汇报写好（候选已过 `dyna pr candidates submit`），再往下。格式见 `idea-loop:pr` 的「Review 汇报」。
4. **先记文件**：把汇报原样追加进 review loop 文件为新条目。
5. **处理照规则的条目**（「处理条目」），不等人。
6. **补全**：汇报里「已按规则处理」每行的 `〔链接〕` 补成提交或 issue 链接，一个不剩，文件里的条目同步改成一字不差的同一份；没来得及落地的修复写「已派修，提交随后补上」。第 1 轮另把 implement 期间开的存量问题 issue 补进这一节：取自 review loop 文件各次停下的「已按规则处理」里带 issue 链接的行，原样列进来。
7. **给人看**：照 `idea-loop:pr` 的「在会话里给人看」按条目贴，「已按规则处理」在最前，每条文字后紧跟它的证据图。汇报里有缺词，念出来（概念加推荐叫法），问人要不要开一轮 `idea-loop:grill` 定下来。
8. 发一条推送通知：第几轮、几条已按规则处理、几条要你决定；未完成的轴或检查明说。

## 处理条目

条目来自两处：第 2 步标了「照规则」的（带依据和动作，依据已由 `dyna pr candidates submit` 校验，贴汇报之前就处理），和人在会话里的批示（先把原话逐字记进这一轮条目的「你的批示」，再逐条办）。边缘情形（只在兜底路径或罕见异常里出现、不丢东西）与依据冲突或没有的条目留给人（`idea-loop:decision-rules` 的「依据冲突或没有：停下问人」）。

| 动作 | 怎么做 | 链接记什么 | 被推翻时 |
|---|---|---|---|
| **修**、**恢复** | 回工单；不等落地，继续往下 | 追加那一格的提交；落地后补修复提交 | 同一工单再追加 `- [ ] review 第 <N> 轮 <编号>（推翻，<日期>）：<人要的样子>`，回工单；没落地的那格一并说清 |
| **同步改** | spec、工单、说明文字跟已定做法对不上，直接改（spec 里交代由来的历史段落保留，标明后来改了） | 那个提交 | 提交改回去，或按人的意思重写 |
| **接受并补记** | 代码不动，偏差补记进 spec 或工单（例外清单、验收标准、改过的路径） | 那个提交 | 同上 |
| **开 issue**（「进 backlog」） | 用 Skill 工具调 `idea-loop:issues`，看它的「开一个 issue」 | issue 链接 | issue 上留说明并关掉（`--reason "not planned"`），人要别的就照做 |
| **不修**（人批示） | 记下，下一轮不再报，除非有新证据 | | |

人批示除了上表这些动作，还有疑问、设计变更、带出上线前后的事、推翻、要求改写汇报几种：[references/other-directives.md](references/other-directives.md)。

全部处理完，在会话里回**一条**汇总，逐点说做了什么、带提交链接；同样的内容记进这一轮条目的「做了什么」，PR 描述 `your-todo` 里已决定的几项勾上。修复没落地之前不记「做了什么」；这一轮本来就没有修复，直接记「没有要修的」。

### 回工单

修复都走这一条，一处定义：

1. **找归属工单**。Spec 条目：它引用的那张。Standards 条目：对代码片段所在的行 `git blame` 找到引入它的 commit，`dyna spec ticket-of <commit>` 读出工单。UI 走查条目：改了那个状态或组件的工单（读各工单的「要建什么」，或对实现那处 blame 看 `Ticket:`）。都找不到（比如不带 trailer 的修复），问人归哪张。
2. 在那张工单的验收标准末尾追加 `- [ ] review 第 <N> 轮 <编号>（<日期>）：<应有的行为，或要遵守的规则原文>`，写行为，不抄审查者给的文件、行号。`commit` 到 home，消息 `docs(tickets): <NN> — review 第 <N> 轮 <编号>`。
3. 派 `idea-loop:implementer` 做这张工单：派工、核对、落地、回收用 Skill 工具调 `idea-loop:implement`，看它的「派工」「核对与落地」「回收」。它只做没勾的格，commit 带同一个 `Ticket:` trailer。同一张工单的几条一次写完再派，多张工单并行派；全部落地后推送。

## 设计变更

人接受了跟冻结画布不同的设计（接受实现，或自己改了主意）：读 [references/design-change.md](references/design-change.md)。

## 一轮之后往哪走

**前提：这一轮的条目都处理完。** 要修的都已落地并推送；`dyna pr loop check .tmp/review-loop/<PR 号>.md` 没有未处理的条目（含 `replay`）；并且逐题核过：对着汇报数「要你决定」，每道都在「你的批示」里找得到人的批示（接受 / 修 / 不修 / 开 issue / 疑问已答清）。`check` 只判整轮，代替不了逐题核对；核不全就回头问人缺的那几道。不成立就等批示、等落地，齐了再判。

前提成立，三选一：

1. **这一轮有修复**（只数「修」，照规则的和人批的都算）：`dyna pr loop next` 给的下一轮编号不超过 5（人触发的轮次也计入），先走完「前提」（合入最新主分支、推送、等 CI 绿），再自动起下一轮：会话里说一句「第 N 轮的修复已落地，自动起第 N+1 轮」，发推送通知，回到「跑一轮」。编号超过 5 就不自动起：第 5 轮的修复落地后停下，说「已跑满 5 轮，第 5 轮的修复还没审，要再跑或合并请直接说」，等人。
2. **没有修复，且没有要人定的事 → 不等人，交审核报告**。要人定的事：「要你决定」（含被降级的边缘情形）、未过的设计停点（冻结、`ui-measure` 瓶颈、归档设计档案的草稿过目，后者在人说合并后走，见 `references/merge.md` 的「合并前归档」）。`idea-loop:decision-rules`「护栏」里的不自己做：生产写操作（例：推迁移）、未勾的人验素材写进报告给人，合并只由人说。照 [`references/deliver.md`](references/deliver.md) 做，然后停下，人读报告、追问、说合并。`type:seo/*` 的 issue 例外：条件满足就不停下，自动合并（[`references/seo-auto-merge.md`](references/seo-auto-merge.md)）。
3. 其余：停下等人。
