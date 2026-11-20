# 冻结之后：提交，和几种情形

## 提交

1. 照 `idea-loop:wiki-conventions` 的「知识库落地」，一次 `commit` 到 home：`<项目目录>/docs/spec/<spec-slug>`、`<项目目录>/docs/design/tmp/<spec-slug>/canvas`（签字的画布、冻结记录、交互图）。`imagine/`、`research/` 不列，也没有 `delta/`。
2. 消息 `design(<spec-slug>): 冻结`。输出里有「home 没推上去」，在告诉人的话里带上这一句，流程照走。

父 issue 要拆子 issue 的，不用等：子 issue 的会话直接读 home 里的父 spec。

告诉人：设计已冻结，已提交到 home。然后按会话类型走，每种指到 `idea-loop:issue-session` 里的一处：

- **triage 会话**（issue 还在 triage）：回「triage 会话」第 3 步「交给调度」：翻 todo（评论带 home 的提交号）、收尾。这个会话不切工单，工单由之后的 todo 会话切。
- **todo 会话**：回「实现」：先开 draft PR，再切工单。
- **不在 issue 会话里**：把 home 的提交号告诉人，往下怎么走由人定；人要接到某个 issue 上，用 `/idea-loop:issue-session <号>`。

## 几种情形

**冻结之后设计变了**：不回 refine，也不重起 designer。人接受了一处跟画布不同的设计，由当时的编排者（`idea-loop:implement` 或 `idea-loop:pr-review` 的会话）起 designer 做任务「设计变更」，过程与冻结记录怎么记见 `idea-loop:design-change-sync`。

**部分冻结**：designer 交付后就结束了。关掉预览服务器，告诉人跑 `/idea-loop:uiux-imagine` 重开回推的那几块；第二轮发散之后再调 refine，起一个**新的** designer，任务「起手」，它会接到已冻结的画布上。

**会话中断或重开**：designer 接不回来。下次调 refine 起一个新的，任务「起手」：画布的最新一版、ledger 与方向说明就是恢复点。从暂缓的设计接着做（开工前问过人、人要接着做）也是这样：目录已复制回 `<项目目录>/docs/design/tmp/<spec-slug>/`，直接用这个恢复点。

**这块界面先不做**：人看了数据或改了主意，说「先不做」。不冻结，也不当作放弃（放弃只丢画布）。你照 `idea-loop:wiki-conventions` 的「目录」里 `design/pending/` 那一行做：把 `<项目目录>/docs/design/tmp/<spec-slug>/` 原样挪到 `<项目目录>/docs/design/pending/<spec-slug>/`，里面的东西不清理，目标目录已存在就停下问人；pending 只在本地，不 `commit` 到 home。然后在 spec 里写一句指针和人原话的理由，随 spec 的改动 `commit` 到 home。最后关掉预览服务器，告诉人挪到了哪、spec 里写了什么。
