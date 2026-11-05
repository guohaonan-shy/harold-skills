# Linear 上的 issue

**脚本还不接 Linear**：用 MCP 做每个操作、setup 里把团队的状态整理进 `ISSUE_TRACKER.md`，都另有计划。这一份只是对照：项目的 issue 在 Linear 上时，实体的每个字段对应 Linear 的什么。

| 字段 | Linear 上 |
|---|---|
| 状态 | workflow state，默认名对上：backlog → Backlog，triage → Triage，todo → Todo，in-progress → In Progress，in-review → In Review，done → Done，canceled → Canceled 或 Duplicate。团队改过名的，以 `ISSUE_TRACKER.md` 的状态表为准。不用 label 表达状态 |
| 类型 | 单选 label 组（`type`）里的 Bug / Feature / Improvement，单选组互斥，所以不会同时是两种 |
| 模块 | 另一组 label（或 Project），名字由团队定 |
| 优先级 | Linear 自带的 priority |
| blocked by | issue relation「blocked by」（反过来是 blocks） |
| 挂着的 PR | PR 标题前缀 `[<号>]`（`<号>` 是 Linear 的 issue 号），正文第一行 `Linear: <号>`；平台据此把 PR 挂到 issue 上 |
| 评论 | comment，带「🤖 idea-loop：」前缀 |

- **In Progress、In Review、Done 由集成推，不手翻**：PR 一开，issue 从 Backlog / Todo 到 In Progress；PR 转 ready 到 In Review；全部 PR 合并到 Done。会话先跑 `issues check <docs> <状态> <号>` 核前提，再用 MCP 翻集成不推的那几个状态。
- **Triage 团队可能没开**：没开的，`ISSUE_TRACKER.md` 写「triage：跳过」，backlog 直接到 todo。
- **一个 issue 常在几个仓库各有一个 PR**，每个 PR 都带同一个号；全部合并才算 done，跟 GitHub 一致。
- Linear 的 PR 与 issue 是多对多的，idea-loop 仍按一个 issue 一个会话、每个仓库一个 PR 用。
