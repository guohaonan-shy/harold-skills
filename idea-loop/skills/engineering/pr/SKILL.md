---
name: pr
description: 一个 PR 上给人看的东西怎么写、放在哪：PR 描述、停下汇报、review 汇报、review loop 文件。写 PR 描述、写汇报、记录或归档 review loop 时用。
---

一份 spec 的所有工单共享**一条集成分支、一个 PR**。PR 描述和过程中的汇报只写给一个读者：要判断这次交付能不能合并的那个人。他每次看都要能马上知道两件事：**要我决定什么，要我看什么。**

描述和汇报的正文说页面、流程、行为和后果。代码行、变量名、函数名、文件路径、「文件:行号」、提交号、spec 或工单的章节编号只放折叠区：拍板的人看了也不知道是什么意思。为什么做在 spec 的「问题」，每刀做了什么在工单里，验收契约就是分支上的工单文件，这些都只给链接；复现命令、检查日志这些过程材料留在本地。

## PR 描述是总览，汇报在会话里

| 阶段 | PR 状态 | 要人决定、要人看的东西 | 谁写 |
|---|---|---|---|
| **实现中**：工单没全部落地，或还有等决定的事 | draft | 每次停下一份**停下汇报** | `idea-loop:implement` 的编排者 |
| **review**：全部落地、没有等决定的事 | open | 每一轮一份 **review 汇报** | `idea-loop:pr-review` 的审查者 |

汇报在会话里给人看、人在会话里回复，同样的内容记进本地的 review loop 文件，合并时按停下和轮次归档成 PR 上的评论（「review loop」）。

PR 描述是常驻的总览，**不放 review**。读它的人打开时没有上下文：活是委托出去的，spec 他可能只记得个大概。所以描述从「这是什么」往下读到「要我做什么」，越往下越可以不读，只为查证的东西折叠在最后。

| 节 | 标题 | 写入方 |
|---|---|---|
| `summary` | 一句话 | `idea-loop:implement`：开 draft 时写，转 open 前按落地结果重写 |
| `changes` | 改了什么 | `idea-loop:implement` 转 open 前写，对照图专门拍 |
| `your-todo` | 要你做的事 | `idea-loop:implement` 转 open 前写；`idea-loop:pr-review` 的编排者在人的批示带出新事项时更新 |
| `reference` | 参考 | `idea-loop:implement`：开 draft 时写，每次停下更新 |

每节夹在隐藏标记之间，由脚本按固定顺序写入，**标题由脚本加**，内容文件里不用写：

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/pr-body.mjs" set <owner/repo> <PR 号> <节名> <内容文件>
```

写入前脚本会查折叠的「参考」以外有没有代码层面的指称，查到就拒写（图片和链接的地址不算）。每个写入方只重写自己负责的节；标记以外的文字（人手写的说明、署名行）保留在所有节的下方。改描述只走这个脚本：`gh pr edit --body` 整体覆盖会把别人的节一起冲掉。描述由 gh 当前登录的账号写：它是 PR 的一部分，不是一条发言。

## PR 描述的四节

每节的格式：[`references/description.md`](references/description.md)。

## 停下汇报

`idea-loop:implement` 每次停下（没有能做的工单了）写一份：[`references/stop-report.md`](references/stop-report.md)。

## review 汇报

`idea-loop:pr-review` 每跑一轮写一份：[`references/review-round.md`](references/review-round.md)。

## review loop

汇报在会话里给人看、人在会话里回复，每次处理完只回一条汇总；同样的内容逐字记进 `.tmp/review-loop/<PR 号>.md`，合并时归档成 PR 评论。PR 上不开 thread，不在 PR 上和人往来。文件长什么样、怎么在会话里给人看、归档贴成什么样、以谁的身份贴：[`references/review-loop.md`](references/review-loop.md)。
