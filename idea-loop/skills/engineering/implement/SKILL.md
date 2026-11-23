---
name: implement
description: 把一份已切好工单的 spec 实现完。spec 的工单已切好、要开工时用。
---

**把一份已经切好工单的 spec 做完。** 调用这个 skill 的会话是**编排者**：派工、核对、落地、回收，停下时把要人拍板的事交给人（决定题只由人答，PR 上不和人往来）。一张工单怎么做归 `idea-loop:implementer`：实现代码、验证、合并冲突都是它的，编排者不进它的 worktree 改东西。

开工先用 Skill 工具调 `idea-loop:wiki-conventions`（看它的「中间产物」；下文 `.tmp/…` 都指集成分支 worktree 的 `.tmp/`）、`idea-loop:pr` 和 `idea-loop:issues`。交回里的「按现有做法定的」、本次修的存量、Review 汇报的决定题都照用户规则（`~/.claude/CLAUDE.md` 的「思考与决策」）。

## 前提

- 人调 `/idea-loop:implement <spec-slug>`，或调用方要求做完一份 spec。一份 spec 的工单全部做完才算完：只要求做几张的，停下告诉人 spec 该拆开（或把不做的部分移出去），不开工。
- **当前 worktree 就是集成分支**：一份 spec 一条分支、一个 PR，不在这里建、切分支。工作区不干净或当前就是基准分支，停下告诉人。
- `dyna spec check <docs>` 不报旧布局，`tickets/` 下有工单；否则停：旧布局照它提示的迁移，没切票先跑 `idea-loop:to-ticket`。`<docs>` 指 `<项目目录>/docs/`（`idea-loop:wiki-conventions` 的「项目目录」），`<号>` 指 spec 的 `issues:` 里的 issue 号。
- 每张工单第一次派出是新上下文，人不用在工单之间 `/clear`；卡住的工单在人做完决定后可能被叫回原执行方（见「人回复后」）。

scope 和工单照 spec 与 `idea-loop:to-ticket`：编排者不改 scope、不删工单（合并后由 `idea-loop:pr-review` 删）、不合并 PR。

## 开工：先开 PR

派工前核一遍 PR 开齐、issue 在 in-progress、`reference` 补全：不满足的，读 [references/start-of-run.md](references/start-of-run.md) 的「开工：先开 PR」。review loop 文件、Review 汇报的存档以这个 PR 的号命名（下文 `<PR 号>` 都指它）。

## 账本

不另建状态文件：

- **已落地**：`dyna spec landed <base>` 列出的 commit（message 里有一行 `Ticket: <NN>-<slug>` 的）。用这条命令，不按 git 的 trailer 读：环境会在 message 末尾另起一段追加署名，按 trailer 读会读空（坑）。
- **等决定**：`.tmp/implement/<spec-slug>/pending.md`，每条记工单号、问题、选项（各带代价和能否回滚）、推荐、半成品的 worktree 和分支、原执行方的 agent id（起它时 Agent 工具返回的那个；会话压缩或重启后靠它找回）。丢了就从 review loop 文件还原（Review 汇报里有批示和「做了什么」的就算已决定）。
- **已按规则处理**：`.tmp/implement/<spec-slug>/handled.md`。每落地一张就把它交回的「按现有做法定的」、标「存量本次修」的 `found`、为无关存量开的 issue 记进来（工单号 + 做了什么 + 依据，开了 issue 的带链接），回收后就找不回来了；写进 Review 汇报后清空。
- **PR 清单**：`.tmp/implement/<spec-slug>/prs.md`（`idea-loop:pr` 的「开 draft PR」写的）。
- 同目录还有 `evidence/`（素材）、`notes/`（explorer 笔记）、`browser.lock`。在跑的执行方记在会话里。

**可派的工单**：没落地、不在等决定、不在跑、`Blocked by` 全已落地的工单。等决定的工单的下游因此也不派。会话断了：读 [references/start-of-run.md](references/start-of-run.md) 的「会话断了」。

## 派工

同时最多 **3** 个执行方（人可另定，串行就是 1）。有空位、有可派的工单，就按编号补派。

**第一次派工、可派的有两张以上**：先读 [references/start-of-run.md](references/start-of-run.md) 的「第一次派工」，起 explorer。

每派一张：挑一个没人在听、也没分出去的端口；记下集成分支此刻的提交作起点 SHA；用 Agent 工具起 `idea-loop:implementer`，`isolation: "worktree"`、`run_in_background: true`，记下它返回的 agent id，**只给指针，不转述工单**：

- 项目目录的绝对路径，工单与 spec 在它里面的绝对路径（工单在 home 里，执行方的 worktree 读不到，也不进它的 commit）
- 起点 SHA、集成分支名、分到的端口、集成分支 worktree 的绝对路径
- tmp 绝对路径 `<项目目录>/docs/design/tmp/<spec-slug>/`（还不存在也照给）
- 已落地的提交列表
- 有的话：「人的决定已写进工单」、上次的半成品分支

一次处理一个交回：核对 → 落地 → 回收 → 补派。

## 核对与落地

只核能机械判断的；测试执行方交回前跑过，全量交给 PR 转 ready 后的 CI：

| 交回 | 核对 |
|---|---|
| `landed` | 比集成分支只多一个 commit，`dyna spec ticket-of <commit>` 输出的正是这张工单；`acceptance` 每格已勾或 `⏭ 延后 → <接手方>`；延后给 PR 交付验收的，`human_verify` 有素材且文件在它的证据目录；交回原文存成 `.tmp/implement/<spec-slug>/` 下的文件，`dyna spec skill-edit <commit> <该文件>` 退出码 0（不过会逐条列原因） |
| `blocked` | 半成品已提交在它的分支上，worktree 干净 |
| `failed` | 不核，直接进「卡住一张，别的接着做」 |

不过就 SendMessage 退回同一个执行方并说清哪条，第二次还不过按 `failed`。`by_existing_practice` 没带现存实例、commit 快进不了（ff 不了）、`found` 里有跟这次无关的存量要开 issue：读 [references/landing-branches.md](references/landing-branches.md)。

**落地**：只快进，不产生合并提交。工单在 home 里、commit 只含代码：落地后先照 [references/landing-branches.md](references/landing-branches.md) 的「勾框」勾工单并 `commit` 到 home，再照「回收」收掉它的 worktree，再分拣它的交回：

| 交回字段 | 去哪 |
|---|---|
| `human_verify` | 下次 Review 汇报的「要你看的」 |
| `verified` | PR 描述 |
| `by_existing_practice`、标「存量本次修」的 `found` | handled |
| 标「spec 缺口」的 `found` | 照用户规则的「思考与决策」判：落在「停下问我」里的进 pending，当决定题；其余自己定，选目标达成的那个做法，进 handled 并写明目标原文，要动工单或 spec 的追加一格、补记，照「重派」做 |
| 其余 `found`（跟这次无关的存量） | 开 issue，见 landing-branches |

## 卡住一张，别的接着做

`blocked` / `failed`：连同它的 agent id 和全部下游记进 pending；拷出素材、停它的服务、强制释放浏览器锁，**worktree 和分支留着**；推送通知说哪张卡在哪；回到「派工」。

## 没活了就停下

没有在跑的、可派的也空了才停：读 [references/stop-and-resume.md](references/stop-and-resume.md)，推送、写 Review 汇报、等人（「人回复后」「重派」）、全部落地后转 ready。

**等 CI**：读 [references/stop-and-resume.md](references/stop-and-resume.md) 的「等 CI」。

## 设计变更：人接受了跟画布不同的设计

人接受了一处跟冻结画布不同的设计：读 [references/design-change.md](references/design-change.md)。

## 回收

只在工单落地之后做。`<项目目录>/DEVELOPMENT.md` 的「清理」写了命令就先跑它，然后：

1. 停掉这个 worktree 端口上的服务。
2. 它还持有浏览器锁就释放：`dyna ui lock release .tmp/implement/<spec-slug>/browser.lock --force`。
3. 把它 `.tmp/implement/<spec-slug>/evidence/` 下的素材拷进集成分支 worktree 的同名目录。
4. `dyna worktree remove <路径> --force`（连它的分支一起删）。

卡住或失败的工单不回收：worktree 和分支留着，等人做完决定由下一个执行方接着用；素材照样先拷出来。
