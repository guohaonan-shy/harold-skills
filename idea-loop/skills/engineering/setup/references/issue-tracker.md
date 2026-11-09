# Issue tracker：GitHub

这个仓库的需求以 GitHub issue 的形式进来。所有操作用 `gh`，在仓库的 checkout 里跑，仓库由 `git remote` 推出来。

issue 是需求的入口，也是工作的队列：idea-loop 的调度给每个 triage、todo 的 issue 出一个会话（一个 issue 一个会话），从评估、设计一路走到实现合并。要做的事写在 spec 里（`docs/spec/<slug>/` 下的文件，工单也在那里），issue 里不放 spec 正文。

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

triage：用 / 跳过

（选一个写在这一行：「triage：用」，或「triage：跳过」——跳过的项目 backlog 直接到 todo，grill 与设计在 todo 的会话里做。）

## 优先级

issue 的优先级是 `priority:P0`、`priority:P1`、`priority:P2` 三个 label，一个 issue 最多一个，没有就是没有优先级。P0 = 线上坏了、安全问题（权限、付款、数据越权），拿不准不判；开出疑似 P0 的 issue 时当场复现，复现到了翻 todo 并通知人。调度先派指派给本人的 todo，按 P0 → P1 → P2 → 没有优先级排，同一级里最早的先派；本人名下没有可派的，才派未指派的，同样先按优先级，同一优先级里在 todo 里停留久的先；指派给别人的不派。

## 仓库

这个产品的 issue 要改的仓库，第一行是知识库（`docs/`）所在的仓库。没有这一节的项目就是一个仓库。

| 仓库 | 本地路径 | 主分支 | 管什么 |
|---|---|---|---|
| `<owner/name>` | `<本地 checkout 的路径>` | `<主分支>` | `<这个仓库管产品的哪一块>` |

一个 issue 在每个要改的仓库各开一个 PR，PR 正文写 `Refs <owner>/<repo>#<号>`（不写 `Closes`，合一个就会关 issue）。

## 分类 label

issue 还带两种分类 label：模块 `type:<父类>`，可选的子类 `type:<父类>/<子类>`；类型 `kind:bug`、`kind:feature`、`kind:improvement`。有哪些模块、另外保留哪些 label，写在 `AGENTS.md` 的「issue 分类」一节；分类由 idea-loop 分拣 issue 时打。不在状态、分类和保留清单里的 label 会被清掉，要留的写进那一节。
