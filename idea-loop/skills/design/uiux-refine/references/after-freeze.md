# 冻结之后：提交，和三种情形

## 提交

1. 照 `idea-loop:wiki-conventions` 的「知识库落地」，一次 `commit` 到 home：`<项目目录>/docs/spec/<spec-slug>`、`<项目目录>/docs/design/tmp/<spec-slug>/canvas`（签字的画布、冻结记录、交互图）。`imagine/`、`research/` 不列，也没有 `delta/`。
2. 消息 `design(<spec-slug>): 冻结`。输出里有「home 没推上去」，在告诉人的话里带上这一句，流程照走。

父 issue 要拆子 issue 的，不用等：子 issue 的会话直接读 home 里的父 spec。

告诉人：设计已冻结，已提交到 home。在 issue 会话里的，会话接着换到实现阶段（`idea-loop:issue-session` 的「换阶段」）；不在的，人用 `/idea-loop:issue-session <号>` 接上，或自己调 `idea-loop:to-ticket` 切工单开工。

## 三种情形

**冻结之后设计变了**：不回 refine，也不重起 designer。人接受了一处跟画布不同的设计，由当时的编排者（`idea-loop:implement` 或 `idea-loop:pr-review` 的会话）起 designer 做任务「设计变更」，过程与冻结记录怎么记见 `idea-loop:design-change-sync`。

**部分冻结**：designer 交付后就结束了。关掉预览服务器，告诉人跑 `/idea-loop:uiux-imagine` 重开回推的那几块；第二轮发散之后再调 refine，起一个**新的** designer，任务「起手」，它会接到已冻结的画布上。

**会话中断或重开**：designer 接不回来。下次调 refine 起一个新的，任务「起手」：画布的最新一版、ledger 与方向说明就是恢复点。
