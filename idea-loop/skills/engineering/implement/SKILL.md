---
name: implement
description: 把一份已切好工单的 spec 实现完。spec 的工单已切好、要开工时用。
---

**把一份已经切好工单的 spec 做完。** 调用这个 skill 的会话是**编排者**：派工、核对、落地、回收、停下时把要人拍板的事交给人（决定题只由人答，PR 上不以人的身份发言）。一张工单怎么做归 `idea-loop:implementer`：实现代码、验证、合并冲突都是它的，编排者不进它的 worktree 改东西，它的日志也留在它那里。

开工先用 Skill 工具调 `idea-loop:wiki-conventions`（看它的「中间产物」；下文 `.tmp/…` 都指集成分支 worktree 的 `.tmp/`）、`idea-loop:pr`（Review 汇报、PR 描述的七节）、`idea-loop:issues`（issue 的状态、开 issue）和 `idea-loop:decision-rules`（执行方交回的「按现有做法定的」、本次修的存量、Review 汇报的决定题都按它）。

## 前提

- 人调 `/idea-loop:implement <spec-slug>`，或调用方要求做完一份 spec。一份 spec 的工单全部做完才算完：要求只做其中几张的，说明 spec 该调整（拆成两份，或把不做的部分移出去），停下告诉人，不开工。
- **当前 worktree 就是集成分支**：一份 spec 一条分支、一个 PR，这个 skill 不建、不切它。工作区不干净或当前就是基准分支，停下告诉人。
- `node "${CLAUDE_PLUGIN_ROOT}/scripts/spec.mjs" check <docs>` 不报旧布局，`tickets/` 下有工单。否则停：旧布局照它提示的迁移，没切票先跑 `idea-loop:to-ticket`。下文 `issues` 指 `node "${CLAUDE_PLUGIN_ROOT}/scripts/issues.mjs"`，`<docs>` 指集成分支 worktree 的 `docs/`，`<号>` 指 spec 的 `issues:` 里的 issue 号。
- 每张工单第一次派出时是新上下文，人不用在工单之间 `/clear`；卡住的工单在人做完决定后，可能被叫回原执行方（见「人回复后」）。

scope 和工单都按 spec 与 `idea-loop:to-ticket` 定下的来：编排者不改 scope、不删工单（删工单在合并前，归 `idea-loop:pr-review`），也不合并 PR。

## 开工：先开 PR

PR 从 spec 提交就挂着，先于派工核一遍 PR 开齐、issue 在 in-progress、`reference` 补全：不满足的，读 [references/start-of-run.md](references/start-of-run.md) 的「开工：先开 PR」。

**主 PR**：知识库所在仓库的 PR 是主 PR：review loop 文件、Review 汇报的存档以它的号命名（下文 `<PR 号>` 都指它），别的 PR 的描述写自己仓库的改动，`your-todo` 写一句「见主 PR」。

## 账本

不另建状态文件：

- **已落地**：`node "${CLAUDE_PLUGIN_ROOT}/scripts/ticket-ledger.mjs" landed <base>` 列出的 commit（message 里有一行 `Ticket: <NN>-<slug>` 的）。用这个脚本，不用 git 的 trailer 读法：环境会在 message 末尾另起一段追加署名，按 trailer 读会读空。
- **等决定**：`.tmp/implement/<spec-slug>/pending.md`，每条记工单号、问题、选项（各带代价和能否回滚）、推荐、半成品的 worktree 和分支、原执行方的 agent id（起它时 Agent 工具返回的那个；会话压缩或重启后靠它找回）。丢了就从 review loop 文件还原（Review 汇报里有批示和「做了什么」的就算已决定）。
- **已按规则处理**：`.tmp/implement/<spec-slug>/handled.md`。每落地一张就把它交回的「按现有做法定的」、标「存量本次修」的 `found`、为无关存量开的 issue 记进来（工单号 + 做了什么 + 依据，开了 issue 的带链接）。执行方回收后这些内容就找不回来了，所以落地时立刻记；写进 Review 汇报后清空。
- **PR 清单**：`.tmp/implement/<spec-slug>/prs.md`（`idea-loop:pr` 的「开 draft PR」写的）。
- 同目录还有 `evidence/`（素材）、`notes/`（explorer 笔记）、`browser.lock`（浏览器锁，运行环境用得到时才有）。在跑的执行方只记在会话里。

**可派的工单**：没落地、不在等决定、不在跑、`Blocked by` 全已落地的工单。等决定的工单的下游因此也不派。会话断了：读 [references/start-of-run.md](references/start-of-run.md) 的「会话断了」。

## 派工

同时最多 **3** 个执行方（人可另定，说串行就是 1）。有空位、有可派的工单，就按编号补派，不等一批做完。

**第一次派工、可派的有两张以上**：先用 Agent 工具起 `idea-loop:explorer`，给一句目的（验证命令、准备命令、测试写法、各工单现状在哪）、这批工单路径、spec 路径、笔记目录 `.tmp/implement/<spec-slug>/notes/` 的绝对路径，等它交回。

每派一张：挑一个没人在听、也没分出去的端口；记下 `git rev-parse HEAD` 作起点 SHA；用 Agent 工具起 `idea-loop:implementer`，`isolation: "worktree"`、`run_in_background: true`，记下它返回的 agent id，**只给指针，不转述工单**：

- 工单与 spec 的仓库内路径
- 起点 SHA、集成分支名、分到的端口
- 集成分支 worktree 的绝对路径
- tmp 绝对路径：集成 worktree 里 `docs/design/tmp/<spec-slug>/` 的绝对路径（还不存在也照给）
- 已落地的提交列表
- 有的话：「人的决定已写进工单」、上次的半成品分支

一次处理一个交回：核对 → 落地 → 回收 → 补派。

## 核对与落地

只核能机械判断的；测试执行方交回前跑过，全量由 PR 转 ready 后的 CI 跑，这里不重跑：

| 交回 | 核对 |
|---|---|
| `landed` | 比集成分支只多一个 commit（`git rev-list --count HEAD..<commit>` 为 1），`ticket-ledger.mjs of <commit>` 输出的正是这张工单；`git show <commit>:<工单>` 里每格 `[x]` 或 `⏭ 延后 → <接手方>`；延后给后续工单的，那张有「继承自」格；延后给 PR 交付验收的，`human_verify` 有素材且文件在它的证据目录 |
| `blocked` | 半成品已提交在它的分支上，worktree 干净 |
| `failed` | 不核，直接进「卡住一张，别的接着做」 |

不过就 SendMessage 退回同一个执行方说清哪条，第二次还不过按 `failed`。

`by_existing_practice` 没带现存实例、commit 快进不了（ff 不了）、`found` 里有跟这次无关的存量要自动开 issue：读 [references/landing-branches.md](references/landing-branches.md)。

**落地**：`git merge --ff-only <commit>`。落地后照「回收」收掉它的 worktree，再分拣它的交回：

| 交回字段 | 去哪 |
|---|---|
| `human_verify` | 下次 Review 汇报的「要你看的」 |
| `verified` | PR 描述 |
| `by_existing_practice`、标「存量本次修」的 `found` | handled |
| 标「spec 缺口」的 `found` | pending，当决定题 |
| 其余 `found`（跟这次无关的存量） | 开 issue，见下 |

## 卡住一张，别的接着做

`blocked` / `failed`：连同它的 agent id 和全部下游记进 pending；拷出素材、停它的服务、强制释放浏览器锁，**worktree 和分支留着**；发一条推送通知说哪张卡在哪；回到「派工」。

## 没活了就停下

没有在跑的、可派的也空了才停：读 [references/stop-and-resume.md](references/stop-and-resume.md)，照它的步骤推送、写 Review 汇报、等人（「人回复后」「重派」）、全部落地后转 ready。

**等 CI**：`gh pr ready` 后 `gh pr checks <PR 号> --watch` 等这个 head 的检查跑完；全绿起 pr-review，其余读 [references/stop-and-resume.md](references/stop-and-resume.md) 的「等 CI」。

## 多个仓库

工单头写了 `**仓库**`（工单属于别的仓库）：读 [references/multi-repo.md](references/multi-repo.md)。

## 设计变更：人接受了跟画布不同的设计

人接受了一处跟冻结画布不同的设计：读 [references/design-change.md](references/design-change.md)。

## 回收

只在工单落地（fast-forward 进集成分支）之后做。目标仓库 `DEVELOPMENT.md` 的「清理」写了命令就先跑它，然后：

1. 停掉这个 worktree 端口上的服务（`lsof -tiTCP:<端口> -sTCP:LISTEN` 找进程）。
2. 它还持有浏览器锁就释放：`node "${CLAUDE_PLUGIN_ROOT}/scripts/browser-lock.mjs" release .tmp/implement/<spec-slug>/browser.lock --force`。
3. 把它 `.tmp/implement/<spec-slug>/evidence/` 下的素材拷进集成分支 worktree 的同名目录。
4. `git worktree remove --force <路径>`（Claude 加的锁先 `git worktree unlock`），再 `git branch -D <它的分支>`。

卡住或失败的工单不回收：worktree 和分支留着，半成品在它的分支上，等人做完决定由下一个执行方接着用。素材照样先拷出来，Review 汇报要用。
