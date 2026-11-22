# Issue tracker：GitHub

这个仓库的需求以 GitHub issue 的形式进来。所有操作用 `gh`，在仓库的 checkout 里跑，仓库由 `git remote` 推出来。

issue 是需求的入口，也是工作的队列：idea-loop 的调度按时段给 triage、todo 的 issue 开会话，一个 issue 一个会话，从评估、设计一路走到实现合并。要做的事写在 spec 里（`docs/spec/<slug>/` 下的文件，工单也在那里），issue 里不放 spec 正文。

## 操作

- **读一个 issue**：`gh issue view <号> --comments`，正文和评论都读完。
- **列 issue**：`gh issue list --state open --json number,title,labels`，按需加 `--label`。
- **评论**：`gh issue comment <号> --body "..."`，多行正文用 heredoc。
- **加、去 label**：`gh issue edit <号> --add-label "..."` / `--remove-label "..."`。
- **关闭**：`gh issue close <号> --reason completed|"not planned" --comment "..."`。

## 状态

状态只由 idea-loop 的 `issues.mjs` 改。

| 状态 | GitHub 上 | 意思 |
|---|---|---|
| backlog | open，没有 `status:*` | 新进来、没验证；或先放着 |
| triage | `status:triage` | 验证过，要人评估（grill、设计） |
| todo | `status:todo` | 可以被调度派成会话 |
| in-progress | `status:in-progress` | 会话在做，spec 提交后开 draft PR |
| in-review | `status:in-review` | PR 全部转 ready，等人看 |
| done | closed，completed | 全部 PR 合并 |
| canceled | closed，not planned | 不做；验证为不存在；重复 |

triage：用

## 优先级

issue 的优先级是 `priority:P0`、`priority:P1`、`priority:P2` 三个 label，一个 issue 最多一个，没有就是没有优先级。P0 = 线上坏了、安全问题（权限、付款、数据越权），拿不准不判；开出疑似 P0 的 issue 时当场复现，复现到了翻 todo 并通知人。调度按 P0 → P1 → P2 → 没有优先级派 todo，同一级里最早的先派。

## 仓库

这个产品的 issue 要改的仓库，第一行是知识库（`docs/`）所在的仓库。

| 仓库 | 本地路径 | 主分支 | 管什么 |
|---|---|---|---|
| `guohaonan-shy/harold-skills` | 这个 checkout | `main` | 全部：各个 plugin 和 `docs/` 知识库 |

一个 issue 在每个要改的仓库各开一个 PR，PR 正文写 `Refs <owner>/<repo>#<号>`（不写 `Closes`，合一个就会关 issue）。

## 调度

调度每一轮读这张表，定此刻派什么、开几个会话（上限是每轮最多新开几个，不看已经开着几个；triage 行的分组上限是 triage 分组里的会话总数最多几个，不写、留空就是 10，todo 行这一格留空，第五列起是备注）；改了这里，下一轮就按新的走。没有这一节的项目按下面这两行走。

| 时段 | 派什么 | 上限 | 分组上限 |
|---|---|---|---|
| 09:00–19:00 | triage | 6 | 10 |
| 22:00–08:00 | todo | 1 | |

时段左闭右开，开始晚于结束就是跨午夜；派什么只能写 `triage` 或 `todo`；表里没覆盖的时间不派；两行重叠时靠前的一行算。

## 分类 label

issue 还带两种分类 label：模块 `type:<父类>`，可选的子类 `type:<父类>/<子类>`；类型 `kind:bug`、`kind:feature`、`kind:improvement`。有哪些模块、另外保留哪些 label，写在 `AGENTS.md` 的「issue 分类」一节；分类由 idea-loop 分拣 issue 时打。不在状态、分类和保留清单里的 label 会被清掉，要留的写进那一节。
