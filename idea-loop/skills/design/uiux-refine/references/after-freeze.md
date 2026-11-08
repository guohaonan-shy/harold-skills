# 冻结之后：提交，和三种情形

## 提交

1. 当前 worktree 应该是这个需求的工作分支（issue 会话里就是这一组的分支）；不在的，从最新主分支开一个，把下面这些文件带过去再提交。
2. `git add docs/spec/<spec-slug>`，再 `git add -f docs/design/tmp/<spec-slug>/canvas`（`tmp/` 被排除在 git 之外，要强制加）：签字的画布、冻结记录、交互图。`git status --short` 里暂存的只能是这几处，`imagine/`、`research/` 不进，也没有 `delta/`。
3. 提交（`design(<spec-slug>): 冻结`，末尾加一行 `Co-Authored-By:`，照这个会话的署名要求写）。父 issue 要拆子 issue 的，拆完后照「知识库落地」开只改 `docs/` 的 PR 先合。

告诉人：设计已冻结，提交在工作分支上。在 issue 会话里的，会话接着换到实现阶段（`idea-loop:issue-session` 的「换阶段」）；不在的，人用 `/idea-loop:issue-session <号>` 接上，或自己调 `idea-loop:to-ticket` 切工单开工。

## 三种情形

**冻结之后设计变了**：不回 refine，也不重起 designer。人接受了一处跟画布不同的设计，由当时的编排者（`idea-loop:implement` 或 `idea-loop:pr-review` 的会话）起 designer 做任务「设计变更」，过程与冻结记录怎么记见 `idea-loop:design-change-sync`。

**部分冻结**：designer 交付后就结束了。关掉预览服务器，告诉人跑 `/idea-loop:uiux-imagine` 重开回推的那几块；第二轮发散之后再调 refine，起一个**新的** designer，任务「起手」，它会接到已冻结的画布上。

**会话中断或重开**：designer 接不回来。下次调 refine 起一个新的，任务「起手」：画布的最新一版、ledger 与方向说明就是恢复点。
