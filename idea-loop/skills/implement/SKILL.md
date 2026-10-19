---
name: implement
description: 把一份 spec 的工单连续实现完——调用它的会话做编排，按工单的依赖图并行派 plugin 自带的 implementer agent（每张一个只装着它的新上下文、一个自己的 worktree，做成一个 commit，由编排者 fast-forward 进集成分支并回收那个 worktree），只在要人拍板时停：没有能做的工单了，就在会话里给人一份停下汇报，放要人决定的事和要人看的素材（流程图、动图），同样的内容记进这个 PR 的本地 review loop 文件，人在会话里回答后接着做；全部落地、没有等决定的事之后把 PR 转成 open，接 pr-review。也可以只做指定的几张。不重开方案，不改 spec 的 scope。
---

# Implement

**把一份已经切好工单的 spec 做完。** 这里只写编排：谁起谁、派哪张、交回后核什么、何时停下交给人。一张工单怎么做在 `agents/implementer.md`。

> 先读 `../../references/wiki-conventions.md`（§2.1：`.tmp/…` 下文都指集成分支 worktree 的 `.tmp/`）、`../../references/worktree.md`（执行方 worktree 的起点、准备、回收）、`../../references/pr-description.md`（停下汇报 §4、描述四节 §6）。

## 0 前提

- 人调 `/idea-loop:implement <spec-slug> [工单号…]`，或调用方要求做完一份 spec。
- **当前 worktree 就是集成分支**，一份 spec 一条分支、一个 PR；这个 skill 不建、不切它。工作区不干净或当前就是基准分支，停下告诉人。
- `spec-status.mjs check <docs>` 不报旧布局，spec 是 `在飞`，`tickets/` 下有工单。否则停：旧布局按 wiki-conventions §2.2 迁移，没切票先跑 `to-ticket`。
- 不需要 `/clear`：每张工单的执行方都是新上下文。

## 1 角色

| 角色 | 是谁 | 做什么 |
|---|---|---|
| 编排者 | 这个会话 | 算 frontier、分端口、派工、核对、fast-forward 落地、回收 worktree、停下汇报、把人的决定写回工单 |
| explorer | `idea-loop:explorer`，`haiku` · high | 并行派工前写只含指针的共享笔记 |
| implementer | `idea-loop:implementer`，`sonnet` · high | 一张工单、一个自己的 worktree、一个 commit，或停下交回问题 |
| pr-review | `/idea-loop:pr-review` | 全部落地后接手同一个 PR |

**编排者不写实现代码，不进执行方的 worktree 改东西**；合并冲突也归执行方。

## 2 账本

不另建状态文件：

- **已落地**：`git log --format='%H %(trailers:key=Ticket,valueonly)' $(git merge-base HEAD <base>)..HEAD` 里带 `Ticket:` 的 commit。
- **等决定**：`.tmp/implement/<spec-slug>/pending.md`，每条记工单号、问题、选项、推荐、半成品的 worktree 和分支。丢了就从 review loop 文件还原（停下汇报里有批示和「做了什么」的就算已决定）。
- 同目录还有 `evidence/`（素材）、`notes/`（explorer 笔记）、`browser.lock`（MCP 浏览器锁）。在跑的执行方只记在会话里。

**frontier** = 没落地、不在等决定、不在跑、`Blocked by` 全已落地的工单。会话断了：重算 frontier；`git worktree list` 里 pending 没记着的执行方 worktree 按 `worktree.md` §3 回收后重派。

## 3 派工

同时最多 **3** 个执行方（人可另定，说串行就是 1）。有空位、frontier 有工单，就按编号补派，不等一批做完。

**第一次派工且 frontier 上有两张以上**：先起 explorer，给一句目的（验证命令、准备命令、测试写法、各工单现状在哪）、这批工单路径、spec 路径、笔记目录，等它交回。

每派一张：挑一个没人在听、也没分出去的端口；记下 `git rev-parse HEAD`；用 Agent 起 implementer，`isolation: "worktree"`、`run_in_background: true`，**只给指针**——工单与 spec 的仓库内路径、起点 SHA、集成分支名、端口、集成分支 worktree 的绝对路径、**交给 implementer 的 tmp 绝对路径**（集成 worktree 里 `docs/design/tmp/<spec-slug>/` 的绝对路径；`tmp/` 不进版本库，执行方自己的 worktree 里没有它，冻结画布从它的 `canvas/` 读，没有设计稿的 UI 工单把最小差异记进它的 `delta/`，结构见 `../../references/design-archive.md`；目录还不存在就照给路径，由执行方创建）、已落地提交列表，以及（有的话）「人的决定已写进工单」和上次的半成品分支。不转述工单。

**写 `prod/` 不归 implementer**：执行方只写上面那个 tmp 路径下的 `delta/`；归档在合并前由 pr-review 阶段走 `design-archive-write.mjs`，人批过之后才写（`design-archive.md` §9）。

一次处理一个交回：核对 → 落地回收 → 补派。

## 4 核对与落地

只核能机械判断的，不重跑套件（执行方交回前跑过，下一张和 pr-review 还会跑）：

| 交回 | 核对 |
|---|---|
| `landed` | 比集成分支只多一个 commit（`git rev-list --count HEAD..<commit>` 为 1），trailer 对；`git show <commit>:<工单>` 里每格 `[x]` 或 `⏭ 延后 → <接手方>`；延后给后续工单的，那张有「继承自」格；延后给 PR 交付验收的，`human_verify` 有素材且文件在它的证据目录 |
| `blocked` | 半成品已提交在它的分支上，worktree 干净 |
| `failed` | 不核，直接进 §5 |

不过就 SendMessage 退回同一个执行方说清哪条，第二次还不过按 `failed`。

**落地**：`git merge --ff-only <commit>`。ff 不了（期间别的先落地了）就退回它：合入最新提交、重新压成一个、重跑全量套件——不算失败。落地后按 `worktree.md` §3 **回收**，再记下它的 `human_verify`（进停下汇报）、`verified`（进描述）、`found`（「spec 缺口」进 pending 当决定题，其余进参考）。

## 5 卡住一张，别的接着做

`blocked` / `failed`：记进 pending（连同它的全部下游）；拷出素材、停它的服务、强制释放浏览器锁，**worktree 和分支留着**；PushNotification 一句哪张卡在哪；回 §3。

## 6 没活了就停下

没有在跑的、frontier 也空了才停（只剩等决定的及其下游，或全部落地）。

1. 还没有 PR：推送，`gh pr create --draft --base <base>`（标题用 spec 标题，带署名行），`pr-body.mjs set` 写 `summary` 和 `reference`。
2. 停下汇报按 `pr-description.md` §4 写：新落地工单的人验素材 + 每条 pending 的决定题，执行方自己定的细节不写。轮次取 `review-loop.mjs next .tmp/review-loop/<PR 号>.md pause`，追加成新条目；素材写本地路径。
3. 更新 `reference` 的执行记录，推送。
4. 会话里按条目贴汇报，每项文字后紧跟它的素材（`review-loop.md` §2）；再发一条推送通知。

**人回复后**：原话逐字记进「你的批示」，逐点处理，会话里只回**一条**汇总（带提交链接），同样记进「做了什么」：

- **决定**：工单 `要建什么` 末尾加 `> 人的决定（<日期>）：<原文>`，验收格随之增删，提交 `docs(tickets): <NN> — 人的决定`，从 pending 删掉。工单回 frontier，派时带上半成品分支；它落地后旧 worktree 和分支一并回收。
- **人验对**：勾上。**不对**：验收末尾追加 `- [ ] 人验反馈（<日期>）：<原话>`，提交，工单回 frontier 重派（同一 trailer，素材同名覆盖）。
- **疑问**：直接答；要改方案的，说明回 `grill`。

回 §3。下次停下追加新条目，不改旧的。

**全部落地、pending 清空、`review-loop.mjs check` 没有未处理的 `pause`**：按 `pr-description.md` §6 写齐描述（之前 → 之后专门拍：基准分支用 `git worktree add .tmp/implement/<spec-slug>/base <基准分支>` 另起一份，拍完删），`gh pr ready`，接 `/idea-loop:pr-review` 跑第一轮。提一句交付验收还有几项没勾。

## 7 合并之后（不归这里，备查）

删工单归 `to-ticket` §7；`evidence.mjs cleanup <owner/repo> <PR 号>`；剩下的执行方 worktree 按 `worktree.md` §3 回收；删 `.tmp/implement/<spec-slug>/`。

## 不做

- 不写实现代码、不跑执行方的验证、不搬执行方日志进对话。
- 不替人答决定题，不跳过等决定的工单做它的下游，不以人的身份在 PR 上发言。
- 不改 scope，不删工单，不合并 PR。
