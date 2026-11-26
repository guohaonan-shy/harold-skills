---
name: pr
description: GitHub 上 PR 描述怎么写、放在哪。开 draft PR、写或改 PR 描述时用。
---

一个 issue 一个 PR：它的所有工单共享一条集成分支和一个 PR。读 PR 描述的是要判断这次交付能不能合并的那个人：清楚方向和高层设计，不清楚实现细节，一屏内要看到**现在是什么样、改完是什么样、要我做什么**。

写每一节之前先用 Skill 工具调 `idea-loop:evidence`：问题、概要、证据三节各用什么视图，照 `idea-loop:evidence` 的「视图菜单」挑能讲清要点的最小一种；写法（现状带出处和数字、复现才是证据）照它的「证据是什么」。要他定的事不在描述里：在会话里写成一道题，照会话已加载的用户规则（`~/.claude/CLAUDE.md`）的「要我定的事写成一道题」。交付证据（人验素材、证据节里两边各做一遍的图）放哪、怎么上传、人验清单怎么写：[`references/delivery-evidence.md`](references/delivery-evidence.md)。

代码叫法（提交号、函数名、文件路径、接口地址）只写在概要；其余各节写页面、流程、行为和后果。人自己会敲的名字（skill 名、斜杠命令、dyna 命令名）各节都能写。spec、工单只写标题、home 里的路径和一句摘要，不放链接（home 是私有的，有的 home 没有远端）；复现命令、检查日志这些过程材料留在本地。

## 开 draft PR

PR 从分支上有第一个提交起就挂着，不等工单。接分支之后、切工单之前开（`idea-loop:issue-session` 的「实现」第 1 步；人直接调 `idea-loop:implement` 而还没有 PR 的，implement 开工时回到这里）。`.tmp/implement/<spec-slug>/prs.md` 已在就是开过了，跳过。完成条件：draft PR 已开，它的号和 worktree 路径记进 `prs.md`。

1. **推集成分支，开 draft**：`dyna git push` 推上去，`dyna pr open <owner/repo> --base <基准分支> --title <标题> --body-file <正文文件>`（`<owner/repo>` 取 `where` 输出的 `repo`；默认就是 draft）。标题用 spec 标题。正文写 `Refs <owner>/<repo>#<号>`，指向 issue 的仓库和号，spec 的 `issues:` 有几个号就写几行（父 issue 和它覆盖的子 issue），不写 `Closes`（issue 的 done 由合并步骤翻）。Linear 上的 issue：标题加前缀 `[<号>]`，正文第一行写 `Linear: <号>`。
2. **写问题节的起头**：`dyna pr body set` 写 `problem`，取自 spec 的「问题陈述」，一两句现状和为什么改，加一个视图（`dyna pr body set` 没有视图就拒写）：取 spec「问题陈述」里已有的数字或表，交报告时换成更合适的。`Refs` 那行在标记以外，不会被冲掉。

## PR 描述

读它的人打开时没有上下文：spec 只记得个大概，各轮汇报也没跟过。所以按节从上往下读，一份讲完。每一节的格式：[`references/description.md`](references/description.md)。表里「实现编排者」指调 `idea-loop:implement` 的会话，「review 编排者」指调 `idea-loop:pr-review` 的会话。

| 节 | 这一节给读者什么 | 谁写 |
|---|---|---|
| 问题 `problem` | 现在是什么样、为什么要改，加一个视图证明问题真发生过、有多常见 | 开 draft PR 时写起头（带一个视图），review 编排者交报告时重写 |
| 概要 `outline` | 这次改了什么：一句短文字加最多两个视图；人定的事让方案多做的一块、没有对应问题的改动画在这里 | review 编排者，交报告时写（取自 spec 与落地结果） |
| 证据 `evidence` | 之前 / 之后：同一个操作在基准分支和本分支各做一遍，之前看到问题、之后问题没了；问题几件就几组 | review 编排者，交报告时写（取自执行方的复现） |
| 合并风险 `risk` | 门（双向 / 单向）、影响面、要特别注意的；人定的事带来的风险写在这里 | review 编排者，交报告时对着整个 PR 判 |
| 要你做的事 `your-todo` | 合并前只有他能验的、合并后要他做的，末尾「说『合并』即可」 | review 编排者，交报告时写；人的批示带出上线前后的事时追加 |
| 上线自查的网址 `live-check` | 只有 `type:seo/*` 的 issue 写：合并上线后要核的网址和目标词；没有这一节的不自动合并 | 实现编排者转 open 前写，review 编排者交报告时核 |

每节夹在隐藏标记之间，由命令按固定顺序写入，**标题由命令加**，内容文件里不用写：

```
dyna pr body set <owner/repo> <PR 号> <节名> <内容文件>
```

写入时命令检查结构：问题或证据节没有视图、之前 / 之后对不上、概要超过两个视图、概要以外写了代码叫法等，退出码非 0 拒写并说明缺什么；缺视图时输出里带 evidence 的视图菜单。旧描述里的旧节名照旧折叠进新结构，不报错。每个写入方只重写自己负责的节；标记以外的文字（`Refs` 行、人手写的说明）保留在所有节的下方。**坑**：改描述只走这个命令，`gh pr edit --body` 整体覆盖会把别人的节一起冲掉。

要人决定的事、review 汇报的写法、review loop 文件归 `idea-loop:pr-review`。
