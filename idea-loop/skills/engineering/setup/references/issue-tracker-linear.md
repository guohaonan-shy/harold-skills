# Issue tracker：Linear

这个项目的需求以 Linear issue 的形式进来。读写 issue 用 Linear 的 MCP，做法见 `idea-loop:issues` 的 Linear 做法（用 Skill 工具调它）；翻状态的前提、PR 怎么算、正文格式仍由 idea-loop 的 `issues.mjs` 判。

issue 是需求的入口，也是工作的队列：idea-loop 的调度给每个 todo 的 issue 开一个会话（一个 issue 一个会话），从评估、设计一路走到实现合并。要做的事写在 spec 里（`docs/spec/<slug>/` 下的文件，工单也在那里），issue 里不放 spec 正文。

## 团队

`<团队名>`（key `<KEY>`），issue 号形如 `<KEY>-123`。

## 状态

状态是团队自己的 workflow state；第二列填团队里实际的状态名，`save_issue` 的 `state` 直接用它。

| 状态 | Linear 上 | 谁翻 |
|---|---|---|
| backlog | `<团队的 backlog 类状态名>` | 开出来就是；分拣、先放着时会话用 MCP 翻 |
| triage | `<Triage 状态名，没开写「—」>` | 分拣后会话用 MCP 翻 |
| todo | `<Todo 状态名>` | 同上 |
| in-progress | `<In Progress 状态名>` | PR 一开集成推；会话认领时先用 MCP 翻 |
| in-review | `<In Review 状态名>` | 集成按 PR 转 ready 推 |
| done | `<Done 状态名>` | 集成在全部 PR 合并后推 |
| canceled | `<Canceled 状态名>`、`<Duplicate 状态名，没有就不写>` | 会话用 MCP 翻：重复的翻 Duplicate（`save_issue` 带 `duplicateOf` 指向原 issue），其余翻 Canceled |

triage：用 / 跳过

（选一个写在这一行：「triage：用」，或「triage：跳过」——团队没开 Triage 的写跳过，backlog 直接到 todo，grill 与设计在 todo 的会话里做。）

## 优先级

P0 = Urgent，P1 = High，P2 = Medium；No priority 与 Low 都按「没有」排。P0 = 线上坏了、安全问题（权限、付款、数据越权），拿不准不判。调度先派指派给本人的 Todo，按 P0 → P1 → P2 → 没有优先级排，同一级里最早创建的先派；本人名下没有可派的，才派未指派的，同样先按优先级，同一优先级里在 Todo 里放得久的先；指派给别人的不派。

## 分类

- 类型：label 组 `<组名>` 里的 Bug / Feature / Improvement。
- 模块：`<label 名或 label 组名>`，跟 `AGENTS.md`「issue 分类」一节的父类一一对应。

## 仓库

这个产品的 issue 要改的仓库，第一行是知识库（`docs/`）所在的仓库。没有这一节的项目就是一个仓库。

| 仓库 | 本地路径 | 主分支 | 管什么 |
|---|---|---|---|
| `<owner/name>` | `<本地 checkout 的路径>` | `<主分支>` | `<这个仓库管产品的哪一块>` |

一个 issue 在每个要改的仓库各开一个 PR。PR 挂到 issue 上：标题前缀 `[<号>]`，正文第一行 `Linear: <号>`。
