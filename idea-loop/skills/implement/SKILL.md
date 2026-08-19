---
name: implement
description: 实现一张已经定好的 ticket。不重开方案，只把它变成一个 commit。
disable-model-invocation: true
---

# Implement

把**已经决定好**的工作变成代码。

**不重开方案。** 没有访谈环节，没有重新设计的机会——上游定下来的东西就是这次的不可变输入。要改方案，回 `grill`。

> 先读一次 `../../references/wiki-conventions.md`（目录与状态约定）和 `../../references/tdd.md`（循环的规矩、seam、mock 边界）。

## 一次一张 ticket，一个全新会话

节奏是 `/clear` → 做这一张 → commit → `/clear`。

拿起 ticket 的这个会话**从没见过那份 spec**——这不是缺陷，是设计：ticket 的尺寸约束（塞得进一个全新上下文窗口）和那几条禁令（禁文件路径、禁代码片段、描述行为不描述过程）都是为此。所以**照 ticket 说的做，不要去把整份 spec 读回来"补充理解"**——真缺了什么，那是 ticket 写得不够，回去补 ticket。

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
| 视觉正确性 | 截图（`design-port`） |
| 端到端流程 | `qa:*` |

循环的规矩、反模式、mock 边界在 `../../references/tdd.md`。**新写的测试守「只在系统边界 mock」**——存量不守，别照抄存量。

过程中：

- **常跑 typecheck 和单个测试文件**（快反馈）。
  - 后端 `uv run pytest tests/test_x.py -q` · lint `uv run ruff check app/`
  - 前端 `npx vitest run src/…/x.test.tsx` · 类型 `npx -p typescript@5 tsc --noEmit`
- **全量套件在最后跑一次**（后端 `uv run pytest tests/ -q`，前端 `npm test`）。
- ticket 的**「选中的存量回归」**那节列的用例，也要跑。

## 收工

1. **先把 ticket 的验收标准逐条勾上**（`- [x]`），但**不要删掉这个文件**。
2. **再 commit**，把勾好的 ticket 一起带上。一个 commit 对应一个完整问题——别把无关改动混进来，也别把一个问题拆碎。

> 顺序不能反。先 commit 再勾框，工作区就留着一份未提交的 ticket 改动；等这批做完交给 `idea-loop:pr-open-review` 时，它的脏树网关会直接把你拦下来。
3. **还有 ticket 没做就回到第一步**（`/clear` → 下一张）。**这一批做完了**，交给 `/idea-loop:pr-open-review` —— 它推分支、开 PR、跑三轴 review。

> 一份 spec 的所有 ticket 共享**一条分支、一个 PR**。review 轮次里的修复 commit 也进同一个 PR（`/idea-loop:pr-fix-verify`），一份 artifact 记录全部轮次。不要一张 ticket 开一个 PR。
>
> **本地 diff 不单独 review** —— 三轴 review 是它的严格超集，中间只隔一次 push。

> ⚠️ ticket **活到合并为止**，不是活到 commit 为止。review 的 Spec 轴在 PR 阶段会去读 `docs/spec/tickets/`，那些验收 checkbox 是它能拿到的**最锋利的契约**——commit 后就删，等于在它最需要的前一刻把输入抽走。删除归 `to-ticket` §7（合并后），漏网的由 `dreaming` 按「PR 已 MERGED」扫出来。

**不做**：不开 PR（那是 `idea-loop:pr-open-review`）、不建分支、不改 spec 的 scope、**不删 ticket**。
