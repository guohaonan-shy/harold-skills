---
name: pr
description: 一个 PR 上给人看的两份东西怎么写、放在哪：GitHub 上的 PR 描述，和对话里的 Review 汇报（连同存档它的 review loop 文件）。写 PR 描述、写汇报、记录或归档 review loop 时用。
---

一个 issue 一个 PR：它的所有工单共享一条集成分支和一个 PR，review loop 文件以这个 PR 的号命名。PR 上给人看的东西只有两份，读的是同一个人：要判断这次交付能不能合并的那个人。他清楚方向和高层设计，不清楚实现细节，每次看都要能马上知道两件事：**要我决定什么，要我看什么。** 怎么写给他看（结论在前、最小的图、现状带出处）用 Skill 工具调 `idea-loop:evidence`。要他定的事怎么写成一道题，照 `idea-loop:decision-rules`；下面只写落到这两份上的。交付证据（人验素材、review 配图、之前 → 之后）放哪、怎么上传、人验清单怎么写：[`references/delivery-evidence.md`](references/delivery-evidence.md)。

正文说页面、流程、行为和后果。代码行、变量名、函数名、文件路径、「文件:行号」、提交号、spec 或工单的章节编号只放折叠区：拍板的人看了也不知道是什么意思；`dyna pr body set` 和 `dyna pr candidates submit` 会机械地查这一条。为什么做在 spec 的「问题陈述」，每刀做了什么在工单里，验收契约就是 home 里的工单文件，这些都只写标题、home 里的路径和一句摘要，不放链接（home 是私有的，公司虚拟机上的 home 没有远端）；复现命令、检查日志这些过程材料留在本地。

## 两份交付物

| 交付物 | 放在哪 | 什么时候出 |
|---|---|---|
| **PR 描述** | GitHub 上这个 PR 的正文 | 实现一开始开 draft 时起头；review 全部过完、没有要人定的事了，写成审核报告，人读它就能决定合不合并 |
| **Review 汇报** | 对话里，同样的内容记进 review loop 文件 | 实现卡住要人定时一份（来自实现）；review 每跑完一轮一份（来自 review）。没有要人定的事时只留痕不等人（见 `idea-loop:implement`） |

## 开 draft PR

PR 从分支上有第一个提交起就挂着，不等工单：平台据此在 issue 上看到它改到了哪。接分支之后、切工单之前开（`idea-loop:issue-session` 的「实现」第 1 步；人直接调 `idea-loop:implement` 而还没有 PR 的，implement 开工时回到这里）。`.tmp/implement/<spec-slug>/prs.md` 已在就是开过了，跳过。

1. **开 PR**：在代码 worktree 里推集成分支，`gh pr create --draft --repo <owner/repo> --base <基准分支>`（`<owner/repo>` 取 `where` 输出的 `repo`），标题用 spec 标题（带署名行）。正文写 `Refs <owner>/<repo>#<号>`，指向 issue 的仓库和号，不写 `Closes`（issue 的 done 由合并步骤翻）。Linear 上的 issue：标题加前缀 `[<号>]`，正文第一行写 `Linear: <号>`。然后用 `dyna pr body set` 写 `summary` 和 `reference`（工单还没切，`reference` 先写 spec 的标题、home 里的路径和一句摘要，工单切好后 `idea-loop:implement` 补），`Refs` 那行在标记以外，不会被冲掉。
2. **记下 PR**：PR 号、worktree 路径记进 `.tmp/implement/<spec-slug>/prs.md`，账本之外的恢复靠它。

## PR 描述

读它的人打开时没有上下文：活是委托出去的，spec 他可能只记得个大概，各轮 Review 汇报也没跟过。所以从「这是什么」往下读到「要我做什么」，一份讲完，越往下越可以不读。每一节的格式：[`references/description.md`](references/description.md)。

| 节 | 这一节给读者什么 | 谁写 |
|---|---|---|
| 一句话 `summary` | 谁现在能做什么、修好了什么 | 开 draft PR 时写，转 open 前按落地结果重写；`idea-loop:pr-review` 的编排者交报告时再核 |
| 问题 `problem` | 没跟过的人明白为什么要做：用户碰到的现象、复现出来的样子、影响多大 | `idea-loop:pr-review` 的编排者，交报告时写 |
| 怎么修 `changes` | 这次做成了什么样：照规则定下的做法各带依据，每个页面或流程的之前 → 之后 | `idea-loop:implement` 转 open 前先写，`idea-loop:pr-review` 的编排者交报告时补全 |
| 怎么验证 `verification` | 凭什么说修对了：每个行为怎么验的、哪些没验成、review 的结论 | `idea-loop:pr-review` 的编排者，交报告时写 |
| 能否回滚 `rollback` | 合并后发现错了，能不能撤、怎么撤、影响面多大；上线前要人注意的事；顺带开的 issue | `idea-loop:pr-review` 的编排者，交报告时写；人的批示带出上线前的事时追加 |
| 上线自查的网址 `live-check` | 只有带 `type:seo/*` 的 issue 写：合并上线后要核的网址，每行一个网址加它的目标词；没有这一节的不自动合并 | `idea-loop:implement` 转 open 前写，`idea-loop:pr-review` 的编排者交报告时核 |
| 夜里替你定的 `night-decided` | 只有夜间模式的会话写：夜里碰到要人定的、按推荐定了的事，每条写选了什么、为什么、另一种是什么；人不同意就说「推翻」 | 夜间模式的 issue 会话（`idea-loop:issue-session`），每定一条追加 |
| 等你定的 `night-waiting` | 只有夜间模式的会话写：夜里停下的事，只有人能做（合并以外的四类，见夜间模式），写停在哪、为什么要人来、人说了之后会话怎么接 | 夜间模式的 issue 会话 |
| 要你做的事 `your-todo` | 轮到他的事：要看的人验素材（素材只放这里）、要定的事、说「合并」即可 | `idea-loop:implement` 转 open 前写，`idea-loop:pr-review` 的编排者更新 |
| 参考 `reference` | 折叠：想追溯的人查证（改动地图、spec 与工单、执行记录、合并后的清理） | 开 draft PR 时写，每次汇报更新 |

每节夹在隐藏标记之间，由脚本按固定顺序写入，**标题由脚本加**，内容文件里不用写：

```
dyna pr body set <owner/repo> <PR 号> <节名> <内容文件>
```

写入前脚本会查「参考」以外有没有代码层面的指称，查到就拒写（图片和链接的地址不算）。每个写入方只重写自己负责的节；标记以外的文字（人手写的说明、署名行）保留在所有节的下方。改描述只走这个脚本：`gh pr edit --body` 整体覆盖会把别人的节一起冲掉。描述由 gh 当前登录的账号写：它是 PR 的一部分，不是一条发言。旧描述里的「顺带开的 issue」节，下次写入时脚本把它的清单并进「能否回滚」。

## Review 汇报

实现卡住和 review 每一轮是同一种汇报，同一个格式；PR 描述不动，这些汇报的结论等 review 全部过完才收进描述。每一节的格式：[`references/review-report.md`](references/review-report.md)。

| 节 | 这一节给读者什么 | 谁写 |
|---|---|---|
| 开头一句 | 第几次、来自实现还是第 K 轮 review、有没有把已有功能改坏、几件已替他定、几件要他定 | 来自实现：`idea-loop:implement` 的编排者；来自 review：`idea-loop:pr-review` 的编排者 |
| 已按规则处理 | 已经替他定好的事：做了什么、依据是什么、链接；不同意可以说「推翻某条」 | 同上；实现取自 handled，review 取自标了照规则的条目 |
| 要你决定 | 真要他定的事，每条同一格式（现状 · 对用户的影响 · 证据 · 选项 · 推荐），Spec、Standards、实现卡住的题都一样 | 同上；实现取自 pending |
| 能否回滚 | 这次落地的东西错了，能不能撤、怎么撤、影响面 | 同上，对着落地的改动判 |
| 要你看的 | 要他判断的人验素材（流程、动效、样式）；review 来源的汇报通常没有这一节 | 来自实现的作者 |
| 折叠区 | 想核对的人查证：审的版本、核对过的、没覆盖到的、术语表缺的词、给修复方的位置 | 同上 |

## 在会话里给人看

汇报在会话里给人看、人在会话里回复，PR 上不开 thread，不在 PR 上和人往来。

1. 把汇报写进 review loop 文件（新条目）。
2. 在会话里贴**同样的内容，按条目一段一段给**：先贴开头一句，然后每一条先贴这一条的文字，紧接着单独发这一条的图（一次发送只放这一条的图，caption 写条目编号和一句看什么），再贴下一条。文字和图交替发，人才不用在两堆之间来回对照。图用『发文件给人』能力发（做法照 `idea-loop:runtime`）：聊天界面加载不了私有仓库的图片链接。
3. 人可能不在电脑前：用『推送』能力发一条通知，一句话说停在哪、等他决定几件。

人看完在会话里回复，这里的回复就是人的指示。怎么处理归调用方：来自实现的归 `idea-loop:implement`，来自 review 的归 `idea-loop:pr-review`。

## review loop 文件

Review 汇报的存档：同样的内容逐字记进 `.tmp/review-loop/<PR 号>.md`，连同人的批示和「做了什么」；它是这个 loop 的记忆，合并时按条目归档成 PR 评论。文件长什么样、归档贴成什么样、以谁的身份贴：[`references/review-loop.md`](references/review-loop.md)。
