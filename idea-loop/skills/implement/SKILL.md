---
name: implement
description: 把一份 spec 的工单连续实现完——调用它的会话做编排，按工单的依赖图逐张派 plugin 自带的 implementer agent（每张一个只装着它的新上下文，在集成分支上做成一个 commit），只在要人拍板时停：没有能做的工单了，就在 draft PR 上以项目 bot 的身份新开一个 thread，放要人决定的事和要人看的素材（流程图、动图），人在 thread 里回答后接着做；全部落地、没有等决定的事之后把 PR 转成 open，接 pr-review。也可以只做指定的几张。不重开方案，不改 spec 的 scope。
---

# Implement

**把一份已经切好工单的 spec 做完。** 这份文件是入口，写的是**编排机制**：谁起谁、怎么算下一张、交回后核对什么、什么时候停下交给人。一张工单具体怎么做写在 `agents/implementer.md` 里，这里不复述。

> 先读一次 `../../references/wiki-conventions.md`（目录与状态约定；§2.1 是 worktree 根下 `.tmp/` 的约定，下文简写 `.tmp/…`）和 `../../references/pr-description.md`（PR 描述每一节写什么）。

## 0 什么时候跑、输入是什么

- 人调 `/idea-loop:implement <spec-slug>`，或调用方要求做完一份 spec。只做其中几张时，在后面列出工单号。
- **当前 worktree 就是集成分支**：一份 spec 的所有工单共享一条分支、一个 PR。这个 skill 不建分支、不切分支。分支不对、工作区不干净（`git status --short` 非空），就停下告诉人。
- `docs/spec/tickets/` 下有这份 spec 的工单。没有就停：先跑 `to-ticket`。

**不需要 `/clear`。** 干活的是每张工单新起的 implementer，它的上下文里只有那一张工单，连上一张做了什么都不在。这个会话可以留着之前的讨论。

## 1 三个角色

| 角色 | 是谁 | 做什么 |
|---|---|---|
| **编排者** | 调用 implement 的这个会话 | 算下一张、派执行方、核对交回、停下时在 draft PR 上以 bot 身份开 thread、处理人在 thread 里的回复、把人的决定写回工单 |
| **implementer** | `idea-loop:implementer`（`agents/implementer.md`），`opus` · high | 一张工单一个，做成一个 commit，或者停下交回问题 |
| **pr-review** | `/idea-loop:pr-review` | 全部落地后接手同一个 PR，跑两轴 review |

**编排者不亲手写实现代码。** 它一旦动手，「这个上下文里只有这一张工单」的前提就破了。

## 2 账本：git 加 `.tmp/implement/<spec-slug>/`

不另建状态文件，不信任何可能过时的计数：

- **已落地** = 集成分支上从 merge-base 起，message 带 `Ticket: <NN>-<slug>` trailer 的 commit：
  `git log --format='%H %(trailers:key=Ticket,valueonly)' $(git merge-base HEAD <base>)..HEAD`
- **等决定** = `.tmp/implement/<spec-slug>/pending.md` 里的条目，每条记下工单号、问题、选项、推荐、patch 路径。
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

`landed` 之后，把它的 `human_verify`、`tradeoffs`、`found` 记下来，停下时要写进 PR。

## 5 卡住一张，别的接着做

交回 `blocked` 或 `failed`：

1. 记进 `pending.md`，并列出现在因为它而等着的工单（依赖图上它的所有下游）。
2. 用 PushNotification 告诉人一句：哪张卡住了、卡在哪，其余工单继续。
3. 回到 §3，接着从 frontier 取。

## 6 frontier 空了，就停下交给人

停下有两种情况：只剩等决定的工单和依赖它们的工单；或者全部落地了。人在 PR 上看、在 PR 上回答，所以停下就是在 draft PR 上开一个新 thread（`../../references/pr-description.md` §2、§4）。

1. **还没有 PR 就开 draft PR**：推送集成分支，`gh pr create --draft --base <base>`，标题用 spec 的标题，`header` 节写 spec 链接加一句话。PR 的署名行照常带上。
2. **上传素材**：`node "${CLAUDE_PLUGIN_ROOT}/scripts/evidence.mjs" publish <owner/repo> <PR 号> <证据目录下的新文件>`，拿到 URL（`../../references/evidence.md` §2）。
3. **开这次停下的 thread**：`pr-thread.mjs open <owner/repo> <PR 号> pause <轮次> <汇报.md> <工单文件>...`，轮次取 `pr-thread.mjs list` 的 `next.pause`。汇报写这次停下之前新落地的工单的人验素材与取舍，以及每条 pending 的决定题，格式见 `pr-description.md` §4。锚定文件给本轮落地的工单文件。**以项目的 bot 身份发**，脚本会自动用配好的 GitHub App；没配 App 时，每条都写明是 Claude 代发。不以人的身份说话。
4. **更新 `ledger` 节**，加上这个 thread 的链接。推送新的提交。
5. **在对话里只说一句**：停在哪（落地几张、等决定几件）+ thread 链接。人在 thread 里回复完，回到对话说一声；人直接在对话里回答也行，编排者会把那段回答原文转贴进 thread，让 PR 上的记录是完整的。

**人回复后**，`pr-thread.mjs read` 读这个 thread，逐条处理人的消息，每处理完一条就在同一个 thread 里 `reply` 一条，说明做了什么、带上提交链接：

- **决定**（「03 选 A」）：把决定写进那张工单。在 `要建什么` 末尾加一行 `> 人的决定（<日期>）：<决定原文>`，验收标准随之增删格。用 `docs(tickets): <NN> — 人的决定` 提交，从 pending 里删掉这一条。
- **人验项不对**：在那张工单的验收标准末尾追加 `- [ ] 人验反馈（<日期>）：<原话>`，提交，再派一个 implementer 做这张工单。这次它的 commit 照样带同一个 `Ticket:` trailer，账本按「同一张工单的第二个 commit」处理。新素材用原来的文件名上传，替换原图，URL 不变。
- **疑问**：在 thread 里直接回答。答不了的（要改方案的），说明要回 `grill`。
- **勾复选框**：不用做什么，状态就在 PR 上。

这个 thread 里的事都处理完了，在里面回一句「都处理完了，确认无误请 resolve」，然后回到 §3 接着派工单。**resolve 由人点**，那是人对这一轮的签收，bot 不代点。下一次停下再开新的 thread，**不在旧 thread 里接着汇报**。

**全部落地、pending 已清空、所有停下 thread 都已被人 resolve**（`pr-thread.mjs list` 里 `pause` 下每个都是 `resolved: true`）：`gh pr ready <PR 号>` 把 PR 转成 open，接 `/idea-loop:pr-review`，在同一个 PR 上跑第一轮 review。review 的结果写在 PR 描述的 `review` 节。转 open 时在对话里提一句：交付验收里还有几项没勾。不勾不挡转 open，但人应该知道。

## 7 PR 合并之后

不归这个 skill 管，记在这里方便对照：删工单归 `to-ticket` §7；同一时机跑 `evidence.mjs cleanup <owner/repo> <PR 号>` 删掉素材 release；清掉 `.tmp/implement/<spec-slug>/`。

## 不做

- 编排者不写实现代码、不跑执行方的验证、不把执行方的日志搬进对话。
- 不替人回答决定题，也不跳过等决定的工单去做依赖它的工单。不以人的身份在 PR 上发言。
- 不改 spec 的 scope，不删工单，不合并 PR。
