---
name: implement
description: 把一份 spec 的工单连续实现完——调用它的会话做编排，按工单的依赖图逐张派 plugin 自带的 implementer agent（每张一个只装着它的新上下文，在集成分支上做成一个 commit），只在要人拍板时停：没有能做的工单了，就在会话里给人一份停下汇报，放要人决定的事和要人看的素材（流程图、动图），同样的内容记进这个 PR 的本地 review loop 文件，人在会话里回答后接着做；全部落地、没有等决定的事之后把 PR 转成 open，接 pr-review。也可以只做指定的几张。不重开方案，不改 spec 的 scope。
---

# Implement

**把一份已经切好工单的 spec 做完。** 这份文件是入口，写的是**编排机制**：谁起谁、怎么算下一张、交回后核对什么、什么时候停下交给人。一张工单具体怎么做写在 `agents/implementer.md` 里，这里不复述。

> 先读一次 `../../references/wiki-conventions.md`（目录与状态约定；§2.1 是 worktree 根下 `.tmp/` 的约定，下文简写 `.tmp/…`）和 `../../references/pr-description.md`（§1、§6：PR 描述的四节，每节谁写、写什么）。

## 0 什么时候跑、输入是什么

- 人调 `/idea-loop:implement <spec-slug>`，或调用方要求做完一份 spec。只做其中几张时，在后面列出工单号。
- **当前 worktree 就是集成分支**：一份 spec 的所有工单共享一条分支、一个 PR。这个 skill 不建分支、不切分支。分支不对、工作区不干净（`git status --short` 非空），就停下告诉人。
- `docs/spec/tickets/` 下有这份 spec 的工单。没有就停：先跑 `to-ticket`。

**不需要 `/clear`。** 干活的是每张工单新起的 implementer，它的上下文里只有那一张工单，连上一张做了什么都不在。这个会话可以留着之前的讨论。

## 1 三个角色

| 角色 | 是谁 | 做什么 |
|---|---|---|
| **编排者** | 调用 implement 的这个会话 | 算下一张、派执行方、核对交回、停下时在会话里给人汇报并记进 review loop 文件、处理人的回复、把人的决定写回工单 |
| **implementer** | `idea-loop:implementer`（`agents/implementer.md`），`opus` · high | 一张工单一个，做成一个 commit，或者停下交回问题 |
| **pr-review** | `/idea-loop:pr-review` | 全部落地后接手同一个 PR，跑两轴 review |

**编排者不亲手写实现代码。** 它一旦动手，「这个上下文里只有这一张工单」的前提就破了。

## 2 账本：git 加 `.tmp/implement/<spec-slug>/`

不另建状态文件，不信任何可能过时的计数：

- **已落地** = 集成分支上从 merge-base 起，message 带 `Ticket: <NN>-<slug>` trailer 的 commit：
  `git log --format='%H %(trailers:key=Ticket,valueonly)' $(git merge-base HEAD <base>)..HEAD`
- **等决定** = `.tmp/implement/<spec-slug>/pending.md` 里的条目，每条记下工单号、问题、选项、推荐、patch 路径。它是缓存：在另一个 worktree 或新会话里接手时，从这个 PR 的 review loop 文件还原——停下汇报「需要你决定」下的每一项，后面有人的批示和「做了什么」就算已决定。
- **素材** = `.tmp/implement/<spec-slug>/evidence/`；**半成品** = `.tmp/implement/<spec-slug>/wip/`。

**frontier**（现在可以开工的工单）= 还没落地、不在等决定、`设计冻结` 不是 `⛔`、`Blocked by` 里的工单全部已落地。依赖等决定工单的（直接或间接）都不在 frontier 上。

会话断了也能接着做：git 和 `.tmp/` 就是恢复点，重新算一遍 frontier 即可。

## 3 派工：默认串行

从 frontier 里按编号取最小的一张，用 Agent 工具起 `idea-loop:implementer`，**只给指针**：工单路径、spec 路径、worktree 路径、证据目录、已落地工单的提交列表、这张工单若有人的决定，就说明决定已写进工单。不转述工单，不写摘要。

等它交回，核对（§4），再取下一张。

**默认串行。** 并行要人明说才开，因为每个并行执行方都要一个自己的 worktree，代价不小：要先跑仓库的 worktree 初始化（补 `.env` 之类），前后端端口要错开，浏览器类验证并行时标签页会串，被 gitignore 的素材在新 worktree 里可能让测试悄悄跳过。真并行时，每个执行方用 `isolation: "worktree"` 基于集成分支开工，落地前先合入集成分支的最新提交，让落地是 fast-forward。

## 4 交回后的核对：只核能机械判断的

| 交回 | 核对 | 不过怎么办 |
|---|---|---|
| `landed` | commit 存在且带对的 trailer；工作区干净；工单的验收标准每一格要么 `[x]`，要么带 `⏭ 延后 → <接手方>`；接手方是后面某张没落地的工单时，那张工单里确实有对应的「继承自」格；接手方是 PR 交付验收时，`human_verify` 里有对应的素材且文件在证据目录 | SendMessage 退回同一个执行方，说清哪条没过。退回一次还不过，按 `failed` 处理 |
| `blocked` | 工作区干净，patch 文件存在 | 同上 |
| `failed` | — | 记进 pending，当成要人看的问题，附上没过的那条和输出摘要 |

**不重跑测试套件。** 下一张工单的执行方开工时、`pr-review` 的机械检查都会再跑一遍。这一步核的是执行方的声明在形式上站得住。

`landed` 之后，把它的 `human_verify`、`verified`、`found` 记下来：`human_verify` 进停下汇报，`verified` 转 open 时写进描述，`found` 里标了「spec 缺口」的记进 pending、当成决定题，其余进参考里的存量问题。

## 5 卡住一张，别的接着做

交回 `blocked` 或 `failed`：

1. 记进 `pending.md`，并列出现在因为它而等着的工单（依赖图上它的所有下游）。
2. 用 PushNotification 告诉人一句：哪张卡住了、卡在哪，其余工单继续。
3. 回到 §3，接着从 frontier 取。

## 6 frontier 空了，就停下交给人

停下有两种情况：只剩等决定的工单和依赖它们的工单；或者全部落地了。人在会话里看、在会话里回答，同样的内容逐字记进这个 PR 的 review loop 文件（`../../references/review-loop.md`，汇报的写法见 `../../references/pr-description.md` §4）。

1. **还没有 PR 就开 draft PR**：推送集成分支，`gh pr create --draft --base <base>`，标题用 spec 的标题，PR 的署名行照常带上。然后用 `pr-body.mjs set` 写两节：`summary`（一句话说这份 spec 解决什么）、`reference`（spec 与工单链接、空的执行记录、合并后的清理）。
2. **写停下汇报**：这次停下之前新落地的工单的人验素材，以及每条 pending 的决定题。执行方实现时自己定的细节不写进汇报。轮次取 `review-loop.mjs next .tmp/review-loop/<PR 号>.md pause`，作为新条目追加进文件。素材写本地路径，不上传（归档时才传）。
3. **更新 `reference` 节**里折叠的执行记录（停下几次）。推送新的提交。
4. **在会话里给人看**：贴同样的汇报，素材用发送文件的工具发给人；再发一条推送通知，一句话说停在哪（落地几张、等决定几件）。

**人回复后**，把原话逐字记进那个条目的「你的批示」，逐点处理完，在会话里回**一条**汇总，逐点说做了什么、带上提交链接，不要一个点回一条；同样的内容记进「做了什么」：

- **决定**（「03 选 A」）：把决定写进那张工单。在 `要建什么` 末尾加一行 `> 人的决定（<日期>）：<决定原文>`，验收标准随之增删格。用 `docs(tickets): <NN> — 人的决定` 提交，从 pending 里删掉这一条。
- **人验项看过、对**：在文件里把那一项勾上。
- **人验项不对**：在那张工单的验收标准末尾追加 `- [ ] 人验反馈（<日期>）：<原话>`，提交，再派一个 implementer 做这张工单。这次它的 commit 照样带同一个 `Ticket:` trailer，账本按「同一张工单的第二个 commit」处理。新素材用原来的文件名覆盖。
- **疑问**：直接回答。答不了的（要改方案的），说明要回 `grill`。

处理完回到 §3 接着派工单。下一次停下再追加一个新条目，**不改前面的条目**。

**全部落地、pending 已清空、所有停下汇报都处理完了**（`review-loop.mjs check` 里没有未处理的 `pause` 条目）：先把描述写齐（`pr-description.md` §1、§6）：

1. **专门拍之前 → 之后**：同一组操作在基准分支和集成分支上各走一遍。基准分支用 `git worktree add .tmp/implement/<spec-slug>/base <基准分支>` 另起一份，在那里起服务，拍完 `git worktree remove`。前端用截图、动图或带标注的截图流程，后端用时序图，按哪种最快看懂选；不复用人验素材。文件名以 `pr-` 开头，`evidence.mjs publish` 上传。
2. **`summary`** 按落地结果重写成一句话。
3. **`changes`** 按点分块：碰了页面的，一个页面一块，写它端到端变了什么，再写背后的后端流程变了什么；没碰页面的，一个后端流程一块。每块里放上一步的对照图和怎么验证的：从各张工单交回的 `verified` 里挑属于这一点的，逐个写验证了什么行为、用什么方式、结论；没验成的照写，说明谁补。
4. **`your-todo`**：要人审的（还没勾的人验项，带素材链接）、要人决定的（还开着的决定）、上线前要人注意的（生产配置、手动迁移、真实服务冒烟）。Claude 自己能做的不列。
5. **`reference`** 补上按模块的改动地图。

这三节是给人读的：不写代码行、变量名、函数名、文件路径、提交号、章节编号，`pr-body.mjs` 查到会拒写（`pr-description.md` §1）。

然后 `gh pr ready <PR 号>` 把 PR 转成 open，接 `/idea-loop:pr-review`，在同一个 PR 上跑第一轮 review。review 的结果在会话和 review loop 文件里，不进描述。转 open 时在对话里提一句：交付验收里还有几项没勾。不勾不挡转 open，但人应该知道。

## 7 PR 合并之后

不归这个 skill 管，记在这里方便对照：删工单归 `to-ticket` §7；同一时机跑 `evidence.mjs cleanup <owner/repo> <PR 号>` 删掉素材分支；清掉 `.tmp/implement/<spec-slug>/`。

## 不做

- 编排者不写实现代码、不跑执行方的验证、不把执行方的日志搬进对话。
- 不替人回答决定题，也不跳过等决定的工单去做依赖它的工单。不以人的身份在 PR 上发言。
- 不改 spec 的 scope，不删工单，不合并 PR。
