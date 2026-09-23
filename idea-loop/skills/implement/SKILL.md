---
name: implement
description: 实现一张已经定好的 ticket。不重开方案，只把它变成一个 commit。
---

# Implement

把**已经决定好**的工作变成代码。

**不重开方案。** 没有访谈环节，没有重新设计的机会——上游定下来的东西就是这次的不可变输入。要改方案，回 `grill`。

> 先读一次 `../../references/wiki-conventions.md`（目录与状态约定）和 `../../references/tdd.md`（循环的规矩、seam、mock 边界）。

## 一次一张 ticket，一个只装着它的上下文

一次调用做一张，做完就停。人的节奏是 `/clear` → 做这一张 → commit → `/clear`；派出来的执行方是一张 ticket = 一个隔离工作区 = 一次调用，做完交还。两条路满足的是同一条前置——**动手的这个上下文里只有这一张 ticket**。

> **出处，以及一处上游的自相矛盾。** 这条节奏来自上游作者的文章（`aihero.dev/skills-implement`：「clear context, implement one ticket, commit, clear again」、「One run covers one ticket」，以及被直接问到能否一次指向全部 ticket 或并行跑几个时的回答「One invocation, one ticket」），**上游的 `SKILL.md` 本身一个字都没写**。而上游那份 description 写的是「a spec or **set of tickets**」—— 复数，与文章相反。本 skill 取文章那一边，并把约束写进正文，因为约束住在会被加载的文件里才起作用。
>
> **这条前置有两种满足方式，本 skill 早先只认其中一种。** `/clear` 是人的动作，模型清不了自己的上下文——所以它曾经对模型不可见（`disable-model-invocation`）。但派一个新的执行方同样得到一个只装着这一张 ticket 的上下文，而且更干净：连"上一张做了什么"都不在里面。**放开的是"谁能调"，不是这条前置本身**——无论哪条路，带着一屁股无关上下文来做这张 ticket 都仍然是错的。

拿起 ticket 的这个会话**从没见过那份 spec**——这不是缺陷，是设计：ticket 的尺寸约束（塞得进一个全新上下文窗口）和那几条禁令（禁文件路径、禁代码片段、描述行为不描述过程）都是为此。所以**照 ticket 说的做，不要去把整份 spec 读回来"补充理解"**——真缺了什么，那是 ticket 写得不够，回去补 ticket。

**前提不成立就停。** 撞到 ticket 没交代、而且不是查一下代码就能定的东西（"这个边界情况算不算 in scope"、"ticket 描述的现状跟代码对不上"），**停下来把缺的是什么说清楚再交还**——人在就问人，是被派来的就回报给调用方。不要自己拍一个往下做：这一条是执行方替代不了人在场追问的唯一方式，也是"一张 ticket 一次调用"能被安全自动派发的前提。

例外只有一个：**spec 的 §5 测试决策要读**，它说明这一刀该用哪种仪器验（见下）。

## 开工前

1. **确认在目标分支上。** 这个 skill 不建分支、不切分支。
2. **设计冻结闸门**：ticket 的 `设计冻结` 那行写着 `⛔ 未冻结` 就**停**——动 UI 的活要先有冻结的设计。
3. **确认 blocker 都完成了**（ticket 的 `Blocked by`）。

## 做

**在事先谈拢的 seam 上跑 TDD。** 哪些改动该用 TDD、哪些该用别的仪器，spec §5 的矩阵已经答过了——查表，不要临场判断：

| 变的是什么 | 仪器 |
|---|---|
| 纯逻辑 / 数据转换 | TDD 单元 |
| API 契约 | TDD API 测试（走 ASGI） |
| DB schema / 迁移 / 事务语义 | **真 DB** 测试 |
| LLM 输出质量 | eval（`backend/evals/`） |
| 视觉正确性 | **UI 实现环**（`../../references/ui-implementation-standard.md` + `scripts/ui-measure.mjs`；以冻结的 HTML 画布为真值，你的实现为待验证的候选） |
| 端到端流程 | `qa:*` |

循环的规矩、反模式、mock 边界在 `../../references/tdd.md`。**新写的测试守「只在系统边界 mock」**——存量不守，别照抄存量。

**UI ticket 多一道环**，形状仍是红绿，裁判是脚本不是 agent：读 `../../references/ui-implementation-standard.md`，把冻结的画布整理成项目自己 primitives 的组件树，然后按验收矩阵跑测量脚本——它在同一个浏览器里开两个 tab 逐格比对，输出带严重度的 finding。**照 finding 改、再跑，直到全绿或脚本判 plateau**（同一批 finding 两轮不变）。plateau 就停下交人，并说清残留差异是实现问题还是设计决策；后者回 `uiux-refine` 弯一下并记 ledger，**不在这里硬磨**。这一环在 TDD 循环里主动跑，**不**挂在每次写文件的 hook 上（要 dev server、秒级、半成品假红）；收工那道检查只查「最后一轮是绿的」。

过程中：

- **常跑 typecheck 和单个测试文件**（快反馈）。命令用目标仓库 `REVIEW.md`（Verification paths）与 CI 声明的那几条，
  不要凭记忆写——review 那一环跑的也是同一批命令。
- **全量套件在最后跑一次**，同样用仓库声明的命令。
- ticket 的**「选中的存量回归」**那节列的用例，也要跑。

## 收工

1. **先把 ticket 的验收标准逐条勾上**（`- [x]`），但**不要删掉这个文件**。
2. **再 commit**，把勾好的 ticket 一起带上。一个 commit 对应一个完整问题——别把无关改动混进来，也别把一个问题拆碎。

> 顺序不能反。先 commit 再勾框，工作区就留着一份未提交的 ticket 改动；等这批做完交给 `idea-loop:pr-review` 时，它的脏树网关会直接把你拦下来。
3. **还有 ticket 没做就回到第一步**（人 `/clear` 接下一张；执行方交还后由派它的那一方派下一张）。**这一批做完了就停下**，报告提交和验证结果。下一环是 `idea-loop:pr-review`（推分支、创建或复用 PR，自动跑至多两轮 review → 修复 → 复验），由人调或由调用方接着调都行——但**不由本 skill 自己往下调**，链条的编排权在调用方手里；也不要安装 `gh pr` 后自动触发的 hook。

> 一份 spec 的所有 ticket 共享**一条分支、一个 PR**。review 轮次里的修复 commit 也进同一个 PR；PR 描述与每轮一条的轮次帖记录讲解、证据与处置，不再使用独立 artifact。不要一张 ticket 开一个 PR。
>
> **本地 diff 不单独 review** —— 三轴 review 是它的严格超集，中间只隔一次 push。

> ⚠️ ticket **活到合并为止**，不是活到 commit 为止。review 的 Spec 轴在 PR 阶段会去读 `docs/spec/tickets/`，那些验收 checkbox 是它能拿到的**最锋利的契约**——commit 后就删，等于在它最需要的前一刻把输入抽走。删除归 `to-ticket` §7（合并后），漏网的由 `dreaming` 按「PR 已 MERGED」扫出来。

**不做**：不开 PR（那是 `idea-loop:pr-review`）、不建分支、不改 spec 的 scope、**不删 ticket**。
